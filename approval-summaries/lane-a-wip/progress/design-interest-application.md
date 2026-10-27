# design-interest-application progress
- clone: scratchpad/designs/interest-application at origin/claude/build-platform
## Read so far
## Findings
- Read: lane-b-pr15b-status.md (whole), LANES.md Handed to Lane A (line 271-276 item; claim row 187: ADR 0084, LED-23..25, synth module 6), lane-b-pr15b.md headings + 1.2 interest row (unchanged code; drops interest on zero-remaining lines, N6)
- #42 files list saved to progress/interest-app-42files.txt (188 files)
## Findings so far
- remittances.ts (base e908c21): reconcileRemittances :932-948 order = matchClaims, recoupReversals, providerAdjustments (:778-842; L6 -> recordInterest kind provider_adjustment, named = namedLines(approvedOnly=true) by reference hash == claim hash of standing approved claim match), claimInterest (:845-860; claim.interest_cents>0 for claims with standing approved match), recordInterest :863-910 (allocateByWeight over approvedRemaining; allocated = named.length>1; dedupe only everMatched(kind interest, evidence.id, line) -> per-evidence, so L6 id and claim id are different evidence -> both credited = THE DEFECT)
