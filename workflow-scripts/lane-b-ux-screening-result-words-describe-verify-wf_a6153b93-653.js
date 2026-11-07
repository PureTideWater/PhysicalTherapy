export const meta = {
  name: 'lane-b-ux-screening-result-words-describe-verify',
  description: 'PR #131: finish the description (suite, CI, rulings), claim-check it, write and read back; then the fresh-clone verification reading CI on the head',
  phases: [
    { title: 'Describe', detail: 'update, claim check, write and read back' },
    { title: 'Verify', detail: 'fresh clone, the diff against design and findings, CI on the head' },
  ],
}
const SP = args.SP
const HEAD = args.HEAD
const OPS = '/home/user/ops'
const WT = '/home/user/ux-screening-result-words'
const STATUS = `${OPS}/approval-summaries/lane-b-ux-screening-result-words-status.md`
const SRC = `Sources: the live PR #131 body (gh api repos/PureTideWater/PhysicalTherapy/pulls/131 --jq .body); the status file ${STATUS}; the full suite on ${HEAD}: ${SP}/4b-suite.md and ${SP}/progress/4b-suite.md; the review, verdicts and fix round: ${SP}/progress/4b-review.md, 4b-fix.md, the shots index ${SP}/4b-shots-index.md; the build: ${SP}/progress/4b-plan.md, 4b-build.md, 4b-check.md; the design ${OPS}/designs/lane-b-ux-screening-result-tables.md §11, §12.1; the code (git -C ${WT} log/show/diff 31a7345f..${HEAD}); CI on ${HEAD} (gh api repos/PureTideWater/PhysicalTherapy/commits/${HEAD}/check-runs --paginate).
Facts to carry: the earlier CI on c2725961 failed unit on tools/brand-colors reading "#121" in comments as a hex colour (this PR's; fixed in 03ec41f5); CI on 03ec41f5 failed unit once on MOD-16 in packages/model-gateway (seed 383403599, counterexample "Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00"), a known base defect this PR does not touch, fix in progress on co-001/redact-range-glued; one comment posted; the re-run passed and every check went green on 03ec41f5. The orchestrator, acting Lane A, confirmed P5 in the re-pin on 2026-11-07 01:31 UTC, with conditions: tags re-checked empty right before the merge; the UX and brand review covers the four new strings everywhere the old ones could appear; the ruling recorded here.`
const BODY = { type: 'object', properties: { body: { type: 'string' }, notes: { type: 'array', items: { type: 'string' } } }, required: ['body', 'notes'] }
const CHECK = { type: 'object', properties: { problems: { type: 'array', items: { type: 'object', properties: { quote: { type: 'string' }, problem: { type: 'string' }, correction: { type: 'string' } }, required: ['quote', 'problem', 'correction'] } }, summary: { type: 'string' } }, required: ['problems', 'summary'] }
const END = `The body ends with exactly these lines (after a blank line), replacing any other footer:
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01FcouKRDfoFAeXZK4Thp8M8`

phase('Describe')
const draft = await agent(`Update PR #131's description to the head ${HEAD}. Change nothing anywhere; return the body. Keep the live body's structure (the template's sections, every heading in order) and everything still true; correct what is not.
${SRC}
Add or correct: the Checks section's table with the full local suite on ${HEAD} (command, result, counts), replacing the fast-checks-only table; a CI line for ${HEAD} (fill it from the check runs; if CI is still running, say "CI on ${HEAD} running at the time of writing" — the verifier fills the final state later) and the two earlier CI events above (the brand-colors fix, the MOD-16 base failure and its re-run); every commit since 31a7345f with its finding ids; the reviewer table: the one UX and brand review's verdict, each finding (4B-UX-01..03) with its skeptic votes and resolution, the calls ruled, shots named by id (both sides, 57 each, and the .fix shots), what was not seen; acting Lane A's P5 confirmation and conditions; the leftover "Expected under Medicare" only in record documents (ADR 0062's original text, which the amendment supersedes, and change-order-001), plus one negative test pin. Plain words per .claude/rules/brand.md, no model identifier, screenshot ids in backticks, no images, under 60,000 characters.
${END}`, { label: '4b-desc-draft', phase: 'Describe', schema: BODY })
if (!draft || !draft.body) throw new Error('draft failed')

const checks = await Promise.all([
  'every number, count, commit id, sha, PR number and file:line against the sources and git',
  'every claim about behaviour, words on screen, findings fixed and rulings against the code at the head, the review notes and the design; every template section present in order; no model identifier; no overclaim',
].map((lens, i) => agent(`Adversarially check a description before it is written to PR #131 (head ${HEAD}). Read-only. Lens: ${lens}.
${SRC}
The draft:
<<<
${draft.body}
>>>
Return each problem with the exact quote, what is wrong (evidence), and the corrected text. None rather than speculative.`, { label: `4b-desc-check-${i + 1}`, phase: 'Describe', schema: CHECK })))
const problems = checks.filter(Boolean).flatMap(c => c.problems)
log(`description problems: ${problems.length}`)

const written = await agent(`You finalize and write PR #131's description. ${SRC}
The draft:
<<<
${draft.body}
>>>
Checkers' problems (apply each that holds; reject with a reason any that does not): ${JSON.stringify(problems)}
Load the GitHub MCP tools with ToolSearch ("select:mcp__github__update_pull_request,mcp__github__pull_request_read"); write the body with mcp__github__update_pull_request (owner PureTideWater, repo PhysicalTherapy, pullNumber 131, body only; draft stays true); read it back with gh api repos/PureTideWater/PhysicalTherapy/pulls/131 --jq .body and compare byte for byte (normalise \\r\\n and gh's one trailing newline). If the server replaced the footer, record it in notes. Save the final body to ${SP}/4b-description.md. ${END}
Return body as read back, and notes (applied/rejected problems; read-back result with the character count).`, { label: '4b-desc-write', phase: 'Describe', schema: BODY })

phase('Verify')
const VSCHEMA = { type: 'object', properties: { verdict: { type: 'string', enum: ['pass', 'fail'] }, ci: { type: 'array', items: { type: 'string' } }, ciTotals: { type: 'string' }, problems: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, claim: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['severity', 'claim', 'evidence', 'fix'] } }, checked: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } }, required: ['verdict', 'ci', 'ciTotals', 'problems', 'checked', 'summary'] }
const verify = await agent(`You are the fresh-clone verification of pull request #131 (PureTideWater/PhysicalTherapy, branch co-001/ux-screening-result-words, head ${HEAD}) before its merge into claude/build-platform. Read-only: write nothing but your progress file and scratch files under ${SP}/verify131/. Never push, comment, approve, request changes or merge.
Save as you go: keep ${SP}/progress/verify131.md up to date; continue from it if it exists.
Every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH; heavy commands only under flock /tmp/laneb-heavy.lock; long waits with Monitor or run_in_background, never a foreground sleep.
1. A fresh clone: git clone -q https://github.com/PureTideWater/PhysicalTherapy ${SP}/verify131/clone (reuse it if it exists), fetch the branch and claude/build-platform, check out ${HEAD}. Confirm origin's branch head is ${HEAD} and whether origin/claude/build-platform is an ancestor (if the base moved, name the new commits and whether they touch this PR's files: should-fix, the merge step merges it in).
2. CI on ${HEAD}: wait until every check run has completed (poll at most every 2 minutes, up to 75 minutes). Every required check must be success: all green, mutation, screening-capacity gate, approval-of-record. Take unit, db and e2e totals from the job logs. A unit failure only in packages/model-gateway/src/redact.property.test.ts (MOD-13/MOD-16, seed-dependent) is the known base defect: confirm from the log it is only that, and report it as not this PR's (verdict fail until a re-run is green). Known e2e flake: screening.spec.ts SCR-01..07 at the outcome-stage read or helpers.ts:87.
3. The diff (git diff origin/claude/build-platform...${HEAD}) against the PR description (gh api …/pulls/131 --jq .body), the design (${OPS}/designs/lane-b-ux-screening-result-tables.md §11, §3.4, §3.9, §12 incl. 12.1) and the review findings (${SP}/progress/4b-review.md; 4B-UX-01..03): each spot-checked by file:line. Lane A's conditions: (1) labels.test.ts's VERSIONS comment states the rule exactly "a version may be re-pinned under its name only while no release tag contains it (the founder creates tags; the first tag releases it)" and names every changed string, the 2026-10-18 entry untouched; (2) git ls-remote --tags origin is empty now; acting Lane A's P5 condition: git grep the clone for "Expected under Medicare" / "expected under Medicare" and every other old string the diff replaced (the difference headers, the place-of-service words, DISPOSITION_NOTES, "the table’s last row", "group of N is an anomaly" forms) across apps, packages, tools, content, emails, exports, packets, help text and tests: any leftover outside record documents (ADRs' original text, change-order-001) and negative test pins is blocking. Also: nothing under packages/db, pricing, ledger, money; no migration; screening_labels_version() still returns screening-labels/2026-11-05; shared files change only TBL-08; matrix.ts matches the test matrix; generated files regenerate with no diff (watched.ts --write, synth --all); no model identifier in files or commit messages; every commit since 31a7345f ends with the two attribution lines.
4. In the clone, under the lock: pnpm install --frozen-lockfile, pnpm typecheck, and the unit tests of apps/web/src/components/screening, apps/web/src/lib/screening, apps/web/src/lib/copy, tools/brand-colors and tools/brand-copy.
Return the verdict (pass only if every required check is green on ${HEAD} and no blocking problem), the CI list and totals, problems, and what you checked.`, { label: '4b-verify', phase: 'Verify', schema: VSCHEMA })
return { problems: problems.length, written: written && { notes: written.notes, len: written.body.length }, verify }