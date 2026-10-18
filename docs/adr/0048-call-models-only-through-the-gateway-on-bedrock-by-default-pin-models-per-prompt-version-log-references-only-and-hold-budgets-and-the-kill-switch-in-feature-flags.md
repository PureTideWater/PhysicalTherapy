# 0048. Call models only through the gateway, on Bedrock by default; pin models per prompt version, log references only, and hold budgets and the kill switch in feature flags

- **Status:** accepted for the build; the model path is provisional until counsel's read of both agreements (PRD 20)
- **Date:** 2026-10-16
- **Deciders:** founder (engineering)
- **PRD sections:** 14 (AI gateway: the four functions, Provider and data path, PHI minimization, Untrusted input,
  Logging and evaluation, Operational limits), 16 (Threats: a payer document carrying injected instructions), 19
  (model-call cost per practice against budget), 20 (Model path: Bedrock or Anthropic's HIPAA-ready API); CLAUDE.md
  rules 1 and 4 and "Never: call a model outside packages/model-gateway; give a model tools when it reads a
  document"; data dictionary `model_call`, `eval_example`, `feature_flag`; test matrix MOD-01, MOD-02, MOD-04, MOD-05,
  MOD-06; ADRs 0013, 0019, 0041, 0047

## Context

Milestone 10 adds the only code that calls a model. PRD 14 fixes its shape (four purpose-typed functions, each with a
pinned prompt version, a JSON schema, a verifier and a log record) and its limits (60 seconds per call with one retry
under the same idempotency key, per-practice daily budgets with alerts, a kill switch, prompts versioned in the
repository with a changelog each). It leaves open, until counsel has read both agreements, which of two paths carries
practices' material: Claude on Bedrock inside the company's AWS account, or Anthropic's API with HIPAA readiness
enabled. The build has no model access, no AWS credentials and no network path to either provider, so every path has
to be testable without one, and nothing a test runs may send a practice's material anywhere.

## Decision

**One package calls a model, and the lint proves it.** `packages/model-gateway` is the only importer of the provider
SDKs (`@aws-sdk/client-bedrock-runtime`, `@anthropic-ai/sdk`); the repository's ESLint config already refused them
elsewhere, and `src/lint.test.ts` now lints a fixture test file that imports them directly, statically and
dynamically, as if it lived in each app and package: it fails everywhere but inside the gateway.

**The model path is configuration, Bedrock by default.** `ModelProvider` is one interface (`complete(request,
{ signal })`) with three implementations:

- `BedrockProvider` (the default when `NODE_ENV=production`): the Bedrock runtime's `InvokeModel` with the Messages
  body, the region from `BEDROCK_REGION` or `AWS_REGION`, `BEDROCK_ENDPOINT` optionally naming the VPC endpoint's
  https URL, credentials from the task role, and the SDK's own retries off (`maxAttempts: 1`) so the gateway's one
  retry is the only one.
- `AnthropicProvider` (`MODEL_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` from the environment's secret): Messages only,
  with structured outputs; the SDK's retries off and its timeout at the gateway's. It uses nothing PRD 14 lists as
  ineligible (no Batch API, Files API, code execution, Skills or MCP connector).
- `LocalDeterministicProvider` (the default everywhere else): not a model. It answers only a request whose key (the
  SHA-256 of the prompt version and the user message the gateway frames) has a fixed output registered in code or in
  a directory of `tp-local-model-output/1` files, refuses everything else (`no_fixed_output`), and costs nothing.

Production refuses the local provider (except the e2e suite's production build, `TP_ALLOW_LOCAL_PROVIDERS=e2e`, as
for the other local implementations), and refuses a real provider whose pinned models' prices are not confirmed (see
below). Both real implementations are tested against their SDKs with mocked clients: the request each sends, each
stop reason, and each error mapped to `timeout`, `throttled`, `unavailable` (retryable) or `rejected` (not).

Bedrock stays the default because it keeps the material inside the company's own account, under the AWS business
associate agreement the rest of the stack already relies on, through a VPC endpoint with CloudTrail. Switching to the
alternative is one environment variable, a secret, and a confirmed price list; no code changes.

**Model identifiers live in configuration, pinned per prompt version.** Each prompt version's `prompt.json`
(`packages/model-gateway/prompts/<purpose>/v<n>/`) names, for each provider, the exact model identifier it was
written and evaluated for (never an alias), and for contract terms a second one the gateway uses when the specialist
marks a contract ambiguous. It also holds the system prompt, the token limit, the effort and the SHA-256 of its own
content; `schema.json` beside it is the output schema the provider is given. A released version never changes: a
change is a new version directory and a changelog entry, and a test recomputes every hash and checks the schema file
against the code's schema. The four version 1 prompts are `propose-contract-terms/1`, `read-denial-letter/1`,
`draft-packet-narrative/1` and `suggest-evidence-requests/1`. Prices are configuration too
(`config/models.json`: whole cents per million input and output tokens per provider and model, with a source note and
a `confirmed` flag a person sets after checking the provider's price list). Every real price ships unconfirmed,
because none could be checked from the build.

**Models copy text; code reads every figure (CLAUDE.md rule 1).** No output schema has a numeric amount, date or
stage. `proposeContractTerms` returns, for every field of a candidate rate, the value as written, its page and a
quote; code reads the amount, percentage, fee-schedule year and dates from the written text (`src/figures.ts`),
checks that each quote is on its page as contract evidence compares it and that each written value is in its own
field's quote (MOD-01, MOD-02), rejects a failing field while the rest of its candidate stands for the specialist,
and flags candidates whose scopes overlap as conflicting rather than merging or choosing. A candidate becomes a
proposed rate record (`proposed_by: model`, evidence = page, quote, page-text hash) only when every field it fills
verified and its terms are valid rate terms; the specialist still approves each field before anything prices.
`readDenialLetter` keeps only a payer, a deadline, claim placeholders, references and requested documents the letter
writes, and a reason category from the denial-category code list. `draftPacketNarrative` is checked by the packets
verifier itself (ADRs 0041 and 0047), so a draft that passes here is one the packet will accept.
`suggestEvidenceRequests` keeps only items whose reason is a known code (the unpriced reasons, the contract-question
topics and the packets' evidence gaps) and one the input named.

**One call path, in a fixed order** (`src/gateway.ts`): the kill switch and, for the v1.5 denial-letter reader, its
own flag; the PHI boundary; the purpose's preparation (minimization and framing); the idempotency key; the
practice's daily budget; the call; the schema; the verifier; one `model_call` row. The result is always a proposal
with the call's ID, never a write anywhere else.

**The PHI boundary is in code, not only in practice.** Outside production the gateway refuses to send any
practice's material to a real provider (`PhiBoundaryError`); only a synthetic evaluation call, which names no
practice, may reach one. Denial letters are minimized before the call: the patient's names, dates of birth (in every
form a letter writes one), member IDs and the claims' numbers are replaced by exact, whole-word, case-blind match
with placeholders (`[PATIENT_NAME]`, `[DATE_OF_BIRTH]`, `[MEMBER_ID]`, `[CLAIM_n]`); a call is refused if the input
spans more than one patient or if an identifier is still in the text after redaction. Narratives are drafted from
pattern-level facts that carry no identifier, and the call is refused if any of the case's identifiers would be in
what is sent. Contract pages carry no PHI and are sent as stored.

**Every document is untrusted (MOD-04).** No call has tools. A document's text goes only inside a `<document>`
element after the fixed system prompt, with its own closing tags neutralized so it cannot end the frame; facts go as
JSON in a `<facts>` element the same way. The frame is a courtesy; the controls are that the answer must fit a strict
schema (an extra field fails it), that code verifies it against the source, and that a person approves it. The tests
send a contract page that tells the model to approve rates and raise one: the invented rate fails verification, a
quote of the injected text stays a proposal with no authority, and no contract version or rate record changes.

**`model_call` holds references, never text** (migration `20261029090000_model_gateway.sql`). One row per call:
practice (null only for a synthetic evaluation call), actor kind and ID (a person, a service job, or an evaluation
run), purpose, provider, model identifier, prompt version, idempotency key, the input documents' SHA-256s, the
output's SHA-256, token counts, cost, citations as page, marker, field and quote SHA-256 only (a CHECK admits no other
key), the verifier's result, the outcome (`completed`, `failed`, `timed_out`) with an error code, attempts (1 or 2)
and latency; later, once, the reviewer's decision and the fields the reviewer changed, recorded by a person who holds
the purpose's review permission in the practice (`rate_record.edit`, `submission.log`, `packet.draft`,
`case.work`), with an audit event. A trigger refuses any other change, a row in another actor's name, and every
delete. A person's or a job's calls are written in the practice's scope as that actor, so the tenant policy applies;
an evaluation run's are written as the operator role, whose own policy admits only rows with no practice.
`eval_example` keeps evaluation data from synthetic sources (no practice; the operator writes them) or permitted ones
(a practice's reviewer correction, only under that practice's signed data-rights agreement, checked in Postgres); a
denial letter's examples are synthetic only. Both tables carry a nullable `practice_id`, as the data dictionary
defines them, force row-level security with the tenant policy, and are listed with their reasons in the catalog's
`NULLABLE_PRACTICE_ID_TABLES`; neither holds PHI.

**Cost is integer and measured.** Tokens times cents per million is an exact count of millionths of a cent; the cost
is rounded up once to whole cents (`cost_cents bigint`) and the exact value kept beside it
(`cost_unrounded numeric(18,6)`, a CHECK ties the two). A failed call is logged with the tokens the provider reported.

**Timeouts and the retry.** Each attempt ends at 60 seconds whether or not the provider honors its abort signal. A
timed-out, throttled or unavailable attempt is retried once with the same request under the same idempotency key; a
rejected request, a refusal, a truncated answer and a local request with no fixed output are not. Neither provider
path dedupes on the gateway's key, so the key is ours: the SHA-256 of the purpose, the prompt version, the practice,
the caller's own request key (a mutation's request key, or a job's ID and step) and the input hashes. A completed call
under a key is never made again (a replayed job is refused with the first call's ID, and a unique index holds one
completed row per key); a failed one may be tried again.

**Budgets, the kill switch and the reader's flag are feature flags** (`feature_flag`: a closed list of keys, scope
global, organization or practice; set only through `set_feature_flag()`, which checks `feature_flag.manage` and
writes an audit event). `model.kill_switch` is on if any row in reach says so, so a practice or an organization can
be switched off alone and nothing more specific switches a global kill back on; with it on, nothing is sent or logged,
`features()` tells screens to offer hand entry, and the product prices hand-entered rates and verifies code-drafted
narratives as before (MOD-06). `model.read_denial_letter` (v1.5) is off unless a row turns it on; the most specific
row wins. `model.daily_budget_cents` is the practice's daily spend limit in whole cents, most specific row winning,
500 ($5.00) when none is set: generous against PRD 14's "cents per document and per narrative" and its "under $5 a
customer a month", tight enough that a runaway loop stops the same day. The day is the UTC day; the spend is the sum
of the practice's logged `cost_unrounded` since it began. A call is refused once the spend has reached the budget,
with an error-level log (`MODEL_BUDGET_EXCEEDED`, practice ID only) for the operator's alarm, and the call that
crosses it logs a warning (`MODEL_BUDGET_REACHED`) (MOD-05).

## Alternatives considered

- **Choosing Anthropic's API now.** It needs counsel's read and organization-wide, permanent HIPAA enablement; the
  PRD makes Bedrock the default until that read. Both are coded, so the choice stays a configuration change.
- **A model alias, or one model setting for every prompt.** An alias moves under a released prompt, and a prompt's
  evaluation then describes a model it no longer calls. Pinning per prompt version makes a model change a new
  version with its own gate.
- **Letting the model return amounts and dates, with code comparing them.** Code would still have to read the
  source to compare; reading it directly from the copied text removes the model's number entirely (rule 1).
- **Logging prompts and outputs for debugging, or using a model-observability service.** PRD 14 forbids the
  service, and text in the log would hold contract terms and letters' PHI; hashes reproduce any question about which
  input produced which output without holding either.
- **Provider-side retries.** They would retry under no key of ours and stack with the gateway's; both SDKs' retries
  are off.
- **Budgets in an environment variable, or a separate settings table.** A flag reaches one practice, one
  organization or everyone, is set by an audited function, and is read in the same transaction as the call's log.
- **A mocked model for tests.** The local provider answers only registered requests by exact key, so a test proves
  exactly what the gateway would send, and nothing can quietly answer a request no one wrote an output for.

## Consequences

- Production refuses both real providers until a person confirms the pinned models' prices in
  `config/models.json`, so a budget is never enforced on a guessed price. Confirming them, and confirming the pinned
  identifiers against what the account's region offers, is a release step.
- The budget check reads the spend before the call: calls already in flight when the budget is reached can take the
  day's spend past it by their own cost. That is bounded by concurrency and by the per-prompt token limits.
- A practice's material can reach a model only from a production build; development, tests and CI can exercise a
  real provider only with synthetic evaluation calls that name no practice.
- The product screens, routes and worker jobs that call the gateway, the console's flag screen, the evaluation
  harness with its 40 synthetic contracts and the 300-case narrative set (MOD-03), and the Bedrock IAM permission and
  endpoint in the infrastructure are later work; the interfaces here are what they call.

## Revisit when

- Counsel has read both agreements (PRD 20, milestone 10): record the chosen path here and set `MODEL_PROVIDER`.
- The provider's price list changes, or the measured cost per practice approaches the default budget.
- A prompt changes: a new version directory, a changelog entry, and the evaluation gate.
