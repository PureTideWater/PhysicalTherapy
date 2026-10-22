export const meta = {
  name: 'pr6b2-verify',
  description: 'PR 6b-2 (#36) fresh-clone verification at 98a5e49: clean install, scope, freeze, domain model and its Cross-checks, an adversarial read of the migration changes made after the reviews, proofs read from CI, CI green but the approval case',
  phases: [{ title: 'Verify', detail: 'one agent, fresh clone, reads CI instead of rerunning it' }],
}

const SP = '/tmp/claude-0/-home-user/e7bf8d14-3b4c-5e38-9cea-a1f92a95083e/scratchpad'
const HEAD = '98a5e49150a139b7245697b1a7e415f600f83612'
const MIG = 'packages/db/migrations/20261105090000_pricing_location_and_zip_plus_four.sql'
const RESULT = { type: 'object', properties: {
  verdict: { type: 'string', enum: ['pass', 'fail'] },
  domain_model_sha256: { type: 'string' },
  approval_line_number: { type: 'number', description: 'the 1-based line number of the "Approved by:" line in docs/product/domain-model.md at the head' },
  checks: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, passed: { type: 'boolean' }, evidence: { type: 'string' } }, required: ['what', 'passed', 'evidence'] } },
  findings: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] }, file_line: { type: 'string' }, failure_path: { type: 'string' }, fix: { type: 'string' } }, required: ['title', 'severity', 'file_line', 'failure_path', 'fix'] } },
  problems: { type: 'array', items: { type: 'string' } },
}, required: ['verdict', 'domain_model_sha256', 'approval_line_number', 'checks', 'findings', 'problems'] }

phase('Verify')
const v = await agent(`You are the independent fresh-clone verifier of PR 6b-2, draft pull request #36 in PureTideWater/PhysicalTherapy into claude/build-platform (base 510a26d), branch co-001/pr-06b-pricing-location, head ${HEAD}. It adds the practice's pricing location (practice_site), pricing settings at onboarding, months that wait for the location, the place-of-service split pinned on each run, ZIP+4 in the screening and the screening's content span, under the founder's rulings Q2, Q3 (a), Q5 (a), Q6 (a), Q11 (a) and Q12 of 2026-10-21 (/home/user/ops/HANDOFF.md, "Founder rulings of 2026-10-21 ~22:30 UTC") and the founder's acceptance of PR 5's trigger on 2026-10-22. One migration, ${MIG}. CI on this head is green except the domain-model approval case, which waits for the founder. You READ CI rather than rerunning the identical suite. Change nothing in any worktree, push nothing, post nothing on GitHub.

Sources: the plan /home/user/ops/designs/pr6b-plan.md lines 126-162, 241-247 and 453-545 (the fresh-clone verification's list); the handoff from "#36 review round done" to the end.

Prove each, with evidence:
1. Clean start: git clone -q https://github.com/PureTideWater/PhysicalTherapy ${SP}/pr6b2-verify, check out ${HEAD} exactly, PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH, pnpm install --frozen-lockfile passes.
2. Scope: git diff --name-only $(git merge-base origin/claude/build-platform ${HEAD}) ${HEAD}: only 6b-2's work (the plan's owned files and the documented extras); exactly one migration, ${MIG}, and no other path under packages/db/migrations; nothing under packages/pricing; no existing golden file or release changed; no .claude/.allow-protected-edit anywhere in the tree or history of the PR (git log --all -- '**/.allow-protected-edit' on the PR's commits).
3. The freeze tool: PR_NUMBER=36 pnpm -s exec tsx tools/engine-freeze/check.ts <merge-base> passes, letting through only the migration's rule_record CHECK statement and rule-tables.catalog.json; it fails under PR_NUMBER=35.
4. The domain model: on a fresh PostgreSQL 18 database (port 5433, postgres:test, socket /tmp; name it tp_pr6b2_verify_1 and drop it after), pnpm db:migrate then pnpm -s db:domain-model --check regenerates the committed text exactly; read its Cross-checks block (report every difference it lists, expected none); report the SHA-256 the generator prints (expected 495398f72551e4c4f8ad2c3a01ba8702427f2ebdd790e8b7db7cb2aef2c7b37e) and the 1-based line number of the "Approved by:" line in docs/product/domain-model.md at the head (for the suggested change the build will post); pnpm -s db:domain-model --summary-since origin/claude/build-platform runs.
5. ADVERSARIAL READ of the migration changes made after the reviews (git diff c7f6f263249d4f468295ce5717307d9a635cf0a4 ${HEAD} -- ${MIG}, and the code and tests that go with them): practice_confirm_location(), the guards in practice_set_location() and console_set_practice_settings(), practice_site_rules() and the confirmation columns, the recreated console_practice_settings(), pricing_run_split()'s approved_at, screening_result_summary()'s ZIP+4 and submit_screening()'s not-loaded refusal. For each: SET search_path, REVOKE ALL FROM PUBLIC and exactly its grant, no read or write of another practice's rows, and no way for a role without pricing_settings.set to confirm or set a location. Probe as tp_app on your fresh database where a probe can show a defect. Report findings only with a concrete failing path.
6. Proofs from CI's own logs on ${HEAD} (GitHub MCP tool mcp__github__get_job_logs, ToolSearch "select:mcp__github__get_job_logs,mcp__github__pull_request_read"; the check job id is 119818587977; find capacity's and mutation's job ids with pull_request_read get_check_runs for #36): unit, golden, oracle, test:db (only the approval case failing, with the SHA it names), e2e, the Engine freeze step's summary, and capacity's verdict (the split-ZIP upload S1-2 against the whole-release oracle).
7. CI: every check run on ${HEAD} completed successfully except check, which fails only the approval case; #36 is mergeable.
8. The documents: reconciliation-001 records Q2, Q3 (a), Q5 (a), Q6 (a), Q11 (a) and Q12 of 2026-10-21 and the founder's acceptance of PR 5's trigger of 2026-10-22, and claims no ruling the founder did not make; ADR 0064's and ADR 0062's amendments match the code.
Delete your clone and database afterwards. Return the verdict (pass only if every check passed and no blocking or should_fix finding remains), the SHA-256, the approval line's number, each check with evidence, the findings and any problem.`, { label: 'verify: 6b-2 at 98a5e49', phase: 'Verify', schema: RESULT })
if (!v) throw new Error('the verifier returned nothing')
return v
