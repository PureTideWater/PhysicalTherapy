# Queues item 40, stage 5b: the delta reviews of fix round 1, summary

Delta reviewed: `git diff 61600c7c ae0b6a3f` (fix round 1: S-2's charge, S-3's limits, S-4's joiners, S-1's pin).
Two adversarial reviews run as subagents of the stage-5b session, each probing both commits through the production
path (`redactLetterForScreen`, then `holdsIdentifier` with `checkWorkOf`): `review-1-leaks.md`, `review-2-cost.md`.
One skeptic re-tested each "should" with its own script (`skeptic-L1.md`, `skeptic-C1.md`). No blocker was raised.

| # | From | Sev. | Verdict | Finding | Resolution |
| --- | --- | --- | --- | --- | --- |
| C-1 | review 2 | should | **reproduced** (skeptic C1) | With the further reading's check now charged (S-2), a real-shaped claim letter with one footnote mark (`See note¹.`) and CR LF line endings is refused on cost from about 63,400 characters (61600c7c: about 96,500; LF 98,000 against 133,500; without the mark sent to about 129,000). The accounting is right; the charged check is one more whole check, and CR LF makes every check read the letter twice. | **Fix round 2 (1a7c5270):** recorded as S-1's family (the orchestrator's ruling on S-1); one row pinned at 64,000 (refused; without the mark, and at 62,000, sent); ADR 0054's cost 6 names the thresholds and Queues item 39 as the cure. No code line changed. |
| L-1 | review 1 | should | **reproduced, not caused by the delta** (skeptic L1) | U+FFFC or a number character inside an SSN, a phone number, the date of birth or the name is sent in clear (`9<U+FFFC>00-12-3456`, `03<U+FFFC>14<U+FFFC>1980`, `JANE Z<U+2180>EPHYRA`), on the base, 61600c7c and ae0b6a3f alike. A plain `X` or `#` does the same: the general gap of a visible character inside an identifier that no joiner list holds. The delta improves the stored-number rows (a stored SSN or phone written with U+FFFC is now replaced or refused). | **For the queue:** Queues item 42's scope (a visible non-joiner inside an identifier), to be widened from numbers to SSN, phone, date and name patterns; recorded, not this item's. |
| C-2 | review 2 | nit | on 61600c7c too | `redactionSpans` starts each stage's count at zero, so that entry can spend more than one budget in all. | Queue (no production caller relies on its count). |
| C-3 | review 2 | nit | — | The S-1 pin used prose only. | Closed by C-1's row. |
| N-1 | review 1 | nit | — | The comment and the ADR said "number characters NFKC leaves as it is"; the code adds every `\p{Nl}`/`\p{No}`. | Fixed in fix round 2 (wording only). |

Checked and sound (both reviews): no letter goes from refused to sent (20,332 differential letters, 4,672 classified:
84 more replaced, 1,248 newly refused, 0 newly sent; `redactLetter`, `redactionSpans` and `holdsNameOrNumber` only
add); the S-2 charge is counted once per text and capped past the budget; outcomes change only through cost; no regex
blow-up from the wider joiners (runs of 20,000 to 60,000 characters 0.06 to 0.8 s, all counted); the S-2 row's
bisection of the check's work is monotone and exact, and the row fails on 61600c7c for the stated reason.

No second fix round on code: the one surviving finding of this item's (C-1) is a cost of the ruled charge, recorded.
