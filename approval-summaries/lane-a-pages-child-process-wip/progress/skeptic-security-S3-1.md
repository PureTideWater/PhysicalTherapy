# Skeptic 2 of 3, security finding S3 (pages.ts comment omits network)

Clone at origin/co-001/wip-pages-child-process c369bc77... (removed after).

Reproduction: Node v24.22.0, env -i, readerArgv's exact flags (--max-old-space-size=192, --max-semi-space-size,
--stack-size, --permission, --allow-fs-read=<entry only>, --disallow-code-generation-from-strings). A script
printed process.permission.has('net') false, resolved localhost by DNS, connected to a 127.0.0.1 listener, and the
listener received the bytes. node --help lists no --allow-net. Log: scratchpad/pcp/logs/sk-s3-1-net.log.

The comment (pages.ts:22-24) says "Node's permission model (it reads its own code and writes, spawns and loads
nothing)" and says nothing about the network; ADR 0033 records "Not bounded: the network" (line 161).

Verdict: not refuted. Real, nit (documentation only; the residual risk is already accepted in ADR 0033).
Fix: append to the parenthetical "; it can still open a network connection, which Node 24 cannot deny (docs/adr/0033)".
