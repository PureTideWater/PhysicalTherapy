export const meta = {
  name: 'co-001-pr-02-domain-model',
  description: 'Change Order 001 PR 2: port the domain model generator into packages/db, regenerate docs/product/domain-model.md, add the drift and approval tests and the CLAUDE.md gate, review and verify',
  phases: [
    { title: 'Build', detail: 'port generator, regenerate document, db test, CLAUDE.md rule' },
    { title: 'Review', detail: 'document accuracy, test robustness, guardrails' },
    { title: 'Fix', detail: 'verify every finding, fix the real ones' },
    { title: 'Verify', detail: 'fresh clone on Postgres 18 and Node 24' },
  ],
}

const WT = '/home/user/pr2'
const BR = 'co-001/pr-02-domain-model'
const REC = '/home/user/PhysicalTherapy/docs/product/reconciliation-001.md'
const CO = '/home/user/PhysicalTherapy/docs/product/change-order-001.md'

const COMMON = `
You are working on PaidWhole Change Order 001, pull request 2 (CO-02, the domain model approval gate), in the git worktree ${WT} on branch ${BR}. Run every command in ${WT}. Never edit, stage or commit anything in /home/user/PhysicalTherapy, /home/user/pr1, /home/user/co-001 or /home/user/pw-brand; read them only.

Read first: ${CO} (CO-02 and "What must not change"), ${REC} (milestone 0 and 1 rows, section 8 row, PR 2, decisions D1 and D2, "What must not change, as checks", and "Approval" at the end).

The owner's decisions:
- D1 option (a): the schema is approved at today's head (which includes 20261101120000_support_mail.sql), then frozen. CLAUDE.md gains CO-02's sentence verbatim: "Milestone 1 does not start until the founder approves \`docs/product/domain-model.md\`." and beneath it: "No migration merges unless \`docs/product/domain-model.md\` is regenerated in the same pull request and its approval line carries the founder's name, a date and the hash of that text (\`pnpm db:domain-model --check --require-approval\`)." Put them where they read naturally (for example a short "Schema gate" note under Conventions or Never); change nothing else in CLAUDE.md.
- D2 option (a): the founder approves the divergences in sections A and B and C1 (denial_category as a rule_record type; the remittance key (practice_id, sender_id, isa13, trn02, bpr02_cents)). PRD.md and data-dictionary.md stay verbatim. Only CLAUDE.md's idempotency convention line, which names the payee where the key names the sender, is corrected to the key the code enforces and ADR 0031's resend rule. C2 to C5 are change-order proposals, not approved by this document.
- The approval itself comes from the founder after this PR is built. Leave the approval line in the document in its awaiting form; the test that requires approval must fail until a valid approval line is written, and that is expected for this PR until the founder signs. Do not write any name into it.

Where the draft lives: the reviewed generator and its data are on the branch origin/salvage/co-001-drafts (git -C ${WT} fetch -q origin salvage/co-001-drafts). Ignore its domain-model/brand and domain-model/repo entries (they are gitlinks to scratch clones). Use: domain-model/generate-domain-model.mjs (the generator: introspects a live migrated database, reads the migrations, the Drizzle schema and docs/product/data-dictionary.md, places each table in an area from areas.json, explains each divergence from divergence-explanations.json, writes the document; flags --out, --check, --strict, --require-approval, --append; the approval line carries the SHA-256 of the compared text; commit and branch are a provenance line that --check ignores), domain-model/check-drizzle-and-catalog.mts (the cross-check section: Drizzle against the live schema, catalogProblems()), domain-model/introspect-schema.mjs, domain-model/compare-dictionary.mjs, domain-model/areas.json, domain-model/divergence-explanations.json and domain-model/regenerate.sh (how they are run together), plus the draft domain-model.md. Extract them to a scratch directory (git archive or git show), never into the worktree as-is.

Hard rules: no migration is added or edited and no schema changes in this PR; nothing under packages/pricing/src, packages/ledger/src (non-test), content/, tools/verify-content, the content hooks or publish-content.yml changes; packages/db/src/catalog.ts rules unchanged; no real PHI anywhere; the generator only reads the database.

Environment for parity with CI (Postgres 18, Node 24, Python 3.12): Postgres 18.4 runs at port 5433 (socket /tmp, superuser postgres password test: postgres://postgres:test@localhost:5433/postgres); Node 24 is at /opt/node24/bin (put it first on PATH: export PATH=/opt/node24/bin:$PATH, then check node --version); Python 3.12 with pyx12 is /opt/py312-ci/bin. Use databases named tp_pr2_<role>_<n> and, for e2e, E2E_DATABASE=tp_pr2_e2e_<role> with E2E_PORT 3401 (build), 3411 (fix) or 3421 (verify). The older Postgres 16 at port 5432 is used by other agents; do not stop either server.

Working rules: commit at checkpoints in the repository's style (git log), each message ending with these two lines:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR
After each commit push: git -C ${WT} push -q -u origin ${BR} (retry 4 times with 2, 4, 8, 16 s backoff on network errors). Stage only paths you changed; never git add -A, stash, reset --hard, clean or checkout others' files.
`

const CHECKS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    head: { type: 'string' },
    checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed', 'note'] } },
    open_items: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'head', 'checks', 'open_items'],
}
const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, file: { type: 'string' }, issue: { type: 'string' }, reference: { type: 'string' }, fix: { type: 'string' } }, required: ['severity', 'file', 'issue', 'reference', 'fix'] } },
    checked: { type: 'array', items: { type: 'string' } },
  },
  required: ['findings', 'checked'],
}

phase('Build')
const build = await agent(`${COMMON}
Your role: build.
An earlier attempt at this role was cut off by a container restart. Its uncommitted work is still in ${WT} (and backed up on origin/salvage/pr2-in-progress at 2e6f348): changes to CLAUDE.md, package.json and packages/db/package.json, and new docs/product/domain-model.md, packages/db/domain-model/, packages/db/src/cli/domain-model.ts and packages/db/src/domain-model/. Read all of it, keep what is right, finish it, and commit and push as soon as each coherent piece works, so a further restart loses little. Databases named tp_pr2_* from that attempt may exist on port 5433; drop and recreate them as needed.
1. Create the worktree: git -C /home/user/PhysicalTherapy fetch -q origin claude/build-platform, then git -C /home/user/PhysicalTherapy worktree add ${WT} -b ${BR} origin/claude/build-platform (head 0c0fb77). If ${WT} exists from an earlier attempt, keep its commits and continue. Run pnpm install --frozen-lockfile.
2. Port the generator into packages/db as a maintained tool, in TypeScript in the repository's style (strict types, lint clean), for example packages/db/src/domain-model/ with the generator, the introspection, the dictionary comparison and the Drizzle and catalog cross-check, and packages/db/domain-model/areas.json and divergence-explanations.json as data. Keep its behaviour and output format exactly as reviewed unless the port forces a change (then explain it). Expose it as pnpm db:domain-model in packages/db and at the root, with: --out <file> to write, --check <file> to compare, --strict (every divergence explained, no stale explanation, every table placed in an area), --require-approval (the approval line must carry a name, a YYYY-MM-DD date and the SHA-256 of the compared text, so an approval never carries over to changed text; --out keeps an existing valid approval when the regenerated text is identical). The database comes from DATABASE_URL or --database-url; the command migrates nothing itself. Provenance (commit, branch) is printed but ignored by --check, so a pull request that changes no schema passes whatever its commit.
3. Regenerate docs/product/domain-model.md from a freshly migrated database (Postgres 18 at port 5433, pnpm db:migrate on a new database), run --check against a second fresh database to prove it is deterministic, and run --strict. The awaiting approval line stays. Every count in the document's header must match the live schema (tables, the view, registry rows, forced RLS, policies, functions, SECURITY DEFINER functions, triggers, Drizzle tables).
4. Add a db-project test (vitest project db, a *.db.test.ts file beside the tool) that creates and migrates its own scratch database (the way other db tests that need a fresh database do it, e.g. packages/db/src/migrate.test.ts; drop it afterwards), regenerates the document in memory and fails on any difference from the committed docs/product/domain-model.md other than the approval and provenance lines, with --strict semantics. Add a separate test case that requires a valid approval (name, date, hash of the current text); it fails today, by design, until the founder signs. Add unit tests for the approval-line parsing and hashing (blank, bad date, stale hash, edited text all fail; a valid line passes) and for the provenance being ignored.
5. Prove the gate: in a scratch copy, add a dummy migration that creates a table; the drift test must fail (and the generator must exit non-zero when a table has no area). Remove it.
6. CLAUDE.md: the two D1 sentences, and the idempotency convention line corrected per D2 (read ADR 0031 and packages/edi835 / the remittance unique key to state it exactly). Nothing else.
7. README: a short section on the domain model gate (what the document is, how to regenerate it, that a schema change needs the founder's approval line).
8. Run typecheck, lint, lint:logs, test, and test:db on Postgres 18 (expect only the approval case to fail; say so). Commit and push.
Return what you built, the counts in the document header, the checks, and anything open.`, { label: 'port generator, regenerate, tests, CLAUDE.md', phase: 'Build', schema: CHECKS_SCHEMA })
if (!build) throw new Error('build failed')

phase('Review')
const REVIEW = `${COMMON}
You are a reviewer. Do not edit, commit or push in ${WT}; experiment only in a scratch clone (git clone ${WT} /tmp/claude-0/pr2-review-<role>) with your own databases. The build agent reported: ${build.summary}
Report only real problems with evidence (command and output, or file and line), the rule or decision broken, and the fix. Severity: blocker (breaks a hard rule or the CO-02 acceptance), major, minor.`
const reviews = await parallel([
  () => agent(`${REVIEW}
Your role: document accuracy. Independently of the generator, query a freshly migrated Postgres 18 database with psql (pg_class, pg_attribute, pg_constraint, pg_index, pg_policy, pg_proc, pg_trigger, phi_table_registry) and compare with docs/product/domain-model.md: every public table and view appears exactly once; for 20 tables chosen across all areas, check columns with types and nullability, primary and unique keys, foreign keys, the PHI flag, RLS enabled and forced, each policy's command and expression, and the invariants listed (CHECKs and triggers). Check the header counts. Then check the divergence sections against docs/product/data-dictionary.md for 12 tables (including remittance, rule_record, case, packet_version, ledger_entry, grant): each divergence listed is real, none is missing, and each cites the right ADR. Check that the approval paragraph covers sections A, B and C1 only (C2 to C5 are proposals).`, { label: 'review: document accuracy', phase: 'Review', schema: FINDINGS_SCHEMA }),
  () => agent(`${REVIEW}
Your role: the gate's robustness. In your scratch clone prove or disprove each: the drift test fails when a migration adds a table, a column, a policy, a CHECK, or changes a function body, without regenerating the document; it passes when only an unrelated file changes or on a different commit or branch name (including an empty branch name, as on a pull_request checkout); the output is deterministic across two fresh databases and across runs (ordering, whitespace, locale); the approval case fails on a blank line, a bad date, a hash from an earlier text, and an edited document, and passes on a valid line; --out keeps a valid approval only when the text is identical; the test cleans up its database even on failure; the test's added time in CI is reasonable (measure it). Also check the test cannot be satisfied by editing the expected document by hand without regenerating (it compares with live introspection, not with itself).`, { label: 'review: gate robustness', phase: 'Review', schema: FINDINGS_SCHEMA }),
  () => agent(`${REVIEW}
Your role: guardrails and CLAUDE.md. Check: git diff --stat origin/claude/build-platform...${BR} touches no migration, nothing under packages/pricing/src, packages/ledger/src, content/, tools/verify-content, .claude/hooks, publish-content.yml; packages/db/src/catalog.ts rules unchanged; the generator issues only reads (grep for INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, SET outside comments; read every query) and connects only to the given database; the document holds no PHI or real data (only schema); CLAUDE.md changed only by the two D1 sentences and the corrected idempotency line, and the corrected line states exactly the key the schema enforces (check the remittance unique constraint and ADR 0031); README section accurate; lint, typecheck and lint:logs pass; the new code follows the repository's conventions (no console.log of data, typed errors).`, { label: 'review: guardrails and CLAUDE.md', phase: 'Review', schema: FINDINGS_SCHEMA, agentType: 'security-reviewer' }),
])
const findings = reviews.filter(Boolean).flatMap((r, i) => r.findings.map((f) => ({ ...f, reviewer: ['accuracy', 'robustness', 'guardrails'][i] })))
log(`${findings.length} findings`)

phase('Fix')
const fix = await agent(`${COMMON}
Your role: fix. Reviewers reported on ${BR}:
${JSON.stringify(findings, null, 1)}
Verify each against the code and the decisions first; fix the real ones minimally with tests; reject the others with evidence. If the document text changes, regenerate it with the tool (never by hand) and re-run --check on a second fresh database. Run typecheck, lint, test and test:db (Postgres 18). Commit and push.
Return in summary a line per finding: fixed (commit) or rejected (reason).`, { label: 'fix review findings', phase: 'Fix', schema: CHECKS_SCHEMA })

phase('Verify')
const verify = await agent(`${COMMON}
Your role: verify. Do not edit the worktree. git clone --branch ${BR} ${WT} /tmp/claude-0/pr2-verify (remove it first only if you created it earlier). With Node 24 and Python 3.12 first on PATH and Postgres 18 at port 5433, run in the clone and record each: pnpm install --frozen-lockfile; typecheck; lint; lint:logs; verify-content; tools/check-releases-immutable.sh origin/claude/build-platform (fetch the ref from ${WT}'s origin); synth --all then git status --short clean; test; test:golden; test:oracle; a fresh database, db:migrate, test:db (expect exactly the approval case to fail until the founder signs; any other failure is a real failure); test:e2e; build; cdk:diff. Then, in a second scratch copy, write a valid approval line with a placeholder name "VERIFY ONLY" and today's date and the hash the tool reports, and show the approval case passes; then change one character of the document and show it fails. Do not commit that.
Return every check with its result and the head verified, and the exact command the founder's approval needs (how the hash is obtained).`, { label: 'fresh-clone verification', phase: 'Verify', schema: CHECKS_SCHEMA })

return { build, findings, fix, verify }
