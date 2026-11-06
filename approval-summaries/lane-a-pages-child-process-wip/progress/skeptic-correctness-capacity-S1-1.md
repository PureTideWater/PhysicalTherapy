# Skeptic 2 of 3: correctness-capacity S1 (reply bounds untested)
Clone: /home/user/sk-pcp-correctness-capacity-S1-1 at c369bc77… (origin/co-001/wip-pages-child-process), read only; removed after.
Status: done. Verdict: NOT refuted, severity should.

## Reproduction
- Added a scratch 'bigframe' behaviour to the clone's stub-reader.ts (page frame header claiming 0x40000000 bytes, then 1 MiB chunks) and a probe calling readInChild under PAGE_READ_LIMITS.
- As committed: rejected PageReadError "the page reader sent a malformed reply" in 120 ms, parent RSS 102 -> 105 MiB (/tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/pcp/logs/sk-s1-1-bigframe-committed.log).
- Bound set to Number.MAX_SAFE_INTEGER (both checks share `bound`): parent dies with uncaught ERR_STRING_TOO_LONG at pages.ts:410 (body.toString in onFrame), via FrameReader.push l.235 and the stdout handler l.442 (/tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/pcp/logs/sk-s1-1-bigframe-mutated.log).
- Same mutation: pages.test.ts 12 of 12 green (/tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/pcp/logs/sk-s1-1-mut-both.log). The flood case (1,005-byte frames, maxPages 5, 3,000 characters) is also caught by the parent's page/character re-check, so it does not pin either bound.
- Reachable in the threat model: the module treats the reader as a process a document may have compromised (MAX_READERS comment), so its reply is untrusted. A header under ~512 MiB would not throw but would allocate that much in the worker (Buffer.allocUnsafe(length)) against the task's 1,024 MiB.

## Fix
Stand-in case(s) for one frame past the bound: header length bound+1 and 0xFFFFFFFF; assert PageReadError 'the page reader sent a malformed reply', child gone (inItsOwnProcess), well within the deadline, parent RSS/heap delta small (for example under 32 MiB). No production change needed.
