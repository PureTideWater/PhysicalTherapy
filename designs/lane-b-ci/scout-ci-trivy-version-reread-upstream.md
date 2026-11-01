# P2 re-read scout: versions, upstream facts and runs (2026-11-01, 17:24 to 17:36 UTC)

Design: `/home/user/ops/designs/lane-b-ci/follow-up-p2-trivy-version.md` (cited as `design:<line>`). Code cites are
`/home/user/ci-trivy-version` at bce57f16 (`bce57f16:<file>:<line>`). Network reads carry their UTC time. Scratch
scripts: `/home/user/laneb-sp/p2reread/scripts/{verify-trivy.mjs,verify-oids.mjs,trust.py,oci.sh}`. The downloads and
clones under `tmp/` were removed when the scout finished.

**What this session can and cannot read.** `gh api` and the GitHub MCP tools refuse every `aquasecurity/*` path:
"sessions are bound to their configured repositories". `add_repo` with read access answered "git reads only" (17:24Z).
Attaching the repository with push access was not done, because the rule here is read only. So the release objects
(`published_at`, `immutable`) and `/advisories` were **not read through the API**. Other routes were used instead:
- git over https (`ls-remote` and depth-limited fetches of aquasecurity/trivy, trivy-action, setup-trivy, trivy-db and
  trivy-java-db, github/advisory-database and github/docs);
- release downloads from github.com;
- anonymous OCI reads from ghcr.io and mirror.gcr.io;
- registry.npmjs.org, hub.docker.com and pkg.go.dev.

The proxy refused these hosts (CONNECT 403): tuf-repo-cdn.sigstore.dev, rekor.sigstore.dev, get.trivy.dev,
docs.github.com, api.osv.dev, vuln.go.dev and pkg-containers.githubusercontent.com. github.com web pages (including
`releases.atom`) answer 403.

---

## 1. Trivy: the release T1 pins

**v0.76.1 is still the newest release, and it has been old enough since 2026-10-24T11:14:36Z. T1 does not move.**

**Tags** (`git ls-remote --tags https://github.com/aquasecurity/trivy`, 17:24Z):
- The newest stable tag is `v0.76.1` (lightweight) → `e713f67f7d54decdcd9b3132c9751833dcced698`, committed
  2026-10-21T10:20:32Z: "release: v0.76.1 [release/v0.76] (#11445)" (depth-1 fetch).
- Nothing newer, and no `-rc` tags.
- `refs/heads/release/v0.76` = `e713f67f`.
- **v0.77.0 is pending.** `refs/heads/release-please--branches--main` = `586c9563` "release: v0.77.0 [main]",
  2026-10-30T13:50:56Z, `.release-please-manifest.json` `{".":"0.77.0"}`. It is untagged at 17:24Z. If it is tagged at
  time T, it becomes old enough at its bundle's `integratedTime` + 72 h. At the earliest that is 2026-11-04, if it is
  tagged today.
- The release cadence, from the tag commits: v0.72.0 06-30, v0.73.0 08-03, v0.74.0 08-14, v0.75.0 10-01, v0.76.0
  10-14, v0.76.1 10-21.

**Is any release since 0.76.1 under three days old?** No. There is no release since 0.76.1.

**Assets** (downloaded 17:24Z from `github.com/aquasecurity/trivy/releases/download/v0.76.1/…`, each a 302 to
`release-assets.githubusercontent.com/github-production-release-asset/180687624/…`):

| Asset | Bytes | SHA-256 |
|---|---|---|
| `trivy_0.76.1_Linux-64bit.tar.gz` | 52,676,794 | `c7cbe3137fb8a48a17574bede3dd6beb16742d1e9772929940fc90082c39d9c0` |
| `trivy_0.76.1_checksums.txt` | 2,121 | `885debc41b570179e81af560e5f393a66be29b9ff8c52915674f3eb2304c535d` |
| `trivy_0.76.1_Linux-64bit.tar.gz.sigstore.json` | 10,383 | `6955f0366357d5b44ebe8ab312b5c70c02b59e19203005c8239ae64350669ca1` |

The tarball's SHA-256 matches the `checksums.txt` line and the bundle's `messageDigest`. All three equal `design:47`.

**Signature.** Checked with `@sigstore/verify` 4.1.2 against the trusted root in `@sigstore/tuf` 5.0.0's `seeds.json`
(`node scripts/verify-trivy.mjs`, 17:26Z):
- Policy `{SAN …/reusable-release.yaml@refs/tags/v0.76.1, issuer https://token.actions.githubusercontent.com}` returns
  **VERIFY OK**.
- The same bundle checked against SAN `@refs/tags/v0.76.0` fails with `UNTRUSTED_SIGNER_ERROR`.
- A tarball truncated to 1 MB fails with `SIGNATURE_ERROR`.

**The bundle.**
- `application/vnd.dev.sigstore.bundle.v0.3+json`.
- One tlog entry: hashedrekord 0.0.1, logIndex 3354989152, **integratedTime 1792581276 = 2026-10-21T11:14:36Z**, with an
  inclusion promise and an inclusion proof.
- One RFC 3161 timestamp.

**Signing identity**, from the verified signer's OIDs, 1.3.6.1.4.1.57264.1.x:

| OID | Value |
|---|---|
| .9 and .18 (build and config URI) | `https://github.com/aquasecurity/trivy/.github/workflows/reusable-release.yaml@refs/tags/v0.76.1` and `…/release.yaml@refs/tags/v0.76.1` |
| .10, .13 and .19 (commit) | `e713f67f…` |
| .14 (source ref) | `refs/tags/v0.76.1` |
| .12 (source repository URI) | `https://github.com/aquasecurity/trivy` |
| **.15 (source repository ID)** | **`180687624`**, the same ID as in the asset URL |
| **.17 (owner ID)** | **`12783832`** |
| .11 (runner environment) | `github-hosted` |
| .20 (trigger event) | `push` |
| .21 (run URI) | `…/actions/runs/39586330915/attempts/1` |
| .22 (repository visibility) | `public` |

**`published_at`.** Not read: the API is refused. Two times corroborate it:
- the `.sigstore.json` asset's `Last-Modified` is Wed, 21 Oct 2026 11:18:30 GMT (`curl -I`, 17:27Z);
- Docker Hub's `aquasec/trivy:0.76.1` has `tag_last_pushed` 2026-10-21T11:16:45Z, digest `sha256:790fd66d…`.

So the release was published at about 11:18 to 11:20Z on 2026-10-21. Its age counts from the Rekor time,
2026-10-24T11:14:36Z.

**Upstream's release pipeline at v0.76.1, which `main` e2c05f7a still has:**
- `reusable-release.yaml:37-42` grants `id-token`, `contents` and `attestations: write`.
- `:105-110` runs GoReleaser v2.16.0.
- **`:137-141` runs `actions/attest@1e69f48a` (v4.2.2) with `subject-checksums: dist/trivy_<v>_checksums.txt`.**
  Trivy now publishes GitHub build-provenance attestations as well as the cosign bundles (`goreleaser.yml:175-184`,
  `cosign sign-blob --bundle=${artifact}.sigstore.json`, every artifact). `goreleaser.yml:74-77` sets no `draft:` key.
- Whether the attest step ran for v0.76.1 was **not verified**: the attestations API and aquasecurity's Actions runs are
  refused here.

**Advisories.** I read github/advisory-database at `8c754a94` (2026-11-01T15:35:41Z), `advisories/github-reviewed/2025`
and `2026` (15,920 files). Five name Trivy packages:

| GHSA | CVE | Package and range | Severity | Published |
|---|---|---|---|---|
| GHSA-69fq-xp46-6x23 | CVE-2026-33634 | trivy **= 0.69.4 only**; trivy-action < 0.35.0; setup-trivy < 0.2.6 | critical | 2026-03-24 |
| GHSA-q3fv-x8vg-qqm4 | CVE-2026-54448 | trivy < 0.71.0 (Helm tar bomb) | high | 2026-07-14 |
| GHSA-mcj4-mphf-j9ff | CVE-2026-55092 | trivy < 0.71.1, **"path traversal via a crafted vulnerability database or other downloaded artifacts"** | high | 2026-08-25 |
| GHSA-8rc5-4fr6-64pw | CVE-2026-63328 | trivy < 0.72.0 (plugin manager path traversal) | moderate | 2026-08-18 |
| GHSA-9p44-j4g5-cfx5 | CVE-2026-26189 | trivy-action ≥ 0.31.0 < 0.34.0 | moderate | 2026-02-18 |

**None affects trivy 0.76.1.** pkg.go.dev/vuln/list (17:34Z) shows the same Go entries: GO-2026-6294, 6250, 5983 and
4919, and the old GO-2024-2870.

**What GHSA-69fq-xp46-6x23 says.** The design's last open item, "GHSA unread" (`design:509`), is now closed:
- Immutable releases were "enabled March 3, before v0.69.3 was published" on aquasecurity/trivy, and "enabled March 4"
  on trivy-action.
- v0.69.4 was made by pushing commit `1885610c`, with `actions/checkout` swapped to an impostor and goreleaser given
  `--skip=validate`. The commit was then tagged, so **Trivy's own release pipeline built and signed it**.
- The malicious code "was not committed to Trivy's main branch".
- Exposure: v0.69.4 from 2026-03-19 18:22 to about 21:42 UTC (about 3 h). setup-trivy for about 4 h, trivy-action for
  about 12 h. Docker Hub `0.69.5` and `0.69.6` from 2026-03-22 15:43 to 2026-03-23 about 01:40.
- 0.69.5 and 0.69.6 were Docker Hub images only: "No corresponding GitHub tags or releases existed".
- The IoC for `trivy_0.69.4_Linux-64bit.tar.gz` is `385d498d18a3a7c67878ca7322716f9da25683eb1a4bf9e9592da0d5f2ab09f6`.
- **Ancestry.** `refs/heads/release/v0.69` still ends at v0.69.3's `6fb20c8e` (2026-03-03, depth-40 fetch), so v0.69.4's
  commit is on no release branch. v0.76.0 `531360e` ("[main]") and v0.76.1 `e713f67` are both ancestors of
  `release/v0.76` (`git merge-base --is-ancestor`, depth-30 fetch, 17:35Z).

## 2. trivy-action and setup-trivy

**trivy-action** (`git ls-remote`, 17:29Z):
- **`v0.36.0` is still the latest tag.** It is annotated: tag object `a9c7b0f0`, which peels to
  **`ed142fd0673e97e23eac54620cfb913e5ce36c25`**. The tagger is Nikita Pivkin, at 1776850199, SSH-signed. The commit is
  dated 2026-04-22T15:20:48+06:00. **The tag still names our pin.**
- Its release is `immutable: true`, `published_at` 2026-04-22T09:39:33Z, as P1's CI run read it
  (`bce57f16:docs/adr/0066-…md:1529`).
- At v0.36.0, `action.yaml:98-101` defaults `version` to **`v0.70.0`**, and `:129` nests setup-trivy `@3fb12ec1`
  (v0.2.6). This is unchanged.
- `master` = `8f28faec` (2026-10-21, "chore(deps): Update trivy to v0.76.1 (#591)") defaults to `v0.76.1`
  (`action.yaml:101`) and nests setup-trivy `@81e51434` (v0.3.1) (`:129`). **This is unreleased.**
- The tag list now holds `0.35.0` and `v0.0.1` to `v0.36.0`. `v0.0.10`, `v0.34.1` and `v0.34.2` are still missing, as
  the GHSA says.

**setup-trivy:**
- Tags: `v0.2.6` `3fb12ec1`, `v0.3.0` `151a37f2` (2026-06-02, "fix!: prevent script injection in run blocks"), and
  `v0.3.1` `81e51434` (2026-06-03), which is also `main`.
- At v0.3.1, `action.yaml:6-9` defaults `version` to **`latest`**.
- `:89-100` still checks out `aquasecurity/trivy` at `75c4dc0f…` with the job's token.
- `:113` runs `contrib/install.sh -c setup-trivy`, so the binary still comes from get.trivy.dev and is checked only
  against its own release's checksums. C1's reasoning holds.

**What each installs today:**
- trivy-action v0.36.0, the latest release, installs Trivy v0.70.0.
- trivy-action master would install v0.76.1, but it is unreleased.
- setup-trivy v0.3.1 on its own installs `latest`, with no age floor.

**New hijack or advisory since March 2026:** none. The only reviewed advisories for these two actions are
GHSA-9p44-j4g5-cfx5 (February) and GHSA-69fq-xp46-6x23 (§1), and neither affects v0.36.0 or v0.2.6.

## 3. npm packages P2 adds

**The lockfile at bce57f16 holds no `@sigstore/*`, `tuf-js` or `@tufjs/*`** (`grep -c -i sigstore pnpm-lock.yaml` = 0).

**Scratch resolve.** I ran `pnpm install` (pnpm 10.34.8, 17:25Z) on the design's four packages, with this repository's
`minimumReleaseAge: 4320` and `trustPolicy: no-downgrade`. It resolved **14 packages and passed both gates**.

The table below lists the versions resolved and the ones to pin. "Trusted" means a trusted publisher. The no-downgrade
check passed, because no earlier version carries stronger evidence. Times come from registry.npmjs.org documents read at
17:25Z.

| Package | Version | Published | Evidence | In bce57f16's lockfile |
|---|---|---|---|---|
| `@sigstore/verify` | **4.1.2** (latest) | 2026-08-04T21:34:43Z (89 d) | trusted | no |
| `@sigstore/bundle` | **5.0.0** (latest) | 2026-06-01T21:02:52Z (153 d) | trusted | no |
| `@sigstore/tuf` | **5.0.0** (latest) | 2026-06-01T21:02:52Z (153 d) | trusted | no |
| `@sigstore/protobuf-specs` | **0.5.2** (latest) | 2026-08-21T20:09:34Z (72 d) | trusted | no |
| `@sigstore/core` (transitive) | 4.0.1 (latest) | 2026-06-25T22:33:24Z | trusted | no |
| `tuf-js` (transitive) | 6.0.0, now; **6.0.1 is latest** | 6.0.0 2026-06-01; **6.0.1 2026-10-29T18:27:09Z, old enough from 2026-11-01T18:27:09Z** | trusted | no |
| `@tufjs/models` (transitive) | 5.0.0, now; **5.0.1 is latest** | **5.0.1 2026-10-29T18:25:36Z, old enough from 2026-11-01T18:25:36Z** | trusted | no |
| `@tufjs/canonical-json` | 2.0.0 | 2023-08-17 | provenance | no |
| `@gar/promise-retry` | 1.0.3 | 2026-03-18 | none (no version has any) | no |
| `debug`, `ms`, `minimatch`, `brace-expansion`, `balanced-match` | 4.4.3, 2.1.3, 10.2.6, 5.0.12, 4.0.4 | — | — | **yes** (`pnpm-lock.yaml:2634, 3288, 3284, 2557, 2545`) |

- **Nine packages are new to the lockfile.**
- Engines: `@sigstore/*` 4.x and 5.x and `tuf-js` 6 need `^22.22.2 || ^24.15.0 || >=26.0.0`. CI uses
  `node-version: 24` (`bce57f16:.github/workflows/ci.yml:45`), and this machine runs 24.22.0.
- `tuf-js` 6 uses `@gar/promise-retry` and Node's fetch. `make-fetch-happen` is no longer in the tree.

**The audit finding the design does not foresee.** `pnpm audit` reports **GHSA-g3hv-75wg-m249**: minimatch < 11.0.1,
moderate, published 2026-10-30T23:09:55Z. It is reached through `@sigstore/tuf > tuf-js > @tufjs/models > minimatch
10.2.6`. `@tufjs/models` 5.0.0 and 5.0.1 require `minimatch ^10.2.1` and `^10.2.6`, so no fixed version is in range.
- `bce57f16:ci.yml:77` runs `pnpm audit --prod`, which fails at any severity.
- At bce57f16 that audit is clean, because every minimatch path is a development path (eslint, stryker,
  typescript-eslint). `pnpm audit --audit-level=high` (`:80`) passes with one moderate finding (worktree run, 17:28Z).
- In the scratch project, with the four packages as `dependencies`, **`pnpm audit --prod` exits 1** (17:28Z).
- **So P2 must put them in `tools/package.json` `devDependencies`,** where `yaml`, which the checker already uses, sits.
  The design does not say which (`design:239-243`).

**Advisories** (advisory-database `8c754a94`):
- GHSA-xgjw-pm74-86q4: `@sigstore/verify` 3.1.0 only.
- GHSA-jfc7-64v2-mr8c: `@sigstore/core` < 3.2.1.
- GHSA-52v5-jr5w-gjxr: `sigstore` < 4.1.1. "`certificateOIDs` verification constraints are silently dropped and never
  enforced".
- None affects the versions above. The last one shows why P2's own OID check needs a failing test, which it has
  (`design:374-375`).

**API fact.** `@sigstore/verify` 4.1.2's `VerificationPolicy` takes `oids` (`dist/shared.types.d.ts`), enforced in
`dist/verifier.js:151-152` and `dist/policy.js` `verifyOIDs`. Each value is the extension's OCTET STRING content, the DER
UTF8String. A policy carrying `.1.13 = e713f67…`, `.1.14 = refs/tags/v0.76.1`, `.1.15 = 180687624` and
`.1.17 = 12783832` **returns OK on the real bundle**. With `.1.13` set to v0.76.0's commit it fails
`UNTRUSTED_SIGNER_ERROR … missing OID 1.3.6.1.4.1.57264.1.13` (`scripts/verify-oids.mjs`, 17:33Z).

**Pin:**
- `@sigstore/verify` **4.1.2**, `@sigstore/bundle` **5.0.0**, `@sigstore/tuf` **5.0.0** and `@sigstore/protobuf-specs`
  **0.5.2**, exact, as `devDependencies`.
- Let `pnpm install --lockfile-only` choose the transitive versions under the age gate. Before 18:27Z today it picks
  tuf-js 6.0.0 and models 5.0.0; after that it picks 6.0.1 and 5.0.1. Both pass, so record whichever it picks.

**Reasons.**
- Each is the newest release and more than three days old.
- Each is from a trusted publisher, with no downgrade anywhere in its history.
- No advisory applies, and these are the versions the verification above actually exercised.
- `@sigstore/protobuf-specs` is needed for `TrustedRoot.fromJSON` and its types. The design names it without a version.

## 4. The vulnerability database

**Read anonymously at 17:31Z** (`scripts/oci.sh`, with a token from `ghcr.io/token`):

| Repository | Manifest | `org.opencontainers.image.created` | Age at 17:31Z | Layer |
|---|---|---|---|---|
| `ghcr.io/aquasecurity/trivy-db:2` | `sha256:9fef48b3ecf9d52f38e7fd3cb076819abbf8d52dd20369962d8f99361bebff3e` | 2026-11-01T13:10:29Z | 4 h 21 m | `db.tar.gz` `sha256:2d48900d266bd8bbdc04d839aebc9a21821820f61bec16d21bd50cdf9822fcc9`, 137,610,443 B |
| `mirror.gcr.io/aquasec/trivy-db:2` | `sha256:610ba6fde4f1196dd4c3f5cab237075ff6d1882b76bdc6f5ec63f72235acb783` | 2026-11-01T13:10:37Z | — | same layer |
| `ghcr.io/aquasecurity/trivy-java-db:1` | `sha256:65a4fcd5670bdb3dc2faf970a35fe81f828266e6c62deb37216e427d7982b58c` | 2026-11-01T01:00:06Z | 16 h 31 m | `javadb.tar.gz` `sha256:a50ce8f16abc83fa133aa2065399d85ec10312e0fa6891f847b5e931080ba13e`, 993,096,515 B |
| `mirror.gcr.io/aquasec/trivy-java-db:1` | `sha256:b879dacf130d4c1830215cd5cbb9378a69a2f96c4895bf6a5de41e73f274f2f0` | 2026-11-01T01:00:16Z | — | same layer |

- **Still unsigned.** ghcr tags are `1`, `latest` and `2` for trivy-db and `1` for java-db. The referrers endpoint
  answers `MANIFEST_UNKNOWN`. trivy-db's `cron.yml` contains no cosign.
- ghcr sent no rate-limit headers.
- A blob GET answers **307 to `pkg-containers.githubusercontent.com`**. That host was refused here, so
  `metadata.json`'s `UpdatedAt` and `NextUpdate` were **not read**. The `created` annotation stands in for them.
- **Cadence.**
  - trivy-db `.github/workflows/cron.yml:4-5` is `"0 */6 * * *"` (aquasecurity/trivy-db HEAD `4baa24d2`, 2026-10-27).
    It pushes to ghcr.io, public.ecr.aws and docker.io `aquasec/` (`:93-100`).
  - trivy-java-db `cron.yml:5` is `"0 0 * * *"`, daily.
- **Upstream code is unchanged at v0.76.1:**
  - the mirror is first (`pkg/flag/db_flags.go:53-64`, `pkg/db/db.go:31-36`, `pkg/javadb/client.go`);
  - `shouldTryOtherRepo` is at `pkg/oci/artifact.go:310`;
  - the `Artifact successfully downloaded repo=` line is at `:293`;
  - the comma split is in `pkg/flag/options.go:191-199`;
  - telemetry is covered by `docs/guide/advanced/telemetry.md:33, 42`, and the flags by `pkg/flag/scan_flags.go:130, 136`.
- **Is the 48-hour floor realistic?** On the published cadence, 48 h spans eight scheduled builds, and today's database
  is 4 h old. **The history of how often it was older than 48 h is not verified.** aquasecurity's Actions runs are refused
  here, and the registries keep only the current tag. Docker Hub keeps only `tag_last_pushed`.
  - There are two samples: 2026-10-26T01:27:52Z, read 16 minutes later (`design:100`), and today's 4 h 21 m.
  - GitHub can delay or skip scheduled workflows under load, so a stall of a few builds is possible. One of more than
    eight is needed to breach 48 h.
  - The floor and any exclude are the founder's rulings. They are reported here, not changed.
- **What our runs use today.** In push run 41330911483 (bce57f16), `images` job 124920631345 (ubuntu-26.04):
  - `install.sh … -c setup-trivy v0.70.0`;
  - `Downloading artifact… repo="mirror.gcr.io/aquasec/trivy-db:2"` and `Artifact successfully downloaded
    repo="mirror.gcr.io/…"` (17:21:34Z and 17:21:39Z, 131.24 MiB in 4.2 s);
  - the second scan reused the database;
  - **"Version 0.76.1 of Trivy is now available, current version is 0.70.0"**, printed twice. This is the update check
    T8 turns off.

  Because our runs pull from the mirror, they say nothing about ghcr's anonymous limits (C3's cost, **not verified**).
  The release-dry-run push run 41330911485 has build jobs 124920630961 and 124920631202 (ubuntu-24.04). They run the
  SBOM step only, download no vulnerability database, and print the same update notice. `release.yml` has never run
  (`total_count` 0).

## 5. GitHub's documented behaviour for release assets and tags

**Downloads.** `https://github.com/<o>/<r>/releases/download/<tag>/<asset>` answers 302 to
`release-assets.githubusercontent.com/github-production-release-asset/<repo id>/…`, which answers 200 with
`Last-Modified` and `ETag`. `curl -I` follows the redirect, so `HEAD` works for the push-mode asset check (17:27Z).

**Immutable releases.** From github/docs at `33b1f4a6` (2026-10-31T07:47:08Z), which I read through git because
docs.github.com is refused:
- `content/code-security/concepts/supply-chain-security/immutable-releases.md`:
  - `:22`: the tag "cannot be changed, and cannot be deleted while the release exists. If you delete the immutable
    release, you can delete the tag, but you cannot reuse the same tag name".
  - `:23`: assets cannot be modified or deleted.
  - `:25`: the title and notes can still be edited.
  - `:27`: an immutable release generates a **release attestation**, which covers the tag, the commit SHA and the
    assets.
  - `:30`: protection against repository resurrection.
- `content/repositories/releasing-projects-on-github/managing-releases-in-a-repository.md:37` (create as a draft first)
  and `:84` (no add, replace or delete of assets, no tag move).
- `content/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/verify-release-integrity.md:25-35`:
  `gh release verify <tag>` and `gh release verify-asset <tag> <file>`.

**Does aquasecurity/trivy publish immutable releases?**
- **The `immutable` field was not read for aquasecurity/trivy**, because the API is refused here.
- GHSA-69fq-xp46-6x23 says immutable releases were enabled on aquasecurity/trivy on 2026-03-03 and on trivy-action on
  2026-03-04. The trivy-action v0.36.0 release reads `immutable: true` in P1's CI run (`bce57f16:docs/adr/0066…:1529`).
- So v0.76.1, published 2026-10-21, should be immutable. CI's `static` job can confirm it, because it already reads
  release `published_at` and `immutable` for action pins with the job's read-only token
  (`bce57f16:tools/check-action-pins/age.ts:24-27, 606-611`; `ci.yml:91`).

**What immutability changes for the design:**
- On an immutable release, **the tag cannot move and the asset cannot be swapped, but the release can be deleted.**
  That is what happened to v0.69.4.
- **A new malicious release can still be published by a credential holder through the real pipeline.** v0.69.4 was
  published on 2026-03-19, after immutable releases were enabled on 2026-03-03.
- So immutability does not replace the signature, the age floor or the committed hash. It makes "moved tag" nearly
  impossible, and it turns "re-cut" into "withdrawn".

---

## Notes and proposals outside this item (seen in passing)

- The design's code cites predate P1. At bce57f16:
  - `tools/check-action-pins/network.ts` has `get(url, signal, headers): Promise<Answer{status,text,headers}>` (`:62`),
    plus `fetchRefs` (`:71`), `isAncestor` (`:76-77`) and `fetchSha` (`:80`). It has no `getBytes`.
  - `releaseAgeMinutes` is exported at `tools/check-toolchain/exclude-window.ts:29`, so the fallback to
    `MINIMUM_RELEASE_AGE_MINUTES` (`design:224-225`) is moot.
  - The workflows' Trivy steps are now at `ci.yml:695, 720`, `release.yml:121, 132` and `release-dry-run.yml:132`.
    release-dry-run already writes the SBOM, but does not scan.

  The code re-read should take these up.
- If trivy-action releases v0.37.0 from its current master, Dependabot will open a github-actions bump after its 7-day
  cooldown (CQ1). Dependabot PRs are never merged here, and P2 retiring the action makes the bump moot. The weekly
  triage can simply leave it.
- Proposal (gitleaks, already in §11): the same advisory read and ancestry rule would apply there.

## Changes the design needs

1. **The "latest Trivy" fact** (`design:44`, "lists nothing newer than v0.76.1").
   - **Add:** "Re-read 2026-11-01T17:24Z: still nothing newer. v0.77.0 is pending as release-please's PR branch
     `586c9563` (2026-10-30T13:50:56Z, manifest 0.77.0), untagged. Run `git ls-remote` again just before
     `pnpm trivy:pin`. A v0.77.0 tagged at T is pinnable from its `integratedTime` + 72 h."
   - **T1 stays v0.76.1.**
   - Evidence: §1.
2. **The re-verification line** (`design:56-59`).
   - **Add the re-verification** (2026-11-01T17:26Z, same result; SHA-256 values of `checksums.txt` and the bundle as
     in §1).
   - **Add the identity OIDs:** `.1.15 = 180687624`, `.1.17 = 12783832`, `.1.18 = …/release.yaml@refs/tags/v0.76.1`,
     `.1.20 = push`, and the run URI `39586330915`.
   - Evidence: §1.
3. **Check (3) of §3** (`design:218-220`, the OIDs decoded by `der.ts` after verification).
   - **Change to:** "Pass the expected values in the policy's `oids`: `.1.13` = `commit`, `.1.14` = `refs/tags/v<v>`,
     `.1.15` = `180687624` (the source repository's numeric ID) and `.1.17` = `12783832` (the owner's). Each is
     DER-encoded by `der.ts`, so `@sigstore/verify` refuses any mismatch (`verifier.js:151-152`). The explicit
     post-verification compare is kept, with its failing tests, because GHSA-52v5-jr5w-gjxr shows a wrapper silently
     dropping OID constraints."
   - The numeric IDs survive a rename or a resurrected repository, which the SAN string does not.
   - **Tests:** add a certificate with another `.1.15` or `.1.17`.
   - Evidence: §3 (`verify-oids.mjs`).
4. **The March 2026 facts and their sources** (`design:73-80`, "Sources: Debian's tracker and Docker Scout's entry … the
   builder reads the GHSA in a browser"; and `design:509`, "Open: the GHSA … is still unread").
   - **Change to:** cite GHSA-69fq-xp46-6x23 (published 2026-03-24T17:53:12Z, modified 2026-03-30T20:51:03Z; read from
     github/advisory-database `8c754a94`, `advisories/github-reviewed/2026/03/GHSA-69fq-xp46-6x23/…json`).
   - **Add:**
     - the Go range is `0.69.4` only;
     - 0.69.5 and 0.69.6 were Docker Hub images with no GitHub tag or release;
     - v0.69.4 was built and signed by Trivy's own release pipeline from an attacker-pushed tag on commit `1885610c`;
     - the exposure ran from 18:22 to about 21:42 UTC;
     - immutable releases were enabled on trivy on 2026-03-03 and on trivy-action on 2026-03-04.
   - **Drop the open item.**
5. **`HIJACKED` and the floor** (`design:200-201`, "`HIJACKED = { trivy: ['0.69.4', '0.69.5', '0.69.6'] }` … at least
   0.69.3").
   - **Change to:** keep the list, with 0.69.5 and 0.69.6 marked "Docker Hub images only". Raise the static floor to
     **0.72.0**, the first version outside GHSA-q3fv-x8vg-qqm4 (< 0.71.0), GHSA-mcj4-mphf-j9ff (< 0.71.1) and
     GHSA-8rc5-4fr6-64pw (< 0.72.0).
   - **Add a networked read** at pin time and on push: `GET /advisories?ecosystem=go&affects=github.com/aquasecurity/trivy@<v>`
     with the job's token. P1 already reads `/advisories/<id>` that way (`age.ts:749`). Any reviewed advisory fails a
     pin and warns on a push.
   - GHSA-mcj4 is a path traversal through a crafted vulnerability database, the very artifact T7 guards. A floor that
     admits it contradicts C3.
   - **Tests:** 0.71.1 fails as below the floor, and a version an advisory names fails.
   - Evidence: §1.
6. **New check (1b)**, after `design:209`.
   - **Add:** "The tag's commit is an ancestor of `refs/heads/release/v<X.Y>`, the branch Trivy's release-please cuts.
     This uses a treeless fetch and `isAncestor`, the transport P1 added (`network.ts:71-80`), with the branch named.
     v0.76.0 `531360e` and v0.76.1 `e713f67` are both on `release/v0.76`. `release/v0.69` still ends at v0.69.3's
     `6fb20c8e`, so v0.69.4's `1885610c` would have failed."
   - **Tests:** a commit off the branch fails, and on a push it warns.
   - Evidence: §1, and `age.ts:653`, P1's ancestry rule for actions.
7. **Immutable releases and attestations** (`design:273-274`, the Revisit "Trivy publishes GitHub immutable releases and
   attestations (then `gh attestation verify` could replace the bundle check)").
   - **This condition is met now.** Immutable releases have been on since 2026-03-03 (GHSA-69fq), and
     `reusable-release.yaml:137-141` at v0.76.1 runs `actions/attest`.
   - **Replace with a decision:**
     - Keep the Sigstore bundle check. It binds the signer's workflow, ref, commit and repository ID. GitHub's release
       attestation binds only asset to release, and immutability did not stop v0.69.4.
     - **Add on CI:** read `repos/aquasecurity/trivy/releases/tags/v<v>` with the job's token, as `age.ts:606-611`
       does. Require `immutable: true` and hold `published_at` to the floor as a second time, taking the youngest of
       the times read, as P1 does. Locally the read is skipped and noted (`age.ts:797`'s form).
     - Push mode warns when the release reads 404 or not immutable.
   - Revisit becomes: "GitHub's release attestation or `gh attestation verify` adds an identity check the bundle lacks."
   - **Tests:** a non-immutable release fails, and a `published_at` younger than the floor fails.
   - Evidence: §1 and §5.
8. **§10's withdrawal row** (`design:440`, "Aqua withdraws or re-cuts the pinned release").
   - **Change to:** "Aqua withdraws (deletes) the pinned release. Under immutable releases the tag cannot move and the
     asset cannot be replaced while the release exists, and a deleted release's tag name cannot be reused
     (`immutable-releases.md:22-23`). So a re-cut under the same tag is impossible, and the only change is
     disappearance, which the push-mode `HEAD` sees."
   - **Adjust T5** (`design:31`): "moved" becomes rare; "vanished" (the release deleted) is the expected case.
   - Evidence: §5.
9. **`tools/package.json`** (`design:239-243`).
   - **Change to:** "gains, as **`devDependencies`**, `@sigstore/verify` 4.1.2, `@sigstore/bundle` 5.0.0,
     `@sigstore/tuf` 5.0.0 and `@sigstore/protobuf-specs` 0.5.2, exact."
   - **Add:** "Nine packages are new to the lockfile, fourteen in all. tuf-js 6.0.1 and @tufjs/models 5.0.1 are
     old enough from 2026-11-01T18:27:09Z and 18:25:36Z. Record the version pnpm resolves. All pass `trustPolicy:
     no-downgrade`."
   - **Add the reason:** "`pnpm audit --prod` (`ci.yml:77`, any severity) would fail on GHSA-g3hv-75wg-m249 (minimatch
     < 11.0.1, moderate, 2026-10-30), reached through `@tufjs/models`, which pins `^10.2.6`. As development
     dependencies, only `--audit-level=high` (`:80`) applies. That is the state today."
   - Evidence: §3. The scratch `audit --prod` exits 1.
10. **The database facts** (`design:100-104`).
    - **Refresh:** at 2026-11-01T17:31Z, ghcr `sha256:9fef48b3…` (created 13:10:29Z) and mirror `sha256:610ba6fd…`
      (13:10:37Z) share layer `sha256:2d48900d…` (137,610,443 B). The database is still unsigned.
    - **Add the cadence:** trivy-db `cron.yml:4-5`, every 6 h; java-db daily at 00:00Z, its layer 993 MB.
    - **Add:** a ghcr blob GET is a 307 to `pkg-containers.githubusercontent.com`. So `db.sh`'s failure message
      (`design:152`) should name "ghcr.io (blobs from pkg-containers.githubusercontent.com)", and the runbook remedy
      (`design:284`) should say the same.
    - "How often older than 48 h" is not verified. The floor is the founder's and unchanged.
    - Evidence: §4.
11. **"What runs today"** (`design:38-43`).
    - **Add the run evidence:** push run 41330911483 on bce57f16, `images` job 124920631345. It shows Trivy v0.70.0
      through `install.sh -c setup-trivy`, the database from `mirror.gcr.io/aquasec/trivy-db:2`, and the update check
      printing "Version 0.76.1 of Trivy is now available".
    - The release-dry-run build jobs on ubuntu-24.04 run the SBOM only. trivy-action is still latest at v0.36.0, its
      release immutable (ADR 0066:1529). Its unreleased master defaults to v0.76.1 with setup-trivy v0.3.1, and
      setup-trivy v0.3.1 defaults to `latest`.
    - Evidence: §2 and §4.
12. **§9's reachability line** (`design:428-431`).
    - **Add:** rekor.sigstore.dev is also refused, so pin-time Rekor reads rely on the bundle's promise and proof
      offline. The GitHub API for `aquasecurity/*` (releases, `/advisories`, attestations) is refused from this
      session, so the `immutable`, `published_at` and advisory reads of changes 5 and 7 first run in the pull request's
      `static`, and the PR records that job's id.
    - Evidence: the access note at the top.
13. **Optional nit**, in the `HIJACKED` comment: add the GHSA's IoC `385d498d18a3a7c67878ca7322716f9da25683eb1a4bf9e9592da0d5f2ab09f6`
    (v0.69.4 Linux-64bit), so a `linux_x64` equal to it fails whatever the version line says. Evidence: §1.
