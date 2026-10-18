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
- `source_document_first_of_its_bytes`, the one document of a practice per bytes, is per bytes and format
  (`coalesce(format_id, '')`, which is `''` for every kind but `era_export`): the same bytes uploaded again as an
  export of another format (after a wrong choice, held whole) or as another kind are read, not held as a
  duplicate; the payment keys still load each payment once. Every other kind keeps its rule.
- `remittance_by_trace_form` indexes a remittance by its trace's form (`ltrim(upper(trn02 COLLATE "C"), '0')`),
  which the loader compares across sources (below).
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
  at most two places, never a float, at most `MAX_AMOUNT_CENTS`, ten billion dollars, so no cell can reach the
  database as a value out of `bigint`'s range); dates are the format's date format and real calendar dates.
- A payment is the rows sharing (payee, trace, payment date, signed amount), placed by its first row; a claim is
  consecutive rows of a payment with one patient control number, payer claim number and status. Reversals are
  status 22 and a corrected claim directly follows a reversal with the same patient control number (the
  parser's own rule), linked by the loader's existing lookup.
- A line is a HCPCS procedure (`HC`, five letters or digits), at most four modifiers, positive units that
  `numeric(9,3)` holds exactly, one service date, its place of service, and its charge, paid, patient
  responsibility, contractual and other adjustments, balanced (charge = paid + CO + PR + other). The place of
  service is two digits, as CLP08 gives a professional line's (`plan.ts` `placeOfService`): a percent-of-Medicare
  term, and the fee-schedule side of a lesser-of term, price by it, and the engine stops a line without one
  (`place_of_service_unmapped`, which pages the operator). So every format has a place-of-service column and an
  export without it is held whole (`export_column_missing`); a blank cell is a line with none, as an 835 claim
  without CLP08 is, and a cell that is not two digits holds its payment (`export_value_unreadable`), never a
  guessed code. Observed allowed is always paid plus PR on the
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
unreadable, empty, over 4 MiB (`ERA_EXPORT_MAX_BYTES`), lacks a column a line needs or repeats one, or a
payment-key cell (trace, payment date, payment amount, payee) is blank or unreadable on any row; one payment
is held, the others loading (`partially_held`), for a value missing or unreadable, a payer name, sender or
method that changes inside it, a plan that changes inside a claim, a line or the payment unbalanced, or an
adjustment total with no code of its group (or other codes of two groups); and, as it loads, when the payment
it matches by amount names another payer and shares no claim with it (`export_payment_other_payer`, below).
Every hold names the column by the format's header, the data row by number (the header not counted) and the
payment by its place, never a cell's value.

The size bound is the normalizer's memory: it reads the whole file, every row, claim and plan with it, and at
one line per payment, its worst case, an export of 4 MiB fits a 128 MiB heap where one of 8 MiB needed more
than 160 MiB (`era-export.large.db.test.ts` runs it in a child process with its heap limited). The worker runs
four parse jobs at once in one 1 GiB task, so four exports at the bound leave room for the rest; a longer
period goes up as several exports, or a zip of them, each its own document. A streaming normalizer would lift
the bound.

**The 835 is authoritative (D13 a), inside the load transaction.** The parse_835 job dispatches on the kind
with the same payload and singleton key. An export is read once, hashed against intake's SHA-256, normalized,
and its payments are loaded, its report written and its status set in one transaction (the job's
`context.transaction`), under the 835 loader's advisory locks, so an 835 and an export of one trace serialize.
The locks are per practice and bucket of trace forms (`TRACE_LOCK_BUCKETS`, 64, `lockTraces`), and a document
takes the buckets of all its traces first, in ascending order: an export before its first payment, an 835
before its first transaction set (from pass one's report). So two loads sharing traces, an 835's sets in any
order and an export's payments in any order, never wait on each other in a cycle, and no transaction holds more
than 64 advisory locks however many payments it loads (they share the cluster's lock table with every other
practice's transactions).

Across sources, and between two exports, a trace is compared in its form (`traceForm`: ASCII letters in upper
case, leading zeros removed), since a spreadsheet re-save drops a trace's zeros; two 835s keep ADR 0031's exact
rules. An export's payment and an 835's of one trace form are one payment (`exportIsPaymentOf`) when every claim
of the export is a claim of the 835 (by the payer claim control number's keyed hash, whatever form the payee is
named in) and the date or the amount agrees (an export may be dated by its deposit; a trace the payer reused on
another day for another amount stays two payments), or when the payee and date are the same and the amount
agrees. The amount agrees when the export's is the 835's BPR02 or its BPR02 plus its PLB total (an export carries
no PLB, so its amount is the claims paid, as an 835 balances):

- An export payment that is one payment with an 835 the practice holds, or has the export key (payee, trace
  form, credit or debit, BPR02, BPR16) of another export, is `duplicate_remittance`: zero rows, linked to that
  remittance, its document and its provenance. When it matches by amount alone and the other names another
  payer (by name, normalized) and shares no claim with it, it is held instead (`export_payment_other_payer`),
  linked to it: nothing loads, and nothing is called a repeat that may be another payer's payment. The same
  payee and trace form with another payment loads for review (`trace_reused_same_date` or
  `trace_reused_another_date`).
- An 835 transaction set runs the existing X12 decision first, over 835 rows of its exact trace only (the key,
  then ADR 0031's same payment); then an export of the same payment by the same rule holds it as
  `held_for_review`, reason `payment_loaded_from_export`, linked to the export's remittance and document, and
  nothing is written. It counts as held, so the document is `held` or `partially_held` and a person reviews it.
  An 835 sharing an export's payee and trace form that is not the same payment by that rule (a claim of the
  export is not the 835's, and the amounts or the dates differ) loads for review against it, as an export would.
- `remittance_export_once` and the trigger back the exact keys.

**The Coverage flag.** For each unconfirmed format the practice has loaded lines from, the Coverage screen
shows "Format unconfirmed" as text with an icon, the format's name ("<vendor> ERA export"), its remittance,
line, payer and billed-dollar counts and payer names, and a plain explanation; never color alone. It reads
`unconfirmedFormatSources()` over `remittance`, `source_document.format_id`, `claim` and `service_line`, for the
registry's `FORMAT_UNCONFIRMED` IDs; no view. Confirming a format (registry data) clears it.

**Intake and upload.** The same bytes are a duplicate of an earlier document only of the same format (above),
so a person who chose the wrong system, or uploaded the export as a posting export, uploads it again with the
right one and it is read. An ERA export is CSV only, like a posting export (ADR 0059): a workbook is held as
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
| Compare an export with an 835 by the export key alone | Misses the routine payment with a PLB (an export's amount is its claims paid, never BPR02) and an export dated by its deposit, both of which would load beside the 835; the claims and the PLB-adjusted amount find them. |
| Compare traces exactly across sources | A spreadsheet re-save drops a trace's leading zeros, and the payment would load twice with no review flag; the trace's form is compared instead, and indexed. Two 835s keep ADR 0031's exact rules. |
| Call a payment that matches another payer's by amount a duplicate | Drops a payment without notice when two payers' checks coincide in payee, number, amount and date; it is held for a person instead. Adding the payer to the export key (D12 a names the key without it) is the owner's call. |
| One advisory lock per trace, as the 835 path had | A backfill export of thousands of payments would hold thousands of entries in the cluster's shared lock table, where other practices' transactions need room; 64 buckets bound it, and taking them in order up front removes the lock cycles. One lock per practice would serialize a practice's loads entirely. |
| Place of service optional, with a note on the receipt and the Coverage flag when a format has none | Every placeholder layout can carry the column, and requiring it keeps every loaded line priceable like its 835 twin; we switch when a confirmed format turns out to have no place of service. |
| A larger size bound | Measured: one line per payment at 8 MiB needs more than a 160 MiB heap, and four parse jobs share a 1 GiB task. A streaming normalizer would lift the bound. |

## Consequences

- An ERA export of any of the four formats loads into the same remittance, claim, service_line and adjustment
  rows an 835 makes, with `provenance` `era_export`, and pricing, triage and the ledger read them with no change
  to their code. Nothing under `packages/pricing/src` or `packages/ledger/src` changes. Observed allowed is on
  the `paid_plus_pr` basis, and a line carries the place of service of its export's column, so under a
  percent-of-Medicare term it prices exactly as its 835 twin (`apps/worker/src/price/export-pricing.db.test.ts`,
  under a signed 110%-of-Medicare contract); a line whose cell is blank stops as `place_of_service_unmapped`, as
  an 835 line without CLP08 does.
- Where an export's rows differ from its 835 twin's, and what follows:
  - The payer is `NAME:<payer name>` where the 835's is its N1 or REF 2U identifier (`2U:SYNPAYERA`), and a plan
    is `PLAN:<plan>` where the 835's is `CE:<plan>`. A practice whose 835 payers and plans are all mapped gets a
    new payer and new plans in the mapping queue from its first export, and a pricing run over them fails as
    `unmapped_plan` (MAP-01) until someone maps them. Triage keys a pattern on the payer and the plan
    (`packages/triage/src/patterns.ts`), so one payer's shortfalls from 835 months and export months fall in
    separate patterns and packets until the plans are mapped to one contract, and even then by payer. A rule
    that aliases an export's payer to the 835 payer of the same name is the owner's call, not made here.
  - An export carries no claim frequency code (CLP09). The ledger's adjusted-payments queue finds a replacement
    claim by frequency code 7 or by a superseded link (`apps/worker/src/reconcile/unmatched.ts`), so an export's
    corrected claim surfaces there only when it directly follows its reversal in the export (the link the
    loader makes); one that does not is not listed. Ledger semantics do not change.
  - Also not carried, with no current consumer affected: SVC07 original units, CLP05 patient responsibility,
    AMT AU, the rendering NPI and DTM 405.
- A payment sent as an 835 and as an export loads once in either order, with or without a PLB, whichever date
  the export gives, whatever form of the payee or of the trace each uses; a resent or re-saved export loads
  nothing. What the rules cannot see is the same payment under an entirely different trace: it loads twice, the
  second for no review (see Revisit when).
- Every consumer that showed the X12 envelope must handle NULLs on an export's remittance (the Remittances
  screen shows the provenance and the format instead), and every report reader must decode an export's report
  by the document's kind (the receipts do).
- The row factory's FIXED_VALUES give its 835 an envelope and CLP06; the catalog and cross-tenant tests'
  rules are unchanged.
- Mixed fleet, so the deploy order: the new worker is fully rolled out before the new web image takes
  `era_export` uploads. Before that order holds there are two cases, neither loading anything beside an export:
  an `era_export` document taken by a previous worker image is retried, then failed; and once a new worker has
  loaded an export, a previous worker's 835 of the same payment has no export check before its insert, so the
  trigger refuses it and it is retried, then failed, rather than held for review. Either can be retried from
  Uploads once only new workers run. The trace locks also change keys (bucket, not trace), so an old and a new
  worker loading the same trace at the deploy's moment do not serialize; the unique keys still hold. The
  migration's header states the two cases and the order.
- Bounds: an export over 4 MiB is held as `export_too_large`; a load holds at most 64 advisory locks
  (`apps/worker/src/parse/era/era-export.large.db.test.ts`).
- Checks: `packages/db/src/documents.db.test.ts` and `remittance-provenance.db.test.ts` (the CHECKs, the keys,
  the unique index under a race, both D13 refusals, CLP06), `apps/worker/src/parse/era/normalize.test.ts` (the
  four fixtures to the cent, every held reason, no cell value in a hold), `formats.test.ts` (the registry
  against the manifests), `era/report.test.ts`, `apps/worker/src/parse/era/era-intake.db.test.ts` (each format
  uploads, is classified `era_export` with its format and loads to the manifest to the cent; 835 then export
  loads zero rows for the payment; export then 835 is held for review; a resend loads nothing; held exports; a
  wrong format then the right one; a PLB, a deposit date and a trace without its zeros, both ways; a payee by
  its TIN; another payer's payment under the same key; an 835 and an export parsed at once, and an 835 whose sets
  come in the opposite lock order to an export's, with no deadlock), `era-export.large.db.test.ts` (the heap at
  the size bound, the lock count), `apps/worker/src/price/export-pricing.db.test.ts` (an export line priced as
  its 835 twin),
  `apps/worker/src/intake/intake.db.test.ts`, `apps/web/src/lib/routes/uploads.db.test.ts` and
  `coverage-formats.db.test.ts`, and the `era-exports` end-to-end journeys.
- The domain model is regenerated with the new kind explained; it awaits the founder's approval.

## Revisit when

A format description arrives (confirm the format, or add its `_v1` and a migration widening `format_id`); a
vendor's export is found to carry a claim filing indicator, a frequency code or a per-reason adjustment split,
or to have no place of service (then the column becomes optional, with a note on the receipt and the Coverage
flag that its lines cannot price under percent-of-Medicare terms); a design partner needs spreadsheet exports
read, or exports past 4 MiB in one file (a streaming normalizer); the owner wants an export's payer aliased to
the 835 payer of the same name, or the payer added to the export key; or a payer is found to send an 835 whose
payment an export already holds under another trace, or names its payee in a form the export does not.
