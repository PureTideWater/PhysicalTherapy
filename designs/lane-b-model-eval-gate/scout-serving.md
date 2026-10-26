# Scout "serving": how model features are served and switched (6ddd587)

Read-only. No migration is needed for anything below. One item would need one, and it is optional: see Q3 (c).

## Q1. Where assertEvaluated is enforced
- It is called in one place only: `packages/model-gateway/src/config.ts:80-83` (`readGatewayConfig`). The call happens only when `NODE_ENV=production` AND `MODEL_PROVIDER` is not `local`, so it applies to `bedrock` and `anthropic`. `assertPricesConfirmed` (config.ts:59-66) runs just before it.
- A local provider in production is refused outright (config.ts:75-79). The only exception is `TP_ALLOW_LOCAL_PROVIDERS=e2e`, and assertEvaluated never runs for local.
- Outside production, a real provider passes config with no evaluation check. In that case the gateway refuses any call that names a practice (`PhiBoundaryError`, gateway.ts:164-166), so only synthetic calls (practiceId null, evaluation actor) can run.
- Granularity is the whole provider. `EVALUATED_PURPOSES = ['proposeContractTerms','draftPacketNarrative']` (evaluated.ts:21). `unevaluatedModels` (evaluated.ts:46-54) matches purpose, provider, prompt id, prompt sha256 and each pinned model id against `eval/baseline.json`. It does not look at the scores at all. Only `eval --record` checks scores, at record time (eval/cli.ts).
- If anything is missing, `GatewayConfigError` is thrown. The web catches it in `modelPathFromEnv` (apps/web/src/lib/models/path.ts:59-75), returns `{kind:'unavailable'}`, logs `MODEL_PATH_UNAVAILABLE`, and turns every feature off: `gatewayFor` returns null (path.ts:114-118) and `modelFeatures` returns OFF (path.ts:138-141).
- The worker's `evaluate-permitted` (apps/worker/src/models/permitted-cli.ts:27) exits 2 on the same error.
- Today `baseline.json` holds only `local` entries: contract terms (40 cases) and narratives (300). So production currently refuses both real providers, and every model feature is off in production. `eval/gate.golden.test.ts:160-170` asserts exactly this.

## Q2. evidence-requests and read-denial-letter in production
- **suggestEvidenceRequests** is not in `EVALUATED_PURPOSES` and has no synthetic set: `eval/sets.ts` has only MOD-01 contract-set and MOD-03 narrative-set. Once the two evaluated purposes have baseline entries for a provider, it is served in production with no evaluation of its own prompt or model.
  - It has no flag, only the kill switch.
  - The screen offers it at `apps/web/src/lib/routes/coverage.ts:121`. The call is at `apps/web/src/lib/models/evidence-checklist.ts:74-80`.
  - Its verifier (functions/evidence-requests.ts) keeps reason codes closed and figures limited to the gap's own. That limits the damage but does not replace an evaluation.
- **readDenialLetter** is also not evaluated. It sits behind `FLAGGED_PURPOSES` (purposes.ts:13) and the DB flag `model.read_denial_letter`, which defaults to off (flags.ts:54). The gateway refuses it with `ModelFeatureOffError('feature_off')` (gateway.ts:161-163).
  - **It has no production caller.** `gateway.readDenialLetter(` appears only in tests (gateway.test.ts, gateway.db.test.ts, denial-letter.test.ts, apps/worker/src/packets/letter-records.db.test.ts).
  - `otherPatientRecords` (apps/worker/src/packets/letter-records.ts:38) is exported but unused outside tests.
  - So in production it is unreachable whatever the flag says. If anyone wires a caller and an administrator turns the flag on, it is served unevaluated.
  - `eval_example` forbids permitted letter examples (`eval_example_letters_synthetic`, migration 20261029090000:265), so its evaluation must stay synthetic.

## Q3. A per-feature switch-off without a migration
- **Where flags live today:** the DB table `feature_flag`.
  - Created in migration 20261029090000_model_gateway.sql:34-49, with a closed `key` CHECK.
  - Widened in 20261030090000_customer_sign_in_and_readiness.sql:462-463 to kill_switch, read_denial_letter, daily_budget_cents and platform.maintenance.
  - Mirrored in TS at `packages/db/src/schema/models.ts:26` (`FEATURE_FLAG_KEYS`).
  - Read by `flagRows` (postgres-store.ts:47-53) and resolved by `resolveFeatures` (flags.ts:49-57).
  - Set only through `set_feature_flag()`, which needs the `feature_flag.manage` permission and writes an audit event (postgres-store.ts:270-275; console at apps/web/src/app/console/models/page.tsx, apps/web/src/lib/routes/console-models.ts:25-27).
  - **A new DB flag key, for example `model.suggest_evidence_requests`, is a migration** because of the CHECK. Lane B cannot add one.
- **Model config is env and code:** MODEL_PROVIDER and its settings come from env (config.ts). Model ids and prompts come from `prompts/*/v1/prompt.json`. Baselines come from the committed `eval/baseline.json`. All of these are code or config, not the DB.
- **Best no-migration design: the baseline is the per-feature switch.**
  (a) Move `EVALUATED_PURPOSES` to all four purposes and add `servedPurposes(provider, recorded): ReadonlySet<ModelPurpose>` in evaluated.ts. A purpose is served only when its own prompt id, sha256 and every pinned model has an entry, and that entry passed the new gate (wrong-but-verified never rising, recall floor).
  (b) `readGatewayConfig` stops throwing for an unevaluated purpose. In production it returns `served`. It still throws when no purpose is served, and it still throws on unconfirmed prices. `assertPricesConfirmed` should become per-purpose the same way, because it has the same whole-provider coupling (config.ts:52-66 pins across all prompts).
  (c) `GatewayOptions` gets `served`. `limited()` throws `ModelFeatureOffError('not_evaluated')` before the kill-switch read and before any send. The reason union in errors.ts:17-24 is code only. No model_call row is written, as with the kill switch today.
  (d) Write one exported helper, `offeredPurposes(features, served)`, and use it in both `ModelGateway.features()` (gateway.ts:108-111) and web `modelFeatures()` (path.ts:138-144). Today those two places hold the same logic as duplicates, and a per-feature gate must not diverge between them.
  (e) `ModelPath` carries `served`. The web notice maps `not_evaluated` to 'off', and the hand entry stays.
  - Result: an unevaluated evidence-requests or denial-letter prompt or model switches that one feature off, not the provider.
  - Optional, and it IS a migration: an operator-set per-purpose DB flag (a new `feature_flag` key per purpose). It is not needed for #84. The kill switch already covers emergencies. Say so in ADR 0070 and leave it to a Lane A migration if the founder wants it.
- **Synthetic sets needed:** evidence-requests and denial-letter need their own sets and baseline entries. Without them, (a) leaves both off in production. That is the correct outcome, but it should be stated.

## Q4. The kill switch
- `model.kill_switch` is a `feature_flag` row at global, organization or practice scope. It is on if ANY row in reach is true, and nothing more specific can turn a global kill back off (flags.ts:3-6 and 53).
- It is checked first in every call (gateway.ts:157-160, `ModelFeatureOffError('kill_switch')`) and in `modelFeatures` for the screens.
- It is set from the console page (one-click global plus "Set a flag") through `set_feature_flag`, with an audit event.
- Test rows: MOD-06, models-routes.db.test.ts:538 and 606, worker permitted.db.test.ts:190-196 (the permitted run scores kill-switched examples as problems, not passes).

## Q5. Permitted examples inside the PHI boundary
- **Writing examples:** `reviewVersionProposals` (apps/web/src/lib/models/contract-proposals.ts:351-394) runs in the version-approval transaction.
  - It derives the decision and calls `recordPermittedExampleIn` (model-gateway postgres-store.ts:298-320). That inserts `eval_example` with source 'permitted', purpose proposeContractTerms, `input_ref` `model_call:<id>`, and `permission_ref` set to the ID from `practice_data_rights_agreement(practice)` (migration 20261029191000).
  - `expected` has `{format: CORRECTION_FORMAT 'tp-eval-correction/1', document_id, contract_version_id, changed_fields, records:[terms + citation{page,quote,hash}]}`.
  - It then links `model_proposal.eval_example_id`, once, after review (migration 20261029190000:37, 45 and 92-95).
- **Table rules** (migration 20261029090000:250-307):
  - Insert only: the trigger `eval_example_rules` refuses UPDATE and DELETE and a permitted row without `data_rights_permit`, which needs a signed data_rights agreement for the practice or its organization.
  - FORCE RLS: the tenant policy, plus an operator policy for synthetic rows only.
  - `source` CHECK: permitted needs practice_id and permission_ref.
  - Letters are synthetic only.
  - `expected` is any jsonb object. There is no column for the decision.
- **Evaluation:** worker `evaluatePermitted` (apps/worker/src/models/permitted.ts:84-194) runs in production as a job actor, one practice scope at a time.
  - It does an audited read of the examples and the clean contract or exhibit page text (decrypted with the practice key), re-proposes through the gateway (logged and budgeted), and scores with `scorePermitted` (model-gateway permitted.ts:151-197).
  - The report holds counts, codes and IDs only. `--against` runs `permittedRegressions` (permitted.ts:277-295) and exits 1 on a regression.
- **#84 defect in the permitted scorer too:** `right = verified && value matches` (permitted.ts:148). A verifier-rejected field and a verified wrong value both land in fn and fp the same way. The report needs its own `wrong_verified` count per field, and permittedRegressions must gate it as never rising. That means bumping PERMITTED_REPORT_FORMAT to /2 and accepting /1 as the "earlier" run only with that count unknown, or refusing /1.
- **Ordering:** the synthetic baseline gates serving (Q1), but the permitted run is not a serving precondition: it is a manual `--against`. Once a synthetic entry lands, production serves before anyone runs the real-document gate. ADR 0070 should make "permitted run with no regression and wrong_verified not rising" a people step in the runbook before the baseline entry merges. To make it machine-checked, commit the permitted report (counts and UUIDs only) beside the baseline. That is debatable: example UUIDs are not PHI, but the counts derive from customer data. Founder ruling needed.

## Q6. Keeping ACCEPTED proposals as examples: schema and data rights
- **Schema: no change needed.** Nothing in eval_example, model_proposal or their triggers distinguishes accepted from corrected. `model_proposal_example_after_review` only needs reviewed_at.
- **The exclusion is one code line:** `contract-proposals.ts:371` `if (decision !== null && decision !== 'accepted' && exampleId === null && agreement !== null)`. Drop `decision !== 'accepted'`.
- **Record the decision inside `expected`,** for example `decision: 'accepted'`. `correctionSchema` is a non-strict z.object (permitted.ts:50), so /1 readers ignore the field. Better still, bump to `tp-eval-correction/2` (decision + per-record documentId) and have the scorer accept both.
- **Rename** CORRECTION_FORMAT and the doc comments: `permitted.ts:16`, `postgres-store.ts:289`, migration comments, and ADR 0052:75-84, which says "A contract proposal that was corrected or rejected becomes an eval_example". ADR 0070 must supersede that sentence.
- **What the data-rights terms say, as recorded in the repo:**
  - PRD.md:583: "Reviewer corrections become evaluation examples under the data-rights terms. The evaluation set starts with 40 synthetic contracts ... and grows with permitted real ones".
  - PRD.md:575: "Contracts carry no PHI (they are confidential, which is a separate obligation handled by the data-rights terms)".
  - PRD.md:71 and 155: the data-rights addendum is signed with the BAA.
  - ADR 0048:111 and ADR 0052:75: only under the signed agreement, checked in Postgres.
- **The addendum's own text is not in the repo.** `agreement` stores document_ref and sha256 only. So no recorded term either permits or forbids keeping accepted (uncorrected) contracts.
  - The PRD names "reviewer corrections" specifically, but also says the set "grows with permitted real ones".
  - Keeping accepted examples is consistent with "permitted real ones", but it is a wider retention than the PRD's literal "corrections".
- **People step:** the founder or counsel confirms that the addendum covers retaining any reviewed contract proposal's document for evaluation. Record that ruling in ADR 0070. Code does not depend on it beyond the one line, which can ship behind the ruling.

## Defects and improvements found on the way
1. **Multi-document versions score wrong (contract plus exhibit).**
   - `reviewVersionProposals` stores ALL of the version's final records in each proposal's `expected`, and `changedFields` (contract-proposals.ts:297-330) marks every final not matched as `missed[j]`, whatever document it cites.
   - So a contract proposal in a version that also has an exhibit is never 'accepted', and its example counts the exhibit's records as false negatives.
   - The stored citation drops `documentId` (contract-proposals.ts:384), even though rate records carry it (packages/contracts, citation.documentId). Old examples therefore cannot be filtered.
   - Fix without a migration: filter finals by `citation.documentId === row.source_document_id` (null-citation records: count them against the version's primary contract, or leave them out, under an explicit rule) and store documentId in the citation (format /2).
   - This blocks #84's "contract-plus-exhibit pairs" being measured correctly on permitted data.
2. **#120 placement.** `contractTermsSpec` (functions/contract-terms.ts:381) has no `screen`, while the denial-letter spec does (denial-letter.ts:232-237).
   - Add `screen` to contract terms with a `PracticeRecordsCheck` on `ContractPagesInput`. Both callers must pass it: web contract-proposals.ts:143 and worker permitted.ts:150.
   - The records reader is `otherPatientRecords`, today in apps/worker/src/packets/letter-records.ts. Web cannot import the worker, so move it to a shared package (for example a `@tp/db/runtime` helper or the contracts package) and give it a no-excluded-patient mode and its own audit purpose (`contract_screen`).
   - Refuse with `InputRefusedError('names_a_patient', 'this document names a patient of the practice and was not sent')`. Log the code only.
   - Run it in the worker permitted evaluation too, so a stored example that names a patient is never re-sent.
3. **#120 false positives from short identifiers.** letter-records.ts adds every compact identifier of 2 or more characters, and `identifierCandidates` (redact.ts:251-269) emits runs of 5 or more characters with a digit.
   - A practice whose patient control numbers are short numerics, for example "97110", would refuse every PT contract on its CPT codes.
   - "Long patient control number" needs a floor on the record side. The record value's length is not a document-shape heuristic.
   - Suggested floor: member ID and payer claim number at 6 or more compact characters, patient control number at 8 or more, plus a test with a twin whose PCN equals a CPT code in the contract.
   - Founder or specialist confirms the numbers.
4. **Cost of the records check.** The check decrypts every patient and claim identifier of the practice on every contract call. That is acceptable at practice scale with no migration. A keyed-HMAC identifier index would be a migration (Lane A) and is not needed now.
5. **The served-set logic is duplicated** between gateway.ts:110 and path.ts:143. Unify it (Q3 d).
6. **assertEvaluated checks presence, not scores** (evaluated.ts:46-54). A hand-edited baseline entry would serve. Gate the entry's own recorded counts at runtime: wrong_verified at 0 on faithful-text cases, and recall at or above the floor. Store the floor in a committed per-field file, for example `eval/floors.json`, which the specialist and founder approve.
7. **`readDenialLetter` has no production caller.** Say so in ADR 0070 so that "evaluated before served" is wired in before anyone adds one.
8. The first-real-model note in ADR 0052 Consequences matches the audit's "people step". The new gate must refuse `--record` for a real provider when the floor file has no entry for a field: the bar is set before the run, not where the run lands.
