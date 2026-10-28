export const meta = {
  name: 'base-into-ss01-sc1b-deferred',
  description: 'Merge the latest claude/build-platform (with #81, SUITE-CAP-1a) into SS-01, SS-01 into SUITE-CAP-1b, then build 1b\'s deferred parts (measurement gate, CAS-42.1/.2, ADR 0083\'s 1b section) and run 1b\'s full local suite (no PR)',
  phases: [
    { title: 'Merge base into SS-01', detail: 'merge commit; #79 ScrollTable kept with SS-01\'s card; generated files regenerated; checks; push' },
    { title: 'Merge SS-01 into 1b', detail: 'merge commit; 1a\'s shared docs kept with 1b\'s; regenerated; push' },
    { title: 'Measure and build', detail: 'slice 1 measurement gate; CAS-42.1/.2; ADR 0083 1b section; the real-size runs\' route' },
    { title: 'Integrate', detail: 'adversarial read, the full local suite once, push' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/2d6572d6-2076-5676-9f8f-7a15571707e4/scratchpad'
const SS = '/home/user/ss01', SSBR = 'co-001/ss-01-suspension-refusal'
const WT = '/home/user/sc1b', BR = 'co-001/suite-cap-1-triage-locks'
const DESIGN = '/home/user/ops/designs/suite-cap-1-triage-locks.md'
const REREAD = '/home/user/ops/approval-summaries/lane-a-suitecap1b-reread.json'
const PRIOR = '/home/user/ops/approval-summaries/lane-a-ss01-merge42-sc1b-build-result.json'
const ATTR = `End every commit message with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019i9ifCi6u3MV8sy7oAhUmy`
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const GRANT = `"Granted: the ledger freeze exceptions in designs/ledger-interest-once.md section 10.1 and designs/suite-cap-1-triage-locks.md section 4.5, as written." (the founder, Tyler Williams, relayed by the co-founder, 2026-10-27 20:49 UTC)`

const COMMON = `Repository PureTideWater/PhysicalTherapy (PaidWhole). Read /home/user/PhysicalTherapy, /home/user/pr6b4, /home/user/interest or /home/user/ops but never write there (another workflow is building in /home/user/interest right now: leave it alone).
Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH in every command. PostgreSQL 18 on 5433 (postgres:test, socket /tmp). If PostgreSQL stops, start it: su postgres -c "/opt/pg18/bin/pg_ctl -D /root/pgdata18 -o '-p 5433 -k /tmp' -l /tmp/pg18.log start". Heavy commands one at a time under: flock /tmp/laneb-heavy.lock <command> (another workflow shares the lock). Long commands: run_in_background and wait for the notification; never end your turn while a background command you need is still running. Databases tp_b1b_<role>_<n>, dropped when done. E2e ports 4971-4979 only.
The founder's standing permission (HANDOFF.md 2026-10-22 ~16:40 UTC): the protected-edit marker <worktree>/.claude/.allow-protected-edit for the open schema PR's own new, unmerged migration, through .claude/skills/new-migration/SKILL.md's route (created by a shell command for the write, removed in a trap; never committed; never for an applied migration). If refused, stop and report.
Rules: CLAUDE.md in full. Never write the domain-model approval line or approvers.json; never approve or request changes on a PR; open no PR. Merges are merge commits (never rebase or force). Generated files (pnpm-lock.yaml, tools/screening-capacity/watched-paths.txt, packages/db/functions/*.sql, docs/product/domain-model.md, fixtures/synthetic written by pnpm synth) are never hand-merged or hand-edited: take either side to clear the conflict marker, then regenerate (pnpm install; pnpm -s exec tsx tools/screening-capacity/watched.ts --write; pnpm db:domain-model --out --strict on a freshly migrated database; pnpm synth --all). Shared documents (test-matrix, reconciliation-001, ADRs, the synth registry and matrix, runbooks) keep both sides' changes (LANES.md rule 6). Push with 'git push -u origin <branch>', retrying after 2, 4, 8 and 16 s on a network error; if rejected, pull --no-rebase and push again. Never force (WIP branches included), never --no-verify, never a .gitleaksignore entry. House-style commit messages. No model name or identifier anywhere. ${ATTR}
Never skip, disable or loosen a test. Improve as you go: inside your files and of the same kind, do it and report; else an open item. Report briefly: every check with its command and result, every conflict and how it was resolved, every open item.`

const CHECKS = { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } }
const MERGE = { type: 'object', properties: { head: { type: 'string' }, merged: { type: 'string' }, domain_model_sha256: { type: 'string' }, approval_line_number: { type: 'number' }, conflicts: { type: 'array', items: { type: 'string' } }, checks: CHECKS, open_items: { type: 'array', items: { type: 'string' } } }, required: ['head', 'merged', 'checks', 'open_items'] }

phase('Merge base into SS-01')
const m1 = await agent(`${COMMON}

You are the base merger for SS-01 (a Lane A schema PR; ${SSBR}, worktree ${SS}, head f5bd6201 = #42's 6f23c42b merged into SS-01; design /home/user/ops/designs/ss-01-suspension.md; its own migration 20261108090000_suspension_refusal.sql). Merge the latest origin/claude/build-platform into it (git fetch origin claude/build-platform; it holds #74 165c599 forms keep input, #79 a6e754f every table in ScrollTable and phone stacked rows, #80 0dd1ba7 redaction, #81 56ed6279 SUITE-CAP-1a bounded reads, and anything later; say its sha). Lane A's orchestrator's notes: #79 merged before SS-01, so SS-01 (merged second) keeps both: #79's ScrollTable and stacked rows, and SS-01's Suspension card content and history table; apps/web/src/app/tables.test.ts exempts bare tables by exact count: wrap any table SS-01 adds or moves in ScrollTable (preferred) rather than editing the count. #74's forms keep input: SS-01's console reason form and any form it adds keep a refused submission's input the way #74 made the others do. #42 (still open) will merge claude/build-platform itself; do not touch #42's branch.
1. git merge --no-ff origin/claude/build-platform in ${SS} ("Merge claude/build-platform (<sha>) into SS-01: ..."); resolve keeping both sides; regenerate every generated file on the merged tree.
2. Read SS-01's diff against the merged base for #79's and #74's patterns (every SS-01 table in ScrollTable with phone stacked rows; every SS-01 form keeping input) and make it so in SS-01's files, with tests (failing first where a test can show it).
3. Checks: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm test (unit); pnpm test:db in 4 shards one after another on fresh databases; build, stamp and e2e with E2E_PREBUILT=1 --workers=2 on ports 4971-4979 (the whole e2e suite: #79 and #74 changed many screens); pnpm verify-content; pnpm synth --all and the fixtures check; pnpm -s db:domain-model --check (SHA-256, approval line). Totals from the runs.
4. Commit, push ${SSBR}. ${SAVE('b1b-merge-ss01.md', 'steps, conflicts, checks with totals')}`, { label: 'merge base into SS-01', phase: 'Merge base into SS-01', schema: MERGE })
if (!m1) return { error: 'SS-01 base merge returned nothing' }

phase('Merge SS-01 into 1b')
const m2 = await agent(`${COMMON}

You are the merger for SUITE-CAP-1b (a Lane A schema PR; ${BR}, worktree ${WT}, head 358dc53f, stacked on SS-01's f5bd6201; design ${DESIGN} part 1b; its migration 20261109090000_line_status_heads.sql; the re-read ${REREAD}; the prior build's result ${PRIOR}). SS-01 now carries the latest claude/build-platform, SUITE-CAP-1a (#81, 56ed6279) included, at ${m1.head}. Merge it in:
1. git fetch origin ${SSBR}; git merge --no-ff ${m1.head} in ${WT} ("Merge SS-01 (${m1.head}, with claude/build-platform and SUITE-CAP-1a) into SUITE-CAP-1b: ..."). Shared files 1a and 1b both touch: docs/adr/0083-*.md (1a wrote it; keep it whole, 1b's section comes in the next stage), docs/product/test-matrix.md (CAS-41 between CAS-39 and CAS-40, then CAS-40 and CAS-42), packages/synth/src/cases/{matrix,registry}.ts (the same), watched-paths (regenerated). Resolve keeping both; regenerate every generated file on the merged tree (the domain model on a database freshly migrated from empty at the merged tree).
2. Check that 1b's code and 1a's code meet: 1a's readers (judgedCandidates, the streamed gatherReport, advanceStages' LATERAL lookup) on 1b's line_status_head and claim_by_superseded; nothing of 1b's re-implements what 1a now has.
3. Checks: pnpm typecheck; pnpm lint; pnpm test (unit); pnpm test:db in 4 shards on fresh databases; pnpm -s db:domain-model --check (SHA-256, approval line). Commit, push ${BR}. ${SAVE('b1b-merge-sc1b.md', 'steps, conflicts, checks')}`, { label: 'merge SS-01 into 1b', phase: 'Merge SS-01 into 1b', schema: MERGE })
if (!m2) return { error: '1b merge returned nothing', m1 }

phase('Measure and build')
const CTX1B = `This is SUITE-CAP-1b (${BR}, worktree ${WT}, now at ${m2.head}, holding SUITE-CAP-1a's merged code); design ${DESIGN} part 1b with the re-read's deltas (${REREAD}); the prior build's result and deferred list (${PRIOR}, the last element's open_items). The founder granted 4.5 (Q1): ${GRANT}. Notes from #81 (1a): about 650 s of the 100,000-line audit report is claimLines without D15 (claim_by_superseded, which 1b carries); CAS-41.2's sizes are 10,000 and 20,000 as built, not 2,000 and 10,000 (correct the design file only where 1b's own text cites them: the design is on claude/build-ops, which you do not write: report it instead); on the default lock table both triage and the report fail 53200 until 1b. Reconcile at real size is SUITE-CAP-3 (another session): leave it out.`
const [gate, route] = await parallel([
  () => agent(`${COMMON}

${CTX1B}
You are builder G: slice 1 (the measurement gate, section 8.2) and slice 5's CAS-42.1 and CAS-42.2 (section 7, section 8.4's budgets). You own: apps/worker/src/triage/triage.large.db.test.ts (new; and together.large.db.test.ts if the shard's time demands the split); vitest.config.ts (SLOW_FIRST: triage.large and reconcile.large beside the existing entries); tools/test/db-shards.test.ts (the SLOW_FIRST count it pins); packages/synth/src/cases/registry.ts and fixtures/synthetic/CAS-42/expected.json (regenerated) only to add the new tests to CAS-42's assertedBy; docs/adr/0083-*.md (1b's section: its status line and the lock section as built, the line_status_head SELECT grant to tp_app and why (the tenancy suites read every tenant table as tp_app; RLS forced; no write grant), CAS-42.3 at 2,000 lines by default and why, the heap line covering every job kind and its rounding, the measurement gate's peaks, the Q1 grant word for word with who and when; keep 1a's part whole).
1. The measurement gate first: CAS-42.1 and .2 written, then run on 1a's merge with section 4.2 and 4.3's SQL applied as a scratch script (git stash or a scratch worktree at the merge's first-parent tree under ${SP}/b1b-gate, removed after) and on the head, with Chromium (/opt/pw-browsers), recording the live-heap peaks (base without 1b: the expected 53200 or heap failure; head: within budget).
2. CAS-42.1 (each job alone at 100,000 lines under a 420 MiB heap in a child process; at most 1 advisory lock; the budgets) and CAS-42.2 (the large report and another practice's triage together under 560 MiB); seen failing on the base, passing on the head. Record times and peaks.
3. ADR 0083's 1b section with the measured peaks.
Checks: pnpm typecheck; pnpm lint; the large tests alone (under the lock); tools/test unit; packages/synth fixtures test. Commit, push. ${SAVE('b1b-gate.md', 'steps, peaks and times, open items')}`, { label: 'build: measurement gate, CAS-42.1/.2, ADR 0083', phase: 'Measure and build', schema: { type: 'object', properties: { head: { type: 'string' }, peaks: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, checks: CHECKS, differences_from_design: { type: 'array', items: { type: 'string' } }, open_items: { type: 'array', items: { type: 'string' } } }, required: ['head', 'peaks', 'checks', 'open_items'] } }),
  () => agent(`${COMMON}

${CTX1B}
You are the real-size runs' scout (read-only: write nothing in any repository; you may read GitHub through the MCP github tools, loaded with ToolSearch). CAS-42.5 and .6 need the release-capacity harness (tools/release-capacity) run at FULL_SIZE on the base's and the head's worker images, with the reconcile phase and the large-jobs-together phase; run.ts stops as RUNNER_TOO_SMALL on this container's 4 CPUs. Find the route: the weekly workflow in .github/workflows that runs it (its runs-on, its triggers: workflow_dispatch on a branch?, its inputs, its timeout), whether the repository has an 8-CPU (or larger) runner label, what a dispatch on ${BR} would cost and need, and the design's section 8.2 "local reproduction". Do NOT dispatch anything. Return the exact route, whether it needs a person (an owner-admin setting or a paid runner is the founder's), and the exact commands or the dispatch inputs. ${SAVE('b1b-route.md', 'what you found')}`, { label: 'scout: real-size runs route', phase: 'Measure and build', schema: { type: 'object', properties: { route: { type: 'string' }, needs_person: { type: 'boolean' }, why: { type: 'string' }, commands: { type: 'string' } }, required: ['route', 'needs_person', 'why'] } }),
])
if (!gate) return { error: 'gate builder returned nothing', m1, m2, route }

phase('Integrate')
const integ = await agent(`${COMMON}

${CTX1B}
You are 1b's integrator. Reports: merge-into-1b ${JSON.stringify(m2).slice(0, 4000)} gate ${JSON.stringify(gate).slice(0, 5000)} route ${JSON.stringify(route).slice(0, 2500)}
1. In ${WT}: git pull --no-rebase origin ${BR}; clean; no marker anywhere; regenerate watched-paths, synth, the domain model; whole-repo pnpm typecheck, pnpm lint, pnpm lint:copy, pnpm lint:logs.
2. Adversarial read of the whole 1b diff against SS-01's ${m1.head}: concurrency (stage writers interleaving; any per-line lock left in line_status_rules or the two ledger triggers; the deploy's lock loop queueing nobody), the ledger freeze (4.5 changes only each function's lock line; packages/ledger untouched), security (line_status_head's RLS, policy, registry, grants), reliability (the heap line never throws; the alarm), and the large tests' budgets against CI's shard limit. Fix with failing-first tests; report each.
3. The full local suite once (lanes/lane-b.md "How Lane B runs"): unit and property; golden; oracle and the ledger oracle; test:db in 4 shards one after another on fresh databases (record each shard's time: the large tests must fit CI's 20-minute shard); build, stamp, e2e with E2E_PREBUILT=1 --workers=2 on 4971-4979; the Stryker shards the change affects per stryker/shards.json, then the gate; pnpm verify-content; synth and fixtures; infra tests; the engine-freeze check against ${m1.head}; pnpm -s db:domain-model --check (SHA-256, approval line). Totals from the runs.
4. Scope: git diff --name-only ${m1.head}...HEAD lists only 1b's files and generated files; one new migration; nothing frozen beyond 4.5's two functions.
5. Commit fixes, push once. No PR. Return head, SHA-256, approval line, the suite's parts with totals, scope, fixes, and open items (the real-size runs' route and whether it needs a person). ${SAVE('b1b-integrate.md', 'steps, each suite part with totals, fixes, open items')}`, { label: 'integrate 1b + full local suite', phase: 'Integrate', schema: { type: 'object', properties: {
  head: { type: 'string' }, domain_model_sha256: { type: 'string' }, approval_line_number: { type: 'number' }, scope_ok: { type: 'boolean' },
  suite: CHECKS, fixes: { type: 'array', items: { type: 'string' } }, open_items: { type: 'array', items: { type: 'string' } } },
  required: ['head', 'domain_model_sha256', 'scope_ok', 'suite', 'open_items'] } })
return { m1, m2, gate, route, integ }
