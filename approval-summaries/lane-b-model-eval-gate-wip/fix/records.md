# PART records: fix round of PR #75 (co-001/contract-phi-check, head 9b7eadfe)

Worktree /home/user/contract-phi-check, no commits. Every value in the tests is synthetic. No migration, no #42 file, no file outside this part. The engine and the ledger are untouched.

"Before" means head 9b7eadfe's code with this part's tests copied in. It ran in the clone /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/clones/fix-records-before. "After" means the worktree. Logs are in /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/progress/.

## phi-screen F3 = security S3: a decrypt failure rolled back the audit rows of reads already made

**Change.** `packages/model-gateway/src/patient-records.ts`:
- `load()` (:168-182): the job scope returns the rows as stored (ciphertext) and commits, with their audit rows. Only after that does `decryptContractScreenRecords(read, cipher)` run (:181).
- `loadContractScreenIdentifiers` is replaced by two functions:
  - `readContractScreenRecords` (:323, not exported) reads and audits, and decrypts nothing.
  - `decryptContractScreenRecords` (:344).
  - No exported function decrypts inside a scope any more. That was the skeptic's addition, and it is taken.
- The module header (:33-35) states the rule: no value is decrypted whose read is not audited.

**Result.**
- A decrypt failure still answers `screen_failed`, with every read kept.
- A failed `COMMIT` leaves nothing decrypted. That case was the skeptic's addition.
- A scope, count or query error still rolls back, with nothing decrypted.

**Tests.**
- `patient-records.test.ts:96`: the memory pool's `steps` show that nothing is decrypted before COMMIT.
- `patient-records.test.ts:155`: a decrypt fault leaves 3 audited reads, and the steps run `BEGIN, audit×3, COMMIT, decrypt`.
- `patient-records.db.test.ts:252`, on Postgres: one claim is sealed for another column after others that decrypt. The result is `screen_failed`, and every read is audited (2 member IDs, 3 claims, 1 posting line).
  - Before: both unit tests fail (`decrypt` before `COMMIT`, audited `[]`), and the db test fails (audit rows `{}`).
  - After: all pass.
- `testing.ts` needed changes to support these tests. Its memory pool keeps a transaction's audit rows on COMMIT and drops them on ROLLBACK, as Postgres does, and it records `steps`. `SteppedCipher` (:130) notes each decrypt.
- `screen-world.ts:24` gains `undecryptableClaims`.

## phi-screen F4: the bound's count and the reads ran in different snapshots

**Change.** `patient-records.ts`:
- Each read is capped by `LIMIT $2` at what the bound leaves, plus one row (:305-309).
- `readContractScreenRecords` (:323-341) answers `too_many` as soon as a read passes the bound. Nothing after that read is read, and nothing is decrypted.
- `COUNT` is one statement, so its three subcounts read one snapshot (:265-268).

**Result.** Rows that commit between the count and a read are never read past the bound by more than one row (two identifiers). That bounds the audit rows, the decrypts and the plaintext, whatever the isolation level. The check refuses with `screen_unavailable`, which fails closed.

**Why the cap and not the skeptic's REPEATABLE READ.**
- The skeptic rightly refuted a post-read length check, because `readWithAudit` has written every audit row by then. The cap stops the read itself, so it bounds the audit rows.
- REPEATABLE READ would make the count and the reads agree, but it is worse on accuracy and safety:
  - Under one snapshot, an identifier committed after the count is unseen. A page naming the late claim answers `clear`, which is the skeptic's own measured result.
  - Under the cap, a late identifier is read while the practice stays under the bound. Past the bound, the check refuses.
- REPEATABLE READ would also change `packages/db/src/authz/scope.ts`, which is outside this part and branch-gated at 100%.
- If the integrator wants REPEATABLE READ too, requests.md "records" item 5 has the exact `testing.ts` change. It is not needed for the bound.

**Tests.**
- `patient-records.test.ts:187-208`: three cases, with rows passing the bound in the member IDs, the claims or the postings after the count.
  - Each expects `screen_unavailable`, at most one row past the bound, no later read and no decrypt.
  - Before: the claims case fails with `names_patient`. The member-ID and posting cases need F7's read and `LIMIT` to run at all.
- `patient-records.test.ts:176`: exactly 50,000 identifiers across the three kinds are read whole.
- `patient-records.db.test.ts:267`, on Postgres: after the count on a practice at the bound, 1,000 claims commit from another connection.
  - Before: `names_patient`, past the bound.
  - After: `screen_unavailable`, 25,001 claim reads, and the late claim is never matched.
- Mutants: removing each of the three `> left` checks, or each `LIMIT` argument, fails a case (progress/fix-records-mutants.log, 13 of 13 killed).

## phi-screen F7: `posting_row.claim_reference` was not read

**Change.** `patient-records.ts`:
- `POSTED_ONLY` (:252-263) selects the practice's posting lines that have a claim reference and no `ledger_match` of kind `posting`, level `claim`, whether that match stands or was reversed.
- `COUNT` counts those lines (:268).
- A third `readWithAudit` (`objectType: 'posting_row'`, :336) reads them under the same purpose and request ID.
- Each value is decrypted as `posting_row.claim_reference` and kept as a `patientControlNumber`, so floor 8 applies (:355).
- The doc comments on `SCREEN_MAX_IDENTIFIERS` (:49-53) and on the read are corrected. The text "already in claim" is dropped.

**Choice of predicate.** I took the skeptic's predicate and added `m.kind = 'posting'`.
- A claim-level posting match is made by exact equality between the reference and that claim's own PCN (`postings.ts` `claimsWithReference`, which `manual.ts` also uses). That PCN is already read from `claim`, so leaving those lines out loses nothing.
- It also keeps a line-level export from spending the bound on numbers already read.
- A line-level-only match is still read. That is conservative.

**Tests.**
- `patient-records.test.ts:134`: a PCN held only in a posting export is found, under its floor.
- `patient-records.db.test.ts:204`, on the web's and the worker's logins: a paper check's line is found, and a line matched to a claim is not read (checked by its audit rows).
  - Before: `clear`.
  - After: `names_patient`.
- `screen-world.ts:26-28,105-147` gains `postingReferences` and `postedClaims`. It writes the posting export, the lines and the claim-level matches as the reconcile job writes them.

## phi-screen F6 = security S4: the specs were mutable

**Change.**
- `specs.ts:19-24`: `Object.freeze` on the map and on each spec.
- `spec.ts:42,51-52`: `prepare`, `screen` and `verify` are `readonly` properties, so assigning or deleting one is TS2540 or TS2704.
- `index.ts:156` no longer exports `PURPOSE_SPECS`. `requestFor` and the gateway's methods are the surface.

**Not taken.** The reviewer's "gateway calls `screenContractPages` whatever the spec says". The skeptic refuted it: `ModelGateway.prototype.screen` can be patched the same way, and it would put purpose-specific code into the shared path.

**Tests.** New file `specs.test.ts` (4 tests):
- the map and every spec are frozen, and the contract spec's screen is `screenContractPages`;
- assigning or deleting the screen, `prepare` or the map's entry throws a `TypeError`, and each is an `@ts-expect-error`;
- a contract naming a held member ID is still refused after such an attempt;
- neither `PURPOSE_SPECS` nor `syntheticRecordsCheck` is on the entry.

Before: 4 of 4 fail, and tsc reports 3 unused `@ts-expect-error`. After: 4 of 4 pass.

**Left: requests.md "records" item 3, for the integrator.**
- Freeze each spec where it is defined (contract-terms, denial-letter, narrative, evidence-requests).
- `Object.freeze(ModelGateway.prototype)` in `gateway.ts`.
- Optionally deep-freeze `PROMPTS`.

**Not fixable in code.** In-process code that rewrites a built-in (`WeakSet.prototype.has`, `Set.prototype.has`) or the gateway's prototype can skip the screen. records-docs.md has the ADR's sentence for this.

## phi-screen N1: three mutation survivors

- **`authorizedBy.practiceIds.includes`.** `patient-records.test.ts:47-49` covers a scope whose `access()` answers but whose `practiceIds` lacks the practice. The mutant is killed.
- **The opened-scope assertion.** It is commented as defensive at `patient-records.ts:170-171`.
  - `patient-records.test.ts:211-229` covers four tampered job scopes: two practices, another practice, a person's kind, and another actor. They go through a `vi.mock` wrapper of `withJobScope` (:11-20).
  - Each expects `screen_failed` with nothing read, and then a read with the untampered scope. All four mutants are killed.
- **`screenContractPages`' `default:` branch.** `patient-records.test.ts:231-250` reaches it through a check made to pass as issued, by spying on `WeakSet.prototype.has`. The mutant `default: return;` is killed.
  - The comment on that branch is in `contract-terms.ts`, which is not this part's file. requests.md "records" item 2 has the exact text.

## phi-screen N2 and the security nit on the stub claim

- **The doc comment.** It now says the scope and the pool are taken by their shape (`packages/db` brands neither), and that `lint.test.ts` keeps any stub out of production (`patient-records.ts:18-23`).
- **The synthetic check.** `syntheticRecordsCheck` is off `index.ts` (:174-187) and is re-exported from `testing.ts:74-79`. Only the eval imports it, from `../src/patient-records`, and the eval is allowed to.
- **`lint.test.ts:159`.** Outside tests, `practiceRecordsCheck` may be named only in:
  - `contract-proposals.ts`, with its one call pinned to `authorizedBy: scope, pool: services.modelPool`;
  - `permitted.ts`, pinned to `authorizedBy: scope, pool: services.pool`;
  - `testing.ts`, `patient-records.ts` and `index.ts`.
  - The rule passes at head, because the callers are right. It fails for a new `stub-check.ts` naming the factory, and for `pool: services.stubPool` in `contract-proposals.ts` (progress/fix-records-callers-mutant.log).
- **`lint.test.ts:176`.** `syntheticRecordsCheck` may be named only in `testing.ts`, `eval/` and tests. Before: it fails, because `index.ts` exports it. After: it passes.
- **Refusing a stub in the factory itself.** This cannot be done in this part. It needs an open-scope brand issued by `packages/db/src/authz/scope.ts` (a module-private WeakSet added to in `transaction()`, with an exported `isOpenScope`), and a pool brand issued where the services build their pools, in `apps/web/src/lib/server/services.ts`, which is a #42 file. Neither needs a migration. requests.md "records" item 6 names both.

## Security nit: the testing-module lint checked direct imports only

**Change.** `lint.test.ts`:
- `specifiers` (:210) reads static imports and re-exports, side-effect imports, dynamic imports and `require`, in any quotes. That includes a template literal with no substitution, and `import type`.
- `resolveSpecifier` (:218) resolves relative paths with `.js` and index forms, and workspace packages through their `exports`.
- `reachingModule` (:238) follows the import graph transitively.
- `lint.test.ts:114` holds that nothing but test code reaches `testing.ts`.
- `lint.test.ts:131` is a self-check over a synthetic graph covering eight import forms.

**Added this run (the nit's "allows any test-support or route-tests path").**
- `isTestCode` (:103-110) no longer counts a `test-support/` or `route-tests/` directory inside `apps/web/src/app/`. Next serves a page or route there by its path, though nothing imports it.
- Outside the route tree, anything that imports a support file is followed like any other importer, so allowing support directories there is safe.
- `lint.test.ts:123` is its own check.
  - Before (head's regex): it fails, and so does the synthetic-check rule: 2 failed, 14 passed (progress/fix-records-lint-route-before.log).
  - After: lint plus specs, 20 of 20 pass.
- The rule does not follow a specifier computed at run time. No source outside `tools/test` uses one, and the ADR text in records-docs.md says so.

## Requests and docs

- /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/fix/requests.md, section "records":
  1. **Required.** `gateway.test.ts:379` expects `postings: 1`. It is the only test my change breaks.
  2. A comment on `contract-terms.ts`' `default:` branch.
  3. Freeze the specs where they are defined, `Object.freeze(ModelGateway.prototype)`, and optionally `PROMPTS`.
  4. Assertions the skeptics asked for in `models-routes.db.test.ts` (the screen's reads on `screen_failed`) and in `permitted.db.test.ts` (two examples that both answer `screen_failed`, each audited).
  5. REPEATABLE READ is not requested; the reason is above.
  6. The scope and pool brands that would refuse a stub in the factory, both outside this part.
- /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/fix/records-docs.md has every ADR 0070 Part 3 correction and gap, plus the test matrix (MOD-12), reconciliation-001 item 16 and the design. The ADR changes cover:
  - the registry claim and the frozen specs;
  - the testing-module and stub claims;
  - the Records bullet, the bound, "Any error fails closed", "What is recorded" and "What it gives up";
  - five departures, two alternatives and the tests.

## Narrow commands and results (resumed run, 2026-10-27 19:12-19:35 UTC)

Run under `flock /tmp/laneb-heavy.lock`.

| Command | Result |
| --- | --- |
| `pnpm exec tsc --noEmit -p .` in packages/model-gateway, apps/web and apps/worker | clean |
| `pnpm exec vitest run src/patient-records.test.ts src/specs.test.ts src/lint.test.ts src/gateway.test.ts src/functions/contract-terms.test.ts src/prompts.test.ts` in packages/model-gateway | 161 passed, 1 failed: `gateway.test.ts:379`, request 1 |
| `vitest run --project unit lint.test.ts specs.test.ts` | 20/20 |
| `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres pnpm exec vitest run --project db packages/model-gateway/src/patient-records.db.test.ts packages/model-gateway/src/gateway.db.test.ts` | 31/31 |
| the same, with `apps/web/src/lib/routes/models-routes.db.test.ts apps/worker/src/models/permitted.db.test.ts` | 20/20 |
| `pnpm exec eslint` on this part's 10 files | clean |
| Before, unit (`patient-records`, `specs`, `lint`) | 15 failed, 32 passed (progress/fix-records-resume-before.log) |
| Before, db (`patient-records.db`) | 3 failed, 7 passed: F3, F4, F7 |
| After, the same files | all pass |

Nothing is left in this part's files.
