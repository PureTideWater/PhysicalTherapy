export const meta = {
  name: 'pr42-into-ss01',
  description: 'Acting Lane A: merge #42 head 6c28d6a2 and base 43565235 into SS-01; re-read SS-01 recreated objects on #42 bodies; full check list; push; adversarial verify',
  phases: [
    { title: 'Merge #42 into SS-01', detail: 'merge commits; regenerate; re-read recreated objects; checks; push' },
    { title: 'Verify', detail: 'adversarial read-only check, then fixer if needed' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/6af08ef9-734c-5d6d-a787-51ade7156d78/scratchpad'
const SS = '/home/user/ss01', SSBR = 'co-001/ss-01-suspension-refusal', SSHEAD = 'efb20704b8a358681c8d60378bc78674e3b0d2c8'
const P42 = '6c28d6a2', BASE = '43565235'
const ATTR = `End every commit message with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FcouKQthXdmDnPmwhFepxW`
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}). If it already exists when you start, an earlier run was interrupted: read it, trust it unless the code says otherwise, continue.`
const COMMON = `Repository PureTideWater/PhysicalTherapy (PaidWhole). Acting Lane A on the schema chain. Write ONLY in ${SS}; never in /home/user/sc1b or /home/user/interest (another workflow is building there), /home/user/PhysicalTherapy or /home/user/ops.
Environment: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. PostgreSQL 18 on 5433 (postgres:test, socket /tmp); if down: su postgres -c "/opt/pg18/bin/pg_ctl -D /root/pgdata18 -o '-p 5433 -k /tmp' -l /tmp/pg18.log start". Heavy commands (install, test:db, build, e2e, synth --all) one at a time under flock /tmp/laneb-heavy.lock <command> (shared with another workflow). Long commands: run_in_background and wait; never end your turn while one you need runs. Databases tp_m42_<n> / tp_v42_<n>, dropped when done. E2e ports 4991-4999 only.
The founder's standing permission (HANDOFF.md 2026-10-22): the protected-edit marker ${SS}/.claude/.allow-protected-edit only for SS-01's own unmerged migration 20261108090000_suspension_refusal.sql, via .claude/skills/new-migration/SKILL.md's route (shell-created just for the write, removed in a trap, never committed). Never for #42's 20261107090000 or any applied migration. If refused, stop and report.
Rules: CLAUDE.md in full. Never write the domain-model approval line or approvers.json; never approve/request changes; open no PR. Merge commits only; never rebase or force; never --no-verify; no .gitleaksignore. Generated files (pnpm-lock.yaml, watched-paths.txt, packages/db/functions, docs/product/domain-model.md, synth fixtures) are regenerated, never hand-merged: take either side, regenerate (pnpm install; pnpm -s exec tsx tools/screening-capacity/watched.ts --write; pnpm db:domain-model --out --strict on a freshly migrated database; pnpm synth --all), commit every file written or removed. Shared documents keep both sides (rule 6). Never change tables.test.ts's counts (wrap tables in ScrollTable). Push 'git push -u origin ${SSBR}' with 2/4/8/16 s retries on network error; if rejected, pull --no-rebase and push again. No model identifier anywhere. ${ATTR}
Never skip or loosen a test. Report every check with command and totals, every conflict and resolution, every open item.`
const CHECKS = { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } }

phase('Merge #42 into SS-01')
const m = await agent(`${COMMON}

You merge #42 (PR 6b-4, co-001/pr-06b-mail-streams) head ${P42} and then the base claude/build-platform ${BASE} (#83) into SS-01 (${SSBR}, worktree ${SS}, head ${SSHEAD}; design /home/user/ops/designs/ss-01-suspension.md; migration 20261108090000_suspension_refusal.sql). git fetch origin co-001/pr-06b-mail-streams claude/build-platform; confirm the heads (if either moved, say so and use the fetched ${P42} / ${BASE} exactly unless the branch head is a descendant with no migration change: then report it and still merge the exact named commits).
1. git merge --no-ff ${P42} ("Merge #42 (${P42}, mail streams with #78 and #82) into SS-01: ..."); resolve (expected: docs/product/domain-model.md and function files, regenerated); then git merge --no-ff ${BASE} ("Merge claude/build-platform (${BASE}, #83) into SS-01: ..."). Regenerate every generated file on the final tree.
2. Re-read SS-01's recreated objects on #42's bodies as #42's migration 20261107090000_mail_streams.sql now defines them: the audit_event_record policy (and any other policy/function SS-01's migration recreates or replaces: list them all from 20261108090000), the organization table and its columns/triggers, and SS-01's functions. For each, diff the body SS-01 recreates against #42's latest body: SS-01 must keep every change #42 made. If a body moved, change 20261108090000 ONLY through the marker route, with a failing-first db test showing the lost #42 behaviour. Report each object and verdict.
3. Checks: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm test; pnpm test:db in 4 shards one after another on fresh databases; build, stamp, the whole e2e suite with E2E_PREBUILT=1 --workers=2 on ports 4991-4999; pnpm verify-content; pnpm synth --all and the fixtures check; pnpm -s db:domain-model --check (record SHA-256 and approval line number). A flake: re-run alone and report it with evidence (known flake: tools/release/load.db.test.ts relallvisible after VACUUM FREEZE).
4. Push ${SSBR}. ${SAVE('m42-ss01.md', 'steps, conflicts, object verdicts, checks with totals')}`, { label: 'merge #42 + base into SS-01', phase: 'Merge #42 into SS-01', schema: { type: 'object', properties: { head: { type: 'string' }, pushed: { type: 'boolean' }, domain_model_sha256: { type: 'string' }, approval_line_number: { type: 'number' }, conflicts: { type: 'array', items: { type: 'string' } }, objects: { type: 'array', items: { type: 'string' } }, migration_changed: { type: 'boolean' }, checks: CHECKS, open_items: { type: 'array', items: { type: 'string' } } }, required: ['head', 'pushed', 'objects', 'migration_changed', 'checks', 'open_items'] } })
if (!m || !m.pushed) return { error: 'merge did not push', m }

phase('Verify')
const v = await agent(`${COMMON}

You are an adversarial verifier (READ-ONLY on every worktree; clone into ${SP}/v42: git clone /home/user/PhysicalTherapy ${SP}/v42, point origin at the real remote, fetch ${SSBR}, check out ${m.head}; pnpm install --frozen-lockfile under the lock). Try to REFUTE that the merge of #42 ${P42} and base ${BASE} into SS-01 is correct: merge parents; every conflict resolved keeping both sides; generated files byte-equal to their generators' output on that tree (regenerate and diff; pnpm -s db:domain-model --check on a fresh database: hash ${m.domain_model_sha256}); SS-01's recreated objects keep every #42 change (diff each body in a database migrated from empty against #42's own migration's body; run the audit, organization and suspension db tests and cross-tenant/catalog); no marker committed; no approval line or approvers.json change; tables.test.ts unchanged. Remove the clone after. ${SAVE('v42-ss01.md', 'checks and findings')}`, { label: 'verify #42 merge', phase: 'Verify', schema: { type: 'object', properties: { ok: { type: 'boolean' }, problems: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, evidence: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] } }, required: ['what', 'evidence', 'severity'] } } }, required: ['ok', 'problems'] } })
let fix = null
if (v && !v.ok && v.problems.some(p => p.severity !== 'nit')) {
  fix = await agent(`${COMMON}

You are SS-01's fixer (git pull --no-rebase origin ${SSBR} in ${SS} first). A verifier found at ${m.head}: ${JSON.stringify(v.problems).slice(0, 8000)}
Confirm each against the code (reject with reasons if wrong); fix the real ones with failing-first tests; re-run the checks the fixes touch and pnpm -s db:domain-model --check; commit; push once. ${SAVE('fix42-ss01.md', 'each problem, fix, checks')}`, { label: 'fix #42 merge', phase: 'Verify', schema: { type: 'object', properties: { head: { type: 'string' }, fixed: { type: 'array', items: { type: 'string' } }, rejected: { type: 'array', items: { type: 'string' } }, checks: CHECKS, pushed: { type: 'boolean' } }, required: ['head', 'fixed', 'pushed'] } })
}
return { m, v, fix }
