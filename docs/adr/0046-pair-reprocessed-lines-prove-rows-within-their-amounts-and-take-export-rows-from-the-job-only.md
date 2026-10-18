# 0046. Pair reprocessed lines one to one, prove each export row within its amount, back the reprocessing baseline by remittances, and take export rows from the reconcile job only

- **Status:** accepted (amends 0042 for the remittance-to-case-line comparison, the cash shares, the reversal of a
  match, the payer-response approvals and the export rows; and 0043 for the Reconciliation screen's actions)
- **Date:** 2026-10-26
- **Deciders:** founder (engineering)
- **PRD sections:** 12 (What a customer sees as the headline), 13 in full (Entries; Matching steps 1 to 4;
  Recoupments and reversals; ROI statement), 16 (Tenant isolation and authorization); CLAUDE.md rule 1 and "Check
  in the handler and in Postgres"; test matrix LED-02, LED-04, LED-06, LED-07, LED-08, LED-09, LED-11; ADRs 0019,
  0041, 0042, 0043

## Context

A review of milestones 8 and 9 found that the ledger could count money nobody paid, and that its evidence could be
made up:

1. Two case lines of one claim with the same code and date of service (97110 and 97110-59) were both compared with
   the first reprocessed line of that code and date, and both posted from it: a 30.00 check produced 60.00 approved,
   60.00 posted and 60.00 recovered.
2. A posting row with line detail (a claim reference, a code and a date of service) was matched at the claim level,
   and every case line of that claim was then posted from it, though the row posted one line.
3. The reprocessing baseline counted approvals a payer response made that no remittance had paid, so a correction
   paying part of an acceptance was booked as a recoupment: a take-back, a reopened case and a notice for money
   nobody took back.
4. Reversing a match left an adjustment of its entries standing, so a reversed match did not net to zero, and a
   reversed match's entries could still be corrected.
5. An acceptance was approved in full whatever the submission asked, and two responses of one submission were each
   approved against the ledger as it stood before the pass, approving more than either accepted.
6. The ROI statement's approved-but-not-posted, and the headline's payer approved, ignored recoupments of approvals
   never proved.
7. Postgres let anyone in scope write a posting or EFT row, on any document of the practice, and the reconcile job
   then proved recovery from it in no one's name.
8. A posting export with a cell its table refuses (a CPT written with its modifiers, a payer name over 200
   characters) failed the export's insert, stayed stored and failed every later reconcile of the practice.
9. A corrected posting export (a take-back row) was listed as an ordinary unmatched row; nothing said it corrected a
   match. The `adjusted` stage had no route, and the proof level no route either.

## Decision

**Pair lines one to one (`@tp/ledger` `pairLines`).** A case line is compared with, posted from and deposited from
its own line of each claim that reprocesses or reverses its claim: first the line of the same procedure code,
modifiers, units and date of service, in line order among the lines alike in all four; then, for what is left, the
same code and date, in line order. Each line of the other claim stands for one case line at most. The 835's line
item control number (REF*6R) would be a better key, but the data dictionary's `service_line` keeps none and the loader
stores none, so pairing reads the four fields the line has. The comparison (`comparableAllowed`), the cash shares of a
remittance and of a claim (`settleMatches`), the reversal of a confirming claim and the shortfall read the same pairs.

**A line-level row posts its line only.** A posting row with a procedure code posts only the case lines paired with
the claim's lines it posts (`postsLine`: its code, its date when it has one, its amount exactly); a row with a claim
reference and no code posts its claim whole. The row's own code and date are its record of the line, so `ledger_match`
keeps its shape.

**No row proves more than its amount.** A posted or deposited entry is capped by what its row has left to prove as well
as by the line's approval. Migration `20261026090000_recovery_ledger_review.sql` holds both in Postgres for every role
(`ledger_entry_within_evidence`): the posted (or deposited) entries of one posting (or EFT) row, their reversals and
adjustments and the reversals of those included, never sum past the row's amount, and a line-level posting posts only a
line of its row's code and date.

**The baseline is what the remittances paid.** A reprocessing is compared with what the remittances have allowed the
line (`remittanceBaseline`): the allowed of the paired line of its latest standing approving claim match, less what
recoupments matched after it took back; with none, the original's observed allowed less every recoupment. An
approval a payer response made counts only once a remittance pays it (`unpaidApproval`: what is approved beyond the
baseline). `@tp/ledger` `reprocessing` then decides: above the baseline and every unpaid acceptance, an approved entry
for the rest; above the baseline within an acceptance, `confirmed`, an approved match with no entry, and what it leaves
unpaid is a **shortfall**; below the baseline, a recouped entry at most what is approved; otherwise a reprocessing
with no change. A shortfall stays approved, is never taken back, reopens nothing and tells no one; the Reconciliation
screen shows it on its line (`approvalShortfalls`) for a person to adjust or dispute. A recoupment is written only for
a PLB WO, a reversal, or a claim below the baseline. The reversal of a claim that confirmed an acceptance takes back
what it paid of it.

**Reversals net adjustments; corrections need a standing match.** `reverseMatch` writes an exactly offsetting reversal
of each entry of the match and of each adjustment of them. The database lets a reversal name an adjustment (never an
adjustment of an adjustment), counts it toward the stage the adjustment corrects (`correctedEntry`,
`ledger_line_stage`), and refuses any correction of an entry whose match is reversed.

**An acceptance is at most what was asked.** `payer_response_within_asked` refuses an accepted or partial amount above
the submitted version's lines' variance plus its interest line; `recordPayerResponse` surfaces the refusal as a packet
rule. Each line's approval is at most its own variance (so an acceptance that includes interest approves no interest
as principal), and the responses of one pass approve against the ledger as the pass leaves it.

**Payer approved net of what was taken back before it was proved.** Per line, the headline's payer approved is
min(approved, max(proved, approved + recouped)) (`payerApproved`, `LedgerTotals.payerApprovedCents`), on the dashboard,
the case page and the Reconciliation screen; the ROI statement's approved but not posted is max(0, approved + recouped
- proved) per line (`approvedNotProved`), recomputed from the entries it links. Recovered stays PRD 13's sum.

**Export rows come from the reconcile job only.** `ledger_export_row_belongs` refuses a person, whoever they are, and
admits the job's row only from a document of the table's kind (a posting row from a posting export, an EFT row from an
EFT export) stored with a clean scan, a zip entry only with its zip clean. These rows are the evidence of recovery.

**One bad export stops nothing.** The templates read a CPT written with up to four two-character modifiers as its
code (the cell stays in the row's raw cells, and in its fingerprint), and leave out and count a row with a payer over
200 characters or a batch over 100. An export whose row the database still refuses (a data or integrity exception) is
rolled back and marked unreadable (`EXPORT_ROW_REFUSED`). Any other failure leaves that export stored, the others and
the rest of the reconcile run, and the attempt then fails (`ExportLoadFailed`) so it is retried and the third failure
raises the operator's alert (ADR 0019).

**Corrected exports and adjustments in the product.** A take-back row that exactly offsets a row of the same check,
code and date whose posting match stands is listed with that match (`correctionOf`); a person reverses it with a
reason, since a reversal is a person's (ADR 0042). `practice.reconciliation.adjust` exposes `adjustEntry`:
`posting.reconcile` (the database's rule for every entry a person writes), a signed change in dollars and cents, a
reason, a confirmation of what it does, and an audit event.

**The proof level stays deferred.** Setting it needs the rule for lines already recovered when it changes (ADR 0043);
the practice's Settings screen (milestone 11) brings both. Until then `setLedgerSettings` is the only way, and the
README lists it as an unmet part of milestone 9.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| Store REF*6R on `service_line` and pair by it | A column the data dictionary does not have, and a loader change; switch when a payer's reprocessings reorder identical lines |
| Record the posted line on `ledger_match` | Its CHECK keeps posting matches line-less; the row's own code and date say the same, and Postgres checks the entries against them |
| Book a shortfall as a recoupment, or reopen the case | Nothing was taken back; it would overstate take-backs, reopen a resolved case and tell people of money that never moved |
| Let the job write the reversal of a corrected export | A reversal is a person's with a reason (ADR 0042); the screen puts the match beside the take-back for them |
| Truncate an over-long payer name or batch | Silent loss of what the export said; a counted row problem is visible |
| Skip a failed export silently | It would never be loaded or alerted on; a failed attempt after the rest of the work is retried and alerts on the third |

## Consequences

A same-day two-line claim, a line-level partial posting, a partly paid acceptance, an adjust-then-reverse, an
over-large acceptance, a made-up posting row and a refused export each have a database test
(`apps/worker/src/reconcile/lines.db.test.ts`, `ledger.db.test.ts`, `exports.db.test.ts`), on SYNTHETIC fixtures from
`packages/synth` (LED-04's same-day scenario, LED-09's line-level scenario). The row factory writes export rows as a
job of its world. A shortfall waits for a person; until then the line stays payer approved with the unpaid part in
approved but not posted.

## Revisit when

A payer reprocesses identical lines out of order; a practice's export writes modifiers another way; the Settings
screen brings the proof level (milestone 11).
