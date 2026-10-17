# 0060. Load ERA exports as remittances by provenance, keep the 835 authoritative, and flag unconfirmed formats

- **Status:** accepted
- **Date:** 2026-10-17
- **Deciders:** the owner (D12 option a and D13 option a, in `docs/product/reconciliation-001.md`, approved 2026-10-17); the build (PR 4 of Change Order 001)
- **PRD sections:** 2 (the same remittance can arrive twice), 6 (Intake and documents; Canonical model and matching), 7 (Uploads; Coverage), 8 (Core records), 10 (Pipeline steps 3 to 10; What the loader never does); Data dictionary, Documents and remittances; Change Order 001, CO-03 (second part) and CO-12; ADRs 0021, 0027, 0031 and 0059

## Context

CO-03 asks that the intake pipeline treat the ERA exports of WebPT Billing, Prompt, SPRY and Raintree "as
first-class input formats beside raw 835 files", and its acceptance is that "each of the four formats
round-trips through intake into canonical claim lines on synthetic data; an unconfirmed format is flagged in
the Coverage screen". PR 3 (ADR 0059) brought the vendor format registry, every format `FORMAT_UNCONFIRMED`,
and one synthetic ERA fixture per format under `fixtures/synthetic/emr/<format_id>/`, whose `manifest.json`
holds the canonical rows a reader must produce, in integer cents, totalling each payment to the cent.

What the repository held, and what constrains the design:

- `remittance` required the X12 envelope (ISA06, ISA08, ISA13, GS06, ST02, TRN03, BPR04, N103) on every row,
  `remittance_references_in_practice()` refused a remittance of any document but an `x12_835`, and the only
  duplicate key was `remittance_once` (practice, sender, ISA13, TRN02, BPR02). An export has no envelope; it
  carries a check or EFT number, a payment date and amount, the payee and the payer, and sometimes the
  interchange sender and payment method.
- `claim.filing_indicator` (CLP06) was NOT NULL; an export has no claim filing indicator.
- `DOCUMENT_KINDS` had no kind for an export of remittances, and `source_document` no place to say which
  vendor's layout a file is in.
- Pricing reads a line's observed allowed and its basis (`amt_b6` or `paid_plus_pr`), its patient share (the
  PR adjustments), its plan and its line facts; triage and the ledger read claims and lines. None of them may
  change (the change order's "What must not change"; CLAUDE.md rules 1 to 4).
- The same payment can reach a practice both ways: the payer's 835 through a clearinghouse, and the
  practice-management system's export of the same remittance. Loading both doubles variance and cases;
  replacing lines already priced would break the immutability of `pricing_run` and `priced_line` (rule 3).
- A vendor's export is a placeholder layout until the design-partner firm sends a format description, so its
  amounts deserve a visible caveat until then.

## Decision

**Provenance on remittance, no export table (D12 a).** One forward-only migration,
`20261102090000_era_export_intake.sql`, adds no table and touches no ledger, pricing or rule table:

- `source_document.kind` gains `era_export` (the CHECK keeps `x12_835` first, the row factory's choice), and
  `source_document.format_id` holds the vendor format, one of `webpt_billing_era_v0`, `prompt_era_v0`,
  `spry_era_v0` and `raintree_era_v0`, required exactly when the kind is `era_export`
  (`source_document_format_of_era_export`). It is inserted with the document and has no UPDATE grant; a zip's
  entries carry their zip's format (`source_document_rules()`). The CHECK equals `ERA_FORMAT_IDS` in
  `@tp/db` and the registry's ERA formats, which a test holds: a new version of a format (`_v1`) needs a
  migration, and confirming a format stays a change to registry data.
- `remittance.provenance` is `x12_835` (the default, so every existing row is an 835) or `era_export`. The
  eight envelope fields are nullable, each keeping its `btrim` CHECK; `remittance_x12_envelope` requires all
  eight of an 835 and `remittance_export_has_no_envelope` refuses a receiver, ISA13, GS06, ST02, TRN03 or
  payee qualifier on an export, which keeps its sender and payment method only when its columns hold them.
  `trn02` holds the export's check or EFT number, `bpr02_cents` its payment unsigned with `bpr_credit_debit`
  `D` when it is negative (a take-back), `bpr16_date` its payment date; `status` is `loaded` as for an 835.
- The export duplicate key, `remittance_export_once`, is unique on (practice, payee, TRN02, credit or debit,
  BPR02, BPR16) over export rows. The credit or debit is in it because BPR02 is stored unsigned, so the sign
  is part of the payment amount. `remittance_once` is unchanged; an export's NULL ISA13 never meets it.
- `remittance_references_in_practice()` takes a remittance only from a document of its own provenance in its
  practice (an `era_export` document is accepted), and, as the loader's backstop, refuses an export of a
  payment the practice already holds from either source and an 835 of a payment first loaded from an export.
- `claim.filing_indicator` is nullable; `claim_references_in_practice()` still refuses a claim of an 835
  without it.
- No held reason or status is added to any CHECK: `source_document.status`, `parse_report.outcome`,
  `remittance.status`, `review_reason` and `job_run.job_type` reuse their values. An export's holds live in
  `parse_report.errors` and `transaction_outcomes`, jsonb arrays.

CLAUDE.md's idempotency convention now states both keys and the 835's authority.

**One normalizer into the 835 loader's load model.** `apps/worker/src/parse/era/normalize.ts` reads any format
of the runtime registry (`apps/worker/src/parse/era/formats.ts`, exported as `@tp/worker/era-formats`, held
equal to each fixture's manifest by its test; `packages/synth` is the fixture generator and does not ship with
the worker) into `LoadPlan`, the model `Loader` writes, one plan per payment. It is pure and data-driven: no
code knows a vendor.

- The file is CSV in strict UTF-8 (`@tp/ledger` `parseCsv`); row 1 is the header, each format column found by
  its header trimmed and in any case, other columns ignored. Money is `@tp/money` `parseAmount` (integer cents,
  at most two places, never a float); dates are the format's date format and real calendar dates.
- A payment is the rows sharing (payee, trace, payment date, signed amount), placed by its first row; a claim is
  consecutive rows of a payment with one patient control number, payer claim number and status. Reversals are
  status 22 and a corrected claim directly follows a reversal with the same patient control number (the
  parser's own rule), linked by the loader's existing lookup.
- A line is a HCPCS procedure (`HC`, five letters or digits), at most four modifiers, positive units that
  `numeric(9,3)` holds exactly, one service date, and its charge, paid, patient responsibility, contractual and
  other adjustments, balanced (charge = paid + CO + PR + other). Observed allowed is always paid plus PR on the
  existing `paid_plus_pr` basis, the export's Allowed figure kept beside it in `line_allowed_cents`, so the
  engine does not change and AMT B6 is never claimed for a file that does not carry it.
- Adjustment codes are `GROUP-REASON` items. The group is from `@tp/edi835`'s `X12_835_CODE_SETS` (CO, OA, PI,
  PR; CR is not a 5010 group and is held as the parser holds it), each reason a CARC flagged unknown as the 835
  path flags it. There is one adjustment row per group with codes (contractual CO, patient responsibility PR,
  other OA or PI), placed by its group's first code, its reasons joined with `+` (`1+2+3`): an export gives a
  group's total, never a split by reason, and pricing reads only the PR sum.
- The payer is named `NAME:<payer name>` and each claim's plan `PLAN:<plan>` for the mapping queue; the patient
  is keyed by the patient control number alone (`pcn|<PCN>`, as an 835 claim without a patient name is), since
  an export carries no name or member ID. No envelope value is invented.

**A closed list of held reasons.** `ERA_EXPORT_HELD_REASONS`: the whole document is held when it is
unreadable, empty, over 64 MiB (`ERA_EXPORT_MAX_BYTES`), lacks a column a line needs or repeats one, or a
payment-key cell (trace, payment date, payment amount, payee) is blank or unreadable on any row; one payment
is held, the others loading (`partially_held`), for a value missing or unreadable, a payer name, sender or
method that changes inside it, a plan that changes inside a claim, a line or the payment unbalanced, or an
adjustment total with no code of its group (or other codes of two groups). Every hold names the column by the
format's header, the data row by number (the header not counted) and the payment by its place, never a cell's
value.

**The 835 is authoritative (D13 a), inside the load transaction.** The parse_835 job dispatches on the kind
with the same payload and singleton key. An export is read once, hashed against intake's SHA-256, normalized,
and its payments are loaded, its report written and its status set in one transaction (the job's
`context.transaction`), each payment under the 835 loader's own advisory lock on (practice, trace), so an
835 and an export of one trace serialize:

- An export payment with the payee, TRN02, credit or debit, BPR02 and BPR16 of any remittance the practice
  holds is `duplicate_remittance`: zero rows, linked to that remittance, its document and its provenance. The
  same payee and trace with another amount or date loads for review (`trace_reused_same_date` or
  `trace_reused_another_date`).
- An 835 transaction set runs the existing X12 decision first, over 835 rows only (the key, then ADR 0031's
  same payment); then an export remittance with the export key holds it as `held_for_review`, reason
  `payment_loaded_from_export`, linked to the export's remittance and document, and nothing is written. It
  counts as held, so the document is `held` or `partially_held` and a person reviews it. An 835 sharing an
  export's payee and trace with another amount or date loads for review against it, as an export would.
- `remittance_export_once` and the trigger back both rules.

**The Coverage flag.** For each unconfirmed format the practice has loaded lines from, the Coverage screen
shows "Format unconfirmed" as text with an icon, the format's name ("<vendor> ERA export"), its remittance,
line, payer and billed-dollar counts and payer names, and a plain explanation; never color alone. It reads
`unconfirmedFormatSources()` over `remittance`, `source_document.format_id`, `claim` and `service_line`, for the
registry's `FORMAT_UNCONFIRMED` IDs; no view. Confirming a format (registry data) clears it.

**Intake and upload.** An ERA export is CSV only, like a posting export (ADR 0059): a workbook is held as
`wrong_type` and the request does not accept the `.xlsx` type. The upload request requires `formatId` exactly
for an `era_export` ("File N is an ERA export: choose which system's export it is." / "File N has an export
format but is not an ERA export.") and records it; the Uploads page lists the formats with whether each is
unconfirmed.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| D12 (b): a separate export table | Forks every consumer: pricing, triage, the ledger, the Remittances and Claims screens and the monitor would each read two shapes. Provenance on `remittance` keeps one. |
| D12 (c): defer the loading until real format samples arrive | Fails CO-03's acceptance; the placeholders are flagged instead, and confirming a format is data. |
| Fill the X12 envelope of an export with synthetic values (a made-up ISA13, TRN03, qualifier) | Invents values a receipt, an export or a packet could show as the payer's; the NULLs and their CHECKs say what an export does not carry. |
| Produce edi835's `LoadableRemittance` from an export | It is the parser's typed loops (segment positions, envelope control numbers, qualifiers); filling it would invent the same values. `LoadPlan` is the model the loader writes. |
| A unique index across provenances on (payee, trace, amount, date) | Two 835s may share payee, trace, amount and date under different TRN03 values (ADR 0031), so the cross-provenance rule is the loader's, with the trigger as backstop. |
| D13 (b): the first arrival wins | An export loaded first would stand against the payer's own 835; D13 makes the 835 authoritative. |
| D13 (c): load both and net them | Doubles variance and cases until netted, and every later milestone must remember to net. |
| Replace an export's remittance when its 835 arrives | Its lines may already be priced; priced lines are immutable (rule 3). Holding the 835 for review keeps both decisions with a person. |
| Observed allowed from the export's Allowed figure (`amt_b6`) | The basis says AMT B6 was sent; an export's Allowed column is the vendor's figure, not B6. `paid_plus_pr` is the basis the engine already reads, and the figure is kept beside it. |
| One reason per adjustment row, splitting a group's total | An export gives a group's total; any split would be invented. The joined reason keeps every code, and the PR sum is unchanged. |
| One loader per vendor | Four copies of the same rules; the registry's data drives one reader, and a confirmed `_v1` is a new entry, not new code. |
| New CHECK values for held reasons or statuses, or a new job type | The existing statuses, outcomes and `parse_835` job express every case; the reasons are a closed list in the report's jsonb, so a new reason needs no migration. |
| Import `packages/synth`'s registry in the worker | `packages/synth` generates fixtures and is not part of the worker's image; the runtime registry is held equal to the manifests the generator writes. |
| Read `.xlsx` exports | No sheet reader is in the repository (ADR 0059); the same reasons hold. |

## Consequences

- An ERA export of any of the four formats loads into the same remittance, claim, service_line and adjustment
  rows an 835 makes, with `provenance` `era_export`; pricing, triage and the ledger read them unchanged, and
  their lines price on the `paid_plus_pr` basis. Nothing under `packages/pricing/src` or `packages/ledger/src`
  changes.
- A payment sent as an 835 and as an export loads once in either order; a resent export loads nothing.
- Every consumer that showed the X12 envelope must handle NULLs on an export's remittance (the Remittances
  screen shows the provenance and the format instead), and every report reader must decode an export's report
  by the document's kind (the receipts do).
- The row factory's FIXED_VALUES give its 835 an envelope and CLP06; the catalog and cross-tenant tests'
  rules are unchanged.
- Mixed fleet: an `era_export` document taken by a previous worker image is retried, then failed, and can be
  retried from Uploads once the new worker runs; none exists until the new web image accepts the kind.
- Checks: `packages/db/src/documents.db.test.ts` and `remittance-provenance.db.test.ts` (the CHECKs, the keys,
  the unique index under a race, both D13 refusals, CLP06), `apps/worker/src/parse/era/normalize.test.ts` (the
  four fixtures to the cent, every held reason, no cell value in a hold), `formats.test.ts` (the registry
  against the manifests), `era/report.test.ts`, `apps/worker/src/parse/era/era-intake.db.test.ts` (each format
  uploads, is classified `era_export` with its format and loads to the manifest to the cent; 835 then export
  loads zero rows for the payment; export then 835 is held for review; a resend loads nothing; held exports),
  `apps/worker/src/intake/intake.db.test.ts`, `apps/web/src/lib/routes/uploads.db.test.ts` and
  `coverage-formats.db.test.ts`, and the `era-exports` end-to-end journeys.
- The domain model is regenerated with the new kind explained; it awaits the founder's approval.

## Revisit when

A format description arrives (confirm the format, or add its `_v1` and a migration widening `format_id`); a
vendor's export is found to carry a claim filing indicator, a place of service or a per-reason adjustment
split; a design partner needs spreadsheet exports read; or a payer is found to send an 835 whose payment an
export already holds under another trace.
