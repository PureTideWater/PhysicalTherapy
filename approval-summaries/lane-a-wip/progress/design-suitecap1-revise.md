# design-suitecap1-revise progress
Started 2026-10-27. Design: /home/user/ops/designs/suite-cap-1-triage-locks.md (988 lines at start).
Backup of pre-revise design: scratchpad/progress/suite-cap-1.pre-revise.md (to make)
## Findings (status: pending/verified/taken/not taken)
- F1 heap concurrent large jobs: pending
- F2 memory trigger & headroom: pending
- F3 rollback previous image OOM: pending
- F4 deploy lock wait: pending
- F5 property test domain: pending
- F6 wallclock ratio test: pending
- F7 function files list: pending
- F8 cases page sentence: pending
- Also: claim row 186 -> 188 (checked list)
## Run 1 notes (2026-10-27 ~19:45)
- Own clone: scratchpad/designs/suitecap1-revise at e908c21, node_modules installed offline. #42 head now 6f23c42b (merge-base e908c21); #42 touches no worker triage/report/reconcile/heap/release-capacity file (only jobs/platform.ts) and no line_status/ledger/claim fn.
- F1 VERIFIED in code: practice loop worker.ts:224-225 (review said :236 = platform loop), workOptions batchSize 1 per JOB_TYPE (registry.ts:160-162; parse_835 x4), 12 types incl price, triage, audit_report, reconcile, export, packet_export in ONE process; worker desiredCount 1 (environments.ts:111); HEAP_MIB.worker 560. Harness chain runs A triage then report alone; concurrent phase = A price + B 20k report + C 4 parses. Precedent: era-export.large 4 parses x NORMALIZE_HEAP_MIB 128.
- F2 VERIFIED: G2 report heap peak 483/560, rss 872 (author notes); stand-in PDF (triage-world.ts:80) since default cache has no Chromium. BUT /opt/pw-browsers/chromium_headless_shell-1194 matches playwright-core 1.56.1 -> PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers gives real Chromium here. #49 run: peak 803.9 over run, 556.7 concurrent (capacity summary); status file attributes 804 to the price job ("price job fits ... peak 804").
- Report CSV order: payer, plan, DECRYPTED CCN, line_no, service_line_id (content.ts:620-627) -> SQL cannot order it; streaming CSV needs an in-memory sort index (or spill/order change).
- documents.write(cipher, key, AsyncIterable<Uint8Array>) streams (multipart).
