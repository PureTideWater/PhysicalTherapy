# UX-DLR-09 verify (done)

Clone: verify-ux09/repo at 63aaa7f4 (read only).

Checked
- letter.tsx:36 and :157 (new in this PR; base had no hint/error) wrap "97110, 97530" whole in Figure (share.tsx:14, font-mono tabular-nums), so the comma and space are Plex Mono cells.
- Shots: screens-after/png/p.coverage.default.1280.png, error-letter-codes 1280/390/dark (crops/letter-codes-*.png). Column ink profile of the hint line at 1280 (DPR 1): sans word gaps 4-5 px; the gap after the mono comma 11 px (plus 3 px before it). So it does read about as a double space beside the sentence face.
- No functional harm: LETTER_CODES_PATTERN (lib/contracts/letter.ts:39) and keptCodes accept any run of spaces/commas/semicolons; screen readers read the same text; copy/paste unchanged.
- Rule cites: brand.md:36 is met either way (codes are in mono now); ADR 0056:47-50 is "one type scale" (sizes), not "one type style per element". Stronger grounds: the page's own Figure convention (coverage/page.tsx:150, share.tsx:22: one Figure per figure, prose separators in the sentence face) and the design's R18 ("The codes 97110 and 97530 ... render in mono").
- Tests pin the current markup: letter.test.tsx:87 and :102 must change with the fix.

Verdict: real, nit (severity right). Fix: split into <Figure>97110</Figure>, <Figure>97530</Figure> at :36 and :157; update letter.test.tsx:87/:102; widen Figure's doc (share.tsx:13) to "A count, a share or a code"; no new alias needed. Placeholder (:146) stays, the field is mono throughout.
