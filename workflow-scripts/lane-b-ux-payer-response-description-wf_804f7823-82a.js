export const meta = {
  name: 'lane-b-ux-payer-response-description',
  description: '#85 description from the PR template: draft, adversarial fact-check against the records, revise, post with update_pull_request and prove it byte for byte',
  phases: [{ title: 'Draft' }, { title: 'Check' }, { title: 'Post' }],
}
const WIP = '/home/user/ops/approval-summaries/lane-b-ux-payer-response-wip'
const FILE = `${WIP}/pr85-body.md`
const FACTS = `PR #85 (PureTideWater/PhysicalTherapy), branch co-001/ux-payer-response, head a97d60112c3f56b20782d1b3aafa017db4d07922, base claude/build-platform (merged in: 83d71fd6 as merge 90ec40ab; the base has since gained #82 bce57f16 and #83 43565235, both without conflict, merged again before the merge). Worktree /home/user/ux-payer-response. Records to draw from (read them; every number must come from them or from a command you run):
- the current body: use the MCP tool mcp__github__pull_request_read (method get, owner PureTideWater, repo PhysicalTherapy, pullNumber 85; load it with ToolSearch "select:mcp__github__pull_request_read"); it is the old session's and stale: its "What changes" is a good base but must be brought up to date;
- .github/pull_request_template.md in the worktree: mirror every section heading in order; "None" rather than omitting;
- the design /home/user/ops/designs/lane-b-ux-payer-response.md (3.9, 7.2, 8.2) and ADR 0085 in the worktree;
- the status file /home/user/ops/approval-summaries/lane-b-ux-payer-response-status.md;
- the base merge: ${WIP}/pay-merge-83d71fd6*.md;
- the reviews: /home/user/ops/approval-summaries/lane-b-ux-payer-response-review-findings.json (20 findings, each verified by 3; 13 real) and ${WIP}/rev85-*.md;
- the fix round: ${WIP}/pay-fix1.md, pay-fix2.md, pay-fix3.md (if present), pay-rerev-*.md, pay-ux-delta.md, pay-fix-ux.md, pay-final-*.md, shots85*.md; commits 2865db68, cf6d0f42, 13e4e2fe, a97d6011 (git -C /home/user/ux-payer-response log 90ec40ab..a97d6011);
- the full local suite on 13e4e2fe: ${WIP}/pay-suite.md; the checks on a97d6011: ${WIP}/pay-final-fix.md;
- galleries (private): before 83d71fd6: 1280 https://claude.ai/artifact/P3JBtVwbWhpuDMXdwLxsSJ, 390 https://claude.ai/artifact/W3BeEkHZBD3jDHZbqEHj4F, 1280 dark https://claude.ai/artifact/7g5ME7bzUPa3f6Z4rF37uM; first after (90ec40ab): 1280 https://claude.ai/artifact/Af9wPUdrWCySD3QpYGmbWC, 390 https://claude.ai/artifact/DgTGAdMWr1qEX1oMVRnqog, 1280 dark https://claude.ai/artifact/DYrg8YoYSwcPXQxhJuFQXQ; after the fix round (13e4e2fe): 1280 https://claude.ai/artifact/3iCSW99opuzmyvS7eohkzz, 390 https://claude.ai/artifact/C5TvJaTbjSfUjUEJ5Woxus, 1280 dark https://claude.ai/artifact/7nVhABbzohq7uv8TPbfAP3.
Content rules: the Checks table on the new head (the local suite and the a97d6011 checks; CI reports itself through the required-checks marker the template has); the reviewers' table with every finding (the 13 real with their resolution and commit, the 7 refuted named briefly with why, the critic's nits n1-n8, re-review rounds, the UX delta and final delta); the base merge; every visible and wording change listed (they were taken under the co-founder's standing direction within brand.md and CO-11); what it leaves open (the residuals, Lane A items 1-5 of design 7.2, the founder's open question 8.2, the pre-existing "Drop 835 files" wording on Uploads, F1 the reopened-case window question as a product question); "Waiting on the founder" kept as before. No model name or identifier anywhere. Hashes as 8 hex digits. Under 65,536 characters. Every GitHub-facing text ends with exactly these lines, after a blank line:
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01FcouKNxBLBBy2FVM7bfSvj`

phase('Draft')
const draft = await agent(`${FACTS}\nWrite the new description of #85 into ${FILE} (overwrite; keep it as plain Markdown). Save as you go into that file. Return a short summary of the sections and its length in characters.`, { label: 'draft', phase: 'Draft' })

phase('Check')
const CK = { type: 'object', required: ['problems'], properties: { problems: { type: 'array', items: { type: 'object', required: ['where', 'claim', 'truth'], properties: { where: { type: 'string' }, claim: { type: 'string' }, truth: { type: 'string' } } } } } }
const checks = await parallel([
  ['numbers and hashes', 'every number, count, hash, commit, finding id and test total in it against the records and git (run the git commands)'],
  ['template and rules', 'every heading of .github/pull_request_template.md present in order, no section omitted, the footer exact, no model identifier, under 65,536 characters, nothing claimed that the records do not show (e.g. CI results it cannot know), wording true to the code at a97d6011 (read the changed pages for each quoted string)'],
].map(([k, l]) => () => agent(`${FACTS}\nAdversarially fact-check ${FILE} on ${l}. List every wrong or unsupported claim with the truth. Edit nothing.`, { label: `check:${k}`, phase: 'Check', schema: CK })))
const problems = checks.filter(Boolean).flatMap((c) => c.problems)
log(`description check: ${problems.length} problems`)

phase('Post')
const post = await agent(`${FACTS}\nFirst fix these problems in ${FILE} (each one; verify each against the records before changing): ${JSON.stringify(problems)}.
Then post the file's exact content as #85's body with the MCP tool mcp__github__update_pull_request (owner PureTideWater, repo PhysicalTherapy, pullNumber 85, body = the file's content; load it with ToolSearch "select:mcp__github__update_pull_request"). Do not change draft, title or anything else. Then read it back with mcp__github__pull_request_read (method get) and prove it byte for byte: write the returned body to a temp file in /tmp/claude-0 and compare with cmp against ${FILE} (a trailing newline difference must be fixed by making the file match what GitHub stores, then re-posting if the content differs). Never use gh api to PATCH the body. Return the body's length, the cmp result and the remaining differences (none expected).`, { label: 'post', phase: 'Post' })
return { draft, problems, post }