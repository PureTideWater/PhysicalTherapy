export const meta = {
  name: 'lane-b-handoff-review',
  description: 'Lane B handoff: a cold-start completeness critic and a fact-checker, read-only, in parallel',
  phases: [{ title: 'Review', detail: 'cold-start critic and fact-checker on the handoff' }],
}
const FILES = `/home/user/ops/COFOUNDER-START.md (the message the person pastes into a new session), /home/user/ops/LANES.md (rules, queues, claims), /home/user/ops/lanes/lane-b.md (read its "Start here (Lane B)" section closely; the dated log below it is the record), /home/user/ops/designs/lane-b-ux-review-brief.md (the next session's first task), /home/user/ops/tools/lane-b-screen-tour/README.md and setup.sh (the capture tool the first task uses), and /home/user/ops/HANDOFF.md from "Start here" to "Owner decisions and rulings" (Lane A's state)`
const COMMON = `PaidWhole, repo PureTideWater/PhysicalTherapy. CLAUDE.md is in your context. Lane B (the co-founder's sessions) is handing off to a brand-new Claude Code session, which will know nothing but what these files say: ${FILES}. The person wants the handoff to have zero gaps. READ-ONLY: do not edit, commit or push anything, and post nothing on GitHub. Use git (the main checkout /home/user/PhysicalTherapy on claude/build-platform; /home/user/ops on claude/build-ops), gh api for GitHub reads, and the mcp__github__* read tools (ToolSearch) if needed. Do not run tests or builds. Report each finding with the file and line, what is wrong or missing, evidence, and the exact replacement text you recommend. Rate each finding blocking (the new session would do the wrong thing or stall), should_fix (it would lose time or have to rediscover something), or nit.`
const SCHEMA = { type: 'object', properties: {
  summary: { type: 'string' },
  findings: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] }, file: { type: 'string' }, line: { type: 'string' },
    issue: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'file', 'issue', 'evidence', 'fix'] } },
}, required: ['summary', 'findings'] }
phase('Review')
const [critic, facts] = await parallel([
  () => agent(`${COMMON}

You are the COLD-START CRITIC. Pretend you are the new session, given only COFOUNDER-START.md's message. Walk its steps in order against the files and the machine as they are now, and at each step ask: do I know exactly what to run or do next, with what arguments, in what order, and who decides? Find every gap, ambiguity, contradiction between the files (for example COFOUNDER-START vs lane-b.md vs LANES.md vs the UX brief), stale statement, and missing pointer. In particular check:
- the first task (the UX/UI baseline review): can it be claimed, captured (tools/lane-b-screen-tour: does setup.sh plus the README let a new session capture with a new scratchpad? What is missing, for example how to find TP_LOCAL_MASTER_KEY's value, how the 83 routes are found, the dark theme's existence in the app (grep packages/brand and apps/web for a theme switch or prefers-color-scheme), the Playwright config's import paths?), reviewed and turned into queue items, with no product code;
- the pipeline it must follow for its checklist PR and for ci-deps, ci-browser and 15b: is every input named (designs, rulings with who and when, carry-in nits, settings the founder applies)?
- usage pacing and the rules a session must never break (each findable from these files?);
- recovery: a container restart, auto mode stopping, a refused push;
- anything a session must know that only lives in this session's memory (look at the dated log entries for lessons the Start here section omits).
Return the findings, most important first.`, { label: 'cold-start critic', phase: 'Review', schema: SCHEMA }),
  () => agent(`${COMMON}

You are the FACT-CHECKER. Check every factual claim in lane-b.md's "Start here (Lane B)" section, the claims rows and Lane B queue items 1 and 2 in LANES.md, and the COFOUNDER-START.md message, against primary sources:
- every SHA, PR number and merge (gh api repos/PureTideWater/PhysicalTherapy/pulls/<n>; git log on claude/build-platform);
- open PRs and their heads (#42, Dependabot #40 and #33; whether #38 is closed);
- CI run IDs and results named (gh api repos/PureTideWater/PhysicalTherapy/actions/runs/<id>), and the push runs on the head of claude/build-platform;
- the rulesets API (gh api repos/PureTideWater/PhysicalTherapy/rulesets), the default branch and the security settings;
- test counts and mutation scores cited (against the approval summaries in /home/user/ops/approval-summaries/lane-b-*.md and CI job logs where named);
- every file path and line reference named (does it exist; does the line say what is claimed: for example ADR 0066 line 333, ADR 0066's "Measured" figure, .github/dependabot.yml's "about 45 runner minutes", docs/runbooks/ci.md:97, github-governance.md:66, ledger.db.test.ts:221, designs/lane-b-ci.md sections 3.2, 3.3 and 11);
- the rulings and their dates and who made them, against the dated log entries in lane-b.md and LANES.md's delegation;
- the commands named (do the scripts and options exist: tools/setup-container.sh with SETUP_CHECK, flock lock path, pnpm scripts, tools/stryker paths).
Return every claim that is false, stale or unverifiable, with the correct text.`, { label: 'fact-checker', phase: 'Review', schema: SCHEMA }),
])
return { critic, facts }