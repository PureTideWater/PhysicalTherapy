# UX PR 4b review progress (PR #131, head c2725961, base 31a7345f)
Started 2026-11-07 (fresh; no earlier 4b-review.md). Read-only review.
## Checks
- [x] read agent def, plan, build, check, shots notes
- [x] (run 2) re-read agent def, plan/build/check/shots notes, PR body (head now 03ec41f5: only "#121"->"PR 121" in a comment + 2 test titles), design 3, 7, 10-12
- [x] diff read: anomalies.tsx, labels.ts, labels.test.ts, result-summary.tsx comment
- [x] Lane A cond 1: VERSIONS comment has the rule's exact words ("a version may be re-pinned under its name only while no release tag contains it (the founder creates tags; the first tag releases it)"); names all 8 changed labels (2 diff, POS detail, DISPOSITION_NOTES gone, 4 figure/line labels); 2026-10-18 entry untouched. OK.
- [x] P5 grep (git grep -i 'expected under|one claim line, expected|Difference, (before|fully)' at c2725961): only ADR 0062:237-240 (record, gains amendment, OK), change-order-001.md:42 (founder's record, schema description, OK), labels.test.ts:48 comment and result-tables.test.tsx:752 negative pin. Worker screening mail/wording/format/public: no figure label. help.ts, console/screening, request-audit, template.ts, messages.ts: none. Labels reach: anomalies.tsx both tables + stacked, result-summary.tsx Stats, /screening page.tsx:138, screening.spec.ts:485,:527 via constants. OK.
- [x] Status file (ops approval-summaries/lane-b-ux-screening-result-words-status.md): P5 CONFIRMED by acting Lane A 2026-11-07 01:31 UTC; PR description still says "is asked to confirm" (stale, status file plans the update). ADR 0062 amendment :1583-1584 says Lane A agreed 2026-10-28 (that covered 3 strings; P5 on 11-07) and cites "the review's P5" (P5 is design §10's proposal, not the baseline review's). -> candidate nit (records).
- [x] ADR 0056/0078 diffs, TBL-08 md/matrix/expected.json/registry diffs read; TBL-08 OK.
- [x] shots viewed: chip-anomaly-2x.1280/.390 (before short red; after unpriced, $5 mono, spaces kept), anomalies-description-2x.1280 after, several.chip-below-one-figure-2x, chip-anomaly-rows-2x; one-anomaly.1280 tiles 02-04 both sides (headers, summary, coverage reason); one-anomaly.390 08-09; top-rows-scrolled.390; top-rows-tab-focus.1280 both (line headers wrap less after); screening.default.1280 03-04 (P5 sentence). All match the description.
- [x] Lane A cond 2: git ls-remote --tags origin rc 0, 0 tags at 2026-11-07T01:56Z (to repeat right before merge). Branch head on origin 03ec41f5.
- [x] Lane A cond 3: PR description records the decision and reasons (OK); status file records it (OK). P5: status file says CONFIRMED by acting Lane A 2026-11-07 01:31 UTC with conditions; PR description still says "is asked to confirm"/"If it declines" -> FINDING F-desc (should-fix: Lane A cond 3 + acting Lane A's "record the ruling in #131's description").
- [x] Calls: line labels CONFIRM "Medicare figure for one claim line, …"; one group OVERRULE (drop order sentence when groups===1); descriptions' $5 mono CONFIRM; TBL-08 drop "its words unchanged" CONFIRM.
- [x] harness others.1280 tiles 03-05; dark one-anomaly.1280-dark 04 (unpriced chip visible; advisory).
- NOTE out of scope: messages.ts:56 FIELD_RULES.allowed_total "$25,000.00" sans in /screening error text (pre-existing, not touched) -> mention in checked only.
- [x] P5 sweep extended: worker mail template, screening message, report remedies, packets goldens, ops tools tour: no old words. Exports: none for a screening result (only the template CSV).
- [x] band.820 after: longer terms wrap to 2 lines in the 40% column (page +238 px), readable; summary-card.390 fine.
## Findings (final)
- F1 should-fix: PR #131 description (body line ~76-80) says P5 "is asked to confirm"/"If it declines"; acting Lane A CONFIRMED 2026-11-07 01:31 UTC with conditions (status file). Fix: replace the paragraph with the ruling + conditions.
- F2 nit: ADR 0062 amendment :1585 "Lane A's orchestrator agreed on 2026-10-28" covers P5 too (P5 confirmed 2026-11-07 01:31 UTC); :1572 "the review's P5" and labels.test.ts:47 "the UX review's P5" mis-cite (P5 is the design's §10 proposal; the baseline review has no P5).
- F3 nit: one group keeps "Largest difference from the lowest figure first." (anomalies.tsx:255; result-tables.test.tsx:881-883): overrule, drop it when page.groups === 1.
## Calls: line labels CONFIRM; one group OVERRULE; descriptions' $5 CONFIRM; TBL-08 CONFIRM.
- READY to return StructuredOutput.
