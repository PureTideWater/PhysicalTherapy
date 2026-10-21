export const meta = {
  name: 'co-001-pr-05-final-small-round',
  description: 'PR 5 final small round: packet_reference column in the payer CSV, the reconciliation journey waits for the stage, ADR 0061 records the rulings of 2026-10-21; no schema change; one review; fix',
  phases: [{ title: 'Build' }, { title: 'Review' }, { title: 'Fix' }],
}
const WT = '/home/user/pr5'
const BR = 'co-001/pr-05-packet-deadline'
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad'
const SHA = '6f72ea56563c379e05a601f3af019ad4ce3358f55cc02b06fcec17ea23d830a0'
const ATTR = `Every commit message ends with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR`
const CONTEXT = `Context. Repository puretidewater/physicaltherapy (PaidWhole). Worktree ${WT}, branch ${BR}, head 86d7edc, draft PR #30. Its domain model document is regenerated and its text's SHA-256 is ${SHA}. On 2026-10-21 the founder approved that exact text and will add the approval line themselves with a commit on GitHub at any moment: before you start and before every push run 'git -C ${WT} pull --no-rebase origin ${BR}' so their commit is never overwritten; never edit docs/product/domain-model.md or its approval line, never touch approvers.json, never rebase or force-push. Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH; GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks; Postgres 18 postgres://postgres:test@localhost:5433/postgres (never stop it; scratch databases tp_pr5f_<role>_<n>, dropped after); e2e port 4761. Logs in ${SP}/pr5-final/. Push with 'git push origin ${BR}' and the 2/4/8/16 s retry. ${ATTR} Keep the returned summary short: every check with its result, every open item.`
const RESULT = { type: 'object', properties: { summary: { type: 'string' }, head: { type: 'string' }, checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } }, open_items: { type: 'array', items: { type: 'string' } } }, required: ['summary', 'head', 'checks'] }
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, file: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] }, failure_path: { type: 'string' }, fix: { type: 'string' } }, required: ['title', 'file', 'severity', 'failure_path', 'fix'] } }, verdict: { type: 'string' } }, required: ['findings', 'verdict'] }
phase('Build')
const build = await agent(`${CONTEXT}

Your task, three small changes with no schema change:
1. The founder's ruling of 2026-10-21 (a D3 change): the payer's CSV schedule carries the packet's reference on every row, a packet_reference column, so the schedule still matches its letter if a portal drops the file name. Update the CSV writer, the export verifier if it reads the CSV, the leak scan and every test and fixture that pins the CSV's columns; the reference is the same 10-character reference the PDF and file name use. Update the checklist's payer_copy wording only if it names the CSV's contents (it must stay true).
2. The reconciliation e2e journey read the line stage 5 s after the deposited figure under load: make the step wait for the stage to read Recovered, the way it already waits for the figure (test-only; the ledger is untouched).
3. Record in ADR 0061, dated 2026-10-21: the founder approved the domain model text with SHA-256 ${SHA}; confirmed the reviewer's checklist wording as written; ruled the CSV carries packet_reference; ruled no remedy is needed for an export made before the guard whose pricing went stale since, because no environment has sent a real export. Update the test matrix and reconciliation-001 if they describe the CSV's columns.
Run: pnpm typecheck; pnpm lint (NODE_OPTIONS=--max-old-space-size=8192); pnpm lint:copy; the packets and worker unit tests; the packets db tests; the payer-copy and reconciliation e2e specs (port 4761); confirm 'git diff 86d7edc -- docs/product/domain-model.md packages/db/migrations' is empty and pnpm db:domain-model --check --strict passes on a fresh PG18 database. Commit and push. Return the summary, the head, every check and the open items.`, { label: 'build: CSV reference, journey wait, ADR', phase: 'Build', schema: RESULT })
if (!build) throw new Error('build failed')
phase('Review')
const review = await agent(`${CONTEXT}

You are an independent adversarial reviewer of 86d7edc..${build.head} (builder's summary, a claim: ${build.summary}). Do not edit ${WT}; clone into ${SP}/pr5-final/review if you need to run anything. Check: the packet_reference column is present on every row of every CSV route, equals the PDF's reference and the file name's, carries no PHI or internal identifier, and the verifier, hashes and attestation still cover the bytes the payer gets; no test was weakened; the journey wait cannot pass without the stage reading Recovered; the ADR entry states the rulings exactly; no schema, migration, domain-model, pricing, ledger or golden file changed. Report each finding with file, a concrete failure path and a fix; if nothing is wrong, say so with what you checked.`, { label: 'review: final small round', phase: 'Review', schema: FINDINGS })
phase('Fix')
const fix = (review && review.findings.some(f => f.severity !== 'nit')) ? await agent(`${CONTEXT}

Fix round. Verify each finding below; fix the real ones; say why for any you do not. Rerun the checks the build ran, commit and push.

Findings: ${JSON.stringify(review.findings, null, 2)}
Verdict: ${review.verdict}

Return the summary, the head, every check and the open items.`, { label: 'fix', phase: 'Fix', schema: RESULT }) : null
return { build, review, fix }
