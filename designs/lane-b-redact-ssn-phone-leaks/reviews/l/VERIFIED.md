# Reviews L, M and N (W13, 2026-11-11): scope, verification and resolution

All letters are synthetic twins. Reports: `REPORT.md` here (L), `../m/REPORT.md` (M), `../n/REPORT.md` (N). W13's own
checks and their outputs: `../../w13/` (`enum.mts`, `cand.mts`, `l-verify.mts`, `m-verify.mts`, `out/`).

## What each reviewed

| Round | Delta | Scope given |
| --- | --- | --- |
| L | 74c32149 to ac412151: one condition in `matchesIn` (a pattern's match is withheld only for a glued run that no match of the call's own covers whole) | Three lenses: what is now sent, what is now refused, logic and time. The places to attack were the settled branch of `appliedMatches`, a covering match of another kind or one not applied, other nested-identifier patients, and the screen's candidates |
| M | ac412151 to 247a53e3: the screen's second reading in `redactLetterForScreen` (L-1's fix, by the orchestrator's ruling of 17:23 UTC) | What is sent does not change; no candidate is lost; the screen is offered at least what the base offers; no own identifier offered; time |
| N | 247a53e3 to c9dddaa7: three lines, the second reading follows `merge`'s rule R6b (M-1's fix, by the ruling of 18:02 UTC, the last change to `redact.ts`) | The same five claims on those lines |

## Findings, each run by W13 on the trees before anything was changed

| Id | Verified | Resolution |
| --- | --- | --- |
| L-1 (major) | Yes (`l-verify.mts`): the base offers `5550123`, ac412151 sends the letter and does not. 74c32149 already did this for a patient with one identifier | Fixed in 247a53e3 (ruling: fix). `cand.mts`: 51,840 letters of the family, sent text identical, none lost, 1,152 planted numbers restored, none the base offers missing; 25,000 random letters, sent identical, none lost, every base-only digit run joined to an own identifier |
| L-2 (major, must stay, narrow) | Yes: both letters are refused on the head and sent by the base and by 74c32149; refused by 74c32149 too for a patient with one identifier | Recorded as the fix's cost in ADR 0054 (32 of 4,480 letters of the reviewer's family); the safer reading |
| L minor 1, 2 | Yes | The comment in `matchesIn` reworded; the copy removed (247a53e3), and why the filter runs first said (c9dddaa7) |
| L minor 3 | Yes | No change: the same characters are hidden |
| L minor 4 | Yes: `Fax X76543210 ext 12` is sent on cc3dd7f6, ef3e8d20 and the head | Already a recorded residual of ADR 0054's amendment of 2026-10-27 (a member ID or claim number of digits alone glued to a word); the orchestrator added it to Queues item 26 |
| L minor 5 | Yes | Recorded already (digit-for-letter pairs beyond the six) |
| M-1 (major) | Yes (`m-verify.mts`): 576 of 11,136 letters of the family; 74c32149 and ac412151 miss it too | Fixed in c9dddaa7 (ruling: fix). `m-verify.mts`: 0 misses over 21,504 letters, sent identical, nothing lost against 247a53e3 or ac412151, no own identifier newly offered |
| M minor 1 to 3 | Yes | Fixed in c9dddaa7 (the function's description, the comment, four pinned rows) |
| M minor 4 | Yes | No change: the whole number is offered through the match's compact forms |
| N | see `../n/REPORT.md` | see the status file |

## The battery and the gate on ac412151 (the last change to what is sent)

`../../w13/out/fuzz-all.out`: reproduction scripts 0 lines differ from 74c32149; every PHI fuzzer 0 flips but the
month-named patient's (ruling B), `SENT_WITHHELD` 0 and `SHOWS` 0 on seed 5923 and on the fresh seed 6131; the audit copy
`DEPART` 0 (87,456 letters); base flags 0 on every reviewer's generator; must-stay 72 of 12,000 and 359 of 20,000 as on
74c32149; the exhaustive property 0 of 44,352 (40 on 74c32149). The gate (`out/gate-*-report-at-ac412151.md`): no PHI
class against ef3e8d20 or cc3dd7f6, every class count equal to the run on 74c32149.
