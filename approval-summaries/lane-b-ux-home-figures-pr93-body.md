## What changes

Every live actionable figure of a practice's cases now reads one predicate, so the home, Cases, the case page, the packet builder, the ROI statement and the digest give one figure for one case, each counted with its own lines. The Recovered tile names its period, no read text this pull request touches says "stage five", the approval words follow the practice's proof level, and the empty home names the gate Uploads itself uses.

- **One predicate** (`apps/worker/src/triage/actionable-now.ts`, exported through `@tp/worker/triage`; docs/adr/0082):
  - a case line counts when it is not written off, its latest stage is actionable and its pricing check is current. `ACTIONABLE_NOW_OF` returns the cents, the lines, the lines not written off, and the two causes a line not written off is out of the figure: `moved_on` (latest stage past actionable) and `stale` (at actionable, pricing no longer current).
  - Each case line is read once behind an `OFFSET 0` derived table, and the pricing check runs once per line at actionable (F1).
  - `lib/triage/queries.ts` imports the predicate instead of keeping its own copy. Cases now picks and pages its cases first, then computes the figure for that page only. The case's "Net expected value" comes from the live figure less the pursuit cost (D6), not from the stored `case.actionable_cents`, which stays the case's ask and is shown nowhere as actionable.
- **The home** (`lib/dashboard/queries.ts`): one statement, `HOME_CASES`, replaces today's three. It returns one row per state with cents, lines, moved on and stale, and the deadline columns; the headline is summed in TypeScript with `sumCents` and `parseCents`, never `Number` (F10). The tile's lines are counted by the same predicate as its dollars.
- **The ROI statement** (`apps/worker/src/reconcile/statements.ts`): `generateRoiStatement` reads `OPEN_CASES_ACTIONABLE`, the same case set (not resolved or closed) with the predicate per case, and passes it into `roiStatement()`, which only sums it. `packages/ledger` is not touched.
- **The digest** (`apps/worker/src/digest/figures.ts`): "Cases nearing their deadline" sums the predicate and keeps its own case set (D5, F3).
- **The Recovered tile** (`components/dashboard/headline.tsx`): to date, since the first counted entry, and this quarter, both from one ledger read: `practiceRecoveredPeriods()` reads the entries once and the new pure `recoveredPeriods()` splits them (F8). The "this quarter" row of "Where things stand" goes. The to-date value is its own span, `data-figure="recovered-to-date"`; the tile keeps `recovered-total` (F7).
- **Approval words by proof level** (`components/reconciliation/display.tsx`, `apps/worker/src/report/recovered-words.ts`): `PAYER_APPROVED_NOTE`, `PAYER_APPROVED_HOME_NOTE`, `LEDGER_TOTALS_HELP` and `NOTHING_APPROVED_WAITING` are maps by proof level; the ROI page and its PDF share `ACTIONABLE_OPEN_LABEL` and `ACTIONABLE_OPEN_NOTE`.
- **The empty home** (UX-140): `baaOnFile()` and `NO_BAA` move to `lib/uploads/gate.ts`; `dashboard()` adds `uploads.baaOnFile` (`practice_baa_on_file()`, an organization-wide BAA included), and the home checks it, then `page.data.suspension`, in the order Uploads does. `lib/routes/uploads.ts` imports and re-exports both (F11), so `contracts.ts` and `reconciliation.ts` are not edited.
- **Cases** (F5): the column reads "Actionable lines" and each row "{lines in the figure} of {lines not written off}".
- **UX-023's Actionable part closes here** (F4): the tile, the case page and the packet builder name the lines out of the figure and their cause through one helper, `outOfFigureWords()`. UX PR 12 keeps only Written off and the partial answer.
- **Tests and docs:** ADR 0082; test matrix "## Home figures (HOM)", HOM-01 to HOM-04; `packages/synth` module 20 (HOM) with `fixtures/synthetic/HOM-01` to `HOM-04/expected.json`; `tools/screening-capacity/watched-paths.txt` gains `apps/worker/src/triage/actionable-now.ts`.

### CAS-41: the home's cost (F1, F13)

The 100,000-line month (100,040 service lines, 20,420 case lines, 4 cases), run as `tp_app` with the practice scope, medians of 5 `EXPLAIN ANALYZE` runs:

| Measure | Base 83d71fd6 | This pull request |
| --- | --- | --- |
| The home's case statements | three statements: 8300.1 + 8590.3 + 1422.0 = 18312.4 ms | `HOME_CASES`: 7775.4 ms (0.42x) |
| The whole `dashboard()` call (3 runs) | 56.3 to 64.1 s | 47.4 to 48.1 s |

The gate (the new statement at most the sum of today's three) passes, so the home's statement stays in this pull request. On a 10,000-line month: 863.2 ms against 361.7 ms, and the pricing-check calls fall from 3,780 to 1,740. The home as a whole is still not bounded: it reads every ledger entry and runs the stage summary (F13; the file's doc comment says so).

### The words (open question 6)

Read from the code at af3b6d89. Wording is the co-founder's; he may change any of them.

- **Actionable tile:** "what the packets ask for: {N line(s)} in cases still being worked", followed, only when a cause counts one or more, by "; out of the figure: 1 line whose pricing is no longer current, 2 lines moved on past actionable" (stale first, then moved on, each through `counted()`).
- **Case page and packet builder:** "{$} on 3 lines" when the figure holds every line not written off, otherwise "{$} on 0 of the 3 lines not written off; out of the figure: …". The case page's Net expected value: "{$} (actionable less the pursuit cost)".
- **Cases header:** "Each case counts its lines still actionable, on their pricing in effect; a written-off line is struck through and out of it." Column: "Actionable lines".
- **Payer approved, home:** "what payers have agreed to pay on the lines they corrected, from the recovery ledger; counted as recovered only once it is deposited" (posted: "… only once it is posted").
- **Payer approved, Reconciliation:** "what payers agreed to pay, never the patient’s share; counted as recovered only once it is deposited" (posted: "… only once it is posted"). Help: "Payer approved is net of reversals and of what was taken back before it was deposited." (posted: "… before it posted.").
- **Recovered tile:** "to date, since 2026-06-09: cash deposited, proved by the bank export, net of recoupments and reversals", or "to date, nothing deposited yet: …" (posted: "nothing posted yet"); then "This quarter (2026-Q4): {$}".
- **ROI statement, page and PDF:** "Actionable in cases still being worked: {$}"; "Counted when the statement was generated, as the practice home and Cases count: each case’s lines still actionable on their pricing in effect. Not recomputed from its links."; "No case was being worked." (PDF: "No case was being worked when the statement was generated."); "Nothing approved is waiting to be deposited." (posted: "… to be posted.").
- **Empty home:** open: "Upload your first 835 files", "Each file’s receipt follows it from received to loaded, and this page counts what it finds.", "Go to Uploads". No BAA: "Waiting for the business associate agreement", `NO_BAA` ("Uploads open once the practice’s business associate agreement is on file. A platform administrator records it when it is signed."), and "See the agreement chain" for some roles (below). Paused: "Uploads are paused", "They start again once the suspension above is resolved.", no link.

### The agreement chain link (F12)

F12 gives the link to "roles that may open Settings; viewers see no link", but every practice role, viewer included, holds `practice.open` and can open `/settings/agreements`. The build followed F12's words: the link shows when the person holds any role other than viewer (`access.roles.some((role) => role !== 'viewer')`, with a comment pointing at UX-119). The stricter alternative is `rolesPermit(roles, 'agreement.sign')`, the agreements page's own `canConfirm`; say if you prefer it.

## Why

The UX review's PR 9 (`designs/lane-b-ux-review.md` §3.2 "UX PR 9"):

- **UX-003 (C-009, blocking):** the base computes "actionable" four ways: the home tile (live dollars, lines with no pricing check), Cases and the case page (live), the ROI statement (the stored `case.actionable_cents`) and the digest (stored). On the LEDGER story the home tile read $0.00 and the ROI statement $30.00 for the same case.
- **UX-015 (C-048, should fix):** the Recovered tile named no period, "stage five" is internal numbering in read texts, and the Payer approved note said "not cash until it posts" on a practice that proves by deposit.
- **UX-140 (C-183, polish):** the empty home said uploads open once "the agreement chain below" is on file, while Uploads opens on the BAA alone, an organization-wide BAA included.

The design is `designs/lane-b-ux-home-figures.md` on `claude/build-ops` (D1 to D11), as amended by its adversarial review (`wf_132e0b59-2b4`: build with changes; no migration; no frozen code; 13 findings, F1 to F13, all taken). ADR 0082 records the decision. Into `claude/build-platform`, not main.

## What it does not change

- Pricing engine (`packages/pricing`): None. No file under it changes.
- Ledger (`packages/ledger`): None. No file under it changes. The ROI statement's figure is an input to `roiStatement()`, which only sums it; neither `recomputeStatement()` nor `roi_statement_rules()` checks actionable. From 2026-11-01 (ADR 0082) two stored figures mean the live predicate: `roi_statement.actionable_open_cents` and `digest.totals_cents.cases_nearing_deadline_actionable` (F3). No production statement or digest holds the old meaning, since nothing reaches main before launch.
- Database schema and migrations: None. No migration; nothing under `packages/db` changes.
- Content releases (`content/`): None.
- Domain model (`docs/product/domain-model.md`), its approval line and `approvers.json`: None.
- CI and the GitHub settings: None. `tools/screening-capacity/watched-paths.txt` gains one line (`apps/worker/src/triage/actionable-now.ts`), written by `watched.ts --write`.
- **Two figures keep their own count** (F2): the audit report, counted per run, and the monthly summary, counted per month.
- **#42's files:** none edited. Left alone: `lib/routes/practice.ts`, `components/help.ts`, `lib/monitoring/queries.ts`, `digest/job.ts` and `apps/{web,worker}/package.json`. ADR 0039 and ADR 0061 are cited, not edited.

### For Lane A (left out)

- **F9:** a fifth `roi_links_valid()` key, `actionable_open_lines` (the priced_line IDs a statement's actionable figure counted, whose `variance_cents` never change), so a stored statement's figure can be recomputed. A migration; in ADR 0082.
- **Open question 3 (Lane A's PR 11):** should the refreshed `case.actionable_cents` hold the live predicate, so every screen reads an indexed column and the home's time is bounded, or keep the case's ask? Until then the module is the one definition.

Neither blocks this merge.

### Follow-ups

- **`components/help.ts`** (a #42 file) still says "only stage-five amounts are recovered": after #42 merges, the sentence in D8 and a copy-lint rule against stage numbers (open question 5).
- **The home's Agreements card** still reads "No agreements on file … Nothing can be uploaded until they exist." from `practiceHome`'s practice-only agreement query (`lib/routes/practice.ts`, a #42 file). A practice covered by an organization-wide BAA would see that card while the empty state, now correct, says uploads are open. After #42.
- **The audit report** keeps its run-scoped actionable (no pricing check) and its "not cash until it posts" note (`components/reports/display.tsx:78`, `report/html.ts:164`), which has no proof level to word it by (open question 2). A follow-up of its own.
- **The monthly summary** (`lib/monitoring/queries.ts`, its CSV and PDF; a #42 file): count a case line only through the line predicate and report the rest apart as out of the figure (F2). After #42.

### Overlaps with other pull requests

- **#42:** rows only, in `docs/product/test-matrix.md` and `packages/synth/src/cases/{matrix,registry}.ts`; HOM is added after DLR.
- **#85 (UX PR 10):** also changes `lib/routes/uploads.ts`, where this pull request keeps `baaOnFile` and `NO_BAA` re-exported so #85's code still compiles; #85 adds `uploadGate()` (the BAA plus the suspension). Whichever merges second keeps one gate: if #85 is in first, the home reads `uploadGate()`. Both also change `cases/[caseId]/page.tsx` and `apps/web/e2e/packets.spec.ts`.
- **The schema chain** (SS-01, 1b, interest): SS-01 renames `page.data.suspension`, which the empty home reads, to `hold`. Whichever merges second resolves, with the empty state reading the field that is current.

## Checks

The required checks report on this page by themselves: <!-- required-checks -->`all green`, `mutation`,
`screening-capacity gate` and `approval-of-record`<!-- /required-checks -->.

Run by the build on the worktree committed as af3b6d89:

| Command | Result |
| --- | --- |
| `pnpm test` (unit, with coverage) | Pass: 404 files, 6818 tests passed, 4 skipped; coverage thresholds met. |
| `pnpm test:db` (the whole db project; every shard of the 6-shard plan holds a changed or related test) | 126 files pass. 5 files (rule-tables catalog, release load, domain-model, domain-model-drift, function-files) failed only because the local default database was PostgreSQL 16 after a restart, which has no catalogued NOT NULL constraints and no MAINTAIN privilege; on PostgreSQL 18, which the repository and CI target, the 5 pass (34 tests). |
| The 13 changed and related db files on PostgreSQL 18, catalog and cross-tenant included | Pass: 1265 tests. |
| `pnpm build` | Pass. |
| `pnpm test:e2e` (reconciliation, ledger-patient-share, monitoring, packets, reports, onboarding, brand and triage) | Pass: 19 tests. |
| `pnpm typecheck` | Pass: 22 projects. |
| `pnpm lint` | Pass after one fix (`negateCents` in `recovered-periods.test.ts`). |
| `pnpm lint:copy` | Pass: 539 files. |
| `pnpm lint:logs` | Pass: 1085 files. |
| `pnpm synth --all` | 0 written, 654 unchanged. |
| Stryker affected, then the gate | No money shard affected; the gate passes ("No money path changed"). |
| `tools/screening-capacity/watched.ts --write` | +1 line (`apps/worker/src/triage/actionable-now.ts`), kept in this pull request. |
| CAS-41 measurement (F1, F13) | Gate passes; numbers above. |

The e2e and the design differ on one point. LED-06's world reads $30.00 on 1 line with nothing out of the figure: after the recoupment its reopened line is still on its pricing in effect. The design's §5 expected $0.00 with one stale line. HOM-04 therefore reads the amount from the home tile and checks that Cases' header, the case page and a statement generated after the recoupment show the same one, rather than hard-coding it; the db test asserts the $30.00 its world gives.

Not run here: `pnpm test:golden` and `pnpm verify-content` (the fix round runs the full suite).

## Reviewer agents' findings

| Reviewer | Finding | Resolution |
| --- | --- | --- |
| Design review (`wf_132e0b59-2b4`; payment-engine checklist with the UX and brand lens) | F1: compute the per-line value once behind a fence; gate on CAS-41 | Fixed in af3b6d89: `OFFSET 0` derived table; the check computed at one plan node and called once per line at actionable (HOM-01); gate passes. |
| Design review | F2: name the audit report and the monthly summary as exceptions | Fixed in af3b6d89 (ADR 0082, test matrix); the monthly summary is a follow-up after #42. |
| Design review | F3: the digest's stored figure changes meaning too | Fixed in af3b6d89 (ADR 0082; `digest/figures.ts`'s comment). |
| Design review | F4: count and name the lines out of the figure | Fixed in af3b6d89 (`outOfFigureWords()` on the tile, case page and packet builder; HOM-02). |
| Design review | F5: Cases rows count the figure's lines | Fixed in af3b6d89 (HOM-01). |
| Design review | F6: Payer approved note and help by proof level | Fixed in af3b6d89. |
| Design review | F7: the to-date value its own span | Fixed in af3b6d89 (`recovered-to-date`; e2e specs follow). |
| Design review | F8: one ledger read for both periods, with a property test | Fixed in af3b6d89 (`recoveredPeriods()`; `recovered-periods.test.ts`). |
| Design review | F9: the ROI words; a fifth `roi_links_valid()` key | Words fixed in af3b6d89; the key is deferred to Lane A (a migration; "For Lane A" above). |
| Design review | F10: sum the headline in cents, `ORDER BY c.state`, the deadlines filter | Fixed in af3b6d89. |
| Design review | F11: keep `baaOnFile` and `NO_BAA` importable from `uploads.ts` | Fixed in af3b6d89 (re-export). |
| Design review | F12: the agreement chain link for roles that may open Settings | Fixed in af3b6d89 (any role but viewer); the stricter alternative is above. |
| Design review | F13: record the whole `dashboard()` time | Fixed: recorded above and in `lib/dashboard/queries.ts`'s doc comment. |
| UX and brand reviewer (`.claude/agents/ux-brand-reviewer.md`) | Not run yet | Stage 4, on this head: before shots taken at 83d71fd (35 shots, `wf_c880ba51-8cf`), after shots at 1280 and 390 px light and 1280 px dark. |
| Payment-engine reviewer (`.claude/agents/payment-engine-reviewer.md`) | Not run yet | Stage 4: the ROI statement's and the digest's figures, `packages/pricing` and `packages/ledger` untouched, and whether the stored figures' new meaning needs a freeze exception. |

## Freeze exception

No: it changes none of them. The payment-engine review (stage 4) checks this again for the ROI statement's and the digest's stored figures.

## Domain model

No migration; the document is unchanged.

## The founder's approval

This pull request merges only after the founder's approving GitHub review of its latest commit and green required
checks. The build waits for that review from the day it works under its own GitHub account
(`docs/runbooks/github-governance.md`, 3i), and from step 5 GitHub requires it too; before 3i, on green checks alone
(reconciliation 001, D4 (a)). The review is the record of the approval, not anything written here; a new commit
dismisses it. The build then merges, and never reviews.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01FcouKPLmdYyBmbVaUjag2c
