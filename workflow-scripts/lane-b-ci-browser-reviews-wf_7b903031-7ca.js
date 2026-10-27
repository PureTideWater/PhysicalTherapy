export const meta = {
  name: 'lane-b-ci-browser-reviews',
  description: 'PR #77 (ci-browser) adversarial reviews: tour capture then the UX and brand review; CI and test infrastructure; security and supply chain; each in a fresh clone',
  phases: [
    { title: 'Capture', detail: 'tour shots at e908c21 and 367a659, tiled' },
    { title: 'Review', detail: 'UX and brand; CI and test infrastructure; security and supply chain' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/5b1bc8b7-7846-5c40-a0f8-306593ba96be/scratchpad'
const HEAD = '367a659f…(full sha: git rev-parse 367a659f)'
const BASE = 'e908c214…(full sha: git rev-parse e908c214)'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy (public). Pull request #77 (draft, "CI 3 of 4, ci-browser"), branch co-001/ci-browser, head ${HEAD.slice(0, 8)} (${HEAD}), base claude/build-platform at e908c21 (${BASE}), which is also the merge base. Read the PR description first: gh api repos/PureTideWater/PhysicalTherapy/pulls/77 --jq .body (read only). The design is /home/user/ops/designs/lane-b-ci.md section 3.3 (3.3.1 to 3.3.4, then 3.3.7 and 3.3.8, which override earlier text); the phase-2 summary is /home/user/ops/approval-summaries/lane-b-ci-browser-phase2-summary.md; the phase-1 summary /home/user/ops/approval-summaries/lane-b-ci-browser-build-summary.md. Rulings: the founder's F4 and F5; the co-founder's Q2 (2026-10-25) and his 2026-10-26 ~00:20 UTC ruling (recommended option, security the safer one). LANES.md (/home/user/ops/LANES.md) rule 6 and its "Not while #42 is open" list (#42 is open).

Rules for you:
- Synthetic data only; no PHI or real 835, contract or export.
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH.
- Heavy commands (pnpm install, builds, typecheck, lint, tests, Playwright, the tour) only under flock /tmp/laneb-heavy.lock <command>.
- Work in a FRESH CLONE of your own (git clone https://github.com/PureTideWater/PhysicalTherapy <dir>; git -C <dir> checkout --detach ${HEAD}); never change /home/user/PhysicalTherapy, /home/user/ci-browser or /home/user/ops (except your progress and report files named below). Never commit or push. GitHub: read only (gh api GET; the GitHub MCP read tools, get_job_logs for CI logs; never comment, review or approve).
- No model name or identifier in anything you write.
- A finding names file:line at the head, the evidence (a command you ran and its output, or a quote), a concrete failure scenario, and the fix you propose. Severity: blocking (CI would be red, a rule or ruling is broken, a security or binding guarantee does not hold, or a person would see a defect), should-fix (a real defect or gap with a narrower path), nit (wording, clarity, a small inconsistency). Verify each candidate before reporting it: try to refute it yourself; report only what survives, and say "plausible, not reproduced" where you could not reproduce.
- Improve as you go: a better option you see goes in as a finding with its reason.
- Long commands: run_in_background and wait for the notification; no long foreground sleep.`
const SAVE = (file, what) => `Save as you go: keep ${SP}/reviews/progress/${file} up to date (${what}), so an interruption loses nothing. If it exists when you start, an earlier run of yours was interrupted: read it, trust it unless the code says otherwise, and continue from where it stopped.`
const FINDINGS = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'what you reviewed, how, and the verdict in a few sentences' },
    findings: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string', description: 'e.g. UX-1, CI-1, SEC-1' },
      severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] },
      title: { type: 'string' },
      where: { type: 'string', description: 'file:line at the head' },
      evidence: { type: 'string' },
      scenario: { type: 'string', description: 'concrete failure path' },
      fix: { type: 'string' },
      confidence: { type: 'string', enum: ['reproduced', 'verified-by-reading', 'plausible'] },
    }, required: ['id', 'severity', 'title', 'where', 'evidence', 'scenario', 'fix', 'confidence'] } },
    notChecked: { type: 'array', items: { type: 'string' }, description: 'what you could not check, and why' },
  },
  required: ['summary', 'findings', 'notChecked'],
}

phase('Review')
const [ux, ci, sec] = await parallel([
  async () => {
    const cap = await agent(`${COMMON}

Your task: CAPTURE the UX review's before and after shots with the screen tour, as /home/user/ops/tools/lane-b-screen-tour/README.md says ("From another lane" and "Set-up and a run"; read both whole). The diff changes the app shell (apps/web/src/components/shell.tsx: the practice switcher's and the account control's aria-labels, and the account initial drawn as CSS generated content) and the brand baselines, so the sample is (README "The sample"): one shot per layout that carries the shell (every distinct layout the tour knows: the practice workspace pages, settings, the console if it has the shell, etc.; read the tour's capture spec and route map to list them), at 1280 and 390 px light and 1280 px dark, plus sign-in, the header at both widths with the practice switcher and the account menu OPEN (if the tour has those states; if not, add cap(...) calls for them to a COPY of the tour in your own TOUR_DIR only and say so; do not edit /home/user/ops), and the report covers (with and without the seal) if the tour reaches them.
Run two tours: TOUR_DIR=${SP}/reviews/screens-base with TOUR_REF=${BASE}, then TOUR_DIR=${SP}/reviews/screens-head with TOUR_REF=${HEAD}, each with TOUR_ONLY set to the sample's ids, then tile.py over each. Check the lock and the server ended together after each (README step 5) and clean up (step 6). The database name tp_e2e_screens is the tour's own.
Also list, for the reviewer: the brand journey's own shots already taken (before on 1194: ${SP}/phase2/ff/brand-shots-base/, after on 1248: ${SP}/phase2/brand-shots/run1/), and the old and new baselines with crops in ${SP}/phase2/baselines/ (read ${SP}/phase2/baselines.md).
${SAVE('capture.progress.md', 'the sample list, each tour run state, the tile directories')}
Return: the sample (each shot id with its route, width and theme), the two tile directories with their index.json paths, each shots.json path, any shot missing and why, and anything the reviewer should know.`, { label: 'capture', phase: 'Capture' })
    return agent(`${COMMON}

You are the UX AND BRAND REVIEW, one of PR #77's two adversarial reviews (LANES.md rule 1). Your checklist is the repository's .claude/agents/ux-brand-reviewer.md at the head (read it whole in your fresh clone; it is your standard), with .claude/rules/brand.md, the baseline review /home/user/ops/designs/lane-b-ux-review.md and LANES.md on claude/build-ops.
The capture agent's result (the sample, the before and after tiles and manifests):
${cap}
What changed that a person sees: shell.tsx's two header controls (accessible names now "<practice name>, practice switcher" and "<email>, account menu"; the initial drawn by CSS generated content), the brand journey's computed name check (apps/web/e2e/brand.spec.ts), the seven regenerated baselines (one cover's title antialiasing, 1,611 px), axe 4.14's label-content-name-mismatch now on for every journey scan, and docs. Judge from the shots and the code: the header at 1280 and 390 light and 1280 dark before and after (pixel equality expected; any difference is a finding unless explained); the names as a screen reader announces them (WCAG 2.5.3 Label in Name, 4.1.2, 1.3.1), including the email inside a name (long emails, truncation, what the visible text is at 390 px), a practice name that is long or absent ("Choose a practice"), the generated-content initial (is it announced twice, is it hidden from assistive tech, does Windows High Contrast / forced colors show it, does it survive copy and text-only zoom 200%), focus and keyboard on both <summary> controls, the menus open; the cover change (brand.md's faces, colours, the seal and its definition line, a blank Paper foot); the computed check's soundness (does it hold every header control, including "Menu" and "Help with this screen", and would it catch a future control whose name omits its text); any copy the diff adds that a person sees. A changed route with no shot is "not seen"; a route outside the sample after a shell change is "not seen, by sample".
${SAVE('ux.progress.md', 'each check done and each finding so far')}
Return your review in the schema.`, { label: 'review:ux-brand', phase: 'Review', agentType: 'ux-brand-reviewer', schema: FINDINGS })
  },
  () => agent(`${COMMON}

You are the CI AND TEST-INFRASTRUCTURE REVIEW of PR #77 (with the security review beside you, together the second of its two adversarial reviews). Fresh clone at /home/user/review-ci. Review the whole diff ${BASE.slice(0, 8)}..${HEAD.slice(0, 8)} (git diff --stat e908c21 ${HEAD}; 63 files) adversarially for whether CI will pass and whether each guarantee the PR claims actually holds. In particular:
- Every workflow change: runners (the exact RELEASE_CHAIN of eight; 22 on ubuntu-26.04; the dispatch probe's runs-on expression and notify's condition), step order and conditions (id: browser-install; the later steps' if: ; the cache saves keeping success(); off-pull_request saves), the apt cache keys and restore-keys (hashFiles over node_modules/.pnpm/playwright-core@*/... : does that path exist on CI at the time hashFiles evaluates, after pnpm install? would hashFiles return empty and so a constant key?), tools/ci/apt-archives.sh (set -euo pipefail, the epoch %3a parse, apt-cache show's SHA256 for name:arch=version, sudo cp, the conf file, what happens with a .deb whose name has a + or ~), browser-build.ts (the tree hash definition equal to the shell form, --image via docker run with no node_modules, the chain resolution with nothing hoisted on CI's layout), the baseline step (deletion first, the written set from the files present, --retries=0, exit status kept, git diff --exit-code, the print), tools/ci/print-pictures.sh (stdin bytes, path from env, chunking, SHA-256 first; quoting; a path with spaces), the release identity steps (job outputs per image in a matrix: can a matrix job set distinct outputs and do they survive across legs? toJSON(needs.build.outputs) selection with jq; the store-aware .Id compare from docker info DriverStatus; buildx imagetools inspect --raw following an index), the images job (outputs type=docker,dest; Trivy input:; image-id equality with build-push metadata containerimage.config.digest; the worker load and .Id equal target on 26.04's containerd store), release-capacity's and screening-capacity's --image steps and setup-node before them, content-calendar on 26.04, the actionlint -ignore.
- Tests: workflows.test.ts's new and changed rules (do they test what they claim, could they pass vacuously, does CI_TREE reach them), browser-version.test.ts, browser-build.test.ts, apt-archives.test.ts, image-id.test.ts, measure.test.ts, print-pictures.test.ts, collection.test.ts's FILES, watched.ts/watched-paths.txt (regenerated, matches), no-duplicated-versions.test.ts (no Playwright version anywhere scanned).
- Run locally in your clone (under the lock): pnpm install --frozen-lockfile; pnpm exec vitest run --project unit tools/test tools/ci tools/screening-capacity packages/synth; actionlint -shellcheck= -pyflakes= -ignore 'label "ubuntu-26\\.04" is unknown' .github/workflows/*.yml; shellcheck on tools/ci/*.sh if shellcheck exists (say if it does not).
- PR #77's CI: read the runs on ${HEAD.slice(0, 8)} (gh api repos/PureTideWater/PhysicalTherapy/actions/runs?head_sha=${HEAD}; the GitHub MCP get_job_logs with return_content and a large tail_lines for any failed or finished job). Report each red job with its root cause from the log, and confirm or refute each item of the PR description's "What this pull request's CI must show" that has run (browser check in each job, the baseline step's seven SHA-256s against the committed files, the counts, the 26.04 image in "Set up job", the apt kept/discarded counts). Do not wait more than 60 minutes for CI; report what has run.
- Docs: ADR 0066 Part 3, ADR 0058's amendment, ADR 0062's amendment, ci.md, screening-capacity.md, reconciliation-001, test-matrix CI-18 to CI-20: true to the code as built?
${SAVE('ci.progress.md', 'each area checked and each finding so far')}
Return your review in the schema.`, { label: 'review:ci-infra', phase: 'Review', schema: FINDINGS }),
  () => agent(`${COMMON}

You are the SECURITY AND SUPPLY-CHAIN REVIEW of PR #77 (with the CI review beside you, together the second of its two adversarial reviews). Fresh clone at /home/user/review-sec. Review the diff e908c21..${HEAD.slice(0, 8)} adversarially for:
- Supply chain: the five bumped packages (npm view <pkg>@<v> dist.integrity _npmUser.trustedPublisher dist.attestations; the lockfile's integrity lines equal the registry's; no new transitive package; fsevents' removal; the catalog), pnpm-workspace.yaml's gates untouched (minimumReleaseAge, trustPolicy, excludes, overrides), check-toolchain's rules passing for the right reason (BASE=origin/claude/build-platform pnpm toolchain:check in your clone, networked).
- The browser record as a trust anchor: browser.json's six hashes per build and browser-builds/*.sha256 (does each list hash to treeSha256; do they match Google's published zips: download both zips from https://storage.googleapis.com/chrome-for-testing-public/156.0.8078.4/linux64/ and verify zipSha256, then recompute treeSha256 and the binary sha256 from the zip members without extraction or into a temp dir), browser-build.ts's comparisons (could a build pass the check with a changed file, an added file, a symlink, a hard link, a changed mode, a device; could a path trick the sort or the hash; does --image trust anything the image says), the deliberate red and its exception.
- The apt cache: the trust argument (apt checks size only; verify deletes any .deb whose SHA-256 differs from the freshly fetched signed index's for that exact name:arch=version); can a poisoned cache entry (from a PR's own ref, or the default branch) reach apt; the save only off pull_request; the conf file; sudo use.
- The release binding: job outputs no later job can rewrite; SHA-256 against needs.build.outputs before every docker load; the store-aware .Id compare before any push; the registry read-back after; provenance/sbom false and where attestation still comes from (attest-build-provenance in report); push and report running no repository code (no checkout, setup-node, pnpm, tsx or node); image-id.ts's archive parsing as untrusted input (tar path traversal, pax headers, huge sizes, a config whose bytes do not hash to its name, gzip bombs; node: imports only).
- Workflow permissions and injection: every new or changed step's expressions (no untrusted github.event.* interpolated into run:; inputs.runner limited to the choice's options; permissions blocks; persist-credentials false kept), the dispatch probe's report refused by the launch check, the notify condition.
- The worker image: copying playwright-core from the build stage (cp -RL follows symlinks: could it copy something outside the package?), npm/npx/corepack still removed, the headless shell install with --with-deps.
- PHI and data: no real data, no PHI in logs, URLs, artifacts or the printed pictures (synthetic brand pictures only).
- Not while #42 is open: the branch touches no file on LANES.md:84-92 beyond Q2's allowances.
${SAVE('sec.progress.md', 'each area checked and each finding so far')}
Return your review in the schema.`, { label: 'review:security-supply', phase: 'Review', schema: FINDINGS }),
])

return { ux, ci, sec }
