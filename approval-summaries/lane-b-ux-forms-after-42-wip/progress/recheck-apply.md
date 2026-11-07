# Re-check apply (K1-K13) to designs/lane-b-ux-forms-after-42.md

- 2026-11-07. Design read whole; all 13 confirmed findings applied with refined fixes; section 10 gains a re-check table (K1-K13).
- Evidence checked in /home/user/ux-forms-after-42 at 31a7345f: services.origin is sameOrigin's comparand (lib/http/invoke.ts:382; lib/server/config.ts:331; screeningPage handler at lib/screening/routes.ts:194 can return it); FIELD_NAMES and the 'a column' default (screening/routes.ts:228-242); messages.ts :83, :92, :95, :195, :199-207; reconciliation.ts:130, :133; scan.ts:474 accepts a thousands comma (so '3,650 days'); only view.test.ts:86 pins SAY_WHAT_IT_COUNTS; CI-30 allocation in lane-b-ux-forms-after-42-status.md line 1.
- Choices: K7 keeps the card's own words (refined 1); K10 option (a) NO_FILE_CHOSEN; K4 step reviewed by hand (ADR item 1), automated step check and account.ts in COPY_FILES as section 4 proposals; K11 "fix them too / fix it too"; messages.ts:195 overflow and :92 left alone on purpose; K13 swaps 5.2 items so legal surfaces stay item 5.
- No FRM placeholder ("FRM-" + "<") left in the design.
- Commit: see git log on claude/build-ops ("lane b: ux-forms-after-42: re-check K1-K13 applied"); not pushed.
