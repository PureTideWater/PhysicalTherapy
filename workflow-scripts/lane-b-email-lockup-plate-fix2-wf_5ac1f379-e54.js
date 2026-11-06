export const meta = {
  name: 'lane-b-email-lockup-plate-fix2',
  description: 'PR #129: fix the two confirmed findings (ADR 0058 "embeds"; the reset page and ADR 0081 A3 asserting replacement), two adversarial reviews of the delta incl. UX/brand with shots, until dry, checks, description',
  phases: [{ title: 'Fix' }, { title: 'Review' }, { title: 'Checks' }, { title: 'Describe' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/9c25266a-dce9-5778-82ff-f48f559f8682/scratchpad'
const WT = '/home/user/email-plate'
const SESSION = 'https://claude.ai/code/session_01FcouKRo5iee5QFtPT8UimZ'
const GL = 'GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks'
const ENV = 'export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH'
const COMMIT = `commit with a message describing it, a blank line, then "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" and "Claude-Session: ${SESSION}"; push only \`${GL} git -C ${WT} push origin HEAD:refs/heads/co-001/wip/email-lockup-plate-s5\` (fast-forward)`
const COMMON = `Rules: synthetic data only; no model name or identifier in any file or PR text (commit attribution trailers are required and fine); never --no-verify, never force, never touch .gitleaksignore; never write files through the GitHub connector; heavy commands under \`flock /tmp/laneb-heavy.lock\` with \`${ENV}\`; e2e needs Postgres 18 (E2E_ADMIN_URL / DATABASE_URL at postgres://postgres:test@localhost:5433/postgres). Wording per .claude/rules/brand.md, CO-11 and the file's own style. Never edit content/releases/** or an applied migration. Do NOT push to co-001/email-lockup-plate. SAVE rule: keep your progress file up to date and continue from it if it exists.`
const FIND = { type: 'object', required: ['findings'], properties: { findings: { type: 'array', items: { type: 'object', required: ['id', 'file', 'claim'], properties: { id: { type: 'string' }, file: { type: 'string' }, claim: { type: 'string' } } } } } }
const VERDICT = { type: 'object', required: ['refuted', 'reason'], properties: { refuted: { type: 'boolean' }, reason: { type: 'string' } } }

const FINDINGS = [
  { id: 'D1', file: 'docs/adr/0058-serve-email-art-*.md:246', claim: "The amendment added in d7a45752 says the plated file is the one 'which the worker's mail embeds'. The mail does not embed it: apps/worker/src/mail/template.ts emailLockup writes an <img src> pointing at the static host (STATIC_ASSET_ORIGIN), no cid: and no data: URL. Fix: 'which the worker's mail loads from the static host' (or equivalent in the ADR's style)." },
  { id: 'D2', file: 'docs/adr/0081-*.md (A3 ~line 250-251; B2 ~333-334; Not verified ~404) and apps/web/src/app/sign-in/forgot-password/page.tsx:23', claim: "This PR's O-8 text says it is not verified whether Cognito voids an earlier reset code when a second is requested, so the email never says a new request replaces the code. But ADR 0081 A3 states as fact 'since a new request replaces the code', and the reset page's step warning tells the person 'send a new code below: it replaces the code already sent' (held by apps/web/e2e/sign-in-time.spec.ts ~711 and apps/web/src/components/step-timer.test.tsx ~165). DECIDED RESOLUTION (Lane B item session, the recommended option on accuracy: never state what is unverified; consistent with the orchestrator's O-8 ruling as brand delegate): word the page's warning and A3 so they hold either way, in the email's terms, e.g. the page: 'send a new code below and use the newest one' (keep the sentence's existing structure, length and tone; pick the exact words that read best within brand.md and CO-11), and A3 reworded to not assert replacement (e.g. 'since the newest code is the one to use'). Update every place that quotes those words word for word: the unit and e2e tests, test-matrix rows and their synth registry copy (packages/synth word-for-word test), snapshots, docs, the copy scan. Write each test change first and see it fail against the old words." },
]

phase('Fix')
const fix = await agent(`On ${WT} (branch co-001/email-lockup-plate, HEAD 80ce3ec0, PR #129: the email lockup on a White plate, O-5, and the reset email's newest-code line, O-8), fix these two confirmed findings. Verify each against the code first. Findings (JSON): ${JSON.stringify(FINDINGS)}. grep the whole repository for every copy of the changed words. Run the tests that touch what you change (step-timer unit test, the synth fixtures word-for-word test, tools/brand-copy, lint:copy, and e2e/sign-in-time.spec.ts after pnpm build + stamp with E2E_PREBUILT=1). Then ${COMMIT}. ${COMMON} Progress file: ${SP}/progress/fix2.md. Return the commit SHA(s), each changed sentence before and after, and every file changed.`, { label: 'fix-D1-D2', phase: 'Fix' })

phase('Review')
const seen = new Set(), confirmed = []
let dry = 0, rounds = 0
while (dry < 1 && rounds < 3) {
  rounds++
  const reviews = await parallel([
    () => agent(`UX and brand review (your agent instructions) of the delta git -C ${WT} diff 80ce3ec0 HEAD on PR #129: the reset page's step warning reworded so it no longer asserts that a new code replaces the old one, and ADR wording. Take before (80ce3ec0, a separate worktree) and after (HEAD) shots of /sign-in/forgot-password showing the step warning at 1280 px and 390 px light and 1280 px dark, by tools/lane-b-screen-tour/README.md "From another lane" (or Playwright directly against a built, stamped app) into ${SP}/shots/r${rounds}/, and look at them. Judge the words against .claude/rules/brand.md, CO-11, the email's O-8 sentence ("If you asked more than once, use the newest code."), accessibility (the warning's live region and timing unchanged) and layout (no wrap or overflow at 390 px). Report only real defects. Already reported: ${JSON.stringify([...seen])}. ${COMMON}`, { label: `ux-brand-${rounds}`, phase: 'Review', agentType: 'ux-brand-reviewer', schema: FIND }),
    () => agent(`Adversarial correctness and consistency review of git -C ${WT} diff 80ce3ec0 HEAD on PR #129 (sign-in reset flow wording): does any place in the repository still assert that a new reset code replaces/voids the old one (docs, ADRs, page, components, tests, test-matrix, synth registry, design notes in the repo, runbooks)? Is every changed word held by its tests, did every word-for-word copy follow, does the step timer's behaviour stay identical, and is ADR 0058's sentence now true to template.ts? Read-only, no heavy commands. Already reported: ${JSON.stringify([...seen])}. Report only real defects; empty is fine. ${COMMON}`, { label: `correctness-${rounds}`, phase: 'Review', schema: FIND }),
  ])
  const fresh = reviews.filter(Boolean).flatMap(r => r.findings).filter(f => !seen.has(f.file + '|' + f.claim.slice(0, 80)))
  fresh.forEach(f => seen.add(f.file + '|' + f.claim.slice(0, 80)))
  if (!fresh.length) { dry++; log(`review round ${rounds}: dry`); continue }
  const judged = (await parallel(fresh.map(f => () => parallel([0, 1].map(k => () => agent(`Try to REFUTE this review finding on ${WT} (current HEAD, PR #129). Read the code yourself; default refuted=true if it does not reproduce, is out of scope, or is not a defect. Finding ${f.id} in ${f.file}: ${f.claim}. Read-only.`, { label: `skeptic-${rounds}-${f.id}-${k}`, phase: 'Review', schema: VERDICT }))).then(vs => ({ f, ok: vs.filter(Boolean).length > 0 && vs.filter(Boolean).every(v => !v.refuted) }))))).filter(Boolean)
  const real = judged.filter(j => j.ok).map(j => j.f)
  log(`review round ${rounds}: ${fresh.length} fresh, ${real.length} confirmed`)
  if (!real.length) { dry++; continue }
  confirmed.push(...real)
  const list = JSON.stringify(real)
  await agent(`On ${WT} (PR #129), fix these confirmed review findings (JSON list follows; it is non-empty): ${list}. Verify each first; minimal and exact; tests first where behaviour or held words change. Run the tests that touch what you change. Then ${COMMIT}. ${COMMON} Progress file: ${SP}/progress/fix2-r${rounds}.md. Return the commit SHA and what changed.`, { label: `fix-r${rounds}`, phase: 'Review' })
}
if (!dry) log('NOT DRY after 3 review rounds')

phase('Checks')
const checks = await agent(`On ${WT}, files changed since 80ce3ec0: git diff --name-only 80ce3ec0 HEAD. Run under flock with \`${ENV}\`: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm check:fixtures; pnpm synth --all then git status --porcelain (empty); pnpm test (the whole unit + property suite, since sign-in words moved); pnpm build, the stamp, then E2E_PREBUILT=1 pnpm test:e2e for e2e/sign-in-time.spec.ts, e2e/sign-in.spec.ts and e2e/brand.spec.ts (Postgres 18). A failure caused by this round: fix, ${COMMIT}, re-run. ${COMMON} Progress file: ${SP}/progress/fix2-checks.md. Return exact counts.`, { label: 'checks', phase: 'Checks', schema: { type: 'object', required: ['allPassed', 'head', 'results'], properties: { allPassed: { type: 'boolean' }, head: { type: 'string' }, results: { type: 'array', items: { type: 'object', required: ['command', 'result'], properties: { command: { type: 'string' }, result: { type: 'string' } } } } } } })
if (!checks || !checks.allPassed) return { fix, confirmed, checks, note: 'checks failed' }

phase('Describe')
const facts = `Full suite on 31c41a9d: ${SP}/suite-result.json. Fast checks on 80ce3ec0 (all green). This round: findings D1, D2 ${JSON.stringify(FINDINGS.map(f => f.id + ': ' + f.claim.slice(0, 300)))}; fix: ${String(fix).slice(0, 3000)}; review findings confirmed and fixed: ${JSON.stringify(confirmed)}; checks: ${JSON.stringify(checks)}. Shots: ${SP}/shots/.`
const CHECK = { type: 'object', required: ['errors'], properties: { errors: { type: 'array', items: { type: 'object', required: ['quote', 'problem', 'fix'], properties: { quote: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' } } } } } }
await agent(`Update the PR #129 description draft ${SP}/pr-body.md for the commits since 80ce3ec0 (git -C ${WT} log --oneline 80ce3ec0..HEAD) and these facts: ${facts}. The head is git -C ${WT} rev-parse HEAD. In "What changes", add the reset page's warning wording (before and after, why: it now holds either way, as the email's O-8 sentence does, and A3 with it) and ADR 0058's wording; in Checks add this round's results; in the reviewer table add D1, D2 and this round's UX/brand review (with the shots' file names) and correctness review, each finding and its resolution. Keep everything else. Do NOT update the PR. ${COMMON}`, { label: 'body-update', phase: 'Describe' })
let round = 0, last = null
while (round < 4) {
  round++
  const errs = (await parallel(['every factual claim about the code, files, paths, numbers, line citations and tokens against HEAD of ' + WT, 'every test result and count against the facts; every section of .github/pull_request_template.md present; no model identifier or PHI; the exact final lines "🤖 Generated with [Claude Code](https://claude.com/claude-code)", blank, "https://claude.ai/code/session_01FcouKRo5iee5QFtPT8UimZ"; under 65,536 characters', 'completeness critic: every commit in git log 231da9c4..HEAD covered, each review finding with its resolution, nothing overstated'].map((lens, i) => () => agent(`Adversarially check the PR description draft at ${SP}/pr-body.md for PR #129 (worktree ${WT}). Lens: ${lens}. Facts: ${facts}. Report only real errors with the quoted text and the fix. Read-only.`, { label: `body-check-${round}-${i}`, phase: 'Describe', schema: CHECK })))).filter(Boolean).flatMap(c => c.errors)
  last = errs
  if (!errs.length) break
  await agent(`Apply these corrections (JSON list follows, non-empty) to ${SP}/pr-body.md (PR #129's draft), verifying each against ${WT} first; reject any that is wrong: ${JSON.stringify(errs)}`, { label: `body-fix-${round}`, phase: 'Describe' })
}
return { fix, reviewDry: dry > 0, confirmed, checks, bodyRounds: round, bodyClean: !last || !last.length, lastErrors: last }
