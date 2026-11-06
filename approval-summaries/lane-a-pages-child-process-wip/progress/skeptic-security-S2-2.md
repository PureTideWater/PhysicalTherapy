# Skeptic 3 of 3: security finding S2 (orphan backstops)

Clone: /home/user/sk-pcp-security-S2-2 at c369bc77… (origin/co-001/wip-pages-child-process), pnpm install --frozen-lockfile --offline under the heavy lock. Removed afterwards.

## Reproduction
- Synthetic xlsx (4,322 bytes; a sheet with 400,000 unclosed `<row>`), read through readDocumentPages from a tsx parent. No document data from anywhere real.
- Run 1 (logs/sk-sec-S2-2-orphan.log): the parent was SIGKILLed 3 s into the read. The reader was reparented to PID 1 and was still at 99-100% CPU 38 s later, well past the 1 s ppid check.
- Run 2 (logs/sk-sec-S2-2-orphan-long.log): still alive at 123 s elapsed at 99.3% CPU, which is past the self-deadline too (deadlineMs 60 s + ORPHAN_GRACE_MS 5 s = 65 s). Both backstops are unref'd timers on a loop that never yields. I killed it by hand.
- Note: the finding says "past the 5 s grace". That backstop fires at deadline + 5 s (65 s), not at 5 s. Run 2 shows it is beaten as well.

## What the code says
- page-reader.ts:390, READER_EXIT: "a reader that outlived its parent or its deadline (3)". This states the guarantee without the condition.
- page-reader.ts serve() docstring (around :505): already says the backstops "run only when the loop is free", so this one is accurate.
- pages.ts:478, LIVE: "a worker stopping mid-read leaves none behind". This holds only when the worker exits normally, because process.once('exit') never runs on SIGKILL or on a default-handled signal.
- ADR 0033, line 154: "every running child is killed when the worker exits". Same overstatement.

## Reach in production
infra/lib/launch.ts execs the application, so worker node is the container's PID 1. If it dies, the kernel kills the rest of the PID namespace, the reader included. The orphan therefore only survives in development and CI. In normal operation the parent's 60 s SIGKILL bounds it.

## Verdict
Real (not refuted). Severity: nit (comments and ADR wording only; no production exposure).
Fix: qualify page-reader.ts:390 ("when its loop is free"), pages.ts:478 and the ADR 0033 line ("when the worker exits normally; if it is killed, the container's stop is the last bound because the worker is PID 1"). No code change.
