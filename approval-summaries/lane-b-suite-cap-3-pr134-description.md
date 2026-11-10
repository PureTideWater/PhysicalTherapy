## What changes

SUITE-CAP-3, reconcile at real size (`designs/lane-b-suite-cap-3-reconcile.md` on `claude/build-ops`, reviewed in seven rounds, verdict build). A reconcile pass now reads per pass, not per open line. On the base each open case line searched for its claims on its own (two candidate queries a line a round, two `claimLines` reads a line, every claim of a code and date decrypted once for each line of it) and each stage event was its own insert that refreshed the line's whole case, so a pass grew close to N squared. Now the pass finds every open line's candidates together, reads each claim's lines once, decrypts each claim once, and writes its stage events in one statement. Worker-side only: no migration, index, table or SQL function. Nothing a person reads changes, and no matching rule, filter, amount, stage, outcome, write order or recovered total changes.

- **The candidate search** (`apps/worker/src/reconcile/remittances.ts`, D1, D2, D11, D16): per round one statement by payer claim control number for every line still searching (`controlCandidates`), and once a pass the patient search in two statements (`patientCandidates`): (a) the claims some line's own query would have returned, each decrypted once, with no column of any service line; (b) one over only the (claim, line) pairs already equal by patient control number. The filters are the per-line query's, every table alias held to the practice. No search statement names `ledger_match`: the "never claim-matched to this line" exclusion comes from the pass's own set of claim matches, read before any write. `candidatesFor`, `candidateClosure` and `chainOrdered` leave the production code (the reference keeps today's text); `claimLines`' SQL is unchanged word for word.
- **The stage write** (`stages.ts`, D3): `insertStages` writes a pass's events in one `INSERT … SELECT … FROM unnest(…) WITH ORDINALITY … ORDER BY n`, in today's order, under a savepoint that re-issues the same statement on a deadlock (`40P01`), at most twice more, so a person's reopen crossing the pass never costs the pass.
- **The smaller loops** (`remittances.ts`, `postings.ts`, D5 to D7, D15): `lineChain` reads standing matches from an index built once per context; `settleMatches` keeps a running sum per check (`checkPostedBefore`); a pass reads and decrypts each remittance's claims once for its posting rows; the never-matched posting and EFT rows are found by one practice-scoped server-side `EXCEPT` and then read by ID in today's order.
- **The reference** (D13): today's per-line step, word for word, is kept as test support (`apps/worker/src/reconcile/test-support/per-line.ts`, `referencePass`), and no production file may import it (a `no-restricted-imports` pattern in `eslint.config.js`, held by `per-line-import.test.ts`).
- **The weekly release-capacity run** (D14, as ruled): step 7b reconciles practice F at 10,000 lines at full size (600 at the smoke size), sized for attempt 1 to complete within 360 s; the Known gap line's fixed words (as approved on 2026-11-07) now name A's full month's measured figure and the ledger trigger fixes as what holds it; CAS-42.3's `PASS_BUDGET_MS` goes from 150,000 to 60,000 (2,000 lines kept); `docs/runbooks/ci.md` says the same.
- **Tests:** CAS-49 (the pass writes what the per-line pass wrote: CAS-49.1 on 25 generated worlds with twenty-three mutants, CAS-49.2 on LED-01 to LED-18's own worlds (`pass-equality-led.db.test.ts`: the LED tests run again, unchanged, each of their 207 reconciles run by the per-line reference on a copy of the world and by the pass on the world itself, the writes compared), CAS-49.3 the one-statement stage order, CAS-49.4 the manual actions, CAS-49.5 the chain index, CAS-49.6 the two-session deadlock retry), CAS-50 (between 200 and 800 lines the candidate searches and claim-line reads stay a fixed number of statements, none names `ledger_match`, the stage events are one statement, and each claim is decrypted at most once a phase), CAS-51 (a real-size pass in spreads R, F and A at 500 and 2,000 lines, within budget and at most 1.5 times as slow a line at 2,000 as at 500); `settle-order.test.ts` and `stages.test.ts` (unit). `vitest.config.ts`'s `SLOW_FIRST` gains `pass-equality`, `pass-equality-led` and `pass.large`; `tools/test/db-shards.test.ts` counts 20.
- **Documents:** ADR 0087 ("A reconcile pass reads per pass, never per open line, and writes in the order the rules define"), a dated note in ADR 0083, the CAS-49 to CAS-51 rows in the test matrix, `matrix.ts` and `registry.ts`, and their generated `fixtures/synthetic/CAS-49..51/expected.json` (metadata only).

**Measured, base against this change** (SYNTHETIC rows, a private PostgreSQL 18 cluster, 4 CPUs; the base is `claude/build-platform` with SUITE-CAP-1b merged; one to four runs each, so read ranges across runs; the 10,000-line R rows are from 83d71fd6 with 1b's migration applied, the base's schema):

| Measure | Base | This PR |
| --- | ---: | ---: |
| Step 7b, practice F, one case of 2,000 lines | 620 s (69% of the 900 s attempt) | 19.8 to 22.0 s in the build's runs (the probed candidate 21.8 s) |
| Step 7b, spread R, 2,000 lines | 159 s | 49.9 to 52.0 s in the build's runs (the probed candidate 46 s); most of it the ledger triggers, Lane A's |
| CAS-51's pass at 2,000 lines, R / F / A (four runs) | | 28.0 to 66.1 / 24.0 to 47.1 / 43.9 to 65.2 s; own part 10.8 to 12.1 s |
| Practice F's case refresh | 4,000 statements, 79 s | 1 statement, 0.7 s |
| Patient control number decrypts, F at 2,000 | 89,136 | 5,680 |
| Patient control number decrypts, R at 10,000 | 720,000 | 17,500 |
| Candidate searches / `claimLines` calls, R at 10,000 | 4,000 statements / 4,002 calls | 4 / 4 |
| Peak heap, R at 10,000 (560 MiB limit) | 172 MiB | 157 MiB |
| Live heap, CAS-51 at 500 and 2,000 (R, F, A) | | 104 to 122 MiB in the recorded tables (one verifier's note reads up to 176 MiB) |
| Practice F, 10,000 lines (the weekly run's new size) | | 220 s (24.5% of the attempt; the probed candidate's run) |
| A's full month, 30,795 lines in one case | | 1,653 s, 89% in the ledger triggers (Lane A's; the probed candidate's run; the build's slice-3 run, before slice 4's posting fixes, 1,793 s, the pass less its postings phase within 1% of the candidate's) |

The pass's own part (the pass less its `ledger_entry` inserts) is linear in the probed candidate's runs: 5.6 to 6.0 ms a line from 2,000 to 30,795 lines. Every equality pair compared wrote the same rows as the base, row for row, and the same recovered totals.

## Why

SUITE-CAP-3 in LANES.md (Lane B's claim row, line 228 at `claude/build-ops` 739eb795), found by the weekly release-capacity run: a reconcile pass at real size does not fit the reconcile job's 900 s attempt. SUITE-CAP-1b's hand-off (`approval-summaries/lane-a-to-lane-b-sc1b-reconcile-time-2026-11-05.md`, on `claude/build-ops`) measured its practice F at 526 to 731 s and asked three things: write the `ledger_match` exclusion so its cost cannot depend on that table's statistics (D16), remove the per-event case refresh (D3), and, whichever of 1b and this item lands second, reset step 7b's expectation and CAS-42.3's budget (D14). 1b merged first (#110), so this item resets them.

## Decisions

Recommended options, with reasons (design section 3):

- **D1. One candidate search a pass.** Statements per pass, not per line, in the same rounds with the same filters, preferred candidates, seen and known sets and chain order; at most one decrypt per claim.
- **D2. Each claim's lines read once a pass.** One `claimLines` call per search round for the round's new candidates; `reprocessingOf` reads `claimLines` only when the map lacks the claim. `claimLines`' SQL is unchanged, so #126's `CLAIM_LINES` copy stays valid.
- **D3. A pass's stage events in one statement, in today's order**, under a savepoint with a `40P01` retry (at most twice more): the statement takes every event line's head row before the cases, where a reopen takes the case then the head.
- **D4. No lock added or removed, no transaction or write-order change.** The pass stays one transaction under `lockLedger`; `ledger_entry.seq`, `line_status.seq` and (after #126) `ledger_match.seq` draw the same order. Only the stage statement's row-lock order changes, which D3's retry absorbs.
- **D5. `lineChain` reads standing matches from a per-context index** (a module `WeakMap`): O(C+M), not O(C·M); every caller's answer unchanged.
- **D6. `settleMatches` keeps a running sum per check** of its check-level postings; the same `before` for each match.
- **D7. Each remittance's claims read and decrypted once a pass for its posting rows**; the manual match passes no map and reads as before.
- **D11. Every new statement is practice-scoped on every table alias it reads**, not only on its output, inside the pass's practice scope with forced RLS; the candidate's two `ARRAY(…)` reads of `service_line` are removed; decrypts happen only in the worker, once per claim, never logged.
- **D14, as ruled.** The orchestrator ruled on 2026-11-06 at 22:31 UTC that step 7b stays on practice F, raised to 10,000 lines, until Lane A's corrected `ledger_line_net` and `ledger_entry_rules` primary-key lookup merge, and then moves back to practice A's month as the acceptance step of Lane A's trigger pull request (A's month measures 1,653 s against the 900 s attempt until then; with both fixes, 310 s). CAS-42.3's `PASS_BUDGET_MS` goes to 60,000. ADR 0083 takes a dated note; ADR 0087 records the split.
- **D15. The never-matched posting and EFT rows by one server-side `EXCEPT`**, then read by ID in today's order: linear on an unanalyzed table, and the worker holds only the never-matched IDs, never the practice's history.
- **D16. No search statement names `ledger_match`.** The exclusion comes from the pass's own matched pairs: dropped in TypeScript from the control search, and excluded inside both patient statements against parameter arrays, so the search decrypts exactly the claims the per-line queries decrypted. The array form was a build gate; **it passed, no fallback taken**: every statistics state within 5% of the TypeScript form on the pass less its postings phase, writes identical row for row (F 20,619 rows, F with 2,000 reversed matches 20,114, R 20,635), search decrypts no wider than the base's union; the control search at F 10,000 went from the probed candidate's 15.3 s to 0.33 to 0.35 s.

## Open items

- **CAS-49.2 is built** (the fix round): old against new on LED-01 to LED-18's own worlds, 207 reconciles compared, 204 of them decrypting a claim in the search, none refused. It fails first with the patient list dropped from the shipped search.
- **The build's search is 15 to 16% slower than the probed candidate's** (A at 10,000: 4.66 against 4.01 s; F at 30,795: 5.55 against 4.84 s), past the design's 10% restatement trigger (8.4). Restated: A's month's searches and `claimLines` are 8.9 s against 8.3 s, so the "about 35 s" bound above the 1,653 s still stands. ADR 0087's Measured table gives the candidate's figures; the build's (F 19.76 s, R 49.87 s at 2,000) are in its records, not yet in the ADR.
- **CI time.** CAS-49.1 (about 10 minutes locally), CAS-49.2 (about 3) and CAS-51 (about 4) may land in one 2-CPU db shard under its 20-minute timeout. To be measured on this PR's CI.
- **The Known gap sentence** carries the words approved on 2026-11-07, with the review's precision ("A’s full month (its 30,795 actionable lines)"). One reviewer's optional note stands: the 1,653 s was measured with A's line count in F's one-case shape (ADR 0087's table says so); the approved sentence does not.
- **Deviations from the design**, each checked by the build's completeness check:
  - `claimLines`' TypeScript body collects rows with `pushTo`; its SQL is unchanged word for word. `byPayment` is now built from the shared `chainOrder` comparator. Neither touches #126's hunks.
  - `pass-equality.db.test.ts` and `pass-equality-led.db.test.ts` (CAS-49) join `SLOW_FIRST` beside CAS-51, which the design did not list; `db-shards.test.ts` counts 20.
  - Four of CAS-49.1's mutants (the loaded and the reversal filter of each search) make the pass write a match `ledger_match_rules()` refuses, so they are caught by that guard, asserted by its fixed message, not by the comparison.
  - CAS-49.1's mutants are injected at the statement boundary on the shipped pass, not into a copy of the new code; the code mutants (D5, D6, D7, D15) ran in a scratch copy, each killed by CAS-49, CAS-49.5 or `settle-order.test.ts`.
  - `fixtures/synthetic/CAS-49..51/expected.json` are added (the generator's idiom for every case: metadata only), where the design said no fixture files.
  - CAS-51's F shape is seeded from LED-06's segments, not from the scenario's `reconcileClaims`.
  - `stages.test.ts` (unit) is extra to the design's test list.

## What it does not change

- Pricing engine (`packages/pricing`): unchanged.
- Ledger (`packages/ledger`): unchanged. Nothing under `packages/ledger/src` changes; no ledger table, ledger SQL function, matching rule, amount, stage, outcome or recovered total changes. `pass.ts`, `ledger.ts` and `manual.ts` in the reconcile directory are untouched; `lineChain`, `reprocessingOf` and `chainContext` give the same answers to every caller (the report path re-proved by CAS-41, the manual actions by LED-01 to LED-18 and CAS-49.4).
- Database schema and migrations: none. No migration, index, table or function (`claim_by_superseded` is SUITE-CAP-1b's, cited); nothing under `packages/db` changes. Lane A's two trigger fixes are not in this PR.
- Content releases (`content/`): unchanged.
- Domain model (`docs/product/domain-model.md`), its approval line and `approvers.json`: unchanged.
- CI and the GitHub settings: unchanged, except that `vitest.config.ts`'s `SLOW_FIRST` gains `pass-equality.db.test.ts`, `pass-equality-led.db.test.ts` and `pass.large.db.test.ts` and `tools/test/db-shards.test.ts` counts them; `watched-paths.txt` is unchanged by `watched.ts --write`.
- No lock, transaction or write order: the pass stays one transaction under the practice's `ledger:` lock, with peak advisory locks of 1 (CAS-42.3, CAS-51).
- Nothing a person reads: no page, notice, email, PDF, CSV or audit event changes. The release-capacity summary's Known gap line is the only changed sentence, in a build tool's output.

## Checks

The required checks report on this page by themselves: <!-- required-checks -->`all green`, `mutation`,
`screening-capacity gate` and `approval-of-record`<!-- /required-checks -->.

The full local suite ran once, on the fix round merged with the base d4f52071 (Node 24, PostgreSQL 18, 4 CPUs); the pushed head d88f2325 is that tree. Each new test was built red first.

| Command | Result |
| --- | --- |
| `pnpm typecheck` | pass, 23 projects |
| `pnpm lint`, `pnpm lint:logs`, `pnpm lint:copy` | pass |
| `pnpm check:fixtures`, `pnpm verify-content` | pass |
| `pnpm synth --all` | 0 files written, 727 unchanged, 0 removed (after the base merge) |
| `pnpm test` (unit and property) | 492 files, 10,171 passed, 4 skipped |
| `pnpm test:golden` | 5 files, 381 passed |
| `pnpm test:db` (every database test, the catalog and cross-tenant tests among them) | 155 files, 10,001 passed, 1 skipped |
| `pnpm test:e2e` | 84 passed |
| CAS-49.1 (`pass-equality.db.test.ts`) | 25 generated worlds equal to the per-line reference; the twenty-three mutants each apply and are caught; in every world the patient search's second statement kept a claim for one line of a patient and refused it for another, twice or more |
| CAS-49.2 (`pass-equality-led.db.test.ts`) | 207 reconciles of the LED tests compared, 187 writing rows, 204 decrypting a claim in the search, 0 refused; red first with the patient list dropped from the shipped search (1 LED test fails, naming tables and columns only) |
| Freeze: diff against the base on `packages/ledger/src`, `packages/db`, `packages/pricing` | empty |
| D16 gate (slice 3, real size) | passed, array form, no fallback (Decisions, D16) |
| Mutation | not run locally; CI's `mutation` reports here |

## Reviewer agents' findings

Two adversarial reviews of the head ee1dbb7d (payment-engine and security checklists, three skeptics a finding, two rounds; record `approval-summaries/lane-b-suite-cap-3-pr134-reviews.md` on `claude/build-ops`), then two of the fix round's delta (the `payment-engine-reviewer` and `security-reviewer` agents), each finding checked against the code before it was fixed. No finding changes an amount, a matching rule, a write or its order, or the recovered total. No screen changes, so no UX and brand review is due.

| Reviewer | Finding | Resolution |
| --- | --- | --- |
| Payment engine checklist | 2.1 (should fix): no generated world had two case lines sharing a patient control number, and no mutant aimed at the patient search's second statement | Fixed: claims of two lines, one code twice in a claim, and case lines of different claims sharing a patient, code and date with a further claim only one may take; two mutants on that statement alone; its other clauses recorded as equivalent |
| Payment engine checklist | 2.2 (nit): no mutant on the loaded and reversal filters the new statements restate | Fixed: a held 835 claim the control search reaches, four mutants, each caught by the database guard it names |
| Payment engine checklist | 1.2 (nit): the D2 comment held only where no correction loop exists | Fixed: the comment says so; run 0 reads a sample of claims alone against all together |
| Payment engine checklist | 1.3 (nit): the Known gap line called 30,795 lines A's full month | Fixed in the approved words |
| Payment engine checklist | 1.1 (nit): the savepoint left open on a non-deadlock error | Refuted (1 of 3): the outer rollback discards it; as designed |
| Security checklist | 1.4, 1.5 (nits): older statements rely on RLS alone; decrypted control numbers held for the posting pass | Refuted (0 of 3 each): unchanged SQL run fewer times; the trade-off is ADR 0087's |
| Payment engine reviewer, delta | Should fix: CAS-49.2's decrypt comparison could be nothing against nothing on every reconcile | Fixed: the run counts the reconciles that decrypted a claim in the search and asserts some did (204) |
| Payment engine reviewer, delta | Nits: refusals counted but not asserted zero; a comment naming the wrong state of the world; the Known gap sentence leaves out "in F's shape" | The first two fixed; the third stands as the approved words (Open items) |
| Security reviewer, delta | Nits: a failed claim-lines check would print a line's code, date and cents; an LED copy left behind if the world's connections cannot be reopened | Both fixed |
| Security reviewer, delta | Notes on older test code: clone drops in a loop with no guard for each; an unexpected mutant error is rethrown whole | Not changed here: neither is new in the fix round |

## Freeze exception

No: it changes none of them. The engine and `content/` are untouched, and the ledger's semantics are unchanged: the pass keeps every rule, filter, comparison, amount and write, in today's order, and changes only how often it reads (CAS-49 holds it equal to the per-line pass). For context only: the founder granted a freeze exception on 2026-11-06 (about 22:40 UTC) for Lane A's corrected `ledger_line_net` and `ledger_entry_rules`' primary-key match lookup (design section 14.1; `approval-summaries/lane-b-suite-cap-3-freeze-exception-ask.md`); those two function fixes are Lane A's schema pull request, not this one.

## Domain model

No migration; the document is unchanged.

## The founder's approval

This pull request merges only after the founder's approving GitHub review of its latest commit and green required
checks. The build waits for that review from the day it works under its own GitHub account
(`docs/runbooks/github-governance.md`, 3i), and from step 5 GitHub requires it too; before 3i, on green checks alone
(reconciliation 001, D4 (a)). The review is the record of the approval, not anything written here; a new commit
dismisses it. The build then merges, and never reviews.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_019i9ifE6JAC24yB5654GXcV
