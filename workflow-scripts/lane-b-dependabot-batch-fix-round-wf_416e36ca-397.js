export const meta = {
  name: 'lane-b-dependabot-batch-fix-round',
  description: 'Fix round for one dependabot-batch PR: apply every confirmed review finding, adversarial check of the fixes, the full local suite once, one push, description rewritten and read back',
  phases: [
    { title: 'Fix', detail: 'merge the base, apply every confirmed finding' },
    { title: 'Check', detail: 'adversarial check of each fix' },
    { title: 'Suite', detail: 'the full local suite once' },
    { title: 'Push', detail: 'one push, description, read back, record' },
  ],
}

const P = args
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/fix-' + P.key
const DESIGN = '/home/user/ops/designs/lane-b-dependabot-batch.md'
const SESSION = 'https://claude.ai/code/session_01FcouKRD17iBBR4HhnYcQQx'

const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. You work for the Lane B item session "dependabot-batch" (${SESSION}), in the FIX ROUND of PR ${P.key}: #${P.pr}, branch ${P.branch}, worktree ${P.wt}, pushed head ${P.head}. ${P.what}
The design is ${DESIGN}. The two review records are /home/user/ops/approval-summaries/lane-b-dependabot-batch-${P.key}-review-ci-infra.md and -review-security-supply.md; the review workflow's full output, with each finding's fix and each skeptic's verdict and correctedFix, is ${P.reviewOut} (JSON: .result.confirmed[]). Where a skeptic gave a correctedFix, it replaces the finding's fix. Where the two lenses rated the same issue differently, take the higher rating. Status file: /home/user/ops/approval-summaries/lane-b-dependabot-batch-status.md.
Merge rule (Lane B's orchestrator, 2026-11-01 20:36 UTC): a verified, green PR merges as soon as it is ready; the section-6 order applies only between PRs that conflict; the one merged second resolves; never jump a PR already green and waiting with a conflicting file.

Rules for you:
- Synthetic data only. No PHI, real 835, contract or export anywhere.
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH.
- Heavy commands (pnpm install, typecheck, lint, tests, test:db, build, e2e, Stryker, synth) only under: flock /tmp/laneb-heavy.lock <command>. Another workflow shares this machine. PostgreSQL: pg_isready -h localhost -p 5432 and -p 5433; if down, run bash /tmp/setup-container.sh co-001/deps-anthropic-sdk-1:/home/user/deps-anthropic-sdk-1 co-001/deps-aws-cdk-minor-patch:/home/user/deps-aws-cdk-minor-patch co-001/dependabot-group-routing:/home/user/dependabot-group-routing (in the background) and wait for OK.
- Commits: in ${P.wt} only, one concern each; a code fix with its test (failing first where the finding is a missing test or a behaviour); every message ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
  Never amend, rebase, reset --hard, force or --no-verify. Push only if your task says so.
- Generated files only by their generators: pnpm-lock.yaml by pnpm install; fixtures/synthetic by pnpm synth --all; watched-paths.txt by pnpm exec tsx tools/screening-capacity/watched.ts --write. Never hand-merge them.
- Never a release-age exclude or exception-file edit, a migration, docs/product/domain-model.md, or a file in /home/user/ops/LANES.md's "Not while #42 is open" list other than rule-6 shared documents. Never write under /home/user/ops except the one record file your task names.
- No model name or model identifier in any file, commit or PR text. Shorten non-commit 64-hex digests to 8 hex and an ellipsis.
- Improve as you go: in-scope improvements with their test, named; others as proposals in your result.
- Long commands: run_in_background and wait for the notification; no long foreground sleep.`

const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}). If it exists when you start, an earlier run of yours was interrupted: read it, trust it unless git says otherwise, and continue (git log shows your commits).`

phase('Fix')
const fix = await agent(`${COMMON}

You are the FIXER.
1. git fetch origin claude/build-platform; merge it into ${P.branch} with a merge commit (message "Merge claude/build-platform into ${P.branch}" plus the two lines); resolve any conflict keeping both sides; regenerate generated files by their generators; pnpm install --frozen-lockfile under the lock.
2. Apply EVERY confirmed finding (read the JSON for the exact fix and correctedFix; ${P.extraFix || ''}). Group closely related findings that touch the same lines into one commit, otherwise one commit each; name the finding ids in each commit message. Findings that change only the PR description (merge order, provenance wording, the alert's identity, deferral tracking, D2 wording) are NOT commits: collect the exact new description text for each in ${SP}/description-changes.md for the push stage, and where the design text is also wrong, put the corrected design text in the same file under "Design corrections" (the session applies those to the design). A deferred finding must name where it is tracked: use "the item's status file, Proposals (outside this PR)" and list the proposal text in ${SP}/description-changes.md under "Proposals for the status file".
3. After each commit, run the narrowest test that covers it under the lock. For each new or changed test, show it fails without its fix (revert the fix in a scratch copy or use git stash on a scratch worktree under ${SP}/tmp, never in ${P.wt} itself) and passes with it; save the logs in ${SP}/logs/.
4. ${P.after || ''}
${SAVE('fix.progress.md', 'the merge, each finding with its commit or its description-only disposition, and red/green logs')}
Write your report to ${SP}/fix.md. Do NOT push. Return: the merge commit, every finding id with its disposition (commit sha, or description-only, or not taken with evidence), the red/green evidence, and the head sha.`, { label: `fixer:${P.key}`, phase: 'Fix' })

phase('Check')
const chk = await agent(`${COMMON}

You are an ADVERSARIAL CHECKER of the fix round's commits in ${P.wt} (not pushed). Do not commit or change tracked files; use a temporary worktree under ${SP}/tmp for anything you run against an older commit or a mutated copy (remove it after). The fixer's report:
${fix}

For EVERY confirmed finding in the JSON, check that it is really resolved as its (corrected) fix says, at the head, and that the fix is the best option. For each new or changed test, mutate the code it guards in a scratch copy and confirm the test fails. Check the merge of the base kept both sides and that generated files match their generators (pnpm install --lockfile-only, pnpm synth --all, watched.ts --write leave git clean). Check ${SP}/description-changes.md against the code and the live state (git ls-remote origin; the GitHub MCP pull_request_read on #42, #75, #84, #85, #86, #91, #93, #94; merge-tree of the head with each open PR's head to list which conflict and in which files). Report every defect with severity B/S/N, evidence and fix in ${SP}/check.md.
${SAVE('check.progress.md', 'each finding checked and what you found')}
Return the review as markdown, ending with "VERDICT: clean" or "VERDICT: defects".`, { label: `check:${P.key}`, phase: 'Check' })

phase('Suite')
const suite = await agent(`${COMMON}

You run the FULL LOCAL SUITE once, in ${P.wt}. First fix every real defect the checker found (check each yourself; small commits with tests; update ${SP}/description-changes.md for description-only ones). The checker's review:
${chk}

Then, under the lock, on the head, in this order, recording each command, UTC time, result and counts in ${SP}/suite.md and the logs in ${SP}/logs/: pnpm install --frozen-lockfile; pnpm typecheck; pnpm lint; pnpm lint:logs; pnpm verify-content; pnpm test (unit with coverage: files, passed, failed, skipped; name each local skip); pnpm test:golden (counts); pnpm test:oracle; pnpm db:migrate then pnpm test:db --shard=1/4, 2/4, 3/4, 4/4 one after another (counts each, and that together they ran every db file once); pnpm build, the build stamp exactly as CI's build job does it (read .github/workflows/ci.yml's build job and e2e jobs), then E2E_PREBUILT=1 pnpm test:e2e --workers=2 (count); the Stryker shards tools/stryker/affected.ts names against origin/claude/build-platform (${P.stryker}), each in full, then the mutation gate exactly as CI runs it (or record that none is affected); pnpm synth --all (git clean); pnpm exec tsx tools/screening-capacity/watched.ts --write (git clean); pnpm actions:check --offline and BASE=origin/claude/build-platform pnpm actions:check; BASE=origin/claude/build-platform pnpm toolchain:check; pnpm licenses:check; actionlint (/opt/actionlint) -shellcheck= -pyflakes= -ignore 'label "ubuntu-26\\.04" is unknown' .github/workflows/*.yml; pnpm screening:capacity as CI's capacity job and screening-capacity gate run it (read ci.yml; if it needs inputs only CI has, run the gate's local form and say exactly what was and was not run). ${P.suiteExtra || ''}
Anything red: root-cause it; if it is this PR's, fix it in a small commit with its test and re-run what it touches; if it is not this PR's (red on the base too: prove it by running the same command on origin/claude/build-platform in a scratch worktree), record it with that evidence. Never skip, disable or quarantine a test.
${SAVE('suite.progress.md', 'each command with its result as it finishes')}
Return: the head sha after any fixes, every command with its result and counts, every red and its disposition.`, { label: `suite:${P.key}`, phase: 'Suite' })

phase('Push')
const push = await agent(`${COMMON}

You are the PUSHER. The suite's result:
${suite}
1. git fetch origin claude/build-platform. If the base moved since the fixer's merge, STOP the push: return "BASE MOVED" with the new base sha and what it changes (git diff --stat) so the session decides (a re-merge means re-running the suite on what it touches).
2. Scope check against origin/claude/build-platform: every file the branch changes; none a migration, domain-model.md, exception file, or "Not while #42 is open" file other than rule-6 shared documents.
3. Push once: git push origin ${P.branch} (pre-push hook; never --no-verify or force; a refused push of unpushed commits: git reset --soft to origin/${P.branch}, remove the flagged text, commit again in the same split, push).
4. Rewrite the PR description (GitHub MCP: ToolSearch "select:mcp__github__update_pull_request,mcp__github__pull_request_read"; read the current body first with pull_request_read get). Keep the template's sections and required-checks markers exactly, every section, "None" rather than omitted, under 65,536 characters. Apply every entry in ${SP}/description-changes.md. Add or update: the review findings table (each finding id, severity, disposition with commit, or "description", or deferred with where tracked); the fix round's full local suite results with counts (${SP}/suite.md); the head sha; the conflicts with open PRs from the checker's merge-tree list; the merge order under the 20:36 UTC rule. Write the new body to ${SP}/pr-body.md, set it with update_pull_request, read it back (pull_request_read get and gh api repos/PureTideWater/PhysicalTherapy/pulls/${P.pr} --jq .body) into ${SP}/pr-body-readback.md and compare: identical apart from trailing newlines, or fix and read back again. The body ends with exactly:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

${SESSION}
5. Write the fix-round record to /home/user/ops/approval-summaries/lane-b-dependabot-batch-${P.key}-fix-round.md (do not commit it): the PR, the pushed head, every finding with its disposition, the full suite's commands, results and counts, the checker's findings with dispositions, the conflicts, the design corrections and proposals from ${SP}/description-changes.md (the session applies them), and what the verification must read on CI.
Never comment, review, approve or merge. Do not touch any Dependabot PR.
${SAVE('push.progress.md', 'each step, the pushed head')}
Return: the pushed head sha (or BASE MOVED), the record's path, a one-paragraph summary, and anything the session must decide.`, { label: `push:${P.key}`, phase: 'Push' })

return { fix, chk, suite, push }