export const meta = {
  name: 'lane-b-dependabot-batch-reviews',
  description: 'Two adversarial reviews of one dependabot-batch PR in fresh clones (CI/test infrastructure; security/supply chain), skeptic per finding, completeness critic, loop until dry',
  phases: [
    { title: 'Review', detail: 'two reviewers in fresh clones' },
    { title: 'Verify', detail: 'a skeptic per B/S finding' },
    { title: 'Critic', detail: 'what the reviews missed; a second round if anything new' },
    { title: 'Record', detail: 'write the two review records' },
  ],
}

const P = args
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/review-' + P.key
const DESIGN = '/home/user/ops/designs/lane-b-dependabot-batch.md'

const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. You review PR ${P.key} of the Lane B item "dependabot-batch" (Dependabot #87, #88, #89 taken as the build's own PRs): PR #${P.pr}, branch ${P.branch}, head ${P.head}, base claude/build-platform ${P.base}. ${P.what}
The design is ${DESIGN} (section 1 decisions; ${P.sections}; section 8 the PR plan; the final "Review of the design" section). The builder/integrator report: ${P.report}

Rules for you:
- READ ONLY on GitHub: never push, comment, review, approve or merge; use the GitHub MCP read tools (pull_request_read get/get_files/get_check_runs, get_job_logs with return_content and a large tail_lines) and git fetch.
- Work in a fresh clone of your own: git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git ${SP}/clone-<your-label> && git -C <it> checkout ${P.head}. Remove it when done.
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Heavy commands (pnpm install, typecheck, tests, synth) only under flock /tmp/laneb-heavy.lock <command>.
- Every download goes in its own new empty directory under ${SP}/tmp, treated as untrusted.
- Synthetic data only. No model name or model identifier in anything you write.
- Cite file:line at ${P.head} or a command with its output and UTC time for every claim; say "not verified" where you could not check.
- Improve as you go: an improvement inside the PR's files is a finding (S or N) with its fix; one outside is a proposal in your notes.
- Long commands: run_in_background and wait; no long foreground sleep.`

const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}). If it exists when you start, continue from it.`

const FINDINGS = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, severity: { type: 'string', enum: ['B', 'S', 'N'] }, title: { type: 'string' },
      where: { type: 'string', description: 'file:line' }, scenario: { type: 'string', description: 'concrete failing input or scenario' },
      evidence: { type: 'string' }, fix: { type: 'string' },
    }, required: ['id', 'severity', 'title', 'where', 'scenario', 'evidence', 'fix'] } },
    sound: { type: 'string', description: 'what you checked and found sound' },
    proposals: { type: 'string' },
  },
  required: ['findings', 'sound', 'proposals'],
}
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' }, correctedFix: { type: 'string' } }, required: ['real', 'reason'] }

const LENSES = [
  { key: 'ci-infra', label: 'CI and test infrastructure', focus: `CI and TEST INFRASTRUCTURE. Read CI on the head (every check run; the four required checks: all green, mutation, screening-capacity gate, approval-of-record; the Stryker selection; the cdk:diff step for infra) and the job logs of anything red or surprising. Are the new tests real (would they fail if the change were reverted? run them against a reverted copy), deterministic, in the right Vitest project, counted where the test matrix and synth registry say? Do test-matrix rows, packages/synth matrix.ts/registry.ts and fixtures/synthetic agree (pnpm synth --all leaves the clone clean)? Is the lockfile what pnpm install --lockfile-only produces (regenerate and diff)? Are watched-paths.txt, the screening-capacity gate and the mutation selection right for these files? Does anything here break the CI series' rules (ADR 0066) or the runbooks (dependency-upgrades.md, ci.md)? Does the PR description match the code, counts and template (every section)? ${P.ciExtra || ''}` },
  { key: 'security-supply', label: 'security and supply chain', focus: `SECURITY and SUPPLY CHAIN, with .claude/agents/security-reviewer.md's lens. Every version added to the lockfile (direct and transitive): publish time and age (3-day floor), provenance and publisher, licence, install scripts, new maintainers, deprecations; pnpm toolchain:check and licenses:check on the head (BASE=origin/claude/build-platform). Any new outbound call, telemetry or header the change brings, and whether it is off. Any path where PHI, document text, prompts or responses could leave the process or reach a log or span. Tenant isolation and logging rules (CLAUDE.md "Never" list). ${P.secExtra || ''}` },
]

const seen = new Set()
const confirmed = []
const allRefuted = []
const sounds = {}
let round = 0
let dry = 0
let extra = ''
while (dry < 1 && round < 3) {
  round++
  phase('Review')
  const found = await parallel(LENSES.map(l => () => agent(`${COMMON}

You are the ADVERSARIAL REVIEWER for ${l.label} (round ${round}). Your focus: ${l.focus}
${extra}
Find real defects, not style. For each: B (blocking), S (should fix) or N (nit), file:line, a concrete failing scenario, evidence and the fix.
${SAVE(`${l.key}-r${round}.progress.md`, 'findings so far')}`, { label: `review:${l.key}:r${round}`, phase: 'Review', schema: FINDINGS }).then(r => r ? { ...r, lens: l.key } : null)))
  const fresh = []
  for (const r of found.filter(Boolean)) {
    sounds[r.lens] = (sounds[r.lens] || '') + `\n(round ${round}) ` + r.sound + (r.proposals ? `\nProposals: ${r.proposals}` : '')
    for (const f of r.findings) {
      const k = (f.where + '|' + f.title).toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      fresh.push({ ...f, id: `${r.lens}-r${round}-${f.id}`, lens: r.lens })
    }
  }
  if (!fresh.length) { dry++; log(`round ${round}: nothing new`); break }
  log(`round ${round}: ${fresh.length} new findings`)
  phase('Verify')
  const judged = await parallel(fresh.map(f => () => (f.severity === 'N'
    ? Promise.resolve({ ...f, verdict: { real: true, reason: 'nit, not verified; the fix round checks it' } })
    : agent(`${COMMON}

Try to REFUTE this review finding on PR #${P.pr} at ${P.head}. Check it yourself in a fresh clone (or read-only with git show ${P.head}:<path> from /home/user/PhysicalTherapy after git fetch origin ${P.branch}). Real only if you confirm it; if real but the fix is wrong or not the best option, give correctedFix.
${JSON.stringify(f, null, 1)}`, { label: `verify:${f.id}`, phase: 'Verify', schema: VERDICT }).then(v => ({ ...f, verdict: v })))))
  for (const j of judged.filter(Boolean)) (j.verdict && j.verdict.real ? confirmed : allRefuted).push(j)

  phase('Critic')
  const crit = await agent(`${COMMON}

You are the COMPLETENESS CRITIC after review round ${round}. The reviews so far found (confirmed):
${JSON.stringify(confirmed.map(f => ({ id: f.id, severity: f.severity, title: f.title, where: f.where })), null, 1)}
and checked as sound:
${JSON.stringify(sounds, null, 1)}
What did they NOT look at? A changed file not read, a check not run, a version not aged, a claim in the PR description not verified, a design decision not checked against the code, a CI job not read. Return a short list of concrete unchecked areas (empty if none worth a round). Do not review them yourself.`, { label: `critic:r${round}`, phase: 'Critic', schema: { type: 'object', properties: { gaps: { type: 'array', items: { type: 'string' } } }, required: ['gaps'] } })
  const gaps = (crit && crit.gaps) || []
  if (!gaps.length) { log(`round ${round}: critic found no gap`); break }
  extra = `This is a follow-up round. Look ONLY at these unchecked areas the completeness critic named (earlier findings are already recorded; do not repeat them):\n- ${gaps.join('\n- ')}`
}

phase('Record')
const rec = await agent(`${COMMON}

Write the two review records for PR #${P.pr} (do not commit them): /home/user/ops/approval-summaries/lane-b-dependabot-batch-${P.key}-review-ci-infra.md and /home/user/ops/approval-summaries/lane-b-dependabot-batch-${P.key}-review-security-supply.md, modelled on /home/user/ops/approval-summaries/lane-b-ci-pin-age-review-ci-infra.md and -review-security-supply.md (read them). Each: the PR, head, date (run date -u), the reviewer's lens, what was checked and found sound, the findings numbered B/S/N with where, scenario, evidence, fix and the skeptic's verdict, the refuted ones with the reason, and proposals. Shorten any non-commit 64-hex digest to 8 hex and an ellipsis.
Confirmed findings: ${JSON.stringify(confirmed, null, 1)}
Refuted: ${JSON.stringify(allRefuted, null, 1)}
Sound: ${JSON.stringify(sounds, null, 1)}
Return a one-paragraph summary with totals per lens and per severity, and the list of confirmed B and S findings (id, title, fix).`, { label: 'record', phase: 'Record' })

return { rounds: round, confirmed, refuted: allRefuted.map(f => ({ id: f.id, reason: f.verdict && f.verdict.reason })), record: rec }