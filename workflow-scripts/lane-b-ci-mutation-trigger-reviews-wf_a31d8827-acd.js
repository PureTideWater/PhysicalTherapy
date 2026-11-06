export const meta = {
  name: 'lane-b-ci-mutation-trigger-reviews',
  description: '#96 P4: two adversarial reviews (CI tooling and security; payment engine), three skeptics per finding, a completeness critic; read only',
  phases: [
    { title: 'Review', detail: 'two reviewers in fresh clones at 50029e64' },
    { title: 'Verify', detail: 'three skeptics per finding, each trying to refute' },
    { title: 'Critic', detail: 'what the reviews missed' },
  ],
}

const SUM = '/home/user/ops/approval-summaries'
const PROG = '/home/user/ops/approval-summaries/lane-b-ci-mutation-trigger-wip/progress'
const LOGS = '/tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/p4/logs'
const HEAD = '50029e649c286fbf322e17b24ba554845cc5bd2f'
const SAVE = (file, what) => `Save as you go: keep ${PROG}/${file} up to date (${what}); mkdir -p it. If it already exists, an earlier run was interrupted: read it and continue from where it stopped.`
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. You work for the acting Lane B session S3 that owns PR #96, CI follow-up P4, ci-mutation-trigger (branch co-001/ci-mutation-trigger, head ${HEAD.slice(0, 8)}, draft, base claude/build-platform; built, local checks green, reviews never run). It narrows when the required \`mutation\` check runs Stryker: tools/stryker/manifests.ts classifies package.json / pnpm-workspace.yaml / mutation.yml changes field by field, failing closed; a step-SHA-only change runs RUNNER_PROOF_SHARD (money-ledger) alone; every shard is held to pinned Node/Unicode/ICU/pnpm and the tested commit; Stryker runs by path (tools/stryker/stryker.ts, runtime.ts, gate.ts, canary/verdict.ts, affected.ts, workspace.ts); mutation.yml gains a runtime step. ADR 0066 Part 7, notices N43–N50; test matrix CI-27–CI-29. Read the PR description (pull_request_read get, #96) for the full claim list, and the design designs/lane-b-ci/follow-up-p4-mutation-trigger.md (§14, §15 govern) and its review in /home/user/ops. Status: ${SUM}/lane-b-ci-deps-status.md.
Why it matters: mutation is the required check guarding the money packages (pricing, ledger, packets, money). A classifier that says "none" or "money-ledger only" wrongly lets a money-affecting change merge without its mutation run: that is the central risk.
Rules: read only; never push, comment, review, approve or edit anything on GitHub; no file written outside ${PROG}, your review file and ${LOGS}. Every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Heavy commands (pnpm install, vitest, typecheck, stryker) only under flock /tmp/laneb-heavy.lock. No PHI; no model identifier in any file. Shorten hashes in files to 8 hex and an ellipsis.`

const FIND = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: {
  id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should', 'nit'] }, title: { type: 'string' }, where: { type: 'string' }, scenario: { type: 'string', description: 'concrete change or input and the wrong outcome' }, evidence: { type: 'string' }, fix: { type: 'string' } },
  required: ['id', 'severity', 'title', 'where', 'scenario', 'evidence', 'fix'] } }, summary: { type: 'string' } }, required: ['findings', 'summary'] }
const VERDICT = { type: 'object', properties: { refuted: { type: 'boolean' }, severity: { type: 'string', enum: ['blocking', 'should', 'nit', 'none'] }, reason: { type: 'string' }, refinedFix: { type: 'string' } }, required: ['refuted', 'severity', 'reason', 'refinedFix'] }

const REVIEWERS = [
  { key: 'ci-tooling-security', file: `${SUM}/lane-b-ci-mutation-trigger-review-ci-tooling-security.md`, lens: `CI tooling and security, with the checklist in .claude/agents/security-reviewer.md where it applies and the supply-chain view: the classifier's fail-closed claims (try to build a manifest, workspace or mutation.yml change that the classifier calls inert or pin-only but which changes what a shard runs or loads: lifecycle scripts, overrides, pnpm settings, catalogs, aliases, YAML tricks, path tricks, renames, symlinks, a new workspace package, an action whose SHA move changes behaviour), stryker.ts's resolution (a planted @stryker-mutator/core, NODE_PATH, a parent node_modules), runtime/commit pinning bypasses, gitEnvironment, the guard scan, mutation.yml's permissions and expressions, injection via printed paths, and the tests' strength (mutate the code and see if a test goes red).` },
  { key: 'payment-engine', file: `${SUM}/lane-b-ci-mutation-trigger-review-payment-engine.md`, lens: `the payment engine's protection (ci-mutation's precedent): for each money package (packages/money, pricing, ledger, packets) and each shard in stryker/shards.json, find a realistic change (a dependency bump a money closure imports, a catalog line, a tsconfig, a vitest config, a shared helper, a test-support file, an equivalent-mutant file, a Stryker config) that should run that shard but under P4 runs none or fewer; check RUNNER_PROOF_SHARD's money-ledger proof is enough for a step-SHA-only change; check the 85% gate and the equivalents logic are not weakened; replay a few real merged PRs through affected() at the head vs the base. Note #84 (co-001/packet-day-counts or the live branch for PR #84) splits packets shards (packets-roles, packets-words) and overlaps tools/stryker/{affected,shards}.test.ts: say what P4 must do at its base merge.` },
]

phase('Review')
const reviews = await pipeline(REVIEWERS,
  r => agent(`${COMMON}

You are an ADVERSARIAL REVIEWER of #96 through the lens of ${r.lens}
Work in a fresh clone: git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git /home/user/rv-p4-${r.key}; git fetch origin co-001/ci-mutation-trigger claude/build-platform; check out ${HEAD} (confirm it equals origin/co-001/ci-mutation-trigger); flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile. The diff is git diff $(git merge-base HEAD origin/claude/build-platform) HEAD. Prove every finding with a command, a mutated fixture or a failing scenario you ran; a finding without evidence is not a finding. Classify blocking / should / nit. Write your review to ${r.file} (findings with evidence and recommended fix; what you checked and found sound). Remove your clone at the end. ${SAVE('review-' + r.key + '.md', 'what you checked, each finding')}`, { label: `review:${r.key}`, phase: 'Review', schema: FIND }),
  (rev, r) => {
    if (!rev) throw new Error(`review ${r.key} returned nothing`)
    return parallel(rev.findings.map(f => () => parallel([0, 1, 2].map(k => () => agent(`${COMMON}

You are SKEPTIC ${k + 1} of 3 for one finding of #96's ${r.key} review. Try to REFUTE it: reproduce it yourself in a fresh clone /home/user/sk-p4-${r.key}-${f.id}-${k} at ${HEAD} (read only; remove it after), or show why it is not real, not reachable, or already handled. Default to refuted=true if you cannot reproduce it. If it is real, give the severity you would assign and refine the fix (the safest correct one).
Finding: ${JSON.stringify(f)}
${SAVE('skeptic-' + r.key + '-' + f.id + '-' + k + '.md', 'your reproduction and verdict')}`, { label: `skeptic:${r.key}:${f.id}:${k}`, phase: 'Verify', schema: VERDICT })))
      .then(vs => { const ok = vs.filter(Boolean); return { ...f, reviewer: r.key, verdicts: ok, confirmed: ok.filter(v => !v.refuted).length >= 2 } })))
      .then(fs => ({ reviewer: r.key, summary: rev.summary, findings: fs }))
  })

if (reviews.some(r => !r)) throw new Error('a review leg failed; resume this run')

phase('Critic')
const critic = await agent(`${COMMON}

You are the COMPLETENESS CRITIC over #96's two reviews. Their results (with skeptics' verdicts): ${JSON.stringify(reviews)}
Read the review files and the diff (fresh clone /home/user/rv-p4-critic at ${HEAD}, read only, removed after). Ask what was missed: a classifier branch no one attacked, a claim in the PR description no one checked, a test that would stay green under a mutation of the code it guards (try a few), a doc that disagrees with code, a merge-order hazard with #86 (co-001/ci-images-digest, whose tools/test/workflows.test.ts adds a closed allowlist of values that reach a process and run: fingerprints, so mutation.yml's new runtime step must satisfy T3/T6 after the merge: check it on a trial merge of origin/co-001/wip-ci-images-digest with ${HEAD}, CI_TREE, workflows.test.ts) and #84. Prove each gap with evidence; classify blocking / should / nit. ${SAVE('critic.md', 'what you checked, each gap')}`, { label: 'critic', phase: 'Critic', schema: FIND })
return { reviews, critic }
