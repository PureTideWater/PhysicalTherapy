export const meta = {
  name: 'lane-b-ci-findings-transport-merge-review',
  description: 'ci-findings-transport: merge the base (with #86 final and #96) into the WIP and push it, then two adversarial reviews of the merged diff, three skeptics per finding, a completeness critic',
  phases: [
    { title: 'Merge', detail: 'base merge into the WIP ref, #86 final value rule kept, the transport applied to it; tests; push WIP' },
    { title: 'Review', detail: 'CI and test infrastructure; security and supply chain; fresh clones' },
    { title: 'Verify', detail: 'three skeptics per finding' },
    { title: 'Critic', detail: 'what the reviews missed' },
  ],
}
const SUM = '/home/user/ops/approval-summaries'
const PROG = `${SUM}/lane-b-ci-findings-transport-wip/progress`
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/cft'
const WT = '/home/user/ci-findings-transport'
const WIP = 'co-001/wip-ci-findings-transport'
const SESSION = 'https://claude.ai/code/session_019i9ifDkvaQzK4YgTGnKWC3'
const SAVE = (f, w) => `Save as you go: keep ${PROG}/${f} up to date (${w}); mkdir -p it. If it exists when you start, an earlier run was interrupted: read it, check git status and log, and continue.`
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. You work for the acting Lane B session S3 that owns the item ci-findings-transport (no PR yet; WIP ref ${WIP}, built at b9a83bd3 on top of #86's fix-round head d257fe6d). The item: the content calendar's check job hands its findings to notify through a job output (FINDINGS_B64), which can exceed Linux's 131,072-byte environment string and GitHub's 1 MB job output; the design moves them through the run's own artifact (check uploads findings.json with the repository's existing upload-artifact pin; notify and a new pull-request-only handoff job read it with gh run download, three tries with a timeout, size refused past the bound; notify's permissions exactly actions: read and issues: write, still no uses:, no checkout, no repository code), MAX_FILE_BYTES 700,000 → 2,000,000, MAX_TITLE 256, MAX_LISTED 200; ADR 0071 amended, ADR 0066 Part 3's N32 sentence edited, ci.md, content-updates.md, reconciliation-001; RCC-08's assertion. Read: the status file ${SUM}/lane-b-ci-findings-transport-status.md (RESUME-BLOCK), the design /home/user/ops/designs/lane-b-ci/ci-findings-transport.md (§16 "Re-read at d257fe6d" governs) and its review, the build summary ${SUM}/lane-b-ci-findings-transport-build-summary.md, the item prompt /home/user/ops/lanes/lane-b-item-prompts-2026-11-01/ci-findings-transport.md, and #86's hand-over (${SUM}/lane-b-ci-images-digest-status.md, the "MERGED" block): #86's notice is ADR 0066 Part 3 N32; the sentence to rewrite starts "One listed value is over the limit" (ADR 0066:1205 at 24531dc2); the T6 rows are the two findings rows (FINDINGS_B64 with over: 'ci-findings-transport', and their sites lists) and the over-98,292-bytes bound.
The base claude/build-platform is now 30871f72 or later: #86 merged as 24531dc2 (its final value rule: T3–T6 with structural citations, run: fingerprints over inherited env, the per-string byte sum, the over row exempt only alone in its string with exact sites, closed $GITHUB_ENV/$GITHUB_PATH writes including #107's TRIVY_CMD and trivy-bin, a repository scan of file-command names), #107 (the pinned Trivy), #96 (P4, mutation trigger) as 30871f72, and others. GitHub enforces the up-to-date rule.
Rules: every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Heavy commands (pnpm install, typecheck, lint, vitest, builds, test:db, e2e, stryker, synth) only under flock /tmp/laneb-heavy.lock (shared with other sessions: batch under one hold; long ones with run_in_background). PostgreSQL 18 on 5433. Synthetic data only; no PHI; no model name or identifier in any file or commit. Shorten hashes in approval-summaries and design files to 8 hex and an ellipsis. Never force, never --no-verify, never amend/rebase a pushed commit, never a .gitleaksignore entry; never write through the GitHub connector; never comment, review, approve, open or edit a PR, mark ready or merge. Generated files only by their generators (pnpm install --frozen-lockfile; pnpm exec tsx tools/screening-capacity/watched.ts --write; pnpm synth --all). No migration. Logs under ${SP}/logs/ (mkdir -p).`
const COMMIT_TAIL = `Commit messages in the repository's style (git log), one concern per commit, each ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}`

phase('Merge')
const merge = await agent(`${COMMON}

YOUR TASK: bring the WIP up to the base. ${SAVE('merge.md', 'each step, conflict, resolution and check')}
1. In ${WT} (on ${WIP} at b9a83bd3; git fetch origin ${WIP} claude/build-platform; confirm HEAD = origin/${WIP}): git merge --no-ff origin/claude/build-platform -m "Merge claude/build-platform <short> (<PRs from git log --merges --first-parent b9a83bd3..origin/claude/build-platform, those not already in d257fe6d>) into co-001/ci-findings-transport". The merge commit only resolves; keep both sides (rule 6) in shared documents (ADR 0066, ADR 0071, reconciliation-001, ci.md, content-updates.md, test-matrix, synth matrix and registry).
2. tools/test/workflows.test.ts and the content-calendar workflow are the hard part: #86's final value rule is the base's; this branch was written against #86's earlier d257fe6d form. Resolve so the result is #86's final rule with this item's change applied to it, exactly as the design says: the content calendar's FINDINGS_B64 no longer passes through a job output or env, so its two over/sites rows and the over-limit exemption that exists only for it go (only if no other value uses the exemption; if the design keeps the mechanism, keep it), the new values (artifact name, run id, the download step's script, the new handoff job) are bounded rows with structural refs and fingerprints as #86's rule requires, any $GITHUB_ENV / $GITHUB_PATH write is on #86's closed lists, and nothing of #86's rule is loosened. If the merge leaves this branch's own test edits inconsistent with #86's final code, fix them in a separate commit after the merge (not inside it), each with red/green evidence.
3. ADR 0066 N32's "What holds it" sentence starting "One listed value is over the limit": rewrite it per the design (no value is over the limit now; say how the findings travel), in a separate commit if the merge did not already. Check the ADR's notice numbers stay unique.
4. Generators under the lock; commit what they write. Then under one lock hold: typecheck, lint, lint:copy, lint:logs, check:fixtures, the whole tools/test/workflows.test.ts, vitest --project unit tools/test tools/content-calendar (and any test the branch touched), actionlint, actions:check --offline. Fix what this branch causes.
5. git push origin HEAD:refs/heads/${WIP} (fast-forward; the hook). Never push co-001/ci-findings-transport.
${COMMIT_TAIL}
Return: the new WIP head, the merge commit and what it brought, every conflict and its resolution, the follow-up commits, the check results, and the diff stat against the base.`, { label: 'merge', phase: 'Merge' })
if (!merge || !String(merge).trim()) throw new Error('merge agent returned nothing')

const FIND = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: {
  id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should', 'nit'] }, title: { type: 'string' }, where: { type: 'string' }, scenario: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } },
  required: ['id', 'severity', 'title', 'where', 'scenario', 'evidence', 'fix'] } }, summary: { type: 'string' } }, required: ['findings', 'summary'] }
const VERDICT = { type: 'object', properties: { refuted: { type: 'boolean' }, severity: { type: 'string', enum: ['blocking', 'should', 'nit', 'none'] }, reason: { type: 'string' }, refinedFix: { type: 'string' } }, required: ['refuted', 'severity', 'reason', 'refinedFix'] }
const REVIEWERS = [
  { key: 'ci-infra', file: `${SUM}/lane-b-ci-findings-transport-review-ci-infra.md`, lens: `CI and test infrastructure: does the artifact transport always deliver every finding or fail loudly into "Content calendar check failing" (retention, overwrite, run id, attempt reruns, name collisions, concurrency, a cancelled or skipped check, the size bound, the timeout and retry block, a partial download, gh's exit codes, the handoff job on pull requests and the push run after the merge); are the bounds right in bytes (2,000,000, 41 findings, 37,575 per entry, MAX_TITLE, MAX_LISTED) and does #86's value rule hold the new workflow with real bounds; do the tests prove behaviour (mutate the workflow and the tool code and see a test go red); flakiness and runtime; docs match code.` },
  { key: 'security-supply', file: `${SUM}/lane-b-ci-findings-transport-review-security-supply.md`, lens: `security and supply chain, with the checklist in .claude/agents/security-reviewer.md where it applies: notify and handoff hold an issues: write or actions: read token, so check what reaches them (the artifact's content comes from the calendar check of possibly a pull request's content: injection into gh issue create arguments, titles, bodies, labels, workflow commands in logs; a pull request that writes an artifact of the same name; artifact poisoning from another run or a fork; TOCTOU between the size check and the read), the permissions exactly as the design says and nothing more, no uses: and no checkout in notify, the upload-artifact pin (no new pin; #82's age floor), the handoff job's trigger and token, what the artifact exposes publicly (the repository is public: retention 1 day, contents), and that nothing of #86's value rule was loosened in the merge.` },
]
phase('Review')
const reviews = await pipeline(REVIEWERS,
  r => agent(`${COMMON}

The merge stage's report: ${merge}
You are an ADVERSARIAL REVIEWER of ci-findings-transport through the lens of ${r.lens}
Fresh clone: git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git /home/user/rv-cft-${r.key}; fetch ${WIP} and claude/build-platform; check out the WIP head the merge report names (it must equal origin/${WIP}); install under the lock. The change is git diff $(git merge-base HEAD origin/claude/build-platform) HEAD. Prove every finding with a command, a mutated fixture or a scenario you ran; no evidence, no finding. Classify blocking / should / nit. Write your review to ${r.file} (findings with evidence and the recommended fix; what you checked and found sound). Remove your clone. ${SAVE('review-' + r.key + '.md', 'what you checked, each finding')}`, { label: `review:${r.key}`, phase: 'Review', schema: FIND }),
  (rev, r) => {
    if (!rev) throw new Error(`review ${r.key} returned nothing`)
    return parallel(rev.findings.map(f => () => parallel([0, 1, 2].map(k => () => agent(`${COMMON}

You are SKEPTIC ${k + 1} of 3 for one finding of ci-findings-transport's ${r.key} review. Try to REFUTE it: reproduce it in a fresh clone /home/user/sk-cft-${r.key}-${f.id}-${k} at origin/${WIP} (read only; remove it after), or show it is not real, not reachable or already handled. Default to refuted=true if you cannot reproduce it. If real, give your severity and the safest correct fix.
Finding: ${JSON.stringify(f)}
${SAVE('skeptic-' + r.key + '-' + f.id + '-' + k + '.md', 'your reproduction and verdict')}`, { label: `skeptic:${r.key}:${f.id}:${k}`, phase: 'Verify', schema: VERDICT })))
      .then(vs => { const ok = vs.filter(Boolean); return { ...f, reviewer: r.key, verdicts: ok, confirmed: ok.filter(v => !v.refuted).length >= 2 } })))
      .then(fs => ({ reviewer: r.key, summary: rev.summary, findings: fs }))
  })
if (reviews.some(r => !r)) throw new Error('a review leg failed; resume this run')
phase('Critic')
const critic = await agent(`${COMMON}

You are the COMPLETENESS CRITIC over ci-findings-transport's two reviews: ${JSON.stringify(reviews)}
Read the review files and the diff in a fresh clone /home/user/rv-cft-critic at origin/${WIP} (read only; removed after). Ask what was missed: a path in the transport no one attacked (the push run after merge, a re-run attempt, a schedule run with no findings, an empty or huge findings file at exactly the bounds), a claim in the design or the build summary no one checked, a test that stays green under a mutation of the code it guards (try a few), a doc that disagrees with code, the merge's resolution of #86's value rule (anything loosened?), and #96's mutation.yml or #107's Trivy steps interacting with the new rows. Prove each gap; classify. ${SAVE('critic.md', 'what you checked, each gap')}`, { label: 'critic', phase: 'Critic', schema: FIND })
return { merge, reviews, critic }
