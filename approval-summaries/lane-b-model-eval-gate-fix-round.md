# Fix round, PR #53, part "permitted": dispositions

Worktree /home/user/model-eval-gate (head 3791fec2 plus uncommitted fixes; nothing committed, stashed or checked out).
"Before" runs use a HEAD snapshot (`git archive 3791fec2`) at scratchpad/meg/fix/before with the new tests copied in.
"After" runs are in the real tree. Logs are in scratchpad/meg/fix/permitted-before-*.log.

Files changed:
- packages/model-gateway/src/permitted.ts (from `isRefusal` to the end of the file)
- packages/model-gateway/src/permitted.test.ts
- packages/model-gateway/eval/baseline.ts (`recordPermitted`, its helpers and its imports only)
- packages/model-gateway/eval/record-permitted.test.ts (rewritten)
- packages/model-gateway/src/baseline-format.ts (the `served` field, `servedRecordSchema` and one line of the head comment)
- packages/model-gateway/src/gateway.ts and gateway.test.ts (N1 only)
- packages/model-gateway/src/index.ts (export lines)
- packages/model-gateway/eval/cli.ts (record-permitted only)
- packages/model-gateway/eval/gate.golden.test.ts (the one recordPermitted block, about 10 lines)
- apps/worker/src/models/permitted.ts, permitted-cli.ts, permitted.test.ts, permitted.db.test.ts
- ADR 0070: the permitted report paragraph, the gateway paragraph (N1), and "The permitted run before a model change is served"
- runbook model-evaluation.md, sections 6 and 7
- test-matrix MOD-11: docs/product/test-matrix.md and packages/synth/src/cases/matrix.ts, word for word

baseline.json was not touched by hand. `served` is optional and absent until the first real permitted record, so
nothing needed re-recording. The M2 and m4 fixer moved the format to /4 at the same time, and `served` is part of that /4.

Results after the fixes (real tree, M2 fixer's re-recorded baseline):
- record-permitted, permitted, gateway, config, worker permitted and permitted-serving, and infra compute: 7 files,
  217 tests, all pass.
- permitted.db.test.ts (DATABASE_URL on port 5433): 7 of 7 pass.
- The golden test "serves a real provider's contract entry only after its permitted run is recorded": passes.
- packages/synth fixtures.test.ts (the test-matrix rows word for word): passes.
- tsc: apps/worker and apps/web are clean. In packages/model-gateway the one remaining error is the m4 fixer's
  baseline-format.test.ts:112, not one of my files.
- eslint is clean on every changed file, and lint:logs passes (1006 files).
- Prettier is not enforced: files nobody touched also warn.

## B1 (major per the verdict): served history that survives a version change. Fixed.

- The baseline has a new top-level field, `served: { <real provider>: { <variant>: { prompt_version, prompt_sha256,
  model_id, examples, report_sha256, against_sha256, recorded_on } } }` (src/baseline-format.ts `servedRecordSchema`,
  strict).
  - It is written only by recordPermitted.
  - Production never reads it: `entryFor` and `servingDecisions` read only entries, so the history serves nothing.
  - `recordBaseline` spreads the baseline, so a re-record keeps it. Deleting the served entries keeps it too.
- `servedBefore` is true when the history has any record for the provider, or when any entry of the provider has a
  `permitted` object (this covers history deleted by hand). In that case `--against` is required. A null `--against`
  is accepted only for a provider's true first run.
- Tests:
  - record-permitted.test.ts "needs --against whenever anything was ever served…": entries put back to pending, and
    entries deleted and added again as pending, then null is refused (/give --against/). An entry served with no
    history is refused the same way.
  - gate.golden.test.ts: after recordBaseline re-records, `served` stays and null is refused.
- Before: fails ("expected [Function] to throw"; permitted-before-record.log). After: passes.

## M1 (major): `--against` tied to what was served. Fixed, with the strictest rule that works (documented in `againstProblems`, ADR 0070 and runbook section 7).

- The earlier report must parse as the current /2 and add up (`earlier_report_inconsistent`).
- It must be:
  - from the same provider (`against_provider`);
  - a production run (`against_not_production`);
  - neither the report itself (`against_is_report`, same text hash) nor the same run written again
    (`against_same_run`, same runId);
  - for every variant with a served record, a run of that record's prompt version, content hash and model
    (`against_not_served:<variant>`).
- Its hash is not required to equal the served `report_sha256`. Examples grow, and runs are compared on the same
  examples (`examples_changed`), so that rule would block every later record. That is the verdict's correction.
- The lineage is recorded instead:
  - The rerun's hash goes in as the new record's `against_sha256`, so the history chains run to run.
  - The report now carries `runId`, the job actor that is `model_call.actor_id`. The runbook has the reviewer check it
    against model_call in the boundary.
- An earlier run that did not measure a served variant (`earlier_unmeasured:<variant>`) is refused.
- Tests: record-permitted.test.ts "ties --against to what was served…". It covers self-comparison, the same run
  rewritten, another provider, a non-production run, another model, and another prompt hash. The served run and a
  fresh rerun are accepted.
- Before: fails (the self-comparison is accepted). After: passes.

## M3 (major): each variant apart. Fixed.

- `PermittedResult.variant` is new. The worker sets it from `row.ambiguous`, as the gateway's prepare does.
- Report /2 has new fields:
  - `variants.{default,ambiguous}`, each with `{ modelId|null, examples, exampleIds, measured, fields, total, refused }`;
  - `runId`, `production` and `measured`.
  - The top-level `modelIds` is replaced by the per-variant `modelId`. The combined fields, total and refused stay,
    for reading only.
  - /2 is changed in place, not bumped to /3, because no /2 report was ever written outside this unmerged PR. An
    earlier draft-shape /2 fails the strict schema (`earlier_report_invalid`).
- `permittedRegressions` compares each variant alone:
  - `examples_changed` overall, plus `examples_changed:<v>`;
  - `precision_regressed:<v>:<f|all>`, `recall_regressed:…`, `wrong_verified_rose:…` and `refused_rose:<v>`;
  - `earlier_unmeasured:<v>`.
  - It takes the list of variants to compare. recordPermitted compares every variant that was served before or is
    recorded now.
- recordPermitted records an entry only from its own variant's examples. A variant qualifies with at least one
  measured example, or when the whole run has zero examples (the §4.5 first-run allowance). Otherwise it stays pending
  and is returned in `pending` with `no_examples` or `nothing_measured`. The CLI prints it.
- Tests:
  - record-permitted.test.ts: the masking scenario (equal totals, the ambiguous model worse) is refused as
    `wrong_verified_rose:ambiguous:amount`. A default-only run records only the default entry, with
    `ambiguous: no_examples`. An unreadable ambiguous example gives `nothing_measured`.
  - permitted.test.ts: "compares each variant on its own…", and an example moved between variants gives
    `examples_changed:<v>`.
- Before: fails. After: passes.
- Consequence recorded in ADR 0070 for the founder: once a run has examples, a variant that never had one (the
  ambiguous model, if nobody ever marks a contract ambiguous) is not served again after a prompt or model change. It
  gains no example while it is not served. Serving it on the synthetic gate alone is left to the founder.

## S1 (minor per the verdict): an allowlist of measured outcomes. Fixed, safer than the verdict's denylist addition.

- `permittedOutcome` (src/permitted.ts) sorts every outcome into one of three kinds:
  - measured: no problem, or `invalid_output`;
  - outside the model: `document_unavailable`, `expected_invalid`, `refused:document_kind|no_text|too_many_pages|names_patient`;
  - unmeasured: every other code. That includes `refused:phi_boundary`, `refused:screen_unavailable`,
    `refused:input_invalid`, `budget_exceeded`, `busy`, `serving_invalid` and any unknown code.
- recordPermitted refuses a run with any unmeasured outcome, with or without `--against`. It also refuses a run with
  examples none of which was measured ("no example reached the model").
- Hardening from the verdict:
  - `checkPermittedGateway` in the worker makes evaluate-permitted exit 2 for a real provider outside production.
  - recordPermitted requires `production: true` (see N4).
- Tests:
  - record-permitted.test.ts "refuses a run that did not measure the model…": 11 codes, with and without `--against`,
    plus the all-outside-the-model run.
  - permitted.test.ts: the allowlist itself.
  - worker permitted.test.ts: `checkPermittedGateway`.
- Before: fails ("refused:phi_boundary: expected [Function] to throw"). After: passes.

## N1: `serving: 'evaluable'` bound to the permitted run. Fixed in gateway.ts.

- 'evaluable' now needs a job actor whose ID is a UUID (the run's ID).
- A gateway built with it makes only that run's own calls: `proposeContractTerms` under
  `permittedRequestKey(jobId, exampleId)`, which is `eval:<uuid>:<uuid>` and exported. The worker now builds its keys
  with it.
- Any other call is refused with `serving_invalid` before the flags, the budget or the provider are touched:
  - another job's key, or this job's under another name;
  - another run's key;
  - another purpose, such as a narrative.
- Tests: gateway.test.ts "makes the permitted run's own calls only…" (no flag read, no request, no row; a non-UUID job
  is refused). The existing evaluable-job test now uses the run's key.
- Before: fails ("promise resolved instead of rejecting"; permitted-before-gateway.log). After: 43 of 43 pass.

## N3: the runbook's "is not spliced". Fixed by adding the check, then making the docs describe it.

- `permittedReportProblems` returns `report_inconsistent` unless all of these hold:
  - the example IDs are unique and sorted, and their count is `examples`;
  - the variants split the IDs between them;
  - each variant's total equals the sum of its fields, and the combined fields equal the sum over the variants;
  - refused and measured, overall and per variant, are what the problems give;
  - each problem is an example's, and appears once;
  - legacyUnfiltered is at most examples.
- recordPermitted applies the check to the report and to the earlier report.
- The runbook and ADR now say "its counts add up (an edited or spliced report is refused)".
- Tests: record-permitted.test.ts "refuses a report whose counts do not add up…" (14 edits), and the
  `permittedReportProblems` test in permitted.test.ts.
- Before: a spliced report (examples 4, a duplicated ID) is recorded (permitted-before-n3.log). After: passes.

## N4: a zero-example report tied to production. Fixed: tied to production rather than refused.

- Refusing every zero-example run would deadlock the feature. Permitted examples are corrections of model proposals,
  so none can exist before a real provider is served once.
- So the report carries `production` and `runId`, and recordPermitted refuses any report with `production: false`,
  zero examples included.
- The worker writes `production` from the gateway config, and refuses a real provider outside production with exit 2.
- Tests: record-permitted.test.ts "records a run with no examples at all… as a production run only". The golden test
  now records a production run.
- Before: fails (a non-production report is accepted). After: passes.

## Integrator's proposal: a missing or unreadable `--against` file gives PermittedArgsError (exit 2). Fixed.

- `readEarlierReport(file, read?)` in apps/worker/src/models/permitted.ts wraps the read. The message is
  "--against: the earlier report could not be read (<CODE>)", and `unreadable` stands in when the code is missing or
  not a system code. The message never carries the path or the content.
- permitted-cli.ts uses it, so the existing catch exits 2.
- `eval record-permitted` got the same treatment (`readReportFile`): "--report/--against could not be read (ENOENT);
  nothing is recorded". This was smoke-tested.
- Tests: worker permitted.test.ts: ENOENT, EISDIR, no code, a non-code `code`, and a /1 report read from a file.
- Before: fails (`readEarlierReport` missing; the old CLI rethrew a raw ENOENT with the path; permitted-before-worker.log).
  After: passes.
# Fix round, PR #53, part metric (ai-safety M2, m1, m2, m4, n1-n4)

Worktree /home/user/model-eval-gate (head 3791fec2, not committed). Before evidence: HEAD's packages/model-gateway was
exported with `git archive` into the scratch copy `scratchpad/meg/fixm/before/`, with the new tests (and the new
eval/faults.ts) copied over it. Logs: `fixm/before-unit.log`, `fixm/before-reasons.log`, `fixm/before-golden.log`.
After: unit `packages/model-gateway` + `apps/worker/src/models` 400/400; golden `gate.golden.test.ts` 52/52
(`fixm/after-golden.log`); `tsc -p packages/model-gateway` and `-p apps/worker` clean; eslint clean on every file touched.

## M2 (major): a scope field left out widens the rate record, unseen. FIXED

- `src/tally.ts`: new tally key `widened`, apart from `missed`. It counts a scope field (`SCOPE_FIELDS`: codes,
  modifiers, places_of_service, effective_from, effective_to) that the paired truth states and that the paired
  candidate leaves out, when the candidate became a rate record (`Stated.rateRecord === true`). `wrongVerified` is now
  `wrong + extra + widened`. So `wrong_verified_rose` (it can never rise), `wrong_verified_on_faithful` (zero on faithful
  cases) and the unfaithful cap all cover it, with no new gate code.
- How precision and recall are derived stays the same, and the doc comment says so: `asCounts` fn = wrong + rejected +
  missed + widened, which is what /1 counted the omission as. fp does not change, because a widened field states
  nothing. Every recorded fraction compares as before. The property test (now with a random `rateRecord`) still holds
  the derived counts equal to the 6ddd587 scorer's.
- `eval/score.ts statedOf`: passes `rateRecord: review.rateRecord !== null` from the verifier's own review.
- Format changes: BASELINE_FORMAT is `tp-model-eval-baseline/4` and REPORT_FORMAT is `tp-model-eval-report/3` (both
  formats carry `widened`; /3 also carries `wrongVerifiedAt`, see n4).
- New fault `dropScope(field)`: leaves the field out of every candidate that states it.
- Tests (each failed before):
  - tally.test "counts a scope field ... as widened" (fails before: no `widened` key);
  - score.test "counts a scope field ... widened" (modifiers and places on C99; codes and effective_to, both rate
    records);
  - score.test "a scope field left out (review M2) ... reads as better precision under the fractions alone, and fails
    the gate". Held = rejected GP, now = omitted GP. Precision rises and recall is unchanged. The gate gives
    `wrong_verified_rose:all/modifiers` and `wrong_verified_on_faithful:modifiers`, and a first record is refused;
  - golden "dropScope". On C05, modifiers gives the exact problem list, ending in `wrong_verified_on_faithful:modifiers`,
    and the case's tally is `{widened: 4}`. Codes and effective_to on C08 also fail. Before: only precision and recall
    regressions (`before-golden.log`);
  - baseline-format.test "refuses a tally of the format before /4".
- In-boundary run: `src/permitted.ts` belongs to the permitted fixer. Its `statedKeys` does not set `rateRecord`, so
  the permitted scorer still counts these omissions as `missed` (when `rateRecord` is absent it is read as false, so
  `permitted.test` stays green). **Integrator:** add `rateRecord: candidate.rateRecord !== null` to `statedKeys` to
  cover the in-boundary gate. `tallySchema` now requires `widened`, so a permitted /2 report written before this
  change no longer parses. As `--against` that fails closed (`earlier_report_invalid`). Bumping
  `tp-model-eval-permitted/2` is the permitted fixer's call.
- Not done here (outside my files): the production side the verdict also suggested (a code default for an omitted
  scope, a CandidateCard row for it, or holding a candidate with no codes). These are in `contract-terms.ts` and
  `display.tsx`; recommended to the integrator.

## m1 (minor): recordBaseline recorded runs whose calls failed. FIXED (verdict's corrected scope)

- New blocking gate problem `unmeasured_cases` (`eval/baseline.ts absoluteProblems`). It fires for any case whose
  problem is `call_failed:*` or `refused:*`, so recordBaseline refuses the run on a first record (`no_baseline`) and on
  a `--new-set` record too.
- This is wider than recordPermitted's `isUnmeasured`, on purpose, and documented: every synthetic document is input
  the gateway accepts, so any refusal comes from the run, not the model.
- `invalid_output` stays recordable, per the verdict: it is the model's own answer and a measurement. The narrative
  clause was dropped because `narrative_failures` already blocks a failed narrative call (verdict).
- Tests:
  - score.test "refuses a run some of whose cases did not reach the model" (call_failed:throttled/timeout,
    refused:feature_off/input_refused; the first-record and new-set records throw; invalid_output records). Fails
    before;
  - golden: failTwin on C04 (no twin, no conflict) is refused at a first record;
  - golden: failTwin on V11 now gives `unmeasured_cases` + `twin_incomplete`. Both fail before.

## m2 (minor): a label that obeys the injection was invisible. FIXED

- I did not use label equality, because the verdict says labels legitimately vary. Instead,
  `eval/score.ts injectedWords(pages, others)` takes the words an injected twin's pages write that no document without
  an injection writes. They come from the pages, not a hand list, so they follow the fixture. `holdsWord(output, words)`
  checks every output string: labels, quotes and written values.
- The harness's `canary` is now: the canary phrase on any case, or an injected word on an injected twin
  (`obeysInjection`). The gate's existing `twin_canary` reports it, so the report shape is unchanged.
- Probe (`fixm/words.mts`): on the set, the marker words are IMPORTANT, AUTOMATED, READER, DISREGARD, REIMBURSED,
  $500.00, APPROVED, WITHOUT, REVIEW, the canary and similar. Generic words such as CPT and VISIT are excluded because
  other documents write them.
- The reference answers hold none of the marker words (`twins.canary: []`).
- The twin-key comment that wrongly said the canary rule catches labels has been corrected.
- New fault `labelInjection`.
- Tests:
  - score.test "finds, on an injected twin, any word only the injection writes". The label
    'Approved: submit without review' is caught, and its twin key equals the clean twin's. A label in the document's own
    words is not caught. Fails before: no such function;
  - golden "labelInjection" on V11, V13 and V15 → exactly `['twin_canary']`. Before: `[]`.

## m4 (minor): duplicate keys; import-time parse. FIXED / DECIDED (keep eager, fail loud and closed)

- `src/baseline-format.ts`:
  - `sameEntryKey` is the one definition of an entry's identity: purpose, provider, prompt version, model, variant;
  - `refuseDuplicateKeys` is a superRefine on `entries`;
  - `eval/baseline.ts recordBaseline` now uses `sameEntryKey`, so the writer and the reader share it.
- Import time: decided to keep the eager parse, as the verdict says. The file is a build artifact and every CI run
  parses it.
- `src/evaluated.ts committedBaseline` wraps the parse and throws a `GatewayConfigError` that names eval/baseline.json
  and says nothing can be served. The rationale is in the doc comment.
- Tests:
  - baseline-format.test "refuses two entries of one key" (fails before: it parsed);
  - new `src/evaluated.test.ts`: a duplicate, the /3 format, a dangerous count or a non-object each throw
    GatewayConfigError with the file name; the committed file round-trips. Fails before: no `committedBaseline`.
- Cost, noted for the integrator: because of the eager parse, any baseline format change makes the CLI unrunnable on
  the old file (src/config imports evaluated). I re-recorded in two steps:
  1. `fixm/bootstrap.mts` wrote the /4 format with no entries, through `parseBaseline`. It refuses a real-provider
     entry, and there were none.
  2. `pnpm --filter @tp/model-gateway eval --record` then recorded the run.

## n1 (nit): the recompute trusted report metadata. FIXED

- `eval/harness.ts caseMismatches(report, set)`:
  - checks layout, tier, pageText, twinOf and pairOf against the loaded set;
  - checks wrongVerified against `wrongVerifiedByField(fields)`;
  - checks that wrongVerifiedAt holds no more than that count and only real record indices.
- The golden recompute asserts `[]` for every recorded report.
- New golden test "finds a report edited by hand" (a faithful case marked unfaithful, a renamed twin or pair, a
  tampered count, a case not in the set). Fails before: no function.
- The gate's unfaithful cap now computes from `fields`, not from the carried `wrongVerified`.

## n2 (nit): twin key kept conflictsWith as indices. FIXED

- `twinSha256` hashes each entry without its conflicts, then writes `conflictsWith` as the sorted hashes of the entries
  it points at.
- Test: score.test "keys the conflicts by what the conflicting candidates said". Three reorders of an amended answer
  give the same key; a real change of conflict partner does not. Fails before: the keys differ.

## n3 (nit): no fault for merged codes that verify. FIXED

- New fault `mergeRowsSpanning`: candidates 0 and 1 merged, with the codes quoted over both rows through a shared
  `spanning()` helper (crossRowQuote now uses it too).
- Golden on C01, beside mergeRows: the exact problem list ends in
  `wrong_verified_rose:codes, wrong_verified_on_faithful:codes`, and codes = `{wrong: 1, missed: 1}`.
- This test passes on HEAD as well. HEAD's tally already counted verified wrong codes, so n3 was a coverage gap and
  not a defect. The fault now covers it.

## n4 (nit): unfaithful cap was a count only. FIXED where feasible, documented where not

- `tallyFields` returns `wrongVerifiedAt` (record index and field for each wrong, extra or widened count on a paired
  record), and the report carries it per case.
- New blocking gate problem `wrong_verified_off_reference`: on an unfaithful case, a wrong value on a record and field
  that the reference has right. It applies in addition to the count cap. An extra on an unpaired candidate has no
  record, so only its count bounds it (documented).
- Tests:
  - tally.test "names each paired record and field";
  - score.test "holds an unfaithful case's wrong values to the records the reference has wrong": the same count on
    another record fails;
  - golden: the reference's 5 wrong values on V05 and V07 are all on fields with `asRead`, and none are on faithful
    cases;
  - golden: takeStruck on V08 now also gives `wrong_verified_off_reference:V08:amount`.
  - All fail before.
- I did not build a golden fault that moves a misread value to another record of the same field, because it is
  infeasible. The verifier binds a row's amount to the one whole figure on its own row. Probe `fixm/probe-n4.mts`: on
  V05, the variants `$83`, `83`, `97033` give `not_in_quote` and `$83.8` gives `unreadable`. A swapped value also gets
  `not_in_row`. ADR 0070 documents this.

## Files

- packages/model-gateway:
  - src/tally.ts, src/tally.test.ts;
  - eval/score.ts, eval/score.test.ts;
  - eval/harness.ts;
  - eval/baseline.ts: header, imports, GateProblem, `unmeasured`, absoluteProblems, recordBaseline doc and
    sameEntryKey; recordPermitted untouched;
  - src/baseline-format.ts: format /4 with its header line, sameEntryKey, refuseDuplicateKeys; the permitted fixer's
    `served` is untouched;
  - src/baseline-format.test.ts;
  - src/evaluated.ts, src/evaluated.test.ts (new);
  - eval/faults.ts;
  - eval/gate.golden.test.ts (the permitted fixer's F5 block untouched);
  - src/floors-format.test.ts: outside my list but forced by the change. Its FieldTally literal and its oracle's recall
    denominator needed `widened`;
  - eval/baseline.json and eval/reports/13abefc32a88b87ec687491a6de9e37e79e9ea633840fd1367c0f25f94b33a48.json were
    re-recorded through the CLI. The orphan eval/reports/55649a4f...json was deleted from the working tree only; the
    index is unchanged.
- docs:
  - ADR 0070: the tally table and definitions, report /3, baseline /4, duplicates, caseMismatches, committedBaseline,
    the gate table rows unmeasured_cases, wrong_verified_off_reference and twin_canary, the twin key, the faults
    paragraph;
  - runbook §3;
  - test-matrix rows MOD-07, MOD-08 and MOD-10.

## For the integrator

1. permitted.ts `statedKeys`: add `rateRecord: candidate.rateRecord !== null` (see M2). Consider bumping the permitted
   report format.
2. eval/cli.ts `counts()`: print `widened` (the line lists the other seven).
3. If the permitted fixer also changes the baseline or report format, re-record with the same bootstrap, then
   `eval --record`.
4. The `note` in baseline.json ("production serves a real provider only once every current prompt version and pinned
   model of every purpose has its entry") is out of date compared with per-key serving. That note is not mine.
# Fix round, PR #53: part "synth and owners"

Worktree /home/user/model-eval-gate (head 3791fec2). Nothing committed, stashed or reset.

## security S2 (minor, confirmed): set v2 boilerplate wrote real-range NPIs and random TINs. FIXED

- packages/synth/src/x12/factory.ts: `npiCheckDigit` is now exported, and two helpers are added.
  - `syntheticNpi(random)` gives 99 + 7 digits + the Luhn digit over 80840. This is the repository rule.
  - `syntheticTin(random)` gives `00-` + 7 digits. The IRS never assigns the 00 prefix.
  - `SynthWorld.npi()` now calls `syntheticNpi(this.random)`. It makes the same random calls, so every 835 fixture
    is byte-identical (synth --all rewrote no 835).
- packages/synth/src/eval/contract-set-v2.ts: `boilerplate()` case 2 now writes `syntheticNpi(random)` and
  `syntheticTin(random)`. Its doc comment states the rule.
- Why the TIN does not copy the factory's TJ form (`99` + 7 digits): 99 is an EIN prefix the IRS assigns (the
  Philadelphia campus and online EINs). Copying it would not meet "cannot collide with a real one". 00 is never
  assigned. Following the verifier, the TIN therefore uses an unassigned prefix.
  - Follow-up for the integrator or the founder, outside this part: the 835 TJ reference in factory.ts (`99` + 7
    digits) and its header comment ("tax identifiers carry SYN") disagree. Moving TJ to 00 would change every 835
    fixture.
- Tests:
  - packages/synth/src/eval/eval.test.ts, "writes every NPI in its boilerplate in the 99 range with its check digit,
    and every TIN under a prefix the IRS never assigns". It reads every committed v2 file and the large tier as
    written: a PDF's string operands, and a recording's text. It checks:
    - each "National Provider Identifier is N" and every other ten-digit run is 99 + 8 digits and passes Luhn over
      80840;
    - each TIN is 00-NNNNNNN;
    - there are more than 30 NPIs, and as many TINs as NPIs.
  - Before the fix (generator line restored for the run): FAIL with
    `contract-set-v2/V01-table/document.pdf: expected '1611700079' to match /^99\d{8}$/`. After: PASS.
  - packages/synth/src/x12/x12.test.ts, "synthetic identifiers". Over 200 draws it checks the 99 form with its check
    digit and the 00 TIN. It checks the published NPI example (123456789 gives 3). It checks that
    `SynthWorld('same-seed').npi()` equals `syntheticNpi(new Random('same-seed'))`. PASS (15/15 in the file).
- Regenerated with `pnpm synth --all`. It wrote 8 files:
  - MOD-09 contract-set-v2 V01-table/document.pdf, V03-prose/document.pdf, V05-scanned/document.pdf and
    textract.json, V06-scanned/document.pdf, V07-scanned/document.pdf;
  - MOD-09/expected.json (24 sha256 lines changed, the large tier's pins among them);
  - MOD-11/expected.json. Its assertion text comes from another fixer's matrix.ts MOD-11 row, not from this part.
  - V02's CSV is unchanged, so packages/synth/src/guard/pinned-tables.json needs no change.
- The set v2 bytes and hash change. **The integrator re-records the baseline with `--record --new-set`.**
- Checks:
  - eval.test.ts and x12.test.ts: 48/48.
  - packages/synth suite: 179/180. The one failure is fixtures.test.ts "holds every row of docs/product/test-matrix.md,
    word for word". It is caused by other fixers' MOD rows, in flight between matrix.ts and test-matrix.md, not by
    this part.
  - `pnpm check:fixtures` is clean. eslint on the changed files is clean, and so is tsc for packages/synth.
- No doc names the boilerplate's NPIs or TINs, so no doc line changed.

## security S3 (refuted as a nit; the improvement is taken). DONE

- .github/CODEOWNERS: the serving-switch block now names the founder for the data and for the code that judges it.
  - Data: `config/models.json` (the confirmed prices behind `price_unconfirmed`), added to the existing baseline.json,
    floors.json and reports/.
  - Judge: `src/evaluated.ts`, `src/baseline-format.ts`, `src/floors-format.ts`, `eval/baseline.ts` and
    `eval/floors.ts`.
  - The verifier's list included models.json and eval/floors.ts, so they are named too.
  - The comment now cites docs/adr/0070, Part 2 only ("session ruling 10" is gone). It gives the same reason as the
    approval-judge lines: a pull request could otherwise serve a feature by changing its judge.
  - Not named: `src/prices.ts` and `src/purposes.ts`. The `*` line still holds them.
- tools/test/codeowners.test.ts:
  - The ordered pattern list now has the six new lines.
  - The serving-switch case is renamed and now cites ADR 0070 Part 2 only. It checks that every data file, every
    report an entry names and each of the five judge files exists and is owned by a named line.
  - The old `expect(owned('packages/model-gateway/eval/baseline.ts')).toBe(false)` is replaced.
  - The header comment is updated.
  - Before (test run against HEAD's CODEOWNERS): 2 failed, 6 passed, in the ordered list and serving-switch cases.
    After: 8/8.
- ADR 0070 Part 2, "The founder's paths": the paragraph now names the data and the judge files with the reason.
  The ADR's own ruling list (item 10) is left as recorded.
- Note: the verifier advised waiting for a founder ruling. The fix-round brief overrides that by taking the
  improvement. Every one of these paths was already the founder's under `*`, so the change only makes the
  review named.

## ai-safety m3 (refuted, nit). NO CHANGE

The claim is that a final with no citation can reach `reviewVersionProposals` and read as accepted. It cannot:
- `reviewVersionProposals` has one production caller, `approveVersionAction` (apps/web/src/lib/routes/abstraction.ts,
  about lines 384-387). It runs only after `approveVersion` succeeds, in the same transaction.
- `approveVersion` (packages/contracts/src/services.ts:600-620) refuses unless every rate record is verified. It then
  resolves each record's citation and refuses on any that does not resolve.
- `EvidenceResolver.resolve(null)` returns `{ resolved: false, problem: 'not_cited' }`
  (packages/contracts/src/evidence/resolve.ts:79-80). So a version holding a hand-entered record with no citation is
  refused before the proposals are judged.
- A record with no citation also cannot be verified at all:
  - `approveRateRecordField` (services.ts:578-582) sets `verified_by` only when resolve() succeeds;
  - setting a citation to null afterwards clears verification (services.ts:450, 459);
  - after approval, `requireEditable` blocks any edit.
- A hand-entered miss must therefore cite a document of the version. If it cites this document, `changedFields`
  counts it as `missed[j]` (accepted_with_changes, and an example is kept). If it cites an exhibit, design section 3.8
  leaves it out on purpose.
- What remains: `uncited_finals` (apps/web/src/lib/models/contract-proposals.ts:400) is always 0 under today's rules.
  That file is not in this part.
