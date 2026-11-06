export const meta = {
  name: 'lane-b-email-lockup-plate-final',
  description: 'PR #129: verify the last docs commit 61169d8b (skeptic + doc checks), then check the description until clean',
  phases: [{ title: 'Verify' }, { title: 'Describe' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/9c25266a-dce9-5778-82ff-f48f559f8682/scratchpad'
const WT = '/home/user/email-plate'
const ENV = 'export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH'
const COMMON = `Rules: synthetic data only; no model identifier in any file or PR text; heavy commands under \`flock /tmp/laneb-heavy.lock\` with \`${ENV}\`. Do not commit or push anything; report instead.`
phase('Verify')
const [skeptic, checks] = await parallel([
  () => agent(`Adversarially verify commit 61169d8b on ${WT} (git -C ${WT} show 61169d8b; docs only, ADR 0081). Is every changed statement true at HEAD: both file names exist in apps/web/public/brand and are what apps/worker/src/mail/template.ts loads (EMAIL_LOCKUP_PATH, EMAIL_PROSPECT_LOCKUP_PATH); is ADR 0058's first-deploy check consistent with it; are the infra static-host paths and CORP header for both files real (infra/)? Return {ok, problems}. Read-only. ${COMMON}`, { label: 'skeptic-61169d8b', phase: 'Verify', schema: { type: 'object', required: ['ok', 'problems'], properties: { ok: { type: 'boolean' }, problems: { type: 'array', items: { type: 'string' } } } } }),
  () => agent(`On ${WT} at HEAD 61169d8b run: pnpm lint; pnpm lint:copy; pnpm verify-content; and the tests that read docs/adr or the brand copy (vitest run tools/brand-copy packages/synth/src/fixtures.test.ts tools/test, plus any ADR/docs test you find with grep for 'docs/adr'). Return {allPassed, results:[{command,result}]} with exact counts. ${COMMON}`, { label: 'doc-checks', phase: 'Verify', schema: { type: 'object', required: ['allPassed', 'results'], properties: { allPassed: { type: 'boolean' }, results: { type: 'array', items: { type: 'object', required: ['command', 'result'], properties: { command: { type: 'string' }, result: { type: 'string' } } } } } } }),
])
phase('Describe')
const facts = `Head is 61169d8b. Full suite on 31c41a9d: ${SP}/suite-result.json. Checks on 0234d5fe: typecheck 23; lint 1,861 0/0; lint:copy 595; lint:logs 1,171; check:fixtures 342/4,223; synth no diff; pnpm test 478 files, 9,932 passed, 4 skipped; build + stamp; e2e sign-in-time, sign-in, brand: 19 passed. 61169d8b (docs only, ADR 0081 names both plated files) after: skeptic ${JSON.stringify(skeptic)}; doc checks ${JSON.stringify(checks)}.`
const CHECK = { type: 'object', required: ['errors'], properties: { errors: { type: 'array', items: { type: 'object', required: ['quote', 'problem', 'fix'], properties: { quote: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' } } } } } }
await agent(`Update ${SP}/pr-body.md (PR #129's draft description) so it is true at head 61169d8b: the correctness-review row on ADR 0081 naming only the customer plate is now fixed by 61169d8b (both ADRs name both plated files), any "open/not tracked" wording for it goes, the head is 61169d8b, and add the doc checks on 61169d8b: ${facts}. Edit only the draft file. ${COMMON}`, { label: 'body-update', phase: 'Describe' })
let round = 0, last = null
while (round < 4) {
  round++
  const errs = (await parallel(['every factual claim about the code, files, paths, numbers, commits and line citations against HEAD 61169d8b of ' + WT, 'every test result and count against the facts; every section of .github/pull_request_template.md present; no model identifier or PHI; exact final lines "🤖 Generated with [Claude Code](https://claude.com/claude-code)", blank, "https://claude.ai/code/session_01FcouKRo5iee5QFtPT8UimZ"; under 65,536 characters', 'completeness critic: every commit in git log 231da9c4..HEAD covered, each review finding with a resolution of fixed (commit), not a defect (why) or deferred (where tracked), nothing overstated'].map((lens, i) => () => agent(`Adversarially check ${SP}/pr-body.md (PR #129's draft description; worktree ${WT}). Lens: ${lens}. Facts: ${facts}. Report only real errors with quote and fix; empty is fine. Read-only.`, { label: `body-check-${round}-${i}`, phase: 'Describe', schema: CHECK })))).filter(Boolean).flatMap(c => c.errors)
  last = errs
  if (!errs.length) break
  await agent(`Apply these corrections (JSON list, non-empty) to ${SP}/pr-body.md only, verifying each against ${WT} first; reject any that is wrong; if a correction needs a repository change, do not make it: report it. Corrections: ${JSON.stringify(errs)}`, { label: `body-fix-${round}`, phase: 'Describe' })
}
return { skeptic, checks, bodyRounds: round, bodyClean: !last || !last.length, lastErrors: last }
