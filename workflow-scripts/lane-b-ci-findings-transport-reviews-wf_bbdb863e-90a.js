export const meta = {
  name: 'lane-b-ci-findings-transport-reviews',
  description: 'ci-findings-transport: two adversarial reviews in fresh clones (CI and test infrastructure; security and supply chain) on the WIP diff, each finding checked by two skeptics',
  phases: [
    { title: 'Review', detail: 'CI and test infrastructure; security and supply chain' },
    { title: 'Verify', detail: 'two skeptics per finding' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/5f876a7c-a55b-5a96-9dbf-94dcd8222a6b/scratchpad'
const OUT = SP + '/findings-transport-reviews'
const HEAD = 'b9a83bd34bb6eba0f9afab4653132cee8823a826'
const BASE = 'd257fe6d8ec8e3a1410b6ac77e6f94ce3962b679'
const SAVE = (file, what) => `Save as you go: keep ${OUT}/progress/${file} up to date (${what}). If it exists when you start, an earlier run of yours was interrupted: read it, trust it unless the code says otherwise, and continue.`
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy (public); CLAUDE.md is in your context. Item ci-findings-transport: the content calendar's findings reached notify as one environment variable (FINDINGS_B64, up to 933,336 characters, over Linux's 131,072-byte limit per string, so any findings file over 98,292 bytes stopped notify before bash). The change: check uploads findings.json as the run's own artifact (existing upload-artifact pin), notify and a new pull-request-only handoff job read it with gh run download in three tries each bounded by timeout, capped at MAX_FILE_BYTES 2,000,000; notify's permissions { actions: read, issues: write }; render.ts bounds (MAX_TITLE, MAX_LISTED, the summary written before the file's bound); tests in tools/content-calendar and tools/test/workflows.test.ts; ADR 0071 amended, ADR 0066 N32, ci.md, content-updates.md, reconciliation-001, RCC-08. The branch is the WIP ref co-001/wip-ci-findings-transport at ${HEAD}, cut at ${BASE} = #86's fix-round WIP (co-001/wip-ci-images-digest; #86 has not merged; after it merges this becomes co-001/ci-findings-transport and a PR). Review the diff ${BASE.slice(0, 8)}..${HEAD.slice(0, 8)} only (#86's own changes are not this review's). The design: /home/user/ops/designs/lane-b-ci/ci-findings-transport.md (§16 governs on this head; §4 the choice; §15 its review), the build summary /home/user/ops/approval-summaries/lane-b-ci-findings-transport-build-summary.md. No PR exists yet, so there is no CI run on this head; the pull-request run (handoff) and the merge's push run (notify) are the runs of record later.
Rules for you:
- Work in a FRESH CLONE of your own (git clone https://github.com/PureTideWater/PhysicalTherapy <dir>; git -C <dir> checkout --detach ${HEAD}); install with flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile; never change /home/user/PhysicalTherapy, /home/user/ci-findings-transport or /home/user/ops except your report file. Never commit, push, comment, review or trigger a workflow. Remove your clone when done.
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Heavy commands only under flock /tmp/laneb-heavy.lock. At most these two reviews run heavy commands at once.
- Synthetic data only. No model name or identifier in anything you write.
- A finding names file:line at the head, evidence (a command you ran with its output, or a quote), a concrete failure scenario, and the fix. Severity: blocking, should-fix, nit. Real defects, not style. Say what you checked and found sound.
- Improve as you go: a better option goes in as a finding with its reason.
- Long commands: run_in_background and wait; no long foreground sleep.`
const FINDINGS = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    findings: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, title: { type: 'string' },
      where: { type: 'string' }, evidence: { type: 'string' }, scenario: { type: 'string' }, fix: { type: 'string' },
      confidence: { type: 'string', enum: ['reproduced', 'verified-by-reading', 'plausible'] },
    }, required: ['id', 'severity', 'title', 'where', 'evidence', 'scenario', 'fix', 'confidence'] } },
    notChecked: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'findings', 'notChecked'],
}
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' }, betterFix: { type: 'string' } }, required: ['real', 'reason'] }
const REVIEWS = [
  { key: 'ci-infra', id: 'CI', prompt: `You are the CI AND TEST-INFRASTRUCTURE REVIEW. Fresh clone at /home/user/review-cft-ci. Check adversarially: does the workflow work on GitHub-hosted runners for schedule, push, dispatch, pull request and re-runs (attempts: does gh run download pick the right artifact on a re-run of only notify; overwrite: true; retention-days 1 vs a re-run a day later; if-no-files-found; the artifact's zip and gh's extraction path; RUNNER_TEMP; gh's version on ubuntu-26.04 and its run download flags; the timeout -k 10 60 wrapper with gh; the three tries and pauses within timeout-minutes; concurrency cancel-in-progress on pull_request with handoff); does handoff run on pull requests from forks (read-only token: does actions: read still apply) and on Dependabot PRs; do the tests test what they claim (could any pass vacuously; T-E's E2BIG really reproduces the defect; T-H's word-for-word equality; T-P/T-K's numbers recompute; notifyEnv and runNotify's fakes match real gh behaviour and exit codes); is TEST_TIMEOUT_MS 45 s right and does the Dependabot rewrite simulation stay within its own limits; the runner count, CI-10, jobs list; the docs true to the code. Run under the lock: pnpm exec vitest run --project unit tools/content-calendar tools/test packages/synth; pnpm typecheck; pnpm lint; actionlint -shellcheck= -pyflakes= -ignore 'label "ubuntu-26\\\\.04" is unknown' .github/workflows/*.yml; shellcheck on the notify/handoff scripts extracted from the yml if shellcheck exists.` },
  { key: 'security-supply', id: 'SEC', prompt: `You are the SECURITY AND SUPPLY-CHAIN REVIEW (.claude/agents/security-reviewer.md's lens). Fresh clone at /home/user/review-cft-sec. Check adversarially: notify's and handoff's permissions (least privilege; actions: read's blast radius on a public repository; that no other job gains a permission; the workflow-level contents: read); no uses:, no checkout, no repository code, no \${{ in run:, every value through env, in notify and handoff; the artifact: can a pull request (same repo or fork) or another workflow put an artifact named findings into a run notify reads (notify never runs on pull_request; GITHUB_RUN_ID; workflow_run? attempts), can a malicious findings.json reach shell injection, path traversal on gh's zip extraction, a symlink, a huge file (the cap, measured before or after extraction? zip bomb), JSON with control characters into issue titles/bodies (gh issue create --title "$(cat title.txt)"), markdown/mention injection (@-mentions or links in bodies on a public repo), the "not filed" list; the artifact's content is public for a day: does anything beyond ADR 0071 Q1's public references reach it (no PHI, no secret, no token); the upload-artifact pin is the existing one (same SHA as elsewhere; #82's floor not met); timeout/kill semantics leaving no partial file that is then trusted; fail-closed everywhere into "check failing". Run what you need under the lock.` },
]
const results = await pipeline(REVIEWS,
  r => agent(`${COMMON}\n\n${r.prompt}\nIds ${r.id}-1, ${r.id}-2, ... Write your review as Markdown to ${OUT}/review-${r.key}.md.\n${SAVE(r.key + '.md', 'each area checked and each finding so far')}\nReturn your review in the schema.`, { label: `review:${r.key}`, phase: 'Review', schema: FINDINGS }),
  (rev, r) => parallel(((rev && rev.findings) || []).map(f => () => parallel(['evidence and reproduction: re-check every cited fact yourself at the head (a fresh clone of your own, read only, or git -C /home/user/PhysicalTherapy show ' + HEAD.slice(0, 8) + ':<path> after git fetch origin co-001/wip-ci-findings-transport)', 'GitHub behaviour and best fix: is the claimed runner/gh/Actions behaviour real (cite docs or source), and is the fix the best one'].map((lens, i) => () =>
    agent(`${COMMON}\n\nTry to REFUTE this review finding through the lens "${lens}". Default to real=false only if you can show it wrong.\nFinding ${f.id} (${f.severity}): ${f.title}\nWhere: ${f.where}\nEvidence: ${f.evidence}\nScenario: ${f.scenario}\nFix: ${f.fix}\nReturn real, the reason with evidence, and a better fix if any.`, { label: `verify:${f.id}:${i}`, phase: 'Verify', schema: VERDICT })))
    .then(vs => ({ ...f, verdicts: vs.filter(Boolean), stands: vs.filter(Boolean).filter(v => v.real).length >= 1 }))))
    .then(fs => ({ review: r.key, summary: rev && rev.summary, notChecked: rev && rev.notChecked, findings: fs })),
)
return results
