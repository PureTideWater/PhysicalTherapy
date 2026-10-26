# Every figure explained in words (combined audit #38; LANES queue item 7)

Lane B, branch `co-001/figures-in-words`, worktree `/home/user/figures-in-words`, cut from the latest
`claude/build-platform` (6ddd587 at design). Design of 2026-10-26. Design step only: nothing was built, committed,
pushed or posted. Claim: `/home/user/ops/LANES.md:172`. Status: `approval-summaries/lane-b-figures-in-words-status.md`.

Reserved for this claim: ADR 0072; test-matrix CAS-30 to CAS-37; `packages/synth` cases CAS-30 to CAS-37. The claim
is shared with #48 (`co-001/narrative-draft`), which follows this PR. **This PR takes ADR 0072 and CAS-30 to CAS-34.
It leaves CAS-35 to CAS-37 to #48.** #48 needs no ADR of its own unless its design says so; if it does, it takes the
next free number on the branch (LANES rule on ADR numbers).

Sources:
- the audit entry: `/home/user/ops/audits/combined/combined-report.md:535-542`, its table row `:96`;
- `docs/product/reconciliation-001.md`: PR 12 `:201-209`, PR 13 `:211-221`, D5 `:289-292`, the checks `:440-486`,
  the Approval `:488-500`;
- `docs/adr/0061`, audit #37 part 1 (D1 to D8, `:675-760`), the payer's copy rulings;
- `docs/product/change-order-001.md` CO-05 `:46-50`, CO-06 `:52-65`, CO-11 `:93-97`;
- `.claude/rules/brand.md`, `docs/brand/BRAND.md` §7, `apps/web/src/lib/copy/words.ts`;
- the four scout maps of this workflow (trace, web, packets, decisions), each checked again against the tree where this
  design relies on it. Citations below are `file:line` at 6ddd587.

---

## 0. In one screen

- **One renderer, code only.** A new module, `packages/packets/src/explain/`, turns a stored trace into plain
  sentences and, for a percent-of-Medicare or Medicare Advantage line, a fee-schedule worksheet. It is pure and
  deterministic: the parsed trace and the contract page in, words out. It computes nothing. Every figure it prints is
  a value the trace or the rate record holds, formatted for display. No model is involved anywhere.
- **Used the same way on four surfaces:** the line trace page, the packet builder, the packet review and the payer's
  PDF. The review page and the PDF call the same function with the same audience (`payer`), so the reviewer reads
  what the payer reads under the same renderer, which a `WORDS_VERSION` guard holds across a deploy at approval, at
  the export request and in the export job (3.8; review finding M1). The case Calculations tab does not exist yet; PR 13 builds it on this renderer (an
  amendment says so). The CSV does not change (ADR 0061 D3 pins it).
- **Three audiences.** `internal` (roles with `phi.read`: dates shown), `viewer` (no date of any kind), `payer` (no
  date, no window status, no release, no rule record, no flag that is off, no NCCI or MUE note, no code but the seven of `PAYER_CODES`, each written out).
- **No migration.** The worksheet is not stored. It is rendered at review and export time from `priced_line.trace`.
  The approved content already pins each trace by `calculation.trace_sha256`, which `approved_sha256` covers. The
  renderer refuses a trace whose SHA-256 differs. The packet format stays `tp-packet/2`. A stored worksheet (a
  `tp-packet/3`) would need DDL and the founder's domain-model approval; it is not built and is offered to Lane A only
  if the founder wants it (section 2.2).
  **Confirmed again after the adversarial review:** every fix of section 13 is code only. The one fix the reviewer
  proposed that would have needed DDL (recording the words version in audit events, which have no detail column) is
  replaced by code-held guards; storing the words version is recommended to Lane A, not built here.
- **No engine, ledger or #42 change.** Nothing under `packages/pricing` changes. The ledger is not touched. None of
  #42's files are touched except the shared `packages/synth/src/cases/{matrix,registry}.ts` and
  `docs/product/{test-matrix,reconciliation-001}.md`, and those only by added rows and lines.
- **Tests:** CAS-30 to CAS-34; a property test that every figure in the words is in the trace or the rate record
  (checked two independent ways, and each figure against a fixed table of the trace path its slot must print); every
  golden claim's words pinned inside `packages/packets` (no new dependency anywhere); one unit test per step kind; component tests for
  the line page and the packet calculation; e2e checks on each screen; a new mutation shard for the new money-touching
  files.
- **D5 (b)** is closed in the plan by an added line, under the founder's adoption of the audit and the co-founder's
  delegation: nothing is deferred. **PR 12 and PR 13** gain added acceptance checks for the export scopes and the
  drill-down; they are built in those PRs, not here.

---

## 1. The problem (audit #38, checked against the tree)

- **The line trace page prints raw computer text.** Each step is `JSON.stringify(value, null, 2)` in a `<pre>`
  (`apps/web/src/lib/pricing/view.ts:147`; `apps/web/src/app/p/[practiceId]/lines/[lineId]/page.tsx:157`). The method
  is a bare code (`:74`). Adjustments read "mppr (5000 to 4500 cents)" (`:76`). The unrounded amount is raw cents
  (`:69`). The unpriced reason is a bare code (`:90`, `:126`).
- **Viewers see no steps.** `pricedLineOf` reads the trace only for `phi.read` (`apps/web/src/lib/pricing/queries.ts:400`,
  `CASE WHEN $4 THEN p.trace END`), and `linePage` builds `steps: []` without it (`apps/web/src/lib/routes/remittances.ts:255`).
- **The review screen and the PDF word the calculation differently.** The PDF prints `per unit $50.00; base
  $100.00` with `formatUnroundedUsd` and refuses a code with no words (`apps/worker/src/packets/html.ts:89-95`,
  `words.ts:20-68`). The web prints `Unit 5000 cents`, falls back to `labelOf` for an unknown code, and uses a second
  vocabulary (`apps/web/src/components/packets/display.tsx:30-45, 279-332`; `lib/contracts/display.ts:43, 172`).
- **The packet's calculation drops the fee schedule.** `lineCalculation` copies only step amounts
  (`packages/packets/src/calculation.ts:29-58`). The RVUs, setting, locality, GPCIs and conversion factor are in the
  trace (`packages/pricing/src/trace.ts:125-157`) but in no packet, so a payer cannot check a percent-of-Medicare or
  MA amount against CMS's own fee schedule.
- **D5 (b) is still open** as written (`reconciliation-001.md:289-292`; the Approval `:491` chose (a) and left (b) for
  after PR 7). **PR 12's and PR 13's acceptance checks** test neither the executive and auditor scopes nor the
  drill-down (`:208`, `:219`).

---

## 2. Confirmed at design: no migration

### 2.1 Why none is needed

The audit says "Pricing engine: no. Ledger: no. Database: no." This design keeps all three.

- **The renderer reads; it never writes.** It is a pure function in `packages/packets`. It reads the trace through
  `parseTrace` (`packages/pricing/src/trace.ts:340`), a read-only import of the frozen engine package.
- **The worksheet is rendered, not stored.** Postgres pins stored packet content: `packet_content_valid()` accepts
  only `tp-packet/1` or `/2`, and the `packet_version_deadline_stated` trigger requires each line's `calculation`
  (less `trace_sha256`) to equal `priced_line_calculation(trace)` exactly
  (`packages/db/migrations/20261103090000_deadline_verification_and_export_attestation.sql:420-479, 835-873, 884-985`,
  the equality at `:910`). This design adds nothing to `content`, so none of that is touched.
- **The binding already exists.** Each line's `calculation.trace_sha256` is inside the content, and the content's
  SHA-256 is what the approver approves (`approved_sha256`; ADR 0041). `priced_line` is immutable for every role
  (`20261018090000_pricing_runs.sql:168-173`). So **every figure** a worksheet rendered from the trace prints is as
  bound to the approval as a stored one: the renderer checks the hash before it prints. **The words around the
  figures are not:** they are rendered again at review, at export and at attestation by whatever renderer is
  deployed then (review finding M1). This PR binds them as far as it can without DDL (the `WORDS_VERSION` guards of
  3.8) and names the residual gap; storing the version the approver saw needs a column, which is Lane A's (2.2).
- **The reads need no grant or policy.** `priced_line` is practice-scoped by RLS only (`20261018090000:223-225`), and
  the reviewer, the drafter and the export job each read inside the practice's scope already. A new audit-read purpose
  is free text checked by a pattern (`20261015140500_audit_and_operations.sql:15`), not an enum.
- **No engine change.** No file under `packages/pricing` changes (`tools/engine-freeze`). `recompute(trace)` and the
  golden lines are untouched. `fixtures/golden` gains no file (the golden traces and pinned words live under
  `packages/packets/src/explain/__golden__/`, section 4.2).
- **No ledger change.** Nothing in `packages/ledger` or the reconcile worker is touched.
- **No content-pipeline change.** No release under `content/releases/**` or `fixtures/synthetic/rules/` changes.
  `docs/product/unpriced-reasons.md` is read by a test and never edited. The Medicare flag defaults are unchanged.
- **No #42 file** but the four shared ones named in section 9, by added rows only. No `package.json` and no
  `pnpm-lock.yaml` changes (both are #42's): every test below runs where its imports already resolve (review findings
  B1 and B2).
- **No audit or job-table change.** `audit_event` has no detail column (`20261015140500_audit_and_operations.sql:5-20`),
  so this PR records no words version there. The export job's payload gains an optional `words_version` in its Zod
  schema (`apps/worker/src/jobs/registry.ts:58`); Postgres holds no payload shape, so that is code only.

### 2.2 What is split out (Lane A, only if the founder asks)

- **A stored worksheet (`tp-packet/3`).** It would let the database itself check the worksheet, and let a reader of
  the stored content alone see it. It needs a migration touching `packet_content_valid`, the
  `deadline_verification_status` generated column (drop and re-add), `packet_version_deadline_status`, the
  `packet_version_deadline_stated` trigger and `priced_line_calculation`, plus a regenerated domain model and the
  founder's approval. It also turns every existing `/2` version into `inputs_differ` at export
  (`apps/worker/src/packets/records.ts:474-531`). **Not recommended now:** the render-time worksheet gives the payer
  and the reviewer the same pages with the same binding, and no packet has been submitted yet. It goes in the status
  file as a proposal for Lane A, not as work.
- **The words version the approver saw, stored (recommended to Lane A).** Two nullable columns on `packet_version`,
  `approved_words_version` and `export_words_version` (text, `CHECK (... ~ '^[0-9a-f]{64}$')`), the first set with
  the approval in the same statement and the trigger's approval guard widened to it, the second by the export job.
  The export job would then refuse a version whose approval names another words version ("approve again"), and the
  review page would disable Attest when its words version differs from the export's. This closes the one gap the
  no-DDL guards leave (approved under one renderer, a deploy, then exported under another; 3.8). It is a migration
  with a regenerated domain model and the founder's approval, so it is Lane A's. **Recommended, not built here**:
  before the first packet is submitted, the gap is narrow (approval and export are minutes apart today) and the
  guards of 3.8 refuse every case they can see.

---

## 3. The design

### 3.1 Where the renderer lives, and why

**`packages/packets/src/explain/`**, a new folder of `@tp/packets`, exported two ways:

- `@tp/packets/explain` (new subpath in `packages/packets/package.json`): the pure functions and the word tables. No
  `node:crypto`, no database, no I/O, so a client component may import it.
- `@tp/packets` (the root index): also `explainPacket()`, which checks each trace's SHA-256 (it uses `traceSha256`,
  which needs `node:crypto`) and then calls the pure functions.

Why there:
- **Both apps already import it.** The web (`display.tsx:1`) and the worker (`html.ts:3`) depend on `@tp/packets`,
  and it already depends on `@tp/pricing` and `@tp/money` (`packages/packets/package.json`). One source serves the
  line page, the review page and the PDF.
- **It is a money package under the mutation gate** (`stryker/base.mjs:48-66`, 85%; ADR 0066 Part 4) and in the
  payment-engine reviewer's scope. A renderer in `apps/web` or `apps/worker` would not be mutation-tested.
- **It is under the copy lint** (`tools/brand-copy/scan.ts:60`, `packages/packets/src` is a `COPY_ROOT`).
- **Not `packages/pricing`** (frozen). **Not a new package:** it would need its own lint, mutation and review wiring
  for no gain.

Files:
| File | Holds |
|---|---|
| `explain/words.ts` | The one vocabulary: methods, steps, rounding rules and origins, settings, conversion-factor applicability, timed-units rules, year bases, observed bases, claim statuses, adjustment names, unpriced reasons (meaning and remedy) and every unpriced detail. `ExplainWordsError`. |
| `explain/figures.ts` | The display forms (`dollars`, `exactDollars`, `percent`, `perRvu`, `verbatim`, `count`), each a pure formatter over trace text (or, for `count`, an array's length), and the `Segment` type. |
| `explain/slots.ts` | The fixed table, per sentence form and slot, of the trace path that slot must print (for example the summary's `rounded once to` → `steps.rounding.rounded_cents`). `line.ts` builds every figure segment from it; the tests assert against it (finding m5). |
| `explain/version.ts` | `WORDS_VERSION`, a 64-hex literal, and `RENDERER_REVISION`, an integer bumped by hand with any change to a sentence form (finding M1). The literal keeps the subpath free of `node:crypto`. |
| `words-version.ts` (root of src) | `wordsVersionOf()`: the SHA-256 of the canonical JSON of every word table, the slot table of `slots.ts` and `RENDERER_REVISION`. `version.test.ts` requires `WORDS_VERSION === wordsVersionOf()` and prints the value to write when it differs. (Not a `tools/` script: `@tp/tools` cannot import `@tp/packets`, finding B1.) |
| `explain/line.ts` | `explainLine(trace, context, audience)`: the summary sentence and one block per step. |
| `explain/worksheet.ts` | `feeScheduleWorksheets(lines, audience)`: one worksheet per distinct set of records. |
| `explain/index.ts` | Re-exports (types, the three functions and `WORDS_VERSION`). |
| `explain/__golden__/` | The golden claims' traces (`<claim>.traces.json`) and the pinned words (`<claim>.txt`), section 4.2. |
| `explain.ts` (root of src) | `explainPacket(content, traces, audience)`: the hash check, then the two functions. |

### 3.2 Inputs and outputs

```ts
/** What the words may cite beside the trace: the contract page (rate_record.evidence.page) or the regulation. */
export type ExplainCitation =
  | { readonly kind: 'contract'; readonly page: number }
  | { readonly kind: 'regulation'; readonly reference: string } // '42 CFR 422.214'
  | null; // an unpriced line that never reached an agreement

export type Audience = 'internal' | 'viewer' | 'payer';

/**
 * A run of text; one figure with where it came from; a fixed code from the word tables (AMT B6, CQ), set in mono; or
 * a label (a schedule row or worksheet number). Text segments hold no digit (a test holds that), so no number can
 * hide in a template.
 */
export type Segment =
  | { readonly text: string }
  | { readonly figure: string; readonly source: FigureSource }
  | { readonly code: string } // only from CODES (internal, viewer) or PAYER_CODES (payer) of explain/words.ts
  | { readonly label: string; readonly of: 'row' | 'worksheet' }
  | { readonly quoted: string; readonly from: 'unpriced_reasons' }; // a meaning or remedy, word for word from the doc

/** The value a figure prints: a JSON path into the trace or the citation, and the display form used. */
export interface FigureSource {
  readonly from: 'trace' | 'citation';
  readonly path: readonly (string | number)[]; // e.g. ['steps', 'fee_schedule', 'gpci', 'work_gpci']
  readonly form: 'dollars' | 'exact_dollars' | 'percent' | 'per_rvu' | 'verbatim' | 'count'; // count: an array's length
}

export interface Sentence { readonly segments: readonly Segment[] }

export interface StepWords {
  readonly step: 'agreement' | 'terms' | 'fee_schedule' | 'units' | 'per_visit' | 'ncci_ptp' | 'mppr'
    | 'assistant_reduction' | 'sequestration' | 'contract_adjustment' | 'patient_share' | 'rounding'
    | 'observed' | 'window' | 'outcome';
  readonly sentences: readonly Sentence[];
}

export interface LineWords {
  readonly summary: Sentence;
  readonly steps: readonly StepWords[];
  /** The worksheet's grouping key, null when the line read no fee schedule. */
  readonly worksheetKey: string | null;
}

export interface Worksheet {
  readonly key: string;
  readonly title: Sentence;
  readonly rows: readonly Sentence[];
  readonly parts: readonly { readonly part: 'work' | 'pe' | 'mp'; readonly rvu: Segment; readonly gpci: Segment; readonly unit: Segment }[];
  readonly check: Sentence; // how to check it against CMS's look-up
  /** The packet rows (or the one line) that use it. */
  readonly lines: readonly number[];
}
```

- **Which segment kind holds what.** `CODES` is a fixed list of the codes the words name beside their words:
  `AMT B6`, `ZIP+4`, `CQ`, `CO`, `MPPR`, `NCCI`, `MUE`, `RVU`, `GPCI`, `APM`, `CMS`. **`PAYER_CODES`** is the payer
  audience's own allow-list: `ZIP+4`, `RVU`, `GPCI`, `CQ`, `CO`, `APM`, `CMS` (finding M3: the worksheet and the
  assistant sentence need them). In the payer words each is written out at its first use in a packet: `relative value
  units (RVU)`, `geographic practice cost index (GPCI)`, `qualifying alternative payment model (APM) participants`,
  `the Centers for Medicare & Medicaid Services (CMS)`; `CQ` and `CO` always stand beside `services by a therapy
  assistant`. The closed list's meaning and remedy are `quoted` (`Claim status 2 or 3` holds digits the trace does
  not; SECONDARY_PAYER's meaning is not quoted, 3.5). Both kinds are masked by the parse test of 4.1 and
  held by their own assertions (the `CODES` list; the doc parity test).
- `explainLine` is a pure function of `(trace, citation, audience)`. Same input, same output, byte for byte.
- A screen renders `{ text }` as text and `{ figure }` in the mono face with tabular numerals (brand rule). The PDF
  wraps a figure in the report frame's figure span (`apps/worker/src/report/escape.ts`, as `escapeWithFigures` does).
- `plainText(sentence)` joins the segments; tests and the CSV-free PDF table use it.

**The rule the renderer keeps:** it never adds, subtracts, multiplies, divides, compares by size, rounds or negates a
value. It only (a) prints a trace value through a formatter that changes its form, never its value, (b) prints the
length of an array the trace holds (the `count` form, the one derivation allowed; finding m6), and (c) chooses words
by a value's kind or by string equality of trace values the engine wrote (for example `before_cents === after_cents`
for "unchanged", `payer_share_cents === "0"` for a payer's share floored at zero, `agreement.outcome ===
"MA_NONCONTRACTED"` for Medicare's own rules). The mutation shard and the figure tests hold it to that.

### 3.3 The three audiences

| Content | internal (phi.read) | viewer | payer (review page and PDF) |
|---|---|---|---|
| Summary sentence | yes | yes | yes |
| Agreement, terms | yes | yes | terms only, in the contract's words |
| Release number | yes | yes | no ([2] of the PDF names releases; PR 12 part 3 words them) |
| Fee schedule step and worksheet | yes | yes | yes |
| Any date (service, payment, as-of, window, record effective dates) | yes | **no** | **no** |
| Window step (length, start, end, status) | yes | length and start only, no date, no status | **no** (the PDF's own window section prints it; ADR 0061 Q3 (a)) |
| A step whose flag is off ("not applied") | yes | yes | **no** |
| NCCI edits and the MUE | yes | yes | **no** (review flags are internal) |
| CARC group and reason codes | yes (as the line page shows them) | yes | **no** (no code without words) |
| Unpriced reason, detail and remedy | yes | yes | not applicable (a packet holds priced lines only) |

- **Years are not dates.** The basis year (`2026`) is printed for every audience. It is not PHI (a year alone is
  allowed under the Safe Harbor) and the worksheet needs it.
- **No PHI beyond what the screen already shows.** The trace holds no name, date of birth, member ID or claim number
  (trace scout §9.8). The internal variant shows the dates the same roles already see on the page. The viewer variant
  holds none. The payer variant holds none of its own; the PDF's schedule already prints what D2 admits.
- **The payer variant passes the payer copy's own scan, the whole of it:** every pattern of
  `PAYER_COPY_INTERNAL_TERMS` (`packages/packets/src/test-support.ts:159-185`: SHA-256, hash, trace, verif, audit,
  PaidWhole, rule release, pricing run, priced line, manifest, `\bL[1-3]\b` and the rest) and `CODE_SHAPES` (today
  `apps/worker/src/packets/test-support/payer-copy.ts:44`, moved into `@tp/packets/testing` and re-exported by the
  worker file so both use one list; finding M5), plus no hex run and no UUID. So the worksheet says "check", never
  "verify"; it says "the calculation", never "the trace" or "the engine's expression"; it names no release.

### 3.4 The exact words, per step kind

Notation: `{x}` is a figure segment printing trace field `x` in the named form. `[...]` is printed only when its
condition holds. Forms: **dollars** = `formatUsd(parseCents(x))` for whole-cent text; **exact dollars** =
`formatUnroundedUsd(x)` for decimal cents (keeps every fraction digit: `2323.2` prints `$23.232`); **percent** = the
text and `%` (`110` prints `110%`); **per RVU** = `$` and the dollars text as written, then ` per RVU` (`20.0000`
prints `$20.0000 per RVU`); **verbatim** = the text as the trace holds it (`0.31`, `97110`, `99999`). Line numbers and
ranks print as integers. A count uses `counted()` semantics (`1 unit`, `2 units`), chosen by string equality with
`"1"`, never by arithmetic.

**Summary (one sentence per line, the audit's form).**
- Priced, a fixed or percent schedule, units multiply:
  `{units} units × {unit_cents} = {schedule_cents} [under the contract's clause on page {page}] [under 42 CFR 422.214];
  [after the multiple procedure payment reduction {after}]; [after the assistant reduction {after}]; [after
  sequestration {after}]; [after the contract's adjustment {after}]; rounded once to {rounded_cents}; observed allowed
  {observed_allowed_cents}; short {variance_cents}.`
  - Example (the audit's): `2 units × $50.00 = $100.00 under the contract's clause on page 2; rounded once to
    $100.00; observed allowed $70.00; short $30.00.`
- Lesser of: `Lesser of the schedule {schedule_cents} and the line charge {charge_cents}: {base_cents} under the
  contract's clause on page {page}; ... rounded once to ...`.
- Per visit, the carrying line: `{amount_cents} once for the visit under the contract's clause on page {page}; ...`.
  Another line of the visit: `The visit's amount is carried by line {carrier_line_no}; this line's base is
  {base_cents}; ...`.
- The tail when the variance is zero (`variance_cents === "0"`): `...; observed allowed {x}; no variance.` When it is
  negative (its text starts with `-`): `...; observed allowed {x}; variance {variance_cents} (overpaid: recorded,
  never pursued).` The figure prints signed as the trace holds it (`-$5.00`); the renderer never negates it.
- The payer audience prints the same summary. The adjustments named are only those in `steps.adjustments`.
- **Another claim line, named in payer words** (finding m10): always `claim line {line_no}`, never a bare `line`, and,
  when that line is also in the packet, `(row {row})` beside it, a label segment. The packet's own rows stay `Row {n}`.
- Unpriced: `Not priced: {meaning}.` (see 3.5).

**Agreement** (internal, viewer).
- `CONTRACT_RATE`: `The plan's mapping names a contract; its signed-off version prices this code by one rate record
  [, cited on page {page}].`
- `MA_NONCONTRACTED`: `The plan is mapped as Medicare Advantage with no contract: priced at Original Medicare's amount
  under 42 CFR 422.214.` The reference is a citation figure from `MA_NONCONTRACTED_CITATION` (moved into
  `@tp/packets`, section 7).
- A stop: the outcome's words (3.5). `AMBIGUOUS_RATE` adds `{n} rate records match.` where `n` is a figure in the
  `count` form over `matching_rate_record_ids` (its path in `slots.ts`; the figure test counts it the same way).

**Terms** (all audiences; the payer prints only the first sentence).
- Method line: `Fixed schedule: {fixed_amount_cents} per unit.` | `Per visit: {fixed_amount_cents} per visit.` |
  `Percent of Medicare: {percentage} of the Medicare physician fee schedule, {year words}, {locality words},
  with the conversion factor {applicability words}.` | `Lesser of the line charge and {schedule words}.` |
  `Medicare Advantage, non-contracted: {percentage} of the Medicare physician fee schedule, {year words}, the
  practice's locality, with Medicare's reductions, under 42 CFR 422.214.` The percentage is the
  trace's (`terms.percent_of_medicare.percentage`, `100` from the MA constants, `packages/contracts/src/terms.ts:358-361`)
  and the reference a citation figure, so the words hold no literal number.
  - **Year words come from what the engine did, not from the label** (finding M4). They are chosen from
    `steps.fee_schedule.lookup` and `steps.fee_schedule.basis_year`: `in_force_on_service_date` → `the records in
    force on the service date`; `latest_in_basis_year` → `locked to {basis_year}, the latest records in force during
    that year`. `terms.percent_of_medicare.year_basis` is checked against the lookup by string equality and never
    printed on its own: `CURRENT` must go with `in_force_on_service_date`, and `LOCKED:` followed by the
    `basis_year` text with `latest_in_basis_year`. Any other pair (a malformed `LOCKED:` priced as CURRENT, Lane A's
    open engine defect 2, `LANES.md:180`) throws `ExplainShapeError`, so the line refuses (3.7) rather than says
    "locked" over a lookup in force on the service date. A line that stopped before the fee schedule has no lookup;
    its terms sentence leaves the year out (`of the Medicare physician fee schedule, {locality words}, ...`).
  - **Locality words** (finding m2), from `terms.percent_of_medicare.locality_basis.kind`: `PRACTICE` → `the
    practice's locality`; `NAMED` → `carrier {carrier} locality {locality}, as the rate record names it` (both
    verbatim figures). A `NAMED` line stops at the fee schedule (`locality_basis_not_in_phase_one`,
    `engine.ts:561-562`); its words then read the stop's detail (3.5).
  - Applicability: `non_qualifying_apm` → `for clinicians who are not qualifying APM participants`; `qualifying_apm` →
    `for qualifying APM participants`.
- Contract adjustment: `PERCENT` → `The rate record pays {percent} of the amount after the Medicare reductions.`;
  `CAP` → `The rate record caps the line at {cap_cents}.`
- Flags that are on (internal, viewer), **a contract line** (`agreement.outcome === "CONTRACT_RATE"`): `Applied, as
  the rate record's flags are on: {list}.` **A Medicare Advantage non-contracted line** (`agreement.outcome ===
  "MA_NONCONTRACTED"`, string equality; finding M2): `Medicare's reductions apply to a non-contracted Medicare
  Advantage line under {42 CFR 422.214}: {list}.` There is no contract or rate record for such a line: its flags are
  `MA_NONCONTRACTED_FLAGS` (`packages/contracts/src/terms.ts:209-216`), and the words never attribute them to one.
  Each name in words: `the multiple procedure payment reduction`, `the assistant reduction`, `sequestration`, `NCCI
  edits`.
- **Flags that are off** (internal, viewer only): `Not applied (flag off): {list}.` Nothing more. Never "the contract
  does not apply", never "excluded by the contract": an omitted flag defaults to false
  (`packages/contracts/src/terms.ts:218-230`), so the trace cannot tell a contract's "no" from its silence.
- Timed units: `MEDICARE_POOLED` on a contract line → `Units as billed; the contract follows Medicare's pooled
  timed-units rule.`; on an MA non-contracted line → `Units as billed; Medicare's pooled timed-units rule applies.` |
  `PER_CODE` → `Units as billed; timed units are counted per code.` (`UNKNOWN` stops the line; 3.5.)

**Fee schedule** (all audiences; the payer reads it in the worksheet, not repeated per line).
- `Fee schedule: the {basis_year} records [in force on the service date | in force on {service_date}] | [the latest in
  force during {basis_year}].` (internal prints the date; viewer and payer say "the service date".)
- `Code {hcpcs} at the {setting words} rate: place of service {place_of_service} is {setting words} in the practice's
  settings.` (setting words: `facility`, `non-facility`.)
- `Locality: practice ZIP {zip} is Medicare carrier {carrier}, locality {locality}.` With the ZIP+4:
  `Practice ZIP {zip} needs its ZIP+4: {zip_plus_four} falls in {from} to {to}, carrier {carrier}, locality
  {locality}.` (The practice's ZIP is practice data, not PHI.)
- Then the worksheet (3.6) on the line page; a pointer to it in the packet (`See fee schedule worksheet {n}.`, where
  `n` is a label, not a figure).

**Units** (internal, viewer; the payer reads them in the summary).
- `{units} units billed, taken as billed.`
- MUE checked: `The MUE for code {code} is {value}; the units are within it.` (The line is priced, so the engine
  passed it.) No record in force: `No MUE is in force for the code on the service date.` Not checked: `MUE not checked
  (flag off).`
- `{units} × {unit_cents} = {schedule_cents}.` For `LESSER_OF`: `Lesser of the schedule {schedule_cents} and the line
  charge {charge_cents}: {base_cents}.`

**Per visit** (all audiences).
- Carrying line: `{amount_cents} once for the visit, carried by this line (line {carrier_line_no}); the visit's lines
  are {visit_line_nos}.`
- Another line: `The visit's {amount_cents} is carried by line {carrier_line_no}; this line's base is {base_cents}.`

**NCCI procedure-to-procedure** (internal, viewer).
- Off: `NCCI edits not checked (flag off).`
- No edit: `No NCCI edit pairs this code with another line of the claim on its date.`
- An edit that stands: `Line {column1_line_no}'s code {column1_code} is column 1 to this code: the edit stands. It is
  a review flag and does not change the amount.`
- Bypassed: `... : bypassed by modifier {modifier} on line {line_no}, as the edit's modifier indicator is
  {modifier_indicator}.` The modifier is a figure from the trace (`line.modifiers` or `column1_modifiers`), the first
  one in the engine's bypass set; the words never print the set itself.

**Multiple procedure payment reduction** (all audiences).
- Not in the pool: `The multiple procedure payment reduction does not apply to this code (it is not an
  always-therapy code); {before_cents} is unchanged.`
- In the pool, this line holds rank 1 only: `This line's unit holds the highest practice-expense part of the claim's
  day ({pe_cents}) and is kept whole; {before_cents} is unchanged.`
- In the pool, reduced: `Ranked by practice-expense part on the claim's day, the first unit is line {line_no}'s
  ({pe_cents}). Each later unit loses {reduction_percent} of its practice-expense part: unit {unit} (rank {rank})
  loses {cut_cents}[; unit {unit} (rank {rank}) loses {cut_cents}]. {before_cents} becomes {after_cents}.`
  - The ranking in the trace holds only the day's first unit and this line's units (`engine.ts:739-741`), so the
    words name no other line's rank. Internal prints the day as `on {service_date}`.
  - Which percent: the code's own share (`code_record`) or the general reduction (`general_record`): `(the code's own
    reduction)` or `(the general practice-expense reduction)`, chosen by which record is non-null.

**Assistant reduction** (all audiences).
- Internal and viewer: `Modifier {modifier} (services by a therapy assistant): the release pays {payment_percent} of
  the amount. {before_cents} becomes {after_cents}.` Payer (finding m10): `Modifier {modifier} (services by a therapy
  assistant): Medicare's assistant percentage is {payment_percent} of the amount. {before_cents} becomes
  {after_cents}.` With CQ and CO both present: `Modifiers CQ and CO: one reduction, as their
  percentages agree: ...` (`engine.ts:791-793`). Modifiers are codes with their words beside them, so the payer copy
  may print them as the PDF's schedule already does.

**Sequestration** (all audiences).
- In force: `Sequestration: the payer's share is {before_cents} less the patient share {patient_share_cents}, which is
  {payer_share_cents}; {reduction_percent} of it, {cut_cents}, is withheld. {before_cents} becomes {after_cents}.`
- In force, the payer's share floored at zero (`payer_share_cents === "0"`, string equality on the trace's decimal
  text; the engine floors it, `engine.ts:836-837`; finding m1): `Sequestration: the patient share
  {patient_share_cents} leaves no payer's share, so nothing is withheld; {before_cents} is unchanged.` Never
  "{before} less {ps}, which is $0.00", which states false arithmetic.
- Suspended: internal and viewer, `Sequestration is suspended on the service date in the release's record: no cut.
  {before_cents} is unchanged.`; payer (finding m10), `Sequestration is suspended on the service date in Medicare's
  sequestration record: no cut. {before_cents} is unchanged.` **Never "0%":** a suspended record carries `0`, which the source does not state as a rate
  (`packages/rules/src/schema.ts:266-276`).

**Contract adjustment** (all audiences).
- PERCENT: `The rate record pays {percent} of the amount: {before_cents} becomes {after_cents}.`
- CAP, cut: `The rate record caps the line at {cap_cents}: {before_cents} becomes {after_cents}.`
- CAP, no cut (`before_cents === after_cents`): `The rate record caps the line at {cap_cents}; {before_cents} is
  within it and unchanged.`

**Patient share** (all audiences).
- `Patient share {patient_share_cents}, reported beside the expected amount and never subtracted from it.` Internal
  and viewer add `({group_code} {reason_code} {amount_cents}[, ...])` as the line page's adjustments table already
  shows them.

**Rounding** (all audiences).
- `Rounded once, {rule words}, under {origin words}: {unrounded_cents} becomes {rounded_cents}. The unrounded amount
  is kept beside it.`
- Rule words (the PDF's today, `words.ts:38-42`): `half up to the cent`, `half even to the cent`, `truncated to the
  cent`.
- Origin words: `rate_record` → `the rate record's rule`; `practice_default` → `the practice's default, as the rate
  record names no rule`; `engine_default` → `the default rule, as neither the rate record nor the practice names one`.

**Observed and variance** (all audiences).
- `Observed allowed {observed_allowed_cents}, {basis words}.` Basis words: internal and viewer, `amt_b6` → `the
  payer's allowed amount (AMT B6)`, `paid_plus_pr` → `paid plus patient responsibility`; payer, `amt_b6` → `the
  allowed amount the remittance states`, `paid_plus_pr` → `the amount paid plus the patient's responsibility` (no
  segment code).
- `Expected {expected}, observed allowed {observed}: short {variance_cents}.` (Expected, paid side, short: the
  brand's order.) Zero and negative as in the summary.

**Dispute window** (internal; the viewer gets the first clause only; never the payer).
- `Dispute window: {length} {unit} from the {start words} [{from_date}], under {source words}; it ends on {ends_on};
  on {as_of} it is {status words}.`
- Start words: `remittance_date` → `payment date` (it is the BPR16 date; ADR 0061 ruling; `view.ts:67-74`);
  `date_of_service` → `service date`. Source words: `contract` → `the contract`; `release` → `the release's record`.
- Status words: `OPEN` → `open`; `WINDOW_PASSED` → `passed`. `NO_WINDOW`: `No dispute window applies to this line.`
- The line page keeps its own `notComputedWindowText` note when the contract's rule is not the one the engine counts
  (`page.tsx:78-86`); the renderer states only what the trace counted.

**Release and engine** (internal, viewer): `Priced under rule release {number} by engine {engine}.`

### 3.5 Unpriced lines

- `Not priced: {meaning}. {detail words}. The line stopped at {step words}. Remedy: {remedy}.`
- **Meaning and remedy are the closed list's words, copied exactly** from `docs/product/unpriced-reasons.md:9-22`
  (columns 2 and 3). `explain/words.ts` holds them; a test parses the doc's table and requires equality word for word,
  so the doc stays the source and is never edited. `apps/web/src/lib/contracts/remedies.ts` keeps its screens and
  takes its meaning and remedy from `@tp/packets/explain`; its own test against the doc stays.
- **Detail words**: one entry for every `ENGINE_ERROR_DETAILS` and `NO_PFS_VALUE_DETAILS` code
  (`packages/pricing/src/reasons.ts:26-103`), worded for a line ("on the service date"), not for a screening row
  ("on the quarter's first day", which `lib/screening/labels.ts:174-192` keeps). A test enumerates both lists.
- Step words: `input` → `reading the line`, `agreement` → `the agreement`, `method` → `the method`, `fee_schedule` →
  `the fee schedule`, `units` → `the units`, `mppr` → `the multiple procedure payment reduction`,
  `assistant_reduction` → `the assistant reduction`, `sequestration` → `sequestration`, `claim` → `the claim's
  status`, `rounding` → `rounding`, `window` → `the dispute window`.
- The steps reached before the stop are worded as above; a step not reached reads `Not reached.` (as today).
- **SECONDARY_PAYER: the meaning comes from the trace, not the doc** (finding m3). The doc's meaning ("Claim status
  2 or 3", `docs/product/unpriced-reasons.md:17`) understates the engine, which also stops 20 and 21
  (`packages/pricing/src/engine.ts:84`, `SECONDARY_STATUSES`), so quoting it beside a status 20 line would say what
  the trace does not. For this one reason the renderer leaves the quoted meaning out and words the trace's own
  `claim_status_code`: `Not priced: claim status {20} (processed as secondary and forwarded to another payer), which
  this release does not price. Remedy: {quoted remedy}.` Status words by string equality: `2` → `processed as
  secondary`, `3` → `processed as tertiary`, `20` → `processed as secondary and forwarded to another payer`, `21` →
  `processed as tertiary and forwarded to another payer`. The remedy stays quoted from the doc. `words.test.ts`
  still holds the package's copy of the meaning equal to the doc (the parity test is unchanged); the sentence form
  simply does not print it. **The doc itself is not fixed here:** `docs/product/rules-reference.md` must equal it
  word for word (`packages/pricing/src/unpriced-reasons.test.ts:28-32`), and that table is copied from
  `content/sources/plan/rules-reference.md`, a content source the drafts under `content/drafts/` cite. The fix is a
  content-pipeline change, proposed in section 12.

### 3.6 The fee-schedule worksheet

One worksheet per **distinct set of records**: the key is the SHA-256s of the RVU, locality (and plus-four), GPCI and
conversion-factor records, with the setting and the percentage. Two lines of one code, setting and locality under one
release share one worksheet. A line with no `fee_schedule` (fixed, per visit) has none.

Layout (exact words; payer audience shown):

> **Fee schedule worksheet {n}: code {hcpcs}, {basis_year}, carrier {carrier} locality {locality}, {setting words}**
>
> Year: the {basis_year} records in force on the service date. *(When the fee-schedule step's `lookup` is
> `latest_in_basis_year`: "the latest records in force during {basis_year}, the year the rate record locks". The
> form is chosen from `lookup` alone, with the label checked against it as in 3.4.)*
> Locality: practice ZIP {zip} is Medicare carrier {carrier}, locality {locality}. *(ZIP+4 form as in 3.4.)*
> Setting: {setting words}, the practice's setting for place of service {place_of_service}[, {place_of_service}].
> Conversion factor: {value} per RVU, {applicability words}.
> Percentage: {percentage} of the fee schedule, under the contract's clause on page {page}. *(MA: "{percentage} under
> 42 CFR 422.214", both figures.)*
>
> | Part | RVU | GPCI | Per unit at {percentage} |
> |---|---|---|---|
> | Work | {work_rvu} | {work_gpci} | {unit_cents.work} |
> | Practice expense ({setting words}) | {pe_rvu_facility or pe_rvu_non_facility} | {pe_gpci} | {unit_cents.pe} |
> | Malpractice | {mp_rvu} | {mp_gpci} | {unit_cents.mp} |
> | Per unit | | | {unit_cents.total} |
>
> The calculation: (work RVU × work GPCI + practice-expense RVU × practice-expense GPCI + malpractice RVU ×
> malpractice GPCI) × conversion factor × percentage = amount per unit. *(Internal and viewer: "The engine's
> expression:". The payer's worksheet writes RVU and GPCI out at first use, 3.2.)* Each part above is its RVU × its GPCI ×
> {value} × {percentage}, kept to the fraction of a cent until the one rounding.
>
> Reductions, in order, then the one rounding: as each line's words say (rows {lines}).
>
> To check these values, open CMS's Physician Fee Schedule Look-Up Tool for {basis_year}, choose carrier {carrier}
> locality {locality} and code {hcpcs}: its relative values, geographic indices and conversion factor should read as
> above. CMS shows the full fee-schedule amount, before this contract's {percentage} and before any reduction.

- **Never a 100% figure for a non-100% contract.** `unit_cents` is already at the percentage (`engine.ts:650-658`).
  The worksheet prints no "fee schedule amount at 100%", no geographically adjusted RVU (the product of RVU and GPCI)
  and no total RVU: the trace holds none of them, and deriving one would be the renderer doing arithmetic. This is the
  one deliberate difference from the golden worksheets (`fixtures/golden/claims/G02-*.worksheet.md` prints `1.056 x
  $20.0000 = $21.12`); a test asserts no figure in a worksheet equals any such derived value for the golden claims.
  For an MA line the percentage is 100, so the per-unit figure is Original Medicare's own, and the words say so.
- **The CMS sentence is a plain how-to.** It names the tool, the year, the locality and the code. It has no licence,
  CPT or AMA language and no claim about CMS, so it is not legal text (`docs/product/legal-surfaces.md` lists the AMA
  notice; this sentence is not one). It says "check", not "verify" (the T1 scan).
- **The reductions are not repeated in the worksheet;** each line's words carry its MPPR, assistant reduction,
  sequestration on the payer's share and the one rounding with the unrounded amount, which differ per line.
- **What the internal line page adds** under the worksheet, inside the "As the engine recorded it" disclosure: each
  record's type, key, effective dates and SHA-256, as `recordsIn` lists them today (`view.ts:107-122`). The payer
  copy never prints a record ID or SHA-256 (ADR 0061 D2).

### 3.7 Fail closed, one rule everywhere

- A code a closed list has no words for throws `ExplainWordsError(list)` (the worker's `PayerCopyWordsError` rule,
  `words.ts:52-68`, moved into the package). Most lists are typed `Record<Enum, string>`, so a missing entry fails
  `tsc`. The string-typed fields (`terms.method`, `mapping_kind`, `timed_units_rule`, `year_basis`, `applicability`,
  `claim_status_code`, `observed_allowed_basis`) are checked at run time.
- **PDF:** the error is a print failure (`PacketExportRenderError`, `export.ts:180`); nothing is printed.
- **Packet builder:** the calculation card shows `The payer's copy cannot be printed: {list} has no words. Ask
  PaidWhole support.` and the approve handler refuses with the same reason (`practice.cases.packet.approve`,
  `apps/web/src/lib/routes/packets.ts:212`). Nothing changes in Postgres; the readiness list is not widened.
- **Packet review:** the same notice; the version has no PDF to attest in that case.
- **Line trace page:** a notice `This line's calculation cannot be put in words yet: {list} has no words.` and the
  raw record stays in its disclosure for PHI roles. The words never fall back to `labelOf` of a code.
- Words never invent a fallback figure. A missing trace field that a sentence needs throws `ExplainShapeError`; the
  strict Zod schema makes that unreachable for a parsed trace, and a test proves each sentence form's guards.

### 3.8 Binding to the approval

- `explainPacket(content, traces, audience)` (root of `@tp/packets`): for each `content.lines[i]` it takes the trace
  read for `priced_line_id`, requires `traceSha256(trace) === line.calculation.trace_sha256`, else throws
  `ExplainBindingError` naming the row. **It also requires each line to be priced by the record the packet cites**
  (finding m4): for a contract citation, `trace.agreement.rate_record_id === content.citation.rate_record_id`
  (`packages/packets/src/format.ts:74-80`); for the regulation citation, `trace.agreement.outcome ===
  "MA_NONCONTRACTED"`. Otherwise `ExplainBindingError` names the row, so no line is cited to another record's page.
  Then it calls `explainLine` for each line and `feeScheduleWorksheets` once.
- **The words version** (finding M1). `WORDS_VERSION` (3.1) names the renderer that wrote the words. Without DDL it
  is held at every hand-off the code can see:
  - the review page and the builder show it in the Internal record card (an opaque hex value, the reviewer's, never
    the payer's);
  - the approve form and the export-request form each post the `WORDS_VERSION` the page was rendered with (a hidden
    field in their Zod schemas, `^[0-9a-f]{64}$`); the handler (`apps/web/src/lib/routes/packets.ts`) refuses a
    value that differs from its own with `The wording of the calculation changed since this page was loaded. Read
    the page again, then approve.` (or `... then request the export.`); nothing is written and the audit event
    records the refusal by IDs only;
  - the export request puts the value in the job payload (`packet_export: { practice_id, packet_version_id,
    words_version }`, `apps/worker/src/jobs/registry.ts:58`; optional in the schema so a job queued before the
    deploy parses); the export job refuses a payload whose `words_version` is absent or differs from its own, as a
    print failure (`PacketExportRenderError`) with the remedy `Request the export again.`;
  - the attester attests the PDF and CSV they downloaded, by their SHA-256 (`attestation.pdf_sha256`,
    `20261103090000:817-829`), so what is attested is what the payer receives, whatever the page shows.
  - **The gap no code-only guard closes:** a version approved under one renderer, then a deploy that changes the
    words, then the export requested under the new one. The requester then reads and sends the new words, but the
    approver approved the old. Closing it needs the approval to store its words version: a column, so Lane A's
    (2.2), recommended. ADR 0072 names this as the price of C2 (a).
- **Worker:** `exportPacket` reads the version's traces in its transaction (a new `packetTraces(client, practiceId,
  content)` in `records.ts`, the query `restatedDeadlines` already runs, `:474-488`) and passes the result to
  `packetHtml(exported, payerCopy, words)`. Readiness has already checked the calculations against the traces
  (`statesItsInputs`), so the hash check is a second guard, not a new refusal.
- **Web:** the builder and the review read the traces the same way (`lib/packets/queries.ts`, `readWithAudit` under
  the purposes those screens already read under, `packet_build` (`queries.ts:264, :364`) and `packet_review`
  (`review.ts:146`), so one screen keeps one audit trail; finding m8), call `explainPacket(content, traces, 'payer')`, and pass the words to
  the page. The traces themselves are never sent to the browser.

### 3.9 Each surface

**Line trace page** (`/p/[practiceId]/lines/[lineId]`; loader `linePage`).
- `pricedLineOf` keeps its `withTrace` semantics unchanged (`CASE WHEN $4 THEN p.trace END`,
  `apps/web/src/lib/pricing/queries.ts:395`): the SQL still withholds the trace from a role without `phi.read`
  (finding m9). A **separate audited read**, `pricedLineWords(scope, { practiceId, lineId, requestId }, audience)`
  (purpose `line_trace`, as today's read), reads the trace and the citation, calls `explainLine` and
  `feeScheduleWorksheets`, and returns only `{ words: LineWords | null; worksheets: readonly Worksheet[] }`: its return
  type has no trace field, so the trace cannot reach a viewer's page data by any handler path. `linePage` calls it
  with `viewer` or `internal` by role. `LinePageData` gains `words` and `worksheets`.
- The citation: `SELECT (evidence->>'page')::int FROM rate_record WHERE practice_id = $1 AND id = $2 AND verified_by
  IS NOT NULL` (inside the same scope; finding m4). A record not signed off gives `null`, and the page clause is left
  out. An MA line takes `MA_NONCONTRACTED_CITATION`.
- **Pricing card:** the summary sentence first. The method in words (`Percent of Medicare`, not `PERCENT_OF_MEDICARE`).
  The unrounded amount in exact dollars. Adjustments by their words with dollars. The unpriced reason as its meaning
  and remedy, the code kept as `data-reason` (also in the "Other runs" list, `:126`).
- **Trace section:** each step keeps its title (`TITLES`, `view.ts:76-92`) and shows its sentences. Under them, for
  PHI roles only, a closed `<details>`: `As the engine recorded it`, holding the rule records and the JSON as today.
  The JSON `<pre>` sits in a scrolling region a keyboard reaches (`tabIndex={0}`, a `role="region"` with an
  `aria-label`, as `ScrollTable` does), so it never widens the page at 390 px (finding m7).
  Viewers see the sentences and the line `Dates are left out for your role.` in place of today's refusal.
- The worksheet sits under the fee-schedule step.

**Packet builder and packet review** (`CalculationTable`, `display.tsx:279-332`).
- Rebuilt as `CalculationWords`: per row, `Row {row}` then the line's summary and step sentences (payer audience),
  then the worksheets, numbered as the PDF numbers them. The review page keeps the trace SHA-256 per row in its
  Internal record card (the reviewer's, not the payer's), so the payer block is exactly the PDF's.
- The old cents-and-codes table goes. Its place is a `<section role="region" aria-label="Calculations">` holding one
  `[data-calculation-row]` block per row. `e2e/packets.spec.ts:106` queries `getByRole('table', { name:
  'Calculations' })` today, so it changes to `getByRole('region', { name: 'Calculations' })` (finding m7); the row
  count stays 3. The worksheet's figures stay a real `<table>` inside `ScrollTable`.
- `LineSchedule`'s `Line trace` link is shown only when the viewer may open the line page (`practice.open`); the
  reviewer persona lacks it (`packages/db/src/authz/permissions.ts:206-209`), so the link was dead for them. The
  review now carries the words inline, so the reviewer needs no link.
- The `calculation` checklist item (`lib/packets/review.ts:65-67`) is reworded: `Each line's calculation in the PDF
  is worded from its trace exactly as on this page: the method, each step, the fee schedule worksheet, the one
  rounding and the patient share, shown apart from expected; the CSV's method, rounding and patient share match; each
  trace's SHA-256 is on this page.` Only the text changes; the item's code does not.

**The payer's PDF** (`apps/worker/src/packets/html.ts`).
- The table "Each line's dispute window and how its expected amount is computed" keeps Row and Window ends, and its
  Method, Steps and Rounding columns become one column, **How the expected amount is computed**, holding the line's
  payer-audience sentences. Patient share stays its own column (now with the words `reported, never subtracted`).
- A new section **Fee schedule worksheets** follows the table when any line has one.
- `words.ts`'s `METHOD_TEXT`, `STEP_TEXT` and `ROUNDING_TEXT` move into `@tp/packets/explain/words.ts`; the worker
  re-exports them for `csv.ts`, so the CSV's method words do not change.
- ADR 0061's header comment in `html.ts:9-40` gains one line: the worksheet and the words are "how its expected amount
  is computed" (D2), with no record ID or SHA-256.

**The CSV** (`csv.ts`): unchanged. D3 pins its columns as the founder ruled; the CSV is the line schedule. The method
column already uses the same words (they now come from the package).

**The case Calculations tab:** PR 13 builds it on `explainLine` (internal or viewer audience by role). This PR adds
the acceptance line to PR 13 (section 5). It does not touch the case page.

---

## 4. Tests

### 4.1 The figure tests (the audit's "a test fails if any figure is not in the trace or the rate record")

Two independent checks, over every golden claim and every generated trace:

1. **By source.** For every figure segment, resolve `source.path` in the trace (or the citation), apply the form, and
   require the result to equal the printed figure. Every text segment must hold no digit (`/\d/`), so no number can
   hide in a template.
2. **By parsing the words.** Take `plainText` of every sentence, worksheet and the PDF's calculation section. Extract
   every number token, **word-bounded** (`$`-amounts with grouping, `%` values, decimals, integers, dates), so a
   code such as `G0283` or a reference such as `42 CFR 422.214` is never split into stray integers: code and label
   segments are masked first, and the citation's reference is canonicalised into its own tokens (`42`, `422.214`)
   on both sides. Canonicalise each token (dollars to cents by an exact decimal shift in the test, percent to its
   number, dates as written). Require each to be in the set of the trace's and the citation's leaf values,
   canonicalised the same way (`@tp/money` `decimal`), plus the lengths of the trace's arrays (the counts the words
   state). A separate assertion holds every code segment to `CODES` (internal, viewer) or `PAYER_CODES` (payer) and
   every label to a row of the packet or a worksheet number. This check never uses the segments' metadata, so a
   figure that is in no trace field fails it.
3. **By slot** (finding m5). Checks 1 and 2 cannot catch a sentence that prints a real trace value in the wrong
   place (`before_cents` where `after_cents` belongs; small integers such as `1` and `2` are in almost every trace).
   `explain/slots.ts` is a fixed table, per sentence form and slot, of the one trace path that slot prints (the
   summary's `rounded once to` → `['steps', 'rounding', 'rounded_cents']`; sequestration's `is withheld` →
   `['steps', 'adjustments', i, 'cut_cents']`; and so on for every slot of 3.4 to 3.6). `line.test.ts` and
   `worksheet.test.ts` assert, for every figure segment of every form, that its `source.path` equals the table's
   entry for its slot (array indexes matched by position), so a wrong path fails. The table is written by hand from
   3.4, never generated from `line.ts`.
- The literal-digit rule also covers the word tables: no entry of `explain/words.ts` but a `CODES` entry holds a
  digit (so "the payer's allowed amount" is text and `AMT B6` beside it is a code segment).
- Plus, for percent-of-Medicare traces: no token equals any value the trace does not hold but a reader might expect
  (the 100% per-unit amount, the GAF products, the total RVU), computed in the test from the trace's own fields.

Where: `packages/packets/src/explain/figures.property.test.ts` (fast-check over traces priced through
`@tp/pricing/testing`: every method, every flag combination, CQ and CO, suspended sequestration, the payer's share
floored at zero, the cap, ZIP+4, facility and non-facility, LOCKED and CURRENT, every unpriced stop; a fixed
`numRuns` of 100, as the repo's property tests use fixed counts, `packages/pricing/src/properties.test.ts:168`; no
test in the repo switches its count by a mutation-run variable, so none is invented here) and
`packages/packets/src/explain/golden.test.ts` (every golden claim, each in its own test, as `engine.golden.test.ts`
does, over the committed golden traces of 4.2). Both sit under Stryker's packets test set
(`packages/packets/src/**/*.test.ts`), so the pinned words kill string mutants.

### 4.2 Golden words pinned

- **No new dependency** (finding B1). `@tp/tools` does not depend on `@tp/packets` (`tools/package.json:16-30`), and
  adding it would change `tools/package.json` and `pnpm-lock.yaml`, a #42 file. So the golden words test lives in
  `@tp/packets`, which cannot reach the golden harness (`tools/golden-worksheet/engine.ts` needs `@tp/rules`, which
  `@tp/packets` lacks). It reads committed traces instead:
  - `tools/golden-worksheet/write-explain-traces.ts` (new; run by hand with `pnpm tsx`) prices every golden claim
    through `goldenPricingInput` and writes each claim's traces, canonical JSON, to
    `packages/packets/src/explain/__golden__/<claim>.traces.json`. It needs nothing `@tp/tools` lacks.
  - `tools/golden-worksheet/explain-traces.golden.test.ts` (new) prices every golden claim again and requires each
    committed traces file to equal the fresh traces byte for byte, so the copy can never go stale while the engine is
    frozen, and fails loudly if a later ruling changes the engine.
  - `packages/packets/src/explain/golden.test.ts` reads those traces, renders each line in all three audiences, and
    `expect(text).toMatchFileSnapshot('__golden__/<claim>.txt')`. A pin changes only with the PR that changes the
    words; CI runs without `-u`. The traces and pins are synthetic (the golden claims are), are outside
    `fixtures/golden` (frozen by `tools/engine-freeze`), and are JSON and `.txt` outside `fixtures/` and
    `packages/synth/`, so the fixture check searches them for an X12 header only (`tools/fixture-check/check.ts:32`).
- G01 (MA non-contracted) and G02 (commercial 110%, flags off) are read in the PR description beside their golden
  worksheets, line by line, as the reviewer's check that the words say what the worksheet says, less the 100% line.
- The pins hold the payer words of finding m10: `Medicare's assistant percentage`, `Medicare's sequestration record`,
  `The calculation:` and `claim line {n}`, and no `release` in any payer pin (a test greps the payer pins).

### 4.3 Unit tests, one file per source file (`packages/packets/src/explain/*.test.ts`)

- **words.test.ts:** every closed list's code has words; an unknown string-typed code throws `ExplainWordsError`
  naming its list; the unpriced meanings and remedies equal `docs/product/unpriced-reasons.md` word for word; every
  detail of both detail lists has words.
- **figures.test.ts:** each form on whole, fractional, negative and zero text; `percent` never prints `0%` for a
  suspended sequestration (the sentence form takes the other branch); `per_rvu` keeps the trailing zeros.
- **line.test.ts, one `describe` per step kind:** fixed; percent of Medicare (CURRENT, LOCKED); lesser of (schedule
  wins, charge wins); per visit (carrying line, other line); MA; NCCI (off, none, stands, bypassed); MUE (checked,
  none in force, off); MPPR (not in pool, rank 1, reduced one unit, reduced two units, code share, general share);
  assistant (CQ, CO, both); sequestration (in force, suspended, patient share above the amount so the payer's share
  is zero); contract adjustment (PERCENT, CAP cut, CAP not cut); patient share (none, PR adjustments); rounding (each
  rule, each origin); variance (positive, zero, negative); window (each source, start, status; viewer drops dates;
  payer drops it); every unpriced reason with and without detail; each audience's table of section 3.3 as a test that
  the payer and viewer outputs hold no date token (`/\d{4}-\d{2}-\d{2}/`), and every payer-audience string (each
  sentence, the worksheet's title, rows and parts, the CMS sentence) matches none of `PAYER_COPY_INTERNAL_TERMS` and
  none of `CODE_SHAPES`, both imported from `@tp/packets/testing` (finding M5), and holds code segments only from
  `PAYER_CODES` (finding M3). No home-made regex stands in for the real lists.
- **The cases the review added:** an MA line's internal and viewer words hold no `contract` or `rate record` within a
  flag's or the timed-units rule's sentence, and read `Medicare's reductions apply ... under 42 CFR 422.214` (M2); a
  trace with `year_basis` `LOCKED:20x4` priced `in_force_on_service_date` throws `ExplainShapeError`, and each
  agreeing pair words the year from `lookup` (M4); the payer's share floored at zero takes the `leaves no payer's
  share` sentence (m1); a `NAMED` locality line stopped at the fee schedule words `carrier ... locality ..., as the
  rate record names it` (m2); a SECONDARY_PAYER line of each status 2, 3, 20 and 21 prints its own status in words and
  not the doc's meaning (m3); `AMBIGUOUS_RATE` prints the count form (m6).
- **The flag rule:** for every flag set to false, the internal words hold exactly `Not applied (flag off): ...` and no
  sentence holding "contract" next to that adjustment's name; the payer words hold no mention of it.
- **worksheet.test.ts:** grouping (two lines one worksheet; another setting, locality, percentage or record SHA, a
  second worksheet); order stable; ZIP+4 form; MA form; the CMS sentence; no worksheet for fixed or per visit.
- **explain.test.ts (root):** a trace whose SHA-256 differs from the calculation's throws `ExplainBindingError`
  naming the row; a missing trace throws; a line priced by another rate record than the contract citation's, and a
  non-MA line under the regulation citation, each throw `ExplainBindingError` naming the row (m4); the words are
  byte-identical for identical input (determinism).
- **version.test.ts:** `WORDS_VERSION` equals `wordsVersionOf()` over the word tables and `RENDERER_REVISION`; a
  change to any word table without rewriting the literal fails (M1). The golden pins catch a sentence-form change
  made without bumping `RENDERER_REVISION` only if a reviewer looks; so the test also hashes `slots.ts`'s table,
  which every sentence form's slots are in, into the version.
- **purity:** the explain folder imports nothing but `@tp/money`, `@tp/pricing` types and its own files (a test reads
  the imports, as `packages/pricing/src/purity.test.ts` does).

### 4.4 Web and worker tests

- **Component tests** (vitest + Testing Library, as `components/packets/unattested.test.tsx` does):
  `components/packets/calculation-words.test.tsx` (rows, worksheets, figures in mono with `tabular-nums`, no
  `[A-Z]+_[A-Z_]+` and no `{` in visible text, the refusal notice) and
  `components/pricing/line-words.test.tsx` (the Pricing card and the trace section: sentences, the disclosure only
  for PHI roles, the viewer line).
- **Loader tests:** `apps/web/src/lib/routes/pricing-routes.db.test.ts:285-300` extends: the manager gets `words`
  with dates and `trace`; the viewer gets `words` with no date token, `trace: null`, `steps: []`, and the viewer's
  whole `LinePageData`, serialised, holds no `trace` key with a value and no date-shaped token (m9); a line whose rate
  record is not signed off gets no page clause (m4). An `expectTypeOf` assertion in the same file: `pricedLineWords`'s
  return type has no `trace` field.
  `workbench-routes.db.test.ts` (or `payer-copy-routes.db.test.ts`): **the review loader's words deep-equal
  `explainPacket(content, traces, 'payer')` for the same version** (the web half of the "reviewer reads what the
  payer reads" proof; finding B2); a version whose trace SHA-256 is tampered in the test is refused by the loader;
  the audit events of the reads carry the purposes `packet_build` and `packet_review` (m8); an approve or
  export-request post with another `words_version` is refused and writes nothing (M1).
- **Worker:** `export.test.ts` T7 (`:344-372`) is rewritten to the new column and section, built from real traces (a
  new `pricedLine()` helper in `packages/packets/src/test-support.ts` prices through `@tp/pricing/testing`, so the
  calculation's SHA-256 is a real trace's); T1's leak scan runs over the new text for every version in `VERSIONS`; a
  version with a trace whose SHA-256 differs is a print failure; **the PDF's text, extracted with `pdfjs-dist` as the
  payer-copy test already does in the worker, contains `plainText` of `explainPacket(content, traces, 'payer')` for
  the same version**, sentence by sentence (the worker half of the proof; finding B2: the worker cannot import a web
  loader, and only `apps/worker/package.json:63` has `pdfjs-dist`, so the comparison is against `explainPacket`); a
  job whose payload names another `words_version`, or none, is a print failure with `Request the export again.`
  (M1).
- **e2e:**
  - `e2e/pricing.spec.ts:105-127`: the Pricing region contains `Percent of Medicare` (was `PERCENT_OF_MEDICARE`); the
    trace section shows the sentences; the test **opens the `As the engine recorded it` disclosure first** (a role
    query treats a closed `<details>`'s content as hidden; `pricing.spec.ts:120`), then finds `pfs_rvu` in the
    `Rule records of Step 2` list (m7). Then `expectAccessible` and `atPhoneWidth` (`e2e/a11y.ts:11, :53`) on the line
    page for the manager, the disclosure open.
  - `e2e/viewer-phi.spec.ts:117-140`: unchanged scan, and the viewer's line page now shows sentences
    (`getByText(/rounded once/)`), still with no service date or identifier in what the server sent; then
    `expectAccessible` and `atPhoneWidth` for the viewer (m7).
  - `e2e/packets.spec.ts:106`: `getByRole('region', { name: 'Calculations' })` (was `'table'`) holds 3
    `[data-calculation-row]`, each containing that row's summary sentence (`rounded once`); `atPhoneWidth` on the
    review page after the change. The words-equal-PDF proof is not here: it is the two halves above, which need no new
    dependency in `apps/web` (B2).
  - `e2e/layout-1280.spec.ts:270-277` keeps the `NCCI PTP` title.
- **Screen tour:** `tools/lane-b-screen-tour` runs at base and head for the UX review (section 8).

### 4.5 Mutation

- `stryker/base.mjs` `MUTATE.packets` gains `packages/packets/src/explain/**/*.ts`, `packages/packets/src/explain.ts`
  and `packages/packets/src/words-version.ts`, and excludes `packages/packets/src/explain/__golden__/**`.
  `MA_NONCONTRACTED_CITATION` moves into `packages/packets/src/payer.ts`, already mutated in `packets-rest`, not a new
  `citations.ts` that no shard lists (finding m12).
- `stryker/shards.json` gains a shard **`packets-explain`** holding exactly those files (the type-only `index.ts` in
  `noMutants`). A separate shard keeps `packets-rest` (997 s of mutant time at 49514e8) from doubling.
  `tools/stryker/shards.test.ts:23, :69` and `tools/stryker/affected.test.ts:353` list the new shard. The workflow's
  matrix is read from `affected.ts`, so `.github/workflows/mutation.yml` does not change.
- Survivors are killed by the unit tests above. A survivor judged equivalent goes in
  `tools/stryker/equivalent/packets.json` with its reason and reviewer, as the existing entries do.

### 4.6 Test-matrix rows (CAS-30 to CAS-34)

Appended right after CAS-29 in `docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts` and
`packages/synth/src/cases/registry.ts`, word for word in all three (no ` | ` inside a cell), each with
`fixtures/synthetic/CAS-NN/expected.json` as `pnpm synth --all` writes it. All are `none(8, ...)`: outputs, not
fixtures.

| ID | Case | Assertion |
| --- | --- | --- |
| CAS-30 | A line's calculation in words | Every figure in the words is in the line's trace or its rate record; a flag that is off reads only as not applied; an unpriced line reads its reason's meaning and remedy |
| CAS-31 | The line trace for a role that does not read PHI | The steps in words with no date; the stored trace not sent |
| CAS-32 | A packet's calculation on the review page and in the PDF | The same words, from the traces its approval names, by one renderer whose version the approval, the export request and the export job agree on; a trace that differs, a line priced by another rate record or another words version is refused |
| CAS-33 | The fee schedule worksheet | One per distinct set of records, with the year, locality, setting, RVUs, GPCIs, conversion factor and the engine's expression; never an amount at 100% for a contract that is not at 100% |
| CAS-34 | A code the words have no words for | Refused on every screen and in the PDF; never shown as a code |

`assertedBy`:
- CAS-30: `packages/packets/src/explain/line.test.ts`, `packages/packets/src/explain/figures.property.test.ts`,
  `packages/packets/src/explain/golden.test.ts`, `apps/web/e2e/pricing.spec.ts`.
- CAS-31: `apps/web/src/lib/routes/pricing-routes.db.test.ts`, `apps/web/e2e/viewer-phi.spec.ts`.
- CAS-32: `packages/packets/src/explain.test.ts`, `apps/worker/src/packets/export.test.ts`,
  `apps/web/src/lib/routes/workbench-routes.db.test.ts`, `apps/web/e2e/packets.spec.ts`.
- CAS-33: `packages/packets/src/explain/worksheet.test.ts`, `packages/packets/src/explain/golden.test.ts`,
  `apps/worker/src/packets/export.test.ts`.
- CAS-34: `packages/packets/src/explain/words.test.ts`, `apps/worker/src/packets/export.test.ts`,
  `apps/web/src/components/packets/calculation-words.test.tsx`.

A comment above `'CAS-30'` in the registry cites the audit and ADR 0072, as CAS-26's does.

---

## 5. D5 (b), PR 12 and PR 13

All of these are added lines in `docs/product/reconciliation-001.md` (a #42 file: add only; LANES rule 6).

- **D5 (b), closed.** Under the Approval's D5 bullet (`:491`), an added sub-bullet:
  `*Amended 2026-10-26 (combined audit #38, adopted by the founder on 2026-10-20; confirmed by the co-founder under
  the delegation of 2026-10-25):* option (b) is closed: nothing of CO-06 is deferred past Gate 2. The executive
  summary, the internal audit manifest and the drill-down stay in PR 12 and PR 13. This agrees with option (a), "all
  of the change order, in its order".`
  - This reverses no founder ruling: (a) already keeps all of the change order. The co-founder confirms the line under
    the delegation (`LANES.md`, "Delegations"), and it goes in the status file's choices.
- **PR 12, added acceptance** (a sub-bullet under `:208`): `*Amended 2026-10-26 (combined audit #38):* a test
  exports one synthetic case under each scope (payer, practice_internal, auditor, executive) and requires each file to
  hold exactly the identifiers D26 admits: the executive export none (no claim control number, patient name, member
  ID or pseudonym), the auditor export only the pseudonym and claim control number; and the calculation manifest
  states each line's words as @tp/packets explainPacket renders them.`
- **PR 13, added acceptance** (a sub-bullet under `:219`): `*Amended 2026-10-26 (combined audit #38):* the
  Calculations tab renders each line through explainLine (the internal words for roles that read PHI, the viewer's
  without dates for the others); an e2e test follows one amount by clicks from the case total to the line, its trace
  words, its rate record and its evidence page, for a synthetic case.`
- **Not in this PR's power, named as such:** the scoped exports and their tables (`packet_export`,
  `packet_export_part`) are PR 12's and need a migration (Lane A). The six tabs and the drill-down are PR 13's. The
  `auditor` role is PR 14's (D28). The "executive" is a D26 export scope, not a role.
- **Change order:** `docs/product/change-order-001.md` is not edited. CO-06's acceptance is met by PR 12 and PR 13 as
  amended.

---

## 6. The wording, checked

Pre-approved under the co-founder's delegation (`LANES.md`, "Delegations from the founder to the co-founder":
wording is the co-founder's): **the words of section 3.4 to 3.6 are taken as written, the recommended option**, and
recorded in the status file's choices.

Checked against:
- **`.claude/rules/brand.md`:** every money figure, code, unit count and rate is a figure segment in the mono face
  with tabular numerals; expected, observed (the paid side) and short appear in that order; no "recovered" anywhere
  (the words state no stage); status is words, never colour.
- **BRAND.md §7:** tables keep the three numbers in order; the worksheet's table is a table of figures in mono.
- **CO-11:** no "AI", "intelligence", "ProofPack", "owed", "underpaid" or "recovered"; "short" is the brand's status
  word for paid below the contract (BRAND.md colour table, `--pw-short`). The copy lint runs on `packages/packets/src`.
- **`apps/web/src/lib/copy/words.ts`:** counts through `counted()` semantics; initialisms in capitals (MPPR, NCCI,
  MUE, RVU, GPCI, CMS, APM: CMS and APM are added to `INITIALISMS` for `labelOf` consistency, though the renderer does
  not call `labelOf`); sentence case.
- **ADR 0061 D2 and the T1 scan:** no record ID, SHA-256, version number or code in the payer audience; no "trace",
  "verif", "specialist" or "SHA-256"; the window only in the PDF's own section; dollar amounts in the rounded amount's
  form with the fraction of a cent kept.
- **CO-06's neutral language:** the words state what the calculation did; they claim no wrongdoing. The PR 12 heading
  rewrite ("our review indicates a payment difference under the following terms") is PR 12's and is not pre-empted.

---

## 7. Files to change, in order, and the builders' split

Three builders can work in parallel after step 1 lands on the branch (one commit each, rebased in order).

**Step 1, the package (builder P).** Everything else depends on it.
1. `packages/packets/src/explain/words.ts`, `figures.ts`, `slots.ts`, `line.ts`, `worksheet.ts`, `version.ts`,
   `index.ts` (new).
2. `packages/packets/src/explain.ts` (new): `explainPacket`, `ExplainBindingError` (hash and rate-record binding);
   `packages/packets/src/words-version.ts` (new): `wordsVersionOf()`.
3. `packages/packets/src/payer.ts`: `MA_NONCONTRACTED_CITATION` moved here from `apps/worker/src/packets/records.ts:80`
   (the worker re-exports it). Not a new `citations.ts` (m12).
3a. `apps/worker/src/jobs/registry.ts:58`: the `packet_export` payload gains optional `words_version` (one line, in
   step 1 so builders W and K both build on it).
4. `packages/packets/src/index.ts`: export the above. `packages/packets/package.json`: the `./explain` subpath.
5. `packages/packets/src/test-support.ts`: `pricedLine()` built from a real trace (added; `calculation()` stays);
   `CODE_SHAPES` moved here from `apps/worker/src/packets/test-support/payer-copy.ts:44`, which re-exports it (M5).
6. The unit, property and purity tests of 4.3 and 4.1.
7. `stryker/base.mjs`, `stryker/shards.json`, `tools/stryker/shards.test.ts`, `tools/stryker/affected.test.ts`.
8. `tools/golden-worksheet/write-explain-traces.ts` and `tools/golden-worksheet/explain-traces.golden.test.ts` (new;
   no new import in `@tp/tools`); `packages/packets/src/explain/__golden__/*.traces.json` and `*.txt` (new);
   `packages/packets/src/explain/golden.test.ts` (new). No `package.json` or `pnpm-lock.yaml` change (B1).

**Step 2a, the worker (builder W).**
9. `apps/worker/src/packets/words.ts`: the three tables re-exported from `@tp/packets/explain`; `PayerCopyWordsError`
   kept for the program, plan and exclusion lists.
10. `apps/worker/src/packets/records.ts`: `packetTraces()`; the citation re-export.
11. `apps/worker/src/packets/export.ts`: read the traces, `explainPacket(..., 'payer')`, pass to `packetHtml`; refuse a
    payload whose `words_version` is absent or not `WORDS_VERSION` (M1).
12. `apps/worker/src/packets/html.ts`: the merged column, the worksheet section, the header comment line.
13. `apps/worker/src/packets/export.test.ts`, `words.test.ts`.

**Step 2b, the web packet pages (builder K).**
14. `apps/web/src/lib/packets/queries.ts`: `packetTraces()` with `readWithAudit` (the existing purposes
    `packet_build` and `packet_review`, m8); `requestExportOnce` puts `words_version` in the payload.
15. `apps/web/src/lib/packets/review.ts`: the words in `PacketReview`; the checklist text.
16. `apps/web/src/lib/routes/packets.ts`: the builder's data gains the words and `WORDS_VERSION`; the approve handler's
    refusal (3.7); the approve and export-request schemas gain `words_version`, refused when it differs (M1).
17. `apps/web/src/components/packets/display.tsx`: `CalculationWords` in place of `CalculationTable`; `methodName` and
    `Citation`'s method (`:105`) through the package's words; `LineSchedule` hides the dead link.
18. The two packet pages (`cases/[caseId]/packet/page.tsx:291-300`, `.../review/page.tsx:160-168`).
19. `apps/web/src/components/packets/calculation-words.test.tsx` (new); the loader db tests; `e2e/packets.spec.ts`.

**Step 2c, the web line page (builder L).**
20. `apps/web/src/lib/pricing/queries.ts`: `pricedLineOf` unchanged; a new audited `pricedLineWords()` returning words
    and worksheets only, with the signed-off contract page read (m9, m4).
21. `apps/web/src/lib/routes/remittances.ts`: `linePage` builds `words` and `worksheets` by audience.
22. `apps/web/src/lib/pricing/view.ts`: `traceSteps` keeps titles and records for the disclosure.
23. `apps/web/src/app/p/[practiceId]/lines/[lineId]/page.tsx`: the Pricing card and trace section as 3.9.
24. `apps/web/src/lib/contracts/remedies.ts`: meaning and remedy from the package (its test stays).
25. `apps/web/src/lib/copy/words.ts`: `cms`, `apm` initialisms (and its test).
26. `apps/web/src/components/pricing/line-words.test.tsx` (new); `pricing-routes.db.test.ts`; `e2e/pricing.spec.ts`,
    `e2e/viewer-phi.spec.ts`.

**Step 3, documents and rows (builder P, last).**
27. `docs/adr/0072-word-every-calculation-from-its-stored-trace-in-one-renderer-and-render-the-fee-schedule-worksheet-at-review-and-export.md`
    (template `docs/adr/0000-template.md`): where the renderer lives; words only from stored values; the three
    audiences; the render-time worksheet bound by `trace_sha256` for its figures and by the `WORDS_VERSION` guards for
    its words, with the residual gap and its Lane A column named as the price of C2 (a); no 100% figure; fail closed; alternatives (a
    `tp-packet/3`, an unvalidated content key, a web-only renderer, a model-written explanation: rejected, CLAUDE.md
    rule 1); the check that proves it (CAS-30 to CAS-34); revisit when PR 12 adds the calculation manifest or the
    founder wants the worksheet stored. ADR 0061 gains a dated "See also ADR 0072" line under D2 (added, not edited).
28. `docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts`, `packages/synth/src/cases/registry.ts`,
    `fixtures/synthetic/CAS-30..34/expected.json` (4.6).
29. `docs/product/reconciliation-001.md` (section 5, added lines only).
30. **Not in this PR** (finding m11): `.claude/agents/payment-engine-reviewer.md` is under the CODEOWNERS `/.claude/`
    entry (`.github/CODEOWNERS:43`), and this PR's reviewer would review its own checklist's change. The four
    checklist lines (words render only stored trace values; a flag that is off is never worded as the contract's
    position, and Medicare's rules on an MA non-contracted line never as a contract's or rate record's; the year is
    worded from the lookup; no 100% figure for a non-100% contract) go to the status file as a proposal for a
    separate small PR under the founder's code-owner review. For this PR the orchestrator gives the reviewer the same
    four lines in its prompt.
31. The PR description from `.github/pull_request_template.md`, with G01 and G02 read beside their worksheets, and the
    residual words-version gap of 3.8 named with its Lane A proposal.

Parallel safety: builders W, K and L touch disjoint files. Only step 1's files are shared, and they are frozen once
step 1 lands; a needed change goes back through builder P.

---

## 8. Reviews

1. **Payment-engine reviewer** (`.claude/agents/payment-engine-reviewer.md`), on `packages/packets/src/explain*` and
   the worker's export path: no arithmetic in the renderer; no float; no figure absent from the trace or rate record;
   each figure from its slot's path; no flag worded as the contract's position, and no MA line's Medicare rules as a
   contract's; the year from the lookup; no 100% figure; the words-version guards; the hash check before any print; the mutation shard and
   its equivalents.
2. **UX and brand reviewer** (`designs/lane-b-ux-review-brief.md`): before and after screenshots with
   `tools/lane-b-screen-tour` (`TOUR_REF` base, then head) at 1280 and 390 px, light and dark, of the line trace page
   (manager and viewer), the packet builder, the packet review and the PDF. Judged on the brand rules, CO-11, the copy
   lint, PRD:256 (keyboard, labels, every error with a next step, money from cents) and WCAG. Long exact amounts
   (`$23.232`) must wrap cleanly at 390 px; the worksheet table scrolls inside `ScrollTable`, never the page.
3. **Security** (light, as the second adversarial review if the orchestrator picks it over UX for one of the two): the
   viewer path never sends the trace or a date; new audited reads carry IDs only; no PHI in a log or error message
   (`ExplainWordsError` names a list, never a value).

---

## 9. Coordination

- **#42 (open):** none of its files is touched, except by added rows in `packages/synth/src/cases/{matrix,registry}.ts`
  and `docs/product/{test-matrix,reconciliation-001}.md`. #42 adds JOB-05, SCR-21, SCR-22, SEC-18 and SEC-19 there;
  CAS-30 to CAS-34 go right after CAS-29, in another part of each file. LANES rule 6: the PR merged second resolves
  any conflict and keeps both. No route is registered (`lib/routes/index.ts`, `registry.test.ts` and `practice.ts` are
  #42's): the work rides the existing `linePage`, `packetPage` and `packetReviewPage` loaders. No help text is added
  (`components/help.ts` is #42's).
- **#48 (`co-001/narrative-draft`):** follows this PR in the same session; it takes CAS-35 to CAS-37.
- **#46 (the seal):** no overlap; the words state no recovered amount, so no seal or badge appears.

---

## 10. Risks

- **The payer copy changes after PR 5's review.** The PDF's calculation section is new text. T1's scan and the new
  "PDF equals review" test guard it, and ADR 0072 names the change as D2's "how its expected amount is computed".
- **A long sentence in a narrow PDF column.** The merged column holds a paragraph per line. Mitigation: the PDF table
  keeps four columns only; the UX review checks the printed page.
- **Exact amounts are long** (`$23.2323` and the like). They are exact and the trace's own; shortening them would be
  rounding before the one rounding. The UX review checks the reading.
- **Reading the trace for viewers** widens what the server reads for them (not what it sends). Mitigation: the loader
  test asserts `trace: null` and no date token for the viewer; the e2e PHI scan runs.
- **A golden pin churns** when wording changes. That is the point: the PR that changes words changes the pins in the
  same diff, where the reviewer sees them.
- **Mutation score:** a wide wording module has many string mutants. String-literal mutants are killed by the pinned
  words in the unit tests and by the golden pins, which now live in the package (`explain/golden.test.ts`), so
  Stryker's packets test set runs them. The property test's fixed `numRuns` of 100 lengthens each mutant's run; if
  the `packets-explain` shard's time is too long, the count drops for that file, never the golden pins.
- **The words version across a deploy** (finding M1). The guards refuse every mismatch the code can see; the gap of
  an approval under one renderer and an export under another stays until Lane A stores the approval's words version
  (2.2). A deploy that changes the words can, as an operating rule, be released when no approved version waits for
  export (the PR description says so); no packet has been submitted yet.
- **A line refused for its year basis.** The M4 rule refuses a line whose label and lookup disagree, which today can
  only be Lane A's open engine defect 2. Such a packet cannot be printed until Lane A's fix lands; that is the
  intended fail-closed result, and the notice names the list.
- **The doc's SECONDARY_PAYER meaning is narrower than the engine.** Not printed: the line's own claim status is
  worded from the trace (3.5); the doc fix is a content-pipeline change, proposed, not made (section 12).
- **An existing /2 version is unaffected:** the content is not changed, so `statesItsInputs` compares the same
  calculations as before. Only the printed PDF of a later export reads differently, and no packet has been submitted.

---

## 11. Choices, each with the recommended option taken

| # | Choice | Options | Taken, and why |
|---|---|---|---|
| C1 | Where the renderer lives | (a) `packages/packets/src/explain/`; (b) a new package; (c) `apps/web` and `apps/worker` each | **(a).** Both apps import it, it is mutation-gated, copy-linted and in the payment-engine review; (b) needs all that wiring again; (c) is today's two vocabularies. |
| C2 | The worksheet's home | (a) rendered at review and export from the trace, bound by `trace_sha256`; (b) a stored `tp-packet/3`; (c) an extra content key under `/2` | **(a).** No migration; the figures have the same binding; the words are held by the `WORDS_VERSION` guards (C17). (b) is Lane A's and needs the founder's domain-model approval for no gain before the first packet; (c) leaves a key the database never checks. The price of (a): the words are not bound across a deploy between approval and export until Lane A stores the approval's words version (2.2). |
| C3 | The audiences | (a) internal, viewer, payer; (b) one text for all | **(a).** The payer copy forbids dates of its own, window status, codes and internal notes (ADR 0061); the viewer may see no date. |
| C4 | Flags that are off | (a) internal and viewer "Not applied (flag off)", payer silent; (b) state them to the payer too; (c) word them as the contract's terms | **(a).** (c) misstates the contract; (b) puts an internal setting in the payer's letter. |
| C5 | A code without words | (a) refuse everywhere; (b) fall back to `labelOf` on screens | **(a).** A reviewer must never approve wording the PDF refuses to print. |
| C6 | The CSV | (a) unchanged; (b) add a words column | **(a).** D3 pins the CSV as the line schedule, as the founder ruled; a paragraph in a cell helps no portal. |
| C7 | The 100% figure | (a) never printed; (b) derived for the CMS comparison | **(a).** The trace does not hold it and the renderer may not compute it; the CMS sentence explains why CMS's figure differs. |
| C8 | The CMS sentence | (a) the trace's year, carrier, locality and code; (b) also the CMS file title and quarter from `rule_record` | **(a).** It is all the look-up needs; (b) adds a join and a figure source for no gain. A proposal records (b) for PR 12's calculation manifest. |
| C9 | The viewer's words | (a) built server-side, no date, trace never sent; (b) keep hiding the steps | **(a).** The audit asks for it; the PHI scan holds it. |
| C10 | The reviewer's dead "Line trace" link | (a) hide it when the role lacks `practice.open`; (b) grant the reviewer `practice.open` | **(a).** (b) widens the permission matrix (a database change). The review page now carries the words. |
| C11 | Unpriced words | (a) the doc's table copied into the package with a parity test, web's `remedies.ts` reading it; (b) leave them in web only | **(a).** The renderer needs them outside the web; the doc stays the source. |
| C12 | Golden pins | (a) `packages/packets/src/explain/__golden__/`, over traces a `tools/` script writes and a `tools/` test holds fresh; (b) `tools/golden-worksheet/explained/` with `@tp/packets` added to `@tp/tools`; (c) `fixtures/golden`; (d) wait for #42 to merge | **(a).** (b) changes `tools/package.json` and `pnpm-lock.yaml`, a #42 file (finding B1); (c) is frozen by the engine freeze; (d) leaves the words unpinned at merge. (a) also puts the pins under Stryker's packets test set. |
| C13 | Mutation shard | (a) a new `packets-explain` shard; (b) add to `packets-rest` | **(a).** Keeps `packets-rest` within its time; no workflow change. |
| C14 | IDs | (a) CAS-30 to CAS-34 and ADR 0072 here, CAS-35 to CAS-37 to #48; (b) all eight here | **(a).** #48 shares the claim. |
| C15 | D5 (b) | (a) close it now by an added line, nothing deferred; (b) leave it for after PR 7 | **(a).** The founder adopted the audit, which says close it; closing it agrees with the ruled option (a). |
| C16 | Wording | (a) take section 3.4 to 3.6 as written under the co-founder's delegation; (b) ask first | **(a).** The delegation covers wording; recorded in the status file. |
| C17 | Binding the words to the approval | (a) a code-held `WORDS_VERSION` checked at approval, export request and export job, plus Lane A's stored column recommended; (b) record it in the approval and export audit events; (c) accept unbound words | **(a).** (b) is not possible without DDL: `audit_event` has no detail column (`20261015140500:5-20`). (c) breaks "the reviewer reads what the payer reads". |
| C18 | Proving the review page's words equal the PDF's | (a) two halves: worker PDF text vs `explainPacket`, web loader vs `explainPacket`; (b) an e2e PDF text extraction | **(a).** (b) needs `pdfjs-dist` in `apps/web/package.json` and `pnpm-lock.yaml`, both #42 files (finding B2); the two halves prove the same equality through the one function. |
| C19 | SECONDARY_PAYER's meaning | (a) word the trace's claim status, keep the doc's remedy; (b) fix the doc in this PR; (c) quote the doc | **(a).** (c) prints a false sentence for status 20 and 21; (b) changes `docs/product/rules-reference.md`, which must equal the doc and is copied from `content/sources/plan/rules-reference.md`, a cited content source: a content-pipeline change. |
| C20 | The payer codes | (a) `PAYER_CODES` (ZIP+4, RVU, GPCI, CQ, CO, APM, CMS), each written out at first use; (b) ZIP+4 alone and drop the worksheet's RVU and GPCI headings | **(a).** (b) removes what the payer needs to check CMS's figures. |
| C21 | The reviewer checklist lines | (a) a separate PR under the founder's code-owner review, the lines given in this PR's review prompt; (b) in this PR | **(a).** The file is code-owned (`.github/CODEOWNERS:43`) and this PR's reviewer would review its own checklist. |

Founder-kept, not taken here: a stored worksheet (C2 (b)) and its domain-model approval; any reversal of an ADR 0061
ruling (none is made: the worksheet is D2's "how its expected amount is computed"); legal text (none is written).

---

## 12. Improvements seen

**Taken in this PR** (each small and inside its files):
- The line page's unpriced reason, method, adjustments and unrounded amount in words and dollars (3.9).
- `Citation`'s raw method code in words (`display.tsx:105`).
- The reviewer's dead "Line trace" link hidden (C10).
- `MA_NONCONTRACTED_CITATION` in one place (`@tp/packets`).
- A real-trace test helper (`pricedLine()`), so a worker test proves the PDF's calculation came from a trace.
- The PDF's patient share says "reported, never subtracted", as the review page does.
- `packages/db/src/schema/pricing.ts:120`'s comment says `tp-pricing-trace/1`; the format is `/2`. **Not taken:** the
  file is not one of #42's, but it is schema source in `packages/db`, which this PR otherwise leaves alone; the
  one-word fix goes to Lane A's next schema PR (status file). The applied migration's comment
  (`20261018090000_pricing_runs.sql:19`) is never edited.

**Proposals outside this PR** (status file):
- `docs/product/unpriced-reasons.md:17` says SECONDARY_PAYER is "Claim status 2 or 3"; the engine also stops 20 and
  21. `:15` (NO_PFS_VALUE) omits the setting detail. The fix runs through the content pipeline: the plan source
  `content/sources/plan/rules-reference.md` (cited by `content/drafts/**`), `docs/product/rules-reference.md`, the
  doc, and the two code copies (`apps/web/src/lib/contracts/remedies.ts:31`, `apps/worker/src/report/remedies.ts:16`),
  under `unpriced-reasons.test.ts`. Once it lands, the renderer may quote the meaning again (C19).
- **The words version stored** (Lane A): `approved_words_version` and `export_words_version` on `packet_version`
  (2.2), closing the one gap of C17.
- **The reviewer checklist lines** (C21): one small PR to `.claude/agents/payment-engine-reviewer.md`.
- The case page's bare `'WINDOW_PASSED: ...'` literal (`cases/[caseId]/page.tsx:~187`) in words; and the four other
  bare unpriced codes (`claims/page.tsx:212`, `pricing-runs/[runId]/page.tsx:266`, `components/pricing/diff.tsx:37,
  47`, `components/pricing/display.tsx:114`) through the package's words. PR 13 or a small follow-up.
- PR 12's calculation manifest states each line's words and the rule records' CMS titles and quarters (C8 (b)).
- A stored worksheet (`tp-packet/3`) for Lane A, only if the founder wants the database to check it (section 2.2).
- `csv.ts:49-50` `exactDollars` and `formatUnroundedUsd` are two paths to one form; one helper.
- A render-level lint (component tests now; later a tour check) for any `[A-Z]+_[A-Z_]+` code in visible text, since
  `tools/brand-copy` cannot see dynamic values.
- Seen while revising: no property test in the repo scales `numRuns` down under a mutation run; a shared helper
  (`fcRuns(n)`) in the Stryker base config would let every money package keep full counts in CI and short ones under
  mutation. A proposal for the mutation owner.

---

## 13. Review

### Design review (one adversarial reviewer)

One adversarial reviewer read this design against the tree at 6ddd587. Verdict: "Not ready to build as written: two
blockers, five majors, eleven minors". The core held up: code-only renderer, stored trace fields only, no migration,
no domain-model or format change, `packages/pricing/src` and the ledger untouched, no 100% figure, flags that are off
kept out of the payer copy. The raw findings are in `/home/user/ops/designs/lane-b-figures-in-words-review.json`.
The verdict counts eleven minors; its list holds twelve, all dispositioned here (19 findings). The IDs below are this
design's (the JSON carries the same `id` on each). The designer checked each one against the code before applying it.
Seventeen are applied as proposed. Two are applied in part, because one step of the proposed fix does not hold in the
tree (M1, m3; the reason is given below).

| # | Severity | Finding (short) | Checked against | Disposition |
|---|---|---|---|---|
| B1 | blocker | Golden words test in `tools/` needs `@tp/packets`: changes `tools/package.json` and `pnpm-lock.yaml` (#42) | `tools/package.json:16-30` (no `@tp/packets`); `pnpm-lock.yaml` in `pr42-files.txt` | **Applied, with a better source.** The test moves to `packages/packets/src/explain/golden.test.ts` and reads golden traces committed under `explain/__golden__/`. A `tools/` script writes those traces through `goldenPricingInput`, where every import already resolves; the reviewer suggested `apps/worker` for this. A `tools/` test holds the copy equal to a fresh pricing, so it cannot go stale. The `version.ts` hash is computed in the package, not in `tools/`, for the same reason. 4.1, 4.2, 7 step 8, C12. |
| B2 | blocker | e2e PDF-text check needs `pdfjs-dist` in `apps/web` (#42 files) | `apps/worker/package.json:63` only | **Applied.** Split into a worker half (PDF text contains `explainPacket` payer words) and a web half (the review loader deep-equals `explainPacket`). The e2e checks the region and summary only. 4.4, C18. |
| M1 | major | Words not bound across a deploy; "as bound as a stored one" false for words | `audit_event` columns `20261015140500:5-20`; attestation CHECK `20261103090000:817-829`; job payload `apps/worker/src/jobs/registry.ts:58` | **Diagnosis right; fix applied in part.** The proposed record "in the approval and export audit events" is **wrong for this tree**. `audit_event` has no detail column, and the attestation and verifier jsonb are closed by CHECKs, so it would be DDL. Taken instead, all code only: a `WORDS_VERSION` shown in the Internal record card; the approve and export-request forms post it and their handlers refuse a mismatch; the job payload carries it and the export job refuses a mismatch as a print failure; the attester attests the downloaded PDF by its SHA-256. One gap is left: approval under one renderer, export under another. It is named in 2.1, 3.8, 10 and ADR 0072, and storing the version is recommended to Lane A (2.2, C17). |
| M2 | major | MA non-contracted line's Medicare rules worded as a contract's or rate record's | `packages/contracts/src/terms.ts:209-216, 358-361` | **Applied.** Branch on `agreement.outcome === "MA_NONCONTRACTED"`, with the reviewer's words; a unit check that no MA flag or timed-units sentence names a contract or rate record; added to the payment-engine reviewer's checks. 3.4, 4.3, 8. |
| M3 | major | Payer code rule (ZIP+4 alone) contradicts RVU, GPCI, APM, CQ, CO in the payer words | design 3.2, 3.4, 3.6 | **Applied.** `PAYER_CODES` = ZIP+4, RVU, GPCI, CQ, CO, APM, CMS, each written out at first use. CMS is also added to `CODES`. 3.2, 4.3, C20. |
| M4 | major | Year worded from the `year_basis` label, not the engine's lookup | `packages/pricing/src/trace.ts:126-129`; `engine.ts:99, 566-567`; `LANES.md:180` | **Applied.** Year words come from `fee_schedule.lookup` and `basis_year`. The label is checked against them by string equality, and a disagreeing pair throws `ExplainShapeError`. A line with no lookup leaves the year out. 3.4, 3.6, 4.3, 10. |
| M5 | major | Payer leak scan narrower than the real one | `packages/packets/src/test-support.ts:159-185`; `apps/worker/src/packets/test-support/payer-copy.ts:44` | **Applied.** Every payer string runs through `PAYER_COPY_INTERNAL_TERMS` and `CODE_SHAPES`. `CODE_SHAPES` moves into `@tp/packets/testing`, re-exported by the worker file, which is not a #42 file. 3.3, 4.3, 7 step 5. |
| m1 | minor | Sequestration sentence false when the payer's share is floored at zero | `engine.ts:836-837` | **Applied.** `payer_share_cents === "0"` takes "leaves no payer's share, so nothing is withheld". Unit case added. 3.4, 4.3. |
| m2 | minor | "the practice's locality" when `locality_basis` is NAMED | `trace.ts:108`; `engine.ts:561-562` | **Applied.** NAMED reads "carrier {carrier} locality {locality}, as the rate record names it". A unit case covers the stopped line. 3.4, 4.3. |
| m3 | minor | SECONDARY_PAYER meaning "Claim status 2 or 3" false for 20 and 21 | `engine.ts:84`; `docs/product/unpriced-reasons.md:17` | **Applied in part.** The reviewer's first fix (edit the doc in this PR) is **not taken**. `unpriced-reasons.test.ts:28-32` requires the doc to equal `docs/product/rules-reference.md`, whose table is the same as `content/sources/plan/rules-reference.md`, a content source cited by `content/drafts/**`. So the edit is a content-pipeline change, not "just moves the parity test". The reviewer's fallback is taken: for this reason the meaning comes from the trace's claim status, and the remedy is still quoted. The doc fix is proposed (12, C19). |
| m4 | minor | `explainPacket` does not check each line was priced by the cited rate record | `packages/packets/src/format.ts:74-80`; `apps/worker/src/packets/records.ts:417-418`; `rate_record.verified_by` `20261016160000:211-217` | **Applied.** `ExplainBindingError` for a rate-record or MA mismatch; the line page cites a page only from a signed-off record. 3.8, 3.9, 4.3, 4.4. |
| m5 | minor | Figure tests do not prove each figure is the right one | design 4.1 | **Applied.** `explain/slots.ts`, a hand-written table of each slot's trace path, asserted for every figure. Tokenising is word-bounded, and the citation reference is canonicalised. The design's own claim that check 2 catches a wrong path is withdrawn. 3.1, 4.1. |
| m6 | minor | AMBIGUOUS_RATE prints a count with no `count` form | design 3.2, 3.4 | **Applied.** A `count` form is added, the one derivation allowed, and named in the renderer's rule. 3.2, 3.4. |
| m7 | minor | e2e breaks on new markup; closed `<details>` hidden from role queries; no 390 px or axe on the line page | `e2e/packets.spec.ts:106`; `e2e/pricing.spec.ts:120`; `e2e/a11y.ts:11, 53` | **Applied.** `getByRole('region', { name: 'Calculations' })`; the disclosure is opened first; `expectAccessible` and `atPhoneWidth` run for the manager, the viewer and the review page; the JSON `<pre>` sits in a keyboard-reachable scrolling region. 3.9, 4.4. |
| m8 | minor | New purposes `packet_draft` and `packet_review` split one screen's audit trail | `apps/web/src/lib/packets/queries.ts:264, 364`; `review.ts:146` | **Applied.** The existing `packet_build` and `packet_review` are used. 3.8, 7 step 14. |
| m9 | minor | Viewer's trace withheld only by handler convention | `apps/web/src/lib/pricing/queries.ts:395` | **Applied.** `pricedLineOf` is unchanged. A separate audited `pricedLineWords()` has no trace field in its return type, and the loader test checks the viewer's serialised page data. 3.9, 4.4, 7 step 20. |
| m10 | minor | Payer words say "release" and "the engine's expression"; bare "line {n}" beside "Row {n}" | design 3.3, 3.4, 3.6 | **Applied.** The payer words say "Medicare's assistant percentage", "Medicare's sequestration record", "The calculation:" and "claim line {n} (row {r})". The golden pins hold them, and no payer pin contains "release". 3.4, 3.6, 4.2. |
| m11 | minor | Reviewer checklist edited under CODEOWNERS `/.claude/` in the PR that reviewer reviews | `.github/CODEOWNERS:43` | **Applied (the second option).** The checklist lines go to a separate PR under the founder's code-owner review; this PR's reviewer gets them in its prompt. 7 step 30, C21. |
| m12 | minor | A new `citations.ts` would be outside `MUTATE`; property test lengthens mutant runs | `stryker/base.mjs:48-66`; `packages/pricing/src/properties.test.ts:168` | **Applied.** The constant goes in `payer.ts`, which is already mutated. The property test uses a fixed `numRuns` of 100. No test in the repo switches its count under mutation, so none is invented, and a shared helper is proposed (12). `words-version.ts` is added to `MUTATE` and `__golden__/` is excluded. 4.1, 4.5. |

**Still no migration.** After every fix above, the PR has no DDL, no domain-model regeneration, no `tp-packet`
format change, no change under `packages/pricing` at all, no ledger change, no content-pipeline change,
and no change to any #42 file except the four shared files, by added rows. The only work that needs a migration is the
stored words version (2.2) and, if the founder wants it, a stored worksheet. Both are Lane A proposals, recommended or
offered, and neither is built here.
