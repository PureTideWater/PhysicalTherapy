export const meta = {
  name: 'lane-b-ci-images-digest-merge-review',
  description: '#86 ci-images-digest: merge #82 (bce57f16) in keeping both sides, renumber N29 to N32, check, push a WIP ref; adversarially verify the merge; two adversarial reviews; verify every finding; completeness critic',
  phases: [
    { title: 'Merge', detail: 'one integrator: base merge, N32 renumber, regenerate, scoped checks, WIP ref' },
    { title: 'Merge check', detail: 'an independent verifier of the merge in a fresh clone; fix loop if needed' },
    { title: 'Review', detail: 'CI and test infrastructure; security and supply chain; fresh clones of the WIP head' },
    { title: 'Verify', detail: 'three refuters per blocking or should-fix finding, one per nit' },
    { title: 'Critic', detail: 'what the reviews missed; its findings verified the same way' },
  ],
}

const PROG = '/home/user/ops/approval-summaries/lane-b-ci-images-digest-wip/progress'
const SUM = '/home/user/ops/approval-summaries'
const WT = '/home/user/ci-images-digest'
const WIP = 'co-001/wip-ci-images-digest'
const SESSION = 'https://claude.ai/code/session_01FcouKN1UjKZTWt4U9bZjyW'
const SAVE = (file, what) => `Save as you go: keep ${PROG}/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the repository says otherwise, and continue from where it stopped.`

const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. You work for the Lane B item session that owns PR #86, ci-images-digest (branch co-001/ci-images-digest, draft, base claude/build-platform). CLAUDE.md is in your context.
The defect it fixes: CI's \`images\` job (ci.yml) passed docker/build-push-action's whole \`metadata\` output into one env var (METADATA); buildx writes \`buildx.build.provenance\` into it even with provenance: false, holding the whole pull_request event, description included; on #42 that reached 132,387 bytes, over Linux's 131,072-byte single-string limit (MAX_ARG_STRLEN), so bash never started. The fix: (c2) each identity step's env takes only BUILT: "\${{ fromJSON(steps.<id>.outputs.metadata || '{}')['containerimage.config.digest'] }}" and run uses built="$BUILT"; (c4) all seven docker/build-push-action steps (ci.yml, release.yml, release-dry-run.yml, release-capacity.yml, screening-capacity.yml) set BUILDX_METADATA_PROVENANCE: disabled; (c1/c3) tools/test/workflows.test.ts adds a closed allowlist of every value that may reach a process, each with its bound (T1–T6); (c5) documents: ADR 0066 Part 3 notice (numbered N29 on the branch), docs/runbooks/ci.md, docs/product/reconciliation-001.md.
Design: /home/user/ops/designs/lane-b-ci/ci-images-digest.md (1,205 lines; its "Review (2026-10-28)" section at line 1159 is folded in; §6.3 the runs of record; §6.4 reading sizes from a log; §9 interplay; §12 proposals P1–P5). It is stale on: §9.1 (#42 is now at be63bdc2, not 46974a25), §9.2 (#82 merged at 2026-11-01 17:19 UTC as bce57f16), and "N29" (now N32).
Status and facts of record: /home/user/ops/approval-summaries/lane-b-ci-images-digest-status.md (read its RESUME-BLOCK first; it is current as of 17:28 UTC).
Heads: the PR head is 83167b8f (contains base 83d71fd6). claude/build-platform is now bce57f16 = #82 (co-001/ci-pin-age, ADR 0066 Part 5, notices N23–N31) merged. #42 (PR 6b-4, open) is at be63bdc2 and carries this branch's identity-step lines byte for byte (the hand-over patch, SHA-256 8cf981fb…).
Rules for you:
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH (default node is 22; the repository needs 24).
- Heavy commands (pnpm install, typecheck, lint, vitest, builds, synth) run only under: flock /tmp/laneb-heavy.lock <command>. Other workflows share this machine.
- Synthetic data only; no PHI. No model name or identifier in any file, commit or text you write. Shorten any 40/64-hex hash you write into an approval-summaries file to 8 hex digits and an ellipsis.
- Never force, never --no-verify, never amend/rebase/reset --hard a pushed commit, never add a .gitleaksignore entry. Never write files through the GitHub connector; never comment, review, approve, edit or merge on GitHub. GitHub reads only through the GitHub MCP read tools (pull_request_read, get_job_logs, actions_get, actions_list).
- Rule 2: no migration and no regeneration of docs/product/domain-model.md.
- Improve as you go (the co-founder's standing direction): an improvement inside this PR's files is done and named in your result; one outside goes in your result as a proposal.
- Long commands: run_in_background and wait for the notification; the Bash tool refuses a long foreground sleep.`

const COMMIT_TAIL = `Commit messages in the repository's style (read git log), each ending with a blank line and then exactly these two lines:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}`

// ---------------- Merge ----------------
phase('Merge')
const merge = await agent(`${COMMON}

YOUR TASK: integrate PR #86 with the latest claude/build-platform (bce57f16, #82 merged) in the worktree ${WT} (on co-001/ci-images-digest at 83167b8f = origin; node_modules installed). You may change this worktree.
${SAVE('merge.md', 'each step done, each conflict and how it was resolved, each check with its result, the commits and the pushed WIP sha')}

1. git fetch origin claude/build-platform, confirm it is bce57f16 (if it moved, merge the newer one and say so). git merge --no-ff origin/claude/build-platform with the message "Merge claude/build-platform bce57f16 (#82, ci-pin-age) into co-001/ci-images-digest". LANES.md rule 6: a merge commit that only resolves, keeping BOTH sides. Expected conflicts (a trial merge-tree at 17:27 UTC found exactly three):
   - ADR 0066 (docs/adr/0066-*.md) near lines 28–35: this branch's Date line ("N29 2026-10-28") against #82's Part 5 summary and Date line ("Part 5 2026-10-28"). Keep both; #82's text and numbering first, this branch's after it.
   - docs/product/reconciliation-001.md near :659, the end of the 2026-10-26 ruling, where both sides append: keep both, #82's entry first (merge order), then this branch's.
   - tools/test/workflows.test.ts near :13, the imports: #82 adds readDockerfile, this branch adds MAX_FILE_BYTES: import both. Check every other hunk of the file after the merge too.
   In the merge commit keep this branch's notice as N29 (resolution only). Read every auto-merged file (ci.yml, release.yml, release-dry-run.yml, release-capacity.yml, screening-capacity.yml, docs/runbooks/ci.md) and confirm both sides' lines survive.
2. Run the scoped tests on the merge: flock /tmp/laneb-heavy.lock pnpm exec vitest run --project unit tools/test (and tools/check-action-pins tools/check-toolchain if #82 added them). If T1–T6 (this branch's value allowlist and provenance rules) fail on #82's workflows (for example #82's \`{ BASE, GITHUB_TOKEN }\` env hunk, or any new env/with/run value #82 added that reaches a process), fix that in a SEPARATE commit after the merge ("T6 lists #82's values" or similar): add each value to the closed allowlist with its real bound and its reason, exactly as the existing rows do; never loosen a rule or widen a bound beyond what the value can carry. Also fix any T6 line citation the merge made stale (citations that drift when a workflow changes); if the citations are line numbers that any workflow edit breaks, consider and record whether a sturdier anchor is the better design, and apply it only if it is clearly better and small.
3. A separate commit: renumber THIS branch's ADR 0066 notice N29 to N32 (N32 is the next free notice: bce57f16 uses up to N31; no open branch or claim uses N32). Change ONLY this branch's N29, never #82's own N29 (diff each file against origin/claude/build-platform to tell them apart). Places: ADR 0066 (the Date line, the Part 3 notice and its Deciders sentence); the comments of ci.yml, release.yml, release-dry-run.yml, release-capacity.yml, screening-capacity.yml; docs/runbooks/ci.md; reconciliation-001; tools/test/workflows.test.ts (the describe title included). In the ADR's notice add one sentence that the branch's commit messages call it N29 (renumbered at the merge of #82, which took N29–N31). Afterwards grep the tree for any remaining reference to this branch's N29 and list every remaining "N29" with why it is #82's.
4. Regenerate, never hand-merge: flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile; node tools/screening-capacity/watched.ts --write; flock /tmp/laneb-heavy.lock pnpm synth --all. Commit any change these make in its own commit (likely none; say so).
5. Checks, all under the lock where heavy, each with its result and totals: pnpm exec vitest run --project unit tools/test (and #82's tool dirs); actionlint .github/workflows/*.yml if available (else say so); pnpm typecheck; pnpm lint; pnpm lint:logs; pnpm actions:check --offline; BASE=origin/claude/build-platform pnpm actions:check; BASE=origin/claude/build-platform pnpm toolchain:check (networked; if a network read is refused, record the exact refusal and which part could not run). Fix what fails because of this branch or the merge, in its own commit; report anything that fails on the base too (check by running it on a clean checkout of bce57f16 in a temporary worktree, then remove it).
6. Push the result to the WIP ref, not the PR branch: git push origin HEAD:refs/heads/${WIP} (the pre-push hook runs the fixture check and gitleaks; never --no-verify; if the hook refuses, fix only the unpushed commits and push again; if the ref already exists on origin and is not an ancestor, push to ${WIP}-2 instead and say so). Do NOT push co-001/ci-images-digest.
${COMMIT_TAIL}
Return: the WIP head sha and its parent chain since 83167b8f (sha + subject), each conflict's resolution, what T1–T6 needed for #82's workflows, the renumber list (file:line before and after) and every remaining N29 with its owner, the regeneration result, every check's result with totals, and anything open.`, { label: 'merge', phase: 'Merge' })
if (!merge || !String(merge).trim()) throw new Error('merge agent returned nothing')

// ---------------- Merge check (adversarial) with a fix loop ----------------
phase('Merge check')
const MC_SCHEMA = { type: 'object', properties: {
  wipSha: { type: 'string' }, sound: { type: 'boolean' },
  issues: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, where: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['what', 'where', 'evidence', 'fix'] } },
  checked: { type: 'string' } }, required: ['wipSha', 'sound', 'issues', 'checked'] }
let mergeReport = String(merge)
let mc = null
for (let round = 1; round <= 3; round++) {
  mc = await agent(`${COMMON}

You are an ADVERSARIAL VERIFIER of a base merge. Assume it is wrong until you prove each part right. The integrator's report:
=== INTEGRATOR ===
${mergeReport}
=== END ===
Work in a fresh clone of your own (read only; never push): git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git /home/user/mc-imgdigest-${round} && git -C /home/user/mc-imgdigest-${round} fetch origin ${WIP} 'refs/heads/${WIP}*:refs/remotes/origin/wip/*' ; check out the WIP head the report names (verify it equals the remote ref). Install with flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile.
Prove or refute, with commands and output:
(a) both sides kept: for every file both 83167b8f and bce57f16 changed relative to their merge base (git merge-base 83167b8f bce57f16), every hunk of BOTH sides is present in the WIP head (compare git diff <merge-base> 83167b8f and git diff <merge-base> bce57f16 against the result; nothing dropped, nothing duplicated); the merge commit itself only resolves (git show --remerge-diff or a re-merge comparison);
(b) the N29→N32 renumber: every reference to THIS branch's notice now says N32; every remaining N29 belongs to #82 (#82's N29 untouched); ADR 0066's Date line, Part 3 notice and Deciders sentence consistent; the ADR says the commit messages call it N29;
(c) T1–T6 hold on #82's workflows for the right reasons (no rule loosened, no bound widened beyond what a value can carry; every new allowlist row's bound is real); line citations in T6 correct at this head;
(d) generated files are what their generators write (re-run pnpm install --frozen-lockfile, node tools/screening-capacity/watched.ts --write, pnpm synth --all and git status --porcelain must be empty);
(e) flock /tmp/laneb-heavy.lock pnpm exec vitest run --project unit tools/test passes (totals), and pnpm typecheck passes.
Remove your clone when done. ${SAVE('merge-check-' + round + '.md', 'each check (a)–(e) and its result so far')}
Return sound=true only if every check passed; otherwise list each issue with evidence and the fix.`, { label: `merge-check:${round}`, phase: 'Merge check', schema: MC_SCHEMA })
  if (!mc) throw new Error('merge check returned nothing')
  if (mc.sound) break
  if (round === 3) break
  log(`merge check round ${round}: ${mc.issues.length} issue(s); fixing`)
  const fix = await agent(`${COMMON}

The base merge of #86 was checked by an adversarial verifier, which found these issues:
${JSON.stringify(mc.issues, null, 2)}
The integrator's report: ${mergeReport}
In the worktree ${WT} (at the WIP head), fix each real issue in a new commit (never amend the merge commit or rewrite pushed commits; if the merge commit itself is wrong, fix forward in a commit that says so). If you judge an issue not real, say why with evidence. Re-run the scoped tests and typecheck under the lock, then push: git push origin HEAD:refs/heads/<the WIP ref the report names> (fast-forward only; never force).
${COMMIT_TAIL}
${SAVE('merge-fix-' + round + '.md', 'each issue and what you did')}
Return the new WIP head sha, what changed per issue, and the check results.`, { label: `merge-fix:${round}`, phase: 'Merge check' })
  mergeReport = mergeReport + '\n\n=== FIX ROUND ' + round + ' ===\n' + fix
}
if (!mc.sound) log('merge check still not sound after 3 rounds; reviews proceed and the issues go to the fix round')

// ---------------- Reviews ----------------
phase('Review')
const FIND = { type: 'object', properties: {
  reviewText: { type: 'string', description: 'the full review as written to the file' },
  findings: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' }, severity: { type: 'string', enum: ['B', 'S', 'N'] }, title: { type: 'string' }, where: { type: 'string' },
    scenario: { type: 'string', description: 'a concrete failing input or scenario' }, evidence: { type: 'string' }, fix: { type: 'string' } },
    required: ['id', 'severity', 'title', 'where', 'scenario', 'evidence', 'fix'] } },
  sound: { type: 'string', description: 'what was checked and found sound' } }, required: ['reviewText', 'findings', 'sound'] }
const REVIEW = (who, focus, file) => `${COMMON}

You are an ADVERSARIAL REVIEWER (${who}) of PR #86 as it will merge: the WIP head ${mc.wipSha} (the PR branch plus the merge of #82 and the N32 renumber; it will be pushed to the PR after the fix round). The merge report:
=== MERGE ===
${mergeReport}
=== END ===
Work in a fresh clone of your own: git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git /home/user/review-imgdigest-${file} && fetch and check out ${mc.wipSha} (fetch refs/heads/${WIP}* from origin). Read only: never push, comment, review or approve. Install with flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile and run what you need under the lock.
Read the design, the status file, and the whole diff against claude/build-platform bce57f16 (git diff bce57f16...${mc.wipSha} and git diff bce57f16 ${mc.wipSha}). CI evidence: R2 on 83167b8f passed: ci run 40653896254 (images job 122700187970), screening-capacity 40653896246 (capacity job 122700247351, gate 122706928679), release-dry-run 40653896300, mutation 40653896273, approval-of-record 40653896226 — read them with the GitHub MCP tools (get_job_logs with return_content and a large tail_lines; actions_get).
Everyone also checks these four points:
- the N29 collision with #82: is the renumber to N32 complete and correct everywhere, and is nothing of #82's renumbered;
- T6's line citations: do they drift when a workflow changes, are they all correct at this head, and is the test robust to that (would a citation drift turn CI red or, worse, silently pass);
- P2 (design §12): the build-record artifact still carries the event: what exactly does it carry, who can read it, and is that in scope here or a proposal;
- R2's images log, re-read per design §6.4 (Metadata groups' byte sizes and keys, no buildx.build.provenance, no ruler row "synthetic length-test row", no "Argument list too long", the BUILT values): confirm or refute the status file's item on it with numbers.
Your focus: ${focus}
Find real defects, not style. For each: severity B (blocking), S (should fix) or N (nit); file:line; a concrete failing input or scenario; evidence (a command you ran with its output, or a cited line); the fix you propose. Say what you checked and found sound, too. Write the review to ${SUM}/lane-b-ci-images-digest-review-${file}.md (do not commit). Remove your clone when done.
${SAVE('review-' + file + '.md', 'what you have checked and the findings so far')}`
const [revCi, revSec] = await parallel([
  () => agent(REVIEW('CI and test infrastructure',
    "the fix as GitHub's runner and buildx actually behave: fromJSON(x || '{}') when the build step failed, was skipped, was cancelled, or produced metadata without containerimage.config.digest (does every path reach the step's own error message or skip correctly; the runner evaluates env before if); does BUILDX_METADATA_PROVENANCE: disabled really keep buildx.build.provenance out of the metadata output with the pinned build-push-action (v7.4.0, c3c9e263) and the pinned buildx/BuildKit versions, and does it change anything else (attestations, the pushed image, release.yml's published provenance); do T1–T6 really fail on every regression they claim to guard (try mutating a workflow: re-add METADATA, add a new env value from github.event.*, drop the env from one of the seven steps, add an eighth build-push-action step) and never fail on a harmless change; are T6's bounds and the 131,072 limit arithmetic right (MAX_ARG_STRLEN is per string; the whole env+argv limit is ARG_MAX); the merge with #82's workflows and tools; the documents (ADR 0066 Part 3 notice, ci.md, reconciliation-001) against the code; anything #42's merge (be63bdc2) or ci-findings-transport's later change would trip on (run git merge-tree between the WIP head and be63bdc2).",
    'ci-infra'), { label: 'review:ci-infra', phase: 'Review', schema: FIND }),
  () => agent(REVIEW('security and supply chain, with the checklist in .claude/agents/security-reviewer.md',
    "every way untrusted event content (PR title, body, branch name, commit messages, labels; fork PRs) can still reach a process, a log, an artifact, an env var, a cache key or an image through any workflow at this head (expression injection into run:, env values, with: inputs, GITHUB_ENV/GITHUB_OUTPUT writes); whether disabling metadata provenance weakens the supply chain (release provenance and SBOM attestations, what release.yml publishes and signs, what reviewers or the release runbook rely on); whether the closed allowlist (T6) can be bypassed (a value under a key it does not parse: defaults.run, a composite action, a reusable workflow's with:, matrix values, working-directory, shell, container options, services env); the build-record artifact (P2): retention, who can download it, whether it holds PHI-shaped or secret content (it holds the event, so the PR body); secrets and tokens near the changed steps (GITHUB_TOKEN permissions, persist-credentials); logs: can the event or description reach a log line; PHI rules from CLAUDE.md (no PHI in a job payload, log or error).",
    'security-supply'), { label: 'review:security-supply', phase: 'Review', schema: FIND }),
])
for (const [n, r] of [['ci-infra', revCi], ['security-supply', revSec]]) {
  if (!r || !String(r.reviewText || '').trim()) throw new Error(`review ${n} returned empty text`)
}

// ---------------- Verify each finding ----------------
const VERDICT = { type: 'object', properties: {
  real: { type: 'boolean' }, severity: { type: 'string', enum: ['B', 'S', 'N', 'none'] }, inScope: { type: 'boolean', description: 'fixable in this PR without a migration or a frozen-file change' },
  reason: { type: 'string' }, evidence: { type: 'string' }, betterFix: { type: 'string', description: 'the best fix, if different from the proposed one; else empty' } },
  required: ['real', 'severity', 'inScope', 'reason', 'evidence', 'betterFix'] }
const LENSES = [
  'reproduce it: build the failing scenario for real (mutate a copy of the workflow or test, run the test, read the runner/buildx source or the CI log) and show the output',
  'correctness of the claim: read every cited line and the code around it; is the premise true at this head',
  'severity and scope: if real, is it blocking, should-fix or a nit; is it this PR\'s to fix (no migration, nothing frozen) or a proposal for elsewhere; is the proposed fix the best one',
]
const verify = (f, src) => {
  const n = f.severity === 'N' ? 1 : 3
  return parallel(Array.from({ length: n }, (_, i) => () => agent(`${COMMON}

You are a SKEPTIC. Try to REFUTE this review finding on PR #86 at the WIP head ${mc.wipSha} (fetch refs/heads/${WIP}* from origin into a fresh clone /home/user/vf-imgdigest-${src}-${f.id}-${i}; read only; remove the clone when done). Default to real=false if you cannot show it holds.
Finding (${src}): ${JSON.stringify(f, null, 2)}
Your lens: ${LENSES[i % LENSES.length]}.
Return your verdict with evidence (commands and output, or cited lines).`, { label: `verify:${src}:${f.id}:${i}`, phase: 'Verify', schema: VERDICT })))
    .then(vs => {
      const ok = vs.filter(Boolean)
      const yes = ok.filter(v => v.real)
      const real = n === 1 ? yes.length === 1 : yes.length >= 2
      return { ...f, source: src, real, verdicts: ok }
    })
}
phase('Verify')
const judged = await parallel([
  ...revCi.findings.map(f => () => verify(f, 'ci-infra')),
  ...revSec.findings.map(f => () => verify(f, 'security-supply')),
])

// ---------------- Completeness critic (loop until dry, max 2 rounds) ----------------
phase('Critic')
const allJudged = judged.filter(Boolean)
const seen = new Set(allJudged.map(f => (f.where + '|' + f.title).toLowerCase()))
let dry = 0
for (let round = 1; round <= 2 && dry < 1; round++) {
  const crit = await agent(`${COMMON}

You are the COMPLETENESS CRITIC for PR #86's reviews at the WIP head ${mc.wipSha}. Two adversarial reviews ran (CI and test infrastructure; security and supply chain) and every finding was put to skeptics. Here is what they produced:
=== CI REVIEW ===
${revCi.reviewText}
=== SECURITY REVIEW ===
${revSec.reviewText}
=== FINDINGS AND VERDICTS ===
${JSON.stringify(allJudged.map(f => ({ id: f.id, source: f.source, severity: f.severity, title: f.title, where: f.where, real: f.real })), null, 2)}
=== MERGE CHECK ===
${JSON.stringify(mc)}
Ask what is missing: a changed file or hunk no one read (git diff --stat bce57f16 ${mc.wipSha} in a fresh clone /home/user/critic-imgdigest-${round}, read only, removed after), a claim in the documents or the design that no one checked against the code, a CI run or log not read, a regression mode of T1–T6 not tried, an interaction with #42 (be63bdc2) or with the other open Lane B branches (git ls-remote origin 'refs/heads/co-001/*') not checked. Check each gap yourself. Return only NEW real findings (not already in the list), in the review schema; reviewText is your note of what you checked.
${SAVE('critic-' + round + '.md', 'the gaps checked and what each showed')}`, { label: `critic:${round}`, phase: 'Critic', schema: FIND })
  if (!crit) break
  const fresh = crit.findings.filter(f => !seen.has((f.where + '|' + f.title).toLowerCase()))
  if (!fresh.length) { dry++; log(`critic round ${round}: nothing new`); continue }
  fresh.forEach(f => seen.add((f.where + '|' + f.title).toLowerCase()))
  log(`critic round ${round}: ${fresh.length} new finding(s); verifying`)
  const more = await parallel(fresh.map(f => () => verify({ ...f, id: 'C' + round + '-' + f.id }, 'critic')))
  allJudged.push(...more.filter(Boolean))
}

const confirmed = allJudged.filter(f => f.real)
const refuted = allJudged.filter(f => !f.real)
log(`${confirmed.length} confirmed, ${refuted.length} refuted`)
return { wipSha: mc.wipSha, mergeSound: mc.sound, mergeIssues: mc.issues, mergeReport, confirmed, refuted: refuted.map(f => ({ id: f.id, source: f.source, title: f.title, why: f.verdicts.map(v => v.reason) })), ciSound: revCi.sound, secSound: revSec.sound }
