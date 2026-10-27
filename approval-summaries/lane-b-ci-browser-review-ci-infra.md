# PR #77 (ci-browser), CI and test-infrastructure review, on 367a659f

Workflow wf_7b903031-7ca (`workflow-scripts/lane-b-ci-browser-reviews-wf_7b903031-7ca.js`), a fresh clone, read-only on GitHub. Dispositions are in the fix round's summary.

## Summary

I reviewed the whole diff e908c214..367a659f (63 files) in a fresh clone, /home/user/review-ci, detached at 367a659f, and read every workflow change, the five new tools, their tests and the ADR, runbook and matrix text. Locally, under the lock: `pnpm install --frozen-lockfile` exited 0. The unit vitest over tools/test, tools/ci, tools/screening-capacity and packages/synth passed 705 of 705 (46 files), as the PR says. actionlint 1.7.7 with the one -ignore exited 0; without it there are 22 label errors, one per moved job. actionlint with shellcheck enabled also exited 0. Shellcheck 0.11.0 (in a scratch venv; it is not installed here and CI does not run it) is clean on apt-archives.sh; on print-pictures.sh it gives one info-level SC2094, a false positive. I re-ran the head's workflows and browser-version tests with CI_TREE set to the base tree: 31 fail on an assertion. I also checked apt-archives.sh's filename parse and its `name:arch=version` lookup against real `apt-get download` files with an epoch, a `+`, a `~` and an `all` package, using scratch apt lists: the SHA-256s match.

**Verdict: CI on 367a659f is red on two of the four required checks, `all green` and `screening-capacity gate`, for two blocking defects. I reproduced both on CI and locally.**
- **The worker-image browser check fails on every image.** `browser-build.ts --image` reads the image as its USER node, and two files in Google's zip are mode 600 root. This breaks ci.yml `images`, screening-capacity `capacity`, release.yml's build on a tag and release-capacity.
- **The brand baseline step can never pass.** It deletes the committed PNGs and then starts the prebuilt web server, whose build-stamp check refuses a dirty working tree.

The unit tests that cover both steps pass, because their stand-ins model neither the image's user nor the stamp check.

**What I confirmed from the CI runs:**
- 22 jobs run on ubuntu-26.04 and the 8 RELEASE_CHAIN jobs on ubuntu-24.04 (counted in the YAML; the job labels on CI agree).
- The browser check reports "equal to browser.json in every file" in unit, in db 1 to 4 and in e2e 1 and 2.
- Counts: unit 6339 passed and 1 skipped (6340); db 3152 + 2615 + 2534 + 922 = 9223 passed, 0 skipped; e2e 27 + 27 = 54.
- The restore drill now runs.
- hashFiles over `node_modules/.pnpm/playwright-core@*` gives a real hash (3cf66136…), not an empty string, so the cache key is not constant.
- The apt steps printed "0 kept, 0 discarded" everywhere, as expected on a pull request.
- Trivy's `input:` scanned both archives with 0 findings. The web and worker config digests read by image-id.ts equal buildx's `containerimage.config.digest`. The worker loaded on 26.04's containerd store with `.Id` equal to the archive's top-level descriptor.
- On the 24.04 classic store, `.Id` equals the config digest. The dry run's job outputs reached `push`, and `sha256sum --check` reported OK.
- mutation's seven shards ran on 26.04 and passed.

**What I refuted from the PR's list of what its CI must show:**
- The seven baseline SHA-256s: the step wrote 0 of 7.
- The browser check in `images` and in screening-capacity's `capacity`: it did not pass.
- "20261026.180.1 or later": the jobs ran images 20261012.163.1 and 20261025.179.1.

**Rule 6 and #42:** run.ts, report.ts, report.test.ts and test-support/measurements.ts are untouched.

## Findings

### CI-1 (blocking; reproduced): browser-build.ts --image reads the worker image as USER node and cannot read deb.deps and rpm.deps (mode 600 root), so every --image check is red, release.yml's build on a tag included

- **Where:** tools/ci/browser-build.ts:220-221 (the docker run calls); used at .github/workflows/ci.yml:758, screening-capacity.yml:228, release.yml:159, release-capacity.yml:79; apps/worker/Dockerfile:51 (USER node)
- **Evidence:** Job 122295114367 (ci images, ubuntu-26.04, containerd store) and job 122295205972 (screening-capacity capacity, ubuntu-24.04, classic store) both print: "sha256sum: chrome-headless-shell-linux64/deb.deps: Permission denied" and the same for rpm.deps. Then: "The headless shell: revision 1248, 156.0.8078.4, 285 files under tp-worker:...: tree SHA-256 9e0636c8…", against the record's 333985b3…, ending "2 files differ …: chrome-headless-shell-linux64/deb.deps (removed), chrome-headless-shell-linux64/rpm.deps (removed)", and exit 1.

The local layout shows why: `stat -c '%a %U' /opt/pw-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/*.deps` prints "600 root" for both files, which is the mode in Google's zip.

I ran browser-build.ts's IMAGE_SCRIPT over that layout:
- as uid 65534 (`setpriv --reuid=65534 … sh -c "$IMAGE_SCRIPT" sh 1248 chrome-headless-shell-linux64 chrome-headless-shell`): exit 0, 285 file lines, the same two "Permission denied" errors;
- as root: 287 lines, and `sha256sum` of those lines is 333985b3…, which is browser.json's treeSha256.

The record is right; the read is wrong.
- **Scenario:** Every pull request: `images` is red, so `all green` is red. Any PR whose changes are on the watched list: screening-capacity's `capacity` is red, so `screening-capacity gate` is red.

On the founder's next release tag, release.yml's build fails on its worker leg (the same Dockerfile and the same USER node, and screening-capacity proves the classic 24.04 store fails the same way). Then capacity and push are skipped and no image ships.

The weekly release-capacity run fails too, and its notify job opens an issue.
- **Fix proposed:** In imageBuild, run both docker calls as `docker run --rm --pull never --network none --user 0:0 --entrypoint …`.
- Reading as root hashes the image's bytes whatever their modes.
- `--network none` and `--pull never` keep the check from fetching anything: a missing local tag (for example release.yml's ghcr `$REF`) would otherwise be pulled and checked instead of the image just built.
- No record change is needed; root's read equals browser.json.

Update the stand-in docker in browser-build.test.ts (it requires exactly "run --rm --entrypoint") to require the new flags, and see CI-4 for the missing test.

### CI-2 (blocking; reproduced): The brand baseline step deletes the committed PNGs and then starts the E2E_PREBUILT web server, whose build-stamp check refuses the now-dirty tree, so the step always fails

- **Where:** .github/workflows/ci.yml:606-616 (E2E_PREBUILT at 608, the rm at 611); apps/web/playwright.config.ts:72; apps/web/scripts/build-stamp.ts:54-59
- **Evidence:** Job 122295919449, e2e (1/2): "[WebServer] build-stamp: the working tree has uncommitted changes (D apps/web/e2e/brand.spec.ts-snapshots/header-1280-chromium-linux.png, … and 2 more): a stamp names a commit, so it vouches only for a build of a clean tree; refusing to run this one". Then: "Error: Process from config.webServer was not able to start", "the brand journey exited 1", "the run wrote 0 baselines from nothing, not the 7 committed", and exit 1. The journeys themselves passed: 27 in that shard.

Reproduced in my clone:
- with a stamped clean tree (`git rev-parse HEAD > apps/web/.next/BUILD_COMMIT`), `tsx scripts/build-stamp.ts --expect HEAD` prints "the build is 367a659f…'s" and exits 0;
- after the step's `rm -f apps/web/e2e/brand.spec.ts-snapshots/*-chromium-linux.png`, it prints the same refusal and exits 1.

The PR's local runs used `--update-snapshots=all` without E2E_PREBUILT, so they built the app themselves and never met the stamp.
- **Scenario:** Every pull request and every push: e2e (1/N) is red, so `all green` is red. The proof that ubuntu-26.04 renders the committed bytes (ADR 0058's amendment, the PR's seven SHA-256s) can never be produced.
- **Fix proposed:** Regenerate outside the working tree so the stamp still holds:
1. In playwright.config.ts, add `snapshotDir: process.env.E2E_BASELINES_DIR || undefined`. Playwright 1.64.1's default template is `{snapshotDir}/{testFileDir}/{testFileName}-snapshots/…` (workerProcessEntry.js:1255).
2. In the step, set `E2E_BASELINES_DIR=$RUNNER_TEMP/baselines` (empty) and drop the rm.
3. Compare the basenames written under `$RUNNER_TEMP/baselines/brand.spec.ts-snapshots` with `git ls-files` of the committed set.
4. Once the run has ended, copy the written files over the committed paths, and keep the existing `git diff`, SHA-256 print and print-pictures logic.

This keeps "from nothing" (the directory starts empty), set equality and the byte check. Update the wording in ADR 0058's amendment, ADR 0066 Part 3 (N14, N19) and ci.md "Upgrading the browser" step 5, which say the step "removes the committed baselines". See CI-4 for the test.

### CI-3 (should-fix; verified-by-reading): No pull request runs release.yml's worker --image check or the build matrix's per-leg outputs merge, yet ADR 0066 N16 says every check a tag runs is exercised by a pull request first

- **Where:** .github/workflows/release-dry-run.yml:50-58 (one web-only build job, no matrix); docs/adr/0066-…:884 (N16); release.yml:159
- **Evidence:** release-dry-run.yml:50 says: "The worker's browser check is release.yml's alone here: ci.yml's images job runs it on every pull request."

But ci.yml's `images` takes a different path: 26.04, a containerd store, a type=docker archive and tag tp-worker:scan. release.yml's build runs on 24.04 with `load: true`, the ghcr `$REF`, and four matrix legs whose outputs must merge.

The dry run's single job did prove the single-leg path on CI (job 122296403135: BUILD = {config_web, target_web, sha256_web}, "web.tar.gz: OK", .Id equal to the config). The four-leg merge of `sha256_<image>`, `config_<image>` and `target_<image>`, and the worker's --image step, run only on a tag. CI-1 shows that step is broken today, and only the founder's tag would have shown it.
- **Scenario:** A future change to the worker leg (its --image step, an output name, the matrix) passes every pull request, and the release first breaks on the founder's tag, which only the founder can re-cut.
- **Fix proposed:** Make release-dry-run.yml's build a matrix of [web, worker] with release.yml's per-leg outputs, its `if: matrix.image == 'worker'` --image step, and push and capacity checks looping over both. workflows.test.ts already compares the dry run's steps with release.yml's, so extend that comparison to the matrix. If the cost is too high, say in N16 exactly which tag-only steps no pull request runs.

### CI-4 (should-fix; reproduced): The tests that claim to run these steps as the runner runs them pass while both steps fail on CI: their stand-ins model neither the image's user nor the build stamp

- **Where:** tools/ci/browser-build.test.ts:274-340 (the --image stand-in docker); tools/test/workflows.test.ts, describe 'the brand baselines, regenerated from nothing' (the regenerate() stand-in pnpm)
- **Evidence:** Locally, 705 of 705 pass, and on CI unit passed with workflows.test.ts at 114 tests and 1 skipped, while images, screening-capacity capacity and e2e (1/2) failed for CI-1 and CI-2.
- The stand-in docker execs `sh` as the caller (root locally), so an unreadable file is never met.
- The stand-in pnpm writes PNGs and exits 0; it never starts a web server, so the dirty-tree refusal is never met.
- **Scenario:** After CI-1 and CI-2 are fixed, either can come back unnoticed: a Dockerfile change of modes or USER, or a step edit that touches the tree before the run. The unit tests would stay green and only a full CI run would show it.
- **Fix proposed:** browser-build.test.ts:
- Require the stand-in docker's arguments to include `--user 0:0 --network none --pull never`.
- Add a case where a stand-in `sha256sum` fails on one file and the check reports that file as unreadable (see CI-5).

workflows.test.ts:
- Make the stand-in pnpm run `git status --porcelain` first and exit 1, printing build-stamp's message, when the tree is not clean, as `buildStep('1')` in playwright.config.ts does. The current script then fails that test.

### CI-5 (should-fix; reproduced): IMAGE_SCRIPT ignores sha256sum's read errors (sh has no pipefail) and the check then reports existing but unreadable files as '(removed)'

- **Where:** tools/ci/browser-build.ts:213 (`find … | xargs -0r sha256sum | sed 's/^/file /'` under `set -eu` in sh); diagnosis at :247-257 and :281
- **Evidence:** My non-root run of IMAGE_SCRIPT exited 0 with 285 lines while sha256sum printed "Permission denied" twice. On CI the message read "chrome-headless-shell-linux64/deb.deps (removed), chrome-headless-shell-linux64/rpm.deps (removed)", although both files are in the image (the `find -type f` listed them).
- **Scenario:** The check still fails, so it fails closed, but it names the wrong cause. A person following ci.md "Upgrading the browser" step 6 reads the output as the mirror or image dropping two files and chases a different build, as the CI-1 run shows. Any later I/O error inside an image is misreported the same way.
- **Fix proposed:** In IMAGE_SCRIPT, emit `find "$dir" -type f ! -readable -exec printf 'unreadable %s\n' {} \;` (GNU find is in trixie-slim). Alternatively, make the pipeline's failure visible with `{ xargs -0r sha256sum || echo 'error sha256sum'; }`. Then have imageBuild turn those rows into a problem of their own ("cannot be read inside the image") instead of a missing line. Test it as in CI-4.

### CI-6 (nit; verified-by-reading): The PR's CI expectations do not match what ran: the runner image versions, and where the browser check passed

- **Where:** PR #77 description, 'What this pull request's CI must show'; ci.yml 'The runner image' step (the apt key's input)
- **Evidence:** "Set up job" image versions on this run:
- db 1-4 and e2e 1-2: 20261012.163.1;
- unit: 20261025.179.1;
- the 24.04 chain (dry run): 20261012.334.1.

The PR expects "20261026.180.1 or later".

On the same db and e2e runners, the ImageVersion environment variable that feeds the apt key is 20261023.163.3 ("key: apt-v1-ubuntu26-20261023.163.3-3cf66136…"). So the key's version is not the version "Set up job" prints.

The browser check never passed in `images` or in screening-capacity's `capacity` (CI-1).
- **Scenario:** A reader matches "Set up job" against the apt cache key, or against the PR's expected version, and concludes the wrong image ran or the cache is mis-keyed.
- **Fix proposed:** Record the observed versions in the PR's checks and drop "or later". In ci.md's Caches section and ADR 0066's V3 paragraph, say the key is the runner's ImageOS and ImageVersion environment variables, which can differ from the version "Set up job" prints.

### CI-7 (nit; reproduced): apt-archives.sh says apt-cache exits 100 for a version no index lists; it exits 0 with no output (only an unknown package exits 100)

- **Where:** tools/ci/apt-archives.sh:61
- **Evidence:** `apt-cache show "libc6:amd64=0.0-nonexistent"` printed nothing and exited 0. `apt-cache show nosuchpkg-xyz` printed "E: No packages found" and exited 100.

The code handles both cases: the `|| listed=""` covers the error, and an empty `listed` leads to a discard. Against scratch Ubuntu 24.04 lists, real files from `apt-get download` (fonts-liberation_1%3a2.1.5-3_all.deb and libstdc++6_14.2.0-4ubuntu2~24.04.1_amd64.deb) parsed to `fonts-liberation=1:2.1.5-3` and `libstdc++6:amd64=14.2.0-4ubuntu2~24.04.1`, with SHA256 equal to each file's.
- **Scenario:** A maintainer relies on the exit status the comment describes and removes the empty-output test, so a stale version would be kept.
- **Fix proposed:** Reword the comment: "apt-cache prints no record (exit 0) for a version no index lists, and exits 100 for a package it does not know; either is a stale file".

### CI-8 (nit; reproduced): The failing-first count in the PR description: 31 failures at the base include the two node_modules-dependent browser-version cases the PR says it does not count, so there are 29 behaviour reds

- **Where:** PR #77 description, 'Failing first at the merge base e908c21'
- **Evidence:** I ran `CI_TREE=<git archive e908c21> pnpm exec vitest run --project unit tools/test/workflows.test.ts tools/test/browser-version.test.ts`: 98 passed, 31 failed, 1 skipped.
- 27 failures are in workflows.test.ts and 4 in browser-version.test.ts.
- Two of those 4 read installed node_modules: "resolves the lockfile's axe-core within @axe-core/playwright's range" (it reads apps/web/node_modules/@axe-core/playwright/package.json) and "runs the web tests … as installed". The PR describes exactly these as "red at the base but not counted".
- All 31 fail on an assertion.
- **Scenario:** A reader checking §3.3.3's evidence finds 29 behaviour reds, not 31, and doubts the rest of the record.
- **Fix proposed:** State 29 behaviour reds plus the 2 node_modules readers (31 in all), or list the reds by name.

## Not checked

- The apt cache with real restored files on CI. Pull-request runs never save, so this run's verify only ever saw an empty directory (0 kept, 0 discarded). collect and save run only on build-branch runs. Ubuntu 26.04 serves amd64v3 index variants ("resolute/main amd64v3 Packages"), and I could not check the `name:arch=version` lookup against them. I verified the parse and lookup on Ubuntu 24.04's apt only.
- Whether the apt cache removes the mirror stall. unit's `playwright install --with-deps` took 8m29s on this run ("Fetched 14.1 MB in 8min 9s (28.8 kB/s)"); that can only be measured after a build-branch push has saved the cache.
- Whether a matrix job's distinct per-leg outputs survive across release.yml's four legs. I relied on GitHub's documented behaviour (outputs from all matrix legs are combined) and actionlint's parse; no pull-request run exercises it (CI-3).
- The baseline step's actual bytes on ubuntu-26.04 (the seven SHA-256s), and the ADR 0058 host-independence proof: blocked by CI-2. The brand journey's own comparisons did pass on 26.04 within tolerance (both e2e shards: 27 passed each).
- The fix proposals for CI-1 and CI-2, end to end on CI. I showed locally that reading as root gives the recorded tree, and that Playwright 1.64.1 honours snapshotDir, but I ran neither changed step on a runner. No Docker daemon is available here, so I could not build the worker image.
- The release-capacity dispatch the PR plans on 26.04, and the dispatched screening-capacity probe: neither has run. Both reach the same --image step, so CI-1 will hit them.
- Whether shellcheck's info-level SC2094 on print-pictures.sh matters: it is a false positive, since the line only assigns an environment variable. CI runs no shellcheck.
