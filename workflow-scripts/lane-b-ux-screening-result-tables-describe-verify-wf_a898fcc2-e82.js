export const meta = {
  name: 'lane-b-ux-screening-result-tables-describe-verify',
  description: 'PR #83: rewrite the description from the template, adversarially check every claim, write it and read it back; then the fresh-clone verification reading CI on the head',
  phases: [
    { title: 'Describe', detail: 'draft, claim check, write and read back' },
    { title: 'Verify', detail: 'fresh clone, the diff against design and findings, CI on the head' },
  ],
}
const SP = args.SP
const HEAD = args.HEAD
const OPS = '/home/user/ops'
const STATUS = `${OPS}/approval-summaries/lane-b-ux-screening-result-tables-status.md`
const SRC = `Sources (read them): the status file ${STATUS} (Current state and Log: commits, the finish workflow's results); the suite table ${OPS}/approval-summaries/lane-b-ux-screening-result-tables-finish-suite.md; the shots index ${OPS}/approval-summaries/lane-b-ux-screening-result-tables-finish-shots.md; the findings ${SP}/findings.json (P4-RC-01..06, UXR-01..08, .shots for the 2026-10-28 before/after sample); the finish run's progress files ${SP}/progress/p4-finish-*.md (the review of the fix delta: P4-FX-correctness-1, P4-FX-words-scope-1, -2); the design ${OPS}/designs/lane-b-ux-screening-result-tables.md (section 11 is UX PR 4b; section 12 wins); the current PR body (gh api repos/PureTideWater/PhysicalTherapy/pulls/83 --jq .body), written at f4a9766 — keep what is still true, correct what is not; the code at ${HEAD} (git -C /home/user/ux-screening-result-tables show / diff origin/claude/build-platform...${HEAD}).`
const BODY = { type: 'object', properties: { body: { type: 'string' }, notes: { type: 'array', items: { type: 'string' } } }, required: ['body', 'notes'] }
const CHECK = { type: 'object', properties: { problems: { type: 'array', items: { type: 'object', properties: { quote: { type: 'string' }, problem: { type: 'string' }, correction: { type: 'string' } }, required: ['quote', 'problem', 'correction'] } }, summary: { type: 'string' } }, required: ['problems', 'summary'] }
const END = `The body ends with exactly these lines (after a blank line):
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01FcouKRDfoFAeXZK4Thp8M8`

phase('Describe')
const draft = await agent(`Write PR #83's description (PureTideWater/PhysicalTherapy, head ${HEAD}, base claude/build-platform). Change nothing anywhere; return the body.
Form: the sections of .github/pull_request_template.md on claude/build-platform (git -C /home/user/ux-screening-result-tables show origin/claude/build-platform:.github/pull_request_template.md), every heading present in its order, "None" where nothing applies; its HTML comments are guidance, not text to keep. Plain, precise words per .claude/rules/brand.md; no model name or identifier; screenshot ids in backticks; no PNG or link to images. Under 60,000 characters.
${SRC}
It must cover: what the PR does and the UX baseline findings it closes (UX-005, UX-043; UX-042 and UX-132 in part); the fix round with every commit id and the finding ids each closes (c0a8fe0b, d0152f43, e901e477, 857ca333, f5e0ceba, 9289504d, 520a88f6, 71536c60), and that the last three were rebuilt locally with identical trees before the one push; the base merges of #81 (56ed6279) and of #78 and #82 (bce57f16), and how the shared files were resolved (both sides kept; watched-paths regenerated; synth unchanged); the full local suite's counts, including the MOD-13 property-test failure in packages/model-gateway, not caused by this PR (unchanged from the base), handed to the orchestrator as a PHI-redaction gap; the #42 cross-check (be63bdc2: clean merge, 1,206 web unit tests, both screening specs, no pin broken); the reviewer table with the shots sample: the 2026-10-28 before/after sample (findings .shots) for the PR as a whole, plus the 2026-11-01 after-only recheck of the states the fix round changed, with its verdicts and why no before run (the person's instruction: no redundant UX check of what already passed one); UXR-07 (the table copy keeps the Short tone until UX PR 4b; UX-040 stays open until 4b, and 4b must land before the first release tag) and UXR-08 ("the table's last row" becomes "the last entry" in 4b, which waits for #42); the 4b plan (design section 11 and Lane A's three conditions of section 12.1, no migration, its own PR the day #42 merges); reserved numbers used (ADR 0078 amendment; TBL-05..08 new; TBL-01, -03, -04 reworded; synth module 17; no migration); what merges in which order (after #84).
${END}`, { label: 'p4-desc-draft', phase: 'Describe', schema: BODY })

const checks = await Promise.all([
  'every number, count, commit id, sha, PR number and file:line in the body against the sources and git (git -C /home/user/ux-screening-result-tables log/show; the suite table; progress files)',
  'every claim about behaviour, words on screen, findings fixed, and what waits for 4b or #42, against the code at the head and the findings/design; plus: every template section present in order, no model identifier, no overclaim (BRAND.md: claim nothing the product cannot prove)',
].map((lens, i) => agent(`Adversarially check a pull request description before it is written to PR #83 (head ${HEAD}). Read-only. Try hard to find what is false, unproven, missing or stale. Lens: ${lens}.
${SRC}
The draft body:
<<<
${draft.body}
>>>
Return each problem with the exact quote, what is wrong (with evidence), and the corrected text. Return none rather than a speculative one.`, { label: `p4-desc-check-${i + 1}`, phase: 'Describe', schema: CHECK })))
const problems = checks.filter(Boolean).flatMap(c => c.problems)
log(`description problems found: ${problems.length}`)

const written = await agent(`You finalize and write PR #83's description. ${SRC}
The draft:
<<<
${draft.body}
>>>
Checkers' problems (apply each that holds after you check it against the source; reject with a reason any that does not): ${JSON.stringify(problems)}
Then: load the GitHub MCP tools with ToolSearch ("select:mcp__github__update_pull_request,mcp__github__pull_request_read"); write the body with mcp__github__update_pull_request (owner PureTideWater, repo PhysicalTherapy, pullNumber 83, body only; do not change title, state, draft or base); read it back with pull_request_read (method get) and compare byte for byte with what you sent (normalise only \\r\\n); if it differs, write again and re-read. Save the final body to ${SP}/p4-description.md. Length under 65,536. ${END}
Return body = the final body as read back, notes = applied/rejected problems and the read-back result ("identical, N chars").`, { label: 'p4-desc-write', phase: 'Describe', schema: BODY })

phase('Verify')
const VSCHEMA = { type: 'object', properties: { verdict: { type: 'string', enum: ['pass', 'fail'] }, ci: { type: 'array', items: { type: 'string' } }, ciTotals: { type: 'string' }, problems: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, claim: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['severity', 'claim', 'evidence', 'fix'] } }, checked: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } }, required: ['verdict', 'ci', 'ciTotals', 'problems', 'checked', 'summary'] }
const verify = await agent(`You are the fresh-clone verification of PaidWhole pull request #83 (PureTideWater/PhysicalTherapy, branch co-001/ux-screening-result-tables, head ${HEAD}), before its merge into claude/build-platform. Read-only: write nothing but your progress file and scratch files under ${SP}/verify83/. Never push, comment, approve, request changes or merge.
Save as you go: keep ${SP}/progress/verify83.md up to date; continue from it if it exists.
Every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH; heavy commands only under flock /tmp/laneb-heavy.lock; long waits with Monitor or run_in_background, never a foreground sleep.
1. A fresh clone: git clone -q https://github.com/PureTideWater/PhysicalTherapy ${SP}/verify83/clone (reuse it if it exists), fetch co-001/ux-screening-result-tables and claude/build-platform, check out ${HEAD}. Confirm origin's branch head is ${HEAD} and whether origin/claude/build-platform is an ancestor of it. If the base moved past it, report it as should-fix (the merge step merges the base again after #84; name the new base commits and whether they touch this PR's files).
2. CI on the head: wait until every check run on ${HEAD} has completed (gh api repos/PureTideWater/PhysicalTherapy/commits/${HEAD}/check-runs --paginate; poll at most every 2 minutes, up to 75 minutes). Every required check must be success: all green, mutation, screening-capacity gate, approval-of-record. Read the unit, db and e2e job logs (gh api repos/.../actions/jobs/<id>/logs, or the GitHub MCP get_job_logs with return_content and a large tail_lines) and take their totals. A failure only in e2e/screening.spec.ts SCR-01..07 at the outcome-stage read or helpers.ts:87 is the known flake (report it as such, not a pass). A unit failure only in packages/model-gateway/src/redact.property.test.ts MOD-13 is the pre-existing seed-dependent defect recorded in ${STATUS}: confirm from the log that it is that and nothing else, and report it as not this PR's (verdict fail until a re-run is green, since a required check is red).
3. The diff (git diff origin/claude/build-platform...${HEAD}): check that it does what the PR description says (gh api repos/PureTideWater/PhysicalTherapy/pulls/83 --jq .body) and what the design says (${OPS}/designs/lane-b-ux-screening-result-tables.md, section 12 first); that every finding in ${SP}/findings.json is fixed in the code as the description says (spot-check each by file:line), and P4-FX-correctness-1, P4-FX-words-scope-1 and -2; that no file of PR #42 (${SP}/pr42-files.txt) changes except rows in docs/product/test-matrix.md and packages/synth/src/cases/{matrix,registry}.ts and the generated watched-paths.txt; nothing under packages/db, pricing, ledger or money; no migration; no model name or identifier in any file or commit message; every commit since f4a97668 ends with the two attribution lines; generated files regenerated, never hand-edited (re-run watched.ts --write and synth --all in the clone and confirm no diff); ADR 0078's amendment and TBL-05..08 exist and matrix.ts matches the matrix.
4. In the clone, under the lock: pnpm install --frozen-lockfile, pnpm typecheck, and the unit tests of apps/web/src/components, apps/web/src/lib/copy and apps/web/src/app/tables.test.ts (a quick independent check; CI is the record).
Return the verdict (pass only if every required check is green on ${HEAD}, and no blocking problem), the CI list and totals, problems, and what you checked.`, { label: 'p4-verify', phase: 'Verify', schema: VSCHEMA })
return { draftNotes: draft && draft.notes, problems, written: written && { notes: written.notes, len: written.body.length }, verify }