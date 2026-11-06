export const meta = {
  name: 'ss01-final-base-merge-lane-a',
  description: 'Lane A: SS-01 PR #104 after the founder committed its approval line: merge the base (up-to-date rule), fast checks and generators, --check --require-approval, push; then a fresh-clone check reading CI green on that head',
  phases: [
    { title: 'Base merge', detail: 'merge the latest claude/build-platform; checks; push' },
    { title: 'Verify', detail: 'fresh clone; --require-approval passes; CI green on the head' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/e935a935-d2ff-5a27-860c-22677590c441/scratchpad'
const SS = '/home/user/ss01', BR = 'co-001/ss-01-suspension-refusal', PR = 104
const HEAD = 'd214ad6cfc2568429ff9a28509a3ec7d93349c61'
const SHA = '08c1ba4746589dc3d1acbcce966680e9bd22aa2ae07fb87f1c03b18ce9576142'
const SESSION = 'https://claude.ai/code/session_019i9ifEG147aKfNHEAsoS7h'
const ATTR = `End every commit message with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}`
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}). If it exists when you start, an earlier run was interrupted: read it, trust it unless the code says otherwise, and continue. Always finish by returning your structured result.`
const COMMON = `Repository PureTideWater/PhysicalTherapy (PaidWhole; public). You work for Lane A's schema-chain session (GitHub login PureTideWater) on SS-01, PR #${PR} (${BR}, draft). Its head ${HEAD} is the founder's commit of the approval line (docs/product/domain-model.md line 7414: "Approved by: Tyler Williams  Date: 2026-11-04  Document SHA-256: \`${SHA}\`"). That line is the founder's: never change, move or re-create it. Never write approvers.json; never approve or request changes on a PR; post no comment; do not mark the PR ready and do not merge it (the session does). Read /home/user/ops, /home/user/sc1b, /home/user/interest, /home/user/PhysicalTherapy but never write there.
Environment: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. PostgreSQL 18 on 5433 (postgres:test, socket /tmp). PG_BIN_DIR=/opt/pg18/bin. Heavy commands under 'flock /tmp/laneb-heavy.lock'. Long commands: run_in_background and poll. Databases tp_ss01_<role>_<n>, dropped when done.
Rules: CLAUDE.md in full; LANES.md rule 6 (merge commits only; generated files regenerated, never hand-merged: pnpm install, watched.ts --write, db:domain-model --out --strict on a FRESHLY migrated database, synth --all; shared documents keep both sides). Never rebase, force, --no-verify or add a .gitleaksignore entry; never write files through the GitHub connector. No PHI, no model identifier in any file or commit text (the trailer is required). ${ATTR}`
const CHECKS = { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } }

phase('Base merge')
const m = await agent(`${COMMON}

In ${SS}: git pull --no-rebase origin ${BR} (to ${HEAD}); git fetch origin claude/build-platform. If origin/claude/build-platform is already an ancestor of the head, change nothing and say so. Otherwise: list the delta (git log --first-parent; git diff --stat) and confirm it has no migration, no packages/db/functions or domain-model change (if it has one, STOP: report it; the founder's line would be voided and a re-approval needed). git merge --no-ff origin/claude/build-platform ("Merge claude/build-platform (<sha>: <PRs>) into SS-01"). Resolve any conflict keeping both sides. Regenerate (pnpm install; watched.ts --write; db:domain-model --out --strict on a fresh database: the document text must be unchanged but for its provenance line; if --out would change line 7414, STOP and report); synth --all. Checks: the fast checks (pnpm typecheck, lint, lint:copy, lint:logs, check:fixtures, synth with no diff); actions:check and BASE=origin/claude/build-platform toolchain:check if the delta touched workflows, manifests or the lockfile; the tests the delta touches; pnpm -s db:domain-model --check AND pnpm -s db:domain-model --check --require-approval on a fresh database (both must pass, exit 0, hash ${SHA}). Fetch once more right before the push; if the base moved again, merge it the same way. Push ${BR} (2/4/8/16 s retries on network errors; if rejected, pull --no-rebase and push again). Then update PR #${PR}'s body (read it first): regenerate its summary block at the top with 'pnpm -s db:domain-model --summary-since origin/claude/build-platform --function-diffs list' (whole), note this merge and the founder's commit d214ad6c in the round's notes and the Checks table (with --require-approval now passing), keep everything else; under 65,536 characters; update_pull_request; read back. ${SAVE('ss01-final-merge.md', 'delta, merge, checks, push, body')}`, { label: 'SS-01: final base merge', phase: 'Base merge', schema: { type: 'object', properties: { head: { type: 'string' }, pushed: { type: 'boolean' }, base_merged: { type: 'string' }, stopped_reason: { type: 'string' }, require_approval_passed: { type: 'boolean' }, checks: CHECKS, body_chars: { type: 'number' } }, required: ['head', 'pushed', 'require_approval_passed', 'checks'] } })
if (!m || !m.require_approval_passed) return { error: 'merge stopped or approval check failed', m }

phase('Verify')
const v = await agent(`${COMMON}

You are SS-01's final fresh-clone verifier at head ${m.head}. READ-ONLY. Clone into ${SP}/ss01-fv3 at ${m.head}; pnpm install --frozen-lockfile under the lock; fresh database tp_ss01_fv3_1.
1. pnpm -s db:domain-model --check --require-approval exits 0 with hash ${SHA}, and line 7414 is byte-equal to the founder's committed line in ${HEAD}.
2. git diff ${HEAD} ${m.head}: only the base's delta plus the provenance line (no other SS-01 change), no migration.
3. Wait for CI on ${m.head} (gh api repos/PureTideWater/PhysicalTherapy/actions/runs?head_sha=${m.head}; poll every 5 minutes with a background sleep loop, up to 3 hours, until every run completes): every job must be green now, domain model and all green included, plus mutation, screening-capacity gate and approval-of-record (report a time advisory as advisory). Read any red job's log and report the cause exactly. Report the required checks named in .github/pull_request_template.md's required-checks line by name.
4. At the end: is origin/claude/build-platform still an ancestor of ${m.head}? gh api pulls/${PR}: mergeable and mergeable_state.
Remove the clone and database after. ${SAVE('ss01-verify3.md', 'approval check, diff, CI per job, ancestry')}`, { label: 'SS-01: final verification + CI', phase: 'Verify', schema: { type: 'object', properties: { passed: { type: 'boolean' }, ci: CHECKS, required_checks_green: { type: 'boolean' }, base_is_ancestor: { type: 'boolean' }, mergeable_state: { type: 'string' }, problems: { type: 'array', items: { type: 'string' } } }, required: ['passed', 'ci', 'required_checks_green', 'problems'] } })
return { m, v }
