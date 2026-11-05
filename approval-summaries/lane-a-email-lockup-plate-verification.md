# Verification: PR #129, co-001/email-lockup-plate (fix round)

Verifier S4 (Lane A's account), 2026-11-05 ~07:45 UTC.

## 1. Head and base (git ls-remote)
- Remote head `co-001/email-lockup-plate`: 231da9c4 (round 1). Local HEAD in /home/user/email-plate: 9dc0f976, which is
  3 commits ahead and NOT on the remote: 40eae422 (UX-S1/N4 plate PNGs), 01f67609 (docs, smoke item), 9dc0f976 (ADR 0081 rewrap).
- Base `claude/build-platform`: was 0f4a5ed5 at 07:27Z; at 07:45Z it is 23b25ad0. RE-MERGE NEEDED: new base 23b25ad096891f3add9d97d2c75077bdcb640de4.
- The fixer's full local suite (scripts/suite-full.sh, started 07:25:39Z at 9dc0f976) stopped after `lint` exited with
  ELIFECYCLE at 07:26:44Z; its row was never written and no suite process is running. The fix-round push has not happened
  (fix.progress.md: "full suite", "push", "description" unchecked). Polled ls-remote 07:27-07:44Z: unchanged.

## 2. CI on the remote head 231da9c4 (finished)
| Check | Conclusion |
| --- | --- |
| all green (required) | failure |
| mutation (required) | success |
| screening-capacity gate (required) | success |
| approval-of-record (required) | success (an earlier run cancelled) |
| unit | failure |
| e2e (1/2), e2e (2/2) | success |
| db (1/4) to db (4/4) | success |
| lint, static, build, images, domain model, capacity | success |
| changes (x2) | success |
| stryker (matrix), notify | skipped |

`unit` fails one test: packages/synth/src/fixtures.test.ts > the case registry > "holds every row of
docs/product/test-matrix.md, word for word, and nothing else". The PR changed SGN-13 in docs/product/test-matrix.md
(adds O-8's sentence) but not its word-for-word copy in packages/synth/src/cases/matrix.ts (line ~784). The local
fix commits do not touch matrix.ts, so the failure persists at 9dc0f976 too.

## 3. Description
- Footer exact ("🤖 Generated with [Claude Code](https://claude.com/claude-code)", blank line, session URL): yes.
- Claims: they describe round 1 (head 231da9c4) and are now false or stale: "every place that quotes the words follows"
  omits matrix.ts, which CI shows does not follow; the local checks table lists no `pnpm test` run (the full unit suite
  would have caught it); the UX-reviewer row says "Pending" though the review ran and its fixes (UX-S1, N1-N4) are local only;
  the plate's description (bgcolor-only table, "pixel for pixel as before", lockup art paths "unchanged") no longer matches
  40eae422, which adds email-plate PNGs and changes their paths.

VERDICT: NOT VERIFIED: (0) RE-MERGE NEEDED, base now 23b25ad0; (1) the 3 fix-round commits (to 9dc0f976) are not pushed and the fixer's suite died at lint;
(2) required check `all green` fails on the head because `unit` fails: SGN-13 in packages/synth/src/cases/matrix.ts
does not match docs/product/test-matrix.md word for word (not fixed locally either); (3) the description describes
round 1 and is stale on the plate, the checks and the review row (footer is exact).
