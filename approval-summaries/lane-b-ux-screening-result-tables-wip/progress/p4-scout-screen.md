# p4-scout-screen progress

Started 2026-10-28. Nothing mapped yet.

## Mapped (run 1)
- page: app/screening/results/[resultId]/page.tsx:25-36 renders PublicHeader + ScreeningResultView (result-view.tsx:19-43). Page not in pr42-files.txt; LANES says "the screening ... pages" (check).
- result-view.tsx:22-29 order: OpenedSignal, Heading, ReleaseWithdrawn, Summary, Anomalies(:26), Coverage(:27), TopRows(:28), ConvertForm(:29), links :30-40
- anomalies.tsx: ScrollTable at :291 (anomalies, min-w 54rem :292, 10 cols :295-304), :364 (top rows, 16 cols :368-383, 'Claims' :375); Standing tone short :155; others tone short :263; description :174-191 ('No group of N' / 'N group(s) of N' :181); top-rows sentence :359
- coverage.tsx: ScrollTable :65 (min-w 40rem :66, 6 cols :69-74); TONES :28-35; reason mono code :94 + label :95; data-reason :83
- result-summary.tsx: 'the engine left' :267; differenceWords :96-104; DIFFERENCE stats :230-233, :246-249
- labels.ts: DIFFERENCE_LABEL :46, REDUCED_DIFFERENCE_LABEL :49, DISPOSITION_NOTES unpriced :164, DETAIL place_of_service_unmapped :175; SCREENING_LABELS_VERSION :18 (labels.test pins; db screening_labels_version() equal -> migration risk)
- labels.ts importers: result.test.tsx:22, result-summary.tsx:17, anomalies.tsx:17, coverage.tsx:4, app/screening/page.tsx:9 (#42), labels.test.ts:6, routes.ts:52, routes.db.test.ts:14, e2e/screening.spec.ts:9 (#42)
- labels.test.ts hashes every exported non-function value + unpricedReasonLabel over ENGINE_ERROR details + products + dispositions (:16-30, VERSIONS :33-42) -> any label change = new hash; version 2026-11-05 "unreleased" (precedent: reworded under same version). db fn packages/db/functions/screening_labels_version.sql + migration 20261105090000:683 -> version move = migration (Lane A).
- watched-paths.txt (#42 file) derived import closure; stacked-rows.tsx not in it (scroll-table.tsx :55 is). Importing StackedRows from anomalies.tsx adds a line -> watched.test fails unless list regenerated. scroll-table.tsx:5-12 note avoided a new module for this reason. #42's diff to list touches lib/screening + worker lines only (clean merge likely).
- StackedRows API stacked-rows.tsx:126-147; StackBelow 32/36/40/48/54rem :35; repeatedIds :187-214 (COMPONENT_PARTS :179 = slot,tone,scroll,scroller,axis) -> chip's data-anomaly/data-standing and Reduced's data-figure="one-figure" would be flagged as repeats.
- brandOrderProblems :154-173: current anomalies/top-rows column order already passes if reduced figures take figure:'expected' and reduced differences 'short' (repeat roles in a row OK); design 3.6 sketch (reduced as mono) would fail.
- result.test.tsx (#42) pins: :273 DIFFERENCE label text; :402 figure order; :403,:417,:430,:431,:510,:526 data-tone short/neutral; :411,:420,:423,:501,:503 'N groups of M' sentences; :480,:483,:558 ScrollTable markup as direct child; :550 detail words; :553 no whole tone.
- e2e/screening.spec.ts (#42): :461 detail words; :468 getByRole table name; :469 first status-chip visible; :488-491 data-group chip data-standing + text.
- line shifts 4d99df8->a6e754fc: anomalies +1 (import :18) and +4 (titles :272-274) => old 151-157->152-159, 180->181, 262->263, 286-299->291-304, 354->359, 359-360->364-365, 370->375; coverage 61-62->65-66, 90-91->94-95; result-summary and labels unchanged.
- #42's own changes (merge-base e908c214df...6f23c42b): result.test.tsx only +6 at :588-596 (kept text); screening.ts :8,:135 (mail env); screening.spec.ts +60 not on result tables; labels.ts/labels.test.ts NOT changed by #42 (only LANES glob).
- BREAKAGE in #42's result.test.tsx by this PR's fixes: UX-040 -> :430,:431,:510 (data-tone="short"); UX-206 -> :411,:420,:423,:501,:503 (sentences); UX-042 labels -> :273; stacked copy repeating data-anomaly -> :418 (count 2). Unaffected if table copy unchanged: :402,:437,:480,:483,:498,:539,:548,:558.
- e2e screening.spec.ts (#42) at Desktop Chrome 1280: :461 detail words (UX-132), :469 first chip visible (table copy shows at 1280), :488-491 ok if stacked copy has no data-group.
- render-result.tsx:62-63 counts data-group-no / data-group="others" (large test :305 expects 50) -> stacked hooks must differ; htmlBytes < 512 KB (:314; ADR 0062:366 ~140 KB now).
- Container widths: card content = min(1024,vw)-80(md)/-32 -50 => 894px at >=1024; 54rem(864) table shows from vw>=994; 40rem coverage from vw>=722 (<768) / 770.
- DISPOSITION_NOTES (labels.ts:161-168) rendered nowhere (only hashed) -> labels.ts:164 change has no visible effect.
- 'engine' visible on result: result-summary.tsx:145 '(engine <ver>)', :267; anomalies.tsx:359 "the engine’s"; checklist .claude/agents/ux-brand-reviewer.md:81-82 forbids "the engine".
- No CSV on public result (UX-132's "kept in the CSV" has no target; code stays in data-reason).
- ADR 0056 Flagged (investigatory)->unpriced now at :86 (was :80). brand.md status colours :26, order :36-37; BRAND.md tables :123-124, screening owed :132-136. Copy lint screening terms tools/brand-copy/scan.ts:125-129, isScreeningFile :236.
- watched.test.ts:18-20 holds list == derived (confirmed). Two short-tone sites only: anomalies :155, :263. Alert destructive = danger token (ok).
- Estimated min-content (Plex metrics): anomalies ~1160px, top rows ~1200px vs card content 894px at 1280 -> both overflow at 1280 even after PR 3 (status chip nowrap ~400-450px). Needs measuring.
- counted() (words.ts:8-10) no digit grouping: result-summary :219,:240 vs many() grouped (anomalies :40-42).
- NEXT: write p4/screen.md (all mapped).
- DONE: wrote <scratchpad>/p4/screen.md (sections 0-11). Only the summary return remains.
