export const meta = {
  name: 'lane-b-ux-suspended-standing-review-correctness',
  description: 'Correctness review of PR #56 against the database refusal, with the security checklist',
  phases: [{ title: 'Review', detail: 'correctness reviewer' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/4b2d015a-84c8-5610-8630-1a03db5b4a46/scratchpad'
const WT = '/home/user/ux-suspended-standing'
const FINDINGS = { type: 'object', properties: { verdict: { type: 'string', enum: ['merge after fixes', 'merge as is', 'do not merge'] }, findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, file: { type: 'string' }, line: { type: 'number' }, claim: { type: 'string' }, scenario: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'file', 'claim', 'scenario', 'fix'] } }, checked: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } }, required: ['verdict', 'findings', 'checked', 'summary'] }
phase('Review')
return await agent(`You are one of two adversarial reviewers of PaidWhole pull request #56 (PureTideWater/PhysicalTherapy, draft, head a1c41855, branch co-001/ux-suspended-standing): one account standing on the billing page, so a suspended organization never reads "In good standing". Read-only at ${WT}: git -C ${WT} diff origin/claude/build-platform...HEAD (base 88a0e4e9); read changed files whole. Do not edit, commit, push or post.
Save as you go: keep ${SP}/progress/ss-review-correctness.md up to date; continue from it if it exists.
Design: /home/user/ops/designs/lane-b-ux-suspended-standing.md with its "After the design review" section; review /home/user/ops/designs/lane-b-ux-suspended-standing-review.json.
YOUR LENS: correctness against the database's refusal, plus the security checklist (${WT}/.claude/agents/security-reviewer.md) for what this diff adds. In focus:
- Each accountStanding / standingKind state, for every organization kind (group, firm, internal) and every status x billing standing pair, against what the database actually does: organization_run_refusal, practice_run_refusal and billing_standing in packages/db/migrations (the billing migration and any later ones redefining them; grep the migrations for the latest definitions). Every sentence a customer reads must be true: whether runs are stopped, what lifts it, the holding invoice, ACH vs card.
- The holding invoice (billing_standing.invoice_id) and its Pay form outside the newest 24: authorization (payInvoiceAction checks the invoice belongs to the organization?), the db role (billing runs as tp_billing; no PHI), and that a holding invoice of another organization can never show.
- subscribe's new refusal for a closed organization: where status is read (race, role), its error code/words, the audit event.
- The seeded persona and group (apps/web/scripts/synthetic-personas.ts, the seed): synthetic only; sign-in fixtures intact; nothing in production code paths depends on it; the seed's own test.
- packages/billing/src/standing.ts as a shared module: imports nothing server-only if the web imports it on the client; the console billing page's sort and words.
- The support page's default category for from=billing; no open redirect or reflected value.
- Tests: do BIL-05 and BIL-06 prove their rows (docs/product/test-matrix.md), or pass vacuously? Run the unit tests for the changed files and the db tests billing-routes, onboarding-routes, seed and apps/worker billing under flock /tmp/laneb-heavy.lock (export PATH=/opt/node24/bin:$PATH; DATABASE_URL=postgres://postgres:test@localhost:5433/postgres; start PG18 as HANDOFF.md says if down).
For each defect: file:line, a concrete scenario, severity (blocking | should-fix | nit) and the exact fix. Assume there are some; no style preferences.`, { label: 'ss-review-correctness', phase: 'Review', schema: FINDINGS })