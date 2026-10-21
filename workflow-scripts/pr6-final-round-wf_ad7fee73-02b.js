export const meta = {
  name: 'pr6-final-round',
  description: 'PR 6 final round: merge the new base (PR 5 and #32), campaign allowlist, rulings, large test, two reviews, fix round, fresh-clone verify',
  phases: [
    { title: 'Merge', detail: 'merge claude/build-platform 5df4108 into PR 6, reconcile both migrations' },
    { title: 'Rulings', detail: 'campaign allowlist, ADR 0062 rulings, large test timeout; push' },
    { title: 'Review', detail: 'two adversarial reviews in parallel' },
    { title: 'Fix', detail: 'verify findings, fix, full local suite once, domain model last, push' },
    { title: 'Verify', detail: 'fresh clone: scope, SHA, proofs, approval summary' },
  ],
}

const CTX = `Repository puretidewater/physicaltherapy. Worktree /home/user/pr6, branch co-001/pr-06-free-screening, draft PR #31 into claude/build-platform. Head before this run: 7bcb5fc.
Base claude/build-platform is now 5df4108. It holds PR 5 (merge d152976: migration 20261103090000, the payer's copy, the REPEATABLE READ one-snapshot pages from 7618f1d, the worker's tp_job login) and #32 (merge 5df4108: the images fix, a cherry-pick of PR 6's own 8f6e4d5 with byte-identical Dockerfiles).
PR 6's design is /home/user/ops/designs/pr6-53-57-screening.md (read only the sections you need). Its ADR is docs/adr/0062-*.md; the reconciliation is docs/product/reconciliation-001.md.
Environment: Node 24 at /opt/node24/bin (put it first on PATH). PostgreSQL 18 on port 5433 (CI parity) and 16 on 5432, superuser postgres password test, socket /tmp. Name every scratch database tp_pr6f_<yourrole>_<n> and drop it when you finish. Playwright e2e ports for this run: 4801 to 4809 only (another run uses 49xx).
Rules that bind this run:
- PR 6's own migration 20261104090000 is unmerged and may be edited; create the marker file .claude/.allow-protected-edit in the worktree only while editing it and delete it after. Never edit 20261103090000 or any earlier migration, content/releases/**, fixtures/golden/**, approvers.json or the approval line of docs/product/domain-model.md.
- docs/product/domain-model.md is regenerated (pnpm db:domain-model) only after the last schema edit of your step, from a fresh PG 18 migration.
- Commit with the repo's message style; end every commit message with the two lines:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR
- Push with 'git push origin co-001/pr-06-free-screening' from the worktree (the pre-push hook runs the fixture check and gitleaks; never --no-verify; fix a refused commit instead). If the hook launcher refuses because the checkout lacks .githooks, push from the main checkout: GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin co-001/pr-06-free-screening.
- Never skip, disable or loosen a test to make it pass.
- Report briefly: what you did, the checks with results, and open items.`

const BUILD = { type: 'object', properties: {
  summary: { type: 'string' }, head: { type: 'string' },
  checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } },
  open_items: { type: 'array', items: { type: 'string' } },
}, required: ['summary', 'head', 'checks', 'open_items'] }

const REVIEW = { type: 'object', properties: {
  verdict: { type: 'string' },
  findings: { type: 'array', items: { type: 'object', properties: {
    title: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] },
    file_line: { type: 'string' }, failure_path: { type: 'string' }, fix: { type: 'string' } },
    required: ['title', 'severity', 'file_line', 'failure_path', 'fix'] } },
}, required: ['verdict', 'findings'] }

const VERIFY = { type: 'object', properties: {
  summary: { type: 'string' }, head: { type: 'string' }, domain_model_sha256: { type: 'string' },
  proofs: { type: 'array', items: { type: 'object', properties: { claim: { type: 'string' }, held: { type: 'boolean' }, evidence: { type: 'string' } }, required: ['claim', 'held', 'evidence'] } },
  issues: { type: 'array', items: { type: 'string' } },
  pr_body_path: { type: 'string' },
}, required: ['summary', 'head', 'domain_model_sha256', 'proofs', 'issues', 'pr_body_path'] }

phase('Merge')
const merge = await agent(`${CTX}

Your step: merge the new base into PR 6, with a merge commit (git fetch origin claude/build-platform; git merge --no-ff origin/claude/build-platform). Never rebase or force-push.
1. Resolve every conflict keeping both sides' behaviour. Regenerate lockfiles and generated files with the repo's tooling, never by hand.
2. 8f6e4d5 is now on both sides with identical Dockerfiles. Confirm apps/web/Dockerfile and apps/worker/Dockerfile equal the base's after the merge.
3. The two migrations: list every database object PR 5's 20261103090000 creates, replaces or alters (functions, triggers, CHECK lists such as audit event types and object types, grants and revokes, roles including tp_job and its marker, RLS policies). Then list every object PR 6's 20261104090000 replaces or alters. Wherever PR 6 redefines an object PR 5 also defined or changed, PR 6's definition must keep everything PR 5 added, because PR 6 runs later. Fix PR 6's migration where it does not. A fresh migration from zero on PG 18 must apply cleanly.
4. Shared code both PRs added (one-snapshot read helpers, audit event type unions, Drizzle schema index, migrate list, row factories, catalog and cross-tenant test expectations, the test matrix, reconciliation-001, copy-lint roots): keep one coherent version and leave no duplicate helper.
5. Checks before you commit: pnpm install; pnpm typecheck; pnpm lint; a fresh PG 18 migration; then on it the db tests for catalog, cross-tenant, screening (apps/web/src/lib/screening, the screening worker jobs) and the packets and export db tests PR 5 added. Regenerate the domain model last.
Commit the merge (and any reconciling commit). Do NOT push: the next step pushes with its own commits, so CI runs once.`, { label: 'build: merge base', phase: 'Merge', schema: BUILD })
if (!merge) return { error: 'merge step failed' }

phase('Rulings')
const rulings = await agent(`${CTX}

The previous step merged the base locally (not pushed). Its report:
${JSON.stringify(merge).slice(0, 4000)}

Your step: three changes, then push.

A. The founder's ruling of 2026-10-21: "Requests keep utm_campaign only if it is on the founder's campaign list (source and medium keep the shape checks)." The question asked was whether a campaign code from a landing-page link is kept only when it is on the founder's list, because a shape check cannot catch a person's name typed inside a code.
- The list is the marketing_campaign table (console_register_marketing_campaign). Outcomes already store a listed code or 'other' (migration 20261104090000, the CASE near lines 1054 and 1142).
- Make every row that stores utm_campaign (screening_prospect, screening_lead, prospect_request, and any other you find) keep it only when it is listed in marketing_campaign at the time of writing. Store 'other' when a code was given but is not listed, and null when none was given.
- Enforce this in Postgres so no write path, the app role's direct writes included, can store an unlisted code. Make it work with the existing immutability guards on those tables. The web layer keeps its shape checks for source, medium and campaign.
- Confirm no raw unlisted code reaches a log, job payload, audit event, error message or email. The visitor's own first-touch cookie may still carry it in their browser.
- A code listed later does not change rows already stored as 'other'. Say so in the ADR.
- Tests: db tests for listed, unlisted, absent and a direct app-role write. Update e2e/screening.spec.ts so the journey registers its campaign through the console function or the seed, and also proves an unlisted code is stored as 'other'.

B. Record the founder's rulings of 2026-10-21 on PR 6 in ADR 0062 (an "Owner rulings (2026-10-21)" section in the file's existing style) and in reconciliation-001:
- keep as built: an email-only match deletes the kept summary and carries no request;
- the result page and email say when a summary is kept with an earlier request;
- deletion goes through PR 6e's withdrawal link;
- requests keep utm_campaign only when it is on the founder's list (A above), with source and medium under the shape checks;
- PR 7's campaign reports use a minimum cohort of 11;
- the images fix went to claude/build-platform as its own PR, #32, merged as 5df4108.

C. apps/web/src/lib/screening/result-page.large.db.test.ts times out under load. Find the root cause: measure its setup and assertions, and check how long it took in CI on 7bcb5fc if you can read the run. Fix it properly. Prefer faster setup (for example COPY or set-based inserts) and an explicit, measured timeout with margin for GitHub's 4-core runner, and give the reason in a comment. It must still prove what it proves today: the bounded result page at 20,000-plus groups within the memory limit. Never skip it or weaken what it asserts.

Checks: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; the unit tests of the packages you changed; a fresh PG 18 migration with the screening db tests, catalog and cross-tenant; e2e/screening.spec.ts on port 4801. Regenerate the domain model last, after A's migration edit. Commit, then push the merge and your commits together.`, { label: 'build: rulings', phase: 'Rulings', schema: BUILD })
if (!rulings) return { error: 'rulings step failed', merge }

phase('Review')
const lenses = [
  { key: 'merge-sql-security', text: `Lens: the merge and the database. Diff origin/claude/build-platform...HEAD (PR 6 as a whole), and look hardest at what changed since 7bcb5fc (git diff 7bcb5fc HEAD). Check:
- that PR 6's migration keeps everything PR 5's 20261103090000 added to any object PR 6 redefines (functions, CHECK lists, grants, the tp_job login and its marker, RLS);
- that a fresh migration from zero applies on PG 18;
- forced RLS and the app role on every new or changed table;
- the campaign allowlist trigger or functions under every write path and against the immutability guards;
- that no raw campaign code reaches a log, job payload, audit event, error message or email;
- PHI rules (CLAUDE.md "Never" list), the cross-tenant and catalog tests, race and lock order.
Run what you need on a scratch PG 18 database.` },
  { key: 'rulings-tests-ci', text: `Lens: the rulings, the tests and CI. Check:
- each founder ruling of 2026-10-21 is built as stated and recorded accurately in ADR 0062 and reconciliation-001;
- the campaign allowlist's behaviour end to end (web shape checks, SQL mapping, outcomes, e2e);
- the large result-page test's fix proves what it proved before, is not weakened, and will not time out on GitHub's 4-core runner;
- the merge left no duplicate helper or stale test expectation;
- the domain model matches the schema;
- nothing will turn CI red: copy lint, log lint, the workflows test, actionlint, the screening-capacity workflow, the e2e journeys including the reconciliation journey J10, whose torn read PR 5's 7618f1d fixed.
Run the targeted tests you need.` },
]
const reviews = await parallel(lenses.map(l => () => agent(`You are an independent adversarial reviewer. ${CTX}

The head to review is on origin/co-001/pr-06-free-screening (fetch it; review in a fresh clone under /tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad/pr6-final/review-${l.key}, not in /home/user/pr6, and change nothing there). The builders' reports:
${JSON.stringify({ merge: merge.summary, rulings }).slice(0, 6000)}

${l.text}

Report only findings with a concrete failing path (an input or sequence and the wrong result). Severity: blocking (wrong data, broken security or privacy, CI red), should_fix (a real defect of lower impact), nit. Delete your clone and scratch databases at the end.`, { label: `review: ${l.key}`, phase: 'Review', schema: REVIEW })))
const findings = reviews.filter(Boolean).flatMap((r, i) => r.findings.map(f => ({ ...f, lens: lenses[i].key })))
log(`${findings.length} findings from ${reviews.filter(Boolean).length} reviews`)

phase('Fix')
const fix = await agent(`${CTX}

Fix round on PR 6 at the pushed head. Verify each finding below against the code yourself: a finding is a claim, not an order. Fix every real one, minimally and at its root. For one that is not real, say why in your report.
Findings:
${JSON.stringify(findings, null, 1).slice(0, 30000)}

Then run the full local suite once on the final code: pnpm typecheck, pnpm lint, pnpm lint:copy, pnpm lint:logs, pnpm test, pnpm test:golden, pnpm verify-content, a fresh PG 18 migration with pnpm test:db, and the e2e journeys e2e/screening.spec.ts plus the reconciliation journey (ports 4802 to 4809). Regenerate the domain model last, from a fresh PG 18 migration. Record its SHA-256 and the output of 'pnpm db:domain-model --summary-since origin/claude/build-platform'. Commit and push. List anything the founder must decide as open items.`, { label: 'fix: pr6 final', phase: 'Fix', schema: BUILD })
if (!fix) return { error: 'fix step failed', merge, rulings, findings }

phase('Verify')
const verify = await agent(`${CTX}

Fresh-clone verification of PR 6 at origin/co-001/pr-06-free-screening (the fix round's head ${fix.head}). Clone into /tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad/pr6-final/verify. The full suite already ran in the fix round and GitHub CI runs on this head, so do not rerun the whole suite. Instead prove these:
1. Scope: the diff against origin/claude/build-platform touches no earlier migration, content/releases/**, fixtures/golden/**, approvers.json or the domain model's approval line. The Dockerfiles equal the base's.
2. A fresh migration from zero on PG 18 applies. 'pnpm db:domain-model --check' passes. Report the document's SHA-256.
3. On that database, the campaign allowlist holds for a listed code, an unlisted code (stored as 'other'), no code, and a direct app-role write. Prove it with SQL you run.
4. PR 5's additions survive PR 6's migration: for each object both migrations touch, show PR 5's addition is present in the final catalog.
5. The catalog and cross-tenant db tests and result-page.large.db.test.ts pass, timed.
6. ADR 0062's "Owner rulings (2026-10-21)" and reconciliation-001 match the rulings.
Then update the founder's approval summary /tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad/pr6-approval-summary.md: plain words, what the schema change does, the new SHA-256, and what changed since the last version they saw.
Also write a pull request description for #31 from .github/pull_request_template.md (on origin/main), filled from this PR's real content, to /tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad/pr6-final/pr31-body.md, and return its path. Delete your clone and scratch databases at the end.`, { label: 'verify: pr6 fresh clone', phase: 'Verify', schema: VERIFY })

return { merge, rulings, findings, fix, verify }