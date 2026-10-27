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
