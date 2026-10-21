export const meta = {
  name: 'co-001-main-dependabot-template',
  description: 'The one PR into main the founder allowed: main\'s .github/dependabot.yml grouped and limited (target-branch kept) and .github/pull_request_template.md; build, two reviews, fix, fresh-clone verify',
  phases: [{ title: 'Build' }, { title: 'Review' }, { title: 'Fix' }, { title: 'Verify' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad'
const WT = '/home/user/main-dependabot'
const BR = 'co-001/main-dependabot-template'
const ATTR = `Every commit message ends with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR`
const CONTEXT = `Context. Repository puretidewater/physicaltherapy (PaidWhole). main is the launch branch: it holds only the plan files (10 files), has no workflows, and takes no pull request before launch except one the founder rules on. On 2026-10-20 the founder ruled for exactly one: it changes main's .github/dependabot.yml to the grouped, limited copy that docs/runbooks/github-governance.md gives in its section "Dependabot's settings on main" (with every target-branch: claude/build-platform line kept), and adds .github/pull_request_template.md, the same file as on claude/build-platform (82035ae). Nothing else changes on main. The branch ${BR} is cut from origin/main, never merges claude/build-platform, and is pushed from the main checkout, which has the pre-push hook: 'git -C /home/user/PhysicalTherapy -c core.hooksPath=/home/user/PhysicalTherapy/.githooks push origin ${BR}' (it runs the build branch's hook over the branch's commits; gitleaks is /root/.cache/paidwhole/gitleaks/8.24.3/gitleaks, set GITLEAKS to it). No pull request is opened by any agent. Keep the returned summary short: what changed, every check, every open item.`
const RESULT = { type: 'object', properties: { summary: { type: 'string' }, head: { type: 'string' }, checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } }, open_items: { type: 'array', items: { type: 'string' } } }, required: ['summary', 'head', 'checks'] }
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] }, problem: { type: 'string' }, fix: { type: 'string' } }, required: ['title', 'severity', 'problem', 'fix'] } }, verdict: { type: 'string' } }, required: ['findings', 'verdict'] }
phase('Build')
const build = await agent(`${CONTEXT}

Your task: 'git -C /home/user/PhysicalTherapy fetch origin main claude/build-platform', then 'git -C /home/user/PhysicalTherapy worktree add -b ${BR} ${WT} origin/main'. In ${WT}: write .github/dependabot.yml exactly as the runbook's section gives it (read it from origin/claude/build-platform:docs/runbooks/github-governance.md, including the collapsed full file if it gives one), keeping main's existing ecosystems, directories and every target-branch line; copy .github/pull_request_template.md from origin/claude/build-platform byte for byte. Validate dependabot.yml against Dependabot's v2 schema (fetch the schema from SchemaStore, https://json.schemastore.org/dependabot-2.0.json, and validate with a small node script using the repo's yaml package from /home/user/PhysicalTherapy/node_modules, or explain why you could not) and compare it field by field with claude/build-platform's .github/dependabot.yml (groups and limits must match; only target-branch lines may differ, and they must all point at claude/build-platform). Commit in the repository's style ("ci: main's Dependabot settings take the build branch's groups and limits, and main gains the pull request template (the founder's ruling of 2026-10-20; ADR 0063)"). ${ATTR} Push as the context says, with the 2/4/8/16 s retry. Return the summary, the pushed head and every check.`, { label: 'build: main dependabot and template', phase: 'Build', schema: RESULT })
if (!build) throw new Error('build failed')
phase('Review')
const brief = `${CONTEXT}

The builder pushed ${BR} at ${build.head}: ${build.summary}
You are an independent adversarial reviewer. Read 'git -C /home/user/PhysicalTherapy diff origin/main...origin/${BR}'. Do not edit anything; work in ${SP}/main-dep-review if you need files. Report each finding with what is wrong and the fix; if nothing is wrong, say so with what you checked.`
const reviews = await parallel([
  () => agent(`${brief}

Your angle: correctness of the Dependabot file. Is it valid v2 YAML? Does every ecosystem and directory the build branch's file has also appear (npm at '/', github-actions, docker for each Dockerfile directory), each with target-branch: claude/build-platform? Do groups, schedules and open-pull-requests-limit match the build branch's file and the runbook? Would Dependabot start opening pull requests against main, or stop opening the ones it opens today against the build branch? Is anything here that GitHub reads differently on the default branch (security updates always target the default branch)?`, { label: 'review: dependabot correctness', phase: 'Review', schema: FINDINGS }),
  () => agent(`${brief}

Your angle: scope and rules. Does the diff change only the two files the founder allowed? Is the template byte-identical to the build branch's? Was the branch cut from main, with no build-branch history in it (check 'git log origin/main..origin/${BR}' and the merge base)? Does the commit carry the two attribution lines? Did the push run the pre-push hook (check the builder's log)? Would the later launch preparation (an ours-merge of main into the build branch, runbook step 8) or the launch pull request be harmed by this change?`, { label: 'review: scope and launch', phase: 'Review', schema: FINDINGS }),
])
const all = reviews.filter(Boolean).flatMap(r => r.findings)
phase('Fix')
const fix = all.some(f => f.severity !== 'nit') || all.length ? await agent(`${CONTEXT}

You are the fix round for ${BR} in ${WT} (head ${build.head}). Verify each finding below; fix the real ones in proportion; say why for any you do not fix. Push as the context says.

Findings: ${JSON.stringify(all, null, 2)}
Verdicts: ${reviews.filter(Boolean).map(r => r.verdict).join(' | ')}

Return the summary, the head, every check and the open items.`, { label: 'fix', phase: 'Fix', schema: RESULT }) : build
phase('Verify')
const verify = await agent(`${CONTEXT}

You are the fresh-clone verification for ${BR}. Expected head: ${(fix || build).head}. main has no CI, so you are the check. Clone https://github.com/PureTideWater/PhysicalTherapy into ${SP}/main-dep-verify, check out origin/${BR}, confirm the head, confirm the diff against origin/main is exactly .github/dependabot.yml and .github/pull_request_template.md, validate dependabot.yml against the v2 schema (SchemaStore) and compare it with claude/build-platform's copy (only target-branch lines may differ, all pointing at claude/build-platform), confirm the template is byte-identical to the build branch's, run gitleaks over origin/main..HEAD, and confirm the merge base with origin/main is origin/main's tip. Delete the clone. Return the summary, the head, every check and the open items.`, { label: 'fresh-clone verification', phase: 'Verify', schema: RESULT })
return { build, reviews, fix, verify }
