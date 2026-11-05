## What changes

Slice 1 of narrative figures as placeholders bound to the facts (`designs/lane-b-packet-figure-placeholders.md` on `claude/build-ops`, section 9): the catalog every future `{{fact:<id>}}` token will name, and the code that renders a fact as text. **Nothing emits a token yet**, so nothing a person or a payer sees changes.

- **The catalog** (`packages/packets/src/fact-catalog.ts`): every fact a narrative may name, built from the version's content alone, each with its id, kind, role, scope, rows, value, phrase and whether a model may use it. Ids are canonical, so one value has one id: the pattern, a code (CPT/HCPCS shape, lowercase), a claim (by its first row), a line, or `lines.a+b` in ascending rows. A lower-precedence spelling fails as `fact_not_canonical` naming the canonical id; an id the content does not hold, as `unknown_fact`. An id is at most 96 characters; a row set whose id would pass that has none.
- **Sums are code's:** the pattern's and a code's totals are the stored values; a claim's and a row set's are summed in bigint cents and exact decimal units, and a property test ties them to the stored totals.
- **The renderer** (`render.ts`, words in `fact-words.ts`): `renderFacts` gives segments and a span map; rendering is idempotent; identifier placeholders are kept.
- **`narrativeFacts`** is rebuilt from the catalog and held equal to the previous builder (kept as a test-support copy) on every ADR 0086 content, on generated packets and on versions whose stored totals differ from their rows.
- **`@tp/money` `formatUsdPlain`:** USD without locale data, golden-tested against `formatUsd` en-US.
- **`WORDS_VERSION`** also hashes the fact words and `formatUsdPlain`'s output; `RENDERER_REVISION` is 5.
- **Mutation:** a new shard `packets-figures` (fact-catalog.ts, fact-words.ts, render.ts), in `stryker/shards.json`, its tests, `docs/runbooks/ci.md`'s table and the watched paths.
- **CAS-55** (render half) in the test matrix and the synth matrix, with its registry entry and fixture.

## Why

ADR 0086's known limit (#84): a total stated "in total" in a sentence that names a part of the lines in words the verifier's triggers do not hold still passes, at the base and after #84. The decision (Lane A's orchestrator, 2026-11-04): code computes every figure a narrative carries (CLAUDE.md rule 1), so figures become placeholders bound to fact ids and rendered by code, and free-text numbers in a model's narrative are refused. This slice builds the catalog and renderer the later slices use.

## What it does not change

- Pricing engine (`packages/pricing`): unchanged.
- Ledger (`packages/ledger`): unchanged.
- Database schema and migrations: unchanged; no migration (the verifier `/3` migration is slice 3, Lane A's).
- Content releases (`content/`): unchanged.
- Domain model (`docs/product/domain-model.md`), its approval line and `approvers.json`: unchanged.
- CI and the GitHub settings: no workflow change; the mutation shard list gains `packets-figures`.
- Nothing emits a token: no prompt, verifier format, worker, web or export change. ADR 0089 comes with slice 2.

## Checks

| Command | Result |
| --- | --- |
| The one full local suite on 623e71e9 (slice 1 + the base f185655c, merged clean) | typecheck, lint, lint:copy, lint:logs, check:fixtures, verify-content, db:domain-model --check pass; unit 470 files, 9,361 passed; test:golden, test:oracle (689 fixtures) pass; test:db 4 shards on PG18, 9,814 passed; build and stamp pass; e2e 81 passed |
| Mutation, every packets shard and money-ledger (local, with canary) | money-ledger 5m36s; packets-scan 7m20s, roles 9m33s, roles-cues 5m53s, roles-numbers 8m00s, words-labels 6m08s, words-amounts 5m17s, words-days 4m45s, words-dates 4m08s, words-prose 6m02s, verifier 10m02s, facts 8m05s, rest 7m22s, explain 12m07s, figures 7m04s; gate passes: packets 99.11% (the 88 undetected all recorded equivalents), ledger 98.48%, money 96.81%; packets-figures 100% |
| Properties | the catalog's, the facts' and formatUsdPlain's, each over 40 seeds, 0 failures |
| narrativeFacts unchanged | held equal to the previous builder on every ADR 0086 content, generated packets and diverging stored totals; the packets, gateway narrative-roles and ADR 0086 REVIEWED tests pass unchanged |

## Reviewer agents' findings

Three adversarial reviews, each finding checked by two skeptics (reproduce; intent and scope). Records: `approval-summaries/lane-b-packet-figure-placeholders-status.md`.

| Reviewer | Finding | Resolution |
| --- | --- | --- |
| Money A (payment-engine checklist) | MONEY-A-1: CAS-55's render half claimed browser/worker equality of formatUsdPlain with no browser test | Fixed in ceb37b26 |
| Money B (payment-engine checklist, ids) | MONEY-B-1: `canonicalFactId` could return a `lines.*` id longer than the grammar allows; MONEY-B-3 (nit): row keys in exponent notation read as rows | Fixed in ceb37b26; the bound is in the design |
| Money B | MONEY-B-2, MONEY-B-4 (nits) | Refuted by the skeptics |
| Correctness and maintainability | CORRECTNESS-1: a line-count figure named the whole schedule with no rows; -2: the over-long id (as MONEY-B-1); -3: part counts and dates had no scope; -5 (nit, as MONEY-B-3); -6 (nit): the runbook's shard count | Fixed in ceb37b26 |
| Correctness | CORRECTNESS-4, CORRECTNESS-7 | Not confirmed by both skeptics |
| Recheck of ceb37b26 | every confirmed finding fixed; no new finding | — |

## Freeze exception

No: it changes none of them. The change is in `packages/packets` and `@tp/money`'s formatting, outside the frozen engine and ledger arithmetic.

## Domain model

No migration; the document is unchanged.
