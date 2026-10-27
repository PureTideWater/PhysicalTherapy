# PR #77 (ci-browser), Security and supply-chain review, on 367a659f

Workflow wf_7b903031-7ca (`workflow-scripts/lane-b-ci-browser-reviews-wf_7b903031-7ca.js`), a fresh clone, read-only on GitHub. Dispositions are in the fix round's summary.

## Summary

Security and supply-chain review of PR #77 (e908c21..367a659f). I worked in a fresh clone at /home/user/review-sec, detached at 367a659f, and read CI for the head using GET calls and get_job_logs only.

What holds:
- **The five bumped packages.** I ran `npm view` for each. Every dist.integrity equals its lockfile line, each is npm `latest`, each was published 2026-10-05 to 10-15, and each carries `_npmUser.trustedPublisher` and SLSA v1 provenance. The 1.56.1 and 4.13.0 versions had the same publisher UUIDs with an `oidc:` prefix, so no trust evidence was lost.
- **The lockfile.** Its package keys change only by the five version swaps and the removal of `fsevents@2.3.2`. playwright 1.64.1 has no optional dependency, and nothing transitive is new. `pnpm-workspace.yaml` gains only the catalog line; its gates, excludes and override are untouched.
- **The toolchain check.** `BASE=origin/claude/build-platform pnpm toolchain:check`, networked, passed with 0 errors. It counts 5 added versions, and each passes the age, integrity and trust rules on its own evidence.
- **The browser record.** I downloaded both Chrome for Testing 156.0.8078.4 zips from storage.googleapis.com. Both zipSha256 values match. I recomputed both tree SHA-256s and both binary SHA-256s from the zip members, and both match `browser.json`. Both `browser-builds/*.sha256` lists are byte-identical to the lists built from the zips. CI's runner install (from Playwright's mirror) also matches: the unit job shows 287 and 301 files, "equal to browser.json in every file".
- **The browser check on a runner.** On a layout built from Google's zips it passes. A symlink or FIFO in a build fails it. An empty directory, a file beside the build directory, or a hard link to identical bytes passes, which is harmless.
- **The apt cache.** The trust argument holds:
  - apt really does accept a file already in its archive directory by size alone.
  - verify binds each file to the signed index's SHA-256 for that exact name:arch=version, using regex-checked names, before any `sudo cp`.
  - The save runs only off pull_request. A poisoned entry from any scope is deleted rather than reaching apt.
- **The release binding.**
  - Each matrix leg writes per-image output names, the pattern GitHub documents.
  - `sha256sum --check` against `needs.build.outputs` comes before every `docker load` in release.yml and the dry run.
  - The store-aware `.Id` compare runs for all four images before the first push, and the registry is read back after the push.
  - `push` and `report` run no checkout, Node or pnpm.
  - Setting provenance/sbom to false loses nothing: the classic-store push never carried attestations, and attest-build-provenance in `report` is unchanged.
- **Workflow injection.** No new `run:` interpolates `github.event.*`; values pass through `env`. `inputs.runner` reaches only `runs-on` as a choice input, and no checkout dropped `persist-credentials: false`.
- **The worker image.** The installed playwright-core holds 115 regular files, no symlinks and no dependencies, so `cp -RL` cannot reach outside the package. npm, npx and corepack are still removed. Taking playwright-core from the frozen lockfile is an improvement on the old unpinned `npm install`.
- **PHI and the #42 list.** The diff holds no PHI or model identifier, the baselines are synthetic pictures with no PNG text chunks, and the overlap with #42 is limited to Q2 and rule 6 files.

Verdict: not mergeable at this head. CI is red on two of this PR's own steps:
- `images` (and so `all green`) and screening-capacity's capacity (and so the required `screening-capacity gate`) fail at `browser-build.ts --image`. The check runs as the image's user `node`, which cannot read two files Google ships as 0600. The record itself is correct.
- The baseline step fails because build-stamp refuses the tree the step itself dirtied.

Two should-fix gaps in the check:
- The image script silently drops files it cannot read.
- `--version` is never gated, so a headless shell that cannot run passes.

Three nits: image-id.ts robustness, a probe comment that gives the wrong reason, and `docker run` hardening.

## Findings

### SEC-1 (blocking; reproduced): The worker image's browser check runs as the image's user `node`, which cannot read deb.deps and rpm.deps, so `--image` is red in images, screening-capacity and the release build

- **Where:** tools/ci/browser-build.ts:220-221 (docker run with no --user; apps/worker/Dockerfile:51 USER node)
- **Evidence:** CI run 40534270846, images job 122295114367 (get_job_logs), step "The worker image's headless shell is browser.json's":
- `sha256sum: chrome-headless-shell-linux64/deb.deps: Permission denied` and the same for rpm.deps.
- "285 files ... tree SHA-256 9e0636c8… ... 2 files differ ...: chrome-headless-shell-linux64/deb.deps (removed), chrome-headless-shell-linux64/rpm.deps (removed)".
- Run 40534270804, screening-capacity's capacity job 122295205972, fails at the same step, so the required `screening-capacity gate` is red.
- The binary SHA-256 inside the image equals the record's (4fa61f0b...).

Root cause, read from Google's zips (python zipfile): both zips store deb.deps and rpm.deps as mode 0600. The Dockerfile extracts them as root, and `docker run` runs the check as USER node.

Reproduced locally with a stand-in docker that runs IMAGE_SCRIPT without DAC capabilities, over a layout unzipped from Google's zips with the two files owned by another uid: it prints CI's exact tree 9e0636c8... and exits 1. The record is right: the zips' members hash to treeSha256 333985b3... and 2f991090..., and the runner's install in unit job 122295114330 shows 287 and 301 files "equal to browser.json in every file".
- **Scenario:** Today, every pull request is red, both on `all green` (through `images`) and on `screening-capacity gate` (whenever the gate measures).

On the founder's release tag, release.yml's build runs `node tools/ci/browser-build.ts --image "$REF"` in the worker leg, which fails. `push` and `capacity` both need `build`, so no image is pushed, the web images included, and no capacity report is made.

release-capacity's weekly run fails at its new `--image` step and opens the advisory issue.

A tempting "fix" that weakens the trust anchor is to follow ci.md's "Upgrading the browser" and adopt CI's 285-file tree as the record, or to exclude the two files.
- **Fix proposed:** Leave `browser.json` and the file lists as they are; they equal Google's published bytes.
- In `imageBuild`, run both `docker run` calls with `--user 0:0`. The check proves the bytes present in the image, whoever the runtime user is.
- If SEC-4 is taken, keep the `--version` run as the image's own user, so it also proves the runtime user can start the shell.
- Add a browser-build.test.ts case whose stand-in docker cannot read a recorded file and must fail with a message naming it.
- Do not exclude the files, and do not chmod them in the Dockerfile only to make the check pass.

### SEC-2 (blocking; reproduced): The baseline step deletes the committed PNGs, so build-stamp refuses the dirty tree and no baseline is written; the fix must not relax build-stamp

- **Where:** .github/workflows/ci.yml:611 (rm -f before the regeneration); apps/web/scripts/build-stamp.ts:55-60
- **Evidence:** CI run 40534270846, e2e (1/2) job 122295919449, step "The brand baselines, regenerated from nothing":
- `[WebServer] build-stamp: the working tree has uncommitted changes (D apps/web/e2e/brand.spec.ts-snapshots/header-1280-chromium-linux.png, ...`
- `Error: Process from config.webServer was not able to start. Exit code: 1`
- `##[error]the run wrote 0 baselines from nothing, not the 7 committed`

build-stamp.ts:59 refuses any tree with uncommitted changes, because "a stamp names a commit, so it vouches only for a build of a clean tree". playwright.config.ts:72 runs it with `--expect "$(git rev-parse HEAD)"` whenever E2E_PREBUILT is set, which the step sets.
- **Scenario:** On every pull request and push, e2e shard 1 is red, `all green` is red, and the host-independence proof (ADR 0058) is never made.

The security risk is in the fix round: the shortest fix is to let build-stamp ignore changes under the snapshot directory, or to drop E2E_PREBUILT for this step. The first opens a hole in the control that proves the e2e build is the commit's build. The second builds an unstamped app in the job.
- **Fix proposed:** Keep the checkout clean, so build-stamp's refusal stays exact:
- Have playwright.config.ts take `snapshotPathTemplate` from an env var (for example BRAND_BASELINES_DIR, set to $RUNNER_TEMP/baselines). Untracked files inside the checkout also count as dirty, so the directory must be outside it.
- Run `--update-snapshots=all` with that variable set, then compare the written set and bytes with `git ls-files` of the committed PNGs using `cmp`.
- Print the changed pictures from the temporary directory with tools/ci/print-pictures.sh.
- Add a workflows.test.ts rule that the step never deletes or changes a tracked file.

### SEC-3 (should-fix; reproduced): The image check swallows sha256sum read errors, so an added file the checking user cannot read passes as "equal to browser.json in every file"

- **Where:** tools/ci/browser-build.ts:213 (IMAGE_SCRIPT's `find | sort -z | xargs -0r sha256sum | sed`, run by POSIX sh with no pipefail)
- **Evidence:** Using the same stand-in docker as SEC-1 (setpriv without dac_override and dac_read_search), with the recorded files readable plus an added `libadded.so` (mode 0600, owned by another uid): the output is `sha256sum: chrome-headless-shell-linux64/libadded.so: Permission denied`, then "287 files ... tree SHA-256 333985b3...", then "The headless shell: equal to browser.json in every file", rc=0.

xargs's exit status 123 is masked by sed's 0, and `set -eu` has no pipefail in dash. The runner mode fails closed in the same situation, because readFileSync throws and the check reports "could not be checked".
- **Scenario:** An image whose headless-shell directory gains a root-only file passes the `--image` check. Examples are a cached layer with a stray file, or a future Playwright or Dockerfile change. The check then claims "every file" while the file was never hashed.

The practical impact is small today, because the runtime user cannot read such a file either. But the check is the trust anchor for the shell that prints customers' PDFs, and with SEC-1's `--user 0:0` the same masking would hide any other read failure (for example an I/O error) as a "removed" line or as nothing.
- **Fix proposed:** Make a read failure fail the check:
- In IMAGE_SCRIPT, add `find "$dir" -type f ! -readable -exec printf 'other %s (unreadable)\n' {} \;` before hashing. GNU find in the Debian image supports `-readable`.
- Also, or instead, write the sums to a file and test xargs's status: `... | xargs -0r sha256sum > /tmp/sums || echo 'other (sha256sum failed)'`.
- Add the browser-build.test.ts case above, where an added unreadable file must fail.

### SEC-4 (should-fix; reproduced): The browser check never gates on `--version`: a headless shell that cannot start passes, and no pull-request job ever launches the worker image's shell

- **Where:** tools/ci/browser-build.ts:274 (`equal` ignores `found.version`); :191-198 and :214 (version only printed)
- **Evidence:** Runner mode, on the layout from Google's zips with `chmod a-x` on the binary: "The headless shell: --version failed: spawnSync .../chrome-headless-shell EACCES", then "The headless shell: equal to browser.json in every file", rc=0. Setuid and other mode changes also pass, since modes are not hashed.

Image mode (stand-in docker), with the binary not executable: "The headless shell: not run: no binary at the recorded path", then "equal to browser.json in every file", rc=0.

The worker launches the shell only in apps/worker/src/report/pdf.ts. Screening's capacity run prints no PDF, so only the weekly, advisory release-capacity run exercises the worker image's shell before production.
- **Scenario:** Suppose a base-image digest bump or a Playwright `--with-deps` list change leaves the trixie image without a shared library the headless shell needs.
- The bytes still equal the record, so `images` passes, release.yml's build passes, and the image ships.
- The audit report's PDF job fails in production with "error while loading shared libraries", even though the check's output said the browser was proven.
- **Fix proposed:** Fail the check unless the version line equals `Google Chrome for Testing ${record.browserVersion}`, in both modes.
- In `--image` mode, run the version command as the image's own user, so it also proves the runtime user can start the shell, and the hashes as root (SEC-1).
- State in the doc comment that modes are not covered, and why that is acceptable: the hash covers bytes, and the version gate covers whether the shell can run.

### SEC-5 (nit; reproduced): image-id.ts ignores pax `size` records and keeps pax and long-name entries and small entries in memory with no total bound

- **Where:** tools/screening-capacity/image-id.ts:132 and :138 (also :111)
- **Evidence:** A crafted tar whose config entry carries `size=86` in a pax header, with a ustar size field of 0 (how Go's archive/tar writes any entry over 8 GiB):
- `tar -tvf` and Python's tarfile both read 86 bytes.
- image-id reads 0 bytes and refuses: "the config's bytes hash to sha256:e3b0c442..., not to the sha256:519bbf44...".

A 1.9 MB .tar.gz holding a 400 MB pax 'x' header drives image-id to a peak RSS of 1,250 MB (baseline 87 MB) before it refuses with "a pax header record is malformed". Both cases fail closed. No file is written, so path traversal cannot apply, and a config whose bytes do not match its name is refused (image-id.test.ts).
- **Scenario:** Two cases:
- An image with a layer over 8 GiB is misframed and refused, so the release cannot record its identity.
- An archive with a huge pax header, or many entries of up to 4 MiB, exhausts the runner's memory before a clear refusal.

The archives come from trusted builds in the same job, so this is robustness, not a bypass. The daemon's `.Id` compare still binds what is loaded.
- **Fix proposed:** Take `size` from a pax 'x' record when present (Go and GNU tar honour it), as `path` already is. Cap the bytes kept for an 'x', 'L' or 'g' entry (for example 1 MiB) and the total kept across entries (for example 64 MiB), each with an ImageArchiveError naming the limit. Add a test for each.

### SEC-6 (nit; verified-by-reading): screening-capacity.yml says the launch check refuses the 26.04 probe's report "for its runner image", a refusal deferred until after #42

- **Where:** .github/workflows/screening-capacity.yml:26-28
- **Evidence:** The comment reads "a dispatched 26.04 run opens no issue, and the launch check refuses its report for its runner image." Running `grep -n -i "imageOS\|imageSource\|ImageVersion\|runner image" tools/screening-capacity/launch-check.ts` finds no such check; the PR description defers "the launch check's runner-image refusals" to the follow-up after #42.

launch-check.ts:405-407 and ADR 0066:760 give the real reason: the report is not release.yml's attested run (the `--signer-workflow` and `--source-ref refs/tags/<tag>` checks at launch-check.ts:586-589).
- **Scenario:** Someone reasoning from the workflow comment believes the launch check would refuse a 26.04 report even from release.yml. Until the follow-up lands, nothing refuses on the runner image; the protection is the workflow identity alone, plus classic-store `.Id` semantics.
- **Fix proposed:** Reword the comment to "...and the launch check refuses its report, which is not release.yml's attested run (the runner-image refusal lands after #42; docs/adr/0066, Part 3)".

### SEC-7 (nit; verified-by-reading): `browser-build.ts --image` runs the image with network access and the default pull policy

- **Where:** tools/ci/browser-build.ts:220-221
- **Evidence:** `docker(['run', '--rm', '--entrypoint', 'cat', ref, ...])` and `docker(['run', '--rm', '--entrypoint', 'sh', ref, '-c', IMAGE_SCRIPT, ...])` pass no `--network none` and no `--pull never`. The script also runs the shell's `--version` before the host compares any hash.
- **Scenario:** Today every caller loads the tag first, so neither option changes a result. Two later edits would matter:
- One that runs the check before the load in release.yml would make docker pull `ghcr.io/.../worker:<tag>` from the registry and verify that image instead of the build's.
- The shell, not yet verified, runs with network access on a runner that is building release images.
- **Fix proposed:** Add `--network none --pull never` to both calls; the check reads only local files. This can go in with SEC-1's `--user 0:0` change, and the stand-in docker in browser-build.test.ts can assert the flags.

## Not checked

- I could not run Docker here, so the worker image itself was not built or inspected locally. SEC-1 and SEC-3 are reproduced through CI's own logs and a stand-in docker that runs the image script over a layout unzipped from Google's zips.
- I did not check whether GitHub validates `workflow_dispatch` choice inputs sent through the API. If an unlisted value got through, it would only pick a `runs-on` label, and only someone with write access can dispatch.
- I did not test whether a matrix leg's empty outputs could overwrite another leg's. GitHub's documentation gives the unique-name-per-leg pattern this PR uses, but no pull-request run exercises release.yml's four-leg merge; release-dry-run builds the web image alone. If it misbehaves, push fails closed with "recorded no identity".
- I did not read the containerd-store `.Id` and `docker info` driver-type behaviour on 26.04 beyond the images job's log line "loaded as sha256:2e0e508c... on the containerd image store", which shows it working for the worker.
- I did not review the documents' prose (ADR 0058, 0062, 0063 and 0066, ci.md, the runbooks) line by line. I grepped them only for the probe-refusal wording, PHI, secrets and model identifiers.
- Cache-tarball path poisoning (actions/cache extracting entries outside `path`) applies to every cache in these jobs, the existing Playwright and pnpm caches included. This PR does not change it, and release.yml restores no cache, so I did not pursue it.
- I did not re-run the full local suites (typecheck, lint, unit, e2e). That is outside this review's scope, and CI's run at the head was read instead.
