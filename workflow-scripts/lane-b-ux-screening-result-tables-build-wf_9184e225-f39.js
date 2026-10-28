export const meta = {
  name: 'lane-b-ux-screening-result-tables-build',
  description: 'Build UX PR 4: StackedRows changes, the result tables and words, the browser proof, documents and synth, then a check',
  phases: [
    { title: 'Primitive', detail: 'slice A: StackedRows changes and tests' },
    { title: 'Result', detail: 'slices B (tables and words) and C (the browser proof) in parallel' },
    { title: 'Docs', detail: 'slice D: ADR amendment, matrix, synth, the watched list by its generator' },
    { title: 'Check', detail: 'commit, then the checks against the design' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/13d6f1ba-32aa-5d43-bbf7-78e9ac9db9c8/scratchpad'
const WT = '/home/user/ux-screening-result-tables'
const DESIGN = '/home/user/ops/designs/lane-b-ux-screening-result-tables.md'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const TRAILER = `Commit messages end with exactly these two lines after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019VghcxKzP9LAj3WK8k6u1D`
const RULES = `Context: the PaidWhole monorepo. You build ONE pull request, co-001/ux-screening-result-tables (the UX baseline review's PR 4): the screening result reads on a phone, and its rows say what they are. The design is ${DESIGN}: read it whole; its section 12 ("After the design review") wins wherever it differs. Its review: /home/user/ops/designs/lane-b-ux-screening-result-tables-review.json. Scouts' notes: ${SP}/p4/screen.md, tests.md, words.md. It builds on UX PR 3 (#79, merged): ScrollTable, StackedRows, ADR 0078 (/home/user/ops/designs/lane-b-ux-table-scroll.md section 12).
Worktree: ${WT} (branch co-001/ux-screening-result-tables, cut from claude/build-platform a6e754fc; pnpm install done). Work only there. Never touch /home/user/PhysicalTherapy; never push; never switch branches, stash, reset or rebase.
Rules:
- Never edit a file in PR #42's list (${SP}/pr42-files.txt) or in LANES.md's "Not while #42 is open" list (apps/web/src/lib/screening/* among them), except: docs/product/test-matrix.md and packages/synth/src/cases/{matrix,registry}.ts (TBL rows only), and tools/screening-capacity/watched-paths.txt written only by its generator (pnpm exec tsx tools/screening-capacity/watched.ts --write; never by hand). In particular apps/web/src/components/screening/result.test.tsx, apps/web/src/lib/screening/labels.ts, e2e/screening.ts and e2e/screening.spec.ts stay untouched, and every pin in result.test.tsx must keep passing.
- No migration; nothing under packages/db, packages/pricing, packages/ledger, packages/money changes. Synthetic data only. No model name or identifier in any file.
- Words within .claude/rules/brand.md, CO-11 and the screening's copy rules (never owed, underpaid or recovered; no finding about a payer); no style attribute; tokens only; match the surrounding code's idiom and comment density.
- Every shell command starts with export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. Every heavy command (install, typecheck, lint, vitest, build, e2e, synth) only under flock /tmp/laneb-heavy.lock <command>, one at a time. Long commands: run_in_background and wait for the notification.
- If PostgreSQL is down, run bash /tmp/setup-container.sh.
- Improve as you go inside your files; report anything larger as a proposal.`
const PARALLEL = `Another builder edits other files in the same worktree at the same time: edit only your slice's files, never run git add, commit, stash, checkout or reset, and never revert a change you did not make. A change you need in another slice's file goes in "handovers".`
const RESULT = { type: 'object', properties: { commits: { type: 'array', items: { type: 'string' } }, filesChanged: { type: 'array', items: { type: 'string' } }, done: { type: 'array', items: { type: 'string' }, description: 'each design item done, file:line' }, checks: { type: 'array', items: { type: 'string' } }, deviations: { type: 'array', items: { type: 'string' } }, handovers: { type: 'array', items: { type: 'string' } }, proposals: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } }, required: ['commits', 'filesChanged', 'done', 'checks', 'deviations', 'handovers', 'proposals', 'summary'] }

phase('Primitive')
const a = await agent(`You are builder A. ${RULES}
${SAVE('p4-build-a.md', 'each step done and what remains')}
Your slice (alone in the worktree; commit your work): apps/web/src/components/stacked-rows.tsx and stacked-rows.test.tsx: design section 2.6 (an item's optional description, its terms' column) and anything section 12 adds to the primitive. Tests first: write the failing cases, run them, record how they fail, commit ("tests first: …"); then the change; run stacked-rows.test.tsx and the web unit project's components folder, typecheck and eslint on the two files, under the lock; commit. ${TRAILER}`, { label: 'p4-build-a', phase: 'Primitive', schema: RESULT })

phase('Result')
const bc = await parallel([
  () => agent(`You are builder B. ${RULES}
${PARALLEL}
${SAVE('p4-build-b.md', 'each design item done and what remains')}
Slice A is committed (${SP}/progress/p4-build-a.md). Your files (only these): apps/web/src/components/screening/table-parts.tsx (new), anomalies.tsx, coverage.tsx, result-summary.tsx, result-tables.test.tsx (new). Build design sections 2, 3 and 4.1 with section 12's changes (P4-DR-03 to -08, -10 (b)). First check whether #42 has merged into origin/claude/build-platform (git -C ${WT} fetch -q origin claude/build-platform; gh api repos/PureTideWater/PhysicalTherapy/pulls/42 --jq .merged): if it has, stop and report (the orchestrator then merges the base and widens the scope per section 1.1); if not, build the scope as designed. Tests first: result-tables.test.tsx's cases against the current components, run, record how they fail; then the change. Run result-tables.test.tsx AND result.test.tsx (#42's, which you must not edit: every pin must still pass) and the rest of components/screening and lib/screening tests, typecheck, eslint on your files, pnpm lint:copy, under the lock. Measure the worst-shape page's HTML size (section 4.6) and report it. Do not commit.`, { label: 'p4-build-b', phase: 'Result', schema: RESULT }),
  () => agent(`You are builder C. ${RULES}
${PARALLEL}
${SAVE('p4-build-c.md', 'each step done, and the last e2e result')}
Slice A is committed (${SP}/progress/p4-build-a.md). Your files (only these): apps/web/e2e/a11y.ts (the lists option, section 4.5) and apps/web/e2e/screening-phone.spec.ts (new, section 4.4 with section 12's P4-DR-01 stream lock and P4-DR-02 widths). The spec calls e2e/screening.ts unchanged and signs no one in; it avoids the known screening race (section 4.4; LANES.md "Handed to Lane A"). Write it now against section 2.8's hooks; builder B is changing the components at the same time, so run it under the lock (build, stamp, E2E_PREBUILT=1 per /home/user/ops/approval-summaries/lane-b-ux-table-scroll-fix-suite.md, --workers=2) once B's progress file (${SP}/progress/p4-build-b.md) says its components are done, and iterate until it passes; also run screening.spec.ts and tables-phone.spec.ts once (they must still pass; screening.spec.ts failing only at :339 or helpers.ts:87 is the known flake: re-run it once and record both). Report the new spec's wall time. Do not commit.`, { label: 'p4-build-c', phase: 'Result', schema: RESULT }),
])

phase('Docs')
const d = await agent(`You are builder D. ${RULES}
${SAVE('p4-build-d.md', 'each step done and what remains')}
Slices A, B and C are done (B and C not committed; do not commit theirs). Your files (only these): docs/adr/0078-*.md (section 5's dated amendment, with section 12's changes), docs/product/test-matrix.md (TBL-05 to TBL-08 new; TBL-01, TBL-03 and TBL-04 reworded per section 4.7; keep every other lane's rows), packages/synth/src/cases/matrix.ts (byte-equal), registry.ts (section 4.8), and the generated files: fixtures/synthetic/TBL-*/expected.json by pnpm synth, tools/screening-capacity/watched-paths.txt by pnpm exec tsx tools/screening-capacity/watched.ts --write (never by hand; it should gain exactly table-parts.tsx and stacked-rows.tsx, section 6.2). Run the synth fixtures test, pnpm synth then git diff on fixtures (only TBL files), tools/screening-capacity/watched.test.ts, pnpm verify-content, pnpm lint:copy, under the lock. Do not commit.`, { label: 'p4-build-d', phase: 'Docs', schema: RESULT })

phase('Check')
const check = await agent(`You are the integrator and checker for co-001/ux-screening-result-tables. ${RULES}
${SAVE('p4-build-check.md', 'each step done, each finding and its fix')}
Results: A ${SP}/progress/p4-build-a.md (committed); B ${SP}/progress/p4-build-b.md, C ${SP}/progress/p4-build-c.md, D ${SP}/progress/p4-build-d.md (not committed). Handovers: ${JSON.stringify([...(bc || []), d].map(r => r && r.handovers))}.
1. git status: apply the small, plainly right handovers (report each); then commit B, C and D as separate commits (staging each slice's files only; nothing of #42's but the allowed rows and the generator's watched-paths.txt).
2. Read the whole diff against origin/claude/build-platform against the design, section 12 first: every item done; no #42 file or lib/screening/* file edited by hand; result.test.tsx untouched and passing; the words exactly as designed and within the copy rules. Fix what is missing or wrong (commit as fixes).
3. Checks, under the lock, one at a time: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm test (totals); pnpm synth --all then git diff --exit-code; pnpm verify-content; tools/screening-capacity/watched.test.ts; the db tests the result page touches (the large result page test of section 4.6: find it, e.g. apps/web/src/lib/screening/routes.db.test.ts or render-result tests) with DATABASE_URL on 5433; build and stamp, then e2e screening-phone.spec.ts, screening.spec.ts, tables-phone.spec.ts and layout-1280.spec.ts with E2E_PREBUILT=1 --workers=2 (the known screening flake: one re-run, record both).
4. Fix any failure at its root and re-run; commit. Return the commits, the totals and anything left open. ${TRAILER}`, { label: 'p4-build-check', phase: 'Check', schema: RESULT })
return { a, bc, d, check }