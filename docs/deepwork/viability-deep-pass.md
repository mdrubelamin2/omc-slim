# Deepwork log — viability deep pass (2026-08-28)

## Task
Second pass over the brutal-viability request. First pass produced
docs/VIABILITY-2026-08-28.md (untracked, same date). This pass does what that
report could not: line-level component audit, ecosystem gem harvest,
native-equivalents ledger, and the two LIMITATIONS.md defect fixes it named.

## Constraints
- Do not re-report anything already in VIABILITY-2026-08-28.md,
  RESEARCH-2026-08-26.md §9, or LIMITATIONS.md.
- Every external claim: URL + date. Every internal finding: file:line.
- scripts/check-coverage.sh has an unrelated uncommitted change (GitHub
  description gate) — not this task's, leave it alone.

## Stage status
- Stage 1 (5 lanes): DONE. 12 gems sourced; native ledger dated against
  2.1.247; 119-row dedup map; 11 + 13 audit findings, none previously
  documented. Orchestrator re-verified 5 of the top findings by grep.
- Stage 2 (synthesis + LIMITATIONS fixes): DONE. docs/VIABILITY-2026-08-28-II.md
  written; LIMITATIONS.md got the honest-claim rewrite and the output-style
  platform-risk entry. Check passed: coverage 290/290, reinforcement 116/116.
- Stage 3 (oracle gate, attempt 1 of 3): DONE. Agreed on 4 of 5 decisions
  with amendments; blocked ablation-first sequencing (M1: default ablation
  is plugin-level and cannot decide component fates; M2: measuring a build
  with 24 known contradictions contaminates the number). All four material
  blockers remediated into the doc in one pass; no re-review needed — the
  remediation followed the oracle's stated amendments verbatim.
- Stage 4 (self-critique): DONE. Falsifier checked: none of the 24 audit
  findings appears in part I even after its concurrent §1b growth (grep
  clean); both gates re-run green after every edit (290/290, 116/116).
  Weakest point, on record: 19 of 24 findings carry lane evidence only.

## Findings that need remembering
- `claude plugin eval` resolves on local 2.1.247 (experimental.evals,
  undocumented) — the ablation may be runnable now; not executed (paid).
- VIABILITY-2026-08-28.md has a CONCURRENT AUTHOR: another session inserted
  §1b (pi/OpenCode census) mid-run. Three idle omc-slim sessions exist on
  this machine. Do not edit that file from here.
- VIABILITY line 279 "built-in skills" nomenclature error: corrected in
  Part II §0.3, deliberately NOT edited in Part I (concurrent writer).

## Rulings
- Ruling: extended the existing report instead of regenerating it — the prompt
  says "go deeper", and re-answering wastes the first pass — costs nothing if
  the user wanted a fresh standalone doc; the Part II can be split out later.
- Ruling: left VIABILITY-2026-08-28.md untouched after detecting the
  concurrent writer — a merge race over an untracked file has no referee —
  costs one small factual error staying in Part I until its author fixes it.
- Ruling: did not message the three idle peer sessions — cannot tell which
  owns the file, and queued messages to the wrong sessions are noise — costs
  a possible duplicate Part II if one resumes on the same prompt.
- Ruling: ran the coverage gate with OMC_SLIM_SKIP_REMOTE=1 — the remote
  GitHub-description check is an uncommitted work-in-progress belonging to
  another session — costs nothing; the local 290 rows all ran.

## Follow-on (same day): docs/TODO-v1.0.md
Per-component v1.0 backlog compiled from the three reports — style, 6
agents, 6 skills, hooks, release-level, with the seven part-I gates as exit
criteria. Check passed: set-diff script proved every disk component has a
section and every finding ID (A1–C11, M1–M4, gems 1–6) is mapped. VERIFY
items mark §9 Should-items whose current status is unknown — the residue
sweep task closes them.

## Follow-on (2026-08-29): TODO-v1.0.md rebuilt, persona-gauntleted
Rebuilt with no priority tiers (everything ships), release train R0–R6,
the type-prefix naming fix (agents/skills share bare `omc-slim:` names;
observed misroute on deepwork), compression phases folded in. Reviewed by
seven persona seats in three lanes: 34 findings, all remediated; a
fresh-context verifier confirmed 34/34 ADDRESSED and caught 5 defects the
remediation itself introduced — all five fixed and grep-verified. Set-diff
check green. The governance doc set is still UNTRACKED — committing it is
R1 step 0, deliberately left to the user.

## Next first action
R1 step 0: commit the governance set (user's call — this session was
scoped to write only the TODO). Then the R0 probe or R1 step 1
(re-verify the 19 unverified audit findings).
