# #126 fresh-clone verify at d2fdd1060c9b23e7e5bf5d2560db99f8a7826d46
Started 2026-11-07. Status: starting.
## CI
## Local
## Approval line
## Content checks
- CI snapshot (2026-11-07, all check runs completed; no polling needed): required (ruleset): all green, mutation, screening-capacity gate, approval-of-record.
  - all green FAILURE (128208284720); domain model FAILURE (128200141889); unit CANCELLED (128200142238, 22:48:17-23:08:38 = 20m21s)
  - success: approval-of-record x3, build, capacity x2, changes x2, db 1-4/4, e2e 1-2/2, images, lint, mutation, screening-capacity gate, static, 18 stryker shards, notify (one skipped, one success)
  - PR: base claude/build-platform cc3dd7f6, mergeable_state behind, body 53,566 chars
- next: read unit + dm logs; clone + install
- base moved: origin/claude/build-platform = 31a7345f (#130 merged 2026-11-06T22:55:12Z); NOT an ancestor of d2fdd106 (cc3dd7f6 is). PR mergeable_state "behind"; ruleset strict_required_status_checks_policy=true.
- domain model CI log (job 128200141889): --check OK (domain-model.md matches schema at 20261110090000; functions match 382 names); fails ONLY on approval: "approval names no person; the approval date is not a date (YYYY-MM-DD)"; SHA f1b603ca24d3414d3524127e0eae134ecd5df1c67a528bcf2b88c44e94601ef7. Summary: 15 changes.
- clone scratchpad/i126b-fv at d2fdd106; pnpm install --frozen-lockfile rc0
- LOCAL typecheck (clone, d2fdd106): rc0, 23 projects passed
- unit CI job 128200142238: cancelled at 20m (timeout) mid-run, 17 failures in 7 files before cancel: redact.property.test.ts (2, 62s/64s), denial-letter.test.ts (9: 1 property 9.2s + 8 "redacts ... in time linear" 3.8-5.7s), web tables.test.ts (1, 14.4s), tools/stryker/affected.test.ts (2, 8.7s/345s), worker packets/export.test.ts (1), packets verifier.test.ts (1, 6.4s), redact.test.ts (1). No error text (vitest prints errors only in final summary, never reached). Runner also logged "sha256sum: chrome-headless-shell-linux64/icudtl.dat: Input/output error" at 23:08:05. Logs: scratchpad/i126b-fv-logs/unit.clean.log
- unit history: base cc3dd7f6 success (9m38s); base 31a7345f success (10m03s, overlapping time 22:55-23:05); #126 prior head c49367c5 unit success (5m54s)
- unit cause: degraded runner. Every failing file ran ~4x slower than the same file on another runner (run 42319584132, 00:41): redact.property 369s vs 82s; denial-letter 75s vs 20s; tables 15s vs 4.3s; affected 451s vs 115s; export 26s vs 5.7s; verifier 52s vs 12.5s; redact 119s vs 27s. Failing tests are timing-bound (denial-letter "linear time" asserts < 3 s, took 3.8-5.7 s; property test 60 s timeout, took 62-65 s). Plus I/O error on runner disk. PR's 81 changed files (vs cc3dd7f6) touch none of the 7 files nor vitest.config. Other recent unit failures (4ffadf3f a1, f4fef908 a1: MOD-16 property; 231da9c4: synth registry) are different tests; base unit green on cc3dd7f6 and 31a7345f. Needs a re-run (not done: read-only).
- all green log: "not every job succeeded: unit cancelled, domain-model failure" (exactly two)
- next: local db tests (interest, chain, ledger-oracle, reconciliation-routes) on fresh db
- LOCAL db tests on fresh tp_i126b_fv_1 (48 migrations through 20261110090000): interest.db, packages/db ledger-interest.db, chain.db, chain.large.db, ledger-oracle.db, reconciliation-routes.db: 6 files, 68 tests passed, rc0, 37 s; db dropped
- step3 partial: approvers.json no diff vs origin/claude/build-platform (31a7345f) nor cc3dd7f6; no .allow-protected-edit in tree, never added in cc3dd7f6..d2fdd106; approval line 7469 at head = "Approved by: ________  Date: ________  Document SHA-256: `f1b603ca...`" (generator's blank form; base line 7459 Tyler Williams 2026-11-05 e024cf9f...)
- next: dm --check / --require-approval on fresh db; then regen functions
- LOCAL dm on fresh tp_i126b_fv_2 (dropped): migrate rc0; --check rc0 (md matches schema at 20261110090000; functions match 382 names; 100 tables, 1 view, 48 registered, 230 divergence rows (23 to approve), 0 explanation problems); --check --strict rc0 (same)
- --check --require-approval rc1: ONLY "approval names no person; the approval date is not a date (YYYY-MM-DD)"; expects SHA-256 f1b603ca24d3414d3524127e0eae134ecd5df1c67a528bcf2b88c44e94601ef7 on the approval line = line 7469 (last non-empty line of 7469; approvalLineOf). documentSha256 recomputed via approval.ts = f1b603ca... (file sha256sum ec03a018...). Current text line 7469: "Approved by: ________  Date: ________  Document SHA-256: `f1b603ca24d3414d3524127e0eae134ecd5df1c67a528bcf2b88c44e94601ef7`"
- next: regen functions (--out --strict) on fresh db; git status
- regen in clone on fresh tp_i126b_fv_3 (dropped): --out --strict rc0: 382 function files, 0 written, 0 removed; domain-model.md differs only in provenance line 5 (ignored by --check; comparable hash still f1b603ca...); restored -> git status clean
- merge-base(origin/claude/build-platform, head) = cc3dd7f6; 81 files changed; only "Approved by:" added line = domain-model.md blank generated line; no approvers.json/.claude/marker/.gitleaksignore file in diff
- next: PR body length + summary block vs fresh run
- PR body: 53,566 chars (53,628 bytes; sha256 ae78705b...) < 65,536. Summary block = body lines 1-65.
  - fresh run with origin/claude/build-platform at cc3dd7f6 (merge base; base when body written): byte-IDENTICAL (sha 976d3b8d...)
  - fresh run against current origin/claude/build-platform 31a7345f: differs only in line 3 (commit cc3dd7f6362e -> 31a7345fe07f) and line 60 (Compared: wording naming the merge base); same 15 changes, same 2 function files (ledger_entry_within_interest.sql +76/-0 added, ledger_match_rules.sql +15/-7)
- next: final CI re-check, remove clone
- final: head still d2fdd106, 0 check runs incomplete, base 31a7345f; clone removed; 0 tp_i126b% databases left; /home/user/interest untouched
- RESULT: passed=false (unit cancelled on a degraded runner -> all green red for unit + domain model; needs a CI re-run of unit). Everything else verified.
