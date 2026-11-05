# Skeptic S1-0 (security finding S1), done
- Clone at c369bc77 (co-001/wip-pages-child-process), removed after.
- Stand-in test-support/sk1-hang.ts (ready, drains stdin, sends done "123" or refused unsupported_document, then setInterval forever), driven by readInChild with timeoutMs 2000, plus a second read queued behind it.
- done-hang: pending at 8,024 ms, child alive, queued read pending. refused-hang: pending at 8,022 ms, child alive, queued pending. Control (no reply, hang): refused unsupported_document, queued settled. Log: scratchpad/pcp/logs/sk1-0-hang.log.
- Cause: pages.ts done/refused branches call stop() (clears deadline + poll); poll also skips on reply; only close settles; MAX_READERS 1 holds the slot. pg-boss expireInSeconds 3600 on intake fails the job but does not release the slot or kill the child.
- Reachable only from a reader the document compromised (page-reader.ts itself exits 0 after done, and its own backstops are in-child), which is this change's threat model.
- Verdict: not refuted; blocking. Fix: keep deadline and memory poll until close (drop stop() in the two branches and the reply guard in the poll; settle() clears both). Add done-hang, refused-hang, done-then-grow and queued-behind-hang tests.
