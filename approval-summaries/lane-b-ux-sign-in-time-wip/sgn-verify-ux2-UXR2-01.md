# UXR2-01 verify (done)
- Code b8654622: step-timer.tsx:80 closed cue fixed 'This step has closed.'; enroll/page.tsx:33-36 notes only in region. Confirmed.
- Shots: closed.1280/01 shows cue + live-looking key/link; region title at bottom edge, note below fold. closed.390/01 (390x844) shows the note's first words at the very bottom (finding slightly overstates "second tile"); on a real phone viewport (~660) it is below.
- Realistic: first-time enrolment, person leaves to install an authenticator app (>3 min), returns, scans key. Stale entry with same label -> later wrong-entry codes at mfa count toward the lock.
- Verdict: real, should-fix. Fix right in shape; but the proposed 52-char phrase (~370px at ~7.1px/char) wraps at both 1280 (350px content) and 390 (308px), so open state gains a blank line at BOTH widths. Use a one-line phrase: "This step and its setup key have closed." (~285px).
