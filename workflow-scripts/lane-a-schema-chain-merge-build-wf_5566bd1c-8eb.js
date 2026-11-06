export const meta = {
  name: 'schema-chain-merge-build',
  description: 'Acting Lane A: base 83d71fd6 into SS-01 (whole check list), SS-01 into 1b, then in parallel 1b deferred parts + full suite and the interest chain (1b merged in, slice 4 screens, full suite); adversarial verification at each step; no PR',
  phases: [
    { title: 'Base into SS-01', detail: 'merge 83d71fd6; regenerate; verify #79/#74 patterns; whole check list; push' },
    { title: 'Verify SS-01', detail: 'adversarial read-only check of the merge' },
    { title: 'SS-01 into 1b', detail: 'merge; shared docs keep both; regenerate; db tests; push' },
    { title: 'Verify 1b merge', detail: 'adversarial read-only check' },
    { title: '1b deferred', detail: 'measurement gate, CAS-42.1/.2, SLOW_FIRST, ADR 0083 1b section; route scout' },
    { title: '1b integrate', detail: 'adversarial read, full local suite less CAS-42.5/.6, push' },
    { title: 'Interest merge', detail: '1b head into interest; regenerate; checks; push' },
    { title: 'Interest screens', detail: 'builder W, slice 4' },
    { title: 'Interest integrate', detail: 'seam read vs 10.1 and 16, full local suite, push' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/6af08ef9-734c-5d6d-a787-51ade7156d78/scratchpad'
const SS = '/home/user/ss01', SSBR = 'co-001/ss-01-suspension-refusal', SSHEAD = 'f897a282c50ca6c91a325800dca69850257d3af8'
const WT = '/home/user/sc1b', BR = 'co-001/suite-cap-1-triage-locks', BHEAD = '358dc53f5340092daf57226a0769486218bd5418'
const IWT = '/home/user/interest', IBR = 'co-001/ledger-interest-once', IHEAD = 'e064674676fbbedb9688fecbf833bfe4bcf820bf'
const BASE = '83d71fd62c6d419be61fd7aaa5b9033ef5c18b56'
const DESIGN = '/home/user/ops/designs/suite-cap-1-triage-locks.md'
const IDESIGN = '/home/user/ops/designs/ledger-interest-once.md'
const REREAD = '/home/user/ops/approval-summaries/lane-a-suitecap1b-reread.json'
const PRIOR = '/home/user/ops/approval-summaries/lane-a-ss01-merge42-sc1b-build-result.json'
const ATTR = `End every commit message with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FcouKQthXdmDnPmwhFepxW`
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const GRANT = `"Granted: the ledger freeze exceptions in designs/ledger-interest-once.md section 10.1 and designs/suite-cap-1-triage-locks.md section 4.5, as written." (the founder, Tyler Williams, relayed by the co-founder, 2026-10-27 20:49 UTC; approval-summaries/founder-asks-2026-10-27.md line 3)`

const COMMON = `Repository PureTideWater/PhysicalTherapy (PaidWhole). You work as acting Lane A on the schema chain (SS-01 -> SUITE-CAP-1b -> the interest fix), three stacked schema branches; no PR is opened now (they open one at a time after #42 merges). Read /home/user/PhysicalTherapy and /home/user/ops but never write there. Write only in the worktree your role names.
Environment: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH in every command. PostgreSQL 18 on 5433 (postgres:test, socket /tmp). If PostgreSQL stops, start it: su postgres -c "/opt/pg18/bin/pg_ctl -D /root/pgdata18 -o '-p 5433 -k /tmp' -l /tmp/pg18.log start". Heavy commands (installs, test:db, build, e2e, Stryker, the large tests, synth --all) one at a time under: flock /tmp/laneb-heavy.lock <command> (other agents share the lock). Long commands: run_in_background and wait for the notification; never end your turn while a background command you need is still running. Databases tp_<role>_<n> named for your role, dropped when done. Logs under ${SP}/logs/.
The founder's standing permission (HANDOFF.md 2026-10-22 ~16:40 UTC): the protected-edit marker <worktree>/.claude/.allow-protected-edit, only for the chain's own unmerged migrations (20261108090000 SS-01, 20261109090000 1b, 20261110090000 interest), through .claude/skills/new-migration/SKILL.md's route (created by a shell command just for the write, removed in a trap; never staged or committed; never for an applied or merged migration). Remove any leftover marker first. If any check refuses it, stop and report; never route around a refusal or bypass any hook.
Rules: CLAUDE.md in full. Never write the domain-model approval line or packages/db/domain-model/approvers.json; never approve or request changes on a PR; open no PR. Merges are merge commits (never rebase, never force). Generated files (pnpm-lock.yaml, tools/screening-capacity/watched-paths.txt, packages/db/functions/*.sql, docs/product/domain-model.md, fixtures written by pnpm synth) are never hand-merged or hand-edited: take either side to clear the marker, then regenerate (pnpm install; pnpm -s exec tsx tools/screening-capacity/watched.ts --write; pnpm db:domain-model --out --strict on a database freshly migrated from empty; pnpm synth --all), and commit every file the tool writes or removes. Shared documents (test-matrix, ci.md, reconciliation-001, ADRs, the synth registry and matrix, runbooks, synthetic-personas.ts) keep both sides (LANES.md rule 6). Never change apps/web/src/app/tables.test.ts's exemption counts: wrap any new or moved bare table in ScrollTable instead. The ledger freeze stands except ${GRANT}; stay inside that text. Push with 'git push -u origin <branch>' (never --no-verify; the pre-push hook runs the fixture check and gitleaks), retrying after 2, 4, 8 and 16 s on a network error; if rejected, pull --no-rebase and push again. Never force (WIP refs included), never a .gitleaksignore entry. House-style commit messages. No model name or identifier anywhere. Synthetic data only. ${ATTR}
Never skip, disable or loosen a test. Improve as you go: inside your files and of the same kind, do it and report; else an open item. Report briefly: every check with its command and result (totals from the runs), every conflict and how it was resolved, every open item.`

const CHECKS = { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } }
const MERGE = { type: 'object', properties: { head: { type: 'string' }, merged: { type: 'string' }, domain_model_sha256: { type: 'string' }, approval_line_number: { type: 'number' }, conflicts: { type: 'array', items: { type: 'string' } }, checks: CHECKS, all_passed: { type: 'boolean' }, pushed: { type: 'boolean' }, open_items: { type: 'array', items: { type: 'string' } } }, required: ['head', 'merged', 'checks', 'all_passed', 'pushed', 'open_items'] }
const VERDICT = { type: 'object', properties: { ok: { type: 'boolean' }, problems: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] } }, required: ['what', 'evidence', 'severity'] } }, notes: { type: 'string' } }, required: ['ok', 'problems'] }
const FIX = { type: 'object', properties: { head: { type: 'string' }, fixed: { type: 'array', items: { type: 'string' } }, rejected: { type: 'array', items: { type: 'string' } }, checks: CHECKS, pushed: { type: 'boolean' } }, required: ['head', 'fixed', 'checks', 'pushed'] }

const verifyThenFix = async (label, ph, what, wt, br, head, fixPrompt) => {
  const v = await agent(`${COMMON}

You are an adversarial verifier (READ-ONLY: write nothing in any worktree; you may make your own clone under ${SP}/verify-${label} with git clone /home/user/PhysicalTherapy then fetch origin ${br}, and databases tp_v${label}_<n>). Try to REFUTE that this step is correct: ${what}
The pushed head is ${head} on origin ${br}. Check the merge commit's parents, every conflict resolution (both sides kept, nothing dropped: diff each side's changes against the merge), generated files byte-equal to what their generators write on that tree (regenerate in your clone and diff; the domain model on a freshly migrated database with pnpm -s db:domain-model --check), tables.test.ts's counts unchanged, no marker committed, no approval line or approvers.json change, no model identifier, scope. Run whatever narrow checks prove or disprove a claim (heavy ones under the lock). Default to reporting a problem when evidence is ambiguous, with the evidence. ${SAVE(`verify-${label}.md`, 'what you checked and found')}`, { label: `verify: ${label}`, phase: ph, schema: VERDICT })
  if (!v || v.ok || !(v.problems || []).some(p => p.severity !== 'nit')) return { verdict: v, fix: null }
  const f = await agent(`${COMMON}

${fixPrompt}
An adversarial verifier found these problems at ${head}: ${JSON.stringify(v.problems).slice(0, 8000)}
For each: confirm it against the code (it may be wrong; say why if you reject it), fix the real ones in ${wt} with a failing-first test where a test can show it, re-run the checks the fixes touch (and pnpm -s db:domain-model --check if anything schema or generated moved), commit, push ${br} once. ${SAVE(`fix-${label}.md`, 'each problem: confirmed or rejected, fix, checks')}`, { label: `fix: ${label}`, phase: ph, schema: FIX })
  return { verdict: v, fix: f }
}

// ---------- Stage 1: base into SS-01 ----------
phase('Base into SS-01')
const m1 = await agent(`${COMMON}

You are the base merger for SS-01 (${SSBR}, worktree ${SS}, head ${SSHEAD}; design /home/user/ops/designs/ss-01-suspension.md; its own migration 20261108090000_suspension_refusal.sql). f897a282 already holds base 56ed6279 (#76, #77, #80, #79, #74, #81: merged by 2ff5c631) and puts the suspension card on #74's fields and #79's table floor: VERIFY those patterns (every SS-01 table in ScrollTable with phone stacked rows; every SS-01 form keeping a refused submission's input) rather than redo them; fix only a gap, with a test. f897a282 was never checked: treat it as unchecked.
1. git fetch origin claude/build-platform; confirm origin/claude/build-platform is ${BASE} (if it moved, merge the newer head and say so). git merge --no-ff origin/claude/build-platform in ${SS} ("Merge claude/build-platform (<sha>, #78) into SS-01: ..."). The only expected conflict is apps/web/scripts/synthetic-personas.ts: keep both sides' personas. Regenerate every generated file on the merged tree (domain model and packages/db/functions on a freshly migrated database; watched.ts --write; synth --all; pnpm install if the lockfile moved).
2. The whole check list (f897a282 was never checked): pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm test (unit); pnpm test:db in 4 shards one after another on fresh databases; build, stamp, then the WHOLE e2e suite with E2E_PREBUILT=1 --workers=2 on ports 4971-4979; pnpm verify-content; pnpm synth --all and the fixtures check; pnpm -s db:domain-model --check (record SHA-256 and the approval line's number). A failure: find the cause, fix it in SS-01's own files (failing-first test where possible), re-run; a failure that is identical on the base is reported with evidence (run it on the base in a scratch worktree under ${SP}), not hidden.
3. Commit, push ${SSBR} once everything passes. ${SAVE('sc-m1-ss01.md', 'steps, conflicts, checks with totals')}`, { label: 'merge base into SS-01 + whole checks', phase: 'Base into SS-01', schema: MERGE })
if (!m1 || !m1.pushed) return { error: 'SS-01 base merge did not push', m1 }

phase('Verify SS-01')
const v1 = await verifyThenFix('ss01', 'Verify SS-01', `the merge of claude/build-platform (${BASE}, #78) into SS-01 (from ${SSHEAD}) kept both sides of synthetic-personas.ts and every other file, regenerated the domain model, functions, watched-paths and synth output exactly, and SS-01's tables and forms follow #79's ScrollTable/stacked rows and #74's kept input.`, SS, SSBR, m1.head, `You are SS-01's fixer (${SSBR}, worktree ${SS}; git pull --no-rebase origin ${SSBR} first).`)
const ssHead = (v1.fix && v1.fix.pushed && v1.fix.head) || m1.head

// ---------- Stage 2: SS-01 into 1b ----------
phase('SS-01 into 1b')
const m2 = await agent(`${COMMON}

You are the merger for SUITE-CAP-1b (${BR}, worktree ${WT}, head ${BHEAD}, stacked on SS-01's f5bd6201; design ${DESIGN} part 1b; its migration 20261109090000_line_status_heads.sql; the re-read ${REREAD}; the prior build's result ${PRIOR}). SS-01 now carries the latest claude/build-platform, SUITE-CAP-1a (#81, 56ed6279) included, at ${ssHead}. Never merge the base straight into 1b.
1. git fetch origin ${SSBR}; git merge --no-ff ${ssHead} in ${WT} ("Merge SS-01 (${ssHead.slice(0, 8)}, with claude/build-platform and SUITE-CAP-1a) into SUITE-CAP-1b: ..."). Shared files: docs/adr/0083-*.md (1a wrote it; keep it whole; 1b's section comes later), docs/product/test-matrix.md, docs/runbooks/ci.md and packages/synth/src/cases/{matrix,registry}.ts (keep both: CAS-41 sits between CAS-39 and CAS-40, then CAS-40 and CAS-42); 1a's and 1b's changes to the same worker or db files merged by meaning. Regenerate every generated file on the merged tree.
2. Check that 1b's code and 1a's code meet: 1a's readers (judgedCandidates, the streamed gatherReport, advanceStages' LATERAL lookup) on 1b's line_status_head and claim_by_superseded; nothing of 1b's re-implements what 1a now has; 1b's release-capacity workflow change keeps the base's runs-on (ubuntu-26.04).
3. Checks: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm test (unit); pnpm test:db in 4 shards on fresh databases; pnpm verify-content; synth --all and the fixtures check; pnpm -s db:domain-model --check (SHA-256, approval line). Commit, push ${BR}. ${SAVE('sc-m2-1b.md', 'steps, conflicts, checks')}`, { label: 'merge SS-01 into 1b', phase: 'SS-01 into 1b', schema: MERGE })
if (!m2 || !m2.pushed) return { error: '1b merge did not push', m1, v1, m2 }

phase('Verify 1b merge')
const v2 = await verifyThenFix('1b-merge', 'Verify 1b merge', `the merge of SS-01 (${ssHead}) into SUITE-CAP-1b (from ${BHEAD}) kept 1a's and 1b's sides in ADR 0083, test-matrix (CAS-39, CAS-41, CAS-40, CAS-42 order), ci.md, synth matrix and registry, merged the worker and db code by meaning (1a's readers on 1b's line_status_head and claim_by_superseded), and regenerated every generated file exactly.`, WT, BR, m2.head, `You are 1b's merge fixer (${BR}, worktree ${WT}; git pull --no-rebase origin ${BR} first).`)
const bMerged = (v2.fix && v2.fix.pushed && v2.fix.head) || m2.head

// ---------- Two branches in parallel ----------
const CTX1B = `This is SUITE-CAP-1b (${BR}, worktree ${WT}, now at ${bMerged}, holding SS-01 ${ssHead} and SUITE-CAP-1a's merged code); design ${DESIGN} part 1b (sections 4.5 granted, 7, 8, 13, 16) with the re-read's deltas (${REREAD}); the prior build's result and deferred list (${PRIOR}). Decisions already taken: line_status_head grants SELECT to tp_app; CAS-42.3 at 2,000 lines by default; CAS-42.3's 835s from LED-06's segments. Notes from #81 (1a): about 650 s of the 100,000-line report is claimLines without D15 (claim_by_superseded, which 1b carries); CAS-41.2's sizes are 10,000 and 20,000 as built; on the default lock table both triage and the report fail 53200 until 1b. Reconcile at real size is SUITE-CAP-3 (Lane B's): leave it out. CAS-42.5 and .6 (the real-size runs, FULL_SIZE harness) need an 8-CPU runner: this container's 4 CPUs stop them as RUNNER_TOO_SMALL; they are recorded as waiting on the founder, not run.`

const branch1b = async () => {
  phase('1b deferred')
  const [gate, route] = await parallel([
    () => agent(`${COMMON}

${CTX1B}
You are builder G: slice 1 (the measurement gate, section 8.2) and slice 5's CAS-42.1 and CAS-42.2 (section 7, section 8.4's budgets). git pull --no-rebase origin ${BR} first. You own: apps/worker/src/triage/triage.large.db.test.ts (new) and a together.large.db.test.ts if a shard's time demands the split; the SLOW_FIRST list in vitest.config.ts (triage.large and reconcile.large beside the existing entries); tools/test/db-shards.test.ts (the count it pins); packages/synth/src/cases/registry.ts and fixtures/synthetic/CAS-42/expected.json (regenerated by synth) only to add the new tests to CAS-42's assertedBy; docs/adr/0083-*.md (1b's section: status line, the lock section as built, the SELECT grant to tp_app and why, CAS-42.3 at 2,000 lines and why, the heap line covering every job kind and its rounding, the measured peaks, the grant word for word with who and when; keep 1a's part whole).
1. The measurement gate first: CAS-42.1 and .2 written, then run on 1a's merge without 1b (a scratch worktree under ${SP}/b1b-gate at ${ssHead}, removed after) and on the head, recording live-heap peaks and times (base: the expected 53200 or heap failure; head: within budget).
2. CAS-42.1 (each job alone at 100,000 lines under a 420 MiB heap in a child process; at most 1 advisory lock; the budgets) and CAS-42.2 (the large report and another practice's triage together under 560 MiB): seen failing on the base, passing on the head.
3. ADR 0083's 1b section with the measured peaks.
Checks: pnpm typecheck; pnpm lint; the large tests alone (under the lock); tools/test unit; packages/synth tests and the fixtures check; pnpm verify-content. Commit, push ${BR}. ${SAVE('sc-1b-gate.md', 'steps, peaks and times, open items')}`, { label: '1b: gate, CAS-42.1/.2, ADR 0083', phase: '1b deferred', schema: { type: 'object', properties: { head: { type: 'string' }, peaks: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, checks: CHECKS, differences_from_design: { type: 'array', items: { type: 'string' } }, open_items: { type: 'array', items: { type: 'string' } } }, required: ['head', 'peaks', 'checks', 'open_items'] } }),
    () => agent(`${COMMON}

${CTX1B}
You are the real-size runs' route scout (READ-ONLY: write nothing; you may read GitHub through gh api for reads only, and the MCP github tools loaded with ToolSearch for reads only). Do NOT dispatch any workflow. Facts: the repo is public and owned by a User account (check with gh api repos/PureTideWater/PhysicalTherapy --jq .owner.type); on the base, .github/workflows/release-capacity.yml runs on ubuntu-26.04 and has workflow_dispatch (1b's ${BHEAD} read ubuntu-24.04; check what the merged head reads); docs/runbooks/screening-capacity.md "Time advisory and binding": larger runners exist only for organizations on GitHub Team or Enterprise Cloud. CAS-42.5 and .6 need tools/release-capacity at FULL_SIZE on the base's and the head's worker images (the reconcile and large-jobs-together phases); run.ts stops as RUNNER_TOO_SMALL below 8 CPUs. Find every possible route (a dispatch of the weekly workflow on ${BR} and what a standard 4-CPU GitHub runner would do; a self-hosted runner; a paid larger runner; the design's section 8.2 local reproduction; any honest reduced-size substitute and why it would or would not satisfy the design), what each needs from a person (owner-admin or paid: the founder's), its cost, and the exact commands or dispatch inputs. Recommend one. ${SAVE('sc-1b-route.md', 'what you found')}`, { label: '1b: real-size route scout', phase: '1b deferred', schema: { type: 'object', properties: { recommended_route: { type: 'string' }, routes: { type: 'array', items: { type: 'object', properties: { route: { type: 'string' }, needs_person: { type: 'boolean' }, cost: { type: 'string' }, commands: { type: 'string' } }, required: ['route', 'needs_person'] } }, why: { type: 'string' } }, required: ['recommended_route', 'routes', 'why'] } }),
  ])
  if (!gate) return { error: 'gate builder returned nothing', route }

  phase('1b integrate')
  const integ = await agent(`${COMMON}

${CTX1B}
You are 1b's integrator. Reports: gate ${JSON.stringify(gate).slice(0, 5000)} route ${JSON.stringify(route).slice(0, 3000)}
0. FIRST (the co-founder's pacing call: the full suite runs once, on the final tree): SS-01 is being merged with #42's head 6c28d6a2 and base 43565235 by another workflow (it pushes ${SSBR} when its whole check list passes; WIP ref co-001/wip-ss01-chain). Poll 'git fetch origin ${SSBR}' every 5 minutes (up to 4 hours) until origin/${SSBR} contains 6c28d6a2 (git merge-base --is-ancestor 6c28d6a2 origin/${SSBR}). Then git merge --no-ff origin/${SSBR} in ${WT} ("Merge SS-01 (<sha>, with #42 6c28d6a2 and claude/build-platform 43565235) into SUITE-CAP-1b: ..."); shared documents keep both; generated files regenerated on the merged tree (domain model on a freshly migrated database); re-read 1b's migration objects against #42's 20261107090000 bodies (anything 1b recreates must keep #42's changes; a change to 20261109090000 only through the marker route). The diff base for steps 2 and 4 below is then that SS-01 head, not ${ssHead}. If SS-01 never arrives in 4 hours, report it and run the suite on what you have.
1. In ${WT}: git pull --no-rebase origin ${BR}; clean tree; no marker; regenerate watched-paths, synth, the domain model; whole-repo pnpm typecheck, pnpm lint, pnpm lint:copy, pnpm lint:logs.
2. Adversarial read of the whole 1b diff against SS-01's ${ssHead}: concurrency (stage writers interleaving; any per-line lock left in line_status_rules or the two ledger triggers; the deploy's lock loop queueing nobody), the ledger freeze (4.5 changes only each function's lock line; packages/ledger untouched), security (line_status_head's RLS, FORCE, policy, registry row, grants), reliability (the heap line never throws; the alarm), the large tests' budgets against CI's shard limit. Fix with failing-first tests; report each.
3. The full local suite once (lanes/lane-b.md "How Lane B runs"): unit and property; golden; the oracle and the ledger oracle; test:db in 4 shards one after another on fresh databases (record each shard's time: the large tests must fit CI's shard limit); build, stamp, e2e with E2E_PREBUILT=1 --workers=2 on ports 4971-4979; the Stryker shards the change affects per stryker/shards.json, then the gate; pnpm verify-content; synth and fixtures; infra tests; the engine-freeze check against ${ssHead}; pnpm -s db:domain-model --check (SHA-256, approval line). CAS-42.5 and .6 are excluded and recorded as waiting on the founder's 8-CPU runner.
4. Scope: git diff --name-only ${ssHead}...HEAD lists only 1b's files and generated files; one new migration; nothing frozen beyond 4.5's two functions.
5. Commit fixes, push once. Return head, SHA-256, approval line, the suite's parts with totals, scope, fixes, open items. ${SAVE('sc-1b-integrate.md', 'steps, each suite part with totals, fixes, open items')}`, { label: '1b: integrate + full suite', phase: '1b integrate', schema: { type: 'object', properties: {
    head: { type: 'string' }, domain_model_sha256: { type: 'string' }, approval_line_number: { type: 'number' }, scope_ok: { type: 'boolean' }, pushed: { type: 'boolean' },
    suite: CHECKS, fixes: { type: 'array', items: { type: 'string' } }, open_items: { type: 'array', items: { type: 'string' } } },
    required: ['head', 'domain_model_sha256', 'scope_ok', 'pushed', 'suite', 'open_items'] } })
  return { gate, route, integ }
}

const ICTX = `This is the interest fix (${IBR}, worktree ${IWT}); design ${IDESIGN} (build exactly the design as revised, section 16 "After the design review" included). The founder granted its ledger freeze exception: ${GRANT}; stay exactly within section 10.1's granted text (its DDL, seven behaviours, files; the stages, every principal amount, the definition of recovered, the parser and loader, LED-01 to LED-18's amounts stay frozen). Reserved: ADR 0084; LED-23 to LED-25; synth module 6; fixture release 900008 only if needed. Its one migration 20261110090000_ledger_interest_once.sql. Pushed so far on e0646746 (over 1b's 358dc53f): b5949dc1 (schema), a3c9d068 (ledger core, interest.ts), 1b5036e3 (synth), 39e5caa0 (reconcile), e0646746 (records: ADR 0084, PRD 13, reconciliation-001, matrix). The earlier run's re-read deltas and builder reports are lost: read section 16 and those pushed commits for the interfaces. Slice 4 (screens) is NOT built. No change under packages/pricing/src, packages/rules, packages/edi835, fixtures/golden, content/releases or any applied migration. Money: integer cents; a new ledger source file needs its stryker shard.`

const branchInterest = async () => {
  phase('Interest merge')
  const im = await agent(`${COMMON}

${ICTX}
You are the interest merger. Merge 1b's new head ${bMerged} (SS-01 with base 83d71fd6 and 1a, merged into 1b) into ${IBR} in ${IWT} (head ${IHEAD}) with a merge commit ("Merge SUITE-CAP-1b (${bMerged.slice(0, 8)}) into the interest fix: ..."). git fetch origin ${BR} first; merge exactly ${bMerged}, not a later 1b head. Conflicts: test-matrix, ci.md, synth matrix and registry, reconciliation-001, ADRs keep both sides; workflow.ts and the reconcile files merged by meaning; generated files regenerated (domain model and functions on a freshly migrated database). Checks: pnpm typecheck; pnpm lint; pnpm test (unit); pnpm test:db in 4 shards on fresh databases; pnpm synth --all and the fixtures check; pnpm -s db:domain-model --check (SHA-256, approval line). Push ${IBR}. ${SAVE('sc-int-merge.md', 'steps, conflicts, checks')}`, { label: 'interest: merge 1b', phase: 'Interest merge', schema: MERGE })
  if (!im || !im.pushed) return { error: 'interest merge did not push', im }

  phase('Interest screens')
  const web = await agent(`${COMMON}

${ICTX}
The branch is at ${im.head} (1b merged in). You are builder W, the screens (slice 4; sections 6.3 and 7; section 13's slice list; section 16's changes). git pull --no-rebase origin ${IBR} first. Read section 16 and commits a3c9d068, b5949dc1, 39e5caa0, 1b5036e3 and e0646746 for the interfaces (the chain walk export from apps/worker/src/reconcile/public.ts, the reported interest, the refusal codes). You own: apps/web/src/lib/reconciliation/queries.ts; apps/web/src/app/p/[practiceId]/reconciliation/page.tsx; apps/web/src/app/p/[practiceId]/reports/roi/[statementId]/page.tsx; apps/web/src/components/reconciliation/display.tsx; apps/web/src/lib/routes/specialist.ts; apps/web/src/lib/routes/test-support/ledger-world.ts; apps/web/src/lib/routes/reconciliation-routes.db.test.ts; apps/web/e2e/ledger-interest.spec.ts (new); and LED-23/24's assertedBy in packages/synth/src/cases/registry.ts (regenerating fixtures). Both pages changed since the design's base (reconciliation/page.tsx by ~100 lines through SS-01; the ROI page): build on the current code, keeping #79's ScrollTable and stacked rows, #74's kept input, and tables.test.ts's counts. Every sentence word for word from section 7 within .claude/rules/brand.md; the page keeps offering no reversal of an interest match; accessibility (labels, announcements, keyboard, 390 px). Code computes every number; the page only displays what the worker stored. Tests first (fail on ${im.head}, pass after). Checks: pnpm typecheck; pnpm lint; pnpm lint:copy; apps/web unit; reconciliation-routes.db.test.ts on a fresh database; ledger-interest.spec.ts alone on port 4981 (build first, E2E_PREBUILT=1). Commit, push; give every sentence word for word in "wording". ${SAVE('sc-int-web.md', 'steps done, failing-first counts, open items')}`, { label: 'interest: W screens', phase: 'Interest screens', schema: { type: 'object', properties: { head: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, wording: { type: 'array', items: { type: 'string' } }, checks: CHECKS, differences_from_design: { type: 'array', items: { type: 'string' } }, open_items: { type: 'array', items: { type: 'string' } } }, required: ['head', 'files', 'checks', 'open_items'] } })
  if (!web) return { error: 'builder W returned nothing', im }

  return { im, web }
}

const interestIntegrate = async (im, web, b1bHead) => {
  phase('Interest integrate')
  const integ = await agent(`${COMMON}

${ICTX}
You are the interest integrator. Reports: merge ${JSON.stringify(im).slice(0, 3000)} W ${JSON.stringify(web).slice(0, 5000)}
0. FIRST: 1b's integrator has pushed ${b1bHead} on ${BR} (1b with SS-01, #42 6c28d6a2 and base 43565235 merged, its full suite passed). git fetch origin ${BR}; git merge --no-ff ${b1bHead} in ${IWT} ("Merge SUITE-CAP-1b (<sha>, with SS-01, #42 and claude/build-platform) into the interest fix: ..."); shared documents keep both; code merged by meaning; generated files regenerated on the merged tree. The diff base for steps 2, 3 (engine-freeze) and 4 below is ${b1bHead}, not ${bMerged}.
1. In ${IWT}: git pull --no-rebase origin ${IBR}; clean; no marker. pnpm typecheck, pnpm lint, pnpm lint:copy, pnpm lint:logs; regenerate watched-paths and confirm the lockfile, synth output and domain model are what their generators write. Fix seams in the smallest change with a failing-first test.
2. Adversarial seam read of the whole diff against ${bMerged}, as a payment-engine reviewer and against section 10.1's granted text and section 16: can one payment of interest still be credited twice (AMT I and PLB L6; a resend; a correction chain; one PLB L6 netting several claims); can interest exceed what the PLB L6 pays; any float on an amount; any principal amount, stage or the definition of recovered changed; anything beyond 10.1's text; packages/edi835, pricing, rules untouched; LED-01 to LED-18's amounts unchanged; the new trigger function's search_path, grants, lock key (consistent with 1b's practice ledger: key). Review any equivalent mutant recorded in the earlier slices (you are not its proposer). Fix with failing-first tests; report each.
3. The full local suite once: unit and property; golden; pnpm test:oracle and the ledger oracle db test; test:db in 4 shards one after another on fresh databases; build, stamp, e2e with E2E_PREBUILT=1 --workers=2 on ports 4981-4989; Stryker for every shard the change affects (interest.ts at 100%; the ledger shards), then the gate; pnpm verify-content; synth and fixtures; the engine-freeze check against ${bMerged}; the screening-capacity gate if it runs locally (else why); pnpm -s db:domain-model --check (SHA-256, approval line).
4. Scope: git diff --name-only ${bMerged}...HEAD lists only section 11's files (less claim_by_superseded's), tests and generated files; exactly one new migration.
5. Commit fixes, push once. Return head, SHA-256, approval line, each suite part with totals, scope, fixes, open items. ${SAVE('sc-int-integrate.md', 'steps, each suite part with totals, fixes, open items')}`, { label: 'interest: integrate + full suite', phase: 'Interest integrate', schema: { type: 'object', properties: {
    head: { type: 'string' }, domain_model_sha256: { type: 'string' }, approval_line_number: { type: 'number' }, scope_ok: { type: 'boolean' }, pushed: { type: 'boolean' },
    suite: CHECKS, fixes: { type: 'array', items: { type: 'string' } }, open_items: { type: 'array', items: { type: 'string' } } },
    required: ['head', 'domain_model_sha256', 'scope_ok', 'pushed', 'suite', 'open_items'] } })
  return { integ }
}

const [b1b, ib] = await parallel([branch1b, branchInterest])
let bint = ib
if (b1b && b1b.integ && b1b.integ.pushed && ib && ib.web) {
  const r = await interestIntegrate(ib.im, ib.web, b1b.integ.head)
  bint = { ...ib, ...r }
}
log('Final fresh-clone verification is left to each PR\'s own pipeline step 6 (the co-founder\'s pacing call: no repeated suites on an unchanged head).')
return { m1, v1, m2, v2, b1b, bint }
