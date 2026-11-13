# Review M (money): schema PR 5, ledger-freeze batch (co-001/ledger-freeze-batch @ e2a56dc3, base 1f652b6f)

Result: no BLOCKER and no MAJOR. Two MINOR findings, both in tests, and three NOTES. The granted bodies on a freshly migrated database match the hashes in the domain model.

## Findings

### F1 MINOR: a test compares bigint cents as JS numbers
- Where: apps/worker/src/reconcile/statement-paths.db.test.ts:128 (also :124), via test-support/four-key-writer.ts:78 (`to_jsonb(s) - ... AS rest`).
- The claim: `to_jsonb()` turns every bigint *_cents column into a JSON number, so node-postgres parses it as a float. Line 128 then asserts `rest.actionable_open_cents` toBe `Number(<bigint sum>)`, and line 124 compares the whole `rest` object as floats. This is test-only. No amount is stored or shown this way. But it breaks rule 2 inside an assertion, and above 2^53 cents two different sums could compare equal.
- PROOF: from reading the code (grep shows `toBe(Number(now.plain.reduce(... BigInt(...) ...)))`). No run makes it fail, because realistic sums are far below 2^53.
- Fix: in STORED, select the cents as text: `to_jsonb(s) - ... ` → build `rest` with `s.actionable_open_cents::text` and the other cents columns cast to text, or compare `String(rest.actionable_open_cents)` with `sum.toString()`. Drop the `Number(...)`.

### F2 MINOR: new behavior has no golden line and no property test
- Where: the diff (no fast-check or fc.property anywhere in `git diff 1f652b6f HEAD`; nothing under fixtures/golden).
- The claim: the new invariant (stored figure = sum of variance of the listed lines, each once, each a line of a listed case) is checked on fixture worlds, on seeded generated worlds (statement-lines.db.test.ts:350, statement-paths.db.test.ts:86) and on hand-built refusals (T6/T7). There is no property test that generates arbitrary case and line states (reopened, stale, written off, null or negative variance, empty case) and asserts writer figure = ACTIONABLE_NOW = sum over the list. A golden line arguably does not apply, because no priced amount changes. LED-26..28 are synthetic expected.json files, not golden lines.
- PROOF: `git diff 1f652b6f HEAD | grep -c "fast-check\|fc\.assert\|fc\.property"` → 0; `git diff --stat 1f652b6f HEAD -- fixtures/golden` → empty.
- Fix: add one fast-check property over a small synthetic world generator asserting the three-way equality. Or record in ADR 0082 why the seeded generated-world test stands in for it.

### N1 NOTE: a line with NULL variance can be listed while adding nothing
- Where: apps/worker/src/triage/actionable-now.ts:100-101; packages/db/functions/roi_statement_rules.sql (the new block, `coalesce(sum(m.variance_cents),0)`).
- priced_line.variance_cents is nullable (packages/db/src/schema/pricing.ts:116), and case_line_belongs() does not refuse an unpriced priced line. If such a line ever reached actionable with the check current, it would be listed while adding nothing. The writer's figure, ACTIONABLE_NOW and the trigger all skip NULL in the same way (sum ignores NULL; all-NULL → coalesce 0), so they still agree. It is a trace oddity only, not a money break. Unproven that this state can occur: triage flags only lines with a variance.
- Optional fix (writer side, no grant needed): add `AND y.variance_cents IS NOT NULL` to the line_ids FILTER. That would need the same change in the plain-path reference, so better left as is unless the state proves reachable.

### N2 NOTE: legacy `{}` links would now read as four nulls
- Where: apps/worker/src/reconcile/print.ts:85 (jsonb_build_object reader).
- A pre-migration row whose links was `{}` (the old roi_links_valid returned NULL on it, so the CHECK let it through) would now read as `{recovered:null,...}` instead of `{}`. The migration refuses to apply while any such row exists (migration lines 137-181: preflight counts `roi_links_valid(s.links) IS NOT TRUE` in every practice and raises). After it, the new body (`coalesce(...,'{}') IN (...)`) refuses `{}`. So no reader can meet one. Not a fault.

### N3 NOTE: the accepted limit is no worse than recorded
- The trigger checks the sum and the cases, not the choice of lines. A stale or written-off line of a listed case with a matching figure is stored (statement-lines.db.test.ts:509-515, on record).
- Every other variant is refused:
  - another practice's line: `p.practice_id = NEW.practice_id` leaves it unfound, so found < linked.
  - a line of an unlisted case: the case_id IN actionable_open filter.
  - a line listed twice: linked counts duplicates, i is DISTINCT, so found < linked.
  - a non-priced-line UUID.
  - a re-priced sibling not on any case: the case_line lookup requires `l.priced_line_id = p.id`.
  - an empty list with a nonzero figure.
  - all of these are covered in T6/T7 (statement-lines.db.test.ts:437-500).
- Negative variance: accepted iff the figure includes it, which matches ACTIONABLE_NOW (no clamping in roiStatement, packages/ledger/src/roi.ts:108). A listed case could be "balanced" with a hand-picked +/- subset of its own lines. That is the same accepted limit, not a new one.
- The scalar subquery for case_id cannot raise "more than one row": case_line_once is UNIQUE(service_line_id) (packages/db/src/schema/triage.ts:166), and case_line_belongs() ties priced_line to its own service line.

## Confirmed sound (with evidence)

1. **The one-pass figure equals ACTIONABLE_NOW and the plain path.**
   - Same rows: case_line JOIN priced_line, practice-scoped.
   - Same predicate: ACTIONABLE_NOW_LINE. LATEST_STAGE as a scalar subquery and LEFT JOIN LATERAL st give the same value, with NULL before any event → false.
   - Same amount (variance_cents) and same coalesce(...,0). No date arithmetic is involved.
   - A reopened line enters by its latest line_status. A re-priced line: case_line.priced_line_id is immutable (case_line_rules), so the old priced line goes stale through priced_line_pricing_check and both paths drop it.
   - A case with no lines yields one row: 0 and '{}'. An RLS-hidden priced line drops out of the inner join in both paths.
   - Test run on a fresh cluster: `DATABASE_URL=...5433/postgres npx vitest run --project db statement-lines statement-paths actionable-now.db` → 3 files, 13 tests passed. Unit (`actionable-now.test.ts` + reconcile/) → 8 files, 48 passed. T16 holds ACTIONABLE_NOW byte-identical to base.
2. **Snapshot.** Figure and list come from one SELECT, and priced_line_pricing_check is STABLE (provolatile 's', checked in pg_proc), so they share one snapshot. Each line's predicate is computed once, behind OFFSET 0. The trigger reads only priced_line (immutable) and case_line (its link columns immutable, never deleted: T15c). A later snapshot at INSERT therefore cannot flip the verdict. Two concurrent runs: the singleton key plus the ON CONFLICT on the quarter; no money effect.
3. **`?? []` in statements.ts:169.** links.actionableOpen is `openCases.map(caseId)` (packages/ledger/src/roi.ts:115), built from the same `open` rows as the map, so every key is present and the fallback is dead code. If it ever fired, the database would refuse a nonzero figure (wanted). A zero-figure case contributes no lines either way. It cannot silently store a wrong figure.
4. **Types.** sum(bigint) gives numeric, cast `::text`, then parseCents (canonical integer text → BigInt), then sumCents (bigint). Insert uses `.toString()`. line_ids is `::text[]`. No Number/parseFloat/`+x` on an amount in production code (grep of the diff). No new rounding; no stage or amount is written.
5. **Readers.** STATEMENT_COLUMNS (print.ts) is the one select used by the print job and the web (apps/web/src/lib/reconciliation/queries.ts:11,748). It projects exactly the four keys, so figures are unchanged to the cent. The web diff is test-only (statement-readers.db.test.ts checks the same bytes for the twins with and without the list).
6. **Recovered/interest rules unchanged.** The roi_statement_rules diff adds only `lines record`, the new IF block, and `SET plan_cache_mode`. The recovered/interest/linked=found checks are byte-for-byte base, so nothing counts as recovered without a posted or deposited ledger_entry beyond what base enforced.
7. **Granted bodies.** I created rm_fresh, ran `tsx packages/db/src/cli/migrate.ts --dev-login` (all migrations through 20261115090000 applied), then queried pg_proc:
   - roi_links_valid → 13c4dd46b9203095
   - roi_statement_rules → ad925199131cb411, proconfig `{search_path=pg_catalog, public, pg_temp, plan_cache_mode=force_custom_plan}`, not SECURITY DEFINER
   - the hashes match the headers and docs/product/domain-model.md (grep count 2)
   - rm_fresh dropped afterwards
   - nothing NEEDS GRANT/MIGRATION
