# Review of P2 `co-001/ci-trivy-version` (design `follow-ups/p2-design.md`)

Adversarial review, 2026-10-26 ~02:05 to 02:55 UTC. Read only; nothing committed, pushed or posted. Against
`claude/build-platform` 6ddd587, ci-deps at `/home/user/ci-deps` **19e3d98e** (the design cites 2d86bb0e; the one
commit since touches only `tools/test/workflows.test.ts:7, 1901-1912`, so no cite moved), `designs/lane-b-ci.md`
§3.2 and §3.3, `p1-design.md`, and #42's `pr42-files.txt`.

**Counts: 2 blocking, 7 should fix, 10 nits.**

## What I re-measured and found to hold

- Tags (`git ls-remote --tags`): trivy has nothing newer than `v0.76.1` = `e713f67f7d54decdcd9b3132c9751833dcced698`
  (lightweight); v0.69.4 is absent; trivy-action's newest is v0.36.0 (`a9c7b0f…`, peeled `ed142fd…`);
  setup-trivy has only v0.2.6 `3fb12ec…`, v0.3.0 and v0.3.1.
- Assets: `trivy_0.76.1_checksums.txt` lists `c7cbe3137fb8…d9c0  trivy_0.76.1_Linux-64bit.tar.gz`; the tarball,
  downloaded, is 52,676,794 bytes with that SHA-256 (it redirects to `release-assets.githubusercontent.com`). The
  bundle's `messageDigest` (`x8vjE3+4…`) is that digest. v0.69.4, .5 and .6 `checksums.txt` return 404; v0.69.3 200.
- Certificate (openssl): SAN `…/reusable-release.yaml@refs/tags/v0.76.1`; `.1.1` issuer
  `https://token.actions.githubusercontent.com`; `.1.3` and `.1.13` = `e713f67…`; `.1.6`/`.1.14` = `refs/tags/v0.76.1`;
  `integratedTime` 1792581276 = 2026-10-21T11:14:36Z, one tlog entry with promise and proof, plus one RFC 3161 stamp.
- **The bundle verifies.** `@sigstore/verify` 4.1.2 (the version `sigstore@5.0.0` resolves), with the trusted root
  embedded in `@sigstore/tuf` 5.0.0's `seeds.json` and policy `{subjectAlternativeName: …@refs/tags/v0.76.1,
  extensions: {issuer}}`, returns OK on the real tarball; `…@refs/tags/v0.76.0` fails `UNTRUSTED_SIGNER_ERROR`; a
  truncated tarball fails `SIGNATURE_ERROR` (scripts in `scratchpad/p2rev/run/v2.mjs`).
- `trivy-action` `action.yaml` at `ed142fd`: `version` default `v0.70.0` (`:98-101`), `skip-setup-trivy` (`:106-109`),
  setup-trivy at `:129`, cache gate `:140-146`, env mapping `:162-200`. setup-trivy `action.yaml` at `3fb12ec`:
  checkout of `75c4dc0…` with the token (`:64-75`), `install.sh` (`:85`), cache restore/save (`:53-59`, `:98-103`).
  `install.sh` at `75c4dc0`: `github_release` (`:304-313`), same-release checksum (`:59-61`, `:334-350`),
  `get.trivy.dev` tarball (`:390-392`). All as the design says.
- Trivy v0.76.1: `db_flags.go:53-64` defaults mirror.gcr.io first, then ghcr; `pkg/db/db.go:31-36`;
  `options.go:191-199` splits a slice env var on commas, so `TRIVY_DB_REPOSITORY=a,b` works;
  `--disable-telemetry` and `--skip-version-check` exist and the telemetry doc says both are needed.
- `sigstore` 5.0.0 published 2026-06-01T21:02:52Z; `verify(bundle, data, {certificateIdentityURI,
  certificateIssuer, certificateOIDs, tufCachePath, …})` is its API (`dist/sigstore.d.ts:6-7`, `dist/config.d.ts`).
- ci-deps cites: `ci.yml:514, 537`, `release.yml:92-110`, `release-dry-run.yml:14-27, 44`, `check.ts:43-105`,
  `network.ts:33-72`, `verify.ts:113-181`, `check-toolchain/policy.ts:10` (`MINIMUM_RELEASE_AGE_MINUTES = 4320`),
  `check-toolchain/check.ts:219-238`, `workflows.test.ts:176, 450, 571-575, 1213-1237, 1306-1345, 1310`,
  `registry.ts:463-466`, `test-matrix.md:211-213`, `runbooks/ci.md:33, 83, 197`, ADR 0066 `:618`. All hold.
- `docker://` refs are already refused by `check-action-pins/workflows.ts:101`, so a `uses: docker://aquasec/trivy…`
  cannot bypass T6.

---

## Blocking

### B1. The ADR 0062 edit targets a #42 file, for a claim that is false, and §11 says no other #42 file is touched

- **Evidence.** §5 adds "ADR 0062: one appended sentence. The release's SBOM, which the release attests, is now made
  by the verified binary." `docs/adr/0062-screen-prospects-…md` is #42's file (`pr42-files.txt:80`). §11 then says
  "P2 touches four of its files … No other #42 file is touched." It touches five.
- The sentence is also wrong. The release attests the capacity report, not the SBOM:
  `ci-deps:.github/workflows/release.yml:286-290` (`attest-build-provenance` with `subject-path:
  …/screening-capacity.json`). ci-browser says the same (§3.3.1, `lane-b-ci.md:2066-2068`: "The release's attestation
  is the `report` job's … and its bill of materials Trivy's"). ADR 0010:30 records that the SBOM is "kept as a run
  artifact". `grep -n -i 'sbom\|bill of materials\|trivy' docs/adr/0062*` at 6ddd587 finds nothing, so there is
  nothing in ADR 0062 to amend.
- **Fix.** Drop the ADR 0062 bullet. ADR 0010's amendment (`:19, :30`) already covers the release's SBOM. If a pointer
  from 0062 is wanted anyway, list 0062 in §11 as a fifth #42 file under LANES rule 6, with the reason.

### B2. CI-25's tests cannot be written against the API the design names, and the TUF read sits outside `network.ts`

- **Evidence.** §3 verifies with `sigstore`'s `verify(bundle, data, {certificateIdentityURI, certificateIssuer})`
  "against Sigstore's public-good trust root". §8 builds "a bundle built in memory by a test-only signer".
  `sigstore.verify` always loads trust material through TUF from `tuf-repo-cdn.sigstore.dev`, or `tufMirrorURL`, which
  would need signed TUF metadata. A synthetic Fulcio CA, CT log and Rekor key can never chain to that root. Every
  "signed by another workflow / ref / issuer / commit" case and the 4,319/4,320-minute case would fail with a trust
  error, not with the rule under test. The 4,319/4,320 case also needs Rekor's `integratedTime` under a synthetic
  log key.
- That read is also not a `Transport` read. `sigstore` fetches TUF itself, with make-fetch-happen and its own retry
  and 5 s timeout (`DEFAULT_TIMEOUT = 5000`, `dist/config.d.ts`). §3's "Each read fails closed after `network.ts`'s
  three tries, naming the host" is therefore not true of the trust-root read. Measured: with `tufForceCache: true` and
  an empty cache it fails `TUF_REFRESH_METADATA_ERROR`, which is closed but names no host.
- **Fix.**
  - Verify with `@sigstore/verify`'s `Verifier` and `toTrustMaterial(TrustedRoot)`, with the trust material injected:
    production gets it from `@sigstore/tuf` (`getTrustedRoot`, live, through a wrapper that retries three times and
    names `tuf-repo-cdn.sigstore.dev`); tests pass a synthetic `TrustedRoot` whose CA, CT log and Rekor keys the
    test-only signer holds. I ran exactly this shape against the real bundle (above).
  - Depend on `@sigstore/verify`, `@sigstore/tuf`, `@sigstore/bundle` and `@sigstore/protobuf-specs`, not
    `sigstore`. That is the same verifier without `@sigstore/sign`, the signing and OIDC code
    (`sigstore@5.0.0`'s tree is 52 packages, `npm ls --all`).
  - For (3), read `.1.13`/`.1.14` from the verified signer's `identity.oids`. That needs a DER UTF8String decode: the
    value is `0c 28 …`, and passing the bare string as `certificateOIDs['1.3.6.1.4.1.57264.1.13']` fails "missing
    OID" (measured). An alternative is policy `oids` for the raw legacy `.1.3` and `.1.6`, which match the bare
    strings (measured), with a test that fails if Fulcio stops issuing them.
  - Take the signing time from the verified tlog entry, and require exactly one entry.
  - Add a §8 case: the trust root is unreadable three times, so the check fails, naming the TUF host.
  - Note in §9 that the builder can check `pnpm trivy:pin`'s output offline against the embedded seed root. TUF is
    refused here, but the seed verifies v0.76.1, so "first runs live in the PR's static" can be preceded by an
    offline proof.

## Should fix

### S1. `network.ts`'s `Transport.get` returns text; the tarball and bundle need bytes

- **Evidence.** `ci-deps:tools/check-action-pins/network.ts:14` (`get(url): Promise<{status; text}>`) and `:27-28`
  (`await response.text()`). A 52 MB gzip decoded as UTF-8 is corrupted, so its digest and the signature check fail.
  §3 says the checker "downloads … the tarball" with network.ts's retries but adds no binary read. §4 does not list
  `network.ts` as changed.
- **Fix.** Add `getBytes(url): Promise<{status; body: Uint8Array}>` to `Transport` and `liveTransport`, with a longer
  timeout (52 MB; 30 s is tight on a slow runner) and a size cap. Record it in the test transport. List `network.ts`
  and its test in §4.

### S2. The repository already has a pinned-binary pattern; the design invents a second one without weighing it

- **Evidence.** `6ddd587:tools/gitleaks/install.sh` and `release.txt` (unchanged in ci-deps). That pattern: a version
  and per-platform SHA-256 in a text file beside the script, a GitHub release download, a SHA check before
  extraction, `tar … gitleaks` alone, an atomic move, and a `pnpm gitleaks:install` script (`package.json:18`). P2 puts
  the same thing in `tools/ci/trivy.json` and `tools/ci/trivy.sh`, in another format, and C2 never mentions the
  precedent.
- **Fix.** Mirror it as `tools/trivy/install.sh` and `release.txt` (or JSON, if signedAt and commit justify it), with
  the same message shapes, or say in C2 why the two must differ. Under Revisit, name the gap the review found:
  gitleaks is pinned by hash but has no signature, tag or age check. That is the same hijack class (proposal below,
  N10).

### S3. The database "source" cannot be reported, and the fallback is narrower than §10 says

- **Evidence.**
  - `trivy version --format json` gives `VulnerabilityDB {Version, NextUpdate, UpdatedAt, DownloadedAt}` and nothing
    else (`trivy-db pkg/metadata/metadata.go:14-19`; `pkg/version/version.go:92`). No repository is recorded.
  - T7 ("its age and source are printed") and §10's row ("the summary names the source used") cannot be met by
    `db-check` as written.
  - Trivy falls back to the next repository only when `shouldTryOtherRepo` is true: a `transport.Error` that is
    `Temporary()` (408/429/5xx) or `BLOB_UNKNOWN` (`pkg/oci/artifact.go:287-339` at v0.76.1). A DNS, TCP or TLS failure,
    or `DENIED`/`UNAUTHORIZED`, does not fall back, so §10's "Trivy falls back to mirror.gcr.io" overstates it.
  - Upstream ordered mirror.gcr.io first (`db_flags.go:56`) for anonymous-pull limits. C3 reverses that without
    saying so.
- **Fix.**
  - Get the source from the scan's own log line (`Artifact successfully downloaded repo=…`, `artifact.go:293`). Run
    `trivy image --download-db-only` as its own step, keep its stderr, parse that line, and fail if it is absent.
  - Correct T7 and the §10 row to say exactly what falls back.
  - In C3, state the trade under the ruling. The safer-for-security reading is ghcr-only (no Docker Hub-backed
    fallback), at the cost of a red `images` on a ghcr outage. Choose one explicitly.

### S4. Hard-coding `:2` in `TRIVY_DB_REPOSITORY` pins the schema in the workflows

- **Evidence.** §3 sets `ghcr.io/aquasecurity/trivy-db:2,mirror.gcr.io/aquasec/trivy-db:2`. Given an untagged
  repository, Trivy appends its own `db.SchemaVersion` (`parseRepository`, `db_flags.go:176-193`). With a tag it uses
  that tag as given.
- A future `trivy:pin` to a release with schema 3 would pull schema 2 and fail on the schema check (`pkg/db/db.go`
  `NeedsUpdate`/`validate`). That turns a one-file bump PR red for a reason no one would look for. `:2` is also a
  second written copy of a version `trivy.json` implies, against T2's spirit.
- **Fix.** Write the repositories untagged: `ghcr.io/aquasecurity/trivy-db,mirror.gcr.io/aquasec/trivy-db` and
  `ghcr.io/aquasecurity/trivy-java-db,mirror.gcr.io/aquasec/trivy-java-db` (`pkg/javadb/client.go:31-34`). Name the
  Java values explicitly; "the same order" is ambiguous. Add a `workflows.test.ts` assertion that no
  `TRIVY_*_REPOSITORY` carries a tag or digest.

### S5. Push-mode failure semantics are stated two ways and untested; this is the "every lane red on a rate limit" path

- **Evidence.** §3 says "Each read fails closed after `network.ts`'s three tries". T5 and §3's push bullet say a push
  "warns, never a failure". ci-deps implements the push path in a `try … catch → warnings.push`
  (`check.ts:90-103`). For P2 the push path reads more: `ls-remote` of every tag, then a bundle per newer tag.
- §8 tests "three failed reads fail closed" but not that a push run's failed reads, a missing bundle on a newer tag,
  or a 404 on its asset stay warnings.
- **Fix.** Say in §3 that push-mode reads (tag re-read, tag list, newer bundles) turn any failure into a
  `::warning title=Trivy::` naming the host. Add §8 cases:
  - a push where every read fails gives warnings only and exit 0;
  - a newer tag with no bundle, or with a malformed one, gives no error;
  - an RC/pre-release tag is ignored.

### S6. Upstream withdrawal of the pinned release turns every `images` run red, and the design has no row for it

- **Evidence.** March's response was to delete the release (v0.69.4 returns 404 today, measured). `trivy.sh install`
  downloads from `releases/download/<v>/…` on every run with no cache. If Aqua withdraws or re-cuts v0.76.1, or the
  release host is down, every PR's `images` and every tag's `build` fail at install. §10 does not list this, and the
  push-mode check re-reads only the tag, not the asset.
- **Fix.** Add the §10 row. Remedy: a withdrawn release is treated as compromised; re-pin with `pnpm trivy:pin` to the
  previous or next verified release; never point at a mirror without the hash. Extend push mode to `HEAD` the pinned
  asset URL and warn on 404, so withdrawal is seen before a PR hits it. Optionally keep the verified tarball in
  `ci.yml`'s `actions/cache` keyed by its SHA-256 and re-hashed after restore. That is safe because the hash decides,
  and it keeps PR lanes up through a release-host outage. `release.yml` stays cache-free by ci-deps' rule
  (`release.yml:21-27`).

### S7. No exclude path, unlike every other three-day floor, and P1 expects P2 to use its window

- **Evidence.** §6: "An urgent Trivy fix under three days old gets no exclude … recorded under Revisit, not built."
  The other floors all have dated security-fix excludes: CQ3's npm `release-age-exceptions.json`
  (`ci-deps:tools/check-toolchain/`), P1's `age-exceptions.json` and `image-age-exceptions.json` with the shared
  `exclude-window.ts`, and P1's interplay, which says P2 "should hold the trivy binary's release to three days through
  P1's `exclude-window.ts`" (`p1-design.md:250-251`). §11 only says "the one merged second reuses the other's age
  helper".
- **Fix.** Decide this consistently with P1 and record it in C7. Either a `trivy` kind in P1's exception file under
  the shared window (advisory, added, expires ≤ 7 days), which is the recommended option for consistency, or a reason
  why the scanner alone gets none. In both cases the age check reads its floor and window from the same module P1
  uses.

## Nits

- **N1.** The comparison times in §2 are not the Linux-64bit bundles' `integratedTime`. Measured: v0.76.0 is
  2026-10-14T11:43:12Z (design 11:43:31) and v0.70.0 is 2026-04-17T06:45:20Z (design 06:46:08); v0.69.3 is
  2026-03-03T13:10:30Z. Correct them or name the asset they came from.
- **N2.** "jq 1.8.1 is on ubuntu-26.04" covers only `ci.yml` `images`. `release.yml` `build` and the dry run's
  `build` stay on `RELEASE_RUNNER.label` = ubuntu-24.04 (§3.3.1, `lane-b-ci.md:2009-2011`), which ships jq 1.7.1. Say
  that both work, or parse with `node` (the build job has setup-node under ci-browser).
- **N3.** C4's reason ("Node in every scan job (release.yml's `push` and `report` carry no Node…)") is beside the
  point: the scans run in `build`, which gains setup-node under ci-browser. The conclusion stands (the hash makes the
  run-time check complete). Reword.
- **N4.** `collection.test.ts` already includes `...testsIn('tools/check-action-pins')` and `...testsIn('tools/ci')`
  (`ci-deps:tools/test/collection.test.ts:41-43`), so "FILES: the three new test files" is not needed. Drop it from §4.
- **N5.** T8's "the log has no `check.trivy.dev` line" proves nothing, because Trivy does not log that URL when it
  calls it. Measure by the env assertion alone, or by a `--debug` run in `trivy.test.ts`'s stub.
- **N6.** `trivy --version` prints `Version: 0.76.1`, without `v`, while `trivy.json` holds `v0.76.1`. State the
  comparison (`${version#v}`) so the stub test encodes the real format.
- **N7.** Run `db-check` (after a `--download-db-only` step, S3) before the first scan, not after it. Then T7's "when
  it decides a verdict" is literally true and the SBOM is never written from a stale database.
- **N8.** §7 omits the container-image alternative: `ghcr.io/aquasecurity/trivy` or `aquasec/trivy` by digest in a
  Dockerfile that Dependabot's docker ecosystem bumps. Record it as rejected. P1 cannot age a non-Docker-Hub image
  ("age unprovable"), Docker Hub's `aquasec` is the poisoned namespace, Dependabot's cooldown fails open
  (`p1-design.md` §2.1), and scanning would need a second container runtime path.
- **N9.** "In `release.yml` it is whatever ci-browser leaves, either the tag or the archive" should be pinned down.
  ci-browser keeps `release.yml` `build` on the classic store, where Trivy's daemon source reads the tag. Say which
  one the CLI step uses, since `workflows.test.ts:450` will assert it.
- **N10.** Proposed improvement, outside P2: gitleaks (`tools/gitleaks/release.txt`) is the other upstream binary CI
  runs. It is hash-pinned but has no tag, signature or age check. Once P2's checker exists, applying it there is
  cheap. CVE: I could not read the GHSA for CVE-2026-33634 (`gh api /advisories` is refused by this session's
  repository binding), so the v0.69.4 to v0.69.6 list rests on the design's sources plus my 404 checks; Part 6 must
  cite the GHSA, as §2 already says.

## Fit

- **ci-deps.** Fits the base rule, warning form and age constant. S1 is the one interface change it needs. The
  networked trigger must also diff `tools/ci/trivy.json` (or its S2 location), which `base.ts:44-47` does not today:
  list `base.ts` in §4.
- **ci-browser.** `--input` on `images` is consistent with §3.3.1 (`lane-b-ci.md:2108-2112`). The dry-run equality
  rule change is consistent with N5 of §3.3.6. The runners: see N2.
- **#42.** Four files as stated, plus ADR 0062 (B1). The lockfile is re-resolved, never hand-merged, as §11 says.
- **P1/P4.** See S7. P4 is disjoint apart from the matrix, registry and ADR 0066.

Is this the best option? C1, retiring trivy-action and setup-trivy for a hash-pinned CLI with pin-time Sigstore, tag
and age checks, is right, and better than the literal P2. It removes `entrypoint.sh` and the get.trivy.dev hop from
the attested release job. B1 to S7 are corrections within that choice, not a different one.
