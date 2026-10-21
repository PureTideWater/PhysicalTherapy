export const meta = {
  name: 'co-001-governance-final-verify',
  description: 'Governance final fresh-clone verification at 0acf852: scope, the new proofs (fixture gap closed, pre-push refusals), the doc rulings, and CI read for the head',
  phases: [{ title: 'Verify' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad'
const RESULT = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    head: { type: 'string' },
    ci: { type: 'string' },
    checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } },
    open_items: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'head', 'ci', 'checks'],
}
phase('Verify')
return await agent(`You are the final fresh-clone verification of pull request #25 (puretidewater/physicaltherapy, branch co-001/governance, expected head 0acf8524a3857bf4156d8ff98fd19bdbaf5b2731, base claude/build-platform at 262d37d). Its full suite already passed in a fresh clone at 98392bf; since then two fix commits (f890ffc tools, cd42a64 docs) and one docs commit (0acf852, the founder's rulings) landed. Under the founder's ruling of 2026-10-20, this verification does not rerun the suite GitHub CI runs; it reads CI's result and does what CI cannot. Do not use or edit /home/user/governance. Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH; gitleaks 8.24.3 at /tmp/claude-0/gitleaks/gitleaks; actionlint at ${SP}/gov-r2/actionlint. Work in ${SP}/gov-final/ and delete your clone at the end. Keep the summary short: every check with its result and every open item.

1. Clone the repository from https://github.com/PureTideWater/PhysicalTherapy, check out origin/co-001/governance, confirm HEAD is 0acf852 and the merge base with origin/claude/build-platform is 262d37d.
2. Scope since 98392bf: only tools/fixture-check (or wherever the commit-mode check lives), packages/synth's shared header pattern if touched, hooks tests, the launcher message, docs, README, CLAUDE.md and the new-migration skill; no migration, schema, pricing, ledger or content change; docs/product/domain-model.md byte-identical to the base; every commit carries the two trailers.
3. pnpm install --frozen-lockfile; pnpm typecheck; pnpm lint (NODE_OPTIONS=--max-old-space-size=8192) only if typecheck passes; the fixture-check, hooks, pre-push and synth tests with GITLEAKS set; tools/test with ACTIONLINT set; pnpm check:fixtures; gitleaks over origin/claude/build-platform..HEAD with the repo's config and ignore file.
4. Proofs with the pre-push hook (git -c core.hooksPath=.githooks) against a local bare remote: a non-SYNTHSENDER X12 header (a) after a line of text in a .txt outside fixtures/, (b) in a .md code block, (c) mid-line in a .ts file, each refused by file and line; (d) prose mentioning ISA and a SYNTHSENDER interchange allowed; (e) a clean commit allowed; (f) a synthetic leak refused.
5. Read ADR 0063 and docs/runbooks/github-governance.md: confirm they record the founder's four confirmations of 2026-10-20 (the organization's content publisher; split rulesets for main's history and for release tags; v* tags created only by the founder; one pull request into main for Dependabot's settings and the pull request template, after this PR merges and before runbook step 5) consistently, with no paragraph still saying they await a ruling, and no line that renders as an unintended list item.
6. Read GitHub CI for head 0acf852 with the GitHub tools (ToolSearch for mcp__github__pull_request_read, method get_check_runs, pull 25): report each check run's status and conclusion. If ci's check is still running, report 'pending' with what has completed; do not wait or poll.
Return the summary, the head, the CI state in one line, every check and the open items.`, { label: 'final verify', phase: 'Verify', schema: RESULT })
