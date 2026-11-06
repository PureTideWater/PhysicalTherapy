export const meta = {
  name: 'sc1b-operator-words-review-lane-a',
  description: 'Lane A: review the operator-facing words SUITE-CAP-1b (PR #110) adds (alarm text, runbook sections, CLI warning, capacity summary) against the brand and accuracy, skeptic per finding, and hand confirmed ones to the fix round',
  phases: [
    { title: 'Review', detail: 'operator words: accuracy against the code, plain words, brand rules' },
    { title: 'Hand over', detail: 'write confirmed findings where the fix round reads them' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/e935a935-d2ff-5a27-860c-22677590c441/scratchpad'
const HEAD = 'd219e97d5fb7d3469e24be563aaa1eb97d27a8ee'
const COMMON = `Repository PureTideWater/PhysicalTherapy (PaidWhole). SUITE-CAP-1b's PR #110 (co-001/suite-cap-1-triage-locks, head ${HEAD}; worktree /home/user/sc1b, READ-ONLY for you; never write any worktree or /home/user/ops). Another workflow is reviewing and fixing this PR; you only review the words an operator or engineer reads that the PR adds or changes, and write nothing but the hand-over file named below. No PR comment, no review, no push.`
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' } }, required: ['real', 'reason'] }
phase('Review')
const r = await agent(`${COMMON}

Take /home/user/sc1b/.claude/agents/ux-brand-reviewer.md and /home/user/sc1b/.claude/rules/brand.md as your brief, applied to operator-facing text. In /home/user/sc1b at ${HEAD} (git show, read-only), review each of: infra/lib/constructs/monitoring.ts's JobHeapLivePeak alarmDescription and infra/lib/jobs.ts's message and metric names; the new sections of docs/runbooks/deploy-and-rollback.md ("A line's stage lock") and docs/runbooks/incident-response.md (the live-heap alarm); docs/runbooks/ci.md's changed table cell and reading guide; tools/release/index.ts's stderr warning (the founder's 13:15 UTC amendment says "the warning names the cause it can see": note that the fix round will rewrite it, so judge only whether the runbooks reference it correctly); tools/release-capacity/checks.ts's summary header and failing-check lines and run.ts's progress lines. For each: is every statement TRUE against the code it describes (thresholds, names, topics, what to do, what the operator will see); does the runbook tell the operator what happened, what it means, and what to do next, in plain words; brand rules (house style, no internal jargon unexplained, consistent names); anything an operator would misread at 3 a.m. Report only real defects with file:line and the exact text.`, { label: 'review: operator words', phase: 'Review', schema: { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, file: { type: 'string' }, line: { type: 'number' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'title', 'severity', 'evidence'] } }, checked: { type: 'string' } }, required: ['findings', 'checked'] } })
const judged = await parallel(((r && r.findings) || []).map(f => () => agent(`${COMMON}

You are a skeptic. Try to REFUTE this operator-words finding on PR #110 at ${HEAD} by reading the code read-only: ${JSON.stringify(f)}. Is the text really wrong, misleading or against the brand rules, and introduced by this PR? Default to real=false if the evidence does not hold up.`, { label: `skeptic ${f.id}`, phase: 'Review', schema: VERDICT }).then(v => ({ ...f, verdict: v }))))
const confirmed = judged.filter(Boolean).filter(f => f.verdict && f.verdict.real)
phase('Hand over')
const h = confirmed.length ? await agent(`${COMMON}

Write the hand-over. The other workflow's fix round keeps its record at ${SP}/progress/sc1b-fix.md and reads it when it starts.
- If that file does NOT exist yet: create it with exactly this content (and nothing else), so the fix round reads it as part of its brief:
"# SUITE-CAP-1b fix round record\\n\\n## Added by the session before the fix round started (operator-words review, ${HEAD}): additional CONFIRMED findings to fix with the others\\n" followed by one bullet per finding below (id, file:line, severity, the problem, the exact text, the fix), and the line "These were reviewed by the operator-words reviewer and each confirmed by a skeptic; fix them as confirmed findings, and list them in the PR body's findings table under reviewer 'operator words (UX and brand)'."
- If it DOES exist (the fix round has started): do not touch it; write the same content to ${SP}/progress/sc1b-words-late.md and say so.
Findings: ${JSON.stringify(confirmed).slice(0, 8000)}`, { label: 'hand over to the fix round', phase: 'Hand over', schema: { type: 'object', properties: { wrote: { type: 'string' }, late: { type: 'boolean' } }, required: ['wrote', 'late'] } }) : null
return { review: r, confirmed, refuted: judged.filter(Boolean).filter(f => !(f.verdict && f.verdict.real)), handover: h }
