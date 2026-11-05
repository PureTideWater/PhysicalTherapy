# Skeptic 1 of 3, security finding S2 (orphan backstops), pages-child-process

Commit read: c369bc77... (origin/co-001/wip-pages-child-process). The clone /home/user/sk-pcp-security-S2-0 was used read only and then removed.

## Reproduction (independent: no tsx parent, a bash parent instead)
- A synthetic xlsx built with python3 -I (the workbook, its rels, and sheet1 with 400,000 unclosed `<row>`), wrapped
  in the reader's request framing (deadlineMs 60000). It contains no text from any real document.
- The reader was run directly with readerArgv's exact flags, from the worktree's node_modules (read only), as the child of `bash -c`.
  The bash parent was SIGKILLed at 3 s.
- Log: scratchpad/pcp/logs/sk-sec-S2-0-orphan.log. The reader was reparented to PID 1 and ran at 99-100% CPU at
  9, 14, 24, 44 and 74 s elapsed. That is past the 1 s ppid check, the 5 s grace and also deadline+grace (65 s).
  Its only output was the ready frame. I killed it by hand.
- Mechanism: the two backstops are unref'd timers on the reader's loop. The `elements()` regex (lazy
  `[\s\S]*?` with no closing tag, for every `<row>`) is quadratic synchronous work, so the timers never run.

## Reachability
- In production a parent that is alive kills the reader on deadline or memory (pages.ts), so the gap needs the parent to die by SIGKILL or a V8 abort, and `process.once('exit')` does not run in either case.
- In production the worker container sets initProcessEnabled: true (infra/lib/constructs/compute.ts:457). So PID 1 is the init process and node is its exec'd child; the finding's claim that node is PID 1 is a little off. When node dies, the init process exits and the kernel kills the whole PID namespace, which takes the reader with it. The container stop is still the last bound.
- What remains: development and CI outside a container (the case I reproduced) can be left with an orphan using CPU.
  It holds no PHI and makes no I/O beyond its stdout pipe, and its heap is capped at 192.

## Already partly handled
- The serve() doc comment (page-reader.ts:505-508) already says the backstops "run only when the loop is free".
  These three statements still overstate:
  - page-reader.ts:390, the READER_EXIT comment
  - pages.ts:476, "a worker stopping mid-read leaves none behind"
  - ADR 0033 line 154, "every running child is killed when the worker exits"

## Verdict
Real (reproduced), with severity nit. The fix is to qualify those three statements: exit 3 happens only when the reader's loop is free; the children are killed when the worker exits normally; on a SIGKILL or abort, the container's end (its init process and the PID namespace) is the bound.
