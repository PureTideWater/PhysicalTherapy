
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

## tokenizer

Changes the tokenizer part needs in files it does not own. Each is exact; none is made.

1. **Required (F1, F5: without it the screen neither joins a practice's own separators nor streams; redact.test.ts's bound test fails, since pagesName still builds every run through identifierRuns).** `packages/model-gateway/src/patient-records.ts` (the records part's file; the text below is current as of 19:20 UTC and applies to its edited version). Three replacements, each of a text that occurs once. A script that makes them and refuses if any old text is not found exactly once: `python3 -I /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/tok/request/apply.py packages/model-gateway/src/patient-records.ts` (old and new texts beside it).

   (a) The import (line 3). Replace
   ```ts
import { SCREEN_FLOORS, SCREEN_MAX_RUN, SCREEN_MIN_RUN, type ScreenIdentifierKind, identifierRuns, screenIdentifier } from './redact';
   ```
   with
   ```ts
import { type RunIndex, SCREEN_FLOORS, SCREEN_MAX_RUN, SCREEN_MIN_RUN, type ScreenIdentifierKind, runIndex, screenIdentifier, someIdentifierRun, storedSeparators } from './redact';
   ```

   (b) `ScreenSet` (line 89). Replace
   ```ts
/** The identifiers a check compares, and the longest of them. */
export interface ScreenSet {
  readonly values: ReadonlySet<string>;
  readonly longest: number;
  readonly shortest: number;
}
   ```
   with
   ```ts
/** The identifiers a check compares, the longest and shortest of them, the separators they hold and their index. */
export interface ScreenSet {
  readonly values: ReadonlySet<string>;
  readonly longest: number;
  readonly shortest: number;
  /**
   * The separators inside the kept values that the tokenizer does not join by itself (redact.ts storedSeparators,
   * punctuation only): each joins two tokens on the pages too, so a kept value written exactly as stored is found.
   */
  readonly joins: ReadonlySet<string>;
  /** The kept values' lengths, first characters and hashes (redact.ts runIndex), so a page run is built only where one may be kept. */
  readonly index: RunIndex;
}
   ```

   (c) `screenSet` and `pagesName` (lines 113-137). Replace
   ```ts
/** Builds the compared set from identifiers by kind, keeping each one that meets its kind's floor and the stored-side rules (redact.ts screenIdentifier). */
export function screenSet(identifiers: Iterable<readonly [ScreenIdentifierKind, string]>, rules: ScreenRules = SHIPPED_SCREEN_RULES): ScreenSet {
  const values = new Set<string>();
  let longest = 0;
  let shortest = Number.POSITIVE_INFINITY;
  for (const [kind, value] of identifiers) {
    const kept = screenIdentifier(kind, value, rules.floors, { dropDates: rules.dropDates });
    if (kept !== null) {
      values.add(kept);
      longest = Math.max(longest, kept.length);
      shortest = Math.min(shortest, kept.length);
    }
  }
  return { values, longest, shortest };
}

/** Whether any run of any page is one of the set's identifiers (exact, whole tokens: redact.ts identifierRuns). */
export function pagesName(texts: readonly string[], set: ScreenSet): boolean {
  if (set.values.size === 0) {
    return false;
  }
  const maxLength = Math.min(set.longest, SCREEN_MAX_RUN);
  const minLength = Math.min(SCREEN_MIN_RUN, set.shortest);
  return texts.some((text) => identifierRuns(text, { minLength, maxLength }).some((run) => set.values.has(run)));
}
   ```
   with
   ```ts
/**
 * Builds the compared set from identifiers by kind, keeping each one that meets its kind's floor and the stored-side
 * rules (redact.ts screenIdentifier), with the separators each kept value holds as written (redact.ts storedSeparators)
 * and the kept values' index (redact.ts runIndex).
 */
export function screenSet(identifiers: Iterable<readonly [ScreenIdentifierKind, string]>, rules: ScreenRules = SHIPPED_SCREEN_RULES): ScreenSet {
  const values = new Set<string>();
  const joins = new Set<string>();
  let longest = 0;
  let shortest = Number.POSITIVE_INFINITY;
  for (const [kind, value] of identifiers) {
    const kept = screenIdentifier(kind, value, rules.floors, { dropDates: rules.dropDates });
    if (kept !== null) {
      values.add(kept);
      for (const separator of storedSeparators(value)) {
        joins.add(separator);
      }
      longest = Math.max(longest, kept.length);
      shortest = Math.min(shortest, kept.length);
    }
  }
  return { values, longest, shortest, joins, index: runIndex(values) };
}

/**
 * Whether any run of any page is one of the set's identifiers (exact, whole tokens, joined over JOIN's separators and
 * the set's own: redact.ts someIdentifierRun), read as a stream that stops at the first match, in memory bounded by the
 * longest run and line and in time linear in the pages.
 */
export function pagesName(texts: readonly string[], set: ScreenSet): boolean {
  if (set.values.size === 0) {
    return false;
  }
  const options = { minLength: Math.min(SCREEN_MIN_RUN, set.shortest), maxLength: Math.min(set.longest, SCREEN_MAX_RUN), joins: set.joins, index: set.index };
  const kept = (run: string) => set.values.has(run);
  return texts.some((text) => someIdentifierRun(text, options, kept));
}
   ```

   Then run: `pnpm exec vitest run --project unit packages/model-gateway/src/redact.test.ts packages/model-gateway/src/patient-records.test.ts` and `pnpm exec tsc -p packages/model-gateway --noEmit`. `screenSet` still takes the decrypted values (decryptContractScreenRecords), which storedSeparators needs: if the screen ever moves to stored hashes (F3's first proposal), the practice's separators (punctuation only) must be stored beside them, or F1 comes back.

   Also needed by `packages/model-gateway/eval/gate.golden.test.ts` (the separator-twin test reads `screenSet(...).joins`; `tsc -p packages/model-gateway` reports it until (b) and (c) are applied). Verified in the tokenizer clone with every part's worktree edits as of 19:50 UTC: unit model-gateway + synth/screen 491/491, golden 57/57, db gateway + patient-records 32/32, web models-routes + worker permitted 24/24, tsc and eslint clean.

## gateway

Changes the gateway part needs in files it does not own. Each is exact; none is made. (Done in my own files, and so not requested: the records part's request 1, `gateway.test.ts:379` `postings: 1`, and request 4, the `screen_failed` reads assertion in `models-routes.db.test.ts` and the two-example decrypt-failure test in `permitted.db.test.ts`.)

1. **Required wording (the order changed: S1).** `packages/model-gateway/src/functions/contract-terms.ts`, the doc comment above `screenContractPages` (lines 485-487 now). Replace
   ```ts
    * The contract PHI check (combined audit item 120; docs/adr/0070, Part 3), run by the gateway after preparation and the
    * variant's serving check and before the idempotency key, the budget and the call (gateway.ts, step 4):
   ```
   with
   ```ts
    * The contract PHI check (combined audit item 120; docs/adr/0070, Part 3), run by the gateway last of its refusals: after
    * preparation, the variant's serving check, the idempotency key's lookup, the read of the day's budget and the caller's
    * step before the screen, and before the budget's hold and the call (gateway.ts, steps 4 to 9; the review's S1):
   ```

2. **Required wording (S1).** `packages/model-gateway/src/spec.ts` (the records part's), the `screen` member's doc comment. Replace
   ```ts
      * and runs after preparation and the variant's serving check, before the idempotency key, the budget and
      * the call. The call's context says which practice the call reads, so a screen can hold its records
      * check to that practice.
   ```
   with
   ```ts
      * and runs last of the gateway's refusals: after preparation, the variant's serving check, the idempotency
      * key's lookup, the read of the day's budget and the caller's step before the screen (CallContext.beforeScreen),
      * and before the budget's hold and the call (gateway.ts). The call's context says which practice the call
      * reads, so a screen can hold its records check to that practice.
   ```

3. **Required wording (the nit, and S2's "the trail").** `packages/model-gateway/src/patient-records.ts` (the records part's).
   (a) Lines 31-33. Replace
   ```ts
    * ID `<requestId>:screen:<screenId>`. The caller records one event in the person's own name that joins to those
    * reads by that request ID (the web's contract_screen_requested), so the trail says who caused the screen without
    * saying that the person read every patient. The job scope returns the rows as stored (ciphertext) and commits, its
   ```
   with
   ```ts
    * ID `<requestId>:screen:<screenId>`. The caller records one event in the person's own name that joins to those
    * reads by that request ID (the web's contract_screen_requested, written in the gateway's step before the screen,
    * CallContext.beforeScreen, so only for a screen about to read), so the audit_event trail says who caused the
    * screen without saying that the person read every patient (the practice's access log cannot show the join yet:
    * docs/adr/0070, Part 3, What it gives up). The job scope returns the rows as stored (ciphertext) and commits, its
   ```
   (b) Lines 208-210, the doc comment of `recordContractScreenRequested`. Replace
   ```ts
    * The person's own audit event for a screen they cause (the design's 5.2): recorded in their request scope before
    * the gateway is called, under the same request ID as the screen's reads (screenAuditRequestId), so the trail says
    * who caused the screen and joins to its reads without saying the person read every patient.
   ```
   with
   ```ts
    * The person's own audit event for a screen they cause (the design's 5.2): recorded in their request scope in the
    * gateway's step before the screen (CallContext.beforeScreen), once every refusal the gateway can make without a
    * screen has passed, under the same request ID as the screen's reads (screenAuditRequestId), so the audit_event
    * trail says who caused the screen and joins to its reads without saying the person read every patient.
   ```

4. **Recommended (UX): a notice of its own for a screen past its limits.** Today such a click shows `screen_unavailable` ("could not be checked"), which is true but does not say to try later. In `apps/web/src/lib/models/notices.ts` (the UX part's):
   - In `MODEL_PROBLEMS`, after `'screen_unavailable'`, add `'screen_limited'`.
   - In `MODEL_PROBLEM_TEXT`, after the `screen_unavailable` entry, add
     `screen_limited: 'Documents of this practice have been checked for patient details as often as the limits allow for now, so this one was not sent to the model. Enter its terms by hand, or try again in an hour.',`
   - In the doc comment above `MODEL_PROBLEMS`, after the `screen_unavailable` sentence, add: "`screen_limited`: the contract screen's limits (contract-proposals.ts SCREEN_LIMITS) stopped this check before it read anything; nothing was sent."
   Then, in my files: `apps/web/src/lib/models/contract-proposals.ts`, replace `const SCREEN_LIMITED_PROBLEM: ModelProblem = 'screen_unavailable';` with `const SCREEN_LIMITED_PROBLEM: ModelProblem = 'screen_limited';` and its doc comment's last sentence `(A notice of its own, saying when to try again, is the notices' to add.)` with nothing; and in `apps/web/src/lib/routes/models-routes.db.test.ts`, in the test 'counts a screen against the practice’s and the person’s limits ...', replace ``?model=screen_unavailable`);`` (the one inside the `for (const [index, limit] of SCREEN_LIMITS.entries())` loop) with ``?model=screen_limited`);``. `path.ts` needs no change (the problem is returned directly, not mapped from a gateway error).

### after #42 (a later PR; each touches a #42 file)

5. **S2: the practice's access log names who caused a screen's reads and pages through all of them.** Needs Lane A's migration first (item 7). Then, in `apps/web/src/lib/routes/settings.ts` (`accessLogPage`, lines 777-836 at 9b7eadfe):
   - `AccessLogEntry`: after `readonly ticket: string | null;` add
     ```ts
       /** For a contract screen's read, the person whose contract_screen_requested event it joins (by request ID); null otherwise. */
       readonly causedBy: string | null;
     ```
   - `params`: after the `before:` line add `before_event: optionalText(opaqueId).catch(undefined),`
   - the row type of the query: after `ticket: string | null;` add `caused_by: string | null;`
   - the query: replace `'SELECT * FROM practice_access_log($1, $2, $3, $4, $5)', [practiceId, params.object_type ?? null, params.object_id ?? null, params.before ?? null, ACCESS_LOG_PAGE_SIZE + 1]` with `'SELECT * FROM practice_access_log($1, $2, $3, $4, $5, $6)', [practiceId, params.object_type ?? null, params.object_id ?? null, params.before ?? null, ACCESS_LOG_PAGE_SIZE + 1, params.before_event ?? null]`
   - the entry: after `ticket: row.ticket,` add `causedBy: row.caused_by,`
   - `next`: replace `next: rows.length > ACCESS_LOG_PAGE_SIZE ? (entries.at(-1)?.at.toISOString() ?? null) : null,` with `next: rows.length > ACCESS_LOG_PAGE_SIZE ? (entries.at(-1)?.id ?? null) : null,` (the cursor is the last entry's ID: the function pages on (at, id), so a screen's thousands of reads that share one `at` page through, and no microseconds are lost to toISOString).
   - `apps/web/src/app/p/[practiceId]/settings/access-log/page.tsx`: the "Older entries" link's `href` becomes ``${base}?${query}before_event=${next}``; the Who cell becomes `<td className="py-1 pr-3">{entry.causedBy === null ? entry.actor : `the contract screen, for ${entry.causedBy}`}</td>`.
   - `apps/web/src/lib/routes/models-routes.db.test.ts`, the S2 test ('lists the first page of one screen’s reads ...'): flip it: page with `before_event` from `next`; expect `shown` to have `audited` entries, every one with `causedBy` the specialist's email; rename it 'lists every read of a screen, each beside the person who caused it'.
   - Do NOT put the person's grant_id on the screen's reads (the reviewer's and skeptic's warning): the support ticket's trail would then say the person read every patient, which M8 rules out.

6. **Recommended: a route bucket for the proposal's clicks.** After S1 a click that does not screen (refused by the gateway, by a limit, or remembered) still writes the route's `model_proposal_requested` event and the audited read of the `source_document` row, and reads the pages from storage; the generic `mutation` bucket allows 120 a minute. In `apps/web/src/lib/http/rate-limit.ts`: add `'model_proposal'` to `RateBucket` and `RATE_BUCKETS`, and to `RATE_LIMITS`:
   ```ts
     // A contract proposal (docs/adr/0070, Part 3): its screen has limits of its own (contract-proposals.ts SCREEN_LIMITS); this bounds the clicks.
     model_proposal: { user: { hits: 30, windowSeconds: 600 }, address: { hits: 120, windowSeconds: 600 } },
   ```
   and in `apps/web/src/lib/routes/models.ts` (mine), after `permission: 'rate_record.edit',` of `proposeTermsAction`, add `rateLimit: 'model_proposal',`; a unit test that `proposeTermsAction.rateLimit === 'model_proposal'`.

### Handed to Lane A (a migration; with F3 or beside it)

7. **`practice_access_log` pages on (at, id), returns the request ID and names a screen read's cause (S2).** New version of `packages/db/functions/practice_access_log.sql` through a migration (`/new-migration`), keeping the existing five parameters and adding a sixth, `before_event uuid DEFAULT NULL`, and two columns, `request_id text` and `caused_by text`:
   - cursor: `AND (before_event IS NULL OR (e.at, e.id) < (SELECT c.at, c.id FROM audit_event c WHERE c.id = before_event AND c.practice_id = target_practice))` (an ID of another practice's, or none, gives no rows: fail closed);
   - cause: `LEFT JOIN LATERAL (SELECT r.actor_id FROM audit_event r WHERE r.practice_id = e.practice_id AND r.request_id = e.request_id AND r.action = 'contract_screen_requested' ORDER BY r.at LIMIT 1) cause ON e.action = 'read' AND e.purpose = 'contract_screen' LEFT JOIN "user" cu ON cu.id = cause.actor_id`, returning `cu.email AS caused_by` (null for an unjoined read: the worker's permitted run, which names no person);
   - an index on `audit_event (practice_id, request_id)` if none serves the join (the lateral runs once per listed row, at most 200);
   - the domain model regenerated and the catalog test updated, as every function change.
   F3's single screen event with matched rows only removes most of the volume; the cursor fixes every multi-row read that shares one `at`, which predates this PR.

## ux

Changes the ux part needs in files it does not own. Each is exact; none is made.

1. **Required (UX-1 holds an ERA export's files until its system is chosen, as it holds any file until its kind is: without this edit `era-exports.spec.ts` fails at :101, whose words are gone, and at :105, since a file chosen while one waits joins it and waits for Upload).** `apps/web/e2e/era-exports.spec.ts` (not #42's; no part's). Replace lines 98-104:
   ```ts
        // The system's format is chosen before the files; an unconfirmed one says so.
        await page.getByLabel('Kind of document').selectOption('era_export');
        await page.getByLabel('Choose files to upload').setInputFiles([exportFile(format)]);
        await expect(page.getByText('Choose which system’s ERA export the files are, then choose the files again.')).toBeVisible();
        await page.getByLabel('Which system’s export').selectOption({ label: `${expected.vendor} ERA export` });
        await expect(page.getByRole('note', { name: 'Format unconfirmed' })).toContainText('placeholder layout');
        await page.getByLabel('Choose files to upload').setInputFiles([exportFile(format)]);
   ```
   with
   ```ts
        // A file chosen before the system waits in this browser, the system select marked and focused; once the system
        // is chosen (an unconfirmed one says so), Upload sends it, never the select's change (the PR #75 review's UX-1).
        await page.getByLabel('Kind of document').selectOption('era_export');
        await page.getByLabel('Choose files to upload').setInputFiles([exportFile(format)]);
        const system = page.getByLabel('Which system’s export');
        await expect(page.locator('#upload-format-error')).toHaveText('Choose which system’s ERA export this file is, then upload it.');
        await expect(system).toBeFocused();
        await expect(system).toHaveAttribute('aria-invalid', 'true');
        await system.selectOption({ label: `${expected.vendor} ERA export` });
        await expect(page.getByRole('note', { name: 'Format unconfirmed' })).toContainText('placeholder layout');
        await page.getByRole('group', { name: /^Waiting to upload/ }).getByRole('button', { name: 'Upload 1 file' }).click();
   ```
   The next line (`await expect(batchLine(page, ...)).toContainText(...)`) stays. Proven in Chromium against the worktree's Uploader (scratchpad/phi/fix-ux-harness/after.json, u2-u4: held, `#upload-format` focused and `aria-invalid="true"`, the error text above, then one `/uploads/request` carrying `formatId`); the spec itself was not run (it is not this part's).

2. **Required (UX-3: a failed read now has its own notice, which says to try again).** `apps/web/src/lib/routes/models-routes.db.test.ts` (the gateway part's), the test at :615 ('refuses, as not checked, a document whose practice records could not be read, and sends nothing'):
   - its title: `'refuses, as not checked, a document whose practice records could not be read, and sends nothing'` becomes `'refuses a document whose practice records could not be read, says to try again, and sends nothing'`;
   - inside it only (the other `?model=screen_unavailable` at :731 is the limits loop: the gateway part's request 4 makes it `screen_limited`), replace
     ``expect(redirectOf(await call(proposeTermsAction, draft.specialist, P, { versionId: draft.versionId, documentId: draft.documentId }))).toBe(`/p/${practiceId}/abstraction/versions/${draft.versionId}?model=screen_unavailable`);``
     (the one directly after `logs.length = 0;`) with the same line ending ``?model=screen_failed`);``;
   - replace `expect(ok(await call(abstractionVersionPage, draft.specialist, { ...P, versionId: draft.versionId, model: 'screen_unavailable' })).modelNotice).toBe('screen_unavailable');` with `expect(ok(await call(abstractionVersionPage, draft.specialist, { ...P, versionId: draft.versionId, model: 'screen_failed' })).modelNotice).toBe('screen_failed');`;
   - replace the comment `// The operator's log names the failed read apart from the bound (MODEL_INPUT_SCREEN_UNAVAILABLE); the person reads the same notice for both.` with `// The operator's log names the failed read apart from the bound (MODEL_INPUT_SCREEN_UNAVAILABLE), and so does the person's notice: a failed read is worth a second try (UX-3).`
   Then run `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres pnpm exec vitest run --project db apps/web/src/lib/routes/models-routes.db.test.ts`. No route schema changes: `?model=` is `z.enum(MODEL_NOTICES)`, which takes `screen_failed` and `screen_limited` from notices.ts.

3. **The gateway part's request 4 (`screen_limited`), its notices.ts half done, with corrected words.** `notices.ts` now has `screen_limited` in `MODEL_PROBLEMS` and its text: "Documents have been checked against the practice’s patient records as many times as allowed for now, so this one was not sent to the model. Try again later, or enter its terms by hand below." Not the requested words, for two reasons: "patient details" names the records otherwise than every other notice (UX-3: one name per thing), and "try again in an hour" is false when a day limit is the one reached (SCREEN_LIMITS: 60 a practice and 100 a person a day; those windows reset only within the day). The rest of request 4 is unchanged and still the integrator's: in `apps/web/src/lib/models/contract-proposals.ts`, `const SCREEN_LIMITED_PROBLEM: ModelProblem = 'screen_unavailable';` becomes `'screen_limited'`, and its doc comment above (`What a person reads for a screen past its limits: the document could not be checked, so it was not sent, and the terms are entered by hand. (A notice of its own, saying when to try again, is the notices' to add.)`) becomes `What a person reads for a screen past its limits: the checks allowed for now are used, so the document was not sent; try again later, or enter the terms by hand.`; and `models-routes.db.test.ts:731`'s ``?model=screen_unavailable`);`` becomes ``?model=screen_limited`);``.
   In the same file, two comments now say less than the screens do:
   - the module comment, lines 48-50 now. Replace
     ```
 *   numbers or payer claim numbers is an EOB or a letter filed as the wrong kind, and is refused
 *   (`names_patient`), as is one that could not be checked (`screen_unavailable`): nothing is sent, no
 *   model_call row is written, and the screen offers hand entry. The check is built here, after the role check
     ```
     with
     ```
 *   numbers or payer claim numbers is most often an EOB or a letter filed as the wrong kind, and is refused
 *   (`names_patient`), as is one that could not be checked (`screen_unavailable`, the bound; `screen_failed`, a read
 *   that failed, which the next click reads again): nothing is sent, no model_call row is written, and the screen
 *   gives each case its next step (notices.ts). The check is built here, after the role check
     ```
   - SCREEN_LIMITS' comment (the line holding "a screen past any limit is not run"). Replace
     `src/lib/http/rate-limit.ts stores them, and a screen past any limit is not run: the person is told the document`
     and the next line's start `could not be checked, and enters the terms by hand.` with
     `src/lib/http/rate-limit.ts stores them, and a screen past any limit is not run: the person is told the checks`
     and `allowed for now are used, to try again later or enter the terms by hand (screen_limited).` (re-wrap to 120).

4. **Optional (UX-3's nit; internal words only, never shown).** `packages/model-gateway/src/functions/contract-terms.ts:480-483`: `NAMES_PATIENT_MESSAGE = 'this document names a patient of the practice and was not sent'` could become `'this document holds an identifier from the practice’s patient records and was not sent'`, and `SCREEN_UNAVAILABLE_MESSAGE = 'this document could not be checked for patient details and was not sent'` could become `'this document could not be checked against the practice’s patient records and was not sent'`, so the gateway's sentences name the records as the screens do; then `contract-terms.test.ts:506` and any other test that asserts them change with them. path.test.ts passes either way (it builds its errors with its own strings).

5. **Named, not requested (pre-existing, the baseline's UX PR 24 class, N-3's sibling):** two more upload regions are named apart from their titles, and e2e files outside this part depend on the old names: `reconciliation/page.tsx:278` `aria-label="Upload exports"` under the title "Upload posting and EFT exports" (used by `e2e/reconciliation.spec.ts:55` and `e2e/ledger.ts:76`), and the version page's `aria-label="Propose the terms"` under "Have the model propose the terms" (used by `e2e/models.spec.ts:124, :171`). Fix them with UX PR 24 (`co-001/ux-headings-regions`: `aria-labelledby` to the title, as N-3 now does on Contracts), not here.
