# Skeptic 1 of 3, security finding S3 (pages.ts module comment omits network)

Clone: /home/user/sk-pcp-security-S3-0 at origin/co-001/wip-pages-child-process c369bc77... (read only, removed after).

## Reproduction
- pages.ts:22-24 says the child gets "Node's permission model (it reads its own code and writes, spawns and loads nothing)"; no mention of the network.
- ADR 0033 (lines ~119-120, ~161) records "Not bounded: the network" and that the reader's process can still open a connection.
- Node v24.22.0, a script under --permission with only --allow-fs-read of its own dir and env {}: process.permission.has('net') = false, yet net.connect to a 127.0.0.1 listener connected and the listener received the bytes (log: scratchpad pcp/sk-s3/logs/net.log).

## Verdict
Not refuted. Real, documentation-only, nit. Fix: append to the parenthetical, e.g. "...writes, spawns and loads nothing; it can still open a network connection, since Node 24 has no network permission: docs/adr/0033".
