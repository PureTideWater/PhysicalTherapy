export const meta = {
  name: 'lane-b-ci-mutation-trigger-build',
  description: 'P4 ci-mutation-trigger: builders B1 (classifier) and B2 (Stryker by path, runtime, commit, workflow) in parallel, an integrator (merge, documents, matrix, synth, checks, push, draft PR read back), two adversarial reviews in fresh clones, a completeness critic and a gap review if it finds any',
  phases: [
    { title: 'Build', detail: 'B1 tools/stryker classifier; B2 Stryker by path, runtime, commit, mutation.yml' },
    { title: 'Integrate', detail: 'merge, documents, matrix, synth, checks, failing-first, push, draft PR' },
    { title: 'Review', detail: 'two adversarial reviews in fresh clones: CI tooling and security; payment engine' },
    { title: 'Critic', detail: 'what neither review covered; a third review on the gaps if any' },
  ],
}

const OUT = '/home/user/laneb-sp/p4build'
const DESIGN = '/home/user/ops/designs/lane-b-ci/follow-up-p4-mutation-trigger.md'
const BASE = '43565235b85d9b4909f6d7b51f23097e0775cef5'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. You work for a Lane B item session (session_01FcouKNP2XtaombFLueKLnu) that owns P4, "a narrower mutation trigger: mutation runs only on what can change a shard's result" (branch co-001/ci-mutation-trigger; ADR 0066 Part 7, notices from N43; test-matrix and packages/synth CI-27 to CI-29; proposals P29-P37 (P29, P34, P36 withdrawn), P43, P44). The design is ${DESIGN}: section 14 ("Re-read at bce57f16", which governs wherever it differs from sections 1 to 13) and section 15 (its review's and the completeness critic's dispositions) are your plan; 14.6 "Build plan on this base" (rewritten by the folds) names each builder's files, commits and the 65 cases (★ red first, ◆ guards) one by one; 14.7 holds the E-numbered engineering choices 14.6 cites. Read 14 and 15 whole, then whichever of sections 1 to 13 your part needs.
The base is claude/build-platform ${BASE} (#83 merged at 2026-11-01 20:40:34Z after the re-read's bce57f16; #83 touched none of P4's tools/ or .github/ files, only line numbers in the shared documents (watched-paths.txt :463,:466 are now :465,:468), as 14.4 and 15.5 say). The pull request must reach the base's unit count plus P4's 3 files and 65 tests: at bce57f16 that was 404 files, 6,893 passed, 1 skipped, so 407 and 6,958 + 1; read the base's own count at ${BASE} from its ci push run (gh api 'repos/PureTideWater/PhysicalTherapy/actions/runs?head_sha=${BASE}&event=push', the unit job's log) and use base + 3 files + 65 tests. The scoped run (pnpm exec vitest run --project unit tools/stryker tools/test) goes from 32 files and 392 tests to 35 and 457 (recheck the base side at ${BASE}). The main worktree is /home/user/ci-mutation-trigger, on co-001/ci-mutation-trigger at ${BASE}, node_modules installed. Status file (the session's): /home/user/ops/approval-summaries/lane-b-ci-deps-status.md. Rules: /home/user/ops/LANES.md (rule 6; the "Not while #42 is open" list: among #42's files P4 may touch only rule 6's shared documents: docs/product/test-matrix.md, docs/product/reconciliation-001.md, ADR files, packages/synth/src/cases/{matrix,registry}.ts), /home/user/ops/lanes/lane-b.md ("How Lane B runs").

Facts: from this container gh api reads repos, pulls, commits, releases, Actions runs and job logs (some Actions paths such as /actions/variables answer 403); git over https to github.com and registry.npmjs.org work. Local Node is v24.22.0 and pnpm 10.34.8; CI's unit job has run Node v24.22.1 (so a test against the real runtime pins injects them, as 15.5 N-3 says). Rulings: the co-founder's 2026-10-26 ~00:20 UTC ruling and "Don't ask for approvals anymore just build and optimize" (take the recommended option, security the safer one, without asking; record the choice and its reason in your result). The founder's standing rule: only the best option, never weighted by effort. Founder-kept (never yours): domain-model approval (so any migration), release tags, owner-admin settings, legal text, freeze exceptions, reversing a founder ruling: if one arises, stop that part and report it.

Rules for you:
- Synthetic data only. No PHI, real 835, contract or export anywhere.
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH
- Heavy commands (pnpm install, typecheck, lint, tests, builds, Stryker) only under: flock /tmp/laneb-heavy.lock <command>. Builders share this machine.
- Commits: in your own worktree and branch only, one concern each, as 14.6 numbers them, every message ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FcouKNP2XtaombFLueKLnu
  Never amend, rebase, reset --hard, force or --no-verify. Push only if your task says so.
- Generated files are never hand-edited: fixtures/synthetic by pnpm synth --all; tools/screening-capacity/watched-paths.txt by pnpm exec tsx tools/screening-capacity/watched.ts --write; pnpm-lock.yaml by pnpm install (P4 changes no manifest or lockfile; if you find you need a dependency, stop and report it).
- No model name or identifier in any file, commit or comment. Never write a secret or token.
- Failing first: the red commits (1 and 3) must be red on behaviour (an assertion, not a missing export or a syntax error), as 14.6 says; save each red and green run's log in ${OUT}/logs/ with its command and UTC time.
- Improve as you go: an improvement inside P4's files goes in with its test and is named in your result; one outside goes in your result's notes as a proposal.
- Long commands: run_in_background and wait for the notification, or a Monitor until-loop; no long foreground sleep.
- Change nothing under /home/user/ops except the files your task names. Never run git commands that change /home/user/PhysicalTherapy's checkout (worktree add/remove is fine).`
const SAVE = (file, what) => `Save as you go: keep ${OUT}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless git and the files say otherwise, and continue from where it stopped (git log shows your commits).`

phase('Build')
const [b1, b2] = await parallel([
  () => agent(`${COMMON}

You are builder B1, THE CLASSIFIER (14.6 "B1"): commits 1 (red) and 2 (green). Set up (if absent): git -C /home/user/PhysicalTherapy worktree add -b co-001/ci-mutation-trigger-b1 /home/user/ci-mutation-trigger-b1 ${BASE} (a local branch, never pushed), then flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile there. You may change only the files 14.6 gives B1 (tools/stryker/{manifests.ts, manifests.test.ts, affected.ts, affected.test.ts, workspace.ts} and whatever else 14.6 lists for B1 exactly). Do NOT touch B2's files (stryker.ts, runtime.ts, shards.ts, gate.ts, test-support.ts, canary/**, mutation.yml, workflows.test.ts) or any document, matrix, synth or collection.test.ts file (the integrator's). Mind the seams 15.5 names (RUNNER_PROOF_SHARD exported in commit 1; DEPENDENCY_FIELDS moved, not duplicated; GLOBAL_LOADED's members as 15.5 N-4 settles them; Change.texts three states; globalFiles with includeTests: true).
Build every B1 case of 14.6's list, ★ cases red at commit 1 on behaviour, everything green at commit 2. Then under the lock: pnpm exec vitest run --project unit tools/stryker tools/test (0 failed; counts), pnpm typecheck, pnpm lint. Then run the archived replay harness (/home/user/ops/designs/lane-b-ci/p4-reread-tools/replay.mts and its helpers; copy them under ${OUT}/replay/ and adapt only paths) with your affected() over every pull request into claude/build-platform now (gh api pulls?state=all&base=claude/build-platform, all pages): expected on the 58 the re-read saw, 22 full runs -> 15, the same seven narrowed (#2, #3, #4, #6, #25, #31, #43), none widened or lost; report any pull request opened since with its result.
${SAVE('b1.progress.md', 'each commit, the red and green logs, the checks and the replay')}
Return: your commits (full sha and subject), the red run's failing test names (commit 1) with their assertion messages, the green counts, each check's result, the replay table and totals, deviations from the design and why, and proposals.`, { label: 'builder:B1', phase: 'Build' }),
  () => agent(`${COMMON}

You are builder B2, STRYKER BY PATH, THE RUNTIME, THE COMMIT AND THE WORKFLOW (14.6 "B2"): commits 3 (red) and 4 (green). Set up (if absent): git -C /home/user/PhysicalTherapy worktree add -b co-001/ci-mutation-trigger-b2 /home/user/ci-mutation-trigger-b2 ${BASE} (a local branch, never pushed), then flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile there. You may change only the files 14.6 gives B2 (tools/stryker/{stryker.ts, stryker.test.ts, runtime.ts, runtime.test.ts, shards.ts, shards.test.ts, gate.ts, gate.test.ts, test-support.ts}, tools/stryker/canary/{verdict.ts, verdict.test.ts, stryker.config.mjs (its comment only)}, .github/workflows/mutation.yml (the lines 14.6 names and the new changes-job step), tools/test/workflows.test.ts's mutation describe, and whatever else 14.6 lists for B2 exactly). Do NOT touch B1's files (manifests.ts, affected.ts, workspace.ts and their tests) or any document, matrix, synth or collection.test.ts file. Mind the seams 15.5 names (runStryker(args, env, root = repositoryRoot, spawn = spawnSync) with cwd: root; an injected spawn so the red commit starts no real Stryker; checkRuntime(runtime, pins) injected because CI's unit job runs Node v24.22.1; the gate's existing cases 15.5 S-2 lists; E8 in shardView asserted inside the existing :312-317; the guard scan calling globalFiles, which widens once B1 merges).
Build every B2 case of 14.6's list, ★ cases red at commit 3 on behaviour, everything green at commit 4. Then under the lock: pnpm exec vitest run --project unit tools/stryker tools/test (0 failed; counts), pnpm typecheck, pnpm lint, pnpm -s exec tsx tools/stryker/runtime.ts (the changes job's own check, local Node v24.22.0 and pnpm 10.34.8: record what it prints), pnpm actions:check --offline, and actionlint over .github/workflows/*.yml with -shellcheck= -pyflakes= -ignore 'label "ubuntu-26\\.04" is unknown' (exit 0). Also one real Stryker shard by the new by-path form (the smallest shard stryker/shards.json lists), to prove the path invocation and the runtime print end to end; record its duration and verdict.
${SAVE('b2.progress.md', 'each commit, the red and green logs, the checks and the real shard run')}
Return: your commits (full sha and subject), the red run's failing test names (commit 3) with their assertion messages, the green counts, each check's result, the runtime.ts output, the real shard's result, deviations from the design and why, and proposals.`, { label: 'builder:B2', phase: 'Build' }),
])

phase('Integrate')
const integ = await agent(`${COMMON}

You are the INTEGRATOR, working in /home/user/ci-mutation-trigger on co-001/ci-mutation-trigger (at ${BASE}). Builder B1's result (branch co-001/ci-mutation-trigger-b1, worktree /home/user/ci-mutation-trigger-b1; commits 1 and 2):
=== B1 ===
${b1}
Builder B2's result (branch co-001/ci-mutation-trigger-b2, worktree /home/user/ci-mutation-trigger-b2; commits 3 and 4):
=== B2 ===
${b2}

Your steps (14.6 "The integrator"):
1. Read both results critically against the design. git merge --no-ff co-001/ci-mutation-trigger-b1, then git merge --no-ff co-001/ci-mutation-trigger-b2 (merge commits; resolve any conflict keeping both sides). The guard scan is then red until manifests.ts's and canary/stryker.config.mjs's entries join its list with their reasons: add them in a small commit; fix any other seam (GLOBAL_LOADED, mutation.yml:92) the same way, each with its test. collection.test.ts FILES gains the three new test files under "// The mutation trigger (docs/adr/0066, Part 7)."
2. The documents commit, as 14.6 says: ADR 0066 Part 7 after Part 5 (P2's Part 6 has not merged; Part 7 moves when it does) with its Status, Date, Deciders and PRD lines, Part 4's two amendments, notices from N43; docs/runbooks/ci.md at the lines 14.6 names (re-read at ${BASE}); docs/product/reconciliation-001.md (P4's paragraph and bullet in P1's form, after P1's); docs/product/test-matrix.md's intro and CI-27 to CI-29 after CI-23 (P2's CI-24..26 not merged); packages/synth/src/cases/matrix.ts and registry.ts after CI-23. Then pnpm synth --all (it writes fixtures/synthetic/CI-27..29/expected.json: commit them), and pnpm exec tsx tools/screening-capacity/watched.ts --write (commit any change it makes; P4 changes watched files). Then git status --porcelain must be empty.
3. Checks under the lock (the full local suite runs once in the fix round, not here): pnpm typecheck; pnpm lint; pnpm lint:logs; pnpm test (the unit project with coverage: record files, passed, failed, skipped against base + 3 files + 65 tests, and name each local skip); pnpm verify-content; pnpm actions:check --offline; BASE=origin/claude/build-platform pnpm actions:check; BASE=origin/claude/build-platform pnpm toolchain:check; actionlint with the -ignore; pnpm -s exec tsx tools/stryker/runtime.ts; tools/stryker/affected.ts against the base for this branch (what it says P4 affects, expected all four packages). Fix anything red in a small commit with its test, then rerun what it touches.
4. Failing first: in temporary worktrees at commit 1 and commit 3 (the red commits), run the ★ tests and save the logs (red on behaviour, the named tests); at the head, the same tests green. Write ${OUT}/failing-first.md (each ★ case red at its commit and green at the head) and remove the temporary worktrees.
5. Scope check: no migration and no change under packages/pricing, packages/ledger, packages/db, content/, tools/verify-content, apps/, docs/product/domain-model.md; no manifest or lockfile change; of #42's files (git fetch origin pull/42/head into a temporary ref and diff against its merge base, or the GitHub MCP pull_request_read get_files, all pages), list the ones this branch changes and confirm each is a rule-6 shared document; list the overlaps with the open PRs 14.4 names (#86, #75, #84, #85, #90-#94, P2) at their current heads, by file.
6. Push: git push -u origin co-001/ci-mutation-trigger (GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks in the environment; the pre-push hook runs the fixture check and gitleaks; never --no-verify, never force; a refused push of unpushed commits: git reset --soft ${BASE}, remove the flagged text, commit again in the same split, push).
7. Open the DRAFT pull request into claude/build-platform with the GitHub MCP tools (load with ToolSearch "select:mcp__github__create_pull_request,mcp__github__update_pull_request,mcp__github__pull_request_read"): title "CI follow-up P4, ci-mutation-trigger: mutation runs only on what can change a shard's result (ADR 0066 Part 7)", draft true, head co-001/ci-mutation-trigger, base claude/build-platform. Its description follows /home/user/ci-mutation-trigger/.github/pull_request_template.md section by section (every section; "None" rather than omitted; the template's required-checks markers kept exactly; "The founder's approval" in the template's own words), filled from the design and your results: What changes (by builder and file), Why (the co-founder's ruling it is taken under; LANES.md's row "CI follow-ups from ci-deps' re-read"; the design path on claude/build-ops; acceptance 1's replay), What it does not change (each line answered), Checks (every command with its result and counts; the failing-first table; what CI must prove: every required check, acceptance 4 read from the shard logs, the counts), the reviewer agents' section ("running" for now), Freeze exception, Domain model (no migration), the founder's approval, and the proposals. End the description with a blank line and then exactly:
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01FcouKNP2XtaombFLueKLnu
Write the body to ${OUT}/pr-body.md first; create the PR with it; then read it back with pull_request_read get, write the returned body to ${OUT}/pr-body-readback.md and cmp the two (identical, or fix with update_pull_request and read back again). Never comment, review or merge.
8. Write the build summary to /home/user/ops/approval-summaries/lane-b-ci-mutation-trigger-build-summary.md (do not commit it): the PR number and URL, the commits on top of ${BASE}, every check with its numbers, the failing-first table, the scope check, the overlaps, the replay, deviations, and what CI must prove next. Shorten any 40- or 64-hex hash in that file to 8 hex digits and an ellipsis. Then remove the two builder worktrees (git -C /home/user/PhysicalTherapy worktree remove ...; keep the local branches).
${SAVE('integrate.progress.md', 'each step done, its results, the pushed head and the PR number')}
Return: the PR number and URL, the pushed head sha, the summary file's text, and anything the session must decide.`, { label: 'integrator', phase: 'Integrate' })

phase('Review')
const REVIEW = (who, focus, file, extra) => `${COMMON}

You are an ADVERSARIAL REVIEWER (${who}) of P4's draft pull request. Your job is to find what is wrong, not to agree. The integrator's report (the PR number and the pushed head are in it):
=== INTEGRATOR ===
${integ}
${extra || ''}
Work in a fresh clone of your own: git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git /home/user/review-p4-${file} && cd there && git checkout <the pushed head sha> (read only: never push, comment, review or approve; GitHub read only, through gh api or the MCP read tools). Install with flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile, and run what you need under the lock. Read the design (sections 14 and 15 govern), the diff against the merge base with claude/build-platform, and CI on the head as far as it has run (gh api actions/runs?head_sha=...; the mutation run's changes job prints the classifier's reasons and the runtime check).
Your focus: ${focus}
Find real defects, not style. For each: B (blocking), S (should fix) or N (nit), the file:line, a concrete failing input or scenario, evidence (a command you ran with its output, or a cited line), and the fix you propose. Say what you checked and found sound, too. Write the review to /home/user/ops/approval-summaries/lane-b-ci-mutation-trigger-review-${file}.md (do not commit it). Remove your clone when done.
${SAVE('review-' + file + '.progress.md', 'what you have checked and the findings so far')}
Return the review's text.`
const [revCi, revPay] = await parallel([
  () => agent(REVIEW('CI tooling and security',
    'every way a change that alters a shard\'s result is classed inert and skips mutation (scripts a shard runs, lifecycle scripts, bins on PATH, a catalog line a money package imports, overrides, onlyBuiltDependencies, packageManager, the Node pin, Stryker or vitest config reached through a script or a path, mutation.yml steps, a new manifest form, a workspace pattern, .pnp.cjs, actions.lock, a file a shard loads by path); fail-open parses (no text, unread side, YAML or JSON errors, an absent side); the guard scan and GLOBAL_LOADED on the real graph; the runtime step and the commit leg (can a shard run on a different Node, pnpm or commit and still pass the gate); the by-path Stryker invocation (argument injection, cwd, env); the token and permissions in mutation.yml; the workflows.test.ts asserts; actions:check and toolchain:check; timeouts; anything a push run, Dependabot\'s next pull request, #86 (its bounded-values cites), #84 (shards) or P2 will trip on; the counts.',
    'ci-tooling-security'), { label: 'review:ci-tooling-security', phase: 'Review' }),
  () => agent(REVIEW('payment engine',
    'the money packages\' protection by mutation: can any change to packages/money, packages/pricing, packages/ledger or packages/packets (code, their package.json, a catalog or override line they resolve, a shared util they import, a config their tests load) now skip the shards that cover it; the shard map in stryker/shards.json against the packages\' closures; the gate\'s thresholds, equivalent-mutant lists and the runner-proof shard (RUNNER_PROOF_SHARD, money-ledger) after #84\'s split adds packets-roles and packets-words; whether the canary still proves the runner; whether acceptance 4 (per-file counts equal to the base\'s push run) is checkable and holds; integer-cents and rounding code is untouched. Run tools/stryker/affected.ts on synthetic changes to each money package and its manifests and show it selects the right shards.',
    'payment-engine'), { label: 'review:payment-engine', phase: 'Review' }),
])

phase('Critic')
const CRIT = { type: 'object', properties: { gaps: { type: 'array', items: { type: 'object', properties: { area: { type: 'string' }, why: { type: 'string' }, evidence: { type: 'string' } }, required: ['area', 'why', 'evidence'] } }, summary: { type: 'string' } }, required: ['gaps', 'summary'] }
const critic = await agent(`${COMMON}

You are the COMPLETENESS CRITIC over P4's two adversarial reviews. The integrator's report:
${integ}
=== REVIEW: CI tooling and security ===
${revCi}
=== REVIEW: payment engine ===
${revPay}
Ask what neither review checked that P4's diff could break: a file in the diff neither read, a rule of 14.6 or a case of its 65 neither exercised, a claim in the PR description neither verified, an interaction with an open PR neither tried, a path CI takes (push vs pull_request, Dependabot) neither followed. Check each answer yourself (in a fresh clone under /home/user/review-p4-critic at the pushed head, removed when done) before reporting it: a gap is an unexamined area with a concrete reason it could hide a defect, not a defect claim. An empty list is a good answer. Do not write any file in /home/user/ops.
${SAVE('critic.progress.md', 'gaps found so far')}`, { label: 'critic', phase: 'Critic', schema: CRIT })

let revGap = null
const gaps = (critic && critic.gaps) || []
if (gaps.length) {
  log(`critic: ${gaps.length} unexamined area(s); a third review on them`)
  revGap = await agent(REVIEW('gap reviewer', `ONLY these areas the two reviews did not examine (the completeness critic's list):\n${JSON.stringify(gaps, null, 1)}`, 'gaps'), { label: 'review:gaps', phase: 'Critic' })
} else log('critic: no unexamined areas')

return { b1, b2, integ, revCi, revPay, critic, revGap }
