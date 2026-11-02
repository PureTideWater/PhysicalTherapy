export const meta = {
  name: 'lane-b-dependabot-batch-c-postmerge-dependabot-read',
  description: 'Read the Dependabot runs started by #91 (dependabot.yml change) for routing failures, and record what they opened, updated or closed',
  phases: [{ title: 'Read', detail: 'the npm run log and the PRs it touched' }, { title: 'Challenge', detail: 'a skeptic re-reads the conclusion' }],
}
const OUT = '/home/user/ops/approval-summaries/lane-b-dependabot-batch-C-postmerge-dependabot.md'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. PR #91 (Dependabot group-routing fix: exclude-patterns on minor-and-patch so wildcard groups such as '@aws-sdk/*' and '@next/*' keep their dependencies) merged into claude/build-platform as 21fa10df at 10:22 UTC on 2026-11-02. Its runbook change says a merge that changes .github/dependabot.yml starts Dependabot at once and those runs are read that day: any "belongs to more specific group", "Skipping update group ... does not match any allowed dependencies", "release-age block" or error line means the routing or the config broke. The runs it started (event=dynamic, all completed/success): npm_and_yarn 41428297500, github_actions 41428297535, docker 41428297161, docker_compose 41428297846. READ ONLY: never comment, close, merge, push or re-run; use gh api (this repository) and the GitHub MCP get_job_logs (return_content, large tail_lines; jobs via gh api repos/PureTideWater/PhysicalTherapy/actions/runs/<id>/jobs). No model name in anything you write. Cite run/job ids and log line numbers.`
phase('Read')
const r = await agent(`${COMMON}

Read the npm_and_yarn run's job log whole (page through with tail_lines if needed) and the other three runs' logs briefly. Report: (1) every group Dependabot considered and which dependencies it assigned to each (aws-sdk, aws-cdk, next, pg-boss, anthropic-sdk, browser-tests, minor-and-patch, security); (2) every routing-failure or skip line (quote it with its line number), or "none"; (3) every PR it opened, updated, rebased or closed (numbers, titles, heads; check #97, #98 and any new number with gh api pulls?state=all&sort=created&direction=desc), and whether the @aws-sdk packages now sit in the aws-sdk group; (4) any release-age block or error; (5) a verdict: does the routing work as #91 intended on the real Dependabot? Write ${OUT} (do not commit) and return it.`, { label: 'read', phase: 'Read' })
phase('Challenge')
const c = await agent(`${COMMON}

A colleague read the runs and concluded:
${r}
Try to refute it: re-read the npm run's log yourself for the lines that matter and the PR state; say whether the verdict holds. Return "HOLDS" or "DOES NOT HOLD: <why>" with evidence; append a short "Challenge" section to ${OUT}.`, { label: 'challenge', phase: 'Challenge' })
return { r, c }