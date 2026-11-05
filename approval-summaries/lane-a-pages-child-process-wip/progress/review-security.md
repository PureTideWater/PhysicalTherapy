# Security review progress: pages-child-process (WIP c369bc77…)

Resumed 2026-11-05: clone /home/user/rv-pcp-security existed at c369bc77… with untracked probes
(rv-adv.ts, rv-sigterm-ignore, rv-refused-hang, rv-done-then-grow, rv-orphan) from an interrupted run;
no progress file existed. Re-running each probe and recording results here.

## Checked
(in progress)

## Findings
(in progress)
- Read pages.ts and page-reader.ts in full. Leads: after a done/refused frame the parent's stop() clears the
  deadline and the memory poll and then waits for `close` forever; orphan backstops are unref'd timers that a
  synchronous parse blocks; Node 24's permission model does not restrict the network.
- PROBE rv-sec-probes.test.ts (stand-in entry rv-adv.ts via readInChild's entry arg, timeoutMs 2000), log
  pcp/logs/rv-sec-hang.log:
  - sigterm-ignore (never ready, ignores SIGTERM): refused unsupported_document at 2023 ms, no child left. OK.
  - refused-hang (refused frame, then stays alive): STILL PENDING at 8018 ms, child alive. FINDING S1.
  - done-hang (page + done, then stays alive): STILL PENDING at 8014 ms, child alive. FINDING S1.
  - done-then-grow (done, then 64 MiB/50 ms off-heap): STILL PENDING, child RSS 5,220,292 kB at 8 s. FINDING S1.
- PROBE orphan (pcp/logs/rv-sec-orphan.log): synthetic workbook, sheet of 400,000 unclosed `<row>` (3,457-byte
  xlsx; quadratic `elements()` regex), read through readDocumentPages from a tsx parent; parent SIGKILLed at 4 s.
  Reader reparented to PID 1, 99-100% CPU, still alive 33 s later (its 1 s ppid check and deadline+5 s timer are
  unref'd timers a synchronous regex never yields to). FINDING S2. Mitigation in production: the worker command is
  `exec node ...` (launch.ts), node is the container's PID 1, so the task's end kills the reader; dev/CI not so.
- PROBE sandbox (pcp/logs/rv-sec-sandbox.log): a hostile script under readerArgv's exact flags (bundle mode,
  --allow-fs-read=<its file>), env {}, Node v24.22.0. Env keys [] (parent's FOO_SECRET absent); argv only flags +
  entry; /proc/<ppid>/environ, /etc/passwd, /proc/<ppid>/fd/0 read: ERR_ACCESS_DENIED; write, child_process,
  worker_threads: ERR_ACCESS_DENIED; eval: EvalError. BUT TCP connect to a 127.0.0.1 listener: CONNECTED (listener
  got "exfil-probe"); DNS lookup resolves; process.permission.has('net') false yet not enforced; node --help has no
  --allow-net. FINDING S3 (network unrestricted, undocumented).
- PROBE slot (pcp/logs/rv-sec-slot.log): a normal synthetic CSV read queued behind a done-hang child stays
  STILL PENDING at 8 s; it completes only after the hung child is killed by hand. Part of S1 (intake stops).
- FIX MUTATION for S1 (pcp/logs/rv-sec-fixmut.log, rv-sec-fixmut-probes.log): in pages.ts drop `stop()` from the
  done and refused branches and `reply !== undefined` from the poll guard (deadline and memory bound run until
  `close`). All 4 hostile stand-ins then refused unsupported_document in <= 2,021 ms (done-then-grow at 391 ms) with
  no child left, the queued read completes, and packages/contracts/src/evidence (37 tests incl. pages.test.ts)
  passes. Restored afterwards (git diff empty).
- ADR 0033 amendment documents the open network ("Not bounded: the network"), so S3 is a nit (code comment only).
- Checked clean: env/argv/cwd/stdin, fs/spawn/worker/eval denial, stderr never logged, PageReadError messages,
  reply bound, SIGKILL on every decision, shutdown force-exit, infra guard + measurement, tenancy (no db change).

## Findings (final)
- S1 blocking: post-reply window, no deadline/memory bound, slot held forever (pages.ts:343/418/421/458).
- S2 nit: orphan backstops blocked by sync parse; comments overstate (page-reader.ts:390, ADR 0033 amendment).
- S3 nit: pages.ts:22-24 comment omits open network (ADR records it).
- S4 nit: apps/worker/src/intake/pages.ts:12-16 still says "thread".

## Done
Review written to /home/user/ops/approval-summaries/lane-a-pages-child-process-review-security.md; clone removed;
probe sources kept in scratchpad/rvsec/probes/.
