# 0001. Build one TypeScript monorepo, isolate tenants with forced row-level security, and reach Claude on Bedrock through one gateway

- **Status:** accepted
- **Date:** 2026-10-14
- **Deciders:** founder (engineering), from the architecture and build plan
- **PRD sections:** 1 (the four rules), 3 (authorization in code), 14 (AI gateway), 15 (architecture and stack), 16 (controls), 20 (open decisions)

## Context

One engineer must build, patch, monitor and attest to a product that holds protected health information for
many practices, is reached by billing firms through revocable grants, and uses a model to read contracts and
draft narratives. Every extra language, queue, datastore or model path is another thing to secure, upgrade
and evidence for HIPAA and SOC 2 (PRD section 15: "one TypeScript monorepo, one AWS account per
environment, one database, one queue, one model path, one business associate agreement").

Three decisions shape every file after this one: the language and repository layout, where tenant isolation
is enforced, and how the product reaches a model.

## Decision

1. **A single-language TypeScript monorepo** managed with pnpm workspaces: the Next.js web app (`apps/web`),
   the pg-boss worker (`apps/worker`), the CDK infrastructure (`infra`), repository tooling (`tools`) and the
   domain packages (`packages/*`), all on strict compiler settings and Node 24 LTS. The 835 parser is written
   in-house in TypeScript (`packages/edi835`); pyx12 (Python) runs only in CI, as an independent oracle on
   synthetic fixtures, and never ships.
2. **PostgreSQL forced row-level security is the tenant boundary.** Every table that can hold PHI carries
   `practice_id` and `ENABLE` plus `FORCE ROW LEVEL SECURITY`, with a policy on
   `current_setting('app.practice_ids')::uuid[]`. Every request and every job opens its transaction with
   `SET LOCAL app.practice_ids` and `app.actor_id`; the application role owns no table and has no
   `BYPASSRLS`. Role checks also run in route handlers and server actions, never only in middleware. Firm
   portfolio queries run inside the same policy, so no path needs a bypass. A catalog test and generated
   cross-tenant tests prove it on every pull request.
3. **Claude on AWS Bedrock, behind one gateway.** `packages/model-gateway` is the only code that calls a
   model; ESLint fails the build on any import of `@aws-sdk/client-bedrock-runtime`, `@anthropic-ai/sdk` or
   `@anthropic-ai/bedrock-sdk` elsewhere (enforced from milestone 0 in `eslint.config.js`). The gateway
   exposes purpose-typed functions with pinned prompt versions, output schemas, verifiers and a log row per
   call. Bedrock runs inside the company's AWS account under the AWS business associate agreement, through a
   VPC endpoint. Model identifiers are configuration pinned per prompt version, never a floating alias.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| A second language for the parser (pyx12 or another Python EDI library in production) | Two runtimes to patch and attest. pyx12 stays as the CI oracle, which is more valuable when it shares no code with the parser |
| A hosted healthcare EDI API for parsing (for example Stedi) | Per-transaction pricing at audit volumes and another subprocessor holding PHI; the parser is in-house (PRD section 21) |
| Authorization in application code or middleware only | One missed `WHERE` leaks a practice; the 2025 Next.js middleware bypass showed middleware cannot be the only check (PRD section 3). Handlers check roles and Postgres enforces tenancy |
| React Router instead of Next.js | The fallback if the framework's pace becomes a burden (PRD section 15) |
| SQS instead of a Postgres-backed queue | The fallback if volumes outgrow Postgres; until then pg-boss avoids a second queue system (PRD section 15) |
| Anthropic's API under its BAA with HIPAA readiness instead of Bedrock | The named alternative path, coded behind the same gateway interface. Messages, Citations, inline PDFs, prompt caching and structured outputs are eligible there; the Batch API, Files API, code execution, Skills and the MCP connector are refused; enablement is organization-wide and permanent (PRD section 14). One path is chosen before the first PHI call |
| A BAA-covered identity vendor instead of Cognito | The fallback if Cognito's user experience blocks sales (PRD section 15); revisited at milestone 11 |

## Consequences

- One toolchain (pnpm, TypeScript, Vitest, ESLint) covers every package; a reviewer reads one language.
- Isolation is testable in one place: the database. Every new PHI table needs a migration with its policy and
  a registry row, and gets a generated cross-tenant test (milestone 1 onward).
- Jobs and the model gateway run one practice per transaction; a bulk job that spans practices is refused by
  design.
- The model path is swappable without touching callers, because no caller imports a provider SDK.
- The Bedrock or Anthropic-API choice is recorded as its own ADR before the first PHI call (milestone 10).

## Revisit when

Milestone 10 (model path, after counsel reads both agreements), milestone 11 (identity, after the first
billing firm's security review), or when queue volume or framework churn triggers a named fallback.
