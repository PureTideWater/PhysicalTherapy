# Review 2: cost and regressions (Queues item 40, head e17c1192 against base 17c234d2)

Synthetic data only. Probes are in <scratch>/probe2/
(corpus.ts, run.mts, cmp.mts, budget.mts, patho.mts, last.mts; outputs cmp.txt, newref.txt, budget.txt, patho.txt, last.txt).
"Gateway path" means what denial-letter.ts `prepare` does: redactLetterForScreen, then holdsIdentifier with checkWorkOf.
Every row was also run through the public redactLetter + holdsIdentifier ("public path").

## Verdict

Nothing the base refuses is sent by the head, and the head sends no text that differs from what the base sends.
I found no blocker. There are two "should" findings, both about cost: one is the work count, the other is letters
refused only because of the work budget. There are also three nits. No finding puts an identifier in clear.

## Findings

### S-1 (should): the further reading's own check is not on the count, so checkWorkOf under-reports
- **Where.** `refusedWithNumberCharactersAsOne` sets `further.spent = counted` and then runs
  `holdsIdentifier(again.text, patient, claims, counted)`. That check's work never reaches `further.spent`. It runs
  inside `redactLetterForScreenBesideNumberCharacters`, so it also runs again inside the R1-4 reading
  (`refusedWithUnseenCharactersJoined`). The doc comments say "charged in full", and they are wrong.
- **Effect.** It is safe: the uncharged check starts from `counted` and returns true (refuse) at the budget, so the
  outcome is still a refusal. But the count is no longer a bound on the work done. On a letter that has both a number
  character and an unseen character, up to two full checks (each at most budget minus the count so far) run without
  being counted. So the real wall-time bound is about twice the budget, not the budget.
- **Input** (refused with a count under the budget and no identifier in it), gateway path, patient JANE Q VANTREE,
  member ZZ1234567, claim SYN555001:
  `"½ \u0085 " + "The claim was reviewed and paid in full by the plan. ".repeat(1885)` (100,000 characters).
  - head: REFUSED. The text is the mark, and `checkWorkOf` = 372,375,440, which is under the 420,000,000 budget.
    Redaction took 1,951 ms.
  - base: sent unchanged. `checkWorkOf` = 91,595,076; 307 + 335 ms.
  - The same prose at 30k characters is sent by both, so the refusal comes from the budget, not from an identifier.
  - Also `"²\u0085".repeat(25000)`: head REFUSED with a count of 374,265,080 (1,936 ms); base sent it.
- **Should be.** Charge that check: write its count to `further.spent`, as `holdsIdentifierCounted` does for R1-4.
  Then checkWorkOf is the real work and the bound in the comments holds. The outcome would not change.

### S-2 (should): a long ordinary letter with one number character and one unseen character is refused by the budget
- With both kinds of character present, the head reads a letter about 4 to 5 times over:
  - the letter as given
  - the as-one reading
  - the joined reading
  - the joined as-one reading
  - the checks

  Each pass is charged, except the check in S-1. Prose costs about 916 units per character on the base. On the head
  with `½` and `\u0085` it costs 130,797,088 for 29,684 characters, against the base's 27,510,620 (4.75 times).
  A prose letter is therefore refused somewhere between about 30k and 100k characters. That is below the 100k the
  check otherwise allows, and the letter holds no identifier.
- **Input:** as in S-1 (100k prose with `½ \u0085 ` in front). Head: REFUSED. Base: sent unchanged. Should be:
  sent unchanged.
- Measured costs:

  | Letter (gateway path) | Head count | Base count | Head outcome | Base outcome |
  |---|---|---|---|---|
  | 100k prose + `½` only | 183,188,806 | 91,594,844 | sent | sent |
  | 100k prose + `\u0085` only | 242,411,756 | 91,590,792 | sent | sent |
  | 100k prose + `` (private-use bullet, common in PDF text) | 242,411,756 | 91,590,792 | sent | sent |
  | `"5\n"` × 28,378 (the largest the base sends: 204,178,596) + one `\u0085` or one `` | past budget | 204,179,888 | REFUSED | sent |
  | `"5\n"` at 40%, 50%, 70% and 90% of that + `½ \u0085` | — | 81.7M to 183.8M | REFUSED | sent |

- Real denial letters are a few thousand characters, so this is a cost at the edge of the limit, not in the
  ordinary case. With S-1 fixed, the count would be honest, but the 4 to 5 times multiplier remains.
- **Should be one of these:**
  - lower the documented maximum letter length for letters that hold these characters, or
  - skip the as-one reading inside the joined reading when the joining changed no number character's neighbourhood.

  If neither is done, record the reduced maximum as an accepted cost.

### N-1 (nit; accepted by ruling 3, listed as a real-shaped cost): a footnote marker on a phone number, which no record holds, now refuses the letter
- `"Questions: call 1-800-321-4567¹."`: head REFUSED. Base sent `"Questions: call 1-800-321-45671."`.
  - The base leaves a phone-shaped number in clear, NFKC-lengthened. The head is the safer of the two.
  - Better would be `"Questions: call [PHONE]1."` or similar (redact, then send). Here a refusal stands where a
    redaction would do.
- The same applies to `"1-800-555-0100¹"`, `"½"`, `"²"`, `"³"`, `"¾"`, `"①"` and
  `"Ⅱ"` right after a phone number (7 corpus rows).
- With a space before it (`"Call 1-800-555-0100 ¹"`), both send `"Call [PHONE] 1"`.

### N-2 (nit): the public redactLetter is about 7 times slower on these letters and has no budget gate
- `redactionSpans` runs the R1-3 and R1-4 readings each from a count of 0, so each gets a budget of its own.
- Measured on the public path:

  | Letter | Head | Base |
  |---|---|---|
  | 100k prose + `½ \u0085` | 2,114 ms | 295 ms |
  | `"5\n"` × 28,378 + `½ \u0085` | 2,593 ms | 575 ms |
  | `"²\u0085"` × 25,000 | 2,407 ms | 351 ms |

- No production code calls redactLetter or redactionSpans (grep over apps, packages and scripts finds only redact.ts
  and the tests), so this is a nit.

### N-3 (nit): doc wording
- In `redactLetterForScreen` and `refusedWithNumberCharactersAsOne`, "charged in full" and "one budget still holds
  for the whole check" are not true until S-1 is fixed.

## What held

### 1. Base refuses, head sends
- **0 of 14,394 outcomes**: 7,197 letters, each on two paths. The 7,197 letters were:
  - fuzzLetters(40, 2500) as written: 2,500;
  - the same 2,500 letters, each with one of 29 special characters at a random place;
  - 9 real-shaped letters × 29 characters at the start, middle and end, and before, after or one space after each
    identifier, Roman numeral, amount, code and phone number;
  - 13 footnote, bullet and tab forms.

  Outcomes:

  | Outcome | Gateway path | Public path |
  |---|---|---|
  | both sent, identical | 6,108 | 6,108 |
  | both refused | 822 | 822 |
  | base sent, head refused | 267 | 267 |
  | base refused, head sent | 0 | 0 |
  | both sent, different text | 0 | 0 |

### 2. The further reading's charge
- The R1-3 and R1-4 readings run on the letter's one count (`from`, `further.spent`), with one exception: the check
  in S-1.
- Over the budget, the head always refuses. It returns the bare mark or the marked text, and the gateway check
  refuses it (every crafted row near or over the budget above).
- No path ran past the budget and sent anything.
- Wall time stayed bounded:
  - gateway path: at most 2,222 ms of redaction plus 0 ms of check, against a base of 1.1 + 1.0 s for the same rows;
  - public path: at most 2.6 s.

### 3. Time
- Over the corpus: head 64.6 s against base 38.2 s in total (1.7 times). The slowest letter took 218 ms on the head
  and 219 ms on the base.
- New regexes:
  - `UNSEEN_CHARACTER(S)`: a negative lookahead on one character, then `\p{C}`, in a `+` run.
  - `PLACEHOLDER_BESIDE_ONE_NUMBER_CHARACTER`: the mark class `[...]*` is disjoint from `ↀ` and `[`.
  - `NUMBER_CHARACTER(S)`.
  - the widened lookbehind and lookahead in `digitsGluedToLetter` (one character).
  - `endsInLetterAlone`.

  None nests a quantifier or has overlapping alternatives.
- Pathological runs of each regex, for 50k to 100k characters, took 0 to 7 ms on the head, against 0 to 5 ms on the
  base.
- Whole-letter pathological inputs (patho.txt) all finished under 2 s on the gateway path:
  - 50k of `\u0085`, `\u0085x`, `½`, `ↀ`, `` and `؀1`;
  - `ↀ` followed by 50k `​`;
  - placeholders followed by 200 combining marks, × 240;
  - literal `[MEMBER_ID]½` × 8,000;
  - digits glued to `²` and to `Ⅱ`;
  - initial chains after a name (ruling (A)).
- Ruling (A)'s chains cost the same on head and base: 545 against 535 ms, and 446 against 401 ms.
- holdsNameOrNumber (now up to 4 readings) took at most 263 ms on the head, against 233 ms on the base.

### 4. Real-shaped letters newly refused
- Every newly refused real-shaped row has the character right against an identifier:
  - `Ⅱ` against the name or a claim number, e.g. `"Claim: C2026000417Ⅱ"`. The base sent `"[CLAIM_2]II"`.
  - `\u0085`, `\u0007`, `\u001F`, `؀` or `` between two words of the name, e.g.
    `"Jane Q. Zephyra"`. The base sent `"[PATIENT_NAME]. [PATIENT_NAME]"`.
  - phone numbers with a footnote (N-1).
- Not changed: `"Part II"`/`"Part Ⅱ"`, `"½ unit"`, `"²"`/`"¹"` footnotes away from an
  identifier, `"№"`, bullets, soft hyphens, ZWJ emoji, Arabic and Hebrew with `‏`/`؜`, tabs, and
  ` `/` `. Each was sent identically at the start, middle and end of each letter, and one space away from
  each identifier. One example: `"See section 4¹ and claim SYNCLAIM0001 ²."` is sent the same by both.
- The 68 unmodified fuzz letters that are newly refused all hold an unseen separator (`\u0085` or `\u0004`) inside or
  beside a piece of an identifier. That is the R1-4 design.

### 5. Damage to ordinary letters
- No letter in the corpus is sent with different text.
- Ruling (A) on ordinary sentences gives the same output on head and base:
  - `"Zephyra, Jane Q. A review found no error."`
  - `"Zephyra Q. Jones wrote back."`
  - `"Ann A. A claim was denied."` for ANNA SMITH
  - `"Smith, Ann A. A. Lee reviewed it."`
  - `"Vantree Q.I."`
