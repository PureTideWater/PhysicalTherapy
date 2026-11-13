# The forty-names sweep's clear rows, by class (`other-names.mts`; W75, 2026-11-13)

453,888 letters per tree (40 ordinary synthetic names; each part of four letters or more cut in two at every place by
a space, "/", "." or "-"; then ".", " " or ", "; then 1 to 4 of the name's own initials in four writings; three frames).
Refused 0 on every tree. In no row is the name so written, with no initials after it, left in clear.

| after the name | what is left | base 17c234d2 | stage 3 943be057 | head e17c1192 |
| --- | --- | --- | --- | --- |
| **the match ends in a letter standing alone, then "."** (ruling (A)'s form): every initial after it left | `MARI A.M` is `[PATIENT_NAME].M` | 30,336 | 30,336 | **0** |
| the same form, the LAST initial undotted before a word in lower case | `MARI A.M.L was seen` is `[PATIENT_NAME].[PATIENT_NAME].L was seen` | (in the row above) | (in the row above) | 5,056 |
| the match ends in a letter standing alone, then " " or ", ": the last initial undotted before a word in lower case | `MARI A, M.L was seen` | 10,112 | 10,112 | 10,112 |
| the match ends in a word, then " " or ", ": the last initial undotted before a word in lower case | `M ARIA, M.L was seen` | 40,320 | 40,320 | 40,320 |
| **the match ends in a word, then "." with no space**: every initial after it left | `M ARIA.M.L.` is `[PATIENT_NAME].M.L.` | 120,960 | 120,960 | 120,960 |
| all | | 201,728 | 201,728 | 176,448 |

- Stage 4 hides 25,280 letters and changes nothing else; the 5,056 it leaves of its own form are one initial each, the
  first reading's rule for an undotted letter before a word in lower case ("Vantree, I am"), the same after a taken
  initial on the base.
- The 55,488 rows of the "I am" rule and the 120,960 rows of a name that ends in a WORD with a period right after it
  are the same on all three trees: the first reading's rule that such a period ends a sentence ("Zephyra. I am"),
  which the ruling of 09:30 UTC keeps. They are not ruling (A)'s form and this stage does not touch them; both are
  put to the orchestrator as a question.
