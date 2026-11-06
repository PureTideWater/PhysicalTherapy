export const meta = {
  name: 'lane-b-ci-images-digest-verify',
  description: '#86 fresh-clone verification at R3 (932ea45f) reading CI, then the final description drafted (corrections, R3, ruler cut) for the session to send',
  phases: [
    { title: 'Verify', detail: 'one agent, fresh clone, code and CI on the head' },
    { title: 'Body', detail: 'draft the one description edit; check length and template' },
  ],
}
const PROG = '/home/user/ops/approval-summaries/lane-b-ci-images-digest-wip/progress'
const SUM = '/home/user/ops/approval-summaries'
const HEAD = '932ea45f9214eef36af0a55f406879b658e5c50f'
const SESSION = 'https://claude.ai/code/session_019i9ifDkvaQzK4YgTGnKWC3'
const SAVE = (f, w) => `Save as you go: keep ${PROG}/${f} up to date (${w}). If it exists when you start, continue from it.`
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. You work for the acting Lane B session S3 that owns PR #86, ci-images-digest (draft; branch co-001/ci-images-digest at ${HEAD.slice(0, 8)}, R3, pushed 2026-11-04 08:37:10 UTC; base claude/build-platform at 881e2bbd when pushed). Records: ${SUM}/lane-b-ci-images-digest-status.md (RESUME-BLOCK), ${SUM}/lane-b-ci-images-digest-fix-round.md, ${PROG}/fix-integrate.md, the design /home/user/ops/designs/lane-b-ci/ci-images-digest.md (§6.3, §6.4, the "Fix round" section), the item prompt /home/user/ops/lanes/lane-b-item-prompts-2026-11-01/ci-images-digest.md (step 3's body corrections and the "Body-size decision"), the reviews ${SUM}/lane-b-ci-images-digest-review-{ci-infra,security-supply}.md. CI on the head, all green: ci 41800917824 (images job 126476159818, unit 126476159555, static 126476159699, all green 126480153869), screening-capacity 41800917568 (capacity 126476210380, gate 126482579275), mutation 41800917340 (changes 126476156999, mutation 126476457537; stryker skipped, no shard affected), release-dry-run 41800917247 (build web 126476156804, build worker 126476156310, capacity 126477118666), approval-of-record 41800917267.
Rules: read only on GitHub (MCP read tools: pull_request_read, actions_get, actions_list, get_job_logs); never push, comment, review, approve, edit the PR, mark ready or merge. Every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH; heavy commands under flock /tmp/laneb-heavy.lock. No PHI, no model identifier in any file. Shorten hashes in files to 8 hex and an ellipsis.`

phase('Verify')
const VER = { type: 'object', properties: { pass: { type: 'boolean' }, problems: { type: 'array', items: { type: 'string' } }, facts: { type: 'string', description: 'every number and id the description needs: runs, jobs, counts, images log sizes and keys, BUILT values, body read' } }, required: ['pass', 'problems', 'facts'] }
const ver = await agent(`${COMMON}

YOUR TASK: the fresh-clone verification of #86 at ${HEAD}. ${SAVE('verify.md', 'each check and result')}
1. git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git /home/user/vf-imgdigest; fetch co-001/ci-images-digest and claude/build-platform; confirm origin's head equals ${HEAD} and refs/pull/86/head too (git ls-remote); flock ... pnpm install --frozen-lockfile.
2. Code: the diff against the merge base does what the PR claims (the identity steps read only the digest; the seven builds set BUILDX_METADATA_PROVENANCE disabled and the record upload off on pull_request; T1–T6 hold; ADR 0066 N32, ci.md, reconciliation-001 match the code; N29 appears only where the records say commit messages call it so). Run vitest --project unit tools/test and the whole workflows.test.ts; typecheck. Confirm the head contains every merge it claims and that each merge commit only resolves (git show --remerge-diff or merge-tree comparison).
3. CI: each required check (all green, mutation, screening-capacity gate, approval-of-record) succeeded on exactly ${HEAD}. Read the images job log (get_job_logs) per design §6.4: the two Metadata groups' byte sizes and keys (no buildx.build.provenance, no ruler row, no "Argument list too long"), the BUILT values, that each Trivy scan ran the pinned Trivy and found 0 HIGH/CRITICAL; read the capacity job's and both release-dry-run builds' logs for provenance and ruler rows; read the unit job's file and test counts against the local 432/7,317 (+ CI's ENGINE_FREEZE_BASE runs); static's Action pins and Toolchain lines.
4. The event: confirm the pull_request synchronize event of ci 41800917824 carried the 125,892-character body (the pre-push read at 08:36:52Z; no approval-of-record run between it and the push but the push's own 41800917267).
5. Whether origin/claude/build-platform is still an ancestor of ${HEAD} now (if not, say what moved).
Remove the clone. Return pass only if every check holds; list each problem with evidence.`, { label: 'verify', phase: 'Verify', schema: VER })
if (!ver) throw new Error('verifier returned nothing')

phase('Body')
const body = await agent(`${COMMON}

YOUR TASK: draft #86's ONE description edit, to be sent by the session after you return. ${SAVE('body-draft.md', 'progress on the draft')}
Read the live body first (pull_request_read get #86; save it to /tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/imgdigest/body-live.md; it should be 125,892 characters with the ruler from "| Row | Characters so far" through the newline after row "| 1000 |", SHA-256 5bb5e558…). Read .github/pull_request_template.md at the base and keep its section headings.
The verification's result: ${JSON.stringify(ver)}
Write the new body to /tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/imgdigest/body-new.md:
- the item prompt's step 3 corrections (R2 passed with its runs and log facts; R2's "Before each push" row: 125,892 and 5bb5e558…, pre-push read lost, the reconstruction; #42 now merged as 22789493 carrying the digest lines, its description "was 95,324 at 46974a25"; the N29 to N32 renumbering and that commit messages say N29; P5 answered: merge_commit_title MERGE_MESSAGE, merge_commit_message PR_TITLE);
- the fix round: D1–D10 and repairs 1–3 (from the fix-round summary), the reviewers' findings table with each resolution, the open round-4 nits listed as such;
- R3: the three base merges, the full local suite once, the pre-push read (08:36:52Z, 125,892, 5bb5e558…, the window check), every CI run and job id above, and the verification's facts (images log sizes and keys, BUILT values, Trivy);
- the body-size decision applied: the ruler cut in this edit, after the merging head's runs are green and recorded; keep its length (100,061), SHA-256 and how to regenerate it (approval-summaries/lane-b-ci-images-digest-wip/ruler.mjs on claude/build-ops, node ruler.mjs); note GitHub's 65,536 cap applies on create and an edit accepted 125,892; rewrite every sentence that promised the ruler stays until the merge (the details summary, the Checks paragraph, the integrator's choices); and say that if any push follows, the ruler goes back first;
- the merge: method merge with the explicit message (title "Merge pull request #86: <title>", message the title).
- end with the attribution: a line "🤖 Generated with [Claude Code](https://claude.com/claude-code)", a blank line, then ${SESSION}.
Keep it under 60,000 characters, and with no model identifier or PHI. Check the length (python: len of the text), that no "| Row | Characters so far" ruler remains, and every run id against the verification. Return: the file path, its length, a one-paragraph summary of what changed from the live body, and anything you could not confirm.`, { label: 'body', phase: 'Body' })
if (!body) throw new Error('body drafter returned nothing')
return { ver, body }
