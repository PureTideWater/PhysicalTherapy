# ci-browser scout B: versions, browsers and runners

Checked 2026-10-26 00:46-01:00 UTC against claude/build-platform at 6ddd587 (/home/user/PhysicalTherapy) and design
section 3.3 (/home/user/ops/designs/lane-b-ci.md:1671-1840). Scratchpad below means
/tmp/claude-0/-home-user-PhysicalTherapy/320d184a-020e-5534-ba47-a98ce8d4921f/scratchpad/ci-browser.

## Verdict

3.3's targets still stand, so nothing changes: Playwright **1.64.1** (all three packages) and axe **4.14.0**
(@axe-core/playwright and axe-core). They are npm `latest`, no newer stable version exists, every one is more than three
days old by 2026-10-27 06:00 UTC, every one comes from a trusted publisher with SLSA provenance (so no trust downgrade),
there are no new transitive packages, and the CfT 156.0.8078.4 / revision 1248 build exists. Its zip SHA-256s equal
setup-container.sh's pins.

Corrections and additions to 3.3:
1. **browser.json's SHA-256 values.** The binary SHA-256 of the headless shell is
   `4fa61f0ba0b4f89b7bec242c32ca16d3bccf69dbfef0651924a9ba8fede5f9d6`. The zip's is
   `c3e50596aef52c58f8fda3c6b3411c33d34c88b177b3ed1c2243359fd3b8ba20`. 3.3 should say which one browser.json records.
   CI's install step can only hash the binary, because Playwright deletes the zip. Recommendation: record the binary
   SHA-256 and the zip SHA-256 as two separate fields.
2. **Where CI downloads from.** Playwright 1.64.1 fetches Chromium from `cdn.playwright.dev/builds/cft/156.0.8078.4/linux64/*.zip`
   (playwright-core 1.64.1 `lib/coreBundle.js:33999-34006, 34225, 34260`). That is Playwright's mirror of CfT, not
   Google's bucket. 3.3's "if CI's download differs from Google's bucket" risk still holds and is still unproven here,
   because the proxy refuses cdn.playwright.dev.
3. **`PLAYWRIGHT_CHROMIUM_DOWNLOAD_HOST` cannot point at Google.** The env override (`coreBundle.js:35014-35019`) keeps the
   `builds/cft/<ver>/...` path, and Google's bucket uses `<ver>/linux64/...`. So CI cannot be pointed at
   storage.googleapis.com that way.
4. **Ubuntu 26.04 support starts at 1.64.1.** Playwright 1.64.1 is the first of the two versions to support Ubuntu 26.04
   officially:
   - `coreBundle.js:9230`: `isOfficiallySupportedPlatform: ... "26.04"`;
   - `:32773`: a `ubuntu26.04-x64` nativeDeps table.

   1.56.1's nativeDeps.ts has no 26.04 entry (tables only for 20.04, 22.04 and 24.04). So moving the runners and bumping
   Playwright must land together, which 3.3 already does. **Nothing may move a browser job to 26.04 before the bump.**
5. **Docker 29 and the image store.** On the 26.04 image, Docker 29 is a fresh install with no daemon.json, so the
   containerd image store is in effect. This confirms 3.3's binding premise. One claim needs softening: "a weekly rebuild
   of the 24.04 image could bring Docker 29 there too". toolset-2404.json pins docker-ce 28.0.4, so Docker 29 reaches
   24.04 only if that toolset pin changes.
6. **The local browsers are gone.** The 1248 layout 3.3 cites (`scratchpad/ci-design/pwr/browsers/ms-playwright`) no
   longer exists. `/opt/pw-browsers` (`$PLAYWRIGHT_BROWSERS_PATH`) holds only 1194 and 1243. The builder must lay out 1248
   again. Both verified zips are already in `scratchpad/cft`, and their SHA-256s equal the pins. The setup-container fix
   is below.
7. **`ubuntu-latest` moves to 26.04 in November 2026** (runner-images announcement #14748). This has no effect, since
   workflows.test.ts refuses `-latest`, but it is worth one line in ADR 0066 Part 3.

## 1. npm versions, ages, peers

`npm view <pkg> dist-tags time --json`, 2026-10-26 00:47 UTC:

| package | latest | published (UTC) | age at 2026-10-27 06:00 | other tags |
|-|-|-|-|-|
| @playwright/test | 1.64.1 | 2026-10-14 11:58:13 | 12.8 d | next 1.65.0-alpha-2026-10-25, beta 1.64.1-beta-1792067398000 |
| playwright | 1.64.1 | 2026-10-14 11:54:49 | 12.8 d | same |
| playwright-core | 1.64.1 | 2026-10-14 11:54:58 | 12.8 d | same |
| @axe-core/playwright | 4.14.0 | 2026-10-15 13:33:17 | 11.7 d | next/rc 4.14.1-<sha> prereleases only |
| axe-core | 4.14.0 | 2026-10-05 17:43:36 | 21.5 d | next 4.14.0-canary.6b52b84 (2026-10-21) |

- There is no stable release after 1.64.1. `git ls-remote --tags https://github.com/microsoft/playwright 'v1.64*' 'v1.65*'`
  returns only v1.64.0 (606ecd8b) and v1.64.1 (cfe490d9). If a 1.65.0 appeared now, it could not be three days old by
  2026-10-27 06:00, so 1.64.1 is the recommendation.
- The dependency tree, from `npm view <pkg>@<ver> dependencies optionalDependencies peerDependencies engines`:
  - @playwright/test 1.64.1 depends on playwright 1.64.1, which depends on playwright-core 1.64.1 and the optional
    fsevents 2.3.2. fsevents 2.3.2 is already locked (pnpm-lock.yaml:2877, :5946). All three require Node >=20.
  - @axe-core/playwright 4.14.0 depends on axe-core ~4.14.0. Its peer is playwright-core >=1.0.0, and it requires Node
    >=22.12.0. The repo requires Node >=24 (package.json:6-8), so this is satisfied.
  - axe-core 4.14.0 has no dependencies.
  - **There are no new transitive package names.** The lockfile swaps versions only (`@axe-core/playwright@4.14.0(playwright-core@1.64.1)`).
- next@16.4.3 (`npm view next@16.4.3 peerDependencies`) has the optional peer `@playwright/test: ^1.51.1`, which 1.64.1
  satisfies. `npm view next dist-tags.latest` returns 16.4.3.
- Today's pins:
  - apps/web/package.json:47 `@axe-core/playwright 4.13.0` and :48 `@playwright/test 1.56.1`;
  - apps/worker/package.json:53 and tools/package.json:33 `playwright-core 1.56.1`;
  - apps/worker/Dockerfile:23 `npm install ... playwright-core@1.56.1`.

## 2. Trust (pnpm trustPolicy no-downgrade)

The method: full packuments from `https://registry.npmjs.org/<pkg>` (saved in scratchpad/pack), scored by
scratchpad/scripts/trust.js. Each version's evidence is `_npmUser.trustedPublisher` (strongest), then
`dist.attestations.provenance`, then none. A version fails if any version published earlier has stronger evidence.

| version | evidence | strongest earlier | result |
|-|-|-|-|
| @playwright/test 1.64.1 | trustedPublisher (GitHub OIDC 9b3d9fed-...), SLSA v1 provenance | trustedPublisher | OK |
| playwright 1.64.1 | trustedPublisher (25d220ca-...), SLSA v1 | trustedPublisher | OK |
| playwright-core 1.64.1 | trustedPublisher (005e5f14-...), SLSA v1 | trustedPublisher | OK |
| @axe-core/playwright 4.14.0 | trustedPublisher (12fe4cc9-...), SLSA v1 | trustedPublisher | OK |
| axe-core 4.14.0 | trustedPublisher (f0676e05-...), SLSA v1 | trustedPublisher | OK |
| fsevents 2.3.2 (unchanged) | none | none (no version ever had any) | OK |

Integrities, from the registry. playwright-core's and axe-core's were recomputed from the downloaded tarballs and match:
- @playwright/test 1.64.1 `sha512-IaYGml/nSOiZWROfPtuIL7neuu9qDOZ3TNvNljUIrhDMxiGTgPjzj/g9p9RxpS2tSepPDRY+UwAaEeiKtUvIAg==`
- playwright 1.64.1 `sha512-HCrVhHr5QQuwYoswEUGTb7gGp522yflbv/ST8nF4sFWGuLjQCt17Q/EubpGGSNKYn1tsTCPZxqHhHCfVURu7UA==`
- playwright-core 1.64.1 `sha512-BC4s8y6SEVA6Q1rSxZTto8hI1KUI3xXlHGZgvGqP4IqPdI/a6FX9H29IDNz7vKo9l21b6LfYosScPL6M3xxyDQ==`
- @axe-core/playwright 4.14.0 `sha512-SGUhG5PIHd2eMdpgBF2PyQLOhX+qyDR2PT4cmoS4Qk2ak+jX/rrSvst9l0PGv5WTHolKpUMvVmoHpr4cZgf1RQ==`
- axe-core 4.14.0 `sha512-9WTZxEjsZ7b13TH8JPmbV2z8CHbl80/2hm3XPEG4JgNdQLK81IBRXmSxHfMAOkSqQeRxT/0dwNDz2GOm3zzpcQ==`

**No trustPolicyExclude and no minimumReleaseAgeExclude entry is needed for ci-browser.**

## 3. Browser revision and Chrome for Testing

- `https://raw.githubusercontent.com/microsoft/playwright/v1.64.1/packages/playwright-core/browsers.json`:
  - chromium and chromium-headless-shell: **revision 1248, browserVersion 156.0.8078.4**;
  - firefox 1555 (157.0), webkit 2370 (27.2), ffmpeg 1013.

  The published tarball's browsers.json says the same. At v1.56.1 it was 1194 / 141.0.7390.37.
- `storage.googleapis.com/chrome-for-testing-public/156.0.8078.4/linux64/`. Both zips were downloaded to scratchpad/cft
  under `flock /tmp/laneb-heavy.lock`. Each MD5 equals GCS's `x-goog-hash`.

| zip | bytes | Last-Modified | zip SHA-256 | binary | binary bytes | binary SHA-256 |
|-|-|-|-|-|-|-|
| chrome-headless-shell-linux64.zip | 125797539 | 2026-09-30 01:23:16 GMT | `c3e50596aef52c58f8fda3c6b3411c33d34c88b177b3ed1c2243359fd3b8ba20` | chrome-headless-shell-linux64/chrome-headless-shell | 207474000 | `4fa61f0ba0b4f89b7bec242c32ca16d3bccf69dbfef0651924a9ba8fede5f9d6` |
| chrome-linux64.zip | 200345244 | 2026-09-30 01:22:36 GMT | `43fd31766c7533a02dda2ded5ad50c2f861cd5400be7509c0abad71129f79d79` | chrome-linux64/chrome | 301186376 | `377a9fc07b495c3b8d0ab8ec1fdfd153641759f9756fea34d8dfce4de82f5025` |

The binary hashes come from `python3 -I scratchpad/scripts/zsha.py <zip> <member>`, which reads the member through
zipfile with no extraction.

- **Executable paths in 1.64.1** (`coreBundle.js:34170-34185`): chromium is `chrome-linux64/chrome` and the headless shell
  is `chrome-headless-shell-linux64/chrome-headless-shell`. That is CfT's own layout, so for 1248 no link is needed. 1194
  needs its `chrome-linux`/`headless_shell` link.
- **setup-container.sh CFT_BUILDS** (/home/user/ops/tools/setup-container.sh:957-960, commit a6f9ae75). The pins
  `chromium-1248 ... 43fd3176...` and `chromium_headless_shell-1248 ... c3e50596...` **equal** the computed zip
  SHA-256s, and the inner directories `chrome-linux64` and `chrome-headless-shell-linux64` match 1.64.1's paths. No pin
  changes.

## 4. setup-container.sh: laying out a worktree's revision

What it does today:
- `step_playwright` (:999-1029) reads `@playwright/test` from `$CLONE_DIR/apps/web/package.json` only, and its revisions
  from `$CLONE_DIR/node_modules/.pnpm/playwright-core@$pw/.../browsers.json`.
- It runs at :1087, before the ops worktree and the argument worktrees are made and installed (:1088-1093).
- So a `co-001/ci-browser` worktree that names 1.64.1 never gets 1248.
- A smaller defect: the success message prints `$ver` from the last loop iteration only.

The change (the best option):
1. **Collect the roots.** `worktree()` with `INSTALL=1` appends `$dir` to a new array `PW_ROOTS` after `modules` succeeds
   (:1063-1066). `PW_ROOTS` starts as `("$CLONE_DIR")` when `OK_MODULES=1`.
2. **Move the call.** `step_playwright` moves from :1087 to after the worktree loop (after :1093).
3. **Read each root.** For each root in `PW_ROOTS`:
   - read that root's `apps/web/package.json` `@playwright/test` version;
   - read the revisions from that root's own `node_modules/.pnpm/playwright-core@<ver>/node_modules/playwright-core/browsers.json`.
     Each worktree has its own `node_modules`, and the version is read there, not assumed;
   - union the `chromium-<rev>` and `chromium_headless_shell-<rev>` names and remember which roots named each one;
   - a root whose browsers.json cannot be read is a FAIL line naming that root.
4. **Lay out what is missing.** For each revision in the union that lacks `INSTALLATION_COMPLETE`, call the unchanged
   `cft_layout`. A revision with no CFT_BUILDS row already fails with "no pinned Chrome for Testing build for <rev>",
   which is right: an unpinned revision must be added to CFT_BUILDS by a person, with its SHA-256.
5. **Report per revision.** Print one `line ok playwright` per Playwright version, naming its roots, revisions, the CfT
   version (looked up per revision, not the loop's last `$ver`) and present or laid out.
6. **Check mode.** `SETUP_CHECK=1` reports every missing revision across all roots, as today.

Also note: the ci-browser branch does not exist until it is cut after ci-deps merges, and the bump happens in the
worktree after setup ran. So the builder must lay out 1248 once by hand: unzip both pinned zips from scratchpad/cft
into `$PLAYWRIGHT_BROWSERS_PATH/chromium-1248/chrome-linux64` and
`.../chromium_headless_shell-1248/chrome-headless-shell-linux64`, and touch `INSTALLATION_COMPLETE` and
`DEPENDENCIES_VALIDATED`. After the change above, a re-run of setup with the ci-browser worktree as an argument does it
too.

## 5. Runner image ubuntu-26.04

Source: `https://raw.githubusercontent.com/actions/runner-images/main/images/ubuntu/Ubuntu2604-Readme.md`.

- Image Version **20261023.163.3**. That is the newest tag: `git ls-remote --tags .../actions/runner-images 'ubuntu26*'`
  ends at `ubuntu26/20261023.163` (c3c3ced4). It is unchanged since 3.3.
- OS 26.04.1 LTS, kernel **7.0.0-1017-azure**, Node 24.21.0.
- **Docker client and server 29.4.2, Compose 5.1.3**, Buildx 0.38.0.
- **PostgreSQL 18.6.** The service is disabled by default.
- **Fonts:** the apt table lists only `fonts-noto-color-emoji 2.051-1build1`. The other fonts Chromium renders with come
  from `playwright install --with-deps`. 1.64.1's ubuntu26.04 tools list (`coreBundle.js:32773`ff, and nativeDeps.ts:457ff
  at v1.64.1):
  - xvfb, fonts-noto-color-emoji, fonts-unifont, libfontconfig1, libfreetype6, xfonts-cyrillic, xfonts-scalable,
    fonts-liberation, fonts-ipafont-gothic, fonts-wqy-zenhei, fonts-tlwg-loma-otf, fonts-freefont-ttf;
  - plus chromium's 21 libraries (libasound2t64, ..., libxrandr2).

  **This is the set V3's apt cache must hold.** The baselines depend on it, so the cache key should include `ImageVersion`
  and the Playwright version.
- **GA.** The Readme's announcements say "Ubuntu 26.04 and Ubuntu 26.04 Arm64 are now generally available" (#14747) and
  "`ubuntu-latest` label will use Ubuntu 26.04 in November 2026" (#14748). README.md:23 lists the `ubuntu-26.04` label.
  The GA announcement covers GitHub-hosted standard runners, public repos included.
  - Limit: `gh api repos/actions/runner-images/issues/14747` was refused (HTTP 403: this session's GitHub scope), and the
    badge gist is refused by the proxy, so the issue body and date are not quoted.
- For comparison, the 24.04 image 20261023.334.3 has Docker 28.0.4, Compose 2.38.2, PostgreSQL 16.15 and kernel
  6.17.0-1022-azure (Ubuntu2404-Readme.md:75-78, :173).

## 6. Docker 29's image store on 26.04

- The runner-images toolset-2604.json `docker.components` has containerd.io latest and docker-ce/docker-ce-cli 29.4.2.
- images/ubuntu/scripts/build/install-docker.sh writes no `/etc/docker/daemon.json`: no storage-driver and no
  `features.containerd-snapshotter`. It installs, starts and runs `docker info`.
- `docker/docs` `content/manuals/engine/storage/containerd.md:11-12`: "The containerd image store is the default storage
  backend for Docker Engine 29.0 and later on fresh installations."
- **So on ubuntu-26.04, `docker image inspect .Id` is the manifest or index digest, not the config digest**, which is
  3.3's premise for image-id.ts. It is not observed here (no Docker daemon). The 26.04 probe's `docker info` (Storage
  Driver / `driver-type: io.containerd.snapshotter.v1`) should record it.
- toolset-2404.json pins docker-ce 28.0.4, so the 24.04 capacity chain stays on overlay2 until GitHub changes that pin.
  The store-independent binding remains the right choice (resilience), but 3.3's "weekly rebuild could bring Docker 29"
  should read "a toolset change could".

## 7. axe 4.14 `label-content-name-mismatch`

- axe-core 4.13.0 `axe.js`: tags `[..., 'wcag21a', 'wcag253', ..., 'experimental']`.
- axe-core 4.14.0 `axe.js`: the same tags **without `experimental`**, and a new option
  `valueTextRoles: ['switch','checkbox','radio','menuitemcheckbox','menuitemradio']`.
- CHANGELOG at v4.14.0, line 11: "**label-content-name-mismatch:** Enable rule by default (#5421)". Lines 28-32 list
  word-by-word comparison, ignoring parenthesised content, CJK normalisation, and value-text roles marked incomplete.
- So 3.3's claim stands. The rule now runs in every default `AxeBuilder` scan with tag `wcag21a`, so the two shell.tsx
  findings are real.

## 8. Other facts 3.3 relies on

- The worker image: after ci-deps the base is trixie (Debian 13). Playwright 1.64.1 supports debian13 officially:
  - `coreBundle.js:9248` (`hostPlatform: "debian13"`, official);
  - `:33142` nativeDeps `debian13-x64`;
  - `:34270` the headless shell from CfT.

  So `playwright-core install --with-deps chromium-headless-shell` in the Dockerfile works there.
- `RELEASE_RUNNER = { label: 'ubuntu-24.04', cpus: 4 }` is at tools/screening-capacity/launch-check.ts:104, as 3.3 cites.
- runs-on today: all 23 jobs are `ubuntu-24.04`:
  - approval-of-record.yml:27;
  - ci.yml:34, 156, 169, 231, 319, 360, 395, 468, 527;
  - large-zip.yml:18;
  - mutation.yml:42, 72, 116;
  - publish-content.yml:23;
  - release.yml:29, 131, 204, 251;
  - screening-capacity.yml:64, 132, 241, 277.

  release-dry-run.yml and tools/test/frozen/publish-content.yml come from ci-deps and are not at 6ddd587.
- The ci.yml install step at :191, :267 and :429 is `pnpm --filter @tp/web exec playwright install --with-deps chromium`
  (CHROMIUM_INSTALL, tools/test/ci-chromium.ts:12). In 1.64.1 this installs chromium-1248 and chromium_headless_shell-1248
  from cdn.playwright.dev.

## Evidence files

- Packuments: scratchpad/pack/*.json. Trust script: scratchpad/scripts/trust.js.
- CfT zips: scratchpad/cft/*.zip. Hash script: scratchpad/scripts/zsha.py.
- playwright-core 1.64.1 tarball unpacked: scratchpad/pwcore/x/package.
- axe-core 4.13.0 and 4.14.0 unpacked: scratchpad/axe.
- Runner readmes, toolset, install-docker.sh, Docker docs: scratchpad/runner.
- Progress log: scratchpad/progress/scout-versions.md.
