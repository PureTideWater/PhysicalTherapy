# Adversarial review of §3.3.7 (re-read of `co-001/ci-browser` at e908c21), 2026-10-27

Scope: `designs/lane-b-ci.md` §3.3 whole (:1672-2995), the new §3.3.7 (:2763-2995), the 52 in-place "(3.3.7)" edits,
§1's A8-A11 (:91-94) and §3.5's CI-18 to CI-20 (:3257-3259). Checked against the merged tree `/home/user/ci-browser`
at 2ab2b15, the main checkout at e908c21, the npm registry and GitHub (GET only), 2026-10-27 02:15-02:50 UTC. Cites
read at 2ab2b15 unless they name another commit. Working files: `scratchpad/reread2/review/` (the unit subset runs
`{base,head}-subset.json`, the playwright 1.64.1 tarball, playwright-core 1.64.1's `coreBundle.js`).

Verdict: 2 blocking, 7 should-fix, 10 nits. Everything not listed below was checked and holds; the list of what holds
is at the end.

## Blocking

**B1. Phase 2 never re-runs acceptance 3's failing-first runs at the new merge base.**
- Evidence: acceptance 3 (`lane-b-ci.md`, §3.3.4 item 3) requires §3.3.3's two red runs, the `CI_TREE` run and the
  worktree run, "against the merge base", with both recorded in the PR description. Phase 1 recorded only
  `watched.test.ts`'s red run (`approval-summaries/lane-b-ci-browser-build-summary.md:20`) and left "Failing first at
  the merge base" as a to-do (`:111`). Since the merge, the merge base is e908c21 (`git merge-base` of
  `origin/claude/build-platform` and 2ab2b15), not 123b8fa. §3.3.7's "Phase 2 on this base, in order" (eight steps)
  mentions failing first only for step 2's new rules (§3.3.7 table, :120 of the subsection), and nowhere for the
  phase-1 tests: `workflows.test.ts` (+13), `browser-version.test.ts`, `measure.test.ts`, `brand.spec.ts`'s name check
  (local, on the base's `shell.tsx`), and the rest of the named list in §3.3.3.
- Why it blocks: the pipeline's PR description has to carry both red runs, and the fresh-clone verification checks
  for them. As written, phase 2 reaches "Push and open the draft PR" (step 8) without them.
- Fix: add a step between 7 and 8: "Failing first at e908c21: §3.3.3's `CI_TREE` command and the worktree command
  (cut to `measure.test.ts`, see N8), each named test failing on an assertion, logs kept in `scratchpad/`, both runs
  recorded in the PR description. The `brand.spec.ts` red run (the base's `shell.tsx`) needs a local browser, so it is
  recorded as waiting on the person: storage.googleapis.com, and CI's run is the record until then."

**B2. Keeping release-capacity's `capacity` on 24.04 departs from F5 on the session's own authority.**
- What F5 says: F5 as recorded says "every job of every workflow moves to `ubuntu-26.04` … but the release's capacity
  chain", and it names that chain's jobs (`docs/product/reconciliation-001.md:646`; the same wording in §3.3, "The
  rulings"). The reason it records is the binding measurement: the chain stays "so a binding measurement is made only
  on the runner image the launch check accepts" (`:646`).
- How release-capacity differs: its run is "advisory, never attested, and no launch check, deploy or required check
  reads it" (`release-capacity.yml:56-59`; ADR 0066 `:399-401`). It is not binding, so F5's recorded reason does not
  cover it.
- Reason (1) in §3.3.7 restates F5 as being "about the measured host". That reading is not the one recorded.
- Reason (2) says the job "fails on host-sensitive numbers". The workflow's own header says otherwise: it fails on an
  incomplete job or run, a count mismatch, an OOM kill, a restart, `memory.peak` above 90%, or an out-of-fetch read, and
  "Times are recorded and advisory" (`release-capacity.yml:8-12`). Those checks are container-limit and correctness
  checks, not timings.
- Why it blocks: the brief makes "reversing a founder ruling" the founder's (`lanes/lane-b-session-brief.md`, §6).
  Extending F5 to a job it does not name, against its letter, is that kind of change. The co-founder's
  take-the-recommended-option rulings do not reach founder rulings.
- Fix (recommended; no one needs to rule):
  - `release-capacity.yml:36` moves to `ubuntu-26.04` with `:114`.
  - `RELEASE_CHAIN` stays at the eight phase 1 built (`workflows.test.ts:210`), and `:429` goes 18 → 22: 22 move, 8
    stay.
  - The `--image tp-worker:capacity` step stays.
  - P14 is dropped, since the weekly run itself becomes #41's free 26.04 data point.
  - The dispatch on the PR head (§3.3.7, "Recommended") then proves the job on 26.04 before the merge.
  - Update A8, CI-20 (drop "and the weekly real-size test's measuring job"), E22/E23/E26/E34/E37, the §3.3.7 table rows
    1 and 42-43, and the document list (`ci.md:36-40`, ADR 0066 `:751-753`, ADR 0062 `:1391-1393`, ADR 0063
    `:485-486`, `screening-capacity.md:312-313`, reconciliation `:646`): each says "every job but the chain", which
    then stays true without a release-capacity clause.
- Alternative: if the session keeps 24.04, record it in the status file under "Waiting on someone: the founder (F5's
  scope for `release-capacity.yml`, a workflow F5 predates)", and word it in ADR 0066 Part 3 as an interpretation
  awaiting the founder, not as F5.

## Should fix

**S1. The unit count is wrong: +66, not +55.**
- The method miscounts: `vitest list` prints an `it.each` once.
  - `revise/list-head.json` has one entry for `browser-build.test.ts`'s "fails on a %s file beside an equal binary",
    which has three cases (`browser-build.test.ts:161-165`).
  - It has one entry for `browser-version.test.ts`'s "%s in %s: %s", which has ten (`browser-version.test.ts:119-130`).
- The runs give the true delta. Both runs used `--project unit tools/test tools/ci tools/screening-capacity
  packages/synth`, under the lock.
  - e908c21: 631 tests, all passed (`review/base-subset.json`).
  - 2ab2b15: 697 tests, of which 694 passed and 3 failed (`review/head-subset.json`).
  - The difference is **+66**. Every file with new tests is inside that subset (the list delta touches only those seven
    files).
- So the PR's unit count is **6,265 + 66 = 6,331** plus phase 2's tests, with 1 skipped.
- Fix:
  - Correct §3.3.7's "Counts" and E50.
  - Have the PR take its delta from `vitest run --reporter=json`'s `numTotalTests` on both trees, not from `vitest
    list`.

**S2. Step 7's "expected no-ops" is wrong, and step 6 misses CI-18.**
- §3.5 changes the assertion text of CI-18 ("and in both capacity jobs before it is measured") and of CI-20.
- `fixtures/synthetic/CI-20/expected.json` (and CI-18's) holds the `assertion` text verbatim (`expected.json:5`).
  `pnpm synth --all` will therefore rewrite both files. It is not a no-op.
- Step 6 and the §3.3.7 table row for §3.3.2 Documents name only CI-20 (`test-matrix.md:280`, `matrix.ts:420`). CI-18's
  row (`test-matrix.md:278`, `matrix.ts:418`) is not listed.
- Fix:
  - Step 6 edits CI-18 and CI-20 in both `matrix.ts` and `test-matrix.md`.
  - Step 7 expects `pnpm synth --all` to write exactly `fixtures/synthetic/CI-18/expected.json` and `CI-20/expected.json`,
    regenerated and never hand-edited, and the next run to write nothing.
  - If B2's fix is taken, CI-20 goes back to its built text and only CI-18 changes.

**S3. If the mirror's bytes differ, CI's values become the record with nothing independent behind them.**
- §3.3.7's "Run 1" (and §3.3.1, "Where CI downloads from") says that on a failed browser check, `browser.json`'s
  `treeSha256` and `sha256` and the `browser-builds/*.sha256` lists "take CI's values".
- Until now the record was independent: it was computed from Google's zips, pinned by SHA-256 and by GCS's
  `x-goog-hash` (§3.3.1). With no local layout possible, taking CI's values makes the record trust-on-first-use of
  `cdn.playwright.dev`. Every later run then checks CI against itself. That is the build-provenance check the browser
  check exists for.
- CI's runners can reach Google's bucket even though this machine cannot.
- Fix: add, for the contingency only, a one-off procedure, run as a dispatched job or a temporary step in the PR's
  first push and then removed:
  1. Download both zips from `storage.googleapis.com/chrome-for-testing-public/156.0.8078.4/linux64/`.
  2. Require their SHA-256 to equal `browser.json`'s `zipSha256`.
  3. Unpack them and print their file lists in the `browser-builds/*.sha256` form.
  4. Diff those lists against the mirror's.
- Only with that diff in hand is a record change considered. Even then, the recommended outcome when Google's and the
  mirror's builds differ is to install Google's build on CI (as `cft_layout` does locally), not to adopt the mirror's
  bytes. This is a decision for the PR, recorded as the ADR 0058 finding.

**S4. Reading the pictures from the log: `get_job_logs` returns 500 lines by default.**
- The GitHub MCP `get_job_logs` has `tail_lines` defaulting to 500 (the tool's schema).
- In run 1 the failing e2e (1/M) job prints, after the baseline step, "The database's log" (`ci.yml:639-641`,
  `--tail=200`) and the post-job lines.
- Before the baseline step, the failed-comparisons step (`ci.yml:587-594`) prints whole pictures on single lines.
- The chunks may therefore fall partly outside the default window.
- Fix: in §3.3.7's step 2, call with `tail_lines` large enough for the whole job (for example 20,000). Require every
  `<i>/<n>` chunk of each path to be present, and its SHA-256 line to match, before any decode is used.

**S5. Local runs after the bump: what runs, what skips, and what the fix round's "full local suite" is.**
- `tools/test/ci-chromium.ts` (`:4-8`) makes the printing tests skip off CI when Playwright's Chromium is absent. After
  the bump no local 1248 exists, so step 7's `pnpm test` and any local `test:db` skip them.
- The fix round's full local suite (pipeline step 5) includes `test:e2e`. That cannot run on 1.64.1 here.
- `playwright.config.ts` falls back to Google Chrome when the bundled build is missing (§3.3.1). A local e2e run would
  then use another browser build, which the brief forbids for a result of record (`lane-b-session-brief.md:9`).
- Fix: §3.3.7 should state:
  - local unit and db counts after the bump carry the printing tests as skipped, and are not compared with CI's;
  - the fix round runs every local suite but e2e, records the skips, and takes e2e from CI's run on the head;
  - no local e2e runs until a 1248 layout exists (no Chrome fallback);
  - the fix round's local e2e is recorded as waiting on the person: storage.googleapis.com.

**S6. The `--image` jobs' setup-node rule against the two new sites.**
- §3.3.1 ("`--image <ref>`") says every job that runs `browser-build.ts --image` "takes `actions/setup-node` with Node
  24 and no cache (`package-manager-cache: false`)". §3.3.3 (E40's sentence) holds that for the release and images
  jobs.
- The two new `--image` sites sit in jobs whose setup-node has `cache: pnpm`: `screening-capacity.yml:201` and
  `release-capacity.yml:72`.
- The design neither exempts them nor changes them. The new `workflows.test.ts` rule will either fail on them or be
  written looser than the text.
- `--image` itself uses `node:` modules only (§3.3.1), so the pnpm cache does not reach the check.
- Fix: word the rule as "Node 24 from `actions/setup-node`; no cache in the release workflows and `images`; the capacity
  jobs keep their pnpm cache, which the `--image` check does not read", and test exactly that.

**S7. The A9 note's evidence has no home yet.**
- The co-founder's direction asks for side-by-side images. §3.3.7's A9 plan makes them with `convert +append` and puts
  them "in" `designs/lane-b-ci/ci-browser-a9.md`. It does not say:
  - where the image files go;
  - that they are committed and pushed on `claude/build-ops` through the pre-push hook (gitleaks);
  - how the PR links to them (a blob URL on the `claude/build-ops` branch).
- Name a directory, for example `designs/lane-b-ci/ci-browser-a9/<baseline>-{side,diff,crop-old,crop-new}.png`, with
  each file's SHA-256 in the note.
- The header pictures change for two reasons at once: `shell.tsx`'s generated-content initial (`shell.tsx`, +15 −5 since
  e908c21) and the browser (1194 → 1248). The note should attribute each changed box:
  - phase 1's local run on 1194 with the new `shell.tsx` passed the header comparisons (build summary `:55-56`);
  - [S3] M4 and M5 measured the shell change as pixel-neutral;
  - so a header difference is the browser's unless the crop shows the initial.

## Nits

**N1. The pnpm trust question is answerable now.**
- pnpm 10.34.8's `getTrustEvidence` returns "trustedPublisher" whenever `manifest._npmUser?.trustedPublisher` is truthy.
  It never reads `oidcConfigId` (`/opt/pnpm-10.34.8/dist/pnpm.cjs:67239-67241`; the downgrade check is at
  `:67168-67206`).
- `npm view <pkg>@<ver> _npmUser dist.attestations.provenance` (2026-10-27 ~02:30 UTC) shows a `trustedPublisher` object
  and provenance on all five packages: `playwright-core`, `playwright` and `@playwright/test` 1.64.1, and
  `@axe-core/playwright` and `axe-core` 4.14.0.
- So the dropped `oidc:` prefix cannot read as a downgrade. Change E4's and the table's "not verified" to this
  evidence; phase 2's install still confirms it.

**N2. The comparator's module path is known.**
- playwright-core 1.64.1 exports `./lib/coreBundle` (`package.json` `exports`).
- Its `utils` namespace (`coreBundle.js:77995`) exports `getComparator` (`:11494`, defined at `:8506`).
- So A9's comparator counts use `require('playwright-core/lib/coreBundle').utils.getComparator('image/png')`. It was
  read in the tarball, not run.
- Replace the "not verified" with this path, and the note's fallback line with "if the call fails at run time".

**N3. Dispatching release-capacity from the branch.** The "must exist on the default branch" condition holds:
`gh api repos/PureTideWater/PhysicalTherapy --jq .default_branch` gives `claude/build-platform`, which carries
`release-capacity.yml` at e908c21, and its `workflow_dispatch:` (`:18`) has no branch filter. Say so, keeping "not
run" until the dispatch.

**N4. 2ab2b15 is pushed.**
- `git ls-remote origin refs/heads/co-001/ci-browser` gives `2ab2b15b…`, and the status file says "(a merge commit,
  pushed; no PR yet)".
- §3.3.7's "Sources and method" says "local merge commit". Correct it.
- No workflow run exists for that SHA yet (`actions/runs?head_sha=2ab2b15…`, total 0).

**N5. The baseline step still depends on Playwright's message text.**
- The table row says the set compare is "held by the committed set, not by a message text". But the written set is
  parsed from "A snapshot doesn't exist at …, writing actual." (`ci.yml:611`).
- It fails closed: a reworded message gives an empty set and a red step. 1.64.1 keeps the text (`playwright` 1.64.1
  `lib/matchers/expect.js:12484-12486`, printed by `console.log` under `all`).
- An improvement inside scope: since step 1 removes every PNG, the written set is simply the PNGs present after the run
  (`find … -name '*.png' | sort`), which needs no message at all. Adopt it, or correct the claim.

**N6. A stale cite in an edited line.** E23's bullet keeps "`tools/screening-capacity/launch-check.ts:104`". At
2ab2b15, `RELEASE_RUNNER` is at `:107`; it was `:104` at e908c21. The subsection says every cite in a "(3.3.7)" edit
reads at 2ab2b15.

**N7. §3.5 rows carry design-only text.**
- CI-18 ends "(moved from CI-12, §3.2.7)" and CI-20 ends "(…, §3.3.7)". The built rows (`test-matrix.md:278, :280`)
  carry neither.
- The series note (`test-matrix.md:252-257`) already says what joins after #42.
- Keep the cross-references out of the text phase 2 copies into `matrix.ts` and `test-matrix.md`.

**N8. §3.3.3's worktree command still copies the deferred files.** It copies `report.test.ts`,
`launch-check.test.ts` and `test-support/measurements.ts`, which are unchanged at the head (deferred after #42). The
copies are harmless but misleading. Cut the command to `measure.test.ts`, matching E42.

**N9. An old contradiction E40 sits beside.**
- §3.3.3 holds `--image` "in `release.yml`'s and `release-dry-run.yml`'s `build`".
- §3.3.1 says the dry run builds `web` only, so the worker's `--image` is not exercised there. `release-dry-run.yml`
  has no `browser-build.ts` line (`grep`).
- Drop the dry run from that sentence.

**N10. The UX review's shots could come through the log.**
- P16 asks for the blob host so CI's `brand-screenshots/` can be read.
- The same chunked, SHA-256-checked print (S4) could carry those shots from the e2e job's log, without that host.
- Whether CI's 1248 shots satisfy the brief's "local screenshots" stays the co-founder's call, as P16 says.
- Add this as P16's alternative.

## Checked and holding (2ab2b15 unless noted)

- **Runners.**
  - `grep -n runs-on`: 30 jobs. On `ubuntu-26.04`: 18, namely approval-of-record 1, ci.yml 9, large-zip 1, mutation 3,
    publish-content 1, screening-capacity 3. On `ubuntu-24.04`: 11, plus the probe expression
    (`screening-capacity.yml:147`).
  - `RELEASE_CHAIN` has 8 entries (`workflows.test.ts:210`), and `:429` counts 18.
  - The three unit failures match `scratchpad/reread2/unit-run.log`.
  - The simulated rewrite's `TESTS` (`:2638`) leaves out `browser-version.test.ts`, so step 1's check is right.
- **The new workflows.**
  - `content-calendar.yml`: `pull_request` paths `:26-32` include the file itself; `notify` at `:67`; jobs at `:43`
    and `:68`.
  - `release-capacity.yml`: `:14-18` (no `pull_request`), `:36`, `:60-68`, `:113-114`, `:133`. Not a required check
    (`workflows.test.ts:1232`).
  - `processImagesProblems` is called from `tools/release-capacity/run.ts:20, :359`.
- **Code and lockfile cites.**
  - `containers.ts:379, :661, :671`.
  - `Dockerfile:21`, and `:34-36` (the browser installs inside `docker build`).
  - Apt keys at `ci.yml:229, :341, :540`, `large-zip.yml:53` and `screening-capacity.yml:243`; the save off
    `pull_request` at `ci.yml:251, :254`; the capacity job's default condition at `screening-capacity.yml:254-255`.
  - `ci.yml:580, :607, :623, :630`; `brand.spec.ts:189, :213, :376, :463`.
  - `expectAccessible(`: 72 calls in 14 files.
  - `tools/package.json:34`; `pnpm-workspace.yaml:21-22`; the gates at `:43-50`.
  - Lockfile lines `:2055, :2537, :2924, :3452, :3457, :5197, :5673, :6001, :6425, :6427, :6431`.
  - `packageManager` pnpm@10.34.8.
- **Documents.** ADR 0066 `:399-401, :715, :751-757, :813-823, :865-869, :890-894`; `ci.md:36-40, :222, :258`; ADR
  0063 `:485-486`; `screening-capacity.md:312-313`; ADR 0062 `:1391-1393`; `test-matrix.md:252-257, :276-280`;
  `matrix.ts:418-420`; `registry.ts:615-617`.
- **The baselines.** The seven are unchanged since 6ddd587 (`git log 6ddd587..2ab2b15` of the snapshot directory is
  empty; the blob prefixes equal §3.3.1's).
- **#42 at 2026-10-27 ~02:40 UTC.**
  - GET: head 098636e3, base e908c214, 188 files, draft, `blocked`, updated 2026-10-27T01:45:57Z.
  - Its files intersect ci-browser's 47 changed files in exactly the seven of the table.
  - Reconciliation: #42 inserts after `:640`, ci-browser after `:645` and `:649`. Disjoint, so clean.
  - ADR 0062: both sides append after `:1381`, so a sure conflict.
  - The manifests are disjoint.
  - Nothing on the "Not while #42 is open" list (`LANES.md:84-92`) is touched beyond `shell.tsx` (Q2), the deferral
    of `run.ts` and `report.ts`, and the rule-6 documents.
- **CI jobs of record.**
  - 121848211472 is `unit`, 121848211735 is `db (1/4)`, 121849065662 and 121849065557 are `e2e (1/2)` and `(2/2)`.
  - All are in run 40401493722 on e908c214, ubuntu-24.04, successful (`gh api …/actions/jobs/<id>`).
- **Versions.**
  - The `snapshot doesn't exist … writing actual.` message in playwright 1.64.1 (`expect.js:12484`).
  - The `trustedPublisher` objects on all five bumped packages (N1).
- **Not checked here.**
  - The runner-image READMEs and tags ([RV] §3).
  - The db counts of run 40401493722 beyond the job names.
  - actionlint's latest release.
