export const meta = {
  name: 'lane-b-ux-sign-in-time-build',
  description: 'Build co-001/ux-sign-in-time: slices A-D in parallel, an integration check, then an adversarial conformance check against the design',
  phases: [
    { title: 'Slices', detail: 'A server, B timer and harness, C pages, D e2e, personas, docs, synth' },
    { title: 'Integrate', detail: 'typecheck, lint, lint:logs, unit, browser harness, touched db tests, synth, watched paths' },
    { title: 'Conform', detail: 'two skeptics read the diff against the design; the integrator fixes what survives' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/4a9d4438-0635-51b1-98ea-4663abfca5c5/scratchpad'
const WT = '/home/user/ux-sign-in-time'
const DESIGN = '/home/user/ops/designs/lane-b-ux-sign-in-time.md'
const COMMON = `You are a builder for a Lane B pull request of the PaidWhole build: UX PR 6, co-001/ux-sign-in-time, "each sign-in step says how long it stays open, warns before it closes, and starts again with the email kept" (UX-012 now part, UX-128 step marker).
Worktree: ${WT} (branch co-001/ux-sign-in-time at claude/build-platform bce57f16). Work only there. Do NOT commit, push or create branches: the session commits after the integration check.
The design is ${DESIGN}. Read it whole: sections 2 (the decision, the interfaces), 3 (your slice's files), 4 (the tests), 5 and 6 (docs, exact strings). Section 9 ("Review and dispositions", R-01..R-15 and C-01..C-09) WINS over earlier text wherever they disagree. Line numbers in the design were read at 83d71fd6; bce57f16 adds only #82's CI files and CI rows of the shared documents, so re-find anchors by content.
Rules:
- PR #42 (open) files are never edited, except the three shared documents (docs/product/test-matrix.md, packages/synth/src/cases/matrix.ts, registry.ts) and the generated tools/screening-capacity/watched-paths.txt (written only by its generator). apps/web/e2e/helpers.ts, e2e/hardware-key.spec.ts and infra/** are read only.
- No migration, no new dependency, no infra or Cognito change, no change under packages/pricing. No model identifier in any file. Synthetic data only. Never log, or put in a URL, S3 key or error message, an email address, name, date of birth, member ID, claim number or document text; the kept email lives only in the sealed HttpOnly cookie and the Email field's value.
- Code reads like the surrounding code (comment density, naming, idiom; each export has a short doc comment in the repo's voice). Words a person reads are exactly section 6's, within .claude/rules/brand.md; curly apostrophes as the surrounding JSX uses them.
- Node: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH in every command. Every heavy command (pnpm install, typecheck, lint, vitest runs, test:db, builds, e2e, playwright) only under: flock /tmp/laneb-heavy.lock <command>. Prefer targeted runs (pnpm --filter @tp/web exec vitest run <files>, eslint <files>, tsc -p apps/web --noEmit). Database tests use PostgreSQL 18 on port 5433 (read package.json and the db test setup for the env they need). Long commands: run_in_background and wait for the notification (the Bash tool refuses a long foreground sleep).
- Improve as you go (the co-founder's standing direction): an improvement inside your files, do it and report it; outside your task, list it in notes.
- Report honestly: every command you ran with its result; anything not done or failing said plainly.`
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const RESULT = { type: 'object', properties: { done: { type: 'array', items: { type: 'string' } }, filesChanged: { type: 'array', items: { type: 'string' } }, commands: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] } }, notDone: { type: 'array', items: { type: 'string' } }, notes: { type: 'array', items: { type: 'string' } } }, required: ['done', 'filesChanged', 'commands', 'notDone', 'notes'] }

const SLICES = [
  { key: 'A', title: 'the limit, the deadline and the kept email (the server)', extra: `Your slice is 3.1 exactly (lib/auth/step-limits.ts new, pending.ts, sessions.ts, sign-in.ts, dev-provider.ts and its test, lib/routes/sign-in.ts, step-limits.test.ts, pending.test.ts new, sign-in.db.test.ts, sign-in-routes.db.test.ts, and the generated watched-paths.txt via "pnpm exec tsx tools/screening-capacity/watched.ts --write" after your files exist). You own the interfaces the other slices code against (2.1's module, 2.2's StepMeta and the page data each step returns, 2.6's helpers and signInPage's {reason, email, use}, 2.7's setup): implement them exactly as the design names them, and write their final exported signatures to ${SP}/progress/sgn-api.md as soon as they are fixed (early, before your tests), so the page builder can read them. Run your unit tests and your two db test files.` },
  { key: 'B', title: 'the timer and the browser harness', extra: `Your slice is 3.2 exactly (components/step-timer.tsx new, arrival-focus.tsx new, step-timer.test.tsx new, step-timer.browser.test.tsx new, test-support/browser.ts, forms-harness.html, forms-harness.tsx). Code StepTimer's props as 2.4 fixes them (plain numbers and strings from the server; the two-clock rule; one polite atomic region speaking once at the warning and once at zero; Start again in one JSX position in both phases; the limit sentence changes with the phase in a cell sized from the first render; R-02, R-03, R-05, R-09, C-01, C-03, C-04). Run your unit test and the browser harness test (read how action-form.browser.test.tsx runs and how the harness is launched; Chromium is in /opt/pw-browsers).` },
  { key: 'C', title: 'the pages', extra: `Your slice is 3.3 exactly (app/sign-in/step-heading.tsx new, page.tsx, notice.tsx, notice.test.tsx new, hardware-key/page.tsx, mfa/page.tsx, enroll/page.tsx, new-password/page.tsx, register-key/page.tsx). Slices A and B are built at the same time by others: code against the interfaces the design fixes (2.2 page data with time and setup, 2.4 StepTimerProps, 2.6 signInPage data and SignInNotice's kept/surface, 2.7 StepHeading). Read ${SP}/progress/sgn-api.md (slice A's exported signatures) and components/step-timer.tsx once they appear, and align with them; if they differ from the design, the design wins unless section 9 says otherwise: note any mismatch. Run notice.test.tsx and eslint on your files; tsc may fail until A and B land: say which errors remain.` },
  { key: 'D', title: 'the end-to-end spec, personas, documents and synth', extra: `Your slice is 3.4 exactly (apps/web/e2e/sign-in-time.spec.ts new, scripts/synthetic-personas.ts (and only what scripts/seed.ts and seed.db.test.ts need to follow the list), ADR 0081 new (full text from section 5.1's outline, in the voice of docs/adr/0077-*.md, dated 2026-11-01), ADR 0016's status line and note, ADR 0077's status line and two notes, the SGN section in docs/product/test-matrix.md after "Download refusals (DLR)", SGN entries after DLR's in packages/synth/src/cases/matrix.ts and registry.ts word for word from 4.5, 'SGN' after 'DLR' in CASE_MODULES (packages/synth/src/expected/types.ts), SGN: 19 in MODULE_NUMBER (packages/synth/src/cases/common.ts)). Then run "pnpm synth" so it writes fixtures/synthetic/SGN-01..04/expected.json (never by hand), the synth package's tests (fixtures.test.ts) and pnpm verify-content. Write the e2e spec to 4.4 (its four tests, including the real 3-minute wait that waits on data-phase, never a sleep); do not run e2e yet (the integrator does).` },
]

phase('Slices')
const slices = await parallel(SLICES.map((s) => () => agent(`${COMMON}
${SAVE('sgn-build-' + s.key + '.md', 'what is built, commands run and their results')}
Slice ${s.key}: ${s.title}. ${s.extra}
Touch no file outside your slice; if you need a change in another slice's file, put it in notes with the exact edit.`, { label: 'slice-' + s.key, phase: 'Slices', schema: RESULT })))
const sliceText = slices.map((r, i) => `--- slice ${SLICES[i].key} ---\n${r ? JSON.stringify(r).slice(0, 6000) : '(missing: read ' + SP + '/progress/sgn-build-' + SLICES[i].key + '.md)'}`).join('\n')

phase('Integrate')
const integrate = await agent(`${COMMON}
${SAVE('sgn-build-integrate.md', 'each check, its result and each fix')}
You are the integrator. The four slices are built (their results below). Make the branch whole: apply the cross-slice edits the slices listed in notes; resolve interface mismatches in favour of the design (section 9 wins). Then run, fixing what fails (each under the lock): pnpm typecheck; pnpm lint; pnpm lint:logs; the web unit tests (pnpm --filter @tp/web test, or the repo's unit command) and pnpm test for the packages the PR touches (synth included); the browser harness tests (step-timer.browser.test.tsx and action-form.browser.test.tsx); the touched db tests (sign-in-routes.db.test.ts, sign-in.db.test.ts, scripts/seed.db.test.ts) on PostgreSQL 18 port 5433; pnpm synth (fixtures/synthetic/SGN-01..04/expected.json present and unchanged on a second run); pnpm verify-content; tools/screening-capacity watched.test.ts (the generated watched-paths.txt regenerated by its generator if needed); git diff --stat against origin/claude/build-platform contains no #42 file except the three shared documents and watched-paths.txt. Then build and run ONLY the new e2e spec apps/web/e2e/sign-in-time.spec.ts once (read apps/web/playwright.config.ts and e2e README or package scripts for how a spec runs locally; under the lock; the real 3-minute test included): report its result; fix the code or the spec if it fails for a real reason.
The slices' results:
${sliceText}`, { label: 'integrate', phase: 'Integrate', schema: RESULT })

phase('Conform')
const VERDICT = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, title: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'title', 'evidence', 'fix'] } } }, required: ['findings'] }
const lenses = ['the server and security (slice A, the kept-email cookie, pendingOf enforcement from the server clock, clearSignIn on every terminal path, no email in a log, URL or error; R-01 applied)', 'what a person sees and the tests (slices B-D: section 6 strings exact, StepTimer behaviour and a11y, step markers on both invited paths, every SGN row asserted by a real test, the ADR text)']
const conform = await parallel(lenses.map((lens, i) => () => agent(`${COMMON}
${SAVE('sgn-conform-' + i + '.md', 'each finding')}
You are an adversarial checker, read only (edit nothing). Compare the working tree's diff (git -C ${WT} diff origin/claude/build-platform plus untracked files) against the design, through one lens: ${lens}. Report only what is wrong or missing against the design or the rules, each with file:line evidence and the fix; return an empty list if nothing is.`, { label: 'conform-' + i, phase: 'Conform', schema: VERDICT })))
const found = conform.filter(Boolean).flatMap((c) => c.findings)
log(`conformance: ${found.length} findings`)
let fixes = null
if (found.length) {
  fixes = await agent(`${COMMON}
${SAVE('sgn-build-fixes.md', 'each finding, whether real, and the fix')}
You are the integrator again. Two adversarial checkers reported the findings below. For each: verify it against the design and the code (refute it if it is wrong, saying why), and fix the real ones. Then rerun the checks the fixes touch (typecheck, lint, the affected unit, harness and db tests, the e2e spec if its code changed), under the lock.
${found.map((f) => `${f.id} [${f.severity}] ${f.title}\n  evidence: ${f.evidence}\n  fix: ${f.fix}`).join('\n')}`, { label: 'fixes', phase: 'Conform', schema: RESULT })
}
return { slices, integrate, found, fixes }
