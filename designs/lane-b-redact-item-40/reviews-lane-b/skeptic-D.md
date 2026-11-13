# Skeptic D: blank-rendering non-\p{C} characters inside a stored digits-only number

Verdict: PARTLY REPRODUCED. The leak is real on head e17c1192, but it is the same on base 17c234d2, so item 40 did not cause it. Part of the stated mechanism is wrong: U+1D159 is So, not Mn, and no \p{M} character leaks. The severity is a should, not a must.

Probe: $S/skeptic/D/probe.mts, my own script. Run it with `npx tsx` from <worktree>/packages/model-gateway. It takes the production path from denial-letter.ts prepare: redactLetterForScreen, then holdsIdentifier(text, patient, claims, checkWorkOf(redacted)).
The patient is built as JANE in redact.leaks.test.ts, with memberIds ['SYNMEMBER0042','76543210'] and claims SYNCLAIM0001 and C2026000417. The frame is `Member ID 7654<X>3210 was paid short.`

| X | head | base |
|---|---|---|
| (none), `.`, ` `, `-`,  , ​, ⁡, ́ | `Member ID [MEMBER_ID] ...` | same |
| `,` | sent in clear `7654,3210` | same |
| \u{1D159} (gc So) | sent in clear | same |
| ￼ (gc So) | sent in clear | same |
| \u0085 | REFUSED (item 40, R1-4) | sent in clear |
| \u0085\u{1D159}, \u{1D159}\u0085, \u0085￼, ￼\u0085 | sent in clear | sent in clear |

## Sweep: X is every code point in each class, results identical on head and base
| class | total | placeholder | sent, 8 digits recoverable (digits in order) | sent, digits changed by NFKC | refused |
|---|---|---|---|---|---|
| \p{M} | 2543 | 2543 | 0 | 0 | 0 |
| \p{So} | 7468 | 2 | 7386 | 80 | 0 |
| \p{Sk} | 125 | 33 | 92 | 0 | 0 |
| \p{Sm} | 960 | 9 | 951 | 0 | 0 |

Examples sent in clear: U+002B `+`, `=`, `<`, U+00A9, U+00B0, U+00D7, U+005E `^`, U+02C2 and others. Most of these are plainly visible, not blank. Raw output is in $S/skeptic/D/sweep-head.txt and $S/skeptic/D/sweep-base.txt.

## Reasoning
For a digits-only stored number, the reading joins digits only across white space, default-ignorables, marks and an enumerated list of joiners (ADR 0054 near line 300: `~`, middle dots, bullet, `;`, quotes, primes). Outside an identifier label, nothing else joins. The ADR states the comma's rule outright: "A comma between digits still joins nothing (an amount's grouping)." `7654,3210` is sent on both commits.
Every So, Sk or Sm character outside the joiner list therefore acts as a visible separator, exactly as the comma does. U+1D159 and U+FFFC get no special treatment for rendering blank. The same holds when \u0085 stands next to them: item 40's rule turns the \p{C} run into U+200B, and the symbol still separates the two halves.
So this is not a new class created by item 40, and it is not an item 40 regression. It is the existing, recorded handling of "a digits-only number split by a character that is not a joiner". The "another separator" closure (A-5) concerns numbers that the records hold with a separator. It does not cover digits-only numbers.
The only arguable new point is a narrow subset: characters that render as nothing or as a box, such as U+FFFC, which shows up when text is extracted from documents with embedded objects. These could join the way default-ignorables do. That is a should-level hardening item, not a must.

Corrected severity: should. The issue predates item 40 (same on base) and has the same mechanism as the recorded comma/visible-separator behaviour. A reader cannot miss a visible symbol in the middle of the number. U+FFFC is a plausible input, and on its own it might justify adding blank-rendering So characters to the joiners.
