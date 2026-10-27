# design-ss01-author progress
Started 2026-10-27. Output: /home/user/ops/designs/ss-01-suspension.md
Clone: $P/designs/ss01-author
## Status
- [ ] clone + fetch
- [ ] read sources (status file, ux-suspended-standing design, ux-review §5, LANES.md entry, pr6b design for style)
- [ ] verify code (billing.sql functions, console.ts, dunning.ts on #42, pages)
- [ ] probe (own db tp_design_ss01_10)
- [ ] write sections
## Outline
(tbd)
## Open points
- [x] clone + fetch ($P/designs/ss01-author; base e908c21; #42 head now 098636e3, merge-base e908c21, 188 files: progress/ss01-author-pr42files.txt; #42 migration saved progress/ss01-author-mail42.sql)
- [x] read sources: LANES.md (row 185 claim; Handed to Lane A), status file, ux-suspended-standing design SS-01..14, ux-review §5 (UX-004), UX-046 (PR 78), UX-203 (PR 79), UX-204
- verified: billing.sql:268-318 functions/triggers, :405-409 grants; tenancy.sql:19-27 organization, :95-118 grant, :490-497 org policies, :595-597 grants; console.ts on #42 :82-114 setOrganizationStatus; console org page :54-76 card, :324 grant 'in force'; refusal.ts, runs.ts, invoke.ts:294-300,:500-504, worker.ts:146-151
- #42 drops billing_owner_emails; worker.ts NOT a #42 file; console org page NOT #42; console.ts IS #42
