# Review lane: Security

Opened from [`SKILL.md`](../SKILL.md) when the lane table triggers this lane, and
not otherwise. Every item is a *candidate*: nothing is reportable until it clears
the gates in `SKILL.md`.

---

## Security

Past the obvious (validate input, parameterise queries, do not log secrets):

- **Trust boundaries, listed:** requests, uploads, webhooks, third-party APIs, and **model output**. Anything a model produced is untrusted input. Never into `eval`, SQL, a shell, `innerHTML` or a file path, and never persisted without a shape and format check.
- **Prompt injection is assumed; permissions are enforced in code, not in the prompt.** Bound token, rate and recursion limits; keep secrets, cross-tenant data and system prompts out of the context window.
- **Authorisation defaults to deny.** The endpoint with no auth middleware, or the role a user can escalate into. The object reference that works by changing an id to someone else's.
- **Injection past SQL**: shell interpolation, template injection, path traversal, header injection. SSRF via a user- or model-supplied URL: allowlist the host, block private and reserved ranges.
- **Validation is an allowlist, not a denylist.**
- **Crypto misuse**: MD5 or SHA1 where security depends on it, or `Math.random` for a token. `==` on a secret or digest, a hardcoded key, an unsalted hash.
- **Escape hatches**: `dangerouslySetInnerHTML`, `v-html`, `html_safe`/`raw`, `mark_safe`, bare `innerHTML` on anything user- or model-controlled.
- **Deserialising untrusted data**: pickle, Marshal, unsafe YAML loads.
- **Leakage**: a secret in source or a log, or a credential in a URL. A stack trace or SQL string in an error response, a sensitive field the serialiser forgot.

Dependencies: **one dependency change at a time**, because a bulk bump that breaks the build loses which package did it. Read the changelog, not the version number: **semver is a promise the maintainer may not have kept.** Review the lockfile diff, commit it, never hand-edit it. Triage advisories by *reachability*; an advisory audit does not catch a newly malicious package. Every dependency is a liability: bytes, maintenance, and whether the existing stack already does it.
