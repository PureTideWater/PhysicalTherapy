# UX-DLR-10 verify

Started. Clone at /tmp/claude-0/-home-user-PhysicalTherapy/12cbf3a7-985c-52b3-adc0-b6d7ac05d769/scratchpad/verify-ux10 at 63aaa7f4.

## Checked so far
- letter.tsx:31-39 MESSAGES; :70-76 LetterError puts "Error: " + message (with "Procedure codes:" prefix) inside p#letter-codes-error; :156-158 hint repeats the rule. Confirmed.
- e2e spec:107-109 asserts the duplicated description verbatim; :128, :139 the contract/payer messages.
- Shots crops/letter-codes-1280.png and -390.png: two near-identical sentences stacked, "Error: Procedure codes: ..." two colons. Confirmed visually.
- Design D6 (lines 127-133) mandates these exact words; §6 R10 mandates "Error: " then the message inside the p. So it is design-conformant, not a build slip.
- ADR 0077 is not on this branch (ux-forms, unmerged). ux-forms D3 "message alone" = without "Error:" prefix; its §3.9 accepts a ZIP error identical to its hint (house tolerates repetition). Under-field messages in ux-forms carry no field name (name only in summary).
- Reachability: codes refusal only reachable when the native pattern is bypassed (typed/edited URL, shared link, novalidate). keptCodes drops a value outside [A-Za-z0-9\s,;]{1,400} or a token >10 chars -> field EMPTY but still marked.
- Proposed fix "A code here is not five letters or digits. Correct it..." is false/confusing in the dropped state (empty field) and for >400-char URL of valid codes.
- letter.test.tsx:160-163 tests the dropped state (codes 'Call 555-0100 ...' or repeated key -> no value, still aria-invalid): the reviewer's "A code here ... Correct it" would sit beside an empty field.
- Hint says "Five-character" (vague: "A-1.2" is five characters, refused); the route's rule is "five letters or digits" (letter.ts:18,28). An error naming that rule adds what the hint lacks.

## Verdict
REAL, nit (severity right). Better fix than the reviewer's for codes: "Each code must be five letters or digits." (after "Error: "; no name prefix, no example; true with the kept value or an empty field). Payer/contract: reviewer's words are fine ("Choose one of the payers listed." / "Choose one of this payer’s contracts, or None named."). Update letter.tsx:30-39 (comment + MESSAGES, codes becomes a string), letter.test.tsx:101-102,118,130, spec:107-109,128,139, design D6 words.
