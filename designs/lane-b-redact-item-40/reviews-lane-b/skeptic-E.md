# Skeptic E: uncounted check in refusedWithNumberCharactersAsOne

Verdict: PARTLY REPRODUCED. The mechanism is right; the example's reading, the severity and the "~2x" ceiling are not.

## Code (head e17c1192, packages/redact/src/redact.ts)
- At 3895-3903, `further.spent = counted` is set. Then `holdsIdentifier(again.text, patient, claims, counted)` runs as the last part of the return expression. Its work is never written back: plain `holdsIdentifier` has no `counted` out-parameter. So that check's work is missing from checkWorkOf. The ordering claim is CONFIRMED.
- The check starts at `counted` and refuses if it passes the budget, so each uncounted run is bounded by `budget - counted`. It never sends anything. It can only add a refusal.
- In redactLetterForScreen, the path runs twice for a letter that holds both kinds of character. The first run is redactLetterForScreenBesideNumberCharacters. The second is the same function again inside refusedWithUnseenCharactersJoined. So two checks go uncounted.
- Production path, denial-letter.ts:230-233: `redactLetterForScreen`, then `holdsIdentifier(text, ..., checkWorkOf(redacted))`. The probes use this path.

## Inputs and outputs
The patient and claims match redact.leaks.test.ts: JANE Q ZEPHYRA, SYNMEMBER0042 / ZZ7654321, and claims SYNCLAIM0001 / C2026000417. Each letter is `"½ \u0085 "` followed by n characters of repeated plain prose with no identifier.

| n | head checkWorkOf | head outcome | base checkWorkOf | base outcome |
|---|---|---|---|---|
| 80,000 | 330,908,014 | sent | 70,066,714 | sent |
| 89,687 | 370,848,744 | sent, 2.0-2.3 s wall | 78.3M | sent |
| 90,000 | 372,140,004 | REFUSED, text unmarked | 78,799,344 | sent |
| 100,000 | 413,363,184 | REFUSED, text unmarked | 87,529,824 | sent |
| 120,000 | 420,000,001 (past budget) | REFUSED, marked | 104,992,934 | sent |

Measuring the uncounted work: I searched for the smallest `spent` at which the exported holdsIdentifier refuses the as-one reading's text. At n=100,000 one check costs about 54.2M units, and at n=89,687 about 49M units (about 0.2 s). There are two of them, so about 98M units go uncounted. The real work at the worst sent row is therefore about 371M + 98M + 49M (the outer check) ≈ 518M units, or about 1.23x the budget. The 2x figure is a loose theoretical bound, not what was measured.

## Reasoning
The ordering bug is real. The inner holdsIdentifier's work never reaches checkWorkOf, and it happens twice when a letter holds both a number character and an unseen character. The claim's example does not show it, though. At n ≥ about 90k, head refuses even though checkWorkOf is below the budget (372M). That refusal comes from the outer, counted check: 372M plus about 49M of its own work passes 420M. That is ordinary fail-closed behaviour and has nothing to do with the uncounted work. Head refusing what base sends is a separate availability regression: the further readings spend about 4x base's counted work, and they are counted correctly. No outcome goes wrong in the unsafe direction. An uncounted check is still bounded by `budget - counted` and can only refuse, so no letter is sent that should be refused, and no identifier is shown in clear. The only harm is that the time cap is understated. The worst crafted row I found that is still sent takes 2.0-2.3 s of wall time, about 0.4 s of it in the two uncounted checks. Base takes about 0.25-0.33 s for the plain reading. This stays inside the reader's 3 s on this machine but uses the margin the budget was meant to guarantee. Corrected severity: low. It is a performance and accounting gap, not a leak, and base does not have it (base has no refusedWithNumberCharactersAsOne).

Scripts: $S/skeptic/E/probe.ts, sweep.ts, time.ts, run with `npx tsx` from $S/head/packages/model-gateway (sweep.ts also from base).
