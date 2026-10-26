# P2 `co-001/ci-trivy-version`: Trivy at its latest release, installed from verified bytes, with the hijacked-tag check

Design step only; nothing built, committed, pushed or posted. Written 2026-10-26 ~02:00 UTC and revised after its review
(~02:30 UTC, the last section) against `claude/build-platform` 6ddd587, plus ci-deps' design (§3.2, with §3.2.1, §3.2.6
and §3.2.7) and what its builders have written so far in `/home/user/ci-deps` (head 19e3d98e, still moving), plus
ci-browser's design (§3.3). Cut from the build branch once both have merged. It follows §3.2.6's P2
(`designs/lane-b-ci.md:1533-1534`) and the co-founder's ruling of 2026-10-26 ~00:20 UTC (recommended option on every
choice; for security, the safer one). No migration. Reserved: ADR 0066 **Part 6**; test-matrix and synth cases
**CI-24 to CI-26** (all three used).

Cites: `6ddd587:` is the build branch, `ci-deps:` is `/home/user/ci-deps` at 19e3d98e (the one commit since 2d86bb0e
touches only `tools/test/workflows.test.ts:7, 1901-1912`; no cite below moved). The network facts were read on
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
| T4 | A pull request that changes `release.txt` (or the checker) proves five things: the tag still names the recorded commit; the tarball's Sigstore bundle verifies, against Sigstore's trust root, as signed by trivy's own release workflow at that tag and commit; the signed digest equals the committed SHA-256 and the release's `checksums.txt` line; the release was signed at least three days ago; the version is not one CVE-2026-33634 names | `pnpm actions:check` in `static`; `tools/check-action-pins/trivy.test.ts` |
| T5 | On every push run, warnings and never a failure: the pinned tag moved or vanished; the pinned asset is gone; a newer release is at least three days old; any of those reads failed | the same, push mode |
| T6 | No `aquasecurity/*` action runs in any workflow (trivy-action and setup-trivy retired, §7 C1) | `workflows.test.ts` |
| T7 | The vulnerability database is downloaded once per job, from the publisher's registry (ghcr.io) only, before any scan; it is under 48 hours old; its repository, `UpdatedAt` and `DownloadedAt` are printed in the job summary; the scans read that database and update nothing | `tools/trivy/db.sh`; the summary; `workflows.test.ts` |
| T8 | Telemetry and Trivy's update check are off in every run | `workflows.test.ts` (the env on every job that runs Trivy) |

## 2. The facts this rests on

- **What runs today.** At 6ddd587 there are four trivy-action steps, all `ed142fd…` (v0.36.0): `ci.yml:484, 507`
  (`images`) and `release.yml:76, 85` (scan and SBOM). ci-deps keeps v0.36.0 and adds `cache: false` and a
  `cache-dir` under `runner.temp` to release.yml (`ci-deps:.github/workflows/release.yml:92-110`), whose steps take
  `image-ref: ${{ steps.image.outputs.ref }}` (`:94, :105`). `release-dry-run.yml` does not scan
  (`ci-deps:…/release-dry-run.yml:44`). trivy-action v0.36.0 defaults `version` to `v0.70.0` (`action.yaml:98-101` at
  `ed142fd`). Its latest tag is still v0.36.0 (`git ls-remote --tags https://github.com/aquasecurity/trivy-action`).
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
  0.69.3, trivy-action 0.35.0 and setup-trivy 0.2.6, the last recreated on a safe commit. Sources: Debian's tracker
  and Docker Scout's entry for the CVE, as returned by a web search on 2026-10-26. The CVE pages themselves
  (cveawg.mitre.org, wiz.io, security-tracker.debian.org) and `gh api /advisories` are unreachable from this session,
  so the builder reads the GHSA in a browser and cites it in Part 6. What I checked today:
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
- **The checker's transport reads text.** `ci-deps:tools/check-action-pins/network.ts:14` (`get(url): Promise<{status;
  text}>`) and `:27-28` (`await response.text()`, 30 s limit). A gzip decoded as UTF-8 is corrupted.
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
    It fails, naming `ghcr.io`, after the third.
  - It reads the `Artifact successfully downloaded repo=…` line and fails if it is absent or names any repository but
    `ghcr.io/aquasecurity/trivy-db`.
  - It reads `trivy version --format json` with `jq -r` (jq 1.7.1 on ubuntu-24.04 and 1.8.1 on 26.04 both read this),
    and fails when `VulnerabilityDB.UpdatedAt` is over 48 hours old, which guards against a stale or replayed database.
  - It writes the version, the repository, `UpdatedAt` and `DownloadedAt` to `GITHUB_STEP_SUMMARY`.
- **Every scan runs the CLI.** In `ci.yml` `images`, `release.yml` `build` and `release-dry-run.yml` `build`, each
  pair of trivy-action steps is replaced:
  1. `Install Trivy (tools/trivy/release.txt, its SHA-256 checked)`: `run: tools/trivy/install.sh
     "$RUNNER_TEMP/trivy-bin"`. In `ci.yml` only, an `actions/cache/restore` (`55cc834…`, v6.1.0, already pinned at
     `ci-deps:ci.yml:142`) before it and an `actions/cache/save` after it keep the archive under
     `$RUNNER_TEMP/trivy-archive`, keyed `trivy-<linux_x64 SHA-256>` read from `release.txt`. The script re-hashes what
     is restored, so a cache can only save a download, never change the bytes. release.yml and the dry run keep no cache
     (`ci-deps:release.yml:21-27`).
  2. `The vulnerability database (ghcr.io, under 48 hours)`: `run: tools/trivy/db.sh`.
  3. The scans, as `run:` steps with today's flags plus `--skip-db-update`, so each verdict uses exactly the checked
     database: `trivy image --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 --format table`. The SBOM is
     `--format spdx-json --output sbom-….spdx.json --exit-code 0`. The image source is not changed:
     - in `ci.yml` `images`, ci-browser's archive: `--input "$RUNNER_TEMP/image/<name>.tar"`, where §3.3.1
       (`lane-b-ci.md:2108-2112`) puts trivy-action's `input:`;
     - in `release.yml` and the dry run's `build`, which stay on `RELEASE_RUNNER.label` (ubuntu-24.04, the classic
       store, `lane-b-ci.md:2009-2011`) and keep `image-ref` (`ci-deps:release.yml:94, 105`): the tag, passed through
       `env: IMAGE_REF: ${{ steps.image.outputs.ref }}` as `"$IMAGE_REF"`, with `--image-src docker` so Trivy reads
       the local daemon and never falls back to a remote pull.

  Job-level `env` on each of those jobs:
  - `TRIVY_CACHE_DIR: ${{ runner.temp }}/trivy` (outside the checkout, as today);
  - `TRIVY_DB_REPOSITORY: ghcr.io/aquasecurity/trivy-db` and `TRIVY_JAVA_DB_REPOSITORY:
    ghcr.io/aquasecurity/trivy-java-db`, **untagged**, so Trivy appends its own schema version and a bump to a new
    schema needs no workflow edit; one repository each, no mirror (C3);
  - `TRIVY_DISABLE_TELEMETRY: "true"`, `TRIVY_SKIP_VERSION_CHECK: "true"` and `TRIVY_NO_PROGRESS: "true"`.

  The worker's `if:` conditions stay as they are (`6ddd587:ci.yml:497, 506`); the database step precedes the web scan
  and runs whatever the web build's result.
- **`release-dry-run.yml`** `build` gains the release's install, database, scan and SBOM steps for `web`. Only a tag
  runs release.yml, so without them the new install would first run on the founder's tag. Its path filter
  (`ci-deps:…/release-dry-run.yml:14-27`, and `PATHS` at `ci-deps:tools/test/workflows.test.ts:1310`) gains
  `tools/trivy/**`. The header comment at `:44` ("with no scan") is reworded.
- **`network.ts`** gains `getBytes(url): Promise<{ status: number; body: Uint8Array }>` on `Transport` and
  `liveTransport`: `arrayBuffer()`, a 300 s limit, and a 128 MiB cap that fails naming the URL. The same three tries and
  `NetworkError`. The recording test transport records it.
- **`base.ts`** gains `changedSince(root, mergeBase, paths)`; the Trivy rule's trigger is a change to
  `tools/trivy/release.txt` or to `tools/check-action-pins` against the merge base, or no base (`base.ts:44-47` diffs
  only the checker today).
- **`tools/check-action-pins/trivy.ts`** (new), called from `check.ts` after the action pins
  (`ci-deps:tools/check-action-pins/check.ts:43-105`):
  - **Offline, every run:**
    - `release.txt` parses (four keys, the forms above, nothing else);
    - `version` is not in `HIJACKED = { trivy: ['0.69.4', '0.69.5', '0.69.6'] }`, each with CVE-2026-33634 and its
      date beside it, and is at least 0.69.3;
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
    - (3) from the verified signer's `identity.oids`: `1.3.6.1.4.1.57264.1.13` (source commit) equals `commit` and
      `.1.14` (source ref) equals `refs/tags/v<v>`. Those values are DER UTF8Strings (`0c 28 …`), decoded by a small
      tested helper; a missing extension fails;
    - (4) the signed digest equals `linux_x64` and the line for the asset in `trivy_<v>_checksums.txt`;
    - (5) exactly one verified tlog entry; its `integratedTime` equals `signed_at` and is at least the floor before now.
      The floor is `releaseAgeMinutes(workspace)` from P1's `tools/check-toolchain/exclude-window.ts`
      (`p1-design.md:178-183`), 4,320 minutes today (`ci-deps:tools/check-toolchain/policy.ts:10`). If P2 merges
      before P1, it imports `MINIMUM_RELEASE_AGE_MINUTES` from `policy.ts` and P1's move repoints the import.
  - **Push runs** (`GITHUB_EVENT_NAME=push`). Every read below turns any failure, a 404 or a malformed answer into a
    `::warning title=Trivy::` naming the host and the version, and never a failure, as ci-deps' push path does
    (`check.ts:90-103`):
    - it re-reads (1) and warns if the tag moved or vanished (the committed hash still runs what was verified);
    - it sends `HEAD` to the pinned asset's URL and warns on 404, so a withdrawn release is seen before a pull request
      hits it (§10);
    - it lists the tags, ignores any that is not a stable `vX.Y.Z`, and for each newer one runs (2) to (5) and warns
      when one passes, naming it and `pnpm trivy:pin`. Same form as check-toolchain's newer-pnpm warning
      (`ci-deps:tools/check-toolchain/check.ts:219-238`).
- **`pnpm trivy:pin <X.Y.Z>`** (new root script, `tsx tools/check-action-pins/pin-trivy.ts`). It runs (1) to (5) for
  that version and writes `release.txt`, so nobody copies a hash by hand. It refuses a version that fails any of them.
  It is the bump procedure (§6). `--offline-root` verifies against `@sigstore/tuf`'s embedded `seeds.json` instead of a
  live TUF refresh, for a machine whose proxy refuses TUF (§9); CI never passes it.
- **`tools/package.json`** gains `@sigstore/verify`, `@sigstore/tuf`, `@sigstore/bundle` and `@sigstore/protobuf-specs`
  at exact versions (4.1.2 and 5.0.0 are what `sigstore@5.0.0` resolves; the builder records each one's `npm view …
  time` and the release-age check holds them). Not `sigstore` itself, whose tree adds `@sigstore/sign` and the OIDC
  code (52 packages, `npm ls --all`). One user, so no catalog line. `pnpm-lock.yaml` is re-resolved with `pnpm install
  --lockfile-only`.
- **No Dockerfile, compose, Dependabot, engine, ledger or content-pipeline change.** `publish-content.yml` is untouched
  (F4).

## 4. Files

- `.github/workflows/ci.yml` (`images`), `.github/workflows/release.yml` (`build`) and
  `.github/workflows/release-dry-run.yml` (`build` and the paths).
- `tools/trivy/release.txt`, `install.sh`, `db.sh`, `install.test.ts` and `db.test.ts` (new).
- `tools/check-action-pins/trivy.ts`, `trivy.test.ts`, `pin-trivy.ts`, `der.ts` and `der.test.ts` (new). `check.ts` and
  `index.ts` (one call and its notes); `network.ts` and `network.test.ts` (`getBytes`); `base.ts` and its test
  (`changedSince`); `fixtures.ts` gains the synthetic trust root and signer.
- `tools/test/workflows.test.ts`:
  - `isScan` (`ci-deps:176`) matches a `run` starting `trivy image` with `--exit-code 1`;
  - the `images` assertions (`ci-deps:1213-1237`) and the release build's scan-and-SBOM test (`:450`) hold the CLI
    form, `--input` in `images`, `"$IMAGE_REF"` with `--image-src docker` in the release builds, `--skip-db-update`,
    the database step first, and the env (untagged, ghcr-only repositories);
  - release.yml's no-cache rule (`ci-deps:571-575`) replaces its trivy-action lines with "no `aquasecurity/` action;
    `TRIVY_CACHE_DIR` under `runner.temp`; no `actions/cache`";
  - the dry-run equality rule (`ci-deps:1306-1345`) covers the install, database, scan and SBOM steps.
- `tools/test/no-duplicated-versions.test.ts`: a sixth case. Trivy's version appears only in `release.txt`, scanned
  over its files (`ci-deps:…:25-33`) and the header list (`:9-16`).
- `tools/test/collection.test.ts`: `...testsIn('tools/trivy')` beside `tools/ci` (`ci-deps:41-43`).
- `package.json` (the `trivy:pin` script), `tools/package.json` and `pnpm-lock.yaml`.
- Documents: §5. Matrix and synth: `docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts` and
  `registry.ts` (§8).

## 5. Documents

- **ADR 0066, Part 6** (new, after Part 5). Context: §2's facts. Decision: §3. Alternatives: §7. Revisit when: a
  signed database exists (then verify it); Trivy publishes GitHub immutable releases and attestations (then `gh
  attestation verify` could replace the bundle check); ghcr's anonymous limits turn `images` red (C3); gitleaks gains
  the same tag, signature and age check (below). Part 2's "Revisit when" line ("a newer trivy is wanted than
  trivy-action's default (a `version:` pin and its check)", `ci-deps:docs/adr/0066-…md:618`) is answered by Part 6's
  cross-reference. Its text stays.
- **ADR 0010** (`6ddd587:docs/adr/0010-supply-chain-gates-beside-ci.md:19, 30`): "scans with Trivy" becomes "with the
  Trivy release `tools/trivy/release.txt` names, its SHA-256 checked"; `:30`, where the SBOM is "kept as a run
  artifact", gains "made by that binary". An appended note names Part 6.
- **`docs/runbooks/ci.md`**:
  - the `images` row (`ci-deps:33`) and the triage line (`:83`) gain three failures, each with its remedy: a SHA-256
    mismatch, which you never bypass (re-run `pnpm trivy:pin` and read the diff); a stale database (re-run; if it
    persists, read ghcr's created time); ghcr unreachable after three tries (re-run; never add a mirror);
  - the cache paragraph (`:197`) gains: the database from ghcr only, the 48-hour floor, the archive cache keyed by its
    SHA-256 in `ci.yml` only.
- **`docs/runbooks/dependency-upgrades.md`** (ci-deps' runbook): a "Trivy" section (§6), including a withdrawn release.
- **reconciliation-001**: no change. Its supply-chain check names Trivy scans, which still run.

## 6. Who bumps it, and how a newer Trivy surfaces

Dependabot cannot, and Renovate is not used. A person bumps it at the weekly triage, which already reads
`check-toolchain`'s pnpm warning and Dependabot's runs (§3.2.1):
1. A push run's `static` log, and the run summary's annotations, carry `::warning title=Trivy::trivy vX.Y.Z (signed
   <time>) is newer than tools/trivy/release.txt's A.B.C and at least three days old; run pnpm trivy:pin X.Y.Z`.
2. `pnpm trivy:pin X.Y.Z` writes the file. A one-file pull request follows, and its `static` re-verifies it on
   GitHub's runners (T4) while `images` scans both images with it.
3. If the new Trivy reports new HIGH or CRITICAL findings, they are real: the runbook's `images` triage applies.
4. **A withdrawn pinned release** (the push warning, or `images` failing at download) is treated as compromised: re-pin
   with `pnpm trivy:pin` to the previous or the next release that passes; never point at a mirror without the hash.

**An urgent Trivy fix under three days old gets no exclude** (C7). P1 records the same (`p1-design.md:343-345`).

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
- **C7. One floor, imported, and no exclude for Trivy.** The floor is P1's `releaseAgeMinutes` (or ci-deps' constant
  until P1 lands), so the npm, action, image and Trivy floors cannot drift. Every other floor has a dated security-fix
  exclude; the scanner alone gets none, the safer option: it reads only our own images on ephemeral runners, so
  waiting three days for a scanner fix costs little, while a young release is exactly the March 2026 shape and an
  exclude is the path an attacker with release credentials would need. P1 already assumes this (`p1-design.md:343-345`).
  If the founder ever wants one, it is a `trivy` kind in P1's exception file under the shared window; recorded under
  Revisit, not built.
- **C8. The archive is cached in `ci.yml` only, keyed by its SHA-256.** It keeps pull-request lanes up through a
  release-host outage and saves 52 MB a job, and it is safe because the script re-hashes what is restored. The release
  workflows stay cache-free by ci-deps' rule.

## 8. Tests (failing first) and the test-matrix rows

Failing first, run on the merge base with the new tests: `CI_TREE=<git archive of the merge base>` plus `pnpm vitest
run tools/test/workflows.test.ts tools/test/no-duplicated-versions.test.ts tools/check-action-pins tools/trivy`. The new
assertions fail on four trivy-action steps, on no `release.txt` and on no install step. Every networked case uses
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
  - 0.69.4 fails as hijacked, and 0.69.2 fails as older than 0.69.3;
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
  a body over the cap.
- `tools/trivy/install.test.ts` uses stub `curl` and `trivy` on `PATH`, in a temporary directory as
  `tools/ci/postgres.test.ts` does:
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
| CI-25 | A hijacked or young Trivy release refused | A changed pin needs the tag's commit, a Sigstore signature from Trivy's release workflow at that tag and commit under Sigstore's trust root, the committed digest, and one tlog entry at least three days old; a CVE-2026-33634 version fails; on a push a moved tag, a withdrawn asset or a newer three-day-old release warns, and a failed read only warns |
| CI-26 | Trivy's database fresh and from its publisher | Each job downloads the database once, from ghcr.io only and untagged, before any scan, with telemetry and the update check off; a database over 48 hours old, or one from any other repository, fails the job, and the scans update nothing |

`registry.ts` entries, in the CI-11 to CI-14 form (`ci-deps:packages/synth/src/cases/registry.ts:463-466`):
- `'CI-24': none(0, 'The workflows and tools/trivy/release.txt are read; the install script runs against stub downloads in a temporary directory; no file.', ['tools/trivy/install.test.ts', 'tools/test/workflows.test.ts', 'tools/test/no-duplicated-versions.test.ts'])`;
- `'CI-25': none(0, 'Tags, the trust root, bundles and checksums are synthetic and built in memory; no file.', ['tools/check-action-pins/trivy.test.ts', 'tools/check-action-pins/der.test.ts'])`;
- `'CI-26': none(0, "The workflows' env is read; the database script runs against a stub trivy; no file.", ['tools/trivy/db.test.ts', 'tools/test/workflows.test.ts'])`.

The sentence at `test-matrix.md:211-213` gains "CI-24 to CI-26 are Trivy's (Part 6)".

## 9. Builders

One builder. The change is about 550 lines: two scripts, one checker module and its helpers, tests and documents. It is
sequential, because the checker's offline rules and the workflow rewrite share `workflows.test.ts`. The order of
commits:
1. the tests, failing;
2. `network.ts`' `getBytes`, `base.ts`' `changedSince`, the checker and the `@sigstore/*` packages with the lockfile;
3. `release.txt` (written by `pnpm trivy:pin 0.76.1 --offline-root`, its values checked against §2), `install.sh`
   and `db.sh`;
4. the three workflows;
5. the documents.

What cannot be verified here (§6 of the plan): no Docker daemon, no runner. tuf-repo-cdn.sigstore.dev and
get.trivy.dev are refused by this session's proxy (01:46Z). The embedded seed root does verify v0.76.1 (§2), so the
builder proves `pnpm trivy:pin --offline-root` offline first; the live TUF path first runs in the pull request's
`static`, and the scans in its `images` and release-dry-run. The PR records those job ids.

## 10. Risks and rollback

| Risk | Mitigation |
|---|---|
| v0.76.1 reports findings v0.70.0 did not, and `images` goes red | That is the point. The PR's own `images` run shows them before merge; the runbook's triage fixes them in the PR |
| ghcr.io rate-limits or is down | `db.sh` tries three times, then fails naming ghcr.io; the remedy is a re-run. There is no fallback by choice (C3); a lasting problem is a Revisit, never a silent mirror |
| A database older than 48 h because Aqua's build stalls | `db.sh` fails with the times. The remedy is a re-run, or a founder-ruled raise of the floor, never a skip |
| Aqua withdraws or re-cuts the pinned release, or the release host is down | Pull-request lanes run from the hash-checked cache (C8). A push run warns on the asset's 404 first. `release.yml` and the dry run fail at download; the runbook re-pins to a verified release (§6 step 4), never to a mirror |
| Sigstore's TUF root or Rekor unreachable on a pin PR | It fails closed after three tries, naming the host. Only `release.txt`/checker PRs read it |
| `@sigstore/*` change their API | Exact versions in the lockfile; bumps come through Dependabot's npm group and the checker's tests catch them |
| Fulcio stops issuing .1.13/.1.14 | (3) fails closed on a missing extension, and `pnpm trivy:pin` names it |
| Asset naming changes upstream | `pnpm trivy:pin` fails on the new version, naming the missing asset; the person adapts `install.sh` |

Rollback is one revert commit. Trivy's verdict is unchanged in kind: the same severities, the same `ignore-unfixed`,
the same exit codes.

## 11. Interplay

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

Open: the GHSA for CVE-2026-33634 is still unread from this session (the builder cites it in Part 6); the exact
`@sigstore/*` versions and their publish times are taken at build time; the live TUF path is first exercised in the
pull request's `static`.
