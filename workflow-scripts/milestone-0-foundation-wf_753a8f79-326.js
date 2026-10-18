export const meta = {
  name: 'milestone-0-foundation',
  description: 'Milestone 0: monorepo skeleton, CI tooling, money package, rules schema, content checker and release pipeline; then review and fix',
  phases: [
    { title: 'Build', detail: 'skeleton and tooling, then money + rules + content pipeline' },
    { title: 'Review', detail: 'plan conformance and fresh-checkout correctness' },
    { title: 'Fix', detail: 'address confirmed findings and re-run checks' },
  ],
}

const ENV = `
ENVIRONMENT AND HOUSE RULES (read carefully before anything else):
- Repository: /home/user/PhysicalTherapy (git, branch claude/build-platform). Work only inside it. When done, commit your work (git add -A && git commit) with a message "<area>: <summary>", a short body, then a blank line and exactly these two trailer lines:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR
  Do NOT push. Never put a model name or model identifier in code, comments, docs or commit messages.
- The specification is the plan imported into docs/product/: PRD.md (the build plan, sections 1-21), data-dictionary.md, rules-reference.md, test-matrix.md, milestone-prompts.md (the opening prompt and done-check for every milestone). CLAUDE.md and .claude/rules/*.md are the house rules; .claude/skills and .claude/agents describe the workflow the repo expects. Follow the plan exactly: do not add features it does not ask for and do not skip anything it requires. When the plan is silent, choose the simplest option consistent with it and list it under decisions in your report (non-obvious ones also become an ADR in docs/adr/).
- Never modify CLAUDE.md, anything under .claude/, docs/product/*.md, docs/product/diagrams/, README.md's first paragraph, or .github/workflows/ci.yml: they are the verbatim plan. Do not create .claude/settings.json (it is added at the very end). Never write under content/releases/ (CI publishes releases on merge).
- Postgres 16 runs locally at postgres://postgres:test@localhost:5432/postgres (superuser). CI uses postgres:18 at the same URL. If it is down, start it: su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /root/pgdata -l /root/pgdata/log.txt -o '-p 5432 -k /tmp' start". Tests that need isolation create and drop their own databases.
- Network: the npm registry and PyPI work. cms.gov, x12.org, ncdoi.gov and similar sites are blocked by policy (HTTP 403) - do not retry them. There is no Docker daemon (write docker-compose.yml, but nothing may depend on it at test time), no MinIO and no AWS credentials. Anything that talks to S3, KMS, Cognito, Bedrock, Textract, SES, GuardDuty or Stripe sits behind an interface with a local implementation used in dev and tests and the real implementation used in staging and production.
- Toolchain: Node 22 locally (CI uses Node 24), pnpm 10.28, Python 3.13 with pip. Chromium for Playwright is preinstalled at /opt/pw-browsers (PLAYWRIGHT_BROWSERS_PATH is set); never run "playwright install". Do not use next/font/google or anything that fetches fonts at build time.
- Data: never put real PHI, a real remittance, a real contract, or real CMS/X12 values typed from memory anywhere. Synthetic data only. X12 fixtures use ISA06 "SYNTHSENDER" (padded to 15) and GS02 "SYNTH". Synthetic numeric reference data (RVUs, GPCIs, conversion factors, rates) must say SYNTHETIC in its source metadata and must never be presented as CMS data.
- Quality bar: strict TypeScript; no float on any amount (bigint cents, Decimal rates, all through @tp/money); every behavior has a test. Before finishing, run the checks your work touches (at minimum pnpm install, pnpm typecheck, pnpm lint, pnpm lint:logs, pnpm test, plus pnpm build / test:db / verify-content as relevant) and report the real outcome of each. Never claim a check passed that you did not run; if something cannot be done in this environment, say exactly what and why.
`

const BUILD_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    built: { type: 'array', items: { type: 'string' } },
    checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed', 'note'] } },
    decisions: { type: 'array', items: { type: 'string' } },
    not_done: { type: 'array', items: { type: 'string' } },
    commit: { type: 'string' },
  },
  required: ['summary', 'built', 'checks', 'decisions', 'not_done', 'commit'],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
      file: { type: 'string' },
      issue: { type: 'string' },
      plan_reference: { type: 'string' },
      fix: { type: 'string' },
    }, required: ['severity', 'file', 'issue', 'plan_reference', 'fix'] } },
    checks_run: { type: 'array', items: { type: 'string' } },
  },
  required: ['findings', 'checks_run'],
}

phase('Build')
const skeleton = await agent(`${ENV}

TASK: Milestone 0, part A - the monorepo skeleton and all repository tooling. Read docs/product/PRD.md sections 1, 15 (Repository, Stack, Environments), 17 and 18, docs/product/milestone-prompts.md (Milestone 0 and the configuration notes), and .github/workflows/ci.yml. Every command CI runs must exist and work.

Build exactly this layout (the PRD section 15 tree, rooted at the repository root):
- Root: package.json (private, "type": "module", packageManager pnpm@10.28.0, engines node >=22), pnpm-workspace.yaml (apps/*, packages/*, infra, tools), tsconfig.base.json (strict, noUncheckedIndexedAccess, noImplicitOverride, noFallthroughCasesInSwitch, ES2023, moduleResolution Bundler, verbatimModuleSyntax), .nvmrc (24), .gitignore, .editorconfig, docker-compose.yml (postgres:18 and MinIO for pnpm dev), .gitleaks.toml if useful.
- Workspace packages, each named @tp/<dir>, ESM, exporting TypeScript source directly ("exports": {".": "./src/index.ts"}), each with tsconfig.json, a "typecheck" script (tsc --noEmit), src/index.ts and at least one passing test: packages/db, edi835, contracts, rules, pricing, triage, packets, ledger, model-gateway, ui (shadcn/ui on Tailwind components, starting with the handful the shell needs), synth, money, observability. Declare the inter-package workspace dependencies the PRD architecture implies so later milestones do not need to re-link (e.g. pricing -> money, rules; ledger -> money, db; packets -> money, pricing; web/worker -> the packages they will use).
- apps/web: Next.js (current stable major, App Router, React Server Components, TypeScript strict, Tailwind, shadcn/ui via @tp/ui, transpilePackages for @tp/*). Add the application shell from PRD section 7: a left rail with a practice switcher placeholder at the top and nav entries for the customer workspace screens; a placeholder page per screen is fine at this milestone, each with the empty/loading/error/permission state components from section 7 ready to use. Set security headers in next.config (and Cache-Control: private, no-store for app routes). No Google fonts.
- apps/worker: a Node service using pg-boss with a typed job registry (parse_835, price, triage, reconcile, digest, export placeholders), singleton keys per practice and job type, graceful shutdown, a heartbeat, started with tsx in dev and bundled for production (esbuild or tsup).
- infra/: an AWS CDK (TypeScript) app skeleton with one stack per environment (dev, staging, production) - just the app and an empty or minimal stack now; milestone 1 fills it. Scripts: synth, and cdk:diff that runs "cdk diff" when AWS credentials exist and otherwise runs "cdk synth" and prints that the diff against staging needs credentials (so CI's "pnpm cdk:diff" step passes without credentials).
- tools/: tools/check-releases-immutable.sh (fails if any file under an existing content/releases/<n> differs from the base ref passed as $1; passes when content/releases does not exist on either side), a tools/lint-logs script for "pnpm lint:logs" (statically scans log calls and fails on any field outside the allowlist in packages/observability/src/fields.ts and on name, DOB, member ID, claim number or document text fields; seed the allowlist with ID-only fields), tools/verify-content placeholder entry point (part B fills it).
- content/: content/drafts/, content/sources/, content/outgoing/ with README.md files explaining the release pipeline of PRD section 9 (do NOT create content/releases).
- fixtures/synthetic/ and fixtures/golden/ with README.md files stating NO REAL PHI, ever.
- .github/workflows/publish-content.yml: on push to main, for each content/outgoing/<n> verify its MANIFEST.json SHA-256 hashes, move it to content/releases/<n>, commit and tag content-release-<n>. .github/workflows/release.yml: on a release tag, build and tag the web and worker container images (Dockerfiles in apps/web and apps/worker). Do not touch ci.yml.
- Root scripts matching CLAUDE.md and ci.yml: dev, build, typecheck, lint (ESLint flat config with typescript-eslint), lint:logs, test (Vitest unit + property tests; fast-check installed), test:db (Vitest project for *.db.test.ts files, DATABASE_URL), test:golden (Vitest project for golden tests; accept a --report flag that later writes fixtures/golden/.report), test:oracle (placeholder runner that exits 0 with a message until milestone 2 adds fixtures; it must later compare our parser with pyx12), test:e2e (Playwright config with a smoke test against the built or dev web app; use the preinstalled Chromium), verify-content, synth (accepts --all and --case <id>; a placeholder until milestone 2 that exits 0), db:migrate, db:seed (placeholders until part B / milestone 1 add the runner), release:* (placeholders part B fills), cdk:diff, stryker (StrykerJS config targeting packages/pricing, packages/ledger and the packets verifier with the vitest runner; "pnpm stryker run" must at least start correctly).
- ESLint rules now: forbid importing @aws-sdk/client-bedrock-runtime, @anthropic-ai/sdk and @anthropic-ai/bedrock-sdk anywhere except packages/model-gateway (PRD section 14); forbid parseFloat, Number() and floating-point literals on amounts inside packages/money, pricing, ledger and packets (a no-restricted-syntax rule is fine; document how money code avoids it).
- Vitest coverage config with 100% branch thresholds for packages/pricing, packages/ledger, packages/edi835 and the authorization helpers (PRD section 18), applied per package.
- docs/adr/0000-template.md and docs/adr/0001-single-language-monorepo-postgres-rls-bedrock-gateway.md (single-language TypeScript monorepo, PostgreSQL forced RLS for tenant isolation, Claude on Bedrock behind a single gateway, with the alternatives the PRD names).

Done when: from a clean state "pnpm install" then "pnpm typecheck && pnpm lint && pnpm lint:logs && pnpm test && pnpm build" all pass, "pnpm test:e2e" passes its smoke test, "pnpm cdk:diff" passes without AWS credentials, and tools/check-releases-immutable.sh passes against main. Commit with area "chore".`, { label: 'M0a skeleton + tooling', phase: 'Build', schema: BUILD_SCHEMA })

const content = await agent(`${ENV}

TASK: Milestone 0, part B - money, the rules schema, the content checker and the release pipeline. Part A already built the monorepo skeleton and tooling (read the repo first; keep its conventions). Read PRD sections 2, 9 (all of it), 11 (Inputs), 15 and 18; docs/product/rules-reference.md; docs/product/data-dictionary.md (Global content); the Milestone 0 prompt in docs/product/milestone-prompts.md; and the skills .claude/skills/new-rule-record, load-release and golden-diff, which describe the workflow these tools must support.

Build:
1. packages/money: branded bigint Cents; exact parsing of decimal strings to cents (reject more than two places, never via float); Decimal (decimal.js, fixed high precision) for rates and unrounded values; multiply cents or Decimal by rates without rounding; the three rounding rules HALF_UP_CENT, HALF_EVEN_CENT, TRUNCATE applied once; sums; formatting cents for a locale; conversions that make float misuse impossible by type. Property tests with fast-check (rounding changes an amount by less than one cent; parse/format round-trip; sums associative) and unit tests at every boundary.
2. packages/rules/src/schema.ts: Zod schemas for every global record type in the data dictionary (pfs_rvu, pfs_gpci, conversion_factor, mppr_rate, therapy_threshold, assistant_modifier, sequestration, ncci_ptp, ncci_mue, carc, rarc, claim_status_code, state_prompt_pay, dispute_window, locality_map) plus the denial-category lookup the rules reference says is maintained as a rule record. Each record: record_type, key, value, effective_from, effective_to, source (title, url or path, retrieved date, sha256 of the stored source file), verification (L1, L2, L3), quotes (text that must appear in the stored source), notes. Money in cents (bigint serialized as strings in JSON), rates and RVUs as decimal strings.
3. Parsers that load CMS tabular files into rule records (never typing): the PFS relative value file (PPRRVU CSV), the GPCI file, the ZIP-to-locality file, the conversion factor from a small CSV the reviewer prepares from the final rule, the therapy MPPR rate file, NCCI PTP and MUE practitioner tables, and the X12 CARC, RARC and claim status code list exports. Write each parser against the documented column layout of the public file, with tests on small SYNTHETIC files you create under fixtures/synthetic/cms/ (clearly labelled SYNTHETIC, invented values). A CLI "pnpm rules:import --type <type> --year <year> --file <path>" stores the source under content/sources/<type>/ with its SHA-256 and writes drafts under content/drafts/<type>/<year>/ at verification L1.
4. tools/verify-content ("pnpm verify-content"): refuses when any record lacks a source or its source hash does not match the stored file, any effective window overlaps another for the same record_type and key, any numeric field fails its range, any quote does not appear in the stored source text, or a hand-typed record's two independent transcriptions differ (implement the "transcribe twice and diff" rule from the new-rule-record skill as a concrete mechanism). It checks content/drafts, content/outgoing and content/releases, and fixture releases when pointed at them.
5. Hand-typed drafts for release 1, transcribed twice: the 2026 therapy thresholds (KX $2,480 PT and SLP combined, $2,480 OT, targeted medical review $3,000 each), the assistant-modifier percentage (85%, effective 2022-01-01), sequestration (2%), the MPPR practice-expense reduction percentage (50%), the Medicare dispute windows (timely filing 12 months, redetermination 120 days, reconsideration 180 days) and the North Carolina prompt-pay rule (30 days, interest, ERISA self-funded plans excluded, G.S. 58-3-225). The only source available in this environment is the plan's own rules reference: store a copy of docs/product/rules-reference.md under content/sources/plan/ with its SHA-256, cite it as the source with the CMS/NCDOI URL it names in notes, quote the exact sentences, and set verification L1 with the L2 reviewer questions listed. Do NOT type any RVU, GPCI, conversion factor, NCCI, MUE or code-list value from memory: those need the real CMS/X12 files, which this environment cannot download. Write content/sources/README.md listing exactly which files to download, from where, and the rules:import command for each.
6. Release tooling: "pnpm release:assemble <n>" (copies drafts at L2 or higher into content/outgoing/<n>/ with RELEASE.md and MANIFEST.json of SHA-256 hashes; refuses L1 records and records without a source hash), "pnpm release:dry-run <n>" (lists runs whose lines would change; until pricing runs exist it reports that no runs exist), and a loader in packages/rules that loads a release directory into the global tables.
7. packages/db, minimal for this milestone: a forward-only SQL migration runner ("pnpm db:migrate", schema_migrations table storing a checksum per file and refusing to run if an applied migration file changed), the roles (an owner role that owns tables and runs migrations and loads; an application role with NOSUPERUSER, NOBYPASSRLS that owns nothing; a login for the application role in dev and test), and the first migration creating rule_release and rule_record exactly per the data dictionary with REVOKE INSERT, UPDATE, DELETE from the application role. Milestone 1 adds tenancy tables after this; leave a clean place for it (Drizzle schema files alongside the SQL).
8. A synthetic test release under fixtures/synthetic/rules/release-synth-1/ (SYNTHETIC values for a handful of therapy codes: 97110, 97112, 97116, 97140, 97530, 97161, 97162, 97163, 97164, 97026, 97035, G0283, plus GPCI for one synthetic locality, two conversion factors, MPPR, thresholds, assistant, sequestration, a few NCCI pairs including 97140/97530 and MUEs, a few CARC/RARC/claim-status codes) that passes the checker, and a db test (*.db.test.ts) proving it loads into an empty database, is immutable afterwards, and that the application role cannot insert, update or delete global rows.

Done when: pnpm verify-content passes on content/drafts and on the synthetic release; the release loader test passes on an empty database; release:assemble refuses L1 drafts; pnpm typecheck, lint, lint:logs, test, test:db and build pass. In your report state plainly that the real release 1 cannot be assembled here and what a person must do (download the files, rules:import, verify to L2, release:assemble, merge). Commit with area "content" or "rules".`, { label: 'M0b money + rules + content', phase: 'Build', schema: BUILD_SCHEMA })

phase('Review')
const reviews = await parallel([
  () => agent(`${ENV}

You are a READ-ONLY reviewer (you may run commands, but do not edit any tracked file; use /tmp/claude-0/review-m0-plan for scratch). Review milestone 0 against the plan. Two build agents just finished; their reports:
PART A: ${JSON.stringify(skeleton)}
PART B: ${JSON.stringify(content)}

Compare the repository with: PRD section 15 (repository tree, stack table), section 9 (content releases, the checker rules, the pipeline), section 17 (Milestone 0 row), section 18 (CI, layers, what never ships), docs/product/milestone-prompts.md (Milestone 0 prompt and configuration notes), the data dictionary's Global content tables, CLAUDE.md commands, every step of .github/workflows/ci.yml, and the skills in .claude/skills. Report each place where the repository is missing something the plan requires for milestone 0, contradicts the plan, adds something the plan does not ask for, fakes a check (a script that always passes where the plan requires a real gate, except the placeholders explicitly allowed until later milestones: test:oracle, synth, release:dry-run impact), or presents synthetic data as real. Cite the plan text for each.`, { label: 'review: plan conformance', phase: 'Review', schema: FINDINGS_SCHEMA }),
  () => agent(`${ENV}

You are a READ-ONLY reviewer (you may run commands, but do not edit any tracked file). Verify milestone 0 works from a fresh checkout and is correct. Steps: git clone /home/user/PhysicalTherapy /tmp/claude-0/review-m0-fresh (fresh copy of the committed branch), then in that copy run pnpm install --frozen-lockfile, pnpm typecheck, pnpm lint, pnpm lint:logs, pnpm verify-content, tools/check-releases-immutable.sh main (fetch main into the clone first), pnpm synth --all, pnpm test, pnpm test:golden, pnpm test:oracle, DATABASE_URL=postgres://postgres:test@localhost:5432/<a fresh database you create> pnpm db:migrate && pnpm test:db, pnpm test:e2e, pnpm build, pnpm cdk:diff. Record every failure with its output. Then review the code for correctness: packages/money (exactness, rounding rules HALF_UP_CENT / HALF_EVEN_CENT / TRUNCATE including negative amounts, any float path), the content checker (does each refusal rule in PRD section 9 actually fire? write throwaway negative inputs in /tmp to prove it), the migration runner (checksum enforcement, roles: the application role owns nothing and has no BYPASSRLS; global tables are read-only to it), the CMS parsers (do the column layouts match the documented public file formats?), and the release tooling (L1 refusal, manifest hashes). Report each defect with how to reproduce it. Drop the scratch database afterwards.`, { label: 'review: fresh checkout + correctness', phase: 'Review', schema: FINDINGS_SCHEMA }),
])

const findings = reviews.filter(Boolean).flatMap(r => r.findings)
log(`${findings.length} findings from review (${findings.filter(f => f.severity === 'blocker').length} blockers, ${findings.filter(f => f.severity === 'major').length} major)`)

phase('Fix')
const fix = await agent(`${ENV}

TASK: Fix milestone 0 review findings. Two independent reviewers produced these findings (JSON):
${JSON.stringify(findings, null, 1)}

For each finding: verify it against the code and the plan first. Fix every real blocker and major finding, and every real minor one that is cheap and inside milestone 0's scope. Do not widen scope beyond the plan. For any finding you judge wrong or out of scope, say why. Then run the full check list from a fresh clone of your committed work (git clone /home/user/PhysicalTherapy /tmp/claude-0/fix-m0-verify after committing; then pnpm install --frozen-lockfile, typecheck, lint, lint:logs, verify-content, test, test:golden, test:oracle, db:migrate + test:db on a fresh database, test:e2e, build, cdk:diff) and report each result. Commit with area "fix".`, { label: 'M0 fix', phase: 'Fix', schema: {
  type: 'object',
  properties: {
    fixed: { type: 'array', items: { type: 'string' } },
    rejected: { type: 'array', items: { type: 'object', properties: { finding: { type: 'string' }, reason: { type: 'string' } }, required: ['finding', 'reason'] } },
    checks: BUILD_SCHEMA.properties.checks,
    commit: { type: 'string' },
  },
  required: ['fixed', 'rejected', 'checks', 'commit'],
} })

return { skeleton, content, findings, fix }
