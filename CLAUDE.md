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
- The founder's standing rule (2026-10-18): recommend and build only the best option, never weighted by build effort, judged on accuracy, quality, user experience, growth, security and privacy, compliance, reliability, cost to serve, dispute success, time to value, resilience to change, AI safety, maintainability and business readiness.
- Five line stages: flagged | validated | actionable | payer_approved | recovered. Monotonic; reopen is explicit.
- Unpriced reasons are the closed list in docs/product/unpriced-reasons.md. Never a guessed price.
- Medicare adjustment flags (apply_mppr, apply_assistant_reduction, apply_sequestration, apply_ncci) default
  to false on commercial contracts and true for MA non-contracted lines.
- Idempotency: parse by document hash; an 835 by (practice, sender, ISA13, TRN02, BPR02), the remittance_once
  key, and a resend under a new ISA13 with the same payee, TRN02, TRN03, BPR02 and BPR16 is the same payment
  and loads zero rows (ADR 0031); an ERA export by (practice, payee, TRN02, credit or debit, BPR02, BPR16), the
  remittance_export_once key, the 835 authoritative: an export of a payment already loaded from either source
  loads zero rows, and an 835 of a payment first loaded from an export is held for review (ADR 0060); jobs by
  singleton key.
- Dates: UTC timestamps; service dates as calendar dates; windows computed from remittance dates.
- Every mutation: a server action or route handler with a Zod schema, a role check, a practice-scoped
  transaction (SET LOCAL app.practice_ids, app.actor_id) and an audit event.
- Schema gate (CO-02):
  - Milestone 1 does not start until the founder approves `docs/product/domain-model.md`.
  - No migration merges unless `docs/product/domain-model.md` is regenerated in the same pull request and its approval line carries the founder's name, a date and the hash of that text (`pnpm db:domain-model --check --require-approval`).
  - The approval of record is the founder's APPROVED GitHub review of the pull request's latest commit, enforced by the approval-of-record job once `APPROVAL_REVIEW_REQUIRED` is true (docs/adr/0063); open the pull request with `pnpm db:domain-model --summary-since <base>`, never write the approval line or approvers.json yourself, and never approve or request changes on a pull request: post the approval line as a suggested change in one pull-request comment on that line through the GitHub API (`gh api repos/<owner>/<repo>/pulls/<n>/comments`; .claude/skills/new-migration), which GitHub records as a comment, since protect-github.sh refuses the connector's review tools.
- Merging (docs/adr/0063): fill every pull request's description from .github/pull_request_template.md (GitHub offers it only from main); from the day you work as your own GitHub account (runbook 3i), merge a pull request only after the founder approves its latest commit and the required checks are green, even before GitHub requires it (until then, on green checks); open none into main before launch unless the founder rules on it, never approve or merge one Dependabot opens there, and never create a release tag (the founder does).
- Pushing (docs/adr/0063): every push goes through the pre-push hook (the fixture check and gitleaks); never push with --no-verify and never write files through the GitHub connector. Push a branch cut from main (no hook there until launch) from a checkout of claude/build-platform (`git push origin <branch>`), never by merging claude/build-platform into it. If the session-start message says the hook or gitleaks is missing, run pnpm hooks:install and pnpm gitleaks:install (the pinned gitleaks, its SHA-256 checked) before any push; a refused push is rewritten, never forced past the hook.

## Where things are
- Parser: packages/edi835. Engine: packages/pricing. Contracts: packages/contracts. Rules: packages/rules.
- Triage: packages/triage. Packets: packages/packets. Ledger: packages/ledger. Gateway: packages/model-gateway.
- Synthetic data: packages/synth; fixtures in fixtures/synthetic; golden lines in fixtures/golden.
- Decisions: docs/adr. Product: docs/product. Runbooks: docs/runbooks.
