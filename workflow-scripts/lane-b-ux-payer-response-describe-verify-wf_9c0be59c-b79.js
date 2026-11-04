export const meta = {
  name: 'lane-b-ux-payer-response-describe-verify',
  description: 'PR #85 at 0f7a12bb: refresh the description and fact-check it; fix the design 6.1 strings and the tour regex on build-ops; fresh-clone verification that reads CI',
  phases: [
    { title: 'Describe', detail: 'author, two fact-checkers, apply' },
    { title: 'Verify', detail: 'one fresh-clone verifier reading CI' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/pay'
const OPS = '/home/user/ops'
const W = `${OPS}/approval-summaries/lane-b-ux-payer-response-wip`
const CTX = `PR #85, UX PR 10 (PureTideWater/PhysicalTherapy, branch co-001/ux-payer-response, head 0f7a12bb (resolve the full SHA), base claude/build-platform 24531dc2). Since a97d6011 it merged 72096e94 (#75 and nine more) as f03381de, fixed the packets e2e (32bfde40), took two shot findings (a57812ac, 7e579010) and the critic's test gaps (4db214ef), then merged 24531dc2 (#106, #86) as 0f7a12bb. Reports: ${W}/merge75.md, fix75.md, shots75.md, check75.md; the old body ${W}/pr85-body.md (the PR's current body, from a97d6011); the design ${OPS}/designs/lane-b-ux-payer-response.md; status ${OPS}/approval-summaries/lane-b-ux-payer-response-status.md; the template .github/pull_request_template.md. Worktree /home/user/ux-payer-response (read-only). GitHub reads only through the GitHub MCP tools (load with ToolSearch), never gh or curl. No model name or identifier; synthetic examples only.`
const SAVE = (f) => `Save as you go in ${SP}/progress/${f}; continue from it if it exists.`

phase('Describe')
const draft = await agent(`${CTX}

1. Write the new description to ${SP}/pr85-body.md, under 60,000 characters, every template section in order. Keep what is still true of the old body and correct what is stale. In particular:
   - the words as the code now has them: the Contracts kind label, panel title and drop-zone heading after a57812ac and 7e579010; #75's "Choose a kind" and held files beside this PR's changes;
   - the merge of #75 per design 3.7, with each conflict and its resolution, merge75.md's WHAT-CHANGED lines (the letter stays in the form after a refused upload, as "Waiting to upload", and so on), and the 24531dc2 merge;
   - the #75 row in "Shared files with open pull requests", now merged;
   - the reviews of the merge (0 findings each), the shots and UX delta's F1 and F2 and their fixes, and the critic's gaps fixed in 4db214ef, as rows in the findings table;
   - the Checks section: the full local suite on 4db214ef from check75.md (exact totals), the fast checks on 0f7a12bb, and a line "CI on 0f7a12bb: <!-- ci -->pending<!-- /ci -->" that the caller fills in; keep the required-checks markers exactly;
   - the shots from shots75.md by shot id (no new gallery; the old gallery links stay, labelled with their commits);
   - the footer exactly:
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_019i9ifCJSbPYXpafL86Rm6J
2. On build-ops (edit files only; never commit or push): update design section 6.1's strings at ${OPS}/designs/lane-b-ux-payer-response.md (check75.md names :1269-1270 and :1286) to the code's current words, and add the alternative ", exhibit or payer’s terms or policy letter" to the CONTRACT_UPLOAD regex at ${OPS}/tools/lane-b-screen-tour/capture/tour.spec.ts:719 so it matches the new Contracts title (check the exact title in contracts/page.tsx). Record both edits.
${SAVE('desc85.md')}
Return the body's path and length, and the two build-ops edits.`, { label: 'author', phase: 'Describe' })
const PROBLEMS = { type: 'object', properties: { problems: { type: 'array', items: { type: 'object', properties: { quote: { type: 'string' }, wrong: { type: 'string' }, truth: { type: 'string' }, source: { type: 'string' } }, required: ['quote', 'wrong', 'truth', 'source'] } } }, required: ['problems'] }
const checks = await parallel(['code and words (every string, behaviour, file and order against the code at the head)', 'records and template (every count, SHA, merge, finding and resolution against the reports and git; every template section; no stale line; under 65,536 characters)'].map((lens, i) => () => agent(`${CTX}

Adversarially fact-check ${SP}/pr85-body.md. Lens: ${lens}. Verify each claim yourself; report only claims you showed wrong, with the truth and its source. An empty list is valid. ${SAVE('desc85-check-' + i + '.md')}`, { label: `check:${i}`, phase: 'Describe', schema: PROBLEMS })))
const problems = checks.filter(Boolean).flatMap(c => c.problems)
let applied = 'none'
if (problems.length) applied = await agent(`${CTX}

Apply each problem to ${SP}/pr85-body.md after checking it against its source (skip one that does not hold, saying why): ${JSON.stringify(problems)}. Keep it under 60,000 characters. Return what changed and the final length.`, { label: 'apply', phase: 'Describe' })

phase('Verify')
const verify = await agent(`You are the fresh-clone verifier for ${CTX}
You trust nothing anyone wrote; you check it. ${SAVE('verify85.md')}
Rules: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH; heavy commands under flock /tmp/laneb-heavy.lock; never push, commit, comment, approve, mark ready or edit the PR; never write in /home/user/ux-payer-response, /home/user/PhysicalTherapy or /home/user/ops.
1. Fresh clone into ${SP}/verify85-clone, fetch co-001/ux-payer-response and claude/build-platform, check out the head detached; confirm origin still points at it. pnpm install --frozen-lockfile.
2. Check every claim of ${SP}/pr85-body.md (the description to be posted) against the clone: words, behaviour, files, commits (each an ancestor that touches what it claims), the merge resolutions against design 3.7's #75 row, the local totals against check75.md. List every false or stale claim.
3. Boundaries: git diff --stat origin/claude/build-platform...HEAD: nothing under content/releases, fixtures/golden, packages/db/migrations, packages/db/functions, packages/pricing/src (non-test) or packages/ledger/src; no model name or identifier in added lines or commit messages since a97d6011; synthetic data only (pnpm check:fixtures); #75's PHI guard intact (contracts and reconciliation start unchosen; held files wait for a press; the uploads page keeps initialKind="x12_835"); trailers on this session's commits.
4. In the clone: pnpm typecheck; pnpm lint:logs; pnpm lint:copy; vitest unit and browser tests under apps/web/src/components/uploads, reconciliation and packets; synth --all writes nothing; watched.ts --write leaves the tree unchanged. For 4db214ef's new tests, remove the held-files buttons' type="button" in a scratch copy and show the test fails, then restore.
5. Read CI on the head: wait until every check run on the full head SHA has completed (mcp__github__pull_request_read get_check_runs, every ~2 min, at most 90 min). Report each conclusion; required: all green, mutation, screening-capacity gate, approval-of-record. For a failure read its log (get_job_logs) and say exactly what failed and whether it is this PR's. Take unit, golden, db and e2e totals from the CI logs and compare them with check75.md.
Write ${SP}/fix/verify85.md and return its full text: verdict PASS (merge-ready: CI green, no false claims, boundaries held) or FAIL with the exact list of what must change.`, { label: 'verify85', phase: 'Verify' })
return { draft, problems, applied, verify }