# i126 body refresh (head d2fdd106)
- step 1: read current body (c49367c5 version, session 019i9...), saved to scratchpad/i126-body/body-before.md
- step 2: dm summary at d2fdd106 vs cc3dd7f6 rc 0 -> i126-body/dm-summary.md (65 lines, 5466 bytes)
- step 3: builder copied, D patched to i126-body/w; inputs: w/body/body-before.md, w/logs/dm-summary.log; next gen.py (checks.md, findings.md), then post.py
- step 4: gen.py + body-build.py ran (all builder asserts held): w/body/body-new.md 49,253 chars; next post.py for this round
- step 5: post.py -> body-final.md (see len/sha in later line)
- step 6: body-final.md 51,089 chars, sha256 25aa90c24ec4f32f5a9b504ca8a962690c9c64ddbd814e706fb8e1f46f9d6c81; checks: summary prefix, template order; next update_pull_request
- step 7: update_pull_request sent (ok); next read back
- DONE: PR #126 body updated for head d2fdd106 (update_pull_request), read back by gh api pulls/126: 51,089 chars (51,150 bytes), sha256 25aa90c24ec4f32f5a9b504ca8a962690c9c64ddbd814e706fb8e1f46f9d6c81, EQUAL to i126-body/body-final.md. Opens with the dm summary (d2fdd106 vs cc3dd7f6) whole; 8 template sections in order; grant word for word. No comment, review or approval line posted.
