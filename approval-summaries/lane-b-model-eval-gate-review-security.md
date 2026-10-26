# PR #53 (co-001/model-eval-gate, head 388f213c): security review

Reviewer: security (checklist: .claude/agents/security-reviewer.md). The worktree /home/user/model-eval-gate was only
read. The experiments ran from the scratchpad and imported the worktree's modules without changing them. This review
does not say anything is HIPAA compliant.

## Findings

### S1 (major): a permitted run that never reached the model is recorded, and that switches the feature on

- Where: `packages/model-gateway/eval/baseline.ts:495-519` (`recordPermitted`, `UNMEASURED_REFUSALS`), together with
  `apps/worker/src/models/permitted.ts:134-142` (`problemOf` maps `PhiBoundaryError` to `refused:phi_boundary`).
- What goes wrong: `isUnmeasured` refuses a run only for `call_failed:*`, `refused:kill_switch`,
  `refused:feature_off` and `refused:not_evaluated`. Three cases get through:
  - `refused:phi_boundary` is what every example gets when `evaluate-permitted` runs outside production. The code
    counts it as an ordinary refusal and records the run.
  - `document_unavailable`, `invalid_output` and `expected_invalid` are also recorded on the provider's first
    record-permitted. That record needs no `--against`, so nothing is compared.
- How to reproduce: the probe at
  `/tmp/claude-0/-home-user-PhysicalTherapy/d485e7a2-2267-518e-ad2a-69386433675d/scratchpad/meg/review-scratch/sec-permitted/probe.ts`
  builds a baseline with pending bedrock contract entries. It then calls `recordPermitted(baseline, report, null, …)`
  with a /2 report of 3 examples, where every example has one of these problems. Each of the four problems comes back
  RECORDED, as `permitted: {"examples":3, …}` on both variants, even though `tp` is 0 and, for phi_boundary,
  `refused` is 3.
- Why it matters: `servingDecisions` serves the key as soon as that commit lands (`src/evaluated.ts`,
  `permitted_pending` cleared). So the second step of F5 (a) can be met by a run made on a laptop or in a test
  environment against synthetic practices, or by a run that read no document at all. The founder reviewing the diff
  sees `examples: 3`, which looks like a measured run. The report is not committed and records no run ID, so nothing
  ties the hash to model_call rows made in production.
- Fix:
  1. Add `refused:phi_boundary` to `UNMEASURED_REFUSALS`.
  2. Refuse a report in which every example is a refusal or a problem, unless `examples` is 0.
  3. Add the run ID (the job actor's ID) and the run's `production` flag to report /2. `recordPermitted` should require
     `production: true`. The runbook should have the reviewer check the run ID against the model_call rows of
     `actor_kind = 'service'`.
  4. Add tests for each of these.

### S2 (minor): new fixtures write NPIs in the real NPI range, and random TINs

- Where: `packages/synth/src/eval/contract-set-v2.ts:395`:
  `National Provider Identifier is 1${random.digits(9)}` and `taxpayer identification number is ${random.digits(2)}-${random.digits(7)}`.
- What goes wrong: the repository's rule is `SynthWorld.npi()` (`packages/synth/src/x12/factory.ts`), which writes "a
  ten-digit NPI-shaped identifier starting 99, which no real NPI does". This generator writes `1` followed by random
  digits instead, which is the space real individual NPIs are issued from.
  - Of the 36 NPIs in the committed MOD-09 files, 3 pass the NPI check digit: `V01-table/document.pdf` (two) and
    `V05-scanned/textract.json`. Each could be a real provider's number.
  - The large tier generated in CI writes 493, of which 42 pass.
  - The TINs are random XX-XXXXXXX values and can collide with real EINs.
  - These are not PHI, but they are real-looking, and possibly real, identifiers in fixtures.
- Fix:
  - Draw NPIs from the 99 prefix, as `SynthWorld.npi()` does.
  - Draw TINs with a prefix the IRS never assigns (for example 00- or 07-).
  - Add a test that no NPI in set v2 starts with anything but 99.
  - This changes the set hash, so re-record the local entry (`--record --new-set`) in the same commit.

### S3 (minor): CODEOWNERS names the switch's data files but not the code that reads them

- Where: `.github/CODEOWNERS:37-41` and `tools/test/codeowners.test.ts:128-140`.
- What goes wrong: the named lines cover `eval/baseline.json`, `eval/floors.json` and `eval/reports/`. The test also
  asserts that `eval/baseline.ts` is *not* named. The same switch is also decided by:
  - `src/evaluated.ts`: `SERVING_RULES`, and the decision code itself. For example, changing `suggestEvidenceRequests:
    'no_set'` to `'narrative_gate'` serves a purpose that has no set.
  - `src/baseline-format.ts`: the literals that make a dangerous entry fail to parse.
  - `src/floors-format.ts`: the floor regex and `meetsFloor`.
  - `config/models.json`: `price_unconfirmed`.
  Today the `*` line covers all of these, so nothing is open. But the file states its rule for named lines: "a pull
  request could otherwise pass the gate by changing its judge". Under that rule these are the switch's judge, the same
  way `/packages/db/src/domain-model/` is named for the schema gate.
- Fix: name `packages/model-gateway/src/evaluated.ts`, `src/baseline-format.ts`, `src/floors-format.ts` and
  `config/models.json`, and extend the test to cover them.

## Nits

- N1: `serving: 'evaluable'` is accepted for any store whose actor is a job (`packages/model-gateway/src/gateway.ts:123`),
  not only the permitted run. Today only `apps/worker/src/models/permitted.ts:172` builds one. A later worker job that
  passed it would call an unserved key on practice material. Consider an explicit evaluation actor, or a check named
  for the run (for example a `jobKind: 'evaluate-permitted'` on the actor), so the narrowing is enforced in the code
  rather than by convention.
- N2: the PR is `mergeable_state: dirty` against the current base `4d99df80`. `git merge-tree` shows conflicts in
  `packages/synth/src/cases/matrix.ts`, `registry.ts` and `tools/test/codeowners.test.ts`. When resolving
  `codeowners.test.ts`, keep both sides' named-path lists; CODEOWNERS itself auto-merges. Then rerun
  `tools/test/codeowners.test.ts` and regenerate `watched-paths.txt` (session ruling 2).
- N3: `docs/runbooks/model-evaluation.md:151` says record-permitted refuses a report that "is spliced". A permitted
  report has no spliced field, and `recordPermitted` checks no such thing. Either drop the words or add the check.
- N4: `docs/runbooks/model-evaluation.md:143` ("Before the first practice there are no examples; the run reports none
  and is recorded the same way") is the case S1's fix should keep. A zero-example run should be recorded only when the
  run itself shows it ran in production.

## What I checked and found sound

- **PHI to a model.**
  - No prompt changed: no file under `prompts/` is in the diff, and the prompt hashes are unchanged.
  - The permitted run's gateway is built in the practice's job scope (`withJobScope`). It reads the document under
    RLS plus an explicit `practice_id` filter with an audited read, and its page-text transaction ends before the call.
  - Report /2 holds counts, problem codes and `eval_example` row IDs only, with no practice IDs, text, quotes or
    figures.
  - Accepted proposals are still not kept as examples (`contract-proposals.ts:388`, F2 unbuilt). Correction /2 keeps
    only the proposal's own document's cited finals, which is less than before.
  - The committed report `eval/reports/55649a4f….json` holds only counts, codes, case IDs and hashes. I walked every
    key and string.
  - The baseline holds local entries only, and every floor is null, so nothing real is served.
- **Fixtures.**
  - Every added or modified file under `fixtures/`, `eval/reports/`, `eval/baseline.json` and `eval/floors.json`
    passes the writer's guard (`packages/synth/src/guard/cli.ts`, 0 refused).
  - The truth files carry `"synthetic": true`, and the documents say SYNTHETIC.
  - Party names are `SYNTHETIC PAYER/THERAPY GROUP`, telephone numbers are 555 numbers, and addresses are on
    "Example Avenue". The NPIs and TINs are the exception (S2).
  - The large tier is gitignored and generated in CI.
  - The injected-instruction twins carry only a canary and a $500 rate. The gate requires each twin's full output and
    review to equal its clean twin's. Approval and submission stay with people: a proposal is never a rate record
    until a person approves it.
- **Logs and errors.**
  - `pnpm lint:logs`: 1003 files, every log call allowlisted.
  - The new log lines carry only `error_code` and `record_count`, plus `practice_id`/`job_id` in the worker.
  - Every new error message names a code, flag, file or case ID, never a value.
  - `GatewayConfigError` lists reason codes only.
- **Gateway boundary.**
  - No new model call outside packages/model-gateway.
  - The gateway works out its own served set from the committed files (`gatewayServing`). No caller can widen it.
  - `production: false` with a real provider still hits `PhiBoundaryError` for any practice.
  - The served check runs before the flags, and the variant check runs before the screen.
  - No tools are given to a model.
- **Tenant isolation.**
  - No migration and no change under packages/db, so RLS is untouched.
  - `permitted.db.test.ts` and `models-routes.db.test.ts` pass, 17 tests (DATABASE_URL on port 5433).
  - The serving unit tests pass: gateway, config, codeowners, permitted-serving, permitted and record-permitted,
    75 tests.
- **Serving switch.** A user store cannot get `evaluable` (the gateway throws). The CLI's `--record` refuses
  `--floors`, and a real provider's contract entry is written as `pending`. The CODEOWNERS lines and their test are
  correct as far as they go (S3). No environment variable widens serving: `TP_ALLOW_LOCAL_PROVIDERS=e2e` affects the
  local provider only. The gaps are in record-permitted (S1).
- **Supply chain.** No package.json or pnpm-lock.yaml change.
- **Secrets.** The pinned gitleaks (8.24.3), run with the repository's config and ignore file over
  6ddd587..388f213c, scanned 5 commits and found no leaks.
- **PR #42 boundary.** These files are in both #42 and this PR:
  - the shared documents `docs/product/reconciliation-001.md` and `docs/product/test-matrix.md`;
  - the regenerated `tools/screening-capacity/watched-paths.txt`;
  - the test-matrix registries `packages/synth/src/cases/matrix.ts` and `registry.ts`, which carry rows only;
  - one line of `infra/test/compute.test.ts`, which the `permitted-cli.ts` call change forces and which is in a
    different hunk from #42's.

  `git merge-tree` of #42's head with 388f213c shows no conflict in any of these files.
