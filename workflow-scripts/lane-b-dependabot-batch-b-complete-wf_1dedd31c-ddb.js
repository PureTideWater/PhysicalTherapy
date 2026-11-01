export const meta = {
  name: 'lane-b-dependabot-batch-b-complete',
  description: 'Complete PR B (#88+#89): B(4) @aws-sdk and stripe, final-head checks, adversarial check, push, draft PR read back',
  phases: [
    { title: 'Build', detail: 'B(4) and the final-head check list' },
    { title: 'Check', detail: 'adversarial checker' },
    { title: 'Integrate', detail: 'fixes, push, draft PR with template body read back' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/build'
const DESIGN = '/home/user/ops/designs/lane-b-dependabot-batch.md'
const SESSION = 'https://claude.ai/code/session_01FcouKRD17iBBR4HhnYcQQx'
const WT = '/home/user/deps-aws-cdk-minor-patch'
const BRANCH = 'co-001/deps-aws-cdk-minor-patch'

const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. You work for the Lane B item session "dependabot-batch" (${SESSION}). This is PR B, replacing Dependabot #88 (aws-cdk group) and #89 (minor-and-patch: nine @aws-sdk/* and stripe). The design is ${DESIGN}: read section 1, sections 4, 5 and 7, section 8 (8.1-8.3 for B) and the final "Review of the design" section whole. Worktree ${WT}, branch ${BRANCH}; origin has the branch at 83d71fd6 only; the local branch holds the merge of bce57f16 and B(1), B(2), B(3), B(5) and the integrator's fixes, up to 7d153446 (also saved as origin co-001/wip-dependabot-batch-b). Earlier reports: ${SP}/builder-B.md, ${SP}/check-B.md, ${SP}/progress/builder-B.progress.md, ${SP}/progress/integrate-B.progress.md, ${SP}/synth/compare.md. The earlier run was stopped by the account's usage window and the machine's PostgreSQL restarted (the setup script runs now; wait for pg_isready -h localhost -p 5432 before any DB test).

Rules for you:
- Synthetic data only.
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH.
- Heavy commands only under: flock /tmp/laneb-heavy.lock <command>. Another review workflow shares this machine.
- Commits: in ${WT} only, one concern each, every message ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
  Never amend, rebase, reset --hard, force or --no-verify. Push only if your task says so.
- Generated files only by their generators (pnpm install; pnpm synth --all; watched.ts --write). Never a release-age exclude or exception-file edit, a migration, domain-model.md, or a "Not while #42 is open" file (/home/user/ops/LANES.md) other than rule-6 shared documents. #42 is still open: B(6) waits.
- No model name or identifier in any file, commit or PR text. Shorten non-commit 64-hex digests to 8 hex and an ellipsis.
- Improve as you go: in-scope improvements with their test, named; others as proposals.
- Waits (for a time, or a long command): run_in_background with an until-loop and wait for the notification; no foreground sleep.
- Change nothing under /home/user/ops; write only under ${SP}.`

const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}). If it exists when you start, continue from it.`

phase('Build')
const b = await agent(`${COMMON}

You are BUILDER B, part 2. If the clock (date -u) is before 2026-11-01T19:59:00Z, wait until then (background until-loop). Then B(4): for each of the nine @aws-sdk names and stripe, npm view <pkg> time --json; take the newest @aws-sdk version whose every package (all nine) is at least 3 days old (4320 minutes) now, and stripe ^23.1.0 if 23.1.0 is at least 3 days old, else the newest that is. Set the ranges in all the manifests the design names (infra's client-sts included), pnpm install --lockfile-only then pnpm install --frozen-lockfile under the lock; list every package the lockfile moved (direct and transitive) with its publish time and age; commit "@aws-sdk/* ^3.<n>.0 and stripe ^23.1.0 (replaces Dependabot #89)". Then, on the head, under the lock: pnpm typecheck; pnpm lint; pnpm lint:logs; pnpm --filter @tp/infra test (counts); pnpm exec vitest run --project unit packages/model-gateway packages/billing packages/db packages/contracts apps/web apps/worker (counts); pnpm test:golden (counts; ADR 0070's set-change rule for client-textract, design 5.3 / C-S7); pnpm exec tsx tools/screening-capacity/watched.ts --write (commit any change); pnpm licenses:check; BASE=origin/claude/build-platform pnpm toolchain:check; pnpm verify-content; pnpm synth --all (git status clean); the synth comparison redone on the head against the base (as ${SP}/synth/compare.md did; update it); and tools/stryker/affected.ts --base origin/claude/build-platform (expected the packets and pricing shards).
${SAVE('builder-B2.progress.md', 'the commit, versions, each check result')}
Write your report to ${SP}/builder-B2.md. Do NOT push. Return it: head sha, the commit, versions with ages, lockfile moves, checks with counts, deviations, proposals.`, { label: 'builder:B-part2', phase: 'Build' })

phase('Check')
const c = await agent(`${COMMON}

You are an ADVERSARIAL CHECKER of B's B(4) commit and the whole branch head in ${WT} (not pushed). Do not commit or change tracked files. The builder's report:
${b}
Try to break it: versions are the newest at least 3 days old (npm view, recompute ages yourself), every lockfile move accounted for and aged, toolchain:check's trust policy and licences hold; no request shape our code sends changes (Bedrock body, presigned URLs, checksums, KMS, Textract, Cognito, RDS, SESv2, STS) - read the clients' changelogs over the range taken; stripe 23.1.0's API version change against packages/billing (ADR 0050); the regenerated lockfile matches pnpm install --lockfile-only; watched-paths, synth, the synth comparison; every file in the branch diff is in design 8.1's list for B. Report defects B/S/N with evidence and fix in ${SP}/check-B2.md.
${SAVE('check-B2.progress.md', 'what you checked and found')}
Return the review as markdown, ending with "VERDICT: clean" or "VERDICT: defects".`, { label: 'check:B-part2', phase: 'Check' })

phase('Integrate')
const integ = await agent(`${COMMON}

You are INTEGRATOR B. The builder's report:
${b}
The checker's review:
${c}
Steps:
1. Fix every real defect (check each yourself) in small commits with tests; re-run what the fix touches.
2. git fetch origin claude/build-platform; if it moved past bce57f16, merge it in (merge commit; regenerate the lockfile and watched-paths by their generators).
3. Scope check against origin/claude/build-platform: no migration, domain-model.md, exception file, or "Not while #42 is open" file other than rule-6 shared documents.
4. Push: git push -u origin ${BRANCH} (pre-push hook; never --no-verify or force; origin has 83d71fd6, an ancestor, so it fast-forwards).
5. Open the DRAFT pull request with the GitHub MCP tools (ToolSearch "select:mcp__github__create_pull_request,mcp__github__update_pull_request,mcp__github__pull_request_read"): owner PureTideWater, repo PhysicalTherapy, title "aws-cdk-lib 2.275 with its CLI, CLI telemetry off, @aws-sdk and stripe (replaces Dependabot #88 and #89)", head ${BRANCH}, base claude/build-platform, draft true. The description follows ${WT}/.github/pull_request_template.md section by section, every section, "None" rather than omitted, required-checks markers kept exactly, under 65,536 characters. It says: it replaces Dependabot #88 and #89 (never merged; closed with a comment when this merges); what was read (the aws-cdk-lib 2.274/2.275 notes, the CLI log, the @aws-sdk notes per client, stripe's notes); each version with publish time and age; the lockfile's moves (incl. @smithy/core's deprecated 3.38.0 and that the merge-time regeneration after 2026-11-02T23:12Z takes 3.38.1); the synth comparison standing in for the credentialed cdk:diff (runbook: the stack diff read before taking a CDK bump); CLI telemetry, notices and version check off and the ADR 0012 amendment; test:golden for client-textract; the Stryker shards CI selects; the decisions with reasons (design section 1); what waits on a person (alerts 403 and the 1 moderate alert GitHub's push message reported; a credentialed cdk:diff; the Stripe webhook endpoint's API version); the merge order (orchestrator ruling 2026-11-01 18:00Z: may merge while #42 is open, never ahead of a PR already green and waiting; B(6) aligns #42's three @aws-sdk ranges if #42 merges first). End with exactly:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

${SESSION}
Write the body to ${SP}/pr-B-body.md first; create the PR; read it back (pull_request_read get, and gh api repos/PureTideWater/PhysicalTherapy/pulls/<n> --jq .body), write it to ${SP}/pr-B-body-readback.md and compare (identical apart from trailing newlines, or fix with update_pull_request and read back). Never comment, review, approve or merge. Do not touch any Dependabot PR.
${SAVE('integrate-B2.progress.md', 'each step, the pushed head and the PR number')}
Return: the PR number and URL, the pushed head sha, the commits, every check with its result, the checker's findings with dispositions, and anything the session must decide.`, { label: 'integrator:B', phase: 'Integrate' })

return { integ }