# SEC-01 verify (skeptic)
Clone: scratchpad/verify-sec01/repo at 63aaa7f4
## Status
- started; reading code
- read download-refusal.ts (keptCodes 228-234: alphabet + token<=10, no PHI check; refusalLocation 104-108 adds textPhiFindings), letter.tsx:101 (page reads codes with keptCodes alone), phi-guard.ts SHAPES (phone sep [-. ] includes SPACE; date alt1 sep optional), letter.ts LETTER_CODES_PATTERN (browser blocks non-5-char tokens before send), ADR 0079:93-99,168-176.
- prelim: part (1) code does what is said (ADR:171 claim false for the page; D3 writer/reader differ). Harm: crafted link only, attacker-chosen value already in attacker's URL -> no new exposure. Part (2): only reachable by URL that already holds the value (browser pattern blocks 3/2/4 tokens); finding's "phone needs - . /" wrong: space caught.
- install running in background (verify-sec01/install.log)
- probe (real modules, vitest, output verify-sec01/probe-out.txt):
  - page (PayerLetter) shows 123456789, 19500115, '919 555 0100' as the codes value under refused=invalid; the 303 drops all three -> part (1) REAL (ADR 0079:171 false; D3 writer/reader differ). Reachable only by a crafted Coverage link (attacker-chosen value already in the attacker's URL): no new exposure.
  - 303 copies '123 45 6789', '919,555,0100', tab, NBSP, '01 15 1950' -> but LETTER_CODES_PATTERN refuses all of them in the browser (browserSends=false), so only a hand-built /letter URL that already holds the value reaches the route. urlPhiFindings passes these Locations too (guard heuristic, not this PR). Part (2): not a reachable defect.
  - '919 555 0100' (space) IS caught by the guard's phone shape: the finding's "need - . /" is wrong for phone.
  - proposed separator->'-' normalisation FALSE-POSITIVES on valid lists the route and browser accept: 'L1832, 0101T', 'G2061, 0106T', 'E1800, 0213T', 'L2000; 0512T' (date alt1). Reject that part of the fix.
- app logs no query string (handler/attribution); 2nd log is the ALB, acknowledged ADR 0079:175.
- VERDICT: real (part 1 only), should-fix; fix = textPhiFindings inside keptCodes, no normalisation; tests; ADR:171 then true.
