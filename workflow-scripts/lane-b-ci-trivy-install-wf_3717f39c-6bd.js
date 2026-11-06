export const meta = {
  name: 'acting-s4-ci-trivy-install',
  description: 'PR co-001/ci-trivy-install-2026-11-04: install pinned Trivy from its GitHub release (get.trivy.dev is NXDOMAIN) in ci/release/release-dry-run; design, build, check, draft PR, two reviews with skeptics, fix round (suite once, base merge, one push), verification reading CI',
  phases: [
    { title: 'Build', detail: 'design + failing-first tests + the change' },
    { title: 'Check', detail: 'adversarial checker' },
    { title: 'Open', detail: 'push, draft PR, description read back' },
    { title: 'Review', detail: 'ci-infra and security-supply in fresh clones; skeptic per B/S finding' },
    { title: 'Fix', detail: 'one fix round: base merge, full suite once, one push' },
    { title: 'Verify', detail: 'fresh clone, reads CI on the head' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/trivy'
const SESSION = 'https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu'
const WT = '/home/user/ci-trivy'
const BR = 'co-001/ci-trivy-install-2026-11-04'
const INV = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/tasks/wyseg162e.output'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Acting Lane B session S4 (${SESSION}), at Lane A's orchestrator's direction (2026-11-04 03:23Z): the red base runs come first. Problem: since about 2026-11-03, every Trivy scan fails before scanning: aquasecurity/trivy-action@ed142fd0 (v0.36.0) calls aquasecurity/setup-trivy@3fb12ec1, whose trivy contrib/install.sh downloads the binary from get.trivy.dev, now NXDOMAIN (curl exit 6; reports: aquasecurity/setup-trivy#42; other repos switched to pinned GitHub release assets). Evidence: ci push run 41763423759 job 126356134153 (4846f043); PRs #103 and #104 the same. The full investigation and skeptic: ${INV} (read it). Scans affected: .github/workflows/ci.yml:695-731 (images job, two scans), release.yml:121-139, release-dry-run.yml:132-139. Branch ${BR}, worktree ${WT} (at 4846f043, installed, pushed with no commits). The fix: install the PINNED Trivy (the version trivy-action v0.36.0 defaults to, 0.70.0, so scan behaviour is unchanged, unless you find a decisive reason otherwise) from https://github.com/aquasecurity/trivy/releases/download/v<ver>/ with its SHA-256 pinned in the repository and checked (and against the release's checksums file; cosign verification if cheap and robust), into a temp dir on PATH, then trivy-action with skip-setup-trivy: true (or run trivy directly if that is simpler and safer); same severity, ignore-unfixed, exit-code, cache: false (ADR 0066: the release restores no cache), same DB source. Follow the repository's existing pattern for pinned binaries (tools/gitleaks/install.sh + release.txt; actionlint's pins in tools/setup-container.sh) and its guards (tools/test/workflows.test.ts and other workflow tests, pnpm actions:check, toolchain:check, the pin-age rules, docs/runbooks/ci.md, ADR 0066's supply-chain stance including the March 2026 trivy-action tag hijack note). Amend ADR 0066 (and ci.md's images entry) with the change and its reason; no new ADR number, no new test-matrix ID unless an existing CI row covers the guard (amend it). Open PR #86 (co-001/ci-images-digest, S3's, draft) edits other steps of the same jobs: keep the diff minimal so whichever merges second resolves easily.
SECOND PROBLEM, same class (Lane A's orchestrator, 03:32Z, folded into this PR): the repository became PRIVATE (about 2026-11-04 02:51Z). screening-capacity's "changes" job does a blobless clone/fetch that cannot fetch blobs without credentials on a private repository ("could not read Username"; SS-01's PR #104, screening-capacity run 41765454689: read its log to confirm the exact command and line). Fix: that job fetches with the workflow's token (actions/checkout with token and the fetch-depth/filter it needs, or an authenticated git fetch through the checkout's persisted credentials), permissions stay contents: read; a test in tools/test/workflows.test.ts (red first). Then AUDIT every workflow (.github/workflows/*.yml and composite actions) and the scripts they run (tools/**) for any other unauthenticated git fetch/clone/ls-remote, raw.githubusercontent.com or api.github.com read of THIS repository that assumed it is public (persist-credentials: false followed by a later fetch; gh calls without GH_TOKEN; curl of repo URLs), and fix each in this PR with a test; list what you audited and found clean. Do NOT touch runner sizes: RUNNER_TOO_SMALL, the 4-core larger runner and the organization on GitHub Team are the founder's; never lower the harness's CPU requirement. The PR's title and description cover both problems.
Merge rule: the session marks ready and merges, never you.
Rules: synthetic data only; every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH; heavy commands under flock /tmp/laneb-heavy.lock; another workflow shares the machine. Downloads (release assets, checksums) go each into its own new empty directory under ${SP}/dl-*, treated as untrusted, never executed except the verified trivy binary for a version/scan smoke. Commits in ${WT} only, one concern each, every message ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
Never amend, rebase, reset --hard, force or --no-verify; generated files only by their generators. Push with git push -u origin ${BR} from ${WT} (the pre-push hook runs). No model name or identifier in any file, commit or PR text. Never comment, review, approve, mark ready or merge on GitHub; never write files through the GitHub connector. GitHub reads through mcp__github__ tools (ToolSearch); gh only for search. Long waits: run_in_background; no foreground sleep. Scratch under ${SP}.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it.`
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['B', 'S', 'N'] }, title: { type: 'string' }, where: { type: 'string' }, scenario: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'title', 'where', 'scenario', 'evidence', 'fix'] } }, sound: { type: 'string' } }, required: ['findings', 'sound'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' }, correctedFix: { type: 'string' } }, required: ['real', 'reason'] }

phase('Build')
const build = await agent(`${COMMON}

You DESIGN and BUILD the fix. First write a short design ${SP}/design.md (the install method and why; the exact pins; which tests guard it; what is not changed). Then in ${WT}: (1) failing-first: extend the workflow tests so they require every Trivy scan to use the pinned, verified install and never setup-trivy's network install (red against the current workflows; save the red log in ${SP}/logs/); (2) the change in the three workflows (and any shared script, e.g. tools/trivy/install.sh + release.txt mirroring gitleaks); (3) the ADR 0066 amendment and ci.md. Prove the install works: run the install script locally (it downloads from github.com; if the proxy refuses, record it), check the hash, run trivy --version, and scan one small synthetic target (e.g. trivy fs on an empty dir with --skip-db-update if no DB, or with the DB from mirror.gcr.io if reachable). Under the lock: pnpm typecheck; pnpm lint; pnpm actions:check; actionlint; pnpm exec vitest run on the workflow tests (counts); BASE=origin/claude/build-platform pnpm toolchain:check. Do NOT push.
${SAVE('build.progress.md', 'design decisions, each commit and check')}
Return: head sha, commits, design summary, red/green evidence, local install proof, checks.`, { label: 'build', phase: 'Build' })

phase('Check')
const chk = await agent(`${COMMON}

You are the ADVERSARIAL CHECKER of the unpushed commits in ${WT}. Do not commit. Builder's report:
${build}
Break it: does any Trivy scan still reach get.trivy.dev or setup-trivy's install (grep every workflow and composite action)? Is the hash pinned in the repo and actually compared (a mismatch fails the step; try it with a wrong hash in a scratch copy)? Is the download from a pinned version URL over https with no redirect to an unpinned host? Same scan semantics as before (severity, ignore-unfixed, exit-code, targets, cache: false, DB source)? Does the new test fail on the old workflows for the right reason and pass now? Does release.yml's job permission set stay minimal? actionlint and actions:check clean? Report B/S/N with evidence and fix in ${SP}/check.md.
${SAVE('check.progress.md', 'what you checked')}
Return the review ending "VERDICT: clean" or "VERDICT: defects".`, { label: 'check', phase: 'Check' })

phase('Open')
const open = await agent(`${COMMON}

You OPEN the PR. Builder: ${build}
Checker: ${chk}
1. Fix every real checker defect (verify each) in small commits; re-run what each touches.
2. Push: git push -u origin ${BR}.
3. DRAFT PR (ToolSearch "select:mcp__github__create_pull_request,mcp__github__update_pull_request,mcp__github__pull_request_read"): owner PureTideWater, repo PhysicalTherapy, head ${BR}, base claude/build-platform, draft true, title "CI: Trivy installs from its pinned GitHub release, checked by hash (get.trivy.dev no longer resolves); private-repository fetches use the workflow token". Description from ${WT}/.github/pull_request_template.md, every section ("None" rather than omitted; the required-checks markers exactly as the template has them), under 65,536 characters: the failure and evidence (runs, jobs, exit 6, NXDOMAIN, third-party reports as reports), that it is not #94's and not a vulnerability; the change; the pins and how they were obtained; the tests (red first); ADR 0066 amendment; what is not changed; the relation to #86 (resolution expected); the screening-capacity note: the repository is now private, so the capacity job's 2-CPU runner stops with RUNNER_TOO_SMALL (a founder item, issue #102), and whether this PR's paths are watched by the capacity gate (read tools/screening-capacity/watched* and the gate's rule). What waits on a person: the founder's runner/organization decision if the gate is affected. End exactly with:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

${SESSION}
Write to ${SP}/pr-body.md, create, read back into ${SP}/pr-body-readback.md, compare (restore the footer if rewritten).
${SAVE('open.progress.md', 'each step, head and PR number')}
Return the PR number, the pushed head sha and the readback result.`, { label: 'open', phase: 'Open' })

phase('Review')
const LENSES = [
  { key: 'ci-infra', focus: 'CI INFRASTRUCTURE: does the install work on GitHub-hosted ubuntu runners (paths, PATH, runner.temp, tar layout, arch), in all three workflows; are scan semantics unchanged; do the workflow tests guard it fully and fail on regressions (try mutations); read CI on the PR head as far as it has run (did the images job install and scan? what did Trivy report?); conventions (pins, comments, ADR/runbook text accuracy); the conflict surface with #86 (merge-tree its head 83167b8f); the private-repository fetch fix: does the changes job now work on a private repository (read CI on the head), is the audit complete (grep every workflow and tools/** for clone, fetch, ls-remote, raw.githubusercontent.com, api.github.com, gh api, persist-credentials).' },
  { key: 'security-supply', focus: 'SECURITY AND SUPPLY CHAIN: integrity of the binary (hash pinned in-repo, compared before use, from where it was obtained, checksums file vs independent source, cosign/attestation feasibility), redirect and host trust (github.com release assets -> objects.githubusercontent.com), TOCTOU (download, verify, then execute the same file), permissions and tokens in the jobs, the March 2026 trivy-action tag hijack context (is trivy-action still trusted at its pinned sha when setup is skipped? what code of it still runs?), the DB source integrity, the release workflow (a compromised scanner in release.yml), and whether a safer option exists; for the token fix: least privilege (contents: read only), no token exposed to untrusted pull-request code (pull_request_target? forks?), persisted credentials not left for later steps that run repository code, no token in logs.' },
]
const reviews = await parallel(LENSES.map(l => () => agent(`${COMMON}

You are an ADVERSARIAL REVIEWER of the PR (${open}). Fresh clone: git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git ${SP}/clone-${l.key}, check out ${BR}'s head; read only (install under the lock only if you run tests); remove it when done. Focus: ${l.focus}
Findings B/S/N with where, a concrete scenario, evidence and fix; "sound" lists what you checked and found sound.
${SAVE(`review-${l.key}.progress.md`, 'findings so far')}`, { label: `review:${l.key}`, phase: 'Review', schema: FINDINGS }).then(r => r ? { ...r, lens: l.key } : null)))
const all = reviews.filter(Boolean).flatMap(r => r.findings.map(f => ({ ...f, id: `${r.lens}-${f.id}` })))
const judged = await parallel(all.map(f => () => (f.severity === 'N' ? Promise.resolve({ ...f, verdict: { real: true, reason: 'nit' } }) : agent(`${COMMON}

Try to REFUTE this review finding on the PR (${open}); real only if you confirm it; give correctedFix if the fix is wrong. Read the head read-only.
${JSON.stringify(f, null, 1)}`, { label: `skeptic:${f.id}`, phase: 'Review', schema: VERDICT }).then(v => ({ ...f, verdict: v })))))
const confirmed = judged.filter(Boolean).filter(f => f.verdict && f.verdict.real)
log(`reviews: ${all.length} findings, ${confirmed.length} confirmed`)

phase('Fix')
const fix = await agent(`${COMMON}

You run the FIX ROUND (one round). PR: ${open}
Confirmed findings (use correctedFix where given): ${JSON.stringify(confirmed, null, 1)}
Refuted: ${JSON.stringify(judged.filter(Boolean).filter(f => !(f.verdict && f.verdict.real)).map(f => ({ id: f.id, title: f.title, why: f.verdict && f.verdict.reason })))}
Sound: ${JSON.stringify(reviews.filter(Boolean).map(r => ({ lens: r.lens, sound: r.sound })))}
1. Apply every confirmed finding in small commits (a finding outside this PR's scope becomes a proposal in ${SP}/proposals.md).
2. Merge the base ONCE now: git fetch origin claude/build-platform; if it moved, git merge --no-ff FETCH_HEAD (merge commit with the attribution lines); install if the lockfile moved.
3. The full local suite once on this final tree, under the lock, counts in ${SP}/suite.md: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm check:fixtures; pnpm verify-content; pnpm test (whole unit project, counts); pnpm test:golden; pnpm synth --all and watched.ts --write (clean); pnpm actions:check; actionlint; BASE=origin/claude/build-platform pnpm toolchain:check; tools/stryker/affected.ts --event pull_request --base origin/claude/build-platform. test:db and e2e: not touched by a workflow-only change, left to CI (speed rule 1); say so.
4. Push once.
5. Update the description (read first; every section; findings with dispositions; suite counts; head and base) with update_pull_request; read back and compare.
6. Write /home/user/ops/approval-summaries/lane-b-ci-trivy-install-review.md and -fix-round.md (short; do not commit).
${SAVE('fix.progress.md', 'each step and the pushed head')}
Return: pushed head sha, base merged, each finding's disposition, suite counts, readback result.`, { label: 'fix', phase: 'Fix' })

phase('Verify')
const ver = await agent(`${COMMON}

You are the FRESH-CLONE VERIFIER. Fix round: ${fix}
1. git ls-remote: the branch head equals the reported head; note the base tip.
2. Wait for CI on that head to finish (pull_request_read get_check_runs; background waits of a few minutes; up to about 60 minutes). List every check run. The images job: did Trivy install from the pinned asset, verify, and scan both images, and with what findings (quote the summary)? Required checks: all green, mutation, screening-capacity gate, approval-of-record. If the screening-capacity gate fails, quote why (RUNNER_TOO_SMALL on the private 2-CPU runner?) and whether this PR's paths are watched.
3. Fresh clone at the head: install under the lock; the workflow tests; actionlint; actions:check; git diff --stat against the merge base: only the workflows, the install script/pins, tests, ADR 0066 and runbook text.
4. Description claims true; list stale sentences with exact replacements.
Write /home/user/ops/approval-summaries/lane-b-ci-trivy-install-verification.md (do not commit) ending "VERDICT: VERIFIED" or "VERDICT: NOT VERIFIED: <reasons>" (a red required check other than one explained as the founder's runner decision is NOT VERIFIED; state that case separately). Remove the clone.
${SAVE('verify.progress.md', 'each step')}
Return the verdict, the CI table, the images job's Trivy summary, the diff --stat, and description corrections.`, { label: 'verify', phase: 'Verify' })

return { build, chk, open, findings: all.length, confirmed: confirmed.map(f => `${f.id} ${f.severity} ${f.title}`), fix, ver }
