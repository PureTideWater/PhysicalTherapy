# UX PR 4b plan (read-only planning run)
Started 2026-11-07. Worktree /home/user/ux-screening-result-words.
## Status
- [ ] read spec sections 11, 3.4, 3.9, 12, status files
- [x] read spec 11, 12, 12.1, 3.4, 3.9, 10 (P5), status files, #83 body (Waits for #42)
## Findings so far (current tree 31a7345f)
- anomalies.tsx: standingWords :139-150 (anomaly :142 "Anomaly: more than $5 a claim line below ${...}", one-figure below :146 'Below by $5 a claim line or less'); Standing :158-169 (table short/stacked unpriced; children: string); doc comment :152-157; GroupStatus :172-185 (counted(group.rows,'row') -> "of 2 rows"; "their lowest figure"); anomaliesDescription :194-213 (first sentence :201 "No group of N is an anomaly."/"counted of N is/are"; rule BEFORE within sentence; "the table’s last row" :209-210); otherCells :340-359 (table short :352); comment :334-339, :187-193.
- DIFFERENCE_SIGN :255 already "negative where it is above it" (P4-DR-06c done in #83). OTHERS_NOTE :319 done. TOP_ROWS_PRICED :515 done.
- labels.ts: version 'screening-labels/2026-11-05' :18; MEDICARE_FIGURE_LABEL :34 "Expected under Medicare, ${BEFORE_REDUCTION}", REDUCED_FIGURE_LABEL :37, MEDICARE_LINE_LABEL :40 "One claim line, expected under Medicare, ...", REDUCED_LINE_LABEL :43; DIFFERENCE_LABEL :46 `Difference, ${BEFORE_REDUCTION}`; REDUCED_DIFFERENCE_LABEL :49; DISPOSITION_NOTES :160-168; DETAIL_LABELS.place_of_service_unmapped :175 'The place of service is not in the approved place-of-service split'; header comment :9 says "expected under Medicare".
- labels.test.ts: VERSIONS :33-42; 2026-11-05 hash 831c2772...f6d0 at :41; comment :35-40; first case :45-64.
- P5 (Expected under Medicare -> Medicare figure) is a labels.ts change too => 4th changed string group beyond Lane A's "three": RISK.
- StatusChip (components/status.tsx:24-30) is `inline-flex items-center whitespace-nowrap`; unpriced tone :19 now text-status-unpriced (#121), not Slate (design 3.9 stale). A mono span mixed with text => separate flex items, spaces collapse => wrap all chip words in ONE <span>. No existing chip with mono inside.
- result.test.tsx pins (current = design numbering): :411, :419-424, :430-432, :500-503 (+ :503 text), :510, :273, :550, :536 (one-figure anomaly regex), :526 (neutral others). :401 headers via constants (ok), :531 via constants (ok).
- screening.spec.ts :509 (place-of-service words), :517 NOT rescoped by #42 (still .first() unscoped), :539 toHaveText anomaly (textContent same if "$5" kept).
- screening-phone.spec.ts: own lock :40-69 (databaseClient/e2eDatabaseUrl used only there; withDatabase stays); holdScreeningStream exists at e2e/mail.ts:179 -> plan swap. 390 step already asserts stacked data-tone (:217); 1280 step has no table-tone assert -> add.
- ADR 0062:237-242 quotes old labels ("Expected under Medicare", "Difference, ..."): needs a dated amendment note. ADR 0056:148-149 "stacked anomaly standings" -> both copies. ADR 0078 :127-130 "in the table copy with the review's follow-on" -> now.
- SQL: only version NAME in packages/db/functions/screening_labels_version.sql:14 + migration 20261105090000:685; no hash/words in SQL => no migration. 0 release tags (2026-11-07).
- DISPOSITION_NOTES used nowhere outside labels.ts. Old-word pins outside screening tests: none (grep done: groups of / table’s last row / Below by $5 / No group of / place-of-service split / Difference, / Expected under).
- result-tables.test.tsx: chip() helper ~:392 `([^<]*)<` breaks with wrapped words (would capture '') -> update to read text up to </span></div>|</span></dd>. Case 7 :555, P4-RC-01 case :634-649 (old order+words), case 11 :755-775 (table short), header :26-35 mentions result.test pins.
- TBL-08 at test-matrix.md:417, matrix.ts:731-736, registry.ts:970-974, fixture fixtures/synthetic/TBL-08/expected.json.
- Line labels: no test pins literal; propose "Medicare figure for one claim line, …".
- React SSR inserts <!-- --> between adjacent text nodes: build each text run as one template string.
- PLAN DECISIONS: wrap $5 chip words in one <span>; Threshold component; also below-threshold chips; description's ANOMALY_RULE $5 via component-side splitter (recommended).
- Baseline: labels.test + result.test + result-tables.test pass on 31a7345f (52 tests). Tree clean.
- screening.spec.ts default viewport 1280 at :517; [data-stacked-copy="table"] wrapper at stacked-rows.tsx:146.
- Stacked-items chip in heading => duplicates Status field (phone spec strict locator, screen reader twice) -> PROPOSAL only.
- Decision: omit "Largest difference…first." for one group (planner's call, flagged).
- NEXT: write items/stale/risks into StructuredOutput.
## Plan (items, final)
1 Standing tone+doc (anomalies.tsx:152-169) 2 otherCells tone (:334-359) 3 withFigures helper ($5 mono; chips + both CardDescriptions :405, :536)
4 anomaliesDescription closed set + last entry (:187-213; omit "Largest…" for 1 group, flagged) 5 one-figure below (:146) + GroupStatus its (:176)
6 labels DIFFERENCE 7 labels P5 (Medicare figure; line: "Medicare figure for one claim line, …") 8 place_of_service_unmapped 9 DISPOSITION_NOTES out + header comment
10 labels.test VERSIONS comment (Lane A cond 1) + hash + cases 11 result.test pins + tableCopy scope 12 result-tables chip() + cases
13 screening.spec :509, :517 14 phone spec stream swap 15 phone 1280 table tones 16 TBL-08 (md, matrix.ts, registry assertedBy, pnpm synth)
17 ADR 0062 note after :244 18 ADR 0078 note after :133 19 ADR 0056 :149 20 records/conditions 21 generators
Proposal only: stacked item standing chip in heading.
