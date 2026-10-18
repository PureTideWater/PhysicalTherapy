# 0031. Load a document in one transaction, key patients by name and member ID, treat a resent payment as a duplicate, and hold codes outside the structure's sets

- **Status:** accepted
- **Date:** 2026-10-17
- **Deciders:** founder (engineering)
- **PRD sections:** 2 (the same remittance can arrive twice), 6 (Canonical model and matching), 7 (a resent file loads
  zero rows), 8 (patient_ref, service_line), 10 (Pipeline steps 6, 8, 9; Cases; Errors), 11 (Inputs: line facts);
  Data dictionary, service_line.place_of_service and patient_ref; ADRs 0021, 0025 and 0027

## Context

The milestone 2 and 3 review found five places where the parser and the loader read the plan more loosely than it
allows:

1. **Code sets.** Every value of the 835 structure's own code sets (claim status, adjustment group, provider
   adjustment reason, BPR01, BPR04, every qualifier) was only flagged, so a transaction set with CAS01 `XX` or CLP02
   `99` loaded, and pyx12 rejected it. A CAS group outside CO, OA, PI and PR then fell out of patient share and
   observed allowed, and a member ID one element separator early (in NM108) reached the receipt in plain text as an
   "unknown qualifier". PRD 10 step 6 asks for code sets valid against the code lists; only unknown reason codes load
   with a flag (PRD 10, Cases).
2. **The transaction.** Pass two committed each transaction set on its own, so a document whose last attempt failed
   left the sets before the failure loaded and visible, with no parse report. PRD 10 step 9 loads "in one
   transaction under the practice policy".
3. **The patient key.** The name alone keyed `patient_ref`, so two patients of one name were one reference and the
   second one's member ID was dropped, though the 835 carried it. A reference holds one member ID, which packets carry
   (PRD 8: minimal identity for matching and packets).
4. **A resent payment.** A payer's resend with a regenerated envelope (a new ISA13; the same payee, TRN02, TRN03,
   BPR02 and BPR16 and the same claims) is not the same remittance under the plan's key (practice, payee, ISA13,
   TRN02, BPR02), so it loaded every claim again, flagged for review, and the net view counted them twice. The plan
   says a different remittance with the same trace is told apart by its BPR16 date; it is silent on the same date.
5. **Place of service.** `service_line.place_of_service` was never filled, though CLP08 carries it on a professional
   claim, and the engine stops a line without one (`place_of_service_unmapped`).

## Decision

- **Codes outside the structure's sets hold.** A value outside one of `X12_835_CODE_SETS` is EDI_SYNTAX `invalid_code`
  at its element and component, and holds its transaction set (balance holds are left out, as for every syntax hold).
  Only CARC and RARC, the external lists a rule release carries, load with EDI_UNKNOWN_CODE. The receipt shows an
  unknown code's value only for those two lists; any other list shows `(not shown)`. Variant V35 carries an invalid
  CAS01, CLP02, PLB03-01 and BPR04, so `pnpm test:oracle` compares pyx12 and the parser on them.
- **One transaction per document.** The parse job's second pass runs inside one `withJobScope` transaction: each
  loadable set is loaded as the stream reaches it (one set in memory at a time, as before), then the parse report and
  the document's status are written, and all commit together. An attempt that fails leaves nothing behind; the next
  one starts over, so the loader no longer recognizes sets an earlier attempt loaded. The PAR-29 document (10,000
  claims, twenty sets) loads in one transaction well under a minute.
- **Patients by name and member ID.** The patient key is the normalized NM1 name followed by `|member|<member ID>` when
  the NM1 carries a member ID (NM108 MI, HN, II or MR; an SSN in NM108 34 is never used), else the name, else
  `id|NM108|NM109`, else the patient control number. It names no payer. Two people of one name with different member
  IDs are two references, each with its own member ID; the same name and member ID from any payer is one reference.
- **A resent payment is a duplicate.** A loadable set whose payee, TRN02, TRN03, BPR02 and BPR16 equal those of a
  remittance the practice holds is the same payment under another envelope (`remittanceDecision` basis
  `same_payment`): zero rows load, the receipt links it to the original remittance and its document, like PAR-07. The
  same trace with another amount on the same day still loads for review (`trace_reused_same_date`), and on another day
  `trace_reused_another_date` (V25).
- **Place of service from CLP08 on professional lines.** A line whose procedure is a HCPCS code (SVC01-1 `HC`) with no
  revenue code takes CLP08 as its place of service when CLP08 is two digits. A line billed with a revenue code (SVC04,
  or a revenue code as its procedure) is institutional: CLP08 is the claim's facility type and the line has no place of
  service. `claim.facility_type` keeps CLP08 either way.
- **Where the facility split is stored** (which places of service are facility settings, ADR 0029): in the
  practice's `settings` (the data dictionary's jsonb) under `place_of_service_settings`, a map of two-digit place of
  service to `facility` or `non_facility`; milestone 7's pricing runs read it from there into `price()`'s settings and
  its trace. Until a rule record carries the CMS list, a person sets it; how the screen offers it is milestone 7's.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| Keep flagging structural codes, and filter the patient fields from the receipt | Loads what pyx12 rejects, and a CAS group nobody counts silently changes patient share and observed allowed |
| Hide a document's remittances until its report exists | Every screen and query would need the filter, and a failed document's rows would need deleting; one transaction gives the same result with no state to clean |
| Member ID scoped by payer in the key | The member ID is already the payer's; adding the payer makes a patient under two payers with the same ID two references for no gain |
| Refuse the upsert when the stored member ID differs, and create a second reference | Needs every stored member ID decrypted and compared under a lock; the key does the same, deterministically |
| Hold the same-day resend as a suspected duplicate until a person confirms | No confirmation flow exists before the workbench; the same payee, trace, originator, amount and date is one payment by any reading of PRD 2 ("resent files, two downloads") |
| Load the resend and exclude unresolved reviews from the net view and totals | Rows that never count are still rows every later milestone must remember to exclude |
| Place of service on every line from CLP08 | On an institutional claim CLP08 is the type of bill's facility code (13 is a hospital outpatient bill, and also a place of service code) |

## Consequences

- `pnpm test:oracle` covers four invalid structural codes, six CAS triples (V32), B6 beside claim-level PR (V33) and a
  line-feed terminator with a blank line after IEA (V34); 624 checks.
- `apps/worker/src/parse/parse.db.test.ts` asserts a failed attempt leaves no row, two same-name patients keep their
  own member IDs, a resent payment under a new ISA13 loads zero rows and PAR-01's line carries place of service 11.
- A loader error anywhere in a document rolls the document back; the job retries it (three attempts, ADR 0019).
- A patient whose first file carries no member ID and whose later file does has two references; matching (PRD 13,
  milestone 9) uses the claim control numbers, which stay exact.

## Revisit when

A real-file twin shows a professional payer that puts something other than a place of service in CLP08, a source with
dates of birth arrives (posting exports, milestone 9), or a payer is found reusing a trace for a different payment of
the same amount on the same day.
