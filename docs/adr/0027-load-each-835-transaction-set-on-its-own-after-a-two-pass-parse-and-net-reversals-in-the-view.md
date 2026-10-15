# 0027. Load each 835 transaction set on its own after a two-pass parse, write rows only for what loads, and net reversals in the view

- **Status:** accepted
- **Date:** 2026-10-16
- **Deciders:** founder (engineering)
- **PRD sections:** 5 (J4, J6), 6 (835 parser; Canonical model and matching; Monitoring jobs), 7 (Practice dashboard,
  Uploads, Remittances, Claims and lines), 8 (core records, invariants), 10 (Pipeline steps 8 to 10; Errors and
  resilience; What the loader never does), 13 (Matching: step 1 is milestone 9), 15 (Request path for a PHI page);
  Data dictionary, Documents and remittances, Operations and Indexes that matter; test matrix PAR-06 to PAR-30, JOB-01,
  JOB-02; ADRs 0013, 0015, 0019, 0021, 0025 and 0026

## Context

Milestone 2 built the parser (ADR 0025): bytes in, typed events and a final report out, with each transaction set held
on its own and a later envelope error able to hold a set already emitted. Milestone 3 built intake (ADR 0026), which
queues `parse_835` per clean 835. The loader between them writes the canonical records: `remittance`, `claim`,
`service_line`, `adjustment`, `provider_adjustment`, `patient_ref` and the payer and plan rows of the mapping queue, and
the per-document `parse_report`. The plan fixes what must hold (one database transaction per transaction set and one
practice per job; never load a held set; dedup by file hash, then by the remittance key; same trace on another day for
review; exactly one row under concurrent uploads; never infer a claim from a line; never merge practices; never read
outside the practice's prefix; a reversal followed by a correction nets to one claim in the view) but leaves open where
the loader lives, how it meets the parser's provisional flags with bounded memory, which rows a held set gets, how a
payer, a plan and a patient are keyed, and a few columns the data dictionary does not name.

## Decision

**Where.** The loader is the parse job's, in `apps/worker/src/parse`: `plan.ts` (pure: a loadable transaction set to the
rows it becomes), `loader.ts` (writes them inside the job's transaction), `report.ts` (pure: the parse report row) and
`job.ts` (the `parse_835` handler). `packages/edi835` stays the pure parser under its 100% branch gate; the database
belongs to the job that uses it.

**Two passes, one transaction per document** (ADR 0031; it was one per set until the milestone 2 and 3 review). The job
reads the sealed document (from its generated key under the practice's prefix, opened with the practice's cipher)
twice as a stream. Pass one keeps only the report, whose holds are final, and checks its SHA-256 against the hash
intake recorded. Pass two, in one `withJobScope` transaction, loads each set the report leaves loadable as the stream
reaches it, one set in memory at a time (10,000 claims in about six seconds), then writes the report row and the
document's receipt status; all commit together. A failed attempt leaves nothing, so a retry starts over (JOB-01).

**Rows only for what loads.** A `remittance` row is written only for a set that loads; its `status` is `loaded`, its
`balanced` a generated column (`balance_diff_cents = 0`), and a check refuses a loaded row with a difference. Held sets
live in `parse_report` (their reasons, segment indexes, segment IDs, element positions and differences), never in
`remittance`; the data dictionary's `held` and `duplicate` statuses stay valid values for the screens' future use. A
value the database cannot hold exactly (units or a CAS quantity beyond `numeric(9,3)`) holds its set as `EDI_SYNTAX
invalid_decimal` at its element rather than rounding.

**Dedup.** The unique key is the data dictionary's, `(practice_id, sender_id, isa13, trn02, bpr02_cents)`; the parser's
decision (`remittanceDecision`, whose key adds the payee) runs over the practice's remittances with the same TRN02, all
under a transaction-scoped advisory lock on practice and TRN02, so two loads of one remittance serialize and make one
row (PAR-30). A remittance already held under the key is a duplicate: zero rows, and the report links the set to the
original remittance and its document (PAR-07). A document whose every set is such a duplicate gets the receipt status
`duplicate`; a document with any held set is `held` (the receipt says when it is partly held); otherwise `loaded`. A
different remittance reusing a trace the payer used for this payee loads with `review_reason` and
`review_of_remittance_id` (V25).

**Keys.** The payer for the mapping queue is identified as sent: `N103:N104` when sent, else `2U:<REF 2U>`, else
`TRN03:<originator>` (V24's two forms stay two payers). A claim's plan key is `CE:<REF CE>`, else `CLP06:<filing
indicator>`; `service_line.payer_plan_key` is the plan row's ID (a plan belongs to one payer), indexed with the
procedure code as the dictionary asks. The patient key names no payer: the NM1 name, normalized (NFKC, upper case,
single spaces), `name|last|first|middle|suffix`, followed by `|member|<member ID>` when one is sent (ADR 0031: two people
of one name with different member IDs are never one reference), else `id|NM108|NM109`, else `pcn|CLP01`; the insured
(NM1 IL) gets one the same way. `patient_ref.pseudonym` is the practice's keyed HMAC of that key (`LOOKUP_COLUMNS` gains
`patient_ref.pseudonym`), so it is stable within the practice and meaningless outside it. The member ID is NM109 when
NM108 is MI, HN, II or MR (never 34, a Social Security number); the group number is REF 1L, on the insured when there is
one. An upsert fills a missing member ID or group number and never overwrites one. An 835 carries no date of birth.

**Reversals and corrections.** A reversal (CLP02 22) links to the claim it reverses: the parser's link inside the set
first, else the practice's latest earlier claim with the same payer claim control number (by its keyed hash), the same
patient control number (decrypted) and the negated charge, not itself reversed. A correction supersedes the original
its reversal reversed, or the claim its REF F8 names. A reversal loaded before its original (files uploaded out of
order) is linked when the original arrives. Links are set once (a trigger refuses a change) and only inside the
practice. The **net view** of Claims and lines leaves out reversals, claims a reversal reversed and claims a
correction superseded, so a reversal followed by a correction shows the corrected claim alone (PRD 6).

**Reports.** `parse_report` holds the receipt counts, the PLB total, what loaded, the duplicates, unknown codes shaped
like codes (`carc:Z999`; anything else `(not shown)`), errors as code, reason or scope, segment index, segment ID,
element and component position and the difference only (never the parser's message or found values), and one outcome
per set with the remittance it loaded or duplicates. The Uploads receipt and its CSV error report read it; the receipt
page lists every error with its segment and position.

**Runs.** The worker records each practice job's attempts in `job_run` (running, retrying, failed on the third,
succeeded) inside the job's own scope; the practice home shows the last run and a run-failed banner with the job
reference until a later run of the same job key succeeds (JOB-02). The operator alert line is unchanged (ADR 0019).
A zip queues hundreds of `parse_835` jobs at once, each well under a second's work, so that queue is polled every half
second (pg-boss's minimum, against its default two) by four workers per process (`workOptions`): a 500-file zip loads in
about a minute instead of seventeen. Concurrent loads of one practice are safe for the reasons under Dedup and because
every upsert takes its rows in one order.

**Code lists.** CARC and RARC come from the newest published rule release; with none (a development database), every
one loads flagged unknown and the report records no release.

**Screens.** Remittances (payer, payment date, trace, amount, claims, balanced, source file; filtered by payer and
paid month; reversals linked to their originals) and Claims and lines (server-side pages of 50; filters by payer,
remittance, claim, patient reference, code and service month; the net and full views; expected allowed and status
ready for pricing) are practice routes under `practice.open`. PHI columns (patient reference, control numbers, service
dates, a PLB's reference, notes) are decrypted only for `phi.read`; a payer claim control number is searched for by a
form post that redirects to the claim's opaque ID (the newest adjudicated claim with that number, not the reversal that
repeats it); filters carry months, not dates, because the URL guard refuses
date-of-birth-shaped values. Every row returned is an audited read. A note on a line (`case.work`) is a `line_note`
row, encrypted like the identifiers because a person may type anything into it.

**Columns beyond the dictionary's key fields**, each because a requirement needs it: remittance `trn03` (trace reuse),
`bpr_credit_debit` (a debit's sign), `payee_id_qualifier`, `review_reason`, `review_of_remittance_id`; claim `claim_no`,
`filing_indicator` (the plan key; Medicare Advantage later) and `payer_claim_control_number_hash`; service_line
`procedure_qualifier`, `service_date_to` (PAR-23's ranges), `observed_allowed_allocated` (PAR-10's flag) and
`patient_share_cents`; adjustment `unknown_code` (PAR-21's flag); provider_adjustment `position`, `provider_id`,
`category` and the generated `counted` (PAR-17, PAR-18); parse_report's outcome, loaded and duplicate counts, PLB
total, unknown codes, outcomes and code-list release. `place_of_service` is CLP08 on a professional line (a HCPCS
procedure and no revenue code; ADR 0031): an 835 has no line-level place of service, and on a professional claim CLP08
carries it; CLP08 is kept as the claim's facility type too.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| The loader inside `packages/edi835` | It would bring the database into the pure parser and its 100% branch gate, which runs without one; switch if a second consumer of the events appears |
| One pass, buffering events until the report | Memory would grow with the file, against PRD 10's bound per transaction set; the second pass costs well under a second for 10,000 claims |
| A `remittance` row for every held set | A truncated download's held row would block the complete download's load under the unique key, and PAR-20 says nothing loads; the report already holds the reason and position |
| The unique key with the payee (CLAUDE.md's dedup key) | The dictionary names the key; the parser's decision, which uses the payee, still runs inside it |
| The name alone as the patient key | Merges two patients of one name and drops the second one's member ID, which packets carry (ADR 0031) |
| Encrypting nothing in `line_note` | A note is free text and can name a patient; encrypting it costs nothing and its key dies with the practice's |

## Consequences

- Every PAR case runs upload, intake, parse and load against a scratch database and is checked against its
  expected.json (`apps/web/src/lib/routes/remittances.db.test.ts`); the loader's dedup, links, replays, concurrency and
  refusals are tested on their own (`apps/worker/src/parse/parse.db.test.ts`), as are the plan and report units.
- Two patients of one practice with the same name and no member ID share a reference; with different member IDs they
  are two (ADR 0031). The payer claim control number and patient control number on each claim stay exact. Matching to
  case lines (PRD 13, milestone 9) uses those.
- A correction loaded before its original leaves the original's `superseded_by_claim_id` unset; the net view is still
  right, because the original is reversed.
- Pricing (milestone 5) fills the expected allowed column and the status chips; the mapping screen (this milestone's
  next part) reads the payer and plan rows the loader creates.

## Revisit when

A payer's claim control numbers prove not unique enough for reversal links, a source with dates of birth arrives
(posting exports, milestone 9), or volumes make the second pass or per-row reference triggers measurable.
