# Review A (PHI: what is sent)

Read `brief-common.md` beside this file first. Your folder: `/home/user/ops/designs/lane-b-redact-item-26/reviews/a/`.
Your report: `/home/user/ops/designs/lane-b-redact-item-26/reviews/review-a.md`.

Scope: the composition in `redactLetterForScreen` / `screenAsBothRead`, `screenAsFirstRead`, `holdsAsFirstRead`,
`holdsIdentifier`, `widerMatchesIn`, `redactionSpans`, and the stores (`inOneReading`, `formsOf` with `formsOfCheck`).

1. **A differential fuzzer over both files** (the main work): generate synthetic letters from pieces that stress the
   change (the patient's name whole, split by spaces, periods, tabs, line breaks, no-break and zero-width spaces, in
   lower and upper case, with initials; member IDs and claim numbers with and without stored separators, for patients
   whose stored numbers hold `/ . , + & * space`; Social Security and phone twins beside them, with labels, amounts and
   date ranges glued, so that held chains occur; CR LF, CR alone, LF CR and mixed line endings; look-alike letters).
   For each letter and each of several patients, on base and head: `r = redactLetterForScreen(...)`,
   `refused = holdsIdentifier(r.text, ...)`. Report every letter where (a) the base refuses and the head sends;
   (b) both send and a character the base replaced (by `redactionSpans` or by comparing the texts) stands as written
   in the head's text; (c) both send and a candidate of the base's is missing from the head's; (d) the head throws.
   Run tens of thousands of letters with at least two seeds.
2. **The path without the screen**: `redactLetter` and `redactionSpans` apply every wider match, whether or not the
   first reading's check refuses the letter. Find a letter where that makes `holdsIdentifier(redactLetter(...).text)`
   send what the base's `redactLetter` path refuses (a wider placeholder hiding what the base's check read). Say who
   calls `redactLetter` and `redactionSpans` outside tests (`grep -rn` under `/home/user/PhysicalTherapy/apps` and
   `/home/user/PhysicalTherapy/packages`, excluding tests).
3. **The stores**: can an answer stored during one reading (`viewsOfCheck`, `datesOfCheck`, `formsOfCheck`) differ from
   a fresh one? Look for a reader whose answer depends on something the key leaves out (the fold in effect, the subject),
   a reading that throws and leaves a store open for the next call, and a form list a reader could change. Show it by
   running the same call twice, or inside and outside a reading, and comparing.
4. **Forms of the three gaps the head still sends** (OTHER unless the base refused them): a name's pieces with white
   space or punctuation the wider rule does not join; a stored separator the class escape misreads (`]`, `\`, `^`, `-`,
   an astral character, a letter or digit of another script, white space); a CR beside other line endings; a stored
   number written with a different separator than the records hold.
