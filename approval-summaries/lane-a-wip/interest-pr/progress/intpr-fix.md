# intpr-fix (PR #126 fix round), started 2026-11-05
- start head c49367c5 (worktree /home/user/interest), origin/claude/build-platform 0f4a5ed5 (moved past f7d609cc)
- findings: LED-R1, LED-R2, LED-R3, UX-INT-1 (+ ADR D5 line-whole cap sentence). Refuted: UX-INT-2, UX-INT-3.
## Red (failing-first, uncommitted at first)
- synth: LED-23 named-original.835 (TRN SYNEFTLED23012) + later-l6-original.835 (SYNEFTLED23013), placed after renumbered-reversal (RNG order: no other file changes); LED-24 two-chains.835 (SYNEFTLED24013). synth --case LED-23/LED-24: only new files + expected.json.
- unit interest.test.ts: new take-back-first test: 1 failed, 58 passed (as predicted: B +267/+333 written instead of -240/-300).
- db interest.db.test.ts -t new: 3 failed (named-original, later-l6-original, two-chains), 1 passed (later-l6.835 control).
- db reconciliation-routes -t 2 interest tests: 2 failed (words: label + "in the Interest list above").
- e2e ledger-interest.spec.ts: REPORTED label/list + COUNTED_NOTE updated (red by construction; run in the suite).
## Commits (local, then WIP)
- red: 5859c722 (LED-R1 + the LED-R2 db test), 3d92d329 (LED-R2 synth + unit), 3d5cf8d1 (UX-INT-1)
- fix: 84534029 LED-R1 (interest-chains.ts: ATTRIBUTION_CLAIMS reads claim-matched claims; namedClaimIds = every claim of the named chain read), 6ca6b8c8 LED-R2 (interestWrites take-backs first), 9b46c740 UX-INT-1 (label + aria-label + gap-3 + note), a8b4a088 ADR 0084 D5 (LED-R1/R2/R3 + line-whole cap sentence), consequences + revisit.
- green: unit packages/ledger/src 15 files 295 passed; db interest.db.test.ts 26 passed; db reconciliation-routes 17 passed.
- WIP pushed: co-001/wip-interest-fix = a8b4a088 (pre-push: 7 commits, gitleaks clean).
- Not writable here (ops): design D5 / section 7 / risk 8 amendments -> open items for the session.
## Base merge
- origin/claude/build-platform 0f4a5ed5 (#125) merged into a8b4a088 -> 15f3359d, no conflict (test-matrix, matrix.ts, registry.ts, watched-paths auto-merged, both sides kept: 0 missing lines). Regen: install up to date; watched 577 no change; fresh tp_intpr_fix_1 (48 migrations) dm --out --strict: provenance only, 382 fn 0 written; synth --all 318 cases 0 written.
## Suite (once, on 15f3359d): scratchpad/intfix/suite.sh, logs scratchpad/intfix/logs/summary.txt
- started ~07:3x UTC in bg (nohup). Stryker: all 17 shards (affected.ts: stryker/shards.json is a global input), --concurrency 2.
- 07:3x SUITE RUN 1 STOPPED at unit (fast checks + dm checks had passed on 15f3359d; logs in scratchpad/intfix/logs-run1). Reason: the brief's confirmed list was truncated; the workflow's own skeptic transcripts (extracted to scratchpad/intfix/body/agent-outputs.json) show INT-REL-1 (blocking, e2e persona), INT-REL-2 (should-fix, interest pass at size), INT-REL-3 (nit, migration header lock order) CONFIRMED; UX-INT-2, UX-INT-3, UX-INT-4 refuted. Fixing INT-REL-1..3, then the suite once.
## INT-REL fixes (in progress)
- INT-REL-1: persona 'interest-manager' (synthetic-personas.ts) used by ledger-interest.spec.ts interestCase; evidence of red: CI job 127069715493 on c49367c5 (2 flaky LED-14/15 at helpers.ts:50).
- INT-REL-2: red = reconcile.large.db.test.ts extended with AMT I 0.50/correction + one unnamed PLB L6 per check (+ interest asserts); running red on old code (log intfix/large-red.log). Fix written (remittances.ts: InterestState lookups claimMatches/lineOrder/caseLines/entriesOf/chainOfMatch/latestOf, holdings only for take-backs; interest-chains.ts rows grouped by remittance/hash/chain). worker tsc rc 0.
- INT-REL-3: red = new packages/db/src/ledger-interest.db.test.ts (lock loop: no queue, no deadlock); fix = NOWAIT lock loop + header via marker route (script intfix/mig-patch.py). ADR 0084 D16 + At size consequence written.
- 08:3x INT-REL fixes committed: feb91645 (INT-REL-1), 5074ce3e red + f7e2c5de fix (INT-REL-2; CAS-42.3 red 171.2 s -> green 46.1 s), 37a2b994 red + 99579d0c fix (INT-REL-3, marker route, marker removed), 77653d10 ADR, 35e7762a dm regen (SHA f1b603ca...). WIP pushed 35e7762a. Base moved to 23b25ad0 (#127): merged -> 23369ae6, no conflict, regen provenance only. Full suite next on 23369ae6.
- SUITE RUN 2 on 23369ae6 (started 07:50:45): typecheck 23 projects pass 39.7 s; lint 1,850 files 0/0; lint:copy 589; lint:logs 1165; check:fixtures 372/4238; synth --all 320 cases 0 written; verify-content ok; actions:check ok; toolchain:check 0 errors 1 warning; dm --check exit 0, --strict exit 0, --require-approval exit 1 (blank line only), SHA f1b603ca24d3414d3524127e0eae134ecd5df1c67a528bcf2b88c44e94601ef7 line 7469; summary 15 changes, 2 function files. Unit running.
