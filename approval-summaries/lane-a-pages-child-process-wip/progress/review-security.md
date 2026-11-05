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
