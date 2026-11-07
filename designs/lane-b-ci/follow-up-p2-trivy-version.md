# P2 `co-001/ci-trivy-version`: Trivy at its latest release, installed from verified bytes, with the hijacked-tag check

Design step only; nothing built, committed, pushed or posted. Written 2026-10-26 ~02:00 UTC and revised after its review
(~02:30 UTC, the last section) against `claude/build-platform` 6ddd587, plus ci-deps' design (§3.2, with §3.2.1, §3.2.6
and §3.2.7) and what its builders have written so far in `/home/user/ci-deps` (head 19e3d98e, still moving), plus
ci-browser's design (§3.3). Cut from the build branch once both have merged. It follows §3.2.6's P2
(`designs/lane-b-ci.md:1533-1534`) and the co-founder's ruling of 2026-10-26 ~00:20 UTC (recommended option on every
choice; for security, the safer one). No migration. Reserved: ADR 0066 **Part 6**; test-matrix and synth cases
**CI-24 to CI-26** (all three used).

Cites: `6ddd587:` is the build branch, `ci-deps:` is `/home/user/ci-deps` at 19e3d98e (the one commit since 2d86bb0e
touches only `tools/test/workflows.test.ts:7, 1901-1912`; no cite below moved). (12) Every cite is re-mapped to bce57f16
in 12.2, and §12 governs where it and §1 to §11 differ; 12.10 folds the re-read's review, 12.11 the completeness
critic's gaps, and §13 lists each finding's and each gap's disposition. (14) §14 re-reads the plan on 8a722f80
(2026-11-07) and governs where it and §1 to §13 differ; §15 lists its review's dispositions. The network facts were read on 2026-10-26
between 01:40 and 02:55 UTC with `git ls-remote`, `curl` against github.com release downloads,
raw.githubusercontent.com, ghcr.io and mirror.gcr.io (anonymous), `npm view`, and a local run of `@sigstore/verify`
against the real bundle (`scratchpad/p2rev/run/v2.mjs`).

---

## 1. Goal and acceptance

**Goal.** Every image verdict and the release's bill of materials are made by the newest Trivy that is at least three
days old. The binary is the exact bytes whose SHA-256 the repository commits. Its signature and its tag were checked when
that SHA-256 was written. A tag hijack like March 2026's cannot change what CI runs, and on a push run it is reported.

| # | Target | How measured |
|---|---|---|
| T1 | Every scan and the SBOM run Trivy **v0.76.1** (or a newer release at least three days old when the branch is cut), never trivy-action's default v0.70.0 | the `images` and release-dry-run logs' `trivy --version` line; `workflows.test.ts` |
| T2 | One source of record: `tools/trivy/release.txt` holds the version, the tag's commit, the signing time and the Linux x64 tarball's SHA-256. No workflow, Dockerfile, README or CLAUDE.md line repeats the version. (14) It holds each Linux archive's SHA-256 (x64 and arm64), and the signing time is that of the release's checksums file (14.8, E18, E19) | `no-duplicated-versions.test.ts` |
| T3 | The installed bytes equal the committed SHA-256 before anything runs them, whether downloaded or restored from cache. A mismatch fails the job, naming both digests. (14) No Trivy archive is cached, so every job downloads (14.8, E22) | `tools/trivy/install.test.ts`, which runs the script against stub downloads |
| T4 | A pull request that changes `release.txt` (or the checker) proves five things: the tag still names the recorded commit; the tarball's Sigstore bundle verifies, against Sigstore's trust root, as signed by trivy's own release workflow at that tag and commit; the signed digest equals the committed SHA-256 and the release's `checksums.txt` line; the release was signed at least three days ago; the version is not one CVE-2026-33634 names. (12) Also: a `vX.Y.0` commit is on the default branch, and a later patch's on `release/v<X.Y>`, which holds `vX.Y.0`'s (12.10, S6); the certificate's repository and owner IDs, runner, trigger and calling workflow are Trivy's, and its SAN matches exactly (12.10, S1, N12); the version is at least 0.72.0 and, on CI, no reviewed advisory names it; on CI the release is immutable and its `published_at` three days old (12.5). (14) The signed object is the release's checksums file, not the tarball, and each committed archive digest must equal its line in that file (14.8, E18, E19); the age is the youngest of every time 14.3 item 3 reads | `pnpm actions:check` in `static`; `tools/check-action-pins/trivy.test.ts` |
| T5 | On every push run, warnings and never a failure: (12) the pinned release withdrawn (deleted, the expected case) or not immutable, or its tag moved (rare under an immutable release), or an advisory now naming it; a newer release that passes every check is at least three days old; (12) a newer release past the floor fails a check of a pin, named (12.10, S5); any of those reads failed | the same, push mode |
| T6 | No `aquasecurity/*` action runs in any workflow (trivy-action and setup-trivy retired, §7 C1) | `workflows.test.ts` |
| T7 | The vulnerability database is downloaded once per job, from the publisher's registry (ghcr.io) only, before any scan; it is under 48 hours old; its repository, `UpdatedAt` and `DownloadedAt` are printed in the job summary; the scans read that database, and (12) neither it nor the Java database is updated by a scan (`--skip-db-update`, `--skip-java-db-update`; 12.10, S3) | `tools/trivy/db.sh`; the summary; `workflows.test.ts` |
| T8 | Telemetry and Trivy's update check are off in every run | `workflows.test.ts` (the env on every job that runs Trivy; (14) on every step that runs Trivy, 14.8, E30) |
| T9 | (12) No file in the checkout changes a verdict: every `trivy` command, (12) the scripts' own included, passes `--config ''`, every scan `--ignorefile ''`, `--secret-config ''` and `--scanners vuln,secret`, and no other `TRIVY_*` variable is set (12.10, S4; 12.11, G1) | `tools/check-action-pins/trivy.test.ts`; `workflows.test.ts`; (12) the stub `trivy` of `install.test.ts` and `db.test.ts` |

## 2. The facts this rests on

- **What runs today.** (12) At bce57f16 there are five trivy-action steps, all `ed142fd…` (v0.36.0), each with `cache:
  false` and a `cache-dir` under `runner.temp`: `ci.yml:695, :720` (`images`, scanning archives through `input:`),
  `release.yml:121, :132` (scan and SBOM, `image-ref: ${{ steps.image.outputs.ref }}` at `:123, :134`), and
  `release-dry-run.yml:132` (the SBOM on both legs; it does not scan). Push run 41330911483's `images` job ran v0.70.0
  and pulled the database from `mirror.gcr.io/aquasec/trivy-db:2` (12.1). trivy-action v0.36.0 defaults `version` to
  `v0.70.0` (`action.yaml:98-101` at `ed142fd`). Its latest tag is still v0.36.0 (`git ls-remote --tags
  https://github.com/aquasecurity/trivy-action`).
- **The latest Trivy.** `git ls-remote --tags https://github.com/aquasecurity/trivy` lists nothing newer than v0.76.1.
  Its tag is lightweight, naming `e713f67f7d54decdcd9b3132c9751833dcced698` ("release: v0.76.1 [release/v0.76]
  (#11445)", committed 2026-10-21T10:20:32Z, read from a depth-1 fetch). Its assets:
  - `trivy_0.76.1_Linux-64bit.tar.gz` has SHA-256 `c7cbe3137fb8a48a17574bede3dd6beb16742d1e9772929940fc90082c39d9c0`.
    That value is in `trivy_0.76.1_checksums.txt`, it is the tarball as downloaded (52,676,794 bytes, redirected to
    `release-assets.githubusercontent.com`), and it is the `messageDigest` of `…tar.gz.sigstore.json`.
  - The bundle (`application/vnd.dev.sigstore.bundle.v0.3+json`) carries a Fulcio certificate for
    `https://github.com/aquasecurity/trivy/.github/workflows/reusable-release.yaml@refs/tags/v0.76.1`. Its issuer is
    `https://token.actions.githubusercontent.com` (extension …57264.1.1); its source commit is `e713f67…` (.1.3 and
    .1.13) and its source ref `refs/tags/v0.76.1` (.1.6 and .1.14). It has one Rekor entry, with promise and inclusion
    proof, `integratedTime` 1792581276 = 2026-10-21T11:14:36Z, and one RFC 3161 timestamp. So the release is three days
    old from 2026-10-24T11:14:36Z.
  - **The bundle verifies.** `@sigstore/verify` 4.1.2 with the trusted root embedded in `@sigstore/tuf` 5.0.0's
    `seeds.json`, and policy `{subjectAlternativeName: …@refs/tags/v0.76.1, extensions: {issuer}}`, returns OK on the
    real tarball; the same with `…@refs/tags/v0.76.0` fails `UNTRUSTED_SIGNER_ERROR`; a truncated tarball fails
    `SIGNATURE_ERROR`.
  - For comparison, the Linux-64bit bundles' `integratedTime`: v0.76.0 2026-10-14T11:43:12Z, v0.70.0
    2026-04-17T06:45:20Z, v0.69.3 2026-03-03T13:10:30Z.
- **How setup-trivy installs it** (`action.yaml` at `3fb12ec`, setup-trivy v0.2.6, which trivy-action nests at
  `action.yaml:129`):
  1. It checks out `aquasecurity/trivy` at a pinned `75c4dc0…` with the job's `github.token` (`:64-75`).
  2. It runs that commit's `contrib/install.sh` (`:85`).
  3. The script resolves the tag through `https://github.com/<repo>/releases/<tag>` (`install.sh:304-313`), then
     downloads the tarball from a third host, `https://get.trivy.dev/trivy?…&client=setup-trivy` (`:390-392`).
  4. It checks the tarball only against the `checksums.txt` of the same release (`:59-61, 334-350`). That is the same
     publisher and the same credentials, so it catches corruption, not a malicious release. It verifies no signature.

  **No `version:` value can hold the binary to a known-good checksum.** The input is a tag name, and the checksum
  comes from the release the tag names.
- **March 2026 (CVE-2026-33634).** On 2026-03-19 an attacker with stolen credentials published a malicious Trivy
  **v0.69.4**. The attacker also force-pushed 76 of 77 trivy-action tags (0.0.1 to 0.34.2) and every setup-trivy tag
  (0.2.0 to 0.2.6) to commits whose `entrypoint.sh` stole runner secrets before the real scan. Malicious Docker Hub
  images `aquasec/trivy:0.69.5` and `0.69.6` followed on 2026-03-22. The safe versions named are Trivy 0.69.2 and
  0.69.3, trivy-action 0.35.0 and setup-trivy 0.2.6, the last recreated on a safe commit. (12) The source of record is
  GHSA-69fq-xp46-6x23, read from github/advisory-database at 8c754a94 on 2026-11-01: its Go range is 0.69.4 alone;
  0.69.5 and 0.69.6 were Docker Hub images with no GitHub tag or release; v0.69.4 was built and signed by Trivy's own
  release pipeline from an attacker-pushed tag on `1885610c`, which the attacker had also committed to a `v0.70.0`
  branch (no tag or release was pushed for it), so branches could be pushed (12.10, S6); immutable releases were on for
  trivy from 2026-03-03 and for trivy-action from 2026-03-04 (12.3). Part 6 cites it. What I checked today:
  - `releases/download/v0.69.4|5|6/…checksums.txt` return 404 and v0.69.3 returns 200;
  - ghcr.io `aquasecurity/trivy` manifests 0.69.4 to 0.69.6 return 404;
  - the trivy tag list skips v0.69.4;
  - setup-trivy now has only v0.2.6 (`3fb12ec…`, the SHA trivy-action v0.36.0 pins), v0.3.0 and v0.3.1.

  Our `ed142fd…` is v0.36.0, tagged 2026-04-22, after the incident, so nothing we run today was hijacked. The lesson for
  this PR is about mechanisms: a tag can be moved, and a release can be published by someone holding stolen
  credentials. A real release passes a signature check, because it was built by the real workflow. What stops it is an
  age floor (v0.69.4 was withdrawn within the day) and a committed hash (no later swap changes what we run). The
  response was to delete the release, so a pinned release can also vanish (§10).
- **The database.**
  - Trivy v0.76.1 pulls `mirror.gcr.io/aquasec/trivy-db` and then `ghcr.io/aquasecurity/trivy-db`, in that order,
    appending its own schema tag (`pkg/flag/db_flags.go:53-64`, `parseRepository` `:176-193`; `pkg/db/db.go:31-36`).
    Upstream put the mirror first for anonymous-pull limits. A slice env var splits on commas (`options.go:191-199`).
  - It moves to the next repository only when `shouldTryOtherRepo` holds: a temporary transport error (408, 429, 5xx)
    or `BLOB_UNKNOWN` (`pkg/oci/artifact.go:287-339`). A DNS, TCP or TLS failure, `DENIED` or `UNAUTHORIZED` stops.
    The repository used is logged only as `Artifact successfully downloaded repo=…` (`artifact.go:293`); `trivy version
    --format json` reports `VulnerabilityDB {Version, NextUpdate, UpdatedAt, DownloadedAt}` and no repository
    (`trivy-db pkg/metadata/metadata.go:14-19`).
  - Read at 01:44Z: ghcr's manifest `sha256:df325ede…` (created 2026-10-26T01:27:52Z) and mirror.gcr.io's
    `sha256:0606bd7a…` (01:27:57Z) differ only in that annotation. Both carry the same layer, `db.tar.gz`
    `sha256:2d38f551b770bc3e6559af214fc4dbf5f463bcbc6aebafbe897865331dd32f47` (136,318,192 bytes), checked by the OCI
    client against the manifest. Neither registry has a signature: ghcr's tags are `1`, `2` and `latest`, with no
    `sha256-….sig`, and the referrers endpoint returns MANIFEST_UNKNOWN.
  - mirror.gcr.io is Google's pull-through mirror of Docker Hub's `aquasec` namespace, the namespace whose `trivy`
    images were poisoned on 2026-03-22.
  - The database is rebuilt about every six hours, so a digest pin would freeze the verdict's knowledge (§7 C3).
  - The Java database (`pkg/javadb/client.go:31-34`) is pulled only when a scanned image holds JARs; ours hold none
    today, but its repository is set the same way so a future JAR cannot pull from the mirror. (12) It is pulled
    mid-scan by the JAR analyzer (`pkg/fanal/analyzer/language/java/jar/jar.go:47-58` at v0.76.1), with no freshness or
    repository check, so every scan passes `--skip-java-db-update` and a JAR fails the scan with Trivy's own first-run
    message (12.10, S3).
- **What ci-deps' `cache: false` means for it.** trivy-action's `cache` gates its own `actions/cache` of the database
  (`action.yaml:140-146`) and setup-trivy's restore and save of the binary (`setup-trivy action.yaml:53-59, 98-103`).
  With `cache: false`, every job downloads the binary and the database itself; both scans in one job share the
  database through `cache-dir` (`ci-deps:ci.yml:514, 537`). `check-action-pins`' nested-cache rule for release.yml
  (`ci-deps:tools/check-action-pins/verify.ts:113-181`) then has no Trivy chain to follow, and it stays for every other
  action. `docker://` refs are already refused (`ci-deps:tools/check-action-pins/workflows.ts:101`).
- **The repository already pins one upstream binary:** gitleaks, `6ddd587:tools/gitleaks/install.sh` and `release.txt`
  (`pnpm gitleaks:install`, `package.json:18`). A `key value` text file beside the script; a GitHub release download; a
  SHA-256 check before extraction, with the message "`<archive>` has SHA-256 X, not the Y that `<file>` pins"; `tar …
  gitleaks` alone; an atomic move. P2 follows that form (C2). gitleaks has no tag, signature or age check (Revisit).
- **The checker's transport reads text.** (12) `get(url, signal?, headers?)` returns `{ status, text, headers }`
  (`network.ts:27-31, :62`) through `await response.text()` (`:199`, a 30 s limit at `:98`); the live transport is
  `gitTransport` (`:109`). A gzip decoded as UTF-8 is corrupted.
- **Telemetry.** Trivy collects usage telemetry by default and calls `check.trivy.dev` for updates, unless
  `--disable-telemetry` and `--skip-version-check` are both set (`docs/guide/advanced/telemetry.md` at v0.76.1).
- **Dependabot cannot bump it.** Its github-actions ecosystem rewrites only `uses:` lines (§3.2.7 S3). A text file is
  not a manifest any ecosystem parses.

## 3. What changes

- **`tools/trivy/release.txt`** (new), the one source, in gitleaks' form:
  ```
  # The Trivy release every image scan and the release's bill of materials run (docs/adr/0066, Part 6), written by
  # pnpm trivy:pin, never by hand: the tag's commit, its verified signing time, and the SHA-256 of the one
  # archive CI downloads. A new version changes every line here in one pull request.
  version 0.76.1
  commit e713f67f7d54decdcd9b3132c9751833dcced698
  signed_at 2026-10-21T11:14:36Z
  linux_x64 c7cbe3137fb8a48a17574bede3dd6beb16742d1e9772929940fc90082c39d9c0
  ```
  The tag is `v<version>`; the asset name (`trivy_<version>_Linux-64bit.tar.gz`) and the URL are derived, never written.
  (12) `signed_at` is the verified signing time of 12.10, S5: the Rekor entry's `integratedTime` when it carries a
  promise, as for v0.76.1, otherwise the one verified RFC 3161 time.
- **`tools/trivy/install.sh <dir> [<archive-dir>]`** ((12) the second argument, 12.10 N10; new; `set -euo pipefail`;
  mirrors `tools/gitleaks/install.sh` line for line where it can, reading the file with `awk`, so no `jq`):
  - Linux x86_64 only; anything else fails "trivy: `<file>` pins no release for `<os> <arch>`". Trivy runs only in CI.
  - (12) The archive is looked for in `<archive-dir>` (default `<dir>`; no `TRIVY_*` variable, 12.10 N10); when absent
    it is downloaded from `https://github.com/aquasecurity/trivy/releases/download/v<version>/<asset>` with `curl -fsSL
    --proto '=https' --tlsv1.2 --retry 3 --max-time 300`. That is GitHub's release host, not get.trivy.dev.
  - It hashes the archive **every time, restored or downloaded**, and refuses a mismatch with gitleaks' message shape
    naming both digests; only then extracts `trivy` alone into `<dir>` and moves it into place atomically.
  - It requires the `Version:` line of `trivy --version --config ''` ((12) so no `trivy.yaml` in the working directory
    is read; 12.11, G1) to equal `version` (the file holds no `v`; the comparison is literal, `Version: 0.76.1`),
    appends `<dir>` to `GITHUB_PATH`, and prints the binary's path.
- **`tools/trivy/db.sh`** (new): run once per job, before any scan.
  - `trivy image --download-db-only` with the job's env (12) and `--config '' --cache-dir "$1"`, never `--quiet` (12.10,
    N4, S4), tried three times with a 10 s and a 30 s pause; stderr is kept. It fails, naming `ghcr.io` (12) and
    `pkg-containers.githubusercontent.com`, which serves ghcr's blobs, after the third.
  - (12) It reads the line Trivy logs at INFO, `[vulndb] Artifact successfully
    downloaded<TAB>repo="<repository>:<schema>"` (`pkg/oci/artifact.go:290-293`; job 124920631345 log `:1888`), and
    fails unless one such line names `repo="ghcr.io/aquasecurity/trivy-db:<digits>"` (12.10, N4). It does not touch the
    Java database (`run.go:325-342`).
  - It reads `trivy version --format json --config '' --cache-dir "$1"` ((12) the database it just downloaded, and no
    `trivy.yaml`: without `--cache-dir` the call reads Trivy's default cache, which holds no database; 12.11, G1) with
    `jq -r` (jq 1.7.1 on ubuntu-24.04 and 1.8.1 on 26.04 both read this), and fails when `VulnerabilityDB` is absent or
    its `UpdatedAt` is over 48 hours old, which guards against a stale or replayed database.
  - It writes the version, the repository, `UpdatedAt` and `DownloadedAt` to `GITHUB_STEP_SUMMARY`.
- **Every scan runs the CLI.** In `ci.yml` `images`, `release.yml` `build` and `release-dry-run.yml` `build`, (12)
  every trivy-action step is replaced:
  1. `Install Trivy (tools/trivy/release.txt, its SHA-256 checked)` ((12) `id: trivy`): `run: tools/trivy/install.sh
     "$RUNNER_TEMP/trivy-bin"`. In `ci.yml` only, an `actions/cache/restore` (`55cc834…`, v6.1.0, already pinned at (12)
     `ci.yml:147`) before it and an `actions/cache/save` after it keep the archive under `$RUNNER_TEMP/trivy-archive`
     ((12) the install step's second argument, and a restore with no `restore-keys`; 12.10, N6, N10), (12) keyed
     `trivy-v1-${{ hashFiles('tools/trivy/release.txt') }}` and saved on a push only, in the `APT_SAVE_IF` form (12.7,
     E11). The script re-hashes what is restored, so a cache can only save a download, never change the bytes.
     release.yml and the dry run keep no cache (`ci-deps:release.yml:21-27`).
  2. `The vulnerability database (ghcr.io, under 48 hours)` ((12) `id: trivy-db`): `run: tools/trivy/db.sh
     "$RUNNER_TEMP/trivy"`.
  3. The scans, as `run:` steps with today's flags plus `--skip-db-update`, so each verdict uses exactly the checked
     database: (12) in `images`, `trivy image --input "$RUNNER_TEMP/image/<name>.tar" --config '' --cache-dir
     "$RUNNER_TEMP/trivy" --skip-db-update --skip-java-db-update --ignorefile '' --secret-config '' --scanners
     vuln,secret --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 --format table`, the source first so
     `controls.ts` can name `trivy image --input` (12.10, N3, S3, S4). The SBOM is `trivy image --config '' --cache-dir
     "$RUNNER_TEMP/trivy" --skip-db-update --skip-java-db-update --format spdx-json --output "$SBOM" --exit-code 0`. The
     image source is not changed:
     - in `ci.yml` `images`, ci-browser's archive: `--input "$RUNNER_TEMP/image/<name>.tar"`, where §3.3.1
       (`lane-b-ci.md:2108-2112`) puts trivy-action's `input:`;
     - in `release.yml` and the dry run's `build`, which stay on `RELEASE_RUNNER.label` (ubuntu-24.04, the classic
       store, `lane-b-ci.md:2009-2011`) and keep `image-ref` (`ci-deps:release.yml:94, 105`): the tag, passed through
       `env: IMAGE_REF: ${{ steps.image.outputs.ref }}` as `"$IMAGE_REF"`, with `--image-src docker` so Trivy reads
       the local daemon and never falls back to a remote pull.

  Job-level `env` on each of those jobs, (12) literals only, since a job's `env` cannot read `runner`:
  - (12) no `TRIVY_CACHE_DIR`: every `trivy` command passes `--cache-dir "$RUNNER_TEMP/trivy"` (outside the checkout, as
    today), and `db.sh` takes that directory as its argument and passes it, (12) with `--config ''`, to both of its own
    `trivy` calls (12.7, E2; 12.11, G1);
  - `TRIVY_DB_REPOSITORY: ghcr.io/aquasecurity/trivy-db` and `TRIVY_JAVA_DB_REPOSITORY:
    ghcr.io/aquasecurity/trivy-java-db`, **untagged**, so Trivy appends its own schema version and a bump to a new
    schema needs no workflow edit; one repository each, no mirror (C3);
  - `TRIVY_DISABLE_TELEMETRY: "true"`, `TRIVY_SKIP_VERSION_CHECK: "true"` and `TRIVY_NO_PROGRESS: "true"`.

  (12) The install and database steps come right after the checkout in every job, before the builder, so they precede
  every scan and need no `if:` themselves (12.7, E1). Every scan's `if:` also requires `steps.trivy.outcome == 'success'
  && steps.trivy-db.outcome == 'success'`, because the worker's build and scan run after a failed earlier step
  (`ci.yml:708, :719`); the offline rule requires it (12.10, N5).
- **`release-dry-run.yml`** `build` (12) already runs release.yml's SBOM step on its web and worker legs
  (`release-dry-run.yml:129-143`), and its equality rule makes it release.yml's `build` less the scan and the SBOM
  upload (`workflows.test.ts:2324-2349`). It gains the install and database steps on both legs and, by 12.5 item 10,
  keeps the scan too, so the equality rule drops only the SBOM upload. Only a tag runs release.yml, so without them the
  new install would first run on the founder's tag. Its path filters (`:19-30`, `:32-43`, and `PATHS` at
  `workflows.test.ts:2258-2268`) gain `tools/trivy/**`. The header (`:3-15`) and the build comment (`:59-62`, "with no
  scan") are reworded.
- **`network.ts`** gains `getBytes(url, signal?): Promise<{ status: number; body: Uint8Array }>` on `Transport`, (12)
  `gitTransport` (`network.ts:109`) and `recordedTransport` (`fixtures.ts:46`): no request header, (12) a 60 s limit per
  read under the shared 180 s deadline (12.5, item 6), and a 128 MiB cap that fails naming the URL, (12) checked on
  `content-length` before the body is read and then on a running count over the streamed body (12.10, N8). The same
  three tries (`withRetries`, `:338-371`) and `NetworkError`. (12) `fetchRefs` takes an optional list of branches (12)
  and tags for the ancestry check (12.7, E6), each listed by `ls-remote` first and fetched only when listed (12.10, S6),
  (12) and returns each one's commit or its absence (12.11, G6).
- **`base.ts`** (12) `baseState` (`base.ts:45-73`) also returns the base's `tools/trivy/release.txt`, its path named
  once (`:14-23`). (12) The Trivy rule's trigger is the head's text differing from the base's or absent at the base
  (the pin is new), a change to `tools/check-action-pins` (`everyPin`, `:67-69`), or no base; a head with no
  `release.txt` makes no Trivy read (12.10, S2). Faults are sorted by kind (12.7, E5).
- **`tools/check-action-pins/trivy.ts`** (new), called from `check.ts`: (12) its offline rules join the errors at
  `check.ts:122-129`, and its networked check runs after the age rule (`:233-253`) under the shared deadline. (12) 12.5
  adds the checks (6) the ancestry, (7) the release's `immutable` and `published_at`, and (8) the advisory read, and
  changes (3), (5) and the push reads; (12) 12.10 changes (2), (3), (5), (6), (8), the offline rules and the push reads;
  where they differ, §12 governs:
  - **Offline, every run:**
    - (12) when present, `release.txt` parses (four keys, the forms above, nothing else); when absent, no workflow step
      may run `trivy` or `tools/trivy/` (12.10, S2);
    - `version` is not in `HIJACKED = { trivy: ['0.69.4', '0.69.5', '0.69.6'] }`, each with CVE-2026-33634 and its
      date beside it (12) (0.69.5 and 0.69.6 Docker Hub images only); `linux_x64` is not v0.69.4's archive digest
      `385d498d…09f6`; and the version is at least (12) 0.72.0 (GHSA-q3fv, GHSA-mcj4, GHSA-8rc5);
    - no workflow `uses:` an `aquasecurity/` action;
    - in every job, every step whose `run` invokes `trivy ` is preceded by the install and database steps, and every
      `trivy image` other than `--download-db-only` carries `--skip-db-update` (12) and `--skip-java-db-update`; every
      `trivy` command `--config ''`; every scan `--ignorefile ''`, `--secret-config ''` and `--scanners vuln,secret`; no
      `trivy` command passes `--db-repository`, `--java-db-repository`, `--vex`, `--ignore-policy`, `--skip-dirs` or
      `--skip-files`; every scan's `if:` requires the install and database steps' success (12.10, S3, S4, N5);
    - the env above is set on every job that runs Trivy, and no `TRIVY_*_REPOSITORY` carries a tag, a digest or a second
      repository; (12) no other `TRIVY_*` variable is set at the workflow, job or step level (12.10, S4).
  - **Networked, when the trigger holds** (each read through the transport, three tries, failing closed naming the
    host):
    - (1) `git ls-remote https://github.com/aquasecurity/trivy refs/tags/v<v> refs/tags/v<v>^{}` gives `commit`;
    - (2) `getBytes` of `…tar.gz.sigstore.json` and the tarball. The bundle is verified with `@sigstore/verify`'s
      `Verifier`, (12) built with no options (the library's default thresholds; 12.10, B1), over
      `toTrustMaterial(trustedRoot)` and `toSignedEntity(bundle, data)`, with policy `{ subjectAlternativeName,
      extensions: { issuer: 'https://token.actions.githubusercontent.com' } }`, where (12) `subjectAlternativeName` is
      the anchored, escaped pattern of
      `https://github.com/aquasecurity/trivy/.github/workflows/reusable-release.yaml@refs/tags/v<v>`,
      ``new RegExp(`^${escapeRegExp(san)}$`)``, since the library reads a string as an unanchored regular expression
      (12.10, S1). The trusted root is **injected**: in production, `@sigstore/tuf`'s `getTrustedRoot` from
      `tuf-repo-cdn.sigstore.dev`, wrapped in the same three tries and a `NetworkError` naming that host (the library's
      own fetch has a 5 s limit and, on failure, `TUF_REFRESH_METADATA_ERROR` without a host); (12) in tests, the
      synthetic `TrustedRoot` and bundles that `tools/check-action-pins/testdata/trivy/make.sh` made once, by hand
      (12.10, B1);
    - (3) (12) the policy's `oids` carry `1.3.6.1.4.1.57264.1.13` (source commit) = `commit`, `.1.14` (source ref) =
      `refs/tags/v<v>`, `.1.15` (repository ID) = 180687624 and `.1.17` (owner ID) = 12783832, (12) and `.1.11` (runner)
      = `github-hosted`, `.1.18` (calling workflow) =
      `https://github.com/aquasecurity/trivy/.github/workflows/release.yaml@refs/tags/v<v>` and `.1.20` (trigger) =
      `push` (12.10, N12), DER UTF8Strings (`0c 28 …`) (12) encoded by `trivy.ts`'s two-byte header, so the library
      refuses a mismatch; then the same seven, (12) the SAN and the issuer are compared again, exactly, from the
      verified signer's identity, the OIDs decoded by `@sigstore/core`'s `ASN1Obj` (12.10, S1, N9); a missing extension
      fails;
    - (4) the signed digest equals `linux_x64` and the line for the asset in `trivy_<v>_checksums.txt`;
    - (5) exactly one verified tlog entry; (12) the verified signing time (the entry's `integratedTime` when it carries
      an inclusion promise, otherwise the one RFC 3161 time the `Verifier` verified; 12.10, S5) equals `signed_at` and
      is at least the floor before now. The floor is `releaseAgeMinutes(workspace)` from P1's
      `tools/check-toolchain/exclude-window.ts` (12) (`:29-32`; `follow-up-p1-pin-age.md:244-249`), 4,320 minutes today
      (`policy.ts:11`), passed in as `checkActionPins`' `floor` (`check.ts:220`).
  - **Push runs** (`GITHUB_EVENT_NAME=push`). Every read below turns any failure, a 404 or a malformed answer into a
    (12) warning under the step's "Action pins" title, starting `trivy ` (12.7, E7), naming the host and the version,
    and never a failure, as the push re-reads do (`check.ts:258-295`):
    - it re-reads (1) and warns if the tag moved or vanished (the committed hash still runs what was verified);
    - (12) it reads the pinned release with the job's token and warns on a 404 (withdrawn) or a release not immutable,
      so a withdrawn release is seen before a pull request hits it (§10; 12.7, E10);
    - it lists the tags, ignores any that is not a stable `vX.Y.Z`, and (12) for the newer ones, newest first and at
      most three, runs every check of a pin and warns when one passes, naming it and `pnpm trivy:pin` (12.7, E9), (12)
      and warns, naming the version and the failed check, when one whose `published_at` is past the floor fails a check
      (12.10, S5). Same form as the builder's newer-release warning (`buildkit.ts:110-117`).
- **`pnpm trivy:pin <X.Y.Z>`** (new root script, `tsx tools/check-action-pins/pin-trivy.ts`). It runs (1) to (5) (12)
  and (6) for that version (12) ((7) and (8) are CI's: the pull request's `static` runs them) and writes `release.txt`,
  so nobody copies a hash by hand. (12) It reads `pnpm-workspace.yaml` and the floor through `releaseAgeMinutes`, as
  `index.ts:18-35` does (12.10, N14). It refuses a version that fails any of them. It is the bump procedure (§6).
  `--offline-root` verifies against (12) the `trusted_root.json` target of `@sigstore/tuf/seeds.json`, read directly
  with no TUF client (12.10, N7), instead of a live TUF refresh, for a machine whose proxy refuses TUF (§9); CI never
  passes it.
- **`tools/package.json`** gains, (12) as `devDependencies`, `@sigstore/verify` 4.1.2, `@sigstore/tuf` 5.0.0,
  `@sigstore/bundle` 5.0.0, `@sigstore/protobuf-specs` 0.5.2 (12) and `@sigstore/core` 4.0.1 (already in the tree under
  `@sigstore/verify`; 12.10, N9), exact (12.3; as production dependencies they would turn `pnpm audit --prod`,
  `ci.yml:77`, red on GHSA-g3hv-75wg-m249; the builder records the transitive versions pnpm resolves, and the
  release-age check holds them). Not `sigstore` itself, whose tree adds `@sigstore/sign` and the OIDC code (52 packages,
  `npm ls --all`). One user, so no catalog line. `pnpm-lock.yaml` is re-resolved with `pnpm install --lockfile-only`.
- **No Dockerfile, compose, Dependabot, engine, ledger or content-pipeline change.** `publish-content.yml` is untouched
  (F4).

## 4. Files

- `.github/workflows/ci.yml` (`images`), `.github/workflows/release.yml` (`build`) and
  `.github/workflows/release-dry-run.yml` (`build` and the paths).
- `tools/trivy/release.txt`, `install.sh`, `db.sh`, `install.test.ts` and `db.test.ts` (new).
- `tools/check-action-pins/trivy.ts`, `trivy.test.ts`, `pin-trivy.ts` and (12) `api.ts` (new; no `der.ts` or
  `der.test.ts`, 12.10 N9), and (12) `testdata/trivy/` (`make.sh` and its outputs, 12.10 B1); (12) `age.ts` (it imports
  `api.ts`, 12.10 S7). `check.ts` and `index.ts` (one call and its notes; (12) `--offline-root`); `network.ts` and
  `network.test.ts` (`getBytes`, (12) `fetchRefs`' branches (12) and tags); `base.ts` and (12) `check.test.ts` (the
  base's `release.txt`, named once); `fixtures.ts` gains (12) `getBytes` (12) (a `bytes` option) and release branches on
  a recorded repository, while `trivy.test.ts` reads `testdata/trivy` itself (12.11, G4, G6). (12) Also
  `packages/compliance/src/controls.ts` (`:261`, `:264`) and `README.md` (`:44-45`).
- `tools/test/workflows.test.ts`:
  - `isScan` (`ci-deps:176`) matches a `run` starting `trivy image` with `--exit-code 1`;
  - the `images` assertions (`ci-deps:1213-1237`) and the release build's scan-and-SBOM test (`:450`) hold the CLI form,
    `--input` in `images`, `"$IMAGE_REF"` with `--image-src docker` in the release builds, `--skip-db-update`, the
    database step first, and the env (untagged, ghcr-only repositories); (12) 12.10's flags, the scans' gating and no
    other `TRIVY_*` variable;
  - release.yml's no-cache rule (`ci-deps:571-575`) replaces its trivy-action lines with "no `aquasecurity/` action;
    (12) every `trivy` command with `--cache-dir "$RUNNER_TEMP/trivy"`; no `actions/cache`";
  - the dry-run equality rule (`ci-deps:1306-1345`) covers the install, database, scan and SBOM steps.
- `tools/test/no-duplicated-versions.test.ts`: (12) a ninth case (eight exist, `:71-124`). Trivy's version appears
  only in `release.txt`, scanned over its files (`scanned()`, `:35-43`, gaining `tools/trivy/install.sh` and `db.sh`)
  and the header list (`:9-29`). (12) It is a guard, not a ★ case, and `scanned()` gains the two scripts in the commit
  that adds them (12.11, G5).
- `tools/test/collection.test.ts`: `...testsIn('tools/trivy')` beside `tools/ci` (`ci-deps:41-43`).
- `package.json` (the `trivy:pin` script), `tools/package.json` and `pnpm-lock.yaml`.
- Documents: §5. Matrix and synth: `docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts` and
  `registry.ts` (§8), (12) and `fixtures/synthetic/CI-24/expected.json`, `CI-25/expected.json` and
  `CI-26/expected.json`, written by `pnpm synth --all` (12.11, G2).

## 5. Documents

- **ADR 0066, Part 6** (new, after Part 5). Context: §2's facts. Decision: §3. Alternatives: §7. Revisit when: a signed
  database exists (then verify it); (12) GitHub's release attestation, or `gh attestation verify`, adds an identity
  check the bundle lacks (Trivy's releases are immutable since 2026-03-03, and Part 6 reads `immutable` and
  `published_at`; 12.5, item 5); ghcr's anonymous limits turn `images` red (C3); gitleaks gains the same tag, signature
  and age check (below). Part 2's "Revisit when" line ("a newer trivy is wanted than trivy-action's default (a
  `version:` pin and its check)", (12) `docs/adr/0066-…md:727`) is answered by Part 6's cross-reference. Its text stays.
  (12) Part 6 also answers Part 5's `:1666` and Part 2's `:397-400`, adds its lines to the header (`:3-60`), and says it
  supersedes ADR 0062's `:1376` bullet without editing 0062 (12.1, F11). (12) It also states that the library's SAN rule
  is a pattern, which the checker anchors (12.10, S1), `signed_at`'s definition (S5), and what the ancestry rule leaves
  (S6). (12) It has a Notices section in Part 5's form, N33 to N42, after #86's N32 (12.11, G8).
- **ADR 0010** (`6ddd587:docs/adr/0010-supply-chain-gates-beside-ci.md:19, 30`): "scans with Trivy" becomes "with the
  Trivy release `tools/trivy/release.txt` names, its SHA-256 checked"; `:30`, where the SBOM is "kept as a run
  artifact", gains "made by that binary". An appended note names Part 6.
- **`docs/runbooks/ci.md`**:
  - the `images` row (`:33`) and (12) the triage bullet (`:148-149`, after #86's text) gain three failures, each with
    its remedy: a SHA-256 mismatch, which you never bypass (re-run `pnpm trivy:pin` and read the diff); a stale database
    (re-run; if it persists, read ghcr's created time); ghcr (12) or `pkg-containers.githubusercontent.com` unreachable
    after three tries (re-run; never add a mirror); (12) and a JAR in a scanned image (S3), a bad archive-cache entry
    (N6), and "a CVE is never ignored by file, only fixed" (S4), each as 12.10 words it;
  - the cache paragraph ((12) `:271-273`) gains: the database from ghcr only, the 48-hour floor, the archive cache (12)
    keyed by `release.txt`'s hash and saved by push runs only, in `ci.yml` only;
  - (12) the `static` row (`:26`), the "Action pins" triage bullet (`:87-106`), with each of Trivy's refusals and its
    remedy, and the local-run bullet (`:409-416`), with the archive and TUF reads and `--offline-root` (12.11, G3).
- **`docs/runbooks/dependency-upgrades.md`** (ci-deps' runbook): a "Trivy" section (§6), including a withdrawn release,
  (12) after "Actions" (`:325-374`), and Trivy's push warnings (12) (both, 12.10 S5) in the weekly triage's step 5
  (`:95-98`).
- **reconciliation-001**: (12) an entry in P1's form (`reconciliation-001.md:659-661`), appended after #86's: under the
  co-founder's ruling of 2026-10-26, the follow-up P2 is taken (`co-001/ci-trivy-version`, `docs/adr/0066`, Part 6),
  what it holds, test matrix CI-24 to CI-26, not an exception to a check above. Its supply-chain check names Trivy
  scans, which still run.

## 6. Who bumps it, and how a newer Trivy surfaces

Dependabot cannot, and Renovate is not used. A person bumps it at the weekly triage, which already reads
`check-toolchain`'s pnpm warning and Dependabot's runs (§3.2.1):
1. A push run's `static` log, and the run summary's annotations, carry (12) `::warning title=Action pins::trivy vX.Y.Z
   (signed <time>) is newer than tools/trivy/release.txt's A.B.C and at least three days old; run pnpm trivy:pin X.Y.Z`.
   (12) A newer release past the floor that fails a check carries `::warning title=Action pins::trivy vX.Y.Z (published
   <time>) is past the floor but fails <check>; …` instead (12.10, S5).
2. `pnpm trivy:pin X.Y.Z` writes the file. A one-file pull request follows, and its `static` re-verifies it on
   GitHub's runners (T4) while `images` scans both images with it.
3. If the new Trivy reports new HIGH or CRITICAL findings, they are real: the runbook's `images` triage applies.
4. **A withdrawn pinned release** (the push warning, or `images` failing at download) is treated as compromised: re-pin
   with `pnpm trivy:pin` to the previous or the next release that passes; never point at a mirror without the hash.

**An urgent Trivy fix under three days old gets no exclude** (C7). P1 records the same ((12)
`follow-up-p1-pin-age.md:451-452`).

## 7. Choices made, with reasons (each the safer or the recommended option; reversible)

- **C1. Retire trivy-action and setup-trivy; install the binary ourselves and run the CLI.** The recommended option.
  The alternatives:
  - (b) keep trivy-action with `skip-setup-trivy: true` (`action.yaml:106-109`) behind our install;
  - (c) the literal P2: set `version: v0.76.1` on trivy-action;
  - (d) run Trivy's container image by digest (`ghcr.io/aquasecurity/trivy` or `aquasec/trivy`) from a Dockerfile that
    Dependabot's docker ecosystem bumps.

  (c) gets the version right, but the binary still comes from get.trivy.dev and is checked only against its own
  release's checksums, and setup-trivy still checks out `aquasecurity/trivy` with the job's token (§2). (b) closes
  that, but keeps trivy-action's `entrypoint.sh`, the very file the March payload went into, in every scan job,
  including release.yml's, whose image becomes the attested release. (d) is rejected: P1 cannot age an image outside
  Docker Hub ("age unprovable"), Docker Hub's `aquasec` is the namespace poisoned in March, Dependabot's cooldown fails
  open (`p1-design.md` §2.1), and a scan from a container needs the daemon socket or the archive mounted into it, a
  second runtime path. (a) leaves one third-party artifact, held to a committed hash and a verified signature, and no
  third-party action code. It costs nothing in function: every input we use maps to a CLI flag (`action.yaml:162-200`
  sets exactly those `TRIVY_*` variables), and it removes trivy-action's `cache: 'true'` default, which ci-deps had to
  turn off by test.
- **C2. The pin follows gitleaks' form: `tools/trivy/release.txt` and `install.sh`.** One pattern for every upstream
  binary CI runs, with the same message shapes, rather than a second format. Trivy's file adds `commit` and
  `signed_at`, which the checker needs; `key value` lines hold them. A workflow `env` would need three copies, and a
  YAML anchor cannot cross files; `no-duplicated-versions` refuses any copy. Trivy pins one platform (CI's), so no
  `pnpm trivy:install` is added.
- **C3. The database comes from ghcr.io only, untagged, with a 48-hour freshness floor, no mirror and no digest pin.**
  - The safer option under the ruling. ghcr.io is the publisher's own registry. mirror.gcr.io follows Docker Hub's
    `aquasec` namespace, which was poisoned in March, and the database is unsigned, so a database served by the mirror
    is trusted on the mirror's own manifest. A fallback would also be partial (§2: only 408, 429, 5xx and
    `BLOB_UNKNOWN` fall back).
  - The cost, stated: this reverses upstream's mirror-first order, which exists for ghcr's anonymous limits. A ghcr
    outage or rate limit turns `images` and the release's `build` red until a re-run. `db.sh` downloads once per job
    with three tries and pauses, and the scans then update nothing, so each job makes one pull. If ghcr's limits do
    turn lanes red, the ADR's Revisit applies (authenticated pulls, or the mirror with a layer-digest agreement); the
    mirror is never added silently.
  - A digest pin would make every verdict depend on a person's bump while the database changes about every six hours,
    so it was rejected. Freshness, not identity, is what an unsigned database can be held to.
  - Untagged repositories let Trivy append its own `db.SchemaVersion`; a `:2` would make a bump to a schema-3 Trivy
    fail its schema check for a reason no one would look for.
- **C4. The signature and the age are checked at pin time and on push, and the hash at every run.** The committed
  SHA-256 makes the run-time check complete: any byte that differs from what was verified fails, so verifying Sigstore
  again on each runner (another pinned binary, cosign, or the Node verifier in every scan job) adds no assurance. The
  Sigstore project's `@sigstore/verify` is the maintained verifier, used directly so the trust root can be injected
  and tested; `sigstore`'s wrapper always fetches TUF itself and carries the signing code. A hand-written verifier was
  rejected.
- **C5. A tag moved on an unchanged pin warns; a changed pin fails.** This is check-action-pins' own rule (§3.2.7, S4).
  An upstream re-tag cannot turn both lanes red, and it cannot change what runs.
- **C6. Telemetry and the update check are off.** Neither is needed. Both are outbound calls from jobs that hold
  release artifacts, and they make the verdict depend on nothing.
- **C7. One floor, imported, and no exclude for Trivy.** The floor is P1's `releaseAgeMinutes` ((12)
  `exclude-window.ts:29-32`), so the npm, action, image and Trivy floors cannot drift. Every other floor has a dated
  security-fix exclude; the scanner alone gets none, the safer option: it reads only our own images on ephemeral
  runners, so waiting three days for a scanner fix costs little, while a young release is exactly the March 2026 shape
  and an exclude is the path an attacker with release credentials would need. P1 already assumes this ((12)
  `follow-up-p1-pin-age.md:451-452`). If the founder ever wants one, it is a `trivy` kind in P1's exception file under
  the shared window; recorded under Revisit, not built.
- **C8. The archive is cached in `ci.yml` only, (12) keyed by `release.txt`'s hash and saved by the build branch's push
  runs alone.** It keeps pull-request lanes up through a release-host outage and saves 52 MB a job, and it is safe
  because the script re-hashes what is restored; (12) a pull request never writes the cache (12.7, E11), and the restore
  has no `restore-keys` (12.10, N6). The release workflows stay cache-free by ci-deps' rule. (14) Reversed: no Trivy
  archive is cached anywhere, as #107 has it; a restore can write outside its path, and a cache would keep running a
  release withdrawn because it is bad (14.8, E22).

## 8. Tests (failing first) and the test-matrix rows

Failing first, run on the merge base with the new tests: `CI_TREE=<git archive of the merge base>` plus `pnpm vitest run
tools/test/workflows.test.ts tools/test/no-duplicated-versions.test.ts tools/check-action-pins tools/trivy` (12)
`packages/compliance/src/controls.test.ts`. The new assertions fail on (12) five trivy-action steps, on no `release.txt`
and on no install step; 12.6 orders the commits. Every networked case uses recorded synthetic `ls-remote` lines, (12)
the synthetic `TrustedRoot`, certificates and bundles that `tools/check-action-pins/testdata/trivy/make.sh` made once,
by hand, with a real SCT and their times fixed there, each test injecting `now` (12.10, B1), and stub downloads. Nothing
from Aqua's real release is committed beyond the four values in `release.txt`.

- `tools/check-action-pins/trivy.test.ts`:
  - a moved tag on a changed pin fails, and on a push it warns;
  - a bundle signed by another workflow, ref or issuer fails; (12) so do the SANs `…@refs/tags/v<v>0` and
    `…@refs/tags/v<v>-rc.1` with every OID right (12.10, S1); a certificate whose .1.13 differs from the tag's commit,
    whose .1.14 differs from the tag, or which lacks either, fails;
  - a bundle signed under a root other than the injected one fails;
  - a digest that differs from `linux_x64` or from `checksums.txt` fails;
  - a release signed 4,319 minutes ago fails and one signed 4,320 minutes ago passes; a bundle with no tlog entry, or
    two, fails; an `integratedTime` that differs from `signed_at` fails;
  - 0.69.4 fails as hijacked, (12) 0.71.1 fails as older than 0.72.0, and v0.69.4's archive digest fails whatever the
    version; (12) 12.6 lists the cases 12.5 and 12.10 add, among them a promise-less tlog entry timed by one RFC 3161
    time (S5) and the tightened ancestry (S6);
  - an `aquasecurity/trivy-action` step anywhere fails; a scan with no install or database step before it fails; a
    scan without `--skip-db-update` fails; a `TRIVY_DB_REPOSITORY` with `:2`, a digest or a comma fails;
  - an unchanged `release.txt` and checker read nothing from the network;
  - three failed reads of any host fail closed, naming it; three failed trust-root reads fail naming
    `tuf-repo-cdn.sigstore.dev`;
  - push mode: a newer release three days old warns, and one two days old does not; an `-rc` tag is ignored; a newer
    tag with no bundle or a malformed one gives no error; a pinned asset returning 404 warns; every read failing gives
    warnings only and exit 0.
- (12) No `der.test.ts` (12.10, N9): `trivy.test.ts` holds the two-byte encoder's round trip through `@sigstore/core`'s
  `ASN1Obj` on the generator's leaf, and its refusal of 128 bytes or more; no real certificate bytes are committed.
- `network.test.ts`: `getBytes` returns the bytes unchanged (a gzip header survives), retries three times, and refuses a
  body over the cap ((12) on `content-length` before reading, and on the streamed count; 12.10, N8); (12) it sends no
  `Authorization`, and `fetchRefs` fetches a named branch (12) and a named extra tag (12.11, G6).
- `tools/trivy/install.test.ts` uses stub `curl` and `trivy` on `PATH`, in a temporary directory as
  (12) `tools/check-toolchain/install-pnpm.test.ts` does, and asserts both scripts committed 100755:
  - a downloaded tarball whose hash differs fails before extraction, and the message names both hashes;
  - a restored tarball whose hash differs fails the same way, and downloads nothing;
  - ARM64 or macOS refuses, naming the file;
  - a `--version` that differs fails, (12) and the stub refuses a `--version` without `--config ''` (12.11, G1);
  - (12) the archive is read from the second argument (12.10, N10).
- `tools/trivy/db.test.ts`, with a stub `trivy`: fails at 48 h + 1 s and passes at 47 h; fails when the `repo=` line is
  absent or names mirror.gcr.io, (12) the stub printing Trivy's exact form (12.10, N4); three failed downloads fail
  naming ghcr.io; the summary carries the four values; (12) the stub refuses any call without `--config ''` and
  `--cache-dir <the script's argument>`, and one case asserts both calls' arguments (12.11, G1).
- `workflows.test.ts` and `no-duplicated-versions.test.ts`, as in §4.

| ID | Title | Assertion |
|---|---|---|
| CI-24 | Trivy from verified bytes | Every scan and bill of materials runs the Trivy release `tools/trivy/release.txt` names, installed only after its SHA-256 matched, downloaded or restored, with no Trivy action in any workflow and its version written nowhere else, reading no configuration or ignore file from the checkout |
| CI-25 | A hijacked or young Trivy release refused | A changed pin needs a `.0`'s commit on the default branch, or a patch's on its release branch holding that `.0`, a Sigstore signature from Trivy's release workflow at exactly that tag, commit, repository, owner, runner, trigger and calling workflow under Sigstore's trust root, the committed digest, one tlog entry and a verified signing time at least three days old, and on CI an immutable release three days old that no reviewed advisory names; a CVE-2026-33634 version or digest, or a version under 0.72.0, fails; on a push a moved tag, a withdrawn release, a newer three-day-old release, or a newer release past the floor that fails a check warns, and a failed read only warns |
| CI-26 | Trivy's database fresh and from its publisher | Each job downloads the database once, from ghcr.io only and untagged, before any scan, with telemetry and the update check off; a database over 48 hours old, or one from any other repository, fails the job, and the scans update neither database |

(12) The rows are rewritten for 12.5 and 12.10; the builder copies them without this note.

`registry.ts` entries, (12) in the CI-21 to CI-23 form (`registry.ts:628-631`), after `:631` under the comment "Trivy
from verified bytes (docs/adr/0066, Part 6)":
- `'CI-24': none(0, 'The workflows and tools/trivy/release.txt are read; the install script runs against stub downloads in a temporary directory; no file.', ['tools/trivy/install.test.ts', 'tools/test/workflows.test.ts', 'tools/test/no-duplicated-versions.test.ts'])`;
- (12) `'CI-25': none(0, "Tags, GitHub's answers and checksums are synthetic and recorded; the trust root, certificates and bundles are the synthetic ones tools/check-action-pins/testdata/trivy/make.sh made; no file.", ['tools/check-action-pins/trivy.test.ts', 'tools/check-action-pins/check.test.ts', 'tools/check-action-pins/network.test.ts'])`;
- `'CI-26': none(0, "The workflows' env is read; the database script runs against a stub trivy; no file.", ['tools/trivy/db.test.ts', 'tools/test/workflows.test.ts'])`.

(12) The intro at `test-matrix.md:257-264` gains "CI-24 to CI-26 are Trivy's (Part 6)", and its "and complete the
series" (`:261-262`) is rewritten.

## 9. Builders

(12) Superseded by 12.6: two builders on disjoint files and an integrator. As first written: one builder. The change
is about 550 lines: two scripts, one checker module and its helpers, tests and documents. It is
sequential, because the checker's offline rules and the workflow rewrite share `workflows.test.ts`. The order of
commits:
1. the tests, failing;
2. `network.ts`' `getBytes`, `base.ts`' `changedSince`, the checker and the `@sigstore/*` packages with the lockfile;
3. `release.txt` (written by `pnpm trivy:pin 0.76.1 --offline-root`, its values checked against §2), `install.sh`
   and `db.sh`;
4. the three workflows;
5. the documents.

What cannot be verified here (§6 of the plan): no Docker daemon, no runner. tuf-repo-cdn.sigstore.dev and get.trivy.dev
are refused by this session's proxy (01:46Z); (12) so are rekor.sigstore.dev, pkg-containers.githubusercontent.com and
the GitHub API for `aquasecurity/*` (2026-11-01), so the `immutable`, `published_at` and advisory reads first run in the
pull request's `static` too. The embedded seed root does verify v0.76.1 (§2), so the builder proves `pnpm trivy:pin
--offline-root` offline first; the live TUF path first runs in the pull request's `static`, and the scans in its
`images` and release-dry-run. The PR records those job ids.

## 10. Risks and rollback

| Risk | Mitigation |
|---|---|
| v0.76.1 reports findings v0.70.0 did not, and `images` goes red | That is the point. The PR's own `images` run shows them before merge; the runbook's triage fixes them in the PR |
| ghcr.io rate-limits or is down | `db.sh` tries three times, then fails naming ghcr.io; the remedy is a re-run. There is no fallback by choice (C3); a lasting problem is a Revisit, never a silent mirror |
| A database older than 48 h because Aqua's build stalls | `db.sh` fails with the times. The remedy is a re-run, or a founder-ruled raise of the floor, never a skip |
| Aqua withdraws (12) (deletes) the pinned release, or the release host is down; (12) under an immutable release a re-cut under the same tag cannot happen (`immutable-releases.md:22-23`) | Pull-request lanes run from the hash-checked cache (C8). (14) No cache: `images` fails at the download too, until the re-pin (14.8, E22). A push run warns on (12) the release's 404 first. `release.yml` and the dry run fail at download; the runbook re-pins to a verified release (§6 step 4), never to a mirror |
| Sigstore's TUF root or Rekor unreachable on a pin PR | It fails closed after three tries, naming the host. Only `release.txt`/checker PRs read it |
| `@sigstore/*` change their API | Exact versions in the lockfile; bumps come through Dependabot's npm group and the checker's tests catch them |
| Fulcio stops issuing .1.13/.1.14 | (3) fails closed on a missing extension, and `pnpm trivy:pin` names it |
| Asset naming changes upstream | `pnpm trivy:pin` fails on the new version, naming the missing asset; the person adapts `install.sh` |
| (12) Sigstore moves Trivy's signatures to Rekor v2, whose entries carry no inclusion promise | `signed_at` falls back to the one verified RFC 3161 time (12.10, S5), so pins still pass; any other lasting upstream change warns on a push, naming the check a newer release fails |
| (12) A scanned image gains a JAR | The scan fails with Trivy's first-run message rather than downloading the Java database mid-scan (12.10, S3); the remedy is a reviewed `db.sh` step for the Java database with its own checks |
| (12) A `trivy.yaml`, `.trivyignore` or `trivy-secret.yaml` is committed, or a `TRIVY_*` variable is set | No scan reads the files (`--config ''`, `--ignorefile ''`, `--secret-config ''`), and the offline rule refuses the variable (12.10, S4) |
| (12) A bad archive-cache entry | `install.sh` refuses it and every `images` run fails until a reviewed bump of `trivy-v1-` in `ci.yml`, or the founder deletes the entry (12.10, N6). (14) Does not arise: no archive cache (14.8, E22) |

Rollback is one revert commit. Trivy's verdict is unchanged in kind: the same severities, the same `ignore-unfixed`,
the same exit codes.

## 11. Interplay

(12) Superseded by 12.4 where they differ: P1 has merged (#82, bce57f16); #86 shares the workflows and documents, and P2
is cut after it; #42's files are now those of (12) c65f9cf2 (12.10, N1).

- **Lane A, #42** (`pr42-files.txt`). P2 touches four of its files:
  - `pnpm-lock.yaml` (`:138`), through the `@sigstore/*` packages: re-resolved with `pnpm install --lockfile-only` from
    the parent already on the build branch, never hand-merged (§5 of the plan);
  - `docs/product/test-matrix.md` (`:86`), `packages/synth/src/cases/matrix.ts` and `registry.ts` (`:136-137`): the
    three CI rows.

  LANES rule 6: whichever merges second resolves and keeps both lanes' changes. They are additions at the CI block's
  end, apart from #42's SCR and SEC rows. No other #42 file is touched: ADR 0062 (`:80`) is not edited, since the
  release attests the capacity report (`ci-deps:release.yml:286-290`), not the SBOM, and ADR 0010 covers the SBOM.
  `tools/package.json` and root `package.json` are not #42 files.

  The lockfile is a watched path (`watched-paths.txt`), so this PR runs the capacity measurement, about 13 to 16
  minutes, and `affected.ts` decides mutation. The `@sigstore/*` packages reach no money closure, so mutation runs only
  on a root manifest change, which `trivy:pin` is. P4 narrows that.
- **ci-deps and ci-browser.** Both merge first. P2 is written against their designs and against ci-deps' code at
  19e3d98e: `check-action-pins`' base rule (extended, `changedSince`), network retries (extended, `getBytes`) and
  warning form; check-toolchain's age constant; `release-dry-run.yml`; the no-cache release rule; ci-browser's archive
  scans in `images` (`--input`) and its runner split (`RELEASE_RUNNER.label` on 24.04). If either changes those shapes
  before merging, the builder re-reads and follows them.
- **P1** (Part 5, CI-21 to CI-23) holds action pins and image digests to the same three-day floor, in
  `check-action-pins` and `check-toolchain`. Both PRs touch `check.ts`, `index.ts`, ADR 0066, the runbooks, the matrix
  and the registry; the one merged second resolves under rule 6. P2 imports P1's `releaseAgeMinutes` (or ci-deps'
  constant, repointed by P1) and gives Trivy no exclude, as P1 expects (`p1-design.md:343-345`). P1's image-digest rule
  does not cover Trivy's binary or database, and P2's rule does not cover actions. They don't overlap.
- **P4** (Part 7, CI-27 to CI-29) changes `tools/stryker/affected.ts`. Its files are disjoint from P2's, apart from
  the matrix, the registry and ADR 0066 (rule 6).
- **Proposed, outside P2:** gitleaks (`tools/gitleaks/release.txt`) is the other upstream binary CI runs, hash-pinned
  with no tag, signature or age check. With P2's form shared, applying the same checker there is a small follow-up; it
  is named in Part 6's Revisit, not built here.

## Review (2026-10-26)

The review (`follow-ups/p2-review.md`, 2 blocking, 7 should fix, 10 nits) was re-checked against 6ddd587, ci-deps at
19e3d98e, `pr42-files.txt`, `p1-design.md` and `lane-b-ci.md` §3.3. All 19 findings hold; 18 are fixed and 1 (S7) is
resolved by recording the decision rather than adding an exclude.

| Finding | Disposition |
|---|---|
| B1 ADR 0062 edit on a #42 file, for a false claim | Fixed. The bullet is dropped (`release.yml:286-290` attests the capacity report; `pr42-files.txt:80`); §5 puts the SBOM wording on ADR 0010 `:30`; §11 says why 0062 is untouched |
| B2 `sigstore.verify` untestable with a synthetic root; TUF read outside `network.ts` | Fixed. `@sigstore/verify` with an injected `TrustedRoot`; production root from `@sigstore/tuf` behind three tries naming the host; OIDs .1.13/.1.14 decoded from DER (`der.ts`); one tlog entry; new §8 cases; `--offline-root` and the seed-root proof in §9 |
| S1 `Transport.get` returns text | Fixed. `getBytes` with a 300 s limit and a 128 MiB cap; `network.ts` and its test in §4 |
| S2 a second pinned-binary pattern beside gitleaks' | Fixed. `tools/trivy/release.txt` and `install.sh` in gitleaks' form and message shapes (C2); gitleaks' missing checks named under Revisit |
| S3 database source unreportable; fallback overstated; C3 reverses upstream silently | Fixed. `db.sh` runs `--download-db-only` and parses the `repo=` line; §2 states exactly what falls back; C3 chooses ghcr-only (the safer option) and states the cost |
| S4 `:2` pins the schema in workflows | Fixed. Untagged repositories, the Java one named; the checker and `workflows.test.ts` refuse a tag, digest or second repository |
| S5 push-mode failure semantics untested | Fixed. §3 says every push read only warns; §8 adds all-reads-fail, no or malformed bundle, and `-rc` cases |
| S6 a withdrawn release turns every run red, no row | Fixed. §10 row; push mode `HEAD`s the asset; `ci.yml` caches the archive keyed and re-hashed (C8); runbook step §6.4 |
| S7 no exclude, unlike every other floor | Decided, not changed: no exclude is the safer option and matches P1 (`p1-design.md:343-345`); the reason is in C7, the floor is imported from P1's `exclude-window.ts`, and a `trivy` kind in P1's file is the recorded Revisit |
| N1 comparison times | Fixed. The Linux-64bit bundles' `integratedTime` values, v0.69.3 added |
| N2 jq on 24.04 | Fixed. `install.sh` reads with `awk`; `db.sh`'s `jq -r` read works on 1.7.1 and 1.8.1, stated |
| N3 C4's reason | Fixed. Reworded: the hash makes the run-time check complete |
| N4 collection `FILES` | Fixed differently: the new tests sit in `tools/trivy`, so `collection.test.ts` gains `testsIn('tools/trivy')`; nothing for `tools/check-action-pins` |
| N5 `check.trivy.dev` log line proves nothing | Fixed. T8 is measured by the env assertion alone |
| N6 `v` in the version | Fixed. `release.txt` holds `0.76.1`; the tag is `v<version>`; the compare is against `Version: 0.76.1` |
| N7 db-check after the first scan | Fixed. The database step precedes every scan, and scans pass `--skip-db-update` |
| N8 container-image alternative not recorded | Fixed. C1 (d), rejected with reasons |
| N9 release.yml source unstated | Fixed. The release builds keep `image-ref` on the classic store: `"$IMAGE_REF"` with `--image-src docker` |
| N10 gitleaks proposal; GHSA unread | Recorded. §11 and Part 6's Revisit name the gitleaks follow-up; §2 says the GHSA is read and cited by the builder |

Open: (12) the GHSA is read (GHSA-69fq-xp46-6x23, 12.3), and the `@sigstore/*` versions and times are measured
(12.3); the live TUF path, and (12) the `immutable`, `published_at` and advisory reads, are first exercised in the pull
request's `static`.

## 12. Re-read at bce57f16 (2026-11-01)

Re-read on 2026-11-01 between 17:23Z and 18:10Z against `claude/build-platform` bce57f16 (#82, P1, merged at about 17:20
UTC). Since the design's 6ddd587 and ci-deps' 19e3d98e, these merged: ci-deps #48 (e908c214), #49, #76, ci-browser #77
(ecebdc90), #80, #79, #74, #81, #78 (83d71fd6) and #82. The P2 worktree `/home/user/ci-trivy-version` is at that commit
with `node_modules` installed, and `git status` was clean before and after. Two scouts read it first, in
`/home/user/laneb-sp/p2reread/`: one the files and code (`scout-files.md`: every design cite against bce57f16; the unit
projects of both checkers, `tools/test` and `tools/gitleaks` run under the lock, 32 files and 451 tests passed,
17:29:02Z to 17:29:34Z; CI's push run 41330911483 and #86's head 83167b8f read through `gh api`), and one the versions,
upstream facts and runs (`scout-pins.md`: `git ls-remote` and depth-limited fetches of aquasecurity/trivy, trivy-action,
setup-trivy, trivy-db and trivy-java-db, github/advisory-database at 8c754a94 and github/docs at 33b1f4a6; the v0.76.1
assets downloaded and the bundle verified again with `@sigstore/verify` 4.1.2; anonymous OCI reads of ghcr.io and
mirror.gcr.io; npm and a scratch `pnpm install` under the repository's gates; scripts in `scripts/`). This revision
re-checked every code cite it uses at bce57f16 itself; fetched #86's head into a scratch repository (17:42Z) for its
exact workflow hunks and its `BOUNDED_VALUES` list; read Trivy's and trivy-action's tags again (17:49:18Z: nothing after
v0.76.1, the v0.77.0 release-please branch 586c9563 untagged, trivy-action still v0.36.0); and made one new read, a
treeless fetch of aquasecurity/trivy's `main`, `release/v0.69`, `release/v0.75` and `release/v0.76` (17:43Z), for the
ancestry rule (12.5, item 3). The GitHub API for `aquasecurity/*` (releases, advisories, attestations),
rekor.sigstore.dev, tuf-repo-cdn.sigstore.dev, get.trivy.dev and pkg-containers.githubusercontent.com are refused from
this session, so the `immutable`, `published_at`, advisory and live TUF reads are CI-only and first run in the pull
request's `static`. Where this section and §1 to §11 differ, this section governs. §1 to §11 were edited in place only
where a fact, a cite or a statement of what P2 builds had become wrong, so that no builder or the integrator copies
stale text; each edit is marked "(12)" and listed in 12.9. "F n" is scout-files' item n under "Changes the design
needs", and "V n" is scout-pins' item n.

### 12.1 What changed from the 2026-10-26 text, and why

| § | Change | Evidence |
|---|---|---|
| §2 "What runs today" (F3, V11) | **Adopted, in place.** There are five trivy-action steps, not four: `ci.yml:695, :720` (`images`, reading archives through `input:`), `release.yml:121, :132`, and `release-dry-run.yml:132` (the SBOM, on both legs since b36214aa, 2026-10-27). No `TRIVY_*` env is set anywhere. In push run 41330911483 on bce57f16, `images` job 124920631345, trivy-action ed142fd nested setup-trivy `3fb12ec`, which installed v0.70.0 with `contrib/install.sh -c setup-trivy` (log `:1757`) and pulled the database from `mirror.gcr.io/aquasec/trivy-db:2` (log `:1887`, 131.24 MiB); the update check printed "Version 0.76.1 of Trivy is now available", the call T8 turns off. The dry run's SBOM reads no database (`"--format spdx-json" disables security scanning`, job 124920631202, log `:1930`). trivy-action's newest tag is still v0.36.0, naming ed142fd, and its release is immutable (ADR 0066 `:1529`). Its unreleased `master` (8f28faec) defaults to v0.76.1 with setup-trivy v0.3.1, whose own default is `latest` and which still checks out `aquasecurity/trivy` with the job's token, so C1's reasons hold. | scout-files §1.1; scout-pins §2, §4; `git ls-remote` at 17:49:18Z |
| §3 job `env` (F1) | **Adopted, in place; it was blocking.** A job's `env` cannot read the `runner` context (actionlint 1.7.7: `context "runner" is not allowed here`), and `workflows.test.ts:2455-2460` runs actionlint where it is installed. The job-level env keeps only literals: `TRIVY_DB_REPOSITORY`, `TRIVY_JAVA_DB_REPOSITORY`, `TRIVY_DISABLE_TELEMETRY`, `TRIVY_SKIP_VERSION_CHECK` and `TRIVY_NO_PROGRESS`. The cache directory is `--cache-dir "$RUNNER_TEMP/trivy"` on every `trivy` command, and `db.sh`'s one argument (E2). It is never written to `$GITHUB_ENV`, which #86 closes to `ENGINE_FREEZE_BASE` (83167b8f `workflows.test.ts:2957`). | scout-files F1 (actionlint on a scratch workflow) |
| §3 dry run (F4) | **Adopted, in place.** The dry run already writes the SBOM with release.yml's step (`release-dry-run.yml:129-143`). Its equality rule makes its `build` release.yml's `build` less the scan and the SBOM upload (`workflows.test.ts:2324-2349`, `:2337-2339`), so it gains the install and database steps on both legs. **This re-read also keeps the scan there** (12.5, item 10), so the equality rule drops only the SBOM upload. `asDryRun` (`:2284-2288`) gains an `env` cut (E3). The dry run is then the only run of `db.sh` on ubuntu-24.04 (jq 1.7.1), and of the release's scan form, before a tag. Its header (`:3-15`) and build comment (`:59-62`) are reworded; both path lists (`:19-30`, `:32-43`) and `PATHS` (`workflows.test.ts:2258-2268`) gain `tools/trivy/**`. | `release-dry-run.yml:3-15, :19-43, :59-62, :129-143`; `workflows.test.ts:2268-2349` |
| §3 `network.ts` (F5) | **Adopted, in place, with the deadline decided** (12.5, item 6). `liveTransport` is gone: the live transport is `gitTransport` (`network.ts:109`) and the test one `recordedTransport` (`fixtures.ts:46`). `get(url, signal?, headers?)` returns `{ status, text, headers }` (`:27-31, :62`) and limits each read to 30 s (`:98`). `getBytes(url, signal?)` joins both transports. It sends no request header, so the job's token never reaches a release host; it has a 60 s per-read limit and a 128 MiB cap; and it is retried by `withRetries(transport, host, what, read, retry, signal, pause)` (`:338-371`). | `network.ts:27-31, :62, :98, :109, :191-200, :338-371`; `fixtures.ts:46` |
| §3 `base.ts` (F6) | **Adopted, in place.** There is no `changedSince`. `baseState` (`base.ts:45-73`) returns the base's `tools/trivy/release.txt` text, whose path is a constant in the named-once list (`:14-23`), held by `check.test.ts:181-191`. The pin is new when that text is absent or differs (P1's E4 form, `check.ts:222-231`). A change that edits the checker (`everyPin`, `base.ts:67-69`) runs the reads on an unchanged pin. **Changed from F6's precedent:** `buildkit.ts:89` makes every fault a warning when the builder is not new, while P2 sorts its faults into two kinds (E5). | `base.ts:14-23, :45-73`; `check.ts:222-231`; `buildkit.ts:89` |
| §3 `trivy.ts` placement (F7) | **Adopted, in place.** The offline rules join the errors at `check.ts:122-129`, before the `--offline` return (`:132`). The networked check runs after the age rule (`:233-253`), inside the same `try`/`finally` and deadline (`:214-215, :254-255`). It takes `floor` (`:220`), `now` and `clock` (`:216-218`), `push`, and `ci`, `token` and `apiUrl` as `ageRule` takes them. Its push form follows `buildkit.ts` (`fault` `:89`, the newer-release warning `:110-117`); the newer-pnpm precedent is now check-toolchain's `check.ts:346-363`. | `check.ts:118-297`; `buildkit.ts:65-120` |
| §3 step (5), C7 (F8) | **Adopted, in place.** P1 has merged, so the "before P1" fallback is deleted. The floor is `releaseAgeMinutes` (`tools/check-toolchain/exclude-window.ts:29-32`), 4,320 minutes (`policy.ts:11`), compared through `MINUTE_MS` (`policy.ts:18`) and worded by `ageWords` (`exclude-window.ts:35-37`). No exclude helper is called. P1's design is cited at `follow-up-p1-pin-age.md:244-249` and `:451-452`. | `exclude-window.ts:22-37`; `policy.ts:11, :18` |
| C8 (F9) | **Adopted, in place.** The archive is saved on a push only, in the `APT_SAVE_IF` form (`workflows.test.ts:244`; `ci.yml:252-262`), so a pull request restores what the build branch saved and never writes a cache. The key is `trivy-v1-${{ hashFiles('tools/trivy/release.txt') }}`. The save takes `steps.<id>.outputs.cache-primary-key`, as every save in ci.yml does (`:162`, `:262`), which needs one `BOUNDED_VALUES` row after #86 (12.4). The pin is at `ci.yml:147`. | `ci.yml:147, :162, :228-262`; 83167b8f `workflows.test.ts:3213-3289` |
| §5 reconciliation-001 (F10) | **Adopted, in place.** "No change" is now wrong: P1 recorded its ruling as an entry (`reconciliation-001.md:659-661`), and #86 appends one. P2 appends its own entry in P1's form, after #86's. | `reconciliation-001.md:659-661` |
| §5 ADR 0066 and the runbooks (F11) | **Adopted, in place.** Part 6 goes after Part 5 (`:1273-1681`). It answers three passages: Part 5's line that Trivy and its database are unheld at run time (`:1666`), Part 2's release no-cache text (`:397-400`), and Part 2's Revisit line (`:727`, not `:618`). It adds Part 6 lines to Status (`:3-30`), Date (`:31`), Deciders (after `:35-38`) and PRD sections (after `:52-53`), in Part 5's form. It says it supersedes ADR 0062's `:1376` bullet, without editing 0062 while #42 is open. In `ci.md`, the `images` triage bullet (`:148-149`, after #86's text) and the cache paragraph (`:271-273`) change. `dependency-upgrades.md` gains a "Trivy" section after "Actions" (`:325-374`, the file's end), and the weekly triage's step 5 (**`:95-98`**) gains Trivy's push warning. F11's `:89-92` is the end of step 3 and the start of step 4. | ADR 0066 `:3-60, :397-400, :727, :1273, :1666`; `dependency-upgrades.md:90-98, :325` |
| §8 the matrix (F12) | **Adopted, in place.** The intro (`test-matrix.md:257-264`) says CI-21 to CI-23 "complete the series" (`:261-262`), so that clause is rewritten. The rows go after `:290`, `matrix.ts` after `:441`, and `registry.ts` after `:631`, under a group comment of their own in CI-21 to CI-23's form (`:628-631`). `fixtures.test.ts:33` holds the rows word for word, and `:57-62` checks that each `assertedBy` file exists. | `test-matrix.md:257-264, :290`; `matrix.ts:439-441`; `registry.ts:628-631` |
| §4 `no-duplicated-versions` (F13) | **Adopted, in place.** This is a ninth case, not a sixth: eight exist (`:71-124`). `scanned()` (`:35-43`) gains `tools/trivy/install.sh` and `db.sh`, and the header (`:9-29`) a Trivy line. | `no-duplicated-versions.test.ts:9-43, :71-124` |
| §4 `workflows.test.ts` (F14) | **Adopted in 12.2.** Every assertion that names trivy-action moves to the CLI steps: `isScan` (`:252`), the release build (`:626-660`), the no-cache rule (`:889-893`), `images` (`:1815-1846`, and the scan order at `:1876-1877`), and the dry run's equality and SBOM tests (`:2337-2339`, `:2375-2386`). | scout-files §1.2 |
| §8 installer tests (F15) | **Adopted, in place.** `tools/check-toolchain/install-pnpm.test.ts`, which puts a stub tool on `PATH` for an installer that refuses a hash mismatch, is the model. `install.sh` and `db.sh` are committed 100755, which `install.test.ts` asserts with `git ls-files -s`, as `tools/hooks/pre-push.test.ts:619-622` does for gitleaks' installer. | `install-pnpm.test.ts`; `pre-push.test.ts:619-622` |
| §3 `tools/package.json` (F16, V9) | **Adopted, in place.** The packages go in `devDependencies` at exact versions: `@sigstore/verify` 4.1.2, `@sigstore/bundle` 5.0.0, `@sigstore/tuf` 5.0.0 and `@sigstore/protobuf-specs` 0.5.2 (12.3). As production dependencies they would turn `pnpm audit --prod` (`ci.yml:77`, any severity) red on GHSA-g3hv-75wg-m249 (minimatch < 11.0.1, moderate, 2026-10-30). It is reached through `@tufjs/models` 5.x, which requires `^10.2.6`, so no fixed version is in range; a scratch `audit --prod` exits 1. As development dependencies only `--audit-level=high` (`:80`) applies, which passes today with the same advisory on eslint's and Stryker's paths. The checker is CI tooling that never ships, so this is also its true kind. They are exact, where `yaml` is `^2.9.1`, because the verifier is the trust decision itself: its version is read in the manifest and moves only by a reviewed diff, which is how Dependabot's npm group rewrites an exact version. | scout-pins §3 |
| §11 (F17) | **Adopted in 12.4, with a pointer in place.** P1 has merged. #86, #87 to #89, #75, #83 to #85 and #42's current files are added. | 12.4 |
| §2 cites (F18) | **Adopted in 12.2.** | scout-files §1.2 |
| §4, §8 compliance (F2) | **Adopted.** `packages/compliance/src/controls.ts:264` names `aquasecurity/trivy-action` as the container scan's evidence, and `controls.test.ts:221-228` requires every `ci_job` step to appear whole in its workflow, so retiring the action turns that test red. The step becomes `trivy image --input` (E14), and the `what` of `:261` (`pnpm actions:check`) gains Trivy's release check. `controls.test.ts` joins the failing-first set. `:265` (`sbom-`) holds, and `:217` is a literal example of `namesWhole` and stays. | `controls.ts:259-265`; `controls.test.ts:124-129, :217-228` |
| §2 the latest Trivy (V1) | **Adopted in 12.3; not wrong in place.** Nothing is newer than v0.76.1 at 17:24Z and at 17:49:18Z. v0.77.0 is pending as release-please's branch `586c9563` (2026-10-30T13:50:56Z), untagged; once tagged, it is pinnable from its `integratedTime` plus three days. `git ls-remote` runs again just before `pnpm trivy:pin`. T1 stays v0.76.1. | scout-pins §1; `git ls-remote` at 17:49:18Z |
| §2 the bundle (V2) | **Adopted in 12.3**: the re-verification (17:26Z, the same result) and the certificate's other identity values. | scout-pins §1 |
| §3 check (3) (V3) | **Adopted, in place** (12.5, item 4). The expected `.1.13`, `.1.14`, `.1.15` and `.1.17` go into the policy's `oids`, DER-encoded (by `trivy.ts`, with no `der.ts`, since 12.10 N9), so `@sigstore/verify` refuses a mismatch itself. The explicit compare after verification stays, with its failing tests. | scout-pins §3 (`verify-oids.mjs`, 17:33Z); GHSA-52v5-jr5w-gjxr |
| §2 March 2026, and "Open" (V4) | **Adopted, in place.** The facts are cited from GHSA-69fq-xp46-6x23 (advisory-database 8c754a94), and the open item is closed. "On no branch" was a misreading, corrected in 12.10 (S6). | scout-pins §1 |
| §3 `HIJACKED` and the floor (V5) | **Adopted, and widened** (12.5, item 2): the floor is 0.72.0, and a networked advisory read on CI proves its own query form (E8). | scout-pins §1 |
| §3 a new check (V6) | **Adopted, and widened** (12.5, item 3): the tag's commit must be on `release/v<X.Y>` **or the default branch**, not the release branch alone. The read at 17:43Z shows v0.76.0 on both, v0.76.1 on `release/v0.76` only, and v0.69.3 on `release/v0.69` only; whether a minor's release branch exists when its tag is pushed is not verified. 12.10 (S6) answers it (the branch is created with the `.0` tag, `release-please.yaml:113-129`) and tightens the rule. | treeless fetch at 17:43Z (12.3) |
| §5 the Revisit (V7) | **Adopted** (12.5, item 5). The condition is met: immutable releases have been on for aquasecurity/trivy since 2026-03-03 (GHSA-69fq), and its release workflow runs `actions/attest` (`reusable-release.yaml:137-141` at v0.76.1). The decision: keep the bundle check, and on CI require `immutable: true` and hold `published_at` to the floor. | scout-pins §1, §5 |
| §10 and T5 (V8) | **Adopted, in place.** Under an immutable release the tag cannot move and the assets cannot change while the release exists, and a deleted release's tag name cannot be reused (github/docs 33b1f4a6 `immutable-releases.md:22-23`). So "re-cut" becomes "withdrawn (deleted)", which is the expected case; a moved tag is the rare one. | scout-pins §5 |
| §2, §3 the database (V10) | **Adopted in 12.3; `db.sh`'s message and the runbook in place.** A ghcr blob GET answers 307 to `pkg-containers.githubusercontent.com`, so the failure message and the runbook name it beside ghcr.io. How often the database was older than 48 hours is not verified, and the floor is unchanged (12.5, item 9). | scout-pins §4 |
| §9 reachability (V12) | **Adopted, in place.** rekor.sigstore.dev and the GitHub API for `aquasecurity/*` are refused here too. So the `immutable`, `published_at` and advisory reads first run in the pull request's `static`, and the pull request records that job's id. | scout-pins, the access note |
| `HIJACKED`, the known-bad digest (V13) | **Adopted.** `HIJACKED` also refuses the v0.69.4 Linux-64bit tarball's SHA-256 from the advisory, `385d498d18a3a7c67878ca7322716f9da25683eb1a4bf9e9592da0d5f2ab09f6`, whatever version line names it. | GHSA-69fq-xp46-6x23 |
| Push-run downloads (scout-files' note) | **Declined, and bounded instead** (E9). | — |
| README (scout-files' note) | **Adopted inside P2.** `README.md:44-45` gains `pnpm trivy:pin X.Y.Z` with no version literal; README is scanned (`no-duplicated-versions.test.ts:41`). It is small and of the same kind as the lines beside it. | `README.md:44-45` |
| #86's cites (scout-files' note) | **Proposal P39** (12.8). | — |
| scout-pins' notes | **Recorded.** A Dependabot bump of trivy-action to a future v0.37.0 (after its 7-day cooldown, CQ1) is never merged here, and P2's retirement makes it moot; the weekly triage closes it. The gitleaks proposal (the same advisory and ancestry reads) widens P1's P26 (12.8). | scout-pins, "Seen in passing" |
| (this re-read) step order in `images` | **New.** The install and database steps go right after the checkout, before the builder, in all three workflows (E1). | `ci.yml:670-672`; 12.4 |
| (this re-read) script injection | **New.** Every expression a Trivy `run:` uses reaches it through step `env`, never inline (E3). | `release.yml:453` |
| (this re-read) the release workflow's scan | **New.** `release.yml`'s scan form (`--image-src docker "$IMAGE_REF"` with the database, on ubuntu-24.04) would never run before a tag, since the dry run drops the scan and `images` scans archives on ubuntu-26.04. The dry run keeps the scan (12.5, item 10). | `workflows.test.ts:2335-2339` |

### 12.2 Cites at bce57f16

The old cites are the design's, at 6ddd587 or ci-deps' 19e3d98e; the new ones are at bce57f16. Builders work from the
new column.

| Design § | Old | New (bce57f16) |
|---|---|---|
| §2, §3 | `6ddd587:ci.yml:484, 507` (the scans); `:497, 506` (the worker's `if:`) | the steps at `ci.yml:694-705` and `:718-730` (`uses:` `:695, :720`); the worker build's `if:` `:708`, the worker scan's `:719`; `images` `:665`, `runs-on: ubuntu-26.04` `:666`, `timeout-minutes: 20` `:668`, the checkout `:670-671`, the builder's comment `:672-675` |
| §2, §3 | `ci-deps:ci.yml:514, 537` (`cache-dir`) | `ci.yml:705, :730` (the comment "never one another run cached … outside the workspace" `:702-703`) |
| §3, C8 | `ci-deps:ci.yml:142` (`actions/cache/restore` v6.1.0) | `ci.yml:147`; the push-only save form `:252-262`; `cache-primary-key` saves `:162, :262` |
| §2, §3 | `ci-deps:release.yml:92-110`, `:94, :105` | `release.yml:120-139`; `image-ref` `:123, :134`; `build` `:44-49` (`runs-on: ubuntu-24.04` `:45`, four legs `:49`); the checkout `:69-71`; `TAG: ${{ github.ref_name }}` through `env` `:453` |
| §3 | `ci-deps:release.yml:21-27` (no cache) | `release.yml:21-29` ("and Trivy with its cache off" `:25`) |
| §2, §3 | `ci-deps:release-dry-run.yml:44` ("does not scan"), `:14-27` (paths) | the header `:3-15`, the build comment `:59-62`, the paths `:19-30` and `:32-43`; the SBOM `:129-139` and its SPDX read `:140-143`; the checkout `:78` |
| §3 | `ci-deps:…/network.ts:14, :27-28` | `Answer` `network.ts:27-31`; `Transport.get` `:62`; `fetchRefs`, `isAncestor`, `fetchSha` `:71-80` (implementations `:218-274`); `READ_TIMEOUT_MS` `:98`; `gitTransport` `:109`; `get` `:191-200`; `BACKOFF_MS` `:283`; `NetworkError` `:307`; `withRetries` `:338-371`; `tagCommit` `:377-388`; `recordedTransport` `fixtures.ts:46` |
| §3 | `base.ts:44-47` | `baseState` `base.ts:45-73` (the checker diff `:67-69`); the paths named once `:14-23`, held by `check.test.ts:181-191` |
| §3 | `ci-deps:…/check.ts:43-105`, the push path `:90-103` | `checkActionPins` `check.ts:118-297`: the offline errors `:122-129`, the `--offline` return `:132`, the shared deadline `:213-215`, `now`, `clock` and `floor` `:216-220`, the builder `:224-231`, the age rule `:233-253`, `finally` `:254-255`, the push re-reads `:258-295`; `PUSH_DEADLINE_MS` `:38`; the printed titles `index.ts:37-40` |
| §3 | `ci-deps:…/verify.ts:113-181` | `cacheGates` `verify.ts:162-200`, `releaseCacheProblems` `:203-220`, the release steps `:260-266`; the trivy-shaped fixture `verify.test.ts:25` stays |
| §2 | `ci-deps:…/workflows.ts:101` | `workflows.ts:101` (unchanged) |
| §3 (5), C7 | `p1-design.md:178-183`; `ci-deps:…/policy.ts:10` | `exclude-window.ts:22` (`READ_DEADLINE_MS`), `:29-32` (`releaseAgeMinutes`), `:35-37` (`ageWords`); `policy.ts:11` (`MINIMUM_RELEASE_AGE_MINUTES`), `:18` (`MINUTE_MS`); `follow-up-p1-pin-age.md:244-249` |
| §3 push | `ci-deps:tools/check-toolchain/check.ts:219-238` | `buildkit.ts:65-120` (the closer precedent: `fault` `:89`, the newer-release warning `:110-117`); check-toolchain `check.ts:346-363` |
| §3, 12.5 | (none) | the age rule's release read `age.ts:598-616`; ancestry `:645-660`; the advisory read `:740-760`; the local note `:790-800`; `apiGet` `:348`, its headers `:810` |
| §2 | `6ddd587:tools/gitleaks/install.sh`, `release.txt` | unchanged: `awk` reads `install.sh:12, :23`, the mirror override `:50`, `curl` `:53`, the message `:59`, `tar … gitleaks` `:63`, the atomic move `:65-67` |
| §4 | `package.json:18` | `package.json:18` (`gitleaks:install`) |
| §4 | `workflows.test.ts:176` (`isScan`) | `:252` |
| §4 | `workflows.test.ts:450` | `:626-660` (the scan `:640, :644`) |
| §4 | `workflows.test.ts:571-575` | `:871-897` (the Trivy lines `:889-893`) |
| §4 | `workflows.test.ts:1213-1237` | `:1815-1846`; the scan order `:1876-1877` |
| §4 | `workflows.test.ts:1306-1345`, `:1310` | the dry run's describe `:2252-2388`: `PATHS` `:2258-2268`, `cutScript`, `cutInput`, `asDryRun` `:2272-2288`, the equality `:2324-2349` (`kept` `:2337-2339`), the SBOM test `:2375-2386`; `APT_SAVE_IF` `:244`; actionlint `:2455-2460` |
| §4 | `no-duplicated-versions.test.ts:9-16, 25-33` | the header `:9-29`, `scanned()` `:35-43`, the eight cases `:71-124` |
| §4 | `collection.test.ts:41-43` | unchanged (`testsIn('tools/ci')` `:43`) |
| §4 (new) | (none) | `packages/compliance/src/controls.ts:261, :264, :265`; `controls.test.ts:124-129, :217, :221-228` |
| §5 | ADR 0010 `:19, 30` | `:19`, `:30-31` (and `:78`, "the same Trivy scan", which stays true) |
| §5 | ADR 0066 `:618` | Part 2's Revisit `:723-729` (the Trivy line `:727`); Part 2's no-cache text `:390-400`; the pin table `:347`; Part 5 `:1273-1681` (its Context `:1282-1283`, the unheld line `:1666`, the Revisit `:1674-1681`); the header `:3-60` |
| §5 | `ci.md:33, 83, 197` | `:33` (the `images` row), `:148-149` (its triage bullet), `:271-273` (the cache paragraph) |
| §5 | `dependency-upgrades.md` (no cite) | the weekly triage `:45-104` (step 5 `:95-98`); "Actions" `:325-374` |
| §5 | reconciliation-001 (none) | P1's entry `:659-661`, the file's end |
| §8 | `registry.ts:463-466`; `test-matrix.md:211-213` | `registry.ts:615-619` (CI-11 to CI-14), `:628-631` (CI-21 to CI-23, the form to follow); `test-matrix.md:257-264`, the last row `:290`; `matrix.ts:439-441`; `fixtures.test.ts:33, :57-62` |
| §3 | `lane-b-ci.md:2009-2011`, `:2108-2112`, `:2066-2068` | `:2026-2027` (`RELEASE_RUNNER`), `:2168` (Trivy's `input:`), `:2086` (the attestation); the P2 line `:1534` |
| §6, C7 | `p1-design.md:343-345` | `follow-up-p1-pin-age.md:451-452` |
| §8 | `tools/ci/postgres.test.ts` | `tools/check-toolchain/install-pnpm.test.ts`; `tools/hooks/pre-push.test.ts:619-622` |
| §11 | `pr42-files.txt:80, :86, :136-138` | #42 at c65f9cf2 (12.4) |
| 12.6 | (none) | `tools/stryker/affected.ts:121-130` (`GLOBAL_INPUTS`, root `package.json` `:125`), `:27`, `:373`; `watched-paths.txt:20, :23`; `README.md:44-45`; `LANES.md:31-36, :84-93` |

### 12.3 Versions and facts measured today

**Trivy** (scout-pins §1, 17:24Z to 17:36Z; this revision's `git ls-remote` at 17:49:18Z and treeless fetch at 17:43Z).
The floor is `pnpm-workspace.yaml`'s `minimumReleaseAge`, read through `releaseAgeMinutes`: 4,320 minutes.

| Fact | Value |
|---|---|
| Release | **v0.76.1**, still the newest stable tag; no `-rc` tag; v0.77.0 pending as `refs/heads/release-please--branches--main` 586c9563 (2026-10-30T13:50:56Z), untagged. (14) No longer: v0.76.2 (`3f6334d2`, signed 2026-11-05) is the newest tag, and v0.77.0 is pending at `f96377a4`, untagged (`git ls-remote`, 2026-11-07T06:58:20Z); 14.4 chooses the release |
| Tag | lightweight, naming `e713f67f7d54decdcd9b3132c9751833dcced698` ("release: v0.76.1 [release/v0.76] (#11445)", committed 2026-10-21T10:20:32Z) |
| Ancestry (17:43Z) | v0.76.1 `e713f67` is an ancestor of `release/v0.76` (whose head it is) and not of `main` (e2c05f7); v0.76.0 `531360e` ("release: v0.76.0 [main]") of both; v0.75.0 `591e979` of `main` and of `release/v0.75`, whose head it is; v0.69.3 `6fb20c8` of `release/v0.69` only. v0.69.4's `1885610c` is on neither `main` nor `release/v0.69` (which ends at v0.69.3), but GHSA-69fq says it was "also committed to a v0.70.0 branch" (12.10, S6). At 20:01Z every `vX.Y.0` from v0.65.0 to v0.76.0 is on `main`, every patch on its `release/vX.Y`, and each `release/vX.Y` holds its `.0` (`release/v0.69` holds v0.69.0) |
| Archive | `trivy_0.76.1_Linux-64bit.tar.gz`, 52,676,794 bytes, SHA-256 `c7cbe3137fb8a48a17574bede3dd6beb16742d1e9772929940fc90082c39d9c0`, equal to its `checksums.txt` line and to the bundle's `messageDigest`; served by a 302 to `release-assets.githubusercontent.com/github-production-release-asset/180687624/…` |
| `checksums.txt`, bundle | 2,121 bytes, SHA-256 `885debc4…535d`; `…tar.gz.sigstore.json`, 10,383 bytes, SHA-256 `6955f036…69ca1`, `application/vnd.dev.sigstore.bundle.v0.3+json` |
| Signature | `@sigstore/verify` 4.1.2 with `@sigstore/tuf` 5.0.0's embedded trusted root (the SAN passed as a plain string, which the library reads as an unanchored pattern; 12.10, S1): OK for the SAN `https://github.com/aquasecurity/trivy/.github/workflows/reusable-release.yaml@refs/tags/v0.76.1` and issuer `https://token.actions.githubusercontent.com`; `UNTRUSTED_SIGNER_ERROR` for `@refs/tags/v0.76.0`; `SIGNATURE_ERROR` for a truncated archive; with `oids` `.1.13 = e713f67…`, `.1.14 = refs/tags/v0.76.1`, `.1.15 = 180687624` and `.1.17 = 12783832` OK, and with v0.76.0's commit as `.1.13` `UNTRUSTED_SIGNER_ERROR … missing OID 1.3.6.1.4.1.57264.1.13` (17:26Z, 17:33Z) |
| Certificate | `.1.9` and `.1.18` the build and config URIs (`…/reusable-release.yaml@refs/tags/v0.76.1`, `…/release.yaml@refs/tags/v0.76.1`); `.1.10`, `.1.13`, `.1.19` the commit; `.1.12` `https://github.com/aquasecurity/trivy`; `.1.14` `refs/tags/v0.76.1`; **`.1.15` 180687624** (the repository's ID, the same as in the asset URL); **`.1.17` 12783832** (the owner's); `.1.11` `github-hosted`; `.1.20` `push`; `.1.21` run 39586330915, attempt 1; `.1.22` `public` |
| Signing time | one hashedrekord tlog entry, logIndex 3354989152, with an inclusion promise and proof: **`integratedTime` 1792581276 = 2026-10-21T11:14:36Z**; one RFC 3161 timestamp. Three days old from 2026-10-24T11:14:36Z; **11.27 days old** at 17:49:18Z |
| Published | the API was not read here. The bundle asset's `Last-Modified` is 2026-10-21 11:18:30 GMT and Docker Hub's `aquasec/trivy:0.76.1` was pushed at 11:16:45Z, so about 11:18Z. `immutable` was not read here; the GHSA says immutable releases have been on since 2026-03-03 |
| Advisories | none affects 0.76.1. GHSA-69fq-xp46-6x23 (CVE-2026-33634): trivy = 0.69.4 only, trivy-action < 0.35.0, setup-trivy < 0.2.6, critical; GHSA-q3fv-x8vg-qqm4: < 0.71.0, high; **GHSA-mcj4-mphf-j9ff: < 0.71.1, high, a path traversal through a crafted vulnerability database**; GHSA-8rc5-4fr6-64pw: < 0.72.0, moderate (advisory-database 8c754a94; pkg.go.dev's list the same, 17:34Z) |
| March 2026 | v0.69.4 was built and signed by Trivy's own release pipeline from an attacker-pushed tag on `1885610c` (an impostor `actions/checkout`, goreleaser with `--skip=validate`), exposed 2026-03-19 18:22Z to about 21:42Z; 0.69.5 and 0.69.6 were Docker Hub images only, with no GitHub tag or release (2026-03-22 15:43Z to 2026-03-23 about 01:40Z). The v0.69.4 Linux-64bit archive's SHA-256 is `385d498d18a3a7c67878ca7322716f9da25683eb1a4bf9e9592da0d5f2ab09f6` |
| Upstream release workflow | `reusable-release.yaml:137-141` at v0.76.1 runs `actions/attest` (v4.2.2) over `checksums.txt`; whether it ran for v0.76.1 is not verified |

**npm** ((14) the rows marked latest are no longer the newest: `@sigstore/verify` 4.1.3, `@sigstore/tuf` 5.0.1,
`@sigstore/bundle` 5.0.1, `tuf-js` 6.0.2 and `@tufjs/models` 5.0.2 were published since, 14.4; scout-pins §3;
registry.npmjs.org at 17:25Z; a scratch `pnpm install` with pnpm 10.34.8, `minimumReleaseAge:
4320` and `trustPolicy: no-downgrade`: 14 packages resolved, both gates passed; nine are new to the lockfile, which
holds none of them at bce57f16):

| Package | Version | Published | Age at 17:25Z | Evidence | New to the lockfile |
|---|---|---|---|---|---|
| `@sigstore/verify` | **4.1.2** (latest) | 2026-08-04T21:34:43Z | 89 d | trusted publisher | yes |
| `@sigstore/bundle` | **5.0.0** (latest) | 2026-06-01T21:02:52Z | 153 d | trusted publisher | yes |
| `@sigstore/tuf` | **5.0.0** (latest) | 2026-06-01T21:02:52Z | 153 d | trusted publisher | yes |
| `@sigstore/protobuf-specs` | **0.5.2** (latest) | 2026-08-21T20:09:34Z | 72 d | trusted publisher | yes |
| `@sigstore/core` | 4.0.1 | 2026-06-25T22:33:24Z | 128.8 d | trusted publisher | yes |
| `tuf-js` | 6.0.0 now; 6.0.1, three days old from **2026-11-01T18:27:09Z** | 6.0.1 2026-10-29T18:27:09Z | — | trusted publisher | yes |
| `@tufjs/models` | 5.0.0 now; 5.0.1, three days old from **2026-11-01T18:25:36Z** | 5.0.1 2026-10-29T18:25:36Z | — | trusted publisher | yes |
| `@tufjs/canonical-json` | 2.0.0 | 2023-08-17 | — | provenance | yes |
| `@gar/promise-retry` | 1.0.3 | 2026-03-18 | — | none (no version has any) | yes |
| `debug`, `ms`, `minimatch`, `brace-expansion`, `balanced-match` | 4.4.3, 2.1.3, 10.2.6, 5.0.12, 4.0.4 | — | — | — | no (`pnpm-lock.yaml:2634, :3288, :3284, :2557, :2545`) |

The engines of `@sigstore/*` 4.x and 5.x and `tuf-js` 6 are `^22.22.2 || ^24.15.0 || >=26.0.0`; CI runs Node 24
(`ci.yml:45`). The builder records the transitive versions `pnpm install` resolves, whichever of 6.0.0/6.0.1 and
5.0.0/5.0.1; both pass the gates. Advisories: GHSA-xgjw-pm74-86q4 (`@sigstore/verify` 3.1.0 only), GHSA-jfc7-64v2-mr8c
(`@sigstore/core` < 3.2.1) and GHSA-52v5-jr5w-gjxr (`sigstore` < 4.1.1, OID constraints silently dropped) affect none of
these; GHSA-g3hv-75wg-m249 (minimatch < 11.0.1, moderate) is reached and is why they are development dependencies
(12.1).

**The vulnerability database** (scout-pins §4, anonymous, 17:31Z):

| Repository | Manifest | Created | Age at 17:31Z | Layer |
|---|---|---|---|---|
| `ghcr.io/aquasecurity/trivy-db:2` | `sha256:9fef48b3ecf9d52f38e7fd3cb076819abbf8d52dd20369962d8f99361bebff3e` | 2026-11-01T13:10:29Z | 4 h 21 m | `db.tar.gz` `sha256:2d48900d266bd8bbdc04d839aebc9a21821820f61bec16d21bd50cdf9822fcc9`, 137,610,443 B |
| `mirror.gcr.io/aquasec/trivy-db:2` | `sha256:610ba6fde4f1196dd4c3f5cab237075ff6d1882b76bdc6f5ec63f72235acb783` | 2026-11-01T13:10:37Z | — | the same layer |
| `ghcr.io/aquasecurity/trivy-java-db:1` | `sha256:65a4fcd5670bdb3dc2faf970a35fe81f828266e6c62deb37216e427d7982b58c` | 2026-11-01T01:00:06Z | 16 h 31 m | `javadb.tar.gz` `sha256:a50ce8f16abc83fa133aa2065399d85ec10312e0fa6891f847b5e931080ba13e`, 993,096,515 B |

Still unsigned (no `.sig` tag, the referrers endpoint `MANIFEST_UNKNOWN`, no cosign in trivy-db's `cron.yml`). trivy-db
builds every six hours (`cron.yml:4-5`, `"0 */6 * * *"`), trivy-java-db daily. A ghcr blob GET answers 307 to
`pkg-containers.githubusercontent.com`, which this session cannot reach, so `metadata.json`'s `UpdatedAt` was not read
and the `created` annotation stands in for it. The history of how often the database was over 48 hours old is not
verified: there are two samples (16 minutes on 2026-10-26, 4 h 21 m today). Our runs today pull from the mirror, so
ghcr's anonymous limits are not verified either.

**P4's facts** (the replay totals, runner-minutes and Stryker's pins) are not this item's; P4's re-read
(wf_c5d11a6c-419) records them in its own design.

**What the pull request is expected to print on CI** ((14) superseded by 14.7's list: the base now has #107's
`release.txt` and its age rule's release notes, and the signed object and `signed_at` are the checksums file's; its first
run, after 2026-11-01T18:27:09Z if the lockfile takes `tuf-js` 6.0.1):
- `static`, "Action pins":
  - The verify loop reads every ref again, because the change edits `tools/check-action-pins` (`base.ts:67-69`): 12 refs
    of 11 commits, P1's 13 refs of 12 (`follow-up-p1-pin-age.md` 14.3) less trivy-action.
  - The age rule: "age: no pin new against the base, nothing read" (the new cache steps reuse `55cc8345`, `ci.yml:147`).
  - The builder's two notes.
  - Then Trivy, every check, since the base has no `tools/trivy/release.txt`: the tag `v0.76.1` names `e713f67…`; the
    commit is on `release/v0.76`, which holds v0.76.0's `531360e`, itself on `main`; the bundle verifies under the
    trusted root read from tuf-repo-cdn.sigstore.dev as exactly `reusable-release.yaml@refs/tags/v0.76.1`, its issuer,
    `.1.11`, `.1.13`, `.1.14`, `.1.15`, `.1.17`, `.1.18` and `.1.20`; the signed digest `c7cbe313…` equals `linux_x64`
    and the `checksums.txt` line; one tlog entry, `integratedTime` 2026-10-21T11:14:36Z equal to `signed_at` and three
    days old; the release `immutable: true` with `published_at` three days old (the first live read; about 11:18Z
    expected); the one advisory read by package holds GHSA-69fq-xp46-6x23 for 0.69.4 and GHSA-mcj4-mphf-j9ff for 0.71.0
    (the control) and none for 0.76.1 (12.10, S7); "no newer release is three days old" unless v0.77.0 is tagged and old
    enough by then.
  - If `immutable` reads false or absent, the pull request is red by the rule; the integrator stops and the session
    decides (12.5, item 5).
- `static`, "Toolchain": nine versions new to the lockfile, each at least three days old; no image new against the base.
  `pnpm audit --prod` stays clean, and `--audit-level=high` passes with GHSA-g3hv-75wg-m249 listed on one more path.
- `images`: "Install Trivy" prints `Version: 0.76.1`; the database step's summary names `ghcr.io/aquasecurity/trivy-db`,
  `UpdatedAt` under 48 hours, and `DownloadedAt`; the scans run the CLI with `--skip-db-update`. Whether v0.76.1 reports
  HIGH or CRITICAL findings that v0.70.0 did not is not verified; if it does, `images` is red and the runbook's triage
  fixes them in the pull request (§10, the first row).
- release-dry-run (its paths change): on both legs the install, `db.sh` on ubuntu-24.04 with jq 1.7.1, the SBOM by the
  CLI reading the local daemon, and the SPDX read.
- screening-capacity: about 13 to 16 minutes, since root `package.json` and `pnpm-lock.yaml` are watched
  (`watched-paths.txt:20, :23`).
- mutation: all four shards, since root `package.json` is a global input (`affected.ts:125`) and `tools/package.json` is
  the manifest of the package the mutation tooling lies in (`affected.ts:27, :373`; not verified by a run).
- approval-of-record.
- Its merge's push run: the same reads, every finding a warning, plus the push-only reads (the tag, the release, newer
  releases) and the first save of the archive cache.

### 12.4 Overlaps and merge order

(14) This is history: every pull request in the table below has merged or closed (#42 on 2026-11-02; #86, and #96, P4,
before P2, on 2026-11-04; #87 to #89 closed unmerged; `gh api`, 2026-11-07T07:08Z), and 14.6 lists the overlaps at
8a722f80. The order (the status file's RESUME-BLOCK and the session's item): #86 (ci-images-digest) merges next, then
#75, #84, #83 and #85; P2, then P4, each after its own pipeline; P5 (ci-catalog) is not this session's. (G7) #83
merged out of that
order at 2026-11-01T20:40:34Z, so `claude/build-platform` is 43565235 (`git ls-remote` at 20:51:57Z), 16 commits past
bce57f16; its hunks lie after P2's places (`test-matrix.md:342`, `matrix.ts:464, :476`, `registry.ts:717`,
`watched-paths.txt:52`) and it touches no other file P2 cites, so every bce57f16 cite here holds at 43565235 (12.11,
G7). Every resolution follows LANES.md rule 6 (`:31-36`): the pull request merged second merges the latest
`claude/build-platform` in with a merge commit, never a rebase or a force-push; it keeps both sides of every shared
document (reconciliation-001, `test-matrix.md`, an ADR, `registry.ts`, a runbook); and it regenerates every generated
file on the merged tree (`pnpm install` for `pnpm-lock.yaml`, `watched.ts --write` for `watched-paths.txt`,
`pnpm synth --all`), never by hand.

| Pull request | What it shares with P2, and its hunks | Who resolves | Cut P2 after it? |
|---|---|---|---|
| **#86** ci-images-digest (open, draft, head 83167b8f, its own session; GitHub "not mergeable, dirty" at 17:28Z; last updated 2026-10-28T08:01:36Z) | Read at 17:42Z against its merge base 83d71fd6. **Workflows:** three comment lines above `images:`; two comment lines and `env: { BUILDX_METADATA_PROVENANCE: disabled }` on the web build; that `env` on the worker build; the identity steps take `BUILT`; the same `env` and comments on the build step of `release.yml` and the dry run (and of `release-capacity.yml` and `screening-capacity.yml`, which have no Trivy). **Documents:** the `images` triage bullet of `ci.md` (`:148-149`, the one P2 extends) and a "Changing CI" bullet; ADR 0066's Date line, Part 3's Deciders and notice N29, which #86 renumbers N32 after its base merge (`approval-summaries/lane-b-ci-images-digest-status.md:71-73`; (G8) 12.11); an entry at the end of reconciliation-001. **`workflows.test.ts`:** the expression value rule (`:2957-3130` at 83167b8f: `$GITHUB_ENV` writes closed to `ENGINE_FREEZE_BASE`, `runner.*` admitted) and `BOUNDED_VALUES` (`:3213-3289`), in which `steps.image.outputs.ref` is already listed for both release builds; a new step output P2 hands to `actions/cache/save` needs a row. A trial merge of 83167b8f into bce57f16 conflicts in ADR 0066, reconciliation-001 and `workflows.test.ts` against P1, so #86 merges the build branch in first. | Nothing, if P2 is cut after #86: P2 then writes its row into #86's list once, under #86's own test. P2's workflow steps sit at least four unchanged lines from every #86 hunk (E1), so they would merge cleanly either way. | **Yes, recommended.** P2's branch has no commits (cut locally at bce57f16, not pushed), so re-cutting it from the build branch after #86 merges costs nothing, and P2 resolves nothing of #86's; meanwhile the session builds P4, which is independent (the orchestrator, 17:24 UTC). **Fallback:** if #86 has not merged when P4's build reaches its draft pull request, cut P2 from the build branch then current, and merge the build branch in after #86 merges, with a merge commit. P2, merged second, keeps #86's `ci.md` text and N32 and then adds its own (Part 6's N33 to N42, 12.11 G8), appends its reconciliation entry after #86's, and adds its `BOUNDED_VALUES` row. |
| **#42** PR 6b-4 (open, head (G7) 6c28d6a2 of 2026-11-01T20:34:23Z, which merged bce57f16, so its merge base is bce57f16, 219 files; read 20:47Z, 12.11 G7; the shared files are unchanged) | `ci.yml` and `workflows.test.ts`: only the port of #86's identity steps (hunks at bce57f16: `ci.yml:736-744, :748-756`, five lines below P2's worker scan `:718-730`; `workflows.test.ts:1853-1868`, seven lines below P2's `:1815-1846` and eight above its `:1876-1877`). `test-matrix.md:177-217` (LED and SCR rows), `matrix.ts:223, :331`, `registry.ts:367, :513, :523`, `reconciliation-001.md:638`, `pnpm-lock.yaml` (the apps/web and apps/worker importers, `@aws-sdk/client-sqs`), and (G7) `watched-paths.txt` (five hunks, `:93-307`), which P2 does not touch. None is in P2's hunks, and none is on the "Not while #42 is open" list (`LANES.md:84-91`). ADR 0062 is #42's, and P2 does not edit it: its `:1376` bullet ("both trivy-action steps set `cache: false`…") goes stale, and Part 6 says it supersedes it (P38). | The one merged second, under rule 6; the lockfile is regenerated with `pnpm install`, never hand-merged. | No. |
| **#75, #83, #84, #85** (merge before P2; (G7) #83 merged at 20:40:34Z) | `test-matrix.md` (`:228`, `:337`, `:129`, `:129`), `matrix.ts` and `registry.ts`, all outside the CI block; #75 also `reconciliation-001.md:260` (not the end); #84 also `ci.md:440` (the mutation shard table). | P2, merged second, at its base merge: mechanical, both sides kept, then `pnpm synth --all`. | No: they touch none of P2's regions. |
| **#87, #88, #89** (Dependabot; never merged by this session) | `pnpm-lock.yaml` and other packages' manifests (#89: ten `@aws-sdk` and stripe bumps); not `tools/package.json`, whose importer is `tools:` at `pnpm-lock.yaml:791`. | If one is merged (by the founder or the triager) before P2, P2's base merge regenerates the lockfile with `pnpm install` on the merged tree (`LANES.md:35`). If P2 merges first, Dependabot rebases its own. | No. |
| **P4** `co-001/ci-mutation-trigger` (local at bce57f16, not pushed; merges after P2) | ADR 0066 (Part 7 after Part 6, and the header lines; (G8) Part 7's notices from N43, after Part 6's N33 to N42, which P4's E6 renumbers in its own commit), `test-matrix.md`, `matrix.ts` and `registry.ts` (CI-27 to CI-29 after CI-26), possibly the runbooks; its code is `tools/stryker`. | P4, merged second: Part 7 after Part 6, its rows after CI-26, both header lines kept. If P4 is ready first, the session may merge it first, and P2 then resolves the same way. | No. |
| **ci-findings-transport** (queued after #86, its own session; it needs no test-matrix rows, and CI-30 and CI-31 were released, `LANES.md:29`, 18:00 UTC; 12.10 N13) | The findings transport of `content-calendar.yml`, which #86's list marks `over: 'ci-findings-transport'`; probably `workflows.test.ts` and rule-6 documents (not verified). | The one merged second, under rule 6. | No. |
| (G7) **#91** `co-001/dependabot-group-routing` (open, draft, head 651f8b80, created 2026-11-01T18:34:25Z, merge base bce57f16; read 20:47Z) | ADR 0066: a Part 2 amendment inserted after `:730`, +12 lines, so every cite from Part 3 on moves by +12 (Part 5 `:1273-1681` to `:1285-1693`, its `:1666` to `:1678`, its notices `:1608-1629` to `:1620-1641`), while Part 2's `:347`, `:397-400` and `:727` do not move. `dependency-upgrades.md`: hunks at `:25-31`, `:58-72` (+5), `:100-105` (+2) and `:318-326` (+3), so step 5 (`:95-98`) moves to `:100-103` and "Actions" (`:325-374`) to `:335-384`, +10. The CI-12 rows of `test-matrix.md` (`:276-282`) and `matrix.ts` (`:427-433`), changed in place, and `fixtures/synthetic/CI-12/expected.json`. Its `dependabot-config.test.ts` routes every direct dependency dynamically, so P2's `@sigstore/*` need no edit there. | The one merged second, under rule 6: both sides of ADR 0066 and the runbook kept; P2's cites re-mapped at its base merge. | No. |
| (G7) **#90** `co-001/deps-anthropic-sdk-1` (open, draft, 06f79c07, 18:28:33Z, merge base bce57f16) | `test-matrix.md` (MOD-17 and MOD-18, +5 at `:231-246`, so P2's intro `:257-264` and last row `:290` move by +5), `matrix.ts` (+12 at `:380`; P2's `:439-441` to `:451-453`), `registry.ts` (+3 at `:578`; `:628-631` to `:631-634`), `fixtures/synthetic/MOD-17` and `MOD-18`, and `pnpm-lock.yaml` (the model-gateway importer and `@anthropic-ai/sdk`). | The one merged second: both sides' rows kept, the lockfile regenerated with `pnpm install`, then `pnpm synth --all`. | No. |
| (G7) **#92** `co-001/ux-sign-in-time` (e4e05a0d, 20:01:07Z, merge base bce57f16) and **#93** `co-001/ux-home-figures` (af3b6d89, 20:35:12Z, merge base 83d71fd6) | Each appends rows at the end of `test-matrix.md` and `matrix.ts` (SGN-01 to SGN-04; HOM-01 to HOM-04) and entries in `registry.ts` after `:735`, all after P2's places, which do not move; one line each in `watched-paths.txt`, and `packages/synth/src/cases/common.ts` and `expected/types.ts`, none of which P2 touches. | The one merged second: rows kept, `watched-paths.txt` regenerated with `watched.ts --write`, then `pnpm synth --all`. | No. |
| (G7) **#94** `co-001/deps-aws-cdk-minor-patch` (484e9f06, created 20:46:30Z, after the critic's read; merge base 43565235; `blocked`) | `pnpm-lock.yaml` (263 lines in, 275 out) and the manifests of `apps/web`, `apps/worker`, `infra` and five packages, not `tools/package.json`; `dependency-upgrades.md` +2 at `:320`, inside "Where every package comes from", so with #91 "Actions" moves by +12. | The one merged second: the lockfile regenerated with `pnpm install` on the merged tree, never hand-merged. | No. |

### 12.5 Scope decisions

Each takes the recommended option under the co-founder's ruling of 2026-10-26 (about 00:20 UTC), and for security the
safer one. None is a founder-kept matter; the one place a founder ruling could arise is named in item 9.

1. **Retire trivy-action and setup-trivy (C1): unchanged, and P1 makes it cleaner.** P1 aged trivy-action's pin
   `ed142fd` once, on its own pull request as bootstrapping (ADR 0066 `:1504`, `:1529`), and re-reads its tag on every
   push (`check.ts:258-295`). Retiring it removes the pin from every workflow, so the age rule, the verify loop and the
   push re-read have nothing left to read for it, and `age-exceptions.json` holds no entry to clean (`entries: []`).
   The nested-cache rule (`verify.ts:162-220`) stays for any other composite, with its trivy-shaped fixture
   (`verify.test.ts:25`); ADR 0066's tables (`:347`, `:1504`, `:1529`) stay as records; P27's nested `setup-trivy`
   example becomes moot. P1's image rule never reads `env` or `run:` (`images.ts:1123-1210`), so P2's own checker holds
   `TRIVY_DB_REPOSITORY` and the `trivy` steps, and Part 6 answers Part 5's "Trivy and its database" (`:1666`).
2. **The version floor and the advisories.** (a) As written: `HIJACKED` and "at least 0.69.3". (b) The floor raised to
   0.72.0. (c) (b), plus, on CI, a read of GitHub's advisory database for the version being pinned and for each newer
   candidate. **Taken: (c), the safer option.** 0.69.3 admits GHSA-q3fv (< 0.71.0, high), GHSA-mcj4 (< 0.71.1, high) and
   GHSA-8rc5 (< 0.72.0, moderate), and GHSA-mcj4 is a path traversal through a crafted vulnerability database, the very
   artifact T7 guards, so a floor that admits it contradicts C3. A static floor knows only the advisories of the day it
   was written, so the read covers the next one. 12.10 (S7) sets its form: one read per run by package, `GET
   /advisories?ecosystem=go&affects=github.com/aquasecurity/trivy`, every page, with the job's read-only token through
   `api.ts`'s `apiGet` (moved from `age.ts:348`, its headers `:810`), and the pin and each candidate judged locally by
   `ghsaRangeHolds` (`age.ts:707`). Any reviewed, unwithdrawn advisory whose range holds the version fails a pin and
   warns on a push. A local control proves the read on every run (E8). Locally the read is skipped with a note, in the
   form of `age.ts:790-800`. `HIJACKED` keeps 0.69.4, 0.69.5 and 0.69.6 with CVE-2026-33634, the last two marked "Docker
   Hub images only", and refuses v0.69.4's archive digest (`385d498d…09f6`) whatever version line names it.
3. **Where the tag's commit must be.** (a) Nowhere, as written. (b) On `release/v<X.Y>` (V6). (c) On `release/v<X.Y>` or
   on the default branch. **Taken: (c).** Both (b) and (c) refuse v0.69.4's shape: a commit off `main` and every release
   branch, tagged, which Trivy's own pipeline then built and signed, so the signature and the tag check pass it (the
   attacker had also pushed it to a `v0.70.0` branch; 12.10, S6). At 17:43Z v0.76.0 was on `main` and `release/v0.76`,
   v0.76.1 on `release/v0.76` only, v0.75.0 on `main` and its own branch, and v0.69.3 on `release/v0.69` only. (b) alone
   would refuse a new minor's `.0`, whose release branch is created with its tag (`release-please.yaml:113-129`).
   **12.10 (S6) tightens (c)**: a `vX.Y.0` commit on the default branch; a patch on `release/vX.Y`, which must hold the
   `.0`; the branch listed before it is fetched. The read is P1's: `fetchRefs` lists and fetches, without trees, the
   default branch and the tag (`network.ts:218-240`), and gains an optional list of branches (E6); `isAncestor`
   (`:253-262`) answers. The fetch was 3.8 MB here (17:43Z). It runs at pin time and for each newer candidate on a push;
   an unchanged pin is not re-checked, since its tag's re-read already warns on a move.
4. **The signer's identity in the policy.** The expected `.1.13` (the commit), `.1.14` (`refs/tags/v<version>`), `.1.15`
   (180687624, the repository's ID) and `.1.17` (12783832, the owner's) go into `@sigstore/verify`'s policy `oids`,
   DER-encoded (by `trivy.ts` since 12.10, N9), so the library refuses a mismatch. The explicit compare stays, because
   GHSA-52v5-jr5w-gjxr shows a wrapper silently dropping OID constraints; its test injects a verifier that ignores
   `oids`. The numeric IDs survive a renamed or resurrected repository, which the SAN's name does not. **Taken, the
   safer option.** 12.10 adds `.1.11`, `.1.18` and `.1.20` (N12), anchors the SAN and compares the SAN and the issuer
   exactly after verification (S1), and decodes through `@sigstore/core` with no `der.ts` (N9).
5. **Immutable releases.** The design's Revisit ("Trivy publishes GitHub immutable releases and attestations") is met.
   (a) Leave it as a Revisit. (b) Replace the bundle check with `gh attestation verify`. (c) Keep the bundle check, and
   on CI read `repos/aquasecurity/trivy/releases/tags/v<version>` with the job's token, through `api.ts`'s reader, as
   `age.ts:598-616` reads a release (12.10, S7): require `immutable: true`, and hold `published_at` to the floor as a
   second time, the youngest of it and `integratedTime` counting. **Taken: (c).** GitHub's release attestation binds the
   assets to the release, not to the signer's workflow, ref, commit and repository, and immutability did not stop
   v0.69.4, published 16 days after it was turned on. On a push the release read replaces the asset `HEAD` (E10): a 404
   warns "withdrawn", and a release that is not immutable warns. Locally the read is skipped with a note. The new
   Revisit: GitHub's release attestation, or `gh attestation verify`, adds an identity check the bundle lacks. If the
   pull request's first live read shows v0.76.1 not immutable, the rule refuses it, the integrator stops, and the
   session decides under the same ruling.
6. **The deadline.** (a) A 300 s read of the archive (as written), which cannot finish under P1's shared 180 s. (b) A
   deadline of Trivy's own, 180 s: P1's bounds on a push are 600 s at their limits, with about 183 s of other steps
   (`follow-up-p1-pin-age.md:989-997`), so another 180 s would reach about 963 s against `static`'s 900 s
   (`ci.yml:38`). (c) Trivy's reads under the shared `READ_DEADLINE_MS` (`exclude-window.ts:22`, `check.ts:213-215`),
   after the age rule, with a 60 s limit per archive read. **Taken: (c).** On a pull request that changes
   `release.txt`, the age set is empty or small, so Trivy has nearly the whole 180 s; reads left unfinished are one
   error naming the host on a pull request (a re-run clears it) and one warning on a push, as E3 of P1 says.
7. **P2 is built after #86 merges** (12.4).
8. **Two kinds of fault** (E5): a verdict on the recorded bytes fails any pull request whose reads run, a change to the
   checker alone included; a change upstream fails only a new pin.
9. **The database.** The 48-hour floor, ghcr.io alone and no mirror (C3, T7) are unchanged, and how often the database
   was older than 48 hours is not verified (12.3; P41 measures it). `db.sh`'s failure message and the runbook name
   `pkg-containers.githubusercontent.com` beside ghcr.io. C7 is unchanged: Trivy gets no release-age exclude. Adding
   one would extend the founder's F2 (b) to a new kind, so it is the founder's if it is ever wanted; it is not built.
10. **The release's scan before a tag.** `release.yml`'s scan (`trivy image --image-src docker "$IMAGE_REF"` with the
    database, on ubuntu-24.04's classic store) never runs before the founder's tag: the dry run drops it
    (`workflows.test.ts:2337-2339`), and `images` scans archives on ubuntu-26.04. trivy-action's `image-ref` scan had
    the same gap, but P2 changes the mechanism. (a) Leave it: its parts run piecewise, the daemon read in the dry run's
    SBOM, `db.sh` in the dry run, the flags in `images`. (b) The dry run keeps the scan too: its equality rule then
    drops only the SBOM upload. **Taken: (b).** The release's whole Trivy path then runs before a tag, at the cost of
    about a minute per dry-run leg on the rare pull request that changes the release. A finding there duplicates the
    `images` verdict, which is harmless, and the dry run stays outside the required checks. The dry run's header
    (`:3-15`), build comment (`:59-62`) and the equality test's comment (`workflows.test.ts:2335-2336`) are reworded.
11. **Small items in P2's files:** `controls.ts:261, :264` (E14); `README.md:44-45` gains `pnpm trivy:pin X.Y.Z`;
    `static`'s "Action pins" comment (`ci.yml:82-88`), the permissions comment (`ci.yml:13-14`, "reads public facts
    about the pinned actions", now also Trivy's release and its advisories) and `release.yml`'s no-cache comment
    (`:21-29`) name the new check and the CLI; ADR 0062 is not edited (12.4; (14) now wrong: #42 merged on 2026-11-02,
    so P2 edits ADR 0062's bullet, P38, 14.3); `pnpm trivy:pin` stays a root script.
    Mutation runs all four shards on P2's pull request either way, because `tools/package.json` changes
    (`affected.ts:27, :373`); P4 narrows that. (14) P4 has merged (#96) and reads manifests field by field (CI-27), so
    this no longer holds as stated; `affected.ts` on the final tree decides, not verified here (14.7).

### 12.6 Build plan on this base

**The branch.** (14) Superseded by 14.7: the branch is at 8a722f80, and #107 already made `tools/trivy/release.txt` and
`install.sh`, which this plan creates, and `base.ts`' `PINNED_RELEASES` with the base's text, which this plan's
`TRIVY_RELEASE` would duplicate. `co-001/ci-trivy-version` is re-cut from `claude/build-platform` after #86 merges
(12.4; the fallback there if it does not), in the worktree `/home/user/ci-trivy-version`, installed with `pnpm install`
under the lock.
Before the first commit, `git ls-remote --tags https://github.com/aquasecurity/trivy` is run again: if a newer release
is at least three days old by its bundle's verified signing time (12.10, S5), T1 takes it and 12.3's values are
re-measured for it. Two builders work in parallel on disjoint files, and the integrator follows. Every builder runs its
tests under the lock and records each red commit's failing test names for the pull request's description. Every ★ case
goes through an existing entry point (`checkActionPins`, a script run by its path, a workflow file read), so the red
commits fail on behaviour, not on a missing import (P1's E21); red commits may also fail `pnpm typecheck`. Each green
commit passes its builder's unit suites, `pnpm typecheck` and `pnpm lint`. `pnpm actions:check` on the real tree is red
from B1's commit 2 (the real workflows still run trivy-action, which the new offline rule refuses) to B2's commit 4,
where it is first green; no unit test runs the checker on the real tree (12.10, S2), and the description records it.

**B1, `tools/check-action-pins`, `tools/trivy/release.txt` and the manifests.** Files:
`tools/check-action-pins/{network.ts, network.test.ts, base.ts, check.ts, check.test.ts, index.ts, fixtures.ts, age.ts}`
(changed), `tools/check-action-pins/{trivy.ts, trivy.test.ts, pin-trivy.ts, api.ts}` (new),
`tools/check-action-pins/testdata/trivy/` (new: `make.sh` and its outputs, 12.10 B1), `tools/trivy/release.txt` (new,
12.10 S2), `tools/package.json`, the root `package.json` (the `trivy:pin` script) and `pnpm-lock.yaml`. No `der.ts`
(12.10, N9).
- Commit 1, failing first, red:
  - `tools/package.json`'s five `@sigstore/*` packages in `devDependencies`, exact (12.3; `@sigstore/core` 4.0.1 is the
    fifth, N9), and the `pnpm-lock.yaml` that `pnpm install` writes, never edited by hand; the builder records the
    versions it resolved.
  - `testdata/trivy/make.sh`, run once by hand, and its outputs: the synthetic CA, leaves, CT log and Rekor keys' public
    halves, bundles, `trusted_root.json`, archive and `made.txt` (12.10, B1). gitleaks with the repository's config runs
    over them before the commit.
  - `trivy.test.ts`'s ★ cases, each through `checkActionPins` on a synthetic repository with `recordedTransport` serving
    the fixtures. (G4) `trivy.test.ts` carries its own `workflow()` and `repository()` and reads `testdata/trivy` with its
    own `readFileSync` helper, as `age.test.ts:30-31, :150` do, since `check.test.ts`'s (`:23`, `:50`, `:78`) are not
    exported; the archive and bundles reach `recordedTransport` through a `bytes` option (URL to bytes), which commit 2
    implements and which is ignored at run time until then (only `pnpm typecheck` fails, as a red commit may). Each case
    asserts its own message, so at commit 1 it fails because the checker says nothing of Trivy. The cases: an
    `aquasecurity/trivy-action` step fails; a scan with no install or database step before it fails; a scan not gated
    on both steps' success fails; a `TRIVY_DB_REPOSITORY` with `:2` fails; a `trivy` command without
    `--cache-dir "$RUNNER_TEMP/trivy"` fails; a scan without `--config ''` or `--skip-java-db-update` fails; a workflow
    that runs `trivy` with no `release.txt` fails; a `release.txt` naming 0.71.1 fails as under 0.72.0; a changed
    `release.txt` whose tag names another commit fails; a changed pin whose bundle's SAN is `…@refs/tags/v<v>0`, every
    OID right, fails (identity); one whose `linux_x64` differs from the signed digest fails (digest); one whose signing
    time is 4,319 minutes before the injected `now` fails (age).
  - "An unchanged `release.txt` and checker read nothing from the network" is written with them, but it passes on the
    base, so it is not a ★ case (N11).
- Commit 2, green:
  - `api.ts`: `apiGet`, `apiRefusal`, `apiProblem` and `nextPage` moved from `age.ts` with a narrow context
    (`transport`, `signal`, `clock`, `api`, `apiHost`, `headers`); `age.ts` imports them, and `age.test.ts` passes
    unchanged (12.10, S7).
  - `network.ts`: `getBytes(url, signal?)` on `Transport`, `gitTransport` and `recordedTransport` (no request header; a
    60 s limit per read; a `content-length` over 128 MiB refused before the body is read, and a streamed body aborted
    once it passes the cap, each failing naming the URL, N8); (G6) `fetchRefs(repo, version, signal?, extra?)` takes
    `extra = { branches?, tags? }`: the one `ls-remote` lists HEAD, the tag, each `refs/heads/<branch>` and each extra
    tag with its `^{}`, and the one treeless fetch takes the default branch, the tag and only what was listed; `Refs`
    gains `branches` (each name to its fetched head, or `undefined` when not listed) and `tags` (each name to `{ object,
    commit }`, or `undefined`), so the ancestry rule reads `release/vX.Y`'s head and `vX.Y.0`'s commit from one call
    (E6; 12.10, S6).
  - `base.ts`: `TRIVY_RELEASE = 'tools/trivy/release.txt'` in the named-once list; `baseState` returns the base's text;
    a head with no `release.txt` makes no Trivy read (12.10, S2).
  - `trivy.ts`: the offline rules (§3, 12.5 and 12.10: no `release.txt` only when no step runs `trivy` or
    `tools/trivy/`; the four keys; `HIJACKED`, its digest and the 0.72.0 floor; no `aquasecurity/` action; install, then
    database, before any `trivy` step in each job, and every scan's `if:` gated on both steps' success; `--config ''` on
    every `trivy` command; `--skip-db-update`, `--skip-java-db-update` and `--cache-dir "$RUNNER_TEMP/trivy"` on every
    `trivy image` but `db.sh`'s; `--ignorefile ''`, `--secret-config ''` and `--scanners vuln,secret` on every scan; no
    `--db-repository`, `--java-db-repository`, `--vex`, `--ignore-policy`, `--skip-dirs` or `--skip-files`; the job env
    literal, its repositories untagged and ghcr-only, and no other `TRIVY_*` variable). The networked checks: (1) the
    tag; (2) the bundle under the injected root, by a `Verifier` built with no options (the library's default
    thresholds), with the anchored SAN pattern and the policy's `oids` (`.1.11`, `.1.13`, `.1.14`, `.1.15`, `.1.17`,
    `.1.18`, `.1.20`); (3) the explicit compare of those OIDs, the SAN and the issuer, by exact equality; (4) the digest
    against `linux_x64` and `checksums.txt`; (5) one tlog entry, and the verified signing time against `signed_at` and
    the floor; (6) the ancestry; (7) on CI, the release's `immutable` and `published_at`; (8) on CI, the advisory read
    by package with its local control. The push reads: the tag, the release, and newer releases with the pass and the
    fail warnings (E9, E10; 12.10, S5). Faults by kind (E5). The UTF8String encoder (a two-byte header, lengths under
    128) and the decode through `@sigstore/core`'s `ASN1Obj` live here (N9).
  - `check.ts`: the offline rules join `:122-129`; the networked check runs after the age rule (`:233-253`), under the
    shared deadline. `index.ts`: `--offline-root` (E15), refused on CI.
  - `pin-trivy.ts`: `pnpm trivy:pin <X.Y.Z> [--offline-root]` reads `pnpm-workspace.yaml` and the floor through
    `releaseAgeMinutes`, as `index.ts:18-35` does (N14), runs every check but CI's (7) and (8), and writes
    `release.txt`, refusing a version that fails any.
  - `tools/trivy/release.txt`, written by `pnpm trivy:pin 0.76.1 --offline-root` (or the newer release the branch's
    first step takes), its four values checked against 12.3, so the named-once test (`check.test.ts:181-183`) is green
    here (12.10, S2).
  - `fixtures.ts`: `getBytes` on `recordedTransport`, served from the `bytes` option (URL to bytes, a status, an `Error`
    or `HANG`, as `urls` is); (G6) `RecordedRepository` gains `branches` (name to head) and serves `fetchRefs`' extras,
    and its read line stays `fetchRefs <repo> <version>` when no extra is passed, so `age.test.ts:256, :599` and
    `check.test.ts:120, :178` hold unchanged. (G4) No testdata loader: `trivy.test.ts` reads its own.
  - The rest of `trivy.test.ts`: §8's list, with 12.5's and 12.10's cases. `.1.11`, `.1.15`, `.1.17`, `.1.18` or `.1.20`
    different; the SAN `…@refs/tags/v<v>-rc.1`, another workflow and another issuer; a verifier that ignores `oids`; the
    floor 0.71.1 and the known-bad digest. A `vX.Y.0` commit off the default branch fails; a patch on its release branch
    holding the `.0` passes; a patch on a release branch whose `.0` is off the default branch fails; a release branch
    that `ls-remote` does not list fails, naming it; on a push each warns. A release not immutable, or with a
    `published_at` younger than the floor, fails. An advisory whose range holds the version fails; a local control that
    misses GHSA-69fq for 0.69.4 or GHSA-mcj4 for 0.71.0 fails closed; a withdrawn advisory is ignored; off CI, the API
    reads are skipped with a note. A promise-less tlog entry with one verified RFC 3161 time takes `signed_at` from it,
    and with none fails. On a push, a newer release past the floor that fails a check warns, naming the check. A
    `TRIVY_IGNOREFILE` variable, `--skip-dirs` or `--vex` fails. On a change to the checker alone, a verdict on the
    bytes fails and an outage warns; reads stopped by the deadline are one error on a pull request and one warning on a
    push; on a push a 404 release warns "withdrawn"; newer candidates are tried newest first, at most three.
  - `network.test.ts`: the bytes unchanged, three tries, the cap before and during the read, no `Authorization` sent, a
    listed branch fetched and an unlisted one not, (G6) and an extra tag listed and fetched with its peeled commit
    returned, while an unlisted one comes back absent and is not fetched. `check.test.ts`: the named-once list, and a
    head with no `release.txt` reading nothing for Trivy.
  - The root `package.json`: `"trivy:pin": "tsx tools/check-action-pins/pin-trivy.ts"`.

**B2, `tools/trivy`'s scripts, the workflows and their tests.** Files: `tools/trivy/{install.sh, db.sh, install.test.ts,
db.test.ts}` (new), `.github/workflows/{ci.yml, release.yml, release-dry-run.yml}`, `tools/test/{workflows.test.ts,
no-duplicated-versions.test.ts, collection.test.ts}` and `packages/compliance/src/controls.ts`.
- Commit 3, failing first, red: `install.test.ts` and `db.test.ts`, which run the scripts by their path (absent), (G1)
  with stubs that refuse a `trivy` call lacking `--config ''` (in `db.test.ts`, also `--cache-dir <the argument>`), and
  a `db.test.ts` case asserting both of `db.sh`'s calls' arguments;
  `workflows.test.ts`'s CLI assertions (each job's literal env and no other `TRIVY_*` variable; install (`id: trivy`),
  then database (`id: trivy-db`), right after the checkout; the scans' and the SBOM's commands, with `--input` first in
  `images` and every flag 12.10 names; every scan's `if:` gated on both steps' success; `images`' cache steps, the
  restore with no `restore-keys`, the install's second argument and the push-only save; the release's no-cache rule with
  no `aquasecurity/` action; the dry run's equality with the scan kept and `asDryRun`'s `env` cut; the SBOM test;
  `tools/trivy/**` in the dry run's paths); `no-duplicated-versions.test.ts`'s ninth case, (G5) a guard and not a ★
  case: no scanned file holds 0.76.1 or 0.70.0 at bce57f16, so it is green from here, and `scanned()` gains
  `tools/trivy/install.sh` and `db.sh` only in commit 4, with the scripts, so none of the eight existing cases goes red
  through a missing file; `controls.ts:264`'s evidence `trivy image --input`, which `controls.test.ts:221-228` then
  fails to find.
- Commit 4, green: `install.sh` (`<dir> [<archive-dir>]`, N10) and `db.sh` (the exact `repo=` line, never `--quiet`,
  N4), both 100755, (G1) every `trivy` call in them with `--config ''`, and both of `db.sh`'s with `--cache-dir "$1"`;
  (G5) `scanned()` gains the two scripts; the three workflows; `ci.yml`'s comments (`:13-14`, `:82-88`, `:702-703`),
  `release.yml`'s (`:21-29`) and the dry run's (`:3-15`, `:59-62`); `collection.test.ts` gains
  `testsIn('tools/trivy')`; `controls.ts:261`'s `what`; the archive save's `BOUNDED_VALUES` row (after #86). B2 writes
  and tests in parallel with B1 (its script tests use their own temporary `release.txt`), and (G5) both its commits
  land after B1's commit 2, since the ninth `no-duplicated-versions` case reads the real `release.txt`;
  `pnpm actions:check` on the merged tree is the integrator's.

**The integrator: documents, matrix, synth and the full local suite.**
- Commit 5: `README.md:44-45`; ADR 0066 Part 6, with 12.10's statements (the library's SAN rule is a pattern, which the
  checker anchors; `signed_at`'s definition; what the ancestry rule leaves), (G8) its Notices N33 to N42 (12.11), and
  its Status, Date, Deciders and PRD lines (12.1, F11); ADR 0010 (`:19`, `:30-31`, and an appended note naming Part 6);
  `docs/runbooks/ci.md` (`:33`, `:148-149` after #86's text, `:271-273`; plus a JAR's failure and its remedy, a bad
  archive-cache entry's remedy, and "a CVE is never ignored by file, only fixed"; (G3) the `static` row `:26`, the
  "Action pins" bullet `:87-106` and the local-run bullet `:409-416`, as 12.11 words them);
  `docs/runbooks/dependency-upgrades.md` (the "Trivy" section after `:374`; step 5 at `:95-98` with both push warnings);
  `docs/product/reconciliation-001.md` (the P2 entry after #86's); `docs/product/test-matrix.md` (the intro's
  `:261-262` reworded, CI-24 to CI-26 after `:290`); `packages/synth/src/cases/matrix.ts` (after `:441`) and
  `registry.ts` (after `:631`, under "Trivy from verified bytes (docs/adr/0066, Part 6)"); (G2)
  `fixtures/synthetic/CI-24/expected.json`, `CI-25/expected.json` and `CI-26/expected.json`, written by
  `pnpm synth --all` and never by hand, as P1's edbc928e committed CI-21 to CI-23's: it writes those three files and
  changes nothing else, which `static`'s check (`ci.yml:135-141`) then holds.
- Then, locally: `pnpm actions:check --offline`; `BASE=origin/claude/build-platform pnpm actions:check --offline-root`
  (every networked check but the live TUF root and the API reads, which are CI's); `BASE=origin/claude/build-platform
  pnpm toolchain:check`; `pnpm typecheck`, `pnpm lint`, `pnpm lint:logs` and `pnpm verify-content`; and the unit set of
  the changed places (`tools/test`, both checkers, `tools/gitleaks`, `tools/trivy`, `packages/compliance`).
- The integrator opens the draft pull request with the template's description: the red commits' failing tests, that
  `pnpm actions:check` on the real tree is first green at commit 4, and, once CI has run, the job ids of the first live
  reads.

**The counts.** At bce57f16 the unit project on CI ran 404 files, 6,893 tests passed and 1 skipped (push run
41330911483, unit job 124920631257); locally the filtered set ran 32 files and 451 tests. That is not the target's base:
P2 is cut after #86, which adds tests to `workflows.test.ts`, after #83 ((G7) merged at 20:40:34Z), and possibly
after #75, #84 and #85. So the integrator reads the unit job of the cut base's own push run (F files, T passed, S
skipped), and the pull request must reach **F + 3 files** (three new: `trivy.test.ts`, `install.test.ts`,
`db.test.ts`) and **T + N passed, S skipped** (N2). N is the new cases, about 114 by the lists above ((G1, G6) and a
tally of 12.6's and §8's lists, 12.11): `trivy.test.ts` about 85, `network.test.ts` 7, `check.test.ts` 2,
`install.test.ts` 7, `db.test.ts` 7, `workflows.test.ts` about 5 new beside the changed ones,
`no-duplicated-versions.test.ts` 1 (a guard). The generator (about 200 lines of shell and Node) and its outputs are
outside the count. The integrator records the exact numbers, and the local count equals CI's.

**The fix round** runs the full local suite once (`lanes/lane-b.md:230`): unit; golden; oracle; `test:db` in shards one
after another; build, stamp, then e2e with `E2E_PREBUILT=1`; the mutation shards the change affects (all four, 12.5 item
11), then the gate. It also runs `pnpm actions:check --offline-root` (E15) and `pnpm toolchain:check` with
`BASE=origin/claude/build-platform` (networked), since workflows, manifests and the lockfile change; regenerates the
lockfile (`pnpm install`), `watched-paths.txt` (`watched.ts --write`) and the synth fixtures (`pnpm synth --all`) after
any base merge; and records CI's screening-capacity run, since `package.json` and `pnpm-lock.yaml` are watched
(`watched-paths.txt:20, :23`), and the dry run's first CLI scan and SBOM on ubuntu-24.04. A finding that changes the
fixtures reruns `make.sh` and commits every output together. The two reviews are CI and test infrastructure, and
security and supply chain.

### 12.7 Engineering choices made here

Each is reversible and the recommended option.
- **E1. Install and database first.** In all three workflows the install step (and, in `images`, the archive cache's
  restore before it and its push-only save after it) and the database step come right after the checkout, before the
  builder. A hash mismatch or a stale database then fails the job before minutes of building; no step needs an `if:` to
  run them whatever the web build's result; (12.10, N5) every scan's `if:` requires both steps' success; one order holds
  in every job, which the test asserts; and every #86 hunk stays at least seven unchanged lines away (the job env, after
  `timeout-minutes`, four).
- **E2. The cache directory as a flag.** Every `trivy` command passes `--cache-dir "$RUNNER_TEMP/trivy"`, and `db.sh`
  takes the directory as its one argument, as `install.sh` takes its own and as `ci.yml:680` makes `$RUNNER_TEMP/image`.
  (G1) "Every `trivy` command" includes the scripts' own calls: `db.sh` passes `--config '' --cache-dir "$1"` to both
  `trivy image --download-db-only` and `trivy version --format json`, and `install.sh`'s check is `trivy --version
  --config ''`; their stubs hold this, since the offline rule reads only workflow lines.
  The job env stays literal, which actionlint accepts. A scan that forgets the flag reads the default cache, which holds
  no database, and with `--skip-db-update` Trivy refuses to run without one (its first-run check, `pkg/db/db.go:121-124`
  at v0.76.1, read in 12.10), so it fails closed; the offline rule refuses it first.
- **E3. Expressions through step `env`.** `IMAGE_REF: ${{ steps.image.outputs.ref }}` and the SBOM's file name
  (`sbom-${{ matrix.image }}-${{ github.ref_name }}.spdx.json`) reach the commands as `"$IMAGE_REF"` and `"$SBOM"`,
  never inline in `run:`, as `release.yml:453` passes the tag. `asDryRun` cuts `env` with `cutInput`
  (`workflows.test.ts:2278-2282`), so the dry run's name is the one its SPDX read already uses.
- **E4. One deadline.** Trivy's reads run under the shared 180 s, after the age rule; each archive read has 60 s. The
  trust root's read is raced against the deadline's signal, since `@sigstore/tuf` takes none, and its cache goes under
  the transport's scratch directory, which `close()` removes (`cachePath` under it, with `retry` and `timeout`; the
  options read in 12.10, N7).
- **E5. Two kinds of fault.** A change upstream (the tag moved or gone, the release deleted or not immutable, a new
  advisory, the commit off both branches, a read that failed or ran out of time) fails only a pin new against the base,
  on a pull request. A verdict on the recorded bytes (the signature, the identity, the digest, the tlog entry,
  `signed_at`, the age) fails every pull request whose reads run, a change to the checker alone included: under an
  immutable release those bytes cannot change, so such a failure is the checker's or the pin's, and it should stop the
  change that caused it. On a push every finding is a warning. `buildkit.ts:89` warns on everything when the builder is
  not new; the difference is that Docker Hub's tag is mutable and Trivy's bundle is not.
- **E6. `fetchRefs` takes branches.** An optional list of branch names is listed and fetched with the default branch in
  the same treeless fetch, rather than a second fetch method, so the ancestry read reuses P1's bare repository and
  `isAncestor`. (G6) Extra tags (`vX.Y.0`) ride in the same call, and `Refs` returns each extra branch's head and each
  extra tag's commit, or its absence (12.6, B1's commit 2).
- **E7. One title.** Trivy's messages print under the step's "Action pins" title, each starting `trivy `, because
  `index.ts:37-40` prints one title per step; the warning in §6 step 1 reads
  `::warning title=Action pins::trivy vX.Y.Z (signed <time>) is newer than …`.
- **E8. The advisory read proves itself.** (12.10, S7) The one read by package must hold, judged locally,
  GHSA-69fq-xp46-6x23 for 0.69.4 (an exact version) and GHSA-mcj4-mphf-j9ff for 0.71.0 (a range); otherwise the read
  counts as failed. A filter that GitHub reads differently from what was meant (the version's `v`, the package path)
  would match nothing and pass every version, so the control makes it fail closed instead. It costs no extra call.
- **E9. Newer releases on a push.** The candidates are the stable tags newer than the pin, tried newest first, at most
  three, stopping at the first that passes every check of a pin, each read under the deadline. The scouts' cheaper read
  (the bundle's unverified tlog time and `checksums.txt`, without the archive) is declined: the warning then names only
  a release `pnpm trivy:pin` will accept, and the cost is one 52 MB read per candidate on a push, and only while a newer
  release waits. (12.10, S5) A candidate past the floor that fails a check warns, naming the check, so a lasting
  upstream change is seen.
- **E10. The release read replaces the asset `HEAD`.** On a push, `releases/tags/v<version>` with the job's token
  answers both questions: a 404 is a withdrawn release, and `immutable` false is a warning; an immutable release's
  assets cannot be removed (`immutable-releases.md:23`).
- **E11. The archive cache's key.** `trivy-v1-${{ hashFiles('tools/trivy/release.txt') }}`, restored on every run of
  `images` and saved on a push alone; the save takes `cache-primary-key`, with one `BOUNDED_VALUES` row after #86. Any
  change to the file changes the key, and `install.sh` re-hashes what is restored. (12.10, N6) No `restore-keys`; a bad
  entry's remedy is a reviewed bump of `trivy-v1-`, or the founder deletes it.
- **E12. No download-base override.** `install.sh` has no variable that replaces the release's address, unlike
  gitleaks' `GITLEAKS_DOWNLOAD_BASE` (`tools/gitleaks/install.sh:50`): its tests put a stub `curl` on `PATH`, and a
  mirror variable is the path C3 refuses for the database.
- **E13. Upstream's identity in the code.** The repository, the workflow path, `.1.15` (180687624) and `.1.17`
  (12783832) are constants in `trivy.ts`, cited to the certificate, not lines of `release.txt`: they belong to the
  upstream, not to a release, and a bump never changes them.
- **E14. The compliance evidence.** `controls.ts:264` names `trivy image --input`, the scan's own command in `images`
  ((12.10, N3) `--input` right after `trivy image`), whole in `ci.yml` (`controls.test.ts:124-129`), with `what` "the
  container scan of both images on every pull request by the Trivy release tools/trivy/release.txt names, its SHA-256
  checked (the images job)"; `:261`'s `what` adds "and the Trivy release tools/trivy/release.txt names verified when it
  changes".
- **E15. `--offline-root` for a local `pnpm actions:check`.** This session's proxy refuses tuf-repo-cdn.sigstore.dev, so
  a local networked run would stop at the trust root. `--offline-root` verifies against `@sigstore/tuf`'s embedded root,
  read from `seeds.json` directly (12.10, N7), as `pnpm trivy:pin --offline-root` does, and `index.ts` refuses it when
  `GITHUB_ACTIONS` is `true`; ci.yml's step runs `pnpm actions:check` exactly, which `workflows.test.ts` holds.
- **E16. The dry run scans** (12.5, item 10).

### 12.8 Proposed improvements outside P2

The highest in `designs/lane-b-ci.md`, P1's design and the status file is P28. P4's re-read, running at the same time,
plans P29 to P37 for its own (`/home/user/laneb-sp/p4reread/progress/revise.progress.md:19`, read at 18:05Z), so these
start at P38, which keeps the two clear whichever is committed first. Each is reversible and recommended.
- **P38.** When #42 has merged, ADR 0062's 2026-10-26 bullet (`:1376`, "both trivy-action steps set `cache: false`…")
  gains a pointer to ADR 0066 Part 6, which supersedes it. It cannot be edited while #42 is open (B1 of the
  2026-10-26 review). (14) #42 merged on 2026-11-02 (22789493), so P2 makes this edit, now at ADR 0062 `:1393` (14.3).
- **P39.** For #86's owner: a test that each `BOUNDED_VALUES` `bound` cite (`file:line`) still holds the producer it
  names. P1's and P2's line shifts move them (83167b8f `workflows.test.ts:3213-3289` cites `ci.yml:683-694`,
  `release.yml:168-196` and others), and no test notices today. (14) Moot: #86 merged with rows that name each producer
  by step and script fingerprint, never by line (`workflows.test.ts:4007-4027` at 8a722f80). (14) The number now
  holds this proposal, for P1's owner (14.5; 15, S4): `advisoryProblems` drops a vulnerability whose range is not a
  string (`age.ts:771`) and judges the rest with `ghsaRangeHolds`, which reads a constraint it cannot parse as holding
  nothing (`age.ts:708`, `:719-721`), so a security-fix exclude whose own version sits in a range that does not parse
  passes the "covers … itself" check (`age.ts:780`). A range that does not parse, null included, should fail the
  exclude, as it fails `trivy.ts`' read (14.3, item 3 (8)).
- **P40.** gitleaks' installer downloads with `curl -fsSL --retry 3` (`tools/gitleaks/install.sh:53`) and no
  `--proto '=https' --tlsv1.2`, which P2's `install.sh` has. Add them, and move `tools/hooks/hooks.test.ts:462, :466`
  (`GITLEAKS_DOWNLOAD_BASE: 'file:///nonexistent'`) to a stub `curl`, since `--proto` refuses `file:`. (14) Partly done
  by #107: gitleaks' curl has `--proto '=https,file' --proto-redir '=https'` (`tools/gitleaks/install.sh:53` at
  8a722f80); `--tlsv1.2`, a time bound and dropping `file:` with that test move remain.
- **P26, widened (not a new number).** P1's P26 holds gitleaks' release to the floor by `published_at`. Once P2 has
  merged, `trivy.ts`'s helpers give it the tag, ancestry, `immutable` and advisory reads too; gitleaks' own signature
  form is not verified here. (14) Partly done by #107: gitleaks' `release.txt` is aged by the age rule (`base.ts:31` at
  8a722f80).
- **P41.** After four weeks of `images` runs, read the database ages `db.sh` wrote to the job summaries. That measures
  the 48-hour floor, which no history could be read for here (12.3); a breach rate above none is a Revisit for C3.
- **P42** (the completeness critic's). Give the five `@sigstore/*` packages a Dependabot group of their own, so a bump of
  the verifier is a deliberate pull request rather than one line of `minor-and-patch` (`.github/dependabot.yml:49-72`).
  Under #91 the new group's pattern must also join `minor-and-patch`'s `exclude-patterns`, which #91's test requires.
  Outside P2, since §3 excludes Dependabot changes.

### 12.9 In-place edits, and what stays open

Fifty edits in §1 to §11 and the review's "Open" line, each marked "(12)"; each old and new text is in
`/home/user/laneb-sp/p2reread/revise.md`. Where a stale cite is the only thing wrong, 12.2 maps it and the text was
left. The review's fold (12.10) adds further "(12)" edits in §1 to §11 and edits 12.1 to 12.7 and this list; each old
and new text is in `/home/user/laneb-sp/p2reread/fold1-edits.json`. The completeness critic's fold (12.11) adds "(12)"
edits in §1 to §8 marked "12.11, G n", and edits 12.4, 12.6 to 12.10 marked "(G n)"; each old and new text is in
`/home/user/laneb-sp/p2reread/fold2-edits.json`.
- **Header:** the cites point to 12.2, and §12 governs.
- **§1:** T4 gains the ancestry, IDs, 0.72.0, advisory and `immutable` checks; T5 says "withdrawn (deleted)" first and a
  moved tag is rare.
- **§2:** "What runs today" (five steps, the cites, today's v0.70.0 and the mirror); the March 2026 sources (the GHSA
  read, its facts); the transport (`get`'s shape, `gitTransport`).
- **§3:** `db.sh`'s message names `pkg-containers.githubusercontent.com`; "every trivy-action step is replaced"; the
  archive cache (`ci.yml:147`, the `hashFiles` key, push-only save); the scan command with `--cache-dir`; the job env
  literal only; the steps right after the checkout; the dry run (the SBOM already there, the scan kept, the paths); the
  `getBytes` and `fetchRefs` changes; `base.ts` (no `changedSince`); `trivy.ts`' placement and checks (6) to (8);
  `HIJACKED`, the known-bad digest and 0.72.0; check (3) with the policy's `oids`; check (5)'s floor without the
  fallback; the push form (one title, the release read, newest-first candidates); `pnpm trivy:pin`'s checks; the
  packages as `devDependencies` at their versions.
- **§4:** the checker files (`--offline-root`, `check.test.ts`, `controls.ts`, `README.md`); the no-cache rule's
  `--cache-dir`; the ninth `no-duplicated-versions` case.
- **§5:** ADR 0066's Revisit (the attestation line, `:727`, `:1666`, `:397-400`, ADR 0062's `:1376`); `ci.md`'s cites,
  host and cache paragraph; `dependency-upgrades.md`'s places; reconciliation-001's entry.
- **§6:** the warning's title; P1's cite. **§7:** C7's floor and cite; C8's key and push-only save.
- **§8:** the failing-first set (`controls.test.ts`, five steps); the floor case; the network and install tests; the
  CI-25 row and its note; the registry form; the matrix intro.
- **§9:** the builders point to 12.6; the refused hosts. **§10:** "withdraws (deletes)", the release's 404. **§11:** a
  pointer to 12.4. **Open:** the GHSA read and the versions measured.

**What stays open:**
- The live reads: Sigstore's TUF root, the release's `immutable` and `published_at`, and the advisory read by package
  (whose form E8's local control settles; 12.10, S7), all first run in the pull request's `static`; its job id goes in
  the description.
- Whether v0.76.1 reports HIGH or CRITICAL findings in our images that v0.70.0 did not (§10, the first row).
- ghcr's anonymous limits under our load, and how often the database is over 48 hours old (P41).
- When Sigstore's signing configuration moves Trivy's signatures to Rekor v2 (12.10, S5's fallback covers it); whether
  aquasecurity/trivy's rulesets restrict creating `release/*` branches (S6's residual); whether `actions/attest` ran for
  v0.76.1 (no decision rests on it).
- The transitive `tuf-js` and `@tufjs/models` versions pnpm resolves. (Closed by 12.10: the release branch's timing, S6;
  Trivy's `--skip-db-update` first-run refusal and `@sigstore/tuf`'s option names, N7.)
- That mutation runs all four shards because `tools/package.json` changes (`affected.ts:27, :373`), not proved by a run.
  (14) P4's field-by-field rule (CI-27) has replaced that reading; which shards run is not verified (14.7). (14)
  Predicted since: none (14.7; 15, N11).
- The P-numbers P38 to P41, chosen clear of P4's planned P29 to P37; if P4 goes past P37, the one committed second
  renumbers. (14) Settled: P4 took P43 and P44, so P38 to P42 stay P2's (`lanes/lane-b.md:1240-1241`).

### 12.10 The re-read's review, folded (2026-11-01)

The review (`follow-up-p2-trivy-version-reread-review.md`, 18:07Z to 18:35Z: 1 blocking, 7 should fix, 14 nits) was
re-checked from 19:57Z to 20:23Z. It was checked against:
- bce57f16, in the worktree, whose `git status` stayed clean;
- Trivy v0.76.1's source, from a depth-1 partial fetch of the tag (19:59Z);
- the four `@sigstore/*` packages, unpacked with `npm pack` (19:59Z);
- GHSA-69fq-xp46-6x23, from github/advisory-database `main` (20:01Z);
- a treeless fetch of aquasecurity/trivy's `main`, `release/v0.65` to `release/v0.76` and its tags (20:01Z);
- GitHub's REST description, from github/rest-api-description `main` (20:02Z);
- #42 and #86, through `gh api` (20:03Z);
- the push run's `images` log (job 124920631345, 20:00Z).

Every finding holds, and none was refuted. Two fixes were proved by a scratch prototype in
`/home/user/laneb-sp/p2reread/scripts-fold1/`, run under `tmp/fold1/` and removed afterwards: B1's generator, and S5's
RFC 3161 path. Both were verified by `@sigstore/verify` 4.1.2 at its default thresholds. These fixes govern where they
and 12.1 to 12.9 differ, and §1 to §11 carry "(12)" pointers to them.

**B1. The synthetic Sigstore material: a generator committed beside its outputs, with a real SCT and no threshold
seam.**
- **The generator.** `tools/check-action-pins/testdata/trivy/make.sh` is new. Like `testdata/age/make.sh:1-30`, it is
  run once by hand, its outputs are committed, and the tests never run it. It uses `openssl` and a few lines of Node
  (through `@sigstore/core`) to make:
  - a throwaway CA;
  - for each variant, one leaf with Fulcio's extensions: an extfile with `1.3.6.1.4.1.57264.1.<n> = ASN1:UTF8String:…`
    and the SAN, critical;
  - a CT log key, and a real SCT over the leaf's TBS without the SCT extension. The same leaf is then issued again with
    the SCT extension last, by `openssl ca` with the same serial and a fixed `-startdate` and `-enddate`, so the TBS
    without that extension is byte for byte the one the SCT signed;
  - a Rekor key, the hashedrekord 0.0.1 body, its SET, a size-1 inclusion proof and a signed checkpoint, at a fixed
    `integratedTime`;
  - a synthetic `TrustedRoot` that names the CA, the CT log and the Rekor log (and a TSA, below);
  - a small synthetic archive.

  Every private key lives in a `mktemp` directory that is deleted on exit. Only certificates, public keys, bundles and
  the root are written, and `made.txt` records the times.
- **The variants**, each a separate output of the same run:
  - the good bundle;
  - the SANs `…@refs/tags/v<v>0` and `…@refs/tags/v<v>-rc.1`, with every OID right (S1);
  - another workflow path; another issuer;
  - `.1.11`, `.1.13`, `.1.14`, `.1.15`, `.1.17`, `.1.18` and `.1.20` each different, and `.1.13` and `.1.14` each
    absent;
  - a leaf under a second CA, which the root does not name;
  - two tlog entries;
  - a tlog entry with no inclusion promise, plus one RFC 3161 response from `openssl ts -reply` (S5). `openssl ts`
    stamps its own clock, so this variant's leaf is valid around the generator's run, and `made.txt` records the time;
  - a tlog entry with no promise and no RFC 3161 time.
- **Nothing of Aqua's is committed.** The synthetic version is not a Trivy release (`0.99.1`, with a made-up commit), so
  nothing from Aqua's release is in the fixtures. The identity constants (the workflow path, `.1.15` 180687624, `.1.17`
  12783832) are `trivy.ts`'s, and the fixtures use them.
- **The SCT: the generator computes a real one, and production and tests alike build `Verifier` with no options.** These
  are the library's defaults: `ctlogThreshold`, `tlogThreshold` and `timestampThreshold` are each 1
  (`dist/verifier.js:28-35`).
  - The review's alternative is not taken: a test seam with `ctlogThreshold: 0`, and one test holding production to the
    defaults. The safer option leaves no knob that could weaken CI, and the cost is generator code only.
  - The prototype proves it: `make-proto.sh`, `proto-sct.cjs`, `proto-bundle.cjs` and `proto-verify.cjs`, about 200
    lines, on OpenSSL 3.0.13, at 20:06:47Z. Its leaf, SCT, v0.3 bundle and root verify at the defaults. A root with no
    CT log fails `SCT verification failed`; one changed byte of the archive fails `SIGNATURE_ERROR`; a wrong `.1.13`
    fails `UNTRUSTED_SIGNER_ERROR … missing OID`.
  - gitleaks 8.24.3, with the repository's `.gitleaks.toml`, finds nothing in the outputs (20:11Z).
- **Time.** The tests inject `now`, so "4,319 minutes fails, 4,320 passes" holds against the fixed `integratedTime`.
  §8's "set by the test" is corrected in place.
- **Size.** The generator is about 200 lines of shell and Node, outside the tests' count. 12.6 adds it to B1's files.

**S1. The SAN is matched exactly.**
- `@sigstore/verify`'s `verifySubjectAlternativeName` runs `signerIdentity.match(policyIdentity)`
  (`dist/policy.js:7-17`). So a string is an unanchored regular expression, and its dots match any character.
- `trivy.ts` passes ``new RegExp(`^${escapeRegExp(san)}$`)``; the type admits `RegExp` (`dist/shared.types.d.ts:14`).
- After verification, it compares the signer's SAN and issuer, and every policy OID, by exact equality.
- The prototype (20:06:47Z) showed the plain string accepting `…@refs/tags/v0.76.10`, even with `.1.14` =
  `refs/tags/v0.76.1` in `oids`, and the anchored pattern refusing it.
- Part 6 says that the library's SAN rule is a pattern, and that the checker anchors it.

**S2. An absent `release.txt`, and a commit order that holds.**
- **The rule.** When the head has no `tools/trivy/release.txt`, the checker reads nothing for Trivy. It is an offline
  error only if a workflow step runs `trivy` or `tools/trivy/` (a `run:` that names either). The pin is new when the
  head has the file and the base's text differs or is absent.
  - So `check.test.ts`'s synthetic repositories (`:107`, `:116`, `:128` and the rest) stay green with no read: none
    holds a `release.txt` or a workflow that runs Trivy.
  - The checker-edited case still counts two `ls-remote` reads (`:139`).
- **The order.** B1's commit 2 writes `tools/trivy/release.txt` itself, with `pnpm trivy:pin 0.76.1 --offline-root` (or
  the newer release 12.6 takes). The named-once test (`check.test.ts:181-183`) is then green there, and the file moves
  from B2's list to B1's.
- **The real tree.** `pnpm actions:check` on the real tree is red from B1's commit 2 to B2's commit 4, where it is first
  green: until then the real workflows hold five trivy-action steps, which the new offline rule refuses.
  - No unit test runs the checker on the real tree. `check.test.ts:182` checks files only, and `workflows.test.ts`
    imports only `consistencyProblems` and `formProblems` (`:12`).
  - So each green commit's unit suites pass. The pull request's description records the red span.

**S3. Neither database is updated by a scan.**
- **How Trivy fetches the Java database.** Trivy v0.76.1's JAR analyzer calls `javadb.NewClient()` from `PostAnalyze`
  (`pkg/fanal/analyzer/language/java/jar/jar.go:47-58`).
  - That runs only when a JAR is in the image (`pkg/fanal/analyzer/analyzer.go:561-567`).
  - Its `Update()` downloads trivy-java-db unless `--skip-java-db-update` is set. With that flag and no Java database,
    it fails with "'--skip-java-db-update' cannot be specified on the first run" (`pkg/javadb/client.go:48-66`).
  - SBOM formats set up the Java database too (`pkg/commands/artifact/run.go:353-366`).
  - `--skip-db-update` is a separate flag (`pkg/flag/db_flags.go:27-47`).
- **The fix.** Every `trivy image` scan and the SBOM pass `--skip-java-db-update`. The offline rule and
  `workflows.test.ts` require it, and T7 and CI-26 say that neither database is updated by a scan.
- **No verdict changes today.** Today's `images` log has no Java database line (job 124920631345), so our images hold no
  JAR.
- **`db.sh`** does not touch the Java database: `--download-db-only` returns before any Java update (`run.go:325-342`).
- **The runbook.** A JAR fails the scan with Trivy's own message. The remedy is a reviewed change that adds a
  `--download-java-db-only` step to `db.sh`, with its own `repo=`, age and summary checks. The flag is never removed.

**S4. No file in the checkout changes a verdict.**
- **What Trivy v0.76.1 reads from the working directory**, which is the checkout:
  - `--config` defaults to `trivy.yaml` (`pkg/flag/global_flags.go:16-22`);
  - `--ignorefile` defaults to `.trivyignore` (`pkg/flag/report_flags.go:68-73`; `pkg/result/ignore.go:217-221`);
  - **`--secret-config` defaults to `trivy-secret.yaml`** (`pkg/flag/secret_flags.go:4-9`). The review did not name this
    one.

  For each of these three, Trivy says "empty string disables loading". `scan.scanners` defaults to `vuln,secret`
  (`pkg/flag/scan_flags.go:37-43`), and a variable `TRIVY_<FLAG>` sets any flag (`pkg/flag/options.go:367-372`).
- **The flags.** Every `trivy` command passes `--config ''`. Every scan passes `--ignorefile ''`, `--secret-config ''`
  and `--scanners vuln,secret`.
- **The offline rule:**
  - requires those flags;
  - refuses `--db-repository`, `--java-db-repository`, `--vex`, `--ignore-policy`, `--skip-dirs` and `--skip-files` on
    any `trivy` command;
  - refuses any `TRIVY_*` variable other than the five §3 names, at the workflow, job or step level of a workflow that
    runs Trivy. An explicit flag outranks the environment, but a variable for a flag the command does not pass would
    still apply.
- **Ignoring a CVE.** A CVE is never ignored by file, only fixed. The runbook says so beside "take the fix".
- **The verdict.** §10's "verdict unchanged in kind" then holds: the default scanners, severities, `ignore-unfixed` and
  exit codes, with nothing read from the checkout.

**S5. The signing time when Rekor gives none, and a newer release that fails.**
- **`signed_at` is the verified signing time.** That is the tlog entry's `integratedTime` when the entry carries an
  inclusion promise; the library takes a time only from such an entry (`dist/timestamp/index.js:14-23`). Otherwise it is
  the one RFC 3161 time the `Verifier` verified against the root's timestamp authority.
  - `Verifier.verify` returns only the signer, but it verifies every timestamp of the entity or throws
    (`dist/verifier.js:37-78`). So `trivy.ts` reads the times from the `SignedEntity` it passed: `timestamps`, and each
    `RFC3161Timestamp`'s `signingTime`.
  - It fails when neither time is present, or when there are two RFC 3161 times and no promise.
  - Exactly one tlog entry is still required, and the floor and `published_at` apply as before.
  - The v0.76.1 bundle has a promise (12.3), so its `signed_at` is unchanged.
- **Why Rekor v2 is coming.** The trusted root in `@sigstore/tuf` 5.0.0 already lists `log2025-1.rekor.sigstore.dev`
  (from 2025-09-23) and a timestamp authority (from 2025-07-04) (`seeds.json`, read 20:00Z).
  - Trivy signs with `cosign sign-blob --bundle` (`goreleaser.yml:175-184`), from cosign-installer v4.1.2
    (`.github/workflows/reusable-release.yaml:44-45`). So which log is written follows Sigstore's signing configuration.
    When that changes is not verified.
  - The prototype (`proto-tsa.sh`, `proto-tsa.cjs`, 20:09:08Z) built a bundle with a promise-less entry and one `openssl
    ts -reply` response. It verified at the defaults, and its only verified time was the TSA's. Under a root with no TSA
    it failed `TIMESTAMP_ERROR`.
- **A newer release that fails.** On a push, each newer stable candidate whose `published_at` is past the floor and
  which fails a check of a pin gets one warning: "trivy vX.Y.Z (published <time>) is past the floor but fails <check>;
  it cannot be pinned until that is resolved". So a lasting upstream change (the log, the asset name, the workflow path)
  reaches the weekly triage. E9's limits hold: newest first, at most three.
- §10 gains a row, and §8 gains both cases.

**S6. The ancestry rule, tightened.**
- **The fact.** GHSA-69fq says the malicious code "was not committed to Trivy's main branch. It was fetched and built on
  the ephemeral runner, and also committed to a v0.70.0 branch but no release or git tag was ever pushed"
  (advisory-database `main`, 20:01Z).
  - So the attacker could push branches, and the "on no branch" of 12.3 and 12.5 is corrected.
  - Trivy's release job tags `vX.Y.Z`. For `vX.Y.0` it also creates `release/vX.Y` at the same commit, with an App
    token, "to bypass the merge queue rule" (`.github/workflows/release-please.yaml:98-129` at v0.76.1). That answers
    12.9's open item: the release branch is created with its `.0` tag.
- **The rule:**
  - a `vX.Y.0` commit must be on the default branch;
  - a `vX.Y.Z` commit with Z > 0 must be on `release/vX.Y`, and that branch must hold `vX.Y.0`'s commit, which must
    itself be on the default branch;
  - the `vX.Y.0` tag is fetched in the same treeless fetch, (G6) as one of `fetchRefs`' extra tags (12.11).

  Every stable release from v0.65.0 to v0.76.1 fits the rule (the fetch at 20:01Z): each `.0` is on `main`, each patch
  is on its `release/vX.Y`, and each `release/vX.Y` holds its `.0`. That includes `release/v0.69` holding v0.69.0, which
  the review had not verified. A pushed branch named for a minor whose `.0` is not on `main` proves nothing.
- **The fetch.** `fetchRefs` puts every refspec in one `git fetch` (`network.ts:238`), so a missing branch would fail
  the whole read. The release branch is therefore listed with `ls-remote` first, and fetched only when listed. When it
  is absent, the rule fails and names it.
- **What remains**, said in Part 6. A credential that can push to `main`, or to an existing release branch, still
  passes. The floor, the advisory read and the push warnings are the defence. Whether aquasecurity/trivy's rulesets
  restrict creating `release/*` branches is not verified.

**S7. One API reader, shared; advisories read by package and judged locally.**
- **The reader.** `apiGet` (`age.ts:348`), its `Context` (`:330`, which holds `AgeInput`), `apiRefusal` (`:341`),
  `apiProblem` (`:362`) and `nextPage` (`:404`) are private to `age.ts`.
  - They move, with no change in behaviour, to a new `tools/check-action-pins/api.ts`, with a narrow context:
    `transport`, `signal`, `clock`, `api`, `apiHost` and `headers`.
  - `age.ts` and `trivy.ts` both import it. `age.ts` and `api.ts` join B1's files, and `age.test.ts` stays green
    unchanged.
  - This is the review's fix in a shape that keeps `AgeInput` out of `trivy.ts`.
- **The read.** Once per run: `GET /advisories?ecosystem=go&affects=github.com/aquasecurity/trivy&per_page=100`, every
  page through `nextPage`.
  - GitHub's description of the endpoint documents `affects` as "`package` or `package@version`", `type` defaulting to
    reviewed, and cursor pagination (github/rest-api-description `main`, 20:02Z).
  - Withdrawn entries are dropped.
  - The pin and each candidate are judged locally with the exported `ghsaRangeHolds` (`age.ts:707`), over the Go
    `vulnerable_version_range` of `github.com/aquasecurity/trivy`.
- **The control** is local and exact. The set must hold GHSA-69fq-xp46-6x23 for 0.69.4 (an exact version) and
  GHSA-mcj4-mphf-j9ff for 0.71.0 (a range, `< 0.71.1`); otherwise the read counts as failed. One read serves the pin and
  every candidate.
- **Not verified here.** The endpoint answers 403 from this session (20:02Z), so its live answer first runs in the pull
  request's `static`.

**Nits.**
- **N1.** #42's row in 12.4 is updated (c65f9cf2, read 20:03Z).
- **N2.** The count target is "the cut base's push-run unit count plus N" (12.6).
- **N3.** The scan command puts `--input "$RUNNER_TEMP/image/<name>.tar"` right after `trivy image`. So
  `controls.ts:264` names `trivy image --input`, and `namesWhole` (`controls.test.ts:124-129`) finds it in `ci.yml`.
- **N4.** `db.sh` matches the exact line Trivy logs:
  - the form is `[vulndb] Artifact successfully downloaded<TAB>repo="ghcr.io/aquasecurity/trivy-db:<digits>"`
    (`pkg/oci/artifact.go:290-293`). Today's log has `repo="mirror.gcr.io/aquasec/trivy-db:2"` (job 124920631345, log
    `:1887-1888`);
  - `db.sh` never passes `--quiet`;
  - `db.test.ts`'s stub prints that exact form.
- **N5. The scans' gating.**
  - The install and database steps get `id: trivy` and `id: trivy-db`.
  - Every scan's `if:` requires `steps.trivy.outcome == 'success' && steps.trivy-db.outcome == 'success'`. The worker
    scan keeps `!cancelled() && steps.worker.outcome == 'success'` beside them, and the web scan keeps its implicit
    `success()`.
  - The offline rule requires the gating.
- **N6. The archive cache.**
  - The archive's restore has no `restore-keys`.
  - Under the exact key a bad entry would stay, because a push saves only on a miss (the `APT_SAVE_IF` form,
    `ci.yml:252-262`).
  - So the runbook's remedy is a reviewed bump of `trivy-v1-` to `trivy-v2-` in `ci.yml`, or the founder deletes the
    entry.
- **N7. Closed by reads.**
  - `--skip-db-update` with no database fails closed (`pkg/db/db.go:121-124`).
  - `@sigstore/tuf` 5.0.0's options are `cachePath`, `mirrorURL`, `rootPath`, `forceCache`, `forceInit`, `retry` and
    `timeout` (`dist/index.js:43-52`).
  - `--offline-root` reads the `trusted_root.json` target from `@sigstore/tuf/seeds.json` directly, with no TUF client,
    so nothing is fetched. The package has no `exports` map and ships `seeds.json`.
- **N8.** `getBytes` refuses a `content-length` over 128 MiB before it reads anything. It then streams the body with a
  running count, and aborts once the count passes the cap.
- **N9. `@sigstore/core`, and no `der.ts`.**
  - `@sigstore/core` 4.0.1 joins the devDependencies; it is already in the tree under `@sigstore/verify`.
  - Its `ASN1Obj.parseBuffer` (`dist/index.d.ts:1`) decodes the OID values, and `trivy.ts` keeps a two-byte UTF8String
    encoder, for lengths under 128 only.
  - `der.ts` and `der.test.ts` are dropped.
  - Of §8's two conflicting statements, "nothing from Aqua's real release is committed" stands: no real certificate
    bytes are committed.
- **N10. The archive directory.**
  - The script is `install.sh <dir> [<archive-dir>]`.
  - Only `ci.yml`'s install step passes `"$RUNNER_TEMP/trivy-archive"`, at step level.
  - There is no `TRIVY_ARCHIVE_DIR`, since Trivy binds `TRIVY_<flag>` per flag (`options.go:367-372`).
- **N11. Commit 1's ★ list.**
  - It adds an identity case, a digest case and an age case, each through `checkActionPins` on the generator's fixtures,
    which are committed in commit 1.
  - It drops "an unchanged `release.txt` and checker read nothing", which passes on the base.
- **N12. More of the certificate in the policy.**
  - The policy's `oids` add `.1.11` = `github-hosted` and `.1.20` = `push` (12.3's certificate row).
  - Beyond the review, they also add `.1.18` =
    `https://github.com/aquasecurity/trivy/.github/workflows/release.yaml@refs/tags/v<v>`, the calling workflow.
    `canary.yaml` also calls `reusable-release.yaml` (`.github/workflows/canary.yaml:16` at v0.76.1, on branch pushes
    and `workflow_dispatch`), and `.1.18` and `.1.20` each refuse a canary run at a tag ref.
  - All three are constants in `trivy.ts` (E13), and reversible if Trivy changes them.
- **N13.** ci-findings-transport needs no rows (`LANES.md:29`, 18:00 UTC), and 12.4 is updated.
- **N14.** `pin-trivy.ts` reads `pnpm-workspace.yaml` and the floor through `releaseAgeMinutes`, as `index.ts:18-35`
  does.

### 12.11 The completeness critic's gaps, folded (2026-11-01)

The completeness critic (`/home/user/laneb-sp/p2reread/critic.md`, 20:25Z to 20:44Z: 8 gaps, 3 should fix and 5 nits)
read the whole design after 12.10's fold. Each gap was first tested, from 20:45Z to 20:58Z, against:
- bce57f16 in the worktree, whose `git status` stayed clean;
- Trivy v0.76.1's source, from a depth-1 sparse fetch of the tag (e713f67f, 20:46:05Z);
- the open pull requests and the build branch, through `gh api` and `git ls-remote` (20:47Z to 20:52Z).

Every gap holds, and none was refuted. Two carry a corrected detail: G3's line ranges and G7's "+12". The fixes are
below. §1 to §8 carry "(12)" pointers marked "12.11, G n", and 12.4 and 12.6 to 12.10 carry "(G n)" pointers. Where
this section and earlier text differ, this section governs.

**G1. The scripts' own `trivy` calls pass `--config ''`, and `db.sh`'s pass the cache directory.**
- **The facts, at v0.76.1.**
  - `trivy version` and `trivy --version` both call `showVersion(opts.CacheDir, …)` (`pkg/commands/app.go:1461`,
    `:237`).
  - That reads `metadata.json` from `db.Dir(cacheDir)`, and leaves `VulnerabilityDB` nil when it finds none
    (`pkg/version/version.go:31-53, :92`).
  - `--cache-dir` defaults to `cache.DefaultDir()` (`pkg/flag/global_flags.go:68-73`).
  - The root command's `PersistentPreRunE` loads `--config`, whose default is `trivy.yaml` in the working directory, for
    every subcommand (`app.go:198-216`; `global_flags.go:16-22`). An empty path loads nothing (`initConfig`,
    `app.go:159-162`).
- **What goes wrong without the flags.** E2 sets no `TRIVY_CACHE_DIR`, so a bare `trivy version --format json` reads
  Trivy's default cache, which holds no database. The JSON then carries no `VulnerabilityDB`, so the 48-hour check and
  the summary fail on every runner. A committed `trivy.yaml` could also set `cache.dir`. That is a T9 hole the offline
  rule cannot see, since it reads only workflow lines.
- **The fix.**
  - `db.sh` runs `trivy image --download-db-only --config '' --cache-dir "$1"`, then
    `trivy version --format json --config '' --cache-dir "$1"`, and fails when `VulnerabilityDB` is absent.
  - `install.sh` checks `trivy --version --config ''`. Its `Version:` line does not depend on the cache.
  - Both scripts' stub `trivy` refuses a call without `--config ''`, and `db.test.ts`'s also refuses one without
    `--cache-dir <the script's argument>`. So every passing case holds the flags, and one `db.test.ts` case asserts both
    calls' arguments.
  - T9, §3, E2, §8 and 12.6's commits 3 and 4 say so.
- **Beyond the gap.** The stubs refuse any call without the flags, `--download-db-only` included, not only the version
  call.

**G2. The three synth records.**
- **The fact.** Every case has a generated `fixtures/synthetic/<ID>/expected.json`, `none(0, …)` cases included.
  CI-21 to CI-23 have theirs at bce57f16, committed by P1's edbc928e (`git show --stat`).
- **Why it matters.** `static` runs `pnpm synth --all`, then fails on any change or new file under
  `fixtures/synthetic` (`ci.yml:135-141`).
- **The fix.** Commit 5 adds `fixtures/synthetic/CI-24/expected.json`, `CI-25/expected.json` and
  `CI-26/expected.json`, written by `pnpm synth --all`, never by hand. That command writes those three files and changes
  nothing else. §4 lists them.
- P1's design carried the same false sentence (`follow-up-p1-pin-age.md:895-896`); its build did the right thing.

**G3. The runbook's `static` places.** P1 extended these places for its own rule, and P2's plan missed them. The cites
are corrected: the "Action pins" bullet is `ci.md:87-106`, not `:87-100`, and the local-run bullet is `:409-416`, not
`:405-412` (bce57f16). Commit 5 writes, in the runbook's voice:
- **`:26`, the `static` row.** "the action pins and the toolchain …" gains "and the Trivy release
  `tools/trivy/release.txt` names, verified when it or the checker changes (docs/adr/0066, Part 6)".
- **`:87-106`, the "Action pins" bullet.** It gains Trivy's messages, each starting `trivy ` (E7), with their remedies.
  - **Offline, on every run:**
    - an `aquasecurity/` action;
    - a `trivy` step before the install or the database step, or a scan whose `if:` lacks both steps' success;
    - a missing flag: `--config ''`, `--cache-dir "$RUNNER_TEMP/trivy"`, `--skip-db-update`, `--skip-java-db-update`,
      `--ignorefile ''`, `--secret-config ''` or `--scanners vuln,secret`;
    - a refused flag: `--db-repository`, `--java-db-repository`, `--vex`, `--ignore-policy`, `--skip-dirs` or
      `--skip-files`;
    - a `TRIVY_*` variable other than the five Part 6 names, or a repository with a tag, a digest or a second
      repository.

    The remedy is to restore Part 6's form. A finding is fixed, never ignored by a file or a flag.
  - **The pin file:**
    - `release.txt` malformed, or absent while a step runs Trivy: run `pnpm trivy:pin X.Y.Z` and commit what it
      writes; never edit it by hand;
    - a `HIJACKED` version or archive digest (CVE-2026-33634), or a version under 0.72.0: pin another release.
  - **On a pull request whose reads run** (the pin or the checker changed):
    - **The bytes or their origin.** The tag names another commit, or there is no tag. Or one of these does not match:
      the signature, the signer's identity (the SAN, the issuer or an OID, each named), the signed digest against
      `linux_x64` or `checksums.txt`, the tlog entry count, or the signing time against `signed_at`.

      None of these is ever bypassed. On a new pin, treat the release as compromised (dependency-upgrades.md,
      "Trivy") and pin one that passes. On a change to the checker alone, the checker or the pin is wrong (E5). A
      changed upstream identity is a reviewed change to `trivy.ts`'s constants (E13).
    - **"Under three days old"** (by the signing time or `published_at`): wait until the instant named. Trivy has no
      exclude (C7).
    - **"Not on the default branch", "not on release/vX.Y" or "release/vX.Y not listed"**: the release does not fit
      how Trivy's pipeline cuts releases. Pin another release, and record it at the weekly triage.
    - **"Not immutable"**: the pin is refused, and the session decides (12.5, item 5).
    - **An advisory naming the version**: pin a release no advisory names.
  - **Outages:** the advisory read's control failing, "… failed 3 times …; the check fails closed" naming the host, or
    a read stopped by the shared 180 s deadline. Re-run the job.
  - **On a push**, every Trivy finding is a warning, read at the weekly triage (dependency-upgrades.md, "Trivy").
- **`:409-416`, the local-run bullet.** It gains these points:
  - On a change to `release.txt` or the checker, `BASE=origin/claude/build-platform pnpm actions:check` also does
    these reads: the tag and the release branches from github.com, the archive (about 52 MB) and its bundle, and
    Sigstore's trust root from tuf-repo-cdn.sigstore.dev.
  - Behind a proxy that refuses TUF, `--offline-root` verifies against the root `@sigstore/tuf` embeds. The check
    refuses that flag on CI (E15).
  - The release and advisory reads are CI's. Locally they are skipped with a note, so CI can only be stricter.

**G4. Commit 1's helpers.**
- **The fact.** `check.test.ts`'s `workflow()`, `network()` and `repository()` (`:23`, `:50`, `:78`) are not exported.
  P1's `age.test.ts` carries its own `testdata()` reader and `repository()` (`:30-31`, `:150`).
- **The fix.** `trivy.test.ts` does the same in commit 1, and `fixtures.ts` gains no testdata loader.
  - The archive and bundles reach `recordedTransport` through a new `bytes` option (URL to bytes, a status, an `Error`
    or `HANG`, as `urls` is).
  - Commit 2 implements that option. At commit 1 it is ignored at run time, and only `pnpm typecheck` fails, as a red
    commit may.
  - Each ★ case asserts its own message, so at commit 1 it fails on behaviour: the checker says nothing of Trivy.

**G5. The ninth `no-duplicated-versions` case is a guard.**
- **The fact.** No file it scans holds 0.76.1 or 0.70.0 at bce57f16, so its assertion cannot fail first.
  Extending `scanned()` (`:35-43`) to the absent scripts would turn all nine cases red through a missing file.
- **The fix.**
  - The case is written in commit 3 as a guard, not a ★ case, as N11 treated "reads nothing".
  - `scanned()` gains `tools/trivy/install.sh` and `db.sh` in commit 4, with the scripts. So no existing case goes red
    through a missing file.
  - Both of B2's commits land after B1's commit 2, so the case reads the real `release.txt` and is green from commit 3.

**G6. `fetchRefs`' interface.**
- **The signature.** `fetchRefs(repo, version, signal?, extra?)`, where `extra` is `{ branches?, tags? }`.
  - One `ls-remote --symref` lists HEAD, the tag and its `^{}`, each `refs/heads/<branch>`, and each extra tag with its
    `^{}`.
  - The one treeless fetch takes the default branch, the tag, and only what was listed.
  - `Refs` keeps `branch`, `head` and `tag` (`network.ts:34-41`). It gains `branches`, each name mapped to its fetched
    head or to `undefined` when not listed, and `tags`, each name mapped to `{ object, commit }` or to `undefined`.
- **The tests.**
  - `RecordedRepository` gains `branches`, and the recorded read stays `fetchRefs <repo> <version>` when no extra is
    passed. So `age.test.ts:256, :599` and `check.test.ts:120, :178` hold unchanged.
  - `network.test.ts` gains a case: an extra tag is listed and fetched, with its peeled commit returned, and an unlisted
    one comes back absent and is not fetched.
- **The use.** The ancestry rule reads `release/vX.Y`'s head and `vX.Y.0`'s commit from that one call (S6).

**G7. The open pull requests, and a moved build branch.** 12.4 gains rows for #90, #91, #92 and #93 (and #92 and #93
share a row). Each is resolved mechanically under rule 6. Three things changed after the critic's read, all read at
20:47Z to 20:52Z:
- **#94** (created 20:46:30Z) is new, and gets a row.
- **#83 merged** at 20:40:34Z, so `claude/build-platform` is 43565235, 16 commits past bce57f16. Its hunks lie after
  P2's places, so every bce57f16 cite in this design holds there.
- **#42** is at 6c28d6a2, with merge base bce57f16 and 219 files. Its shared hunks are unchanged in content, at
  `ci.yml:736-744, :748-756` and `workflows.test.ts:1853-1868` (at bce57f16).

The critic's "+12" for #91's shift of `dependency-upgrades.md` is +10 for #91 alone:
- hunks of +5 at `:58-72`, +2 at `:100-105` and +3 at `:318-326`;
- with #94's +2 at `:320`, it is +12;
- step 5 (`:95-98`) moves by +5 either way.

#91 also moves ADR 0066 by +12 from Part 3 on, which takes in Part 5's `:1273-1681`, `:1666` and its notices. Part 2's
`:727`, `:397-400` and `:347` do not move. P2 is re-cut after #86, so its builders re-map these cites on that base.

**G8. Part 6's notices.**
- **The convention.** ADR 0066 numbers its notices across its parts, in a "Notices (decided by the build under the
  standing rule; the founder can reverse any)" section per part. They end at N31 at bce57f16 (`:1608-1629`).
- **The numbering.**
  - #86 renumbers its N29 to N32 (`approval-summaries/lane-b-ci-images-digest-status.md:71-73`).
  - P4 numbers Part 7's from N33, provisionally, and renumbers them after Part 6 merges
    (`follow-up-p4-mutation-trigger.md:1216-1217`, E6). (14) P4 merged first, with Part 7's notices at N43 to N56 (ADR
    0066 `:2152-2202` at 8a722f80), so nothing renumbers.
  - Part 6 takes N33 to N42, so P4's Part 7 starts at N43.
  - If #86's number moves, Part 6's move in their own commit, as #86 renumbers its N29.
- **Part 6's notices**, in Part 5's form:
  - **N33** (C1, C8). trivy-action and setup-trivy are retired. CI installs the release `tools/trivy/release.txt` names
    from GitHub's release host and holds it to its SHA-256 on every run, downloaded or restored. Only `ci.yml` caches
    it, and only a push saves it. CI runs the CLI.
  - **N34** (C3; 12.5, item 9; S3). The vulnerability database comes from ghcr.io alone. It is untagged, under 48 hours
    old, and has no mirror and no digest pin, which reverses upstream's mirror-first order. No scan updates either
    database, so a JAR fails the scan.
  - **N35** (S4). No file in the checkout, and no other `TRIVY_*` variable, changes a verdict. A CVE is fixed, never
    ignored by a file.
  - **N36** (C7). Trivy's floor is P1's `releaseAgeMinutes`, with no release-age exclude.
  - **N37** (12.5, item 2; S7). A pin is at least 0.72.0. On CI, no reviewed advisory names it; the advisories are read
    by package, with the local control.
  - **N38** (12.5, item 3; S6). A `vX.Y.0` commit is on the default branch. A patch's commit is on `release/vX.Y`,
    which holds the `.0`.
  - **N39** (12.5, item 4; S1, N12, B1). The signer is Trivy's release workflow. That is checked by an anchored SAN, its
    issuer and seven certificate values, all in the policy and compared again exactly, under the library's default
    thresholds.
  - **N40** (12.5, item 5; S5). On CI the release must be immutable, and its `published_at` at least the floor old.
    `signed_at` is the verified signing time. On a push, a newer release past the floor that fails a check warns.
  - **N41** (12.5, item 8; E5). A verdict on the recorded bytes fails every pull request whose reads run. An upstream
    change fails only a new pin.
  - **N42** (12.5, item 10). The release dry run runs the release's scan too.
- **What is not a notice.** 12.5's items 1 (C1, in N33), 6 (the deadline, E4), 7 (the order) and 11 (small items) are
  not notices. Neither are the engineering choices E1 to E16.
- **The cites.** §5 and 12.6's commit 5 name the section, and 12.4's #86 row says N32.

**Not verified here.**
- The trivy.test.ts count of about 85 is a tally of the lists, not of written tests; the integrator records the exact
  numbers.
- The live reads stay CI's, as in 12.9.
- Whether #91, #94 and the others merge before P2's re-cut; each is mechanical either way.

## 13. Review of the re-read (2026-11-01)

22 findings (1 blocking, 7 should fix, 14 nits): 22 fixed, 0 fixed by another means, 0 not taken; none refuted. Each was
first tested against the code at bce57f16, Trivy v0.76.1's source, the `@sigstore/*` packages, GitHub and two scratch
prototypes (12.10). The fixes are in 12.10, in 12.3 to 12.7 and 12.9, and in §1 to §11 where marked "(12)".

| Finding | Disposition |
|---|---|
| B1 the synthetic Sigstore signer unspecified and unbuildable with the four packages | **Fixed.** `testdata/trivy/make.sh` is committed beside its outputs (P1's form), and its variants are listed (12.10 B1). The generator computes a **real SCT**, so `Verifier` keeps the library's defaults in tests and production alike, with no threshold seam: that is the safer of the review's two options. A prototype (OpenSSL 3.0.13 and Node, 20:06:47Z) verified at the defaults, and refused a root without the CT log, a changed byte and a wrong `.1.13`. §8's "set by the test" is corrected, and 12.6 adds the generator to B1's files and the counts |
| S1 the SAN is an unanchored pattern | **Fixed.** The SAN is an anchored, escaped `RegExp`. The explicit compare adds the SAN and the issuer, by exact equality. §8 gains the `v<v>0` and `v<v>-rc.1` cases, with every OID right, and Part 6 says the library's rule is a pattern. Reproduced at 20:06:47Z: the plain string accepted `…v0.76.10` even with `.1.14` = `refs/tags/v0.76.1`, and the anchored pattern refused it |
| S2 the commit order cannot be green, and an absent `release.txt` is unspecified | **Fixed.** No `release.txt` is valid only when no step runs `trivy` or `tools/trivy/`, and such a head makes no Trivy read. B1's commit 2 writes `release.txt` with `pnpm trivy:pin`, so the named-once test is green there. `pnpm actions:check` on the real tree is first green at B2's commit 4, which the PR records; no unit test runs it on the real tree (`check.test.ts:182`, `workflows.test.ts:12`) |
| S3 the Java database downloaded mid-scan | **Fixed.** `--skip-java-db-update` is on every scan and the SBOM, and required by the offline rule and `workflows.test.ts`. T7 and CI-26 say neither database is updated by a scan, and the runbook gives a JAR's remedy. Confirmed at v0.76.1: `jar.go:47-58`, `javadb/client.go:48-66`, `analyzer.go:561-567`, `run.go:353-366`. Today's images hold no JAR (job 124920631345) |
| S4 `trivy.yaml` and `.trivyignore` read from the checkout | **Fixed, and widened.** The review's flags are taken, and **`--secret-config ''`** is added, since `trivy-secret.yaml` is read from the checkout too (`secret_flags.go:4-9`). The offline rule also refuses `--skip-dirs`, `--skip-files` and any `TRIVY_*` variable other than the five named. T9 is new. A CVE is never ignored by file |
| S5 Rekor v2 blocks every pin and silences the newer-release warning | **Fixed.** `signed_at` is the verified signing time: the promise's `integratedTime`, else the one verified RFC 3161 time, read from the `SignedEntity` after `verify`. A push warns on a newer release past the floor that fails a check, naming the check. §8 and §10 rows are added. A prototype (20:09:08Z) verified a promise-less entry with an `openssl ts -reply` response at the defaults, and failed it under a root with no TSA |
| S6 the ancestry rule rests on a misreading | **Fixed.** The fact is corrected (GHSA-69fq: "also committed to a v0.70.0 branch"). The rule is tightened: a `.0` on the default branch, and a patch on `release/vX.Y` holding its `.0`. The branch is listed before it is fetched, and Part 6 states what remains. A fetch at 20:01Z shows every release from v0.65.0 to v0.76.1 fits the rule, and closes the review's "`release/v0.69` holds v0.69.0" (it does). `release-please.yaml:98-129` closes 12.9's branch-timing item |
| S7 the API helpers are private to `age.ts`, and the advisory control is weak | **Fixed.** The reader moves from `age.ts` to a new shared `api.ts` with a narrow context, rather than being exported from `age.ts` with an `AgeInput` factory. `age.ts` and `api.ts` are B1's. Advisories are read once by package and judged locally with `ghsaRangeHolds`. The control needs GHSA-69fq for 0.69.4 and GHSA-mcj4 for 0.71.0. The query form is from GitHub's REST description (20:02Z); the live endpoint is CI-only (403 here) |
| N1 #42's state stale | **Fixed.** 12.4, §11 and 12.2 name c65f9cf2 (17:07:16Z, merge base 83d71fd6, 219 files; read 20:03Z). The shared files are unchanged, and no conclusion changes |
| N2 the count measured on the wrong base | **Fixed.** The target is the cut base's push-run counts plus N, with three new files (12.6) |
| N3 E14's evidence string not in the command | **Fixed.** `--input` comes right after `trivy image` (§3, E14) |
| N4 the `repo=` line's exact form | **Fixed.** It is the exact form, never `--quiet`, with a stub that prints it (§3, §8, 12.10). Confirmed: `artifact.go:290-293`; log `:1887-1888` |
| N5 the worker scan runs after a failed install or database step | **Fixed.** Every scan's `if:` requires both steps' success, and the offline rule requires the gating (§3, E1) |
| N6 no restore keys, and no remedy for a bad cache entry | **Fixed.** The restore has no `restore-keys`. The runbook remedy is a reviewed key bump, or the founder deletes the entry (§3, C8, E11, §10) |
| N7 open items a read closes | **Fixed.** The `--skip-db-update` first-run refusal is read (`db.go:121-124`), and so are `@sigstore/tuf`'s option names. `--offline-root` reads `seeds.json`'s `trusted_root.json` directly. The open items are removed from E2, E4 and 12.9 |
| N8 `getBytes`' cap after `arrayBuffer()` | **Fixed.** `content-length` is checked first, then the body is streamed with a running count (§3, §8) |
| N9 `der.ts`, and two contradicting §8 statements | **Fixed.** `@sigstore/core` 4.0.1 is a fifth devDependency, its `ASN1Obj` decodes, and a two-byte encoder stays in `trivy.ts`. `der.ts` and `der.test.ts` are dropped, and no real certificate bytes are committed |
| N10 `TRIVY_ARCHIVE_DIR` in Trivy's namespace | **Fixed.** The directory is `install.sh`'s second argument, passed only by `ci.yml`'s install step |
| N11 no security case fails first | **Fixed.** Commit 1 has an identity, a digest and an age case on the generator's fixtures. The always-green case is no longer ★ |
| N12 two cheap policy values | **Fixed, and widened.** The policy takes `.1.11` and `.1.20`, plus `.1.18`, the calling workflow, since `canary.yaml:16` also calls `reusable-release.yaml` |
| N13 ci-findings-transport's rows | **Fixed.** 12.4 says it needs none (`LANES.md:29`) |
| N14 the floor `pnpm trivy:pin` uses | **Fixed.** `pin-trivy.ts` reads it as `index.ts:18-35` does (§3, 12.6) |

What the fold could not verify:
- the live `/advisories` answer (403 here);
- whether v0.76.1's release is immutable;
- when Sigstore moves to Rekor v2;
- whether aquasecurity/trivy's rulesets restrict creating `release/*` branches.

12.9 lists them. The fold's edits, with their old and new texts, are in `/home/user/laneb-sp/p2reread/fold1-edits.json`,
and its report is `/home/user/laneb-sp/p2reread/fold1.md`.

### Completeness critic

The critic (`/home/user/laneb-sp/p2reread/critic.md`, 20:25Z to 20:44Z) found 8 gaps: 3 should fix and 5 nits. All 8
are fixed, none was refuted and none was declined. Two have a corrected detail (G3's line ranges and G7's +12). Each
gap was first tested against bce57f16, Trivy v0.76.1 at e713f67f and GitHub (20:45Z to 20:58Z). The fixes are in 12.11
and in the places marked "12.11, G n" or "(G n)". The edits' old and new texts are in
`/home/user/laneb-sp/p2reread/fold2-edits.json`, and the report is `/home/user/laneb-sp/p2reread/fold2.md`.

| Gap | Disposition |
|---|---|
| G1 (S) `db.sh`'s `trivy version` has no `--cache-dir` or `--config ''` | **Fixed.** Confirmed at v0.76.1 (`app.go:159-162, :198-216, :237, :1461`; `version.go:31-53, :92`; `global_flags.go:16-22, :68-73`). `db.sh` passes `--config '' --cache-dir "$1"` to both of its calls and fails on an absent `VulnerabilityDB`; `install.sh` runs `trivy --version --config ''`. The stubs refuse any call without the flags, and one `db.test.ts` case asserts both calls (T9, §3, E2, §8, 12.6) |
| G2 (S) "`pnpm synth --all` writes nothing" is false | **Fixed.** Confirmed: CI-21 to CI-23's `expected.json` are at bce57f16 (edbc928e), and `ci.yml:135-141` checks them. Commit 5 adds CI-24 to CI-26's, written by `pnpm synth --all`, which changes nothing else (§4, 12.6) |
| G3 (S) `ci.md`'s `static` places left out | **Fixed, with corrected cites.** The plan now covers the `static` row (`:26`), the "Action pins" bullet (`:87-106`, not `:87-100`), with every Trivy refusal and its remedy, and the local-run bullet (`:409-416`, not `:405-412`), with the archive and TUF reads and `--offline-root` (§5, 12.6, 12.11) |
| G4 (N) commit 1's ★ cases need helpers that do not exist yet | **Fixed.** `trivy.test.ts` carries its own `workflow()`, `repository()` and `testdata()`, in `age.test.ts`'s form. The bytes go through a `bytes` option on `recordedTransport` that commit 2 implements, and each case asserts its own message, so it fails on behaviour (§4, 12.6) |
| G5 (N) the ninth `no-duplicated-versions` case cannot fail first | **Fixed.** It is a guard, not a ★ case. `scanned()` gains the scripts in commit 4, with them, so none of the eight existing cases goes red through a missing file. Both of B2's commits land after B1's commit 2 (§4, 12.6) |
| G6 (N) the `.0` tag's read has no interface | **Fixed.** The signature is `fetchRefs(repo, version, signal?, extra?)` with `{ branches?, tags? }`, and `Refs` returns each branch's head and each tag's commit, or its absence. The recorded read line is unchanged without extras, and `network.test.ts` gains an extra-tag case (§3, §8, E6, 12.6, 12.10 S6) |
| G7 (N) 12.4 misses #90 to #93, and #42 moved | **Fixed, and widened.** It has rows for #90, #91, #92 and #93, and for #94 (created 20:46:30Z). #42 is at 6c28d6a2 (merge base bce57f16), and #83 merged at 20:40:34Z (build branch 43565235; every bce57f16 cite holds). #91 alone moves "Actions" by +10, not +12; it is +12 with #94 (12.4, 12.11) |
| G8 (N) Part 6's notices unspecified, and 12.4 says N29 | **Fixed.** Part 6 has a Notices section, N33 to N42, each named, after #86's N32; P4's Part 7 starts at N43. 12.4 says N32 (§5, 12.4, 12.6, 12.11) |

The critic's two notes for the session:
- **The stray files.** `/index.txt`, `/sct.hex`, `/serial` and `/leaf-b.ext` were still at the filesystem root at
  20:50Z. They are trivial and hold no key. The session removes them with `rm /index.txt /sct.hex /serial /leaf-b.ext`.
- **The Dependabot group.** Its proposal of a Dependabot group for `@sigstore/*` is recorded as P42 (12.8), outside
  P2.

## 14. Delta on #107 and #106 at 8a722f80 (2026-11-07)

Written 2026-11-07 between 06:54Z and 07:18Z, after the orchestrator's ruling of 06:40 UTC: a short delta re-read that
covers only what #107 and #106 leave undone, then a build of only that. Where this section and §1 to §13 differ, this
section governs. In §12 a "(14)" marks only a fact that is now wrong; plan text that this section replaces is governed
by it without a mark. After its review (§15), "(14)" pointers also mark the header, §1's T2, T3, T4 and T8, §7's C8
and two rows of §10, where a reader of those lines would otherwise miss a change (14.9). Cites are `file:line` at
`8a722f804ad63daf3c2c3254eabeb5f989ee0fe7` unless a time or another commit is given; "the S1 verifier" and the like name
the skeptics of §15, whose reads are cited there.

### 14.1 Sources and method

The scout (`/home/user/laneb-sp/p2delta/scout.md`, 06:40Z to 06:54Z) read #107 and #106 commit by commit (`git log
4846f043..41818ac4`; `gh api pulls/107/files`, `pulls/106/files`), every Trivy line of the base in the worktree
`/home/user/ci-trivy-version` (clean before and after), the base's push run 42334067464 and its `images` job
128329221698's log, Trivy's tags and branches by `git ls-remote` and a treeless fetch (06:43Z to 06:45:41Z), both
v0.76.1 and v0.76.2 releases' assets and bundles verified with `@sigstore/verify` 4.1.2 under the root embedded in
`@sigstore/tuf` 5.0.0 (06:45:16Z, 06:45:22Z), github/advisory-database at `7cb4e6a7` through git, npm, anonymous OCI
reads of ghcr.io (06:46:38Z), the open pull requests (06:47:14Z), and the scoped unit run under the lock (06:43:08Z to
06:44:05Z). This revision then re-read every cite it uses at 8a722f80 in the same worktree (`git status` clean), and
made four new reads: `git ls-remote` of aquasecurity/trivy's tags and branches (06:58:20Z); both releases'
`checksums.txt` and its Sigstore bundle, downloaded from github.com and verified with the same library and root, the
anchored SAN and the seven certificate values (06:58:52Z; scratch under `/home/user/laneb-sp/p2delta/tmp`, removed
afterwards); npm's dist-tags and dependency ranges (07:03:12Z); and the open pull requests' files and the states of
every pull request 12.4 names (`gh api`, 07:00Z to 07:08Z). The GitHub API for `aquasecurity/*` and `/advisories`
answers 403 from this session (06:43:08Z, 06:45:55Z), so the release's `immutable` and `published_at` are not
verified here.

### 14.2 What #107 and #106 already did

#107 (`co-001/ci-trivy-pin-2026-11-04`, merged 2026-11-04T05:58:40Z as 7bf7b252) has five commits, not two: 6ee142ce
(`tools/trivy/release.txt`, `install.sh`, gitleaks' curl), 38a6cb79 (the install step in three jobs, `skip-setup-trivy`),
de7438c8 (`releases.ts`: the age rule ages a new `release.txt` version), 44a0fa5c (`workflows.test.ts:3116-3247`) and
41818ac4 (ADR 0066's Part 2 Amendment `:768-849`, ci.md). #106 (merged 2026-11-04T08:06:41Z) added the private-repository
guards and rewrote CI-11 and CI-21. Each design item against the base:

| Design item | At 8a722f80 | Evidence |
|---|---|---|
| C2, the gitleaks form (`key value` lines read with `awk`, a hash before `tar`, the message naming both digests) | **Wholly** | `release.txt:5-7`; `install.sh:17, :26`, `:48-52` (the message `:50`), `tar … trivy` alone `:54` |
| The binary from GitHub's release host, never get.trivy.dev | **Wholly** | `install.sh:41`; `workflows.test.ts:3141, :3150-3151` |
| T3, the bytes hashed before anything runs them | **Wholly**, now that nothing is restored (E22): every run downloads and hashes before `tar` | `install.sh:48-52`; one argument (`:11-14`) |
| The installed binary reports the pinned version | **Partly**: without `--config ''` (T9, G1) | `install.sh:56-60` |
| An atomic move | **Not**: `mv -f` from `mktemp -d` into `<dir>` crosses file systems | `install.sh:42, :61-63`; gitleaks renames in place, `tools/gitleaks/install.sh:64-67` |
| E12, no download-base override; curl https only, TLS 1.2, a time bound | **Not**: an override and `file:` admitted, no `--tlsv1.2`, no `--max-time`; the string is held for both installers | `install.sh:7, :41, :44`; `workflows.test.ts:3156-3160` |
| T2, one source of record with `commit` and `signed_at`, no copy elsewhere | **Partly**: the one file exists and nothing repeats its version, but it has no `commit` or `signed_at`, and no `no-duplicated-versions` case holds it | `release.txt:1-7`; `no-duplicated-versions.test.ts:71-139` (eight cases) |
| The base's text of `release.txt` (F6, S2; the design's `TRIVY_RELEASE`) | **Wholly, in #107's form** | `base.ts:24-32` (`PINNED_RELEASES`), `:51-52`, `:83-87`; named once, `check.test.ts:185-187` |
| T4, the pin-time proofs | **Partly**: the tag must be listed (three tries, then fail closed), and its commit is aged three days with a time GitHub recorded on CI. The ancestry is the default branch's, which refuses every patch release (below). No Sigstore, identity, digest against a signed list, `signed_at`, `HIJACKED`, 0.72.0 floor or advisory check; `immutable` counts only as a recorded time, never required | `releases.ts:50-63`; `check.ts:234-256`; `age.ts:525, :600-613, :647-660` |
| T5, push-run warnings | **Not**: an unchanged release version is not read, and the push tag re-read covers workflow pins only | `releases.ts:45-49`; `check.ts:264-301` |
| T1, the newest release three days old | **Not**: 0.70.0 runs | `release.txt:5`; job 128329221698 log `:1240` ("Version 0.76.2 of Trivy is now available, current version is 0.70.0") |
| T6, no `aquasecurity/*` action | **Not**: five trivy-action steps; the runner still downloads setup-trivy at "Set up job" | `ci.yml:711-723, :737-750`; `release.yml:144-154, :156-165`; `release-dry-run.yml:158-167`; job 128329221698 log `:34, :37` |
| T7, the database from ghcr.io only, under 48 hours, before any scan | **Not** | log `:1206` (`repo="mirror.gcr.io/aquasec/trivy-db:2"`); ADR 0066 `:789-793` ("a separate decision, not taken here") |
| T8, telemetry and the update check off | **Not** | log `:1240` |
| T9, no checkout file changes a verdict | **Not**: no `--config ''`, `--ignorefile ''` or `--secret-config ''` anywhere | the five steps above; `install.sh:56` |
| E1, install and database right after the checkout | **Partly**: the install step is there, with no `id` and no database step | `ci.yml:679-683`; `release.yml:77-81`; `release-dry-run.yml:90-94` |
| `tools/trivy/**` in the dry run's paths | **Wholly** | `release-dry-run.yml:31-32, :46-47`; `workflows.test.ts:2794-2795` |
| 12.5 item 10, the dry run scans | **Not** | `release-dry-run.yml:63-66` ("with no scan"); `workflows.test.ts:2865` |
| C8, the archive cache in `ci.yml` | **Not**, and dropped (E22): #107's "keeps no cache" stands | `ci.yml:668-750`; `install.sh:5-6` |
| ADR 0066 Part 2's Revisit (§5) | Rewritten by #107 to point at `release.txt` | ADR 0066 `:743` |
| P38 | **Unblocked**: #42 merged 2026-11-02T07:34:57Z (22789493) | `gh api pulls/42` (07:08Z); ADR 0062 `:1393` |
| P39 | **Moot**: #86's rows name each producer by step and script fingerprint, never by line | `workflows.test.ts:4007-4027` |
| P40 | **Partly**: gitleaks' curl has `--proto '=https,file' --proto-redir '=https'` | `tools/gitleaks/install.sh:53` |
| P26, widened | **Partly**: gitleaks' `release.txt` is aged by the age rule | `base.ts:31` |

**What binds P2 from #106 and #86.**
- No shell script under `tools/` or `.github/` may match `REMOTE_READ` or run `gh` (`workflows.test.ts:2934-2942`,
  `:3006-3008`). A curl of `github.com/$…` would match, so `install.sh` keeps the address in a variable.
- Only `tools/check-action-pins/network.ts` may hold git's remote verbs among the TypeScript a step reaches
  (`:3037`, `:3052`), and a file that names GitHub's API needs the job's token in its step (`:3038`, `:3045-3047`);
  "Action pins" has it (`ci.yml:89-92`).
- Every tracked file outside the workflows that names `GITHUB_ENV` or `GITHUB_PATH` in any case is one of a closed
  list (`workflows.test.ts:4531-4540`): ADR 0066, ci.md, `tools/engine-freeze/check.test.ts` and `workflows.test.ts`. No
  file P2 adds or edits outside those four may name either.

**The conflict.** The age rule requires a pin's commit to be on the upstream's default branch (`age.ts:525`), and
refuses one off it unless an off-default-branch exclude admits it (`age.ts:647-660`, the message `:655`). v0.76.1
(`e713f67f`) and v0.76.2 (`3f6334d2`) are on `release/v0.76` alone (scout, 06:45:41Z; `release/v0.76`'s head is
`3f6334d2`, 06:58:20Z). So a pull request that sets `version 0.76.1` fails `static` as "not on main", and the rule's own
escape for Trivy would be a release-age exclude, which is the founder's. E17 resolves it.

### 14.3 What P2 still builds

Only the remainder, on #107's files. Every item keeps #107's shape where one exists.

1. **Trivy held by its own rule, not the action pins' age rule** (E17). `PINNED_RELEASES` (`base.ts:29-32`) keeps both
   entries, so `baseState` still returns the base's text of each (`:83-87`) and the named-once test stays; each entry
   gains `heldBy` (`'age'` for gitleaks, `'trivy'` for Trivy), and `releasePins` (`releases.ts:37`) skips Trivy's with a
   note naming `trivy.ts`. `trivy.ts` reads the base's text from `state.releases['tools/trivy/release.txt']`. No
   `age-exceptions.json` entry. The doc comments that say each `release.txt` is aged as an action pin
   (`base.ts:24-28`, `releases.ts:7-13`) say instead that gitleaks' is, and that Trivy's is held by `trivy.ts`. For
   Trivy this reverses #107's de7438c8 (E17).
2. **`tools/trivy/release.txt`, extended, not replaced.** Five keys: #107's `version`, `linux_x64` and `linux_arm64`, plus
   `commit` (the tag's commit) and `signed_at` (the verified signing time of the release's checksums file, E18). Written
   by `pnpm trivy:pin`, never by hand; its header names Part 6 and says the two digests are the two Linux archives'
   (§3's "the one archive" no longer holds). Every reader of today's three keys reads the new file
   unchanged (`install.sh:17, :26`; `releases.ts:16-18`; `workflows.test.ts:3146-3148`; `base.ts:83-87`).
3. **The networked checks** in `tools/check-action-pins/trivy.ts` (new), on a pin new against the base, a change to the
   checker, a change to the locked version of any `@sigstore/*`, `tuf-js` or `@tufjs/*` package against the merge base
   (E32), or no base, after the age rule and under its deadline (`check.ts:215-262`):
   - (1) the tag `v<version>` names `commit` (`tagCommit`, `network.ts:377`);
   - (2) the release's `trivy_<v>_checksums.txt` and its `.sigstore.json` bundle, read with `getBytes`, verify under the
     injected trusted root with `Verifier` at the library's defaults, the anchored SAN of
     `reusable-release.yaml@refs/tags/v<v>`, the issuer and seven certificate values in the policy's `oids` (`.1.11`, `.1.13`, `.1.14`, `.1.15`, `.1.17`, `.1.18`,
     `.1.20`; 12.10 S1, N12);
   - (3) the SAN, the issuer and the seven values compared again by exact equality from the verified signer;
   - (4) `linux_x64` and `linux_arm64` each equal to their archive's one line in that signed file (E18);
   - (5) exactly one tlog entry; the verified signing time equal to `signed_at`; the youngest time read (below) at
     least `releaseAgeMinutes` old;
   - (6) the ancestry of 12.10 S6: a `vX.Y.0` commit on the default branch; a patch's on `release/vX.Y`, which holds
     `vX.Y.0`'s commit, itself on the default branch; the branch listed before it is fetched;
   - (7) on CI, the release read with the job's token: `immutable: true`, and `published_at` at least the floor old (it
     joins the youngest time);
   - (8) on CI, the advisories of `github.com/aquasecurity/trivy` read by package, every page, judged locally with
     `ghsaRangeHolds` (`age.ts:709`), with E8's control. First, each unwithdrawn advisory's `vulnerable_version_range`
     for that package is parsed strictly: comma-separated constraints, each `<`, `<=`, `>`, `>=` or `=` and a version
     of one to three numeric parts with an optional `-` pre-release, the grammar `ghsaRangeHolds` reads
     (`age.ts:711`, `:719`). A range that does not parse (null, empty, `||`, `+incompatible`, a fourth numeric part,
     two constraints without a comma) fails the read naming the advisory: an error on a pull request, a warning on a
     push (E31).
   - **The youngest time** (E17): the latest of `signed_at`; the tag commit's committer and author dates, read from the
     commit (6) fetches; and, on CI, `published_at` (7), the commit's `verification.verified_at` (as P1 reads it,
     `age.ts:585-598`) and the commit's arrival on the branch (6) names: the default branch for a `.0`, as P1 reads
     it, and `release/vX.Y` for a patch, a signal P1 never read (its read names only the default branch,
     `age.ts:424-470`, `:617`; `network.ts:35-36`). The arrival is best effort with P1's note, as at
     `age.ts:621-623`: a failed read or no push found is a note, never an error. A time in the future fails, as P1's
     does (`age.ts:663-665`).
4. **The offline rules** in `trivy.ts`, joining the offline errors (`check.ts:123-130`): `release.txt`'s five keys and
   forms; `HIJACKED` (0.69.4, 0.69.5, 0.69.6) and both of v0.69.4's archive digests from GHSA-69fq-xp46-6x23,
   `385d498d18a3a7c67878ca7322716f9da25683eb1a4bf9e9592da0d5f2ab09f6` (Linux-64bit) and
   `e401ae1e6d2442fa9a0c79dc0f3b0457ecfebf74a9c0a920159c49437f663aef` (Linux-ARM64), each refused on either line
   whatever the version; the 0.72.0 floor; no `aquasecurity/` action; the install and database steps before any `trivy`
   step; every scan gated on both; the flags and refused flags of 12.10 S3 and S4; the five literal variables in the
   own `env` of every Trivy step (a `run` that invokes `trivy` or `tools/trivy/`), and no `TRIVY_*` at a workflow or job
   level, on any other step, or other than the five (E30); no `release.txt` only when nothing runs `trivy` or
   `tools/trivy/`.
5. **Push-run warnings** (T5; 12.7 E9, E10; 12.10 S5): the pinned tag read again; the pinned release read (a 404 warns
   "withdrawn", not immutable warns); newer stable releases, newest first and at most three, each run through every
   check, a passing one past the floor warning with `pnpm trivy:pin X.Y.Z`, one past the floor that fails warning with
   the check; every failure a warning.
6. **The checker's supporting code**: `api.ts` (new; `apiGet`, `apiRefusal`, `apiProblem`, `verificationRefusal`,
   `pinIn`, `nextPage` and `arrival`, with their narrow context, moved from `age.ts:332-470`, `age.ts` importing them;
   `arrival` takes the repository, the commit, the floor and the branch in place of P1's `Facts`, and P1's calls keep
   their behaviour, so `age.test.ts` stays green unchanged); `network.ts`' `getBytes` (E18's cap; it also returns the
   answer's `Last-Modified`, E25) and `fetchRefs`' `extra = { branches?, tags? }` (12.11 G6); `base.ts`' merge-base read
   of `pnpm-lock.yaml`, named once beside `AGE_EXCEPTIONS` (E32); `fixtures.ts`' `bytes` option and `branches`;
   `index.ts`' `--offline-root` (refused on CI); `check.ts`' call; `pin-trivy.ts` (its boundary, E25) and the root
   `trivy:pin` script; `testdata/trivy/make.sh` and its outputs (12.10 B1, signing a synthetic checksums file, E18).
7. **`tools/trivy/install.sh`, extended** (E20, E21, E22): #107's one argument, `<dir>`, and no archive directory;
   `trivy --version --config ''`; an atomic rename within `<dir>`; curl `-fsSL --proto '=https' --proto-redir '=https'
   --tlsv1.2 --retry 3 --max-time 120`; no `TRIVY_DOWNLOAD_BASE`. Its usage, platform map, forms, hash check and
   messages stay #107's. Its header (`install.sh:1-8`) names Part 6 beside Part 2 and loses the `TRIVY_DOWNLOAD_BASE`
   sentence (`:7-8`); "It keeps no cache" (`:5-6`) stays true. The step, not the script, writes the directory onto the
   path.
8. **`tools/trivy/db.sh`** (new), as §3 and 12.10/12.11 have it: `trivy image --download-db-only --config ''
   --cache-dir "$1"` three times with 10 s and 30 s pauses, failing naming ghcr.io and
   `pkg-containers.githubusercontent.com`; the exact `repo="ghcr.io/aquasecurity/trivy-db:<digits>"` line; `trivy version
   --format json --config '' --cache-dir "$1"` read with `jq -r`, `VulnerabilityDB` present and `UpdatedAt` under 48
   hours; the version, repository, `UpdatedAt` and `DownloadedAt` in the step summary; no curl, no git, never `--quiet`.
9. **The workflows** (exact steps in 14.7): the five trivy-action steps become CLI steps; the install step gains
   `id: trivy` and loses the `TRIVY_CMD` line, and stays word for word the same in all three jobs; a database step
   `id: trivy-db` follows it in all three jobs; every step that runs Trivy (the install, the database step, the scans
   and the SBOM) has the five literal variables in its own `env`, and no job or workflow has an `env` (E30); every scan
   is gated on both steps; the release builds pass `--image-src docker "$IMAGE_REF"`; the dry run keeps the scan; no
   step caches Trivy's archive (E22).
10. **Tests**: `trivy.test.ts`, `install.test.ts`, `db.test.ts` (new); `network.test.ts`, `check.test.ts`,
    `age.test.ts` (#107's Trivy fixture moves to gitleaks, plus one case); `workflows.test.ts` (every trivy-action
    assertion, #107's describe, #86's two rows and write cases);
    `no-duplicated-versions.test.ts` case 9; `collection.test.ts`; `controls.ts:261, :264`.
11. **`@sigstore/*`** in `tools/package.json` `devDependencies`, exact (E27), and the lockfile `pnpm install` writes.
12. **Documents**: ADR 0066 Part 6 with N33 to N42 and its header lines; ADR 0010 `:19, :30`; ADR 0062 `:1393` (P38);
    ci.md; `dependency-upgrades.md`; reconciliation-001; the matrix's intro, CI-21's row and CI-24 to CI-26; `README.md`.

**Not built, because #107 or #106 did it:** the download from GitHub's release host, the hash before `tar`, the
extraction of `trivy` alone, the version check (extended only by `--config ''`), the platform map, the base's text of
`release.txt`, the install step's place right after the checkout, the dry run's path filters, the tag-listed refusal
(which `trivy.ts`' check (1) keeps for Trivy).

**Founder-kept, and none arises:** the 48-hour database floor is unchanged; Trivy gets no release-age exclude (C7; E17
replaces the rule that would have needed one); no migration; no release tag; no owner-admin setting. There is no
archive cache, so no cache entry for the founder to delete (E22). **Named for the founder:** P2 reverses #107's
de7438c8 for Trivy. At the base a Trivy patch pin passes only with a per-release off-default-branch exclude
(`age.ts:651-656`); under P2 it passes by S6's branch rule with none. Whether that exclude is the founder-kept "Trivy
release-age exclude" is disputed (E17), so the integrator records the reversal in the status file (14.7).

### 14.4 Versions and facts measured today

**The Trivy release chosen: v0.76.1.** It is the newest release whose signing time is at least three days old at
07:00Z. v0.76.2 cannot pass CI before 2026-11-08T12:50:24Z: its assets' latest `Last-Modified`, 12:50:24 GMT, plus
the floor, since `published_at` follows the last upload; on CI it passes from `published_at` plus three days, not
verified here (the release API answers 403). `pnpm trivy:pin` takes it from 2026-11-08T13:50:24Z, an hour later (E25).

| Fact | v0.76.1 (pinned) | v0.76.2 (`pnpm trivy:pin` from 2026-11-08T13:50:24Z) |
|---|---|---|
| Tag (lightweight) | `e713f67f7d54decdcd9b3132c9751833dcced698`, committed 2026-10-21T10:20:32Z | `3f6334d223b52188324af3b9923b4249cd206652`, committed 2026-11-05T11:50:03Z, the head of `release/v0.76` |
| Branch | `release/v0.76` only; that branch holds v0.76.0 `531360e5`, which is on `main` | the same |
| `linux_x64` (`trivy_<v>_Linux-64bit.tar.gz`) | `c7cbe3137fb8a48a17574bede3dd6beb16742d1e9772929940fc90082c39d9c0` (52,676,794 B) | `bc0fc726e017b8927a62b2d3531d7a84ee01769daf5c99ed866dced54089fdbf` (52,714,130 B) |
| `linux_arm64` (`trivy_<v>_Linux-ARM64.tar.gz`) | `e174dff2a6dba5e3ae41f8d0537a6324405bd08132497340304c6b20e0f16a1f` | `ab9d51f86e6a5fb936f605faff6b593ac51bc378fff4d3e8b9d58358b9c367c3` |
| `checksums.txt` | 2,121 B, SHA-256 `885debc41b570179e81af560e5f393a66be29b9ff8c52915674f3eb2304c535d`; its two Linux lines are the two above | 2,121 B, `802e4ac1418ed967cd3c4b901f4f71ca00b7363ede67778665a22d9f13f58c83`; the same |
| Its bundle | v0.3; one tlog entry, logIndex 3355009825, promise and proof; one RFC 3161 timestamp | v0.3; logIndex 3693536154, promise and proof; one RFC 3161 |
| `signed_at` (the entry's `integratedTime`) | **2026-10-21T11:16:00Z** (1792581360); 16 d 19 h 44 m old at 07:00Z | **2026-11-05T12:47:43Z** (1793882863); 1 d 18 h 12 m old at 07:00Z |
| Verification (06:58:52Z) | OK with the anchored SAN, the issuer and the seven values; `UNTRUSTED_SIGNER_ERROR` for the SAN of `v0.76.0`; `UNTRUSTED_SIGNER_ERROR … missing OID 1.3.6.1.4.1.57264.1.13` for v0.76.0's commit; `SIGNATURE_ERROR` for the file less one byte | OK |
| The archive bundles (for comparison; scout 06:45Z) | x64 2026-10-21T11:14:36Z, arm64 11:14:16Z, both verify | x64 2026-11-05T12:47:20Z |
| `immutable`, `published_at` | not verified (403); the bundle asset's `Last-Modified` was 11:18:30 GMT (12.3) | not verified (403, 07:50:24Z); every asset's and bundle's `Last-Modified` 12:50:01 to 12:50:24 GMT, the checksums file 12:50:18 and its bundle 12:50:24 (`curl -sSIL`, 07:51:54Z to 07:52:10Z); Trivy's release runs goreleaser v2.16.0 (`d76fb400`, read 07:50:56Z), which uploads to a draft and publishes after the last upload (`internal/client/github.go:513-515`, `internal/pipe/release/release.go:177-193`), so `published_at` is 12:50:24Z or later |

Also: v0.77.0 is pending as `release-please--branches--main` `f96377a4`, untagged; `main` is `c22582a1` (06:58:20Z).
#107's v0.70.0 (`8a3177ae`) is on `main`. Advisories (advisory-database `7cb4e6a7`, 2025 and 2026 read): only
GHSA-69fq-xp46-6x23 (= 0.69.4), GHSA-q3fv-x8vg-qqm4 (< 0.71.0), GHSA-mcj4-mphf-j9ff (< 0.71.1) and
GHSA-8rc5-4fr6-64pw (< 0.72.0); none withdrawn, none new since 2026-11-01, none naming 0.76.x. A scan of every year
of github-reviewed at the same commit (07:48Z) adds GHSA-xcq4-m2r3-cmrj (2024, fixed 0.51.2), which leaves the 0.72.0
floor as it is; all five use range forms the strict parse accepts (E31). GHSA-69fq lists both of v0.69.4's Linux
archive digests, x64 `385d498d…09f6` and ARM64 `e401ae1e…3aef` (its JSON at 7cb4e6a7, read 08:07Z); `HIJACKED`
refuses both. trivy-action's newest tag is still v0.36.0 (`ed142fd0`); setup-trivy v0.3.1 still runs `contrib/install.sh` at
`75c4dc0f`, so C1's reasons hold (scout, 06:46:09Z).

**`@sigstore/*`** (npm, 07:03:12Z; every version with provenance and a trusted publisher, scout 06:43:49Z):

| Package | Pinned now | Newest | Newest is three days old from |
|---|---|---|---|
| `@sigstore/verify` | 4.1.2 (2026-08-04T21:34:43Z) | 4.1.3 (2026-11-05T00:19:17Z) | 2026-11-08T00:19:17Z |
| `@sigstore/tuf` | 5.0.0 (needs `tuf-js ^6.0.0`) | 5.0.1 (needs `tuf-js ^6.0.2`) | about 2026-11-08T00:19Z |
| `@sigstore/bundle` | 5.0.0 | 5.0.1 | about 2026-11-08T00:19Z |
| `@sigstore/protobuf-specs` | 0.5.2 | 0.5.2 | old enough |
| `@sigstore/core` | 4.0.1 | 4.0.1 | old enough |

`tuf-js` 6.0.2 (2026-11-04T20:44:35Z) and `@tufjs/models` 5.0.2 are three days old from about 20:44Z today; before
then the gate resolves 6.0.1 and 5.0.1. No advisory names any pinned version; `npm audit` shows only
GHSA-g3hv-75wg-m249 (minimatch, moderate, through `@tufjs/models`), so they stay development dependencies (12.1).

**The database** (anonymous, 06:46:38Z): `ghcr.io/aquasecurity/trivy-db:2` is `sha256:40be1d48…37c4`, created
2026-11-07T00:53:51Z (5 h 53 m old), layer `db.tar.gz` `sha256:1fadb75c…ac91`, 139,059,920 B; `trivy-java-db:1` was
created 01:09:47Z. A blob read answers 307 to `pkg-containers.githubusercontent.com`, which this session cannot reach.
Unsigned as of 12.3 (not re-read). Today's `images` reads `mirror.gcr.io` (job 128329221698 log `:1206`).

**The base's counts.** Push run 42334067464, unit job 128329220727 (attempt 2; attempt 1 failed on a MOD-16 property
flake, not P2's): **479 files, 9,952 passed, 2 skipped**. Locally, the scoped run of `tools/test`, both checkers and
`tools/trivy` under the lock: 32 files, 484 tests (06:43:08Z to 06:44:05Z).

### 14.5 Numbers

- **CI-24 to CI-26: free and P2's.** No match in `test-matrix.md`, `matrix.ts` or `registry.ts`, and no
  `fixtures/synthetic/CI-24` to `CI-26` (07:00Z); LANES.md rule 4's 2026-11-07 01:19 UTC line keeps them P2's and gives
  CI-30 to ux-forms-after-42 (next free CI-31).
- **N33 to N42: free.** ADR 0066 holds N1 to N32 and N43 to N56 (07:00Z); its Status line reserves Part 6 for P2 before
  Part 7 (`:6-7`); P4 merged first with Part 7's notices at N43 (`:2152`), so nothing renumbers.
- **P38 to P42: P2's.** `lanes/lane-b.md:1240-1241` ("P2 notices N33-N42, proposals P38-P42; P4 … P29-P37, P43, P44");
  P4's design renumbered its own to P43 and P44 (`follow-up-p4-mutation-trigger.md:1402-1404, :1554-1557`). After this
  delta: P38 is built in P2 (14.3, item 12); P39's old text is moot (14.2), so, Part 6 being unpublished, the number
  now holds the proposal for P1's advisory range read (12.8; E31); P40's remainder for gitleaks is `--tlsv1.2`, a time
  bound and dropping `file:` with `tools/hooks/hooks.test.ts:462, :466` moved to a stub `curl`; P41 and P42 stand; P26's
  remainder is the signature, ancestry, `immutable` and advisory reads for gitleaks.
- **No ADR number**: Part 6 of 0066.

### 14.6 Overlaps

Open at 07:00:21Z: #129, #126, #124, #123 and #122, the same as the scout's list. None touches the three workflows,
`tools/trivy`, `tools/check-action-pins`, `tools/test`, ADR 0066, 0062 or 0010, ci.md, `dependency-upgrades.md` or
`controls.ts` (`gh api pulls/<n>/files`, 07:05Z).

| Pull request | What it shares with P2 | Resolution |
|---|---|---|
| #129 `co-001/email-lockup-plate` (`f4fef908`, draft) | Root `package.json`: one line after `lint:copy` (`:15`). `test-matrix.md` and `matrix.ts` SGN-13, far from CI | P2 puts `"trivy:pin"` after `"gitleaks:install"` (`:18`), three unchanged lines (`:16-18`) from #129's line, so both merge cleanly. The second merged keeps both |
| #126 `co-001/ledger-interest-once` (`9824f4e9`, draft) | `reconciliation-001.md:465-472` (P2 appends at the end, after `:698`); LED rows, `matrix.ts:310`, `registry.ts:457` | Clean |
| #122, #123, #124 (Dependabot; #122 also root `package.json`'s `globals`) | `pnpm-lock.yaml` | Never merged by this session. The one merged second regenerates the lockfile with `pnpm install` (LANES.md rule 6) |
| WIP `co-001/wip-ux-forms-after-42` (no PR; `09377f21` at 07:00:16Z) | CI-30 after CI-29 (`test-matrix.md:349`, `matrix.ts:668`, `registry.ts:872`, scout's read) | P2's rows go after CI-23 (`test-matrix.md:345`, `matrix.ts:664`, `registry.ts:867`), three unchanged rows (CI-27 to CI-29) away: clean |

Every pull request §12.4 names has merged or closed (14.9's mark). Under speed rule 2 the base is merged once, right
before the push that precedes the merge, and under rule 2a again if the base moves after the last CI run.

### 14.7 Build plan on this base

**The branch.** `co-001/ci-trivy-version` at 8a722f80 in `/home/user/ci-trivy-version`, installed. Two builders work in
parallel on disjoint files, each in its own worktree cut from 8a722f80; the integrator stacks their commits on the
branch in the order below with `git cherry-pick` (nothing is pushed before the integrator's first push) and writes the
documents. B2's suites need B1's five-key `release.txt`, so B2 runs them only on a tree that holds B1's commit 2: before
its commit-4 run it cherry-picks B1's commits 1 and 2 into its own worktree, under its own (the integrator takes only
B2's commits from it), and the integrator runs B2's suites again at commit 4 on the stacked branch.
Every heavy command runs under `flock /tmp/laneb-heavy.lock`. Before B1's commit 2, `git ls-remote --tags
https://github.com/aquasecurity/trivy` runs again, and `pnpm trivy:pin` takes the newest stable release it accepts
(E25).

**The exact workflow form**, which B1's offline rules accept and B2 writes. No workflow or job has an `env`; every step
that runs Trivy carries the same five lines, in this order, in its own `env` (E30). No step caches Trivy's archive
(E22). In `ci.yml` `images`, right after the checkout (`:673-674`) and before setup-buildx (`:688`):

```yaml
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with: { persist-credentials: false }
      - name: The pinned Trivy
        id: trivy
        env:
          TRIVY_DB_REPOSITORY: ghcr.io/aquasecurity/trivy-db
          TRIVY_JAVA_DB_REPOSITORY: ghcr.io/aquasecurity/trivy-java-db
          TRIVY_DISABLE_TELEMETRY: "true"
          TRIVY_SKIP_VERSION_CHECK: "true"
          TRIVY_NO_PROGRESS: "true"
        run: |
          trivy="$(tools/trivy/install.sh "$RUNNER_TEMP/trivy-bin")"
          dirname "$trivy" >> "$GITHUB_PATH"
      - name: The vulnerability database (ghcr.io, under 48 hours)
        id: trivy-db
        env:
          TRIVY_DB_REPOSITORY: ghcr.io/aquasecurity/trivy-db
          TRIVY_JAVA_DB_REPOSITORY: ghcr.io/aquasecurity/trivy-java-db
          TRIVY_DISABLE_TELEMETRY: "true"
          TRIVY_SKIP_VERSION_CHECK: "true"
          TRIVY_NO_PROGRESS: "true"
        run: tools/trivy/db.sh "$RUNNER_TEMP/trivy"
```

The scans, each right after its build:

```yaml
      - name: Scan the web image (fails on HIGH or CRITICAL)
        if: ${{ steps.trivy.outcome == 'success' && steps.trivy-db.outcome == 'success' }}
        env:
          TRIVY_DB_REPOSITORY: ghcr.io/aquasecurity/trivy-db
          TRIVY_JAVA_DB_REPOSITORY: ghcr.io/aquasecurity/trivy-java-db
          TRIVY_DISABLE_TELEMETRY: "true"
          TRIVY_SKIP_VERSION_CHECK: "true"
          TRIVY_NO_PROGRESS: "true"
        run: trivy image --input "$RUNNER_TEMP/image/web.tar" --config '' --cache-dir "$RUNNER_TEMP/trivy" --skip-db-update --skip-java-db-update --ignorefile '' --secret-config '' --scanners vuln,secret --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 --format table
      - name: Scan the worker image (fails on HIGH or CRITICAL)
        if: ${{ !cancelled() && steps.worker.outcome == 'success' && steps.trivy.outcome == 'success' && steps.trivy-db.outcome == 'success' }}
        env: … (the same five lines)
        run: trivy image --input "$RUNNER_TEMP/image/worker.tar" … (the same flags)
```

In `release.yml` `build` and the dry run's `build`: the same install step, word for word as in `images` (#107's
command, one argument), and the same database step; then, in place of `release.yml:144-165` and
`release-dry-run.yml:158-167`:

```yaml
      - name: Scan the image (fails on HIGH or CRITICAL)
        if: ${{ steps.trivy.outcome == 'success' && steps.trivy-db.outcome == 'success' }}
        env:
          IMAGE_REF: ${{ steps.image.outputs.ref }}
          TRIVY_DB_REPOSITORY: ghcr.io/aquasecurity/trivy-db
          TRIVY_JAVA_DB_REPOSITORY: ghcr.io/aquasecurity/trivy-java-db
          TRIVY_DISABLE_TELEMETRY: "true"
          TRIVY_SKIP_VERSION_CHECK: "true"
          TRIVY_NO_PROGRESS: "true"
        run: trivy image --image-src docker --config '' --cache-dir "$RUNNER_TEMP/trivy" --skip-db-update --skip-java-db-update --ignorefile '' --secret-config '' --scanners vuln,secret --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 --format table "$IMAGE_REF"
      - name: Write the software bill of materials
        if: ${{ steps.trivy.outcome == 'success' && steps.trivy-db.outcome == 'success' }}
        env:
          IMAGE_REF: ${{ steps.image.outputs.ref }}
          SBOM: sbom-${{ matrix.image }}-${{ github.ref_name }}.spdx.json
          TRIVY_DB_REPOSITORY: ghcr.io/aquasecurity/trivy-db
          TRIVY_JAVA_DB_REPOSITORY: ghcr.io/aquasecurity/trivy-java-db
          TRIVY_DISABLE_TELEMETRY: "true"
          TRIVY_SKIP_VERSION_CHECK: "true"
          TRIVY_NO_PROGRESS: "true"
        run: trivy image --image-src docker --config '' --cache-dir "$RUNNER_TEMP/trivy" --skip-db-update --skip-java-db-update --format spdx-json --output "$SBOM" --exit-code 0 "$IMAGE_REF"
```

The dry run's copies are release.yml's cut by `asDryRun` (its `SBOM` is `sbom-${{ matrix.image }}-dry-run.spdx.json`,
the name its SPDX read already uses, `release-dry-run.yml:170`). The comments above each step say what it does and name
Part 6 (`ci.yml:13-14, :82-88, :675-678, :720-721, :747-748`; `release.yml:21-29, :73-76`; `release-dry-run.yml:3-14,
:63-66, :86-89, :156-157`). No step writes `TRIVY_CMD`.

**B1: `tools/check-action-pins`, `release.txt` and the manifests.** Files: `tools/check-action-pins/{network.ts,
network.test.ts, base.ts, releases.ts, check.ts, check.test.ts, index.ts, fixtures.ts, age.ts, age.test.ts}` (changed),
`{trivy.ts, trivy.test.ts, pin-trivy.ts, api.ts}` and `testdata/trivy/` (new), `tools/trivy/release.txt`,
`tools/package.json`, the root `package.json` and `pnpm-lock.yaml`.
- **Commit 1, red.** The five packages (E27) and the lockfile `pnpm install` writes, the resolved transitive versions
  recorded. `testdata/trivy/make.sh`, run once by hand, and its outputs (12.10 B1, with E18's change: each variant signs
  a synthetic `trivy_0.99.1_checksums.txt` listing two synthetic archive names and digests; no archive is made); gitleaks
  runs over the outputs before the commit. `trivy.test.ts`' twelve ★ cases (marked below), each through
  `checkActionPins` and asserting its own message, with the file's own `workflow()`, `repository()` and testdata reader
  (12.11 G4). In `age.test.ts`, the describe at `:660-703` moves its fixture to `tools/gitleaks/release.txt` and
  `gitleaks/gitleaks` (the same three cases), and gains the ★ case A1. Red: the checker says nothing of Trivy, and the
  age rule ages Trivy's file.
- **Commit 2, green.** `api.ts` (with `arrival`, `pinIn` and `verificationRefusal`; `age.ts` importing them, 14.3 item
  6); `network.ts` (`getBytes` with its `Last-Modified`) and `fixtures.ts`; `base.ts`' `heldBy`, its lockfile read
  (E32) and its doc comment (`:24-28`); `releases.ts`' skip and its doc comment (`:7-13`); `trivy.ts`; `check.ts`;
  `index.ts`; `pin-trivy.ts`; the root script after `gitleaks:install`; `release.txt` as `pnpm trivy:pin 0.76.1
  --offline-root` writes it (or the newer release E25 takes), its values checked against 14.4; the rest of
  `trivy.test.ts`, `network.test.ts` and `check.test.ts`. `pnpm actions:check` on the real tree turns red here (the
  offline rule refuses the five trivy-action steps) and first green at commit 4; no unit test runs the checker on the
  real tree (12.10 S2).

**B2: `tools/trivy`'s scripts, the workflows and their tests.** Files: `tools/trivy/{install.sh, db.sh, install.test.ts,
db.test.ts}`, the three workflows, `tools/test/{workflows.test.ts, no-duplicated-versions.test.ts, collection.test.ts}`
and `packages/compliance/src/controls.ts`. B2 writes against this section's form; its commits stack after B1's commit 2,
because `workflows.test.ts` reads the five-key `release.txt`, which only B1's commit 2 writes (at 8a722f80 it has three
keys, `release.txt:5-7`); B2 runs its suites on B1's commits, as the branch paragraph says.
- **Commit 3, red.** `install.test.ts` and `db.test.ts`, which run the scripts by path with stub `curl`, `uname`, `sleep`
  and `trivy` on `PATH` in a temporary directory (`tools/check-toolchain/install-pnpm.test.ts`'s form), each stub
  refusing a `trivy` call without `--config ''` (and, in `db.test.ts`, without `--cache-dir <the argument>`).
  `workflows.test.ts`: the CLI assertions, #107's describe rewritten, #86's rows and write cases. #107's fourth test
  (`:3210-3246`) is not kept as a case of its own: its good install and its wrong-version refusal become I8's, its
  wrong-hash refusal I3's, and its check that the directory holds only `trivy` (`:3234`, with `README.md` in the
  archive) I9's. `no-duplicated-versions.test.ts`' case 9, a guard. `controls.ts:264`'s evidence `trivy image
  --input`, which `controls.test.ts:221-228` then fails to find.
- **Commit 4, green.** `install.sh` (its header as 14.3 item 7 says) and `db.sh` (100755), the three workflows and their
  comments, `scanned()` gaining `tools/trivy/install.sh` and `db.sh` in its `repositoryRoot` list
  (`no-duplicated-versions.test.ts:41`, beside `install-pnpm.sh`), never in the `CI_ROOT` list (`:39-40`): the
  simulated rewrite copies only `CI_FILES` into its `CI_TREE` (`workflows.test.ts:6081, :6115, :6144`), and §8's
  merge-base archive has no `db.sh`; `collection.test.ts`' `testsIn('tools/trivy')`, `controls.ts:261`'s `what` (E14).

**The integrator: commit 5, documents, matrix and synth.**
- ADR 0066: Part 6 between Part 5's end and Part 7 (`:1944-1945`), in Part 5's form (Context, Decision, Measured,
  Alternatives, Notices N33 to N42 as 12.11 G8 words them with 14.8's changes: N33 adds that #107's install is kept and
  extended, with no archive cache, so "downloaded or restored" and "Only `ci.yml` caches it" go (E22); N36 adds, in
  plain words, that the action pins' age rule no longer ages Trivy's `release.txt`, that a patch pin passes by S6's
  branch rule with no per-release off-default-branch exclude, which #107's rule required, and that Trivy's age counts
  the commit's dates, its `verified_at` and its arrival on the branch S6 names (E17); N37 adds that an advisory range
  that does not parse fails the read (E31); N39 names the checksums file as the signed object; Consequences;
  Revisit). The header: Status (`:3-7`, Part 6 listed and the reservation clause dropped), Date (`:37`), Deciders and
  PRD lines in Part 5's form. Part 6 states, without editing them, that it answers Part 2's no-cache text
  (`:406-416`), its pin table's trivy-action row (`:363`), Part 2's Revisit (`:743`), #107's Amendment (the install
  step's `TRIVY_CMD` for trivy-action's entrypoint `:783-786`, the curl's `file:` for the tests' mirror `:787-788`, the
  database `:789-793`, the `file://` mirror test `:802-803`, the age bullet `:822-827`, "every line copied" `:828-829`,
  the follow-up `:830-833`, "Run `trivy` directly" `:838-842`), N32's `TRIVY_CMD` (`:1233`) and Part 5's "Trivy and
  its database" (`:1928`); that the library's SAN rule is a pattern, which the checker anchors; `signed_at`'s
  definition; what the ancestry rule leaves (12.10 S6); and why no archive is cached (E22).
- ADR 0010 `:19, :30` and an appended note naming Part 6 (§5). ADR 0062 `:1393` gains "(superseded by ADR 0066, Part 6:
  Trivy runs as the CLI with `--cache-dir` under `runner.temp`, and the release keeps no cache)".
- ci.md: the `static` row `:26`; the `images` row `:33` (install, database, CLI scans); the "Action pins" bullet
  `:160-179`, with every Trivy refusal and its remedy as 12.11 G3 words them; the `images` triage `:221-228` (a SHA-256
  mismatch never re-run past, re-pin with `pnpm trivy:pin`; a withdrawn release, the download's 404, re-pin; a stale
  database; ghcr or `pkg-containers.githubusercontent.com` unreachable; a JAR; "a CVE is never ignored by file, only
  fixed"); the cache paragraph `:360-372` (no Trivy archive cache, and why, E22; the database from ghcr only and under
  48 hours); the local-run bullet `:507-514` (the tag, branch, checksums and bundle reads; `--offline-root`; `pnpm
  trivy:pin`'s hour past the floor, E25). The value-rule bullet `:550` stays true (its one path entry is still the
  pinned Trivy's directory); ci.md names no `TRIVY_CMD` (grep, about 07:10Z), so the scout's `:550` item needs no edit.
- `dependency-upgrades.md`: a "Trivy" section after "Actions" (`:419`ff: §6's bump, a withdrawn release, no exclude),
  and step 5 (`:148`) gains both push warnings. It must not name either runner file-command variable (14.2).
- reconciliation-001: an entry after `:698`, in P1's form.
- The status file (`/home/user/ops/approval-summaries/lane-b-ci-deps-status.md`) gains, for the founder: "P2 reverses
  #107's de7438c8 for Trivy: the action pins' age rule no longer ages tools/trivy/release.txt; trivy.ts holds it, and a
  Trivy patch release passes by its release-branch rule with no per-release off-default-branch exclude (ADR 0066 Part
  6, N36). Whether that exclude was the founder's is the founder's to say." (E17).
- `test-matrix.md`: the intro (`:311-318`) gains "CI-24 to CI-26 hold the Trivy release to verified bytes, its
  signer, branch and age, and its database to its publisher and 48 hours (Part 6)"; CI-21's row (`:343`) reads "a
  tools/gitleaks release.txt version" in place of "a tools/trivy or tools/gitleaks release.txt version"; CI-24 to CI-26
  after CI-23 (`:345`), as 14.8's rows. `matrix.ts` the same (`:662`, after `:664`). `registry.ts` after CI-23 (`:867`)
  under `// Trivy from verified bytes (docs/adr/0066, Part 6).`, in CI-21's form:
  - `'CI-24': none(0, 'The workflows and tools/trivy/release.txt are read; the install script runs against stub downloads in a temporary directory; no file.', ['tools/trivy/install.test.ts', 'tools/test/workflows.test.ts', 'tools/test/no-duplicated-versions.test.ts', 'tools/check-action-pins/trivy.test.ts'])`;
  - `'CI-25': none(0, "Tags, branches, GitHub's answers and checksums files are synthetic and recorded; the trust root, certificates and bundles are the synthetic ones tools/check-action-pins/testdata/trivy/make.sh made; no file.", ['tools/check-action-pins/trivy.test.ts', 'tools/check-action-pins/check.test.ts', 'tools/check-action-pins/network.test.ts', 'tools/check-action-pins/age.test.ts'])`;
  - `'CI-26': none(0, "The workflows' env is read; the database script runs against a stub trivy; no file.", ['tools/trivy/db.test.ts', 'tools/test/workflows.test.ts', 'tools/check-action-pins/trivy.test.ts'])`.
  `pnpm synth --all` then writes `fixtures/synthetic/CI-24/expected.json` to `CI-26/expected.json` and rewrites
  `CI-21/expected.json`, and changes nothing else.
- `README.md:44-45`: `pnpm trivy:pin X.Y.Z   # pin a Trivy release past the floor, its checksums file's signature and tag
  verified (networked; --offline-root)`, with no version literal.

**The exact case list.** ★ marks a commit-1 or commit-3 case that fails first on behaviour.

`trivy.test.ts`, 63 tests:
- Offline (16): O1 ★ an `aquasecurity/` action in any workflow; O2 ★ a `trivy` step before the install step, and one
  before the database step; O3 ★ a scan whose `if:` lacks either step's success (the worker's `!cancelled() && …` form
  accepted); O4 ★ `TRIVY_DB_REPOSITORY` with `:2`; O5 either repository with a digest, a comma, another registry, or
  absent from a step that runs Trivy; O6 a step that runs Trivy without one of the three switches, each named; O7 any
  `TRIVY_*` variable at the workflow or job level, on a step that runs no Trivy, or other than the five on a Trivy step
  (`TRIVY_IGNOREFILE`, `TRIVY_CACHE_DIR`, `TRIVY_DOWNLOAD_BASE`); O8 ★ a `trivy` command without `--cache-dir
  "$RUNNER_TEMP/trivy"`; O9 ★ a scan or the SBOM without `--config ''` or `--skip-java-db-update`; O10 a scan without
  `--skip-db-update`, `--ignorefile ''`, `--secret-config ''` or `--scanners vuln,secret`, each named; O11 each refused
  flag on any `trivy` command; O12 ★ `trivy` or `tools/trivy/` run with no `release.txt` (and with neither, nothing said
  and nothing read); O13 a `release.txt` missing, repeating or adding a key, or breaking a form; O14 ★ 0.71.1 under
  0.72.0, naming the three advisories; O15 0.69.4, 0.69.5 and 0.69.6 (CVE-2026-33634), and each of v0.69.4's two
  archive digests (Linux-64bit, Linux-ARM64) on either line whatever the version; O16 14.7's exact form passes.
- A changed pin (38): N1 the good pin passes, with exactly its reads (the tag and its peel; `fetchRefs` with
  `release/v0.99` and `v0.99.0`; the checksums file and bundle; on CI the release, the commit's verification, the
  arrival read and the advisories); N2 ★ a tag that names another commit, and one not listed; N3 ★ the SAN
  `…@refs/tags/v0.99.10` with every value right; N4 the SAN `…-rc.1`, another workflow, another issuer; N5 (seven
  tests) each of `.1.11`, `.1.13`, `.1.14`, `.1.15`, `.1.17`, `.1.18`, `.1.20` different; N6 (two) `.1.13` absent,
  `.1.14` absent; N7 a verifier that ignores `oids`, caught by the explicit compare; N8 a leaf under a CA the root does
  not name; N9 ★ `linux_x64` unequal to its signed line; N10 `linux_arm64` unequal, an asset's line absent, an asset's
  line twice; N11 the checksums file one byte off what was signed; N12 two tlog entries, and none; N13 ★ signed 4,319
  minutes before `now` fails, 4,320 passes; N14 `signed_at` unequal to the verified time; N15 a promise-less entry
  timed by its one RFC 3161 time passes, with none or two fails; N16 a `.0` on the default branch passes, off it fails;
  N17 a patch on `release/vX.Y` holding the `.0` passes, a branch lacking the `.0`, a `.0` off the default branch and
  an unlisted branch (named) each fail; N18 on CI, not immutable, a `published_at` under the floor, and a 404 each
  fail; N19 (two tests) on CI, an advisory whose range holds the version fails, a withdrawn one is ignored, every page
  is read; and an unwithdrawn advisory whose range does not parse (null, empty, `< 0.80.0 || >= 1.0.0`, `< 0.80.0+incompatible`)
  fails naming it on a pull request and warns on a push; N20 the control missing GHSA-69fq for 0.69.4, or GHSA-mcj4
  for 0.71.0, fails closed; N21 off CI, the release and advisory reads are skipped with one note; N22 three failed
  reads fail closed naming the host, and three failed trust-root reads name tuf-repo-cdn.sigstore.dev; N23 an unchanged
  `release.txt`, checker and verifier lock read nothing for Trivy (a guard); N24 a change to the checker alone: a
  verdict on the bytes fails, a moved tag or a failed read warns (E5); N25 reads the deadline stopped are one error on
  a pull request and one warning on a push; N26 the two-byte UTF8String encoder round-trips through `ASN1Obj` and
  refuses 128 bytes; N27 `--offline-root` reads the embedded root with no fetch and is refused when `GITHUB_ACTIONS` is
  `true`; N28 on CI, a `.0` whose arrival on the default branch, and a patch whose arrival on `release/vX.Y`, is under
  the floor fails naming the arrival, and a committer date, an author date or a `verified_at` under the floor fails
  the same way; N29 an arrival read that fails, or finds no push, is P1's note and no error; N30 a lockfile change to
  an `@sigstore/*`, `tuf-js` or `@tufjs/*` version reads Trivy as a checker change does, and one to any other package
  reads nothing for Trivy (E32).
- A push (7): P1 an unchanged pin's tag moved or gone warns; P2 the release's 404 warns "withdrawn", not immutable warns;
  P3 a newer release three days old that passes warns naming `pnpm trivy:pin`, two days old says nothing; P4 an `-rc`
  tag is ignored, candidates newest first and at most three; P5 a newer release past the floor that fails a check warns
  naming it, and one with no bundle or a malformed one warns; P6 every read failing gives warnings and no error; P7 a
  changed pin's findings on a push are warnings.
- `pnpm trivy:pin` (2), through the exported function with the synthetic root and recorded reads: K1 it writes exactly
  the five keys `trivy.ts` accepts, in order, under the Part 6 header, and the offline rules pass the file it wrote;
  K2 off CI it refuses a release whose checksums file or bundle was last modified less than the floor plus one hour
  ago, naming the time it can be pinned and that `published_at` is CI's to read, and takes it from that time (E25).

`network.test.ts`, 7: `getBytes` returns a body with a gzip header and invalid UTF-8 unchanged, with its
`Last-Modified`; retries three times, then a `NetworkError` naming the host; refuses a `content-length` over the cap
before reading; aborts a streamed body past the cap; sends no request header; `fetchRefs` fetches a listed branch and
returns an unlisted one as absent, unfetched; an extra tag is listed and fetched with its peeled commit, an unlisted
one absent.

`check.test.ts`, 2: a head with no `release.txt` and no Trivy step reads nothing for Trivy; Trivy's networked check runs
after the age rule under its deadline, and its offline rules join the offline errors. The named-once test
(`:182-187`) changes for `heldBy` and names `pnpm-lock.yaml` once (E32).

`age.test.ts`, 1: A1 ★ a `tools/trivy/release.txt` version new against the base, on a release branch, draws no "not on"
error from the age rule, and its note names `trivy.ts` (the three gitleaks cases are changed, not new; the rest of the
file passes unchanged with `arrival` in `api.ts`).

`install.test.ts`, 7 (I4 and I5 withdrawn with the archive cache, E22; #107's fourth test absorbed into I3, I8 and I9):
I1 ★ `install.sh` and `db.sh` committed 100755 (`git ls-files -s`); I2 no argument, or two, exits 2; I3 a downloaded
archive whose SHA-256 differs fails before extraction naming both digests and installs nothing; I6 ★ curl runs with
exactly `-fsSL --proto '=https' --proto-redir '=https' --tlsv1.2 --retry 3 --max-time 120 -o <file>
https://github.com/aquasecurity/trivy/releases/download/v<v>/<asset>`, and `TRIVY_DOWNLOAD_BASE` set changes nothing;
I7 Linux arm64 takes `linux_arm64`, and macOS or another architecture is refused naming the file; I8 ★ the version is
read with `--version --config ''`: the stub, which answers only that call, lets a matching binary install, and one
that reports another version is refused; I9 the binary arrives by a rename within the directory: the archive's other
files (a `README.md`) are not extracted, so the directory holds only `trivy`; a failed install leaves no `trivy` and
no temporary file there; and a second install replaces the first.

`db.test.ts`, 8, all ★ (the script is absent at commit 3): D1 47 hours passes and writes the four values to the summary;
D2 48 hours and one second fails naming both times; D3 no `repo=` line fails; D4 a line naming
`mirror.gcr.io/aquasec/trivy-db:2`, or another ghcr repository, fails; D5 three failed downloads fail naming ghcr.io and
`pkg-containers.githubusercontent.com`, after pauses of 10 s and 30 s; D6 JSON with no `VulnerabilityDB` fails; D7 both
calls' arguments are exactly `image --download-db-only --config '' --cache-dir <dir>` and `version --format json
--config '' --cache-dir <dir>`, never `--quiet`; D8 no argument exits 2.

`workflows.test.ts`, 3 net (four new, one moved out; W3 withdrawn with the archive cache, E22): W1 ★ the Trivy jobs,
found by their "The pinned Trivy" step (as `trivyJobs` found them by the action, `:3121`), are exactly `ci.yml
images`, `release-dry-run.yml build` and `release.yml build`; in each, the four steps that run Trivy (in `images` the
install, the database step and two scans; in each build the install, the database step, the scan and the SBOM) carry
the five literal variables in their own `env`, and no workflow, no job and no other step sets a `TRIVY_*`; W2 ★ first
asserts the four scan sites (`ci.yml images` twice, `release-dry-run.yml build`, `release.yml build`), so it cannot
pass on none, then every scan gated on both steps; W4 ★ the dry run runs release.yml's scan on both legs; W5 ★ no
`aquasecurity/` action in any workflow, and no line but a comment names trivy-action. Changed, not new: `isScan`
(`:256`, a `run` starting `trivy image` with `--exit-code 1`), `:682-687`, `:925-929`, `:2242-2262`, `:2295-2296`,
`:2863-2869` (the equality drops only the SBOM upload, and `asDryRun` cuts `env`), `:2903-2914`, #107's three remaining
tests (install and database right after the checkout with their ids; five keys; Trivy's curl string apart from
gitleaks', which keeps #107's; the step run with a stub curl writes one path line and no `GITHUB_ENV` line),
`TRIVY_CMD`'s row removed (`:4007-4018`), `trivy-bin`'s row given its own sites, one new fingerprint shared by the
three install steps (word for word the same, `env` included) and the rewritten test's title (`:4020-4027`), and the
write cases (`:4811-4822`, `TRIVY_CMD`'s line dropped). No `BOUNDED_VALUES` row changes: a step's own `env` changes
only that step's fingerprint (`:5252-5258`), and no row cites a step that gains one (E30).

`no-duplicated-versions.test.ts`, 1: case 9, a guard: Trivy's version only in `release.txt`, with `scanned()` gaining the
two scripts, read from `repositoryRoot`, in commit 4.

**The counts.** N = 63 + 7 + 2 + 1 + 7 + 8 + 3 + 1 = **92**. The target is **482 files** (479 plus `trivy.test.ts`,
`install.test.ts` and `db.test.ts`), **10,044 passed and 2 skipped** if the list is built as written; the integrator
records the exact numbers, and the local count equals CI's. The generator and its outputs are outside the count.

**Checks, the draft and the fix round.** On each green commit, the builder's unit suites, `pnpm typecheck` and `pnpm
lint` (B2's on B1's commits, as above). After commit 5 the integrator runs, under the lock: the fast checks of speed
rule 1 (`pnpm typecheck`, `pnpm lint`, `pnpm lint:copy`, `pnpm lint:logs`, `pnpm check:fixtures`, `pnpm synth --all`
with `git diff --exit-code`); the tests the change touches (`pnpm exec vitest run --project unit tools/test
tools/check-action-pins tools/check-toolchain tools/trivy tools/gitleaks packages/compliance packages/synth`); `pnpm
actions:check --offline`; `BASE=origin/claude/build-platform pnpm actions:check --offline-root` (every networked check
but the live TUF root and the API reads, which are CI's); `BASE=origin/claude/build-platform pnpm toolchain:check`;
`pnpm verify-content`. It then pushes the branch through the pre-push hook and opens the draft pull request with
`.github/pull_request_template.md`'s description (the red commits' failing tests, the real tree's `pnpm actions:check`
first green at commit 4, the release chosen), and reads its CI. The two adversarial reviews (CI and test
infrastructure; security and supply chain; speed rule 3) read the draft, each finding checked by a skeptic. The fix
round fixes, runs the full local suite once on its final tree (unit; golden; oracle; `test:db` in shards one after
another; build, stamp, then e2e with `E2E_PREBUILT=1`; the mutation shards `tools/stryker/affected.ts` selects on that
tree, none expected, below), runs `pnpm actions:check` and `pnpm toolchain:check` again, re-checks the Trivy release
(E25), merges the base once (speed rule 2), and makes the single fix-round push; the merge follows rule 2a.

**What the pull request should print on CI** (its draft records the job ids of the first live reads):
- `static`, "Action pins": every pin read ("this change edits tools/check-action-pins"); the age rule's note that
  gitleaks' version is the base's and that `tools/trivy/release.txt` is held by `trivy.ts`; then Trivy: the tag v0.76.1
  names `e713f67f…`; the commit is on `release/v0.76`, which holds v0.76.0's `531360e5`, on `main`; the bundle of
  `trivy_0.76.1_checksums.txt` verifies under the root read from tuf-repo-cdn.sigstore.dev (the first live read) as
  exactly `reusable-release.yaml@refs/tags/v0.76.1` with its issuer and seven values; both archive lines equal; one tlog
  entry at 2026-10-21T11:16:00Z, equal to `signed_at`; the commit's committer and author dates, its `verified_at` and
  its arrival on `release/v0.76`, or P1's note that no push was found (the first live reads), with the youngest time
  read named; the release immutable with `published_at` three days old (the first live read; if it reads false, the
  pull request is red and the session decides, 12.5 item 5); the advisory read with its control and every range parsed
  (the first live read).
- `static`, "Toolchain": the lockfile's new versions, each three days old.
- `images`: "The pinned Trivy" prints `Version: 0.76.1`; the database step's summary names
  `ghcr.io/aquasecurity/trivy-db`, `UpdatedAt` under 48 hours and `DownloadedAt`; the CLI scans; no cache restored; no
  setup-trivy download at "Set up job". Whether 0.76.1 finds HIGH or CRITICAL issues that 0.70.0 did not is not
  verified; if so, `images` is red and the runbook's triage fixes them in the pull request (§10).
- release-dry-run: on both legs the install, `db.sh` on ubuntu-24.04, the scan and the SBOM from the local daemon.
- screening-capacity (root `package.json` and the lockfile are watched, `watched-paths.txt:20, :23`); approval-of-record.
- mutation: the changes job prints `shards: none (no money path changed)` (`affected.ts:941`): the root
  `trivy:pin` script and the five `@sigstore/*` entries are inert (`tools/stryker/manifests.ts:279-288`, `:275`), and
  the lockfile moves no package of any closure (`affected.ts:566-611`, `:745-758`), as the N11 verifier's run of
  `affected()` over the planned change found (08:05:58Z).
- The merge's push run: every finding a warning; the push reads.

### 14.8 Engineering choices

Each is the recommended option under the co-founder's ruling (for security, the safer one), reversible, and recorded
in the pull request.

- **E17. Trivy is held by `trivy.ts`, not the action pins' age rule.** The age rule's default-branch requirement
  (`age.ts:525, :647-660`) refuses every Trivy patch release, since Trivy cuts patches on `release/vX.Y` (12.10 S6;
  v0.76.1 and v0.76.2 are there only). The alternatives: (a) an off-default-branch exclude, which is a Trivy
  release-age exclude and the founder's, not taken; (b) a per-entry branch rule inside `releases.ts` and `age.ts`, which
  would put S6 in P1's rule and age one pin by two rules with two messages; (c) pin v0.76.0, the newest release on
  `main`, which fails T1 and meets the same wall at every patch. Taken: Trivy leaves the age rule, which keeps
  gitleaks. `heldBy` on each `PINNED_RELEASES` entry keeps the base's text read once and the named-once test whole.
  CI-21's row drops "tools/trivy".
  - **What this loosens, in plain words.** At the base a Trivy patch pin passes the age rule only with a per-release
    off-default-branch exclude (`age.ts:651-656`; one exact pin, a 7-day expiry, `age-exceptions.json:2`), and that
    exclude waives the branch rule whole. Under P2 a patch passes with no exclude, by S6's rule: narrower than the base
    with an exclude (the branch must be `release/vX.Y`, holding a `.0` that is on the default branch), but looser than
    the base without one, and S6's own residual says a credential that can push to an existing release branch still
    passes (12.10, S6). So P2 reverses #107's de7438c8 for Trivy. N36 and Part 6 say so, and the status file names it
    for the founder (14.7). Whether that exclude is the founder-kept "Trivy release-age exclude" is disputed: (a)
    above treats it as one, while C7 and 12.5 item 9 define that exclude as one admitting a release under the floor.
  - **What holds the age.** The same floor (`releaseAgeMinutes`), by the youngest of every time `trivy.ts` reads
    (14.3, item 3): the verified signing time, which comes after the commit (v0.76.1: committed 10:20:32Z, signed
    11:16:00Z); the commit's committer and author dates; and, on CI, an immutable release's `published_at` (the time
    GitHub recorded that the age rule also reads, `age.ts:600-613`), the commit's `verified_at` (`age.ts:585-598`),
    and its arrival on the branch S6 names. P1 reads the arrival on the default branch alone (`age.ts:424-470`,
    `:617`; `network.ts:35-36`), so for a `.0` `trivy.ts` keeps P1's signal, and for a patch its read of
    `release/vX.Y` is a signal P1 never had. The web-flow signature's own time is not read: on CI `verified_at` is
    GitHub's record of that signature, and the committer date it signs is counted. `trivy.ts` adds the S6 ancestry,
    the signature, the tag and the advisories.
- **E18. The signed object is the release's checksums file, not the x64 archive.** One signature covers both archive
  lines #107 pins, so `linux_arm64` is verified too; no 52 MB archive is read at pin time, on a changed pin or for a
  push candidate (12.7 E9's cost becomes two reads of about 2 KB and 10 KB each); and it is what #107's Amendment names
  as its follow-up (`:830-833`). The identity is the same workflow, tag and commit (06:58:52Z: both releases verify with
  the seven values; a wrong tag or commit and a changed byte are refused). Run-time bytes are still held by
  `install.sh`'s hash, and the pull request's own `images` and dry run download and hash the x64 archive. So
  `signed_at` is the checksums bundle's time (v0.76.1: 11:16:00Z, not the archive's 11:14:36Z of §3 and 12.3);
  `getBytes` caps a read at 1 MiB with the 30 s limit `get` has (`network.ts:98`), not 128 MiB and 60 s (12.10 N8 keeps
  its form: `content-length` first, then a running count); the generator signs a synthetic checksums file. Its SHA-256
  is not recorded in `release.txt`: it is verified each time it is read, and the two lines it vouches for are.
- **E19. `linux_arm64` stays.** #107's format, `install.sh:20` and `workflows.test.ts:3147-3148` use it, E18 verifies it
  at no cost, and dropping it would break an install on a Linux ARM64 machine for no gain. T2's "the Linux x64
  tarball's SHA-256" reads "each Linux archive's SHA-256".
- **E20. `install.sh` loses `TRIVY_DOWNLOAD_BASE` and `file:` (12.7 E12 kept).** The variable exists only for #107's
  tests (`install.sh:7`, "a mirror"; `workflows.test.ts:3154-3155`, "a file:// mirror is the tests'"), and it sits in
  Trivy's own variable namespace, which T9 closes in the workflows. The tests move to a stub `curl` on `PATH`, as
  `install-pnpm.test.ts` does. The curl is `-fsSL --proto '=https' --proto-redir '=https' --tlsv1.2 --retry 3 --max-time
  120`: four tries then end inside `images`' and the dry run's 20 minutes (`ci.yml:671`, `release-dry-run.yml:70`),
  and 120 s still admits 0.44 MB/s for a 52.7 MB archive. Gitleaks' installer keeps #107's string (P40's remainder),
  so the shared assertion (`workflows.test.ts:3156-3160`) splits per tool.
- **E21. An atomic install.** The binary is extracted in a temporary directory, moved to `<dir>/trivy.$$`, made
  executable, and renamed onto `<dir>/trivy`, as gitleaks' installer does (`tools/gitleaks/install.sh:64-67`); a failed
  version check removes the temporary file.
- **E22. No archive cache (C8 reversed; 12.10 N6 and N10 no longer arise).** `install.sh <dir>` keeps #107's one
  argument and its "keeps no cache" (`install.sh:5-6`): every Trivy job downloads the pinned archive and hashes it
  before `tar`, as #107's does. Weighed against C8's reasons:
  - The surface. `images` restores nothing today (`ci.yml:668-800`), and the pinned actions/cache (`55cc8345`,
    v6.1.0, bundling @actions/cache 6.1.0) extracts with `tar -xf <archive> -P -C $GITHUB_WORKSPACE` and lists the
    entries only in debug mode (its `dist/restore-only/index.js:94082`, `:94507-94510`, read 08:00:03Z). GNU tar 1.35
    with `-P` writes a `../` member outside the directory (the N8 verifier's test, 08:00:27Z). So an entry under the
    predictable key `trivy-v1-<hashFiles>` could rewrite `tools/trivy/install.sh` in the checkout before the step that
    hashes runs, and "safe because the script re-hashes what is restored" (C8) would not hold for it. Only the build
    branch's own runs write that scope (ci.md `:361-362`), and other jobs restore their own caches the same way, so it
    is a new target, not a new capability.
  - The benefit, a cost. C8 keeps pull-request lanes up when the pinned release is withdrawn or the host is down. When
    the release is withdrawn because it is bad, the cache would keep running it on every pull request while a push run
    only warns "withdrawn"; with no cache `images` fails at the download, as the release and the dry run already do,
    and the runbook re-pins.
  - The rest. 52 MB a job is small, and GitHub's release host is already the release's dependency.
  So no cache, the safer option. T3's "restored", the archive directory, the key, the push-only save, its
  `BOUNDED_VALUES` row and the founder's deletion of a bad entry all go.
- **E23. The path write stays in the step; `TRIVY_CMD` goes.** No step left after P2 reads `TRIVY_CMD` (trivy-action
  v0.36.0's `entrypoint.sh:5` did), so its write and #86's row go (`workflows.test.ts:4007-4018`); the `GITHUB_PATH`
  line stays in the step (`trivy-bin`'s row, `:4020-4027`), never in the script, which would join the closed list
  (`:4531-4540`). The scans and `db.sh` run `trivy` from that path. That it is the first `trivy` there holds at today's
  pins and inputs: in the base's push run (job 128329221698, log `:161`, `:269`, `:1099`, `:2593`, read 07:57:24Z) no
  action after the install added a directory but trivy-action, which P2 retires; setup-buildx used the runner's
  buildx and downloaded nothing; actions/cache `55cc8345` defines `addPath` and never calls it. No test reads an
  action's own `addPath` (`workflows.test.ts:3995-3998`), so for a later version of any action it is not verified. No
  check is added for it: a `command -v trivy` check in the database step would cover only the steps before it, while
  setup-buildx and build-push run after it, and an action able to put a `trivy` first on `PATH` can as well replace
  `$RUNNER_TEMP/trivy-bin/trivy` itself, so the guard is the actions' SHA pins and their age rule.
- **E24. The database step's place.** After the install, before setup-buildx, in all three jobs, with `id: trivy-db`; it
  needs no `if:`, since nothing before it but the checkout and the install can fail (E1).
- **E25. The release pinned, and when it moves.** Off CI, `pnpm trivy:pin` reads no API, so it cannot read
  `published_at`, which CI's check (7) counts. Trivy's release tool uploads every asset to a draft and publishes after
  the last upload (14.4), so `published_at` is at least the last asset's `Last-Modified`. `pnpm trivy:pin` therefore
  takes a release only when its checksums bundle's verified signing time is at least the floor old and the later
  `Last-Modified` of its checksums file and bundle (returned by `getBytes` with them) is at least the floor plus one
  hour old, and it notes that `published_at` is CI's to read. The hour covers the other assets' uploads (v0.76.2's took
  23 s, 12:50:01 to 12:50:24), the publish call and CI's 20 to 25 s from a run's creation to "Action pins" (six
  pull-request runs, read 07:53:04Z). So: v0.76.1 before 2026-11-08T13:50:24Z, v0.76.2 from then; CI's own boundary,
  `published_at` plus three days, is not verified here and is not before 12:50:24Z. B1's commit 2 takes the newest
  release it accepts. The fix round runs the same read before its single push and, when a newer release is accepted,
  re-pins in one commit of `release.txt` alone, so the merge's push run does not open with a "newer release" warning.
  Only a person bumps Trivy; the npm packages are left to Dependabot's npm group (E27), each bump re-reading Trivy
  live (E32).
- **E26. CI-11's row is unchanged.** "every Trivy step runs the Trivy whose archive matches tools/trivy/release.txt's
  SHA-256, never setup-trivy's install" stays true; #107's describe is renamed "(CI-11, CI-24; docs/adr/0066, Parts 2
  and 6)".
- **E27. The `@sigstore/*` pins.** Exact, in `devDependencies`, at the newest version of each that is three days old
  when B1's commit 1 is made: before 2026-11-08T00:19:17Z `@sigstore/verify` 4.1.2, `@sigstore/tuf` 5.0.0,
  `@sigstore/bundle` 5.0.0, `@sigstore/protobuf-specs` 0.5.2 and `@sigstore/core` 4.0.1; from then 4.1.3, 5.0.1 and 5.0.1
  for the first three. The repository's gates (`minimumReleaseAge`, `trustPolicy`) hold the transitive versions.
- **E28. The root script's place.** `"trivy:pin": "tsx tools/check-action-pins/pin-trivy.ts"` after
  `"gitleaks:install"` (`package.json:18`), three unchanged lines from #129's line (14.6).
- **E29. What the generator signs.** `make.sh` signs a synthetic `trivy_0.99.1_checksums.txt` (two lines, synthetic
  digests) for each variant of 12.10 B1, plus the variants E18 adds (a line changed, a line missing, a line twice);
  nothing of Aqua's is committed beyond the five values in `release.txt`.
- **E30. The five variables in each Trivy step's own `env`, never the job's.** `workflows.test.ts`' fingerprint hashes
  a run step's env merged over its job's and the workflow's (`:5252-5258`), and a change fails "re-check the bound"
  (`:5379-5381`). A job-level block in release.yml's and the dry run's `build` re-fingerprints the identity and image
  steps and fails 24 `BOUNDED_VALUES` rows (`:5023-5031`, `:5034-5048`; the S1 verifier's run, 07:45:14Z to
  07:45:17Z: exactly 24 problems). A step's own `env` changes only that step, and of the steps that gain one only the
  install step is a row's site (`trivy-bin`, `:4020-4027`), which this plan rewrites anyway. The install step carries
  the five too, since `install.sh` runs `trivy --version --config ''` (`install.sh:56`); whether that call makes the
  update check is not verified. The five lines repeat on four steps a job; that is the price of leaving every other
  row's bound as it stands.
- **E31. An advisory range that does not parse fails the read.** GitHub documents `vulnerable_version_range` as a
  nullable string with no grammar (github/rest-api-description, read 07:49:17Z), and nine Go event values in
  github-reviewed at `7cb4e6a7` fall outside `ghsaRangeHolds`' grammar (07:48Z; for example GHSA-q99m-qcv4-fpm7's
  `11.0.6+security-01`). `ghsaRangeHolds` reads such a constraint as holding nothing (`age.ts:708`, `:719-721`), so a
  judge built on it alone passes the pin. `trivy.ts` parses each range first and fails the read naming the advisory:
  an error on a pull request, a warning on a push (14.3, item 3 (8)). Trivy's five advisories parse today. P1's own use
  (`age.ts:771`, `:777-780`) is not P2's to change: it is P39 (12.8).
- **E32. A verifier bump re-reads Trivy.** `everyPin` follows only changes under `tools/check-action-pins`
  (`base.ts:77-80`), so a Dependabot bump of `@sigstore/*` would verify nothing live (the N10 verifier's run,
  08:03:19Z). `base.ts` names `pnpm-lock.yaml` once among its merge-base reads, and `trivy.ts` compares the locked
  versions of `@sigstore/*`, `tuf-js` and `@tufjs/*` at the base and the head; a difference reads Trivy as a checker
  change does (N24's verdicts), so the bump's own pull request verifies the real pinned release under the new library.
  `everyPin` is unchanged: the action pins' reads do not use the library. P42's Dependabot group (12.8) still stands.

The CI-24 to CI-26 rows, for the matrix and `matrix.ts` word for word:

| ID | Title | Assertion |
|---|---|---|
| CI-24 | Trivy from verified bytes | Every scan and bill of materials runs the Trivy release `tools/trivy/release.txt` names, installed only after its downloaded archive's SHA-256 matched, with no Trivy action in any workflow and its version written nowhere else, reading no configuration or ignore file from the checkout |
| CI-25 | A hijacked or young Trivy release refused | A changed pin needs a `.0`'s commit on the default branch, or a patch's on its release branch holding that `.0`; a Sigstore signature over the release's checksums file from Trivy's release workflow at exactly that tag, commit, repository, owner, runner, trigger and calling workflow under Sigstore's trust root; each committed archive digest equal to its line in that file; one tlog entry; a verified signing time and the commit's dates at least three days old, and on CI its verification time and its arrival on that branch too; and on CI an immutable release three days old that no reviewed advisory names, every advisory's range read; a CVE-2026-33634 version or digest, or a version under 0.72.0, fails; on a push a moved tag, a withdrawn release, a newer three-day-old release, or a newer release past the floor that fails a check warns, and a failed read only warns |
| CI-26 | Trivy's database fresh and from its publisher | Each job downloads the database once, from ghcr.io only and untagged, before any scan, with telemetry and the update check off; a database over 48 hours old, or one from any other repository, fails the job, and the scans update neither database |

### 14.9 In-place edits

Fourteen "(14)" marks in twelve edits in §12, each where a fact is now wrong; each old and new text is in
`/home/user/laneb-sp/p2delta/revise.md`: 12.3's "Release" row, its npm paragraph and its expected-print heading; 12.4's
lead; 12.5 item 11 (ADR 0062, and the mutation shards); 12.6's lead; 12.8's P38, P39, P40 and P26; 12.9's mutation and
P-number items; 12.11 G8's P4 line. Nothing in §1 to §11 or §13 is edited.

The fold of this section's review (§15) adds ten "(14)" marks in ten edits outside §14 (24 in all before §14), each a
pointer where a reader of that line would otherwise miss a change: the header (§14 and §15 named); §1's T2 (E18,
E19), T3 (E22), T4 (E18, E19 and the youngest time) and T8 (E30); §7's C8 (E22); §10's withdrawn-release row and its
bad-cache row (E22); 12.8's P39 (the number reused, E31); and 12.9's mutation item (none predicted). Each edit only
adds its "(14)" text and leaves the old text in place; §15 names each edit's finding.

**Not verified here:** the release's `immutable` and `published_at` (CI's; v0.76.2's is 12:50:24Z or later, E25), and
the live advisory, TUF, `verified_at` and arrival reads (CI's, as in 12.9); whether 0.76.1 finds issues 0.70.0 did
not; whether `trivy --version` makes the update check (E30); whether a later version of any action in the three jobs
puts a directory before the pinned Trivy's (E23); ghcr's anonymous limits under our load.

## 15. Review of the delta (2026-11-07)

**Totals:** 19 findings (5 S, 14 N), each checked by a skeptic: 17 fixed (S1, S3, S4, S5; N1 to N8, N10 to N14), 2 not
taken, refuted (S2, N9); the case count moves from 89 to 92 (`trivy.test.ts` +6, `install.test.ts` −2,
`workflows.test.ts` −1), so the target is 10,044 passed and 2 skipped.

| Finding | Disposition |
|---|---|
| S1 (S) 14.7's job `env` re-fingerprints 24 `BOUNDED_VALUES` rows, so commit 4 is red | **Fixed.** The five variables sit in the own `env` of every step that runs Trivy (the install, the database step, the scans and the SBOM), never a job's or a workflow's; O5 to O7 and W1 read step `env`; no `BOUNDED_VALUES` row changes (14.3 items 4 and 9; 14.7; E30). The verifier's run with job `env` gave exactly 24 "re-check the bound" problems (07:45:14Z to 07:45:17Z). The install step carries them too, since `install.sh:56` runs `trivy --version`, whose update check is not verified |
| S3 (S) E17's "Nothing is loosened" is wrong | **Fixed, with the skeptic's corrections.** E17 now says what is loosened: a patch pin passes by S6's branch rule with no per-release off-default-branch exclude, which #107's de7438c8 required (`age.ts:651-656`), so P2 reverses de7438c8 for Trivy; N36 and Part 6 say so, and the integrator puts a line in the status file for the founder (14.7). Whether that exclude is the founder-kept one is recorded as disputed. The youngest time now counts the commit's committer and author dates and, on CI, `verified_at` and the arrival on the branch S6 names: P1's default-branch read kept for a `.0`, and `release/vX.Y` read for a patch as a signal P1 never had (its read names only the default branch, `age.ts:424-470`, `:617`). `arrival`, `pinIn` and `verificationRefusal` move to `api.ts` (14.3 items 3 and 6). +2 tests (N28, N29) |
| S4 (S) A range `ghsaRangeHolds` cannot parse reads as not holding, so the pin passes | **Fixed.** `trivy.ts` parses each unwithdrawn advisory's range strictly first; one that does not parse, null and empty included, fails the read naming the advisory, an error on a pull request and a warning on a push (14.3 item 3 (8); E31). N19 gains a second test (+1). P1's own use (`age.ts:771`, `:777-780`) is recorded as P39, the number its moot #86 text left free (12.8; 14.5). The skeptic's side note is taken: GHSA-xcq4-m2r3-cmrj (2024, fixed 0.51.2) joins 14.4, with no effect on the floor |
| S5 (S) v0.76.2's boundary uses `signed_at` alone, while CI also counts `published_at` | **Fixed, with the skeptic's corrections.** `pnpm trivy:pin`, which reads no API, takes a release only when `signed_at` is past the floor and the later `Last-Modified` of its checksums file and bundle (returned by `getBytes`) is past the floor plus one hour; the hour covers the remaining uploads, the publish call after them (goreleaser `d76fb400`, read by the verifier) and CI's 20 to 25 s to "Action pins". 14.4 says v0.76.2 cannot pass CI before 2026-11-08T12:50:24Z, CI's own `published_at` boundary not verified, and `pnpm trivy:pin` takes it from 13:50:24Z; E25 uses that. K2 (+1) |
| N1 (N) W2, and W1 by scans, pass on none at commit 3 | **Fixed.** W1 finds the Trivy jobs by "The pinned Trivy" step and asserts exactly the three; W2 first asserts the four scan sites; both fail at commit 3 (the verifier's vitest run, about 07:52:02Z) |
| N2 (N) Which I-case #107's fourth test becomes is unsaid | **Fixed.** It is not a case of its own: its good install and wrong-version refusal are I8's, its wrong hash I3's, and its "only `trivy` extracted" check (`workflows.test.ts:3234`, the skeptic's side gap) I9's (14.7, commit 3) |
| N3 (N) Case 9 must read the scripts from `repositoryRoot` | **Fixed.** `scanned()` gains both scripts in its `repositoryRoot` list (`no-duplicated-versions.test.ts:41`), never the `CI_ROOT` list; the verifier's copy run threw ENOENT from `CI_ROOT` (07:54:53Z) |
| N4 (N) Part 6's list omits ADR 0066 `:783-788` | **Fixed.** The list adds `:783-786` (`TRIVY_CMD` for trivy-action), `:787-788` (`file:`) and, from the skeptic's side note, `:802-803` (the `file://` mirror test). With no archive cache, `:783`'s "word for word the same" holds again |
| N5 (N) E23's "first entry on `PATH`" rests on unread action code | **Fixed.** E23 says it holds at today's pins and inputs (job 128329221698's log, read 07:57:24Z) and is not verified for a later action version, and no longer says no trivy-action reads `TRIVY_CMD`. The optional `command -v` check is not taken: in the database step it would cover only the steps before it, while setup-buildx and build-push come after, and an action able to shadow `trivy` can replace the binary itself |
| N6 (N) T2 and T4 have no "(14)" pointer | **Fixed.** "(14)" pointers on T2 and T4, and also on the header, T3, T8, C8 and two rows of §10, which the other fixes change (14.9) |
| N7 (N) No test for `pin-trivy.ts`, which writes the source of record | **Fixed.** K1: it writes exactly the five keys under the Part 6 header, and the offline rules accept the file (+1) |
| N8 (N) The archive cache's restore extracts with `tar -P` into `images` | **Fixed, by dropping the cache** (E22; C8 reversed). Weighed against C8's reason: the restore could rewrite `install.sh` before it hashes, and a cache would keep running a release withdrawn because it is bad while a push only warns. No cache is the safer option and keeps #107's "keeps no cache". W3, I4, I5, the archive directory, the cache key's row and the founder's deletion of a bad entry go (−3 tests) |
| N10 (N) A `@sigstore/*` bump re-runs no live verification | **Fixed, the optional taken.** A change to the locked version of any `@sigstore/*`, `tuf-js` or `@tufjs/*` package reads Trivy as a checker change does (E32; 14.3 items 3 and 6). N30 (+1); N23 widened |
| N11 (N) Which mutation shards run can be predicted | **Fixed.** None: the changes job prints "shards: none (no money path changed)", with `trivy:pin` and the five `@sigstore/*` entries inert and the lockfile moving no closure's package, as the verifier's `affected()` run found (08:05:58Z) (14.7; 12.9) |
| N12 (N) B2 cannot be green alone | **Fixed.** B2 runs its suites on B1's commits 1 and 2, cherry-picked under its own, and the integrator re-runs them at commit 4 on the stacked branch (14.7) |
| N13 (N) Comments P2 makes false are in no builder's list | **Fixed for three of four.** B1's commit 2 rewords `base.ts:24-28` and `releases.ts:7-13`; B2's commit 4 rewrites `install.sh`'s header (`:7-8`'s `TRIVY_DOWNLOAD_BASE` goes; `:5-6`'s "keeps no cache" stays true). `release.txt`'s header was already `pnpm trivy:pin`'s (the skeptic refuted that part); §3's "the one archive" becomes the two Linux archives (14.3 items 1, 2 and 7) |
| N14 (N) `HIJACKED` refuses only v0.69.4's x64 digest | **Fixed.** It also refuses the ARM64 digest `e401ae1e6d2442fa9a0c79dc0f3b0457ecfebf74a9c0a920159c49437f663aef` from GHSA-69fq, on either line (14.3 item 4; O15; 14.4) |
| S2 (S) E27 leaves `@sigstore/verify` 4.1.3's tlog hardening to Dependabot | **Not taken, refuted.** 4.1.3 hardens only thresholds of two or more (upstream 2af33f8's tests all use `tlogThreshold: 2`), while P2 uses the defaults and requires exactly one tlog entry (12.10; 14.3 item 3 (5); N12), so the promise-less path proves the same under 4.1.2; E27 already takes 4.1.3, 5.0.1 and 5.0.1 from 2026-11-08; no advisory names the pinned versions (npm, 07:45:23Z). The 16 s by which E27's cutoff precedes `@sigstore/bundle` 5.0.1's three days (00:19:33.074Z) is real but loud, since `minimumReleaseAge` refuses an under-age exact pin at install (`pnpm-workspace.yaml:44-45`); left as E27 has it |
| N9 (N) A ghcr-only database loses Trivy's fallback | **Not taken, refuted.** The design already states the trade and its remedy: C3 ("a ghcr outage or rate limit turns `images` and the release's `build` red until a re-run"), §10's ghcr row, §5's ci.md triage ("re-run; never add a mirror"), N34, 14.3 item 8 and 14.7's triage. Trivy falls back only on 408, 429, 5xx or BLOB_UNKNOWN anyway (`pkg/oci/artifact.go:287-340` at `e713f67f`) |
