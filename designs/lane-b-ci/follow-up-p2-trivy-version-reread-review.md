# Review of P2's re-read at bce57f16 (`follow-up-p2-trivy-version.md` §12 and the "(12)" edits)

Adversarial review, security and supply chain, and CI infrastructure, 2026-11-01 18:07Z to 18:35Z. Read only: nothing
committed, pushed or posted; no tracked file changed in `/home/user/ci-trivy-version` or `/home/user/PhysicalTherapy`.
Against `claude/build-platform` bce57f16 (the worktree), #86's head 83167b8f and #42's head c65f9cf2 (both fetched
into a scratch repository at 18:14Z and 18:23Z), Trivy v0.76.1's source (a blobless fetch of the tag, 18:16Z),
`@sigstore/verify` 4.1.2, `@sigstore/tuf` 5.0.0, `@sigstore/bundle` 5.0.0 and `@sigstore/core` 4.0.1 (`npm pack`,
18:12Z), github/advisory-database `main` (18:20Z), github/docs 33b1f4a6, actions/runner-images `main` (18:25Z), and the
push run's `images` and `unit` job logs (jobs 124920631345 and 124920631257, read 18:19Z and 18:22Z). The one script
is `/home/user/laneb-sp/p2reread/scripts-review/san.cjs`. Scratch copies were under `tmp/` and are removed.

**Counts: 1 blocking, 7 should fix, 14 nits.**

## What I re-measured and found to hold

- Every code cite of 12.2 that I opened holds at bce57f16: `check.ts:118-297` (offline errors `:122-129`, the
  `--offline` return `:132`, the age deadline `:213-215`, `floor` `:220` = `releaseAgeMinutes({ minimumReleaseAge:
  options.floor })`, the age rule `:233-253`, push re-reads `:258-295`); `network.ts:27-31, :62, :98, :109, :191-200,
  :218-274, :283, :307, :338-371, :377-388`; `fixtures.ts:46`; `base.ts:14-23, :45-73`; `age.ts:348, :598-616,
  :645-660, :740-760, :801, :810`; `buildkit.ts:89, :110-117`; `exclude-window.ts:22, :29-32, :35-37`;
  `ci.yml:13-14, :38, :77, :80, :82-88, :147, :162, :252-262, :665-672, :680, :695-705, :708, :719, :720-730`;
  `release.yml:21-29, :120-139, :453`; `release-dry-run.yml:3-15, :19-43, :59-62, :129-143`;
  `workflows.test.ts:244, :252, :871-897, :1815-1846, :1876-1877, :2252-2388`; `no-duplicated-versions.test.ts:9-43,
  :71-124` (eight cases); `controls.ts:259-265`; `controls.test.ts:217, :221-228`; ADR 0066 `:347, :397-400, :727,
  :1273, :1504, :1529, :1666`; `dependency-upgrades.md:95-98, :325, 374 lines`; `test-matrix.md:257-264, :288-290`;
  `registry.ts:626-631`; `matrix.ts:437-441`; `reconciliation-001.md:659-661` (661 lines).
- Five trivy-action steps and no other Trivy anywhere: `grep -rn trivy .github/` gives `ci.yml:695, :720`,
  `release.yml:121, :132`, `release-dry-run.yml:132` and comments; no Dockerfile, compose file or other workflow names
  `aquasec`; the GitHub runner toolsets for 24.04 and 26.04 install no Trivy (18:25Z).
- 13 distinct action refs of 12 commits at bce57f16, so "12 refs of 11 commits" without trivy-action holds.
- CI's unit project at bce57f16: 404 files, 6,893 passed, 1 skipped (job 124920631257, log `:1329-1330`).
- The push run's `images` job ran setup-trivy's `install.sh -c setup-trivy v0.70.0` (log `:1757`), pulled
  `mirror.gcr.io/aquasec/trivy-db:2` (log `:1887-1888`) and printed "Version 0.76.1 of Trivy is now available" (`:1912`).
- The advisories: GHSA-69fq (Go: `versions: ['0.69.4']`; trivy-action < 0.35.0; setup-trivy < 0.2.6), GHSA-q3fv
  (< 0.71.0, high), GHSA-mcj4 (< 0.71.1, high, "path traversal via a crafted vulnerability database"), GHSA-8rc5
  (< 0.72.0, moderate), GHSA-g3hv (minimatch < 11.0.1, moderate); v0.69.4's Linux-64bit archive is `385d498d…09f6`;
  immutable releases "enabled March 3"; the exposure window 18:22Z to ~21:42Z. So the 0.72.0 floor is right.
- npm: `@sigstore/verify` 4.1.2 2026-08-04T21:34:43Z, `@sigstore/tuf` 5.0.0 2026-06-01T21:02:52Z, `tuf-js` 6.0.1
  2026-10-29T18:27:09Z, `@tufjs/models` 5.0.1 2026-10-29T18:25:36Z, `@gar/promise-retry` 1.0.3 (MIT). As
  `devDependencies` they are outside both `pnpm audit --prod` (`ci.yml:77`) and `pnpm licenses:check`, which lists
  `--prod` only (`tools/check-licenses/index.ts:13`); `yaml` is already a `tools` devDependency, so the kind fits.
- #86 (83167b8f, draft, "dirty") touches no test-matrix, matrix or registry file, so CI-24 to CI-26 cannot collide with
  it; its expression rule admits `hashFiles` of literals and `runner.*` (83167b8f `workflows.test.ts:3041`, `:2953`), so
  the archive key needs only the one `BOUNDED_VALUES` row the design names. A trial merge of 83167b8f into bce57f16
  (`git merge-tree`, 18:15Z) conflicts in ADR 0066, reconciliation-001 and `workflows.test.ts`, as 12.4 says.
- `immutable-releases.md:22-23` at github/docs 33b1f4a6 says what 12.1 (V8) and E10 say.
- 12.5 item 6's arithmetic: P1's push bounds 600 s plus about 183 s plus another 180 s is 963 s against 900 s.

## Blocking

**B1. The synthetic Sigstore signer that every identity, root, digest and age test rests on is unspecified, and Node
cannot build it with what the design adds.**
- Evidence. §8 and 12.6 (B1, commit 2, `fixtures.ts`) promise "a synthetic `TrustedRoot` and a test-only signer holding
  its CA, CT log and Rekor keys, so a bundle's `integratedTime` is set by the test", with the real `Verifier` doing the
  verification. What that takes with the four packages:
  - an X.509 leaf with Fulcio's extensions, signed by the test CA. `node:crypto` parses certificates but has no API that
    creates one, and nothing in the repository builds one (`grep` over `tools` for a certificate builder finds none);
  - an SCT: `Verifier` defaults `ctlogThreshold` to 1 (`@sigstore/verify` 4.1.2 `dist/verifier.js:31, :95-98`), and an
    SCT is a signature over the precertificate's TBS, so the helper must rebuild the TBS without the SCT extension;
  - for a v0.3 bundle, an inclusion proof with a signed checkpoint (`@sigstore/bundle` 5.0.0 `dist/validate.js:174-184`)
    as well as the SET (`dist/tlog/index.js:80-96` of verify).
  That is a hand-written DER, X.509, CT and Merkle-checkpoint toolkit of a few hundred lines, inside 12.6's "about 70
  tests" and §9's "about 550 lines", or a new certificate-building package that 12.3 never measured against the gates.
  A builder who meets this mid-commit will either add a dependency nobody reviewed or mock the `Verifier`, which removes
  the real-library check the tests exist for.
- Fix. Decide it in the design, in P1's own form:
  1. A generator committed beside its outputs, run once by hand like `tools/check-action-pins/testdata/age/make.sh`
     (`:1-30`): `tools/check-action-pins/testdata/trivy/make.sh` makes a throwaway CA and a leaf with `openssl`
     (`-addext 1.3.6.1.4.1.57264.1.{8,13,14,15,17}=ASN1:UTF8String:…` and the SAN), a synthetic `TrustedRoot`, and the
     SET, a size-1 Merkle proof and a signed checkpoint (a few lines of Node in the same script), for a fixed
     `integratedTime`; the private keys die with the script. Tests inject `now`, so "4,319 minutes fails, 4,320 passes"
     still holds, and variants (another SAN, another `.1.14`, another root) are separate outputs of the same script.
  2. The SCT: tests build the `Verifier` through one options seam with `ctlogThreshold: 0`, and one test holds
     production to the library's defaults (`ctlogThreshold`, `tlogThreshold` and `timestampThreshold` all 1), so the
     seam cannot weaken CI. Alternatively the script computes a real SCT; say which.
  3. Add the script, its outputs and the seam to §4, 12.6 (B1's files) and the counts, and correct the "set by the
     test" sentence.

## Should fix

**S1. The SAN in the policy is an unanchored regular expression, so a plain-string policy accepts other refs.**
- Evidence. `@sigstore/verify` 4.1.2 `dist/policy.js` `verifySubjectAlternativeName`: "The policyIdentity is treated as
  a JavaScript regular expression pattern and tested against the full signerIdentity string … use anchored patterns",
  implemented as `signerIdentity.match(policyIdentity)`. Run on the library itself (`scripts-review/san.cjs`, 18:31Z)
  with §3 (2)'s string for v0.76.1: `…@refs/tags/v0.76.1` accepted, **`…@refs/tags/v0.76.10` accepted**,
  **`…@refs/tags/v0.76.1-rc.1` accepted**, `…@refs/tags/v0.76.0` refused. §3 (2), 12.3's "Signature" row and §8's
  "a bundle signed by another workflow, ref or issuer fails" all read the policy as an exact match. 12.5 item 4's `.1.14`
  in `oids` (an exact `Buffer.equals`, `policy.js` `verifyOIDs`) and the explicit compare do refuse those refs, so this
  is defence in depth failing, not a hole; but the workflow path is held by the SAN alone, and the explicit compare
  (§3 (3)) re-checks the four OIDs and not the SAN or the issuer.
- Fix. Pass `subjectAlternativeName` as `new RegExp(\`^${escapeRegExp(san)}$\`)` (the type admits `RegExp`,
  `dist/shared.types.d.ts:14`); add the SAN and the issuer to the explicit post-verification compare (exact string
  equality); add §8 cases for the `v0.76.10` and `v0.76.1-rc.1` SANs, each with matching `.1.14`, so only the SAN rule
  can refuse them. Say in Part 6 that the library's SAN rule is a pattern.

**S2. 12.6's commit order cannot be green where it says, and what an absent `release.txt` means is unspecified.**
- Evidence.
  - B1's commit 2 is "green" and includes `check.test.ts` "(the named-once list)". `check.test.ts:181-183` holds every
    named-once path to a file the head has; with `TRIVY_RELEASE` added, it is red until `tools/trivy/release.txt`
    exists, which B2 writes in commit 4 with B1's `pin-trivy.ts`, so B2 waits on B1 and B1 is red on B2.
  - At commit 2 the real tree still has five trivy-action steps and no `release.txt`, so the new offline rules make
    `pnpm actions:check --offline` fail until commit 4. "The green ones pass every command" (12.6) is false for commits 2
    and 3.
  - Absence: `recordedTransport` answers any unrecorded URL with 404 (`fixtures.ts:53, :114`), and the existing
    synthetic repositories of `check.test.ts` (`:107`, `:116`, `:128`, `:139`, `:230`, `:258` expect no errors) hold no
    `release.txt`. If absence is an offline error, or counts as "a pin new against the base", those tests go red; if
    absence is simply allowed, a tree whose workflows run `trivy` with no `release.txt` passes the checker and fails
    only at `install.sh` on the runner.
- Fix. State the rule: no `release.txt` is valid only when no workflow step runs `trivy` or `tools/trivy/*.sh` (else an
  offline error), and a head with no `release.txt` makes no Trivy read. Order the commits so each claim holds: B1's
  commit 2 runs `pnpm trivy:pin 0.76.1 --offline-root` itself and commits `release.txt` (moving it to B1's files), so
  the named-once test is green there; say that `pnpm actions:check` on the real tree is first green at B2's commit 4,
  and record that in the PR description.

**S3. A scan can still download a database: the Java database, mid-scan, unchecked.**
- Evidence. Trivy v0.76.1's JAR analyzer calls `javadb.NewClient()` (`pkg/fanal/analyzer/language/java/jar/jar.go:49`),
  which runs `Update()` and downloads `trivy-java-db` unless `--skip-java-db-update` is set (`pkg/javadb/client.go`,
  `Update`); with the flag and no Java database it refuses: "'--skip-java-db-update' cannot be specified on the first
  run". `--skip-db-update` does not cover it (`pkg/flag/db_flags.go:28` and `:43-45` are separate flags). T7 says "the
  scans read that database and update nothing", and §3's offline rule requires only `--skip-db-update`. The first image
  that carries a JAR would pull 993 MB (12.3's table) from `TRIVY_JAVA_DB_REPOSITORY` inside the scan, with no
  freshness check, no `repo=` check and no summary line.
- Fix. Every `trivy image` scan and the SBOM step carry `--skip-java-db-update`; the offline rule and `workflows.test.ts`
  require it; T7 and CI-26 say "neither database is updated by a scan"; the runbook says a JAR fails the scan with
  Trivy's own message, and the remedy is a reviewed change adding `--download-java-db-only` to `db.sh` with its own
  `repo=`, age and summary checks.

**S4. A committed `trivy.yaml` or `.trivyignore` changes the verdict, because Trivy reads both from the checkout.**
- Evidence. Trivy v0.76.1: `--config` defaults to `trivy.yaml` in the working directory ("empty string disables
  loading", `pkg/flag/global_flags.go:16-22`), and `--ignorefile` to `.trivyignore` (`pkg/flag/report_flags.go:68-73`,
  same wording). Every scan runs from the workspace root. A file there can set what the command does not: `scan.scanners`
  (the default `vuln,secret`, `pkg/flag/scan_flags.go:38-43`), `scan.skip-dirs`/`skip-files`,
  `vulnerability.vex` (`pkg/flag/vulnerability_flags.go:29-31`), or ignore CVEs. trivy-action has the same exposure
  today, but P2 writes the command from nothing and §10 promises the verdict "unchanged in kind".
- Fix. Every `trivy` command passes `--config ''` and every scan `--ignorefile ''` and `--scanners vuln,secret`; the
  offline rule requires them and refuses `--db-repository`, `--java-db-repository`, `--vex` and `--ignore-policy` on any
  `trivy` command; a CVE is never ignored by file, only fixed (the runbook already says take the fix).

**S5. Sigstore's Rekor v2 would stop every new pin and silence the newer-release warning.**
- Evidence. The trusted root embedded in `@sigstore/tuf` 5.0.0 (`seeds.json`, `trusted_root.json`) already lists a
  second log, `log2025-1.rekor.sigstore.dev`, valid from 2025-09-23, and a timestamp authority. A Rekor v2 entry has no
  inclusion promise, and the library then takes no time from the log (`dist/timestamp/index.js:14-23`: "Only entries
  with an inclusion promise provide a verifiable timestamp"); the RFC 3161 time is what counts. Trivy signs with
  `cosign sign-blob --bundle` (`goreleaser.yml:175-184` at v0.76.1) from `sigstore/cosign-installer` v4.1.2
  (`reusable-release.yaml:44-45`), so the log it writes to follows Sigstore's signing configuration, not Trivy. §3 (5)
  needs "exactly one verified tlog entry; its `integratedTime` equals `signed_at`", so the first Rekor v2 release fails
  every pin, and E9 warns only "when one passes", so newer releases that fail a check vanish and Trivy stays pinned with
  no warning. When Sigstore switches is not verified.
- Fix. Define `signed_at` as the verified signing time: the tlog entry's `integratedTime` when it carries a verified
  promise, else the one RFC 3161 time the `Verifier` verified against the trusted timestamp authority; the floor and
  `published_at` apply as now. Add a §10 row. On a push, when a stable tag newer than the pin has a release whose
  `published_at` is past the floor and it fails a pin check, warn once naming the version and the failed check, so a
  permanent upstream change (log, asset name, workflow path) reaches the weekly triage. Add both cases to §8.

**S6. The ancestry rule rests on a misread of the advisory, and it can be made stronger with the same fetch.**
- Evidence. 12.3 ("Ancestry") and 12.5 item 3 say v0.69.4's `1885610c` was "on no branch". GHSA-69fq says "The
  malicious code was not committed to Trivy's main branch. It was fetched and built on the ephemeral runner, and also
  committed to a v0.70.0 branch" (advisory-database `main`, 18:20Z). The attacker could push branches. Trivy's own
  release job creates `release/vX.Y` with an App token "to bypass the merge queue rule", seconds after tagging vX.Y.0
  (`.github/workflows/release-please.yaml:98-131` at v0.76.1). So rule (c) refuses March's exact shape, but a credential
  that can push a branch passes it by naming the branch `release/v<X.Y>` for a minor that does not exist yet.
- Fix. Correct the fact in 12.3 and 12.5. Tighten (c) at no extra read: vX.Y.0 must be on the default branch; vX.Y.Z
  with Z > 0 must be on `release/vX.Y`, and that branch must hold vX.Y.0's commit, itself on the default branch (fetch
  the vX.Y.0 tag in the same treeless fetch). Today's data fit it: v0.76.0 is on `main`, v0.76.1 on `release/v0.76`
  only, v0.75.0 on `main`; that `release/v0.69` holds v0.69.0 is not verified. A new minor branch then proves nothing
  unless its .0 is on `main`. Part 6 states what remains: a credential that can push to `main` or an existing release
  branch passes, and the floor and the advisory read are the defence. E6: list the release branch with `ls-remote`
  first and fetch it only when listed; today `fetchRefs` puts every refspec in one `git fetch` (`network.ts:238`), and
  a missing branch fails the whole read. 12.9's open item "whether a minor's release branch exists when its tag is
  pushed" is answered by the workflow above.

**S7. The API reads reuse helpers that are private to `age.ts`, which no builder owns; and the advisory control
proves less than it claims.**
- Evidence. 12.5 item 2 reads advisories "through `age.ts`'s `apiGet`" and item 5 reads the release "as `age.ts:598-616`
  does". `apiGet` (`age.ts:348`), `Context` (`:330`), `apiRefusal` (`:341`), `apiProblem` (`:362`) and `nextPage`
  (`:404`, the token-safe pagination) are not exported, and `age.ts` is in neither builder's file list (12.6), so B1
  either edits an unassigned file or copies the retry, rate-limit, no-redirect and token rules. E8's control asks for
  0.69.4 and expects GHSA-69fq, whose Go entry is an explicit version, not a range, so it proves that `affects=…@v`
  matches an exact version and nothing about ranges such as GHSA-mcj4's `< 0.71.1`. The `/advisories` endpoint was not
  reachable from here (18:14Z, HTTP 403), so how `affects` reads a version is not verified.
- Fix. Add `age.ts` to B1's files and export one small API reader (`apiGet` with its `Context` factory, and `nextPage`)
  for `trivy.ts`. Read GitHub's advisories once per run by package
  (`/advisories?ecosystem=go&affects=github.com/aquasecurity/trivy`, every page through `nextPage`), drop withdrawn
  entries, and judge the pin and each candidate locally with the exported `ghsaRangeHolds` (`age.ts:707`). The control
  becomes local and exact: the set must hold GHSA-69fq for 0.69.4 and GHSA-mcj4 for 0.71.0, else the read counts as
  failed. One read then serves the pin and every candidate.

## Nits

**N1. #42's state in 12.4 is stale.** Its head is c65f9cf2 (2026-11-01T17:07:16Z), merge base 83d71fd6, 219 files
(`gh api …/pulls/42`, 18:23Z). The files it shares with P2 are the same (`ci.yml`, `workflows.test.ts`, ADR 0062,
reconciliation-001, `test-matrix.md`, `matrix.ts`, `registry.ts`, `pnpm-lock.yaml`), and its hunks stay clear of
P2's: `ci.yml:734-748` and `workflows.test.ts:1801-1812` at 83d71fd6 (bce57f16 `:1856`, `:1865`, eleven lines above
P2's `:1876-1877`), `test-matrix.md:180-220`, `registry.ts:370, :535, :565`, `matrix.ts:226, :346, :362`,
`reconciliation-001.md:641-650`. Update the row; no conclusion changes.

**N2. The count target is measured on the wrong base.** 6,893 is bce57f16's (job 124920631257), but 12.6 re-cuts P2
after #86, which adds about 690 lines to `workflows.test.ts`, and possibly after #75, #83, #84 and #85. Write the target
as "the cut base's push-run unit count plus N", read from that run.

**N3. E14's evidence string is not in the command §3 writes.** `controls.ts:264` would name `trivy image --input`,
and `controls.test.ts:221-228` needs that exact substring in `ci.yml`; §3 writes `trivy image --cache-dir
"$RUNNER_TEMP/trivy" --skip-db-update … --input …`. Put `--input "$RUNNER_TEMP/image/<name>.tar"` right after
`trivy image`, or name a substring the command holds.

**N4. `db.sh`'s line to parse has a precise form.** Trivy logs `Artifact successfully downloaded<TAB>repo="<repo>:<schema>"`
(`pkg/oci/artifact.go:293`; job 124920631345 log `:1888`: `repo="mirror.gcr.io/aquasec/trivy-db:2"`), so the check is
`repo="ghcr.io/aquasecurity/trivy-db:<digits>"`, `db.test.ts`'s stub prints that exact form, and `db.sh` never
passes `--quiet`, which drops INFO lines.

**N5. The worker scan runs after a failed install or database step.** Its `if:` is `!cancelled() && steps.worker.outcome
== 'success'` (`ci.yml:719`), which overrides the default `success()`, so after a failed `install.sh` it runs whatever
`trivy` is on `PATH`, and after a failed `db.sh` it scans with the database `db.sh` refused. The job is red either way
and the runner images ship no Trivy today (toolsets, 18:25Z). Gate every scan on the install and database steps'
`outcome == 'success'` and have the offline rule require it; E1's "need no `if:`" sentence then reads true.

**N6. The archive cache: no restore keys, and a remedy for a bad entry.** Say the restore has no `restore-keys`: one
would hand a bump's pull request the old archive, which `install.sh` refuses without downloading (§8). Under the exact
key a bad entry is permanent, since push runs see `cache-hit` and never save again; the runbook remedy is bumping
`trivy-v1-` in `ci.yml` (the founder can also delete the entry).

**N7. Open items that a read closes.**
- `--skip-db-update` with no database fails closed: `pkg/db/db.go:122-124` at v0.76.1 ("--skip-db-update cannot be
  specified on the first run"). E2's and 12.9's "not re-read" can go.
- `@sigstore/tuf` 5.0.0's options are `cachePath`, `mirrorURL`, `rootPath`, `forceCache`, `forceInit`, `retry` and
  `timeout` (`dist/index.js:46-52`, `dist/client.js:34-47`).
- `--offline-root`: `seedCache` writes only `root.json` and the targets (`dist/client.js:76-97`), and whether tuf-js
  then refreshes `timestamp.json` over the network under `forceCache` is not verified; read the `trusted_root.json`
  target from `seeds.json` directly (the package has no `exports` map, so the deep import resolves).
- The release branch's timing (S6).

**N8. `getBytes`' cap is not a cap if it follows `arrayBuffer()`.** `arrayBuffer()` holds the whole body before any
check. Refuse a `content-length` over 128 MiB first, then read the stream with a running count and abort past it.

**N9. `der.ts`.** `@sigstore/core` 4.0.1 exports `ASN1Obj.parseBuffer` (`dist/index.d.ts:1`), already in the tree under
`@sigstore/verify`; as a direct devDependency it would replace the hand-written decoder and its malformed-length tests,
leaving only the 3-byte encoder. Either way, §8's "the real certificate's bytes (copied as hex)" contradicts "Nothing
from Aqua's real release is committed beyond the four values in `release.txt`"; pick one.

**N10. `TRIVY_ARCHIVE_DIR` is in Trivy's namespace and unplaced.** Trivy binds `TRIVY_*` variables to its flags; a
variable of ours there could someday mean something to it. Make it `install.sh`'s second argument, and say that only
`ci.yml`'s install step passes `"$RUNNER_TEMP/trivy-archive"` (step level, where `runner` is allowed).

**N11. The security-critical cases never fail first.** Commit 1's ★ list holds offline cases and one tag case; the
identity, root, digest, tlog and age cases arrive with the code in commit 2, and "an unchanged `release.txt` and checker
read nothing from the network" passes on the base, so it cannot be red. Once B1's fixture exists (B1), put one
identity, one digest and one age case through `checkActionPins` in commit 1.

**N12. Two cheap policy values.** The certificate carries `.1.11` = `github-hosted` and `.1.20` = `push` (12.3's
"Certificate" row). Adding them to the policy's `oids` refuses a signature made on a self-hosted runner or from another
trigger, at no cost; it is reversible if Trivy changes either.

**N13. ci-findings-transport needs no rows.** LANES.md rule 4 (2026-11-01 18:00 UTC) released CI-30 and CI-31; 12.4's
"CI-30 and CI-31 if it needs rows" is stale.

**N14. Name the floor for `pnpm trivy:pin`.** Say that `pin-trivy.ts` reads `pnpm-workspace.yaml` and the floor through
`releaseAgeMinutes`, as `index.ts:18-30` does, so the local pin and CI cannot judge age differently.

## What was not verified here

The `/advisories` query form and the `releases/tags` read for aquasecurity/trivy (HTTP 403 from this session); whether
v0.76.1's release is immutable; when Sigstore's signing configuration moves to Rekor v2; whether aquasecurity/trivy's
rulesets restrict creating `release/*` branches; whether `release/v0.69` holds v0.69.0. None changes a finding's fix.
