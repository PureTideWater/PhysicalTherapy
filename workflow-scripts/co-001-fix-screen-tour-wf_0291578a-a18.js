export const meta = {
  name: 'co-001-fix-screen-tour',
  description: 'Fix what the founder screenshot tour found: the viewer seeing service dates on case detail first, then wrong coverage and audit-report figures, page overflows and copy; review, fix, verify with a re-shot tour',
  phases: [
    { title: 'Build', detail: 'privacy; numbers; layout and copy (parallel)' },
    { title: 'Review', detail: 'privacy and security; correctness and UI' },
    { title: 'Fix', detail: 'verify every finding, fix the real ones' },
    { title: 'Verify', detail: 'fresh clone, CI-equivalent, re-shot tour' },
  ],
}

const WT = '/home/user/fix-screens'
const BR = 'co-001/fix-screen-tour'
const TOUR = '/tmp/claude-0/screen-tour/apps/web/e2e/tour.spec.ts'
const SHOTS = '/tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad/screens'
const AFTER = '/tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad/screens-after'
const COMMON = `
You are fixing defects a screenshot tour of the PaidWhole web app found, on SYNTHETIC data only, in the git worktree ${WT} on branch ${BR} (one pull request against claude/build-platform; NO schema change, NO migration). Run every command in ${WT}. Never edit, stage or commit in /home/user/PhysicalTherapy, /home/user/pr1, /home/user/pr2, /home/user/pr3, /home/user/co-001 or /home/user/pw-brand.
Read first: CLAUDE.md; .claude/rules/*.md (brand.md and privacy-and-tenant.md above all; brand.md stays exactly as it is); docs/product (the role and PHI visibility rules, the coverage definition, the audit report definition); docs/brand/BRAND.md for layout tokens; the copy lint added in PR 1.
The tour's findings (screens are PNGs in ${SHOTS}; you can look at them):
P1 PRIVACY (fix first, highest priority): 15-case-detail.png, as the ledger-viewer (Viewer role), shows service dates in the line labels of the case detail page, although Claims and lines states service dates are hidden for the Viewer role and Reconciliation hides them too. Make the case detail page gate every PHI field exactly as Claims and lines does, in the handler and the query (not by hiding in the browser), and audit every other page a Viewer can open (remittances, remittance detail, claims, coverage, cases, case detail, packets, reconciliation, reports, anomalies, dashboard) for the same class of leak: service dates, patient names, member IDs, claim numbers, dates of birth. Responses that carry PHI keep Cache-Control: private, no-store.
N1 09-contracts.png: both contracts show "Coverage share: No pricing run yet" although the March run priced 4 of 4 lines under them. N2 the dashboard coverage line reads only the latest pricing run: after an April run whose plan was mapped as "no agreement" it showed "0 of 32 lines priced (0.0%)", hiding March's 4 of 4. Coverage must follow the definition in docs/product across the runs in effect, not the latest run. N3 20-audit-report.png reads "Attested ... by —": the reviewer who signed is shown as a dash; show the signer as the design says (name or role per the PHI-free identity rules). N4 an audit report generated after recovery, on the run then in effect, read $0 / $0 / $0 in its headline while its own cases table listed $120 and the ledger already had $30 approved and deposited: the headline and the cases table must come from the same lines, and recovered never counts without a ledger_entry at posted or deposited.
L1 10-contract-version.png: at a 1280 px viewport the page is 1325 px wide; the rate record table's "Approved by the contract specialist" column runs past its card. L2 16-packet-builder.png: the line schedule table is cut off on the right; "Window ends" is clipped. L3 the claims table as the billing manager (more columns than the viewer's) overflows its card and the Status column is cut off. No page may scroll horizontally at 1280 px; wide tables scroll inside their card or wrap, following the existing table pattern in the app (find it; do not invent a new one).
C1 copy: "PDF of a audit report" (19-reports.png) -> "an"; "its 1 linked entries" (18-roi-statement.png) -> correct singular and plural; the step label "Ncci ptp" (12-line-trace.png) -> "NCCI PTP" (find where labels are title-cased and fix the acronym handling, not just this one). C2 column headers that visibly run together: "ClaimsBalanced" (05-remittances.png), "Patient responsibilityLinks" (06-remittance-detail.png), "LinesRemedy" (08-coverage.png): fix the header markup or spacing so each header is its own cell with its own spacing. C3 11-pricing-run.png shows an empty unpriced-reasons table header when there are no unpriced lines: show the app's empty state instead.
OUT OF SCOPE (do not fix here; change order PR 11 brings re-pricing to cases): after a monitoring re-price, the packet builder refuses with "a line of the case was priced again since it joined; the case is judged again first". Leave it.
Hard rules: no migration, no DDL, no change to catalog.ts, no change under packages/pricing/src (non-test), no change to ledger semantics (LEDGER_STAGES, matching, the recovered total), nothing under content/ or tools/verify-content; money is integer cents, never a float; code computes every number; no hex outside tokens.css (brand.md); every figure in the mono font with tabular numerals. If a fix seems to need any of those, stop and say so in open_items instead. No real PHI anywhere; debug only with SYNTHETIC twins (packages/synth). Never log names, dates of birth, member IDs, claim numbers or document text.
Every fix comes with a test that fails before it and passes after: route or db tests for P1 (a Viewer request to case detail returns no service date, asserted on the response, plus an e2e assertion), unit or db tests for N1 to N4, and an e2e check that the pages of L1 to L3 have document.documentElement.scrollWidth <= 1280 at a 1280 px viewport with the data that overflowed (the tour's shape: a rate record with a long approver line, a packet line schedule, the billing manager's claims table). If a brand screenshot baseline (apps/web/e2e/brand.spec.ts) changes because of an intended change, regenerate it the way the repo documents (FONTCONFIG_FILE and the pinned chromium flags) and say which and why.
Environment, matching CI: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH; Postgres 18 at postgres://postgres:test@localhost:5433/postgres (superuser); Postgres 16 at 5432 is used by others, do not stop either. Databases tp_fix_<role>_<n> (drop when done); e2e E2E_DATABASE=tp_fix_e2e_<role>, E2E_PORT 3701 (privacy), 3711 (numbers), 3721 (layout), 3731 (fix), 3741 (verify), 3751 (tour). Other workflows run at the same time on other ports and databases; never touch theirs. Local gitleaks 8.24.3 is at /tmp/claude-0/gitleaks/gitleaks.
Commit at checkpoints in the repository's style (git log), each message ending with:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR
Push after each commit: git -C ${WT} push -q -u origin ${BR} (retry 4 times, 2/4/8/16 s). Stage only paths you changed; never git add -A, stash, reset --hard, clean, or touch another agent's files.
`
const CHECKS = { type: 'object', properties: { summary: { type: 'string' }, head: { type: 'string' }, checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed', 'note'] } }, open_items: { type: 'array', items: { type: 'string' } } }, required: ['summary', 'head', 'checks', 'open_items'] }
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, file: { type: 'string' }, issue: { type: 'string' }, reference: { type: 'string' }, fix: { type: 'string' } }, required: ['severity', 'file', 'issue', 'reference', 'fix'] } }, checked: { type: 'array', items: { type: 'string' } } }, required: ['findings', 'checked'] }

phase('Build')
const setup = await agent(`${COMMON}
Your role: setup. git -C /home/user/PhysicalTherapy fetch -q origin claude/build-platform; git -C /home/user/PhysicalTherapy worktree add ${WT} -b ${BR} origin/claude/build-platform. If ${WT} exists from an earlier attempt, keep its commits. Run pnpm install --frozen-lockfile and pnpm typecheck. Then find, for every finding, the files that produce it (page, component, query, report generator, label helper) and write a short plan (in your summary) splitting the work between three agents with NO shared files: "privacy" (P1 and its audit), "numbers" (N1 to N4) and "layout" (L1 to L3, C1 to C3). Name the exact files each owns and, where two findings touch one file, give it to one agent and say what the other must ask for. Do not implement. Commit nothing.`, { label: 'set up the worktree and split the work', phase: 'Build', schema: CHECKS })
if (!setup) throw new Error('setup failed')

const builders = await parallel([
  () => agent(`${COMMON}
Your role: privacy (P1, port 3701). The plan: ${setup.summary}
Fix P1 in the files the plan gives you, then audit the other Viewer pages for the same class of leak and fix what you find. Tests as COMMON says. Run typecheck, lint, lint:logs, test, the route and db tests you touched, and the e2e specs you touched, on Postgres 18. Commit and push. Return what you fixed, the pages you audited and what each showed, checks and open items.`, { label: 'privacy: the viewer sees no service date', phase: 'Build', schema: CHECKS }),
  () => agent(`${COMMON}
Your role: numbers (N1 to N4, port 3711). The plan: ${setup.summary}
Fix N1 to N4 in the files the plan gives you. Reproduce each with SYNTHETIC data in a test first (the tour's shape: March priced 4 of 4 under two contracts, then an April run of 32 lines under a no-agreement plan; an audit report generated after a recovery reached deposited). Keep the computation in code, integer cents, recovered only from ledger entries at posted or deposited. Run typecheck, lint, lint:logs, test, test:golden, and the db tests you touched on Postgres 18. Commit and push. Return what you fixed, checks and open items.`, { label: 'numbers: coverage share, dashboard coverage, audit report', phase: 'Build', schema: CHECKS }),
  () => agent(`${COMMON}
Your role: layout and copy (L1 to L3, C1 to C3, port 3721). The plan: ${setup.summary}
Fix them in the files the plan gives you, using the app's existing table and empty-state patterns and the brand tokens. Add the 1280 px no-horizontal-scroll e2e checks. Run typecheck, lint (including the copy lint), test, and the e2e specs you touched (brand.spec.ts too). Commit and push. Return what you fixed, checks and open items.`, { label: 'layout and copy', phase: 'Build', schema: CHECKS }),
])
const built = builders.map((b, i) => `${['privacy', 'numbers', 'layout'][i]}: ${b ? b.summary : 'returned nothing'}`).join('\n')

phase('Review')
const REVIEW = `${COMMON}
You are a reviewer. Do not edit, commit or push in ${WT}; experiment only in a scratch clone (git clone ${WT} /tmp/claude-0/fix-review-<role>) with your own databases. Builders reported:
${built}
Report only real problems, with evidence (command and output, or file and line), the rule broken, severity (blocker: breaks a hard rule, leaks PHI, or leaves a tour finding unfixed; major; minor), and the fix.`
const reviews = await parallel([
  () => agent(`${REVIEW}
Your role: privacy and security (the security reviewer's brief: tenant isolation gaps and PHI leaks in schema, queries, routes, jobs and logging). As a Viewer, request every page and every route handler or server action the Viewer pages call, directly (not through the browser UI), and look for service dates, names, member IDs, claim numbers or dates of birth in HTML, RSC payloads, JSON and headers; confirm the gating is in the handler and the query, not only in a component; confirm Cache-Control on PHI responses; confirm no new log field carries PHI (pnpm lint:logs); run the catalog and cross-tenant tests on Postgres 18. Then diff the PR (git diff origin/claude/build-platform...${BR}) against the hard rules: no migration, DDL, catalog.ts, pricing, ledger-semantics or content change.`, { label: 'review: privacy and security', phase: 'Review', schema: FINDINGS }),
  () => agent(`${REVIEW}
Your role: correctness and UI. For N1 to N4: check the coverage figures follow the docs/product definition across runs in effect (construct a case the builder's tests miss: two runs for the same period where one supersedes the other, a run with lines both priced and unpriced), integer cents throughout, the audit report headline equals its cases table, recovered only from ledger entries at posted or deposited, the attested-by identity carries no PHI. For L1 to L3 and C1 to C3: run the pages at 1280 px and 390 px in your clone with the tour's data shape and confirm no horizontal page scroll, nothing clipped, headers separated, the acronym fix general, the copy lint passes, and brand.md is respected (tokens, mono tabular figures, no hex). Confirm every fix has a test that would fail without it (revert one fix at a time in your clone and run its test).`, { label: 'review: correctness and UI', phase: 'Review', schema: FINDINGS }),
])
const findings = reviews.filter(Boolean).flatMap((r, i) => r.findings.map((f) => ({ ...f, reviewer: ['privacy', 'correctness'][i] })))
log(`${findings.length} findings; ${reviews.filter((r) => !r).length} reviews returned nothing`)

phase('Fix')
const fix = findings.length ? await agent(`${COMMON}
Your role: fix (port 3731). Reviewers reported on ${BR}:
${JSON.stringify(findings, null, 1)}
Verify each first; fix the real ones minimally with tests; reject others with evidence. Run typecheck, lint, lint:logs, test, and the affected db and e2e tests on Postgres 18. Commit and push. Summary: one line per finding.`, { label: 'fix review findings', phase: 'Fix', schema: CHECKS }) : null

phase('Verify')
const verify = await agent(`${COMMON}
Your role: verify (ports 3741 and 3751). Do not edit the worktree. Remove /tmp/claude-0/fix-verify only if you created it, then git clone --branch ${BR} ${WT} /tmp/claude-0/fix-verify and git -C /tmp/claude-0/fix-verify fetch origin claude/build-platform from GitHub (git remote set-url origin https://github.com/PureTideWater/PhysicalTherapy first if needed). Run with CI=true and record each: pnpm install --frozen-lockfile; typecheck; lint; lint:logs; the local gitleaks over this PR's first-parent range; verify-content; tools/check-releases-immutable.sh origin/claude/build-platform; synth --all then git status --short clean; pnpm test; test:golden; test:oracle; a fresh Postgres 18 database, db:migrate, test:db; test:e2e; build; cdk:diff.
Then re-shoot the tour: copy ${TOUR} into the clone at apps/web/e2e/tour.spec.ts (it is TEMPORARY and is never committed; delete it after) and run it with TOUR_SHOTS_DIR=${AFTER} TOUR_WORK_DIR=/tmp/claude-0/fix-verify-tour-work E2E_DATABASE=tp_fix_tour E2E_PORT=3751 E2E_ADMIN_URL=postgres://postgres:test@localhost:5433/postgres pnpm --filter @tp/web exec playwright test e2e/tour.spec.ts. If the spec needs a small change to run against the fixed app (a renamed label), change only your temporary copy and say what. Look at each re-shot screen that had a finding (02, 05, 06, 08, 09, 10, 11, 12, 15, 16, 18, 19, 20, also the billing manager's claims view if the tour captures it) and say, finding by finding, whether it is fixed in the image; confirm every image shows only SYNTHETIC data. Drop tp_fix_tour after. Commit nothing. Return every check with its result, the per-finding verdict and the head verified.`, { label: 'fresh-clone verification and re-shot tour', phase: 'Verify', schema: CHECKS })

return { setup, builders, findings, fix, verify }
