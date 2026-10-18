export const meta = {
  name: 'co-001-pr-01-brand-copy',
  description: 'Change Order 001 PR 1: merge brand/paidwhole into the finished head, close the CO-01 acceptance gaps, add the CO-11 copy and copy lint, review, fix and verify in a fresh clone',
  phases: [
    { title: 'Merge', detail: 'worktree, merge brand/paidwhole, resolve conflicts, renumber ADRs' },
    { title: 'Build', detail: 'CO-01 gaps and CO-11 copy in parallel, then visual baselines and docs' },
    { title: 'Review', detail: 'brand, security, guardrails and merge, copy lint' },
    { title: 'Fix', detail: 'verify every finding, fix the real ones' },
    { title: 'Verify', detail: 'fresh clone, every check' },
  ],
}

const WT = '/home/user/pr1'
const BR = 'co-001/pr-01-brand-copy'
const REC = '/home/user/co-001/docs/product/reconciliation-001.md'
const CO = '/home/user/co-001/docs/product/change-order-001.md'

const COMMON = `
You are working on PaidWhole Change Order 001, pull request 1 (CO-01 brand drop-in and CO-11 positioning and copy), in the git worktree ${WT} on branch ${BR}. Run every command in ${WT} (cd ${WT} first, or use absolute paths). Never edit, stage or commit anything in /home/user/PhysicalTherapy (the main checkout) or /home/user/pw-brand (the brand branch checkout); read them only.

Read first: the change order ${CO} (sections CO-01, CO-11, "What must not change"), the approved reconciliation ${REC} (milestone 3 row, PR 1, decisions D6 to D11, "What must not change, as checks", and "Approval" at the end), docs/brand/BRAND.md and .claude/rules/brand.md (after the merge they are in ${WT}), and the brand ADRs.

Decisions already made by the owner (do not reopen them):
- D6: brand/paidwhole merges now; its ADRs 0054 and 0055 become 0056 and 0057, because main's 0054 and 0055 exist and applied migrations cite them.
- D7 option (b): email art under /brand/* is served from the CloudFront static host (the same exception that already exists for /_next/static/*, STATIC_PATH_PATTERN in infra/lib/constructs/edge.ts, tested in infra/test/edge.test.ts). The mail template takes its art URL from STATIC_ASSET_ORIGIN. The application's own response headers stay exactly as ADR 0053 and ADR 0055 set them: remove the branch's Cross-Origin-Resource-Policy: cross-origin rule for /brand/* (PUBLIC_BRAND_ASSET_HEADERS in apps/web/src/lib/http/security-headers.ts and its use in apps/web/next.config.ts). When no static host is configured (local builds), email is sent without the art.
- D8: a dispute packet carries the practice's name as letterhead with no PaidWhole lockup (what the branch does). Do not change packet templates in this PR otherwise; their neutral wording is PR 12.
- D9: accept the branch's six brand choices (stacked lockup on Paper at sign-in with BRAND.md section 3 corrected; Slate text on unpriced chips; dark mode stays off; hex allowlist of four exact files; committed pixel baselines and CI artifacts; --pw-input-border and --pw-danger-bg). Record that (2) --pw-unpriced contrast and (6) the added colors are sent to the brand owner, who alone changes the palette.
- D10: stage and enum codes (for example the line stage value 'recovered', CSV column codes, API codes) are exempt; the copy lint reads user-facing labels and text only. Never rename a code.
- D11 option (a): the descriptor goes in the page metadata, the web manifest and the request-audit page lede; the independence claim goes on the request-audit page and the audit report cover. Sign-in stays undecorated. (Screening does not exist yet; when it does it shows the lockup without the tagline.)
- Docs: docs/product/change-order-001.md and docs/product/reconciliation-001.md arrive in a separate step 0 pull request. Do not add them here.

Hard rules for this PR (from the change order and CLAUDE.md; a change that seems to need breaking one stops and reports instead):
- No change to any non-test file under packages/pricing/src. fixtures/golden and fixtures/synthetic/rules/release-synth-900001 to 900004 unchanged.
- packages/ledger/src: additions only (the branch's reportReconciliation() and recoveredLabel()). LEDGER_STAGES, matching rules and the recovered total untouched.
- Nothing under content/releases, tools/verify-content, .claude/hooks/protect-content.sh or .github/workflows/publish-content.yml changes.
- No migration is added or edited. No schema change at all in this PR.
- packages/db/src/catalog.ts rules unchanged. Response headers from ADR 0053 and 0055 unchanged (D7).
- No real PHI, real 835, real contract or real export anywhere. Synthetic only.
- Money stays integer cents; no float on an amount.

Working rules:
- Commit at checkpoints with clear messages in the repository's style (look at git log), each ending with these two lines:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR
- After each commit, push: git -C ${WT} push -q -u origin ${BR} (retry up to 4 times with 2s, 4s, 8s, 16s backoff on network errors). The container can restart; pushed work survives it.
- Stage only the paths you changed (git add <paths>); never git add -A, git stash, git reset --hard, git checkout -- on files you did not change, or git clean.
- Use your own database and port names so you never collide with other agents: databases named tp_pr1_<your role>_<n>, E2E_DATABASE=tp_pr1_e2e_<your role>, E2E_PORT between 3300 and 3399 chosen from your role (merge 3301, co01 3311, co11 3321, finish 3331, fix 3341, verify 3351). The local Postgres and MinIO are already running (see README for connection settings); if not, start them the way the README says.
- The oracle python is TP_ORACLE_PYTHON=/root/.venvs/tp-oracle/bin/python.
`

const CHECKS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    head: { type: 'string', description: 'commit sha at the end' },
    checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed', 'note'] } },
    open_items: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'head', 'checks', 'open_items'],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          file: { type: 'string' },
          issue: { type: 'string', description: 'what is wrong, with the evidence (command output, line numbers)' },
          reference: { type: 'string', description: 'the change order item, decision, rule or plan section it breaks' },
          fix: { type: 'string' },
        },
        required: ['severity', 'file', 'issue', 'reference', 'fix'],
      },
    },
    checked: { type: 'array', items: { type: 'string' }, description: 'what you checked and found sound' },
  },
  required: ['findings', 'checked'],
}

phase('Merge')
const merge = await agent(`${COMMON}
Your role: merge (port 3301).

1. Create the worktree: git -C /home/user/PhysicalTherapy fetch -q origin claude/build-platform brand/paidwhole, then git -C /home/user/PhysicalTherapy worktree add ${WT} -b ${BR} origin/claude/build-platform (head 9ad1680, the end of the milestone 10 and 11 fix pass). If ${WT} already exists from an earlier attempt, inspect it, keep its commits and continue from there.
2. Merge brand/paidwhole (7994f15) with a merge commit (no rebase, no squash). Six files conflict in a trial merge: apps/web/next.config.ts, apps/web/src/app/console/tickets/page.tsx, apps/web/src/components/shell.tsx, apps/web/src/lib/http/readiness.test.ts, apps/worker/build.ts and apps/worker/src/platform/wiring.ts. Eleven more auto-merge but changed on both sides (README.md, apps/web/e2e/models.spec.ts, apps/web/scripts/synthetic-personas.ts, the console organization and specialist-queue pages, apps/web/src/app/support/page.tsx, abstraction/versions/[versionId]/page.tsx, apps/web/src/components/help.ts, apps/web/src/components/models/display.tsx, apps/web/src/lib/http/security-headers.ts, apps/worker/package.json). Resolve every conflict so that BOTH sides' intent survives: every fix-pass change (security, the static asset origin from d54660f, the support-mail ticket source from c220f82, the console model controls, body limits, the 413 handling, the Textract wiring, loading.tsx reverted in 9ad1680) is kept exactly, and the brand's visual changes are applied on top. Read git log -p for each side of each conflicted file before resolving. For the CORP rule on /brand/* (D7), resolve so the app's headers are the fix pass's; the co01 agent finishes D7 after you.
3. Renumber the brand ADRs: 0054-wear-the-paidwhole-brand-... becomes 0056-..., 0055-render-the-verified-seal-... becomes 0057-... (git mv). Update every citation of those two brand ADRs (about 28: comments, docs, BRAND.md, .claude/rules/brand.md, tests, README) to 0056 and 0057. Do NOT change any citation that refers to main's own ADR 0054 or 0055 (model figures, model calls off the connection, billing logins); applied migrations 20261031090000 and 20261101090000 to 20261101120000 cite those and must not be edited. Check each citation's meaning before changing it. Fix the heading numbers inside the renamed files too, and any ADR index.
4. Run: pnpm install --frozen-lockfile (the lockfile must merge cleanly; if it conflicts, regenerate it with pnpm install, never by hand), pnpm typecheck, pnpm lint, pnpm lint:logs, pnpm test, then pnpm test:e2e with your own E2E_DATABASE and E2E_PORT (migrate and seed that database first the way the e2e setup expects; read apps/web/playwright.config.ts and README). Fix whatever the merge broke, keeping both sides' intent.
5. Commit the merge (and any follow-up fix commits) and push.

Return a summary of each conflict and how you resolved it, the ADR renumbering, and the checks you ran.`, { label: 'merge brand into the head', phase: 'Merge', schema: CHECKS_SCHEMA })

if (!merge) throw new Error('merge agent failed')
log(`merged at ${merge.head}`)

phase('Build')
const [co01, co11] = await parallel([
  () => agent(`${COMMON}
Your role: co01 (port 3311). The merge agent has merged brand/paidwhole into ${BR} at ${merge.head} (its report: ${merge.summary}). Another agent (co11) works in the same worktree at the same time on the CO-11 copy: it owns packages/brand/src/tokens.ts, tools/brand-copy, user-facing copy strings in apps/web and apps/worker/src/report, apps/web/src/components/reconciliation/display.tsx and the reports pages. Do not edit those files; if you need a change in one, describe it in your open_items. You own the files listed below. If a test fails because of co11's half-finished work, re-run it later rather than changing their files.

Close the CO-01 acceptance gaps (reconciliation milestone 3 row and PR 1; CO-01 acceptance: "a lint check fails on any hex color outside packages/brand/src/tokens.css and email templates; VerifiedSeal and VerifiedBadge render nothing when reconciledToCash is false; no page requests fonts.googleapis.com or fonts.gstatic.com"):
1. Hex allowlist (D9 item 4): tools/brand-colors/scan.ts allows the whole packages/brand/src/ prefix today. Narrow ALLOWED to exactly packages/brand/src/tokens.css, packages/brand/src/tokens.ts, packages/brand/src/mark.ts and apps/worker/src/mail/template.ts. Add a test that a hex color in any other file under packages/brand/src (for example name.ts or a new file) fails the scan, and that each allowed file passes. Keep it running in pnpm test.
2. Fonts: add an ESLint no-restricted-imports rule refusing next/font/google everywhere, and a source scan (in tools/brand-colors or a sibling tool, run in pnpm test) that fails on the strings fonts.googleapis.com or fonts.gstatic.com in apps, packages, tools and infra source (not docs/). Prove both fail on a fixture. Add or extend a Playwright test that loads the main public and signed-in pages and asserts no request goes to either host. Confirm (and test if not already tested) that VerifiedSeal and VerifiedBadge render nothing when reconciledToCash is false, in both the web components and the worker report renderer.
3. D7: remove the application-level Cross-Origin-Resource-Policy: cross-origin rule for /brand/* (security-headers.ts PUBLIC_BRAND_ASSET_HEADERS and next.config.ts), so the app's own headers are exactly the fix pass's. Serve /brand/* from the CloudFront static host instead: read how infra/lib/constructs/edge.ts serves STATIC_PATH_PATTERN (/_next/static/*) since d54660f, and how the static files get to that origin (image build, STATIC_ASSET_ORIGIN, the asset prefix). Extend it so /brand/* is served the same way with the same response headers policy, and assert it in infra/test/edge.test.ts. Make apps/worker/src/mail/template.ts take the lockup URL from STATIC_ASSET_ORIGIN (configuration read the way the worker reads its other settings), and send the email without the image when it is unset; update mail.test.ts and the e2e email test. Note: the publish step that puts public/brand files on the static origin must exist; if static files reach CloudFront through a build or upload step, make sure public/brand is included and tested.
4. CI artifact: the visual tests will save screenshots. Add to .github/workflows/ci.yml, after the e2e step, an actions/upload-artifact@v4 step with if: always() that uploads the Playwright report and test-results directories (find their paths in apps/web/playwright.config.ts). Change nothing else in ci.yml, and keep the release-immutability step exactly as it is.
You own: tools/brand-colors/**, the font scan tool, eslint config files, apps/web/next.config.ts, apps/web/src/lib/http/security-headers.ts and its tests, infra/**, apps/worker/src/mail/**, apps/worker config for STATIC_ASSET_ORIGIN, apps/web/e2e/brand.spec.ts (the font and seal parts) and any new e2e file you add, .github/workflows/ci.yml.
Run typecheck, lint, test, the infra tests, and the e2e tests you touched. Commit and push.
Return what you changed, the checks, and anything left for others.`, { label: 'CO-01 acceptance gaps and email art', phase: 'Build', schema: CHECKS_SCHEMA }),
  () => agent(`${COMMON}
Your role: co11 (port 3321). The merge agent has merged brand/paidwhole into ${BR} at ${merge.head} (its report: ${merge.summary}). Another agent (co01) works in the same worktree at the same time on the CO-01 gaps: it owns tools/brand-colors, eslint config, apps/web/next.config.ts, security-headers.ts, infra/, apps/worker/src/mail/, .github/workflows/ci.yml and the font and seal parts of apps/web/e2e/brand.spec.ts. Do not edit those; if you need a change in one, put it in open_items. If a test fails because of co01's half-finished work, re-run later rather than changing their files.

Implement CO-11 (change order section CO-11; reconciliation milestone 3 row and section 7 row; decisions D10 and D11):
1. In packages/brand/src/tokens.ts add the copy constants beside the existing tagline: tagline "Know what you're owed. Verify what you're paid." (exists; check exact text), descriptor "Contract-verified payment for therapy groups", independenceClaim "independent of the EMR and the payer", sealText ["VERIFIED BY PAIDWHOLE", "RECONCILED TO CASH"] (or two named constants), badgeText, and verifiedDefinition "Verified: recovered amounts reconcile to posted or deposited remittance; expected amounts trace to signed-off contract versions." Use these constants (never duplicated literals) in the web components and the worker report renderer, including the seal and badge SVG text if they are rendered from text. If the seal art is a fixed SVG with outlined text, verify its wording matches and leave it.
2. D11 placements: descriptor in the root page metadata (description) and the web manifest (apps/web/src/app/manifest.ts description), and as the lede of the request-audit page; the independence claim on the request-audit page and on the audit report cover. Sign-in stays undecorated.
3. "recovered" is always labelled posted or deposited: find every user-facing string in apps/web and the report templates (apps/worker/src/report and what it renders: audit report, ROI statement, coverage report, monthly summary) that says recovered without posted or deposited (about 23, for example packages/triage/src/headline.ts:42 if it is a display label, the five stage labels shown on screens, proofLevelWords in apps/web/src/components/reconciliation/display.tsx:39), and rewrite each to say what it is (for example "Recovered (posted)", "Recovered, posted or deposited"). Where a stored label is shown (apps/web/src/app/.../reports/page.tsx:154 shows a stored bare "Recovered"), render today's label from the code instead of the stored text. Stage codes and CSV/API codes are exempt (D10): never rename the value 'recovered'. Update the tests and e2e assertions that read these labels.
4. No "AI", "intelligence" or "ProofPack"/"proof pack" in product copy; never "independent verification platform". Fix any occurrence in apps/web and the report templates (milestone 13 keeps its PRD name in docs only).
5. Add tools/brand-copy: an AST-based copy lint (TypeScript compiler API or the parser the repo already uses) that reads string literals and JSX text in apps/web/src and apps/worker/src/report (not docs/, not test files' fixture data, not code identifiers or object keys used as codes) and fails on: ProofPack or proof pack (any case); the word AI as a standalone word; intelligence; independent verification platform; recovered not followed or preceded within the same label by posted or deposited; and, for files under any path containing /screening/, owed, underpaid or recovered (screening does not exist yet; make the rule ready and test it with a fixture). Allow an explicit, reviewed exemption comment for a code-like string, and keep the exemption list short and justified. Run it in pnpm test (the unit project includes tools/**/*.test.ts). Prove with fixtures that each forbidden term fails, that codes and docs are not read, and that the current tree passes.
You own: packages/brand/src/tokens.ts (and its tests), tools/brand-copy/**, copy in apps/web/src (pages and components except the files co01 owns) and apps/worker/src/report/**, packages/triage display labels if they are user-facing, and the tests that assert those labels.
Run typecheck, lint, test and the e2e journeys that assert the labels you changed. Commit and push.
Return what you changed (list every rewritten string), the checks, and anything left for others.`, { label: 'CO-11 copy constants, labels and copy lint', phase: 'Build', schema: CHECKS_SCHEMA }),
])

const finish = await agent(`${COMMON}
Your role: finish (port 3331). co01 and co11 have finished in ${WT}. Their reports:
co01: ${JSON.stringify(co01)}
co11: ${JSON.stringify(co11)}

1. Resolve any open item either of them left for the other's files.
2. Visual tests (CO-01 acceptance "visual tests of the header at 1280 and 390 px and the report cover with and without the seal"): apps/web/e2e/brand.spec.ts saves screenshots but compares no baseline. Add toHaveScreenshot comparisons for the app header at 1280 px and 390 px widths and for the report cover rendered with the seal (reconciledToCash true) and without it (false), using deterministic synthetic data, masked or frozen timestamps, and animations off. Choose a small tolerance (maxDiffPixelRatio around 0.01) and say why. CI on GitHub runs Google Chrome (channel 'chrome', see apps/web/playwright.config.ts) where this container runs Playwright's Chromium; to keep rendering identical, add a CI step before the e2e step in .github/workflows/ci.yml: pnpm --filter @tp/web exec playwright install --with-deps chromium, so CI uses the same Chromium build as here. Then commit the baselines generated here. Make sure the seal-absent baseline really has no seal (inspect the image) and that a test fails if the seal appears with reconciledToCash false.
3. Docs: the renumbered brand ADRs 0056 and 0057 stay as they are apart from numbering. Write ADR 0058 for this PR's decisions: D7 (email art from the static host; app headers unchanged), D9 (the six choices accepted; contrast of --pw-unpriced and the two added colors sent to the brand owner), D10 (codes exempt from the copy lint), D11 (placements), the exact-file hex allowlist, the font guard, the copy lint and its exemption rule, the visual baselines and the CI browser install. Follow the ADR template (docs/adr/0000-*). Update docs/brand/BRAND.md where it disagrees with what is built (section 3 sign-in lockup, section 7 email art as PNG from the static host). Copy the drop-in's README into packages/brand/README.md if it is not there (find it in /tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad/brand-unzipped, read only), with a first line saying it is the drop-in's wiring guide and where this repository differs. Update the root README's brand section.
4. Run everything: pnpm install --frozen-lockfile, typecheck, lint, lint:logs, verify-content, synth --all (git status clean afterwards), test, test:golden, test:oracle, db:migrate on a fresh database then test:db, test:e2e, build, cdk:diff. Fix what fails. Commit and push.
Return the checks and anything still open.`, { label: 'visual baselines, ADR 0058, docs, full checks', phase: 'Build', schema: CHECKS_SCHEMA })

phase('Review')
const REVIEW_COMMON = `${COMMON}
Since the build steps, ${BR} also merged claude/build-platform at 0c0fb77 (step 0: the change order documents, CI fixes for GitHub, the Node 24 large-zip test fix, Postgres 18 in the README) as commit 9052794; review the brand and copy work, not step 0. For parity with CI use Node 24 (export PATH=/opt/node24/bin:$PATH) and, for database tests, Postgres 18 at postgres://postgres:test@localhost:5433/postgres (Postgres 16 at 5432 also runs). You are a reviewer. Do not edit, commit or push anything in ${WT}; work in a scratch copy if you need to experiment (git clone ${WT} /tmp/claude-0/pr1-review-<your role>), and use your own database names. Review the PR diff: git -C ${WT} diff origin/claude/build-platform...${BR} (and the merge commit itself). Report only real problems, each with evidence (a command and its output, or file and line), the rule or decision it breaks, and the fix. Rate blocker (breaks a hard rule or an acceptance check), major (wrong behavior a user or reviewer would hit) or minor.`

const reviews = await parallel([
  () => agent(`${REVIEW_COMMON}
Your role: brand conformance. Check the built app against docs/brand/BRAND.md, .claude/rules/brand.md, CO-01 and CO-11, with screenshots: start the app on port 3361 against your own seeded database and capture the sign-in page, the dashboard header at 1280 and 390 px, a case page, the reconciliation screen, the reports screen, the request-audit page, and render the audit report cover with and without the seal. Look at every image. Check: lockup size and placement, one brass underline on the active nav item, mark for small placements, colors only from tokens, fonts self-hosted, contrast at least 4.5:1 for text, the seal and badge wording and gating, the descriptor, independence claim and verified definition placements (D11), every "recovered" label says posted or deposited, no AI, intelligence or ProofPack in copy. Also run the CO-01 and CO-11 acceptance checks yourself and confirm each would fail when it should (put a hex color in a non-allowed file in your scratch copy, add a next/font/google import, add the word ProofPack to a page, set reconciledToCash false).`, { label: 'review: brand and copy with screenshots', phase: 'Review', schema: FINDINGS_SCHEMA }),
  () => agent(`${REVIEW_COMMON}
Your role: security (tenant isolation, PHI, headers). Check: the app's response headers are exactly what ADR 0053 and 0055 set (compare security-headers.ts and next.config.ts with origin/claude/build-platform); the CloudFront change for /brand/* in infra/lib/constructs/edge.ts serves only public brand art, keeps the static host's other protections, and cannot expose any other path or any practice object; the mail template's image URL is configuration only and carries no PHI or identifier; no PHI or identifier in any URL, asset name or email; no route, server action or authorization check changed behavior in the merge (diff every route file the merge touched against both parents); the console tickets page merge kept the written-PHI screen; the readiness test still asserts what the fix pass asserted; CSP still blocks third-party font hosts. Run pnpm test:db (catalog and cross-tenant) on your own fresh database and report the result.`, { label: 'review: security', phase: 'Review', schema: FINDINGS_SCHEMA, agentType: 'security-reviewer' }),
  () => agent(`${REVIEW_COMMON}
Your role: guardrails and merge correctness. Check every item of "What must not change, as checks" in the reconciliation against this PR: git diff --stat origin/claude/build-platform...${BR} -- packages/pricing/src ':!**/*.test.ts' is empty; fixtures/golden and the 900001 to 900004 releases unchanged; packages/ledger/src changes are additions only; content/releases, tools/verify-content, protect-content.sh, publish-content.yml unchanged; no migration added or edited; catalog.ts rules unchanged. Then check the merge kept every change from the fix pass: for each file both sides changed, compare the merged file with origin/claude/build-platform and with brand/paidwhole and list anything from either side that was lost. Check the ADR renumbering: no citation of main's ADR 0054 or 0055 was changed, every citation of the brand ADRs points at 0056 or 0057, and no applied migration was edited. Check ci.yml changed only by the added browser install and artifact upload steps.`, { label: 'review: guardrails and merge', phase: 'Review', schema: FINDINGS_SCHEMA }),
  () => agent(`${REVIEW_COMMON}
Your role: copy lint and labels. Try hard to find user-facing text the copy lint misses: template literals, strings built by concatenation, JSX attribute values (aria-label, title, placeholder, alt), metadata, error messages shown to users, CSV headers that are labels rather than codes, the worker's report templates, the help text in apps/web/src/components/help.ts, and email subjects. List every miss with file and line. Then look for false positives and for over-broad exemptions. Check that no stage code or API/CSV code was renamed (D10) by grepping for the code values and comparing with origin/claude/build-platform. Check that every rewritten "recovered" label is truthful: a figure labelled posted or deposited must actually count only ledger entries at stage posted or deposited (CLAUDE.md: never count anything as recovered without a ledger_entry at stage posted or deposited). Check the CO-11 constants are used, not duplicated as literals.`, { label: 'review: copy lint and labels', phase: 'Review', schema: FINDINGS_SCHEMA }),
])

const findings = reviews.filter(Boolean).flatMap((r, i) => r.findings.map((f) => ({ ...f, reviewer: ['brand', 'security', 'guardrails', 'copy'][i] })))
log(`${findings.length} findings from review`)

phase('Fix')
const fix = await agent(`${COMMON}
Your role: fix (port 3341). Use Node 24 (export PATH=/opt/node24/bin:$PATH) and Postgres 18 at port 5433 for database tests, as CI does. Reviewers reported these findings on ${BR}:
${JSON.stringify(findings, null, 1)}

For each finding: first verify it against the code at HEAD and the plan, the change order and the owner's decisions (a reviewer can be wrong). Fix every real one, minimally and with a test where it is behavior. For a finding you reject, say why with evidence. If a fix would need a schema change, a change to pricing, the ledger's semantics, the content pipeline or the security program, do not make it; list it as open. Then run typecheck, lint, test and the e2e journeys touched. Commit and push.
Return in summary a line per finding: fixed (with commit) or rejected (with reason).`, { label: 'fix review findings', phase: 'Fix', schema: CHECKS_SCHEMA })

phase('Verify')
const verify = await agent(`${COMMON}
Your role: verify (port 3351). Use Node 24 (export PATH=/opt/node24/bin:$PATH; node --version must say v24), Python 3.12 (/opt/py312-ci/bin first on PATH, it has pyx12) and Postgres 18 (postgres://postgres:test@localhost:5433/postgres, superuser) so the run matches GitHub CI. One quick run after the step 0 merge showed 1 failing test among tools/test/workflows.test.ts, tools/brand-copy and tools/brand-colors that did not reproduce in four re-runs: run pnpm test three times and name any test that fails in any run, with its output. Do not edit the worktree. Clone the branch fresh: git clone --branch ${BR} ${WT} /tmp/claude-0/pr1-verify (remove it first if it exists from an earlier attempt and you created it). In the clone run, recording each result: pnpm install --frozen-lockfile; pnpm typecheck; pnpm lint; pnpm lint:logs; pnpm verify-content; tools/check-releases-immutable.sh origin/claude/build-platform (fetch that ref in the clone first from ${WT}'s origin); pnpm synth --all then git status --short (must be clean); pnpm test; pnpm test:golden; pnpm test:oracle; a fresh database then pnpm db:migrate and pnpm test:db; pnpm test:e2e with your own E2E_DATABASE and E2E_PORT; pnpm build; pnpm cdk:diff. Also run each CO-01 and CO-11 acceptance check and show it fails when it should (in a second scratch copy): a hex color outside the allowed files; a next/font/google import; a page requesting a Google font host; VerifiedSeal with reconciledToCash false; the visual test with the seal forced on; the copy lint with ProofPack, AI, intelligence and a bare recovered label. If anything fails on the branch itself, say exactly what and why; do not fix it.
Return every check with its result and the head commit verified.`, { label: 'fresh-clone verification', phase: 'Verify', schema: CHECKS_SCHEMA })

return { merge, co01, co11, finish, findings, fix, verify }
