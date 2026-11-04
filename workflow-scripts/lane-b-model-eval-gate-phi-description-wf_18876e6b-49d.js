export const meta = {
  name: 'lane-b-contract-phi-check-description',
  description: 'PR #75: draft the description from the template at head a8149341, fact-check it adversarially, fix (no posting)',
  phases: [
    { title: 'Draft', detail: 'author from the template, the old body and the reports' },
    { title: 'Fact-check', detail: 'two checkers, then the author applies confirmed problems' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/phi'
const WT = '/home/user/contract-phi-check'
const OPS = '/home/user/ops/approval-summaries'
const CTX = `PR #75 (PureTideWater/PhysicalTherapy, branch co-001/contract-phi-check, head a8149341, base claude/build-platform, which is now 4846f043; the branch last merged 21fa10df). Worktree ${WT} (read-only for you: never commit, push or change tracked files). Sources: the current PR body (read it with the GitHub MCP pull_request_read method get; it is stale: it reports CI on 9b7eadf, says P11/P12 deferred, uses "Choose the kind of document", footer names an old session); .github/pull_request_template.md on the branch (every section present; "None" rather than omitted); ADR 0070 Part 3 and ADR 0054 on the branch; git log 871faff9..a8149341 and git diff origin/claude/build-platform...a8149341 --stat; the status file ${OPS}/lane-b-model-eval-gate-status.md; reports ${OPS}/lane-b-model-eval-gate-wip/fix/ (merge4.md, check5.md, fix4.md, shots-ref.md, shots6.md, merge5.md, merge6.md, check7.md), ${OPS}/lane-b-model-eval-gate-phi-verify-1-summary.md, ${OPS}/lane-b-model-eval-gate-phi-review-findings-all.md. No model name or identifier anywhere; no PHI; synthetic examples only.`
const SAVE = (f) => `Save as you go in ${SP}/progress/${f}; if it exists when you start, continue from it.`

phase('Draft')
const draft = await agent(`${CTX}

Write the new PR description to ${SP}/pr75-body.md, under 60,000 characters, plain GitHub markdown, every template section in the template's order and headings. Keep what is still true of the old body, correct what is stale, and add:
- P11 built: the framed request cap in bytes (1,000,000, MAX_REQUEST_BYTES), no longer deferred. P12 built: the records check takes packages/db's scope and pool only.
- The order wording: the screen is last before the budget's hold and the call (check the code for the exact order and state it truly).
- The twin line: a third of the member IDs are "ZZ" plus 7 digits (check patient-twins.ts and state what it really does).
- The upload panel's current words ("Choose a kind", "ERA export", the help line, held files) as in the code at a8149341 (read uploader.tsx; replace the old wording-table rows with what the code says).
- The redact.ts hardening this PR now also carries (fixes 4 and 4b, 1677792a, 49156dd8, d2a609fd, 49c7a781, 7639392f, a8149341): what a letter's redaction now catches, each with a synthetic example, and the residuals ADR 0054 records.
- Every base merge since the PR opened with its resolution: f5292c6c, 871faff9, 26388626, 584f5218, fe9c8da8, b81429f4, 315ac91e, a03654ce (read each report; name the conflicts and how both sides were kept, #78's leave guard unified as leaveAsks(batch, held), #83's counted()).
- The reviews since the old table: verification 1 (FAIL) and how each of its findings closed; fix 3's shots findings (D-2 later M3-4, M4-2 resolved); merge 4 re-reads (both-sides-LC-1); fix 4's review F4-1, F4-2; merge 5's review R5-1..3, OVR-1..2; critic G1-G4; this round's phi-G2-regress-1, phi-numero-glued, phi-label-end-dash. A row each in the findings table with its resolution commit.
- The Checks section: the full local suite on a8149341 from check7.md (exact totals), engine freeze and affected.ts against the current base, and a line "CI on a8149341: <!-- ci -->pending<!-- /ci -->" that the caller fills in. Keep the required-checks markers exactly as the template has them.
- Shots: name the shot reports (shots-ref, shots6 on build-ops) and their result (no regression against the reference); no gallery link (none was published from this account).
- The footer: the attribution lines exactly
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_019i9ifCJSbPYXpafL86Rm6J
${SAVE('desc-draft.md')}
Return the file path and its character count.`, { label: 'author', phase: 'Draft' })

phase('Fact-check')
const PROBLEMS = { type: 'object', properties: { problems: { type: 'array', items: { type: 'object', properties: { quote: { type: 'string' }, wrong: { type: 'string' }, truth: { type: 'string' }, source: { type: 'string' } }, required: ['quote', 'wrong', 'truth', 'source'] } } }, required: ['problems'] }
const checks = await parallel(['code and tests (every claim about behaviour, words, numbers, files, order, commits)', 'records and template (every count, SHA, merge, finding, resolution against the reports and git; every template section present; no stale line; no model identifier; under 65,536 characters)'].map((lens, i) => () => agent(`${CTX}

Adversarially fact-check ${SP}/pr75-body.md. Lens: ${lens}. Verify each claim against its primary source yourself; report only claims you showed wrong, with the truth and its source. An empty list is a valid answer. ${SAVE('desc-check-' + i + '.md')}`, { label: `check:${i}`, phase: 'Fact-check', schema: PROBLEMS })))
const problems = checks.filter(Boolean).flatMap(c => c.problems)
log(`${problems.length} problems`)
let fixed = 'no problems'
if (problems.length) fixed = await agent(`${CTX}

Apply each of these fact-check problems to ${SP}/pr75-body.md, checking each against its source first (skip one that does not hold, saying why): ${JSON.stringify(problems)}. Keep it under 60,000 characters. Return what you changed and the final character count.`, { label: 'apply', phase: 'Fact-check' })
return { draft, problems, fixed }