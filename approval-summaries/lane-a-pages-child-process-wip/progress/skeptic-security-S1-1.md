# Skeptic 2 of 3, security finding S1 (pages-child-process)

- Clone: /home/user/sk-pcp-security-S1-1 at c369bc77... (origin/co-001/wip-pages-child-process), read only.
- Code read: pages.ts done/refused branches call stop() (clears deadline + poll); poll returns early once reply is set; settle only on 'close'; MAX_READERS = 1. Confirmed by reading.
- page-reader.ts: honest reader always process.exit(0) after its last frame; its own deadline+5 s and orphan backstops live in the child, so a compromised child skips them.
- Next: reproduce with a stand-in entry (done then hang; refused then hang; queued read).
- Reproduced (logs: scratchpad pcp/logs/sk2-S1-1.log), stand-in entry through readInChild, timeoutMs 2000, observed at 8 s:
  done-hang pending, child alive; refused-hang pending, child alive; done-grow pending, child RSS about 2.6 GB (2 s deadline and 256 MiB poll both off); a normal synthetic CSV read queued behind each pending. Control (normal) resolved at 117 ms, queued at 216 ms.
- Fix mutation (sk2-S1-1-fixmut.log): drop stop() from the done and refused branches and `reply !== undefined` from the poll guard: done-hang and refused-hang refused unsupported_document at about 2,015 ms, done-grow refused at 1,002 ms, queued read completed, no child left. Full suite not rerun here (skeptic 1 reported 37/37).
- Reachability: honest reader always exits 0 after its last frame; only a reader under a document's control (the threat the child process exists for; its own backstops run in the child) can hold. Latent but within the change's stated threat model.
- Verdict: not refuted. Severity blocking. Clone removed; worktree untouched.
