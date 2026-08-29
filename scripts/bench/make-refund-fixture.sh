#!/usr/bin/env bash
# Build the multi-file delegation benchmark fixture — docs/INSTRUMENTS-R4.md §1.
#
# The existing scripts/bench/make-fixture.sh builds a directory tree for a
# SINGLE-FILE task. That task has no independent sub-units, so nothing can be
# fanned out to and all nine committed runs delegated zero times. This builds
# the repository §1 specifies instead: four provider adapters that do not
# import each other, plus one shared ledger every one of them writes through.
#
# Two properties are the whole point, and each has a guard below:
#   - the four adapters are GENUINELY INDEPENDENT (no imports between them;
#     asserted in the self-check), because independence is what delegation buys;
#   - the ledger is GENUINELY SHARED (every adapter writes through it, and its
#     transaction and idempotency invariants are stated in its own docstring),
#     so a lane that changes it in isolation breaks the other three and
#     reconciliation is load-bearing rather than decorative.
#
# Four outputs:
#   repo/                 what an arm's working directory is seeded with.
#   heldout/              the correctness fixture. NEVER copied into a run
#                         directory — 20 cases the arms do not see.
#   reference/correct/    an overlay that makes the held-out suite go GREEN.
#   reference/broken/     the negative control: the same overlay with four
#                         named defects seeded, which must go RED on four named
#                         cases. If it does not, the fixture measures nothing.
#   manifest.json         the answer key scripts/bench/grade-refunds.sh reads.
#
# Python, stdlib only, no third-party dependency anywhere — grade.sh's "bug #2"
# comment records a previous grader that assumed pytest and reported a failure
# that never happened.
#
#   ./scripts/bench/make-refund-fixture.sh /tmp/omc-refund-fixture
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $(basename "$0") <output-directory>" >&2
  exit 1
fi

OUT="$1"

# Same refusal as make-fixture.sh, for the same reason: a stale file surviving
# into "regenerated" output defeats the point of regenerating it.
if [ -e "$OUT" ]; then
  echo "refusing to run: '$OUT' already exists — delete it first, this script does not merge into an existing tree" >&2
  exit 1
fi

REPO="$OUT/repo"
HELDOUT="$OUT/heldout"
SNIP="$OUT/reference/snippets"

mkdir -p "$REPO/payments/adapters" "$REPO/payments/mocks" "$HELDOUT" \
         "$SNIP/correct" "$SNIP/broken"

# =============================================================================
# repo/ — the tree an arm starts from
# =============================================================================

cat > "$REPO/README.md" <<'MD'
# payments

A provider-agnostic charge layer. Four adapters, one ledger.

    payments/types.py                the value types every adapter returns
    payments/ledger.py               the one module every adapter writes through
    payments/factory.py              wiring: adapters bound to provider mocks
    payments/adapters/*_adapter.py   one per provider, independent of each other
    payments/mocks/*_api.py          in-process stand-ins for the provider APIs

The adapters share a public interface and nothing else — none of them imports
another. Everything they do share goes through `payments/ledger.py`, whose
module docstring states the two invariants every write has to hold.

The provider mocks deliberately do not agree with each other. Units, failure
reporting and synchronicity differ per provider, because the real APIs differ
that way too. Read the mock before writing against it.

    python3 smoke.py
MD

cat > "$REPO/payments/__init__.py" <<'PY'
"""A provider-agnostic charge layer."""
PY

cat > "$REPO/payments/adapters/__init__.py" <<'PY'
"""One adapter per provider. No adapter imports another."""
PY

cat > "$REPO/payments/mocks/__init__.py" <<'PY'
"""In-process stand-ins for the four provider APIs.

Each mock keeps its provider's own conventions rather than a house style, so
an adapter written against one of them does not transfer to the others. The
read accessors (`get_charge`, `get_capture`, `get_payment`, `find`) are part
of each mock's public surface: they are how a caller reconciles against
provider state.
"""
PY

cat > "$REPO/payments/types.py" <<'PY'
"""The value types every adapter returns.

Amounts are integer minor units everywhere in this package's public
interface. The provider APIs disagree about units; that disagreement is the
adapter's problem and must not leak past it.

`Refund` and `RefundTooLarge` are the refund path's half of this contract.
Nothing constructs them yet — the charge path predates refunds.
"""

from dataclasses import dataclass


class PaymentError(Exception):
    """A provider-reported failure, normalised across the four providers."""


class RefundTooLarge(PaymentError):
    """A refund asked for more than the charge has left to give."""


@dataclass(frozen=True)
class Charge:
    provider: str
    charge_id: str
    amount: int
    currency: str
    status: str


@dataclass(frozen=True)
class Refund:
    provider: str
    refund_id: str
    charge_id: str
    amount: int
    status: str
PY

cat > "$REPO/payments/ledger.py" <<'PY'
"""The one module every adapter writes through.

Two invariants hold for every entry, and they are the reason this is shared
rather than copied into each adapter:

1. **Every write participates in the caller's transaction.** `transaction()`
   nests: an inner `with` joins the outer one and only the outermost block
   commits. A caller that raises after a write leaves nothing behind.

2. **Every entry carries an idempotency key that is deterministic in the
   operation it records.** The column is UNIQUE, and a repeated operation must
   find the existing entry rather than insert a second one. `record_charge`
   below is the worked example.

`reverses_id` is how a reversing entry points at the entry it reverses. A
charge never sets it.

The scan in `rows()` is O(n) over every entry ever written. That is fine for a
process-lifetime in-memory ledger and would need an index the moment this
pointed at a real database.
"""

import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Optional

SCHEMA = """
CREATE TABLE IF NOT EXISTS entries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    provider        TEXT    NOT NULL,
    kind            TEXT    NOT NULL,
    external_id     TEXT    NOT NULL,
    amount          INTEGER NOT NULL,
    currency        TEXT    NOT NULL,
    idempotency_key TEXT    NOT NULL UNIQUE,
    reverses_id     INTEGER REFERENCES entries(id)
);
"""


@dataclass(frozen=True)
class Entry:
    id: int
    provider: str
    kind: str
    external_id: str
    amount: int
    currency: str
    idempotency_key: str
    reverses_id: Optional[int]


def _entry(row):
    if row is None:
        return None
    return Entry(
        id=row["id"],
        provider=row["provider"],
        kind=row["kind"],
        external_id=row["external_id"],
        amount=row["amount"],
        currency=row["currency"],
        idempotency_key=row["idempotency_key"],
        reverses_id=row["reverses_id"],
    )


class Ledger:
    def __init__(self, path=":memory:"):
        self._conn = sqlite3.connect(path)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.executescript(SCHEMA)
        self._depth = 0

    @contextmanager
    def transaction(self):
        """Nesting-aware: an inner block joins the outer one and does not commit."""
        if self._depth:
            self._depth += 1
            try:
                yield self._conn
            finally:
                self._depth -= 1
            return
        self._depth = 1
        try:
            with self._conn:
                yield self._conn
        finally:
            self._depth = 0

    def find(self, idempotency_key):
        """The entry recorded under this key, or None."""
        row = self._conn.execute(
            "SELECT * FROM entries WHERE idempotency_key = ?", (idempotency_key,)
        ).fetchone()
        return _entry(row)

    def get(self, entry_id):
        row = self._conn.execute(
            "SELECT * FROM entries WHERE id = ?", (entry_id,)
        ).fetchone()
        return _entry(row)

    def rows(self):
        """Every entry, oldest first."""
        return [
            _entry(row)
            for row in self._conn.execute("SELECT * FROM entries ORDER BY id")
        ]

    def record_charge(self, *, provider, external_id, amount, currency, idempotency_key):
        with self.transaction() as conn:
            existing = self.find(idempotency_key)
            if existing is not None:
                return existing
            cursor = conn.execute(
                "INSERT INTO entries"
                " (provider, kind, external_id, amount, currency, idempotency_key, reverses_id)"
                " VALUES (?, 'charge', ?, ?, ?, ?, NULL)",
                (provider, external_id, amount, currency, idempotency_key),
            )
            return self.get(cursor.lastrowid)
PY

# --- mocks: four APIs that deliberately do not agree with each other ---------

cat > "$REPO/payments/mocks/stripe_api.py" <<'PY'
"""Mock Stripe.

Integer minor units, dict payloads, failure raised as `StripeError`, and
refunds idempotent on the key the caller supplies.
"""

import copy


class StripeError(Exception):
    pass


class StripeAPI:
    def __init__(self):
        self._charges = {}
        self._refunds = {}
        self._seq = 0

    def _next(self, prefix):
        self._seq += 1
        return "{}_{:06d}".format(prefix, self._seq)

    def get_charge(self, charge_id):
        charge = self._charges.get(charge_id)
        return copy.deepcopy(charge) if charge else None

    def create_charge(self, *, amount, currency, idempotency_key):
        for charge in self._charges.values():
            if charge["idempotency_key"] == idempotency_key:
                return copy.deepcopy(charge)
        charge = {
            "id": self._next("ch"),
            "amount": amount,
            "currency": currency,
            "amount_refunded": 0,
            "status": "succeeded",
            "idempotency_key": idempotency_key,
        }
        self._charges[charge["id"]] = charge
        return copy.deepcopy(charge)

    def create_refund(self, *, charge, amount, idempotency_key):
        for refund in self._refunds.values():
            if refund["idempotency_key"] == idempotency_key:
                return copy.deepcopy(refund)
        target = self._charges.get(charge)
        if target is None:
            raise StripeError("No such charge: {}".format(charge))
        if amount > target["amount"] - target["amount_refunded"]:
            raise StripeError("Refund amount exceeds the remaining charge amount")
        target["amount_refunded"] += amount
        refund = {
            "id": self._next("re"),
            "charge": charge,
            "amount": amount,
            "status": "succeeded",
            "idempotency_key": idempotency_key,
        }
        self._refunds[refund["id"]] = refund
        return copy.deepcopy(refund)
PY

cat > "$REPO/payments/mocks/paypal_api.py" <<'PY'
"""Mock PayPal.

Amounts are decimal STRINGS beside a currency_code. Nothing raises: a failure
comes back as an error object in the response body and the caller is expected
to look for it. Refunds are NOT idempotent — call it twice and it refunds
twice.
"""

import copy


def to_minor(text):
    """'10.50' -> 1050."""
    whole, _, fraction = text.partition(".")
    return int(whole) * 100 + int((fraction + "00")[:2])


def to_decimal(minor):
    """1050 -> '10.50'."""
    return "{}.{:02d}".format(minor // 100, minor % 100)


class PayPalAPI:
    def __init__(self):
        self._captures = {}
        self._seq = 0

    def _next(self, prefix):
        self._seq += 1
        return "{}-{:06d}".format(prefix, self._seq)

    def get_capture(self, capture_id):
        capture = self._captures.get(capture_id)
        return copy.deepcopy(capture) if capture else None

    def capture(self, payload):
        request_id = payload.get("request_id")
        for capture in self._captures.values():
            if capture["request_id"] == request_id:
                return copy.deepcopy(capture)
        amount = payload["amount"]
        capture = {
            "id": self._next("CAP"),
            "status": "COMPLETED",
            "amount": {
                "value": amount["value"],
                "currency_code": amount["currency_code"],
            },
            "amount_refunded": "0.00",
            "request_id": request_id,
        }
        self._captures[capture["id"]] = capture
        return copy.deepcopy(capture)

    def refund_capture(self, capture_id, payload):
        capture = self._captures.get(capture_id)
        if capture is None:
            return {
                "name": "RESOURCE_NOT_FOUND",
                "details": [{"issue": "INVALID_RESOURCE_ID"}],
            }
        asked = to_minor(payload["amount"]["value"])
        remaining = to_minor(capture["amount"]["value"]) - to_minor(
            capture["amount_refunded"]
        )
        if asked > remaining:
            return {
                "name": "UNPROCESSABLE_ENTITY",
                "details": [{"issue": "REFUND_AMOUNT_EXCEEDED"}],
            }
        capture["amount_refunded"] = to_decimal(
            to_minor(capture["amount_refunded"]) + asked
        )
        return {
            "id": self._next("REF"),
            "status": "COMPLETED",
            "amount": {
                "value": payload["amount"]["value"],
                "currency_code": payload["amount"]["currency_code"],
            },
        }
PY

cat > "$REPO/payments/mocks/adyen_api.py" <<'PY'
"""Mock Adyen.

Amounts are {"value": <minor units int>, "currency": <code>}. Both payments
and refunds are ASYNCHRONOUS: the submit call returns a pspReference and a
"received" status, and the outcome is only known once the caller polls. An
over-refund is ACCEPTED at submit time and only fails on the poll — which is
the trap: a caller that submits and walks away records a refund that never
happened.
"""


class AdyenAPI:
    def __init__(self):
        self._payments = {}
        self._modifications = {}
        self._seq = 0

    def _next(self, prefix):
        self._seq += 1
        return "{}{:012d}".format(prefix, self._seq)

    def payments(self, request):
        reference = request["reference"]
        for payment in self._payments.values():
            if payment["reference"] == reference:
                return {"pspReference": payment["pspReference"], "resultCode": "Received"}
        psp = self._next("PSP")
        self._payments[psp] = {
            "pspReference": psp,
            "reference": reference,
            "amount": dict(request["amount"]),
            "refunded": 0,
            "resultCode": "Authorised",
        }
        return {"pspReference": psp, "resultCode": "Received"}

    def get_payment(self, psp_reference):
        payment = self._payments.get(psp_reference)
        if payment is None:
            return None
        return {
            "pspReference": payment["pspReference"],
            "resultCode": payment["resultCode"],
            "amount": dict(payment["amount"]),
            "refunded": payment["refunded"],
        }

    def refunds(self, psp_reference, request):
        reference = request["reference"]
        for modification in self._modifications.values():
            if modification["reference"] == reference:
                return {
                    "pspReference": modification["pspReference"],
                    "status": "received",
                }
        psp = self._next("MOD")
        self._modifications[psp] = {
            "pspReference": psp,
            "reference": reference,
            "payment": psp_reference,
            "amount": dict(request["amount"]),
            "status": "received",
            "reason": None,
            "settled": False,
        }
        return {"pspReference": psp, "status": "received"}

    def get_modification(self, psp_reference):
        modification = self._modifications.get(psp_reference)
        if modification is None:
            return None
        if not modification["settled"]:
            modification["settled"] = True
            payment = self._payments.get(modification["payment"])
            asked = modification["amount"]["value"]
            if payment is None:
                modification["status"] = "failed"
                modification["reason"] = "Original pspReference not found"
            elif asked > payment["amount"]["value"] - payment["refunded"]:
                modification["status"] = "failed"
                modification["reason"] = "Refund amount exceeds the refundable balance"
            else:
                payment["refunded"] += asked
                modification["status"] = "completed"
        return {
            "pspReference": modification["pspReference"],
            "status": modification["status"],
            "reason": modification["reason"],
        }
PY

cat > "$REPO/payments/mocks/braintree_api.py" <<'PY'
"""Mock Braintree.

Amounts are `decimal.Decimal` in MAJOR units. Nothing raises: every call
returns a `Result` carrying `is_success` and `errors`, and the caller is
expected to look. A transaction accepts at most ONE refund — a second attempt
comes back as error 91512 rather than refunding again.
"""

from dataclasses import dataclass, field
from decimal import Decimal
from typing import List, Optional


@dataclass(frozen=True)
class BraintreeError:
    code: str
    message: str


@dataclass
class Transaction:
    id: str
    amount: Decimal
    currency_iso_code: str
    status: str
    refunded_amount: Decimal
    refunded_transaction_id: Optional[str] = None


@dataclass
class Result:
    is_success: bool
    transaction: Optional[Transaction] = None
    errors: List[BraintreeError] = field(default_factory=list)


class BraintreeAPI:
    ERROR_NOT_FOUND = "91508"
    ERROR_ALREADY_REFUNDED = "91512"
    ERROR_TOO_LARGE = "91521"

    def __init__(self):
        self._transactions = {}
        self._keys = {}
        self._seq = 0

    def _next(self):
        self._seq += 1
        return "txn{:08d}".format(self._seq)

    def find(self, transaction_id):
        return self._transactions.get(transaction_id)

    def sale(self, params):
        key = params.get("idempotency_key")
        if key in self._keys:
            return Result(is_success=True, transaction=self._transactions[self._keys[key]])
        transaction = Transaction(
            id=self._next(),
            amount=params["amount"],
            currency_iso_code=params["currency_iso_code"],
            status="submitted_for_settlement",
            refunded_amount=Decimal("0.00"),
        )
        self._transactions[transaction.id] = transaction
        self._keys[key] = transaction.id
        return Result(is_success=True, transaction=transaction)

    def refund(self, transaction_id, amount=None):
        original = self._transactions.get(transaction_id)
        if original is None:
            return Result(
                is_success=False,
                errors=[BraintreeError(self.ERROR_NOT_FOUND, "Transaction not found")],
            )
        if original.refunded_amount > Decimal("0.00"):
            return Result(
                is_success=False,
                errors=[
                    BraintreeError(
                        self.ERROR_ALREADY_REFUNDED,
                        "Transaction has already been refunded",
                    )
                ],
            )
        asked = original.amount if amount is None else amount
        if asked > original.amount:
            return Result(
                is_success=False,
                errors=[BraintreeError(self.ERROR_TOO_LARGE, "Refund amount is too large")],
            )
        original.refunded_amount = asked
        refund_transaction = Transaction(
            id=self._next(),
            amount=asked,
            currency_iso_code=original.currency_iso_code,
            status="submitted_for_settlement",
            refunded_amount=Decimal("0.00"),
            refunded_transaction_id=original.id,
        )
        self._transactions[refund_transaction.id] = refund_transaction
        return Result(is_success=True, transaction=refund_transaction)
PY

# --- adapters: four independent implementations of one interface ------------

cat > "$REPO/payments/adapters/stripe_adapter.py" <<'PY'
"""Stripe adapter. Minor units end to end, so nothing converts here."""

from payments.mocks.stripe_api import StripeError
from payments.types import Charge, PaymentError

PROVIDER = "stripe"


class StripeAdapter:
    def __init__(self, api, ledger):
        self._api = api
        self._ledger = ledger

    def charge(self, amount, currency, idempotency_key):
        existing = self._ledger.find(idempotency_key)
        if existing is not None:
            return Charge(
                PROVIDER, existing.external_id, existing.amount,
                existing.currency, "succeeded",
            )
        try:
            raw = self._api.create_charge(
                amount=amount, currency=currency, idempotency_key=idempotency_key
            )
        except StripeError as exc:
            raise PaymentError("stripe: {}".format(exc)) from exc
        self._ledger.record_charge(
            provider=PROVIDER,
            external_id=raw["id"],
            amount=raw["amount"],
            currency=raw["currency"],
            idempotency_key=idempotency_key,
        )
        return Charge(PROVIDER, raw["id"], raw["amount"], raw["currency"], "succeeded")
PY

cat > "$REPO/payments/adapters/paypal_adapter.py" <<'PY'
"""PayPal adapter.

Two conversions live here and nowhere else: minor units to and from the
provider's decimal strings, and the provider's in-body error object to a
`PaymentError`.
"""

from payments.mocks.paypal_api import to_decimal, to_minor
from payments.types import Charge, PaymentError

PROVIDER = "paypal"


def error_issue(response):
    """The provider's most specific complaint, or its error name."""
    for detail in response.get("details") or []:
        issue = detail.get("issue")
        if issue:
            return issue
    return response.get("name")


def raise_on_error(response):
    if "name" in response:
        raise PaymentError("paypal: {}".format(error_issue(response)))


class PayPalAdapter:
    def __init__(self, api, ledger):
        self._api = api
        self._ledger = ledger

    def charge(self, amount, currency, idempotency_key):
        existing = self._ledger.find(idempotency_key)
        if existing is not None:
            return Charge(
                PROVIDER, existing.external_id, existing.amount,
                existing.currency, "succeeded",
            )
        raw = self._api.capture(
            {
                "request_id": idempotency_key,
                "amount": {"value": to_decimal(amount), "currency_code": currency},
            }
        )
        raise_on_error(raw)
        self._ledger.record_charge(
            provider=PROVIDER,
            external_id=raw["id"],
            amount=to_minor(raw["amount"]["value"]),
            currency=raw["amount"]["currency_code"],
            idempotency_key=idempotency_key,
        )
        return Charge(PROVIDER, raw["id"], amount, currency, "succeeded")
PY

cat > "$REPO/payments/adapters/adyen_adapter.py" <<'PY'
"""Adyen adapter.

Adyen answers "received" and settles later, so every call here submits and
then polls to an outcome. Nothing is recorded until the poll says so — the
provider will happily accept a request it later refuses.
"""

from payments.types import Charge, PaymentError

PROVIDER = "adyen"
POLL_ATTEMPTS = 5


class AdyenAdapter:
    def __init__(self, api, ledger):
        self._api = api
        self._ledger = ledger

    def charge(self, amount, currency, idempotency_key):
        existing = self._ledger.find(idempotency_key)
        if existing is not None:
            return Charge(
                PROVIDER, existing.external_id, existing.amount,
                existing.currency, "succeeded",
            )
        submitted = self._api.payments(
            {
                "reference": idempotency_key,
                "amount": {"value": amount, "currency": currency},
            }
        )
        psp = submitted["pspReference"]
        settled = self._await_payment(psp)
        if settled["resultCode"] != "Authorised":
            raise PaymentError("adyen: {}".format(settled["resultCode"]))
        self._ledger.record_charge(
            provider=PROVIDER,
            external_id=psp,
            amount=settled["amount"]["value"],
            currency=settled["amount"]["currency"],
            idempotency_key=idempotency_key,
        )
        return Charge(PROVIDER, psp, amount, currency, "succeeded")

    def _await_payment(self, psp_reference):
        for _ in range(POLL_ATTEMPTS):
            settled = self._api.get_payment(psp_reference)
            if settled is not None and settled["resultCode"] != "Received":
                return settled
        raise PaymentError("adyen: payment did not settle")
PY

cat > "$REPO/payments/adapters/braintree_adapter.py" <<'PY'
"""Braintree adapter.

Braintree speaks major-unit Decimals and never raises: it returns a result
object and expects the caller to check it. Both of those stop here.
"""

from decimal import Decimal

from payments.types import Charge, PaymentError

PROVIDER = "braintree"


def to_decimal(minor):
    """1050 -> Decimal('10.50')."""
    return (Decimal(minor) / 100).quantize(Decimal("0.01"))


def to_minor(value):
    """Decimal('10.50') -> 1050."""
    return int((value * 100).to_integral_value())


def raise_on_failure(result):
    if result.is_success:
        return
    first = result.errors[0] if result.errors else None
    if first is None:
        raise PaymentError("braintree: request failed with no error detail")
    raise PaymentError("braintree: {} {}".format(first.code, first.message))


class BraintreeAdapter:
    def __init__(self, api, ledger):
        self._api = api
        self._ledger = ledger

    def charge(self, amount, currency, idempotency_key):
        existing = self._ledger.find(idempotency_key)
        if existing is not None:
            return Charge(
                PROVIDER, existing.external_id, existing.amount,
                existing.currency, "succeeded",
            )
        result = self._api.sale(
            {
                "amount": to_decimal(amount),
                "currency_iso_code": currency,
                "idempotency_key": idempotency_key,
            }
        )
        raise_on_failure(result)
        transaction = result.transaction
        self._ledger.record_charge(
            provider=PROVIDER,
            external_id=transaction.id,
            amount=to_minor(transaction.amount),
            currency=transaction.currency_iso_code,
            idempotency_key=idempotency_key,
        )
        return Charge(PROVIDER, transaction.id, amount, currency, "succeeded")
PY

cat > "$REPO/payments/factory.py" <<'PY'
"""Wiring.

One place that knows which adapter talks to which provider mock, so callers
do not repeat it and a test can hold the whole system in one object.
"""

from dataclasses import dataclass
from typing import Dict

from payments.adapters.adyen_adapter import AdyenAdapter
from payments.adapters.braintree_adapter import BraintreeAdapter
from payments.adapters.paypal_adapter import PayPalAdapter
from payments.adapters.stripe_adapter import StripeAdapter
from payments.ledger import Ledger
from payments.mocks.adyen_api import AdyenAPI
from payments.mocks.braintree_api import BraintreeAPI
from payments.mocks.paypal_api import PayPalAPI
from payments.mocks.stripe_api import StripeAPI

PROVIDERS = ("stripe", "paypal", "adyen", "braintree")


@dataclass(frozen=True)
class Wiring:
    ledger: Ledger
    apis: Dict[str, object]
    adapters: Dict[str, object]


def build(ledger=None):
    """Four adapters bound to four fresh provider mocks and one shared ledger."""
    ledger = Ledger() if ledger is None else ledger
    apis = {
        "stripe": StripeAPI(),
        "paypal": PayPalAPI(),
        "adyen": AdyenAPI(),
        "braintree": BraintreeAPI(),
    }
    adapters = {
        "stripe": StripeAdapter(apis["stripe"], ledger),
        "paypal": PayPalAdapter(apis["paypal"], ledger),
        "adyen": AdyenAdapter(apis["adyen"], ledger),
        "braintree": BraintreeAdapter(apis["braintree"], ledger),
    }
    return Wiring(ledger=ledger, apis=apis, adapters=adapters)
PY

cat > "$REPO/smoke.py" <<'PY'
#!/usr/bin/env python3
"""Charge-path smoke check. Run it before and after changing anything.

    python3 smoke.py

It asserts the two ledger invariants on the path that already exists: four
charges write four entries, and a repeated idempotency key finds the entry
already there rather than writing a second one.
"""

import sys

from payments.factory import PROVIDERS, build


def main():
    wiring = build()
    charged = 0
    for provider in PROVIDERS:
        adapter = wiring.adapters[provider]
        charge = adapter.charge(1000, "USD", "smoke-{}".format(provider))
        assert charge.provider == provider, charge
        assert charge.amount == 1000, charge
        assert charge.status == "succeeded", charge
        replay = adapter.charge(1000, "USD", "smoke-{}".format(provider))
        assert replay.charge_id == charge.charge_id, (charge, replay)
        charged += 1
        print("{:<10} {:<16} {} {}".format(provider, charge.charge_id, charge.amount, charge.currency))

    entries = wiring.ledger.rows()
    assert charged == 4, charged
    assert len(entries) == 4, entries
    assert all(entry.kind == "charge" for entry in entries), entries
    print("\n{} providers charged, {} ledger entries, replay wrote none".format(charged, len(entries)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
PY

# =============================================================================
# heldout/ — the correctness fixture. 20 cases the arms never see.
# =============================================================================

cat > "$HELDOUT/check_refunds.py" <<'PY'
#!/usr/bin/env python3
"""The held-out correctness fixture for the refund task. 20 cases.

Never copied into a run directory, never shown to an arm. Correctness here is
observed behaviour against the provider mocks and the ledger — there is no
judge model and no candidate test suite is run, because a candidate's own
suite grades what the candidate decided to grade.

    python3 check_refunds.py <candidate-repo-dir> [--json <path>]

The 20 cases are docs/INSTRUMENTS-R4.md §1's: 4 adapters x (full refund,
partial refund, refund exceeding the charge, double refund with the same
idempotency key) = 16, plus 4 ledger cases.

A check that ran over nothing looks exactly like one that passed, so the count
of cases that actually executed is printed beside the verdict and zero reads
as UNPROVEN, never as a pass.
"""

import argparse
import importlib
import json
import sys
import traceback
from pathlib import Path

PROVIDERS = ("stripe", "paypal", "adyen", "braintree")
CHARGE_AMOUNT = 1000
PARTIAL_AMOUNT = 400
EXCESSIVE_AMOUNT = 1500

_factory = None
_types = None


class CaseFailed(AssertionError):
    """A case reached a verdict and the verdict was no."""


def require(condition, message):
    if not condition:
        raise CaseFailed(message)


def build():
    return _factory.build()


def refund_rows(ledger):
    return [row for row in ledger.rows() if row.kind == "refund"]


def charge_row(ledger, provider, charge_id):
    for row in ledger.rows():
        if row.kind == "charge" and row.provider == provider and row.external_id == charge_id:
            return row
    return None


def provider_refunded(wiring, provider, charge_id):
    """Refunded total in minor units, read from the provider mock's own state.

    Deliberately computed here rather than by a helper in the fixture: a
    helper the candidate can edit is a grader the candidate can edit.
    """
    api = wiring.apis[provider]
    if provider == "stripe":
        charge = api.get_charge(charge_id)
        require(charge is not None, "stripe: charge {} vanished".format(charge_id))
        return charge["amount_refunded"]
    if provider == "paypal":
        capture = api.get_capture(charge_id)
        require(capture is not None, "paypal: capture {} vanished".format(charge_id))
        from payments.mocks.paypal_api import to_minor

        return to_minor(capture["amount_refunded"])
    if provider == "adyen":
        payment = api.get_payment(charge_id)
        require(payment is not None, "adyen: payment {} vanished".format(charge_id))
        return payment["refunded"]
    if provider == "braintree":
        transaction = api.find(charge_id)
        require(transaction is not None, "braintree: transaction {} vanished".format(charge_id))
        return int((transaction.refunded_amount * 100).to_integral_value())
    raise CaseFailed("unknown provider {}".format(provider))


def check_refund_shape(result, provider, charge_id, amount):
    require(result is not None, "refund() returned None")
    require(
        isinstance(result, _types.Refund),
        "refund() returned {}, not payments.types.Refund".format(type(result).__name__),
    )
    require(result.provider == provider, "refund.provider is {!r}".format(result.provider))
    require(result.charge_id == charge_id, "refund.charge_id is {!r}".format(result.charge_id))
    require(result.amount == amount, "refund.amount is {!r}, expected {}".format(result.amount, amount))
    require(result.status == "succeeded", "refund.status is {!r}".format(result.status))
    require(bool(result.refund_id), "refund.refund_id is empty")


# --- the 16 adapter cases ----------------------------------------------------


def case_full(provider):
    wiring = build()
    adapter = wiring.adapters[provider]
    charge = adapter.charge(CHARGE_AMOUNT, "USD", "full-{}".format(provider))
    result = adapter.refund(charge.charge_id, CHARGE_AMOUNT)
    check_refund_shape(result, provider, charge.charge_id, CHARGE_AMOUNT)
    require(
        provider_refunded(wiring, provider, charge.charge_id) == CHARGE_AMOUNT,
        "provider refunded {}, expected {}".format(
            provider_refunded(wiring, provider, charge.charge_id), CHARGE_AMOUNT
        ),
    )
    rows = refund_rows(wiring.ledger)
    require(len(rows) == 1, "ledger holds {} refund entries, expected 1".format(len(rows)))


def case_partial(provider):
    wiring = build()
    adapter = wiring.adapters[provider]
    charge = adapter.charge(CHARGE_AMOUNT, "USD", "partial-{}".format(provider))
    result = adapter.refund(charge.charge_id, PARTIAL_AMOUNT)
    check_refund_shape(result, provider, charge.charge_id, PARTIAL_AMOUNT)
    refunded = provider_refunded(wiring, provider, charge.charge_id)
    require(
        refunded == PARTIAL_AMOUNT,
        "provider refunded {}, expected the partial {}".format(refunded, PARTIAL_AMOUNT),
    )
    rows = refund_rows(wiring.ledger)
    require(len(rows) == 1, "ledger holds {} refund entries, expected 1".format(len(rows)))
    require(
        rows[0].amount == PARTIAL_AMOUNT,
        "ledger refund entry records {}, expected {}".format(rows[0].amount, PARTIAL_AMOUNT),
    )


def case_exceeds(provider):
    wiring = build()
    adapter = wiring.adapters[provider]
    charge = adapter.charge(CHARGE_AMOUNT, "USD", "exceeds-{}".format(provider))
    raised = None
    try:
        adapter.refund(charge.charge_id, EXCESSIVE_AMOUNT)
    except _types.RefundTooLarge as exc:
        raised = exc
    require(
        raised is not None,
        "refunding {} of a {} charge did not raise RefundTooLarge".format(
            EXCESSIVE_AMOUNT, CHARGE_AMOUNT
        ),
    )
    refunded = provider_refunded(wiring, provider, charge.charge_id)
    require(refunded == 0, "provider refunded {} after a rejected refund".format(refunded))
    rows = refund_rows(wiring.ledger)
    require(
        not rows,
        "ledger holds {} refund entries after a rejected refund".format(len(rows)),
    )


def case_double(provider):
    wiring = build()
    adapter = wiring.adapters[provider]
    charge = adapter.charge(CHARGE_AMOUNT, "USD", "double-{}".format(provider))
    first = adapter.refund(charge.charge_id, PARTIAL_AMOUNT)
    second = adapter.refund(charge.charge_id, PARTIAL_AMOUNT)
    check_refund_shape(second, provider, charge.charge_id, PARTIAL_AMOUNT)
    require(
        second.refund_id == first.refund_id,
        "the replay returned refund_id {!r}, the first returned {!r}".format(
            second.refund_id, first.refund_id
        ),
    )
    refunded = provider_refunded(wiring, provider, charge.charge_id)
    require(
        refunded == PARTIAL_AMOUNT,
        "provider refunded {} after two identical calls, expected {}".format(
            refunded, PARTIAL_AMOUNT
        ),
    )
    rows = refund_rows(wiring.ledger)
    require(
        len(rows) == 1,
        "ledger holds {} refund entries after two identical calls".format(len(rows)),
    )


# --- the 4 ledger cases ------------------------------------------------------
#
# All four drive the ledger through an adapter rather than by calling a method
# by name: the task does not fix a name for the ledger's refund entry point,
# so asserting one would grade a guess.


def case_ledger_one_reversing_row():
    wiring = build()
    adapter = wiring.adapters["stripe"]
    charge = adapter.charge(CHARGE_AMOUNT, "USD", "ledger-one")
    adapter.refund(charge.charge_id, CHARGE_AMOUNT)
    rows = wiring.ledger.rows()
    reversing = [row for row in rows if row.kind == "refund"]
    require(
        len(reversing) == 1,
        "one refund produced {} entries of kind 'refund'".format(len(reversing)),
    )
    require(
        len(rows) == 2,
        "one charge and one refund produced {} ledger entries".format(len(rows)),
    )


def case_ledger_references_charge():
    wiring = build()
    adapter = wiring.adapters["stripe"]
    charge = adapter.charge(CHARGE_AMOUNT, "USD", "ledger-ref")
    adapter.refund(charge.charge_id, CHARGE_AMOUNT)
    original = charge_row(wiring.ledger, "stripe", charge.charge_id)
    require(original is not None, "no charge entry for {}".format(charge.charge_id))
    reversing = refund_rows(wiring.ledger)
    require(len(reversing) == 1, "expected exactly one refund entry")
    require(
        reversing[0].reverses_id == original.id,
        "refund entry reverses_id is {!r}, expected the charge entry id {}".format(
            reversing[0].reverses_id, original.id
        ),
    )


def case_ledger_rolls_back_with_caller():
    """The refund write must join the caller's transaction, not commit past it."""
    wiring = build()
    adapter = wiring.adapters["stripe"]
    charge = adapter.charge(CHARGE_AMOUNT, "USD", "ledger-rollback")

    class Boom(Exception):
        pass

    try:
        with wiring.ledger.transaction():
            adapter.refund(charge.charge_id, PARTIAL_AMOUNT)
            raise Boom()
    except Boom:
        pass
    rows = refund_rows(wiring.ledger)
    require(
        not rows,
        "{} refund entries survived a caller transaction that rolled back".format(len(rows)),
    )


def case_ledger_partial_amount_recorded():
    wiring = build()
    adapter = wiring.adapters["stripe"]
    charge = adapter.charge(CHARGE_AMOUNT, "USD", "ledger-partial")
    adapter.refund(charge.charge_id, PARTIAL_AMOUNT)
    original = charge_row(wiring.ledger, "stripe", charge.charge_id)
    require(original is not None, "no charge entry for {}".format(charge.charge_id))
    against_charge = [
        row for row in refund_rows(wiring.ledger) if row.reverses_id == original.id
    ]
    total = sum(row.amount for row in against_charge)
    require(
        total == PARTIAL_AMOUNT,
        "refund entries against the charge total {}, expected {}".format(
            total, PARTIAL_AMOUNT
        ),
    )
    require(
        against_charge and against_charge[0].currency == "USD",
        "refund entry currency is not the charge's",
    )


def build_cases():
    cases = []
    for provider in PROVIDERS:
        cases.append(("{}.full".format(provider), lambda p=provider: case_full(p)))
        cases.append(("{}.partial".format(provider), lambda p=provider: case_partial(p)))
        cases.append(("{}.exceeds".format(provider), lambda p=provider: case_exceeds(p)))
        cases.append(("{}.double".format(provider), lambda p=provider: case_double(p)))
    cases.append(("ledger.one_reversing_row", case_ledger_one_reversing_row))
    cases.append(("ledger.references_charge", case_ledger_references_charge))
    cases.append(("ledger.rolls_back_with_caller", case_ledger_rolls_back_with_caller))
    cases.append(("ledger.partial_amount_recorded", case_ledger_partial_amount_recorded))
    return cases


TOTAL_CASES = 20


def emit(report, path):
    if path:
        Path(path).write_text(json.dumps(report, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description="Grade a candidate refund implementation.")
    parser.add_argument("candidate", help="directory holding the candidate's payments package")
    parser.add_argument("--json", dest="json_path", default=None, help="write the report here")
    args = parser.parse_args()

    candidate = Path(args.candidate).resolve()
    sys.path.insert(0, str(candidate))

    global _factory, _types
    try:
        _factory = importlib.import_module("payments.factory")
        _types = importlib.import_module("payments.types")
        _factory.build()
    except Exception:
        detail = traceback.format_exc()
        print(detail, file=sys.stderr)
        print("candidate:      {}".format(candidate))
        print("cases executed: 0 of {}".format(TOTAL_CASES))
        print("cases passed:   0")
        print("VERDICT: UNPROVEN — the candidate's payments package did not load, so no case ran.")
        emit(
            {
                "candidate": str(candidate),
                "total": TOTAL_CASES,
                "executed": 0,
                "passed": 0,
                "verdict": "UNPROVEN",
                "load_error": detail,
                "cases": [],
            },
            args.json_path,
        )
        return 3

    cases = build_cases()
    if len(cases) != TOTAL_CASES:
        raise SystemExit(
            "fixture built {} cases, expected {}".format(len(cases), TOTAL_CASES)
        )

    results = []
    executed = passed = 0
    for name, run in cases:
        try:
            run()
        except CaseFailed as exc:
            executed += 1
            results.append({"case": name, "outcome": "fail", "reason": str(exc)})
        except Exception as exc:  # noqa: BLE001 — an unexpected type is still a verdict
            executed += 1
            results.append(
                {
                    "case": name,
                    "outcome": "error",
                    "reason": "{}: {}".format(type(exc).__name__, exc),
                }
            )
        else:
            executed += 1
            passed += 1
            results.append({"case": name, "outcome": "pass", "reason": ""})

    for entry in results:
        marker = {"pass": "  ok  ", "fail": " FAIL ", "error": "ERROR "}[entry["outcome"]]
        line = "{} {}".format(marker, entry["case"])
        if entry["reason"]:
            line += " — {}".format(entry["reason"])
        print(line)

    if executed == 0:
        verdict = "UNPROVEN"
    elif passed == TOTAL_CASES:
        verdict = "PASS"
    else:
        verdict = "FAIL"

    print()
    print("candidate:      {}".format(candidate))
    print("cases executed: {} of {}".format(executed, TOTAL_CASES))
    print("cases passed:   {}".format(passed))
    print("VERDICT: {} ({}/{}, {} executed)".format(verdict, passed, TOTAL_CASES, executed))

    emit(
        {
            "candidate": str(candidate),
            "total": TOTAL_CASES,
            "executed": executed,
            "passed": passed,
            "verdict": verdict,
            "failed": [e["case"] for e in results if e["outcome"] != "pass"],
            "cases": results,
        },
        args.json_path,
    )

    if verdict == "UNPROVEN":
        return 3
    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
PY

# =============================================================================
# reference/ — the grader's own controls, never a candidate answer
#
# Both references are the repo tree plus an APPENDED snippet per file, rather
# than a second full copy of each module: a copy would drift from repo/ the
# first time repo/ changed, and a drifted control proves nothing about the
# tree the arms actually get.
# =============================================================================

cat > "$SNIP/correct/ledger.py" <<'PY'


# --- reference refund implementation ----------------------------------------
# Appended by scripts/bench/make-refund-fixture.sh. This is the GRADER'S
# control, not a candidate answer: it exists so the held-out fixture can be
# watched going green against a tree known to be correct.

def _refund_key(charge_entry, amount):
    """Deterministic in the operation recorded, which is what makes replay work."""
    return "{}:refund:{}".format(charge_entry.idempotency_key, amount)


def _charge_entry(self, provider, external_id):
    for entry in self.rows():
        if entry.kind == "charge" and entry.provider == provider and entry.external_id == external_id:
            return entry
    return None


def _refund_for(self, charge_entry_id, amount):
    charge_entry = self.get(charge_entry_id)
    if charge_entry is None:
        return None
    return self.find(_refund_key(charge_entry, amount))


def _record_refund(self, *, provider, external_id, amount, currency, charge_entry_id):
    with self.transaction() as conn:
        charge_entry = self.get(charge_entry_id)
        if charge_entry is None:
            raise ValueError("no such charge entry: {}".format(charge_entry_id))
        key = _refund_key(charge_entry, amount)
        existing = self.find(key)
        if existing is not None:
            return existing
        cursor = conn.execute(
            "INSERT INTO entries"
            " (provider, kind, external_id, amount, currency, idempotency_key, reverses_id)"
            " VALUES (?, 'refund', ?, ?, ?, ?, ?)",
            (provider, external_id, amount, currency, key, charge_entry_id),
        )
        return self.get(cursor.lastrowid)


Ledger.charge_entry = _charge_entry
Ledger.refund_for = _refund_for
Ledger.record_refund = _record_refund
PY

cat > "$SNIP/correct/stripe.py" <<'PY'


# --- reference refund implementation (see ledger.py's note) -------------------

from payments.types import Refund, RefundTooLarge  # noqa: E402


def _stripe_refund(self, charge_id, amount):
    entry = self._ledger.charge_entry(PROVIDER, charge_id)
    if entry is None:
        raise PaymentError("stripe: no ledger entry for charge {}".format(charge_id))
    replay = self._ledger.refund_for(entry.id, amount)
    if replay is not None:
        return Refund(PROVIDER, replay.external_id, charge_id, replay.amount, "succeeded")
    try:
        raw = self._api.create_refund(
            charge=charge_id,
            amount=amount,
            idempotency_key="{}:refund:{}".format(entry.idempotency_key, amount),
        )
    except StripeError as exc:
        if "exceeds" in str(exc):
            raise RefundTooLarge("stripe: {}".format(exc)) from exc
        raise PaymentError("stripe: {}".format(exc)) from exc
    self._ledger.record_refund(
        provider=PROVIDER,
        external_id=raw["id"],
        amount=raw["amount"],
        currency=entry.currency,
        charge_entry_id=entry.id,
    )
    return Refund(PROVIDER, raw["id"], charge_id, raw["amount"], "succeeded")


StripeAdapter.refund = _stripe_refund
PY

cat > "$SNIP/correct/paypal.py" <<'PY'


# --- reference refund implementation (see ledger.py's note) -------------------

from payments.types import Refund, RefundTooLarge  # noqa: E402


def _paypal_refund(self, charge_id, amount):
    entry = self._ledger.charge_entry(PROVIDER, charge_id)
    if entry is None:
        raise PaymentError("paypal: no ledger entry for capture {}".format(charge_id))
    replay = self._ledger.refund_for(entry.id, amount)
    if replay is not None:
        return Refund(PROVIDER, replay.external_id, charge_id, replay.amount, "succeeded")
    raw = self._api.refund_capture(
        charge_id,
        {"amount": {"value": to_decimal(amount), "currency_code": entry.currency}},
    )
    if "name" in raw:
        issue = error_issue(raw)
        if issue == "REFUND_AMOUNT_EXCEEDED":
            raise RefundTooLarge("paypal: {}".format(issue))
        raise PaymentError("paypal: {}".format(issue))
    self._ledger.record_refund(
        provider=PROVIDER,
        external_id=raw["id"],
        amount=to_minor(raw["amount"]["value"]),
        currency=entry.currency,
        charge_entry_id=entry.id,
    )
    return Refund(PROVIDER, raw["id"], charge_id, amount, "succeeded")


PayPalAdapter.refund = _paypal_refund
PY

cat > "$SNIP/correct/adyen.py" <<'PY'


# --- reference refund implementation (see ledger.py's note) -------------------

from payments.types import Refund, RefundTooLarge  # noqa: E402


def _await_modification(self, psp_reference):
    for _ in range(POLL_ATTEMPTS):
        outcome = self._api.get_modification(psp_reference)
        if outcome is not None and outcome["status"] != "received":
            return outcome
    raise PaymentError("adyen: refund did not settle")


def _adyen_refund(self, charge_id, amount):
    entry = self._ledger.charge_entry(PROVIDER, charge_id)
    if entry is None:
        raise PaymentError("adyen: no ledger entry for payment {}".format(charge_id))
    replay = self._ledger.refund_for(entry.id, amount)
    if replay is not None:
        return Refund(PROVIDER, replay.external_id, charge_id, replay.amount, "succeeded")
    submitted = self._api.refunds(
        charge_id,
        {
            "reference": "{}:refund:{}".format(entry.idempotency_key, amount),
            "amount": {"value": amount, "currency": entry.currency},
        },
    )
    outcome = self._await_modification(submitted["pspReference"])
    if outcome["status"] != "completed":
        reason = outcome.get("reason") or "refund failed"
        if "exceeds" in reason.lower():
            raise RefundTooLarge("adyen: {}".format(reason))
        raise PaymentError("adyen: {}".format(reason))
    self._ledger.record_refund(
        provider=PROVIDER,
        external_id=submitted["pspReference"],
        amount=amount,
        currency=entry.currency,
        charge_entry_id=entry.id,
    )
    return Refund(PROVIDER, submitted["pspReference"], charge_id, amount, "succeeded")


AdyenAdapter._await_modification = _await_modification
AdyenAdapter.refund = _adyen_refund
PY

cat > "$SNIP/correct/braintree.py" <<'PY'


# --- reference refund implementation (see ledger.py's note) -------------------

from payments.mocks.braintree_api import BraintreeAPI  # noqa: E402
from payments.types import Refund, RefundTooLarge  # noqa: E402


def _braintree_refund(self, charge_id, amount):
    entry = self._ledger.charge_entry(PROVIDER, charge_id)
    if entry is None:
        raise PaymentError("braintree: no ledger entry for transaction {}".format(charge_id))
    replay = self._ledger.refund_for(entry.id, amount)
    if replay is not None:
        return Refund(PROVIDER, replay.external_id, charge_id, replay.amount, "succeeded")
    result = self._api.refund(charge_id, to_decimal(amount))
    if not result.is_success:
        first = result.errors[0] if result.errors else None
        if first is not None and first.code == BraintreeAPI.ERROR_TOO_LARGE:
            raise RefundTooLarge("braintree: {}".format(first.message))
        raise_on_failure(result)
    transaction = result.transaction
    self._ledger.record_refund(
        provider=PROVIDER,
        external_id=transaction.id,
        amount=to_minor(transaction.amount),
        currency=entry.currency,
        charge_entry_id=entry.id,
    )
    return Refund(PROVIDER, transaction.id, charge_id, to_minor(transaction.amount), "succeeded")


BraintreeAdapter.refund = _braintree_refund
PY

# --- the negative control ----------------------------------------------------
# Three files replaced, four defects seeded, each naming the case it must turn
# red. Every other file is the correct reference, so the RED set is a
# prediction and not a shrug: if the suite goes red anywhere else, or green on
# any of these four, the fixture is not measuring what it claims.

cat > "$SNIP/broken/ledger.py" <<'PY'


# --- SEEDED DEFECT — negative control, not a candidate answer -----------------
# Defect 1: the reversing entry is written without reverses_id, so nothing ties
#           it to the charge it reverses.
# Must turn RED: ledger.references_charge, ledger.partial_amount_recorded.

def _refund_key(charge_entry, amount):
    return "{}:refund:{}".format(charge_entry.idempotency_key, amount)


def _charge_entry(self, provider, external_id):
    for entry in self.rows():
        if entry.kind == "charge" and entry.provider == provider and entry.external_id == external_id:
            return entry
    return None


def _refund_for(self, charge_entry_id, amount):
    charge_entry = self.get(charge_entry_id)
    if charge_entry is None:
        return None
    return self.find(_refund_key(charge_entry, amount))


def _record_refund(self, *, provider, external_id, amount, currency, charge_entry_id):
    with self.transaction() as conn:
        charge_entry = self.get(charge_entry_id)
        if charge_entry is None:
            raise ValueError("no such charge entry: {}".format(charge_entry_id))
        key = _refund_key(charge_entry, amount)
        existing = self.find(key)
        if existing is not None:
            return existing
        cursor = conn.execute(
            "INSERT INTO entries"
            " (provider, kind, external_id, amount, currency, idempotency_key, reverses_id)"
            " VALUES (?, 'refund', ?, ?, ?, ?, NULL)",
            (provider, external_id, amount, currency, key),
        )
        return self.get(cursor.lastrowid)


Ledger.charge_entry = _charge_entry
Ledger.refund_for = _refund_for
Ledger.record_refund = _record_refund
PY

cat > "$SNIP/broken/paypal.py" <<'PY'


# --- SEEDED DEFECT — negative control, not a candidate answer -----------------
# Defect 2: no ledger-first replay guard. PayPal's API is not idempotent, so a
#           repeated call refunds a second time at the provider even though the
#           ledger's UNIQUE key keeps a second entry out.
# Must turn RED: paypal.double.

from payments.types import Refund, RefundTooLarge  # noqa: E402


def _paypal_refund(self, charge_id, amount):
    entry = self._ledger.charge_entry(PROVIDER, charge_id)
    if entry is None:
        raise PaymentError("paypal: no ledger entry for capture {}".format(charge_id))
    raw = self._api.refund_capture(
        charge_id,
        {"amount": {"value": to_decimal(amount), "currency_code": entry.currency}},
    )
    if "name" in raw:
        issue = error_issue(raw)
        if issue == "REFUND_AMOUNT_EXCEEDED":
            raise RefundTooLarge("paypal: {}".format(issue))
        raise PaymentError("paypal: {}".format(issue))
    recorded = self._ledger.record_refund(
        provider=PROVIDER,
        external_id=raw["id"],
        amount=to_minor(raw["amount"]["value"]),
        currency=entry.currency,
        charge_entry_id=entry.id,
    )
    return Refund(PROVIDER, recorded.external_id, charge_id, amount, "succeeded")


PayPalAdapter.refund = _paypal_refund
PY

cat > "$SNIP/broken/adyen.py" <<'PY'


# --- SEEDED DEFECT — negative control, not a candidate answer -----------------
# Defect 3: the modification outcome is fetched but never inspected. Adyen
#           accepts an over-refund at submit time and refuses it on settlement,
#           so this records a refund that did not happen.
# Must turn RED: adyen.exceeds.

from payments.types import Refund, RefundTooLarge  # noqa: E402,F401


def _adyen_refund(self, charge_id, amount):
    entry = self._ledger.charge_entry(PROVIDER, charge_id)
    if entry is None:
        raise PaymentError("adyen: no ledger entry for payment {}".format(charge_id))
    replay = self._ledger.refund_for(entry.id, amount)
    if replay is not None:
        return Refund(PROVIDER, replay.external_id, charge_id, replay.amount, "succeeded")
    submitted = self._api.refunds(
        charge_id,
        {
            "reference": "{}:refund:{}".format(entry.idempotency_key, amount),
            "amount": {"value": amount, "currency": entry.currency},
        },
    )
    self._api.get_modification(submitted["pspReference"])
    self._ledger.record_refund(
        provider=PROVIDER,
        external_id=submitted["pspReference"],
        amount=amount,
        currency=entry.currency,
        charge_entry_id=entry.id,
    )
    return Refund(PROVIDER, submitted["pspReference"], charge_id, amount, "succeeded")


AdyenAdapter.refund = _adyen_refund
PY

# --- assemble both overlays --------------------------------------------------
build_overlay() {
  local variant="$1"
  local destination="$OUT/reference/$variant"
  local key relative snippet
  mkdir -p "$destination/payments/adapters"
  for key in ledger stripe paypal adyen braintree; do
    if [ "$key" = "ledger" ]; then
      relative="payments/ledger.py"
    else
      relative="payments/adapters/${key}_adapter.py"
    fi
    snippet="$SNIP/$variant/$key.py"
    [ -f "$snippet" ] || snippet="$SNIP/correct/$key.py"
    cat "$REPO/$relative" "$snippet" > "$destination/$relative"
  done
}

build_overlay correct
build_overlay broken

# =============================================================================
# self-checks — a fixture that was never exercised is a fixture nobody can
# trust, and every number below is one this script would otherwise be asserting
# on faith.
# =============================================================================

# The four adapters must not import each other. This is the property the whole
# benchmark rests on: without it there is nothing independent to fan out to,
# and the task collapses back into the single-file shape that produced nine
# zero-delegation runs.
for adapter in stripe paypal adyen braintree; do
  for other in stripe paypal adyen braintree; do
    if [ "$adapter" != "$other" ] &&
       grep -q "adapters.${other}_adapter\|adapters import ${other}" \
         "$REPO/payments/adapters/${adapter}_adapter.py"; then
      echo "internal error: ${adapter}_adapter.py imports ${other}_adapter — the adapters must be independent" >&2
      exit 1
    fi
  done
done

# The ledger must be genuinely shared: all four adapters write through it.
for adapter in stripe paypal adyen braintree; do
  if ! grep -q "_ledger.record_charge" "$REPO/payments/adapters/${adapter}_adapter.py"; then
    echo "internal error: ${adapter}_adapter.py does not write through the ledger" >&2
    exit 1
  fi
done

file_count="$(find "$REPO" -type f | wc -l | tr -d ' ')"
if [ "$file_count" -ne 16 ]; then
  echo "internal error: expected 16 files in $REPO, found $file_count" >&2
  exit 1
fi

# The charge path has to work before the task starts, or every arm inherits a
# broken tree and the benchmark measures repair rather than delegation.
# PYTHONDONTWRITEBYTECODE keeps __pycache__ out of repo/: it would otherwise be
# copied into every run directory and counted as a file the arm produced.
if ! ( cd "$REPO" && PYTHONDONTWRITEBYTECODE=1 python3 smoke.py >/dev/null ); then
  echo "internal error: the generated repo fails its own smoke.py" >&2
  exit 1
fi

# --- manifest.json: the answer key grade-refunds.sh reads --------------------
python3 - "$OUT" <<'PY'
import json
import sys

out = sys.argv[1]

manifest = {
    "task": "add refund(charge_id, amount) to all four adapters and to the ledger",
    "providers": ["stripe", "paypal", "adyen", "braintree"],
    "total_cases": 20,
    "case_ids": [
        "{}.{}".format(provider, case)
        for provider in ("stripe", "paypal", "adyen", "braintree")
        for case in ("full", "partial", "exceeds", "double")
    ] + [
        "ledger.one_reversing_row",
        "ledger.references_charge",
        "ledger.rolls_back_with_caller",
        "ledger.partial_amount_recorded",
    ],
    "repo": "repo",
    "heldout": "heldout/check_refunds.py",
    "references": {
        # The untouched tree has no refund at all, so every case must reach a
        # verdict and every verdict must be no. 20 executed, 0 passed.
        "base": {"overlay": None, "expect_verdict": "FAIL", "expect_passed": 0},
        "correct": {"overlay": "reference/correct", "expect_verdict": "PASS", "expect_passed": 20},
        # The negative control, and the reason it is a control rather than a
        # shrug: the RED set is predicted case by case in advance.
        "broken": {
            "overlay": "reference/broken",
            "expect_verdict": "FAIL",
            "expect_passed": 16,
            "expect_failed": [
                "paypal.double",
                "adyen.exceeds",
                "ledger.references_charge",
                "ledger.partial_amount_recorded",
            ],
        },
    },
}

with open("{}/manifest.json".format(out), "w") as handle:
    json.dump(manifest, handle, indent=2)
    handle.write("\n")
PY

echo "refund fixture written to $OUT"
echo "  repo/                16 files, 4 independent adapters, 1 shared ledger, smoke.py passes"
echo "  heldout/             check_refunds.py — 20 cases, never seeded into a run directory"
echo "  reference/correct/   overlay expected to score 20/20"
echo "  reference/broken/    negative control, expected 16/20 on 4 named cases"
echo "  manifest.json        the answer key"
echo
echo "prove the fixture can fail before trusting it:"
echo "  ./scripts/bench/grade-refunds.sh $OUT --self-test"
