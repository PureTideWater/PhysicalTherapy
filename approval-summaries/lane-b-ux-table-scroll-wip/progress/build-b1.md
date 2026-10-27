# build-b1 progress (slice B1: practice pages, home to packet)

Worktree /home/user/ux-table-scroll, branch co-001/ux-table-scroll. Do not commit.

## Steps
- [x] 0. Read design whole (section 12 wins: 56rem -> 54rem), review JSON, scouts' notes, scroll-table.tsx, build-a.md.
- [x] 1. Sites (file:line, label, min-w, wrap): see below
- [x] 2. grep + mini TS guard (scratchpad b1/guard.mjs) over the 13 files: guard ok (16 tables, each ScrollTable's only child).
- [x] 3. No unit test in my folders; vitest --project unit apps/web/src/app tools/brand-colors tools/brand-copy: 3 files, 57 tests passed; pnpm typecheck: 22 projects passed; eslint on the 13 files: clean; pnpm lint:copy: 516 files passed.
SLICE B1 DONE. Nothing remains. Not committed (as instructed).

## Sites done
- page.tsx:439 Agreements, 40rem, wrap Signer (was OV relative overflow-x-auto)
- cases/page.tsx:243 Cases, 54rem, wrap Owner (was OV)
- claims/page.tsx:137 Claims and lines, 54rem, wrap patient + claim control numbers cell; CardContent lost relative overflow-x-auto (body reindented)
- anomalies/page.tsx:59 Flagged lines, 48rem, wrap payer claim control number; :163 Anomaly cohorts, 54rem
- abstraction/page.tsx:101 Versions in progress, 40rem, wrap Contract (was NONE)
- abstraction/ledger/page.tsx:49 Entries {label} (Entries of the line, Ledger entries), 54rem, wrap Written by (was OV)
- cases/[caseId]/packet/page.tsx:572 Versions, 54rem, wrap writer and approver (spans around the emails only, so dates never break; Approved cell turned from a template string into JSX, same text)
- packet-reviews/page.tsx:49 ExportTable {label}, 48rem (was OV)
- reconciliation/page.tsx:146 EntryTable {label}, 54rem, wrap Written by and Reason; :308 Exports, 36rem (was NONE); improved: Rows and Matched counts font-mono tabular-nums (brand rule)
- contracts/page.tsx:93 Contracts, 54rem, wrap Plans; :152 Calendar, 36rem, wrap Note (both were NONE)
- contracts/[contractId]/page.tsx:55 Versions, 48rem, wrap Approved and Signed off (spans around the emails only; template strings turned into JSX, same text)
- mapping/page.tsx:111 Payers and plans, 54rem, wrap Plan cell
- mapping/[planId]/page.tsx:103 Agreement resolution, 32rem; :206 Mappings, none, wrap Mapped by (span around the email only)
ALL 16 SITES IN 13 FILES DONE. Next: guard check, tests, typecheck, eslint.

## Handovers / proposals
- Slice E: models.spec.ts:83, 148, 194 read getByRole('region', { name: 'Version' }) on the packet page, which now also matches "Versions, scrolls sideways" (before hydration or while the table overflows): add exact: true (DR-02 lists only packets.spec.ts:98,132,144,282,431,501,507 and reconciliation.spec.ts:105).
- Slice E: unattested.spec.ts:172 region 'Exports never attested' toHaveCount(0) still holds (the card and its ScrollTable render only when the list has rows); exact: true optional for symmetry with :62,:171.
- No unit test lives in or pins any of my 13 files (checked); type-scale.test.ts reads all .tsx.
- Proposal: reconciliation/page.tsx EntryRows gives each row id="entry-<id>"; with ?case= the same entry can render in a linkage line's "Entries of the line" and in "Ledger entries", so the id repeats on one page (the ROI link #entry-<id> lands on the first). Pre-existing; not this PR.
