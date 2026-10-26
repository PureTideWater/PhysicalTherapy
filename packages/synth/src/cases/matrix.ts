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
  { id: 'MAP-01', title: 'Unmapped payer and plan', assertion: 'Pricing refused; coverage shows dollars waiting' },
  { id: 'MAP-02', title: 'Mapping with an effective date after some lines', assertion: 'Earlier lines `NO_MAPPING`; later priced' },
  { id: 'MAP-03', title: 'Mapping corrected', assertion: 'New mapping; old run unchanged; re-run offered' },
  { id: 'MAP-04', title: 'Mapped as no agreement', assertion: 'Lines go to anomaly screening only' },
  { id: 'MAP-05', title: 'Mapped as MA non-contracted', assertion: 'Priced from the fee schedule with all flags on' },
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
  { id: 'JOB-01', title: 'Replayed job with the same key', assertion: 'No duplicate effects' },
  { id: 'JOB-02', title: 'Three failures', assertion: 'Alert raised; dashboard shows last run failed' },
  { id: 'JOB-03', title: 'Digest', assertion: 'Counts and totals only; no PHI column referenced' },
  { id: 'JOB-04', title: 'Two heartbeats missed', assertion: 'Alarm' },
  { id: 'MOD-01', title: 'Contract proposal quotes verify', assertion: 'All quotes are substrings of the page' },
  { id: 'MOD-02', title: 'Proposal with a date not in its quote', assertion: 'Field rejected' },
  { id: 'MOD-03', title: 'Narrative evaluation set of 300', assertion: 'Zero critical errors' },
  { id: 'MOD-04', title: 'Document with embedded instructions', assertion: 'No effect on output authority; proposal still verified' },
  { id: 'MOD-05', title: 'Budget exceeded', assertion: 'Calls refused; alert' },
  { id: 'MOD-06', title: 'Kill switch on', assertion: 'Product works on hand-entered records' },
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
  { id: 'CI-15', title: 'The mutation canary', assertion: 'In every shard, each of its five cases reports its expected status before any score' },
  { id: 'CI-16', title: 'The mutation gate', assertion: "Each fully-run money package above 85%, recorded equivalents still counted as survivors in the score, no survivor not recorded as equivalent, no runtime error but a test file's load failure" },
  { id: 'CI-17', title: 'Mutation where the money code changed', assertion: "A push runs every package; a pull request runs exactly the packages whose closure (imports, data files, third-party packages) it changes, each package's shards all or none" },
];
