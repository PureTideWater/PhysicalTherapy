# 0052. Call the gateway from the screens in the person's name, record each decision when the person is done, and keep corrections only under a data-rights agreement

- **Status:** accepted for the build; the real-model run waits on model access inside the PHI boundary (see Consequences)
- **Date:** 2026-10-16
- **Deciders:** founder (engineering)
- **PRD sections:** 14 (Purposes: proposeContractTerms, draftPacketNarrative, suggestEvidenceRequests; Logging and
  evaluation: "the reviewer's decision and changed fields go back to model_call ... Reviewer corrections become
  evaluation examples under the data-rights terms"; Operational limits: the budget and the kill switch), 5 (J5 in v1:
  "the model proposes the abstraction and the specialist verifies each field against the cited page"; J9: the
  model-drafted narrative), 7 (Rate record review, Specialist queue, Packet builder, Coverage), 12 (Approval), 17
  (milestone 10); test matrix MOD-01 to MOD-06, CAS-08 to CAS-10; ADRs 0028, 0033, 0041, 0044, 0047, 0048, 0051

## Context

ADR 0048 built the gateway and ADR 0051 its evaluation; nothing in the product called it. Milestone 10 puts every
model feature on its screen behind the kill switch and the daily budget, with each screen still working by hand when
they are off (MOD-06). Three features are v1's: the specialist's proposal of a contract's terms, the packet builder's
narrative draft, and the coverage screen's checklist of documents to obtain. The rules that never bend hold: code
computes every number, a model proposes text and extracted fields, a person approves before use, and the approval
rules of contracts (field by field, then the version, then the customer's sign-off) and packets (a second person)
do not change.

## Decision

**The call runs in the request, in the person's name.** Each feature is a route (`src/lib/routes/models.ts`) with a
Zod schema, a role check (rate_record.edit, packet.draft, case.work), the practice-scoped transaction and an audit
event, as every mutation. The route builds a gateway for the person (`src/lib/models/path.ts`): its calls are logged
in `model_call` in that person's name by `PostgresModelCallStore`, which writes in a transaction of its own so a
call's cost and outcome stand even when the request rolls back, and reads the practice's flags and spend the same way.
The worker is not involved: a proposal is the specialist's or the drafter's own step, and the contract workflow's
proposeVersion needs the specialist's role, which a job does not hold.

**What a call proposed is a row, `model_proposal`** (migration `20261029190000_model_proposals.sql`), written in the
route's transaction by the person who made the call: the model call it came from, its purpose, what it concerns (the
contract version and document, the packet version, or nothing for the checklist) and the proposal as the verifier left
it (each candidate's fields with page, quote, written value and problems; the checklist's kept items; for a narrative
nothing but the verifier's mismatch codes, since the narrative is the packet version's, encrypted there). The table is
practice-scoped under the tenant policy and in the PHI table registry, and its trigger enforces what the code does:
the proposer is the acting person and the call's actor, the call completed in the same practice for the same
purpose, nothing is deleted, and only two things are ever recorded afterwards, each once: when the decision was
recorded (the call must hold one by then) and the evaluation example a correction became.

**Each feature, as the person sees it:**

- *The specialist's proposal* (Rate record review). On a draft version the specialist picks one of its documents; the
  gateway is given the page text intake stored (ADR 0033), never the file. A candidate whose every field verified
  against its page becomes a rate record proposed by the model (contracts' proposeVersion, which moves the version to
  proposed: the specialist queue's "proposals awaiting verification"); a candidate with a rejected field becomes none,
  and its fields stay on the screen with their problems, for the specialist to enter by hand. Nothing the model
  proposed is verified: the specialist approves each field against the cited page, then the version, and the
  customer signs it off. The specialist may discard a proposal: its records not yet verified are removed.
- *The narrative draft* (Packet builder). The gateway is given the pattern statement's facts for the case's next
  version (`packetDraftInputs` in `@tp/worker/packets`: the content writePacketVersion would assemble with the same
  choices) and the schedule's identifiers to check against, never to send. The narrative is written as a new version
  by writeVersionOnce in the person's name, assembled and verified by code as any version (a failing one is stored and
  cannot be approved, CAS-08). The person edits it as any version, and a second person approves it (CAS-09, CAS-10).
- *The evidence checklist* (Coverage). The gaps are counts and codes only: each unpriced reason of the run in effect
  with its line count and its commonest procedure codes, and each open question of the specialist's that asks the
  practice to obtain a document (`contract_<topic>`). The gateway keeps only items whose reason the gaps named. The
  person keeps the items that apply, or dismisses the checklist; the screen shows the kept items beside the closed
  list's remedies, which stay.

**The decision is derived from what the person did, when they are done.** A screen never asks "was the model right?":

- A contract proposal is decided when its version is approved (in that transaction): accepted when every proposed
  record stands as proposed and nothing else was entered; otherwise accepted with changes, the changed fields named as
  paths (`candidates[i].<field>` for a field changed or entered by hand, `candidates[i]` for a candidate dropped,
  `missed[j]` for a record the model did not propose). A discarded proposal is rejected.
- A narrative draft is decided when the person sends a version of the packet for approval, or a person who drafts
  packets approves one: accepted when that version's narrative is the model's word for word, otherwise accepted with
  `narrative` changed.
- A checklist is decided when the person keeps or dismisses it: accepted, accepted with the dropped `items[i]` named,
  or rejected.

**"Under the data-rights terms" means the practice's signed data-rights agreement.** A contract proposal that was
corrected or rejected becomes an `eval_example` (source permitted) when the practice, or its organization for all of
its practices, has signed one: its input is the model call, its expectation the version's final records with their
citations (contract text is not PHI, PRD 14). Without one, nothing is kept. The database checks the agreement
(`data_rights_permit`, ADR 0048). The specialist approving the version reads no agreement under the agreement
policies, so the ID comes from `practice_data_rights_agreement(practice)` (migration
`20261029191000_practice_data_rights.sql`: a SECURITY DEFINER function that answers, for a practice in scope only,
with the ID alone). A narrative is never kept as an example, edited or not: a person's words can hold a detail the
verifier does not know as an identifier.

**Off is a state of the screen, never an error.** A feature is offered only when the model path is available and the
kill switch does not reach the practice (`modelFeatures`, read in the request's transaction). The model path is the
gateway's configuration; one it refuses (production with unconfirmed prices, a missing region or key) leaves every
feature off, exactly as the kill switch, and is logged once with `MODEL_PATH_UNAVAILABLE`. A call that proposes
nothing (the switch turned on since the page loaded, the budget spent, a timeout, an answer off its schema, an input
refused at the PHI boundary) writes only its `model_call` row, returns the person to the screen with the reason
(`?model=<notice>`) and the hand-entry form beside it. Every screen keeps its hand entry whatever the switch says.

**Tests give the services a model path of their own** (`assignModelPath`): a local provider whose outputs are
registered under the exact requests the gateway will send, so a test proves the input as well as the handling; the
route tests' world seeds one proposal of each kind through the gateway with a provider of its own, so the generated
tests (SEC-02) run every model route for every persona. The e2e server runs the gateway on the local provider over
`MODEL_LOCAL_FIXTURES_DIR`, read on each call; the journey (`e2e/models.spec.ts`) computes each request from the
records the server reads and writes the output it expects.

## Consequences

- MOD-01 to MOD-06 are asserted through the product: `apps/web/src/lib/routes/models-routes.db.test.ts` (proposals,
  decisions, examples with and without the agreement, narratives under the approval rules with no identifier sent,
  the checklist, the budget refusal with `MODEL_BUDGET_EXCEEDED`, the kill switch with hand entry) and
  `apps/web/e2e/models.spec.ts` (propose, verify and approve; draft and approve as a second person; the same journeys
  by hand with the switch on).
- No real model has answered any of it. The local provider proves the path, not the model. The milestone's real gate
  needs a model: ADR 0051's evaluation with `--provider configured` inside the PHI boundary (or with credentials on
  the synthetic sets), and a reviewed run of each feature on a practice's own documents, before milestone 10 closes.
- `@tp/model-gateway` imports `@tp/db/runtime` and its JSON with import attributes, so the web bundle and the e2e
  runner load it.
- The reader of denial letters (`readDenialLetter`) is v1.5 and stays off behind its flag; no screen calls it.
- A console screen to set the flags does not exist yet; a platform administrator sets them through
  `set_feature_flag()` as ADR 0048 says.
