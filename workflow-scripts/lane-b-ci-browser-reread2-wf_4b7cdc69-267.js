export const meta = {
  name: 'lane-b-ci-browser-reread2',
  description: 'Re-read ci-browser design 3.3 against the merged base e908c21 (branch at 2ab2b15): two scouts, a reviser, one adversarial reviewer, a fold',
  phases: [
    { title: 'Scout', detail: 'files and code; versions, browsers and runners' },
    { title: 'Revise', detail: 'write section 3.3.7 and the edits it needs' },
    { title: 'Review', detail: 'one adversarial reviewer' },
    { title: 'Fold', detail: 'apply every real finding, record dispositions' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/5b1bc8b7-7846-5c40-a0f8-306593ba96be/scratchpad'
const DESIGN = '/home/user/ops/designs/lane-b-ci.md'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. You work for a Lane B item session that owns ci-browser (CI 3 of 4; audit #19's upgrade part; ADR 0066 Part 3; test-matrix and synth CI-18 to CI-20). Its design is ${DESIGN} section 3.3 (lines from "### 3.3 \`co-001/ci-browser\`" to "### 3.4"), written 2026-10-26 at claude/build-platform 6ddd587, before ci-deps (#48) and nine other PRs merged. Its phase 1 was built on ci-deps' 123b8fa and pushed at 8b38f48 (summary: /home/user/ops/approval-summaries/lane-b-ci-browser-build-summary.md, including the builders' deviations and the "After #42" split). Today (2026-10-27) the session merged claude/build-platform e908c21 into the branch: the worktree /home/user/ci-browser is at the merge commit 2ab2b15 (local, not pushed). Status file: /home/user/ops/approval-summaries/lane-b-ci-deps-status.md. Rules: /home/user/ops/LANES.md (rule 6, the "Not while #42 is open" list), /home/user/ops/lanes/lane-b.md ("How Lane B runs"), /home/user/ops/lanes/lane-b-session-brief.md.

Known facts you need not rediscover: the environment's proxy refuses storage.googleapis.com and cdn.playwright.dev (so no local Chromium 1248 and not even 1194 is laid out in /opt/pw-browsers here; the person has been asked to allow storage.googleapis.com). The merged tree's unit run on tools/test, tools/ci, tools/screening-capacity and packages/synth gives 3 failures: workflows.test.ts's runner rule (the base's new content-calendar.yml and release-capacity.yml jobs are on ubuntu-24.04 and not in RELEASE_CHAIN), the simulated Dependabot rewrite (which re-runs that rule on a copy), and browser-version.test.ts's catalog line (phase 2 by design). The rulings: the founder's F4 and F5 (as recommended), the co-founder's Q2 of 2026-10-25 (ci-browser does not wait for #42; the PR merged second keeps both; the lockfile re-resolved, never hand-merged), and the co-founder's 2026-10-26 ~00:20 UTC ruling (take the recommended option, security the safer one, without asking). Under the 2026-10-27 direction the A9 inspection of the regenerated baselines is the co-founder's: take the recommended option and record it with its evidence (side-by-side images in the status file or a design note). The pipeline still holds: a draft PR, two adversarial reviews (one the UX and brand review from .claude/agents/ux-brand-reviewer.md, merged as #55, with before and after shots at 1280 px and 390 px light and 1280 px dark), a fix round with the full local suite, a fresh-clone verification reading CI, the merge.

Rules for you:
- Synthetic data only; no PHI, real 835, contract or export anywhere.
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH (default node is 22).
- Heavy commands (pnpm install, typecheck, lint, tests, builds) only under flock /tmp/laneb-heavy.lock <command>.
- Change no tracked file in /home/user/PhysicalTherapy or /home/user/ci-browser. In /home/user/ops change only the files your task names. Never run git add, commit, push, checkout, reset, merge or stash anywhere; the session commits. GitHub: read only (gh api GET, or the GitHub MCP read tools); never comment, review or write.
- No model name or identifier in any file you write.
- Cite file:line at the merged head 2ab2b15 (or a URL/command with its date) for every claim. Say "not verified" when you could not check.
- Improve as you go (the co-founder's standing direction): an improvement inside ci-browser's scope goes into your result; one outside it goes in your notes as a proposal.
- Long commands: run_in_background and wait for the notification; no long foreground sleep.`
const SAVE = (file, what) => `Save as you go: keep ${SP}/reread2/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped. Write your report to ${SP}/reread2/${file.replace('.progress.md', '.md')} as well as returning it.`

phase('Scout')
const [files, versions] = await parallel([
  () => agent(`${COMMON}

Your task: scout FILES AND CODE. Read design section 3.3 whole and the phase-1 build summary. Then, at /home/user/ci-browser (2ab2b15), establish what the base merge changed for ci-browser:
1. Every file 3.3.2 lists (and the phase-1 summary's files): run git diff --stat 8b38f48 2ab2b15 -- <file> and for each file the base changed, say what changed that 3.3 depends on (cites that moved: give old and new line by grep of the quoted text; behaviours that changed). Pay attention to ci-deps' final state: release-dry-run.yml (does it now have a capacity job? 3.3 and phase 1 give RELEASE_CHAIN 7 or 8 jobs), docker/login-action v4.7.0, the BuildKit pins, ci-deps' phase-2 bumps (vitest 5.0.5, eslint, next 16.4.3, postcss), check-toolchain's rules (release age, trust policy, lockfile hosts, overrides) that a Playwright/axe bump must pass, the catalog rule and no-duplicated-versions.
2. The base's two new workflows content-calendar.yml and release-capacity.yml (from #49, under ci-deps' rules): every job, what it runs, whether it installs Chromium or a browser, builds or loads images, measures binding numbers, and which runner each should take under F5's letter ("the release's capacity chain stays on ubuntu-24.04 ... every other job moves to ubuntu-26.04"). Recommend, with reasons (release-capacity measures the worker at its task limits, advisory, never binding: does F5's reasoning (Docker 29's containerd store, the measured host) put it with the release chain, or on 26.04?). Also whether either needs the apt cache, the browser check or the identity steps.
3. The other base changes that touch ci-browser's ground: e2e count now (lanes say 54 at 7b6b10b, design says 51), unit and db counts on e908c21 (CI run 40401493722's job logs via the GitHub MCP get_job_logs or gh api; read only), the restore-drill skip, any new spec calling expectAccessible or reaching the header controls (getByLabel('Practice switcher'/'Account menu')), any new header control in apps/web/src/components/shell.tsx, any new workflow step that installs Chromium (CHROMIUM_INSTALL), new rows in reconciliation-001 / ADR 0062 / ADR 0066 / test-matrix that 3.3 edits.
4. #42's current state (gh api repos/PureTideWater/PhysicalTherapy/pulls/42 GET: draft?, head sha, mergeable, updated_at; its files list): which of ci-browser's files it still shares, and the hunks; the 3.3.2 #42 table re-checked. apps/web/package.json and apps/web/e2e/screening.spec.ts are #42 files (the Q2 ruling applies).
5. Run the unit tests named in the context (under the lock) and list each failure with its cause; then list exactly what phase 2 must still do on this merged tree that needs NO local browser (the bump, the lockfile under the gates, the catalog line, browser.json unchanged?, the new workflows under the rules, docs, counts) versus what needs Chromium 1248 locally (baselines regeneration and no-op, the 13 specs, the computed name check, browser-build.ts green, UX shots).
${SAVE('scout-files.progress.md', 'each numbered item with its findings as you finish it')}
Return a markdown report with sections 1-5 and a final "Changes 3.3 needs" list (each: the 3.3 text to change, the new text or fact, evidence).`, { label: 'scout:files', phase: 'Scout' }),
  () => agent(`${COMMON}

Your task: scout VERSIONS, BROWSERS AND RUNNERS, as of now (2026-10-27). Read design section 3.3.1 (versions table, browser.json, CfT, runners, apt cache, actionlint) and 3.3.5 first.
1. npm: @playwright/test, playwright, playwright-core, @axe-core/playwright, axe-core: dist-tags and time (curl https://registry.npmjs.org/<pkg>, read only). Is 1.64.1 still the newest stable (any 1.64.2 or 1.65.0)? axe 4.14.0 still newest stable (4.14.1?)? If a newer stable exists, is it at least three days old (minimumReleaseAge 4320 minutes) and published with trusted-publisher provenance like the old one (trustPolicy no-downgrade)? Recommend the version to take (newest that passes the gates; if a newer one changes the browser revision, give its browsers.json revision and CfT version from https://raw.githubusercontent.com/microsoft/playwright/v<ver>/packages/playwright-core/browsers.json, or by reading the published tarball's browsers.json). Check the dependencies list for new transitive packages.
2. If the recommended Playwright pins a different Chromium revision than 1248 / CfT 156.0.8078.4, say so plainly: browser.json's hashes and setup-container.sh's CFT_BUILDS rows would change, and the zips must come from storage.googleapis.com, which this proxy refuses (curl -sSI https://storage.googleapis.com/chrome-for-testing-public/ to confirm; report the status). If 1248 stands, confirm browser.json at /home/user/ci-browser/apps/web/e2e/browser.json still names 1248 and 156.0.8078.4 and the CFT_BUILDS rows in /home/user/ops/tools/setup-container.sh carry the zip SHA-256s browser.json records.
3. Runner images: actions/runner-images' newest ubuntu26 and ubuntu24 tags and their Docker/Compose/Node/PostgreSQL versions (git ls-remote --tags https://github.com/actions/runner-images 'ubuntu26/*' 'ubuntu24/*'; the Readme at that tag via git, raw.githubusercontent.com may rate-limit). Does toolset-2404.json still pin docker-ce 28? Is ubuntu-latest's move date unchanged?
4. actionlint: newest release, and whether its rule_runner_label.go now lists ubuntu-26.04 (if so the -ignore can go and setup-container.sh's actionlint pin could move; say which).
5. Without a local browser: design 3.3.1 says that if local and CI disagree, CI's bytes are committed, and the baseline step prints each changed picture as a "path base64" line. Assess whether the whole baseline regeneration can be done from CI's baseline step (first push: the browser check passes against browser.json if the mirror's bytes equal Google's; the baseline step fails and prints the seven pictures; the session commits CI's bytes; the next run passes byte for byte) and what that costs (runs, the "never stand in another browser build for a result of record" rule: CI's own 1248 is the build of record, not a stand-in). List what then still needs a local 1248: the local no-op (acceptance 4), the 13 specs locally (CI's e2e is the record for tests per the brief), the UX shots (a review stage, must wait). Recommend the plan.
${SAVE('scout-versions.progress.md', 'each numbered item with its findings as you finish it')}
Return a markdown report with sections 1-5 and a final "Changes 3.3 needs" list (each: the text to change, the new text or fact, evidence).`, { label: 'scout:versions', phase: 'Scout' }),
])

phase('Revise')
const revised = await agent(`${COMMON}

Your task: REVISE design section 3.3 for the merged base. The two scout reports:

=== FILES AND CODE ===
${files}

=== VERSIONS, BROWSERS, RUNNERS ===
${versions}

Write a new subsection "#### 3.3.7 Re-read at e908c21 (2026-10-27)" into ${DESIGN}, placed directly before "### 3.4" (after 3.3.6). It must contain:
- its sources and method (one paragraph);
- a table "What changed from the 2026-10-26 text, and why" (section, change, evidence), covering every "Changes 3.3 needs" item you accept from both scouts and each phase-1 deviation in the build summary that the design text does not yet say (RELEASE_CHAIN's size, browser-builds/*.sha256 lists, toHaveAccessibleName instead of ariaSnapshot, the apt key's input, the after-#42 split and what moved to it, etc.), each either adopted as the design's text (and why it is the better option) or reverted;
- "The new workflows under ci-browser's rules": content-calendar.yml and release-capacity.yml, each job's runner and every ci-browser rule that applies (with the recommended option and reason);
- "Phase 2 on this base, in order": the no-browser steps (each with its command and check) and the steps that wait on a local Chromium 1248 (recorded as "waiting on the person: storage.googleapis.com"), and the baseline plan when no local browser exists (CI's baseline step as the source of the committed bytes; the local no-op recorded as waiting), and the A9 plan under the 2026-10-27 direction (the session takes the recommended option and records it with side-by-side images of old and new baselines plus pixel counts in a design note designs/lane-b-ci/ci-browser-a9.md; the visual-inspection agent still runs);
- the counts the PR must reach (unit, db, e2e, golden) from e908c21's CI numbers plus ci-browser's changes;
- "Engineering choices made here" and "Proposed improvements outside ci-browser" (continue the P-series numbering after P13), each reversible and recommended.
Then edit the earlier 3.3.1-3.3.4 text in place only where a fact is now wrong (versions, counts, RELEASE_CHAIN, cites), marking each edit "(3.3.7)". Keep the document's style: plain sentences, file:line cites, no model names. Change nothing outside section 3.3 except section 1's A8-A11 rows and section 3.5's CI-18 to CI-20 rows if they are now wrong.
${SAVE('revise.progress.md', 'which parts of 3.3.7 are written and which in-place edits are done')}
Return: a short summary of what you wrote and every in-place edit (old and new text).`, { label: 'revise', phase: 'Revise' })

phase('Review')
const review = await agent(`${COMMON}

Your task: ADVERSARIAL REVIEW of the re-read just written into ${DESIGN} section 3.3 (new 3.3.7, and in-place edits marked "(3.3.7)"). The reviser's summary:
${revised}

Read section 3.3 whole, then check every claim of 3.3.7 against the merged tree at /home/user/ci-browser (2ab2b15), the network (npm registry, git ls-remote; read only) and GitHub (read only). Hunt for: wrong or stale facts and cites; a phase-2 step missing or in the wrong order (the lockfile must be resolved under the gates by pnpm 10.34.8, never by hand; generated files regenerated, never hand-merged; failing-first runs recorded); a rule of ci-browser that the new workflows escape; a security weakening (binding, cache trust, browser check); anything that lets a baseline or browser change merge without CI proving the bytes; anything that stands another browser build in for a result of record; anything that touches a "Not while #42 is open" file beyond what Q2 and rule 6 allow; a migration or a founder-kept decision; counts that do not add up; the A9 plan not giving the co-founder's inspection its evidence; anything the pipeline (draft PR, two reviews with the UX one, fix round with the full local suite, fresh-clone verification, merge rules) would trip on.
Write the review to /home/user/ops/designs/lane-b-ci/ci-browser-reread2-review.md: numbered findings as B (blocking), S (should fix) and N (nit), each with evidence and the fix you propose.
${SAVE('review.progress.md', 'findings so far')}
Return the review's text.`, { label: 'review', phase: 'Review' })

phase('Fold')
const fold = await agent(`${COMMON}

Your task: FOLD the adversarial review into the design. The review (also at /home/user/ops/designs/lane-b-ci/ci-browser-reread2-review.md):
${review}

For each finding, check it again against the code, the network or GitHub before changing any text. Fix every real one in ${DESIGN} section 3.3 (in 3.3.7, or in place marked "(3.3.7)"), taking the recommended option (security: the safer one); a finding that is wrong is answered with evidence. Then append "#### 3.3.8 Review of the re-read at e908c21 (2026-10-27)" directly after 3.3.7: one line of totals and, per finding, its disposition (Fixed / Fixed by another means / Not taken) with the reason. Also copy the two scout reports from ${SP}/reread2/ to /home/user/ops/designs/lane-b-ci/scout-ci-browser-reread2-files.md and scout-ci-browser-reread2-versions.md (unchanged).
${SAVE('fold.progress.md', 'each finding and its disposition as you go')}
Return: the totals, each disposition in one line, and the final "Phase 2 on this base, in order" list from 3.3.7 verbatim.`, { label: 'fold', phase: 'Fold' })

return { revised, fold }
