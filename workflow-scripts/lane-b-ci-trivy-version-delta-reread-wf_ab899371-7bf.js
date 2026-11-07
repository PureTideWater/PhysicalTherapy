export const meta = {
  name: 'lane-b-ci-trivy-version-delta-reread',
  description: 'P2 ci-trivy-version: delta re-read of the design on top of #107 and #106 at 8a722f80: a scout, a reviser, one adversarial reviewer, a skeptic per finding, a fold',
  phases: [
    { title: 'Scout', detail: 'what #107 and #106 put in the base; facts refreshed; numbers free' },
    { title: 'Revise', detail: 'section 14: the delta P2 still builds, its build plan' },
    { title: 'Review', detail: 'one adversarial reviewer' },
    { title: 'Skeptics', detail: 'one skeptic per finding tries to refute it' },
    { title: 'Fold', detail: 'confirmed findings fixed, section 15 dispositions' },
  ],
}

const S = '/home/user/laneb-sp/p2delta'
const OPS = '/home/user/ops'
const DESIGN = `${OPS}/designs/lane-b-ci/follow-up-p2-trivy-version.md`
const BASE = '8a722f804ad63daf3c2c3254eabeb5f989ee0fe7'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. You work for a Lane B item session (session_01FcouKNP2XtaombFLueKLnu) that owns P2, "Trivy at its latest release, installed from verified bytes, with the hijacked-tag check" (branch co-001/ci-trivy-version, cut locally at ${BASE}, no commits; ADR 0066 Part 6, notices N33 to N42; test matrix and packages/synth CI-24 to CI-26; proposals P38 to P42). The design is ${DESIGN}: sections 1 to 11, the re-read at bce57f16 (section 12, with 12.10 and 12.11 folding its review and critic) and section 13. Since that re-read, while this session was paused, two pull requests merged that took part of P2's ground:
- #107 (co-001/ci-trivy-pin-2026-11-04, merged 2026-11-04 05:58Z as 7bf7b252, commits 6ee142ce and 38a6cb79): tools/trivy/release.txt (Trivy 0.70.0, trivy-action v0.36.0's default "so the scans read as before"; linux_x64 and linux_arm64 archive SHA-256s from the release's checksums file; no commit or signing time) and tools/trivy/install.sh (https only, hash-checked); every Trivy step (ci.yml images, release.yml, release-dry-run.yml) runs that pinned binary by absolute path through trivy-action with skip-setup-trivy: true. Its reason: get.trivy.dev no longer resolves.
- #106 (co-001/ci-trivy-install-2026-11-04, merged 2026-11-04 08:06Z): screening-capacity's changes job fetches every object with the job's token; CI-11 guards every read of this repository for a private repository; it touched ADR 0066, the test matrix, ci.md, CI-11's and CI-21's fixtures, synth matrix.ts and workflows.test.ts.
Also merged since bce57f16: #86 ci-images-digest (24531dc2), #96 P4 ci-mutation-trigger (30871f72, ADR 0066 Part 7, N43 onward, CI-27 to CI-29), and others; the base is now ${BASE} (#131). The worktree /home/user/ci-trivy-version is at ${BASE} with node_modules installed. The orchestrator (2026-11-07 06:40 UTC) ruled: a short delta re-read covering only what #107 and #106 leave undone (the latest release past the three-day floor with commit and signing time; the Sigstore, tag, branch, immutable and age checks; the advisory floor; trivy-action retired; the database rules; push-run warnings), then build only that. Status file: ${OPS}/approval-summaries/lane-b-ci-deps-status.md. Rules: ${OPS}/LANES.md (rule 6), ${OPS}/lanes/lane-b.md, ${OPS}/lanes/acting-lane-b-2026-11-04.md (speed rules 1 to 5, 2a).

Facts: from this container gh api reads repos, pulls, commits, releases, Actions runs and logs; github.com (git and release downloads), registry.npmjs.org, ghcr.io and hub.docker.com are reachable. Rulings: the co-founder's (take the recommended option, security the safer one, no approvals needed; record the choice and reason). Founder-kept, never yours: the 48-hour database floor's change, any Trivy release-age exclude, migrations, release tags, owner-admin settings: name them as the founder's if they arise.

Rules for you:
- Synthetic data only; no PHI anywhere.
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH
- Heavy commands under flock /tmp/laneb-heavy.lock.
- Change no tracked file in /home/user/PhysicalTherapy or /home/user/ci-trivy-version. In ${OPS} change only the files your task names. Never git add, commit, push, checkout, reset, merge or stash there; the session commits. Scratch under ${S}/tmp (remove when done). GitHub read only.
- No model name or identifier in any file you write. Cite file:line at ${BASE} (or a command with its UTC time) for every claim; say "not verified" when you could not check.
- Long commands: run_in_background; no long foreground sleep.`
const SAVE = (f, what) => `Save as you go: keep ${S}/progress/${f} up to date (${what}); if it exists when you start, continue from it. Write your report to ${S}/${f.replace('.progress.md', '.md')} as well as returning it.`

phase('Scout')
const scout = await agent(`${COMMON}

Your task: SCOUT the delta. Read the design's section 12 (especially 12.5 scope, 12.6 build plan, 12.10, 12.11) and section 13 first. Then:
1. #107 and #106 exactly: their diffs (gh api pulls/107/files and pulls/106/files, all pages with &page=N; or git show 6ee142ce 38a6cb79 and #106's commits), and at ${BASE}: tools/trivy/release.txt's format and every reader of it, tools/trivy/install.sh line by line (what it checks, how it is called, its outputs, its tests if any), every Trivy step in every workflow (file:line, inputs, env, cache, the DB source), no-duplicated-versions and workflows.test.ts assertions about Trivy, ADR 0066's parts and notices as they stand (which part and notice numbers are used; are N33 to N42 still free; is a Part 6 taken), the test matrix's CI rows (are CI-24 to CI-26 still free), docs/runbooks/ci.md and dependency-upgrades.md on Trivy, packages/compliance controls naming Trivy.
2. Map the design's planned files and cases (12.6, 12.10, 12.11) onto the base: which already exist in #107's form (and differ from the design's form, e.g. release.txt's keys), which the design must now edit instead of create, which are untouched, which design items #107 already satisfies (say exactly how), and which remain.
3. Refresh the facts: Trivy's releases now (gh api repos/aquasecurity/trivy/releases?per_page=10 with published_at and immutable; git ls-remote --tags): the newest release at least three days old as of now, its tag's commit, branch placement (main for .0, release/vX.Y for a patch holding its .0), its Linux x64 and arm64 archive SHA-256s from its checksums file, and its Sigstore bundle's signing time (download under ${S}/tmp and verify with @sigstore/verify as the design's 12.3 did); GHSA advisories against Trivy; trivy-action's and setup-trivy's latest; the @sigstore/* npm versions the design pins, their ages and provenance; the trivy-db freshness at ghcr.io now.
4. Overlaps now: open PRs (gh api pulls?state=open&base=claude/build-platform) that share P2's files, with their heads and the hunks.
5. Base counts: the unit job count on ${BASE}'s ci push run (gh api actions/runs?head_sha=${BASE}&event=push, the unit job log), and the scoped run pnpm exec vitest run --project unit tools/test tools/check-toolchain tools/check-action-pins tools/trivy (if it exists) under the lock.
${SAVE('scout.progress.md', 'each numbered item as you finish it')}
Return a markdown report with sections 1-5 and a final "What P2 still builds" list (each item: what, where, in which form given #107, evidence).`, { label: 'scout:delta', phase: 'Scout' })

phase('Revise')
const revised = await agent(`${COMMON}

Your task: REVISE the design for the delta. The scout's report:
${scout}

Append "## 14. Delta on #107 and #106 at 8a722f80 (2026-11-07)" at the end of ${DESIGN}. It must contain: sources and method (one paragraph); "What #107 and #106 already did" (each design item satisfied, partly or wholly, with evidence); "What P2 still builds" (only the remainder the orchestrator named, adapted to #107's files: release.txt's format extended rather than replaced, unless a reason with evidence says otherwise; install.sh reused or extended; trivy-action retired; the Sigstore, tag, branch, immutable, age and advisory checks; the database rules; push-run warnings); "Versions and facts measured today" (the chosen Trivy release with its commit, signing time, SHA-256s and age; the @sigstore/* pins; the DB); "Numbers" (CI-24 to CI-26, N33 to N42, P38 to P42 confirmed free or the conflict named); "Overlaps"; "Build plan on this base" (builders with disjoint files, failing-first commits, the integrator's documents, matrix and synth, the exact case list, the counts: the base's unit count plus the new tests, and the fast checks plus actions:check and toolchain:check; the full local suite once before the single fix-round push); "Engineering choices" (each with its reason). Mark superseded parts of section 12 in place with "(14)" only where a fact is now wrong. Keep the document's style: plain sentences, file:line cites, no model names. Never decide a founder-kept matter.
${SAVE('revise.progress.md', 'which parts are written')}
Return: a summary of section 14 and every in-place edit (old and new text).`, { label: 'revise:delta', phase: 'Revise' })

phase('Review')
const FIND = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['B', 'S', 'N'] }, claim: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'claim', 'evidence', 'fix'] } }, summary: { type: 'string' } }, required: ['findings', 'summary'] }
const review = await agent(`${COMMON}

Your task: ADVERSARIAL REVIEW of section 14 of ${DESIGN} (and the "(14)" edits), as a security and supply-chain reviewer and a CI-infrastructure reviewer at once; apply the checklist of /home/user/PhysicalTherapy/.claude/agents/security-reviewer.md where it fits CI. The reviser's summary:
${revised}
Your job is to find what is wrong, not to agree. Check every claim against the tree at /home/user/ci-trivy-version (${BASE}), the network (read only) and GitHub's docs. Hunt for: any path where CI still runs Trivy bytes other than the pinned SHA-256 or a tag that moved; a Sigstore check that accepts a wrong identity, workflow, ref or commit; the age check not using P1's releaseAgeMinutes; a DB read that updates during a scan or comes from a mirror the design forbids; a push run that can turn red on an outage; anything #107 did that P2 would undo or duplicate; numbers already used; tests that cannot fail first; counts that do not add up; a founder-kept decision taken.
Write the review to ${OPS}/designs/lane-b-ci/follow-up-p2-trivy-version-delta-review.md (B, S, N findings with evidence and fix).
${SAVE('review.progress.md', 'findings so far')}`, { label: 'review:delta', phase: 'Review', schema: FIND })

phase('Skeptics')
const VERD = { type: 'object', properties: { refuted: { type: 'boolean' }, reason: { type: 'string' }, evidence: { type: 'string' } }, required: ['refuted', 'reason', 'evidence'] }
const findings = (review && review.findings) || []
log(`${findings.length} finding(s) to test`)
const judged = await parallel(findings.map(f => () => agent(`${COMMON}

Your task: SKEPTIC. Try to REFUTE this review finding on P2's delta design (${DESIGN}, section 14). Default to refuted=false only if the evidence proves it real; check it yourself against the tree at /home/user/ci-trivy-version (${BASE}), the network or GitHub's docs, with commands you run. Finding:
${JSON.stringify(f, null, 1)}`, { label: `skeptic:${f.id}`, phase: 'Skeptics', schema: VERD }).then(v => ({ f, v }))))
const confirmed = judged.filter(Boolean).filter(x => x.v && !x.v.refuted)
const refuted = judged.filter(Boolean).filter(x => x.v && x.v.refuted)
log(`${confirmed.length} confirmed, ${refuted.length} refuted`)

phase('Fold')
const fold = await agent(`${COMMON}

Your task: FOLD the review into ${DESIGN}. Confirmed findings (fix each, taking the recommended option, security the safer one):
${JSON.stringify(confirmed, null, 1)}
Refuted by a skeptic (answer each with the skeptic's evidence; do not apply):
${JSON.stringify(refuted, null, 1)}
Fix every confirmed finding in section 14 (or in place, marked "(14)"). Then append "## 15. Review of the delta (2026-11-07)": one line of totals and, per finding, its disposition (Fixed / Not taken, refuted) with the reason. Keep "Build plan on this base" exact and complete.
${SAVE('fold.progress.md', 'each finding and its disposition')}
Return: the totals, each disposition in one line, and the final "Build plan on this base" verbatim.`, { label: 'fold:delta', phase: 'Fold' })

return { scout, revised, review, confirmed: confirmed.length, refuted: refuted.length, fold }
