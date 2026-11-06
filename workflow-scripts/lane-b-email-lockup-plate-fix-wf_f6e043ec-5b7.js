export const meta = {
  name: 'lane-b-email-lockup-plate-fix',
  description: 'PR #129: fix the three confirmed doc findings, sweep for more until dry with skeptics, fast checks, then the PR description written and checked',
  phases: [{ title: 'Fix' }, { title: 'Sweep' }, { title: 'Checks' }, { title: 'Describe' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/9c25266a-dce9-5778-82ff-f48f559f8682/scratchpad'
const WT = '/home/user/email-plate'
const SESSION = 'https://claude.ai/code/session_01FcouKRo5iee5QFtPT8UimZ'
const GL = 'GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks'
const ENV = 'export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH'
const COMMIT = `commit with a message describing it, a blank line, then "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" and "Claude-Session: ${SESSION}"; push only \`${GL} git -C ${WT} push origin HEAD:refs/heads/co-001/wip/email-lockup-plate-s5\` (fast-forward)`
const COMMON = `Rules: synthetic data only; no model name or identifier in any file or PR text (commit attribution trailers are required and fine); never --no-verify, never force, never touch .gitleaksignore (rewrite flagged text instead); never write files through the GitHub connector; heavy commands under \`flock /tmp/laneb-heavy.lock\` with \`${ENV}\`. Wording follows .claude/rules/brand.md and the file's own style (plain, exact, the repository's prose conventions). Never edit content/releases/** or an applied migration. Do NOT push to co-001/email-lockup-plate. SAVE rule: keep your progress file up to date and continue from it if it exists.`
const FIND = { type: 'object', required: ['findings'], properties: { findings: { type: 'array', items: { type: 'object', required: ['id', 'file', 'claim'], properties: { id: { type: 'string' }, file: { type: 'string' }, claim: { type: 'string' } } } } } }
const VERDICT = { type: 'object', required: ['refuted', 'reason'], properties: { refuted: { type: 'boolean' }, reason: { type: 'string' } } }

const F = [
  { id: 'F1', file: 'docs/adr/0081-*.md lines ~410-411', claim: 'says "The repository\'s renders emulate an inverting client and are not proof of these clients." Nothing on HEAD renders an inverting client; the repo holds the plate by plateHolds (the served PNG\'s pixels are opaque White in the plate) in apps/web/e2e/brand.spec.ts and tools/brand-email-plate. Reword to what is true (the inverted-client renders were made for the review, outside the repository; the repository checks the art\'s pixels).' },
  { id: 'F2', file: 'docs/brand/BRAND.md lines ~132-134 (section 7)', claim: 'describes the plate as a White rounded table with padding --pw-space-3; on HEAD the table and cell have padding 0 (apps/worker/src/mail/template.ts emailHeader; asserted in template.test.ts and brand.spec.ts) and the space-3 White margin is part of the generated image\'s own pixels. Fix the description.' },
  { id: 'F3', file: 'packages/brand/README.md line 1', claim: 'still says "email uses the 1200 px PNG lockup from the CloudFront static host"; under O-5 every worker email uses the generated plate composites (-email-plate-1380w.png, drawn at 184 px); the 1200w files are the generator\'s inputs (and the app/other uses, if any — check). Update it.' },
]

phase('Fix')
const fix1 = await agent(`On ${WT} (branch co-001/email-lockup-plate, HEAD 31c41a9d, PR #129: the email lockup's White plate, O-5, and the reset email's newest-code sentence, O-8), fix these three confirmed documentation findings. Verify each against the code first and word the fix exactly to what HEAD does: ${JSON.stringify(F)}. If a doc file is held by a word-for-word or format test (tools/brand-copy, docs checks, adr checks), run that test after. Then ${COMMIT}. ${COMMON} Progress file: ${SP}/progress/fix1.md. Return the commit SHA and each fix's before and after text.`, { label: 'fix-F1-F3', phase: 'Fix' })

phase('Sweep')
const seen = new Set(F.map(f => f.file + '|' + f.claim.slice(0, 60)))
const confirmed = []
let dry = 0, rounds = 0
while (dry < 1 && rounds < 3) {
  rounds++
  const lenses = [
    'docs and comments: every statement anywhere in the repository (docs/**, BRAND.md, ADRs, READMEs, packages/brand, tools/brand-email-plate, apps/worker/src/mail, apps/web/e2e/brand.spec.ts comments, test-matrix rows, synth registry copy) about the email lockup, its plate, its file names, widths, padding, colours, the inverted-client renders, or the reset email\'s words that does not match HEAD',
    'completeness critic: what did the PR\'s claims leave unverified — e.g. the static host serving the new -email-plate files (infra paths, cache, content type), the versioned names everywhere they are referenced, the plates\' alt/width/height in every variant, the text bodies, the SHA-256 pins actually checking both inputs and outputs, a doc that still promises a table plate, and the ADR 0081 staging smoke check wording',
  ]
  const found = (await parallel(lenses.map((l, i) => () => agent(`Read-only adversarial sweep of ${WT} at its current HEAD (PR #129). Lens: ${l}. Already handled (do not report again): ${JSON.stringify([...seen])}. Report only real, specific defects with file and line; an empty list is a fine answer. No heavy commands. ${COMMON}`, { label: `sweep-${rounds}-${i}`, phase: 'Sweep', schema: FIND })))).filter(Boolean).flatMap(r => r.findings)
  const fresh = found.filter(f => !seen.has(f.file + '|' + f.claim.slice(0, 60)))
  fresh.forEach(f => seen.add(f.file + '|' + f.claim.slice(0, 60)))
  if (!fresh.length) { dry++; continue }
  const judged = (await parallel(fresh.map(f => () => parallel([0, 1].map(k => () => agent(`Try to REFUTE this finding on ${WT} (current HEAD, PR #129). Read the code yourself; default refuted=true if it does not reproduce, is out of this PR's scope (a file this PR neither changes nor makes wrong), or is not a defect. Finding in ${f.file}: ${f.claim}. Read-only.`, { label: `skeptic-${rounds}-${f.id}-${k}`, phase: 'Sweep', schema: VERDICT }))).then(vs => ({ f, ok: vs.filter(Boolean).length > 0 && vs.filter(Boolean).every(v => !v.refuted) }))))).filter(Boolean)
  const real = judged.filter(j => j.ok).map(j => j.f)
  log(`sweep round ${rounds}: ${fresh.length} fresh, ${real.length} confirmed`)
  if (!real.length) { dry++; continue }
  confirmed.push(...real)
  await agent(`On ${WT} (PR #129), fix these confirmed findings, verifying each first and keeping each fix minimal and exact (tests first where a behaviour changes): ${JSON.stringify(real)}. Run the tests that touch what you change. Then ${COMMIT}. ${COMMON} Progress file: ${SP}/progress/fix-sweep-${rounds}.md. Return the commit SHA and what changed.`, { label: `fix-sweep-${rounds}`, phase: 'Sweep' })
}
if (rounds >= 3 && dry < 1) log('sweep stopped at 3 rounds without a dry round')

phase('Checks')
const CHK = { type: 'object', required: ['allPassed', 'head', 'results', 'changedFiles'], properties: { allPassed: { type: 'boolean' }, head: { type: 'string' }, changedFiles: { type: 'array', items: { type: 'string' } }, results: { type: 'array', items: { type: 'object', required: ['command', 'result'], properties: { command: { type: 'string' }, result: { type: 'string' } } } } } }
const checks = await agent(`On ${WT}, list the files changed since 31c41a9d (git diff --name-only 31c41a9d HEAD). The full local suite already passed on 31c41a9d; per the speed rules run now, each under flock with \`${ENV}\`: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm check:fixtures; pnpm synth --all then git status --porcelain (no diff); and every test that touches the changed files (if only docs changed: the doc/ADR/brand-copy/test-matrix word-for-word tests, e.g. packages/synth fixtures.test.ts, tools/brand-copy, any docs lint; if code or a test changed: its package's tests, and e2e/brand.spec.ts after pnpm build + stamp if the email markup or brand spec changed). A failure caused by this round: fix minimally, ${COMMIT}, re-run. ${COMMON} Progress file: ${SP}/progress/checks.md. Return the structured result with exact counts.`, { label: 'fast-checks', phase: 'Checks', schema: CHK })
if (!checks || !checks.allPassed) return { fix1, confirmed, checks, note: 'checks failed; no description written' }

phase('Describe')
const facts = JSON.stringify({ fullSuiteOn31c41a9d: 'read ' + SP + '/suite-result.json', fixRound: { reviewFindingsConfirmed: F.concat(confirmed), refutedFinding: 'F4 (commit attribution trailers name the model): refuted by both skeptics, the session attribution rule requires them', checksAfterFixes: checks } })
await agent(`Write the new description of PR #129 (PureTideWater/PhysicalTherapy) into ${SP}/pr-body.md (continue from it if present). Read the current body with the GitHub MCP tool pull_request_read (method get), and .github/pull_request_template.md in ${WT}; keep every template section ("None" rather than omitted). It describes the final head ${checks.head}. Read git -C ${WT} log --oneline 231da9c4..HEAD and the diff git -C ${WT} diff origin/claude/build-platform...HEAD; the description of WHAT changes must match HEAD exactly (the earlier body describes a padded table-cell plate which the fix round replaced by generated plated PNGs on an unpadded White table; describe what HEAD really does, including tools/brand-email-plate, the versioned -email-plate file names, the SHA-256 pins of inputs and outputs, the BRAND.md section 7 derived-composite line, the docs fixes). Cover the commits since 231da9c4: the plated PNGs and generator (UX-S1: forced inversion inverts table cells too, so the White ground is the art's own pixels; UX-N4); docs (UX-N1, UX-S1); ADR 0081 rewrapped (UX-N3); SGN-13's synth copy (CI on 231da9c4 was red in packages/synth fixtures.test.ts "holds every row of test-matrix.md word for word"); the clean base merges of 23b25ad0 (#127) and cc3dd7f6 (#128); the SHA-256 pins; the BRAND.md line; this round's doc fixes. Checks: the full local suite on 31c41a9d from ${SP}/suite-result.json (exact counts, do not invent any), and the checks after this round's fixes: ${facts}. Reviewer findings table: the UX and brand review (the acting session's, with inverted-client renders made outside the repository; UX-S1, UX-N1, UX-N2, UX-N3, UX-N4, every one fixed — read /home/user/ops/approval-summaries/lane-a-email-lockup-plate-status.md and the "Ruled 2026-11-05" lines of /home/user/ops/designs/lane-a-auth-emails.md), with UX-S1's derived art "confirmed by Lane A's orchestrator as the brand owner's delegate, 2026-11-05 07:43Z, with four conditions (versioned names; width, height and alt kept; input and output SHA-256 pinned; BRAND.md section 7's derived-composite line), all holding at the head"; the second review: this round's adversarial review of the merged tree (two lenses, two skeptics per finding, then a sweep until dry with a completeness critic), each finding and its resolution; payment, security and EDI reviewers not applicable. Keep the founder's-approval section as it is. Report improvements made as you went. End with exactly:\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\nhttps://claude.ai/code/session_01FcouKRo5iee5QFtPT8UimZ\n\nUnder 65,536 characters. Do NOT update the PR. ${COMMON} Return the path and a one-paragraph summary.`, { label: 'pr-body', phase: 'Describe' })

const CHECK = { type: 'object', required: ['errors'], properties: { errors: { type: 'array', items: { type: 'object', required: ['quote', 'problem', 'fix'], properties: { quote: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' } } } } } }
let round = 0, last = null
while (round < 3) {
  round++
  const errs = (await parallel(['every factual claim about the code, files, paths, numbers and tokens against HEAD of ' + WT, 'every test result and count against ' + SP + '/suite-result.json and the after-fix checks given; every template section present; no model identifier or PHI; the exact ending lines', 'completeness critic: what a reviewer of #129 needs that the body omits or overstates (each commit since 231da9c4 covered, each finding with its resolution, what it does not change)'].map((lens, i) => () => agent(`Adversarially check the PR description draft at ${SP}/pr-body.md for PR #129 (worktree ${WT}). Lens: ${lens}. Facts: ${facts}. Report only real errors, each with the quoted text and the fix. Read-only.`, { label: `body-check-${round}-${i}`, phase: 'Describe', schema: CHECK })))).filter(Boolean).flatMap(c => c.errors)
  last = errs
  if (!errs.length) break
  await agent(`Apply these corrections to ${SP}/pr-body.md (PR #129's draft description), verifying each against ${WT} first; reject any that is wrong. Corrections: ${JSON.stringify(errs)}`, { label: `body-fix-${round}`, phase: 'Describe' })
}
return { fix1, confirmed, checks, bodyRounds: round, lastErrors: last }
