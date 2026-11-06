# Security review: pages-child-process (WIP c369bc77…, base 7fb3e102…)

Reviewer: the security-reviewer checklist (.claude/agents/security-reviewer.md), applied to untrusted-input
process isolation. A fresh clone of origin/co-001/wip-pages-child-process was used and has been removed. Every
finding below comes from a probe I ran. Probe sources are kept in
/tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/rvsec/probes/ and logs in
/tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/pcp/logs/rv-sec-*.log.
All data used was synthetic. This review makes no HIPAA compliance claim.

## Verdict

One blocking finding (S1). Isolation at spawn is sound: the environment is empty, the argv carries only flags and
the entry, file reads, writes, spawns and threads are denied, eval is denied, and the bytes go over stdin. The gap
comes after spawn. Once the child has sent a `done` or `refused` frame, the parent stops enforcing the deadline and
the memory bound. A compromised reader can then hold the worker's only reader slot forever and grow without limit.

## Findings

### S1 (blocking): after its reply, the child is neither timed nor measured, and the parent waits for `close` forever

- **Where:** packages/contracts/src/evidence/pages.ts:343 (the poll skips when `reply !== undefined`), :418 and :421
  (`stop()` clears the deadline and the poll once a `done` or `refused` frame arrives). Settlement happens only on
  `close` (:458). Combined with `MAX_READERS = 1` (:247), every later read waits behind this one.
- **Scenario:** a reader compromised by a document is the threat this change defends against (the design says the
  parent "re-applies the caps the child should have applied, because the child is the part reading hostile bytes").
  Such a reader sends a valid `done` or `refused` frame and then does not exit. The parent never kills it and never
  settles. Intake in that worker process stops for good, and the child's growth is bounded only by the task's
  memory. Off-heap memory is not bounded by `--max-old-space-size`, so the task is OOM-killed, which is the outcome
  this change exists to prevent.
- **Evidence:** a stand-in entry (rv-adv.ts, started through `readInChild`'s `entry` argument with `timeoutMs`
  2000), from rv-sec-hang.log:
  - `refused-hang`: still pending at 8,018 ms, child alive.
  - `done-hang`: still pending at 8,014 ms, child alive.
  - `done-then-grow`: allocates 64 MiB every 50 ms after `done`. Still pending, child RSS 5,220,292 kB at 8 s.
  - Control case `sigterm-ignore` (never sends ready): refused `unsupported_document` at 2,023 ms, no child left.

  From rv-sec-slot.log: a normal synthetic CSV read queued behind `done-hang` was still pending at 8 s and completed
  only after I killed the hung child by hand.
- **Fix, proven by mutation** (rv-sec-fixmut.log, rv-sec-fixmut-probes.log): remove `stop()` from the done and
  refused branches, and remove `reply !== undefined` from the poll guard. The deadline and the memory bound then run
  until `close`, and `settle` still clears them. Results after the change:
  - all four stand-ins were refused `unsupported_document` within 2,021 ms (`done-then-grow` at 391 ms) with no
    child left;
  - the queued read completed;
  - packages/contracts/src/evidence passed 37 of 37, `pages.test.ts` included.

  A short post-reply grace timer (a SIGKILL that ends in `PageReadError`) would also work. In either version a reply
  is never returned in part. Add these stand-ins (`done-hang`, `refused-hang`, `done-then-grow`, and a read queued
  behind a hang) to `test-support/stub-reader.ts` and `pages.test.ts`.

### S2 (nit): the orphan backstops do not fire while the reader is in synchronous work, so a reader whose parent was SIGKILLed keeps running

- **Where:** page-reader.ts:505-515. The 1 s `ppid` check and the deadline-plus-5 s timer are both `unref`'d timers
  on the reader's own event loop. pages.ts:478 has `process.once('exit')`, which a parent SIGKILL never runs.
- **Evidence** (rv-sec-orphan.log): a 3,457-byte synthetic xlsx whose sheet holds 400,000 unclosed `<row>` makes
  the `elements()` regex (page-reader.ts:127) quadratic. I read it through `readDocumentPages` from a tsx parent and
  SIGKILLed the parent at 4 s. The reader was reparented to PID 1 at 99-100% CPU and was still alive 33 s later,
  past both backstops.
- **Why only a nit:** the design accepts this ("They run only when the loop is free … in the image the container's
  stop is the last one"). In production the worker command is `exec node …` (infra/lib/launch.ts:66), so node is the
  container's PID 1 and the task's end kills the reader. With the parent alive, the parent's SIGKILL at the deadline
  bounds the read. What remains:
  - On a developer machine or a CI runner, a crashed test or `pnpm dev` leaves a reader at 100% CPU.
  - Two statements overstate the guarantee: page-reader.ts:390, "a reader that outlived its parent … exits 3", and
    ADR 0033's amendment, "every running child is killed when the worker exits".

  Qualify both ("when its loop is free"; "when the worker exits normally"). Node exposes no
  `PR_SET_PDEATHSIG`, so the qualification is the fix. The quadratic regex is not new in this change;
  today the deadline bounds it.

### S3 (nit): pages.ts's module comment lists what the child cannot do but not that it can use the network

- **Where:** pages.ts:22-24, "it reads its own code and writes, spawns and loads nothing".
- **Evidence** (rv-sec-sandbox.log): a hostile script under `readerArgv`'s exact flags (bundle mode,
  `--allow-fs-read=<its own file>`) and `env: {}` on Node v24.22.0:
  - environment keys: `[]` (the parent's synthetic `FOO_SECRET` was absent);
  - reading `/proc/<ppid>/environ`, `/etc/passwd` and `/proc/<ppid>/fd/0`: ERR_ACCESS_DENIED;
  - file write, `child_process` and `worker_threads`: ERR_ACCESS_DENIED;
  - `eval`: EvalError;
  - a TCP connection to a 127.0.0.1 listener: CONNECTED, and the listener received the bytes;
  - DNS: resolved;
  - `process.permission.has('net')` returns false but is not enforced, and `node --help` lists no `--allow-net`.
- **Why only a nit:** ADR 0033's amendment already records this in "Not bounded: the network", with a trigger to
  revisit. The child holds no credential and no other document. Add one clause to the code comment so a reader of
  pages.ts does not take the list as complete.

### S4 (nit): apps/worker/src/intake/pages.ts:12-16 still says the document "is read in a bounded thread" and "A thread that fails"

The comment describes the old thread, not the child process. It is stale, but a security reader relies on it. The
fix is a one-line wording change.

## Checked and clean

- **Environment:** the child gets `env: {}`, typed as `NO_ENVIRONMENT`, so it has no AWS credentials, no
  `DATABASE_URL` and no `NODE_OPTIONS`. Proven by the probe above and by the branch's own test (pages.test.ts, which
  sets synthetic `AWS_*`, `DATABASE_URL` and `NODE_OPTIONS` in the parent). launch.ts exports the database URLs into
  node's environment, and none reaches the child.
- **Argv and file names:** the argv is the flags, `--allow-fs-read=<bundle path>` and the entry. The cwd is the
  entry's directory. Nothing of the document, the practice or the task appears in either, and no temp file is
  written. The bytes go over stdin, and no IPC channel is opened, so no `NODE_CHANNEL_FD`.
- **File system:** reads are limited to its own bundle in the image. In the source tree the whole workspace is
  readable, so a local `.env` there would be within reach in development only (dev-only; noted, not a finding).
- **Logs and errors:**
  - The child's stdout and stderr are pipes, never inherited.
  - stderr is kept only as a 1 KiB tail, used to match V8's fixed out-of-memory line, and never logged.
  - Each `PageReadError` message is a fixed string plus an exit code, a signal name or an errno code.
  - The diff adds no logger or console call.
  - A hostile reader cannot get text into the parent's log or a workflow command.
- **Reply bound:** `received > bound` refuses, and a frame header longer than the bound that remains fails. Page
  and character caps are re-applied per frame. A frame before the baseline is taken, or after the reply, fails.
  `done` must be 1 to 16 digits, and `refused` must be one of two exact strings. The heap number the child reports
  is used only by tests. The branch's flood, malformed-frame, exit-3, SIGSEGV and heap-exhaustion tests cover this.
- **Kill and refuse:** every decision path SIGKILLs, so a child that ignores SIGTERM cannot linger (the
  `sigterm-ignore` stand-in was refused at the deadline). Every overrun or timeout before the reply is refused
  `unsupported_document`, never a partial read. The gap after the reply is S1.
- **Zombies:** node reaps its own children. The worker's SIGTERM path (apps/worker/src/shutdown.ts) force-exits at
  45 s, which runs the `exit` handler that kills live readers.
- **Infra guard:** infra/test/heap.test.ts refuses any V8 heap flag in either spelling, in the command or in
  `NODE_OPTIONS`, on every worker-image container. `PAGE_READER_ISOLATION` is a constant, but the same file also
  measures the reader under the worker's real command plus `heapFlag('worker')`, so moving the reader back to a
  thread would fail there.
- **Tenancy:** there is no SQL, migration, policy or `packages/db` change. The reader sees one document's bytes and
  no practice scope, and the sealed write in intake is unchanged.
