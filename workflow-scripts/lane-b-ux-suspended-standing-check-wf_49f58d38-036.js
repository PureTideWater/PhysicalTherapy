export const meta = {
  name: 'lane-b-ux-suspended-standing-check',
  description: 'Check stage for ux-suspended-standing: diff vs design, base merge, the checks',
  phases: [{ title: 'Check', detail: 'one checker' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/4b2d015a-84c8-5610-8630-1a03db5b4a46/scratchpad'
const WT = '/home/user/ux-suspended-standing'
const RESULT = { type: 'object', properties: { commits: { type: 'array', items: { type: 'string' } }, checks: { type: 'array', items: { type: 'string' } }, fixes: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } }, required: ['commits', 'checks', 'fixes', 'summary'] }
phase('Check')
return await agent(`You check the ux-suspended-standing build (PaidWhole, Lane B). Work only in ${WT} (branch co-001/ux-suspended-standing, head 938f9916, built on 7ef421b). Never touch /home/user/PhysicalTherapy, never push, never rebase. Synthetic data only; no model identifier in any file; never edit a file in ${SP}/pr42-files.txt except docs/product/test-matrix.md, packages/synth/src/cases/matrix.ts and registry.ts (this PR's rows only); no migration; NEVER run prettier (the repository has no prettier config). Node: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. Every heavy command only as flock /tmp/laneb-heavy.lock <command>, one at a time. If PostgreSQL on 5433 is down, start it as HANDOFF.md says. Commit messages end with exactly these two lines after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SbDNvf4ojucLA3uyPfs1FC
Save as you go: keep ${SP}/progress/ss-check.md up to date; if it exists from an interrupted earlier run, read it and continue.
The builder's notes: /home/user/ops/approval-summaries/lane-b-ux-suspended-standing-build-progress.md. The design with its "After the design review" section: /home/user/ops/designs/lane-b-ux-suspended-standing.md.
1. Read git -C ${WT} diff origin/claude/build-platform...HEAD against the design; fix gaps or inconsistencies (docs vs code vs words) in a new commit.
2. Merge the latest base: git -C ${WT} fetch -q origin claude/build-platform && git -C ${WT} merge --no-ff origin/claude/build-platform with a message "Merge claude/build-platform (<sha>, <what>) into co-001/ux-suspended-standing: <how resolved> (LANES.md rule 6)" and the attribution lines. Shared documents keep both lanes' rows; pnpm-lock.yaml re-resolved with pnpm install, never by hand.
3. Run, from ${WT}: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm test (files, passed, skipped; tools/screening-capacity/watched.test.ts must pass); pnpm synth --all then git status --porcelain (commit any expected.json written); the db tests the diff adds or touches (DATABASE_URL=postgres://postgres:test@localhost:5433/postgres pnpm exec vitest run --project db <files>), the seed's db test, and the generated route tests for touched routes; tools/stryker/affected.ts --event pull_request --base origin/claude/build-platform. Fix every failure the diff causes and re-run. Do not run e2e.
Report each check with counts and every commit.`, { label: 'ss-check', phase: 'Check', schema: RESULT })