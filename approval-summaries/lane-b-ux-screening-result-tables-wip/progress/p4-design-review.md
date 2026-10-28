# p4 design review progress

Started 2026-10-28. Reading design.
## Done
- Read the design (1077 lines) fully.
## Next
- review §3 UX PR 4 + 6 findings; prs.json order 4; then code at a6e754fc
## Findings so far
(none yet)
- Read review §3 UX PR 4 + six findings + F4/F5; status files; LANES rule 6 (watched-paths regen allowed)
- Read code: anomalies.tsx, coverage.tsx, result-summary.tsx, stacked-rows.tsx, status.tsx, scroll-table.tsx, card.tsx, result-view.tsx, labels.ts, result.test.tsx (all pins), a11y.ts, screening.spec.ts result step, #42 diffs (result.test only kept-text pin; spec adds stream fixture + run poll), render-result.tsx, large test, watched.ts
## Candidate findings (to verify)
- F-1280/1263: max-w-5xl caps main at 1024 -> wrapper 894 at both 1280 and 1263; design's 877 at 1263 wrong; the tight width is 994px viewport (wrapper 864 = 54rem switch). Spec step 7 should be ~994/1000 not 1263.
- stream fixture: if #42 merges second it is #42's session editing Lane B's spec at a base merge that dismisses approval; give it to 4b in either order.
- CONFIRMED F-1263: main max-w-5xl (1024) -> wrapper 894 at 1263 too (scout screen.md:58-61 agrees: table from 994 px). Spec step 7 + TBL-06 "1263" test nothing; use 994x720 (container = 54rem exactly).
- F-mono-weight: stacked h3 is font-semibold (stacked-rows.tsx:86); mono spans in heading would be Plex Mono 600 (only 400/500 loaded, fonts.ts:38-39; checklist "400 or 500") -> heading mono spans font-medium.
- F-coverage-headings: "each heading distinct" false: product+disposition can carry several reasons (key coverage.tsx:80) -> two "Original Medicare: Could not be priced" headings; fix: claim + heading adds reason? or accept.
- F-others-one: "The other 1 group, summed" / "1 group among them" when others.groups===1 (nouns agree with counts); unpinned case.
- F-OTHERS_NOTE says "columns" in a list description.
- F-rounds-it: "rounds it once" (it = the claim line) wording nit.
- F-stream: stream fixture owner when #42 merges second -> 4b.
- watched-paths: 2 lines (stacked-rows unavoidable, table-parts avoidable); clean textual merge with #42 hunks (different regions).
- Case 9 says every status td of three tables incl coverage, but coverage has no status column (outcome is naming) -> inconsistency
- BLOCKING F-stream: #42's mail.ts holdScreeningStream = pg_advisory_lock_shared(760_065) (#42 mail.ts:173-190); mail-cutoff.spec.ts:30 takes it exclusive and pauses the stream (upload refused during pause). If PR 4 merges first, #42's merge-ref CI runs screening-phone.spec.ts unlocked -> flaky red on #42 and #42 must edit a Lane B spec. Fix: new spec takes the same shared advisory lock itself now (auto fixture, own 240s timeout, databaseClient(e2eDatabaseUrl())), 4b swaps to holdScreeningStream.
- SHOULD-FIX F-UX040-worse: stacked copy makes Short-coloured anomaly chip prominent at 390 (was behind scroll); rows-copy tone unpinned (pins :430,:431,:510 table-scoped) -> rows copy takes unpriced now, or argue; case 11 changes.
- NIT: case 7 "every $ figure and count in mono" fails on chip "$5" and others heading count; specify regex \$[\d,]+\.\d{2} and count fields.
- NIT: P1 reason wrong (words.test pins only <1000; real coupling Counted slice in remittances/display.tsx:23-29). #74 edits words.ts (listed()).
- NIT: cited :547 is :548 (<tr data-coverage count); :367 vs :368.
- 7.1 "Several anomalies" adds an invented row though text says "no invented rows".
- Open PRs checked via REST 2026-10-28: #74 words.ts/test-matrix/screening split-form; #75/#78/#81 test-matrix+watched-paths; #42 as known.
- All result.test.tsx pins re-checked against the design's markup: hold (table copy first; rows copy no data-group/-row-no/-anomaly/-standing/-figure). #42's spec result step unaffected at 1280; 390 noSidewaysScroll OK.
- Item 6: two lines join (stacked-rows.tsx needed, table-parts.tsx avoidable); #42 hunks at watched-paths 85-100,134-171,288 vs ours 53/55 -> clean merge either order.
- Item 7: no migration, no frozen code; kept notices (ScreeningHeading, screening-kept-result) untouched; F5 sentences untouched.
## Verdict drafted: build with changes, no migration. Writing StructuredOutput next.
