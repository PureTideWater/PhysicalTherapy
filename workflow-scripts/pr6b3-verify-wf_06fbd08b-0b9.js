export const meta = {
  name: 'pr6b3-verify',
  description: 'PR 6b-3 (#39) fresh-clone verification at 19aa09c: clean install, scope, freeze, domain model and its Cross-checks, an adversarial read of everything changed after the reviews, proofs read from CI (capacity with time enforced), CI green but the approval case',
  phases: [{ title: 'Verify', detail: 'one agent, fresh clone, reads CI instead of rerunning it' }],
}

const SP = '/tmp/claude-0/-home-user/e7bf8d14-3b4c-5e38-9cea-a1f92a95083e/scratchpad'
const HEAD = '19aa09c7a67fa7cd2cb93625661b5cee9d2c43c6'
const REVIEWED = '9eb4474eaf4fed2fe41812b316794c318ea020ee'
const MIG = 'packages/db/migrations/20261106090000_screening_consumer.sql'
const RESULT = { type: 'object', properties: {
  verdict: { type: 'string', enum: ['pass', 'fail'] },
  domain_model_sha256: { type: 'string' },
  approval_line_number: { type: 'number', description: 'the 1-based line number of the "Approved by:" line in docs/product/domain-model.md at the head' },
  checks: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, passed: { type: 'boolean' }, evidence: { type: 'string' } }, required: ['what', 'passed', 'evidence'] } },
  findings: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] }, file_line: { type: 'string' }, failure_path: { type: 'string' }, fix: { type: 'string' } }, required: ['title', 'severity', 'file_line', 'failure_path', 'fix'] } },
  summary_for_founder: { type: 'string', description: 'a short plain-language verification summary in markdown' },
  problems: { type: 'array', items: { type: 'string' } },
}, required: ['verdict', 'domain_model_sha256', 'approval_line_number', 'checks', 'findings', 'summary_for_founder', 'problems'] }

phase('Verify')
const v = await agent(`You are the independent fresh-clone verifier of PR 6b-3, draft pull request #39 in PureTideWater/PhysicalTherapy into claude/build-platform (base a33b0fd), branch co-001/pr-06b-screening-consumer, head ${HEAD}. It adds the screening's own consumer (audit #53 parts 3 and 4) and switches on the 60-second time check (decisions 13 to 16): the role tp_screening and its logins, five screening_run columns and the append-only screening_queue_tally, the queue tiers, WORKER_JOBS=screening with three threads, pg-boss heartbeats and listen/notify, a fourth Fargate service, the web's receipt stamped in the proxy, the "sent" states, the launch value computed at synthesis, and the capacity harness with time enforced. The founder's rulings it builds: Q1, Q7, Q8 and Q12 of 2026-10-21 (/home/user/ops/HANDOFF.md, "Founder rulings of 2026-10-21 ~22:30 UTC") and those of 2026-10-22 ("Founder, 2026-10-22 ~23:15 UTC": the web task at 0.5 vCPU / 1 GiB, ScreeningLaunch computed by the CDK app at synthesis with a hand-set value refused, the new wording approved as written with counsel next). One migration, ${MIG}. CI on this head is green except the domain-model approval case, which waits for the founder. You READ CI rather than rerunning the identical suite. Change nothing in any worktree, push nothing, post nothing on GitHub.

Sources: the plan /home/user/ops/designs/pr6b-plan.md lines 163-191, 248-254 and 453-545 (the fresh-clone verification's list; 6b-3's proofs at 501-511); the handoff from "6b-3 built" to the end.

Prove each, with evidence:
1. Clean start: git clone -q https://github.com/PureTideWater/PhysicalTherapy ${SP}/pr6b3-verify, check out ${HEAD} exactly, PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH, pnpm install --frozen-lockfile passes.
2. Scope: git diff --name-only $(git merge-base origin/claude/build-platform ${HEAD}) ${HEAD}: only 6b-3's work (the plan's owned areas and the documented extras in the PR body); exactly one migration, ${MIG}, and no other path under packages/db/migrations; nothing under packages/pricing/src, fixtures/golden, content/releases or tools/verify-content; tools/engine-freeze/exception.json unchanged; no .claude/.allow-protected-edit anywhere in the tree or in any of the PR's commits.
3. The freeze tool: PR_NUMBER=39 pnpm -s exec tsx tools/engine-freeze/check.ts <merge-base> passes with no engine diff and no rule-table DDL.
4. The domain model: on a fresh PostgreSQL 18 database (port 5433, postgres:test, socket /tmp; name it tp_pr6b3_verify_1 and drop it after), pnpm db:migrate then pnpm -s db:domain-model --check regenerates the committed text exactly; read its Cross-checks block (report every difference, expected none); report the SHA-256 the generator prints (expected 6d7a143dd4e5a7145943324afd21a583f9036925978e90d8b9cecf6b4e97f712) and the 1-based line number of the "Approved by:" line (expected 6859); pnpm -s db:domain-model --summary-since origin/claude/build-platform runs.
5. ADVERSARIAL READ of everything changed after the reviews (git diff ${REVIEWED} ${HEAD}, with the code and tests that go with it), probing on your fresh database and in unit tests where a probe can show a defect:
- the migration's changes since ${REVIEWED} (screening_queue_tally: owner, grants, forced RLS and the registry if it can hold anything derived from a prospect, retention by the expiry job; screening_queue_tier()'s sums and the no-lock overshoot; operator_screening_fail()'s stale predicate under the run's lock): SET search_path, REVOKE ALL FROM PUBLIC and exactly each grant, tp_app and tp_screening reaching nothing more than before;
- the proxy's receipt stamp (apps/web/src/proxy.ts and its reader): a client-sent x-tp-received-at is always overwritten, a forged or future value cannot reorder the queue or dodge a share, and nothing about the prospect is logged;
- the worker's listen/notify and wake-on-free (167d8a6): the notification carries only the queue name, no job payload or PHI; a failing thread cannot spin; the waiting tier still never takes every thread; the heartbeat and stale-claim recovery still hold (SCR-19);
- infra/lib/screening-launch.ts and launchCheck(): a passing report opens only for exactly the deployed ECR images, tag and production sizes; a failing, stale, other-image, other-size or hand-set value stops synthesis; an absent report keeps production closed; the rule ScreeningLaunchImageTag; the consumer runs whenever a launch value is set;
- the web at 0.5 vCPU / 1 GiB and the harness measuring that declared size.
Report findings only with a concrete failing path.
6. Proofs from CI's own logs on ${HEAD} (GitHub MCP tools, ToolSearch "select:mcp__github__get_job_logs,mcp__github__pull_request_read"; the check job is 120180565744, capacity 120180616884; logs are long, so search the saved file): unit, golden, oracle, test:db (only the approval case failing, with the SHA it names), e2e, build, cdk synth; capacity's verdict "pass (time enforced)" with the consumer's settings (1 task, 2 vCPU, 4,096 MiB, 3 at once), every upload's seconds, the worst under 44 s, and both image IDs if the report or the job's summary carries them (download the run's artifact with gh api if the log does not show them).
7. CI: every check run on ${HEAD} completed successfully except check, which fails only the approval case; #39 is mergeable.
8. The documents: reconciliation-001, ADRs 0014, 0019, 0049 and 0062, PRD 19, the deploy and capacity runbooks and the test matrix record the founder's rulings of 2026-10-21 and 2026-10-22 as made, claim no ruling the founder did not make, and match the code (the costs, the sizes, the launch steps, the wording word for word).
Delete your clone and database afterwards. Return the verdict (pass only if every check passed and no blocking or should_fix finding remains), the SHA-256, the approval line's number, each check with evidence, the findings, a short plain-language summary for the founder, and any problem.`, { label: 'verify: 6b-3 at 19aa09c', phase: 'Verify', schema: RESULT })
if (!v) throw new Error('the verifier returned nothing')
return v