# UX PR 9 (co-001/ux-home-figures): the data API the screen builder codes against

Worktree /home/user/ux-home-figures. Written by the data-side builder (hom-build-core), 2026-11-01.
All amounts are integer cents as text; counts are numbers. Format money with the repo's <Money>/formatCents only.

## Practice home: `practiceHome` -> `data.dashboard` (type `Dashboard`, apps/web/src/lib/dashboard/queries.ts)
`practice.ts` (a #42 file) is unchanged; it passes `dashboard()` through, so these appear on `page.data.dashboard`.

```ts
export interface OutOfFigure {
  readonly movedOn: number; // lines not written off, moved on past actionable (payer approved or recovered)
  readonly stale: number;   // lines not written off, at actionable, pricing no longer current
}
export interface Headline {
  readonly actionable: { readonly lines: number; readonly cents: string; readonly outOfFigure: OutOfFigure };
  readonly payerApprovedCents: string;
  readonly recoveredCents: string;          // to date (proof level's stage + recoupments, net of reversals)
  readonly recoveredSince: string | null;   // NEW: 'YYYY-MM-DD', earliest effective_on of the entries the to-date figure sums; null => "nothing posted yet" / "nothing deposited yet"
  readonly proofLevel: 'posted' | 'deposited';
  readonly flagged: { readonly lines: number };
  readonly validated: { readonly lines: number; readonly cents: string };
}
Dashboard.recoveredQuarter: { quarter: 'YYYY-Qn'; from; to; cents }   // shape unchanged; same ledger read as the to-date figure
Dashboard.casesByState: { state; cases; actionableCents }[]             // shape unchanged, ORDER BY state
Dashboard.deadlines: { cases; actionableCents; earliest }               // shape unchanged
Dashboard.uploads: { readonly baaOnFile: boolean }                      // NEW (D9): practice_baa_on_file(), the gate Uploads reads
```
- Tile words (F4): `outOfFigureWords(headline.actionable.outOfFigure.movedOn, ...stale)`; show the clause only when either > 0.
- `lines` counts the same predicate as `cents`; `outOfFigure` covers the worked cases only (resolved/closed excluded).
- Empty-home gate (UX-140): open = `dashboard.uploads.baaOnFile && page.data.suspension === null` (as Uploads computes it).
  No BAA => NO_BAA sentence (import `NO_BAA` from `lib/uploads/gate.ts`, or from `lib/routes/uploads.ts`, which re-exports it).
  BAA on file but suspended => "Uploads are paused" state.
- "this quarter" row of "Where things stand" goes (D7): use `dashboard.recoveredQuarter` inside the Recovered tile.

## Cases screen, case page, packet builder: `CaseSummary` (apps/web/src/lib/triage/queries.ts)
```ts
readonly actionableNowCents: string;     // the figure (unchanged name)
readonly actionableNowLines: number;     // its lines (unchanged name)
readonly actionableNowMovedOn: number;   // NEW: lines not written off moved on past actionable
readonly actionableNowStale: number;     // NEW: lines not written off whose pricing is no longer current
readonly openLines: number;              // lines not written off = actionableNowLines + actionableNowMovedOn + actionableNowStale
readonly actionableCents: string;        // the stored ask: shown nowhere as actionable
readonly netExpectedCents: string | null;// NOW from actionableNowCents less pursuit cost (D6), can be negative
```
- F5 Cases row cell: `{item.actionableNowLines} of {item.openLines}`; header `{stageLabel('actionable')} lines`.
- Cases header figure: `casesPage` data `actionableCents` (= listCases' openActionableCents), unchanged.

## ROI statement
- `roi_statement.actionable_open_cents` for statements generated from now: the cases still being worked, each counting its lines
  still actionable on their pricing in effect (ACTIONABLE_NOW). `StatementDetail.actionableOpenCents` / `actionableCases` unchanged in shape.
- No proof-level words in this part; NOTHING_APPROVED_WAITING is the screen builder's.

## Worker exports
- `@tp/worker/triage`: `ACTIONABLE_NOW`, `ACTIONABLE_NOW_LINE`, `ACTIONABLE_NOW_LINES`, `ACTIONABLE_NOW_OF`, `ActionableNowColumns`, `LATEST_STAGE` (SQL texts).
- `@tp/worker/ledger`: `recoveredPeriods(all, proofLevel, { from, to })`, `practiceRecoveredPeriods(scope, practiceId, { from, to })`,
  `RecoveredPeriods { toDate: LedgerTotals; period: LedgerTotals; firstOn: string | null }`.
- `lib/uploads/gate.ts` (web): `baaOnFile(scope, practiceId)`, `NO_BAA`.
