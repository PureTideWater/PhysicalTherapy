# Fix check K1, round 3 (security and PHI)

Head under check: 6f002b37… (co-001/wip-pages-child-process). Clone /home/user/fx-pcp-K1-3 (read only).
Logs: scratchpad/pcp/logs/fix/k1-3/

## Checks
- [ ] clone, fetch, checkout, install
  - done: head 6f002b37… = FETCH_HEAD, 34 commits over base 7fb3e102…; frozen install exit 0.
- [x] container facts: core_pattern `core` (relative, file), /bin/sh -> dash, running as uid 0 (so `/` is writable here: the no-core result rests on RLIMIT_CORE, not on cwd).
- [x] worker image: node:24-trixie-slim (dash at /bin/sh), USER node, WORKDIR /app root-owned; compute.ts sets ulimits core 0/0 on every container.
- [x] pages.test.ts twice: 26/26 each, the core crash test ran (no skip). Worker build exit 0; bundle.test.ts + infra heap/compute: 133/133. (logs pages-1, pages-2, build, bundle-infra)
- [x] no core file anywhere on / after the runs (find -xdev for core / core.N files: only two unrelated jsonschema package files).
- [x] as the image would run it (non-root, uid 65534 via setpriv; docker has no daemon here): control dumps a core in a writable dir; cwd `/` alone (ulimit unlimited) writes none; core-probe.ts as uid 65534 under `ulimit -c unlimited`: segv/abort/oom outcomes as expected, no core (nobody-cwd.log, nobody-probe.log).
- [x] own post-reply stand-ins through readInChild (untracked zz-adv.ts, removed; adv-after-reply.log), each followed by a queued SYNTHETIC CSV that read ok, no reader left (pgrep): done then close fd 1/2 and hang -> PageReadError at 1.47 s; done then SIGSTOP -> PageReadError 1.45 s; refused then a synchronous busy loop -> PageReadError 1.44 s; done then 8 MiB off-heap Buffers in a tight loop -> unsupported_document 0.65 s; done then a spawn attempt (denied) and hang -> PageReadError 1.44 s; done then slow growth -> unsupported_document 0.82 s; done then a 3-byte partial header and exit 0 -> pages (trailing partial frame accepted: nit).
- [x] argv/env/permission unchanged: readerArgv byte-identical to c369bc77…; node's argv/execArgv/env asserted by the inspect test (env []), the shell's argv is `-c`, the fixed script, `page-reader`, execPath, flags, entry. Bundle main.js carries the same shell script.
- [x] nothing logged from the child: stderr only tail-kept for V8's OOM line; errors name code/signal only; consoles silenced in the reader.
- [x] S2/S3/S4 wording: pages.ts LIVE comment and ADR 0033 "One at a time" state the synchronous-work orphan limit; module comment states the network; intake comment says child process.
- [x] no core file left on disk (/home/user, /tmp, /root: none over 100 KiB named core/core.N).
- residual: Fargate's acceptance of a `core` ulimit cannot be proved offline (the reader's own `ulimit -c 0` holds either way); after a decision nothing but `close` settles the read (only a grandchild holding the pipes could stall it, which the permission model denies).
- [x] clone removed.

## Verdict
Resolved. No blocking or should issue. Nits: trailing partial frame after the last frame is accepted; no backstop after a decision if `close` never comes; Fargate `core` ulimit acceptance unproved offline.
