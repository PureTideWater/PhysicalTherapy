export const meta = {
  name: 'co-001-pr-06-audit-fixes',
  description: 'PR 6 audit fixes the founder approved on 2026-10-18: a floor of 11 claim lines per screening row enforced in the browser, the server and the database (audit #6), the screening template telling prospects to leave denied lines out (audit #1, template part), and ADR 0062 amended for the superseded ZIP+4 ruling (PR 6b); review and verify',
  phases: [
    { title: 'Build', detail: 'small-cell floor, template wording, ADR amendment' },
    { title: 'Review', detail: 'try to get a small cell through; guardrails' },
    { title: 'Fix', detail: 'verify every finding, fix the real ones' },
    { title: 'Verify', detail: 'fresh clone, CI-equivalent' },
  ],
}

const WT = '/home/user/pr6'
const BR = 'co-001/pr-06-free-screening'
const COMMON = `
You are finishing PaidWhole Change Order 001 pull request 6 (CO-04 free screening) in the git worktree ${WT} on branch ${BR} (head dfd48f8; built, reviewed and verified; not yet opened as a pull request; PR 5 merges first). Run every command in ${WT}. Never edit, stage or commit in /home/user/PhysicalTherapy, /home/user/pr5, /home/user/governance, /home/user/ops or /home/user/pw-brand.
The founder, Tyler Williams (use they/them), approved on 2026-10-18 after the best-option audit (scratchpad/best-option-audit/report.md, items #6 and #1):
1. Audit #6, critical: a screening row with a small claim count is one patient's service line, not de-identified under HIPAA Safe Harbor, and the prospect has no BAA. Require at least 11 claim lines per row (the CMS small-cell standard) as ONE setting enforced in the browser, in the server's check and in a database rule (a CHECK in this PR's own unmerged migration 20261104090000, applied only to scratch databases so far). The browser leaves small rows out before sending and tells the person how many rows, claim lines and dollars it left out; the result says so too. A request that bypasses the browser is refused with the row numbers, and nothing about the refused rows is stored but the counts the existing rejection reasons allow. The template and the upload page state the floor in plain words. Record in ADR 0062 that counsel confirms the number and whether it counts lines or patients (a plan of care can give one patient 11 lines in a quarter; if counsel says patients, a patient-count column is added later). Tests: 10 lines refused or left out in each layer, 11 accepted; the left-out totals are right; a direct POST with a 1-line row is refused and stores nothing PHI-shaped.
2. Audit #1, template part only: the screening template and upload page tell prospects to leave denied lines (zero-paid for authorization, visit limit, duplicate, timely filing, not covered) out of their totals, because a denial is not a rate variance. The triage change is PR 6d, not here.
3. The founder superseded ruling 3 (ZIP+4) at 11:47 UTC on 2026-10-18: ZIP+4 localities are fixed before launch in their own pull request, PR 6b (practice settings and screening accept a ZIP+4; the engine resolves the locality from it; five-digit ZIPs and golden lines unchanged; the change order's engine freeze is loosened for that lookup only). Amend ADR 0062's Owner rulings and reconciliation-001's Approval section to say so (dated, attributed), keeping the refusal in PR 6's code until PR 6b lands.
The founder's standing rule (2026-10-18): choose the best option for accuracy, quality, user experience, privacy and compliance, never weighted by build effort.
Hard rules: nothing under packages/pricing/src (non-test), fixtures/golden or the releases; no ledger change; the catalog and cross-tenant tests keep their rules and pass; no PHI anywhere; copy passes lint:copy (no owed, underpaid, recovered, no tagline). The domain model: regenerate docs/product/domain-model.md after the CHECK is added, leave it UNAPPROVED (never write an "Approved by:" line, never touch approvers.json); exactly one test:db case fails until the founder approves.
Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH; Postgres 18 at postgres://postgres:test@localhost:5433/postgres; Postgres 16 at 5432 is used by others; never stop either server. Databases tp_pr6a_<role>_<n> (drop when done); e2e E2E_DATABASE=tp_pr6a_e2e_<role>, E2E_PORT 4401 (build), 4421 (fix), 4431 (verify). Other workflows run at the same time; never touch their ports or databases. pnpm lint needs about 6 GiB of heap. gitleaks 8.24.3 at /tmp/claude-0/gitleaks/gitleaks. Logs in scratchpad/pr6a-<role>/; delete scratch clones you made.
Commit in the repository's style, each message ending with:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR
Push after each commit: git -C ${WT} push -q -u origin ${BR} (retry 4 times, 2/4/8/16 s). Stage only paths you changed; never git add -A, stash, reset --hard, clean, rebase or force-push.
`
const CHECKS = { type: 'object', properties: { summary: { type: 'string' }, head: { type: 'string' }, sha256: { type: 'string' }, checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed', 'note'] } }, open_items: { type: 'array', items: { type: 'string' } } }, required: ['summary', 'head', 'checks', 'open_items'] }
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, file: { type: 'string' }, issue: { type: 'string' }, reference: { type: 'string' }, fix: { type: 'string' } }, required: ['severity', 'file', 'issue', 'reference', 'fix'] } }, checked: { type: 'array', items: { type: 'string' } } }, required: ['findings', 'checked'] }

phase('Build')
const build = await agent(`${COMMON}
Your role: build (port 4401). Build the three items with their tests. Run typecheck, lint, lint:logs, lint:copy, test, test:golden, synth --all (clean), check:fixtures, test:db on Postgres 18 (report the one expected approval failure), and e2e/screening.spec.ts. Commit and push. Return what you built, the new document SHA-256 the generator prints, checks and open items.`, { label: 'small-cell floor, template wording, ZIP+4 amendment', phase: 'Build', schema: CHECKS })
if (!build) throw new Error('build failed')

phase('Review')
const REVIEW = `${COMMON}
You are a reviewer. Do not edit, commit or push in ${WT}; experiment only in a scratch clone (git clone ${WT} /tmp/claude-0/pr6a-review-<role>, deleted when you finish) with your own databases. The builder reported: ${build.summary}
Report only real problems with evidence, severity (blocker: a row under 11 claim lines can be stored or priced, PHI is stored, or a hard rule breaks; major; minor), and the fix.`
const reviews = await parallel([
  () => agent(`${REVIEW}
Your role: try to get a small cell through: direct POSTs with counts 0, 1, 10, 10.5, '11 ' as a string, negative, huge, a count split across two identical rows that each pass, the operator SECURITY DEFINER function called directly as the app role, an update of an existing row's count, and the browser's left-out totals (are the dollars and lines right, is anything about the left-out rows stored). Confirm the catalog and cross-tenant tests pass.`, { label: 'review: get a small cell through', phase: 'Review', schema: FINDINGS }),
  () => agent(`${REVIEW}
Your role: guardrails and wording. Check the diff since dfd48f8 against the hard rules; the CHECK is in migration 20261104090000 and the domain model regenerates and passes --strict with no approval line written; the template and page copy state the 11-line floor and the denied-lines guidance in plain words and pass lint:copy; ADR 0062 and reconciliation-001 record the superseded ZIP+4 ruling and counsel's open question accurately, dated and attributed.`, { label: 'review: guardrails and wording', phase: 'Review', schema: FINDINGS }),
])
const findings = reviews.filter(Boolean).flatMap((r, i) => r.findings.map((f) => ({ ...f, reviewer: ['small-cell', 'guardrails'][i] })))
log(`${findings.length} findings`)

phase('Fix')
const fix = findings.length ? await agent(`${COMMON}
Your role: fix (port 4421). Reviewers reported:
${JSON.stringify(findings, null, 1)}
Verify each first; fix the real ones minimally with tests; reject others with evidence. Regenerate the domain model (unapproved) if the schema changes. Run typecheck, lint, lint:copy, test, test:db on Postgres 18 and e2e/screening.spec.ts. Commit and push. Summary: one line per finding.`, { label: 'fix review findings', phase: 'Fix', schema: CHECKS }) : null

phase('Verify')
const verify = await agent(`${COMMON}
Your role: verify (port 4431). Do not edit the worktree. git clone --branch ${BR} ${WT} /tmp/claude-0/pr6a-verify (remove it first only if you created it), set origin to https://github.com/PureTideWater/PhysicalTherapy and fetch claude/build-platform. With CI=true record each: install --frozen-lockfile; check:fixtures; typecheck; lint; lint:logs; lint:copy; gitleaks over the range; verify-content; tools/check-releases-immutable.sh origin/claude/build-platform; synth --all then a clean tree; test; test:golden; test:oracle; a fresh Postgres 18 database, db:migrate, db:domain-model --check --strict; test:db (only the approval case fails); test:e2e; build; cdk:diff. Prove the 11-line floor in a scratch copy in all three layers. Update /tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad/pr6-approval-summary.md with the floor, the template guidance and the ZIP+4 amendment, noting the document is regenerated again after PR 5 merges. Delete your clone. Commit nothing. Return every check and the head verified.`, { label: 'fresh-clone verification', phase: 'Verify', schema: CHECKS })

return { build, findings, fix, verify }
