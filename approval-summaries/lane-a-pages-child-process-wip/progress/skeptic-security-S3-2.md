# Skeptic 3 of 3, security finding S3 (pages.ts module comment omits network)

Clone /home/user/sk-pcp-security-S3-2 at origin/co-001/wip-pages-child-process c369bc77... (removed after).

Reproduction (Node v24.22.0, env -i, readerArgv's flags: --max-old-space-size=192 --permission
--allow-fs-read=<script> --disallow-code-generation-from-strings): process.permission.has('net') printed false,
dns.lookup('localhost') resolved, net.connect to a 127.0.0.1 listener connected and the listener received the bytes.
`node --help` lists no --allow-net.

Code: pages.ts lines 22-24 say the child "reads its own code and writes, spawns and loads nothing"; nothing there
or in page-reader.ts's header says the network stays open. ADR 0033 (around line 161) records "Not bounded: the
network", so the risk is accepted and recorded; only the comment is incomplete.

Verdict: not refuted. Severity nit (a comment only; no behaviour change; the ADR holds the record).
Fix: after "(it reads its own code and writes, spawns and loads nothing)" add "; it can still open a network
connection, since Node 24 has no network permission (docs/adr/0033, Not bounded: the network)", and the same clause
in page-reader.ts's header after "Node's permission model".
