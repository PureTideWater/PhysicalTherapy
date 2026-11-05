export const meta = {
  name: 'lane-b-redact-ssn-phone-describe',
  description: 'redact-ssn-phone at c9641eda: draft the PR description from the template, fact-check it twice, apply (no posting)',
  phases: [{ title: 'Describe', detail: 'author, two fact-checkers, apply' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/ssn'
const OPS = '/home/user/ops'
const CTX = `Branch co-001/redact-ssn-phone (PureTideWater/PhysicalTherapy), head c9641eda, worktree /home/user/redact-ssn-phone (read-only for you), base claude/build-platform f7d609cc. The item: the founder's ruling (Tyler Williams, 2026-11-01; relayed by the co-founder to Lane A, session_01TrKDxeLbxVo7t7zwRXFzrg, 18bbe0e9, 14:04 UTC; confirmed in session_01FcouKNNHsdecRMzfTs7XwW ~14:40 UTC) that a payer letter's Social Security and phone numbers are redacted by pattern before the model reads it. Sources: the design ${OPS}/designs/lane-b-redact-ssn-phone.md (section 17 R1-R14); the reports ${SP}/fix/step0.md, build.md, check.md; the workflow journal /root/.claude/projects/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/subagents/workflows/wf_58fc6224-3b6/journal.jsonl (review findings SEC-1..6 and corr-ssn-1..6 with their skeptic verdicts; critic rounds; read it with python3 -I); the status file ${OPS}/approval-summaries/lane-b-redact-ssn-phone-status.md; git log and git diff origin/claude/build-platform...HEAD; ADR 0054's new amendment and PRD 14 on the branch; .github/pull_request_template.md. After the suite on 10b48fb3: c? (R1-11's row is an area-000 twin) and the base merge c9641eda of f7d609cc (#110; four shared documents, both sides kept); on c9641eda typecheck, lint 1,834, lint:logs, lint:copy, check:fixtures, touched tests 47 files 1,672 passed, eval gate passed, generators wrote nothing. GitHub reads only through the GitHub MCP tools; no posting. No model identifier; synthetic examples only (SSNs in 9xx/000/666 areas, phones 555-01xx).`
const author = await agent(`${CTX}

Write the PR description to ${SP}/pr-body.md, under 55,000 characters, every template section in its order and heading, "None" rather than omitted. What changes (the patterns and their kinds/placeholders, the labels and keep-nouns, the guards for what must stay, the independent survivor scan and its refusal that names no number, the screen, linear time, each with a synthetic example), Why (the ruling with who and when), What it does not change (each template line; addresses stay a residual; any other residual ADR 0054 records), Checks (the full local suite on 10b48fb3 with exact totals from check.md, the c9641eda checks, and "CI on c9641eda: <!-- ci -->pending<!-- /ci -->"; keep the required-checks markers exactly), Reviewer agents' findings (one row per finding with its resolution commit, the refuted one with why, the critics' rounds), Freeze exception, Domain model, the founder's approval paragraph exactly as the template has it, and the footer exactly:
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_019i9ifCJSbPYXpafL86Rm6J
Return the path and length.`, { label: 'author', phase: 'Describe' })
const PROBLEMS = { type: 'object', properties: { problems: { type: 'array', items: { type: 'object', properties: { quote: { type: 'string' }, wrong: { type: 'string' }, truth: { type: 'string' }, source: { type: 'string' } }, required: ['quote', 'wrong', 'truth', 'source'] } } }, required: ['problems'] }
const checks = await parallel(['code and behaviour (probe every redaction example with a scratch tsx script against the branch redact.ts)', 'records, SHAs, counts, findings and template'].map((lens, i) => () => agent(`${CTX}

Adversarially fact-check ${SP}/pr-body.md. Lens: ${lens}. Report only claims you showed wrong, with the truth and its source. Empty is valid.`, { label: `check:${i}`, phase: 'Describe', schema: PROBLEMS })))
const problems = checks.filter(Boolean).flatMap(c => c.problems)
let applied = 'none'
if (problems.length) applied = await agent(`${CTX}

Apply each problem to ${SP}/pr-body.md after checking it (skip one that does not hold, saying why): ${JSON.stringify(problems)}. Under 55,000 characters. Return what changed and the final length.`, { label: 'apply', phase: 'Describe' })
return { author, problems, applied }