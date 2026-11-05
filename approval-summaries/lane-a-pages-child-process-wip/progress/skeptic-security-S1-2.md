# Skeptic security S1 (3 of 3): verdict CONFIRMED, blocking

Clone /home/user/sk-pcp-security-S1-2 at c369bc77... (origin/co-001/wip-pages-child-process), read only, removed after.
Probe outside the repo (scratchpad pcp/sk-s1-2): stand-in entries passed through readInChild's `entry`, timeoutMs 2000,
PAGE_READ_LIMITS otherwise, a second read queued behind each (logs/sk-s1-2-repro.log, logs/sk-s1-2-fixmut.log).

Reproduction (unmodified pages.ts):
- done-hang: pending at 8 s, child alive; queued read pending.
- refused-hang: pending at 8 s, child alive; queued read pending.
- done-grow (off-heap Buffer.alloc after done): pending at 8 s, child RSS 2,613,744 kB, no kill; queued read pending.
- control (done then exit 0): resolved at 65 ms, queued read at 105 ms.

Cause: the done/refused branches of onFrame call stop() (clears deadline and poll), the poll skips once `reply` is set,
and the promise settles only on `close`; MAX_READERS = 1 so the slot is held. The reader's own orphan backstops are
in-child (a compromised child disables them).

Fix mutation (scratch copy: stop() removed from both branches, `reply !== undefined` removed from the poll guard):
done-hang and refused-hang refused at ~2,010 ms, done-grow refused at 912 ms by the memory poll, no child left, queued
read completed; control unchanged.

Verdict: real and reachable for any reader code a hostile document controls (the threat this change exists for).
Severity blocking. Fix: keep the memory poll and a deadline armed until close (settle() already clears them);
preferably on a reply replace the deadline with a short exit grace (min(remaining, ~2 s)) whose expiry SIGKILLs and
ends unsupported_document, so a late close never passes the document as read. Tests: done-hang, refused-hang,
done-then-grow, a read queued behind a hang, in stub-reader.ts and pages.test.ts.
