# 0042. Keep recovery in a signed, append-only ledger of matched evidence, and move lines to recovered only from its entries

- **Status:** accepted (amends 0038 for the stages payer approved and recovered, 0039 for the reconcile step and the
  daily schedule, and 0041 for the case state a recoupment leaves)
- **Date:** 2026-10-23
- **Deciders:** founder (engineering)
- **PRD sections:** 1 ("nothing is called recovered until the money has posted"), 5 (J10, J11), 6 (Recovery ledger and
  reconciliation; ROI statement), 8 (ledger_entry, posting_row, eft_row; The status machine), 13 in full, 18 (Three
  oracles, 3), 20 (Proof level; Posting-export templates); data dictionary, Ledger and reconciliation and
  practice.settings; test matrix LED-02 to LED-11; ADRs 0019, 0035, 0038, 0039, 0041

## Context

Milestone 9 turns a case's pursuit into money the practice can see, on top of milestone 8's packets, submissions and
payer responses (ADR 0041). PRD 13 sets the rules: a remittance is matched to
the case line it reprocesses (payer claim control number first, then patient control number, service date and code);
posting and EFT exports are matched to remittances with a tolerance of zero; recovered is posted or deposited, by the
practice's proof level, less recoupments and reversals; approved is its own figure and interest its own category; a
forward balance is recorded and counts nothing. Until now the stages payer approved and recovered were refused
outright (ADR 0038), triage queued a `reconcile` step that only recorded that it ran (ADR 0039), and the digest and the
dashboard showed recovered as $0.00.

The ledger is what a customer, the reviewer and an acquirer check our fee against. It must be impossible to edit
quietly, impossible to call a line recovered without the evidence behind it, and recomputable from its entries.

## Decision

**A signed, append-only ledger.** `ledger_entry` (migration `20261023120000_recovery_ledger.sql`) holds signed integer
cents in seven stages: approved, posted, deposited, recouped, reversed, adjusted and interest. Each stage has its
evidence kind (a claim or a payer response for approved; a posting row for posted; an EFT row for deposited; a PLB
adjustment or a reversing claim for recouped and interest; the corrected entry for reversed and adjusted) and its
sign, in CHECKs. An entry carries its allocated flag, `created_by` (a person, or null for the reconcile job) and, for a
correction, the person's reason, encrypted with the practice's key. Triggers refuse every role an UPDATE, a DELETE and
a TRUNCATE of an entry (LED-10); corrections are new entries. A person writes an entry only in their own name with
`posting.reconcile`; the job writes in no one's.

**Every entry comes from a standing match.** `ledger_match` records what was matched: a claim to a case line
(approved, decreased or no change), a posting row or an EFT row to a remittance (at the claim, check or batch level,
allocated when pro rata), and a recoupment or interest against a line. There is one standing match for each piece of
evidence and case line (a partial unique index). A match is never changed or deleted; a person reverses it once, with a
reason. The entry trigger checks that an entry's match is standing, of the entry's kind, for its line and carrying its
evidence, and dates the entry from the evidence. So a posted or deposited entry cannot exist without the posting or
EFT row matched to a loaded remittance, and nothing counts as recovered without one.

**Totals are pure functions.** `packages/ledger` (100% branches) holds the stage model and `ledgerTotals`: approved,
posted and deposited net of their reversals and adjustments, recouped, interest, and recovered (the proof stage less
recoupments and the reversals of the proof stage). Approved and interest are never in recovered, and no total adds two
stages. fast-check properties: a reversed manual match nets to zero; a recoupment reduces recovered by exactly its
amount; the totals never mix stages. `lineLedgerStage` gives the stage a line's entries put it at, and the database
holds the same rule (`ledger_line_stage`).

**Lines move by the ledger only.** A `line_status` event of payer approved or recovered is refused unless the line's
entries put it there, whoever writes it: the flagged-as-recovered shortcut fails. The ledger moves a line back with a
negative entry behind it. A recoupment after the latest approval reopens the line to actionable, the status machine's
one way back, which reopens its case with the note "recoupment". A reversed proof moves the line back to payer approved
with the note "reversal". `syncLineStages` writes these events after every reconcile and every manual action.

**Cash shares, capped by approval.** A posting or deposit match posts each case line's share of its remittance: what
the remittance paid on the line's reprocessing (the line paid on the claims matched to the case line, less what the
remittance's reversals of the line's claims took back). A partial check-level posting allocates that share pro rata and
flags it allocated (LED-09), rounding half up so that the parts add up to the share. No line posts or deposits more
than the ledger approved for it, so the original payment that a reprocessing replaced is never counted as recovery.

**Remittance to case line.** For each new claim, `reconcileRemittances` finds the open case lines it reprocesses. Its
line of the same code and date is compared with what the case line was allowed before (the original's observed allowed,
plus the approvals, less what was taken back). A higher allowed writes an approved entry for the difference and attaches
the claim (LED-02). A lower allowed on a line with an approval standing takes the approval back, at most what was
approved. A claim that pays what a payer response accepted (no change against the line's allowed with that approval, but
higher than without it) confirms the approval: it is attached as an approved match and writes no entry of its own, so the
amount is approved once and the claim's remittance posts and deposits against it. The same allowed, or a lower one with
nothing approved, is a payer response "reprocessed, no change", recorded through the submissions' own function
(`recordPayerResponse` from `@tp/worker/packets`, ADR 0041; `responses.ts` holds no second implementation) for the
case's latest submission, with the remittance as its evidence, in no one's name from the job and in the person's own
from a manual match; a remittance that answers no submission (none logged, or paid before the latest one or before its
last response) records nothing. A claim that matches no case is listed for a person and writes no entry (LED-03).
Approvals that payer responses accept (`acceptedPayerResponses`) are written once, allocated across the case's lines by
variance, only for what no approval already covers; recording a response itself writes nothing (LED-01).

**Exports read by templates.** A posting export is read with the practice's template (`posting_export_template` in
`practice.settings`): either a template the practice administrator maps once (`setLedgerSettings`), or the built-in
`synthetic_pm_export_v1` for the synthetic practice-management export. EFT exports are read with
`synthetic_bank_export_v1`. Intake queues `reconcile` for a stored export. An export with no mapped template waits,
stored (`POSTING_TEMPLATE_NOT_MAPPED`). A file that cannot be read is marked unreadable. Each row is stored once per
fingerprint (a keyed hash of its values and its occurrence in its file), so a row repeated in a later export, or the
same rows re-exported, is stored and matched once (LED-08). The same bytes again are intake's duplicate document
(PAR-30). The claim reference is encrypted, and the stored raw row omits it.

**Recoupments and interest.** A PLB WO naming a case line's claim, or a reversal of the attached claim with no
correction in the same remittance, writes a recouped entry at once: negative, never more than the approval standing
(LED-06); a reversal of a claim that confirmed a response's approval takes back what the responses approved. The line
moves back to actionable, and its case is reopened: `case_rules` (replaced here, as `@tp/triage` `deriveCaseState`) puts
a case with a line moved back from payer approved or recovered, and none still resolved, at `awaiting_response` whatever
the payer answered before. It is never `open` again (triage's state for gathering a pattern's lines, one per pattern). To
dispute the take-back at the next level, the person records the payer's notice as a denial that reopens the case (ADR
0041's rule). The reconcile then tells the case's owner in the app, or the practice's people when the case has no reachable
owner (notification kind `recoupment`, counts and totals only; the web links it to the case). A PLB L6, or a claim's
AMT I (now loaded into `claim.interest_cents`), writes an interest entry beside principal. A PLB FB writes no entry.

**Manual matching.** `unmatchedItems` lists the posting rows, the EFT rows and the adjusted payments that nothing
matched, each with its evidence and its candidates. A person with `posting.reconcile` matches by hand
(`matchPostingByHand`, `matchDepositByHand`, `matchClaimByHand`) in their own name and audited, still with a
tolerance of zero. `reverseMatch` writes an exactly offsetting reversed entry for each of the match's entries, dated
from the entry it reverses (LED-07). It refuses to unmatch an approval while a posting or deposit of it stands
(`reverse_postings_first`). A reversed match is never matched again automatically. `adjustEntry` corrects an entry,
with a reason.

**One job, three triggers.** `reconcile` keeps one practice per job, with three attempts and the alert on the third.
Its payload is one of three, each its own singleton key:

- after triage: `{practice_id, pricing_run_id}`;
- after intake stores an export: `{practice_id, document_id}`;
- daily, from the operator's schedule: `{practice_id, day}`.

Whichever triggered it, it runs the whole idempotent reconcile in one transaction holding the practice's advisory lock
(`reconcilePractice`). The daily run also tells the owners of recoupments a person wrote, which a request scope may not
do, since only a job reads the recipients. It also writes the ROI statement of the quarter before the day, once.

**The ROI statement.** `roiStatement` gives, for a period:

- fees, zero until milestone 11 through a `FeeSource` seam;
- recovered principal and interest, net;
- approved but not posted;
- actionable in open cases;
- pursuit hours, from a `PursuitHoursSource` seam with no time log yet;
- the ratio of recovered to fees, as two-place text, or none without fees.

Each figure lists the entries (or cases) it sums. `roi_statement` stores the statement with its links, and a trigger
checks that its recovered and interest figures equal the sums of the linked entries (LED-11). A person generates one on
demand (`posting.reconcile`, audited); the quarterly statement is the job's, in no one's name.

**The proof level.** `proof_level` in `practice.settings` is posted or deposited (a CHECK), and posted by default (PRD
20: "posted, with deposited where exports exist"). The practice administrator sets it.

**The digest and the dashboard read the ledger.** "Recoveries posted" counts the lines whose proof entry is dated in the
month and not reversed. "Recovered" is the month's entries' recovered total; a recoupment counts in the month it was
taken back. The dashboard's "recovered this quarter" is the recovered total of the entries dated in the current quarter.

**The ledger oracle.** `apps/worker/src/reconcile/ledger-oracle.db.test.ts` drives the five synthetic scenarios with
known outcomes through the reconcile step: a recovery (LED-05), a partial (LED-09), a recoupment after deposit
(LED-06), a reversed match (LED-07) and a duplicate export (LED-08). It compares the ledger's totals, read with plain
SQL sums by stage that share no code with `packages/ledger`, against outcomes stated by hand. Those outcomes are
checked against each fixture's `expected.json`.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| Post the remittance's whole payment, or the posting row's amount, as the line's posted | Counts the original payment a reprocessing replaced and other patients' claims on the same check; the cash share capped by approval counts only what the pursuit won |
| Let a person set payer approved or recovered with a note | PRD 1 and 6: nothing is recovered without a posted or deposited entry; a person creates the entry by matching evidence, and the stage follows |
| Mutable entries with an audit trail | The ledger is the record the fee rests on; an edit, even audited, makes a recomputation depend on history. Corrections as entries keep every total a sum |
| A separate job type for exports and for the daily pass | `job_run`'s CHECK lists the job types and the registry's tests fix them; one type with three subjects keeps one handler and one idempotent pass |
| Fuzzy amount matching (a cent's tolerance) | PRD 13: zero tolerance; a person vouches for the remittance by hand, never for a different amount |
| A recoupment notice written by the person's request | Only a practice job reads the recipients (ADR 0039); the daily reconcile tells them within a day |
| A recouped case back to `open` | Collides with triage's one open case per pattern (a unique index) and its daily window closing; `awaiting_response` says the payer owes the money again |
| Recording "reprocessed, no change" when a remittance pays what a response accepted | It did change the payment; the submission log would misreport it, and its reversal could not be taken back from an approval no claim made |
| Our own insert of the no-change response | Two writers of `payer_response` would drift; the submissions' function and the database's rules hold it once |

## Consequences

Every recovered dollar can be traced from the statement to its entries, to its match, to the export row and the
remittance. `ledger.db.test.ts` runs the LED cases with milestone 8's packets submitted, accepted and answered by
remittances (the export dated back with triggers off so the SYNTHETIC remittances of the past answer it). A wrong match is corrected by reversing it, which leaves both entries in the ledger. The practice's own
practice-management templates are mapped once at onboarding with `setLedgerSettings`. Exports wait, stored, until
then. The screens (Unmatched items, the ledger on a case, the ROI statement) come in milestone 9's second part, through
`@tp/worker/ledger`. Fees and pursuit hours come with billing and the time log (milestone 11), behind the two seams.
The audit report's payer approved and recovered stay zero: a report is attested at triage, before any pursuit.

## Revisit when

A practice's export has a layout no template reads; billing (milestone 11) supplies fees; a payer recoups across
practices or by forward balance in a way PRD 13 does not describe; the specialist asks for a non-zero tolerance.
