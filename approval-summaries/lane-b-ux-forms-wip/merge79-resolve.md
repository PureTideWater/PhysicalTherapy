# Merge a6e754f (#79) into /home/user/ux-forms (#74) - resolve 7 files

Base 0dd1ba7. HEAD 34f7427. MERGE_HEAD a6e754f. One conflict hunk per file (markers found at start).

## Files
- [x] console/status/page.tsx (hunk 61-101): took #79 ScrollTable label="Components" + first td pr-3, and kept #74 ActionForm className "flex flex-wrap items-end gap-2" (U-UX-2: status row fits 390). Table has no min-w so wrap keeps it fitting; no collision. Imports auto-merged (CheckboxGroup + ScrollTable). git-added.
- [x] cases/[caseId]/packet/page.tsx (hunk 7-11, imports): kept both imports, path order: UtcTime from components/dates (#79, Versions table dates) then TextAreaField from components/field (#74, the approval-request message). Body auto-merged (#74 TextAreaField at request-message; #79 ScrollTable "Versions" min-w-[54rem], UtcTime spans). git-added.
- [x] cases/page.tsx (hunk 11-15, imports): kept #79 ScrollTable import; dropped MATERIALITY_LABELS import (#74 removed it: ActionForm labels prop gone per ADR 0077 D3, constant no longer exported by settings/defaults.tsx at HEAD; #79 only carried it as context). Body auto-merged (#74 SelectField triage-run showChosen + owner SelectField; #79 ScrollTable "Cases" min-w-[54rem], whitespace-nowrap lines, owner min-w-40 wrap-anywhere span). git-added.
- [x] coverage/page.tsx (hunk 427-454, letter form): TRUE COLLISION. #79 af13cc06 put w-full min-w-0 on the two hand-written letter selects and min-w-0 on their wrappers (selects keep to their column at 390); #74 replaced those selects with SelectField showChosen and the form with grid-cols-1. Took #74 side: SelectField renders the wrapper as flex min-w-0 flex-col and the select max-w-full, stretched to the column (= w-full), in a grid-cols-1 (minmax(0,1fr)) track, plus the base-layer select max-width rule (ADR 0077 D6): #79's intent is met. No className passed to SelectField: its {...props} spread after className would replace the component's own classes. Label/Input imports stay dropped (#74). Body auto-merged: #79 ScrollTables "Plans waiting on mapping" min-w-[48rem] and "Unpriced reasons and their remedies" min-w-[40rem]; #74 CheckboxGroup/CheckboxField + FormKeys in the evidence review. git-added.
- [x] reconciliation/page.tsx (hunk 7-11, imports): kept both, path order: UtcTime from components/dates (#79, Exports table) then CheckboxField, TextAreaField from components/field (#74, ReverseForm). Body auto-merged: #74 ReverseForm on TextAreaField/CheckboxField (errorName Confirmation); #79 EntryTable in ScrollTable min-w-[54rem], "Entries of case line N" labels, firstPlace/ListPage, Exports ScrollTable min-w-[36rem]. git-added.
- [x] reports/page.tsx (hunk 7-11, imports): kept both, path order: UtcTime (#79) then Field, SelectField (#74). Body auto-merged: #74 report-run SelectField showChosen, document-month Field; #79 "Generated reports" (min-w-[36rem]) and "Exports" ScrollTables with UtcTime. git-added.
- [x] components/reconciliation/template-mapper.tsx (hunk 9-14, imports): kept both, path order: ../field, ../form-issues (#74 controlled Field/SelectField + template FieldError) then ../scroll-table (#79 "Preview rows" ScrollTable min-w-[48rem]). Body auto-merged. git-added.

## Checks
(not yet run)

## Cross-check (done)
Per file: (+/- lines of merged vs a6e754f) == (#74's 0dd1ba7..HEAD) and (merged vs HEAD) == (#79's 0dd1ba7..a6e754f), except
the intended combinations: status ActionForm flex-wrap (both), coverage letter selects (#74 SelectField replaces #79's
hand-written w-full min-w-0 selects). All 7 staged with GIT_LITERAL_PATHSPECS=1; 0 unmerged paths left.

## Checks (pending): typecheck, eslint 7 files, vitest tables.test.ts, form-hints.test.ts, type-scale.test.ts, fields.test.tsx
- pnpm typecheck: PASSED (22 projects; apps/web 48.1 s)
- eslint --max-warnings 0 on the 7 files: PASSED (json format confirms each file linted, 0 errors 0 warnings)
- vitest --project unit (no coverage): PASSED 10 files, 360 tests: app/tables.test.ts (#79 guard), components/form-hints.test.ts,
  app/type-scale.test.ts, components/fields.test.tsx, scroll-table.test.tsx, stacked-rows.test.tsx, dates.test.tsx,
  lib/http/http.test.ts, lib/routes/registry.test.ts, lib/routes/route-tests/partition.test.ts
- Postgres 5433 was down; not needed for these checks (not started). e2e not run.

## STATUS: DONE. Nothing committed; MERGE_HEAD still set for the orchestrator.
