# 0087. Reconcile a practice with reads per pass, never per open line, writing in the rules' order

- **Status:** proposed (`co-001/suite-cap-3-reconcile`, SUITE-CAP-3, Lane B; worker-side only: no migration, index,
  table or function); accepted when the founder approves its pull request (docs/adr/0063). Amends
  [0083](0083-read-a-months-triage-and-audit-report-in-batches-look-each-line-up-through-an-index-and-hold-only-a-small-measured-share-of-heap-per-line.md)
  (step 7b's acceptance step, by its dated note of 2026-11-07); reverses none of its rulings.
- **Date:** 2026-11-07
- **Deciders:** the build (Lane B), on the design `lane-b-suite-cap-3-reconcile.md` (ops repository; reviewed in seven
  rounds by the payment-engine and security lenses); Lane B's orchestrator, for the split of D14 (ruled 2026-11-06 at
  22:31 UTC, as the item's status file records); the founder, on the pull request's review. Every option is judged
  under the founder's standing rule of 2026-10-18.
- **PRD sections:** 13 (the recovery ledger: matching steps 1 to 3, recoupments and reversals), 8 (`line_status` and the
  status machine), 15 (the worker), 18 (testing); CLAUDE.md rules 1 to 4; test matrix CAS-49, CAS-50 and CAS-51, LED-01
  to LED-18; ADRs [0067](0067-measure-every-ledger-amount-in-what-the-payer-pays-decide-the-outcome-on-the-allowed-amount-show-the-patients-share-beside-and-take-back-on-a-reversal-the-payment-it-removes.md)
  (the correction chain, unchanged) and 0083 (the bounded reads, the stage lock and the weekly run)

## Context

The reconcile step (`apps/worker/src/reconcile/pass.ts`, `reconcilePractice`) matches a practice's new remittances,
posting rows and EFT rows to its case lines and writes the ledger's matches, entries and stage events in one
transaction under the practice's `ledger:` lock. On the base it searched each open case line on its own: two candidate
queries a line a round (`candidatesFor`, the patient query with a correlated `NOT EXISTS` on `ledger_match`), two
`claimLines` reads a line, every claim of a code and date decrypted once for each line of it, and one `line_status`
insert a stage event, each refreshing the line's whole case. Every family's count was linear and its time a call grew
with the practice, so a pass grew close to N squared.

Measured on SYNTHETIC rows (the design's probe, a private PostgreSQL 18 cluster, 4 CPUs): a step-7b pass (an 835
reprocessing every actionable line and a posting export, approved and posted in one pass) took 262.5 s at 2,000 lines
and 1,653.3 s at 6,000 at 83d71fd6, and 3,412.1 s at 10,000 with SUITE-CAP-1b's migration. On cc3dd7f6 (SUITE-CAP-1b
merged) the weekly run's practice F, one case of 2,000 lines, took 620 s, 69% of the reconcile job's 900 s attempt
(SUITE-CAP-1b measured 526 to 731 s); `byPatient`'s exclusion alone was 403 s of it, and the per-event case refresh 79 s.

## Decision

**A reconcile pass reads per pass, never per open line, and writes in the order the rules define.** Its statements stay
a bounded number a pass whatever its lines (CAS-50 enforces it), and every write is issued in today's order, so
`ledger_entry.seq`, `line_status.seq` and (once the interest fix lands) `ledger_match.seq` draw the same order and every
reader that orders by them reads the same. No matching rule, filter, comparison, amount, stage, outcome or recovered
total changes; nothing under `packages/ledger/src` changes.

- **One candidate search a pass (D1).** Before any line is matched, every open line's candidates are found together,
  in the same rounds: per round one statement by payer claim control number for every line still searching
  (`controlCandidates`), and once a pass the patient search, in two statements: (a) each claim some line's own query
  would have returned, with no column of any service line, each decrypted once; (b) `patientPairs`, over only the
  (claim, line) pairs equal by decrypted patient control number, keeping those that pass the line's own predicate.
  The filters are the per-line query's, word for word, every table alias held to the practice (`practice_id = $1`,
  D11); the chain's claim order is the query's own key (payment date as `YYYY-MM-DD` text, load time in microseconds,
  then the claim's ID).
- **The exclusion "never claim-matched to this line" from the pass's own set (D16).** No search statement names
  `ledger_match`, so no plan of the search depends on that table's statistics: the claim matches of the open lines,
  standing or reversed, read before any write, are dropped in TypeScript from the control search and excluded inside
  both patient statements against parameter arrays of only the matched pairs a line's known claims do not already
  exclude, so the search decrypts exactly the claims the per-line queries decrypted. A TypeScript-only patient
  exclusion is never used: it would decrypt claims no line's query returned.
- **Each claim's lines read once a pass (D2):** the chain context's lines, extended by one `claimLines` call a search
  round; `claimLines`' SQL is unchanged.
- **The pass's stage events in one statement (D3):** `INSERT … SELECT … FROM unnest(…) WITH ORDINALITY … ORDER BY n`,
  in today's order (by service line, a line's payer approved before its recovered), so each case is refreshed once a
  statement. The statement takes every event line's head row before the cases, where a person's reopen takes the case
  and then the head, so it runs under a savepoint and re-issues the same statement on a deadlock (`40P01`), at most
  twice more.
- **The smaller loops (D5 to D7, D15):** `lineChain` reads a line's standing matches from an index built once a
  context's matches array (a module `WeakMap`); `settleMatches` keeps a running sum of each check's check-level
  postings (`checkPostedBefore`); a pass reads and decrypts each remittance's claims once for its posting rows; and the
  posting and EFT rows never matched are found by one practice-scoped `EXCEPT` in the server and then read by ID in
  today's order, so the worker never holds the practice's history of row IDs.
- **The per-line step is kept as the reference (D13):** `apps/worker/src/reconcile/test-support/per-line.ts` holds
  today's text of every function this changes and `referencePass`. No production file may import it (a
  `no-restricted-imports` pattern in `eslint.config.js`, held by `per-line-import.test.ts`).
- **Step 7b of the weekly run stays on F (D14, as ruled).** Lane B's orchestrator ruled on 2026-11-06 at 22:31 UTC
  (recorded in the item's status file) to accept the split the design put to it: step 7b stays on F, a practice of its
  own, at 10,000 lines at full size (the smoke size keeps 600), expected to complete on attempt 1 within 360 s (a
  sizing bound, not a red check: the run fails only when the job needs a second attempt); it moves back to A's full
  month once Lane A's corrected `ledger_line_net` and `ledger_entry_rules`' match lookup merge, as the acceptance step of
  Lane A's trigger pull request, re-measured on its own base. CAS-42.3's `PASS_BUDGET_MS` goes from 150,000 to 60,000.
  ADR 0083 takes a dated note.

## Consequences

- A per-line query, a per-line `claimLines` read or a per-event stage insert brought back into the pass fails CAS-50:
  its candidate statements and the search's own `claimLines` calls are at most 2 + 2 x rounds and the same at 200 and
  800 lines, the pass's other `claimLines` calls are exactly the three practice-wide ones (told apart by their place
  between the control searches), its stage events are one statement, no candidate statement names `ledger_match`, and
  each claim is decrypted at most once a phase. A per-line term at real size fails CAS-51's ratio (the own part's time a
  line at 2,000 at most 1.5 times its time at 500).
- A new matching filter is written into the pass-level statements and into the per-line reference
  (`test-support/per-line.ts`) alike; CAS-49 holds the two equal on generated passes and on LED-01 to LED-18's worlds,
  writes, order, encrypted text (by the hash of its plaintext) and decrypts included.
- The guard on the reference reads only a file's own imports: a production file that imports another test-support
  module which itself imports `per-line` is not caught. Such a chain is a review finding.
- The ledger triggers (`ledger_line_net`, `ledger_entry_rules`' match lookup, `ledger_entry_within_evidence`) are now
  most of a large pass and are Lane A's, frozen; they are handed on with their DDL and measured gain, and CAS-51's
  budgets say which part is whose (the whole pass, and its own part less the `ledger_entry` inserts).
- A decrypted patient control number of each claim the search or the postings read lives in the worker for one pass,
  as before; it is never logged, and no more claims are decrypted than the per-line pass decrypted.
- 2026-11-10: the web's seven ledger actions no longer wait on the pass's lock; they take it if free or are refused at
  once ([0092](0092-a-persons-ledger-action-never-waits-for-the-ledger-lock-it-takes-it-if-free-or-is-refused-at-once.md)).

## Measured

On SYNTHETIC rows, 4 CPUs, the candidate the build ports (design sections 8.3 and 8.3a); budgets are 2.5 times the
measured figure (SUITE-CAP-1's rule):

| Shape and size | Base | Pass | Pass less its `ledger_entry` inserts |
| --- | ---: | ---: | ---: |
| F, one case, 2,000 lines (cc3dd7f6) | 620 s | 21.8 s | 11.4 s |
| Spread R, 2,000 lines (cc3dd7f6) | 159 s | 46 s | 11 to 13 s |
| Spread A, 2,000 lines (cc3dd7f6) | 165 s | 47 s | |
| F, 10,000 lines | | 220.2 s (24.5% of the attempt) | 59.1 s |
| A's month, 30,795 lines in F's shape | | 1,653.1 s (184%) | 184.2 s |
| A's month with Lane A's two trigger fixes | | 309.9 s (34%) | |

- At 10,000 lines (spread R, SUITE-CAP-1b's schema): candidate searches 4,000 statements to 4; `claimLines` 4,002 calls
  to 4; `line_status` inserts 4,000 to 1; patient control number decrypts 720,000 to 17,500; peak heap 157 MiB of 560.
- The own part is linear: 5.6 to 6.0 ms a line from 2,000 to 30,795 lines.
- CAS-51's budgets: the whole pass under 120,000 ms and its own part under 40,000 ms at 2,000 lines; CAS-42.3's pass
  (shape P's postings) under 60,000 ms.

*Dated note, 2026-11-11 (Lane A, `co-001/ledger-function-bodies`; migration `20261113090000_ledger_lookups.sql`).*
The two ledger functions this record hands on get their new bodies, under the ledger freeze exception the founder
granted on 2026-11-06 at about 22:40 UTC (reconciliation-001, "Ledger semantics"): `ledger_line_net` reads a line's
entries by the line's practice and the line, and `ledger_entry_rules` reads an entry's match by its primary key alone.
The migration carries exactly the two bodies the founder read, byte for byte, refuses to run over any other starting
body, and changes nothing else: no table, column, index, trigger, policy, grant, amount, stage or refusal.

Re-measured on the base edab4d4d (#126, #134, #136, #137, #140 and #141 merged), SYNTHETIC rows, 4 CPUs, one run each,
one step-7b pass on a copy of each seed, before (the base's bodies) against after (the migration applied):

| Shape and size | Pass before | Pass after | `ledger_line_net` | `ledger_entry_rules` | The pass's writes |
| --- | ---: | ---: | ---: | ---: | --- |
| Spread R, 2,000 lines | 53.7 s | 19.0 s | 36.2 s to 3.1 s | 2.0 s to 1.3 s | identical, 20,635 rows |
| F, one case, 10,000 lines | 220.9 s | 79.2 s | 92.1 s to 2.2 s | 52.2 s to 4.0 s | identical, 102,907 rows |
| A's month, 30,795 lines in F's shape | 1,770.2 s (197% of the attempt) | 317.1 s (35%) | 863.3 s to 7.1 s | 589.4 s to 15.0 s | identical, 316,770 rows |

- "Identical" is every row the pass wrote (ledger matches, ledger entries, stage events, audit events, postings),
  compared row for row in the order the ledger gave them, `seq` values included; identifiers new in the pass are
  compared by their order and encrypted text as present or absent. At A's month both runs approve 30,795 lines, post
  30,795 and recover 30,795, 4,947,800.00 posted. A pass writes no correction and meets no refusal: those are held
  by `apps/worker/src/reconcile/ledger-lookups.db.test.ts`, whose cases pass on the old bodies and on the new.
- What remains of the inserts at A's month is `ledger_entry_within_evidence`, 91 s of the 317 (not part of this
  exception).
- **Step 7b's move back to A's month is not this pull request's acceptance step.** It follows as a pull request with
  no migration, measured on the merged tree with the weekly run's own harness (the schema batching plan, section 2):
  the exception covers one migration with two bodies, and the granted change does not wait on a capacity acceptance
  that only the move needs. The 360 s sizing bound holds here with 43 s to spare on one run.
- **A measured limit of the new `ledger_line_net`, found by this pull request's database review.** The design said the
  line index would be taken "whatever the statistics". It is not. Planned as the application role on PostgreSQL 18.4
  (generic plan, one practice in scope):

  | The ledger when the function is planned | Body before | Body after |
  | --- | --- | --- |
  | never analyzed, empty to about 120 entries (a new deployment's first pass; every measurement above) | every entry of the practice (`ledger_entry_by_date`) | the line's entries (`ledger_entry_by_line`) |
  | never analyzed, about 200 to 80,000 entries | every entry of the practice up to about 1,000; the line's entries from about 4,000 | every entry of the practice (`ledger_entry_by_date`, then a sort) |
  | never analyzed, 100,000 entries | the line's entries | the line's entries |
  | analyzed while empty (R's seed) | a sequential scan, and two more for corrections' targets | a sequential scan |
  | analyzed with rows | the line's entries | the line's entries |

  So on a ledger that holds a few hundred to some tens of thousands of entries and was never analyzed, the new body
  is the slower one from about 4,000 entries. Measured: F at 10,000 lines on a ledger already holding 20,000
  never-analyzed entries of another tenant passes in 132.0 s before and 168.5 s after (`ledger_line_net` 2.0 s to
  90.8 s; `ledger_entry_rules` 52.2 s to 4.1 s), with the same approved and posted cents. The pull request that moves
  step 7b measures the weekly run's own ledger as its pass finds it, for that reason.
  In production the state is short: automatic analysis runs within about a minute of the first fifty committed
  entries, its statistics make every open session plan again, and with statistics both bodies read the line's
  entries. The match lookups have no such state: without `reversed_at IS NULL` in the query only the primary key fits.
  The plan test holds the two states a first pass plans in (an empty ledger, and its first rows). A body that reads
  the line's entries in every state would be a new body, so a new founder ruling: it is recorded as a candidate for
  the next ledger freeze ask, with `ledger_entry_within_evidence`.
- Where the two bodies of `ledger_line_net` answer differently: only for an entry whose practice is not its line's.
  The application role cannot make one (it cannot change a service line, and the rules and the tenant policy refuse
  such an entry); the owner role or a superuser could, by moving a service line to another practice by hand, and the
  new body then counts none of that line's entries, so the ledger refuses more, never less. No migration or function
  updates a service line's practice. A trigger that refuses that change is proposed as its own schema item.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| One search a line, with indexes | Each call stays linear in the practice, so the pass stays quadratic; the indexes are a migration |
| A patient-control-number equality hash column | A migration on the remittance tables; measured unnecessary once each claim is decrypted once a pass. Revisit if a spread makes the patient search matter |
| Search only lines whose code and date gained a claim since the last pass | Needs a watermark the rules do not have (an unmatch or a reversal changes eligibility without a new claim): a matching-rule change |
| The `ledger_match` exclusion as a correlated `NOT EXISTS`, an InitPlan or an index | Statistics-bound (403 s on F), per line, or never used (measured by SUITE-CAP-1b); kept only as D16's measured fallback inside the patient statements, once a pass |
| Deferring or rewriting the case refresh | A trigger change (Lane A); one statement a pass already refreshes each case once |
| Moving step 7b back to A's month now | Measured 1,653 s against the 900 s attempt, 89% in the ledger triggers no worker change reaches; it would fail every weekly run |

## Revisit when

- Lane A's trigger fixes merge: their pull request moves step 7b back to A's full month, re-measured within 360 s, and
  lowers CAS-51's `PASS_BUDGET_MS` from its own measurement.
  Dated note, 2026-11-11: the trigger fixes are migration `20261113090000_ledger_lookups.sql`; the move and the
  budgets follow in a pull request with no migration, measured on the merged tree (the note under "Measured").
- The interest fix (#126) lands: CAS-49 compares `ledger_match` and the settle entries exactly in `seq` order, and the
  per-line reference is taken from the merged base's text.
  Dated note, 2026-11-10: #126 merges after this item, so its pull request aligns the reference instead. The per-line
  reference runs #126's interest step by import (`providerAdjustments`, exported for it alone: this item changes
  nothing in it and it calls nothing this item changes) and takes #126's `reconcileRemittances`; `settleOrder` and
  CAS-49.3's `ledgerMatches` pattern read `ledger_match.seq`; a generated practice expects one interest credit (the
  PLB L6; AMT I credits none, ADR 0084). Still owed, as its own item: the settle entries compared row for row in
  `seq` order in place of the set comparison and the replay (CAS-49.1 reports 0 of 25 runs would differ), and
  CAS-50's and CAS-51's practices seeded with PLB L6s and WOs with the interest step's statements counted (its reads
  are a fixed number a pass by reading, ADR 0084 D17, which no check yet holds at two sizes).
- A spread puts many lines on few codes and dates beyond CAS-51's spread A, or the patient search's share of a pass
  grows: the equality hash above.
