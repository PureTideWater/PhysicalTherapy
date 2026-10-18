export const meta = {
  name: 'co-001-pr-02-round-2',
  description: 'PR 2 second round: approver list, approval checks the committed text, full-hash messages, the pool-teardown race and the release test timeout; adversarial check; fresh-clone verify',
  phases: [
    { title: 'Fix', detail: 'approver list, approval hardening, teardown race, test timeout' },
    { title: 'Check', detail: 'try to defeat the approval gate and the teardown fix' },
    { title: 'Verify', detail: 'fresh clone on Postgres 18 and Node 24' },
  ],
}

const WT = '/home/user/pr2'
const BR = 'co-001/pr-02-domain-model'
const COMMON = `
You are working on PaidWhole Change Order 001 pull request 2 (CO-02, the domain model approval gate) in the git worktree ${WT} on branch ${BR} (head 6708f65, verified). Run every command in ${WT}. Never edit, stage or commit anything in /home/user/PhysicalTherapy, /home/user/pr1, /home/user/co-001 or /home/user/pw-brand. Read CLAUDE.md, docs/product/reconciliation-001.md (PR 2, D1, D2) and the README's domain model gate section first.
Environment, matching CI: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH (node v24, Python 3.12 with pyx12); Postgres 18.4 at postgres://postgres:test@localhost:5433/postgres (superuser). Postgres 16 at port 5432 is used by other agents; do not stop either server. Use databases named tp_pr2r2_<role>_<n> and drop them when done; for e2e use E2E_DATABASE=tp_pr2r2_e2e and E2E_PORT 3431.
Hard rules: no migration or schema change; nothing under packages/pricing/src, packages/ledger/src, content/, tools/verify-content, .claude/hooks, publish-content.yml; catalog.ts rules unchanged; CLAUDE.md, PRD.md and data-dictionary.md unchanged in this round; no real PHI. Never write any person's name into the approval line or the approver list; the founder supplies that later.
Commit in the repository's style (git log), each message ending with:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR
Push after each commit: git -C ${WT} push -q origin ${BR} (retry 4 times, 2/4/8/16 s backoff). Stage only paths you changed; never git add -A, stash, reset --hard or clean.
`
const CHECKS = { type: 'object', properties: { summary: { type: 'string' }, head: { type: 'string' }, checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed', 'note'] } }, open_items: { type: 'array', items: { type: 'string' } } }, required: ['summary', 'head', 'checks', 'open_items'] }
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, file: { type: 'string' }, issue: { type: 'string' }, fix: { type: 'string' } }, required: ['severity', 'file', 'issue', 'fix'] } }, checked: { type: 'array', items: { type: 'string' } } }, required: ['findings', 'checked'] }

phase('Fix')
const fix = await agent(`${COMMON}
Your role: fix (round 2). Make these changes, each with tests, minimal and in the repository's style:
1. Approver list (guardrails review, major): today approval.ts accepts any non-empty name ("Claude", "TBD", "N/A", "-", "<name>" all pass) and the hash is printed on the line, so anyone could write a passing line. Add a reviewed approver list, packages/db/domain-model/approvers.json (format like {"format":"tp-domain-model-approvers/1","approvers":[]} plus a short "note" field saying it changes only with the founder's approval, in the same pull request as a signed document), read by the tool. --require-approval must refuse a name that is not exactly on the list (after trimming; case-sensitive or a documented normalisation), a name with no letters, and placeholder words (TBD, N/A, name, founder, approver, VERIFY ONLY, Claude, any text in angle brackets). Commit the list EMPTY: no name. An empty list refuses every approval with a clear message ("no approver is listed in packages/db/domain-model/approvers.json"). README: say where the list is and that the founder's name is added with the founder's approval. Unit tests for every refusal and for a listed name passing.
2. The approval case checks the committed text too (verify open item): require documentSha256(committed text) to equal the hash on the approval line, as well as the regenerated text's hash, so the approval case alone catches a body edit.
3. Messages (verify open item): print full 64-hex hashes in every approval mismatch, and say "the approval line's hash does not match this text" rather than claiming the document changed when the hash could simply be mistyped. --require-approval prints the hash the founder must sign (the hash of the compared text) when the line is awaiting, so the founder never has to find it.
4. The pool-teardown race (guardrails review, minor but makes test:db exit 1 under load): packages/model-gateway/src/gateway.db.test.ts (and any other db test with the same shape) ends pg pools and then createScratchDatabase().drop() runs DROP DATABASE ... WITH (FORCE), which kills backends of sockets still closing; the pools' idle clients then emit 57P01 with no error handler, an unhandled error that fails the run. pg-pool's end() resolves before its sockets close. Fix it at the root in the shared test support (packages/db/src/testing.ts or wherever pools are created for tests): an endPool helper that attaches an error listener and waits for every client's 'remove' (or 'end') before resolving, used before every drop; or the scratch database's drop() terminating backends itself only after its pools have closed. Find every test that ends a pool and then drops a database (grep) and route them through the helper. Reproduce the race first (a test that ends a pool with idle clients then drops the database with FORCE, under artificial delay) and show it fails before and passes after.
5. tools/release/release.test.ts 'stops pnpm release:load before it connects to any database' hit the 5 s default timeout at load 11 on 4 cores: it spawns a subprocess. Give the subprocess-spawning tests in that file an explicit, justified timeout (for example 60 s) like other spawning tests in the repo do (grep for their pattern), without changing what they assert.
Run typecheck, lint, lint:logs, pnpm test (twice), and pnpm test:db on Postgres 18 (expect only the approval case to fail). Commit and push. Return what changed, with commits, and the checks.`, { label: 'round 2 fixes', phase: 'Fix', schema: CHECKS })
if (!fix) throw new Error('fix failed')

phase('Check')
const check = await agent(`${COMMON}
Your role: adversarial check. Do not edit, commit or push in ${WT}; work in a scratch clone (git clone ${WT} /tmp/claude-0/pr2r2-check). The fix agent reported: ${fix.summary}
Try hard to defeat the approval gate at the new head: write a passing approval line without a listed approver; use a listed name with whitespace or case tricks; insert a second approval line; edit the body and re-sign with the edited text's hash; edit the committed document by hand without regenerating; paste an old approval onto new text; change approvers.json and the line together (this should pass the tool, and the README must say the list changes only with the founder: check it does); use a date in the future or before 2026-10-16. For each attempt show the command and the result. Then try to break the teardown fix: run packages/model-gateway/src/gateway.db.test.ts and the other tests that use the helper 10 times in a row under load (run pnpm test:db's db project concurrently, or a CPU burner) on Postgres 18, and report any 57P01 or unhandled error. Check the release test timeout change asserts the same things as before. Report real problems only, with evidence, and what you checked and found sound.`, { label: 'try to defeat the gate and the teardown fix', phase: 'Check', schema: FINDINGS })

const findings = (check && check.findings) || []
let refix = null
if (findings.length) {
  refix = await agent(`${COMMON}
Your role: fix the adversarial check's findings at the current head:
${JSON.stringify(findings, null, 1)}
Verify each first; fix the real ones with tests; reject others with evidence. Run typecheck, lint, test and the affected db tests on Postgres 18. Commit and push. Summary: one line per finding.`, { label: 'fix the check findings', phase: 'Check', schema: CHECKS })
}

phase('Verify')
const verify = await agent(`${COMMON}
Your role: verify. Do not edit the worktree. Remove /tmp/claude-0/pr2r2-verify only if you created it before, then git clone --branch ${BR} ${WT} /tmp/claude-0/pr2r2-verify. In the clone run and record each: pnpm install --frozen-lockfile; typecheck; lint; lint:logs; verify-content; tools/check-releases-immutable.sh origin/claude/build-platform (fetch the ref from GitHub: git fetch origin claude/build-platform); synth --all then git status --short clean; pnpm test; test:golden; test:oracle; a fresh Postgres 18 database, db:migrate, then pnpm db:domain-model --check --strict and --check --require-approval (expect the approval refusal naming the empty approver list and printing the hash to sign); test:db (expect exactly the approval case to fail; any other failure or any unhandled error is a real failure); test:e2e; build; cdk:diff. Then in a second scratch copy, add the placeholder approver "Verify Only Person" to approvers.json and sign with that name, today's date and the printed hash, and show the approval case and the CLI pass; then remove the name from the list and show it fails. Commit nothing. Return every check, the head verified, and the exact hash the founder signs.`, { label: 'fresh-clone verification', phase: 'Verify', schema: CHECKS })

return { fix, check, refix, verify }
