# PaidWhole: therapy contract-payment platform

One TypeScript monorepo (pnpm). Next.js web app in apps/web, pg-boss worker in apps/worker, PostgreSQL with
forced row-level security, S3 with per-practice keys, Cognito, Claude on Bedrock through packages/model-gateway.
The product ingests copies of 835 remittances and payer contracts, computes expected payment per line under
approved contract versions, groups shortfalls by payer pattern into dispute packets a person approves, and
proves recovery by reconciling later remittances to posting and deposits.

## Four rules that never bend
1. Code computes every number. A model never produces, alters or classifies a dollar amount, a stage, an
   approval or a submission. Models propose text and extracted fields; a person approves before use.
2. Money is integer cents (bigint). Rates are numeric(14,6). Never a float on an amount. Round once per
   line under the contract's rule and keep the unrounded value beside it.
3. Every expected amount traces to a signed-off rate_record (page, quote, hash, approver) and a numbered
   rule_release. pricing_run and priced_line are immutable; a new release means a new run.
4. Every table that can hold PHI has practice_id and FORCE ROW LEVEL SECURITY. The app role owns nothing
   and cannot bypass. The cross-tenant test and the catalog test must pass on every PR.

## Never
- Put real PHI, a real 835, a real contract or a real export anywhere in this repo, a fixture, a log, a
  prompt, a CI job or a Claude Code session. Debug with twins from packages/synth.
- Call a model outside packages/model-gateway. Give a model tools when it reads a document.
- Edit content/releases/** or an applied migration by hand. Use /load-release and /new-migration.
- Log a name, date of birth, member ID, claim number or document text. Log IDs.
- Count anything as recovered without a ledger_entry at stage posted or deposited.
- Put PHI in a URL, S3 key, filename, email body, job payload or error message.
- Rely on middleware alone for authorization. Check in the handler and in Postgres.
- Mark a packet approved by the person who drafted it.

## Commands
- pnpm install; pnpm dev (web + worker + local Postgres + MinIO); pnpm db:migrate; pnpm db:seed (synthetic)
- pnpm test (unit + property); pnpm test:db (catalog + cross-tenant); pnpm test:golden; pnpm test:e2e
- pnpm verify-content; pnpm lint; pnpm typecheck; pnpm lint:logs; pnpm synth (generate fixtures)

## Conventions
- Five line stages: flagged | validated | actionable | payer_approved | recovered. Monotonic; reopen is explicit.
- Unpriced reasons are the closed list in docs/product/unpriced-reasons.md. Never a guessed price.
- Medicare adjustment flags (apply_mppr, apply_assistant_reduction, apply_sequestration, apply_ncci) default
  to false on commercial contracts and true for MA non-contracted lines.
- Idempotency: parse by document hash and (practice, payee, ISA13, TRN02, BPR02); jobs by singleton key.
- Dates: UTC timestamps; service dates as calendar dates; windows computed from remittance dates.
- Every mutation: a server action or route handler with a Zod schema, a role check, a practice-scoped
  transaction (SET LOCAL app.practice_ids, app.actor_id) and an audit event.

## Where things are
- Parser: packages/edi835. Engine: packages/pricing. Contracts: packages/contracts. Rules: packages/rules.
- Triage: packages/triage. Packets: packages/packets. Ledger: packages/ledger. Gateway: packages/model-gateway.
- Synthetic data: packages/synth; fixtures in fixtures/synthetic; golden lines in fixtures/golden.
- Decisions: docs/adr. Product: docs/product. Runbooks: docs/runbooks.
