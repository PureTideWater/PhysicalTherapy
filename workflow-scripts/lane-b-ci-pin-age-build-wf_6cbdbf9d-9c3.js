export const meta = {
  name: 'lane-b-ci-pin-age-build',
  description: 'P1 ci-pin-age: B2 refactor first, then builders B1 (action pin age) and B2 (image age) in parallel, an integrator (docs, suite, push, draft PR), then two adversarial reviews',
  phases: [
    { title: 'Refactor', detail: 'B2 commit 1: exclude-window.ts, a no-op refactor' },
    { title: 'Build', detail: 'B1 tools/check-action-pins + ci.yml env; B2 tools/check-toolchain image rule' },
    { title: 'Integrate', detail: 'merge, documents, matrix, synth, full local suite, failing-first, push, draft PR' },
    { title: 'Review', detail: 'two adversarial reviews in fresh clones: CI and test infrastructure; security and supply chain' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/5b1bc8b7-7846-5c40-a0f8-306593ba96be/scratchpad'
const OUT = SP + '/p1build'
const DESIGN = '/home/user/ops/designs/lane-b-ci/follow-up-p1-pin-age.md'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. You work for a Lane B item session that owns P1, "action pins and image digests held to the three-day floor" (branch co-001/ci-pin-age; ADR 0066 Part 5; test-matrix and packages/synth CI-21 to CI-23). The design is ${DESIGN}: read section 14 ("Re-read at ecebdc90", which governs wherever it differs from sections 1 to 12; its 14.5 "Build plan on this base" is your plan, with the full case lists) and section 15 (its review's dispositions), then whichever of sections 1 to 12 and 14.4/14.6 your part needs (14.6 is the E-numbered engineering choices that 14.5 cites). The branch co-001/ci-pin-age was fast-forwarded on 2026-10-28 to claude/build-platform 0dd1ba7e (#80 merged after ecebdc90; it changes none of P1's files under tools/ or .github/, only line numbers in the three shared documents, as 14.5's last paragraph says), so on this base the pull request must reach **386 unit files, 6,480 passed and 1 skipped** (0dd1ba7e's push run: 383 files, 6,418 passed, 1 skipped; P1 adds 3 files and 62 tests), and the scoped run (tools/check-action-pins tools/check-toolchain tools/test) goes from 29 files and 358 tests to 32 and 420. The main worktree is /home/user/ci-pin-age (node_modules installed). Status file (the session's): /home/user/ops/approval-summaries/lane-b-ci-deps-status.md. Rules: /home/user/ops/LANES.md (rule 6; the "Not while #42 is open" list: P1 may touch only the shared documents among #42's files: docs/product/test-matrix.md, docs/product/reconciliation-001.md, packages/synth/src/cases/{matrix,registry}.ts), /home/user/ops/lanes/lane-b.md ("How Lane B runs").

Facts: from this container api.github.com answers 403 (so the API reads are skipped locally with a note, exactly as the design says; CI makes them); git over https to github.com, hub.docker.com, keyserver.ubuntu.com and registry.npmjs.org work. gpgv 2.4.4 and gpg are at /usr/bin. Rulings: F2 (b), CQ1 (a), the co-founder's 2026-10-26 ~00:20 UTC ruling (take the recommended option, security the safer one, without asking; record the choice and its reason in your result). The founder's standing rule: only the best option, never weighted by effort.

Rules for you:
- Synthetic data only. No PHI, real 835, contract or export anywhere. Test owners and repositories are made up; signed objects are the synthetic ones testdata/age/make.sh makes; no GitHub key material in tests; never commit a private key.
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH (the default node is 22; pnpm is 10.34.8).
- Heavy commands (pnpm install, typecheck, lint, tests, builds) only under: flock /tmp/laneb-heavy.lock <command>. Builders share this 4-CPU machine.
- Commits: in your own worktree and branch only, one concern each, as 14.5 numbers them, every message ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UzQ6wgZgtThBRBxXTFYhRB
  Never amend, rebase, reset --hard, force or --no-verify. Push only if your task says so.
- Generated files are never hand-edited: fixtures/synthetic by pnpm synth --all; pnpm-lock.yaml by pnpm install (P1 changes no manifest or lockfile; if you find you need a dependency, stop and report it).
- No model name or identifier in any file, commit or comment. Write any 64-hex image digest or key fingerprint in a document as the design does; never write a secret or token.
- Failing first: the red commits (2 and 4) must be red on behaviour, as 14.5 says; save each red and green run's log in ${OUT}/logs/ with its command and UTC time.
- Improve as you go (the co-founder's standing direction): an improvement inside P1's files goes in with its test and is named in your result; one outside goes in your result's notes as a proposal.
- Long commands: run_in_background and wait for the notification, or a Monitor until-loop; no long foreground sleep.
- Change nothing under /home/user/ops except the files your task names.`
const SAVE = (file, what) => `Save as you go: keep ${OUT}/progress/${file} up to date (${what}), so an interruption (the account's 5-hour limit can stop you) loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless git and the files say otherwise, and continue from where it stopped (git log shows your commits).`

phase('Refactor')
const b2a = await agent(`${COMMON}

You are builder B2, first step: COMMIT 1 ONLY. Set up (if absent): git -C /home/user/PhysicalTherapy worktree add -b co-001/ci-pin-age-b2 /home/user/ci-pin-age-b2 0dd1ba7e (a local branch, never pushed), then flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile there. Build 14.5's commit 1 in tools/check-toolchain exactly: exclude-window.ts (the window checks and the expired rule out of releaseAgeExcludeRule; releaseAgeMinutes(workspace) replacing the inline Math.max; ageWords moved), the caller keeping what 14.5 says it keeps, and exclude-window.test.ts with its 4 direct cases. Proof that it is a no-op: check-toolchain's check.test.ts passes unchanged (its window cases included); run pnpm exec vitest run --project unit tools/check-toolchain, pnpm typecheck and pnpm lint under the lock, all green. Make the export names and signatures the ones builder B1 will import (releaseAgeMinutes, the window function for an exclude entry, the expired rule), and document them in a short comment in the file in the code's own style.
${SAVE('b2a.progress.md', 'the refactor, its commit and its checks')}
Return: the commit (full sha and subject), the exported API of exclude-window.ts (each export's signature and what it does, verbatim from the file), the check results with counts.`, { label: 'builder:B2-commit1', phase: 'Refactor' })

phase('Build')
const [b1, b2] = await parallel([
  () => agent(`${COMMON}

You are builder B1: tools/check-action-pins, ci.yml's "Action pins" step and its asserts (14.5 "B1", commits 4 and 5). Builder B2 has landed commit 1 on co-001/ci-pin-age-b2; its report:
=== B2 commit 1 ===
${b2a}
Set up (if absent): git -C /home/user/PhysicalTherapy worktree add -b co-001/ci-pin-age-b1 /home/user/ci-pin-age-b1 <B2's commit 1 sha> (a local branch, never pushed), then flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile there. You may change only tools/check-action-pins/**, .github/workflows/ci.yml (the step's env, its comment and :13 as 14.5 says) and tools/test/workflows.test.ts (the asserts 14.5 names). Do NOT touch tools/check-toolchain (B2 owns it; import releaseAgeMinutes and the window from its exclude-window.ts) or any document, matrix or synth file (the integrator's).
- Commit 4, failing first (red on behaviour; save the red run's log): age.test.ts with its six ★ cases through checkActionPins, check-action-pins check.test.ts's three cases, and workflows.test.ts's split step loop and E8/S8 token asserts.
- Commit 5, the age rule (green): everything 14.5 lists for B1, including keys.ts, github-web-flow.asc (both web-flow public keys: fetch them from keyserver.ubuntu.com by fingerprint 968479A1AFF927E37D1A566BB5690EEEBB952194 and 5DE3E0509C47EA3CF04A42D34AEE18F83AFDEB23 and verify the fingerprints; record the commands), age-exceptions.json, testdata/age/ with make.sh run once (gpg with a SHORT GNUPGHOME such as a fresh directory /home/user/.gp1 made with mode 700, since the scratchpad path is too long for gpg-agent's socket; kill the agent with gpgconf --homedir <dir> --kill all and remove the directory after; commit only public keys and the signed objects, whose SHAs are their real hashes), the other 23 age.test.ts cases (29 in all), buildkit.test.ts +1, verify.test.ts +2, check-action-pins workflows.test.ts +1, and the existing cases' changes exactly as 14.5 describes (only the two assertions it names change).
Then under the lock: pnpm exec vitest run --project unit tools/check-action-pins tools/test (0 failed; give counts), pnpm typecheck, pnpm lint, pnpm actions:check --offline, and BASE=origin/claude/build-platform pnpm actions:check (networked: locally the API reads are skipped with a note, so record what it prints for every pin: fetchRefs, tag-names-pin, default branch, signals, the local verdict). Also run actionlint over .github/workflows/*.yml with -shellcheck= -pyflakes= -ignore 'label "ubuntu-26\\.04" is unknown' (exit 0). Commit as you go.
${SAVE('b1.progress.md', 'each commit, the red and green logs, the key fetch and make.sh outputs, and the check results')}
Return: your commits (full sha and subject), the red run's failing test names (commit 4) and the green counts, each check's result, the local actions:check output per pin, deviations from the design and why, and proposals.`, { label: 'builder:B1', phase: 'Build' }),
  () => agent(`${COMMON}

You are builder B2, continuing in /home/user/ci-pin-age-b2 on co-001/ci-pin-age-b2 after your commit 1:
=== your commit 1 ===
${b2a}
You may change only tools/check-toolchain/**. Do NOT touch tools/check-action-pins, any workflow, or any document, matrix or synth file.
- Commit 2, failing first (red on behaviour; save the red run's log): images.test.ts with its two ★ cases through checkToolchain, and tree.test.ts's two cases, as 14.5 says.
- Commit 3, the image rule (green): everything 14.5 lists for B2 (tree.ts, check.ts, images.ts, registry.ts with the signal, the per-host try timeout and the rate-limit wait, policy.ts, image-age-exceptions.json), images.test.ts's other 15 cases (17 in all), registry.test.ts +3, and the existing cases' changes exactly as 14.5 describes.
Then under the lock: pnpm exec vitest run --project unit tools/check-toolchain (0 failed; give counts), pnpm typecheck, pnpm lint, pnpm toolchain:check --offline if the checker has an offline form, and BASE=origin/claude/build-platform pnpm toolchain:check (networked; record what the image rule prints: with this base nothing is new, so its note), and the live image path of 14.5: BASE=afe339b9^ pnpm toolchain:check from your head (record the image rule's reads and verdicts for node, postgres and the builder; its npm findings are not P1's). Commit as you go.
${SAVE('b2.progress.md', 'each commit, the red and green logs and the check results, including the live image reads')}
Return: your commits (full sha and subject), the red run's failing test names (commit 2) and the green counts, each check's result, the live image reads and verdicts, deviations from the design and why, and proposals.`, { label: 'builder:B2', phase: 'Build' }),
])

phase('Integrate')
const integ = await agent(`${COMMON}

You are the INTEGRATOR, working in /home/user/ci-pin-age on co-001/ci-pin-age (at 0dd1ba7e). Builder B2's result (branch co-001/ci-pin-age-b2, worktree /home/user/ci-pin-age-b2; commits 1 to 3):
=== B2 commit 1 ===
${b2a}
=== B2 ===
${b2}
Builder B1's result (branch co-001/ci-pin-age-b1, worktree /home/user/ci-pin-age-b1, cut at B2's commit 1; commits 4 and 5):
=== B1 ===
${b1}

Your steps:
1. Read both results critically against the design. git merge --ff-only co-001/ci-pin-age-b2, then git merge --no-ff co-001/ci-pin-age-b1 (a merge commit; resolve any conflict keeping both sides). Fix any seam between the two (B1's imports from exclude-window.ts, a shared floor or deadline, the push-run convention) in a small commit with its test.
2. Commit 6, as 14.5 "Integrator" says: ADR 0066 Part 5 and its Status, Date, Deciders and PRD lines, Part 1's and Part 2's "(amended by Part 5)"; docs/runbooks/dependency-upgrades.md and docs/runbooks/ci.md; packages/compliance/src/controls.ts; docs/product/reconciliation-001.md; the test matrix's CI intro and CI-21 to CI-23; packages/synth/src/cases/matrix.ts and registry.ts (take the line numbers at 0dd1ba7e: 14.5's last paragraph); then pnpm synth --all and git diff --exit-code -- fixtures/synthetic (no file written is expected; any file written is a finding to explain). Part 5's measured state takes 14.3, the builders' local readings (B1's per-pin actions:check output, B2's live image reads); the CI readings (verified_at, published_at, immutable, the arrival read) are marked as filled from P1's CI run, which the session records after CI.
3. The full local suite, once, under the lock: pnpm typecheck; pnpm lint; pnpm lint:logs; pnpm test (record passed, failed, skipped against the expected 6,480 + 1; a local run may skip tests that need CI, so name each skip); pnpm test:db (the catalog and cross-tenant tests; four shards one after another if that is how the repo runs them; record counts); pnpm test:golden; pnpm verify-content; pnpm actions:check --offline; BASE=origin/claude/build-platform pnpm actions:check; BASE=origin/claude/build-platform pnpm toolchain:check; actionlint with the -ignore. Fix anything red in a small commit with its test, then rerun what it touches.
4. Failing first: in a temporary worktree at commit 2 (B2's red commit) and one at commit 4 (B1's red commit), run the red tests and save the logs (red on behaviour, the named tests); and at the head, the same tests green. Write ${OUT}/failing-first.md listing each ★ case red at its commit and green at the head, and remove the temporary worktrees.
5. Scope check: no migration and no change under packages/pricing, packages/ledger, packages/db, content/, tools/verify-content, apps/, docs/product/domain-model.md; no manifest or lockfile change; of #42's files (read its file list read-only: git fetch origin pull/42/head into a temporary ref and diff against its merge base, or the GitHub MCP pull_request_read get_files, all pages), list the ones this branch changes and confirm each is a rule-6 shared document.
6. Push: git push -u origin co-001/ci-pin-age (the pre-push hook runs the fixture check and gitleaks; never --no-verify, never force; a refused push of unpushed commits: git reset --soft origin/co-001/ci-pin-age if it exists, else to 0dd1ba7e, remove the flagged text, commit again in the same split, and push).
7. Open the DRAFT pull request into claude/build-platform with the GitHub MCP tools (load them with ToolSearch: "select:mcp__github__create_pull_request,mcp__github__update_pull_request,mcp__github__pull_request_read"): title "CI follow-up P1, ci-pin-age: action pins and image digests held to the three-day floor (ADR 0066 Part 5)", draft true, head co-001/ci-pin-age, base claude/build-platform. Its description follows /home/user/ci-pin-age/.github/pull_request_template.md section by section (every section; "None" rather than omitted; the template's required-checks markers kept exactly; "The founder's approval" in the template's own words), filled from the design and your results: What changes (by builder and file), Why (F2 (b), the co-founder's ruling under which P1 is taken, LANES.md's row, the design path on claude/build-ops), What it does not change (each line answered), Checks (every local command with its result and counts; the failing-first table; what CI must prove: acceptance 8, every pin's verified_at, published_at and immutable read with the token, and the counts 386 files, 6,480 + 1), the reviewer agents' section ("running" for now), Freeze exception (No), Domain model (no migration), the founder's approval, and the "Improve as you go" proposals. End the description with a blank line and then exactly these two lines:
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01UzQ6wgZgtThBRBxXTFYhRB
Write the body to ${OUT}/pr-body.md first; create the PR with it; then read it back with pull_request_read get, write the returned body to ${OUT}/pr-body-readback.md and cmp the two files (identical, or fix with update_pull_request and read back again). Never comment, review or merge.
8. Write the build summary to /home/user/ops/approval-summaries/lane-b-ci-pin-age-build-summary.md (do not commit it): the PR number and URL, the commits on top of 0dd1ba7e, every check with its numbers, the failing-first table, the scope check, the #42 overlap, the local per-pin and per-image readings, deviations, and what CI must prove next. Shorten any 40- or 64-hex hash in that file to 8 hex digits and an ellipsis. Then remove the two builder worktrees (git -C /home/user/PhysicalTherapy worktree remove ...; keep the local branches).
${SAVE('integrate.progress.md', 'each step done, its results, the pushed head and the PR number')}
Return: the PR number and URL, the pushed head sha, the summary file's text, and anything the session must decide.`, { label: 'integrator', phase: 'Integrate' })

phase('Review')
const REVIEW = (who, focus, file) => `${COMMON}

You are an ADVERSARIAL REVIEWER (${who}) of P1's draft pull request. The integrator's report (the PR number and the pushed head are in it):
=== INTEGRATOR ===
${integ}

Work in a fresh clone of your own: git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git /home/user/review-p1-${file} && cd there && git checkout <the pushed head sha> (read only: never push, comment, review or approve; GitHub through the MCP read tools only). Install with flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile, and run what you need under the lock. Read the design (sections 14 and 15 govern), the diff against claude/build-platform 0dd1ba7e, and CI on the head as far as it has run (the GitHub MCP pull_request_read get_check_runs and get_job_logs; static's "Action pins" and "Toolchain" steps print every pin's and image's reading with the token: record what they print).
Your focus: ${focus}
Find real defects, not style. For each: B (blocking), S (should fix) or N (nit), the file:line, a concrete failing input or scenario, evidence (a command you ran with its output, or a cited line), and the fix you propose. Say what you checked and found sound, too. Write the review to /home/user/ops/approval-summaries/lane-b-ci-pin-age-review-${file}.md (do not commit it). Remove your clone when done.
${SAVE('review-' + file + '.progress.md', 'what you have checked and the findings so far')}
Return the review's text.`
const [revCi, revSec] = await parallel([
  () => agent(REVIEW('CI and test infrastructure',
    'the checkers as CI runs them: can a push run or a pull request that adds no pin or digest turn red (an unchanged pin read, an outage, a rate limit, the deadline, the bootstrapping rule after this PR merges); do the recorded transports and stand-ins model the real git, gpgv, GitHub API and Docker Hub answers (status codes, headers, pagination, redirects); can each ★ case actually fail first; are the counts right (386 files, 6,480 + 1; the scoped 32 and 420); timeouts against static\'s job timeout; the workflows.test.ts asserts and the rewrite copy; the documents against the code; anything Dependabot\'s next actions or images pull request will meet; anything the merge into claude/build-platform or #42 would trip on.',
    'ci-infra'), { label: 'review:ci-infra', phase: 'Review' }),
  () => agent(REVIEW('security and supply chain',
    'every way a young or moved action pin, a reusable workflow, a Docker action, or a young image digest anywhere the build runs it (Dockerfiles, compose, workflows, BuildKit, # syntax=, COPY --from, docker:// uses) still enters the build branch; fail-open paths (a missing signal, a null verified_at, a 404, a 3xx, a parse failure, a timeout); the youngest-of rule and the GitHub-recorded requirement; the exclude kinds (can one stand in for a young pin without an advisory; their windows); the signature verification (gpgv invocation, keyring handling, the expired key, fingerprints, SSH or X.509 signatures); the token: its scope, where it is passed, whether it can leak into a log, a URL or an error message, redirect handling; the synthetic testdata (no private key, no real key material beyond the two public web-flow keys).',
    'security-supply'), { label: 'review:security-supply', phase: 'Review' }),
])

return { b2a, b1, b2, integ, revCi, revSec }
