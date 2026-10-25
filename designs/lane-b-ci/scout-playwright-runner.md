# Scout report: Playwright, axe, ubuntu-26.04, brand baselines, licence exception, exact-version asserts (audit #19, upgrade part)

Scout: playwright-runner. Base: `claude/build-platform` at 49514e8. Date: 2026-10-24.
This scout only read and measured. The repository's working tree, `/home/user/ops`, branches and GitHub were not changed.
Every experiment ran in my own detached worktrees, all since removed, against databases `tp_laneb_pwr_e2e` and `tp_laneb_pwr_e2e141`, both since dropped.
Evidence files are kept under `/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-design/pwr/`, called `pwr/` below.

## 0. Findings in short

1. **The 13 e2e failures on #38 have one cause: two real WCAG 2.5.3 (Label in Name, Level A) defects in the app header.**
   - axe-core 4.14.0 turned `label-content-name-mismatch` on by default. Its tags lost `experimental`; nothing else in the wcag2a/2aa/21a/21aa set changed.
   - It flags the practice switcher (`aria-label="Practice switcher"` over the visible practice name, `apps/web/src/components/shell.tsx:56`).
   - It flags the account menu (`aria-label="Account menu"` over the visible email and initial, `shell.tsx:84`).
   - With both fixed, all 27 tests of the 11 affected spec files pass on Playwright 1.64.1 and axe 4.14.0 (measured, 5.6 min). The other 36 tests already passed on #38.
2. **The brand baselines barely move under Playwright 1.64.1's browser, Chrome for Testing 156.0.8078.4.**
   - The brand journey passes against the committed baselines unchanged (measured).
   - Regenerated under 156, six of the seven are pixel-identical to the committed ones. `report-cover-without-seal` differs in 1,611 pixels (0.187 %), all in the "ROI statement" headline band, y 418-444.
   - Rendering is byte-deterministic run to run.
   - Rendering is unaffected by the host's fontconfig in four configurations.
   - The text-rendering switches are still honoured and still needed: without them the header moves 2.2-3.9 %.
3. **The exact build can be had today without the two Playwright download hosts.**
   - Google's Chrome for Testing bucket `storage.googleapis.com/chrome-for-testing-public` is reachable from here and serves 156.0.8078.4.
   - It also serves 141.0.7390.37. The 141 headless shell from that bucket, under Playwright 1.56.1, regenerated all seven committed baselines **byte for byte** (git showed no change).
4. **The licence failure on #38 comes from the lockfile writer, not from the licence policy.**
   - pnpm 10.28.0 (the repository's pin) writes no `libc:` fields, so pnpm installs both glibc and musl sharp builds on glibc hosts.
   - Dependabot's newer pnpm writes `libc:` fields, so the musl build is skipped and the musl exception goes stale.
   - pnpm 10.34.8 and 11.28.8 write the fields; 10.28.0 does not (measured).
   - Today the web image's standalone output ships both libvips builds, the musl one dead weight (measured).
5. **Three exact-version asserts break dependency PRs by construction, not two.**
   - The `@v4` tag literals (`tools/test/workflows.test.ts:404, :423, :719`).
   - The hard-coded SHA table `PINNED` (`workflows.test.ts:46-58`). Five of #40's 8 failures come from it.
   - `expect(workerPlaywrightVersion()).toBe('1.56.1')` (`tools/screening-capacity/measure.test.ts:232`). It fails the Playwright bump (measured).
   - A real gap sits beside them: the worker image installs `playwright-core@1.56.1` from a literal (`apps/worker/Dockerfile:23`). Dependabot's #38 moved `apps/worker/package.json` to 1.64.1 and left the Dockerfile. Production would print PDFs with Chromium 141 while CI tests 156, and no test catches it.
6. **Ubuntu 26.04: every job except the release's capacity chain can move now.**
   - The 26.04 image runs Docker 29.4.2 (a fresh install), whose default is the containerd image store. Under it, `docker image inspect -f {{.Id}}` is not the config digest that `release.yml` and the launch check rely on. The capacity code says so itself (`tools/screening-capacity/launch-check.ts:66-68`).
   - Moving `RELEASE_RUNNER` changes the binding measurement behind decision 13 (issue #41, "kept in view"). That is a founder question; see section 6.

---

## 1. Current upstream (checked 2026-10-24)

### Playwright

| Fact | Evidence |
|---|---|
| Latest stable is **1.64.1** (2026-10-14). `next` is 1.65.0-alpha-2026-10-24 | `registry.npmjs.org/@playwright/test` dist-tags and time (queried with curl) |
| 1.64.x's Chromium is **Chrome for Testing 156.0.8078.4, revision 1248**, for both `chromium` and `chromium-headless-shell` | `playwright-core@1.64.1/browsers.json` (npm pack). Also https://github.com/microsoft/playwright/releases/tag/v1.64.0 ("Chromium 156.0.8078.4"). CI log of #38, job 119655798280: "Downloading Chrome for Testing 156.0.8078.4 (playwright chromium v1248) from https://cdn.playwright.dev/builds/cft/156.0.8078.4/linux64/chrome-linux64.zip" |
| Playwright has used Chrome for Testing builds since 1.57 | https://github.com/microsoft/playwright/releases/tag/v1.57.0 ("switches from Chromium, to using Chrome for Testing builds") |
| 1.64.1 downloads from `https://cdn.playwright.dev/builds/cft/<version>/<suffix>`. `PLAYWRIGHT_CHROMIUM_DOWNLOAD_HOST` / `PLAYWRIGHT_DOWNLOAD_HOST` replace the mirror | `playwright-core@1.64.1/lib/coreBundle.js` `cftUrl()` (~line 33999) and `_downloadURLs` (~line 35000) |
| **Ubuntu 26.04 is supported from 1.61.0.** `ubuntu26.04-x64` download paths and native deps first appear in 1.61.0; 1.60.0 has none | https://github.com/microsoft/playwright/releases/tag/v1.61.0 ("Playwright now supports Ubuntu 26.04"). Grep of each version's `lib/` (pwr/pwcore-versions): 1.60.0 0 hits, 1.61.0 16 hits |
| 1.56.1 on Ubuntu 26.04 resolves to host platform `ubuntu26.04-x64`, which has no download path. `playwright install` stops with "ERROR: Playwright does not support chromium on ubuntu26.04-x64" | `playwright-core@1.56.1/lib/server/utils/hostPlatform.js:79`; `lib/server/registry/index.js:1114` |
| Per-version Chromium | 1.57 143.0.7499.4; 1.58 145.0.7632.6; 1.59 147.0.7727.15; 1.60 148.0.7778.96; 1.61 149.0.7827.55; 1.62 151.0.7922.34; 1.63 153.0.8010.12 (rev 1243, the base image's `/opt/pw-browsers`); 1.64 156.0.8078.4 (rev 1248) (each version's browsers.json) |

1.64's breaking changes that touch this repository (https://github.com/microsoft/playwright/releases/tag/v1.64.0):
- Device descriptors now forward `screen`.
- `--update-snapshots` modes were renamed; the default is now `'default'`.
- Elements inside a hidden iframe are treated as hidden.

None of them failed a measured test (section 4).

### axe

| Fact | Evidence |
|---|---|
| Latest axe-core is **4.14.0** (2026-10-05); latest @axe-core/playwright is **4.14.0** (2026-10-15) | npm registry dist-tags and time |
| 4.14.0 enables `label-content-name-mismatch` by default and warns that issue totals may rise. The rule now also compares by word, ignores parenthesised content and normalises CJK | https://github.com/dequelabs/axe-core/releases/tag/v4.14.0 (#5421, #5345, #5360, #5419) |
| The only tag changes between 4.13.0 and 4.14.0: `label-content-name-mismatch` lost `experimental`, and `target-size` gained EN 301 549 v4 tags (wcag22aa, outside our tag set) | `node pwr/rules.cjs` over both packages' `axe.getRules()` |

### GitHub runner images

| Fact | Evidence |
|---|---|
| `ubuntu-latest` moves to 26.04 from **2026-10-19**, to be finished by **2026-11-19**, gradually (two runs the same day can land on different images) | https://github.com/actions/runner-images/issues/14748 (opened 2026-09-17); https://github.blog/changelog/2026-09-17-ubuntu-26-generally-available-and-latest-migration |
| Labels `ubuntu-26.04` and `ubuntu-26.04-arm` exist. At most 2 GA images are supported at a time, so 24.04 stays until the next LTS reaches GA | https://github.com/actions/runner-images/blob/main/README.md |
| 26.04 image 20261023.163.3 contents | https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2604-Readme.md; https://github.com/actions/runner-images/blob/main/images/ubuntu/toolsets/toolset-2604.json (docker-ce 29.4.2, containerd.io latest; postgresql "18") |
| 26.04 kernel and systemd | kernel 7.0.0-1017-azure |
| 26.04 Python | default python3 3.14.4; tool cache **3.10.22, 3.11.17, 3.12.15, 3.13.16, 3.14.8** (so `setup-python` 3.12 is served from the cache) |
| 26.04 PostgreSQL | **PostgreSQL 18.6** (service disabled; client tools come with it) |
| 26.04 Docker | **Docker 29.4.2**, Compose 5.1.3, Buildx 0.38.0 |
| 26.04 Node and browsers | Node 22.23.3 / 24.21.0 cached; Chrome 155 |
| 24.04 image 20261012.334.1 | PostgreSQL **16.15**, Docker **28.0.4**, default python 3.12.3, same Python tool cache (https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md) |
| 24.04's Docker in our own runs is 28.0.4 with **Storage Driver: overlay2** (the classic store) | screening-capacity job 120498130703 log, lines 221-222 (`pwr/pr40-capacity.log`) |
| Docker Engine 29 makes the **containerd image store the default on fresh installs**; upgraded daemons keep overlay2 | https://docs.docker.com/engine/storage/containerd/ ; https://www.docker.com/blog/docker-engine-version-29/ |
| The runner image's Docker install script writes no `/etc/docker/daemon.json` (no snapshotter setting) | https://github.com/actions/runner-images/blob/main/images/ubuntu/scripts/build/install-docker.sh |

**Inference, not yet observed:** the ubuntu-26.04 runner's Docker 29.4.2 is a fresh install with no daemon setting, so it most likely runs the containerd image store. One `docker info` on a 26.04 job settles it (open item).

### Python and the PostgreSQL client on 26.04
- Python 3.12 is in the tool cache, so `actions/setup-python` with "3.12" and `pip install pyx12` work unchanged.
- PostgreSQL 18 client tools replace 16. Two effects:
  - `ci.yml:34`'s `psql` keeps working.
  - The restore drill that CI skips today ("restore-drill.db.test: the pg_dump drill is skipped: pg_dump 16 cannot dump a PostgreSQL 18 server", #38 log line 1874) will run. That is a real check gained, and possibly a new failure to fix.

---

## 2. What the repository has

### `docs/adr/0058…` (lines 125-186, "Visual baselines, and CI on the same Chromium")
- Seven baselines are compared: header at 1280 and 390, lockup band at both widths, cover top, and cover with and without the seal.
- Comparison settings: `VISUAL` maxDiffPixelRatio 0.01 at threshold 0.2; `STRICT` threshold 0.05 with at most 6 pixels.
- Computed checks cover the lockup's colours, face and place.
- A foot check holds that the without-seal cover's foot is blank Paper.
- The ADR records the baselines as "Playwright's Chromium (141.0.7390.37 for 1.56.1) on Ubuntu 24.04".
- Text rendering is fixed by `--font-render-hinting=none --disable-lcd-text` plus `e2e/fonts.conf`.
- Running CI in Playwright's container was rejected: "A larger change to CI for the same browser build, and the text would still follow that image's fontconfig". That reason still holds; section 4 shows the fixed text rendering makes the host irrelevant anyway.
- Consequences (line 227) say to regenerate with `playwright test e2e/brand.spec.ts --update-snapshots`.

### Files

| File | What it holds |
|---|---|
| `apps/web/playwright.config.ts` | Uses the bundled Chromium when `chromium.executablePath()` exists, otherwise `channel: 'chrome'` (lines 30, 70). `textRendering` holds the switches and `FONTCONFIG_FILE` (lines 40-43). `retries: 1` on CI (line 62) |
| `apps/web/e2e/brand.spec.ts` | `VISUAL` (line 65), `STRICT` (line 73), the foot check (`pixelsUnlike`), `getByLabel('Practice switcher')` and `getByLabel('Account menu')` (lines 330-331). `sign-in.spec.ts:18` also uses `getByLabel('Practice switcher')` |
| `apps/web/e2e/a11y.ts:12` | Runs axe with tags `wcag2a, wcag2aa, wcag21a, wcag21aa` |
| `apps/web/e2e/fonts.conf` | Includes the host's config, then assigns grayscale antialiasing, no hinting and no subpixel rendering to every pattern and font |
| `tools/check-licenses/allowlist.json` | Two LGPL exceptions: `@img/sharp-libvips-linux-x64` and **`@img/sharp-libvips-linuxmusl-x64`** (the stale one) |
| `tools/check-licenses/check.ts:78-84` | Turns an exception that matches no listed production package into a problem ("remove it"). The list is `pnpm licenses list --prod --json`, which reports only what is installed on this host (`tools/check-licenses/index.ts:13`) |
| `package.json:5` | `"packageManager": "pnpm@10.28.0"` |
| `apps/web/Dockerfile:11`, `apps/worker/Dockerfile:6` | `npm install --global pnpm@10.28.0` |

### Tests that print through Chromium
All through `playwright-core`'s `chromium` (`apps/worker/src/report/pdf.ts`, `ChromiumPdfRenderer`):
- `apps/worker/src/report/print-layout.test.ts`. It fails in CI if Chromium is missing (line 164).
- `report.test.ts`, `brand.test.ts`, `documents.test.ts`, `report.db.test.ts`.
- `apps/worker/src/packets/export.test.ts`, `payer-copy.db.test.ts`.
- `apps/web/src/lib/routes/audit-e2e.db.test.ts`.
- `tools/screening-capacity/run.ts`: the harness's browser.

Each package resolves the revision of its own `playwright-core` pin, so `apps/web`, `apps/worker` and `tools` must move together. Otherwise `ci.yml:81`, which installs only web's revision, leaves the worker's revision missing.

### Production images
- The **worker image carries a browser**: `apps/worker/Dockerfile:23-24` runs `npm install --no-save --omit=dev playwright-core@1.56.1 && npx playwright-core install --with-deps chromium-headless-shell` in the runtime stage, with `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`.
- The bundle keeps `playwright-core` external (`apps/worker/build.ts:58`), so the image's 1.56.1 is what runs.
- The **web image carries none** (`apps/web/Dockerfile`).

### Exact-version asserts

| Assert | Where |
|---|---|
| `step.uses === 'actions/upload-artifact@v4'` | `workflows.test.ts:404`, `:423` |
| `['actions/checkout@v4', 'actions/setup-node@v4', …]` | `workflows.test.ts:719` |
| The `PINNED` SHA table and its uses | `workflows.test.ts:46-58`, with uses at `:285, :313, :319, :320, :370, :574, :605-614, :623, :697-698` |
| `expect(workerPlaywrightVersion()).toBe('1.56.1')` | `measure.test.ts:232`. The comment above it says "The version the image installs is the worker's own pin", but the test never reads the Dockerfile |

### Runner label pins
- `workflows.test.ts:160-171` requires every job on `ubuntu-24.04`, citing "the founder's third ruling".
- `:314, :317, :571, :591, :673` pin individual jobs.
- `launch-check.test.ts:231` pins `RELEASE_RUNNER`, and `launch-check.ts:104` defines it: `{ label: 'ubuntu-24.04', cpus: 4 }`.

---

## 3. The Dependabot PRs' latest runs

### #38 (npm minor and patch)
Head 3f6ddc8, base 510a26d. Brings Playwright 1.64.1, axe 4.14.0, next 16.4.2, vitest 5.0.5, eslint 10.13.0, the Anthropic SDK 0.135.0 and postcss.

**ci run 39727848494, job 119655798280** (ubuntu-24.04 image 20261018.339.1; log in `pwr/pr38-ci.log`, 3,696 of 3,697 lines read):
- The install step downloaded CfT 156.0.8078.4 (rev 1248).
- **Unit 4,211 passed** (1 skipped). This includes every worker print test under Chromium 156. Golden 38 passed, oracle passed.
- **test:db 8,776 passed**.
- **e2e: 13 failed, 36 passed.**
- Every first-attempt failure is axe `label-content-name-mismatch`, "serious", on two nodes:

| Node | Element |
|---|---|
| `.sm\:px-2\.5` | The practice switcher's `<summary>`, `shell.tsx:56`: `aria-label="Practice switcher"`, visible text the practice's name |
| `.px-1` | The account menu's `<summary>`, `shell.tsx:84`: `aria-label="Account menu"`, visible text the initial and, from md up, the email |

Failing tests: billing:28; brand:291 (at `brand.spec.ts:352`, the axe call **before any screenshot comparison**, so #38 tells nothing about the baselines); era-exports:172; models:91; monitoring:51; onboarding:51 and :283; packets:71 and :458; reports:88; screening:117; triage:40; unattested:34.

- onboarding:51 and screening:117 flag only `.px-1`: a platform administrator has no practice switcher.
- The **retries failed differently**, on state the first attempt left behind:
  - "Held — Duplicate of file … nothing loads from it" in models, packets, reports and triage;
  - `/sign-in/hardware-key?reason=hardware_key_required` in onboarding, screening and unattested.
- These are artefacts of `retries: 1` on a dirty run, not separate defects. They are relevant to #109's "report flaky tests instead of hiding them".

**supply-chain run 39727848706:**
- **licenses job 119655799035 failed**: "the exception for @img/sharp-libvips-linuxmusl-x64 (LGPL-3.0-or-later) matches no production dependency; remove it".
- images (web) and (worker) passed. But the worker image still installed playwright-core **1.56.1**: the Dockerfile literal, which Dependabot does not edit.

### #40 (GitHub Actions)
Head c13c688, base 49514e8: checkout 4→7, setup-node 4→7, pnpm/action-setup 4→6, setup-python 5→6, upload-artifact 4→7, setup-buildx 3→4, build-push 6→7, download-artifact 4.3.0→8.0.2, cache 4.3.0→6.1.0, login 3.7.0→4.6.0.

**ci run 39978142633, job 120498066630** (log in `pwr/pr40-ci.log`): **8 failures, all in `tools/test/workflows.test.ts`**.
- **3 from tag literals:**
  - "keep the e2e suite's report…" and "print a failed run's screenshot diffs…": `upload-artifact@v4` is not found once it is `@v7`;
  - approval-of-record: `['actions/checkout@v7', 'actions/setup-node@v7', …]` against `@v4`.
- **5 from the `PINNED` table:** the release build, release capacity and release report jobs, screening-capacity `changes`, and "pin every action to a full commit SHA". In each the new SHAs (for example `actions/checkout@3d3c42e5…`, `download-artifact@9000827c…`) are simply not the table's.
- The "SHA with `# vX.Y.Z` comment" format check **passed**: Dependabot keeps the comment.
- e2e 51 passed (Playwright 1.56.1).
- test:db did not run: its step has no `if` and follows the failed unit step.
- supply-chain and screening-capacity passed.

### #33 (Docker base images, node 24-slim → 25-slim)
All green on 2026-10-22 against base 510a26d: ci 39730710290, supply-chain 39730710447, screening-capacity 39730710308. Node 25 is not an LTS line; audit #112's "ignore semver-major for the Node image" covers it.

---

## 4. Measurements

All runs used Playwright 1.64.1 and axe 4.14.0, with Chrome for Testing 156.0.8078.4 from Google's bucket unpacked as `chromium-1248` and `chromium_headless_shell-1248` under `PLAYWRIGHT_BROWSERS_PATH=pwr/browsers/ms-playwright`. The exceptions are M5 and M10, as noted. The machine is Ubuntu 24.04.5, 4 CPUs shared, load about 7.5.

### M1. Licence failure reproduced
Worktree at #38's head; `pnpm install --frozen-lockfile; pnpm -s licenses:check`:
- Result: "refused, 1 problem(s). - the exception for @img/sharp-libvips-linuxmusl-x64 … remove it".
- Only `@img+sharp-libvips-linux-x64@1.3.4` is installed.
- The lockfile has 46 `libc:` lines; the base's has 3.
- On base 49514e8 the check passes, and both `@img+sharp-libvips-linux-x64` and `…-linuxmusl-x64` are installed.

### M2. Which pnpm writes `libc:`
Lockfile-only resolution of `{"sharp":"0.35.5"}` with each pnpm (`pwr/libc-probe/`):

| pnpm | `libc:` lines | musl entry has `libc` |
|---|---|---|
| 10.28.0 | 1 | no |
| 10.34.8 | 17 | yes |
| 11.28.8 | 17 | yes |

- The npm registry's abbreviated metadata lacks `libc` while the full document has `libc: ['musl']` (curl of `@img/sharp-libvips-linuxmusl-x64`).
- A non-frozen reinstall with 10.28.0 keeps existing `libc:` fields (46 lines, no diff).

### M3. The web build ships both libvips builds on the current lockfile
`find apps/web/.next/standalone -type d -name 'sharp-libvips*'` gives both `@img+sharp-libvips-linux-x64@1.3.4` and `@img+sharp-libvips-linuxmusl-x64@1.3.4`. The image is Debian (glibc), so the musl copy never loads.

### M4. A11y fix and the brand journey against the committed (141) baselines
Run: `playwright test e2e/brand.spec.ts`.
- **Practice-switcher label only:** still fails on `.px-1`.
  - The rule's "visible text" includes the `aria-hidden` initial, because axe calls `visible_virtual(node, false, false)` with screenReader false (`axe-core@4.14.0/axe.js` ~line 38250).
  - So visible "S" plus the email is not contained in "email, account menu".
- **Both fixes (prototype in `pwr/shell-a11y-fix.diff`):** `brand.spec.ts:291` **passes: axe clean and all seven comparisons pass against the committed 141 baselines.**

  ```tsx
  // shell.tsx:56
  aria-label={`${current?.name ?? 'Choose a practice'}, practice switcher`}
  // shell.tsx:84
  aria-label={`${shell.email}, account menu`}
  // the initial drawn as CSS content, so it is no text node
  <span aria-hidden="true" data-initial={initial} className="… before:content-[attr(data-initial)]" />
  ```

  Command: `playwright test e2e/brand.spec.ts:291`; 1 passed (1.6 min).

### M5. Regenerated under 156 and compared to the committed baselines
Run: `--update-snapshots=all`, then `node pwr/scripts/pngdiff.mjs`, which decodes with sharp, counts differing pixels and applies pixelmatch's YIQ delta at 0.2 and 0.05 with no antialiasing exemption, so it is an upper bound.

| Baseline | Pixels changed (141 → 156) |
|---|---|
| header-1280 | 0 |
| header-390 | 0 |
| header-lockup-1280 | 0 |
| header-lockup-390 | 0 |
| report-cover-top | 0 |
| report-cover-with-seal | 0 |
| **report-cover-without-seal** | **1,611 differ (0.187 %), 1,038 at 0.2 (0.120 %), 1,399 at 0.05, max channel delta 233** |

- The changed pixels sit at x 83-316, y 418-444: the "ROI statement" headline. The glyphs moved by a subpixel offset (`pwr/without-seal-diff.png`, `pwr/covers-top.png`).
- On the with-seal cover the same headline sits at a different y and is unchanged.
- The six identical images still differ in **bytes** from the committed files: Playwright 1.64's PNG encoding.
- **The prototype header fix moves no pixels**: the 156 headers, made with the fix, equal the 141 baselines pixel for pixel.

### M6. Determinism
A second `--update-snapshots=all` run produced all seven files **byte-identical** to the first (`cmp`).

### M7. Committed baselines reproduced with Google's 141 build
CfT 141.0.7390.37 headless shell from `storage.googleapis.com/chrome-for-testing-public/141.0.7390.37/linux64/` (zip SHA-256 `b294238e…f6e147d`) was laid out as `chromium_headless_shell-1194` under **Playwright 1.56.1**, on an unmodified base worktree.
- `--update-snapshots=all` left `git status` clean: **all seven baselines byte-for-byte as committed.**
- Google's CfT build of a version therefore renders exactly as Playwright's own build of it.
- The 156 downloads' SHA-256 values:
  - headless-shell zip `c3e50596aef52c58f8fda3c6b3411c33d34c88b177b3ed1c2243359fd3b8ba20`;
  - chrome zip `43fd31766c7533a02dda2ded5ad50c2f861cd5400be7509c0abad71129f79d79`;
  - `chrome-headless-shell` binary `4fa61f0ba0b4f89b7bec242c32ca16d3bccf69dbfef0651924a9ba8fede5f9d6`.

### M8. Host independence and the switches under 156
Fontconfig variants in `pwr/fontconfs/`; each compared with the M5 run.

| Run | Host config | Repo `fonts.conf` rules | Switches | Result |
|---|---|---|---|---|
| E4 | Hostile: hinting on, hintslight, RGB, lcddefault | applied after the host's | on | **identical (0 px in all 7)** |
| E5 | Hostile | applied | **off** | Headers differ by 2.200 % (1280), 3.265 % (390) and 3.900 % (lockup bands) at 0.2; covers by 1.112 % and 0.936 %; cover-top 0 |
| E6 | Hostile | **not applied** | on | identical |
| E7 | Antialias off, hintfull, autohint | applied | on | identical |

- The switches are honoured by Chrome for Testing 156 and still required (E5 would fail `VISUAL` and `STRICT`).
- With them plus `fonts.conf`, the host's fontconfig moves no pixel.

### M9. The affected journeys under axe 4.14 with the fix
Run: `playwright test` of billing, era-exports, models, monitoring, onboarding, packets, reports, screening, triage, unattested and sign-in, with `--workers=2 --retries=0`.
- **27 passed (5.6 min).**
- Together with the 36 tests #38 passed under 4.14, every one of the 51 e2e tests then on the base has run green under axe 4.14.
- Lane A's #42 adds tests (53 on its CI) that this does not cover.

### M10. Version asserts on the Playwright bump
Run: `vitest run tools/screening-capacity/measure.test.ts tools/test/workflows.test.ts` on the bumped worktree.
- `measure.test.ts` fails: "expected '1.64.1' to be '1.56.1'".
- The other failure (the textRendering literal) came from my experiment's own config edit and is not a finding.

---

## 5. Regenerating the seven baselines (item 4)

### Best: regenerate locally with the exact build from Google's Chrome for Testing bucket, today
1. Fetch `https://storage.googleapis.com/chrome-for-testing-public/156.0.8078.4/linux64/chrome-headless-shell-linux64.zip` and `…/chrome-linux64.zip`.
2. Unpack them as `chromium_headless_shell-1248/chrome-headless-shell-linux64/` and `chromium-1248/chrome-linux64/`, each with an `INSTALLATION_COMPLETE` marker, under a `PLAYWRIGHT_BROWSERS_PATH`.
   - The `chromium-1248` full build only satisfies `playwright.config.ts`'s `existsSync(chromium.executablePath())`; headless runs use the shell.
3. Run `pnpm --filter @tp/web exec playwright test e2e/brand.spec.ts --update-snapshots=all`.
   - Use `=all`: under 1.64 the plain flag rewrites only failing snapshots, and none fail, so the 0.19 % drift would stay.
4. Commit all seven, so a future `=all` on the same build is a byte no-op and `git status` alone answers "did anything move".

Why this is best:
- It needs neither of the two refused hosts.
- M7 proves a CfT bucket build reproduces Playwright's own build byte for byte.
- M6 and M8 show the result is deterministic and independent of the host.
- It takes about 3 minutes once the Next build is cached.
- A ready layout of 156 is kept at `pwr/browsers/ms-playwright` (676 MB) for the builder.

Once the co-founder allows `cdn.playwright.dev` and `playwright.download.prss.microsoft.com`, `pnpm --filter @tp/web exec playwright install chromium` gives the same build with no hand-made layout. That is equally faithful and simpler; use it when it is available.

### Tie local to CI
In the install step (`ci.yml:81`), print `chrome-headless-shell --version` and the SHA-256 of `~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell`. Compare it with `4fa61f0b…d9f6`. The PR's first CI run then compares the committed files on the runner.

### Fallback: regenerate on CI
The proxy refuses artifact downloads, so the images have to come through the log.
- Add a label-gated step after the e2e step, for example `if: contains(github.event.pull_request.labels.*.name, 'regenerate-baselines')`.
- It runs `pnpm --filter @tp/web exec playwright test e2e/brand.spec.ts --update-snapshots=all` and prints each of the seven as `path base64` on one line, the format `ci.yml:103-108` already uses.
  - The existing failure-only step would print nothing here: the comparisons pass under 156 (M4), so no `*-diff.png` or `*-actual.png` is written.
  - The files are 2.8-50 KB.
- A person decodes them locally, inspects them and commits them. `workflows.test.ts` pins the step like the failure print.
- `ci.yml` triggers on the default `pull_request` types, so the label applies on the next push. `workflow_dispatch` is not usable because dispatch needs the workflow on main.

### How a person inspects (ADR 0058)
- Look at the seven images in the PR's "Files changed" image diff (2-up, swipe, onion skin).
- The PR description gives per-image pixel counts from the decode-compare script (here: six pixel-identical, the without-seal cover 1,611 px in the headline band) and the crop of the changed band (`pwr/without-seal-diff.png`).
- The journey still refuses a without-seal baseline whose foot is not blank Paper.
- The full-page screenshots stay in `brand-screenshots/`, uploaded as the CI artifact, which a person can open in the browser.
- ADR 0058's baseline line becomes: Chrome for Testing headless shell 156.0.8078.4 for 1.64.1, on Ubuntu 26.04 for CI, made here on 24.04 and measured host-independent. Its regenerate command gains `=all`.

### Rejected: CI inside Playwright's container image
Rejected again, for ADR 0058's reason. M8 also shows the fixed text rendering already makes the host irrelevant.

---

## 6. Moving every job to ubuntu-26.04 (item 5)

| Workflow / job | What changes on 26.04 | Verdict |
|---|---|---|
| `ci.yml` check | Label (`:16`). Playwright must be ≥1.61 for `install --with-deps` (1.64.1). `setup-python` 3.12 from the tool cache. `psql` and `pg_dump` 18: the restore drill stops skipping and runs for real. Delete the comment at `:14-15` | Move with the Playwright upgrade |
| `mutation.yml`, `large-zip.yml`, `publish-content.yml`, `approval-of-record.yml` | Label only. Node comes from setup-node; Postgres from the `postgres:18` service | Move |
| `supply-chain.yml` licenses | Label only | Move |
| `supply-chain.yml` images | Docker 29 build and `load: true`, then trivy reads the image from the daemon. Probably fine under either store; verify on the first run | Move |
| `screening-capacity.yml` changes, gate, notify | Label only; they read paths or results | Move |
| `screening-capacity.yml` capacity | Docker 29: `docker image inspect -f {{.Id}}` under the containerd store gives the manifest or index digest, not the config digest (`launch-check.ts:61-69`). Kernel 6.17 → 7.0 and systemd 255 → 259 move S4's times, which already swing 38-57 s with the host (#41). Playwright 1.64.1 still supports 24.04 for the harness's browser | Hold on 24.04 with the release chain (founder question) |
| `release.yml` build, capacity, push | The build job writes `docker image inspect -f '{{.Id}}'` beside each saved image (`release.yml:107`); the push job compares after load (`:228`). These must run on the same store type. The harness records the same ID, and the launch check compares it with ECR's **config digest**: under the containerd store every genuine report would be refused and production would stay closed. `RELEASE_RUNNER = { label: 'ubuntu-24.04', cpus: 4 }` (`launch-check.ts:104`). `runnerTooSmall` (`limits.ts:399`) and the layout depend only on CPUs: still 4 on 26.04, so the layout is unchanged. The report (`report.ts:363`) records cpus, memory, cpu model and kernel, **not the image** | Hold on 24.04 (founder question) |
| `release.yml` report | gh only | Either; keep it with its chain for simplicity |

### Recommended in the CI PR
- Move every job except release.yml's build, capacity and push and screening-capacity.yml's capacity, which stay on `RELEASE_RUNNER.label`.
- `workflows.test.ts:160-171` becomes: every job on `ubuntu-26.04`, except that the release's image chain and the capacity measurement run on `RELEASE_RUNNER.label`. It still refuses `-latest`, unversioned labels and larger runners.
- Make the image binding independent of Docker's image store, which pays on any runner since 24.04's Docker can also reach 29 in a later image:
  - read each image's config digest from `docker save`'s `manifest.json` / `index.json` in the build job and the harness, instead of `{{.Id}}`;
  - or fail fast with a clear message when `docker info` reports the containerd snapshotter.
- Record `ImageOS` and `ImageVersion` (GitHub's runner variables) in the report's `runner` field, as a schema bump to /9, so a binding report names the image it measured on, and the launch check can hold it to `RELEASE_RUNNER`. Then the founder can move the release runner with one advisory 26.04 capacity run's numbers in hand, recorded on #41.

### Founder decision?
- **Yes, for moving the binding measurement.** Decision 13 and ADR 0062 name `ubuntu-24.04`, and #41 keeps the free-runner measurement "kept in view".
- **No, for the other jobs.** Same free 4-vCPU runner, same cost, same tests.

---

## 7. Fix list (item 6)

### WCAG findings (real; WCAG 2.5.3 Label in Name, Level A)
- **Practice switcher**, `shell.tsx:56`: make the accessible name begin with the visible practice name, e.g. ``aria-label={`${name}, practice switcher`}``.
- **Account menu**, `shell.tsx:84`:
  - name it by the visible email: ``aria-label={`${shell.email}, account menu`}``, or drop `aria-label` and add `sr-only` "account menu" after the email span;
  - draw the decorative initial as CSS generated content (`data-initial` with `before:content-[attr(data-initial)]`) so it is no text node.
  - At 390 px the email is hidden, so the visible text is empty and the rule passes.
- The tests' `getByLabel('Practice switcher')` and `getByLabel('Account menu')` still match, because the match is a case-insensitive substring.
- No header pixel changes (M5).
- Optionally add a computed check that each header control's accessible name contains its visible text, so a later refactor fails without axe.

### Licence exception (root cause, then the exception)
1. Move `packageManager` to the latest pnpm 10.34.x (10.34.8, 2026-10-23, writes `libc:` per M2; 10.34.6 of 2026-09-28 if the project wants a release at least two weeks old, after checking that it also writes `libc`). Change the same version at `apps/web/Dockerfile:11` and `apps/worker/Dockerfile:6`.
2. Re-resolve the lockfile so every sharp platform package carries `libc:`.
3. **Remove the `@img/sharp-libvips-linuxmusl-x64` exception.** No image is musl-based: both are `node:24-slim`, Debian.

Effects:
- The licence check, the CI install and the image install agree with Dependabot's writer.
- The web image stops shipping the unused musl libvips (M3).

Guard:
- Add a `tools/check-licenses` test that every lockfile entry for a `*linuxmusl*` package carries `libc: [musl]`.
- Its message names the cause (a lockfile written without libc metadata) and the remedy (re-resolve with the pinned pnpm). A writer that drops the fields then fails with that reason instead of with an "LGPL not allowed" for the musl build.

### Exact-version asserts, loosened while keeping what they guard
- **`workflows.test.ts:404, :423`.** Find the upload step by action name: `step.uses?.startsWith('actions/upload-artifact@')`. Its position and `if:` are the guard.
- **`workflows.test.ts:719`.** Compare names without refs: `steps.map((s) => s.uses?.replace(/@.*/, '') ?? s.run)` equals `['actions/checkout', 'actions/setup-node', 'node tools/approval-of-record/approval-of-record.ts']`. "Installs nothing" is about which actions run, not their version.
- **`PINNED` (`:46-58` and its uses).** Replace the hard-coded SHA table with:
  1. Keep the format rule, `uses: owner/repo@<40 hex> # vX.Y.Z` (`:689-692`). This is what stops a moved tag.
  2. Consistency: each action resolves to one SHA and one version comment across `release.yml` and `screening-capacity.yml`, so a half-applied update fails.
  3. Each step's identity by name prefix, as at `:228`.
  4. Proof the SHA is the release named in the comment: a CI step in supply-chain.yml, with network, that checks `git ls-remote https://github.com/<owner>/<repo> refs/tags/vX.Y.Z refs/tags/vX.Y.Z^{}` equals the pinned SHA, failing otherwise. This catches an impostor or fork commit, which the static table only did if a reviewer looked.
- Dependabot's SHA-plus-comment updates (#40) then pass, while a moved tag, an unpinned ref or a SHA that is not the named release still fails.
- **`measure.test.ts:232`.** Replace `toBe('1.56.1')` with the guard the comment intends: the worker Dockerfile installs exactly `workerPlaywrightVersion()`. Best is to make the Dockerfile **derive** it:
  - in the build stage, `node -p "require('./apps/worker/package.json').dependencies['playwright-core']" > /playwright-core.version`;
  - the runtime stage installs `playwright-core@$(cat …)`.
  - Then Dependabot's Playwright PR moves the image too.
  - Add a test that `@playwright/test` (web), `playwright-core` (worker, tools) and the lockfile all name one version, so CI's browser, the worker tests' browser and production's browser are one build.

### Also in this area
- **Dependabot.** Add a `playwright` npm group before `minor-and-patch` (first match wins), with patterns `@playwright/test`, `playwright`, `playwright-core`, `@axe-core/playwright`, `axe-core`.
  - Its PR is green when baselines stay within tolerance (as now). Otherwise it fails with the diffs printed, which is the signal to regenerate.
  - Dependabot reads `main`'s `.github/dependabot.yml`. That copy is the one in force, and changing it needs the founder's ruling on a PR into main; the build branch's copy is documentation until launch.
- **ADR 0058 text.** Update the baseline build line, the claim "Chromium 141 honours both", replaced by the M8 measurements for 156, and the regenerate command with `=all`.
- **ops.** `tools/setup-container.sh` can provision the exact Chromium from Google's CfT bucket. The two Playwright hosts stop being a blocker; this is a note for Lane A's ops branch.

---

## 8. Evidence index (`pwr/` = `…/scratchpad/ci-design/pwr/`)

| What | File |
|---|---|
| #38 ci log | `pr38-ci.log` |
| #40 ci log | `pr40-ci.log` |
| #40 capacity log (Docker 28.0.4, overlay2) | `pr40-capacity.log` |
| Run logs | `run-E0.log`, `run-E1.log`, `run-E2.log`, `run-E3.log`, `run-E4-…`, `run-E5-…`, `run-E6-…`, `run-E7-…`, `run-141.log`, `run-subset.log` |
| Baselines | `baselines-141/` (committed), `baselines-cft141/` (CfT 141 under 1.56.1, byte-equal to committed), `baselines-156-run1/` and `baselines-156-run2/` (156, byte-equal to each other), `baselines-E4…E7/` |
| Diff crops | `without-seal-diff.png`, `covers-top.png` |
| Scripts | `scripts/pngdiff.mjs`, `scripts/bbox.mjs`, `scripts/crop2.mjs`, `rules.cjs` |
| Fontconfig variants | `fontconfs/` |
| Prototype diffs | `shell-a11y-fix.diff`, `playwright-bump.diff` |
| pnpm probe | `libc-probe/` |
| Ready Playwright layout of CfT 156 | `browsers/ms-playwright/` |
