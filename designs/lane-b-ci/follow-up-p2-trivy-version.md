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
in 12.2, and §12 governs where it and §1 to §11 differ. The network facts were read on
2026-10-26 between 01:40 and 02:55 UTC with `git ls-remote`, `curl` against github.com release downloads,
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
| T2 | One source of record: `tools/trivy/release.txt` holds the version, the tag's commit, the signing time and the Linux x64 tarball's SHA-256. No workflow, Dockerfile, README or CLAUDE.md line repeats the version | `no-duplicated-versions.test.ts` |
| T3 | The installed bytes equal the committed SHA-256 before anything runs them, whether downloaded or restored from cache. A mismatch fails the job, naming both digests | `tools/trivy/install.test.ts`, which runs the script against stub downloads |
| T4 | A pull request that changes `release.txt` (or the checker) proves five things: the tag still names the recorded commit; the tarball's Sigstore bundle verifies, against Sigstore's trust root, as signed by trivy's own release workflow at that tag and commit; the signed digest equals the committed SHA-256 and the release's `checksums.txt` line; the release was signed at least three days ago; the version is not one CVE-2026-33634 names. (12) Also: the commit is on `release/v<X.Y>` or the default branch; the certificate's repository and owner IDs are Trivy's; the version is at least 0.72.0 and, on CI, no reviewed advisory names it; on CI the release is immutable and its `published_at` three days old (12.5) | `pnpm actions:check` in `static`; `tools/check-action-pins/trivy.test.ts` |
| T5 | On every push run, warnings and never a failure: (12) the pinned release withdrawn (deleted, the expected case) or not immutable, or its tag moved (rare under an immutable release), or an advisory now naming it; a newer release that passes every check is at least three days old; any of those reads failed | the same, push mode |
| T6 | No `aquasecurity/*` action runs in any workflow (trivy-action and setup-trivy retired, §7 C1) | `workflows.test.ts` |
| T7 | The vulnerability database is downloaded once per job, from the publisher's registry (ghcr.io) only, before any scan; it is under 48 hours old; its repository, `UpdatedAt` and `DownloadedAt` are printed in the job summary; the scans read that database and update nothing | `tools/trivy/db.sh`; the summary; `workflows.test.ts` |
| T8 | Telemetry and Trivy's update check are off in every run | `workflows.test.ts` (the env on every job that runs Trivy) |

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
  release pipeline from an attacker-pushed tag on `1885610c`, on no branch; immutable releases were on for trivy from
  2026-03-03 and for trivy-action from 2026-03-04 (12.3). Part 6 cites it. What I checked today:
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
    today, but its repository is set the same way so a future JAR cannot pull from the mirror.
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
  # pnpm trivy:pin, never by hand: the tag's commit, the signing time from its Rekor entry, and the SHA-256 of the one
  # archive CI downloads. A new version changes every line here in one pull request.
  version 0.76.1
  commit e713f67f7d54decdcd9b3132c9751833dcced698
  signed_at 2026-10-21T11:14:36Z
  linux_x64 c7cbe3137fb8a48a17574bede3dd6beb16742d1e9772929940fc90082c39d9c0
  ```
  The tag is `v<version>`; the asset name (`trivy_<version>_Linux-64bit.tar.gz`) and the URL are derived, never written.
- **`tools/trivy/install.sh <dir>`** (new; `set -euo pipefail`; mirrors `tools/gitleaks/install.sh` line for line where
  it can, reading the file with `awk`, so no `jq`):
  - Linux x86_64 only; anything else fails "trivy: `<file>` pins no release for `<os> <arch>`". Trivy runs only in CI.
  - The archive is looked for in `${TRIVY_ARCHIVE_DIR:-$dir}`; when absent it is downloaded from
    `https://github.com/aquasecurity/trivy/releases/download/v<version>/<asset>` with `curl -fsSL --proto '=https'
    --tlsv1.2 --retry 3 --max-time 300`. That is GitHub's release host, not get.trivy.dev.
  - It hashes the archive **every time, restored or downloaded**, and refuses a mismatch with gitleaks' message shape
    naming both digests; only then extracts `trivy` alone into `<dir>` and moves it into place atomically.
  - It requires `trivy --version`'s `Version:` line to equal `version` (the file holds no `v`; the comparison is
    literal, `Version: 0.76.1`), appends `<dir>` to `GITHUB_PATH`, and prints the binary's path.
- **`tools/trivy/db.sh`** (new): run once per job, before any scan.
  - `trivy image --download-db-only` with the job's env, tried three times with a 10 s and a 30 s pause; stderr is kept.
    It fails, naming `ghcr.io` (12) and `pkg-containers.githubusercontent.com`, which serves ghcr's blobs, after the
    third.
  - It reads the `Artifact successfully downloaded repo=…` line and fails if it is absent or names any repository but
    `ghcr.io/aquasecurity/trivy-db`.
  - It reads `trivy version --format json` with `jq -r` (jq 1.7.1 on ubuntu-24.04 and 1.8.1 on 26.04 both read this),
    and fails when `VulnerabilityDB.UpdatedAt` is over 48 hours old, which guards against a stale or replayed database.
  - It writes the version, the repository, `UpdatedAt` and `DownloadedAt` to `GITHUB_STEP_SUMMARY`.
- **Every scan runs the CLI.** In `ci.yml` `images`, `release.yml` `build` and `release-dry-run.yml` `build`, (12)
  every trivy-action step is replaced:
  1. `Install Trivy (tools/trivy/release.txt, its SHA-256 checked)`: `run: tools/trivy/install.sh
     "$RUNNER_TEMP/trivy-bin"`. In `ci.yml` only, an `actions/cache/restore` (`55cc834…`, v6.1.0, already pinned at
     (12) `ci.yml:147`) before it and an `actions/cache/save` after it keep the archive under
     `$RUNNER_TEMP/trivy-archive`, (12) keyed `trivy-v1-${{ hashFiles('tools/trivy/release.txt') }}` and saved on a
     push only, in the `APT_SAVE_IF` form (12.7, E11). The script re-hashes what
     is restored, so a cache can only save a download, never change the bytes. release.yml and the dry run keep no cache
     (`ci-deps:release.yml:21-27`).
  2. `The vulnerability database (ghcr.io, under 48 hours)`: `run: tools/trivy/db.sh`.
  3. The scans, as `run:` steps with today's flags plus `--skip-db-update`, so each verdict uses exactly the checked
     database: (12) `trivy image --cache-dir "$RUNNER_TEMP/trivy" --skip-db-update --severity HIGH,CRITICAL
     --ignore-unfixed --exit-code 1 --format table`. The SBOM is `--format spdx-json --output sbom-….spdx.json
     --exit-code 0`. The image source is not changed:
     - in `ci.yml` `images`, ci-browser's archive: `--input "$RUNNER_TEMP/image/<name>.tar"`, where §3.3.1
       (`lane-b-ci.md:2108-2112`) puts trivy-action's `input:`;
     - in `release.yml` and the dry run's `build`, which stay on `RELEASE_RUNNER.label` (ubuntu-24.04, the classic
       store, `lane-b-ci.md:2009-2011`) and keep `image-ref` (`ci-deps:release.yml:94, 105`): the tag, passed through
       `env: IMAGE_REF: ${{ steps.image.outputs.ref }}` as `"$IMAGE_REF"`, with `--image-src docker` so Trivy reads
       the local daemon and never falls back to a remote pull.

  Job-level `env` on each of those jobs, (12) literals only, since a job's `env` cannot read `runner`:
  - (12) no `TRIVY_CACHE_DIR`: every `trivy` command passes `--cache-dir "$RUNNER_TEMP/trivy"` (outside the checkout, as
    today), and `db.sh` takes that directory as its argument (12.7, E2);
  - `TRIVY_DB_REPOSITORY: ghcr.io/aquasecurity/trivy-db` and `TRIVY_JAVA_DB_REPOSITORY:
    ghcr.io/aquasecurity/trivy-java-db`, **untagged**, so Trivy appends its own schema version and a bump to a new
    schema needs no workflow edit; one repository each, no mirror (C3);
  - `TRIVY_DISABLE_TELEMETRY: "true"`, `TRIVY_SKIP_VERSION_CHECK: "true"` and `TRIVY_NO_PROGRESS: "true"`.

  (12) The worker's `if:` conditions stay as they are (`ci.yml:708, :719`). The install and database steps come right
  after the checkout in every job, before the builder, so they precede every scan and need no `if:` (12.7, E1).
- **`release-dry-run.yml`** `build` (12) already runs release.yml's SBOM step on its web and worker legs
  (`release-dry-run.yml:129-143`), and its equality rule makes it release.yml's `build` less the scan and the SBOM
  upload (`workflows.test.ts:2324-2349`). It gains the install and database steps on both legs and, by 12.5 item 10,
  keeps the scan too, so the equality rule drops only the SBOM upload. Only a tag runs release.yml, so without them the
  new install would first run on the founder's tag. Its path filters (`:19-30`, `:32-43`, and `PATHS` at
  `workflows.test.ts:2258-2268`) gain `tools/trivy/**`. The header (`:3-15`) and the build comment (`:59-62`, "with no
  scan") are reworded.
- **`network.ts`** gains `getBytes(url, signal?): Promise<{ status: number; body: Uint8Array }>` on `Transport`,
  (12) `gitTransport` (`network.ts:109`) and `recordedTransport` (`fixtures.ts:46`): `arrayBuffer()`, no request header,
  (12) a 60 s limit per read under the shared 180 s deadline (12.5, item 6), and a 128 MiB cap that fails naming the
  URL. The same three tries (`withRetries`, `:338-371`) and `NetworkError`. (12) `fetchRefs` takes an optional list of
  branches for the ancestry check (12.7, E6).
- **`base.ts`** (12) `baseState` (`base.ts:45-73`) also returns the base's `tools/trivy/release.txt`, its path named
  once (`:14-23`). The Trivy rule's trigger is that text differing or absent (the pin is new), a change to
  `tools/check-action-pins` (`everyPin`, `:67-69`), or no base. Faults are sorted by kind (12.7, E5).
- **`tools/check-action-pins/trivy.ts`** (new), called from `check.ts`: (12) its offline rules join the errors at
  `check.ts:122-129`, and its networked check runs after the age rule (`:233-253`) under the shared deadline. (12) 12.5
  adds the checks (6) the ancestry, (7) the release's `immutable` and `published_at`, and (8) the advisory read, and
  changes (3), (5) and the push reads; where they differ, §12 governs:
  - **Offline, every run:**
    - `release.txt` parses (four keys, the forms above, nothing else);
    - `version` is not in `HIJACKED = { trivy: ['0.69.4', '0.69.5', '0.69.6'] }`, each with CVE-2026-33634 and its
      date beside it (12) (0.69.5 and 0.69.6 Docker Hub images only); `linux_x64` is not v0.69.4's archive digest
      `385d498d…09f6`; and the version is at least (12) 0.72.0 (GHSA-q3fv, GHSA-mcj4, GHSA-8rc5);
    - no workflow `uses:` an `aquasecurity/` action;
    - in every job, every step whose `run` invokes `trivy ` is preceded by the install and database steps, and every
      `trivy image` other than `--download-db-only` carries `--skip-db-update`;
    - the env above is set on every job that runs Trivy, and no `TRIVY_*_REPOSITORY` carries a tag, a digest or a
      second repository.
  - **Networked, when the trigger holds** (each read through the transport, three tries, failing closed naming the
    host):
    - (1) `git ls-remote https://github.com/aquasecurity/trivy refs/tags/v<v> refs/tags/v<v>^{}` gives `commit`;
    - (2) `getBytes` of `…tar.gz.sigstore.json` and the tarball. The bundle is verified with `@sigstore/verify`'s
      `Verifier` over `toTrustMaterial(trustedRoot)` and `toSignedEntity(bundle, data)`, with policy
      `{ subjectAlternativeName: 'https://github.com/aquasecurity/trivy/.github/workflows/reusable-release.yaml@refs/tags/v<v>',
      extensions: { issuer: 'https://token.actions.githubusercontent.com' } }`. The trusted root is **injected**: in
      production, `@sigstore/tuf`'s `getTrustedRoot` from `tuf-repo-cdn.sigstore.dev`, wrapped in the same three tries
      and a `NetworkError` naming that host (the library's own fetch has a 5 s limit and, on failure,
      `TUF_REFRESH_METADATA_ERROR` without a host); in tests, a synthetic `TrustedRoot` whose CA, CT log and Rekor
      keys the test signer holds;
    - (3) (12) the policy's `oids` carry `1.3.6.1.4.1.57264.1.13` (source commit) = `commit`, `.1.14` (source ref) =
      `refs/tags/v<v>`, `.1.15` (repository ID) = 180687624 and `.1.17` (owner ID) = 12783832, DER UTF8Strings (`0c 28
      …`) encoded by `der.ts`, so the library refuses a mismatch; then the same four are compared again from the
      verified signer's `identity.oids`, decoded by `der.ts`; a missing extension fails;
    - (4) the signed digest equals `linux_x64` and the line for the asset in `trivy_<v>_checksums.txt`;
    - (5) exactly one verified tlog entry; its `integratedTime` equals `signed_at` and is at least the floor before now.
      The floor is `releaseAgeMinutes(workspace)` from P1's `tools/check-toolchain/exclude-window.ts` (12) (`:29-32`;
      `follow-up-p1-pin-age.md:244-249`), 4,320 minutes today (`policy.ts:11`), passed in as `checkActionPins`'
      `floor` (`check.ts:220`).
  - **Push runs** (`GITHUB_EVENT_NAME=push`). Every read below turns any failure, a 404 or a malformed answer into a
    (12) warning under the step's "Action pins" title, starting `trivy ` (12.7, E7), naming the host and the version,
    and never a failure, as the push re-reads do (`check.ts:258-295`):
    - it re-reads (1) and warns if the tag moved or vanished (the committed hash still runs what was verified);
    - (12) it reads the pinned release with the job's token and warns on a 404 (withdrawn) or a release not immutable,
      so a withdrawn release is seen before a pull request hits it (§10; 12.7, E10);
    - it lists the tags, ignores any that is not a stable `vX.Y.Z`, and (12) for the newer ones, newest first and at
      most three, runs every check of a pin and warns when one passes, naming it and `pnpm trivy:pin` (12.7, E9). Same
      form as the builder's newer-release warning (`buildkit.ts:110-117`).
- **`pnpm trivy:pin <X.Y.Z>`** (new root script, `tsx tools/check-action-pins/pin-trivy.ts`). It runs (1) to (5) (12)
  and (6) for that version (12) ((7) and (8) are CI's: the pull request's `static` runs them) and writes `release.txt`,
  so nobody copies a hash by hand. It refuses a version that fails any of them. It is the bump procedure (§6).
  `--offline-root` verifies against `@sigstore/tuf`'s embedded `seeds.json` instead of a live TUF refresh, for a machine
  whose proxy refuses TUF (§9); CI never passes it.
- **`tools/package.json`** gains, (12) as `devDependencies`, `@sigstore/verify` 4.1.2, `@sigstore/tuf` 5.0.0,
  `@sigstore/bundle` 5.0.0 and `@sigstore/protobuf-specs` 0.5.2, exact (12.3; as production dependencies they would turn
  `pnpm audit --prod`, `ci.yml:77`, red on GHSA-g3hv-75wg-m249; the builder records the transitive versions pnpm
  resolves, and the release-age check holds them). Not `sigstore` itself, whose tree adds `@sigstore/sign` and the OIDC
  code (52 packages, `npm ls --all`). One user, so no catalog line. `pnpm-lock.yaml` is re-resolved with `pnpm install
  --lockfile-only`.
- **No Dockerfile, compose, Dependabot, engine, ledger or content-pipeline change.** `publish-content.yml` is untouched
  (F4).

## 4. Files

- `.github/workflows/ci.yml` (`images`), `.github/workflows/release.yml` (`build`) and
  `.github/workflows/release-dry-run.yml` (`build` and the paths).
- `tools/trivy/release.txt`, `install.sh`, `db.sh`, `install.test.ts` and `db.test.ts` (new).
- `tools/check-action-pins/trivy.ts`, `trivy.test.ts`, `pin-trivy.ts`, `der.ts` and `der.test.ts` (new). `check.ts` and
  `index.ts` (one call and its notes; (12) `--offline-root`); `network.ts` and `network.test.ts` (`getBytes`, (12)
  `fetchRefs`' branches); `base.ts` and (12) `check.test.ts` (the base's `release.txt`, named once); `fixtures.ts`
  gains the synthetic trust root and signer. (12) Also `packages/compliance/src/controls.ts` (`:261`, `:264`) and
  `README.md` (`:44-45`).
- `tools/test/workflows.test.ts`:
  - `isScan` (`ci-deps:176`) matches a `run` starting `trivy image` with `--exit-code 1`;
  - the `images` assertions (`ci-deps:1213-1237`) and the release build's scan-and-SBOM test (`:450`) hold the CLI
    form, `--input` in `images`, `"$IMAGE_REF"` with `--image-src docker` in the release builds, `--skip-db-update`,
    the database step first, and the env (untagged, ghcr-only repositories);
  - release.yml's no-cache rule (`ci-deps:571-575`) replaces its trivy-action lines with "no `aquasecurity/` action;
    (12) every `trivy` command with `--cache-dir "$RUNNER_TEMP/trivy"`; no `actions/cache`";
  - the dry-run equality rule (`ci-deps:1306-1345`) covers the install, database, scan and SBOM steps.
- `tools/test/no-duplicated-versions.test.ts`: (12) a ninth case (eight exist, `:71-124`). Trivy's version appears
  only in `release.txt`, scanned over its files (`scanned()`, `:35-43`, gaining `tools/trivy/install.sh` and `db.sh`)
  and the header list (`:9-29`).
- `tools/test/collection.test.ts`: `...testsIn('tools/trivy')` beside `tools/ci` (`ci-deps:41-43`).
- `package.json` (the `trivy:pin` script), `tools/package.json` and `pnpm-lock.yaml`.
- Documents: §5. Matrix and synth: `docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts` and
  `registry.ts` (§8).

## 5. Documents

- **ADR 0066, Part 6** (new, after Part 5). Context: §2's facts. Decision: §3. Alternatives: §7. Revisit when: a
  signed database exists (then verify it); (12) GitHub's release attestation, or `gh attestation verify`, adds an
  identity check the bundle lacks (Trivy's releases are immutable since 2026-03-03, and Part 6 reads `immutable` and
  `published_at`; 12.5, item 5); ghcr's anonymous limits turn `images` red (C3); gitleaks gains
  the same tag, signature and age check (below). Part 2's "Revisit when" line ("a newer trivy is wanted than
  trivy-action's default (a `version:` pin and its check)", (12) `docs/adr/0066-…md:727`) is answered by Part 6's
  cross-reference. Its text stays. (12) Part 6 also answers Part 5's `:1666` and Part 2's `:397-400`, adds its lines
  to the header (`:3-60`), and says it supersedes ADR 0062's `:1376` bullet without editing 0062 (12.1, F11).
- **ADR 0010** (`6ddd587:docs/adr/0010-supply-chain-gates-beside-ci.md:19, 30`): "scans with Trivy" becomes "with the
  Trivy release `tools/trivy/release.txt` names, its SHA-256 checked"; `:30`, where the SBOM is "kept as a run
  artifact", gains "made by that binary". An appended note names Part 6.
- **`docs/runbooks/ci.md`**:
  - the `images` row (`:33`) and (12) the triage bullet (`:148-149`, after #86's text) gain three failures, each with
    its remedy: a SHA-256 mismatch, which you never bypass (re-run `pnpm trivy:pin` and read the diff); a stale database
    (re-run; if it persists, read ghcr's created time); ghcr (12) or `pkg-containers.githubusercontent.com` unreachable
    after three tries (re-run; never add a mirror);
  - the cache paragraph ((12) `:271-273`) gains: the database from ghcr only, the 48-hour floor, the archive cache (12)
    keyed by `release.txt`'s hash and saved by push runs only, in `ci.yml` only.
- **`docs/runbooks/dependency-upgrades.md`** (ci-deps' runbook): a "Trivy" section (§6), including a withdrawn release,
  (12) after "Actions" (`:325-374`), and Trivy's push warning in the weekly triage's step 5 (`:95-98`).
- **reconciliation-001**: (12) an entry in P1's form (`reconciliation-001.md:659-661`), appended after #86's: under the
  co-founder's ruling of 2026-10-26, the follow-up P2 is taken (`co-001/ci-trivy-version`, `docs/adr/0066`, Part 6),
  what it holds, test matrix CI-24 to CI-26, not an exception to a check above. Its supply-chain check names Trivy
  scans, which still run.

## 6. Who bumps it, and how a newer Trivy surfaces

Dependabot cannot, and Renovate is not used. A person bumps it at the weekly triage, which already reads
`check-toolchain`'s pnpm warning and Dependabot's runs (§3.2.1):
1. A push run's `static` log, and the run summary's annotations, carry (12) `::warning title=Action pins::trivy vX.Y.Z
   (signed <time>) is newer than tools/trivy/release.txt's A.B.C and at least three days old; run pnpm trivy:pin X.Y.Z`.
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
- **C8. The archive is cached in `ci.yml` only, (12) keyed by `release.txt`'s hash and saved by the build branch's
  push runs alone.** It keeps pull-request lanes up through a release-host outage and saves 52 MB a job, and it is safe
  because the script re-hashes what is restored; (12) a pull request never writes the cache (12.7, E11). The release
  workflows stay cache-free by ci-deps' rule.

## 8. Tests (failing first) and the test-matrix rows

Failing first, run on the merge base with the new tests: `CI_TREE=<git archive of the merge base>` plus `pnpm vitest
run tools/test/workflows.test.ts tools/test/no-duplicated-versions.test.ts tools/check-action-pins tools/trivy` (12)
`packages/compliance/src/controls.test.ts`. The new assertions fail on (12) five trivy-action steps, on no
`release.txt` and on no install step; 12.6 orders the commits. Every networked case uses
recorded synthetic `ls-remote` lines, a synthetic `TrustedRoot` and a test-only signer holding its Fulcio CA, CT log
and Rekor keys (so a bundle's `integratedTime` is set by the test), and stub downloads. Nothing from Aqua's real release
is committed beyond the four values in `release.txt`.

- `tools/check-action-pins/trivy.test.ts`:
  - a moved tag on a changed pin fails, and on a push it warns;
  - a bundle signed by another workflow, ref or issuer fails; a certificate whose .1.13 differs from the tag's commit,
    whose .1.14 differs from the tag, or which lacks either, fails;
  - a bundle signed under a root other than the injected one fails;
  - a digest that differs from `linux_x64` or from `checksums.txt` fails;
  - a release signed 4,319 minutes ago fails and one signed 4,320 minutes ago passes; a bundle with no tlog entry, or
    two, fails; an `integratedTime` that differs from `signed_at` fails;
  - 0.69.4 fails as hijacked, (12) 0.71.1 fails as older than 0.72.0, and v0.69.4's archive digest fails whatever the
    version; (12) 12.6 lists the cases 12.5 adds;
  - an `aquasecurity/trivy-action` step anywhere fails; a scan with no install or database step before it fails; a
    scan without `--skip-db-update` fails; a `TRIVY_DB_REPOSITORY` with `:2`, a digest or a comma fails;
  - an unchanged `release.txt` and checker read nothing from the network;
  - three failed reads of any host fail closed, naming it; three failed trust-root reads fail naming
    `tuf-repo-cdn.sigstore.dev`;
  - push mode: a newer release three days old warns, and one two days old does not; an `-rc` tag is ignored; a newer
    tag with no bundle or a malformed one gives no error; a pinned asset returning 404 warns; every read failing gives
    warnings only and exit 0.
- `tools/check-action-pins/der.test.ts`: the UTF8String decode on the real certificate's bytes (copied as hex, no
  Aqua file committed) and on malformed lengths.
- `network.test.ts`: `getBytes` returns the bytes unchanged (a gzip header survives), retries three times, and refuses
  a body over the cap; (12) it sends no `Authorization`, and `fetchRefs` fetches a named branch.
- `tools/trivy/install.test.ts` uses stub `curl` and `trivy` on `PATH`, in a temporary directory as
  (12) `tools/check-toolchain/install-pnpm.test.ts` does, and asserts both scripts committed 100755:
  - a downloaded tarball whose hash differs fails before extraction, and the message names both hashes;
  - a restored tarball whose hash differs fails the same way, and downloads nothing;
  - ARM64 or macOS refuses, naming the file;
  - a `--version` that differs fails.
- `tools/trivy/db.test.ts`, with a stub `trivy`: fails at 48 h + 1 s and passes at 47 h; fails when the `repo=` line is
  absent or names mirror.gcr.io; three failed downloads fail naming ghcr.io; the summary carries the four values.
- `workflows.test.ts` and `no-duplicated-versions.test.ts`, as in §4.

| ID | Title | Assertion |
|---|---|---|
| CI-24 | Trivy from verified bytes | Every scan and bill of materials runs the Trivy release `tools/trivy/release.txt` names, installed only after its SHA-256 matched, downloaded or restored, with no Trivy action in any workflow and its version written nowhere else |
| CI-25 | A hijacked or young Trivy release refused | A changed pin needs the tag's commit on its release branch or the default branch, a Sigstore signature from Trivy's release workflow at that tag, commit, repository and owner under Sigstore's trust root, the committed digest, one tlog entry at least three days old, and on CI an immutable release three days old that no reviewed advisory names; a CVE-2026-33634 version or digest, or a version under 0.72.0, fails; on a push a moved tag, a withdrawn release or a newer three-day-old release warns, and a failed read only warns |
| CI-26 | Trivy's database fresh and from its publisher | Each job downloads the database once, from ghcr.io only and untagged, before any scan, with telemetry and the update check off; a database over 48 hours old, or one from any other repository, fails the job, and the scans update nothing |

(12) CI-25's assertion is rewritten for 12.5; the builder copies the row without this note.

`registry.ts` entries, (12) in the CI-21 to CI-23 form (`registry.ts:628-631`), after `:631` under the comment "Trivy
from verified bytes (docs/adr/0066, Part 6)":
- `'CI-24': none(0, 'The workflows and tools/trivy/release.txt are read; the install script runs against stub downloads in a temporary directory; no file.', ['tools/trivy/install.test.ts', 'tools/test/workflows.test.ts', 'tools/test/no-duplicated-versions.test.ts'])`;
- `'CI-25': none(0, 'Tags, the trust root, bundles and checksums are synthetic and built in memory; no file.', ['tools/check-action-pins/trivy.test.ts', 'tools/check-action-pins/der.test.ts'])`;
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
| Aqua withdraws (12) (deletes) the pinned release, or the release host is down; (12) under an immutable release a re-cut under the same tag cannot happen (`immutable-releases.md:22-23`) | Pull-request lanes run from the hash-checked cache (C8). A push run warns on (12) the release's 404 first. `release.yml` and the dry run fail at download; the runbook re-pins to a verified release (§6 step 4), never to a mirror |
| Sigstore's TUF root or Rekor unreachable on a pin PR | It fails closed after three tries, naming the host. Only `release.txt`/checker PRs read it |
| `@sigstore/*` change their API | Exact versions in the lockfile; bumps come through Dependabot's npm group and the checker's tests catch them |
| Fulcio stops issuing .1.13/.1.14 | (3) fails closed on a missing extension, and `pnpm trivy:pin` names it |
| Asset naming changes upstream | `pnpm trivy:pin` fails on the new version, naming the missing asset; the person adapts `install.sh` |

Rollback is one revert commit. Trivy's verdict is unchanged in kind: the same severities, the same `ignore-unfixed`,
the same exit codes.

## 11. Interplay

(12) Superseded by 12.4 where they differ: P1 has merged (#82, bce57f16); #86 shares the workflows and documents, and P2
is cut after it; #42's files are now those of be63bdc2.

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
| §3 check (3) (V3) | **Adopted, in place** (12.5, item 4). The expected `.1.13`, `.1.14`, `.1.15` and `.1.17` go into the policy's `oids`, DER-encoded by `der.ts`, so `@sigstore/verify` refuses a mismatch itself. The explicit compare after verification stays, with its failing tests. | scout-pins §3 (`verify-oids.mjs`, 17:33Z); GHSA-52v5-jr5w-gjxr |
| §2 March 2026, and "Open" (V4) | **Adopted, in place.** The facts are cited from GHSA-69fq-xp46-6x23 (advisory-database 8c754a94), and the open item is closed. | scout-pins §1 |
| §3 `HIJACKED` and the floor (V5) | **Adopted, and widened** (12.5, item 2): the floor is 0.72.0, and a networked advisory read on CI proves its own query form (E8). | scout-pins §1 |
| §3 a new check (V6) | **Adopted, and widened** (12.5, item 3): the tag's commit must be on `release/v<X.Y>` **or the default branch**, not the release branch alone. The read at 17:43Z shows v0.76.0 on both, v0.76.1 on `release/v0.76` only, and v0.69.3 on `release/v0.69` only; whether a minor's release branch exists when its tag is pushed is not verified. | treeless fetch at 17:43Z (12.3) |
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
| §11 | `pr42-files.txt:80, :86, :136-138` | #42 at be63bdc2 (12.4) |
| 12.6 | (none) | `tools/stryker/affected.ts:121-130` (`GLOBAL_INPUTS`, root `package.json` `:125`), `:27`, `:373`; `watched-paths.txt:20, :23`; `README.md:44-45`; `LANES.md:31-36, :84-93` |

### 12.3 Versions and facts measured today

**Trivy** (scout-pins §1, 17:24Z to 17:36Z; this revision's `git ls-remote` at 17:49:18Z and treeless fetch at 17:43Z).
The floor is `pnpm-workspace.yaml`'s `minimumReleaseAge`, read through `releaseAgeMinutes`: 4,320 minutes.

| Fact | Value |
|---|---|
| Release | **v0.76.1**, still the newest stable tag; no `-rc` tag; v0.77.0 pending as `refs/heads/release-please--branches--main` 586c9563 (2026-10-30T13:50:56Z), untagged |
| Tag | lightweight, naming `e713f67f7d54decdcd9b3132c9751833dcced698` ("release: v0.76.1 [release/v0.76] (#11445)", committed 2026-10-21T10:20:32Z) |
| Ancestry (17:43Z) | v0.76.1 `e713f67` is an ancestor of `release/v0.76` (whose head it is) and not of `main` (e2c05f7); v0.76.0 `531360e` ("release: v0.76.0 [main]") of both; v0.75.0 `591e979` of `main` and of `release/v0.75`, whose head it is; v0.69.3 `6fb20c8` of `release/v0.69` only. v0.69.4's `1885610c` was on no branch (GHSA-69fq: "not committed to Trivy's main branch"; `release/v0.69` ends at v0.69.3) |
| Archive | `trivy_0.76.1_Linux-64bit.tar.gz`, 52,676,794 bytes, SHA-256 `c7cbe3137fb8a48a17574bede3dd6beb16742d1e9772929940fc90082c39d9c0`, equal to its `checksums.txt` line and to the bundle's `messageDigest`; served by a 302 to `release-assets.githubusercontent.com/github-production-release-asset/180687624/…` |
| `checksums.txt`, bundle | 2,121 bytes, SHA-256 `885debc4…535d`; `…tar.gz.sigstore.json`, 10,383 bytes, SHA-256 `6955f036…69ca1`, `application/vnd.dev.sigstore.bundle.v0.3+json` |
| Signature | `@sigstore/verify` 4.1.2 with `@sigstore/tuf` 5.0.0's embedded trusted root: OK for the SAN `https://github.com/aquasecurity/trivy/.github/workflows/reusable-release.yaml@refs/tags/v0.76.1` and issuer `https://token.actions.githubusercontent.com`; `UNTRUSTED_SIGNER_ERROR` for `@refs/tags/v0.76.0`; `SIGNATURE_ERROR` for a truncated archive; with `oids` `.1.13 = e713f67…`, `.1.14 = refs/tags/v0.76.1`, `.1.15 = 180687624` and `.1.17 = 12783832` OK, and with v0.76.0's commit as `.1.13` `UNTRUSTED_SIGNER_ERROR … missing OID 1.3.6.1.4.1.57264.1.13` (17:26Z, 17:33Z) |
| Certificate | `.1.9` and `.1.18` the build and config URIs (`…/reusable-release.yaml@refs/tags/v0.76.1`, `…/release.yaml@refs/tags/v0.76.1`); `.1.10`, `.1.13`, `.1.19` the commit; `.1.12` `https://github.com/aquasecurity/trivy`; `.1.14` `refs/tags/v0.76.1`; **`.1.15` 180687624** (the repository's ID, the same as in the asset URL); **`.1.17` 12783832** (the owner's); `.1.11` `github-hosted`; `.1.20` `push`; `.1.21` run 39586330915, attempt 1; `.1.22` `public` |
| Signing time | one hashedrekord tlog entry, logIndex 3354989152, with an inclusion promise and proof: **`integratedTime` 1792581276 = 2026-10-21T11:14:36Z**; one RFC 3161 timestamp. Three days old from 2026-10-24T11:14:36Z; **11.27 days old** at 17:49:18Z |
| Published | the API was not read here. The bundle asset's `Last-Modified` is 2026-10-21 11:18:30 GMT and Docker Hub's `aquasec/trivy:0.76.1` was pushed at 11:16:45Z, so about 11:18Z. `immutable` was not read here; the GHSA says immutable releases have been on since 2026-03-03 |
| Advisories | none affects 0.76.1. GHSA-69fq-xp46-6x23 (CVE-2026-33634): trivy = 0.69.4 only, trivy-action < 0.35.0, setup-trivy < 0.2.6, critical; GHSA-q3fv-x8vg-qqm4: < 0.71.0, high; **GHSA-mcj4-mphf-j9ff: < 0.71.1, high, a path traversal through a crafted vulnerability database**; GHSA-8rc5-4fr6-64pw: < 0.72.0, moderate (advisory-database 8c754a94; pkg.go.dev's list the same, 17:34Z) |
| March 2026 | v0.69.4 was built and signed by Trivy's own release pipeline from an attacker-pushed tag on `1885610c` (an impostor `actions/checkout`, goreleaser with `--skip=validate`), exposed 2026-03-19 18:22Z to about 21:42Z; 0.69.5 and 0.69.6 were Docker Hub images only, with no GitHub tag or release (2026-03-22 15:43Z to 2026-03-23 about 01:40Z). The v0.69.4 Linux-64bit archive's SHA-256 is `385d498d18a3a7c67878ca7322716f9da25683eb1a4bf9e9592da0d5f2ab09f6` |
| Upstream release workflow | `reusable-release.yaml:137-141` at v0.76.1 runs `actions/attest` (v4.2.2) over `checksums.txt`; whether it ran for v0.76.1 is not verified |

**npm** (scout-pins §3; registry.npmjs.org at 17:25Z; a scratch `pnpm install` with pnpm 10.34.8, `minimumReleaseAge:
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

**What the pull request is expected to print on CI** (its first run, after 2026-11-01T18:27:09Z if the lockfile takes
`tuf-js` 6.0.1):
- `static`, "Action pins":
  - The verify loop reads every ref again, because the change edits `tools/check-action-pins` (`base.ts:67-69`): 12 refs
    of 11 commits, P1's 13 refs of 12 (`follow-up-p1-pin-age.md` 14.3) less trivy-action.
  - The age rule: "age: no pin new against the base, nothing read" (the new cache steps reuse `55cc8345`, `ci.yml:147`).
  - The builder's two notes.
  - Then Trivy, every check, since the base has no `tools/trivy/release.txt`: the tag `v0.76.1` names `e713f67…`; the
    commit is on `release/v0.76`; the bundle verifies under the trusted root read from tuf-repo-cdn.sigstore.dev as
    `reusable-release.yaml@refs/tags/v0.76.1`, its issuer, `.1.13`, `.1.14`, `.1.15` and `.1.17`; the signed digest
    `c7cbe313…` equals `linux_x64` and the `checksums.txt` line; one tlog entry, `integratedTime` 2026-10-21T11:14:36Z
    equal to `signed_at` and three days old; the release `immutable: true` with `published_at` three days old (the first
    live read; about 11:18Z expected); no reviewed advisory names 0.76.1, while the control query for 0.69.4 names
    GHSA-69fq-xp46-6x23; "no newer release is three days old" unless v0.77.0 is tagged and old enough by then.
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

The order (the status file's RESUME-BLOCK and the session's item): #86 (ci-images-digest) merges next, then #75, #84,
#83 and #85; P2, then P4, each after its own pipeline; P5 (ci-catalog) is not this session's. Every resolution follows
LANES.md rule 6 (`:31-36`): the pull request merged second merges the latest `claude/build-platform` in with a merge
commit, never a rebase or a force-push; it keeps both sides of every shared document (reconciliation-001,
`test-matrix.md`, an ADR, `registry.ts`, a runbook); and it regenerates every generated file on the merged tree
(`pnpm install` for `pnpm-lock.yaml`, `watched.ts --write` for `watched-paths.txt`, `pnpm synth --all`), never by hand.

| Pull request | What it shares with P2, and its hunks | Who resolves | Cut P2 after it? |
|---|---|---|---|
| **#86** ci-images-digest (open, draft, head 83167b8f, its own session; GitHub "not mergeable, dirty" at 17:28Z; last updated 2026-10-28T08:01:36Z) | Read at 17:42Z against its merge base 83d71fd6. **Workflows:** three comment lines above `images:`; two comment lines and `env: { BUILDX_METADATA_PROVENANCE: disabled }` on the web build; that `env` on the worker build; the identity steps take `BUILT`; the same `env` and comments on the build step of `release.yml` and the dry run (and of `release-capacity.yml` and `screening-capacity.yml`, which have no Trivy). **Documents:** the `images` triage bullet of `ci.md` (`:148-149`, the one P2 extends) and a "Changing CI" bullet; ADR 0066's Date line, Part 3's Deciders and notice N29; an entry at the end of reconciliation-001. **`workflows.test.ts`:** the expression value rule (`:2957-3130` at 83167b8f: `$GITHUB_ENV` writes closed to `ENGINE_FREEZE_BASE`, `runner.*` admitted) and `BOUNDED_VALUES` (`:3213-3289`), in which `steps.image.outputs.ref` is already listed for both release builds; a new step output P2 hands to `actions/cache/save` needs a row. A trial merge of 83167b8f into bce57f16 conflicts in ADR 0066, reconciliation-001 and `workflows.test.ts` against P1, so #86 merges the build branch in first. | Nothing, if P2 is cut after #86: P2 then writes its row into #86's list once, under #86's own test. P2's workflow steps sit at least four unchanged lines from every #86 hunk (E1), so they would merge cleanly either way. | **Yes, recommended.** P2's branch has no commits (cut locally at bce57f16, not pushed), so re-cutting it from the build branch after #86 merges costs nothing, and P2 resolves nothing of #86's; meanwhile the session builds P4, which is independent (the orchestrator, 17:24 UTC). **Fallback:** if #86 has not merged when P4's build reaches its draft pull request, cut P2 from the build branch then current, and merge the build branch in after #86 merges, with a merge commit. P2, merged second, keeps #86's `ci.md` text and N29 and then adds its own, appends its reconciliation entry after #86's, and adds its `BOUNDED_VALUES` row. |
| **#42** PR 6b-4 (open, head be63bdc2, merge base 56ed6279) | `ci.yml` and `workflows.test.ts`: only the port of #86's identity steps (`ci.yml:731-751`; `workflows.test.ts:1799, :1808`). `test-matrix.md:177-217` (LED and SCR rows), `matrix.ts:223, :331`, `registry.ts:367, :513, :523`, `reconciliation-001.md:638`, and `pnpm-lock.yaml` (the apps/web and apps/worker importers, `@aws-sdk/client-sqs`). None is in P2's hunks, and none is on the "Not while #42 is open" list (`LANES.md:84-91`). ADR 0062 is #42's, and P2 does not edit it: its `:1376` bullet ("both trivy-action steps set `cache: false`…") goes stale, and Part 6 says it supersedes it (P38). | The one merged second, under rule 6; the lockfile is regenerated with `pnpm install`, never hand-merged. | No. |
| **#75, #83, #84, #85** (merge before P2) | `test-matrix.md` (`:228`, `:337`, `:129`, `:129`), `matrix.ts` and `registry.ts`, all outside the CI block; #75 also `reconciliation-001.md:260` (not the end); #84 also `ci.md:440` (the mutation shard table). | P2, merged second, at its base merge: mechanical, both sides kept, then `pnpm synth --all`. | No: they touch none of P2's regions. |
| **#87, #88, #89** (Dependabot; never merged by this session) | `pnpm-lock.yaml` and other packages' manifests (#89: ten `@aws-sdk` and stripe bumps); not `tools/package.json`, whose importer is `tools:` at `pnpm-lock.yaml:791`. | If one is merged (by the founder or the triager) before P2, P2's base merge regenerates the lockfile with `pnpm install` on the merged tree (`LANES.md:35`). If P2 merges first, Dependabot rebases its own. | No. |
| **P4** `co-001/ci-mutation-trigger` (local at bce57f16, not pushed; merges after P2) | ADR 0066 (Part 7 after Part 6, and the header lines), `test-matrix.md`, `matrix.ts` and `registry.ts` (CI-27 to CI-29 after CI-26), possibly the runbooks; its code is `tools/stryker`. | P4, merged second: Part 7 after Part 6, its rows after CI-26, both header lines kept. If P4 is ready first, the session may merge it first, and P2 then resolves the same way. | No. |
| **ci-findings-transport** (queued after #86, its own session; CI-30 and CI-31 if it needs rows) | The findings transport of `content-calendar.yml`, which #86's list marks `over: 'ci-findings-transport'`; probably `workflows.test.ts` and rule-6 documents (not verified). | The one merged second, under rule 6. | No. |

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
   was written, so the read covers the next one: `GET
   /advisories?ecosystem=go&affects=github.com/aquasecurity/trivy@<version>` with the job's read-only token, through
   `age.ts`'s `apiGet` (`:348`, its headers `:810`), the way P1 reads `/advisories/<id>` (`age.ts:740-760`). Any
   reviewed, unwithdrawn advisory fails a pin and warns on a push. The query proves its own form on every run (E8).
   Locally the read is skipped with a note, in the form of `age.ts:790-800`. `HIJACKED` keeps 0.69.4, 0.69.5 and 0.69.6
   with CVE-2026-33634, the last two marked "Docker Hub images only", and refuses v0.69.4's archive digest
   (`385d498d…09f6`) whatever version line names it.
3. **Where the tag's commit must be.** (a) Nowhere, as written. (b) On `release/v<X.Y>` (V6). (c) On `release/v<X.Y>`
   or on the default branch. **Taken: (c).** Both (b) and (c) refuse v0.69.4's shape: a commit pushed outside every
   branch and tagged, which Trivy's own pipeline then built and signed, so the signature and the tag check pass it. At
   17:43Z v0.76.0 was on `main` and `release/v0.76`, v0.76.1 on `release/v0.76` only, v0.75.0 on `main` and its own
   branch, and v0.69.3 on `release/v0.69` only. (b) alone would refuse a new minor whose release branch is cut after
   its tag, and when that branch appears is not verified. The read is P1's: `fetchRefs` lists and fetches, without
   trees, the default branch and the tag (`network.ts:218-240`), and gains an optional list of branches (E6);
   `isAncestor` (`:253-262`) answers. The fetch was 3.8 MB here (17:43Z). It runs at pin time and for each newer
   candidate on a push; an unchanged pin is not re-checked, since its tag's re-read already warns on a move.
4. **The signer's identity in the policy.** The expected `.1.13` (the commit), `.1.14` (`refs/tags/v<version>`),
   `.1.15` (180687624, the repository's ID) and `.1.17` (12783832, the owner's) go into `@sigstore/verify`'s policy
   `oids`, DER-encoded by `der.ts`, so the library refuses a mismatch. The explicit compare after verification stays,
   because GHSA-52v5-jr5w-gjxr shows a wrapper silently dropping OID constraints; its test injects a verifier that
   ignores `oids`. The numeric IDs survive a renamed or resurrected repository, which the SAN's name does not.
   **Taken, the safer option.**
5. **Immutable releases.** The design's Revisit ("Trivy publishes GitHub immutable releases and attestations") is met.
   (a) Leave it as a Revisit. (b) Replace the bundle check with `gh attestation verify`. (c) Keep the bundle check, and
   on CI read `repos/aquasecurity/trivy/releases/tags/v<version>` with the job's token, as `age.ts:598-616` does:
   require `immutable: true`, and hold `published_at` to the floor as a second time, the youngest of it and
   `integratedTime` counting. **Taken: (c).** GitHub's release attestation binds the assets to the release, not to the
   signer's workflow, ref, commit and repository, and immutability did not stop v0.69.4, published 16 days after it was
   turned on. On a push the release read replaces the asset `HEAD` (E10): a 404 warns "withdrawn", and a release that is
   not immutable warns. Locally the read is skipped with a note. The new Revisit: GitHub's release attestation, or `gh
   attestation verify`, adds an identity check the bundle lacks. If the pull request's first live read shows v0.76.1 not
   immutable, the rule refuses it, the integrator stops, and the session decides under the same ruling.
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
    (`:21-29`) name the new check and the CLI; ADR 0062 is not edited (12.4); `pnpm trivy:pin` stays a root script.
    Mutation runs all four shards on P2's pull request either way, because `tools/package.json` changes
    (`affected.ts:27, :373`); P4 narrows that.

### 12.6 Build plan on this base

**The branch.** `co-001/ci-trivy-version` is re-cut from `claude/build-platform` after #86 merges (12.4; the fallback
there if it does not), in the worktree `/home/user/ci-trivy-version`, installed with `pnpm install` under the lock.
Before the first commit, `git ls-remote --tags https://github.com/aquasecurity/trivy` is run again: if a newer release
is at least three days old by its bundle's `integratedTime`, T1 takes it and 12.3's values are re-measured for it. Two
builders work in parallel on disjoint files, and the integrator follows. Every builder runs its tests under the lock and
records each red commit's failing test names for the pull request's description. Every ★ case goes through an existing
entry point (`checkActionPins`, a script run by its path, a workflow file read), so the red commits fail on behaviour,
not on a missing import (P1's E21); red commits may also fail `pnpm typecheck`, and the green ones pass every command.

**B1, `tools/check-action-pins` and the manifests.** Files: `tools/check-action-pins/{network.ts, network.test.ts,
base.ts, check.ts, check.test.ts, index.ts, fixtures.ts}` (changed), `tools/check-action-pins/{trivy.ts, trivy.test.ts,
der.ts, der.test.ts, pin-trivy.ts}` (new), `tools/package.json`, the root `package.json` (the `trivy:pin` script) and
`pnpm-lock.yaml`.
- Commit 1, failing first, red: `trivy.test.ts`'s ★ cases, each through `checkActionPins` on a synthetic repository
  (`check.test.ts`'s helpers): an `aquasecurity/trivy-action` step fails; a scan with no install or database step before
  it fails; a `TRIVY_DB_REPOSITORY` with `:2` fails; a `trivy` command without `--cache-dir "$RUNNER_TEMP/trivy"` fails;
  a `release.txt` naming 0.71.1 fails as under 0.72.0; a changed `release.txt` whose tag names another commit fails; an
  unchanged `release.txt` and checker read nothing from the network.
- Commit 2, green:
  - `network.ts`: `getBytes(url, signal?)` on `Transport`, `gitTransport` and `recordedTransport` (no request header, a
    60 s limit per read, a 128 MiB cap that fails naming the URL); `fetchRefs` takes an optional list of branches (E6).
  - `base.ts`: `TRIVY_RELEASE = 'tools/trivy/release.txt'` in the named-once list; `baseState` returns the base's text.
  - `der.ts`: the UTF8String encoder and decoder.
  - `trivy.ts`: the offline rules (§3 and 12.5: the four keys; `HIJACKED`, its digest and the 0.72.0 floor; no
    `aquasecurity/` action; install, then database, before any `trivy` step in each job; `--skip-db-update` and
    `--cache-dir "$RUNNER_TEMP/trivy"` on every scan; the job env, untagged, ghcr-only repositories); the networked
    checks: (1) the tag, (2) the bundle under the injected root with the policy's `oids`, (3) the explicit identity
    compare, (4) the digest against `linux_x64` and `checksums.txt`, (5) one tlog entry, `signed_at` and the floor,
    (6) the ancestry, (7) on CI the release's `immutable` and `published_at`, (8) on CI the advisory read and its
    control; the push reads (the tag, the release, newer releases, E9 and E10); faults by kind (E5).
  - `check.ts`: the offline rules join `:122-129`; the networked check runs after the age rule (`:233-253`), under the
    shared deadline. `index.ts`: `--offline-root` (E15), refused on CI.
  - `pin-trivy.ts`: `pnpm trivy:pin <X.Y.Z> [--offline-root]` runs every check and writes `release.txt`, refusing a
    version that fails any.
  - `fixtures.ts`: a synthetic `TrustedRoot` and a test-only signer holding its CA, CT log and Rekor keys, so a bundle's
    `integratedTime` is set by the test.
  - The rest of `trivy.test.ts` (§8's list, with 12.5's cases: `.1.15` or `.1.17` different; a verifier that ignores
    `oids`; the floor 0.71.1 and the known-bad digest; a commit on neither branch fails and one on the release branch
    alone passes, and on a push it warns; a release not immutable, or with a `published_at` younger than the floor,
    fails; an advisory naming the version fails; an advisory control that names nothing fails closed; off CI, the API
    reads are skipped with a note; on a change to the checker alone a verdict on the bytes fails and an outage warns;
    reads stopped by the deadline are one error on a pull request and one warning on a push; on a push a 404 release
    warns "withdrawn"; newer candidates are tried newest first, at most three), `der.test.ts`, `network.test.ts` (bytes
    unchanged, three tries, the cap, no `Authorization` sent, a named branch fetched) and `check.test.ts` (the
    named-once list).
  - `tools/package.json`: the four `@sigstore/*` packages in `devDependencies`, exact (12.3); `package.json`:
    `"trivy:pin": "tsx tools/check-action-pins/pin-trivy.ts"`; `pnpm install` writes `pnpm-lock.yaml`, never edited by
    hand, and the builder records the versions it resolved.

**B2, `tools/trivy`, the workflows and their tests.** Files: `tools/trivy/{release.txt, install.sh, db.sh,
install.test.ts, db.test.ts}` (new), `.github/workflows/{ci.yml, release.yml, release-dry-run.yml}`,
`tools/test/{workflows.test.ts, no-duplicated-versions.test.ts, collection.test.ts}` and
`packages/compliance/src/controls.ts`.
- Commit 3, failing first, red: `install.test.ts` and `db.test.ts`, which run the scripts by their path (absent);
  `workflows.test.ts`'s CLI assertions (each job's literal env; install, then database, right after the checkout; the
  scans' and the SBOM's commands; `images`' cache steps with the push-only save; the release's no-cache rule with no
  `aquasecurity/` action; the dry run's equality with the scan kept and `asDryRun`'s `env` cut; the SBOM test;
  `tools/trivy/**` in the dry run's paths); `no-duplicated-versions.test.ts`'s ninth case; `controls.ts:264`'s evidence
  `trivy image --input`, which `controls.test.ts:221-228` then fails to find.
- Commit 4, green: `install.sh` and `db.sh` (100755); the three workflows; `ci.yml`'s comments (`:13-14`, `:82-88`,
  `:702-703`), `release.yml`'s (`:21-29`) and the dry run's (`:3-15`, `:59-62`); `collection.test.ts` gains
  `testsIn('tools/trivy')`; `controls.ts:261`'s `what`. `tools/trivy/release.txt` is written by
  `pnpm trivy:pin 0.76.1 --offline-root` once B1's commit 2 is in (B2 waits for it here only), and its four values are
  checked against 12.3.

**The integrator: documents, matrix, synth and the full local suite.**
- Commit 5: `README.md:44-45`; ADR 0066 Part 6 and its Status, Date, Deciders and PRD lines (12.1, F11); ADR 0010
  (`:19`, `:30-31`, and an appended note naming Part 6); `docs/runbooks/ci.md` (`:33`, `:148-149` after #86's text,
  `:271-273`); `docs/runbooks/dependency-upgrades.md` (the "Trivy" section after `:374`, step 5 at `:95-98`);
  `docs/product/reconciliation-001.md` (the P2 entry after #86's); `docs/product/test-matrix.md` (the intro's
  `:261-262` reworded, CI-24 to CI-26 after `:290`); `packages/synth/src/cases/matrix.ts` (after `:441`) and
  `registry.ts` (after `:631`, under "Trivy from verified bytes (docs/adr/0066, Part 6)"). `pnpm synth --all` writes
  nothing (the rows are `none(0, …)`).
- Then, locally: `pnpm actions:check --offline`; `BASE=origin/claude/build-platform pnpm actions:check --offline-root`
  (every networked check but the live TUF root and the API reads, which are CI's); `BASE=origin/claude/build-platform
  pnpm toolchain:check`; `pnpm typecheck`, `pnpm lint`, `pnpm lint:logs` and `pnpm verify-content`; and the unit set of
  the changed places (`tools/test`, both checkers, `tools/gitleaks`, `tools/trivy`, `packages/compliance`).
- The integrator opens the draft pull request with the template's description.

**The counts.** At bce57f16 the unit project on CI ran 404 files, 6,893 tests passed and 1 skipped (push run
41330911483, unit job 124920631257); locally the filtered set ran 32 files and 451 tests. The pull request must reach
**408 files** (four new: `trivy.test.ts`, `der.test.ts`, `install.test.ts`, `db.test.ts`) and **6,893 + N passed, 1
skipped**, where N is the new cases: about 70 by the lists above (`trivy.test.ts` about 45, `der.test.ts` 4,
`network.test.ts` 5, `check.test.ts` 1, `install.test.ts` 6, `db.test.ts` 6, `workflows.test.ts` about 4 new beside
the changed ones, `no-duplicated-versions.test.ts` 1). The integrator records the exact numbers, and the local count
equals CI's.

**The fix round** runs the full local suite once (`lanes/lane-b.md:230`): unit; golden; oracle; `test:db` in shards one
after another; build, stamp, then e2e with `E2E_PREBUILT=1`; the mutation shards the change affects (all four, 12.5
item 11), then the gate. It also runs `pnpm actions:check --offline-root` (E15) and `pnpm toolchain:check` with
`BASE=origin/claude/build-platform` (networked), since workflows, manifests and the lockfile change; regenerates the
lockfile (`pnpm install`), `watched-paths.txt` (`watched.ts --write`) and the synth fixtures (`pnpm synth --all`) after
any base merge; and records CI's screening-capacity run, since `package.json` and `pnpm-lock.yaml` are watched
(`watched-paths.txt:20, :23`), and the dry run's first CLI scan and SBOM on ubuntu-24.04. The two reviews are CI and
test infrastructure, and security and supply chain.

### 12.7 Engineering choices made here

Each is reversible and the recommended option.
- **E1. Install and database first.** In all three workflows the install step (and, in `images`, the archive cache's
  restore before it and its push-only save after it) and the database step come right after the checkout, before the
  builder. A hash mismatch or a stale database then fails the job before minutes of building; no step needs an `if:`
  to run them whatever the web build's result; one order holds in every job, which the test asserts; and every #86 hunk
  stays at least seven unchanged lines away (the job env, after `timeout-minutes`, four).
- **E2. The cache directory as a flag.** Every `trivy` command passes `--cache-dir "$RUNNER_TEMP/trivy"`, and `db.sh`
  takes the directory as its one argument, as `install.sh` takes its own and as `ci.yml:680` makes `$RUNNER_TEMP/image`.
  The job env stays literal, which actionlint accepts. A scan that forgets the flag reads the default cache, which
  holds no database, and with `--skip-db-update` Trivy refuses to run without one (its first-run check; not re-read at
  v0.76.1 here), so it fails closed; the offline rule refuses it first.
- **E3. Expressions through step `env`.** `IMAGE_REF: ${{ steps.image.outputs.ref }}` and the SBOM's file name
  (`sbom-${{ matrix.image }}-${{ github.ref_name }}.spdx.json`) reach the commands as `"$IMAGE_REF"` and `"$SBOM"`,
  never inline in `run:`, as `release.yml:453` passes the tag. `asDryRun` cuts `env` with `cutInput`
  (`workflows.test.ts:2278-2282`), so the dry run's name is the one its SPDX read already uses.
- **E4. One deadline.** Trivy's reads run under the shared 180 s, after the age rule; each archive read has 60 s. The
  trust root's read is raced against the deadline's signal, since `@sigstore/tuf` takes none, and its cache goes under
  the transport's scratch directory, which `close()` removes (the option names are read from `@sigstore/tuf` 5.0.0's
  types by B1).
- **E5. Two kinds of fault.** A change upstream (the tag moved or gone, the release deleted or not immutable, a new
  advisory, the commit off both branches, a read that failed or ran out of time) fails only a pin new against the base,
  on a pull request. A verdict on the recorded bytes (the signature, the identity, the digest, the tlog entry,
  `signed_at`, the age) fails every pull request whose reads run, a change to the checker alone included: under an
  immutable release those bytes cannot change, so such a failure is the checker's or the pin's, and it should stop the
  change that caused it. On a push every finding is a warning. `buildkit.ts:89` warns on everything when the builder is
  not new; the difference is that Docker Hub's tag is mutable and Trivy's bundle is not.
- **E6. `fetchRefs` takes branches.** An optional list of branch names is listed and fetched with the default branch in
  the same treeless fetch, rather than a second fetch method, so the ancestry read reuses P1's bare repository and
  `isAncestor`.
- **E7. One title.** Trivy's messages print under the step's "Action pins" title, each starting `trivy `, because
  `index.ts:37-40` prints one title per step; the warning in §6 step 1 reads
  `::warning title=Action pins::trivy vX.Y.Z (signed <time>) is newer than …`.
- **E8. The advisory query proves its form.** Each run that reads advisories also asks for 0.69.4, and the answer must
  name GHSA-69fq-xp46-6x23; otherwise the read counts as failed. A filter that GitHub reads differently from what was
  meant (the version's `v`, the package path) would match nothing and pass every version, so the control makes it fail
  closed instead. It costs one API call.
- **E9. Newer releases on a push.** The candidates are the stable tags newer than the pin, tried newest first, at most
  three, stopping at the first that passes every check of a pin, each read under the deadline. The scouts' cheaper
  read (the bundle's unverified tlog time and `checksums.txt`, without the archive) is declined: the warning then
  names only a release `pnpm trivy:pin` will accept, and the cost is one 52 MB read per candidate on a push, and only
  while a newer release waits.
- **E10. The release read replaces the asset `HEAD`.** On a push, `releases/tags/v<version>` with the job's token
  answers both questions: a 404 is a withdrawn release, and `immutable` false is a warning; an immutable release's
  assets cannot be removed (`immutable-releases.md:23`).
- **E11. The archive cache's key.** `trivy-v1-${{ hashFiles('tools/trivy/release.txt') }}`, restored on every run of
  `images` and saved on a push alone; the save takes `cache-primary-key`, with one `BOUNDED_VALUES` row after #86. Any
  change to the file changes the key, and `install.sh` re-hashes what is restored.
- **E12. No download-base override.** `install.sh` has no variable that replaces the release's address, unlike
  gitleaks' `GITLEAKS_DOWNLOAD_BASE` (`tools/gitleaks/install.sh:50`): its tests put a stub `curl` on `PATH`, and a
  mirror variable is the path C3 refuses for the database.
- **E13. Upstream's identity in the code.** The repository, the workflow path, `.1.15` (180687624) and `.1.17`
  (12783832) are constants in `trivy.ts`, cited to the certificate, not lines of `release.txt`: they belong to the
  upstream, not to a release, and a bump never changes them.
- **E14. The compliance evidence.** `controls.ts:264` names `trivy image --input`, the scan's own command in `images`,
  whole in `ci.yml` (`controls.test.ts:124-129`), with `what` "the container scan of both images on every pull request
  by the Trivy release tools/trivy/release.txt names, its SHA-256 checked (the images job)"; `:261`'s `what` adds "and
  the Trivy release tools/trivy/release.txt names verified when it changes".
- **E15. `--offline-root` for a local `pnpm actions:check`.** This session's proxy refuses tuf-repo-cdn.sigstore.dev, so
  a local networked run would stop at the trust root. `--offline-root` verifies against `@sigstore/tuf`'s embedded root,
  as `pnpm trivy:pin --offline-root` does, and `index.ts` refuses it when `GITHUB_ACTIONS` is `true`; ci.yml's step runs
  `pnpm actions:check` exactly, which `workflows.test.ts` holds.
- **E16. The dry run scans** (12.5, item 10).

### 12.8 Proposed improvements outside P2

The highest in `designs/lane-b-ci.md`, P1's design and the status file is P28. P4's re-read, running at the same time,
plans P29 to P37 for its own (`/home/user/laneb-sp/p4reread/progress/revise.progress.md:19`, read at 18:05Z), so these
start at P38, which keeps the two clear whichever is committed first. Each is reversible and recommended.
- **P38.** When #42 has merged, ADR 0062's 2026-10-26 bullet (`:1376`, "both trivy-action steps set `cache: false`…")
  gains a pointer to ADR 0066 Part 6, which supersedes it. It cannot be edited while #42 is open (B1 of the
  2026-10-26 review).
- **P39.** For #86's owner: a test that each `BOUNDED_VALUES` `bound` cite (`file:line`) still holds the producer it
  names. P1's and P2's line shifts move them (83167b8f `workflows.test.ts:3213-3289` cites `ci.yml:683-694`,
  `release.yml:168-196` and others), and no test notices today.
- **P40.** gitleaks' installer downloads with `curl -fsSL --retry 3` (`tools/gitleaks/install.sh:53`) and no
  `--proto '=https' --tlsv1.2`, which P2's `install.sh` has. Add them, and move `tools/hooks/hooks.test.ts:462, :466`
  (`GITLEAKS_DOWNLOAD_BASE: 'file:///nonexistent'`) to a stub `curl`, since `--proto` refuses `file:`.
- **P26, widened (not a new number).** P1's P26 holds gitleaks' release to the floor by `published_at`. Once P2 has
  merged, `trivy.ts`'s helpers give it the tag, ancestry, `immutable` and advisory reads too; gitleaks' own signature
  form is not verified here.
- **P41.** After four weeks of `images` runs, read the database ages `db.sh` wrote to the job summaries. That measures
  the 48-hour floor, which no history could be read for here (12.3); a breach rate above none is a Revisit for C3.

### 12.9 In-place edits, and what stays open

Fifty edits in §1 to §11 and the review's "Open" line, each marked "(12)"; each old and new text is in
`/home/user/laneb-sp/p2reread/revise.md`. Where a stale cite is the only thing wrong, 12.2 maps it and the text was left.
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
- The live reads: Sigstore's TUF root, the release's `immutable` and `published_at`, and the advisory query (whose form
  E8's control settles), all first run in the pull request's `static`; its job id goes in the description.
- Whether v0.76.1 reports HIGH or CRITICAL findings in our images that v0.70.0 did not (§10, the first row).
- ghcr's anonymous limits under our load, and how often the database is over 48 hours old (P41).
- Whether a new minor's release branch exists when its tag is pushed (12.5, item 3's rule holds either way), and
  whether `actions/attest` ran for v0.76.1 (no decision rests on it).
- Trivy's refusal of `--skip-db-update` with no database (E2), not re-read at v0.76.1; `@sigstore/tuf` 5.0.0's option
  names for the cache path and timeout (E4), read by B1; the transitive `tuf-js` and `@tufjs/models` versions pnpm
  resolves.
- That mutation runs all four shards because `tools/package.json` changes (`affected.ts:27, :373`), not proved by a run.
- The P-numbers P38 to P41, chosen clear of P4's planned P29 to P37; if P4 goes past P37, the one committed second
  renumbers.
