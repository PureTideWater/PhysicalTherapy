export const meta = {
  name: 'lane-b-ci-followup-reread',
  description: 'Re-read a Lane B CI follow-up design (P2 or P4) against claude/build-platform bce57f16: two scouts, a reviser, an adversarial reviewer, a fold, a completeness critic',
  phases: [
    { title: 'Scout', detail: 'files and code at bce57f16; versions, upstream facts and overlapping PRs' },
    { title: 'Revise', detail: 'write the re-read section and the in-place edits it needs' },
    { title: 'Review', detail: 'one adversarial reviewer' },
    { title: 'Fold', detail: 'each finding re-checked, every real one fixed, dispositions recorded' },
    { title: 'Critic', detail: 'completeness critic; a second fold if it finds gaps' },
  ],
}

const SP = '/home/user/laneb-sp'
const BASE = 'bce57f16'
const OPS = '/home/user/ops'
const I = args.item === 'p4' ? {
  key: 'p4', tag: 'mutation-trigger', name: 'P4, "a narrower mutation trigger for manifest and pin-only changes"',
  branch: 'co-001/ci-mutation-trigger', wt: '/home/user/ci-mutation-trigger', part: 'Part 7', ids: 'CI-27 to CI-29',
  design: `${OPS}/designs/lane-b-ci/follow-up-p4-mutation-trigger.md`, oldreview: `${OPS}/designs/lane-b-ci/follow-up-p4-mutation-trigger-review.md`,
  secRe: '## 14. Re-read at bce57f16 (2026-11-01)', secRev: '## 15. Review of the re-read (2026-11-01)', mark: '(14)',
  reviewOut: `${OPS}/designs/lane-b-ci/follow-up-p4-mutation-trigger-reread-review.md`,
  scoutOut: `${OPS}/designs/lane-b-ci/scout-ci-mutation-trigger-reread`,
  filesTask: `1. Every cite the design makes into tools/stryker (affected.ts and its tests, shards.ts/shards.test.ts, canary/verdict.ts, gate.ts, base.mjs, equivalent/*.json), stryker/shards.json, .github/workflows/mutation.yml, the root package.json, pnpm-workspace.yaml, packages/*/package.json and tools/package.json was taken at 6ddd587. Re-read each at ${BASE}: old cite, new file:line (grep the quoted code), and whether the behaviour the design relies on still holds (which files make every package affected; the closure rule; how the shards are listed; how Stryker is invoked; the runtime canary). mutation.yml as ci-browser (#77) and ci-deps (#48) left it: runners, steps, how affected.ts is called, every path filter. Everything ci-deps added to the manifests that P4's inert/non-inert field list must classify (catalog:, minimumReleaseAge, minimumReleaseAgeExclude, trustPolicy, trustPolicyExclude, overrides, packageManager with +sha512, pnpm.onlyBuiltDependencies, any new field), and every root/package script and bin added since 6ddd587.
2. Run under the lock: pnpm exec vitest run --project unit tools/stryker tools/test (counts, any failure). The unit count on ${BASE}: read the ci push run on ${BASE} if finished (gh api repos/PureTideWater/PhysicalTherapy/actions/runs?head_sha=bce57f167bc2217dc25ebbc1cabceb10a195a0a0), else the PR run 41329075340's unit job 124915155926 (404 files, 6,893 + 1; same tree plus nothing).
3. Section 9's replay (the measured saving): extend it to every pull request merged into claude/build-platform since #49 (list them with gh api; at least #48, #50-#82 that merged). For each, run the current affected.ts and the design's proposed rule (as a reasoned reading of what P4 changes, or by a prototype under ${SP}/p4reread/tmp/ that changes no tracked file) on its base..head file list, and give full/partial/none for both. Recompute the totals and runner-minutes from the mutation runs' job durations (gh api). Say plainly if the saving is now smaller or larger.
4. The overlaps: #84 (head e3299ea2; read its diff with gh api or git fetch origin pull/84/head into a temporary ref under ${SP}/p4reread/tmp, never in the worktrees): tools/stryker/{affected.test.ts,shards.test.ts}, stryker/shards.json, stryker/base.mjs, tools/stryker/equivalent/packets.json; RUNNER_PROOF_SHARD (money-ledger) after #84's split adds packets-roles and packets-words. #42 (be63bdc2): does it touch any P4 file. P2 (co-001/ci-trivy-version, not built; its design ${OPS}/designs/lane-b-ci/follow-up-p2-trivy-version.md) merges before P4: which files both change (ADR 0066, test matrix, synth matrix and registry, reconciliation-001, workflows.test.ts, package.json/tools/package.json/pnpm-lock.yaml via P2's @sigstore deps) and what P4's inert-field list must say about P2's new root script (pnpm trivy:pin) and dependencies. #82 (P1, merged in ${BASE}) touched which of P4's files. Rule 6 (LANES.md): merge with a merge commit, never rebase; section 11's "rebases" is wrong.
5. The shared files at ${BASE}: ADR 0066 (its parts; Part 5 is P1's; Part 6 is P2's, not yet written; Part 7 is P4's), docs/runbooks/ci.md's mutation part, docs/product/test-matrix.md's CI rows (last used CI-23), packages/synth matrix.ts and registry.ts CI rows, reconciliation-001, each with file:line.`,
  pinsTask: `1. The runtime canary and gate (section 3.3): Stryker's version and its runner packages as locked at ${BASE} (pnpm-lock.yaml), Node 24.22.0 as pinned, and whether any newer Stryker or vitest release now exists that is three days old (npm view <pkg> time --json, registry.npmjs.org) and would change what P4 must hold.
2. The mutation runs' durations now: the last 10 push runs of mutation.yml on claude/build-platform (gh api .../actions/workflows/mutation.yml/runs?branch=claude/build-platform), per-shard job durations, which shards ran, the runner image; recompute section 9's per-shard minutes and the cost of a full run.
3. Dependabot: its open PRs (#87, #88, #89 and any other; gh api pulls?state=open) and its config (.github/dependabot.yml at ${BASE}): which would today run every shard and which would P4 narrow; check acceptance 2 and 3 of section 1 against them.
4. Any GitHub Actions behaviour P4 relies on (paths filters, pull_request event's base SHA, merge ref) re-checked against docs (github/docs, blobless sparse clone under ${SP}/p4reread/tmp; cite path:line and commit).`,
  extraReview: 'Hunt especially for: a manifest or workflow change that alters a shard\'s result but P4 classes as inert (scripts that a shard runs, catalog lines a money package imports, overrides, onlyBuiltDependencies, packageManager, Node pin, Stryker or vitest config reached through a script, mutation.yml steps); a parse that fails open; a replay or saving that does not add up; the overlap with #84 and P2.',
} : {
  key: 'p2', tag: 'trivy-version', name: 'P2, "Trivy at its latest release, installed from verified bytes, with the hijacked-tag check"',
  branch: 'co-001/ci-trivy-version', wt: '/home/user/ci-trivy-version', part: 'Part 6', ids: 'CI-24 to CI-26',
  design: `${OPS}/designs/lane-b-ci/follow-up-p2-trivy-version.md`, oldreview: `${OPS}/designs/lane-b-ci/follow-up-p2-trivy-version-review.md`,
  secRe: '## 12. Re-read at bce57f16 (2026-11-01)', secRev: '## 13. Review of the re-read (2026-11-01)', mark: '(12)',
  reviewOut: `${OPS}/designs/lane-b-ci/follow-up-p2-trivy-version-reread-review.md`,
  scoutOut: `${OPS}/designs/lane-b-ci/scout-ci-trivy-version-reread`,
  filesTask: `1. Every cite the design makes (6ddd587: and ci-deps:19e3d98e) into .github/workflows (ci.yml's images job and its Trivy steps; release.yml; release-dry-run.yml; and the files that did not exist then: release-capacity.yml, screening-capacity.yml, content-calendar.yml), tools/gitleaks/install.sh (which tools/trivy/install.sh mirrors), tools/test/workflows.test.ts, no-duplicated-versions.test.ts, tools/check-action-pins, tools/check-toolchain, the root package.json and tools/package.json, docs/runbooks/ci.md and dependency-upgrades.md, CLAUDE.md. Re-read each at ${BASE}: old cite, new file:line, whether the behaviour still holds. Every Trivy use now (every aquasecurity/* action, its version, inputs, cache settings, the DB source, TRIVY_* env), with file:line. The Trivy steps in ci.yml should be near lines 695 and 720 after #82.
2. P1 (#82, merged in ${BASE}): P2 imports P1's releaseAgeMinutes. Give its module, signature and file:line (tools/check-toolchain/exclude-window.ts), the exclude window helpers, and how P2's age check for the Trivy release (signed_at three days old; the early-exclude path is the founder's, section 7) should call them. Does P1's action-pin age rule already hold aquasecurity/trivy-action's pin, and what happens to that rule when P2 retires the action (section 7 C1)? Does P1's image rule read anything P2 adds (e.g. the DB from ghcr.io is an OCI artifact, not an image the rule reads)?
3. Run under the lock: pnpm exec vitest run --project unit tools/test tools/check-toolchain tools/check-action-pins tools/gitleaks (counts, any failure). The unit count on ${BASE}: the ci push run on ${BASE} if finished (gh api repos/PureTideWater/PhysicalTherapy/actions/runs?head_sha=bce57f167bc2217dc25ebbc1cabceb10a195a0a0), else the PR run 41329075340's unit job 124915155926 (404 files, 6,893 + 1; the same tree).
4. The overlaps: #86 ci-images-digest (open, draft, head 83167b8f; its status file ${OPS}/approval-summaries/lane-b-ci-images-digest-status.md and its design under ${OPS}/designs/ if any). Read its diff (git fetch origin pull/86/head into a ref under a temporary clone in ${SP}/p2reread/tmp, never in the worktrees; or gh api) for ci.yml's images job (base lines ~660-748, the Trivy steps), release.yml, release-dry-run.yml, release-capacity.yml, screening-capacity.yml, docs/runbooks/ci.md, ADR 0066: exactly which hunks collide with what P2 changes, and whether P2 should be cut after #86 merges (recommended) or resolve second. Also #42 (be63bdc2: pnpm-lock.yaml, test-matrix, synth matrix and registry; section 11) and Dependabot #87-#89 (the lockfile; whichever merges second regenerates pnpm-lock.yaml with pnpm install, never by hand). LANES.md rule 6 governs: merge commits, both sides of shared documents kept, generated files regenerated.
5. The shared files at ${BASE}: ADR 0066's parts (Part 5 is P1's, now merged; Part 6 is P2's), the test matrix's CI rows (last used CI-23) and the synth matrix and registry CI rows, reconciliation-001, packages/compliance controls that name Trivy, each with file:line.`,
  pinsTask: `1. Trivy: its releases now (gh api repos/aquasecurity/trivy/releases?per_page=10; and git ls-remote --tags https://github.com/aquasecurity/trivy): the newest release at least three days old as of now, its tag's commit, its published_at and the Rekor/Sigstore signing time of its Linux x64 tarball's bundle (the design's method: download trivy_<v>_Linux-64bit.tar.gz, its .sigstore.json bundle and checksums.txt under ${SP}/p2reread/tmp; verify with @sigstore/verify as section 2 describes; give the SHA-256 and the signing identity). Is v0.76.1 still right or does T1 move to a newer release? Any release since 0.76.1 that is younger than three days (say when it ages in)? Any advisory against the chosen version (GitHub advisories for aquasecurity/trivy)?
2. trivy-action and setup-trivy: their latest releases and what default Trivy version each installs now; the pinned trivy-action ed142fd0 (v0.36.0): is its tag still naming that commit; any new hijack or security advisory since March 2026 (CVE-2026-33634)?
3. The npm packages P2 adds (@sigstore/verify, @sigstore/bundle, @sigstore/tuf or whichever section 3/4 names, and their dependencies): the current versions (npm view <pkg> time --json), each one's age against the three-day floor and P1/ci-deps' trustPolicy no-downgrade (provenance), and whether the lockfile at ${BASE} already holds any of them. Which version P2 should pin, with reasons.
4. The vulnerability database (section 2, T7): ghcr.io/aquasecurity/trivy-db:2 and trivy-java-db: reachable anonymously from here (the OCI manifest and its UpdatedAt/created annotation), its age now, the mirror.gcr.io fallback; is the 48-hour floor still realistic (how often it was older than 48 h over the last weeks, if a history can be read; else not verified). The 48-hour floor and any early exclude are the founder's rulings: report, never change them.
5. GitHub's documented behaviour the design relies on for release assets and tags (immutable releases: does aquasecurity/trivy publish immutable releases now; read the release object's immutable field with gh api), re-checked with cites.`,
  extraReview: 'Hunt especially for: any path where CI runs Trivy bytes other than the committed SHA-256 (cache restore, a fallback download, trivy-action left anywhere, a Docker image of Trivy); a hijacked or moved tag that a pull request or push would miss; a Sigstore check that accepts a wrong identity, workflow, ref or commit; a DB read that can update during a scan or come from a mirror the design forbids; the age check not using P1\'s releaseAgeMinutes; a push run that can turn red on an outage; collisions with #86 and #42 not handled; any new npm dependency that fails ci-deps\' gates.',
}
const S = `${SP}/${I.key}reread`

const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. You work for a Lane B item session (session_01FcouKNP2XtaombFLueKLnu) that owns ${I.name} (branch ${I.branch}, cut locally at ${BASE}, not pushed; ADR 0066 ${I.part}; test-matrix and packages/synth ${I.ids}; LANES.md's row "CI follow-ups from ci-deps' re-read"). Its design is ${I.design} (its 2026-10-26 review: ${I.oldreview}), written on 2026-10-26 against claude/build-platform 6ddd587 and the moving co-001/ci-deps 19e3d98e. Since then these merged: ci-deps #48 (e908c214), #49 (content-calendar.yml, release-capacity.yml), #76, ci-browser #77 (ecebdc90), #80, #79, #74, #81, #78 (83d71fd6) and P1 ci-pin-age #82 (bce57f16, 2026-11-01 ~17:20 UTC: action pins and image digests held to the three-day floor; releaseAgeMinutes in tools/check-toolchain/exclude-window.ts). The brief says a design written before the current base is re-read against it, with one reviewer. The worktree ${I.wt} is at ${BASE} (= origin/claude/build-platform now) with node_modules installed; the main checkout /home/user/PhysicalTherapy is at ${BASE} too. Parent design: ${OPS}/designs/lane-b-ci.md (3.2 ci-deps, 3.2.6 the follow-ups, 3.3 ci-browser, 3.4 ci-mutation). P1's design, for its style and its re-read sections 14-16: ${OPS}/designs/lane-b-ci/follow-up-p1-pin-age.md. Status file: ${OPS}/approval-summaries/lane-b-ci-deps-status.md. Rules: ${OPS}/LANES.md (rule 6; the "Not while #42 is open" list: #42, PR 6b-4, head be63bdc2, is open), ${OPS}/lanes/lane-b.md ("How Lane B runs"), ${OPS}/lanes/lane-b-session-brief.md. Merge order: #86 (ci-images-digest, open) merges next, then #75, #84, #83, #85; P2 then P4 merge after their own pipelines; P5 ci-catalog is not this session's.

Known facts: from this container gh api reads repos, pulls, commits, releases and Actions runs and job logs (only some Actions paths such as /actions/variables answer 403); hub.docker.com, registry.npmjs.org, ghcr.io and storage.googleapis.com are reachable; git over https to github.com works. CI's runners read api.github.com with GITHUB_TOKEN. ci-browser moved 22 jobs to ubuntu-26.04, static among them (the release's capacity chain stays on ubuntu-24.04, the founder's F5). Rulings: F2 (b) (three-day release age, dated exact seven-day excludes), CQ1 (a) (Dependabot's 7-day cooldown for actions and images), the co-founder's 2026-10-26 ~00:20 UTC ruling (take the recommended option, security the safer one, without asking). The founder's alone: approving domain-model.md (so any migration), release tags, owner-admin settings, legal text, freeze exceptions, reversing a founder ruling. Never merge a Dependabot PR.

Rules for you:
- Synthetic data only; no PHI, real 835, contract or export anywhere.
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH
- Heavy commands (pnpm install, typecheck, lint, tests, builds) only under flock /tmp/laneb-heavy.lock <command>.
- Change no tracked file in /home/user/PhysicalTherapy, ${I.wt} or any other worktree. In ${OPS} change only the files your task names. Never run git add, commit, push, checkout, reset, merge, stash or worktree in those trees; the session commits. Scratch clones and temporary repositories go under ${S}/tmp/ (remove them when done). GitHub: read only; never comment, review or write; never use the GitHub connector to write files.
- No model name or identifier in any file you write.
- Cite file:line at ${BASE} (or a URL/command with its UTC time) for every claim. Say "not verified" when you could not check.
- Improve as you go: an improvement inside this item's scope goes into your result; one outside it goes in your notes as a proposal.
- Long commands: run_in_background and wait for the notification; no long foreground sleep.`
const SAVE = (file, what) => `Save as you go: keep ${S}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped. Write your report to ${S}/${file.replace('.progress.md', '.md')} as well as returning it.`

phase('Scout')
const [files, pins] = await parallel([
  () => agent(`${COMMON}

Your task: scout FILES AND CODE at ${BASE}. Read the design whole first, then:
${I.filesTask}
${SAVE('scout-files.progress.md', 'each numbered item with its findings as you finish it')}
Return a markdown report with sections 1-5 and a final "Changes the design needs" list (each: the design text to change, the new text or fact, evidence).`, { label: `scout:files:${I.key}`, phase: 'Scout' }),
  () => agent(`${COMMON}

Your task: scout VERSIONS, UPSTREAM FACTS AND RUNS, as of now (2026-11-01 UTC). Read the design's facts section first.
${I.pinsTask}
${SAVE('scout-pins.progress.md', 'each numbered item with its findings as you finish it')}
Return a markdown report with numbered sections and a final "Changes the design needs" list (each: the design text to change, the new text or fact, evidence).`, { label: `scout:upstream:${I.key}`, phase: 'Scout' }),
])

phase('Revise')
const revised = await agent(`${COMMON}

Your task: REVISE the design for the merged base. The two scout reports:

=== FILES AND CODE ===
${files}

=== VERSIONS, UPSTREAM FACTS AND RUNS ===
${pins}

Append a new section "${I.secRe}" to ${I.design}, at the end of the document. It must contain:
- its sources and method (one paragraph);
- a table "What changed from the 2026-10-26 text, and why" (section, change, evidence), covering every "Changes the design needs" item from both scouts, each adopted (and why it is the better option) or declined with its reason;
- "Cites at ${BASE}": the design's code cites re-mapped (old, new), so builders work from the new lines;
- "Versions and facts measured today" (for P2: the Trivy release, its commit, signing time, SHA-256 and age; the npm packages; the DB; for P4: the replay totals and runner-minutes; Stryker's pins), with what the pull request is expected to print on CI;
- "Overlaps and merge order": each open PR that shares a file, the hunks, who resolves (the PR merged second, with a merge commit, both sides of shared documents kept, generated files regenerated, never a rebase), and whether to cut after a predecessor merges (recommended option and why);
- "Scope decisions": anything the merged base (P1 especially) changes about what this item must do, with the recommended option (security the safer one);
- "Build plan on this base": the builders and their disjoint files, the integrator (documents, matrix, synth, the full local suite), the failing-first commits, the exact files, the counts the PR must reach (unit at ${BASE}, 404 files and 6,893 + 1 on CI, plus the item's new tests), and the checks its fix round must include (actions:check and toolchain:check when a workflow, manifest or lockfile changes; the capacity run when a watched path changes);
- "Engineering choices made here" and "Proposed improvements outside this item" (continue the P-series numbering after the highest P number in ${OPS}/designs/lane-b-ci.md, the P1 design and the status file; grep for it), each reversible and recommended.
Never decide a founder-kept matter; name it as the founder's if it arises. Then edit the earlier sections in place only where a fact or cite is now wrong, marking each edit "${I.mark}". Keep the document's style: plain sentences, file:line cites, no model names.
${SAVE('revise.progress.md', 'which parts of the new section are written and which in-place edits are done')}
Return: a short summary of what you wrote and every in-place edit (old and new text).`, { label: `revise:${I.key}`, phase: 'Revise' })

phase('Review')
const review = await agent(`${COMMON}

Your task: ADVERSARIAL REVIEW of the design as re-read, ${I.design} (the new section "${I.secRe}" and the in-place edits marked "${I.mark}"), as a security and supply-chain reviewer and a CI-infrastructure reviewer at once. The reviser's summary:
${revised}

Read the design whole, then check every claim of the new section and every rule of the design against the tree at ${I.wt} (${BASE}), the network (read only) and GitHub's docs. Your job is to find what is wrong, not to agree. ${I.extraReview} Also: a rule that can turn the build branch or a push run red on its own; a rule that fails open where the design says closed; a mismatch between the design and the merged code (cites, P1's helpers, the push-run warning convention); tests that cannot fail first; anything that needs a secret, a migration, a founder-kept decision, or a "Not while #42 is open" file beyond rule 6's shared documents; counts that do not add up; anything the pipeline (draft PR, two adversarial reviews, the fix round with the full local suite, the fresh-clone verification, the merge rules) would trip on.
Write the review to ${I.reviewOut}: numbered findings as B (blocking), S (should fix) and N (nit), each with evidence and the fix you propose.
${SAVE('review.progress.md', 'findings so far')}
Return the review's text.`, { label: `review:${I.key}`, phase: 'Review' })

const FOLD = (input, round) => `${COMMON}

Your task: FOLD ${round === 1 ? 'the adversarial review' : "the completeness critic's gaps"} into the design. ${round === 1 ? `The review (also at ${I.reviewOut}):` : 'The critic\'s report:'}
${input}

For each finding, first try to REFUTE it against the code, the network or GitHub's docs: a finding that is wrong is answered with evidence and not applied. Fix every real one in ${I.design} (in the new section, or in place marked "${I.mark}"), taking the recommended option (security: the safer one). ${round === 1 ? `Then append "${I.secRev}" at the end: one line of totals and, per finding, its disposition (Fixed / Fixed by another means / Not taken) with the reason. Also copy the two scout reports from ${S}/scout-files.md and ${S}/scout-pins.md to ${I.scoutOut}-files.md and ${I.scoutOut}-upstream.md (unchanged, except shorten any 64-hex digest or 40-hex key fingerprint that is not a git commit SHA to its first 8 hex digits and an ellipsis if, and only if, gitleaks would flag it).` : `Then add to "${I.secRev}" a sub-heading "Completeness critic" with one line per gap and its disposition.`}
${SAVE(`fold${round}.progress.md`, 'each finding and its disposition as you go')}
Return: the totals, each disposition in one line, and the final "Build plan on this base" verbatim.`

phase('Fold')
const fold = await agent(FOLD(review, 1), { label: `fold:${I.key}`, phase: 'Fold' })

phase('Critic')
const CRITIC = { type: 'object', properties: { gaps: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' }, severity: { type: 'string', enum: ['B', 'S', 'N'] } }, required: ['what', 'evidence', 'fix', 'severity'] } }, summary: { type: 'string' } }, required: ['gaps', 'summary'] }
const critic = await agent(`${COMMON}

Your task: COMPLETENESS CRITIC. The design ${I.design} has been re-read (section "${I.secRe}"), reviewed (${I.reviewOut}) and folded ("${I.secRev}"). The fold's summary:
${fold}

Ask what is missing, and check each answer before reporting it: a scout question the re-read did not answer; a claim in the new section with no cite or a cite that does not hold at ${BASE}; a review finding marked Fixed whose fix is not in the text; a builder file list that misses a file the plan changes; a test that cannot fail first; a count that does not add up; an overlap with an open PR (#86, #42, #84, #75, #83, #85, Dependabot #87-#89, the other of P2/P4) not covered; anything a builder would have to guess. Report only real, verified gaps (an empty list is a good answer). Do not edit the design.
${SAVE('critic.progress.md', 'gaps found so far')}`, { label: `critic:${I.key}`, phase: 'Critic', schema: CRITIC })

let fold2 = null
const gaps = (critic && critic.gaps) || []
if (gaps.length) {
  log(`critic: ${gaps.length} gap(s); second fold`)
  fold2 = await agent(FOLD(JSON.stringify(critic, null, 2), 2), { label: `fold2:${I.key}`, phase: 'Critic' })
} else log('critic: no gaps')

return { item: I.key, revised, review, fold, critic, fold2 }
