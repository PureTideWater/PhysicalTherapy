# p4-scout-words progress
Started 2026-10-28. Output: scratchpad/p4/words.md
## Done
(nothing yet)
- Read findings UX-005/040/042/043/132/206 (ops review lines 1648, 2256, 2294, 2313, 4004, 5410), prs.json order 4.
- anomalies.tsx at a6e754fc: Standing tone short :153-159 (:155), OtherGroups chip :263; count sentence :181 (was :180); top-rows desc "A row is below a figure where that difference is above zero." :359 (was :354); "Claims" :375 (was :370); tables :291-305, :364-384.
- labels.ts: DIFFERENCE_LABEL :46, REDUCED_DIFFERENCE_LABEL :49, DISPOSITION_NOTES.unpriced :164, DETAIL_LABELS place_of_service_unmapped :175.
- KEY: labels.ts is versioned (SCREENING_LABELS_VERSION :18 'screening-labels/2026-11-05'); labels.test.ts:33-42,78 pins SHA-256 of every export; DB fn screening_labels_version() (packages/db/functions/screening_labels_version.sql; migration 20261105090000:683) must equal; screening_lead.labels_version stores it (ADR 0062:421-422). Any labels.ts word change = new version + migration + domain model regen + founder approval. So PR 4 must not touch labels.ts (also #42-locked); do not shadow pinned labels in components either (circumvents the pin).
- Tone: StatusChip apps/web/src/components/status.tsx:13-21 (unpriced = border-status-unpriced bg-status-unpriced-bg text-fg-muted). brand.css:40-49 .pw-status-* unused; .pw-status-unpriced text is #7A8594 (3.7:1) -> proposal. tokens.css:17-22, dark :91-96; danger = short's values (tokens.css:43,46). ADR 0056:86 Flagged (investigatory) = unpriced. brand.md:26-28, :36-37. BRAND.md:77-79 (status meanings), :123-124 (Tables order), :135-136. CO-11 change-order-001.md:95. coverage.tsx:27-35 TONES (no whole/short). Recommendation: anomaly -> unpriced, rest neutral; others row :263 same.
- Copy lint: tools/brand-copy/scan.ts:51-61 COPY_ROOTS includes apps/web/src; screening rules apply to any path with /screening/ (:235-237); e2e and tests skipped (:85, :232).
- Closure: watched.ts:31-61 entries incl. results page; watched-paths.txt (#42 file) lists components/screening/{anomalies,coverage,result-summary,result-view}.tsx :48-53, scroll-table.tsx :55, status.tsx :56, lib/copy/words.ts :75; stacked-rows.tsx NOT in closure -> importing StackedRows adds it (flag to screen scout/author). scroll-table.tsx:5-11 explains PR 3 kept functions in-file for this reason.
- DISPOSITION_NOTES (labels.ts:161-168) is used by NO screen (grep) -> UX-132's labels.ts:164 part has no visible effect.
- stacked-rows.tsx: FigureRole :8, brandOrderProblems :154-173 (non-figure between first and last figure = problem). PR 3 design 3.6 sketch gives reduced columns mono:true -> would FAIL brandOrderProblems; give 'expected'/'short'.
- Precedents: remittances/display.tsx:55 flagged->'unpriced'; PRD.md:241 (anomaly screening labelled investigatory, never contract variance), :352; unpriced-reasons.md:13 NO_AGREEMENT 'anomaly screening only', :22 ENGINE_ERROR 'Unexpected input / Operator alert'; ux-brand-reviewer.md:79-82 (no 'the engine'), :88-90 (investigatory unpriced, never Short).
- Variance words: reports/documents.tsx:175 'variance is expected allowed less observed allowed'; pricing-runs/[runId]/page.tsx:411 'Expected allowed less observed allowed'; remittances/[remittanceId]/page.tsx:105 'A positive amount reduced this payment; a negative one added to it.'; result-summary.tsx:43 comment 'Expected less allowed'.
- PINS in #42 files (from tests scout, verified): result.test.tsx :273 (summary dt DIFFERENCE text), :401 (anomalies <th> regex [^<]* -> any header change incl. nested span fails), :411/:420/:423/:501/:503 count sentence, :430/:431/:510 data-tone short, :531 top-rows contains DIFFERENCE_LABEL (additive ok), :550 coverage reason words; e2e screening.spec.ts:461 (#42 head :509) reason words, #42 :539 anomaly chip text.
- Unpinned (can land now): 'Claims'->'Claim lines' :375; top-rows desc :359 (sign sentence, 'the engine', 'claim count'); result-summary.tsx:267; coverage.tsx:94 drop mono code (data-reason :83 stays).
- LANES.md rule 6 (line ~36): watched-paths.txt is generated: each PR commits generator output; PR merged second regenerates. So closure growth is procedurally allowed; stacked-rows.tsx joins anyway.
- Decided: no new words module; strings in components; shared words optional export from result-summary.tsx (in closure).
NEXT: write p4/words.md
- Release state: labels.test.ts:35-41 + commit dfec40dc: 2026-11-05 "unreleased until PR 6b merges" (#42 = PR 6b-4) -> before #42 merges a label re-pins under same name, no migration (screen scout agrees, screen.md 8.2).
- ENGINE_VERSION = 'phase-two/2' (packages/pricing/src/trace.ts:22) shown as "(engine phase-two/2)" result-summary.tsx:145; :366-368 pins only the value.
- 'Below by $5 a claim line or less' anomalies.tsx:146 pinned result.test.tsx:432.
- SCR-05 test-matrix.md:190; TBL-04 :332; TBL-05..08 reserved :324-325.
WRITING words.md now.
- DONE: p4/words.md written (sections 0-10) and line refs re-checked. Only the return summary remains.
