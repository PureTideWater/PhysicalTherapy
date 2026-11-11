/**
 * Every row of docs/product/test-matrix.md, word for word (a test keeps the two identical).
 */
export interface MatrixRow {
  readonly id: string;
  readonly title: string;
  readonly assertion: string;
}

export const TEST_MATRIX: readonly MatrixRow[] = [
  { id: 'PAR-01', title: 'Minimal valid file, one claim, one line', assertion: 'Loads; balanced; counts match' },
  { id: 'PAR-02', title: 'Two transaction sets in one interchange', assertion: 'Two remittances; each balanced' },
  { id: 'PAR-03', title: 'Two interchanges in one file', assertion: 'Two remittances with distinct ISA13' },
  { id: 'PAR-04', title: 'Non-default delimiters', assertion: 'Parses identically to PAR-01' },
  { id: 'PAR-05', title: 'CRLF line endings and a BOM', assertion: 'Parses' },
  { id: 'PAR-06', title: 'Duplicate file (same bytes)', assertion: 'Document recorded; zero rows loaded; receipt says duplicate' },
  { id: 'PAR-07', title: 'Same remittance, different filename and whitespace', assertion: 'Zero rows; linked to the original' },
  { id: 'PAR-08', title: 'Reversal (CLP02 22) followed by a corrected claim', assertion: 'Reversal linked; correction supersedes; net view shows one claim' },
  { id: 'PAR-09', title: 'Zero-pay denied claim (CLP02 4) with CAS detail', assertion: 'Loads; observed allowed zero; adjustments stored' },
  { id: 'PAR-10', title: 'Claim-level CAS only', assertion: 'Line observed allowed allocated and flagged' },
  { id: 'PAR-11', title: 'Line-level CAS only', assertion: 'Observed allowed from paid plus PR' },
  { id: 'PAR-12', title: 'AMT B6 present', assertion: 'Observed allowed basis `amt_b6`' },
  { id: 'PAR-13', title: 'PR split across reason codes 1, 2 and 3', assertion: 'Patient share sums' },
  { id: 'PAR-14', title: 'CO-45 contractual write-off', assertion: 'Adjustment stored; variance computed later against expected' },
  { id: 'PAR-15', title: 'OA-23 on a secondary remittance', assertion: 'Claim status 2; line unpriced `SECONDARY_PAYER`' },
  { id: 'PAR-16', title: 'PLB WO recoupment', assertion: 'Provider adjustment; check balances with it' },
  { id: 'PAR-17', title: 'PLB FB forward balance', assertion: 'Recorded; not counted' },
  { id: 'PAR-18', title: 'PLB L6 interest', assertion: 'Recorded as interest' },
  { id: 'PAR-19', title: 'Negative PLB larger than claims (zero or negative check)', assertion: 'Balances; loads' },
  { id: 'PAR-20', title: 'Unbalanced transaction', assertion: 'Held with difference and position; nothing loaded' },
  { id: 'PAR-21', title: 'Unknown CARC', assertion: 'Loaded with flag; receipt lists it' },
  { id: 'PAR-22', title: 'Decimal units and four modifiers', assertion: 'Stored exactly' },
  { id: 'PAR-23', title: 'DTM 472 with a date range', assertion: 'Service from and to' },
  { id: 'PAR-24', title: 'A 277 uploaded as an 835', assertion: '`EDI_NOT_835`; held' },
  { id: 'PAR-25', title: 'Truncated file', assertion: '`EDI_SYNTAX` with position; held' },
  { id: 'PAR-26', title: 'Control number mismatch (SE count wrong)', assertion: '`EDI_CONTROL_MISMATCH`; held' },
  { id: 'PAR-27', title: 'Zip of 500 files with one bad entry', assertion: '499 load; one held; batch receipt' },
  { id: 'PAR-28', title: 'Renamed executable in a zip', assertion: 'Quarantined; nothing parsed' },
  { id: 'PAR-29', title: '10,000-claim file', assertion: 'Parses within target; memory bounded' },
  { id: 'PAR-30', title: 'Same file uploaded concurrently twice', assertion: 'Exactly one remittance row' },
  {
    id: 'MAP-01',
    title: 'Unmapped payer and plan',
    assertion:
      'No line of the plan is ever priced; a line the resolver reaches is left unpriced as `NO_MAPPING`, one by one; the run prices every other line of its period. Coverage shows dollars waiting',
  },
  { id: 'MAP-02', title: 'Mapping with an effective date after some lines', assertion: 'Earlier lines `NO_MAPPING`; later priced' },
  { id: 'MAP-03', title: 'Mapping corrected', assertion: 'New mapping; old run unchanged; re-run offered' },
  { id: 'MAP-04', title: 'Mapped as no agreement', assertion: 'Lines go to anomaly screening only' },
  { id: 'MAP-05', title: 'Mapped as MA non-contracted', assertion: 'Priced from the fee schedule with all flags on' },
  {
    id: 'MAP-06',
    title: 'A month holding lines of a mapped plan and of a plan with no mapping',
    assertion:
      "Priced by the monitor and by a person's run, in the worker and with nothing refused in Postgres: the mapped plan's lines price under their mapping, and no line of the other plan is priced (`NO_MAPPING` one by one where the resolver reaches it; `ENGINE_ERROR` for a line that fails the engine's fact checks first). The run's coverage records the plan with no mapping, all its lines and billed cents, equal to what Coverage counts for that month. Coverage, Pricing runs and the home page say the plan has no mapping and its lines are not priced; the run's page and the printed audit report say it had no mapping when the run was priced, and the printed coverage report that it had none when the report was made, in counts and cents only. The engine is unchanged",
  },
  {
    id: 'MAP-07',
    title: 'A period none of whose plans has a mapping, and the mapping that completes it',
    assertion:
      'No run is created: the monitor leaves the month waiting, logged as `UNMAPPED_PLAN` with the count of months, and a person\'s run is refused as pricing nothing. A mapping queues monitoring only when, with a release in force, it leaves a month no run covers with every plan of its lines mapped and no wait on the billing ZIP or on Medicare content holding it; that job names every such month, by its first day only, and prices those months alone as first runs in effect with no hand re-run, never a month still waiting on another plan\'s mapping (with month 1 holding plans A and B and month 2 holding A and C, mapping A, then B, then C gives each month one first run and no re-run). A mapping that leaves the month mixed, or held on the billing ZIP, queues nothing and says only "Mapped", and the page says how many months wait and offers "Price them now", which queues monitoring of every uncovered month and is refused while the practice is suspended. Two people mapping a month\'s last two plans at the same moment queue monitoring exactly once. A month whose last run waited on Medicare content is planned again once a mapping completes it',
  },
  {
    id: 'MAP-08',
    title: 'Plans mapped after their months were priced',
    assertion:
      'The mapping list and each plan\'s page list, oldest first, each run in effect holding `NO_MAPPING` lines that a mapping now covers, with their lines and billed dollars. "Price these months again" creates one re-run of each in that person\'s name, queued and not accepted, with one audit event per re-run; two plans mapped and pressed in turn give one counting re-run per month, and a second press of the same page, by anyone, at any moment, including two presses at once, creates no second re-run. A month whose first run of overlapping dates is queued or being priced is not re-run (`newer_run_pending`) and says it waits. A month whose re-run since the mapping is pending links to it; one whose re-run is superseded or pinned to a withdrawn release is ready again. A month whose re-run since the mapping failed on the billing ZIP or on Medicare content says so, links to it and is not offered again until the location is saved, the terms change or a release loads more of that content; after any other failure it is ready again and says the last re-run failed. Once accepted, the month says to triage it on Cases until triage has validated its short lines that were `NO_MAPPING` before; a re-run accepted after a sign-off or a release alone is not listed. A job never creates the re-runs',
  },
  {
    id: 'MAP-09',
    title: 'Pricing months again from a page that is out of date, or without the right',
    assertion:
      "When a month became ready that the form did not send, or the form sent a month that is neither ready nor already being priced again, the request is refused as `months_changed` with nothing created, the refused field is named in the form's summary, and the page shows the months as they are now. A refusal of one month names it by its dates and creates nothing. A run of another practice, a plan of another practice, a release not in force, a practice that is suspended, and a person without `mapping.edit` are refused, with nothing created",
  },
  { id: 'CON-01', title: 'Two versions with overlapping windows', assertion: 'Refused' },
  { id: 'CON-02', title: 'Amendment closes the prior window', assertion: 'Prior `effective_to` set; prior unchanged otherwise' },
  { id: 'CON-03', title: 'Edit attempt on a signed-off version', assertion: 'Refused; supersession required' },
  { id: 'CON-04', title: 'Rate record without a page reference', assertion: 'Cannot be approved' },
  { id: 'CON-05', title: 'Model proposal with a quote not in the page', assertion: 'Verifier fails; specialist sees it' },
  { id: 'CON-06', title: 'Conflicting exhibits for one code', assertion: '`AMBIGUOUS_RATE` until resolved' },
  { id: 'CON-07', title: 'Draft version used in pricing', assertion: 'Refused; only signed off prices' },
  { id: 'PRC-01', title: 'MA non-contracted, four units, no assistant', assertion: 'Golden cent match: PFS, MPPR, sequestration' },
  { id: 'PRC-02', title: 'Same with CQ on two units', assertion: '85% applied to those units only' },
  { id: 'PRC-03', title: 'Commercial 110% of current Medicare, flags off', assertion: 'Unreduced sum times 1.10' },
  { id: 'PRC-04', title: 'Commercial locked to 2025 fee schedule', assertion: 'Uses 2025 RVUs and factor' },
  { id: 'PRC-05', title: 'Fixed schedule, two units', assertion: 'Amount times units' },
  { id: 'PRC-06', title: 'Lesser-of where charge is lower', assertion: 'Charge wins' },
  { id: 'PRC-07', title: 'Per-visit with three included lines', assertion: 'First line carries it; others expect zero' },
  { id: 'PRC-08', title: 'Qualifying-APM conversion factor named by the record', assertion: 'Correct factor used' },
  { id: 'PRC-09', title: 'Code with no RVU in the basis year', assertion: '`NO_PFS_VALUE`' },
  { id: 'PRC-10', title: 'MUE exceeded with NCCI on', assertion: '`MUE_EXCEEDED`' },
  { id: 'PRC-11', title: '97140 and 97530 without a 59 or X modifier, NCCI on', assertion: 'Review flag' },
  { id: 'PRC-12', title: 'Service date outside every version', assertion: '`DATE_OUTSIDE_VERSIONS`' },
  { id: 'PRC-13', title: 'Rounding at a half cent under each rule', assertion: 'Expected per rule; unrounded kept' },
  { id: 'PRC-14', title: 'Window passed on the triage date', assertion: 'Validated, not actionable' },
  { id: 'PRC-15', title: 'Negative variance', assertion: 'Recorded; no case' },
  { id: 'PRC-16', title: 'Trace recompute', assertion: 'Equals stored amount for every golden line' },
  { id: 'PRC-17', title: 'Property: doubling units doubles base (fixed, percent)', assertion: 'Holds' },
  { id: 'PRC-18', title: 'Property: turning a flag off never lowers the amount', assertion: 'Holds' },
  { id: 'PRC-19', title: 'Re-run under release 2 with one changed RVU', assertion: 'Diff lists exactly the affected lines' },
  { id: 'PRC-20', title: '100,000 lines', assertion: 'Under two minutes on one vCPU' },
  {
    id: 'PRC-21',
    title: 'A ZIP whose locality needs its ZIP+4',
    assertion:
      "With the ZIP+4, priced at the ZIP+4 file's range's locality, with the range in the trace and `recompute(trace)` holding. Without it, `ENGINE_ERROR locality_needs_zip_plus_four`. With no ZIP+4 file of the ZIP in force, `ENGINE_ERROR no_locality_plus_four`, a gap in the content. A ZIP+4 no range lists is `ENGINE_ERROR zip_plus_four_not_in_locality_map`, the trace naming the file read. Never a guessed locality",
  },
  {
    id: 'PRC-22',
    title: 'The engine freeze outside the ZIP+4 lookup',
    assertion:
      "The base and head engines, each on its own money, rules and contracts packages, price and recompute alike every golden claim and generated five-digit claims. Nothing under `packages/pricing` but tests changes beyond the exception's files, and no existing golden file or release a golden claim pins changes",
  },
  {
    id: 'PRC-23',
    title: 'A month whose pricing location is not ready',
    assertion:
      "With no ZIP, no run is created (refused in the worker and in Postgres). When a line needs a ZIP+4, or a ZIP Medicare's list does not hold, the run fails with no lines kept, and the month is not re-created daily. A fixed-fee month prices. Coverage and Pricing settings name the month as waiting on the billing ZIP, with its dollars. Saving the location prices it with no hand re-run",
  },
  {
    id: 'PRC-24',
    title: 'A place of service the practice has not set',
    assertion:
      "Priced with the approved split's setting, read as `tp_app`. The run records the split, and the practice's own setting wins",
  },
  {
    id: 'PRC-25',
    title: 'A late line priced by a newer run of the month, then the older re-run accepted',
    assertion:
      "Refused as `superseded`, in the worker and through the screens. The late line keeps its pricing in effect and the newer run stays in effect. The re-run's page says a newer run of these service dates is in effect, links to it and offers no Accept button. When that run was priced after the re-run and would price nothing differently now, the page says there is nothing more to accept and offers no re-run; otherwise it offers the re-run of that run",
  },
  {
    id: 'PRC-26',
    title: 'Two re-runs of one run, the second priced after the first, accepted in either order and at once',
    assertion:
      "Whichever acceptance commits first, the month ends on the second re-run. Accepting the first after the second is refused as `superseded`. Accepting the second after the first succeeds, and its page lists the changes against the first. An acceptance whose changes were shown against a run other than the one it would replace is refused as `diff_changed`. Of two acceptances made at once, the first re-run's is refused as `superseded` whatever the timestamps. The second re-run's, when its transaction began before the other acceptance's, is refused as `changed_meanwhile`, and made again it succeeds. An accepted re-run is the run in effect for its period, and nothing deadlocks",
  },
  {
    id: 'PRC-27',
    title: 'A re-run whose service dates overlap a run of another period, or a run still being priced',
    assertion:
      "A run of another period that took effect after the original and was priced after the re-run, or under a later release or a later place-of-service split, refuses it (`superseded`). Of two runs priced at once, the one that read its inputs last counts as priced last. No shared line goes back to older pricing, and re-running the original again is accepted. One priced before the re-run, under the same release and split, does not refuse it, and its own lines stay in effect. The re-run's page lists exactly the lines whose pricing in effect accepting changes, each against the run of whichever period holds it, and an acceptance whose changes were shown against other runs than hold those lines now is refused as `diff_changed`. A run pinned to a withdrawn release does not count as newer. A first run of overlapping dates being priced refuses acceptance (`newer_run_pending`). One queued refuses new re-runs but not acceptance, and when it completes it takes effect after the accepted re-run",
  },
  {
    id: 'PRC-28',
    title: 'Re-running a run that is not in effect',
    assertion:
      'A run that a later run or an accepted re-run replaced, and a re-run nobody accepted, are not re-run (`not_in_effect`). Their pages offer the run in effect for those service dates instead. A run in effect is re-run as before. A re-run of a re-run nobody accepted, left from before this rule, is not accepted (`superseded`)',
  },
  {
    id: 'PRC-29',
    title: 'A re-run of a month priced around a plan with no mapping, after the plan is mapped',
    assertion:
      "The re-run prices the same lines (the original's cut-off), the plan's lines under the mapping and every other line as the original did, unless something else changed since. Its page lists exactly the lines whose pricing in effect changes. Accepted, it is the run in effect and the plan's lines leave `NO_MAPPING`; `recompute(trace)` holds on every priced line; triaged from Cases, the plan's short lines reach validated",
  },
  {
    id: 'PRC-30',
    title: 'The coverage a run records of plans with no mapping',
    assertion:
      '`tp-pricing-coverage/2` lists each plan of the run\'s lines with no mapping when it was priced, with all its lines (whatever their unpriced reason) and billed cents, together at most the run\'s unpriced count. A `tp-pricing-coverage/1` run reads as having none. The printed audit report says "N plans had no mapping when this run was priced; their lines are not priced", and a new coverage report, its figures fixed when it was made, "N plans had no mapping; their lines were not priced"; a coverage report stored before keeps both of its own sentences',
  },
  {
    id: 'PRC-31',
    title: 'Lines of mapped plans still unpriced as `NO_MAPPING` in the pricing in effect',
    assertion:
      'Coverage, Pricing runs, the home page and the mapping list count the lines whose pricing in effect is `NO_MAPPING` while a mapping is now in force on their date, in lines, billed cents and priced months only; the count falls to zero once the re-runs pricing them are accepted, and never counts a line of a plan with no mapping',
  },
  {
    id: 'PRC-32',
    title: "A run's cut-off and creation, to the microsecond",
    assertion:
      "A service line whose created_at equals the run's own created_at (loaded at the instant of the transaction that creates the run) is the run's at creation and in the price job alike: its period is not refused as holding no service line, nor as nothing mapped (MAP-07), and creation judges exactly the plans and dates the job prices. Every time a run is judged against is compared in Postgres, to the microsecond, never as a millisecond JS Date: a mapping made at the run's own instant is not a reason to re-run it, while one made after is, and a complete run with no line created before the location's last save, within the same millisecond, is listed as priced before the location changed",
  },
  { id: 'CAS-01', title: 'Cohort below minimum size', assertion: 'No anomaly' },
  { id: 'CAS-02', title: 'Anomaly never enters a case or report total', assertion: 'Holds' },
  { id: 'CAS-03', title: 'Lines grouped by payer pattern from traces', assertion: 'One case per pattern' },
  { id: 'CAS-04', title: 'Case below case materiality', assertion: 'Not created; accumulates' },
  { id: 'CAS-05', title: 'Line below line materiality', assertion: 'Validated, not actionable' },
  { id: 'CAS-06', title: 'Write-off with reason', assertion: 'Leaves actionable total; stays visible' },
  { id: 'CAS-07', title: 'Reopen a written-off line', assertion: 'Explicit reason; audit event; earlier report unchanged' },
  { id: 'CAS-08', title: 'Narrative with a figure not in the input', assertion: 'Verifier fails; approval blocked' },
  { id: 'CAS-09', title: 'Drafter attempts approval', assertion: 'Refused' },
  { id: 'CAS-10', title: 'Single-user practice', assertion: '24-hour delay and audit flag' },
  { id: 'CAS-11', title: 'Identifiers in a draft', assertion: 'Placeholders; inserted at export only' },
  { id: 'CAS-12', title: 'Export', assertion: 'PDF and CSV hashes stored; shown in submission log' },
  { id: 'CAS-13', title: 'Edit after approval', assertion: 'New version; approval cleared' },
  { id: 'CAS-14', title: 'Submission with no response in 45 days', assertion: 'Follow-up surfaces' },
  { id: 'CAS-15', title: 'Interest line where state rule applies', assertion: 'Separate line; not in expected' },
  {
    id: 'CAS-26',
    title: 'Payer copy of an export',
    assertion:
      'No login, record ID, SHA-256, verification, internal note, code, interest not computed or $0.00 interest; above the first level the level’s own window alone; approval line, reference and contact printed; the internal record on the review page',
  },
  {
    id: 'CAS-27',
    title: 'Export with no correspondence contact',
    assertion: 'Refused before anything is queued, with the remedy; the job refuses with its code and prints nothing; Postgres refuses the export without a name and phone',
  },
  { id: 'CAS-28', title: 'Packet found by its reference', assertion: 'Every version of the practice whose reference matches, none of another practice' },
  {
    id: 'CAS-29',
    title: 'Submission of an export whose pricing went stale after it was made',
    assertion: 'Never attested; logged only as sent without sign-off, with the person’s confirmation, its reason and the database’s audit event; any other unattested export refused',
  },
  {
    id: 'CAS-30',
    title: 'A line’s calculation in words',
    assertion: 'Every figure in the words is in the line’s trace or its rate record; a flag that is off reads only as not applied; an unpriced line reads its reason’s meaning and remedy',
  },
  { id: 'CAS-31', title: 'The line trace for a role that does not read PHI', assertion: 'The steps in words with no date; the stored trace not sent' },
  {
    id: 'CAS-32',
    title: 'A packet’s calculation on the review page and in the PDF',
    assertion: 'The same words, from the traces its approval names, by one renderer whose version the approval, the export request and the export job agree on; a trace that differs, a line priced by another rate record or another words version is refused',
  },
  {
    id: 'CAS-33',
    title: 'The fee schedule worksheet',
    assertion: 'One per distinct set of records, with the year, locality, setting, RVUs, GPCIs, conversion factor and the engine’s expression; never an amount at 100% for a contract that is not at 100%',
  },
  { id: 'CAS-34', title: 'A code the words have no words for', assertion: 'Refused on every screen and in the PDF; never shown as a code' },
  {
    id: 'CAS-38',
    title: 'The materiality and pursuit settings show stored cents as dollars',
    assertion:
      'With a practice’s thresholds at 500 and 25000 cents and a staff rate of 4500 cents an hour, Settings → Defaults says "$5.00 per line and $250.00 per case" and "$45.00 an hour", each in the mono face, and pre-fills its dollar fields with 5.00, 250.00 and 45.00; the cases page pre-fills the same thresholds with the same helper; the console’s model budget is typed in dollars, as its hint says',
  },
  {
    id: 'CAS-39',
    title: 'Saving the defaults form unchanged changes nothing',
    assertion:
      'Submitting the materiality and pursuit forms with the values the page pre-fills keeps lineMaterialityCents 500, caseMaterialityCents 25000 and staffRateCentsPerHour 4500; for every amount, the helper’s output read back through the save’s dollars field gives the same cents; a model budget entered as 5.00 or 5 is stored as 500 cents',
  },
  {
    id: 'CAS-41',
    title: "A month's triage and report read in bounded memory",
    assertion:
      "Triage's candidates and the audit report are read in batches; the judged candidates, the report's content, its CSV's bytes and its PDF's HTML equal the whole read's; what the report holds grows by at most 400 bytes per line, its CSV rows kept outside the heap",
  },
  {
    id: 'CAS-40',
    title: "Concurrent writers of one line's stages",
    assertion:
      "The second of two forward events is refused; a reopen naming a stage that has since moved is refused; a line's events sort by commit order, so a duplicate forward event is refused; no new deadlock; every line's head row equals its latest event, through the ledger's stages too; 30,000 stage events in one transaction hold no advisory lock per line, and another practice's events commit meanwhile; an empty table's statistics add no sequential scan per event",
  },
  {
    id: 'CAS-42',
    title: 'A real-size month triages and reports',
    assertion:
      "A 100,000-line run triages and reports in one transaction each under 75% of the worker's heap, holding at most its practice's one advisory lock, within the time budget; a 100,000-line report and another practice's 100,000-line triage complete together under the worker's heap; the weekly run under release 900110 completes every measured job on its first attempt, with no backend above 64 advisory locks, no job's live heap above 75% of the limit and the worker's memory at or under 90%",
  },
  {
    id: 'CAS-43',
    title: 'A narrative states an input’s figure in another role (the window’s 10000 days as visits, a date’s year as claims, a page as a code, a release as units, a quoted clause’s or name’s number as the record’s, the allowed amount as the shortfall or as paid, a service date as the payment date, the days to pay as the window, calendar days as business days), including in a clause whose words name two roles (“Under the contract, the payer allowed $100.00”, two day counts swapped, the payment date as the deadline, the contract’s percentage as the interest rate), with “respectively” in the wrong order (its cues before the list or after it), a total as each line’s or a line’s value as a total with a scope phrase beside it (“The payer allowed $210.00 per line”), a scope stated with each cue of a “respectively” list swapped, an amount or a count of units with no scope phrase beside it where its role’s per-line and total values differ (“The payer allowed $210.00”, an opening “For each line,” or “In total,”, a subject “Each of the 3 lines”, a scope in another clause or past a comma, a dash or another word: “The payer allowed $70.00 after each line was reprocessed”, “..., which the payer explained for each line”, or a list whose only scope follows “respectively”), two scope phrases beside it that differ (“in total for each line”), an amount or a count of units in all whose per-line and total values differ in a sentence that names a part of the lines, whatever scope phrase is beside it (a row “on line 1”, “line A” or “the claim line”, one line’s noun after any word but “each”, “every” or “per” (“a line”, “a single line”, “the earliest visit”, “Jane Roe’s line”), “the encounter” or “the session”, the lines in the plural after a word that names some of them (“both lines”, “most lines”, “the GP lines”, “the March lines”), a code, a date of service or a month’s name, a patient or a claim in any place where the pattern has more than one (“the patient owes”, “patient B”, “a claim”, “her claim”), a partitive “2 of the 3 lines”, “remaining”, “other”, “first”, “last”, “some”, “rest”, an exclusion (“excluding a line”, “all lines but one”), a count of lines other than the pattern’s, “for the claim” where the pattern has more than one claim, a scope phrase of the closed list beside no figure that states another scope (“On each line the payer allowed $210.00 in total”, “$300.00 in total; that is per line”), or a total with “per claim”, “for each patient” or “Each claim” where there are more than one), a value only some lines hold stated per line (“$150.00 per line” of one line’s $150.00 where the others hold $100.00), a “respectively” list in neither plain form (a count, a code or a scope between the list and its cues or “respectively”, a figure of another kind in the list’s clause, more or fewer cues than figures, none, or “respectively” before the list), a year before a count’s noun (“these 2026 claims”), or a quoted figure in a role its quote does not give it (a listed code as days, a page or a release)',
    assertion:
      'The verifier fails each figure (`figure_not_in_input`, at the figure, with its kind), reading one cue’s role per figure and never the union of its clause’s cues, and a figure’s scope from a scope phrase of the closed list beside it alone, and none in a sentence that names a part of the lines; approval is blocked; a version an older reading passed shows that the verifier fails it now, on the builder and the case’s page, in words that match where it stands (not approved, approved, exported or an earlier version) and its cause (the marked figures only when one is marked, else the narrative, or with no mismatch that the stored narrative no longer matches its report), and its request for approval, its approval and its export are refused, its export held back with the reason, by the same cause, before the click and a refusal saying each figure in the role’s words; the editor says what the figure was read as and what the records hold it as, or, beside the figure marked, “state whether this figure is per line or in total right after it (“per line”, “in total”, “across all the lines”), and keep any one line, group of lines, code, date of service, claim or patient in a sentence of its own” for a figure with no scope and “give each figure its own words instead of “respectively”” for a list in neither plain form; the model gateway fails every swap its own reading at 83d71fd6 caught, and names no wrong role for a figure that needs a scope or its own words; each reproduction of the review of 2026-11-01 and of the rounds of fix and recheck after it is a named example',
  },
  {
    id: 'CAS-44',
    title: 'A narrative states each figure in the role its input holds, or as a quoted text holds it',
    assertion:
      'Passes: days, pages, versions, releases, levels, years, counts, units and rows each with their words, in digits, with commas or in words; a quoted figure beside its own words, in the role its quote gives it; at least 100 hand-written forms not drawn from the drafting templates; each figure in the role of the noun after it or its nearest cue (“the $30.00 difference”, “the payer paid the contract rate”, a deadline after “days after payment”), “respectively” in order in its two plain forms, its cues right before the list (“The contract expected per line and the payer allowed per line $100.00 and $70.00, respectively”) or right after it (“$100.00 and $70.00 were the expected and allowed amounts per line, respectively”, “$100.00 and $70.00, respectively, were ...”), each figure in the scope phrase right after its cue (“$300.00 and $70.00 were expected in total and allowed per line, respectively”), else the whole list’s (right after the list, or right after “amounts”), never a clause after “respectively”; an amount with a scope phrase of the closed list beside it, right after it (“per line”, “a line”, “for each line”, “on each of the 3 lines”, “in total”, “in all”, “across the 3 lines”, “for all the lines”, “for the claim” where the pattern has one claim) or right before it (“each line’s”, “the per-line”, “a total of”); an earlier clause’s figure beside a “respectively” list as its own (“The payer paid $56.00 per line, while $100.00 and $70.00 were the expected and allowed amounts per line, respectively”); an amount with no scope, or in a sentence that names a part of the lines, where its role’s per-line and total values are one; each line’s and the lines’ totals, ordinals and partitives as prose (“the first 3 claims”, “2 of the 3 claims”), “Lines 1–3”, a locked fee schedule’s year and business days to pay; a number with no role fails',
  },
  {
    id: 'CAS-45',
    title: 'A write-off reason the line’s own records contradict',
    assertion:
      'The Reason starts on “Choose the reason”, and a write-off with no reason chosen is refused on Reason; “Window passed” is neither offered nor accepted for a line whose dispute window is open or unknown, and is refused on Reason with nothing written; once the window has ended it is offered and recorded',
  },
  {
    id: 'CAS-46',
    title: 'A payer response or a submission with nothing chosen',
    assertion:
      'The Response starts on “Choose the payer’s answer”, the Channel on “Choose the channel” and the payer’s letter on “Choose the payer’s letter”, and Received on starts empty, its words saying the next dispute level’s window counts from it; a response with no answer, no letter or no date received, or a submission with no channel, is refused on that field and nothing is recorded; a response records the date entered, and a denial that reopens the case counts the next window from it; the words under Response say that every response is recorded for good, which state each answer gives the case (a denial without reopening resolves it, as an acceptance does, and a denial that reopens it awaits a response, as a request for information does) unless its lines already decide it (a line at Payer approved or later, a line moved back from it, which keeps the case awaiting a response, or every line written off), that the recovery ledger approves up to its amount at the next reconcile (Payer approved), and that nothing is recovered until it is posted or deposited',
  },
  {
    id: 'CAS-47',
    title: 'The payer’s letter uploaded in “Log a payer response”',
    assertion:
      'The form shows with no letter on file; the letter goes through the same scanned intake; what was typed before the upload keeps its value through the scan and the page read again; the letter is chosen only once it is stored, and only the letter that form uploaded or, for a duplicate, the copy on file a response may carry, never over the person’s own choice, and the choice never moves focus; a duplicate it does not choose is named by when its copy was uploaded, as its option starts; the letter that form uploaded starts “Uploaded here” in the list, and every option starts with what tells it apart; an empty or too large letter is refused in one file’s words, never told to zip it; a press while it uploads or is scanned sends nothing; a stored letter the list does not show yet is said to be on its way, and if it never arrives the form says to reload; no button of the uploader submits the form; leaving the page asks only while the letter is being sent, a Retry that sends it again included, and never at the press that records the response; where the person cannot upload or uploads are paused or closed, the card says to choose a letter on file, or, with none on file, that no response can be recorded yet, and the uploader’s panel says why under a title true to the state, in an upload’s words; the drop zone is named by its heading; a file dropped on the form, with nothing typed, is cleared with the form for another person signed in on the same browser; the letter’s field and its upload sit under headings one level below the form’s, and the rest of the form under a heading of its own; no request carries the file’s name, and no upload request carries the form’s request key; the submission log names each response’s letter and links its receipt',
  },
  {
    id: 'CAS-48',
    title: 'A payer’s answer kept apart from the contract documents',
    assertion:
      'A response naming a document still in intake, held, a duplicate, a zip or one of its entries, of a kind other than a payer letter or other document, of another practice, or a contract version’s source is refused on the letter with one sentence, and nothing is recorded; the letters offered are grouped, those no response names first, this person’s uploads before another person’s, then this case’s responses’, listed whole, then other cases’, and a response with another case’s letter is still recorded; a letter a response names leaves Documents to tag and Documents awaiting abstraction, and tagging it, or naming it in an amendment or a correction, is refused with what to tag instead; a tag and a response of the same letter at the same time cannot both pass; a payer’s terms letter that no response names stays in both lists; the Contracts panel names its payer letter kind a payer’s terms or policy letter and says where a payer’s answer goes',
  },
  {
    id: 'CAS-49',
    title: 'A reconcile pass writes what the per-line pass wrote',
    assertion:
      'On generated passes at the posted and at the deposited proof level with corrections, reversals, recoupments, payer responses, partial postings, EFT deposits, patient share and reopens, and on LED-01 to LED-18\'s worlds, the pass writes the same ledger matches, entries, stage events, payer responses, notifications and audit events, in the same order where order is observable and with the same text in every encrypted note, as the per-line pass; a line\'s payer approved and recovered written in one statement keep their order and checks',
  },
  {
    id: 'CAS-50',
    title: 'A reconcile pass\'s reads do not grow per line',
    assertion:
      'Between 200 and 800 lines the pass\'s candidate searches and claim-line reads stay a fixed number of statements, none of them reads the ledger\'s matches, its stage events are one statement, and it decrypts each claim\'s patient control number at most once per phase',
  },
  {
    id: 'CAS-51',
    title: 'A reconcile pass at real size',
    assertion:
      'A step-7b pass of 2,000 lines, spread over cases, in one case and on few service dates (more on the weekly run) approves and posts every line within its time budget, its own part (the pass less the ledger\'s entry inserts) within its own budget and at most 1.5 times as slow a line at 2,000 as at 500, under 75% of the worker\'s heap',
  },
  {
    id: 'CAS-52',
    title: 'A narrative template’s free text holds no figure',
    assertion:
      'Every figure `scanText` reads in strict mode (digit runs, signs, Roman numerals after a level, ordinal days, every word of the scanner’s tables, “zero”, “thousands”, “paid nothing”) fails at its span (`free_figure`, `number_word`), from a person or a model, while markers (a person’s), identifier placeholders (a person’s) and fact tokens pass. A fact token with a sign, a point, a letter, a digit or another token typed against it, or with a sign, a currency sign or a sign’s word (“negative”, “minus”) set off before it by whitespace, brackets or quotation marks, fails at its span (`fact_not_separated`), and a numeral character normalization reads as letters (“Ⅻ”) is a `free_figure`. A model’s draft with any `/3` mismatch is not written (`not_drafted`, `misstated`); a text segment with `{`, `}`, `[` or `]` is `invalid_output`; a model’s `line.*`/`claim.*` id is `unknown_fact`. The pre-call guard passes a synthetic surname equal to a vocabulary word.',
  },
  {
    id: 'CAS-53',
    title: 'A narrative template’s fact ids',
    assertion:
      'Every catalog id renders for its content; an id the content lacks (row out of range, interest not stated, a code not in the pattern, `deadline.window_days` with two counts, a window id above the first level, `contract.rate` for a fractional amount or a percentage method) and a stray `{{` fail (`unknown_fact`); a non-canonical id (rows out of order, `claim.4` not a first row, a one-line claim, `lines.*` equal to a code’s rows, a code id in a one-code pattern) fails (`fact_not_canonical`) and names the canonical id; codes G0283, 0275T and 97110 and a modifier render from content; an off-shape code has no id; a typed subset sum opens the picker and is never matched to a row set; a person’s write whose row map changed under a row-bound id is refused (`schedule_changed`).',
  },
  {
    id: 'CAS-54',
    title: 'A fact token its sentence contradicts, in both directions',
    assertion:
      'A free-text role cue naming a role the fact does not hold; a closed-list trigger, or a part-naming token (`code.*`, `line.*`, `lines.*`, `claim.*`, an identifier placeholder), beside an all-lines fact; and a total or all-lines word beside a part fact, each fail (`fact_contradicted`); part-naming tokens covering every line together pass. ADR 0086’s known-limit sentences (“on a subset of the lines”, “apiece”, “for her”, ...) render with their set stated by code, and no sentence with a part-naming token or a listed trigger passes with an all-lines figure.',
  },
  {
    id: 'CAS-55',
    title: 'Render, approval and export of a narrative’s fact tokens',
    assertion:
      'The render equals each fact’s phrase with `formatUsdPlain` amounts, stored pattern and code totals, and code-computed row sums (bigint cents, decimal units); it is idempotent; it is the same in the browser and the worker, and `formatUsdPlain` equals `formatUsd` en-US in both; a renderer change between save and approval makes `verifierNow` read `fails_now` and blocks the approval (`rendered_changed` when the screen’s hash differs); the export refuses a `rendered_sha256` that differs or a surviving `{{`; the v2 set passes 300 of 300 at the gate on the local provider',
  },
  {
    id: 'CAS-56',
    title: 'No web request waits on the ledger lock',
    assertion:
      'While a second session holds a practice\'s `ledger:` lock as a reconcile pass does, each of the seven ledger actions a person sends (match a posting, a deposit or a claim by hand, reverse a match, adjust an entry, write a line off, reopen a line) answers `busy` at once (within two seconds), as a status and the closed word `ledger`, with no identifier, and writes no row, audit event or request key (the same key sent again once the lock is free is taken as new); with the lock free the same actions go through and write as before; a second person’s action sent while the first is in flight is refused the same way',
  },
  {
    id: 'CAS-57',
    title: 'No web mutation waits on a row a reconcile pass holds',
    assertion:
      'Every transaction the routes’ wrapper opens for a signed-in request sets `lock_timeout` (three seconds) first, for that transaction only, and the queue producer’s pool carries the same setting, which a database URL cannot replace; a file that takes a connection of its own from a pool is named; while a second session holds a case’s row as a reconcile pass does, assigning the case answers `busy` with the closed word `records` after about the timeout and never after the holder, logs its code and the request’s ID alone, and writes no row, audit event or request key; with the row free the same assignment under the same request key goes through; a page’s read that waits on a lock is refused the same way and shown as the error state, never “not found”; the same request key sent while its first request is still running is answered `busy` with the closed word `request`, and `duplicate` once the first has saved, while another lock met as the key is written is `records`; a form’s words say what stays in it (what was typed, all but passwords and codes, or nothing), and a form already sent is “Not confirmed”, keeps its key and is sent again unchanged; sign-in, the session’s read and the public forms are not bounded',
  },
  { id: 'LED-01', title: 'Packet submitted', assertion: 'No entry' },
  { id: 'LED-02', title: 'Adjusted remittance with higher allowed matching a case line', assertion: '`approved` entry for the difference' },
  { id: 'LED-03', title: 'Adjusted remittance matching no case', assertion: 'Listed for manual match; no entry' },
  { id: 'LED-04', title: 'Posting export row matches by check number', assertion: '`posted` entry' },
  { id: 'LED-05', title: 'EFT row matches by trace', assertion: '`deposited` entry' },
  { id: 'LED-06', title: 'Recoupment after deposit', assertion: '`recouped` negative; total reduced; case reopened' },
  { id: 'LED-07', title: 'Manual match reversed', assertion: '`reversed` offsets exactly' },
  { id: 'LED-08', title: 'Duplicate posting export', assertion: 'No duplicate matches' },
  { id: 'LED-09', title: 'Partial posting at check level', assertion: 'Pro-rata allocation flagged' },
  { id: 'LED-10', title: 'Direct UPDATE or DELETE by the app role', assertion: 'Fails' },
  { id: 'LED-11', title: 'ROI statement recompute', assertion: 'Equals sum of entries' },
  { id: 'LED-12', title: 'Reversal with a provider-level adjustment', assertion: 'Moves no cash: no `posted` or `deposited` entry and the adjustment never an entry; the reversal `recouped` once, at once, for what the reversed claim approved' },
  { id: 'LED-13', title: 'Later recoupment', assertion: 'Negative event against net recovery' },
  { id: 'LED-14', title: 'Adjusted remittance on a line with coinsurance', assertion: "`approved` for the payer's payment increase, posted and deposited net of the payment it replaced, and recovered; the patient's share shown as billable to the patient, counted in no total; a later reversal `recouped` for what was paid, and a reissue after it `approved` for its payment over the original; a partial check-level posting proves the line's share net of the payment it replaced; a lower reprocessing in the same reconcile takes back the payment decrease" },
  { id: 'LED-15', title: 'Correction a deductible absorbed', assertion: "No entry: shown as payer corrected, balance the patient's, never recovered and never no change; a correction the deductible absorbed in part `approved` for what the payer paid; a higher allowed amount paying less with nothing approved recorded as decreased with no entry, and a later correction `approved` against the payment before it" },
  { id: 'LED-16', title: 'Adjusted remittance on a line with a copay', assertion: '`approved` for the payment increase, the allowed increase when the copay is unchanged; beside a coinsurance line of the same claim, interest split and a provider-level withholding taken in order by what the payer pays' },
  { id: 'LED-17', title: 'A line holding two approvals, then a reversal', assertion: "Each posting share net of the claim it replaced; the reversal `recouped` for the payment it removes: its own claim's approval while the earlier payment stands, every approval when nothing stands, nothing while a later claim stands" },
  { id: 'LED-18', title: 'Payer response accepted before the remittance pays it, on a line with coinsurance', assertion: "The acceptance is the payer's payment; the remittance confirms it with no shortfall; approved but not yet posted reaches zero once proved; billable to the patient in no figure" },
  { id: 'SEC-01', title: 'Every PHI table has a forced policy', assertion: 'Catalog test passes; new table without one fails' },
  { id: 'SEC-02', title: 'Cross-tenant read and write on every table', assertion: 'Zero rows; refused' },
  { id: 'SEC-03', title: 'Firm user after grant expiry', assertion: 'Denied on the next request' },
  { id: 'SEC-04', title: 'Firm user after revocation', assertion: 'Denied within one request' },
  { id: 'SEC-05', title: 'Support grant after four hours', assertion: 'Denied; practice notified with reads' },
  { id: 'SEC-06', title: 'Bulk job spanning practices', assertion: 'Refused by design' },
  { id: 'SEC-07', title: 'Log line with a name or member ID', assertion: 'Lint fails' },
  { id: 'SEC-08', title: 'PHI in a URL or S3 key', assertion: 'Test fails' },
  { id: 'SEC-09', title: 'Model call outside the gateway', assertion: 'Lint fails' },
  { id: 'SEC-10', title: 'Audit row update or delete', assertion: 'Refused' },
  { id: 'SEC-11', title: 'Deletion workflow', assertion: 'No readable object remains; certificate recorded' },
  { id: 'SEC-12', title: 'Legal hold', assertion: 'Deletion paused with notice' },
  { id: 'SEC-13', title: 'Restore from snapshot', assertion: 'Row counts and catalog test pass on the restored instance' },
  { id: 'SEC-14', title: 'Fixture with a non-synthetic sender', assertion: 'Hook refuses the write' },
  { id: 'SEC-15', title: 'Session idle past 30 minutes on a PHI screen', assertion: 'Expired' },
  {
    id: 'SEC-17',
    title: 'Screening tables hold no PHI-shaped columns',
    assertion: "Catalog read finds no name, birth date, member ID, service date or claim number column, no practice_id and no registry row; owner-only policy, no other role's privilege",
  },
  {
    id: 'SEC-18',
    title: "No screening address outlives its screening but as a keyed hash (audit #76; the founder's Q10 (a) and Q11 (b) of 2026-10-21)",
    assertion:
      "The screening's SES set uses no suppression list, so SES keeps no screening address and no screening outcome silences a customer's mail; the mail record holds no address and no hash of one; the only values derived from a screening address kept past its prospect are the refusal list's keyed hash of the mailbox an address reaches (its every spelling: ASCII case and white space, a +tag, Gmail's dots, googlemail.com, and me.com and mac.com for icloud.com; an address with any other character as read) that was reported as spam, or of the address with its +tag kept that bounced permanently, on the screening stream, for 365 days, and the bounce budget's 7-day marks of the rate limiter's keyed subjects; the keyed hash differs from a plain SHA-256 of the address and changes with its pepper, which no role reads, and a scan of every text column after the mail scenarios finds it only on the refusal list; no address or domain appears in a log line, job payload, SES tag, audit event or error; no login role has a grant on the mail tables or may call the keyed hash; the application role may not write notice_undelivered, mail_stream_paused or mail_stream_resumed (42501)",
  },
  {
    id: 'SEC-19',
    title: 'A break-glass notice, or an invitation, that reaches no one (audit #76)',
    assertion:
      "A support-access notice goes one message per current practice administrator, from recipient rows recorded before any send, each sent in its own transaction with its message ID kept and retried only to pending recipients after 1, 5, 15 and 60 minutes, so no administrator gets two (a send that throws is sent again to that administrator alone); the first accepted send writes notice_sent, and each recipient's delivery is recorded by message ID in either order; a notice not delivered to every administrator writes notice_undelivered once, notifies each administrator in the app (which notice, linked to its grant, with no figure and no address), reads not delivered to n of m administrators on the grant's page and on the console's support list, and logs NOTICE_UNDELIVERED, which pages the operator; a notice with no administrator writes notice_undelivered, never notice_sent, and logs NOTICE_UNDELIVERABLE; dunning goes the same way, its undelivered stage reported once on the invoice; a message SES accepted and never sent, its administrator on the account's suppression list for an earlier bounce or complaint, reads not delivered, never delivered; an invitation whose latest message bounced, was suppressed, rejected or reported reads not delivered on the users page, one SES held back with its suppression list or reported as spam offering no resend (a resend posted anyway is refused) and naming PaidWhole's support, which releases the address, and the late bounce of a message a resend replaced flags nothing",
  },
  {
    id: 'SEC-20',
    title: "Every Cognito call that takes the client's credential (ADR 0088 D1, D2)",
    assertion:
      "`InitiateAuth`, `RespondToAuthChallenge`, `ForgotPassword` and `ConfirmForgotPassword` carry a hash over the username that request sends (a challenge's over Cognito's USERNAME, never the typed email), `RevokeToken` the client secret, and no other call either; a hash mismatch answers as Cognito does and surfaces as a client-credential error that writes no sign-in failure, locks nothing, answers a reset request alike at the floor and logs only its name; a credential refusal at start-up fails the web task's readiness, and any other probe outcome passes; from release N+1, once the client is confidential, a direct reset or sign-in without the hash is refused on staging (F2)",
  },
  {
    id: 'SEC-21',
    title: "The client secret's custody (both read paths)",
    assertion:
      "From release N+1 (release N carries only the pull-request diff role's explicit deny below): the web client is confidential and narrowed (user-auth only, no writable attributes); its secret is in Secrets Manager under the environment key, injected into the web container by the web execution role only; its resource policy denies reads to every principal but the web execution role and the custodian, and writes to all but the custodian (and the rotation's caller for `RotateSecret`); in Cognito, `DescribeUserPoolClient` and `ListUserPoolClientSecrets` are held by the custodian's role only, explicitly denied to the pull-request diff role, and granted to no other role in the stack; the worker's, platform's and screening's containers and the shared task role hold no read of it; the stack has no shared custom-resource read of the client; no env file, log line, error reason, serialised config or client module carries it; the stored value is a fixed literal until seeded, and any change to the secret re-runs the custodian's ensure step; rotation is on demand, Cognito-generated, scoped to this secret and account, refuses to delete a value running tasks may hold, and keeps the client ID; on staging the resource-policy deny is shown to override an identity allow (F3)",
  },
  {
    id: 'SEC-22',
    title: 'A second factor enrolled outside a live invitation (ADR 0088 D3, D4)',
    assertion:
      'An unknown, active, enrolled, locked, disabled or lapsed-invitation account, or an invited account with no invitation at all, answered `MFA_SETUP` is refused before any enrolment call, at the challenge and again before associate and verify, Cognito stores nothing, and a security event is logged; the account is the one matched by both the enrolling Cognito subject and the email, so a row whose `cognito_sub` differs from the subject, a challenge with no subject, or email and sub rows that are different users are refused; an invited, unenrolled account enrols only while it holds an unaccepted, unexpired invitation whose membership has not ended; an invitation onto a Cognito user that has signed in is refused, and onto one that never has re-sends its temporary password',
  },
  {
    id: 'SEC-23',
    title: 'Reset and enrolment signals reach the operator (R-11)',
    assertion:
      "Undelivered reset requests (configuration and throttle codes), failed requests, refused enrolments, refused client credentials and the start-up probe's refusal each have a filter and an alarm on the operator topic; reset requests per user over 5 in an hour alarm through a contributor rule keyed on the user ID, with no per-user metric; the messages are read from the app's source",
  },
  {
    id: 'SEC-24',
    title: "An untrusted document is read in its own process (ADR 0033's amendment of 2026-11-05)",
    assertion:
      "Each contract, exhibit or payer letter is read in a child process of its own, one at a time in a worker process, with an empty environment, an argv of its flags and entry only, Node's permission model reading only its own code (no file written, no process, thread or addon), no core file written (a core limit of 0, soft and hard, it cannot raise, its working directory `/`, every container's core ulimit 0; a host core_pattern that pipes to a program is the host's) and a heap of its own, 240 MiB under any parent's heap flag (measured under the worker command with `heapFlag('worker')`); past its memory cap over its ready baseline, its deadline, its page or character caps or the reply's total byte bound, or on a V8 heap out of memory it is killed and the document is unsupported_document, never read in part; a reply frame whose header claims more than the bound leaves is refused before its body is read as the reader's own failure (PageReadError); the bounds hold until it closes, and one that does not exit within 1 s of its last frame is killed; any other failure is PageReadError, naming only an exit code or signal; a container of the worker image carries a V8 heap flag only while `PAGE_READER_ISOLATION` is `'process'`; the bundled reader reads SYNTHETIC documents under the image's argv",
  },
  {
    id: 'SCR-01',
    title: 'Screening upload with a date-of-service or member-ID column',
    assertion: 'Rejected with the column named by position and kind; only the row count and reasons stored, no hash',
  },
  {
    id: 'SCR-02',
    title: 'Screening pricing of a clean upload',
    assertion:
      "Each Medicare row is the engine's one-line amount before sequestration times its claim count in bigint, and a code in the reduction across codes also its amount as a later code of a visit; a row is an anomaly only more than $5 a claim line below its lowest figure; MA contracted and commercial rows count toward the dollars that cannot be priced without a contract; 50,000 rows return a result in under 60 seconds",
  },
  {
    id: 'SCR-03',
    title: 'Screening 30 days after its upload',
    assertion:
      "Link refuses it; the expiry job deletes the run and its results; the conversion stays, and so do the screening's counts-only outcome (unlinked) and a kept summary (SCR-10, SCR-11)",
  },
  {
    id: 'SCR-04',
    title: 'Screening uploads past the limit',
    assertion: 'Refused per business domain, per free-mail mailbox however its address is spelled, and per IP; subjects stored as keyed hashes',
  },
  { id: 'SCR-05', title: 'Screening output wording', assertion: 'No page, message or email says owed, underpaid or recovered; no tagline' },
  { id: 'SCR-06', title: 'Screening converted to an audit request', assertion: 'Audit request recorded and logged as an audit event' },
  {
    id: 'SCR-07',
    title: 'Screening row of fewer than 11 claim lines',
    assertion:
      "Left out in the browser, which says how many rows, claim lines and dollars it left out, as the result does; a request sent around the browser refused with the row numbers, storing only the row count and coded reasons, no hash; refused by the database's CHECK; 11 claim lines taken; the hash kept is the database's, of the rows accepted, never the file's; a later screening of the same practice replaces the earlier, so a row of 12 claim lines and the same row at 11 are never held together",
  },
  {
    id: 'SCR-08',
    title: "The screening's capacity under production limits (audit #53 part 1; the founder's rulings of 2026-10-20, decisions 13 to 16, of 2026-10-21, Q1 (a), Q7 and Q8, and of 2026-10-23, S4's median of three and time advisory)",
    assertion:
      "The production images at production's task sizes, the screening consumer among them (WORKER_JOBS=screening at 2 vCPU and 4 GiB, three threads, on its own login) beside a platform that prices none, Postgres at db.t4g.medium's 2 vCPU with gp3's baseline and a 2 ms round trip, on GitHub's free 4-CPU runner in its shared layout (Postgres, the harness and Chromium on 0-1, the consumer on 2-3, the web and the platform on 3; on eight CPUs or more each service on CPUs of its own, derived the same way from environments.ts's sizes, the report naming which ran), the SYNTHETIC scale release (2.2 million records): the practice and worst 50,000-row uploads alone and three at once (cold, the worst ones distinct, each upload a prospect of its own; the three worst at once, S4, run three times, S4#1 to S4#3, each cold with the same uploads from prospects of their own) with a small one sent once the large uploads' jobs are queued; fails on an OOM kill (Postgres's included), a restart, anonymous memory above 90% of a limit (the consumer's included), a limit or cold start not applied, the consumer measured at another size than declared or its threads not pricing at once (a free thread takes the next normal job at once: each send to a screening queue wakes the consumer's workers through LISTEN/NOTIFY and each run's end wakes them again, pg-boss's 2-s poll kept as the fallback), a runner too small (fewer than 4 CPUs, each need named), a layout other than the one the harness gives the runner, a container or the harness off its layout's CPUs, a wrong, unfinished or stalled result, a result page that does not open (its first page of groups or its last), a small upload not queued behind the large ones, the platform pricing a screening, a process-runtime layout missing what the images hold (PROCESS_IMAGES_INCOMPLETE), an upload in the waiting tier, the consumer's time to email not logged or out of its bounds (never above the time from the harness's click to its own line, never more than 2 s below the harness's, the web's receipt stamped by its proxy before the body is read), a request that left for the static origin, an oracle mismatch or an oracle short of an upload's Medicare rows (S1-1, S2-1 and S3-1 against the read and adapter frozen at 3c1b289, and S1-2, a ZIP the release splits across localities sent with its ZIP+4, against the whole-release oracle), or a run of fewer than S1 to S5 with S4's three runs, every one of these checks holding in each of S4's runs; time judged: any upload above 48 s on the runner (60 s scaled by the runner-to-Fargate factor once staging measures it), S4's on its middle run alone (its runs ordered by their worst upload, the small one included, all four of the middle run's uploads judged; the founder's ruling of 2026-10-23, kept in both time modes), fails a binding run (a release's) and is a warning in an advisory one (every other run's: a pull request's job and gate pass on time warnings alone and fail on any other check; the founder's third ruling of 2026-10-23, time advisory), and a worst judged time above 44 s goes to the founder as a sizing question, shown on the pull request's checks as a warning; required on every pull request through a gate that runs even after a cancel and measures when a path of the derived watched list changed (the import closure of the screening's entry points and the files no import reaches, held equal to what watched.ts derives); the release loader analyzes and freezes rule_record after a load, and the keyed read probes the index per key (operator_screening_run_keys estimated at one row)",
  },
  {
    id: 'SCR-09',
    title: 'The release read by key (audit #53 part 2)',
    assertion:
      "A release's shared types held once per release and manifest (two releases at most); each run's keyed records read by its own codes and ZIP; every stored row equal to what the old read and adapter (frozen at 3c1b289) give for the same run; the key set and its records read on one snapshot; a lookup outside the keys fetched, a row outside the key set or a code priced outside it fail the run as RELEASE_READ_OUTSIDE_FETCH before its batch is recorded, never a row priced ENGINE_ERROR; an attempt a stale claim overtook stops at its next call; the shared types read by the record-type index, never a sequential scan of rule_record, leaving out the six keyed types (locality_map_plus_four, keyed by the five-digit ZIP, among them)",
  },
  {
    id: 'SCR-10',
    title: "A screening's counts-only outcome (audit #57; the founder's rulings of 2026-10-20)",
    assertion:
      'Written at submission, refusal, completion and failure by the database alone: stage, month, source, the channel computed from the medium and click kind, a listed campaign or other, bands of the row counts, whole-percent shares summing 97 to 100, the anomaly and dollar bands, the open band, the conversion, and whether an accepted screening followed a refused upload (on the accepted outcome; a refused one is never changed); no name, email, ZIP, exact count, date or dollar figure; unlinked on expiry and replacement, then sealed; never deleted; two outcomes of a practice whose row differs by one claim line differ in no count',
  },
  {
    id: 'SCR-11',
    title: "A converted or consenting practice's kept summary",
    assertion:
      "Frozen at conversion (or at completion with consent and a withdrawal link) with the result's sums, the attribution, the labels' version and the first open; every claim-line sum 0 or at least 11; the left-out sums only at 11 or more; kept 12 months, then deleted with its products; withdrawn or deleted with its request; any other delete refused; a conversion after a withdrawal keeps it on the request alone, never the withdrawn consent",
  },
  {
    id: 'SCR-12',
    title: 'Attribution on the screening and the audit request',
    assertion:
      "The proxy sets pw_first_touch once from a landing URL's campaign codes and paid click (HttpOnly, SameSite=Lax, 30 days, never the click ID, never on /api or Next's assets); a code with an identifier's shape (a member ID, a date, a phone number, a Medicare Beneficiary Identifier, digits alone) dropped; a production server neither sets nor reads it until its legal review is recorded; both forms keep how the prospect heard of us (closed list, optional), the cookie's source and medium codes and click kind, its campaign code only when the founder lists it as the row is written and other otherwise (a database trigger on every table that keeps one, whoever writes; a code listed later changes no row), and a screened referring firm; conversion carries them with from_screening; the console declines a request with a reason from the closed list",
  },
  {
    id: 'SCR-13',
    title: 'A screening result opened by a person',
    assertion:
      "The page's GET records nothing; the signal goes once, after two visible seconds and a first interaction (focusin among them), and records the run's first open, the outcome's band and the summary's; it answers alike for any link; a conversion records the open when no signal came",
  },
  {
    id: 'SCR-14',
    title: 'A later screening of a practice with a kept summary',
    assertion:
      "The earlier summary is replaced at the later screening's completion (same address, or same ZIP and practice name), an audit event naming it; its request is carried over only by the same ZIP and practice name, and an address-only match leaves the request without a summary; the result page and email of a screening that took a request over say its details are kept with it; a failed, abandoned or refused resend deletes nothing, and a completion after expiry is refused",
  },
  {
    id: 'SCR-15',
    title: 'A screening of a ZIP split across localities',
    assertion:
      'The ZIP+4 is asked for, and kept only when needed and only for 30 days; under a release with no ZIP+4 list of the ZIP, the list is said not loaded before any ZIP+4 is asked for. Rows are priced at its locality, the keyed read holds the plus-four record, and the result names the ZIP+4',
  },
  {
    id: 'SCR-16',
    title: 'A Medicare screening row in a quarter outside the loaded content',
    assertion:
      "Left out in the browser and counted, with the loaded quarters named, and the result says so. A bypassing request is refused on the server and in the database. Other products' rows are untouched, and a content with no records at all has an empty span",
  },
  {
    id: 'SCR-17',
    title: "Queue order by an account's share and the daily cap (the founder's Q7 of 2026-10-21)",
    assertion:
      "Every upload accepted; an account's k-th upload past its 100,000-row share of the UTC day waits at priority -k (at most -20), and an upload past the day's 1,000,000-row cap of normal-tier rows at -1; the account kept only as the rate limiter's keyed subject; the cap counts the normal tier only; both sums read an append-only tally of the day's uploads, so an upload a later screening of the same practice or address replaced still counts (one mailbox resubmitting 50,000-row files gets 0, 0, -1, -2), the tally granted to no role and purged after the next UTC day; the waiting tier on a queue of its own, worked with one thread fewer than the consumer has, so a normal upload never waits behind waiting-tier runs holding every thread; a sweep fails a run out of attempts only while it is still stale under its lock; the due runs, the queue gauge and the wait ordered by priority, then age; a waiting run's time to email logged apart from the promise's metric; no upload of the capacity test waits",
  },
  {
    id: 'SCR-18',
    title: 'The "sent" page\'s four wait states',
    assertion:
      "After an upload the page tells the prospect, in the wording the founder approved on 2026-10-22, counsel to confirm before the screening opens, that the result usually comes within a minute of when it was sent (a slot free), that it can take a few minutes because other screenings were ahead of it when it arrived (runs pricing and queued ahead at least the consumer's slots), or, for either waiting tier, one neutral sentence that it is screened after the files sent within today's limits (the reason only in the emailed result, which also says why it waited); a missing or unknown state, or a wait that could not be read, shows only that the file arrived; each sentence stays true on a reload or a bookmark; the page passes axe at 390 px in every state (the columns table a focusable scroll region); the wait read from the database after the submission; an upload sent to wait logged by its code alone; the time to email measured from the proxy's stamp, which overwrites any copy a client sent",
  },
  {
    id: 'SCR-19',
    title: 'A screening whose consumer died',
    assertion:
      "A run cut off while pricing (the consumer killed after a recorded batch, or a thread out of memory, its failure logged by code) is claimed again and emailed within about 3 minutes (about 15 for a job queued before the consumer first started, which carries no heartbeat), its recorded batches kept and only its pending rows priced, at most three attempts: the job's 60-second heartbeat set on the existing queue and on every send, a run stale after 2 minutes without progress, and the sweep sending due runs again at their priority",
  },
  {
    id: 'SCR-20',
    title: "Production's screening opens only for the deployed tag's binding capacity report, measured and attested by its release, that passes (decision 13)",
    assertion:
      "The CDK app computes the launch value at synthesis from the report and the attestation bundle the deploy names, with the launch check, only for the tag's binding report that release.yml measured on the tag and attested in that run (GitHub's artifact attestation, verified by gh attestation verify against the bundle as signed by this repository's release.yml at refs/tags/<tag>, at the tag's commit, on a GitHub-hosted runner, then read again field by field: the report's SHA-256, the signer, the ref, the commit, the runner, the event and the run the report records; the report's recorded GITHUB_WORKFLOW_REF the tag's release.yml, its run and attempt named in the note; a report measured anywhere else, attested by another workflow, ref or repository, or edited after it was signed, refused, naming why) from the Docker runtime that passes with time enforced, as recorded and as read again in binding mode (every scenario but S4's three runs judged on time whatever repetition it records; an advisory report, a pull request's, refused whatever its verdict, the mode named), measured at the tag's commit, on both images by config digest as ECR holds them for the stack's repositories (each manifest read from the registry, an index resolved to its linux/amd64 manifest, nothing pulled, whatever the deployer's image store; a registry not read, a platform manifest not found, no linux/amd64 manifest or an unexpected media type named) and with every size production declares (the web, the platform, each consumer task and their number, Postgres, the storage and the consumer's concurrency), on the layout the release's runner gives, the free 4-CPU runner's shared CPUs (CPUs of their own refused until a release measures on 8 CPUs); anything else stops the synthesis, naming decision 13 and each reason; no report keeps the screening closed; a value set by hand is refused (context of any spelling, and no ScreeningLaunch parameter is declared); a rule refuses a deploy whose image tag is not the report's; the consumer runs whenever a launch value is set, so no deploy opens the screening without it; the web keeps production closed unless the value names the image tag it runs; staging and development are not gated",
  },
  {
    id: 'SCR-21',
    title: "The screening stream's cut-off (audit #76; the founder's Q9 of 2026-10-21)",
    assertion:
      "In a 7-day window since the last resume, the screening stream pauses when its permanent bounces pass 3% of its sends with a floor of 200 (6 of 150 leave it open, 7 pause it; 30 of 1,000 open, 31 pause) or its complaints other than not_spam pass 0.08% with a floor of 2,500 (2 open and 3 pause at low volume; 8 of 10,000 open, 9 pause), a bounce from SES's global suppression list counted as SES counts it, and a message the account's own suppression list held back (its bounce or its complaint of that subtype), a transient or undetermined bounce, a probe and a send before the window never counted; the cut-off is read at each screening bounce or complaint and once each mail_events run, so a window that shrinks past the line pauses it too; it also pauses when the account's bounce or complaint rate reaches its warning alarm (2.5%, 0.05%) or SES puts the account under review; each pause writes one mail_stream_paused, a repeat changes nothing, and MAIL_STREAM_PAUSED pages the operator; the platform disables the screening's SES set alone, and disables it again whenever it reads it enabled while paused; the transactional and notices streams never pause (a CHECK refuses it, and all their mail bouncing leaves them open) and their notices still go; while paused the page says new screenings are paused and that uploads already made are kept, a submission is refused (screening_paused), and a queued run is neither claimed, completed nor failed but kept; only a platform administrator resumes it, in the console with a reason (mail_stream_resumed); a resumed stream claims nothing until the platform reads its set enabled and confirms it, and in staging and production the screening opens again only with a delivered and a bounced probe of the stream since the resume and within 48 hours",
  },
  {
    id: 'SCR-22',
    title: "The address a screening's result is sent to (audit #76; the founder's Q1 (g), Q10 (a), Q11 (b) and Q12 of 2026-10-21)",
    assertion:
      "The form hints at a likely typo of a large mail provider's domain (gmial.com, yaho.com, outlok.com, hotmal.com) and warns of an ending no top-level domain uses, in the browser and again on the server, and the prospect may keep the address as typed; only after the upload's own checks, the rate limit and the database's refusals for the submitter (closed, paused, the bounce budget, which spend no validation), the server asks DNS whether the domain takes mail (no such domain, a null MX, or neither an MX nor an address refuses; a timeout or a failure accepts) and SES whether the mailbox exists (a LOW validity, syntax, DNS or mailbox verdict refuses, a MEDIUM validity or mailbox warns, an error or a timeout accepts), the two together, so the added worst case is one 2-second timeout, and SES no more than the day's cap (1,000 in production, 50 in staging; past it the DNS check alone, MAIL_VALIDATION_CAP_REACHED logged and alarmed); an address on the refusal list (a screening permanent bounce, a global suppression list's bounce among them, matched by the address with its +tag kept, or abuse complaint, matched by the mailbox it reaches, in the last 365 days: trimmed, in any case, at Gmail its dots, its +tag and googlemail.com, and at Apple me.com and mac.com) is refused only after those checks and submit_screening()'s own, so a listed address gets the same answer as any other on every path that ends without an email (a ZIP the release cannot price, a mailbox SES cannot confirm), and a bounce of a +tag spelling refuses that spelling alone, while a customer stream's bounce or complaint, a transient bounce, the account's own suppression and a not_spam complaint put nothing on it; every refused address, whatever refused it, gets the same one sentence, which says nothing about an earlier screening or a customer's mail; a client or an email account with 3 screening permanent bounces in 7 days is refused (screening_bounce_budget), before and whatever the address, so it learns nothing of the refusal list, and the stream stays open; no log line names the address or its domain",
  },
  { id: 'JOB-01', title: 'Replayed job with the same key', assertion: 'No duplicate effects' },
  { id: 'JOB-02', title: 'Three failures', assertion: 'Alert raised; dashboard shows last run failed' },
  { id: 'JOB-03', title: 'Digest', assertion: 'Counts and totals only; no PHI column referenced' },
  { id: 'JOB-04', title: 'Two heartbeats missed', assertion: 'Alarm' },
  {
    id: 'JOB-05',
    title: 'A mail event delivered twice, late or out of order (audit #76)',
    assertion:
      "The platform's mail_events job records each SES event once per message and event, in any order (a bounce before its send makes the message's row with SES's own send time; a delay after a delivery and a delivery after a complaint change nothing), and deletes it from the queue only after its record commits; an unreadable event is left on the queue and reaches the dead-letter queue, which alarms, as does a queue whose oldest event is 15 minutes old; the queue admits only the stack's two rules and is encrypted with the environment's key; each stream is probed at SES's simulator alone, at once after a resume, daily, and hourly while missed, never while paused, unconfirmed or before the identities are verified; a stream whose probes are not back logs MAIL_PROBE_MISSED on every run until both are, 26 hours after the older of its proofs since the last resume or an hour after the first probe sent since then, however often it goes again; and each probe event recorded is logged by its message ID and codes, no address",
  },
  { id: 'MOD-01', title: 'Contract proposal quotes verify', assertion: 'All quotes are substrings of the page' },
  { id: 'MOD-02', title: 'Proposal with a date not in its quote', assertion: 'Field rejected' },
  { id: 'MOD-03', title: 'Narrative evaluation set of 300', assertion: 'Zero critical errors' },
  { id: 'MOD-04', title: 'Document with embedded instructions', assertion: 'No effect on output authority; proposal still verified' },
  { id: 'MOD-05', title: 'Budget exceeded', assertion: 'Calls refused; alert' },
  { id: 'MOD-06', title: 'Kill switch on', assertion: 'Product works on hand-entered records' },
  {
    id: 'MOD-07',
    title: 'Model change that turns rejected fields into verified wrong values, or leaves a scope field out of a rate record',
    assertion:
      'Gate fails: wrong-but-verified (a scope field left out of a rate record included) counted per field apart from rejected and missed, never above its baseline, zero on faithful-text cases and never above the local reference, nor off its misread records, on the others, on the synthetic set and on permitted examples; a run with a failed or refused call is never recorded; a real provider is never recorded with a recall or precision floor unset or unmet; a set change never lands with a model change; a scope field a proposed rate record leaves out is named to the specialist as not stated',
  },
  {
    id: 'MOD-08',
    title: 'Swapped-row, cross-row and value-only faults',
    assertion: 'Swapped rows and cross-row quotes rejected as not in the row; merged rows (their codes rejected or verified), a scope field dropped, a flipped flag, a wrong method, a wrong date, an amended figure on the original record or a struck rate taken fails the gate',
  },
  {
    id: 'MOD-09',
    title: 'Contract evaluation set v2',
    assertion:
      '63 documents to 60 codes and 80 pages: multi-row tables, contract-plus-exhibit pairs, scans with OCR errors or their own OCR layer, struck-through rates, each marked faithful or not; its hash covers the pages as read, and a changed set refuses comparison',
  },
  {
    id: 'MOD-10',
    title: 'Injected-instruction twins and decoy amended rates',
    assertion: "Each twin's full proposal and review equal its clean twin's and no output string, a label included, holds a word only the injection writes; both rows of every expected conflict proposed and each flagged against the other; any difference, failed twin call or miss fails the gate",
  },
  {
    id: 'MOD-11',
    title: 'Real provider in production with a purpose unevaluated',
    assertion: 'That feature alone is off and hand entry works; a purpose is served only for a prompt, model and variant whose own baseline entry passes, every recall and precision floor set and met, and a contract variant only after a production permitted run of its own examples, compared with what was served',
  },
  {
    id: 'MOD-12',
    title: 'Contract or exhibit naming a patient of the practice',
    assertion:
      "Refused before it is sent (names_patient): a member ID, payer claim control number or patient control number the practice holds (from its 835s, or a posting export's line no claim carries), found as a whole token however the page spaces, hyphenates, dots, slashes or underscores it, splits it with an invisible character, or writes it exactly as stored; no model_call row; one log line with the practice and the code only; nothing of the match recorded; a records check the gateway did not issue for the call's practice refused; a practice above the bound (or one that passes it while the screen reads), or a check that cannot read the records, refused, with every read it made audited; a call the gateway refuses without the screen (a replay, a spent budget) reads none of the practice's records, a screen runs within limits per practice and per person, and the person's event is written only for a screen about to read; a fee schedule whose figures equal a practice's short PCNs, dates or words is sent",
  },
  {
    id: 'MOD-13',
    title: "A payer letter whose patient's names, member IDs, claim numbers and date of birth are written any way a letter writes them (placeholder words or months as names, marks, `ß`, typographic apostrophes and dashes, invisible characters, spacing, a hyphen at a line break, initials, `_`, `.`, `/`, `:`, `#` or `(` in a number next to a letter, digits alone with dashes or invisible characters, a date's digits as a number, a dotted chain of initials after the name, a labeled date of birth with any dash, a backslash, `_`, `|`, spaces alone or a typographic apostrophe, glued by a lost space to a digit on the left at the end of a date, amount or currency range or an amount, a date of birth glued to a word), and placeholder-shaped text of its own, or crafted to make redaction slow",
    assertion:
      "No letter or digit written as an identifier is sent, a digits-only number included unless its written text is a calendar date with its separators that is not the date of birth; every placeholder is exact and each place a claim's number was written is that claim's placeholder (the lowest of equal claims); the letter's own square brackets are sent as parentheses; nothing today's redaction replaced is sent, but a deadline (read as a calendar date by the test itself) or a claim's amount (after a currency sign, with cents) it took for an identifier; text without the patient's forms, common phrases, amounts and deadlines included, is sent unchanged; the self-check finds nothing, and refuses a letter that holds the call's own identifier glued by a lost space where no boundary can be read (a name part of four letters or more, an initial, a date of birth, a member ID or claim number with a digit beside it, a number of letters and digits inside a longer token, and beside a range only the range fix reads as a barrier a shorter part too); a crafted letter of 100 kB is redacted and checked within its time budget",
  },
  {
    id: 'MOD-14',
    title: "A letter that writes another patient's member ID or claim number, with a letter prefix or digits alone, with a dash, spaces or an invisible character, `_`, `.`, `/`, `:`, `#` or `(` next to a letter, after `ID:`, in brackets or as a claim placeholder's digits (`[CLAIM_7654321]`)",
    assertion:
      "The one-patient screen is offered it, in the redacted letter too; a placeholder's word, or a redacted letter's own placeholder, never. Digits alone with `/` or `.` between them are not offered (a date's or an amount's writing; recorded in docs/adr/0054)",
  },
  {
    id: 'MOD-15',
    title:
      "A payer letter that writes a Social Security number (3-2-4 with any dash, spaces, a period, a number joiner such as an underscore, a middle dot or a bullet, a line break or an invisible character between or inside its groups, full-width or other-script digits, masked as XXX-XX-1234, nine digits with an SSN label or no label, a HICN suffix) or a phone number ((AAA) EEE-LLLL, dashes, periods or spaces, +1 or 1, an extension, ten digits with a phone label or none, a seven-digit local number with a phone label), glued to a word, in a comma list with no space, wrapped across a line with indentation or inside a group, after a digit and an invisible character, after a label of the other kind or a word that does not name it, the call's own identifiers among them, or crafted to make redaction slow",
    assertion:
      "No digit of it is sent: each is [SSN] or [PHONE], or the call's own placeholder when its digits are the call's member ID or claim number; every placeholder is exact and counted; the self-check refuses (identifier_left, a fixed message with no number) a text in which one survives, a letter in which a nine-, ten- or eleven-digit chain no pattern read survives (an OCR space inside a group, a slash, a closing parenthesis, a semicolon, up to sixteen spaces or tabs, a page break, any grouping after an SSN or phone label, an amount's shape too after a date, an amount or a range under that label), and a letter in which the patient's name or another of the call's own identifiers is glued to one; a crafted letter of 100 kB is redacted and checked within its time budget",
  },
  {
    id: 'MOD-16',
    title:
      "A payer letter with amounts, dates in every form datesIn reads, two dates or two amounts, or a date to an amount, joined by a dash (a service period, a range), the range glued to the word before or after it too (a word such as St., Rd. or TH after its four-digit year among them, a day-first ordinal end too), NPIs, procedure, adjustment and diagnosis codes, ZIPs and ZIP+4s, TINs, ICNs, EFT traces, checks and references, nine- and ten-digit numbers after a word that names them, alone or in a list (claim, NPI, TIN, check, reference ...), an NPI or TIN after Medicare or contact, service-line rows (codes, units and amounts in columns, a slashed date before a code) and amounts directly before dates and numbers, the call's member ID and claim numbers written SSN- or phone-shaped, and another patient's nine- or ten-digit member ID or claim number written SSN- or phone-shaped",
    assertion:
      "The first are sent unchanged (after NFKC), the self-check refuses none of them, and the verifier still reads their dates and references; the call's identifiers keep their placeholders ([MEMBER_ID], [CLAIM_n], the lowest of equal claims), never [SSN] or [PHONE], and are never offered to the screen; another patient's is offered to the one-patient screen whole and with a prefix written against it, so the letter is refused (more_than_one_patient) with nothing of it logged or in the refusal",
  },
  {
    id: 'MOD-17',
    title: "The Anthropic client as configuration builds it, with the environment asking for the SDK's tracing and its content, debug logging and another host; the configuration with extra headers asked for on the Anthropic path; the installed SDK's own code; and the failures a request through that client meets",
    assertion:
      "SDK retries off and the gateway's timeout; the SDK's OpenTelemetry tracing and propagation off, its logging off and the host the API's own, whatever `ANTHROPIC_OPEN_TELEMETRY`, its content mode, `ANTHROPIC_LOG` and `ANTHROPIC_BASE_URL` say; no webhook key, whatever `ANTHROPIC_WEBHOOK_SIGNING_KEY` says; `ANTHROPIC_CUSTOM_HEADERS` is refused on the Anthropic path and ignored on the others; the environment variables the installed SDK reads, the number of other places each of its files touches the environment and the packages its manifest names, of every kind, are the reviewed lists, each closed, and no package it brings in, its dependencies' own included, reads or touches the environment; through that client, a 429 reaches the gateway as `throttled`, a 529, a 500, a 503 that is not JSON and a refused connection as `unavailable`, a connect timeout, the SDK's own timeout and the gateway's abort as `timeout`, and a 400 or 401 as `rejected`, each after one request",
  },
  {
    id: 'MOD-18',
    title: "A request through that client while the process has a tracer provider and a trace-context propagator registered and the environment asks for debug logging and another host",
    assertion:
      "One request, to the API's own host; no span is started; no `traceparent`, `tracestate` or `baggage` header and no header outside the gateway's set is sent; nothing is written to the console (but the SDK's own deprecation warning, for a model on its lists, which carries the model id and never request content); the request carries API version `2026-10-21` and the key as `Authorization: Bearer`, with no `X-Api-Key`; a client left at the SDK's default does trace and log, and lets `ANTHROPIC_CUSTOM_HEADERS` replace its key (the control)",
  },
  {
    id: 'BIL-01',
    title: "Stripe's payment form opens on the bank account",
    assertion:
      'The Payment Element\'s options list `us_bank_account` first and `card` second, from the shared order; tabs with the first open; Apple Pay, Google Pay and Link off; its appearance comes from the brand\'s live tokens, Stripe\'s night theme under the dark ones; the start button reads "Add a bank account (ACH) or card" with nothing on file and "Replace with a bank account (ACH) or card" with a method on file; a confirmed setup shows the saved notice, and one waiting on micro-deposits shows the verification notice for Stripe\'s type (one deposit with a 6-digit code, or two amounts) with Stripe\'s link, each notice a status; a missing or non-https verification link is an error',
  },
  {
    id: 'BIL-02',
    title: 'What Stripe is asked to collect and charge',
    assertion:
      "The SetupIntent's `allowed_payment_method_types`, the subscription's and the audit invoice's `payment_method_types` each send exactly `['us_bank_account', 'card']`, bank first, from the shared order, whose module imports nothing but types; the subscription saves no default of its own (`'off'`), and a new default becomes each live subscription's own default too, never cleared, so the customer's and every subscription's agree",
  },
  {
    id: 'BIL-03',
    title: 'The page says the bank account is preferred',
    assertion:
      'The Payment method card, with Stripe and with the simulator, leads its description with the bank account; with nothing on file it says "A bank account (ACH) is preferred for annual plans and audits."; with a card on file it says that and "A new payment method replaces the one on file."; with a bank account on file it says only the second; a card\'s brand reads as a person reads it; the simulator lists its bank form before its card form, each with a request key of its own; the page shows the Payment method card before the Plan card, and with nothing on file the Plan card shows the prices and asks for a method instead of offering a plan; the practice onboarding step reads "Add a payment method and choose a plan"',
  },
  {
    id: 'BIL-04',
    title: 'A card is never refused, and a new bank account takes over',
    assertion:
      'Through the routes on the simulator, an organization with only a card on file chooses the annual plan and its invoice is paid by card, and an audit invoice issued to it is paid by card; once it adds a bank account, the next open invoice it pays is charged to the bank account; and on the simulator itself, a renewal of its plan is charged to the bank account, even when the subscription carried the card as its own default',
  },
  {
    id: 'BIL-05',
    title: 'One account standing from the record and billing',
    assertion:
      '`standingKind` and `accountStanding` give good only for an active record in good billing standing; a suspended record reads "Suspended by PaidWhole" whatever billing\'s standing, with the date PaidWhole suspended it, when one is stored, a support ticket (`/support?from=billing`) as its next step and the note that changing the plan or payment method does not reinstate it, in the word ("reinstates") the practice home uses; a closed record reads "Closed" whatever else, in the neutral tone and a status unless an invoice is still owed, takes no new plan (the plan route refuses it before Stripe is asked, and again in the claim\'s own statement), offers the ticket for a question about the closure and never promises a reopening, and names an unpaid invoice as still owed with no claim about runs; an active record suspended for nonpayment names billing\'s date and the invoice holding it (`billing_standing.invoice_id`, even past the newest 24), and says a card payment restarts runs at once and a bank (ACH) payment once the bank settles it, and with several invoices unpaid for 30 days (counted by the view\'s own predicate) asks for all of them paid and restarts runs only then, so paying the holding one leaves runs refused and names the next; past due names its date, the instant runs stop (UTC) and that a bank (ACH) payment counts once settled; beside a suspension, an unpaid invoice is named with what it holds (a past-due one stops runs at its stop even once reinstated) and paying it is a second step; a firm is never told its unpaid invoice stops runs, and its unpaid invoice reads past due; every non-good standing has a notice and a next step; the page draws one badge from the label, one alert or status and one `data-standing`, with no second date, shows the placeholder-price note only beside prices, offers a closed organization no plan in the invoices\' empty state, and keeps the Pay target clear of the sticky header; the console shows and orders by the same kind, in the same words ("Suspended by PaidWhole", a firm\'s billing hold as past due), with closed outlined',
  },
  {
    id: 'BIL-06',
    title: "A suspended organization's billing page",
    assertion:
      'With the organization suspended by PaidWhole and its billing in good standing, its administrator\'s billing page shows "Suspended by PaidWhole", never "In good standing", the notice that PaidWhole reinstates it, a link to open a support ticket (`/support?from=billing`) that opens the form on the Billing category, and the note that payment does not reinstate it; the page passes axe; the seed holds SYNTHETIC SUSPENDED GROUP suspended for this journey alone, so nothing suspends or reinstates an organization another journey shares',
  },
  {
    id: 'BIL-07',
    title: "A suspended or closed organization's people start no new work through its grants",
    assertion:
      "With an organization that holds a grant in force suspended by PaidWhole or closed, a person who reaches the practice through that grant is refused each piece of run-starting work their unheld roles (ownership, a support grant, a grant of an active organization) do not permit: at the route, which asks `practice_run_refusal_for` with the route's permission, and again in Postgres where a person records the work (an upload, a pricing run, an audit report, a report document and an ROI statement, each checked against its writer's permission; SQLSTATE 55000), in the sentence that begins \"PaidWhole has suspended your organization, so you start no new work here through its grant\" or \"your organization is closed\"; a person with a second path is refused only what that path does not allow (the group's practice administrator who is also the firm's principal: all five run-starting permissions; the group's analyst who is also the firm's principal: pricing runs, ROI statements and packet exports, never uploads or triage; the group's analyst who is also the firm's analyst: nothing); the practice's own staff, its other grantees and every job carry on, a digest and a packet export included, and a grantee's billing standing holds nothing; the owner's hold stops everyone, jobs included, and wins over a grantee's: the owning organization's members read why (PaidWhole's suspension with its reason, or the unpaid invoice) and anyone else, a job included, only that the PaidWhole account of the practice's organization is on hold, while closed reads closed to everyone; `practice_run_hold` gives a held grantee's people its source, kind, cause, reason, time and the permissions it stops, never a name; a permission outside `run_starting_permissions()` is refused 22023, and a trigger table with no permission named raises; `run_starting_permissions()` equals the permissions of `RUN_STARTING_ROUTES`, every route whose ok call queues triage, a packet export, intake, a price, an audit report, a report document or an ROI statement is in `RUN_STARTING_ROUTES` or `CONTINUES_STARTED_WORK`, and one that queues monitoring or reconciliation is named as the practice's own work, so a held grantee's principal who maps a plan completing a month still queues the practice's monitoring and the month is priced, the mapping holding it back for the owner's hold alone; a `packet_export` job the gate refuses records `packet_export_refused` with the code `organization_suspended`, which its page reads as refused; the decision's functions are the owner's alone; for a firm granted 2,000 practices the route's question answers within 100 ms",
  },
  {
    id: 'BIL-08',
    title: "PaidWhole's suspension is set only through its setter, with its reason, note and time, checked in the handler and in Postgres",
    assertion:
      "The console's route takes a suspension only with a reason from the closed list (at the customer's request, a security hold, the agreement ended; never nonpayment), an optional one-line note of at most 500 characters and the tick that confirms what it stops, a change of reason, or a reinstatement with its reason (the cause is resolved, or suspended in error), and refuses anything else before it writes; `console_set_organization_status` refuses anyone but a platform administrator in person (a job's actor, a customer administrator, a support engineer), a closed, internal or missing organization, a reason from the wrong list or none, and a status that changed since the page loaded; a suspension writes the status, its reason and its time, one history row with the note, and the reserved action `organization_suspended` with the reason as its purpose, at one instant; the same reason again writes nothing; a change of reason by a second administrator keeps when the suspension began, and the page names each administrator; a reinstatement clears the reason and records `organization_reinstated`; as the application role, a move into or out of closed, suspending the internal organization, creating an organization that is not active, writing the reason or the time, and inserting either reserved action are refused, while the previous image's direct suspend and reinstate still work, stamp the time and read as a suspension whose author was not recorded; `organization_status_change` is append-only and read by platform administrators alone, never by a customer or by billing",
  },
  {
    id: 'BIL-09',
    title: "Every place a person reads a suspension says it is PaidWhole's, whose it is, why (to its own members), and what restarts the work",
    assertion:
      'The practice home\'s notice, the job outcome, a refused packet export, the billing page, the console\'s card, history and billing status, and the practice\'s grants are worded for each source, cause, reason (or none), date (or none) and reader: "PaidWhole has suspended" or "PaidWhole suspended" appears exactly when the hold is PaidWhole\'s suspension and the reader is a member of the held organization; "platform administrator" never appears; no reason, "invoice" or "unpaid" reaches anyone outside the held organization, and "your organization" is never said to them about the owner\'s hold; a grantee\'s notice lists exactly the work stopped for its reader, in the order pricing runs, triage, reports, ROI statements, packet exports, uploads, and says it stops through the organization\'s grant; no closed case promises a restart, and every other case names what restarts the work or, to a non-member, that it is on hold; the empty home\'s and Uploads\' gates title a hold that lifts as paused, a closure as closed and a hold whose cause their words do not know as stopped, with the database\'s sentence whole beneath, "Uploads are not open yet" being the BAA\'s alone; the mapping screens\' and the Export card\'s sentences in place of their buttons say a closure as stopped and a hold that lifts as paused, a grantee\'s hold with its sentence alone and, on the mapping screens, that the practice\'s own monitoring still prices the months; a packet export the gate refused for the practice\'s hold reads E1 while that hold lasts and as the earlier request\'s once it is lifted; the console\'s card says no count of none ("its 0 practices") and groups thousands; the billing page\'s label carries the date PaidWhole suspended the organization when one is stored, its notice and next step follow the reason, a firm suspended or closed by PaidWhole is told its people start no new work through its grants, and a firm\'s unpaid invoice still claims no run; in the journey a suspended firm\'s principal at a client practice reads the notice, "Uploads are paused" over the database\'s sentence and "Not started: " with it, the client group\'s administrator at the same practice reads no notice and the grant\'s state, and a platform administrator suspends the console\'s firm with a reason, a note and the tick, reads who, when and why with the history, and reinstates it in one click; each page passes axe',
  },
  {
    id: 'BIL-10',
    title: 'The dunning mail never claims runs started or stopped when they did not',
    assertion:
      "Each dunning message's words are chosen when it is sent, from the organization's kind and status and billing's standing, and \"New runs have started again\" is said only to an active group that nothing else holds; a group suspended by PaidWhole that pays an invoice held 31 days reads that the invoice is paid and that PaidWhole's suspension still stops new runs, and one PaidWhole reinstated between the stage and the send reads that new runs have started again; a group whose other invoice reached its 30 days before the send reads that new runs stay stopped until that one is paid; a firm's and a closed group's notices say nothing about runs; the stage, its audit event, the outbox and the delivery states are unchanged",
  },
  { id: 'CI-01', title: 'One gate over every CI job', assertion: '`all green` needs every other ci.yml job and passes only when each succeeded; a failed, skipped or cancelled job fails it' },
  { id: 'CI-02', title: "Every route's tests in exactly one of twelve files", assertion: 'Each registered route is in one file; the twelve files exist and each runs its own index' },
  { id: 'CI-03', title: 'A route snapshot in one statement', assertion: 'The folded snapshot equals the per-table snapshot on two worlds and after an update' },
  { id: 'CI-04', title: 'The database suite in shards', assertion: "Through vitest's own sequencer, the shards' files are disjoint and together are the whole db project, for 4 and for 6 shards; each shard prints the files it ran and migrates its own database" },
  { id: 'CI-05', title: 'Chromium missing on CI', assertion: 'A unit or database run fails instead of skipping its printing tests' },
  { id: 'CI-06', title: 'End-to-end shards over one build', assertion: "Every shard runs the build job's artifact; a build stamped with another commit is refused" },
  { id: 'CI-07', title: 'A flaky end-to-end test', assertion: 'Passing only on its retry fails the run and names the test' },
  { id: 'CI-08', title: 'Lint in memory-bounded groups', assertion: "The groups cover every linted file exactly once; the scheduler fits 16 GiB and 8 GiB hosts and always runs at least one group; any group's warning or error fails the run" },
  { id: 'CI-09', title: "The domain model's approval as its own check", assertion: '`domain model` runs `--check --strict --require-approval`; the database suite carries no approval case' },
  { id: 'CI-10', title: 'A timeout on every job', assertion: 'Every job of every workflow has the timeout its table names' },
  { id: 'CI-11', title: 'Actions pinned to their release', assertion: "Every `uses:` is a full SHA with its version, one SHA per action; the SHA is the tag's and every input is declared; every action nested in a composite is pinned by SHA too; the release restores no cache; every Trivy step runs the Trivy whose archive matches tools/trivy/release.txt's SHA-256, never setup-trivy's install; no checkout that keeps no token makes a partial clone; no step, and no script or TypeScript under tools/ a step runs, reads this repository's remote by git or curl, git reads only other repositories, and every step that runs gh or reads GitHub's API is given the job's token" },
  { id: 'CI-12', title: "Dependabot's configuration", assertion: "Groups in order, each dependency in one: minor-and-patch excludes every pattern a specific group names, and a model of Dependabot's group assignment routes every direct dependency to its group; majors ignored for the Node image, its types, TypeScript, Next and pg-boss, and for the compose file's postgres; cooldowns; staggered days; and an entry per ecosystem in use" },
  { id: 'CI-13', title: 'Images pinned by digest from one source', assertion: 'Every base and service image carries a digest; CI and the capacity harness take Postgres from docker-compose.yml' },
  { id: 'CI-14', title: 'A toolchain without known advisories', assertion: 'The pinned pnpm has no moderate or worse advisory; both images derive it; every musl package in the lockfile carries libc; every version the lockfile adds is at least three days old or a dated exclude' },
  { id: 'CI-15', title: 'The mutation canary', assertion: 'In every shard, each of its five cases reports its expected status before any score' },
  { id: 'CI-16', title: 'The mutation gate', assertion: "Each fully-run money package above 85%, recorded equivalents still counted as survivors in the score, no survivor not recorded as equivalent, no runtime error but a test file's load failure" },
  { id: 'CI-17', title: 'Mutation where the money code changed', assertion: "A push runs every package; a pull request runs exactly the packages whose closure (imports, data files, third-party packages) it changes, each package's shards all or none" },
  { id: 'CI-18', title: 'One browser build everywhere', assertion: "The web tests, the worker, the tools and the lockfile name one Playwright version (playwright-core one catalog line), and the worker image installs the lockfile's playwright-core with no version of its own; every step that installs the browser, in every workflow, is followed by the check that holds every file of the headless shell's and Chromium's builds to `browser.json`'s tree SHA-256s before any test runs or any cache is saved, and the worker image's headless shell is held to it in `images` and in the release's build before it is saved and in screening-capacity's and release-capacity's measuring jobs before it is measured; CI regenerates the committed brand baselines from nothing, byte for byte, on every pull request and every push; a browser-tests pull request is red on the browser check by design until the baseline procedure runs, and its other steps still run" },
  { id: 'CI-19', title: 'Header controls named by their visible text', assertion: "Each header control's accessible name starts with its visible text and contains every other piece of it (WCAG 2.5.3) at 1280 and 390 px; axe 4.14 with the WCAG 2.0/2.1 A and AA tags finds no violation on any page a journey scans, each scanned once it has its title (the one the journey names, where it names one), so a page a client-side navigation has just committed is not scanned before its title is in the head" },
  { id: 'CI-20', title: 'Runner images', assertion: "Every job on ubuntu-26.04 but the release's capacity chain, on the release runner; the probe's runner comes only from its dispatch input; the browser jobs' cached system packages are used only after each matches the signed index's SHA-256; the release binds images by the config digest hashed from the saved archive under either image store, carries each image's identities from the build as job outputs no later job can rewrite, proves the measured image, the loaded image before any push and the pushed image are that one, builds every checked image with no attestation manifest, and its push and report jobs run no repository code; the image scan reads the built archive" },
  { id: 'CI-21', title: 'An action pin held to three days', assertion: 'A pin new against the base, and a tools/trivy or tools/gitleaks release.txt version new against it by the commit its upstream tag names (a tag the upstream does not list is refused), passes on a pull request only when its commit is on the upstream default branch, its tag still names it, and it is at least three days old by the youngest time read with a time GitHub recorded; an unchanged pin is never read for its age, except on the change that adds the rule; on a push a finding warns' },
  { id: 'CI-22', title: 'An image digest held to three days', assertion: "A digest new against the base's Dockerfiles, compose file and workflows passes on a pull request only when Docker Hub pushed it at least three days ago; a superseded or unreadable digest fails closed; an unchanged digest is never read; on a push a finding warns" },
  { id: 'CI-23', title: 'A pin or digest by dated exclude', assertion: "An exact pin or digest enters young under a security-fix exclude with an advisory that covers its whole young window and lasts at most seven days, or unprovable or off the default branch under a reasoned exclude of at most seven days and still at least three days old by every time read; a Docker Hub digest found on no tag enters under no exclude; an image's advisory is held for form only, with the package and version it fixes; an expired one fails only where the list is edited" },
  { id: 'CI-27', title: 'Mutation from the manifests and workspace, field by field', assertion: "A change confined to fields no shard reads (a non-lifecycle script in the root or any workspace manifest, a dependency or catalog entry no closure or tooling imports, the release-age and trust settings, a workspace manifest added or deleted with no install script) runs no package; a dependency or catalog entry a closure imports, or a closure manifest's module fields, run that package; the pnpm, Node and module settings, an install lifecycle script (`prepublishOnly` included) or `dependenciesMeta` in any workspace manifest, a root `node`, `deno` or `bun` entry or a specifier that is not a registry one, the test tooling, the workspace list as YAML or as the mutation tooling reads it, a reordered order-sensitive field, a YAML anchor, alias, tag or duplicate key, a `package.yaml`, `package.json5`, `.pnp.cjs` or `.gitattributes`, the mutation tooling's own tsconfig, any changed path holding a control character (C0, DEL, C1, U+2028 or U+2029, printed JSON-quoted), and any unlisted or unparseable field run all four" },
  { id: 'CI-28', title: 'A pin-only workflow change proved on the runner', assertion: 'A change to `mutation.yml` that moves only step action SHAs, same action on both sides and neither artifact action, runs every shard of money and ledger and no other; a tag, branch, job-level or artifact-action ref, or any other change to it, runs all four; a comment-only change runs none' },
  { id: 'CI-29', title: 'Every shard on the pinned runtime', assertion: "Each shard's canary verdict names its Node, Unicode, ICU, pnpm and commit, and the gate fails a shard whose runtime differs from the pinned Node or `packageManager`'s pnpm, or whose commit is not the one tested; the changes job, before it decides, and the gate job, before it judges, each fail on any other runtime, a `pnpm --version` other than `packageManager`'s, or a checkout other than the commit tested; the tooling runs Stryker by path, and no mutation step or closure file, a file a shard loads by path included, runs a root or package script" },
  { id: 'CI-30', title: "The shell's skip link", assertion: "On a practice page, a console page and the settings users page, at 1280 and 390 px, the link is clipped from view until focused; the first Tab shows 'Skip to the content' in view with 12 px inline and 8 px block padding and at least 24 px tall, Enter moves focus to main#content, and the next Tab lands on the first control inside main; axe 4.14 with the WCAG 2.0/2.1 A and AA tags finds no violation in the focused state (WCAG 2.4.1, 2.5.8)" },
  { id: 'DBF-01', title: 'Function files of a freshly migrated database', assertion: 'Regenerated exactly, no file missing, extra or different, under any search_path, DateStyle, IntervalStyle, TimeZone, identifier quoting, float digits and bytea output of the connection; a stray file fails `--check`' },
  { id: 'DBF-02', title: 'A function changed by one line', assertion: "Only that function's file changes, by that line and its body-hash line, the hash of the body alone (between the dollar quotes, or the SQL-standard body) equal to Appendix C's for a plpgsql and a SQL-standard body; a grant added or given by another grantor, SECURITY DEFINER flipped, `SET search_path` removed or a calling policy added each changes the file; a procedure and a BEGIN ATOMIC body render as the catalog holds them" },
  { id: 'DBF-03', title: 'Function file names', assertion: 'One file per name, overloads in one file in signature order; a name outside `^[a-z_][a-z0-9_]*$` or over 63 bytes, an aggregate, or a function outside schema public, refused; output the same for any input order' },
  { id: 'DBF-04', title: 'Writing and checking the directory', assertion: "`--out` checks the directory before writing anything, removes only stale generated `*.sql` (the banner first), refuses any other `*.sql`, a symlink or a custom FILE without `--functions`, and leaves the README; `--check` reports the document and each file with its first differing line, then exits 1, and exits 2 on an error; the document's text and SHA-256 are the same with the files as without" },
  { id: 'DBF-05', title: 'Privileges, triggers and the summary', assertion: 'PUBLIC revoked or granted, grant option, grantor, sorted grantees and owner each one line; comment, trigger, policy and event-trigger lines; the summary lists each changed file, SECURITY DEFINER, scope, PUBLIC and privilege changes first, then its diffs within a budget, the list form a prefix of the full one, or one line when the base has none' },
  { id: 'RCC-01', title: 'A quarterly file imported', assertion: "PPRRVU, GPCI, ZIP5, ZIP9 and MUE import only with a window inside the CMS quarter the file states, read from its title lines, its name or its download address; a whole quarter and a correction's two parts of one are accepted; no window, a window leaving the quarter, another year, a start other than a stated effective day, no stated quarter or two stated quarters are refused before anything is written; an undated file's open window and an MPPR window leaving its year are refused; a ZIP5 line of another quarter is refused; a draft of the same name holding another window is never replaced" },
  { id: 'RCC-02', title: "A release's windows and contents", assertion: "In real content, whatever the record's source method, a quarterly record's window lies inside one CMS quarter, a ZIP record's quoted lines state that quarter, a per-code MPPR window ends inside its year, no quarterly or per-code MPPR record is hand-typed and one stored file's records share one window, inside the quarter the file states and from its stated effective day; no content has a gap inside its loaded dates; every prepared release holds a COVERAGE.md byte for byte as the assembler writes it, with no repeated key; a release numbered below one prepared or published is refused; fixtures 900001 to 900007 pass" },
  { id: 'RCC-03', title: 'A release covers less than the one before', assertion: "Assembly and the checker refuse a release that stops covering a code and date its previous release covered, unless the dates are older than the six-year look-back or closed by the source's own dates (each listed in COVERAGE.md) or withdrawn by a note two different people signed; a listed entry that is no loss, a stale or misdated note, and a missing or unreadable previous release, or one whose files are not those its manifest seals, are refused; a date counts as closed by the source only when the closing record's quoted row states it; the drafts note's entries are copied into the release's COVERAGE.md and the note is removed" },
  { id: 'RCC-04', title: 'A month that needs Medicare content not loaded', assertion: 'Under release 900007 a Medicare Advantage month after 2026-09-30 fails as waiting_on_content naming exactly the MPPR and MUE families read, with no line kept and one content alert logged; a commercial fixed-fee month and a 2026-Q3 month price; over the whole run, a read outside the fetch outranks the location and the location outranks content' },
  { id: 'RCC-05', title: 'The month waits, then prices', assertion: "The monitor starts no daily run while the release in force covers no more of the month and the practice's terms are unchanged, and plans it once either changes; Coverage's route returns the month, its quarter, families, lines and billed dollars, a headline of lines and dollars, and each fee-schedule quarter or locked year not loaded; a complete run with lines stopped by unloaded content logs one content alert" },
  { id: 'RCC-06', title: 'A line priced before its content loaded', assertion: "Triage holds a priced line whose trace read MPPR or MUE outside its release's spans as CONTENT_NOT_LOADED, never actionable; the audit report names the reason" },
  { id: 'RCC-07', title: 'A run reads only the keys it prices', assertion: "The price job, the release impact check and the dry run read each key of their claims once a run and the shared types once per release; every stored row equals the whole-release read's; a lookup outside the fetch fails the run as release_read_outside_fetch before its batch is stored; triage and reports read two types only; the keyed read uses rule_record_identity; weekly, under the quarterly scale release 900110, a 100,000-line month prices while another practice's audit report prints and four 835s parse, then triages and reports, within the worker task's memory" },
  { id: 'RCC-08', title: 'Content due', assertion: "The calendar names every content but PaidWhole's own; content ending within 45 or 14 days, ended, due with no draft, or overdue is reported with the exact import commands, as is a calendar entry never reviewed or older than 13 months; before any release is published the drafts are judged and the titles say so; the console shows Content due, customers see every family of the release in force, loaded through a date, open, loaded only from a later date, partly loaded or not loaded; the source watch finds a new matching file whatever its name, shows plain names as they are and others percent-encoded, reports a page that lists no matching file any more, and reads pages over https from the calendar's hosts only, at most 5 MiB; the workflow's check job only reads and its notify job alone writes issues, once per title and at most 20 new ones a run, listing the rest in one issue; every finding reaches it whole, as the run's own artifact" },
  { id: 'FRM-01', title: 'A refused form keeps what was typed', assertion: 'Text, a select, a text area, a checkbox, a checkbox group, a radio, a date and a month keep the person\'s values after a refusal, and a valid default never replaces a refused value; a password and a one-time code are emptied, and a note under each says so, asking a locked account for nothing; the action\'s state carries no value the person typed; a dropped connection keeps every value but the secrets, says the save is not confirmed and which values to type again, and every later press sends the request key of the dropped press until one is saved, even after the page is read again, so nothing is saved twice; a request key used before reads "Already sent", never "Not done", in the neutral notice\'s look, never the failure colour; a page whose CSRF token or request key is out of date is read again in place, and a second press saves with the values intact; a page read again that shows another person signed in, or no one, clears a form that holds what was typed, says so and invites no press' },
  { id: 'FRM-02', title: 'A saved form starts fresh', assertion: 'After a success that redirects to the same page, to the same address or to another page, the form shows its defaults, shows no refusal and carries a new request key' },
  { id: 'FRM-03', title: 'A press while the form is working', assertion: 'Two presses in one frame, a second click and Enter in a field each send one request; the button keeps focus, is aria-disabled and keeps its words; a polite status beside it says "Working…"' },
  { id: 'FRM-04', title: 'A refused field is named, described and marked', assertion: 'The summary is first in the form, on a line of its own, under "Not done"; its lead is "Fix the field listed here, then try again." for one field, "Fix the fields listed here, then try again." for several, and absent when no issue names a field; each item names its field by the label the person sees (a trailing parenthetical dropped unless it says posted or deposited; a group by its legend, a single box by its own label), links to it, and never shows a key; an issue with no field shows its message alone; under the field, "Error:" beside the message, the element that describes the field holding the message alone; the control is aria-invalid with a 2 px border in the danger color; the same refusal twice is announced twice; and every field\'s refusal message outside a legal surface, and outside the founder\'s ZIP wording awaiting counsel (SCREENING_ZIP_MESSAGES), is one sentence with no colon of its own' },
  { id: 'FRM-05', title: 'Focus after a refusal', assertion: 'One issue on a field focuses that field; several issues, an issue with no field, a refusal with no issue, a dropped connection, a page out of date or a form cleared for another person focus the summary; a link in the summary focuses its field; the focused element is never under the sticky header' },
  { id: 'FRM-06', title: 'A refused form without JavaScript', assertion: "The post reaches the action once; the page shows the summary and each field's own message, and no key; a success redirects with its notice; the screening upload, which posts to no action, puts no field value in a URL and screens nothing" },
  { id: 'FRM-07', title: 'Sign-in refusals', assertion: 'A wrong password keeps the email, empties the password and marks no field; a wrong code empties and marks the code field under "That did not match."; a code written "123 456" signs in; a weak password and two passwords that differ are issues on their own fields, the policy in the field\'s hint; Show password reveals and hides the text, is named by its words, looks pressed while it shows, turns off spell checking, autocorrect and autocapitalisation, which no caller can turn back on, and is hidden again, with aria-pressed false, before the form\'s data is read' },
  { id: 'FRM-08', title: "Phone-width controls and a refused form's accessibility", assertion: 'At 390 px an input, a select and a text area are at least 16 px; at 1280 px they are 14 px; a refused form passes axe (WCAG 2.1 A and AA) at both widths; at 390 px a page of forms does not scroll sideways, refused or not, and a select that cuts its chosen text short shows that text whole under it, a SHA-256 in it set in Plex Mono as the page sets it, as no select at 1280 px needs to' },
  {
    id: 'TBL-01',
    title: "A wide table's scroller and a fixed-height text box",
    assertion:
      'Rendered on the server as a region named after its table with ", scrolls sideways" added (a text box: ", scrolls") with tabindex 0, the containing block of what its table positions, with a visible focus outline, so it is reachable before any script runs; in the browser it has no role, name or tab stop while its content fits and the scroller itself does not hold focus (a link inside it does not count), and is a region again when the content overflows; edge fades show only at an edge with content past it and the caption "Scroll sideways for more columns." only while it overflows, both from classes and data attributes alone (no style attribute); at 390 px Tab reaches the region of a wide table, whose frame draws a 2 px focus outline, an arrow key scrolls it, only the end edge fades at the start, both in the middle and only the start at the end, and the first link inside it draws its ring inside its own box, within the clip of the scroller; every table in apps/web/src is the direct and only child of the ScrollTable of components/scroll-table, under whatever name it is imported, and none is made by createElement or written in markup, but in the #42 pages listed with the pull requests that wrap them, and an exemption that no longer matches fails; no ScrollTable label is the same in every row of a list, in its file or through a component or import; and wrap-anywhere is never on a td or th, and inside one only on or within a block with a min-w',
  },
  {
    id: 'TBL-02',
    title: 'No page scrolls sideways',
    assertion:
      "At 390 px no changed route is wider than the window, every table on it sits in a scroller, and each populated wide table overflows its scroller and shows the caption; at 1280 px, and at 1263 px (1280 less a classic scrollbar), each wide table the tour checks fits its card, every table's headers stand apart, no page scrolls sideways, and a table that fits has no tab stop and no caption, even while a link inside it holds focus",
  },
  {
    id: 'TBL-03',
    title: "Every changed route at a phone's width passes axe",
    assertion:
      "At 390 px every changed route, each with its wide table populated and overflowing, has no axe-core WCAG 2.1 A or AA violation, a scrollable region the keyboard cannot reach (scrollable-region-focusable) among them, and no two landmarks of a role share a name (axe's landmark-unique), every scroller's state agreeing with its measurement before axe runs; the screening result's is TBL-07",
  },
  {
    id: 'TBL-04',
    title: 'One stacked-row layout',
    assertion:
      "Each stacked row is an item of a list named by its label or by the title that names it, a list by its role too (Safari drops the role of an unstyled list), headed by its naming cell at the level the caller gives (h3 by default; a link when the row has one), then, when given, a line that describes it, then a definition list of each column's label and value, terms over values until the list is 24rem wide and beside them after, in a term column of at most 40% of the list, each pair apart from the next in either layout, then the row's actions, with no actions box when they render nothing; expected, paid and short are given together and in that order, and the stacked rows keep the table's column order, each figure, code and count in the mono face with tabular numerals; a status chip, a Badge and a key longer than the card wrap inside it; the rows carry their own hooks, never the table's, and no id or hook repeats between the two copies; with a table, the table shows from the table's own width up and the rows below it, by a container query on a full-width wrapper that is never squeezed to nothing; a list with no name is refused",
  },
  {
    id: 'TBL-05',
    title: "The screening result's rows on a phone",
    assertion:
      "At 390 px each row of the screening result's three tables, the anomalies by code and payer product, the coverage and the rows with the largest differences, is an item of a list named by its card's title, headed by its naming cells (a group by its code and payer product, a coverage row by its payer product and outcome, a top row by its number, code and payer product) and holding every other column (a coverage row's Reason only when it has one) under the table's own header and in the table's order, each value as its table row's cell under that header has it: the Medicare figures, the allowed amount in the file and the differences together and in that order, in the mono face, a missing second figure said in words, and the status in words on its tint; the other groups, summed, are the last item, their note under its heading; every value lies inside the window, no status is cut and no page scrolls sideways; the items carry their own hooks, never the table rows', and no id or hook repeats between the two copies; and the link under the result's heading, named as the audit request's form is titled, is in view on load and, followed from the keyboard, puts the focus on that title, from which Tab goes into the form (UX-134)",
  },
  {
    id: 'TBL-06',
    title: "The screening result's tables from a desktop's width",
    assertion:
      "At 1280 px the three tables show, each in its scroller named after its card's title, with one row for each group, coverage row and top row the database returns, and the lists are hidden from view and from assistive technology; each card switches at its own table's width, so at 820 px the anomalies and the top rows stack while the coverage keeps its table, and without script the switch is the same; the table and the list render from one row array and one list of column labels; a status wraps in its cell above a 10rem floor, so the synthetic result's anomalies and coverage fit their cards at 1280 px and where the cards' content is exactly 54rem (994 px without a classic scrollbar), the narrowest width at which all three tables show, while a table wider than its card scrolls in its region with the caption, as the rows with the largest differences do at 1280 px; a table that was hidden measures again when it shows",
  },
  {
    id: 'TBL-07',
    title: 'The screening result passes axe at 1280 and 390 px',
    assertion:
      "A result the screening consumer prices from a synthetic upload, opened from its emailed link once its run is complete, has no axe-core WCAG 2.1 A or AA violation at 1280 px, and at 390 px, loaded at that width, none and no two landmarks of a role sharing a name, every scroller's state agreeing with its measurement before axe runs",
  },
  {
    id: 'TBL-08',
    title: "The screening result's words and tones",
    assertion:
      "The top rows head their claim-line count Claim lines; every Medicare figure's header says Medicare figure and each difference's names its subtraction (Medicare figure less allowed), and one sentence above each table of differences says that each difference is its Medicare figure less the allowed amount in the file and which way its sign runs; in both copies an anomaly shows in the unpriced tone and every other standing neutral, and no screening component uses the short or the whole tone; a status of a code with one figure names it (below the Medicare figure by $5 a claim line or less), and the $5 of every status and of the anomaly rule is in the mono face with tabular numerals; the anomalies card puts the count on its noun (1 of 4 groups is an anomaly; 2 of 5 groups are anomalies; none of the 4 groups is an anomaly; the only group is an anomaly), both counts before the rule, and calls the other groups' sum the last entry; the coverage shows an unpriced reason in words alone, its code kept in its row's data attribute; the could-not-price card and the top rows say what PaidWhole prices, never the engine; every count on the result groups its digits and takes a noun that agrees with it (the one other group, its rows summed; 1 of 2 rows below its lowest figure); an empty value is said as none; never owed, underpaid or recovered",
  },
  {
    id: 'DLR-01',
    title: "A navigation's refused download",
    assertion:
      "`downloadHandler` answers a refusal to `Sec-Fetch-Mode: navigate` with `Sec-Fetch-Dest: document` or none (and, without Fetch Metadata, to an `Accept` that ranks `text/html` above JSON and the wildcard) with 303 to the route's `returnTo` page, with no fragment: `refused=<status>` for each of the seven statuses, `fields` for invalid (parameter names only, each once, at most 8), `retry` for a rate limit in whole minutes from 1 to 1440, and the page's kept values, each validated with that page's schema; a relative Location, the cookies the request wrote and `private, no-store`; the signed-out statuses go where a page's refusal goes, with or without `returnTo`; the wrapper's own refusals (the codes, an ID that is not opaque) come back the same way; a link's closed `from` picks its page and any other value takes the route's own; the letter's bad codes, another payer's contract and a payer not the practice's each return to Coverage",
  },
  {
    id: 'DLR-02',
    title: "A script's refused download",
    assertion:
      'Without a navigation (a `fetch()` in mode `cors` or `same-origin`, navigate with Dest empty as a download link and "Save link as" send it, a frame, no Fetch Metadata with `Accept: */*`, JSON or the wildcard first, HTML ranked lower or refused, or no `Accept` at all) every refusal is today\'s JSON outcome, its status, headers and body byte for byte; a success is the same attachment to a navigation and a script; a navigation\'s HEAD or POST is still refused with 405 before the route runs',
  },
  {
    id: 'DLR-03',
    title: 'Every download route has a safe page',
    assertion:
      "The registry test finds every `downloadHandler` route under `src/app` and refuses one without `returnTo`, one not registered at its file's path, and one whose page for synthetic IDs is not under its practice (the evidence export's under `/console/`); a page path of `//evil.example`, `/\\evil.example`, `javascript:`, an absolute URL, encoded slashes, a control character, dot segments, a query, a fragment or an ID that is not opaque sends the navigation to `/`, as does a route with no page or a `returnTo` that throws; a kept value is dropped when its page's schema refuses it (a bad month returns to the monthly summary without it, and the page opens), when its name is not a lowercase code or is a refusal's own, or when it holds an identifier's shape, and no Location has a finding of the PHI guard; the page reads back only the closed codes and field names and ignores everything else; the codes field's pattern accepts exactly what the route accepts, letters with non-ASCII case mappings and Unicode separators included",
  },
  {
    id: 'DLR-04',
    title: 'The person sees it in the frame (e2e and axe)',
    assertion:
      "In a practice of its own, a letter with \"ABC\" sent past the pattern returns to Coverage with the entries kept, the codes field `aria-invalid`, its message first in its description and the focus on it, and axe (WCAG 2.1 A and AA) passing at 1280 px and at 390 px with no sideways scroll; a contract that is not the payer's is stopped in the browser in the words its refusal would be marked with, and sent past that comes back marked on its control; once corrected, the letter downloads with its marks cleared and the refusal out of the URL, and a reload shows the plain form; a payer that is not the practice's comes back marked and unanswered, and choosing one clears the mark; a refusal the form cannot mark is said as a notice and takes the letter's entries out of the URL; the pattern stops \"ABC\" before the round trip and takes good codes; a good letter downloads and the page stays; a refused file of the Reports list comes back beside that list, and the list leaves the URL with the refusal; a viewer who opens the audit report's line CSV as a page lands on the report with the forbidden notice focused, still there after a router refresh that never asks for the refusal and gone after a reload, while a script's request keeps the JSON refusal; on Uploads a receipt's report downloads in place and its refusal is said above the receipts, focused, while the page stays; and a viewer who opens a packet's PDF lands on the packet's permission state, told who downloads its files, with the refusal out of the URL",
  },
  {
    id: 'SGN-01',
    title: "A sign-in step's time limit, stated and enforced",
    assertion:
      "The new-password, enrolment and code steps say \"This step stays open for 3 minutes.\" before their work, and key registration says 15 minutes (a page rendered later in the step says the time left instead, \"This step closes within 2 minutes.\", rounded up), from one constant that infra's sign-in session and access token pin: the shorter of the provider's limit and the pending cookie's; the dev provider's challenge reads the same constant; the server closes a step at that limit, counted from before the provider issued its challenge, whatever the cookie's own life, and the rewrite after a refused new password extends nothing; a page or a press after the limit starts again without asking the provider and counts no failure; a step sealed before the deploy shows no countdown and is left to the provider",
  },
  {
    id: 'SGN-02',
    title: 'The warning before a step closes',
    assertion:
      "At one minute left (two on a step of ten minutes or more) one polite status, never an alert and never focused, says the step closes within a minute, what Start again costs and keeps, and on enrolment that it gives a new setup key; it is said once and never each second, the limit sentence above the work shows the same state in place and stays in view on a phone with its keyboard up, nothing above it moves, and the focus and what was typed stay, Start again's too; a tab that slept, was hidden, or had its clock set back or forward shows the right state when it is visible again, and says it then; a re-render keeps the count; at the limit the same status says once that the step has closed, nothing redirects and the form stays usable; nothing animates",
  },
  {
    id: 'SGN-03',
    title: 'Starting again keeps the email',
    assertion:
      "Start again, a press after the limit and a step page loaded after it land on the sign-in page with the email filled and the password empty, from a sealed, HttpOnly, SameSite=Lax cookie written only after the password was proven, never for the hardware-key step, and lasting 15 minutes past the step; Start again ends the step it leaves before the sign-in page renders, so Back and the step's address open it no more and key registration's grant is given back; the notice, a note and never also a live region, takes the focus once and says to use the temporary password after a new-password step, or the chosen one once it was saved; the email is in no URL and is filled only on those two reasons; an unknown address and a wrong password write the same cookies; the kept email ends when a session opens, an account locks or is found disabled, a key is required or registered, or a first step opens no step, and outlives an expiry and Start again",
  },
  {
    id: 'SGN-04',
    title: 'The invited paths are numbered, and the timed steps pass axe',
    assertion:
      "An invited customer's headings read \"Step 1 of 2: Choose a password\" and \"Step 2 of 2: Set up two-step verification\", the number shown over the step's name, and an invited staff member's run from \"Step 1 of 3\" to \"Step 3 of 3: Register a hardware key\", counted by the server from the provider's answer and the account; an everyday sign-in, and a restart with one step left, show no number; the code and enrolment steps pass axe (WCAG 2.1 A and AA) with the warning shown, at 1280 and 390 px, and when closed, as do key registration with its warning and the sign-in page with the email kept",
  },
  {
    id: 'SGN-05',
    title: 'A reset is asked for alike for every address',
    assertion:
      "`/sign-in/forgot-password` sends a known, an unknown, an invited, a not-enrolled (password set, no second factor), a disabled and a locked address to the same \"Check your email\" with the same status, cookies, words and help text; a code is sent only to an active account with an enrolled second factor (locked included), and the provider's refusals for real accounts are answered as success; the request takes at least its 1,500 ms floor on every path, a thrown one included; it counts in the `sign_in` bucket by the typed address, shared with password attempts, and its refusal reads alike; `password_reset_requested` is recorded for an account and nothing for an unknown address; the address is in no URL, notice, error or log, and the code's masked destination is never shown",
  },
  {
    id: 'SGN-06',
    title: 'The code and the new password',
    assertion:
      'The code step is a sealed sign-in step that states 15 minutes, warns at two in its own words and closes at its limit; the policy is checked before the provider; a wrong, expired, used, replaced or over-tried code and an unknown address get one refusal on the code field, with the code and both passwords emptied; a wrong code counts no failure and locks nothing; the confirm counts in `sign_in` by the sealed address and a changed address is refused without the provider; Send a new code opens the step again without typing and shows its own refusals, and Use a different email ends it at any time, with the address not kept; the dev twin holds the code hashed, for an hour, single use, five tries',
  },
  {
    id: 'SGN-07',
    title: 'After a reset the second factor is still asked',
    assertion:
      'A reset ends every session of the account and signs it out at the provider (a provider sign-out failure is logged and does not fail the reset), records `password_reset_completed`, keeps the lock, the authenticator and the keys, and lands on the sign-in page with the email filled and a notice focused once, written only now (never for a locked or disabled account, whose notice names the support address); the next sign-in with the new password asks for the code, and the old password is refused',
  },
  {
    id: 'SGN-08',
    title: 'Every sign-in step has a way forward',
    assertion:
      'The sign-in page lists help as a list with a reset link that names itself, the code and key steps say where to write about a lost factor from the address one signs in with, the locked words name the support address in the refusal, the key page and the notice, and a closed hardware-key step returns to the key page; the reset page in both phases, the sign-in page, the code step and the key step pass axe (WCAG 2.1 A and AA) at 1280 and 390 px',
  },
  {
    id: 'SGN-13',
    title: 'Every message the user pool sends is the brand’s',
    assertion:
      'Each CustomMessage source (forgot password, invitation and its resend, attribute update, attribute verification, sign-up, resend code and authentication) has its own subject and words from `@tp/auth-mail`: the reset code’s are section 2.5’s word for word with O-8’s “If you asked more than once, use the newest code.” after its 15 minutes, never that a new request replaces the code, the invitation names the sign-in page as plain text with no query and states 7 days from `INVITATION_DAYS`; each message holds Cognito’s code parameter once (the invitation its username parameter once), stays within Cognito’s subject and message lengths, reads the same with its tags stripped, and holds no image, font, stylesheet or link (but the invitation’s sign-in address); the pool’s own verification and invitation templates are the branded generic fallback, never reset-specific words; the copy lint reads the package',
  },
  {
    id: 'SGN-14',
    title: 'The message trigger is small and contained',
    assertion:
      'The trigger is an inline Node 22 function with no dependency, network or VPC, 128 MB and a 3-second timeout, one environment variable, a role with only its own log group’s two write actions and no managed policy, invoked only by Cognito for this pool and account; an unknown source, a missing parameter or a thrown error returns the event unchanged (Cognito sends the fallback template) and logs one line of codes with no address; the function’s errors, throttles and fallbacks alarm the operator; a reset request whose code Cognito could not send for the trigger answers alike at its floor, and an invitation it could not send fails visibly',
  },
  {
    id: 'SGN-15',
    title: 'The local identity provider delivers what Cognito delivers',
    assertion:
      'The development provider’s invitation and reset outboxes hold each message’s subject, text and HTML from `@tp/auth-mail`, and the e2e journeys read the temporary password and the reset code from the message’s own text, with no remote asset and no link but the sign-in address; the text is the HTML’s with its tags stripped, since Cognito sends the HTML alone, with no text part',
  },
  {
    id: 'HOM-01',
    title: 'One actionable figure everywhere',
    assertion:
      "On one synthetic case before and after its re-run is accepted (its lines priced again), on a case whose rule release is withdrawn, and on a case with a line moved on to payer approved, the home's headline dollars and lines, its cases by state and deadlines, the Cases header and each row's figure and count, the case page's figure and counted lines, an ROI statement generated on demand and the digest's nearing-deadline figure agree, each read through the one predicate; every line not written off is in the figure, moved past actionable or on pricing no longer current, and is counted under that one cause; the case's stored total is untouched and shown nowhere as actionable; the statement recomputes from its entries and the database accepts it; the home reads its cases in one statement that runs the pricing check at one plan node, once per case line at actionable and for no line written off or moved off actionable; the recovered figures to date and for the quarter, from one ledger read, equal ledgerTotalsOver (practiceLedgerTotals's own totals) for all time and for the quarter, on random ledgers whose reversals cross the quarter's boundary, and to date is dated from the first counted entry that stands, none when every recovery was reversed",
  },
  {
    id: 'HOM-02',
    title: "The home's figures in words",
    assertion:
      "The tile counts its lines with counted() and names each cause of the lines out of the figure (0, 1 and 2 of each) only when there are any, as the case page and the packet builder do through outOfFigureWords(); the Recovered tile reads to date since its first counted entry that stands, or none yet, and this quarter from quarter(), each date and quarter key kept on one line; quarter() writes a quarter key and refuses any other; the Payer approved notes say the figure is to date and never the patient’s share and, with the ledger totals' help and the statement's empty line, follow the proof level; the case page's Net expected value shows an amount only on a case still being worked with a line in the figure and a pursuit estimate, and otherwise says why (resolved or closed, not estimated, no line in the figure, every line written off); no read text of the home, Reconciliation, the case page or the statement says a stage number (stage five, stage-five or stage 5), except the home's help (components/help.ts, a #42 file; follow-up after #42); pnpm lint:copy passes",
  },
  {
    id: 'HOM-03',
    title: 'The empty home names the upload gate',
    assertion:
      "The home's gate equals the Uploads page's: a practice BAA and an organization-wide BAA open it, a BAA signed in the future and none close it, a suspension pauses it; open shows the upload sentence with Go to Uploads, closed the BAA sentence with See the agreement chain for a role that may open Settings and no link for a viewer, paused the suspension sentence with no link",
  },
  {
    id: 'HOM-04',
    title: 'The home and the statement agree in the browser',
    assertion:
      "In the LED-06 journey after the recoupment, the home's actionable tile reads $0.00 and \"what the packets ask for: 0 lines in cases still being worked; out of the figure: 1 line whose pricing is no longer current\", and the Cases header, the case page and an ROI statement generated then (Actionable in cases still being worked) read $0.00; the Recovered tile's to-date figure reads since 2026-06-09 with this quarter's line; the Payer approved note reads deposited or not, never the patient’s share; the home's read text, its help apart, the case page and Reconciliation's recovered figure carry no stage number, and the home's help still says stage-five until #42's follow-up; the statement's empty approval line names deposited",
  },
];
