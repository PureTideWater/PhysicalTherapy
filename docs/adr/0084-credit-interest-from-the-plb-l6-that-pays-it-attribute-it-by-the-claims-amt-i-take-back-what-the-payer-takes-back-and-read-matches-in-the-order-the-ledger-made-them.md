# 0084. Credit interest from the PLB L6 that pays it, attribute it by the claims' AMT I, take back what the payer takes back, and read matches in the order the ledger made them

- **Status:** accepted (Lane A, `co-001/ledger-interest-once`, the interest fix, handed to Lane A by PR 15b (#51) on
  2026-10-26; one migration, `20261110090000_ledger_interest_once.sql`, so the founder's approval of the regenerated
  domain model, CO-02); under the founder's ledger freeze exception of 2026-10-27 (below); amended in review on
  2026-11-07 (the payments of a PLB L6 wait for its take-backs, #126 review F1; a named PLB L6 reaches forward in its
  chain only, #126 review F-M2-1; a payment never goes where a take-back still owed cannot follow, #126 review
  MONEY-R4-1); amends
  [0042](0042-keep-recovery-in-a-signed-append-only-ledger-of-matched-evidence-and-move-lines-to-recovered-only-from-its-entries.md)
  (where an interest entry comes from) and
  [0067](0067-measure-every-ledger-amount-in-what-the-payer-pays-decide-the-outcome-on-the-allowed-amount-show-the-patients-share-beside-and-take-back-on-a-reversal-the-payment-it-removes.md)
  (the interest bullet and consequence), each by a dated amendment of 2026-10-28 below its text
- **Date:** 2026-10-28
- **Deciders:** the founder, Tyler Williams, who granted the ledger freeze exception (relayed by the co-founder,
  2026-10-27 20:49 UTC) and approves the schema by the domain model's SHA-256 (CO-02; ADR 0063); the build (Lane A)
  under the founder's standing rule of 2026-10-18 (recommend and build only the best option); the design's two
  adversarial reviews, every finding of which was taken (F1 to F8 and N1 to N3; R2-1 to R2-9); the pull request's
  reviews (#126), every confirmed finding of which was fixed
- **PRD sections:** 13 (Recoupments and reversals: its one sentence on interest replaced under the exception), 20
  ("recovered principal and interest, net"); test matrix LED-16 and LED-23 to LED-25; ADRs
  [0021](0021-balance-835s-under-the-x12-sign-convention-and-allocate-claim-patient-share.md), 0042, 0067,
  [0049](0049-run-the-compute-on-fargate-behind-an-https-only-load-balancer-and-waf-migrate-before-traffic-moves-and-egress-through-nat-for-what-has-no-endpoint.md)
  and 0083 (SUITE-CAP-1b's ledger lock key)

## Context

A payer that pays interest on a claim reports it twice in the 835, as the implementation guide asks: the claim's AMT I
(how much interest that claim earned, information only, outside balancing) and a PLB L6 at the end of the check (the
money, inside BPR02, which the bank deposit proves; ADR 0021's `ΣCLP04 − ΣPLB = BPR02`). The reconcile credited both.
On LED-16's two-line case, the design's probe found:

- **AMT I and the L6 for the same money:** AMT I 5.40 on the correction and `PLB L6:<its CLP07>*-5.40`, BPR02 59.40,
  credited 1080 cents against 540 of cash, because the two credits had different evidence IDs and neither the
  reconcile's `everMatched` nor `ledger_match_standing` saw the second.
- **One L6 split again at a later reconcile:** an L6 credited to the one line with a weight, then split again when a
  later remittance gave the second line a weight: 840 cents from 540 of cash. Nothing bounded an L6's interest entries
  by its amount.
- **AMT I with no money behind it:** LED-16's fixture as it stood (AMT I 5.40, no L6, BPR02 54.00) credited 540 cents
  the check excluded.

Today's handling also dropped an L6 with no reference, dropped an L6 that takes interest back (and `ledger_entry_sign`
refused a negative interest entry), ignored a reversal's negative AMT I so a reversal and correction netting to zero
credited the correction's AMT I again, hashed a reference such as X12's recommended "CLP01 CLP07 TRN02" whole so it
named nothing, and flagged one line taking a whole amount as allocated (N1, from the payment-engine review of #51).
Every match of one reconcile shares `matched_at` (the transaction's time), so readers broke ties by the match's random
ID, and the correction chain's three lookups scanned `claim` sequentially. Recovered was never touched: interest is
never in recovered.

What the guide says (read through search summaries, agreeing with ADR 0021 and synth variant V07): net interest under a
contract is reported at the PLB with code L6 and the claim's amount in its AMT I (RFI 1705); the L6 carries the net
interest of the remittance's claims, totalled or split (TR3 1.10.2.9); an AMT I needs its L6 in the same remittance
and the reverse (RFI 2202); a reversal and correction whose AMT I net to zero move nothing and send no L6 (RFI 1324);
what PLB03-2 carries for an L6 is not fixed (it may name the claim, name it among other identifiers, or carry nothing).

The handover from PR 15b (LANES.md, "Handed to Lane A", 2026-10-26) named four ledger items: interest credited twice,
N1, a sequence for `ledger_match`'s order within one reconcile, and an index on `claim.superseded_by_claim_id`.

## The founder's exception

Granted by the founder, Tyler Williams, relayed by the co-founder on October 27, 2026 at 20:49 UTC (recorded in the
operations notes, `approval-summaries/founder-asks-2026-10-27.md`):

> "Granted: the ledger freeze exceptions in designs/ledger-interest-once.md section 10.1 and
> designs/suite-cap-1-triage-locks.md section 4.5, as written."

Section 10.1, as written and granted, covers exactly, for one pull request into `claude/build-platform`:

- **DDL** (one migration): the interest branch of `ledger_match_evidence` takes one or both of `claim_id` and
  `provider_adjustment_id`; `ledger_match.seq` (an identity) and the unique index `ledger_match_by_seq`;
  `ledger_match_rules()` recreated with `seq` among the columns that never change, the reconcile job's interest match
  carrying only one of the two records skipped, and the new interest rules; `ledger_entry_sign` allows a negative
  interest entry; the trigger `ledger_entry_within_interest` on `ledger_entry`; and the index `claim_by_superseded` on
  `claim` unless SUITE-CAP-1 has made it. SUITE-CAP-1b's `20261109090000_line_status_heads.sql` made it, so this
  migration leaves it out.
- **Behaviour:** (1) interest only from a PLB L6, once per PLB L6 and case line, each PLB L6's entries of each sign
  capped by what its attribution gives it, gross, read as of one moment; a claim's AMT I never credits by itself; a
  PLB L6 of zero and a chain netting to zero move nothing; (2) a PLB L6 names a claim of its own payer by its whole
  reference or one of its identifiers, else it is attributed by its remittance's AMT I netted per chain, exactly when
  they are equal, otherwise only in the net's direction and never past what each reports; a named PLB L6 above its
  claim's AMT I first pays the remittance's other reported interest; (3) AMT I with no PLB L6 counts nowhere and is
  shown as reported; (4) a PLB L6 that takes interest back writes a negative interest entry on the lines holding that
  claim's interest, never below zero on a line, and PRD 13's sentence is replaced; (5) N1; (6) matches read in
  `ledger_match.seq` order; (7) Postgres's refusals and the skip below.
- **Files:** that migration; `packages/ledger/src/interest.ts` and its tests, `stages.ts`, `stages.test.ts`,
  `rules.test.ts`, `index.ts`; `stryker/shards.json`; in `apps/worker/src/reconcile`, `remittances.ts`,
  `interest-chains.ts` and its export in `public.ts`, `ledger.ts`, `pass.ts`, `statement-html.ts`, with
  `apps/worker/src/report/brand.test.ts`; the web's reconciliation queries, page, totals note, adjustment consequence and
  the ROI statement page's interest note; the Drizzle mirror; LED-16's fixture and the tests of LED-16 and PAR-18; the
  ledger oracle (LED-23 and LED-24 appended); ADR 0042, ADR 0067, this ADR, PRD 13 and reconciliation-001.
- **Stays frozen:** below, under "What does not change".

## Decision

**The PLB L6 is the interest; AMT I says whose it is (D1).** An interest entry is written only from a PLB L6 of
category `interest` in a loaded remittance, positive for interest paid and negative for interest taken back. Cash
means the L6's `amount_cents` negated. One L6 that nets several claims may carry entries of both signs.

**Whom an L6 names (D2).** PLB03-2 is hashed with the practice's key as `claim.payer_claim_control_number` is; if the
whole reference reaches no claim, each token (split on spaces, commas, semicolons, vertical bars and slashes; not on
hyphens or dots) is hashed. A reference reaches only claims whose remittance has the L6's `payer_id`, because a control
number is unique only within one payer. The L6 names a claim when those hashes reach exactly one chain; two chains, or
none, name nothing. Hashes are made in memory; no token is logged or stored. The WO's naming is unchanged.

**Chains (D3).** A claim's chain is the original with every reversal and correction the loader links
(`reversal_of_claim_id`; `superseded_by_claim_id`), its root found by walking back through `claim_by_reversed` and
`claim_by_superseded`. In one remittance a chain's reported interest is the signed sum of its claims' AMT I there, so a
reversal and its correction net, and a chain netting to zero reports nothing.

**Attribution, one remittance at a time (D4; `attributeInterest`, pure).** L6s of zero and chains netting to zero take
no part and are never refused. (1) An L6 naming a chain with no claim in the remittance is that chain's whole. (2) An
L6 naming a chain with claims there covers that chain first, the smaller of the two when their signs agree; the rest
joins the pool. (3) The pool (unnamed L6s and what step 2 left): when its cash equals the chains' remaining AMT I, each
chain draws exactly its AMT I, whichever way; otherwise only the net moves, shared by the chains reporting interest its
way by `allocateByWeight`, none past what it reports. (4) What the pool left of a named L6 returns to the chain it
names. (5) The rest is attributed to no chain and counted nowhere; the remittance page still lists the L6. An AMT I
with no L6 draws nothing.

**Lines (D5).** A paid draw is split by `approvedRemaining` over the lines with a standing claim match to a claim the
draw is for, the approved ones when there are any: for a PLB L6 that names a chain, the claims its reference reaches
and those that reverse or correct them later in the chain (a reference to the original, whose control number its
reversal carries too, reaches the lines its correction is matched to; a reference to the latest correction reaches
that correction's lines alone, never a line only an earlier claim of the chain is matched to, #126 review F-M2-1); for
the pool, the chain's claims in the L6's remittance. A
taken-back draw is split over the lines holding the chain's interest, by what each holds (a holding below zero counts
as zero), never more than they hold; a take-back is cut to both what a line holds of the chain and the line's interest
as a whole (every chain's, and a match's that names none, together, net of corrections and take-backs), so it never
meets `ledger_interest_line_floor` when a specialist lowered another chain's entry on the line. One PLB L6 writes one
entry on a line, so its take-backs are written before its payments: a payment reaches the lines the take-backs left,
and when two chains' draws of opposite signs meet on a line no other line can take, the payment is the one left
unwritten, so the figure errs low, never above the cash (LED-24 `two-chains.835`). The payments also wait for the
take-backs (#126 review F1): while a take-back of a chain that may yet hold interest on a case line is not written
whole, the PLB L6 writes none of its payments, in this reconcile or a later one. A chain may yet hold interest when its
root is a reversal the moment links to no claim (its claim not uploaded yet, or one the loader cannot link) or a claim
of it has a standing claim match on a case line. The interest such a take-back is still to find arrives with a later
upload (a remittance dated earlier and uploaded later), and the take-back reaches the lines it lands on before any
payment of the L6 can, so the outcome is the one the remittances give uploaded in order (LED-24
`two-chains.835` then `paired.835`). A take-back of a chain that can come to hold no interest on a case line holds
nothing back. A chain can also come to a case line with no upload, after the PLB L6 wrote its payments: a person
matches a claim of it by hand (the reconciliation screen lists every adjusted payment no case line was found for), or
a written-off line is reopened. So a payment of a chain never goes to a line on which another PLB L6 still owes a
take-back of that chain and has an entry already (`interestOutOfReach`, #126 review MONEY-R4-1): that L6 never writes
on the line again, so its take-back could never follow the interest there. The interest goes to the chain's other
lines, where the take-back follows it, or nowhere, whatever brings the chain to the lines (LED-24 `unplaced.835`, then
`unplaced-two-chains.835`, then the person's match: 6.00, the cash, never 11.40). A line whose weight is zero takes
nothing now; a later reconcile credits it once it has a weight.

**Once (D6; `interestWrites`, pure).** For each L6 and sign, what is left is its draws under the current attribution
less the entries of that sign already written from it, gross (reversed ones included); for each L6 and chain, the
draw less what it already gave that chain. The reconcile writes the smaller, over lines the L6 has not yet reached. A
second reconcile writes nothing; a later one never splits an L6 past what it moved; when a later upload changes whom an
L6 names, what it gave stands and nothing more is written. Both caps, the line split and `allocated` are one
mutation-tested function, called once per L6.

**What an interest match carries (D7).** Both `provider_adjustment_id` (the L6) and `claim_id` (the claim of the
line's standing match), `remittance_id` the L6's; its evidence is the L6, so `ledger_match_standing` keeps one standing
match per L6 and line, and `ledger_entry_rules` is unchanged.

**Postgres holds the bounds (D8; the migration).** `ledger_match_rules()` refuses an interest match without its L6 of
its remittance and a claim ("interest is matched from a PLB L6 of its remittance, for a claim"), or whose claim the
line has no standing claim or interest match to ("interest reaches a line only through a claim the line has a standing
match to"). The new trigger `ledger_entry_within_interest()` refuses an interest entry whose evidence is not a PLB L6
of category `interest`; a positive entry past the L6's cash paid plus the interest its remittance reports taken back,
and a negative one past its cash taken back plus the interest its remittance reports paid; and a line's interest, net
of corrections and take-backs, below zero (constraint `ledger_interest_line_floor`, which also refuses a specialist's
adjustment that would go there). It takes the practice's `ledger:` advisory key, the one every ledger writer already
holds (`lockLedger`; ADR 0083). The attribution's hash link cannot be checked in SQL, so the worker attributes and
Postgres bounds the amounts; the worker checks each bound before it writes, and a refusal is a defect caught loudly.

**Interest taken back (D9)** is a negative interest entry; it reopens no case and notifies no one, and the line's
stage does not move. The principal a reversal takes back is still recouped as before.

**N1 (D10).** `allocated` is true only when the entry's amount is one of two or more nonzero parts of a pro-rata split.

**`ledger_match.seq` (D11).** `bigint GENERATED ALWAYS AS IDENTITY`, existing rows numbered in stored order, unique
within a practice by `ledger_match_by_seq`. Matches are inserted under the practice's ledger lock, so `seq` is the
order the ledger made them, within and across reconciles, with no ties. `ledgerMatches`, the reconcile's chain order
and the web's lists order by it; `matched_at` stays the transaction's time and is still shown.

**`claim_by_superseded` (D12)** is SUITE-CAP-1b's; this PR reads it (LED-25) and does not make it.

**Order within the pass (D13)** is kept: the attribution of every loaded remittance is computed first, then provider
adjustments are walked in today's order (`bpr16_date, created_at, position`), WOs and L6s interleaved. The query now
reads an L6 with no reference and skips an L6 of zero.

**Rows written before this change (D15)** are synthetic development rows (ADR 0067); they are not converted and stay
valid under the relaxed CHECK.

**The deploy window and a rollback (D16).** Migrations run before traffic moves (ADR 0049). The previous image's
reconcile writes a one-record interest match; `ledger_match_rules()` skips it (no row, no error) when the job writes
it, so that reconcile runs whole without interest, and the current image then credits the interest once. A person's
one-record interest match is refused. The migration takes `ledger_entry`'s and `ledger_match`'s ACCESS EXCLUSIVE locks
together with NOWAIT, once a second, up to five minutes, as SUITE-CAP-1b's migration takes its own (ADR 0083): a
refused try holds and queues nothing, so a reconcile caught between its read of `ledger_entry` and its read of
`ledger_match`, or a page reading them the other way round, goes on and is never deadlocked (40P01) or queued behind
it; if the tables stay in use for five minutes the migration fails before any service moves and the deploy is run
again. Once it holds both locks, the ledger's readers and writers wait for the rest of the migration (well under a
second at launch size), then proceed: a reconcile and a ledger action read at READ COMMITTED and proceed on the new
rows, while a page that reads at one snapshot (REPEATABLE READ: Reconciliation among them) whose snapshot began before
the locks were taken reads `ledger_match` as empty once, because adding `seq` rewrites it, and reads it whole on reload
(#126 review DB-C1).

**One moment's rows (D17).** One statement reads the practice's loaded remittances with their WO and nonzero L6 rows;
every later read of the attribution keeps only claims of those remittances and links between them, and an L6 whose
remittance is not given gets no draw. A remittance that commits during the reconcile changes nothing halfway, and no
lock is taken, so a load never waits for a reconcile.

**PRD 13** now reads, under the exception: "Interest the payer pays (PLB L6) is recorded as its own entry category
`interest`, against the case lines of the claims it is for (the claims the PLB L6 names, or, when it names none, those
its remittance reports interest on in AMT I, a claim's reversal and correction netted), positive when paid and negative
when the payer takes it back, and shown separately from recovered principal. Interest a claim reports (AMT I) that no
PLB L6 pays is shown as reported and counted nowhere."

## Options considered

- **Which record is the interest.** (a) AMT I, skipping an L6 that names a claim with AMT I: counts money not in the
  check and misses the unnamed L6. (b) Keep both and refuse a second interest match per claim and line by a unique
  index: stops neither the re-split nor AMT I with no money, and refuses a real second payment. (d) The smaller of the
  two per claim: drops money the payer paid and named. **(c) The L6 is the interest and AMT I attributes it: chosen**,
  so every interest figure is money in a check and traces to it.
- **An AMT I with no L6.** Credit it (not in the check, and credited twice when a later L6 pays it) or hold it for a
  person (who cannot make money appear). **Chosen: count it nowhere and show it as reported.**
- **An L6 that takes interest back.** Drop it (the net figure stays above what the practice kept) or list it for a
  person (wrong until someone acts, and the trace to the money is lost). **Chosen: a negative interest entry whose
  evidence is the L6, bounded in Postgres.**
- **The order of matches.** Renumber existing rows in today's reading order (two exceptions to the ledger's
  protections, for development rows), `clock_timestamp()` (ties unlikely, not impossible) or keep five tie-breaks (two
  readers ordered differently). **Chosen: an identity, existing rows in stored order.**
- **One pull request or several.** Two would recreate `ledger_match_rules()` twice and ask the founder twice.
  **Chosen: one** for the interest rule, N1 and `seq`; the index went with SUITE-CAP-1b, which merged it first. PR 15b's
  stored case close is not a ledger item and stays with PR 8's case schema.
- **A net L6 over several claims.** Each claim's AMT I alone (a net-zero pair takes another patient's interest), net per
  chain with one pool per sign (right in total, wrong on the lines), or proportional scaling (invents gross amounts).
  **Chosen: net per chain, exact when the pool equals the AMT I, otherwise only the net.**
- **Once per what.** Once per L6 and claim: a later upload re-attributes, Postgres refuses, and the practice's whole
  reconcile fails every day (review F1). **Chosen: once per L6 and sign, gross, with each chain's part as a second cap.**
- **The previous image.** Refusing its one-record match fails every reconcile with an AMT I claim on a case line until
  roll-forward (review F4). **Chosen: skip exactly that shape when the job writes it.**
- **A reference with several identifiers.** Hashing whole never reads "CLP01 CLP07 TRN02"; searching every claim's
  decrypted number inside it decrypts the practice's claims every reconcile with no payer example of the need.
  **Chosen: the whole reference, else its tokens, naming one chain or nothing.**

## What does not change

`LEDGER_STAGES`, the seven entry types and the stage CHECK; the definition of recovered (posted or deposited only) and
the proof cap; `roi_statement` and its rules; `ledger_entry_rules`, and the checks of `ledger_entry_within_evidence`
and `ledger_entry_within_line`; `posting_row` and `eft_row`; every principal amount (approved, posted, deposited,
recouped), the WO and reversal rules (the WO's naming included) and the matching of claims, postings and deposits; the
order the reconcile walks provider adjustments in; a person's reversal of a match (`reverseMatch` and its route; no
screen gains a reversal of an interest match); the parser and the loader, and so which reversal is linked to which
claim; LED-01 to LED-18's amounts; the ledger oracle's harness (it appends LED-23 and LED-24). Interest is never in
recovered; paid interest's weights stay `approvedRemaining`; interest on a line with nothing remaining stays dropped
(ADR 0067); ERA exports carry no interest. No table, policy, grant or PHI registry row changes. The exception covers
this one change; any other DDL on the frozen ledger tables still needs its own ruling, and each migration's reviewers
check by reading it.

## Consequences

- **PLB03-2 conventions vary.** A reference that names the claim by something other than CLP07, or runs identifiers
  together, names nothing and is shared by its remittance's AMT I; with neither, nothing is credited, an
  understatement, and the remittance page lists the L6. The worst case of a token matching another claim is one wrong
  chain of the same payer, bounded by the L6's amount.
- **A payer whose L6s do not equal its AMT I** gets the conservative reading: only the net moves.
- **A payer that reports AMT I and never sends the L6** loses that interest from the figure by design; the line shows
  the reported amount. An unnamed L6 later, in a check reporting no AMT I, is counted nowhere.
- **During the deploy and after a rollback** the previous worker credits no interest until the current one runs;
  nothing fails and nothing is written twice.
- **The first attribution stands.** When a later upload changes whom an L6 names, what it gave stays where it went,
  visible on the line. If a person judges an entry wrong, a contract specialist's adjustment on the ledger review
  lowers it with a reason; the L6 stays spent and its interest is never reattributed.
- **Rows written before the change** keep their double counts; only regenerated synthetic data holds them.
- **Negative interest** is read as a signed sum by the totals and the ROI statement; `<Money>` prints the minus. The
  totals note and the ROI statement's explanation say "net of any it took back" and "less any it took back".
- **A renumbered reversal adds no interest, though it stays unlinked.** A reversal the payer gives its own control
  number, naming the original in REF F8, is left unlinked by the loader, so it is a chain of its own. Beside its
  correction and another claim in one exact pool, the correction draws its interest again, but the reversal's take-back
  finds no line, so the PLB L6's payments wait (D5): no new interest, the chain's net. LED-23
  `renumbered-reversal.835` pins it. Its principal still has the gap (handed on below).
- **Payments that wait for good.** A take-back of a reversal whose claim is never uploaded (paid before the practice
  used the product, say), or of a chain whose interest landed on lines with nothing remaining, may never be written
  whole, so the payments its PLB L6 nets against it are never written: an understatement by up to those payments,
  never an overstatement, and each line still shows the interest its claims report.
- **A claim matched by hand after the netting.** When a person matches a claim to case lines after a PLB L6 netted
  its interest taken back against another chain's interest paid on them, the interest a PLB L6 pays that claim never
  goes to those lines, which hold the netting L6's entry already: its take-back could not follow it there. The figure
  stays the cash (LED-24 `unplaced.835`: 6.00). Matched before the netting PLB L6 is uploaded, the take-back is
  written on the lines and the payment is not, as in `two-chains.835`: an understatement by up to the payment, never
  an overstatement. Which of the two the practice sees depends on when the person matched; neither is above the
  cash.
- **Two chains on one line, netted in one PLB L6.** A correction the payer sends under its own control number with no
  REF F8, before the reversal it would follow, is left unlinked by the loader, so it is a chain of its own on the same
  case lines. When one PLB L6 nets its interest paid against the linked chain's interest taken back, the take-back is
  written there and the payment, which only those lines could take, is not: an understatement by up to the payment,
  never an overstatement, and a later take-back of the unlinked chain finds nothing to take. Uploaded before the
  remittance paying the linked chain's interest, the PLB L6 writes nothing until that interest is on the lines, and
  then the same. LED-24 `two-chains.835` pins both orders; a loader that links such a correction lets the payment
  reach the lines.
- **At size.** The reconcile walks every PLB L6 of the practice's history on every pass, so its interest path reads
  each claim's standing claim matches, each PLB L6's entries and each line's holdings through lookups built once a pass
  and kept current as it writes, never every case line against every match for each draw, nor every interest entry
  for each PLB L6 that takes interest back (#126 review F-M2-2). CAS-42.3's 2,000-line pass carries the implementation
  guide's interest shape (AMT I on every correction, one PLB L6 per check) and a later check taking each claim's
  interest back by a PLB L6 naming its correction, so it walks 2,100 PLB L6s, 2,000 of them take-backs, and stays
  within its 150 s budget (26.9 s locally; 33.7 s when each take-back rebuilt the holdings).
- **Lock alignment.** The new trigger takes the practice's `ledger:` key, the key SUITE-CAP-1b moved the other two
  ledger triggers to, so a writer holding `lockLedger` takes no new lock slot.

## Out of scope, handed on

- **PR 15b's stored case close** ("payer corrected; balance is the patient's"): PR 8's case schema, as LANES.md has it.
- **The ledger freeze guard test** (reconciliation-001.md, PR 8): reviewers check by reading until PR 8 builds it; it
  lists this migration as granted.
- **Interest inside CLP04** (a negative claim-level CAS balancing interest folded into the claim's payment): counted
  once, as principal, because AMT I alone credits nothing. Moving it to interest would change a principal amount; a
  question for the payment-engine reviewer and a later ledger item.
- **A reversal the payer renumbered** (its own CLP07, REF F8 naming an earlier claim of the chain): the parser never
  reads a status-22 claim's REF F8 and the loader looks a reversal up by its own control number alone. The fix links
  such a reversal into the chain its REF F8 names when its own number reaches no claim, never REF F8 first. It is a
  separate defect in `packages/edi835` and `apps/worker/src/parse`, needs no migration, changes recouped principal
  (frozen here), and needs no change to this PR: LED-23 `renumbered-reversal.835`'s interest is already none, and only
  its links change. Recommended as the next Lane B item, its design asking the founder whether the freeze reaches the
  loader's links.
- **A WO's reference** is still hashed whole; reading its identifiers changes the WO rule, a follow-up ledger item if a
  payer's WO carries several.
- **`provider_adjustment.reference` is stored in plain text** although ADR 0027 calls a claim reference PHI: an
  encrypted column and its hash need a Lane A migration; recorded for the next security review.
- **An L6 or WO no case line takes is invisible on Reconciliation**; a "for no case" view is a product proposal.
- **Interest on a line with nothing remaining** stays dropped (ADR 0067).

## Revisit when

- The loader links a renumbered reversal: LED-23 `renumbered-reversal.835`'s links change and its interest stays none,
  now as one chain's net.
- The loader links a correction with no REF F8 that comes before its reversal: LED-24 `two-chains.835`'s payment then
  reaches the lines as one chain's net.
- A payer's PLB03-2 is seen naming a claim by something other than CLP07 or with identifiers run together.
- `provider_adjustment.reference` is encrypted: the token split then runs on the decrypted reference in memory.
- A ruling moves interest folded into CLP04 out of principal.
