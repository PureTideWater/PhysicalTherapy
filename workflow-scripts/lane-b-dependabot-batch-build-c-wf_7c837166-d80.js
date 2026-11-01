export const meta = {
  name: 'lane-b-dependabot-batch-build-c',
  description: 'Build PR C (Dependabot group-routing fix, CI-12) per the design: builder, adversarial checker, integrator (push, draft PR read back)',
  phases: [
    { title: 'Build', detail: 'builder C, commits per design §8.2' },
    { title: 'Check', detail: 'adversarial checker' },
    { title: 'Integrate', detail: 'fixes, push, draft PR with template body read back' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/build-c'
const DESIGN = '/home/user/ops/designs/lane-b-dependabot-batch.md'
const SESSION = 'https://claude.ai/code/session_01FcouKRD17iBBR4HhnYcQQx'
const WT = '/home/user/dependabot-group-routing'
const BRANCH = 'co-001/dependabot-group-routing'

const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. You work for the Lane B item session "dependabot-batch" (${SESSION}), which takes Dependabot #87, #88 and #89 as the build's own PRs. This is PR C: the Dependabot group-routing fix (wildcard group patterns lose to minor-and-patch under dependabot-core's specificity rule; fixed with exclude-patterns on minor-and-patch; amends test-matrix CI-12, no new number). The design is ${DESIGN}: read section 1 (decisions, D10 and D11), section 6 (the routing fix, whole), section 8 (8.1-8.3 for C) and the final "Review of the design" section whole; the routing scout is /home/user/ops/designs/lane-b-dependabot-batch/scout-routing.md. Where the design and its review section differ, the review section wins. Worktree ${WT}, branch ${BRANCH}, at bce57f16 (= origin/claude/build-platform at 18:10Z), node_modules installed. Orchestrator ruling: C merges after #86 (both amend ADR 0066); so write C's ADR 0066 amendment as its own dated subsection, appended where it least overlaps #86 (read #86's diff to ADR 0066 read-only: git ls-remote origin to find its branch, git fetch it, diff against its merge base).

Rules for you:
- Synthetic data only.
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH.
- Heavy commands (pnpm install, typecheck, lint, tests, synth) only under: flock /tmp/laneb-heavy.lock <command>. Other builders share this 4-CPU machine.
- Commits: in ${WT} only, one concern each, as design 8.2 numbers them for C, every message ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
  Never amend, rebase, reset --hard, force or --no-verify. Push only if your task says so.
- Generated files are never hand-edited: fixtures/synthetic only by pnpm synth --all; watched-paths.txt only by watched.ts --write.
- Never a migration, domain-model.md, or a "Not while #42 is open" file (/home/user/ops/LANES.md) other than rule-6 shared documents.
- No model name or model identifier in any file, commit or PR text.
- Failing first: the test commit must be red on behaviour on the old config; save red and green logs in ${SP}/logs/ with command and UTC time.
- Improve as you go: in-scope improvements go in with their test and are named; others are proposals in your result.
- Long commands: run_in_background and wait for the notification; no long foreground sleep.
- Change nothing under /home/user/ops; write only under ${SP}.`

const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}). If it already exists when you start, an earlier run of yours was interrupted: read it, trust it unless git says otherwise, and continue.`

phase('Build')
const b = await agent(`${COMMON}

You are BUILDER C. Build design 8.2's commits for C exactly: (1) tools/test/dependabot-config.test.ts changes (the manifest list derived from pnpm-workspace.yaml; the exclusions-equal-patterns test; the routing model over every direct dependency and the named table; the 2026-10-29 evidence test; the design's review section may refine these), red on the old config with the expected failures; (2) .github/dependabot.yml: exclude-patterns on minor-and-patch with all the specific groups' patterns and the replaced comment (green); (3) the CI-12 row in docs/product/test-matrix.md, packages/synth matrix.ts (and registry.ts only if the design says), then pnpm synth --all and commit what it writes; (4) the runbook edits (design 6.5) and the ADR 0066 Part 2 amendment subsection. Then under the lock: pnpm typecheck; pnpm lint; pnpm exec vitest run --project unit tools/test (counts); pnpm test (unit project whole, counts); pnpm synth --all then git status clean; pnpm verify-content; pnpm actions:check --offline; BASE=origin/claude/build-platform pnpm actions:check; BASE=origin/claude/build-platform pnpm toolchain:check; pnpm exec tsx tools/screening-capacity/watched.ts --write (commit any change); and the mutation selector against origin/claude/build-platform (expected none). If an actionlint binary exists at /opt/actionlint, run it over .github/workflows (unchanged, but confirm).
${SAVE('builder.progress.md', 'each commit, red and green logs, each check result')}
Write your report to ${SP}/builder.md too. Do NOT push. Return the report: head sha, commits, failing-first, checks with counts, deviations, proposals.`, { label: 'builder:C', phase: 'Build' })

phase('Check')
const c = await agent(`${COMMON}

You are an ADVERSARIAL CHECKER of builder C's commits in ${WT} (not pushed). Do not commit or change tracked files; use a temporary worktree under ${SP}/tmp if you need an old commit (remove it after). The builder's report:
${b}

Try to break it: does the new YAML parse under Dependabot's real config schema (check dependabot-core's config parser for exclude-patterns on groups and any limit; the scout's clone may be gone: re-clone blobless into an empty directory under ${SP}/tmp); does every direct dependency of every workspace manifest (and infra, tools) land in exactly the intended group under dependabot-core's real specificity code, not just the test's model (read the Ruby and compare the model line by line); is the security group unchanged and are applies-to semantics kept; can the new tests fail if someone adds a new specific group or pattern without excluding it (try it in a scratch copy: it must fail); is the test red at commit (1) on behaviour; do the matrix row, synth entry and fixture agree (pnpm synth --all leaves git clean); do the runbook and ADR texts say what the code does; any file outside design 8.1's list for C. Report defects with severity B/S/N, evidence and fix in ${SP}/check.md.
${SAVE('check.progress.md', 'what you checked and found')}
Return the review as markdown, ending with "VERDICT: clean" or "VERDICT: defects".`, { label: 'check:C', phase: 'Check' })

phase('Integrate')
const integ = await agent(`${COMMON}

You are INTEGRATOR C, in ${WT}. Builder C's report:
${b}
The adversarial checker's review:
${c}

Steps:
1. Fix every real defect (check each yourself first) in small commits with tests; re-run what the fix touches.
2. git fetch origin claude/build-platform; if it moved since bce57f16, merge it in (merge commit; regenerate generated files by their generators, never hand-merge).
3. Scope check: every file the branch changes against origin/claude/build-platform; none a migration, domain-model.md, or a "Not while #42 is open" file other than rule-6 shared documents.
4. Push: git push -u origin ${BRANCH} (pre-push hook; never --no-verify or force; a refused push: git reset --soft to the last pushed commit, remove the flagged text, commit again, push).
5. Open the DRAFT pull request with the GitHub MCP tools (ToolSearch "select:mcp__github__create_pull_request,mcp__github__update_pull_request,mcp__github__pull_request_read"): owner PureTideWater, repo PhysicalTherapy, title "Dependabot group routing: wildcard groups no longer lose to minor-and-patch (CI-12)", head ${BRANCH}, base claude/build-platform, draft true. The description follows ${WT}/.github/pull_request_template.md section by section, every section, "None" rather than omitted, required-checks markers kept exactly, under 65,536 characters. It says: the root cause with the dependabot-core cites (commit SHA and file:line), the evidence from run 40818560725, the fix and the rejected alternative, the failing-first result, the CI-12 amendment, the runbook and ADR 0066 amendment, that it must merge before Dependabot's npm run at 2026-11-05T04:31Z (Dependabot reads the default branch), the merge order (after #86 per Lane B's orchestrator, deadline guard 2026-11-04 12:00 UTC), and that it is part of the dependabot-batch item with PRs for #87 and for #88/#89. End the body with exactly:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

${SESSION}
Write the body to ${SP}/pr-C-body.md first; create the PR; read it back with pull_request_read (method get), write the returned body to ${SP}/pr-C-body-readback.md and cmp: identical, or fix with update_pull_request and read back again. Never comment, review, approve or merge. Do not touch any Dependabot PR.
${SAVE('integrate.progress.md', 'each step, the pushed head and the PR number')}
Return: the PR number and URL, the pushed head sha, the commits, every check with its result, the checker's findings with dispositions, and anything the session must decide.`, { label: 'integrator:C', phase: 'Integrate' })

return { integ }