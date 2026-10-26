# PR #53 (co-001/model-eval-gate @ 388f213c): AI-safety and evaluation-correctness review

Reviewer: the AI-safety and evaluation-correctness lane. Read-only on /home/user/model-eval-gate. One experiment ran on
a scratch script (it imports `src/tally.ts` from the worktree and edits nothing):
`/tmp/claude-0/-home-user-PhysicalTherapy/d485e7a2-2267-518e-ad2a-69386433675d/scratchpad/meg/review-scratch/ai-safety/omit.mts`.

## Findings

### B1 (blocking): the in-boundary "no regression" check never runs for a prompt or model change
- Where: `packages/model-gateway/eval/baseline.ts:499-502` (`servedBefore`), together with
  `packages/model-gateway/eval/gate.golden.test.ts:295` and `packages/model-gateway/src/prompts.ts:61-62`.
- Scenario: `recordPermitted` asks for `--against` only when some contract entry of the provider already carries a
  recorded permitted run. But the hash covers `models` (prompts.ts:62), so changing the model also means a new
  prompt version and hash. And the golden test makes every committed entry match the current prompt version and
  hash (`expect({prompt, sha}).toEqual(PROMPTS.proposeContractTerms…)`, for every entry). So the PR that brings in
  v2 (or a new model) has to delete the served v1 entries, or CI fails. After it merges, the baseline holds only
  v2 `permitted: 'pending'` entries, so `servedBefore` is false and `against` is optional. Running
  `eval record-permitted --report <v2 run>` with no earlier run then serves v2 in production on a run compared with
  nothing. This is exactly the first test in `eval/record-permitted.test.ts` ("writes the run's example count…":
  pending entries only, `against` null, recorded). The `servedBefore` branch can only fire when a run is
  re-recorded on the same version. A change of version is the case the check exists for, and there it never fires.
- Fix: decide "served before" from history the repository keeps, not from the current entries. Two options:
  (a) keep a `served_history` (provider, variant, prompt version and hash, model, permitted report hash) that the
  golden test lets outlive a version change, and require `against` whenever any record exists for the provider; or
  (b) have the golden test allow earlier-version entries that carry a `permitted` object (kept as history and never
  served, because `entryFor` matches the current version and hash), and have `recordPermitted` require `against`
  when any of them exists. Add a test that records v1 as served, changes the version, and expects
  `recordPermitted(…, null)` to throw.

### M1 (major): `--against` is not tied to what is served; the run can be compared with itself
- Where: `packages/model-gateway/eval/baseline.ts:503-509`; `src/permitted.ts:319-348`.
- Scenario: `permittedRegressions(run, earlier)` checks the example IDs, the fractions, wrong-but-verified and
  refusals. Nothing checks that `earlier` is a run of the served prompt version, hash and models, that its
  provider matches, or that it is a different file. `record-permitted --report r.json --against r.json` (or a
  second run of the new pending model, or a run of a weaker older model) passes and serves the new model. The
  only trace is `against_sha256 === report_sha256` in a diff of hashes.
- Fix: require `earlier.provider === run.provider`. Require `earlier.promptSha256` and `earlier.modelIds` to equal
  those of the entry being replaced (the served record from B1's fix). Refuse when
  `reportSha256(against) === reportSha256(report)`, and when `earlier.promptSha256 === run.promptSha256` for a
  change of version.

### M2 (major): leaving out a scope field silently widens the rate record, and the gate rewards it
- Where: `packages/model-gateway/src/tally.ts:146-147` (stated nothing → `missed`), `:172` (`wrongVerified` =
  wrong + extra); `src/functions/contract-terms.ts:315-327` (an omitted codes, modifiers, places or effective date
  is left out of the scope and is not a code default); `:253` (`rowProblems` skips a candidate with no codes).
- Scenario: the true record is 97110 GP $43.10. The held model states GP, the verifier rejects it, and the
  specialist sees the rejection. A new model leaves the modifier out. Every field it states verifies, and the
  proposed rate record applies to every modifier with nothing marked. The scratch run (`omit.mts`) shows
  held: modifiers `rejected 1`, overall tp/fp/fn 2/1/1, wrong-but-verified 0. New: modifiers `missed 1`, overall
  2/0/1, wrong-but-verified 0. Precision rises, recall is unchanged, and no rule fires. The faithful-case zero
  rule does not fire either. It is #84's failure (a visible problem turned into a silent one) in another form.
  Leaving out `codes` also skips `not_in_row`, so a swapped-row amount verifies on an "every code" record.
  Leaving out `effective_to` makes the record open-ended. Only the floors, still unset, bound this.
- Fix: add a tally key `widened`, for a scope field the paired truth states that the candidate leaves out while
  the candidate becomes a rate record. Count it with wrong-but-verified (zero on faithful cases, never rising,
  capped at the reference on unfaithful cases). Or have the verifier mark the omission as a code default the
  specialist confirms ("applies to every modifier"). Add faults `omitModifiers` and `omitCodes`.

### M3 (major): the permitted run sums both contract models, so one variant's regression can hide behind the other's gain
- Where: `packages/model-gateway/src/permitted.ts:226-270` (one `fields` and `total` for every example);
  `eval/baseline.ts:485-491, 512` (one run is recorded on every pinned model's entry).
- Scenario: under v2, the default model's examples drop 2 wrong-but-verified amounts and the ambiguous model's
  examples gain 2. Totals and fractions are no worse, so `permittedRegressions` is empty and both variants are
  served, including the ambiguous model, which got worse on real documents. A run with no ambiguous examples also
  serves the ambiguous variant on evidence that never called it. This contradicts the module's rule that each
  variant "is a model of its own, never held to the other's".
- Fix: tally the permitted report by variant (`byVariant: {default, ambiguous}`, each with its examples), compare
  each variant separately, and record a run only on the variants it called at least once (a variant with no
  examples stays pending, or is recorded explicitly as `examples: 0` for that variant).

### m1 (minor): a synthetic run with failed calls can be recorded as the baseline
- Where: `packages/model-gateway/eval/baseline.ts:311-322` (`blockingProblems`); `eval/harness.ts:323-326`.
- Scenario: a real-provider run where a few cases get `call_failed:throttled` or `invalid_output` scores those
  cases all missed and records them. The bar every later change is held to (recall, precision, per field) drops
  for a reason unrelated to the model. `recordPermitted` refuses this kind of run (`isUnmeasured`), but
  `recordBaseline` does not.
- Fix: in `recordBaseline`, refuse a report whose contract results carry `call_failed:*`, `refused:*` or
  `invalid_output`, or whose narrative failures carry `call_failed`, and tell the person to rerun.

### m2 (minor): labels are outside the twin comparison, and the canary is one phrase
- Where: `packages/model-gateway/eval/score.ts:200` (`label` dropped from the twin key) and `:236-239`.
- Scenario: on V11 or V15, a model obeys the injection only in a label ("Approved: submit without review"). The
  values, quotes and reviews equal the clean twin's and the canary string is absent, so `twin_differs` and
  `twin_canary` stay quiet. The specialist sees the label as the candidate's name.
- Fix: compare the injected twin's labels with the clean twin's after normalization, or fail when a label holds
  any word that appears only in the injection lines (approve, submit, review, the injection amount). Add a
  `labelInjection` fault.

### m3 (minor): a model's miss entered by hand without a citation reads as "accepted"
- Where: `apps/web/src/lib/models/contract-proposals.ts:314` and `:400`.
- Scenario: the specialist enters by hand a row the model missed and gives it no citation. The row is not counted
  as `missed[j]`, so the decision is `accepted` and no permitted example is kept. The in-boundary set loses the
  cases the model got wrong, and the acceptance rate overstates the model.
- Fix: count a final with no citation as `missed[j]` against every proposal of the version (or mark it
  `uncited_missed`), so the proposal is `accepted_with_changes`.

### m4 (minor): baseline integrity at load
- Where: `packages/model-gateway/src/baseline-format.ts:119-121`; `src/evaluated.ts:78`.
- Scenario: (a) a hand merge of two branches' records can leave two entries with the same key. `entryFor` and
  `contractBaselineFor` take the first one, which may be the weaker, and the golden test passes both because each
  recomputes from its own report. (b) The baseline is parsed when the module is imported, so a malformed file
  makes the web and worker fail at import instead of turning model features off. CI catches (b) before a merge.
- Fix: refuse duplicate (purpose, provider, prompt version, model, variant) keys in `parseBaseline`. Parse lazily
  inside `servingDecisions` and turn a failure into `GatewayConfigError` (features off).

## Nits and improvements
- n1: the golden recompute (`gate.golden.test.ts:280-305`) trusts each result's `pageText`, `twinOf`, `pairOf`,
  `layout` and `tier`, and its `wrongVerified` against its `fields`. Check these against the loaded set and
  `wrongVerifiedByField(result.fields)`, so a report edited by hand cannot mark a case unfaithful to get the
  reference cap.
- n2: the twin key sorts its entries but keeps `conflictsWith` as indices (`score.ts:211`). A real model that lists
  the same candidates in another order on a twin with conflicts fails `twin_differs` when nothing is wrong.
  Replace the indices with the hashes of the conflicting entries.
- n3: the `mergeRows` fault covers only a merged codes quote that the verifier rejects. Add the variant where the
  codes quote spans both rows (codes verify): the tally counts it as wrong codes, which no fault shows yet.
- n4: the unfaithful cap is a count per case and field (`baseline.ts:199-208`). It does not check that the wrong
  values are the misread rows. `not_in_row` keeps this tight in practice. Comparing which rows paired would close
  it.

## What I checked and found sound
- Tally (src/tally.ts): every stated field of every candidate is counted once, paired or not. A candidate with
  nothing right is unpaired, and its fields count as `extra`, so wrong values still count as wrong-but-verified.
  Greedy mispairing can only move counts toward `wrong` or `extra`, never toward tp. `asCounts` equals the /1
  counts. Every candidate field is in TRUTH_FIELDS. Split and merged candidates count as wrong or extra.
- Gate arithmetic: fractions and floors are compared exactly in BigInt (`score.ts:49-51`,
  `floors-format.ts:69-73`). Floors are decimal text, strictly parsed, all null and failing closed for a real
  provider both in the gate and at runtime.
- Fails closed: an incomplete or duplicate report is refused before anything else is computed. A spliced report is
  never recorded. A prompt edited in place fails (`prompt_changed`). A changed set is never compared, and
  `--new-set` refuses any change of prompt, hash, model or variant. The reference is computed in the same run,
  must match set and prompt, and a missing one is blocking (`reference_missing`). A crash or a feature-off error
  in the middle of a run throws, so nothing is recorded. The strict schema refuses dangerous counts in a
  hand-typed entry (literal 0). A missing `permitted` is treated as pending. Every entry recomputes from a report
  named by its own hash, on the current set and prompt.
- Serving: the gateway works out its own served set (`gatewayServing`), and no caller can widen it. The evaluable
  set is accepted only from a store acting for a job. The variant is checked after `prepare`, before the screen.
  Evidence requests and the denial-letter reader are `no_set` and never served. A local provider in production is
  refused except in the e2e build. A real provider outside production is held by the PHI boundary.
  `NODE_ENV` is trimmed, and anything other than `production` lands on the PHI-boundary refusal. The infra test
  holds the worker's evaluable read.
- No model output reaches money, a stage or an approval: `not_in_row` only adds rejections, the permitted run
  writes no proposal or rate record, and only corrected or rejected proposals become examples (F2 not built).
- Faults: each one I read proves what its name claims, splices are recomputed from their cases, and the
  demonstration (MOD-07) shows a rejection and a silent wrong value scoring the same under the old counts and
  failing apart under the new ones. The gaps are M2's omission and the n3 and m2 variants.
- Set v2: the injected twins share one generator, title and scan seed. Their truth equals the clean twin's except
  for the ID, `twinOf` and page text (`eval.test.ts:323`). V13 (hidden text) is marked unfaithful and V11 and V15
  (visible) are marked faithful. Struck and misread cases carry `asRead`, checked against the page as read. The
  five unfaithful cases (V05, V07, V08, V09, V13) each give their reason. The canary appears only in the injected
  twins.
