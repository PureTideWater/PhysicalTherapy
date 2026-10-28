export const meta = {
  name: 'lane-b-contract-phi-check-fix-3',
  description: 'PR #75 (#120): the kind select at 390 px (placeholder clipped under #74 16 px controls) and its width jumping with its messages; the checks they touch; commit (no push); the uploader shots',
  phases: [
    { title: 'Fix', detail: 'the select width and placeholder, with tests' },
    { title: 'Shots', detail: 'the uploader states at 1280/390 light and 1280 dark' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi'
const WT = '/home/user/contract-phi-check'
const HEAD = 'a8bf75ca'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
phase('Fix')
const fix = await agent(`You fix two visible defects in Lane B's PR #75 (PureTideWater/PhysicalTherapy, branch co-001/contract-phi-check, local head ${HEAD}, not yet pushed; worktree ${WT}), found by the shots of its merge with #74 (${SP}/fix/shots4.md, findings M4-1 to M4-3; read it, and ${SP}/fix/merge3.md and ${SP}/fix/check4.md):
- M4-1: at 390 px the kind select's placeholder "Choose the kind of document" (CHOOSE_KIND_PLACEHOLDER in apps/web/src/components/uploads/uploader.tsx) is cut inside its box now that #74 made controls 16 px; on the refused state it is the field the person must fix.
- M4-3: the kind and ERA system selects take the width of the widest line under them (their wrapper is a flex column that stretches them), so the kind select grows by 50 px when the error line appears and shrinks when it goes.
Fix both the best way within .claude/rules/brand.md, ADR 0077 (#74's form rules: 16 px controls, Hint and FieldError at 14 px, controlMarks) and the 0056 type scale: e.g. give the selects a width of their own that does not follow their messages (full width of the column up to a sensible maximum, so they never change with state and never clip at 390), and a placeholder that fits at 390 at 16 px and still says what to do under the "Kind of document" label (keep it plain; e.g. "Choose a kind"). Also judge M4-2 (the chosen ERA option "ERA export from a practice-management system" cut at 390): fix it only if the same width change does so, or a shorter option label is clearly right (the option text is the product's kind name, used elsewhere: check apps/web/src/lib/uploads and words.ts before changing it; never change a kind's stored value). Keep every behaviour of the held files, aria wiring, focus and the alert. Update uploader.test.tsx and any e2e or doc that names the old placeholder (grep the repository, docs/adr/0070 Part 3 included) and the PR's wording list in your notes.
Rules: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH:/opt/node22/bin in every command; heavy commands under flock /tmp/laneb-heavy.lock, one at a time; e2e with a separate E2E_DATABASE and E2E_PORT, never dropping a database you did not create. Synthetic data only; no model identifier in any file; never touch #42's non-shared files. Then run: the uploader, form-hints and form-issues unit tests; pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm test (whole unit); pnpm build, stamp BUILD_COMMIT as ci.yml does after committing, and E2E_PREBUILT=1 DATABASE_URL=postgres://postgres:test@localhost:5433/postgres pnpm test:e2e --workers=2 with a separate E2E_DATABASE and E2E_PORT. Commit (one plain commit on ${HEAD}, ending after a blank line with exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017SNqG4nQbbt6xqEG1ZDKe6
), then gitleaks git --log-opts="${HEAD}..HEAD" --no-banner and the pre-push hook standalone (.githooks/pre-push with the ref line on stdin). Never push.
${SAVE('fix3.md', 'changes, tests and their totals, the commit')}
Write ${SP}/fix/fix3.md (each change with file:line, the before/after widths you expect, every changed string a person sees, each command and its totals, the commit) and return it.`, { label: 'fix3', phase: 'Fix' })

phase('Shots')
const shots = await agent(`You retake PR #75's uploader states after a fix to the kind select's width and placeholder. Read ${SP}/fix/shots4.md (the last capture: TOUR_ONLY, how it ran, findings M4-1 to M4-3) and ${SP}/fix/fix3.md. Follow /home/user/ops/tools/lane-b-screen-tour/README.md exactly. Every shell command starts with export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH:/opt/node22/bin; heavy steps under flock /tmp/laneb-heavy.lock. Never commit or push; change no tracked file in /home/user/ops unless a cap() no longer runs (then fix it in tools/lane-b-screen-tour/capture/tour.spec.ts and say what). Synthetic data only; PNGs never in a git tree. One run: TOUR_DIR=${SP}/screens-fix3, TOUR_REF = git -C ${WT} rev-parse HEAD, TOUR_ONLY the same as shots4's, at 1280 and 390 px light and 1280 px dark, plus one 390 dark shot of p.contracts.no-kind if the tour can take one (shots4's M4-7 noted none exists). Then tile.py, clean up (README step 6), confirm the server ended. Look at every shot yourself and compare with ${SP}/screens-merge3: M4-1 and M4-3 resolved (measure the selects' widths in each state), nothing else changed except as fix3.md says, nothing newly clipped, dark tokens right; report every difference with its shot id.
${SAVE('shots5.md', 'each step, each shot id and path, what is left')}
Write ${SP}/fix/shots5.md and return it.`, { label: 'shots5', phase: 'Shots' })
return { fix, shots }
