export const meta = {
  name: 'lane-b-ux-brand-reviewer-review',
  description: 'PR #55 (the UX and brand reviewer checklist): two adversarial reviews in parallel, then one fix round with the documentation-only suite',
  phases: [
    { title: 'Review', detail: 'brand and copy; consistency with the other reviewer files and the brief' },
    { title: 'Fix', detail: 'every finding applied or rejected with evidence, then typecheck, lint, lint:copy and unit, one commit' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/2c852daf-87b1-515e-ade9-06adce7d5ec8/scratchpad'
const OPS = '/home/user/ops'
const WT = '/home/user/ux-brand-reviewer'
const F = WT + '/.claude/agents/ux-brand-reviewer.md'
const SAVE = (file) => `Save as you go: keep ${SP}/progress/uxbr-${file} current after each step. If it exists when you start, an earlier run of yours was interrupted: read it and continue from where it stopped.`
const RULES = `Context: Lane B of the PaidWhole build (CLAUDE.md is in your context). Pull request #55, co-001/ux-brand-reviewer, into claude/build-platform. It adds ${F}, a reviewer checklist that both lanes' sessions give to a default workflow agent as the UX and brand review of every pull request that changes something a person sees. It also edits the reviewer comment in ${WT}/.github/pull_request_template.md. The worktree ${WT} is at the PR's head (eea716d). The design is ${OPS}/designs/lane-b-ux-brand-reviewer.md, and its review is ${OPS}/designs/lane-b-ux-brand-reviewer-review.md.
- Rulings: frontmatter like security-reviewer.md; the model: key follows the other reviewer files; a documentation-only suite (the co-founder's Q4, 2026-10-25). Lane A's screen-changing PRs take the same reviewer (the co-founder for the founder, 2026-10-25 ~21:10 UTC).
- The brief: ${OPS}/designs/lane-b-ux-review-brief.md ("What it judges against", "Then").
- The baseline's findings: ${OPS}/designs/lane-b-ux-review/raw-findings.md, and the synthesis ${OPS}/designs/lane-b-ux-review.md if it exists by now. If it does, it wins.
- Rules for you: synthetic data only. No model name in any file beyond the ruled key. Never run git push, checkout, reset or stash. Every shell command starts with export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. Plain words, the repository's style. In markdown, wrap shot ids and file paths in backticks (the push's secret scan).`

const REVIEW = { type: 'object', properties: { file: { type: 'string' }, blocking: { type: 'number' }, shouldFix: { type: 'number' }, nits: { type: 'number' } }, required: ['file', 'blocking', 'shouldFix', 'nits'] }
phase('Review')
const [brand, fit] = await parallel([
  () => agent(`${RULES}

Task: adversarial review 1, brand and copy. Your job is to find what is wrong, not to approve. Read-only, except your review file. ${SAVE('review-brand.md')}
- Open every file:line the checklist cites, at the worktree's head, and confirm that it says what the checklist claims. A wrong or stale cite is a finding.
- Check every check against .claude/rules/brand.md, docs/brand/BRAND.md, packages/brand/README.md, ADR 0056, ADR 0058, CO-11 in docs/product/change-order-001.md, apps/web/src/lib/copy/words.ts and tools/brand-copy. A check that contradicts them, overstates them or misses one of their rules is a finding.
- Find any taste presented as a rule: a check marked with a rule that the rule does not state.
- Read its own words against the product's copy rules: plain, exact, no hype.
- Check the severity rules against the brief, and the trigger against what a person actually sees.
Write ${OPS}/designs/lane-b-ux-brand-reviewer/pr-review-brand.md: numbered findings, each blocking, should fix or nit, with evidence and the fix.`, { label: 'review:brand-copy', phase: 'Review', schema: REVIEW }),
  () => agent(`${RULES}

Task: adversarial review 2, consistency and fitness for use. Your job is to find what is wrong, not to approve. Read-only, except your review file. ${SAVE('review-fit.md')}
- Compare it with the four reviewer files in ${WT}/.claude/agents: frontmatter keys and order, form, voice and what they ask the agent to return. Q4 rules the model: key.
- Can a default workflow agent apply it in one review pass of a typical screen-changing PR? Name what is unclear, ambiguous or impossible to check from screenshots and code. It must stay short enough to be used: the design caps it at about 100 lines.
- Against the brief's "Then": it says what the reviewer receives (before and after shots at 1280 and 390 px, light and dark where offered, from tools/lane-b-screen-tour with TOUR_REF set to the base, then the head) and what it returns. It works for Lane A as written, and asks Lane A for nothing that is Lane B's own.
- It does not collide with Lane A's PR 7 (combined audit #103, ${OPS}/audits/combined/combined-report.md) or with the payment-engine and security reviewers' scope.
- Coverage: every recurring defect class in the baseline's findings (the synthesis's ranked findings if it exists, else raw-findings.md by lens) has a check. Name the classes it misses.
- The template change: it reads correctly, its wording is true (who ruled what), and it does not conflict with open PR #48's template edit (lines 1-8).
Write ${OPS}/designs/lane-b-ux-brand-reviewer/pr-review-fit.md: numbered findings, each blocking, should fix or nit, with evidence and the fix.`, { label: 'review:consistency', phase: 'Review', schema: REVIEW }),
])
if (!brand || !fit) throw new Error('A reviewer returned nothing.')

phase('Fix')
const fixed = await agent(`${RULES}

Task: the fix round for PR #55, in the worktree ${WT}. ${SAVE('fix.md')}
1. Resolve every finding in ${OPS}/designs/lane-b-ux-brand-reviewer/pr-review-brand.md (${brand.blocking} blocking, ${brand.shouldFix} should fix, ${brand.nits} nits) and ${OPS}/designs/lane-b-ux-brand-reviewer/pr-review-fit.md (${fit.blocking} blocking, ${fit.shouldFix} should fix, ${fit.nits} nits). Verify each one against the files first. Then apply it, or reject it with evidence. If ${OPS}/designs/lane-b-ux-review.md exists, also add any defect class it names that the checklist lacks. Keep the file usable: about 100 lines.
2. Write ${OPS}/designs/lane-b-ux-brand-reviewer/pr-fix-round.md: one line per finding with its outcome, and the suite's results.
3. Run the documentation-only suite once, each command under the heavy lock, one at a time, in ${WT}: flock /tmp/laneb-heavy.lock pnpm typecheck; then flock /tmp/laneb-heavy.lock pnpm lint; then flock /tmp/laneb-heavy.lock pnpm lint:copy; then flock /tmp/laneb-heavy.lock pnpm test. Record each command's result and its test counts. If one fails because of this PR, fix it and run that command again. If it fails for a reason this PR did not cause, record the evidence.
4. Commit in the worktree with a message whose first line is under 72 characters, a body that lists what changed, and these two lines at the end:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CntuGR3wkXMF6kK3at6bGh
Do not push.
Return the commit hash, the counts applied and rejected, each suite command's result, and the reviewer file's line count.`, { label: 'fix', phase: 'Fix', schema: { type: 'object', properties: { commit: { type: 'string' }, applied: { type: 'number' }, rejected: { type: 'number' }, suite: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] } }, lines: { type: 'number' }, notes: { type: 'string' } }, required: ['commit', 'applied', 'rejected', 'suite', 'lines', 'notes'] } })
return { brand, fit, fixed }
