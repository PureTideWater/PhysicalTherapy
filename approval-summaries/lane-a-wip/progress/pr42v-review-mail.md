# PR 42 review (mail correctness, operations, capacity) at c37fa7cc (progress)
- Start 2026-10-27: no earlier run. Clone: scratchpad/pr42v/review-mail at c37fa7cc, pnpm install --frozen-lockfile exit 0.
- Read: original findings, integrator + 3 builder reports, pr42v-prepare.md (c37fa7cc = 6f23c42b + #76 merge + M3 follow-up; DM SHA 8ea57066).
## Leads (open/closed)
- CLOSED sound (code read): M1 parser (events.ts:180-196), M2 mapping (migration operator_record_mail_event), M8 (console window start), M9 (cutoff each run, before drain), M6 (failScreeningRun in tx), M7 (finishOrFail; pending = Medicare 'pending' rows only, fenced by attempt)
- OPEN: M3 flapping when no proof since resume/first activation (proved_at falls back to probe_sent_at which moves with each re-send -> MISSED logged once per 26h, alarm clears after 5 min; runbook 3.7 says stays raised)
- OPEN: runbook staging M1 COMPLAINT check says "in the console's undelivered list" but hand-sent messages are tagged tp_kind=probe and console_mail_undelivered excludes kind probe; no per-message log line (only 'mail events recorded' count)
- TODO: run db tests (mail, screening, mail-events, worker screening), unit (events, infra), probes; harness link race; e2e timing; web routes S4 precheck; users page complained; console page
## Findings so far
## Shots taken
- SHOT db1: 8 db files (packages/db mail+screening, worker mail-events/support-notices/screening/consumer, web mail-routes/screening routes) 203/203 pass at c37fa7cc (scratchpad/pr42v/review-mail-db1.log)
- SHOT probes (apps/worker/src/platform/zz-review-probe.db.test.ts in clone, temp): 4/4 pass = CONFIRMED:
  P1 after resume, probe lost: MISSED logged run 1 (probe re-sent), NOT run 2 -> alarm flaps (once per 26h, clears after 5 min)
  P2 first activation never back: same flap
  P3 after resume, delivered back, bounce never: same flap
  P4 runbook M1 COMPLAINT check: tp_kind=probe hand-sent on notices -> suppressed, but console_mail_undelivered lists nothing and no log line names it
- FINDINGS (draft): F1 should_fix M3 flap after resume/first activation (runbook 3.7 claim false; 26h silent closure after resume); F2 should_fix runbook M1/M2 staging checks name places that cannot show the result; F3 should_fix users page + runbook 3.4 'invite again' for suppressed invitation loops (M1 routes more to suppressed)
- SHOT unit1: 54 files 1101 tests pass (worker mail/platform/screening/digest, infra/test, tools/screening-capacity, web screening, db mail-address)
- CLOSED sound: e2e screening.spec outcome-stage fix (still asserts priced+engine+shares after complete), helpers restore (throws without kept key; prepare.ts clears dev-auth dir), mail-cutoff/screening fixture timeouts; harness untilComplete + addressCheckTimes/addressCheckProblems (validation stand-in = DB take + 2000ms timer, so >=2000); M5 in PR body (S4#2 47.7, O9); M10, M11 runbook text; event names vs AWS docs (awsdocs clone); AWS docs confirm Permanent/Suppressed counted, OASL not counted, account list entries remain until removed
- NITs drafted: F4 ADR 0065 (a) bound omits sweep main thread (finishOrFail completes, fails); F5 SendingPausedException for a disabled set unproven (SDK doc: account paused) while M6/M7 rely on it; no O11 check
- PR body (6f23c42b) M3 row says 'still pages about 2 h after readiness lapses' -> stale vs c37fa7cc (local; to update at push) - note only
- NEXT: maybe check deploy-window/previous image for screening_run_mail_refusal trigger rename; then StructuredOutput; cleanup clone + verify no tp_test_ dbs
