## 10. What the founder must approve or rule

Only two things, both kept for the founder by CLAUDE.md and LANES.md (the domain model's approval, and a freeze
exception, which here also changes PRD 13's ruled wording). Everything else in this design is an engineering or
wording choice inside them, taken as recommended under the standing rule. No legal text changes, and no founder
ruling is reversed.

### 10.1 The ledger freeze exception (needed before the build starts)

Proposed text, ready to grant as it stands. SUITE-CAP-1's design asks for its own ledger exception (its Q1, the lock
key of `ledger_entry_within_evidence()` and `ledger_entry_within_line()`); the two touch different functions and can
be granted together, and whichever PR lands second builds on the first's bodies.

> **Ledger freeze exception, interest credited once (Lane A, `co-001/ledger-interest-once`, docs/adr/0084).** Granted
> for one pull request into `claude/build-platform`, an exception to reconciliation-001's "Ledger semantics" covering
> exactly:
>
> **DDL** (one migration): the interest branch of `ledger_match_evidence` takes one or both of `claim_id` and
> `provider_adjustment_id`; `ledger_match.seq` (an identity) and the unique index `ledger_match_by_seq`;
> `ledger_match_rules()` recreated with `seq` among the columns that never change, the reconcile job's interest match
> carrying only one of the two records skipped, and the new interest rules; `ledger_entry_sign` allows a negative
> interest entry; the trigger `ledger_entry_within_interest` on `ledger_entry`; and the index `claim_by_superseded` on
> `claim` unless SUITE-CAP-1 has made it.
>
> **Behaviour:**
> 1. Interest is credited only from a PLB L6, once per PLB L6 and case line, never past what its attribution gives it
>    however many reconciles run or later uploads change; a claim's AMT I never credits interest by itself.
> 2. A PLB L6 names a claim by its whole reference or, failing that, by one of the identifiers in it. One that names
>    none is attributed by its remittance's AMT I, netted per claim and its reversals and corrections: exactly when the
>    PLB L6s equal that AMT I, otherwise never past what each reports and only in the net's direction. A named PLB L6
>    above its claim's AMT I first pays the remittance's other reported interest.
> 3. AMT I with no PLB L6 paying it counts nowhere and is shown as reported.
> 4. A PLB L6 that takes interest back writes a negative interest entry against the lines holding that claim's
>    interest, never below zero on a line; one PLB L6 may carry entries of both signs when it nets interest paid
>    against interest taken back; PRD 13's sentence on interest is replaced by the text in this design's section 9.2.
> 5. An entry is flagged allocated only when its amount is one of two or more parts of a pro-rata split (N1).
> 6. Matches are read in `ledger_match.seq` order, which is the order reversal take-backs walk a line's chain in.
> 7. Postgres refuses an interest match without its PLB L6 and a claim the line has a standing match to, an interest
>    entry whose evidence is not a PLB L6, an entry past its PLB L6's bound either way, and a line's interest below
>    zero; it skips, without error, the reconcile job's interest match that carries only one of the two records, so
>    the image before this change reconciles without interest during the deploy and after a rollback.
>
> **Files:** that migration; `packages/ledger/src/interest.ts` (new) and its tests, `stages.ts` (`STAGE_SIGN.interest`
> and the zero-amount problem's words), `stages.test.ts`, `rules.test.ts` and `index.ts`; `stryker/shards.json`; in
> `apps/worker/src/reconcile`, `remittances.ts` (the interest path, the L6 query and `CHAIN_ORDER`), `ledger.ts`
> (`ledgerMatches`' order and the interest match's type), `pass.ts` and `statement-html.ts`, with
> `apps/worker/src/report/brand.test.ts`'s assertion of that sentence; the web's reconciliation queries, page, totals
> note, adjustment consequence and reverse route, and the ROI statement page's interest note; the Drizzle mirror;
> LED-16's fixture (its PLB L6) and the tests of LED-16 and PAR-18 (`payment-terms.db.test.ts`, `ledger.db.test.ts`;
> their evidence); the ledger oracle (LED-23 and LED-24 appended); ADR 0042, ADR 0067, ADR 0084, PRD 13 and
> reconciliation-001.
>
> **Stays frozen:** `LEDGER_STAGES`, the seven entry types and the stage CHECK; the definition of recovered and the
> proof cap; `roi_statement` and its rules; `ledger_entry_rules`, and the checks of `ledger_entry_within_evidence` and
> `ledger_entry_within_line` (SUITE-CAP-1's own exception changes only their lock key); `posting_row` and `eft_row`;
> every principal amount (approved, posted, deposited, recouped), the WO and reversal rules (the WO's naming
> included) and the matching of claims, postings and deposits; the order the reconcile walks provider adjustments in;
> LED-01 to LED-18's amounts; the ledger oracle's harness.

Without behaviour 4, the build drops the take-back (option 3.3 (a), as today) and the rest stands; without behaviour 6,
`seq` and its readers come out; the other behaviours are the defect's fix and stand or fall together.

### 10.2 The domain model (when the pull request is ready)

The founder's approval of the regenerated `docs/product/domain-model.md` by its SHA-256, through an APPROVED review of
the pull request's latest commit (CO-02; ADR 0063). The PR's description carries the summary since the base and the
function diffs (`ledger_match_rules`, `ledger_entry_within_interest`).

---
