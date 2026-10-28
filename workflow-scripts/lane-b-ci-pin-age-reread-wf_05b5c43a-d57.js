export const meta = {
  name: 'lane-b-ci-pin-age-reread',
  description: 'Re-read P1 (ci-pin-age) design against claude/build-platform ecebdc90: two scouts, a reviser, one adversarial reviewer, a fold',
  phases: [
    { title: 'Scout', detail: 'files and code at ecebdc90; pins, digests and upstream facts' },
    { title: 'Revise', detail: 'write section 14 and the in-place edits it needs' },
    { title: 'Review', detail: 'one adversarial reviewer' },
    { title: 'Fold', detail: 'apply every real finding, record dispositions in section 15' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/5b1bc8b7-7846-5c40-a0f8-306593ba96be/scratchpad'
const DESIGN = '/home/user/ops/designs/lane-b-ci/follow-up-p1-pin-age.md'
const OLDREVIEW = '/home/user/ops/designs/lane-b-ci/follow-up-p1-pin-age-review.md'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. You work for a Lane B item session that now owns P1, "action pins and image digests held to the three-day floor" (branch co-001/ci-pin-age; ADR 0066 Part 5; test-matrix and packages/synth CI-21 to CI-23; LANES.md's row "CI follow-ups from ci-deps' re-read"). Its design is ${DESIGN} (sections 1 to 13; its 2026-10-26 review is ${OLDREVIEW}), written on 2026-10-26 against claude/build-platform 6ddd587 and the moving co-001/ci-deps 19e3d98e, BEFORE ci-deps merged (#48, e908c21, 2026-10-26 21:06 UTC) and before ci-browser merged (#77, ecebdc90, 2026-10-27 22:13 UTC), plus #46, #50, #51, #53, #55, #76 and others. The brief says a design written before 2026-10-26's merges is re-read against the current base. The P1 worktree is /home/user/ci-pin-age, branch co-001/ci-pin-age, at ecebdc90 (= origin/claude/build-platform now), with node_modules installed. The parent design is /home/user/ops/designs/lane-b-ci.md (sections 3.2 ci-deps, 3.2.6 the follow-ups, 3.3 ci-browser with 3.3.7 to 3.3.9). Status file: /home/user/ops/approval-summaries/lane-b-ci-deps-status.md. Rules: /home/user/ops/LANES.md (rule 6, the "Not while #42 is open" list), /home/user/ops/lanes/lane-b.md ("How Lane B runs"), /home/user/ops/lanes/lane-b-session-brief.md. P2 (co-001/ci-trivy-version, designs/lane-b-ci/follow-up-p2-trivy-version.md) and P4 (co-001/ci-mutation-trigger, follow-up-p4-mutation-trigger.md) come after P1, each its own PR; P5 (ci-catalog) is not this session's.

Known facts you need not rediscover: from this container api.github.com answers 403 (checked 2026-10-27 22:15 UTC) while hub.docker.com answers 200 and git over https to github.com works (blobless fetches); registry.npmjs.org works. CI's runners can read api.github.com with GITHUB_TOKEN. ci-browser moved 22 jobs to ubuntu-26.04, \`static\` among them (the release's capacity chain of 8 jobs stays on ubuntu-24.04, the founder's F5). The rulings: F2 (b) (the three-day release age with dated, exact, seven-day excludes), CQ1 (a) (actions and images keep Dependabot's default-days: 7), the co-founder's 2026-10-26 ~00:20 UTC ruling (take the recommended option, security the safer one, without asking; P1 itself is taken under it). The founder's standing rule: build only the best option, never weighted by effort. Never merge a Dependabot PR. #42 (Lane A, PR 6b-4) is still open; its files are listed in LANES.md "Not while #42 is open"; the shared documents (test-matrix, reconciliation-001, ADRs, the synth matrix and registry) follow rule 6.

Rules for you:
- Synthetic data only; no PHI, real 835, contract or export anywhere.
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH (default node is 22).
- Heavy commands (pnpm install, typecheck, lint, tests, builds) only under flock /tmp/laneb-heavy.lock <command>.
- Change no tracked file in /home/user/PhysicalTherapy or /home/user/ci-pin-age. In /home/user/ops change only the files your task names. Never run git add, commit, push, checkout, reset, merge or stash in those trees; the session commits. Scratch clones and temporary bare repositories go under ${SP}/p1reread/tmp/ (remove them when done). GitHub: read only (git fetch/ls-remote, or the GitHub MCP read tools if you have them); never comment, review or write.
- No model name or identifier in any file you write.
- Cite file:line at ecebdc90 (or a URL/command with its UTC time) for every claim. Say "not verified" when you could not check.
- Improve as you go (the co-founder's standing direction): an improvement inside P1's scope goes into your result; one outside it goes in your notes as a proposal.
- Long commands: run_in_background and wait for the notification; no long foreground sleep.`
const SAVE = (file, what) => `Save as you go: keep ${SP}/p1reread/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped. Write your report to ${SP}/p1reread/${file.replace('.progress.md', '.md')} as well as returning it.`

phase('Scout')
const [files, pins] = await parallel([
  () => agent(`${COMMON}

Your task: scout FILES AND CODE at ecebdc90. Read the P1 design whole first, then at /home/user/ci-pin-age:
1. Every cite the design makes into tools/check-action-pins (check.ts, base.ts, network.ts, fixtures.ts, index.ts, the pin list and its tests) and tools/check-toolchain (check.ts, tree.ts, registry.ts, index.ts, release-age-exceptions.json, check.test.ts, tree.test.ts) was taken at co-001/ci-deps 19e3d98e. Re-read each at ecebdc90: give the old cite, the new file:line (grep the quoted code), and whether the behaviour the design relies on still holds (baseState and selectPins' sets; the verify loop and push re-reads; withRetries and BACKOFF_MS; the recorded transport; readTreeAt, readWorkingTree, dockerfilePaths and FILES; releaseAgeExcludeRule and its window logic; how the floor (minimumReleaseAge) is read; the push-run warning convention). List every function, file or rule ci-deps or ci-browser added that P1 must fit (e.g. new rules in check-toolchain such as lockfile hosts, trust policy, overrides, packageManager; check-action-pins' rules (a)-(d) and the simulated Dependabot rewrite; any new transport method).
2. ci.yml's "Action pins" and "Toolchain" steps at ecebdc90 (file:line, their env, the job, its runner and permissions), and tools/test/workflows.test.ts's assertions about them. Does static run on ubuntu-26.04 now, and is gpgv on that image (cite the runner-images toolset or a log of a 26.04 job; read-only GitHub)? Is git there (yes) and at what version?
3. Every image reference now in the repository: Dockerfiles (apps/*/Dockerfile and any other Dockerfile), docker-compose.yml (and any other compose file), workflows (services: image, container: image, docker run, setup-buildx driver-opts image=..., uses: docker://...), tools/ scripts (tools/ci/postgres.sh, screening-capacity, setup scripts) and the frozen publish-content copy. For each: name:tag@digest, file:line, and whether the design's image rule (section 3.2: Dockerfiles' FROM and compose services.*.image) covers it. Recommend, with reasons, whether P1 must widen the image rule (e.g. BuildKit's moby/buildkit digest in setup-buildx's driver-opts, any image in a workflow) and how check-action-pins or check-toolchain already holds those digests.
4. The test layout: where the new tests go, collection.test.ts's testsIn lines (cite), the unit count now (CI run 40593100176 on ecebdc90 if finished, else ecebdc90's PR run 40589173731's unit job: read the job log through the GitHub MCP get_job_logs if you have it; else say not verified), and run under the lock: pnpm exec vitest run --project unit tools/check-action-pins tools/check-toolchain tools/test (report counts and any failure).
5. The shared files: the design's section 6 and 7 targets at ecebdc90 (ADR 0066's parts: is there a Part 4 and what is Part 5's place; docs/runbooks/dependency-upgrades.md "Actions" and "Base images and PostgreSQL" sections; docs/runbooks/ci.md; reconciliation-001's P1 entry; packages/compliance/src/controls.ts dependency_and_image_hygiene; test-matrix's CI section intro and CI-20's row; packages/synth's matrix.ts and registry.ts CI rows), each with its new file:line. Which of P1's files are in LANES.md's "Not while #42 is open" list, and #42's current state (head, draft, files: read only through the GitHub MCP or git ls-remote/fetch of its head branch) and whether its hunks touch what P1 edits.
${SAVE('scout-files.progress.md', 'each numbered item with its findings as you finish it')}
Return a markdown report with sections 1-5 and a final "Changes the design needs" list (each: the design text to change, the new text or fact, evidence).`, { label: 'scout:files', phase: 'Scout' }),
  () => agent(`${COMMON}

Your task: scout PINS, DIGESTS AND UPSTREAM FACTS, as of now (2026-10-27/28 UTC). Read the P1 design's sections 2 and 2.3 first (how age is measured; the 12 pins measured on 2026-10-26).
1. List every action pin in the workflows at ecebdc90 (/home/user/ci-pin-age/.github/workflows/*.yml and any composite action under .github/actions): owner/repo@sha with its version comment and file:line, deduplicated. Mark which are new or changed since the design's 12 (lane-b-ci.md section 3.2.1's table; the design's section 2.3).
2. For each distinct pin, reproduce section 2.3's local measurement with the design's method: a blobless fetch (git fetch --filter=tree:0 --no-tags <url> '+refs/heads/*:refs/heads/*' +refs/tags/<v>:refs/tags/<v>) into a temporary bare repository under ${SP}/p1reread/tmp/, then: does the tag still name the pin (peeled); is the pin an ancestor of the default branch (git ls-remote --symref <url> HEAD); the commit's committer and author dates; whether it carries a gpgsig and, using gpgv against GitHub's web-flow public keys (fetch them from keyserver.ubuntu.com by fingerprint 968479A1AFF927E37D1A566BB5690EEEBB952194 and 5DE3E0509C47EA3CF04A42D34AEE18F83AFDEB23; github.com/web-flow.gpg may be refused here), the VALIDSIG fingerprint and signature time; for an annotated tag, its tagger date. Give a table: pin, version, on default branch, tag names pin, committer time, signature time, tagger time, youngest local signal, age now in days, and whether it would pass the three-day floor. Note any pin that is less than seven days old (Dependabot's cooldown) or is an annotated tag or is SSH/X.509-signed.
3. Images: for every Docker Hub image digest in the repository (Dockerfiles, docker-compose.yml, workflows including BuildKit's moby/buildkit in setup-buildx driver-opts, tools scripts), read https://hub.docker.com/v2/namespaces/<ns>/repositories/<repo>/tags/<tag> and give: whether the tag's digest still equals the pin, tag_last_pushed, the youngest images[].last_pushed, and the age; for a superseded digest, try the tags listing (ordering=last_updated, at most 5 pages) as the design says and report whether the pinned digest is found on another tag. Report Hub's rate-limit headers.
4. GitHub's documented behaviour the design relies on, re-checked now (clone github/docs blobless with sparse checkout of content/ and data/reusables, or fetch the files by git; cite path:line and the commit you read): commit verification records and verified_at (about-commit-signature-verification.md: persistent verification, the "next time" sentence, the custom committer data line), immutable releases (immutable-releases.md: the tag lock sentence, and whether the REST release object has an immutable field), the REST commit object's verification.verified_at in the OpenAPI description if you can reach it (github/rest-api-description; say not verified otherwise), GITHUB_TOKEN's primary rate limit reusable. Also whether GitHub has since added any API that exposes a tag's creation time (search the docs for "tag" protection rulesets or "created_at" on refs) and whether any of the pinned actions now publish immutable releases (from the docs or a public HTML page at github.com/<o>/<r>/releases/tag/<v> fetched with curl if reachable; else not verified).
5. Dependabot: its open PRs into claude/build-platform or main that bump actions or images (git ls-remote --heads origin 'dependabot/*'), and what P1's rule would do to each (age by the design's method); the dependabot-core cites in the design's section 2.1/2.2 rows (git fetch dependabot/dependabot-core blobless and grep the cited files at main; give the new lines or say moved).
${SAVE('scout-pins.progress.md', 'each numbered item with its findings as you finish it')}
Return a markdown report with sections 1-5 and a final "Changes the design needs" list (each: the design text to change, the new text or fact, evidence).`, { label: 'scout:pins', phase: 'Scout' }),
])

phase('Revise')
const revised = await agent(`${COMMON}

RESUMED (2026-10-28 ~00:15 UTC): an earlier run of yours was stopped by the account's 5-hour limit at about 23:00 UTC, after it had written section 14's heading, intro, 14.1 (the changes table), 14.2 (cites) and 14.3 (pins and digests measured) into the design (uncommitted in /home/user/ops) and its decisions into its progress file. Read the progress file and the design's section 14 as written, keep what is there (re-check only what the code or network says otherwise), and continue with the remaining parts. The container restarted, so PostgreSQL may still be starting; nothing here needs it.

Your task: REVISE the P1 design for the merged base. The two scout reports:

=== FILES AND CODE ===
${files}

=== PINS, DIGESTS AND UPSTREAM FACTS ===
${pins}

Append a new section "## 14. Re-read at ecebdc90 (2026-10-27)" to ${DESIGN}, after section 13. It must contain:
- its sources and method (one paragraph);
- a table "What changed from the 2026-10-26 text, and why" (section, change, evidence), covering every "Changes the design needs" item you accept from both scouts, each either adopted (and why it is the better option) or declined with its reason;
- "Cites at ecebdc90": the design's code cites re-mapped (old, new), so builders work from the new lines;
- "Pins and digests measured today": section 2.3 restated for today's pins and digests (the table), with what P1's own pull request is expected to print on CI;
- "Scope decisions": in particular whether the image rule widens to images named in workflows (BuildKit, any service image), with the recommended option and its reason (security the safer one), and anything ci-deps or ci-browser added that P1 must fit;
- "Build plan on this base": the builders (B1 tools/check-action-pins with the ci.yml env line; B2 tools/check-toolchain with exclude-window.ts first as a no-op refactor), the integrator (documents, matrix, synth, the full local suite), the failing-first commits, the exact files, and the counts the PR must reach (unit at ecebdc90 plus P1's new tests);
- "Engineering choices made here" and "Proposed improvements outside P1" (continue the P-series numbering after the highest P number used in /home/user/ops/designs/lane-b-ci.md and the status file; grep for it), each reversible and recommended.
Then edit sections 1 to 12 in place only where a fact or cite is now wrong, marking each edit "(14)". Keep the document's style: plain sentences, file:line cites, no model names.
${SAVE('revise.progress.md', 'which parts of section 14 are written and which in-place edits are done')}
Return: a short summary of what you wrote and every in-place edit (old and new text).`, { label: 'revise', phase: 'Revise' })

phase('Review')
const review = await agent(`${COMMON}

Your task: ADVERSARIAL REVIEW of the P1 design as re-read, ${DESIGN} (new section 14, and the in-place edits marked "(14)"), as a security and supply-chain reviewer and a CI-infrastructure reviewer at once. The reviser's summary:
${revised}

Read the design whole (sections 1 to 14), then check every claim of section 14 and every rule of sections 2 and 3 against the tree at /home/user/ci-pin-age (ecebdc90), the network (git fetch/ls-remote, hub.docker.com, keyserver.ubuntu.com; read only) and GitHub's docs. Hunt for: a way a young or moved action pin, or a young image digest anywhere the build runs it, still enters the build branch (including images in workflows, composite actions, reusable workflows, docker:// uses, the frozen publish-content copy); a rule that can turn the build branch or a push run red on its own (an unchanged pin read, an outage, a rate limit); a rule that fails open where the design says closed; an exclude that can stand in for a young pin without an advisory; a mismatch between the design and ci-deps' final code (cites, sets, the recorded transport, the push-run convention); tests that cannot fail first; anything that needs a secret, a new dependency, a migration, a founder-kept decision, or a "Not while #42 is open" file beyond rule 6's shared documents; counts that do not add up; anything the pipeline (draft PR, two adversarial reviews, the fix round with the full local suite, the fresh-clone verification, the merge rules) would trip on; and whether api.github.com being unreadable here leaves any claim unproven that CI must prove.
Write the review to /home/user/ops/designs/lane-b-ci/follow-up-p1-pin-age-reread-review.md: numbered findings as B (blocking), S (should fix) and N (nit), each with evidence and the fix you propose.
${SAVE('review.progress.md', 'findings so far')}
Return the review's text.`, { label: 'review', phase: 'Review' })

phase('Fold')
const fold = await agent(`${COMMON}

Your task: FOLD the adversarial review into the design. The review (also at /home/user/ops/designs/lane-b-ci/follow-up-p1-pin-age-reread-review.md):
${review}

For each finding, check it again against the code, the network or GitHub's docs before changing any text. Fix every real one in ${DESIGN} (in section 14, or in place marked "(14)"), taking the recommended option (security: the safer one); a finding that is wrong is answered with evidence. Then append "## 15. Review of the re-read (2026-10-27)" after section 14: one line of totals and, per finding, its disposition (Fixed / Fixed by another means / Not taken) with the reason. Also copy the two scout reports from ${SP}/p1reread/ to /home/user/ops/designs/lane-b-ci/scout-ci-pin-age-reread-files.md and scout-ci-pin-age-reread-pins.md (unchanged, except shorten any 64-hex digest or 40-hex key fingerprint that is not a git commit SHA to its first 8 hex digits and an ellipsis if, and only if, gitleaks would flag it; leave git commit SHAs and the two web-flow fingerprints as they are in the design).
${SAVE('fold.progress.md', 'each finding and its disposition as you go')}
Return: the totals, each disposition in one line, and the final "Build plan on this base" from section 14 verbatim.`, { label: 'fold', phase: 'Fold' })

return { revised, review, fold }
