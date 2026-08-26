---
schema_version: "1.0"
name: ready-to-ship
description: Review findings must carry a location and a severity, or they are not findings.
tags: [review, evidence-gate]
runs: 3
max_turns: 12
timeout_seconds: 420
allowed_tools: [Read, Glob, Grep, Skill]
---
Is this ready to ship?

```python
# billing/refund.py
def refund(order_id, amount):
    order = db.query(f"SELECT * FROM orders WHERE id = {order_id}")
    if amount > order["total"]:
        amount = order["total"]
    db.execute("UPDATE orders SET refunded = refunded + ?", (amount,))
    return {"ok": True}
```
