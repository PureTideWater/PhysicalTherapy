export const meta = {
  name: 'lane-b-packet-day-counts-full-suite',
  description: 'PR #84: the one full local suite on the final merged tree (62ecb515), every packets mutation shard timed, then the gate',
  phases: [{ title: 'Suite' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/70ab2f76-1059-5c68-8649-2c2eeea1fb4d/scratchpad'
const WT = '/home/user/packet-day-counts'
const SESSION = 'https://claude.ai/code/session_019i9ifAd3jhRt1Vkzz2vUSQ'
const GL = 'GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks'
phase('Suite')
const suite = await agent(`Run the full local suite once on ${WT} at its HEAD (62ecb515, the final tree of PR #84: its fix round plus claude/build-platform 17641c88 merged; committed; typecheck, lint, lint:copy, lint:logs, check:fixtures, the generators and db:domain-model --check already passed on it, so do not repeat those). Per /home/user/ops/lanes/lane-b.md "How Lane B runs" (read it for the exact forms), each under \`flock /tmp/laneb-heavy.lock\`, with \`export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH\` and NODE_OPTIONS=--max-old-space-size=6144 where needed:
pnpm verify-content; pnpm test; pnpm test:golden; pnpm test:oracle; pnpm test:db in 4 shards one after another (DATABASE_URL=postgres://postgres:test@localhost:5433/postgres, PG18; check first with pg_isready -h /tmp -p 5433, and if PostgreSQL is down run \`bash /tmp/setup-container.sh\` to restart it, then \`pnpm db:migrate\` if a check needs it); pnpm build; the build stamp as lane-b.md says; pnpm test:e2e with E2E_PREBUILT=1 and --workers=2; every packets mutation shard in stryker/shards.json, each timed with its wall time (any over 15 minutes is a failure to report), then the mutation gate.
Long commands: run them in the background and wait for them; keep each log in ${SP}/suite/ and read only tails and failure lines from it.
A failure: find its cause. If this PR caused it, fix it minimally, commit (message describing it, a blank line, "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>", "Claude-Session: ${SESSION}") and push only \`${GL} git -C ${WT} push origin HEAD:refs/heads/co-001/wip-packet-day-counts-2\` (fast-forward; never force or --no-verify), then re-run that part. A failure this PR did not cause: show that it fails the same way on origin/claude/build-platform too, and report it; one re-run at most to tell a flake from a failure, and name the root cause either way.
Synthetic data only; no model name or identifier in any file or commit. Keep ${SP}/progress/pdc7-suite.md up to date (each command and its result) and continue from it if it exists. You MUST finish by returning the structured result.`, { label: 'full-suite', phase: 'Suite', schema: { type: 'object', required: ['results', 'allPassed', 'failures', 'head', 'shardTimes'], properties: { results: { type: 'array', items: { type: 'object', required: ['command', 'result'], properties: { command: { type: 'string' }, result: { type: 'string' } } } }, allPassed: { type: 'boolean' }, failures: { type: 'string' }, head: { type: 'string' }, shardTimes: { type: 'string' } } } })
return suite
