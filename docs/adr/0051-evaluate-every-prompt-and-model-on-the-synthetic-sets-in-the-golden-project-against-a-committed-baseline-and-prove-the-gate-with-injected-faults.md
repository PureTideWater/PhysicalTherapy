# 0051. Evaluate every prompt and model on the synthetic sets in the golden project, against a committed baseline, and prove the gate with injected faults

- **Status:** accepted for the build; the gate's real-model half waits on a run with model access (see Consequences)
- **Date:** 2026-10-16
- **Deciders:** founder (engineering)
- **PRD sections:** 14 (Logging and evaluation: "The evaluation set starts with 40 synthetic contracts and exhibits
  of varied layouts (tables, prose, scanned) ... the gate for a prompt or model change is field-level precision and
  recall on that set with no regression, run in CI on the synthetic subset and in the PHI boundary on the rest.
  Narrative drafting has a zero-tolerance gate: any verifier failure on the 300-case synthetic set blocks the
  change"), 18 (Layers: Model; Continuous integration), 17 (milestone 10 done check); test matrix MOD-01, MOD-03;
  ADRs 0022, 0023, 0033, 0041, 0047, 0048

## Context

Milestone 10's gateway (ADR 0048) left the evaluation harness, its two synthetic sets and the gate to part B. The
sets must be synthetic, deterministic and generated like every other fixture (ADR 0023). The gate must run in CI on
every pull request, through a command `.github/workflows/ci.yml` already runs, since the workflow is not changed
here. The build has no model access, no AWS credentials and no network path to either provider, so CI cannot score a
model; it can only prove that the path a model's answer takes is scored correctly and that a regression fails.

## Decision

**The sets are registry cases.** `packages/synth/src/eval` writes them with `pnpm synth --all`, held to a fresh
generation by the fixtures test like every case:

- MOD-01 carries the contract set under `fixtures/synthetic/MOD-01/contract-set/`: 40 invented contracts and
  fee-schedule exhibits (14 table, 13 prose, 13 scanned), each a directory with the document as intake receives it
  and `truth.json` (format `tp-eval-contract/1`): every rate record the document states, every field (method,
  codes, modifiers, places of service, amount, percentage, fee-schedule year, lesser-of schedule, flags, rounding,
  effective from and to) with its value as code reads it, the text it is written as, its page and its quote.
  Tables are text PDFs with an Exhibit A table, or CSV exhibits; prose states rates in sentences; scans are PDFs of
  page images with no text layer (a fixed 5x7 bitmap font, seeded specks, zlib), with `textract.json`
  (`tp-textract-recording/1`) beside them: the LINE blocks Amazon Textract's text detection returns, a table's
  columns as separate lines. Methods, codes, modifiers, places, amounts, percentages, locked years, rounding and
  adjustment clauses, amendments and the way each date and amount is written vary from a seed per case; filing and
  dispute windows, section numbers and days to pay sit beside the terms as distractors. 120 records, 742 fields.
  The generator refuses a quote that is not on its page.
- MOD-03 carries the narrative set under `fixtures/synthetic/MOD-03/narrative-set/` (`tp-eval-narratives/1`, six
  parts of fifty, one case per line): 300 pattern statements over every cited method (fixed schedule, percent of
  Medicare, lesser of, per visit, and the Medicare Advantage regulation), with 1 to 12 lines, prompt-pay interest
  computed, not computable or absent, and second-level disputes. Each case is the approved records a version is
  assembled from (`@tp/packets` AssemblyInput as JSON), the case's invented identifiers (never in the inputs; a
  narrative holding one fails), the facts any narrative of it must state (shortfall, expected, observed, the line
  count, the contract's rate or percentage, and citations to the contract and the line schedule; PRD 12: "what the
  contract requires, what the remittances show, the delta and the count"), and a reference narrative written by
  `packages/synth` from its own sums in one of three styles.

**The harness is `packages/model-gateway/eval`.** It reads the committed sets through intake's own readers (pdf.js
in its bounded thread, the CSV reader, and for a scan the Textract page reader over a client that answers from the
recording), assembles each narrative case with `@tp/packets`, and runs a provider through the gateway itself as
synthetic evaluation calls (no practice, the evaluation actor, logged in model_call; ADR 0048). It scores:

- contracts, field by field: a stated field is right when the gateway's verifier passed it (its quote on its page,
  its written value in the quote and readable by code) and the value code reads is the true value; a wrong stated
  field is a false positive and its true field a false negative; a left-out true field a false negative; a stated
  field no true record has a false positive. Each true record pairs with the candidate that gets most of its
  fields right. Counts are whole numbers and precision and recall are compared as fractions, never floats;
- narratives, case by case, through the packets verifier (the gateway's draftPacketNarrative check) and the required
  facts as the verifier's own scanner reads them. A failed call, an answer off the schema, a verifier failure or a
  missing required fact is a critical error.

**The gate holds a report to the committed baseline** (`eval/baseline.json`, `tp-model-eval-baseline/1`): one entry
per purpose, prompt version, provider and model with its counts and the SHA-256 of the set it was recorded on.
Contracts pass when neither overall nor any field's precision or recall is lower than the entry the report is held
to (the same prompt and model; else the same model under the prompt it replaces; else the provider's latest entry,
so a model change is held to the model it replaces), the set is the recorded one, and no quote is off its page.
Narratives pass only with zero critical errors, whatever the baseline says. A provider with no entry fails until a
person records one with `pnpm --filter @tp/model-gateway eval --provider configured --record` from a run that can
call it; `--record` refuses a run that regresses.

**CI runs it in the golden project.** `eval/gate.golden.test.ts` is a `*.golden.test.ts` file, so `pnpm
test:golden`, which CI already runs, runs it: no workflow change, and the golden project is where a difference
against committed expectations fails the build (PRD 18, Layers: Golden, "Zero differences"). With no model, CI's
provider is the local deterministic provider answering every case with its reference answer (for a contract, its
true records as candidates, every field copied as the document writes it with its page and quote; for a narrative,
the set's reference narrative). That run must score all 742 fields right, every quote on its page (MOD-01),
300 of 300 narratives free of critical errors (MOD-03), and match the baseline's local entries exactly. The same
file proves the gate fails: a provider that drops one field of one document, misquotes one field, writes an amount
its quote does not hold, adds a figure to one narrative, drops one sentence's citation or leaves out the shortfall
fails it, as does a changed set or a provider with no baseline.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| The unit project (`pnpm test`) | It carries the coverage gates and must stay fast; the harness reads 40 documents through pdf.js threads, and comparing against committed expectations is what the golden project is for |
| A new CI step | `ci.yml` is not changed in this milestone; the golden project already runs on every pull request |
| Recording reference model outputs as fixed files keyed by request | The keys move with every framing or prompt change; deriving the reference answers from the truth keeps one source and still exercises the framing |
| Mocking a model in CI | It would measure the mock; the local provider answers only registered requests, so CI proves the path, and a real run measures a model |
| Floats for precision and recall | Counts and exact fractions cannot round a regression away |

## Consequences

- CI proves the scoring, the verifiers, the readers and the baseline comparison on every pull request, and that a
  regression fails. It does not measure a model. **The real gate needs a model**: before a prompt or model change
  ships, and before milestone 10 closes, a person runs `pnpm --filter @tp/model-gateway eval --provider
  configured` with `MODEL_PROVIDER=bedrock` (or `anthropic`) and credentials, records the provider's baseline with
  `--record`, reviews and commits it. The sets are synthetic and the calls name no practice, so the gateway lets
  them reach a real provider outside production; the permitted real examples (eval_example rows under a practice's
  data-rights agreement) are evaluated only inside the PHI boundary, a step this build cannot run.
- A changed set changes its SHA-256 and fails the gate until the baseline is re-recorded: a set is never changed
  silently.
- The local provider's perfect score is the expected result, not evidence of quality; the golden test says so.

## Revisit when

- A real provider's baseline is recorded (then CI's local entry stays the path check, and the recorded entries are
  the quality bar).
- Permitted real examples accumulate enough to need their own run inside the PHI boundary.
- A prompt version adds a field or changes its schema (the reference answers and the scorer follow it).
