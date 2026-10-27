export const meta = {
  name: 'lane-b-ci-browser-fix-round',
  description: 'PR #77 fix round: fixers F1 (browser check), F2 (dry-run matrix, image-id, comments), F3 (header names, specs, tour) in worktrees; an integrator merges, runs the full local suite once, pushes once',
  phases: [
    { title: 'Fix', detail: 'F1, F2, F3 in their own worktrees from the local head' },
    { title: 'Integrate', detail: 'merge, seams, full local suite, failing-first, one push' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/5b1bc8b7-7846-5c40-a0f8-306593ba96be/scratchpad'
const R = '/home/user/ops/approval-summaries'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Pull request #77 (draft), "CI 3 of 4, ci-browser", branch co-001/ci-browser. Its pushed head is 367a659f; the local branch in /home/user/ci-browser is two commits ahead and NOT pushed: aab78544 (browser-build.ts --image reads the image as --user 0:0 --network none and names unreadable files) and daea87c0 (the baseline step regenerates into an empty E2E_BASELINES_DIR outside the repository; playwright.config.ts's snapshotPathTemplate; proved locally for real). Read the PR description (gh api repos/PureTideWater/PhysicalTherapy/pulls/77 --jq .body, read only), the design /home/user/ops/designs/lane-b-ci.md section 3.3 (3.3.7 and 3.3.8 override earlier text), the phase-2 summary ${R}/lane-b-ci-browser-phase2-summary.md, and the three reviews this round answers: ${R}/lane-b-ci-browser-review-ci-infra.md (CI-1 to CI-8), ${R}/lane-b-ci-browser-review-security-supply.md (SEC-1 to SEC-7), ${R}/lane-b-ci-browser-review-ux-brand.md (UX-1 to UX-6). CI-1/SEC-1 and CI-2/SEC-2 are already fixed by aab78544 and daea87c0 (keep build-stamp exactly as it is: SEC-2 says the fix must not relax it).
The session's dispositions (the recommended option each; record any deviation with its reason): every finding is fixed in this PR except UX-6 and UX-094's visible 'Current' mark, which go to UX PR 67 (co-001/ux-header-menus, the same panel, after #42) as recorded proposals, and UX-5, which is fixed on claude/build-ops (tooling, not a PR file).
Rulings: the founder's F4 and F5; the co-founder's Q2 (shell.tsx and apps/web/package.json are #42 files this PR may change; it does not wait for #42) and his 2026-10-26 ~00:20 UTC ruling (recommended option, security the safer one); the co-founder's ruling on the UX baseline's words (designs/lane-b-ux-review.md section 6.1 on claude/build-ops: "a fix takes its section 6.1 words"). Not while #42 is open: never touch tools/screening-capacity/{run,report}.ts, report.test.ts, test-support/measurements.ts, apps/web/e2e/screening.spec.ts, or anything else on /home/user/ops/LANES.md:84-92 except shell.tsx and the rule-6 shared documents; if a fix needs one of them, stop that part and report it.

Rules for you:
- Synthetic data only.
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH.
- Heavy commands (pnpm install, typecheck, lint, tests, builds, Playwright, Stryker) only under: flock /tmp/laneb-heavy.lock <command>. Several agents share this machine.
- Commits: small, one concern each, in your own worktree and branch only, each message ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UzQ6wgZgtThBRBxXTFYhRB
  Never amend, rebase, reset --hard, force or --no-verify; never push unless your task says so.
- Generated files only by their generators (pnpm install, watched.ts --write, pnpm synth --all, Playwright for PNGs).
- Failing first: each behaviour fix's test fails before the fix (on the local head daea87c0's code, through CI_TREE for file-reading tests or by running the new test against the old implementation copied aside) and passes after; save each red and green log in ${SP}/fix/logs/ with its command and UTC time.
- No model name or identifier in any file or commit. Shorten any 40- or 64-hex hash you write in a document to 8 hex digits and an ellipsis.
- Improve as you go: an improvement inside your files goes in, named in your result; one outside goes in your notes.
- Long commands: run_in_background and wait; no long foreground sleep.`
const SAVE = (file, what) => `Save as you go: keep ${SP}/fix/progress/${file} up to date (${what}). If it exists when you start, you were interrupted: read it, trust it unless git and the files say otherwise, and continue.`
const WT = (name) => `Set up (if absent): git -C /home/user/PhysicalTherapy worktree add -b co-001/ci-browser-${name} /home/user/ci-browser-${name} co-001/ci-browser (that is daea87c0; a local branch, never pushed), then flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile there. Work only there.`

phase('Fix')
const [f1, f2, f3] = await parallel([
  () => agent(`${COMMON}

You are fixer F1: THE BROWSER CHECK. ${WT('f1')}
Findings: CI-1/SEC-7 (add --pull never to both docker reads, beside aab78544's --user 0:0 --network none); CI-5/SEC-3 (a sha256sum failure inside the image must fail the check by name: keep aab78544's 'unreadable' rows and also make the xargs/sha256sum pipeline's failure visible, e.g. sums to a file and an 'error sha256sum <status>' row, turned by imageBuild into a problem of its own, never a missing or '(removed)' line); CI-4 (the stand-in docker already requires the flags; add --pull never; add a case where a stand-in sha256sum fails on one file and the check names that file as unreadable or the hash run as failed); SEC-4 (gate the check on the binary's --version line equal to "Google Chrome for Testing <browserVersion>" in both modes; in --image mode run the version command as the image's own user, i.e. a docker run WITHOUT --user, still --network none --pull never, so the check also proves the runtime user can start the shell, while the hashes stay root's; a binary that cannot start, or prints another version, fails with a message naming what it printed; the doc comment says modes are not hashed and why the version gate covers whether the shell runs). Tests in tools/ci/browser-build.test.ts for each, failing first against daea87c0's implementation. Docs: the paragraphs that describe the check in docs/runbooks/ci.md, ADR 0058's amendment and ADR 0066 Part 3 (add a notice after N21; the integrator resolves any overlap with F2's notices). Run: the tools vitest subset (pnpm exec vitest run --project unit tools/ci tools/test), node tools/ci/browser-build.ts on the local 1248 layout (/opt/pw-browsers; it must pass, including the new version gate), pnpm typecheck, pnpm lint.
${SAVE('f1.progress.md', 'each finding, its commits, its red/green logs')}
Return: commits (short sha, subject), each finding's disposition, the check outputs with counts, failing-first log paths, deviations, notes.`, { label: 'fixer:F1', phase: 'Fix' }),

  () => agent(`${COMMON}

You are fixer F2: THE DRY RUN, THE ARCHIVE READER, AND THE COMMENTS AND CACHE TEXT. ${WT('f2')}
Findings:
- CI-3: make release-dry-run.yml's build a matrix over [web, worker] exactly as release.yml's build is for those two images (per-leg outputs sha256_<image>, config_<image>, target_<image> with distinct names; the worker leg's setup-node 24 and browser-build.ts --image step before docker save; the archive identity steps), and its push (never pushes) and capacity jobs loop over both archives with the same SHA-256 checks against needs.build.outputs and the store-aware .Id compare. Keep what the dry run must not do (no registry push, no login secrets beyond what it has). Extend workflows.test.ts's dry-run equality rule to the matrix, and fix any test that counted one build (e.g. :1738, :757). If something in release.yml's other two web legs (staging, production variants) makes a full mirror wrong for the dry run, say so and mirror the worker leg only. ADR 0066 N16 then states exactly which tag-only steps no pull request runs (if any remain).
- SEC-5: tools/screening-capacity/image-id.ts takes size from a pax 'x' record when present (as path already is), and caps the bytes kept for an 'x', 'L' or 'g' entry (1 MiB) and the total kept across entries (64 MiB), each with an ImageArchiveError naming the limit; tests in image-id.test.ts for each (failing first against daea87c0's implementation).
- SEC-6: reword .github/workflows/screening-capacity.yml:26-28's comment: the launch check refuses the probe's report because it is not release.yml's attested run (the runner-image refusal lands after #42; docs/adr/0066, Part 3).
- CI-7: reword tools/ci/apt-archives.sh:61's comment as the review says.
- CI-6: docs/runbooks/ci.md's Caches section and ADR 0066's V3 paragraph say the apt key is the runner's ImageOS and ImageVersion environment variables, which can differ from the version "Set up job" prints (record the observed example: Set up job 20261012.163.1, ImageVersion 20261023.163.3).
Run: the tools vitest subset (pnpm exec vitest run --project unit tools/test tools/ci tools/screening-capacity), actionlint -shellcheck= -pyflakes= -ignore 'label "ubuntu-26\\.04" is unknown' .github/workflows/*.yml, pnpm typecheck, pnpm lint. Do not touch tools/ci/browser-build.ts or its test (F1's) or shell.tsx and the e2e specs (F3's).
${SAVE('f2.progress.md', 'each finding, its commits, its red/green logs')}
Return: commits, each finding's disposition, checks with counts, failing-first log paths, deviations, notes.`, { label: 'fixer:F2', phase: 'Fix' }),

  () => agent(`${COMMON}

You are fixer F3: THE HEADER'S NAMES, THE SPECS, AND THE TOUR. ${WT('f3')}
Findings:
- UX-1 and UX-2: take UX-094's naming part as the review's fix says (read the review's UX-1 fix whole, and designs/lane-b-ux-review.md's UX-094 entry and section 6.1 line on claude/build-ops): in apps/web/src/components/shell.tsx drop both summaries' aria-label and the account summary's title; the switcher's visible name followed by a visually hidden ", switch practice" inside the name's span; the account's email span sr-only below md and visible from md (as the review gives the classes), ending with a visually hidden ", account and sign out"; the generated-content initial kept; data-slot="practice-switcher" and data-slot="account-menu" on the two summaries. The 'Current' mark is NOT in this PR (UX PR 67). Change apps/web/e2e/brand.spec.ts and apps/web/e2e/sign-in.spec.ts to reach the two controls by those slots; grep every spec and test for 'Practice switcher', 'Account menu', 'practice switcher', 'account menu' and getByLabel uses of them; a match in a #42 file (apps/web/e2e/screening.spec.ts and the LANES.md list) is reported, never edited. The change must be pixel-neutral: the brand journey's header comparisons (STRICT/VISUAL) must pass unchanged against the committed baselines, and a local --update-snapshots=all into an empty directory (E2E_BASELINES_DIR, as ci.yml's step does) must give the seven committed files byte for byte.
- UX-3: in brand.spec.ts's computed name check, the first visible piece must match at the start of the name (a leading ^), later pieces contained; widen the selector to header controls that are summary, button, [role="button"], input or select; prove it fails on the review's regression variant (an account control named "Account menu" at 390 px whose initial is 'M') and passes on the new markup at 1280 and 390.
- UX-4: every document this PR adds that calls the cover change antialiasing (grep -rn -i antialias docs/ apps/web/e2e) says instead that Chrome 156 draws the title 'ROI statement' 1 px lower (1,611 pixels in 234 x 27 at 83, 418; shifted down one pixel the old title matches exactly; nothing else on the cover moves).
- UX-5 (claude/build-ops, not the PR; edit the files in /home/user/ops only, do not commit): /home/user/ops/tools/lane-b-screen-tour/capture/tour.spec.ts:872 selects the account menu by 'header [data-slot="account-menu"], header summary[aria-label="Account menu"]' so it works before and after this PR; add the open practice-switcher state (p.settings.practice-switcher) the same way ('header [data-slot="practice-switcher"], header summary[aria-label="Practice switcher"]'); update /home/user/ops/designs/lane-b-ux-review/route-map.json's entries that name the old aria-labels (the review lists :25, :223, :3007, :3035).
Run, with Chromium 1248 (/opt/pw-browsers, held to browser.json by node tools/ci/browser-build.ts), an e2e database tp_laneb_cib_f3_e2e on PostgreSQL 18 at localhost:5433 (E2E_ADMIN_URL=postgres://postgres:test@localhost:5433/postgres, E2E_DATABASE=tp_laneb_cib_f3_e2e, E2E_PORT=3172), --workers=2 --retries=0: brand.spec.ts and sign-in.spec.ts first, then the 14 specs that call expectAccessible (grep -l "expectAccessible(" apps/web/e2e/*.spec.ts) on axe 4.14; drop the database after. Also pnpm typecheck, pnpm lint, pnpm lint:copy if it exists.
${SAVE('f3.progress.md', 'each finding, its commits, run results')}
Return: commits, each finding's disposition, run results with counts, the #42-file matches if any, the UX-5 edits in /home/user/ops (paths and a diff summary), deviations, notes.`, { label: 'fixer:F3', phase: 'Fix' }),
])

phase('Integrate')
const integ = await agent(`${COMMON}

You are the INTEGRATOR, in /home/user/ci-browser on co-001/ci-browser (daea87c0). The fixers' results:
=== F1 ===
${f1}
=== F2 ===
${f2}
=== F3 ===
${f3}
Steps:
1. Read the results critically; merge co-001/ci-browser-f1, -f2 and -f3 with --no-ff merge commits; resolve conflicts keeping both sides (documents: both notices, renumbered in order if they clash; generated files regenerated).
2. Seams: anything one fix needs from another (for example F1's version gate in F2's new dry-run worker leg; F3's markup against the tour edit; ADR 0066's notices numbered once). Fix each in a small commit.
3. Regenerate: pnpm synth --all (expect no change, or name each file written and why); pnpm exec tsx tools/screening-capacity/watched.ts --write (expect a no-op).
4. The full local suite, once (lanes/lane-b.md "How Lane B runs" at /home/user/ops/lanes/lane-b.md; each heavy step under the lock): pnpm typecheck; pnpm lint; pnpm lint:logs; pnpm verify-content; pnpm test (record passed/failed/skipped; CI's count at 367a659f was 6,339 passed and 1 skipped, so give the new count and the delta by file); pnpm test:golden; the oracle (see lane-b.md); pnpm test:db in shards one after another against a local PostgreSQL 18 (see docs/runbooks/ci.md and lane-b.md for how the shards and the database are set; record passed and skipped; CI's was 9,223 and 0 on 26.04, and the restore drill may skip locally if the client tools are older); then commit-clean: pnpm build, the build stamp (pnpm --filter @tp/web exec tsx scripts/build-stamp.ts --write $(git rev-parse HEAD)), and E2E_PREBUILT=1 pnpm test:e2e --workers=2 against database tp_laneb_cib_int_e2e on 5433 (E2E_ADMIN_URL=postgres://postgres:test@localhost:5433/postgres, E2E_PORT=3173), expecting 54; then ci.yml's baseline step's own script, extracted from ci.yml with node and the repository's yaml package (cd tools && node -e ...), run with RUNNER_TEMP set to a scratch directory, E2E_PREBUILT=1 and the same database variables: it must exit 0 with the tree clean after; actionlint with the -ignore; BASE=origin/claude/build-platform pnpm actions:check; BASE=origin/claude/build-platform pnpm toolchain:check; node tools/ci/browser-build.ts. Mutation: list the affected shards with tools/stryker/affected.ts for this diff; if every shard is affected because a global input changed (mutation.yml), run the money-ledger shard and the gate as ci-deps' round did and record that CI runs all of them (it ran all seven green on 367a659f); otherwise run each affected shard and the gate. Drop every e2e database you made; remove temporary directories.
5. Failing first: collect the fixers' red/green logs and add the round's own (aab78544's and daea87c0's logs are in ${SP}/phase2/logs/fix-*.log); write ${SP}/fix/failing-first.md listing each finding with its test, red on the old code and green on the new.
6. Scope: no migration; nothing under packages/pricing, packages/ledger, packages/db/migrations, content/, tools/verify-content, docs/product/domain-model.md; of #42's files (gh api repos/PureTideWater/PhysicalTherapy/pulls/42/files, all pages, read only) list the ones this branch changes against e908c21 and confirm each is allowed.
7. Push once: git push origin co-001/ci-browser (the pre-push hook; never --no-verify, never force).
8. Write ${R}/lane-b-ci-browser-fix-round.md (do not commit it): every finding of the three reviews with its disposition (fixed with commit, or moved with where, or not a defect with why), the commits on 367a659f, every check with its numbers, the failing-first table, the scope check, and what CI must show next. Then remove the three fixer worktrees (git -C /home/user/PhysicalTherapy worktree remove <dir>; keep their local branches).
${SAVE('integrate.progress.md', 'each step, its results, the pushed head')}
Return: the pushed head sha, the fix-round file's text, and anything the session must decide.`, { label: 'integrator', phase: 'Integrate' })

return { f1, f2, f3, integ }
