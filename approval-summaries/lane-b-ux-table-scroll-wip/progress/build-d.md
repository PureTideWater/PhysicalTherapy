# build-d progress (slice D: console, account and public pages)

Worktree /home/user/ux-table-scroll. Read: design (whole, s.12 wins), review JSON, inventory, scroll-table.tsx, build-a.md.
Helper: scratchpad/d/wrap.py FILE START END LABEL MINW (wraps a table in ScrollTable, reindents, sets min-w).
Do not commit.

## Sites done (line = the <table> line after the edit)
- console/prospects/page.tsx:52 Audit requests, 54rem, wrap Contact + Payers cells
- console/tickets/page.tsx:48 Tickets, 54rem, wrap From + Message cells
- console/specialist-queue/page.tsx:83 Practices, 54rem
- console/compliance/page.tsx:161 Policies, 36rem, wrap file path (also pr-3 on the first three cells: they had no gap); :204 Evidence records, 40rem, wrap Subject + Reference
- console/terms/page.tsx:33 Terms versions, 40rem, wrap Document
- console/rule-releases/page.tsx:61 Rule releases, 54rem; :118 Affected runs by practice, 48rem; :169 Drafts, 40rem, wrap Draft file;
  ScrollBox "What the content checker found" (was pre :198); ScrollBox `Release notes of release ${release.release}` in a div mt-2 (was pre mt-2 :216)
- console/screening/page.tsx:83 Approved splits (OV div replaced; table keeps aria-labelledby), 40rem, wrap By
- console/organizations/page.tsx:53 Organizations, 32rem
- console/organizations/[organizationId]/page.tsx:135 Members 40rem wrap Email (+ the two flex tds now hold an inner flex div: a flex td is no table cell);
  :200 Invitations 40rem wrap Email (+ empty 5th th gets sr-only "Actions"); :247 Agreements 54rem wrap Reference; :318 Grants 48rem wrap Roles admitted
- console/billing/page.tsx:51 Billing status, 40rem
- console/models/page.tsx:96 Model flags, none, wrap Applies to; :125 Model spend by practice, 36rem (+ empty state "No practice is active." outside ScrollTable, so no header-only region)
- console/status/page.tsx:62 Components, none (+ pr-3 on the name cell)
- settings/billing/[organizationId]/page.tsx:135 Invoices, 40rem, wrap Invoice cell
- support/page.tsx:65 Tickets, 32rem, wrap Subject
- status/page.tsx:36 Components, none
ALL 22 TABLES AND 2 BOXES IN 15 FILES DONE (mini guard: ok, 22 tables, 22 ScrollTable). Next: e2e locator scan (handovers), vitest, typecheck, eslint, lint:copy.

## Checks (all done)
- mini guard (scratchpad/b1/guard.mjs) over the 15 files: ok, 22 tables, each ScrollTable's only child; every label equals its table's aria-label (screening: aria-labelledby -> CardTitle "Approved splits")
- grep: no overflow-*, <pre>, style= or hex left in the 15 files
- pnpm typecheck: passed, 22 projects (log build-d-typecheck.log)
- pnpm exec eslint on the 15 files: clean (build-d-eslint.log)
- vitest --project unit apps/web/src/app apps/web/src/components/billing tools/brand-colors tools/brand-copy: 5 files, 86 tests passed (billing.test.tsx reads the settings/billing page source; its substrings kept)
- pnpm lint:copy: 516 files passed
- e2e locator scan: no getByRole region/table or getByLabel without exact matches a new label on its own route
SLICE D DONE. Not committed (as instructed).

## Handovers
- Slice E: pricing.spec.ts:238 getByRole('region', { name: 'Release 900001' }) on /p/<id>/releases would also match note.tsx's ScrollBox ("Release notes of release 900001, scrolls") while its <details> is open (closed by default, so hidden today): exact: true is safer.
- Slice C: console/rule-releases names each prepared release's box `Release notes of release ${n}`; note.tsx's box should use the same pattern.
- Slice E: /console/models shows "No practice is active." instead of a header-only spend table when no practice is active; tables-phone test 2 needs an active practice (the seed has them) to name "Model spend by practice".
