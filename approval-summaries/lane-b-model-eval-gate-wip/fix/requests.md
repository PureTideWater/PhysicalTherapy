
## records

Changes the records part needs in files it does not own. Each is exact; none is made.

1. **Required (the gateway part's test breaks without it).** `packages/model-gateway/src/gateway.test.ts:379`. The screen now reads the posting export's unmatched claim references (F7), so the memory pool counts a fourth read statement.
   - Replace `expect(records.reads).toEqual({ connects: 1, count: 1, patients: 1, claims: 1 });`
   - with `expect(records.reads).toEqual({ connects: 1, count: 1, patients: 1, claims: 1, postings: 1 });`
   - This is the only unit failure my change causes. 458 of 460 model-gateway unit tests pass in the worktree. The other failure, `redact.test.ts`, belongs to the tokenizer part's in-progress `redact.ts`.

2. **Comment (N1).** `packages/model-gateway/src/functions/contract-terms.ts`, the switch in `screenContractPages`, at `default:` (line 517 at head). Insert above the `default:` line:
   ```ts
       // Defensive: an issued check answers only the four codes above. Anything else is refused as a failure, never
       // sent (patient-records.test.ts reaches this branch through a check made to pass as issued).
   ```

3. **Recommended hardening (F6/S4, the skeptic's items 2 and 5).** `specs.ts` now freezes every spec when the registry loads. Freezing each spec where it is defined also covers code that imports a spec module before `specs.ts` has loaded.
   - `functions/contract-terms.ts:522`: `export const contractTermsSpec: PurposeSpec<ContractPagesInput, ContractTermsOutput, ContractTermsProposal> = Object.freeze({ ... });`
   - The same wrapping for `denialLetterSpec` (`functions/denial-letter.ts`), `narrativeSpec` (`functions/narrative.ts`) and `evidenceRequestsSpec` (`functions/evidence-requests.ts`).
   - `gateway.ts`, after the `ModelGateway` class: `Object.freeze(ModelGateway.prototype);`, so `ModelGateway.prototype.screen` cannot be replaced. The skeptic found no test that spies on the prototype. Run `gateway.test.ts` after the change: a `vi.spyOn` on the prototype would now throw.
   - `prompts.ts:80`: deep-freeze `PROMPTS`, meaning each `PromptVersion`, its `models` map and its `schema`. A mutated model map could send a call to a model the gate did not evaluate. That concerns the gate, not the screen, so it is optional for this PR.

4. **Tests the skeptics asked to keep (F3/S3), in other parts' files.**
   - `apps/web/src/lib/routes/models-routes.db.test.ts:609-638`, the `screen_failed` case: after the existing `events` length 1 check, assert that the screen's reads, per `object_type`, equal the practice's held rows. With the F3 fix, the screen's reads survive a decrypt failure. Use the same `trail.reads` shape the `names_patient` case already asserts at :597: `expect(Object.fromEntries(trail.reads.map((read) => [read.object_type, read.n]))).toEqual({ claim: held?.claims, patient_ref: held?.patients });`. That holds while that world has no posting rows; if it gets some, add `posting_row`.
   - `apps/worker/src/models/permitted.db.test.ts`: one permitted run with two examples of a practice whose last claim does not decrypt. Expect both examples `refused:screen_failed`, and the screen's reads audited once per example. The check reads again after a failure; `known` is reset.

5. **Not requested: REPEATABLE READ for the screen's job scope (F4's skeptic fix).** The records part bounds each read at the bound itself, with `LIMIT`, so the bound holds whatever the isolation level. That needs no `packages/db` change. A `oneSnapshot` option on `withJobScope` would only make the count and the reads agree, and nothing depends on that now.
   - If the integrator wants it anyway, the skeptic's exact patch is in /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/fix/findings-all.md, F4 "Skeptic's fix" (1)-(4).
   - The memory pool in `testing.ts` then has to accept `'BEGIN ISOLATION LEVEL REPEATABLE READ'`: add it to the `text === 'BEGIN' || ...` test at `testing.ts:228`, and push `'BEGIN'` to `steps` for it.

6. **Named, outside this part: an unforgeable scope (N2).** `practiceRecordsCheck` takes `authorizedBy` and `pool` by their shape. Refusing a stub needs a brand that `packages/db/src/authz/scope.ts` issues: a module-private `WeakSet` that `transaction()` adds each opened scope to and removes it from on COMMIT or ROLLBACK, plus an exported `isOpenScope(scope)`.
   - `practiceRecordsCheck` would then refuse an `authorizedBy` that is not an open scope.
   - A pool brand would have to be issued where the services build their pools (`apps/web/src/lib/server/services.ts`), which is a #42 file.
   - Neither needs a migration. Both are outside this part, and `packages/db/src/authz` is branch-gated at 100%. Until then, `lint.test.ts` is the guard.
