## 6. Application changes

### 6.1 `packages/ledger` (pure, mutation-tested)

- **New `packages/ledger/src/interest.ts`.** The arithmetic of D2 to D6 and D10, so it is mutation-tested
  (`apps/worker/src/reconcile` is not; 15b design section 6). Every amount is `Cents` (bigint); nothing divides but
  `allocateByWeight`, which takes sizes (a negative draw is split by its size and negated back); every function throws
  `LedgerError` on a zero L6, a zero `a`, a negative weight or a write past what is left.
  - `referenceCandidates(reference)`: the whole reference, then its tokens (D2), in order and without repeats. The
    worker hashes each; the function never sees a hash or a claim.
  - `remittanceInterest({ adjustments, chains })` for one remittance (D4). `adjustments`: each L6's `id`, `position`,
    `cashCents` (positive paid, negative taken back), `namedChain` (the chain its reference names, or null) and
    `namedChainInRemittance`. `chains`: each chain of the remittance with AMT I, its `chain` and `reportedCents`
    (signed, netted per D3). Returns `draws` (`adjustmentId`, `chain`, `cents` signed, `shared`: the chain's amount was
    a share of a short pool) and `unattributed` (`adjustmentId`, `cents`).
  - `interestLeft({ draws, written })`: for each L6 and sign, and for each L6 and chain, what is left (D6), from the
    draws and the interest entries already written (`adjustmentId`, `chain`, `cents`), gross.
  - `interestToLines({ leftCents, shared, lines })`, `lines` each `serviceLineId`, `weight`, `matched`: splits
    `leftCents` (signed; zero gives nothing) over the lines not yet matched to the L6 whose weight is above zero, by
    `allocateByWeight`; a negative amount is first cut to the weights' sum (what the lines hold), so no part passes
    its line's weight. Each part is flagged `allocated` when `shared` or when two or more lines took nonzero parts
    (D10).
  - `interestHeld(entries, chainOfMatch)`: what each line holds of each chain, its interest entries from matches naming
    a claim of the chain, net of their corrections (`correctedEntry`) and of take-backs; the weights of a take-back.
- **`stages.ts`.** `STAGE_SIGN.interest` becomes `'signed'`. In `entryProblems`, a zero signed amount reads "an
  adjustment changes an amount" for an adjustment, as today, and "an interest entry moves an amount" for interest.
  `STAGE_EVIDENCE.interest`'s comment: "A PLB L6, paid or taken back; a claim (AMT I) only on entries written before
  docs/adr/0084." The arrays themselves are unchanged.
- **`index.ts`** exports the functions and their types. **`stryker/shards.json`** adds
  `packages/ledger/src/interest.ts` to the `money-ledger` shard's ledger list (`tools/stryker/shards.test.ts` holds
  every mutated file to exactly one shard). Target: 100% mutation score on `interest.ts`, as `payment.ts` holds.
- `totals.ts`, `roi.ts` and `statement.ts` need no change: they sum signed amounts, so "interest" becomes net of
  take-backs by itself.

### 6.2 The reconcile (`apps/worker/src/reconcile`)

- **`rem`**:
  - `providerAdjustments` reads L6s with no reference too: `(a.category = 'recoupment' AND a.reference IS NOT NULL)
    OR a.category = 'interest'` (`rem:788-793`), in the same order (D13). Its WO branch is unchanged.
  - Before the loop, a new `interestAttribution` reads, scoped by `practice_id`: every claim with `interest_cents <> 0`
    of the practice's loaded remittances (`id, remittance_id, interest_cents, claim_status_code`); each such claim's
    chain root and each claim a reference reaches (one recursive query up `reversal_of_claim_id` and back along
    `superseded_by_claim_id`, served by `claim_by_reversed` and `claim_by_superseded`); and the claims each L6's
    reference candidates reach (`referenceCandidates`, hashed with `cipher.lookupHash`, looked up by
    `claim_by_payer_claim_control_number`). It calls `remittanceInterest` for each remittance and keeps the draws by
    L6.
  - In the loop, an L6 calls a new `recordInterest` in place of today's (`rem:836-841`, `rem:863-910`): for each of
    the L6's draws, its lines (D5: the claim matches and their outcomes from `matches`; for a take-back,
    `interestHeld` over the entries read at the start and those this pass wrote), `interestLeft` and
    `interestToLines`; then each part with `insertMatch({ kind: 'interest', claimId, providerAdjustmentId,
    remittanceId: <the L6's>, serviceLineId, allocated, matchedBy: null })` (a `NewInterestMatch`, which requires both
    IDs) and `insertEntry({ stage: 'interest', amountCents, evidenceKind: 'provider_adjustment', evidenceId: <the L6>,
    matchId, allocated, createdBy: null })`. It keeps what it wrote, so a later L6 or draw of the same pass counts it.
  - `claimInterest` (`rem:845-860`) is removed: AMT I credits nothing by itself (D1).
  - `Counts` gains `interestTakenBack` (entries below zero); `interest` counts the positive ones. The job logs no new
    field (`job.ts:61-65` logs no counts), so `packages/observability/src/fields.ts`, a #42 file, is untouched.
  - `CHAIN_ORDER` orders by `m.seq` alone and still returns `matched_at`, which `reversalRule` compares with a
    reversal's load time (`rem:400`, `:488`). Its comment says the order is the ledger's own.
  - `everMatched` is unchanged; the interest path calls it with the L6's ID.
- **`rled`**: `ledgerMatches` orders by `m.seq` (`:103`). `insertMatch` keeps its SQL: a match with both IDs has the L6
  as its `evidence_id`, so `ON CONFLICT (kind, evidence_id, service_line_id)` is still the arbiter.
- **`statement-html.ts:114`**: the printed statement's interest sentence (section 7), with its assertion in
  `apps/worker/src/report/brand.test.ts:144`.
- **`pass.ts`**: the summary type carries `interestTakenBack`.
- No reference, token, claim number or amount is logged; the job's log fields are unchanged (`pnpm lint:logs`).

### 6.3 The web

- **`wq`**: the line's matches and the remittance's cash matches order by `m.seq` (`:482`, `:485`). `MATCH_SELECT`
  reads, for an interest match, whether its entry is below zero, and `MatchView` gains `takesBack: boolean` (by the
  entry's sign, not the L6's: one L6 may carry both, D1). The line view gains `reportedInterest`: each standing claim
  match of the line whose claim has `interest_cents > 0`, with the remittance's trace, payer and paid date and the
  amount, read from stored rows.
- **`page`**: the interest words of `MatchItem` (`:76`), the reported interest under the Interest list, and the
  section shown when the line has recoupments, interest or reported interest (`:191`). Words in section 7.
- **`apps/web/src/components/reconciliation/display.tsx:88`**: the totals tile's note.
- **`apps/web/src/app/p/[practiceId]/reports/roi/[statementId]/page.tsx:108`**: the ROI statement page's interest
  note, the same sentence as the printed statement's (section 7), so screen and paper agree.
- **`apps/web/src/lib/routes/specialist.ts:128-129`**: `ADJUSTMENT_CONSEQUENCE`.
- **`apps/web/src/lib/routes/reconciliation.ts`, `reverseMatchAction`** maps Postgres's refusal named
  `ledger_interest_line_floor` (the line-floor RAISE carries that constraint name, as `submit_screening`'s coded
  refusals do) to an input error on `matchId` (section 7), as `adjustEntryAction` maps its check violations to the
  amount (`specialist.ts:154-158`); any other error is left as it is. The page never offers a reversal of an interest
  match (`page:84`); the route still accepts one, which is how a person undoes an attribution they judge wrong.
- **`apps/web/src/lib/routes/test-support/ledger-world.ts:94-143`** seeds its 0.50 of interest as a PLB L6 of the
  adjusted remittance naming the adjusted claim, matched with both IDs; a claim-only interest match is not written now.

### 6.4 Mutations

No route, server action or permission is added. Interest is written only by the reconcile job, in its practice-scoped
transaction under `lockLedger`, in no one's name, and the ledger rows are its record (the job writes no audit event
today and gains none). Two person actions reach interest entries and keep their Zod schema, role check, practice-scoped
transaction and audit event as they are:
- **Reverse a match** (`reverseMatchAction`, `posting.reconcile`, audit `reconciliation_reversal`): checked in the
  handler (`manual.ts:46-50`, permission and the ledger lock) and in Postgres (`ledger_match_rules`' UPDATE branch,
  then the reversal entries through `ledger_entry_rules`, `_within_line` and now `_within_interest`).
- **Adjust an entry** (`adjustEntryAction`, `ledger.adjust`, audit `reconciliation_adjustment`): the same, and
  `ledger_entry_within_line` already holds an interest adjustment between zero and the entry's own amount.
New in Postgres for both: neither may leave a line's interest below zero once the payer has taken some back.

---
