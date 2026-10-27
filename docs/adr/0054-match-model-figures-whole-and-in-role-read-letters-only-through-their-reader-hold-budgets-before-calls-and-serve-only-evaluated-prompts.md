# 0054. Match model figures whole and in their role, read letters only through their reader, hold budgets before calls, and serve only evaluated prompts

- **Status:** accepted; the real-model gate still waits on model access (see Consequences); amended 2026-10-26 by
  [0070](0070-gate-models-on-wrong-but-verified-fields-and-people-set-floors-serve-each-model-feature-on-its-own-evaluation-and-check-contracts-against-the-practices-records-before-the-model.md), Part 1: the permitted run's report and comparison, and Part 2: production serves each model feature
  on its own evaluation ("Amendment (`co-001/model-eval-gate`, 2026-10-26)", below); amended 2026-10-27 by 0070,
  Part 3: a contract or exhibit is checked against the practice's records before the model ("Amendment
  (`co-001/contract-phi-check`, 2026-10-27)", below)
- **Date:** 2026-10-17
- **Deciders:** founder (engineering)
- **PRD sections:** 14 (Purposes and their verifiers; PHI minimization; Provider and data path; Operational limits;
  Logging and evaluation), 5 (J5, J9), 17 (milestone 10), 18 (Layers, Model; What never ships); test matrix MOD-01 to
  MOD-06, SEC-09; CLAUDE.md rules 1 and 2; ADRs 0033, 0047, 0048, 0051, 0052

## Context

A review of the model gateway and its evaluation harness found fifteen problems. Code computes every number and a
person approves what a model proposes, but several checks between the model and the person were weaker than the plan
says:

- a verifier took a fragment of a figure for the figure;
- a payer letter could reach the model as if it were a contract;
- the letter reader trusted its caller;
- the narrative verifier checked that a figure appeared, not that it appeared in its role;
- calls made at once could all pass the daily budget;
- the evaluation gate could not fail on a prompt or model change;
- the budget alert reached no one;
- nothing evaluated prompts on the permitted examples.

This ADR records how each problem was fixed, and what cannot be done in this environment.

## Decision

**A written value matches its quote as a whole figure** (`src/figures.ts`). A contract proposal's amount, percentage,
year and dates are checked with `figureInQuote`. The written text must be in the quote. The quote, scanned with the
packets scanner, must also hold a figure of the same kind whose value is the one code reads from the written text:
cents, a plain decimal, a year or an ISO date. So "$3" is not in "$32.50", "10%" is not in "110%", and "1/1/2026" is
not in "11/1/2026".

Codes, modifiers and places of service go through `tokenInQuote`, which wants each to stand alone in its quote. No
letter or digit may touch it. A "$" or "/" before it, or a "/", "%", "." or "," joined to digits after it, makes it
part of another figure. A hyphen is allowed only in a code-modifier pair such as 97110-GP. Under this rule "11" does
not verify from "11/1/2026", and "59" does not verify from "$59.00".

The letter reader's response deadline is checked as a date, and its references as whole tokens (`wholeInQuote`). A
value code cannot read is still checked only as text, and it is marked unreadable. The test matrix's MOD-02 cases for
each of these fragments are in `functions/contract-terms.test.ts` and `functions/denial-letter.test.ts`.

**Terms are proposed from a contract or an exhibit only.** A version may name a payer letter, and a payer letter is
PHI. Two checks keep it away from the terms reader:

- The specialist's proposal (`apps/web/src/lib/models/contract-proposals.ts`) refuses any other kind of document with
  `document_kind`. The screen lists only contracts and exhibits.
- The gateway refuses the same in `contractTermsSpec.prepare`, from the stored kind its caller must pass.

A letter is read only by `readDenialLetter`, with its minimization.

**The letter reader strips every written form, and refuses what it cannot vouch for** (`src/redact.ts`,
`functions/denial-letter.ts`). Redaction now:

- reads dates in their common written forms: two-digit years, compact digits, either day-month order, month names
  with padding or ordinals, and "03-MAR-61";
- removes any date written next to a birth label;
- matches member IDs and claim numbers ignoring spaces and hyphens.

A call is refused (`identifiers_missing`) without the patient's name, the member ID and at least one claim, each claim
with its number. A new optional step of a purpose, `screen`, runs before anything is sent. For the letter reader, it
asks the practice's records (`OtherPatientCheck`) whether any run of the redacted letter is a member ID or claim number
the practice holds for another patient. On a yes, the call is refused (`more_than_one_patient`). The answer is yes or
no.

The worker's `otherPatientRecords` (`apps/worker/src/packets/letter-records.ts`) is that check. It is an audited read
(purpose `letter_screen`), done in the caller's own scope, of the other patients' member IDs and claim numbers. They
are decrypted and compacted in memory, and they never leave the check.

The check covers identifiers the practice holds. It does not cover a name it cannot match exactly, or a patient the
practice has never seen. The reader stays off behind its flag (below).

**A narrative's figures are held to their roles** (`functions/narrative-roles.ts`). After the packets verifier has
matched every figure to an input:

- each count must sit next to its noun ("9 lines", "4 claims", "3 patients", "12 units");
- each amount must follow its nearest cue in the sentence ("expected" or "contract rate", "paid" or "allowed",
  "variance" or "underpaid", "interest").

A figure that matches an input of another role is `figure_in_wrong_role`. The gateway does not pass the narrative, and
the packet builder writes no version from it: it shows the person the notice `misstated` and the hand-written form.

The harness counts a role mismatch as a verifier failure. Its fault injections now include swapped amounts and
swapped counts, and the gate test proves both are caught.

This check stops a swap. It does not stop an invented role cue that no input contradicts. That would take slot
substitution (below).

**A checklist item may hold only its gap's figures** (`functions/evidence-requests.ts`). The scanner runs over each
item's document and reason. An item with any amount or percentage, any count other than its gap's, or any code not
among its gap's is dropped as `figure_not_in_gap`. An item that names a payer of the input other than its own gap's is dropped as
`payer_not_in_gap`. A payer name the input never mentions cannot be told from ordinary words, so it is not caught.
The person still keeps or drops each item, and the closed list's remedies stay on the screen.

**A call holds its most against the budget before it is made** (`src/gateway.ts`, `src/store.ts`,
`src/postgres-store.ts`; migration `20261031090000_model_budget_holds.sql`). The steps:

1. Take a transaction-scoped advisory lock on the practice.
2. Delete expired holds.
3. In one statement, read the day's logged spend and every live hold.
4. If they have reached the budget, refuse the call (`MODEL_BUDGET_EXCEEDED`).
5. Otherwise, place a hold for the most the call can cost (`mostCost`): its input bounded by its UTF-8 bytes plus
   framing, and its output token limit, at the model's price.

The call's `model_call` row is written, and its hold deleted, in one transaction. A call that ends without a row
releases its hold. A hold whose process died expires after twice the call timeout plus a margin.

Calls made at once are therefore held to the budget as calls made in turn: at most the one call that crosses it takes
the day past it. `model_budget_hold` is practice-scoped under the tenant policy and in the PHI table registry, though
it holds only an amount and two times. The catalog test and the generated cross-tenant tests cover it.

**The gate holds the prompt's content, and production serves only what the gate recorded** (`eval/baseline.ts`,
`src/evaluated.ts`, `src/config.ts`, `tools/check-releases-immutable.sh`).

- Baseline entries (format `tp-model-eval-baseline/2`) record the SHA-256 of each prompt version's content. A report on
  a version whose content differs fails with `prompt_changed`, and it is never recorded.
- The immutability check that CI already runs on every pull request now also refuses any change to a
  `prompts/<name>/v<n>` directory that exists on the base branch. A prompt change has to be a new version.
- A unit test holds each released version to the one hash its changelog records.
- In production, `readGatewayConfig` refuses a real provider until `eval/baseline.json` holds an entry for every
  current prompt version, its content hash and each model it pins for that provider, for the purposes the synthetic
  sets evaluate. The larger contract model is included: the CLI evaluates it with `--variant ambiguous`. The refusal
  works like unconfirmed prices: every model feature is off, and the screens offer hand entry.
- The golden test holds any provider with entries to every current prompt and model.

A new prompt version or model therefore ships only after a person has run `eval --provider configured --record` and
committed what it recorded.

**The alert reaches the operator, and the tasks may call the models they are pinned to** (`infra`):

- A metric filter on the web and worker log groups counts `MODEL_BUDGET_EXCEEDED` and `MODEL_BUDGET_REACHED`. An alarm
  notifies the operator topic.
- The application role may call `bedrock:InvokeModel` on the models that each purpose's current prompt version pins,
  read from the prompts' own `prompt.json`, and on nothing else of Bedrock.

Textract's permission belongs to intake and is not changed here.

**The specialist can mark a contract ambiguous.** The propose form has a checkbox, and the route passes it to the
gateway, which picks the prompt's larger model. The proposal records the choice, and the screen shows which variant
ran and the model the call was logged with.

**The lint refuses every model SDK outside the gateway, and the gateway is held to the money rules**
(`eslint.config.js`):

- Every `@anthropic-ai/*` package and every `@aws-sdk/client-bedrock*` client is refused outside
  `packages/model-gateway`, subpaths and `require` included.
- `packages/model-gateway` is in `MONEY_PACKAGES`.

The lint fixture test proves both.

**The permitted examples are evaluated inside the PHI boundary** (`packages/model-gateway/src/permitted.ts`,
`apps/worker/src/models/permitted.ts`). The worker image's `evaluate-permitted` task (`dist/evaluate-permitted.js`)
runs as a one-off task of the worker's own task definition in production. It takes `--practice <id>` once per
practice, and optionally `--report <file>` and `--against <earlier report>`.

For each practice, in that practice's job scope as the application role, the task:

1. reads the practice's permitted contract-proposal examples (audited, purpose `model_evaluation`);
2. reads each example's document page text as intake stored it, opened with the practice's key;
3. proposes the terms again through the gateway, with the current prompt and its pinned model (the larger one when
   the specialist had marked the contract ambiguous);
4. scores the proposal field by field against the specialist's final records, as the synthetic gate scores a document
   against its truth.

Each call is logged in `model_call` in the run's name and held to the practice's budget. Nothing the call proposes is
written as a proposal or a rate record.

The report (`tp-model-eval-permitted/1`) holds precision and recall counts per field, problem codes and example IDs.
It never holds a document's text, a quote or a figure. An example the run could not score (document unavailable, a
refusal, a failed call, an answer off its schema, an expectation it cannot read) counts as proposing nothing. Recall
therefore drops, so the run fails the gate instead of passing silently. With `--against`, any precision or recall
below the earlier run's, overall or per field, exits 1.

The scored fields are the ones a contract writes:

- method, codes, modifiers and places of service;
- amount, percentage, fee-schedule year and lesser-of schedule;
- the effective dates.

Flags and rounding are not scored. A final record holds them whether the contract stated them or the specialist
confirmed a default, so the two cases cannot be told apart.

**The denial-letter reader stays built and stays off.** PRD 14 places `readDenialLetter` in v1.5. It was built in
milestone 10 with the gateway, because it is the gateway's only PHI path, and the minimization rules (redaction, one
patient, references and dates in the letter) shape the gateway's design: the `screen` step, the PHI boundary and the
flag. Pulling it out now would remove tests of those rules and gain nothing.

It stays behind `model.read_denial_letter`, which is off unless a platform administrator sets it. No screen calls it,
and none will before v1.5. Turning it on for a practice is a v1.5 decision that needs a paying customer's need (PRD 4)
and the screen that would call it.

## Alternatives considered

- **Slots for narrative figures** (`{{fact:expected}}` substituted by code). This is the stronger check. It changes the
  prompt's contract with the model, the stored narrative and the packets verifier's format, and the plan does not ask
  for it. The role check plus the swap faults catch the reviewed failure. Slots remain the next step if a real model
  shows role errors the check misses.
- **Capping concurrent calls per practice** instead of holding cost. Simpler, but it does not bound spend: one large
  call can still cross the budget by any amount. A hold of the call's most bounds both.
- **A golden test that fails until a real-provider baseline exists.** It would turn CI red until someone with model
  access records one. Production's refusal enforces the same rule without blocking every other change.
- **A CI job that runs the configured provider on prompt changes.** The plan's CI workflow cannot be changed by this
  build, and no synthetic-only credentials exist here. The immutability check and the production refusal give the
  same guarantee: no prompt or model change reaches production without a recorded evaluation.

## Consequences

- MOD-02 and MOD-04 hold for whole figures. MOD-05's concurrent overshoot is bounded, and its alert reaches the
  operator. SEC-09 covers every model SDK.
- Milestone 10's done check is still not met. No real model has answered the synthetic sets or a permitted example,
  because this build has no model access. `eval --provider configured --record` on the synthetic sets, and
  `evaluate-permitted` inside the PHI boundary, have to be run by a person with credentials before the milestone
  closes. Until the first of these is committed, production refuses the real providers.
- The permitted run spends from each practice's daily budget like any call. Run it outside working hours, or raise the
  practice's budget for the run.

## Amendment (`co-001/model-eval-gate`, 2026-10-26): the permitted run's report, and serving each feature on its own evaluation

Combined audit #84, adopted by the founder with the whole audit on 2026-10-20, changes two of the decisions above
(docs/adr/0070, Parts 1 and 2, give them in full). The text above stays as it was decided; where it differs, this
amendment holds.

**Part 1: the permitted run** ("The permitted examples are evaluated inside the PHI boundary" above).

- The report is `tp-model-eval-permitted/2`. Each field is tallied as the synthetic gate tallies it (`tp`, `wrong`,
  `extra`, `rejected`, `rejected_right`, `rejected_extra`, `missed`, through `src/tally.ts`), so a wrong value the
  verifier passed is counted apart from a rejection; precision and recall are derived from those counts as before. It
  still never holds a document's text, a quote or a figure: counts, problem codes and the sorted example IDs.
- Each example is scored against the final records cited from its own document (an example written before this
  change is scored on all its records and counted apart), never against another document's records in the version.
- "An example the run could not score ... counts as proposing nothing" above changes for a refusal: an example whose
  call was refused is counted under `refused`, by its code, apart from the misses, and is not tallied; a rise in
  refusals fails the comparison on its own (`refused_rose`). The other cases still count as proposing nothing.
- With `--against`, the run exits 1 also when the two reports' example IDs differ (`examples_changed`; equal counts
  of different examples no longer pass as the same), when wrong but verified rises overall or on any field
  (`wrong_verified_rose`). An earlier report of format `/1` (`earlier_report_format`), or a file that is not a
  permitted-run report, is refused before any call is made, with exit 2: run the earlier side again on the current
  code.
- A call the gateway refuses because the feature, or the variant an example asks for, is off or not evaluable is a
  refusal (`refused:not_evaluated`, `refused:kill_switch`, `refused:feature_off`), not a miss; `eval record-permitted`
  (Part 2) refuses to record a run holding one, or a failed call, since that run did not measure the model.

**Part 2: production serves each feature on its own evaluation** ("The gate holds the prompt's content, and production
serves only what the gate recorded" above).

- "In production, `readGatewayConfig` refuses a real provider until `eval/baseline.json` holds an entry for every
  current prompt version ... The refusal works like unconfirmed prices: every model feature is off" becomes: in
  production on a real provider, each purpose, and each contract variant, is served only when its own current prompt
  version, content hash, model and variant have an entry that parses under the strict baseline schema, every recall
  and precision floor of `eval/floors.json` is set and met by its counts, each model it pins has a confirmed price, and
  (for contracts) the permitted run's record is in the entry. Anything else turns **that feature** off
  (`ModelFeatureOffError('not_evaluated')`, hand entry), never the whole provider. The gateway computes what it serves
  from the committed files itself; no caller can hand it a wider set. `readGatewayConfig` still throws when nothing is
  served, so the screens' and the worker's handling of that case is unchanged.
- Evidence requests and the denial-letter reader have no synthetic set, so a real provider never serves them in
  production until each has one.
- A new prompt version or model reaches users in two steps: the synthetic record (`eval --provider configured
  --record`) makes the feature evaluable only, and `evaluate-permitted --against` inside the PHI boundary, then `eval
  record-permitted`, serves it (`docs/runbooks/model-evaluation.md`).
- `assertEvaluated`, `unevaluatedModels`, `EVALUATED_PURPOSES`, `MissingEvaluation`, `RECORDED_EVALUATIONS`,
  `RecordedEvaluation` and `assertPricesConfirmed` are removed; serving is `servingDecisions` in `src/evaluated.ts`,
  and an unconfirmed price turns off only the features whose models it prices (`price_unconfirmed`).

## Amendment (`co-001/contract-phi-check`, 2026-10-27): the contract screen

Combined audit #120, adopted by the founder with the whole audit on 2026-10-20, adds a step to "Terms are proposed
from a contract or an exhibit only" and gives the contract terms reader the screen this ADR gave the letter reader
(docs/adr/0070, Part 3, gives it in full). The text above stays as it was decided; where it differs, this amendment
holds.

- The kind check stays as it is (`document_kind`, in the specialist's proposal and in `contractTermsSpec.prepare`).
  It trusts the kind the person chose at upload, so a payer letter or an EOB filed as a contract, or inside a zip
  filed as one, passed it. A third check now runs after it: `contractTermsSpec.screen`.
- `screen` takes the call's context (`screen?(input, prepared, context)`), so a screen can bind what it reads to the
  call's own practice. The screen runs last of the gateway's refusals: serving, the kill switch and flags, the PHI
  boundary, `prepare` (the kind check and the framing), the variant's serving check, a completed call under the
  idempotency key, a read of the day's spend against the budget and the caller's step before the screen, then
  `screen`; after it, the budget's hold and the call. No audited read runs for a call the gateway refuses without the
  screen (ADR 0070, Part 3; its pull request review's S1, which found the screen running before the idempotency key
  and the budget).
- The contract screen asks the practice's records (`PatientRecordsCheck`, `src/patient-records.ts`) whether any run
  of the pages is a member ID, a payer claim control number or a patient control number the practice holds. On a
  yes the call is refused (`names_patient`). As with the letter's check, the answer is a code, never which
  identifier, its kind or how many.
- Unlike the letter's check, the caller cannot supply the records. `ContractPagesInput.patientRecords` is required,
  the gateway accepts only a check its own factories issued for the call's practice (`screen_invalid` otherwise), and
  that check opens its own job scope for the practice and reads as the service screen actor (purpose
  `contract_screen`), not in the caller's scope as `otherPatientRecords` does. A practice holding more than 50,000
  identifiers is refused (`screen_unavailable`) without a read (and one whose rows pass the bound while the screen
  reads, with at most one row read past it), and a read that fails is refused (`screen_failed`), with every read it
  made audited.
- A screen's refusal is now logged by the gateway, one line with `practice_id` and an `error_code`, for the letter's
  `more_than_one_patient` as for the contract's codes; the screen's own message is never logged.
- The letter reader's check, `otherPatientRecords`, is unchanged. Moving it onto the issued, practice-bound check is
  a follow-up (0070, P9).
