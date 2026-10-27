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
- F3 VERIFIED: old whole-read report + lock fix -> heap OOM (probe E); D12/D13/D14/D16 need nothing from the migration -> TAKE: app-only PR first (SUITE-CAP-1a).
- F4 VERIFIED: no lock_timeout anywhere (grep), report prints PDF inside txn (generate.ts:85-90). Plan: NOWAIT retry loop (bounded) for LOCK line_status (and claim SHARE before index) -> never queues writers; fails deploy cleanly if no gap.
- F5 VERIFIED: line_status_ledger_rules 20261023120000:587-606; restrictive line_status_set_by_case_workers (20261027090000:278); line_status_reason_encrypted (:296). Plan: property over flagged..actionable as owner + ledger-backed deterministic sequence in apps/worker/src/reconcile (ledger-world).
- F6 VERIFIED BY PROBE (db tp_design_suitecap1rv_1, scripts probes/suitecap1rv/seed.sql f6.sql head-mig.sql): after VACUUM ANALYZE empty: OLD trigger 4,000 events -> line_status seq_scan +4000, 4000 advisory locks; NEW 40,000 -> seq_scan 0 on line_status and head, idx_scan head +40000; 10k 0.92 s, 40k 3.57 s.
- F7 VERIFIED: triage_never_deleted.sql/triage_no_truncate.sql list "Trigger function of:" callers.
- F8 VERIFIED+CORRECTED: re-triage read 33,332 waiting candidates (not 66,666): re-triage 20.5-25.3 s, candidates read+judged 20.6-23.7 s (author probe logs).
- Claim row: LANES.md line 188 (not 186).
- Interest design refers to "its D15" (claim_by_superseded): KEEP D1-D16 numbering; add D17+.
- PROBE (full 100k, 4 practices, real Chromium via PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers): own clone has author's G2 patches + PROBELIVE; test apps/worker/src/triage/probe-suitecap1rv.large.db.test.ts; runner probes/suitecap1rv/run-full.sh -> full.log (bg task bbgms36w3), db tp_design_suitecap1rv_3 (dropped by script). Smoke 2k OK: Chromium children PSS 145-179 MiB (6-7 procs).
- DB tp_design_suitecap1rv_1 still exists (F6) -> DROP at end.
## Dispositions decided (run 1, ~20:05)
- F1 TAKEN: report streams now (fold per batch; CSV rows in off-heap byte arena + sort index, ~108 B/line heap + 27 MiB arena at 100k by bench probe-arena.mts; plain string store 437 B/line; whole ReportLine 965 B/line); CSV written before the PDF so Chromium never overlaps the arena; lineDeadlines per batch; patient balance folded per case over batches (any/all); ledger read once. Triage's CandidateLine set the only O(lines) holder (measure in full probe). Harness: new phase "large jobs together" (A's 2nd report + D's 100k triage + E's 100k price + C's parses of a 2nd file set) under heapFlag('worker'); CAS-42 variant runs report+triage together in one child under 560. Semaphore rejected (latency, pg-boss expiry clock runs while waiting in-process, serializes small practices behind large).
- F2 TAKEN: heap measure = live heap after full collections (PerformanceObserver major GC -> used_heap_size), logged per job ('job heap', job_id, job_type, heap_live_peak_mib, heap_limit_mib); harness fails above 75% of limit (420 MiB); CAS-42 runs each 100k job alone under 420 flag; probes re-run with REAL Chromium (/opt/pw-browsers matches playwright-core 1.56.1 rev 1194); 8.3 states earlier probes used the stand-in. Prod alarm on the metric (monitoring.ts, #42 file -> PR b). fields.ts is a #42 file -> log line in PR b.
- F3 TAKEN: split. PR a = SUITE-CAP-1a bounded reads (D12, D13, D14 streaming, D16, per-batch deadlines, CAS-41), no migration, opens now, not in serial chain (branch co-001/suite-cap-1-bounded-reads). PR b = schema (lock, index, Q1 ledger, heap log line, harness, alarm, CAS-40, CAS-42). Rule: post-launch, PR a deployed in an earlier release than PR b. ADR 0083 written by PR a with "The split" (precedent ADR 0071), completed by PR b.
- F4 TAKEN (better than suggested): bounded NOWAIT retry loop for LOCK line_status SHARE ROW EXCLUSIVE (and LOCK claim SHARE before the index) -> never queues writers; 600 x 1 s; then fails deploy cleanly. Correct 4.7/12.
- F5 TAKEN: property over flagged..actionable (forward, person reopen, no-one reopen) as owner with practice scope & enc:v1 reasons; ledger-backed deterministic sequence in apps/worker/src/reconcile/stage-head.db.test.ts (ledger-world) for payer stages + no-one reopen after recoupment.
- F6 TAKEN: assert seq_scan delta 0 (probe-verified), ratio printed only.
- F7 TAKEN: add triage_never_deleted.sql + triage_no_truncate.sql to sections 9, 11.
- F8 TAKEN with correction: 33,332 waiting candidates (not 66,666), 20.6-23.7 s read+judge per load at 4 CPUs; web task 0.5 vCPU; ALB 180 s; proposed LANES "Handed to Lane A" entry text (storing waiting patterns = table = migration) for orchestrator.
- Row 186 -> 188.
- DRAFT written: scratchpad/progress/suite-cap-1.revised.md (placeholders @@T-...@@ await probe T numbers). Next: fill from full.log, verify claims (CHROMIUM_ON_CI db shards? fields.ts NUMERIC list; ledger-interest D12 ref), copy to ops.
- PROBE T partial (20:07): B triage 20k 10.9 s; A triage alone 52.4 s, heap peak 213, LIVE after judging 66,666 = 107 MiB; re-triage 33,332 live 84 MiB (=> ~720 B/candidate, baseline live ~61); A report alone (G2 code, real Chromium) 84.5 s, heap peak 419 (sampled), LIVE after gather 154 MiB, rss 861 (vitest), tree PSS 910 MiB, Chromium children 165 MiB in 6 procs, pdf 0.7 s. Waiting on TOGETHER.
- PROBE T DONE 20:09:52 (db _3 dropped by script): X triage alone 55.9 s heap peak 243; TOGETHER X report (G2 code) + Y triage under 560 with Chromium: BOTH COMPLETED 83.7 s, heap peak 483 sampled, rss 881 (vitest), tree PSS 919, Chromium 153 MiB. => F1's crash NOT reproduced at 100k (sum of sampled peaks double-counts garbage). Still TAKE streaming (margin, growth, Chromium coincides with held lines, measure) -- state honestly.
- NEXT: fill @@T-...@@ placeholders, copy to ops design path, drop tp_design_suitecap1rv_1, revert clone probe patches? (clone is scratch; leave), StructuredOutput.
- Probe N (lock loop) verified: third writer 0.09 s unqueued, lock on try 5. Draft final-proofing; next copy to ops.
## DONE (~20:30): revised design written to /home/user/ops/designs/suite-cap-1-triage-locks.md (1379 lines; section 16 "After the design review"). Pre-revise copy: scratchpad/progress/suite-cap-1.pre-revise.md. All probe DBs dropped (tp_design_suitecap1rv_1..3). /home/user/PhysicalTherapy untouched; nothing pushed or posted. Own clone keeps probe patches (scratch only).
