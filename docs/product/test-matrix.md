# Test matrix

Imported verbatim from the "Test matrix" tab of the planning document (as of 2026-10-14).

Every case the suites must contain, by module, with the fixture that exercises it and the assertion. `pnpm synth --case <id>` generates the fixture; the expected outcome lives beside it. A pull request that adds behavior adds a row here first.

## Parser and loader (PAR)

| ID | Case | Assertion |
| --- | --- | --- |
| PAR-01 | Minimal valid file, one claim, one line | Loads; balanced; counts match |
| PAR-02 | Two transaction sets in one interchange | Two remittances; each balanced |
| PAR-03 | Two interchanges in one file | Two remittances with distinct ISA13 |
| PAR-04 | Non-default delimiters | Parses identically to PAR-01 |
| PAR-05 | CRLF line endings and a BOM | Parses |
| PAR-06 | Duplicate file (same bytes) | Document recorded; zero rows loaded; receipt says duplicate |
| PAR-07 | Same remittance, different filename and whitespace | Zero rows; linked to the original |
| PAR-08 | Reversal (CLP02 22) followed by a corrected claim | Reversal linked; correction supersedes; net view shows one claim |
| PAR-09 | Zero-pay denied claim (CLP02 4) with CAS detail | Loads; observed allowed zero; adjustments stored |
| PAR-10 | Claim-level CAS only | Line observed allowed allocated and flagged |
| PAR-11 | Line-level CAS only | Observed allowed from paid plus PR |
| PAR-12 | AMT B6 present | Observed allowed basis `amt_b6` |
| PAR-13 | PR split across reason codes 1, 2 and 3 | Patient share sums |
| PAR-14 | CO-45 contractual write-off | Adjustment stored; variance computed later against expected |
| PAR-15 | OA-23 on a secondary remittance | Claim status 2; line unpriced `SECONDARY_PAYER` |
| PAR-16 | PLB WO recoupment | Provider adjustment; check balances with it |
| PAR-17 | PLB FB forward balance | Recorded; not counted |
| PAR-18 | PLB L6 interest | Recorded as interest |
| PAR-19 | Negative PLB larger than claims (zero or negative check) | Balances; loads |
| PAR-20 | Unbalanced transaction | Held with difference and position; nothing loaded |
| PAR-21 | Unknown CARC | Loaded with flag; receipt lists it |
| PAR-22 | Decimal units and four modifiers | Stored exactly |
| PAR-23 | DTM 472 with a date range | Service from and to |
| PAR-24 | A 277 uploaded as an 835 | `EDI_NOT_835`; held |
| PAR-25 | Truncated file | `EDI_SYNTAX` with position; held |
| PAR-26 | Control number mismatch (SE count wrong) | `EDI_CONTROL_MISMATCH`; held |
| PAR-27 | Zip of 500 files with one bad entry | 499 load; one held; batch receipt |
| PAR-28 | Renamed executable in a zip | Quarantined; nothing parsed |
| PAR-29 | 10,000-claim file | Parses within target; memory bounded |
| PAR-30 | Same file uploaded concurrently twice | Exactly one remittance row |

## Mapping and coverage (MAP)

| ID | Case | Assertion |
| --- | --- | --- |
| MAP-01 | Unmapped payer and plan | Pricing refused; coverage shows dollars waiting |
| MAP-02 | Mapping with an effective date after some lines | Earlier lines `NO_MAPPING`; later priced |
| MAP-03 | Mapping corrected | New mapping; old run unchanged; re-run offered |
| MAP-04 | Mapped as no agreement | Lines go to anomaly screening only |
| MAP-05 | Mapped as MA non-contracted | Priced from the fee schedule with all flags on |

## Contracts (CON)

| ID | Case | Assertion |
| --- | --- | --- |
| CON-01 | Two versions with overlapping windows | Refused |
| CON-02 | Amendment closes the prior window | Prior `effective_to` set; prior unchanged otherwise |
| CON-03 | Edit attempt on a signed-off version | Refused; supersession required |
| CON-04 | Rate record without a page reference | Cannot be approved |
| CON-05 | Model proposal with a quote not in the page | Verifier fails; specialist sees it |
| CON-06 | Conflicting exhibits for one code | `AMBIGUOUS_RATE` until resolved |
| CON-07 | Draft version used in pricing | Refused; only signed off prices |

## Pricing engine (PRC)

| ID | Case | Assertion |
| --- | --- | --- |
| PRC-01 | MA non-contracted, four units, no assistant | Golden cent match: PFS, MPPR, sequestration |
| PRC-02 | Same with CQ on two units | 85% applied to those units only |
| PRC-03 | Commercial 110% of current Medicare, flags off | Unreduced sum times 1.10 |
| PRC-04 | Commercial locked to 2025 fee schedule | Uses 2025 RVUs and factor |
| PRC-05 | Fixed schedule, two units | Amount times units |
| PRC-06 | Lesser-of where charge is lower | Charge wins |
| PRC-07 | Per-visit with three included lines | First line carries it; others expect zero |
| PRC-08 | Qualifying-APM conversion factor named by the record | Correct factor used |
| PRC-09 | Code with no RVU in the basis year | `NO_PFS_VALUE` |
| PRC-10 | MUE exceeded with NCCI on | `MUE_EXCEEDED` |
| PRC-11 | 97140 and 97530 without a 59 or X modifier, NCCI on | Review flag |
| PRC-12 | Service date outside every version | `DATE_OUTSIDE_VERSIONS` |
| PRC-13 | Rounding at a half cent under each rule | Expected per rule; unrounded kept |
| PRC-14 | Window passed on the triage date | Validated, not actionable |
| PRC-15 | Negative variance | Recorded; no case |
| PRC-16 | Trace recompute | Equals stored amount for every golden line |
| PRC-17 | Property: doubling units doubles base (fixed, percent) | Holds |
| PRC-18 | Property: turning a flag off never lowers the amount | Holds |
| PRC-19 | Re-run under release 2 with one changed RVU | Diff lists exactly the affected lines |
| PRC-20 | 100,000 lines | Under two minutes on one vCPU |

## Triage, cases and packets (CAS)

| ID | Case | Assertion |
| --- | --- | --- |
| CAS-01 | Cohort below minimum size | No anomaly |
| CAS-02 | Anomaly never enters a case or report total | Holds |
| CAS-03 | Lines grouped by payer pattern from traces | One case per pattern |
| CAS-04 | Case below case materiality | Not created; accumulates |
| CAS-05 | Line below line materiality | Validated, not actionable |
| CAS-06 | Write-off with reason | Leaves actionable total; stays visible |
| CAS-07 | Reopen a written-off line | Explicit reason; audit event; earlier report unchanged |
| CAS-08 | Narrative with a figure not in the input | Verifier fails; approval blocked |
| CAS-09 | Drafter attempts approval | Refused |
| CAS-10 | Single-user practice | 24-hour delay and audit flag |
| CAS-11 | Identifiers in a draft | Placeholders; inserted at export only |
| CAS-12 | Export | PDF and CSV hashes stored; shown in submission log |
| CAS-13 | Edit after approval | New version; approval cleared |
| CAS-14 | Submission with no response in 45 days | Follow-up surfaces |
| CAS-15 | Interest line where state rule applies | Separate line; not in expected |
| CAS-26 | Payer copy of an export | No login, record ID, SHA-256, verification, internal note, code, interest not computed or $0.00 interest; above the first level the level’s own window alone; approval line, reference and contact printed; the internal record on the review page |
| CAS-27 | Export with no correspondence contact | Refused before anything is queued, with the remedy; the job refuses with its code and prints nothing; Postgres refuses the export without a name and phone |
| CAS-28 | Packet found by its reference | Every version of the practice whose reference matches, none of another practice |
| CAS-29 | Submission of an export whose pricing went stale after it was made | Never attested; logged only as sent without sign-off, with the person’s confirmation, its reason and the database’s audit event; any other unattested export refused |

## Ledger (LED)

| ID | Case | Assertion |
| --- | --- | --- |
| LED-01 | Packet submitted | No entry |
| LED-02 | Adjusted remittance with higher allowed matching a case line | `approved` entry for the difference |
| LED-03 | Adjusted remittance matching no case | Listed for manual match; no entry |
| LED-04 | Posting export row matches by check number | `posted` entry |
| LED-05 | EFT row matches by trace | `deposited` entry |
| LED-06 | Recoupment after deposit | `recouped` negative; total reduced; case reopened |
| LED-07 | Manual match reversed | `reversed` offsets exactly |
| LED-08 | Duplicate posting export | No duplicate matches |
| LED-09 | Partial posting at check level | Pro-rata allocation flagged |
| LED-10 | Direct UPDATE or DELETE by the app role | Fails |
| LED-11 | ROI statement recompute | Equals sum of entries |

## Tenancy, security and lifecycle (SEC)

| ID | Case | Assertion |
| --- | --- | --- |
| SEC-01 | Every PHI table has a forced policy | Catalog test passes; new table without one fails |
| SEC-02 | Cross-tenant read and write on every table | Zero rows; refused |
| SEC-03 | Firm user after grant expiry | Denied on the next request |
| SEC-04 | Firm user after revocation | Denied within one request |
| SEC-05 | Support grant after four hours | Denied; practice notified with reads |
| SEC-06 | Bulk job spanning practices | Refused by design |
| SEC-07 | Log line with a name or member ID | Lint fails |
| SEC-08 | PHI in a URL or S3 key | Test fails |
| SEC-09 | Model call outside the gateway | Lint fails |
| SEC-10 | Audit row update or delete | Refused |
| SEC-11 | Deletion workflow | No readable object remains; certificate recorded |
| SEC-12 | Legal hold | Deletion paused with notice |
| SEC-13 | Restore from snapshot | Row counts and catalog test pass on the restored instance |
| SEC-14 | Fixture with a non-synthetic sender | Hook refuses the write |
| SEC-15 | Session idle past 30 minutes on a PHI screen | Expired |
| SEC-17 | Screening tables hold no PHI-shaped columns | Catalog read finds no name, birth date, member ID, service date or claim number column, no practice_id and no registry row; owner-only policy, no other role's privilege |

## Free screening (SCR)

Added by Change Order 001 (CO-04, CO-09) in its pull request 6; SCR-07 by the founder's ruling of 2026-10-18 on the best-option audit's item 6 (the CMS small-cell standard); SCR-08 and SCR-09 by the founder's rulings of 2026-10-20 on audit #53 (the 60-second promise at production size and the release read); SCR-10 to SCR-14 by the founder's rulings of 2026-10-20 on audit #57 (what outlives a screening, attribution and the opened signal); docs/adr/0062.

| ID | Case | Assertion |
| --- | --- | --- |
| SCR-01 | Screening upload with a date-of-service or member-ID column | Rejected with the column named by position and kind; only the row count and reasons stored, no hash |
| SCR-02 | Screening pricing of a clean upload | Each Medicare row is the engine's one-line amount before sequestration times its claim count in bigint, and a code in the reduction across codes also its amount as a later code of a visit; a row is an anomaly only more than $5 a claim line below its lowest figure; MA contracted and commercial rows count toward the dollars that cannot be priced without a contract; 50,000 rows return a result in under 60 seconds |
| SCR-03 | Screening 30 days after its upload | Link refuses it; the expiry job deletes the run and its results; the conversion stays, and so do the screening's counts-only outcome (unlinked) and a kept summary (SCR-10, SCR-11) |
| SCR-04 | Screening uploads past the limit | Refused per business domain, per free-mail mailbox however its address is spelled, and per IP; subjects stored as keyed hashes |
| SCR-05 | Screening output wording | No page, message or email says owed, underpaid or recovered; no tagline |
| SCR-06 | Screening converted to an audit request | Audit request recorded and logged as an audit event |
| SCR-07 | Screening row of fewer than 11 claim lines | Left out in the browser, which says how many rows, claim lines and dollars it left out, as the result does; a request sent around the browser refused with the row numbers, storing only the row count and coded reasons, no hash; refused by the database's CHECK; 11 claim lines taken; the hash kept is the database's, of the rows accepted, never the file's; a later screening of the same practice replaces the earlier, so a row of 12 claim lines and the same row at 11 are never held together |
| SCR-08 | The screening's capacity under production limits (audit #53 part 1; the founder's rulings of 2026-10-20, decisions 13 to 16) | The production images at production's task sizes, Postgres at db.t4g.medium's size or the runner's share with gp3's baseline and a 2 ms round trip, the SYNTHETIC scale release (2.2 million records): the practice and worst 50,000-row uploads alone and three at once (cold, the worst ones distinct) with a small one queued behind them; fails on an OOM kill (Postgres's included), a restart, anonymous memory above 90% of a limit, a limit or cold start not applied, a runner too small, a wrong, unfinished or stalled result, a result page that does not open (its first page of groups or its last), a small upload not queued behind the large ones, an oracle mismatch or an oracle short of an upload's Medicare rows (S1-1, S2-1, S3-1), or a run of fewer than S1 to S5; the time to email reported as "open, PR 6b" until environments.ts declares the screening's consumer, then failing above 48 s on the runner (60 s scaled by the runner-to-Fargate factor once staging measures it) |
| SCR-09 | The release read by key (audit #53 part 2) | A release's shared types held once per release and manifest (two releases at most); each run's keyed records read by its own codes and ZIP; every stored row equal to what the old read and adapter (frozen at 3c1b289) give for the same run; the key set and its records read on one snapshot; a lookup outside the keys fetched, a row outside the key set or a code priced outside it fail the run as RELEASE_READ_OUTSIDE_FETCH before its batch is recorded, never a row priced ENGINE_ERROR; an attempt a stale claim overtook stops at its next call |
| SCR-10 | A screening's counts-only outcome (audit #57; the founder's rulings of 2026-10-20) | Written at submission, refusal, completion and failure by the database alone: stage, month, source, the channel computed from the medium and click kind, a listed campaign or other, bands of the row counts, whole-percent shares summing 97 to 100, the anomaly and dollar bands, the open band, the conversion, and whether an accepted screening followed a refused upload (on the accepted outcome; a refused one is never changed); no name, email, ZIP, exact count, date or dollar figure; unlinked on expiry and replacement, then sealed; never deleted; two outcomes of a practice whose row differs by one claim line differ in no count |
| SCR-11 | A converted or consenting practice's kept summary | Frozen at conversion (or at completion with consent and a withdrawal link) with the result's sums, the attribution, the labels' version and the first open; every claim-line sum 0 or at least 11; the left-out sums only at 11 or more; kept 12 months, then deleted with its products; withdrawn or deleted with its request; any other delete refused; a conversion after a withdrawal keeps it on the request alone, never the withdrawn consent |
| SCR-12 | Attribution on the screening and the audit request | The proxy sets pw_first_touch once from a landing URL's campaign codes and paid click (HttpOnly, SameSite=Lax, 30 days, never the click ID, never on /api or Next's assets); a code with an identifier's shape (a member ID, a date, a phone number, a Medicare Beneficiary Identifier, digits alone) dropped; a production server neither sets nor reads it until its legal review is recorded; both forms keep how the prospect heard of us (closed list, optional), the cookie's source and medium codes and click kind, its campaign code only when the founder lists it as the row is written and other otherwise (a database trigger on every table that keeps one, whoever writes; a code listed later changes no row), and a screened referring firm; conversion carries them with from_screening; the console declines a request with a reason from the closed list |
| SCR-13 | A screening result opened by a person | The page's GET records nothing; the signal goes once, after two visible seconds and a first interaction (focusin among them), and records the run's first open, the outcome's band and the summary's; it answers alike for any link; a conversion records the open when no signal came |
| SCR-14 | A later screening of a practice with a kept summary | The earlier summary is replaced at the later screening's completion (same address, or same ZIP and practice name), an audit event naming it; its request is carried over only by the same ZIP and practice name, and an address-only match leaves the request without a summary; the result page and email of a screening that took a request over say its details are kept with it; a failed, abandoned or refused resend deletes nothing, and a completion after expiry is refused |

## Jobs and monitoring (JOB)

| ID | Case | Assertion |
| --- | --- | --- |
| JOB-01 | Replayed job with the same key | No duplicate effects |
| JOB-02 | Three failures | Alert raised; dashboard shows last run failed |
| JOB-03 | Digest | Counts and totals only; no PHI column referenced |
| JOB-04 | Two heartbeats missed | Alarm |

## Model gateway (MOD)

| ID | Case | Assertion |
| --- | --- | --- |
| MOD-01 | Contract proposal quotes verify | All quotes are substrings of the page |
| MOD-02 | Proposal with a date not in its quote | Field rejected |
| MOD-03 | Narrative evaluation set of 300 | Zero critical errors |
| MOD-04 | Document with embedded instructions | No effect on output authority; proposal still verified |
| MOD-05 | Budget exceeded | Calls refused; alert |
| MOD-06 | Kill switch on | Product works on hand-entered records |

