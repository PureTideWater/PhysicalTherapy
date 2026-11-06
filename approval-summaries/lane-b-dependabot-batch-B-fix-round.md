# Lane B Dependabot batch, PR B (#94): fix round

Written 2026-11-04 by the acting Lane B session S4 (Lane A's account) from the status file's log and #94's description.
Not committed.

## Inputs
- Reviews (wf_91a35eba-252, done 2026-11-02T03:55Z): `lane-b-dependabot-batch-B-review-ci-infra.md` and
  `-B-review-security-supply.md` at head 484e9f06. 25 findings: 0 B, 7 S, 18 N; none refuted.
- Fix round: wf_66dd34d8-a6a (fixer, checker, full suite, push). Interrupted twice by the 5-hour window; base merged
  twice in it (fa910e5d of 877e662f, f43f809d of 88708069).

## Findings applied (all 25)
- S: O9 recorded (description, per the 01:02Z ruling); installed CLI honours the three settings (ed861798); `cdk.json`
  sets no `notices` key (bd18c996); `test:golden` reads scans through a real Textract client (e6781ee2); merge-time
  `@smithy/core` 3.38.1 step dropped under the pacing call (description).
- N: per-command rule, launcher list, source regex (e9ca3460); ADR 0012 amendment on a person's own deploy (af68f256);
  runbook Stripe entry (7533809b); runbook real-socket and bundle comparison (57ae053c); the rest description-only.
- The fix round's own check: S1 #97 in the text and S2 an unpushed commit cited (description); S3 spawning tests get 60 s
  (337b624c); N1 `aws-cdk` and newline (c6ec46d1); N2 telemetry sink observed (f463f486); N3 last page filled exactly
  (40243d14); N4 merge unsigned (recorded); N5 design references (design corrections).
- Commits 337b624c..f463f486 (337b624c, 40243d14, c6ec46d1, f463f486) on top of the fix commits bd18c996, ed861798,
  e6781ee2, e9ca3460, af68f256, 7533809b, 57ae053c.

## Suite
- Full local suite once at f463f486 (2026-11-02 08:03Z to 10:15Z, merge base 88708069): green (unit 7,027 passed 1
  skipped, golden 376, oracle 687, test:db 9,305 passed 1 skipped, build, stamp, cdk:diff, e2e 68, the six packets/pricing
  Stryker shards and the gate, synth, watched, actions, toolchain, licenses, actionlint, infra 612, synth comparison) apart
  from the no-Docker capacity form, which fails the same 10 checks on the base. Push stopped on BASE MOVED (#42, #95);
  WIP ref `co-001/wip-dependabot-batch-b` = f463f486.

## Merge prep (wf_4e12aa8e-264)
- ae7e656c merge of 2affb854 (#42, #95); e6823f5b B(6): #42's three `@aws-sdk` ranges to `^3.1160.0`, lockfile
  regenerated, synth comparison redone with #42's stacks; e3fc02e4 merge of 21fa10df (#91; runbook AWS paragraph keeps
  both). Targeted re-check at e3fc02e4 (description, "Checks"); pushed 2026-11-02T10:25Z. CI on e3fc02e4 green.

## Next
Fresh-clone verification (`lane-b-dependabot-batch-B-verification.md`), then ready, approval-of-record, merge
(expectedHeadSha e3fc02e4); close #99/#100 with a comment, comment on #88/#89.
