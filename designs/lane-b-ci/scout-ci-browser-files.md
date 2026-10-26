# ci-browser (design §3.3), Scout A: files and code, re-read at 6ddd587

2026-10-26. Base `claude/build-platform` 6ddd587; design text written at 49514e8 (`/home/user/ops/designs/lane-b-ci.md:1671-1840`).
Every "now" line is at 6ddd587. "ci-deps" means §3.2 as re-read (§3.2.1-3.2.7), not yet merged. Working notes with the
raw evidence: `scratchpad/ci-browser/progress/scout-files.md`; logs and tables in `scratchpad/ci-browser/logs/`.

## 0. What changed against §3.3, in short

1. **New blocker for the local verifier: actionlint does not know `ubuntu-26.04`.** The installed actionlint 1.7.7
   fails a `runs-on: ubuntu-26.04` job with `label "ubuntu-26.04" is unknown ... [runner-label]`, exit 1 (run on a
   scratch workflow). `rule_runner_label.go` at v1.7.7, at v1.7.12 (the latest release) and at main lists only 22.04
   and 24.04 (raw.githubusercontent.com, 2026-10-26). `workflows.test.ts:1285-1293` runs actionlint wherever it is
   installed. CI has no actionlint, so that test is unit's one skip (job 121281841727, log line 531: "workflows.test.ts
   74 tests | 1 skipped"; total "4996 passed | 1 skipped"). §3.3.4 step 2 would therefore go red locally on all 18
   moved jobs, and `:355-359` forbid `.github/actionlint.yaml`. **Recommended:** the test spawns actionlint with
   `-ignore 'label "ubuntu-26\.04" is unknown'`. That covers one exact label, needs no config file, keeps the ban, and
   is revisited when actionlint lists 26.04. Not recommended: an `actionlint.yaml` with `self-hosted-runner.labels`.
   It would reverse a ruled ban and tell actionlint to treat a hosted label as self-hosted.
2. **V3 measured. The 10 minutes are a throttled Ubuntu mirror.** The time goes to the apt download inside
   `--with-deps`, not to Playwright: "Fetched 25.9 MB in 9min 59s (43.3 kB/s)" from azure.archive.ubuntu.com (#45's
   `db (4/4)`, job 121270018490). The design is in §6.
3. **The runner rule moved.** `workflows.test.ts:160-171` is now `:349-360` (the "every job on ubuntu-24.04" test),
   with `runnerProblems` at `:146-163` and the pinned-image test at `:342-347`.
4. **The `.Id` binding is read in `run.ts:825-826`, not in `containers.ts`** (containers.ts has no `.Id` or `docker
   info`). `run.ts` is a #42 file, but `:825` lies outside every #42 hunk (§4).
5. **Report format:** `REPORT_FORMAT = 'tp-screening-capacity/8'` (`report.ts:56`), so the next free number is **/9**.
   #42 adds `Measurements.mail` but does not bump the format.
6. **Cites that moved:**
   - `ci.yml:103-108` (the base64 picture format) is now `ci.yml:453-462`;
   - `screening-capacity.md:464` is now `:467`;
   - reconciliation-001's `:529` is now `:548`;
   - `tools/package.json`'s playwright-core is at `:33`.
7. **New literals and stale text ci-browser must fix:**
   - `ci.yml:32-33`'s comment names "Playwright 1.56.1". ci-deps' `no-duplicated-versions.test.ts` scans workflow
     comments and takes the worker's playwright-core from `apps/worker/package.json`, so the comment must name its
     source, not the number;
   - `workflows.test.ts:142` says ubuntu-latest moves to 26.04 "from 2026-10-19". The runner-images readme now
     announces "`ubuntu-latest` label will use Ubuntu 26.04 in November 2026";
   - `measure.test.ts:225-230` pass '1.56.1' as fixture arguments.
8. **The CfT 156 layout is gone from this session.** `scratchpad/ci-design/pwr/browsers/ms-playwright` does not exist
   here. `/opt/pw-browsers` holds 1194 and 1243, not 1248, and `/root/.cache/paidwhole/cft` has only 141.0.7390.37.
   The layout has to be rebuilt from storage.googleapis.com (step_playwright fix, §8).
9. **Versions and gates confirmed:**
   - 1.64.1 is still latest (published 2026-10-14T11:54:58Z), and axe 4.14.0 too (2026-10-15T13:33Z), so both pass
     `minimumReleaseAge: 4320`;
   - every relevant version is published by a trusted publisher (GitHub Actions OIDC), 1.56.1 and 4.13.0 included,
     so `trustPolicy: no-downgrade` passes;
   - playwright-core 1.64.1's `browsers.json` names chromium and chromium-headless-shell, revision 1248, at
     156.0.8078.4;
   - its dependency tables cover ubuntu26.04-x64 and debian13-x64 (trixie, ci-deps' worker base).
10. **The restore drill** (`restore-drill.db.test.ts:96-102, :191-192`) is db's one skip: pg_dump 16 on 24.04 against
    server 18. On 26.04 it runs, so db becomes 9,050 passed and 0 skipped (from 9,049 and 1). Unit stays at 1 skipped
    (actionlint).
11. **O7: no rebalance.** packets-rest's slowest run was 10:06 (§7).
12. **O6 still waits.** #42 is still a draft (head 13f59b1, base 49514e8, `dirty`, last updated 2026-10-23T20:51Z).

## 1. File status, 49514e8 → 6ddd587 (`git diff --numstat 49514e8 6ddd587 -- <f>`)

**Unchanged.** Every cite in these files holds as written:
- `apps/web/package.json`, `apps/worker/package.json`;
- `apps/web/src/components/shell.tsx`;
- `apps/web/e2e/brand.spec.ts`, `sign-in.spec.ts` and the seven snapshots;
- `tools/screening-capacity/{containers,run,report,launch-check}.ts` and `{measure,report,launch-check}.test.ts`;
- `tools/screening-capacity/test-support/measurements.ts`. The design's "`test-support/measurements.ts`" lives under
  `tools/screening-capacity/`, and no root `test-support/` exists;
- `.github/workflows/release.yml`, `publish-content.yml`, `approval-of-record.yml`;
- ADR 0058 and ADR 0062.

**Changed:**

| File | Change since 49514e8 | What ci-deps changes first |
|---|---|---|
| `tools/package.json` | +1: `@tp/stryker-canary` (playwright-core moves `:32`→`:33`) | `:36, :38` eslint and typescript-eslint to `catalog:` |
| `pnpm-lock.yaml` | +35/-35 (Stryker 10.1.1, canary link) | licence commit (43 `libc:`), bumps, qs override |
| `apps/worker/Dockerfile` | `:19` comment only (supply-chain.yml → ci.yml's images job) | `:5, :12` FROM trixie digest; `:6` pnpm derived from `packageManager` after `COPY package.json`. So `:23` moves down, and the base becomes Debian 13 |
| `apps/web/Dockerfile` | `:24` comment only | `:7, :17` FROM, `:11` pnpm |
| `apps/web/playwright.config.ts` | +24: `E2E_PREBUILT` buildStep, `failOnFlakyTests`, the github reporter (ci-speed) | none |
| `.github/workflows/ci.yml` | +491/-59 (ci-speed: 9 jobs, shards, browser cache) | pins; db, domain-model and e2e on `tools/ci/postgres.sh`; "Quiet" moved after the browser install; three static steps |
| `screening-capacity.yml` | 1 comment line | pins; `docker-compose.yml` in the push paths |
| `large-zip.yml` | +9/-2 | pins, compose, `persist-credentials: false` |
| `tools/test/workflows.test.ts` | +1036/-163 | pin rules (a)-(d), compose rule, release and dry-run rules, frozen copy, `CI_TREE` |
| `docs/runbooks/ci.md` | +336 (new sections) | F7 lines, bot queue, `event=dynamic` |
| `docs/runbooks/screening-capacity.md` | +9/-6 at `:306-318` (so +3 below) | `:306-318` "applied" line |
| `docs/product/reconciliation-001.md` | +20/-1 | F1, F2, F4 and F7 records |
| `docs/product/test-matrix.md`, `matrix.ts`, `registry.ts` | CI-01..10, 15..17 added | CI-11..14 |
| ADR 0066 | new, 520 lines | Part 2 at `:243-245`; header `:3-13` |
| `stryker/shards.json` | new | none |

## 2. The upgrade itself

- **Declarations (all still 1.56.1 / 4.13.0):**
  - `apps/web/package.json:47` `"@axe-core/playwright": "4.13.0"` and `:48` `"@playwright/test": "1.56.1"`;
  - `apps/worker/package.json:53` `"playwright-core": "1.56.1"`;
  - `tools/package.json:33` `"playwright-core": "1.56.1"`.
- **`apps/worker/Dockerfile:23`:** `&& npm install --no-save --omit=dev playwright-core@1.56.1 \` (holds). `:24`
  installs `--with-deps chromium-headless-shell`. The comment at `:16-17` says "at the version the lockfile pins",
  which is false today (the gap browser-version.test.ts closes). After ci-deps, Debian 13 is the base, and
  playwright-core 1.64.1's tables cover `debian13-x64` (13 references in `lib/coreBundle.js`, from the npm tarball).
- **`tools/screening-capacity/measure.test.ts:232`** holds: `expect(workerPlaywrightVersion()).toBe('1.56.1')`. Lines
  `:225, :228, :230` pass '1.56.1' and '1.55.0' as fixture arguments to `processImagesProblems` and are
  behaviour-neutral. `workerPlaywrightVersion()` is at `containers.ts:544-548` and reads `apps/worker/package.json`.
  `processImagesProblems` is at `:555`.
- **Other 1.56.1 literals:**
  - `ci.yml:32` comment, which ci-deps' scan will fail;
  - `workflows.test.ts:142` comment;
  - `docs/runbooks/screening-capacity.md:467` (the design's `:464`): ``npm install --no-save playwright-core@1.56.1``;
  - ADR 0058:159 is historical and becomes the amendment's line.
- **npm, 2026-10-26:**
  - `@playwright/test`, `playwright-core` and `playwright` are latest at 1.64.1;
  - `@axe-core/playwright` and `axe-core` are latest at 4.14.0;
  - `@playwright/test@1.64.1` depends on `playwright: 1.64.1`;
  - `@axe-core/playwright@4.14.0` depends on `axe-core ~4.14.0`, with peer `playwright-core >=1.0.0`;
  - provenance (`npm view <v> dist.attestations`, `_npmUser`) is GitHub Actions OIDC trusted publishing for
    playwright-core 1.56.1 and 1.64.1, @playwright/test 1.64.1, @axe-core/playwright 4.13.0 and 4.14.0, and
    axe-core 4.14.0. So no-downgrade passes, and no trust exclude is needed.
- **No Dependabot browser entry exists at 6ddd587** (`grep -i playwright .github/dependabot.yml`: nothing). The
  `browser-tests` group is ci-deps'.

## 3. shell.tsx, the label-in-name scope, and #42

- **`shell.tsx:56`:** `<summary ... aria-label="Practice switcher">`. Its visible text is the practice name
  (`:57`, `current?.name ?? 'Choose a practice'`).
- **`shell.tsx:84`:** `<summary ... aria-label="Account menu" title={shell.email}>`. It contains:
  - the initial in an `aria-hidden` span (`:85-87`);
  - the email in a span hidden below md (`:88`);
  - the chevron.

  Both cites hold. No other header control carries an `aria-label`. The other aria-labels in shell.tsx are the
  `Practices` list (`:61`) and nav or aside landmarks (`:170, :176, :185, :231, :281, :331`), which 2.5.3 does not
  cover.
- **#42 and `shell.tsx`.** #42's patch (pulls/42/files, page 1-2, 143 files) adds 4 lines in two hunks, `@@ -156,6`
  (`| 'console_mail'` in `ShellSection`) and `@@ -259,6` (a `RailLink` "Mail streams"). Neither is near `:56` or
  `:84`, so the changes merge with no conflict in either order.
- **Specs that reach a header control by name:**
  - `brand.spec.ts:330` `header.getByLabel('Practice switcher')` (`toContainText(PRACTICE)`);
  - `brand.spec.ts:331` `header.getByLabel('Account menu')`;
  - `sign-in.spec.ts:18` `page.getByLabel('Practice switcher').click()`. All hold.

  No other spec does (grep over `apps/web/e2e` for the labels, "Sign out" and the switcher). The new labels
  ("<name>, practice switcher", "<email>, account menu") still match, since `getByLabel` is a case-insensitive
  substring match by default.
- **Axe reach.** `a11y.ts:12` runs `AxeBuilder.withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa'])`. Twelve specs call
  `expectAccessible` on shell pages, 66 calls in all: billing 3, brand 2, era-exports 1, models 3, monitoring 6,
  onboarding 15, packets 12, reports 8, screening 7, security 1, triage 3, unattested 5. Under 4.14 every one of them
  checks 2.5.3 on the header, so the fix is needed for the whole suite, not only for brand.
- **brand.spec.ts** (unchanged):
  - the header step is at `:325-345`;
  - the screenshots are at `:342` (header-1280), `:344` (lockup-1280), `:426` (header-390), `:428` (lockup-390),
    `:480` (the covers in a loop) and `:483` (cover-top);
  - the brand-screenshots path is at `:1137`'s assertion.
- **The seven snapshots** (`apps/web/e2e/brand.spec.ts-snapshots/`, bytes and blob at 6ddd587):

  | File | Bytes | Blob |
  |---|---|---|
  | header-1280-chromium-linux.png | 9995 | f1837c27 |
  | header-390-chromium-linux.png | 5418 | ca184879 |
  | header-lockup-1280-chromium-linux.png | 2797 | ac324b65 |
  | header-lockup-390-chromium-linux.png | 2802 | 163dd863 |
  | report-cover-top-chromium-linux.png | 4638 | 99d56128 |
  | report-cover-with-seal-chromium-linux.png | 49661 | b7cc1b6e |
  | report-cover-without-seal-chromium-linux.png | 35355 | a8659238 |

## 4. Image binding, report, launch check (`run.ts` and `report.ts` are #42 files)

- **Today's `.Id` lines:**
  - `release.yml:107` `docker image inspect -f '{{.Id}}' "$REF" > "$RUNNER_TEMP/image/$IMAGE.id"` (after `:106`'s
    `docker save | gzip -1`);
  - `release.yml:226-233`: push loads, then at `:228` `id=$(docker image inspect -f '{{.Id}}' "$ref")`, compares at
    `:229`, and pushes at `:233-234`;
  - the capacity job loads at `:148-151`;
  - the harness reads it at `run.ts:825` (`const imageId = ... exec('docker', ['image','inspect','-f','{{.Id}}', image])`),
    `:826` (images), with the comment at `:821-824`;
  - the doc text is at `report.ts:354-357` and at `launch-check.ts:61-70`, `:85-88` and `:526`;
  - `workflows.test.ts:473` holds `:107`'s literal, and `:519-520` the push compare.

  release.yml is unchanged, so the design's `:107, :228`, `:202-237` (push) and `:244-245` (the report job's "never
  the code it measured") all hold.
- **Report format:** `report.ts:56` `'tp-screening-capacity/8'`, with its doc at `:47-55`, and
  `launch-check.ts:166-168` refuses any other format. Next free: **/9**. #42 adds an optional `mail` field without a
  bump.
- **`RELEASE_RUNNER`:** `launch-check.ts:104` `{ label: 'ubuntu-24.04', cpus: 4 }` (holds). It has no image field;
  "refuse a report whose ImageOS is not RELEASE_RUNNER's" needs a new `imageOS: 'ubuntu24'` (GitHub's `ImageOS` value).
  It is asserted at:
  - `launch-check.test.ts:231` (and the `:227` message);
  - `workflows.test.ts:13` (import), `:484` and `:487`.
- **What ci-browser needs in #42's files, and whether it can avoid them:**
  - **`run.ts`: one change, and it cannot be avoided,** since `:825` is where the harness reads the image identity
    today. Replace `:825` with a call into the new reader (`image-id.ts`, through `containers.ts`'s DockerRuntime, so
    the `docker save` lives there). #42's hunks in run.ts are `-46,6`, `-58,6`, `-288,6`, `-813,6` (ends at `:818`),
    `-853,6`, `-903,6`, `-912,7`, `-926,6` and `-948,6`. `:825-826` lies between `-813` and `-853` with at least 6
    lines of clearance, so git merges it cleanly in either order. ImageOS and ImageVersion need no change in run.ts:
    `workflowRun(process.env)` (`report.ts:339-346`, called at `run.ts:833`) already reads the runner's environment,
    so `ImageOS` and `ImageVersion` can join `WorkflowRun` in report.ts. The storage driver needs `docker info -f
    '{{.Driver}}'` (and `DriverStatus` for the containerd snapshotter). Put it in containers.ts and record it beside
    the images with the same one-line call at `:826`, so run.ts still changes in one place.
  - **`report.ts` can't be avoided either** (format, fields, doc). #42's hunks are `-389,6` (it appends `mail` after
    `aborted`, at the end of the `Measurements` interface), `-529,6` (verdict) and `-745,6` (markdown). Put
    ci-browser's fields beside `workflow` and `images` (`:327-357`) and the format at `:56`, never at the interface's
    end, the verdict's end or the markdown's `Layout:` line, and both PRs merge cleanly.
  - **`test-support/measurements.ts`:** #42 adds `mail` (+3 at `:1-6` imports and `:218`). ci-browser's new fields go
    near `workflow` and `images` in `measured()`, away from `:218`.
  - **Doing nothing in them while #42 is open is not possible** without leaving the harness's binding on `.Id`, which is
    the store-dependent value the PR exists to replace.
- **`containers.ts`:** has no `.Id`, `docker info` or storage reads today (grep). It is the natural home for the
  `docker save → image-id.ts` call and the driver read.
- **Caution on the design's "the harness reads the config digest with image-id.ts".** In
  `screening-capacity.yml`'s capacity job the images are built in-job (buildx `load`, `:143-150`), so image-id.ts
  needs a `docker save` of both images there. That is an extra save of the worker image (Chromium inside) on every
  measured PR, at a cost not yet measured. In release.yml's capacity job the tarball already exists, so the reader
  can take the downloaded `.tar.gz` and skip a second save.

## 5. Runners: where a label is held

- **Every `runs-on` at 6ddd587** (`grep -n runs-on .github/workflows/*.yml`): 23 jobs, all `ubuntu-24.04`.
  - approval-of-record.yml: `:27`;
  - ci.yml: `:34` static, `:156` lint, `:169` unit, `:231` db, `:319` domain-model, `:360` build, `:395` e2e, `:468`
    images, `:527` all-green;
  - large-zip.yml: `:18`;
  - mutation.yml: `:42` changes, `:72` stryker, `:116` mutation;
  - publish-content.yml: `:23`;
  - release.yml: `:29` build, `:131` capacity, `:204` push, `:251` report;
  - screening-capacity.yml: `:64` changes, `:132` capacity, `:241` gate, `:277` notify;
  - ci-deps' release-dry-run.yml adds build and push, making 25.
- **Under F5:** 7 stay on 24.04 (release ×4, dry-run ×2, screening-capacity's capacity), and 18 move. publish-content
  moves with `tools/test/frozen/publish-content.yml` (F4; the frozen copy is ci-deps').
- **workflows.test.ts:**
  - runner rule `:349-360`, with the literal `'ubuntu-24.04'` at `:352-354`, the actionlint config ban at `:355-359`
    and the test name;
  - the release capacity test `:478-487`;
  - the `-latest` and unversioned refusals at `:146-163` and `:362-405`, whose fixtures use 24.04 literals and stay.
- **Code and docs that name the runner:**
  - `launch-check.ts:56, :99, :104, :400` (":400 both workflows build them on ubuntu-24.04" stays true under F5: both
    image builds that are measured stay on 24.04);
  - `launch-check.test.ts:227, :231`;
  - `measurements.ts:50` (comment);
  - `screening-capacity.md:18, :241, :288-289, :392`, all about the capacity chain, which stays;
  - `ci.md` names no runner label (grep), so its jobs table needs only the image note;
  - reconciliation-001 `:548, :574, :576, :594, :600, :607`, dated history; F5's record goes in as a new entry.
- **The 26.04 image** (`actions/runner-images` `Ubuntu2604-Readme.md`, main, 2026-10-26): image 20261023.163.3,
  Docker client and server 29.4.2, Compose 5.1.3, Buildx 0.38.0, PostgreSQL 18.6 (service disabled), Node 24.21.0,
  Google Chrome 155.0.8059.39. It also announces "`ubuntu-latest` label will use Ubuntu 26.04 in November 2026". The
  default Docker image store on that image could not be read here: the runner-images build scripts did not resolve via
  raw.githubusercontent. The F5 probe's `docker info` is what records it.
- **The 24.04 jobs today run** image 20261012.334.1, OS 24.04.5 (job logs 121270018490 and 121281841727).

## 6. ci.yml's browser steps, the baseline step, and V3

- **As ci-speed left them:**
  - unit: restore `:185-190` (key `playwright-v1-${{ runner.os }}-${{ hashFiles(browsers.json) }}`), install `:191`
    `pnpm --filter @tp/web exec playwright install --with-deps chromium`, save `:192-197` on a miss;
  - db: `pnpm install` `:256`, quiet `:259-260`, restore `:261-266`, install `:267`;
  - e2e: quiet `:421-422`, restore `:423-428`, install `:429`, download the build `:430-433`, untar, tests `:438-440`
    (`E2E_PREBUILT=1`, `pnpm test:e2e --shard`), upload `:441-452`, the failed pictures `:453-462`;
  - the same install runs in `large-zip.yml:37`, `release.yml:157` and `screening-capacity.yml:177`.
- **ci-deps reorders db and e2e:** `postgres.sh up` after checkout; `wait` and "Quiet" after the browser install; the
  log on failure last.
- **The baseline step's place:** in `e2e (1/M)` (matrix `:401`: `[1,2]` public, `[1,2,3]` private), after the browser
  install and the build download, and before or after the shard's tests. It runs the Playwright test command, so it
  needs the e2e database and `E2E_PREBUILT=1`, as the shard test does. It is conditional only inside its `run` (diff
  vs merge base or `before`), so the job and the gate are never skipped. Its picture print reuses `:458-461`'s
  `path base64` line form (the design's `ci.yml:103-108`).
- **The `browser.json` SHA check:** after each install in unit (`:191`), db (`:267`) and e2e (`:429`). Insert it after
  the install, not between restore and install: `workflows.test.ts:1213` requires the step right before the install to
  be exactly the restore step, and `:1218` requires unit's save right after the install.
- **V3, measured:**
  - Push runs install fast. 40229005858 (6ddd587): unit 20 s; db 15, 20, 22 and 16 s; e2e 12 and 17 s. 40223130551
    (de8f9b5): unit 29 s; db 15, 23, 14 and 20 s; e2e 13 and 22 s. The browser restore takes 3-6 s in each.
  - #45's pull-request run 40226881568: `db (4/4)` spent **609 s** of its 13:02 in the install (19:37:46 → 19:47:55),
    and `db (1/4)` 139 s.
  - That job's log (job 121270018490, `logs/db4-pr45.log`):
    - the apt index update: "Fetched 12.6 MB in 1s";
    - then "8 upgraded, 9 newly installed ... Need to get 25.9 MB of archives";
    - then **"Fetched 25.9 MB in 9min 59s (43.3 kB/s)"** from `azure.archive.ubuntu.com`, one package at a time
      (fonts-freefont-ttf alone took about 2 min 09 s, and fonts-wqy-zenhei about 2 min 51 s);
    - the browsers themselves came from the cache.
  - The packages:
    - new: fonts-freefont-ttf, fonts-ipafont-gothic, fonts-tlwg-loma-otf, fonts-unifont, fonts-wqy-zenhei,
      xfonts-cyrillic, xfonts-encodings, xfonts-scalable, xfonts-utils;
    - upgraded: gir1.2-glib-2.0, libglib2.0-0t64, libglib2.0-bin, libglib2.0-data, libnss3, libnss3-tools,
      xserver-common, xvfb.
  - Over the last 15 ci.yml runs: **92 installs, 10 over 60 s** (86-612 s), mean 54 s (`logs/install-durations.tsv`).
    All 10 slow ones were on pull-request runs: 40250611470, 40226881568 ×2, 40225007758, 40223436311 ×2,
    40219164530 ×2, 40213788609 and 40201607616. So about one install in nine stalls on the mirror, and the stall
    decides the job's length.
- **The design, best option:** cache the `.deb` files and let apt verify them.
  - **How:**
    - A step before the install restores `actions/cache` into a user-owned directory, for example
      `$RUNNER_TEMP/apt-archives`. The key is `apt-v1-${{ runner.os }}-${{ env.ImageOS }}-${{ env.ImageVersion }}-<hash of browsers.json>`
      and the restore-keys prefix is `apt-v1-<os>-<ImageOS>-`.
    - The install then runs with `APT_CONFIG` pointing at a file holding `Dir::Cache::archives "<dir>"` (or
      `sudo cp` into `/var/cache/apt/archives`). Playwright's `install-deps` runs `apt-get update` and
      `apt-get install`, so apt fetches only what the cache lacks.
    - Unit saves the directory on a miss: `sudo chown`, then save the `*.deb` files.
    - The same in db and e2e (restore only), and in large-zip, screening-capacity and release by their own rules.
      Release takes no cache under ci-deps' rule, so release stays uncached.
  - **Trust:** apt checks every `.deb` against the SHA-256 in the Packages index it has just fetched, which the
    archive's signed `InRelease` vouches for (the update ran fresh: "Get:3 ... InRelease"). A cached `.deb` that was
    tampered with or is stale fails the hash check and is fetched again, so the cache saves only bandwidth and can't
    inject content. That is the same property the browsers' cache relies on, one level stronger. Saving only from
    unit, and only on push runs to the build branch (the default branch under F1 (a)), keeps pull requests from
    seeding it.
  - **Invalidation:** the key changes with the runner image (ImageOS and ImageVersion, weekly) and with Playwright's
    dependency list (browsers.json), and apt itself downloads any newer version a security update publishes. Size
    is about 26 MB per OS.
  - **Not chosen:**
    - A hand-kept `.deb` set installed with `dpkg -i` loses apt's index check, so it needs our own SHA list, which
      goes stale with every Ubuntu security update.
    - A container image for the jobs changes the rendering host the baselines depend on. ADR 0058:214 already
      rejected "Run the e2e step in Playwright's container image", and compose Postgres would need Docker-in-Docker.
    - Dropping `--with-deps` is out too: CI-05's rule requires it (`workflows.test.ts:228`, `:1582-1583`), and the
      fonts it installs are part of the rendering host.
  - **What it touches:** the restore assertion at `workflows.test.ts:1213` (the step before the install), the unit save
    at `:1218-1219`, the db/e2e no-save check at `:1220`, and ci.md's Caches table (`:146`) and text (`:148-157`).
- **ci.md's browser text:** jobs table `:27, :28, :31`; Caches `:139-157`. There is no "Upgrading the browser" section
  and no baseline procedure yet, so ci-browser writes them new.

## 7. O7: stryker shards

- `stryker/shards.json` is new since 49514e8. It has 6 shards; packets-rest holds 11 files.
- **packets-rest's successful job durations:**

  | Run | Event | Head | Duration |
  |---|---|---|---|
  | 40229005837 | push | 6ddd587 | 405 s |
  | 40225007752 | PR | | 395 s |
  | 40223436319 | PR (#40) | | 308 s |
  | 40223130477 | push | | 391 s |
  | 40219164294 | PR | | 606 s |
  | 40195705539 | PR | | 350 s |

- The mean is 6:49 and the max 10:06. The other shards' maxima: pricing-engine 528 s, packets-scan 422 s,
  pricing-rest 410 s. The later runs 40250611487 and 40251237791 ran no stryker shard. Far under 15 minutes, so **no
  rebalance**. Data: `logs/mutation-durations.tsv`.

## 8. setup-container.sh: the browsers for every worktree

On `claude/build-ops` 99b2e05, `/home/user/ops/tools/setup-container.sh`:
- **`CFT_BUILDS` (`:957-960`)** pins chromium-1248 (156.0.8078.4, `chrome-linux64.zip`, sha 43fd3176…) and its
  headless shell (sha c3e50596…).
- **`step_playwright` (`:999-1033`)** reads only `$CLONE_DIR/apps/web/package.json`'s `@playwright/test` (`:1001-1003`)
  and that version's `browsers.json` (`:1004`). It runs once at `:1087`, before the argument worktrees are added and
  installed in the loop at `:1089-1093` (`worktree ... 1`). A ci-browser worktree on 1.64.1 therefore never gets 1248.
- **Fix:** make it `step_playwright <checkout>`. Call it for `$CLONE_DIR`, then inside the `:1089` loop after each
  worktree's install, reading that checkout's
  `node_modules/.pnpm/playwright-core@<ver>/node_modules/playwright-core/browsers.json`. `cft_layout` already skips a
  revision that is complete, so the union is laid out once, and the check mode reports any revision missing per
  worktree.

## 9. Documents

- **ADR 0058** (unchanged, 252 lines):
  - the baseline line `:159`: "Playwright's Chromium (141.0.7390.37 for `@playwright/test` 1.56.1) on Ubuntu 24.04";
  - the switches' claim `:162-176` (the four host configurations, byte-identical);
  - the rejected options `:213-214`;
  - the consequences `:221-224` (workflows.test.ts pins the install before the unit tests, the seven baselines, the
    switches and fonts.conf);
  - the regenerate command `:225-228`: `--update-snapshots`, which gains `=all`.
- **ADR 0062** is unchanged. #42 appends at its end and edits its header `:1-6` and `:863`. The binding text that
  ci-browser amends is at `:1115` and `:1164-1166` (RELEASE_RUNNER) and `:1186`.
- **ADR 0066:**
  - the Part 3 placeholder is at `:247-249` ("Appended by that pull request.");
  - the status header `:3-13` names ci-browser as later;
  - `:241` reads "Revisit when ... Playwright moves (Part 3)".
- **`docs/runbooks/screening-capacity.md:467`** (was `:464`): the `npm install --no-save playwright-core@1.56.1` line
  becomes version-free.
- **`docs/runbooks/ci.md`:** §6 above.
- **reconciliation-001:**
  - ci-browser is described at `:145` ("CI-18 to CI-20. After ci-deps.");
  - the capacity line is `:548` (was `:529`): "(ubuntu-24.04; …)". Under F5 the capacity workflow's measuring job
    stays on 24.04, but its `changes`, `gate` and `notify` jobs move, so "(ubuntu-24.04 …)" for the whole workflow
    becomes inexact and needs one clause;
  - F5 is recorded nowhere yet (grep "F5": nothing).
- **Test matrix and synth:**
  - test-matrix.md: the reservation note is at `:211-212`. The table runs CI-01..10 at `:216-225` and CI-15..17 at
    `:226-228`, so CI-18..20 go after `:228`. ci-deps inserts CI-11..14 at `:225/226` and edits `:211-212`;
  - `matrix.ts`: the CI rows are at `:280-292` and the array closes at `:293`, so the new rows go before it;
  - `registry.ts`: CI-15..17 are at `:463-465` and `};` at `:466`, so the new rows go after `:465`;
  - `fixtures/synthetic/CI-NN/expected.json` exist for 01-10 and 15-17, so ci-browser adds CI-18..20 with
    `pnpm synth --all`;
  - #42 edits the same three files in other sections (SEC-18/19, SCR-21/22, JOB-05);
  - the rows' text, design §3.5 (`lane-b-ci.md:2078-2107`): CI-18 "One browser build everywhere", CI-19 "Header
    controls named by their visible text", CI-20 "Runner images".

## 10. Other checks

- **`screening-capacity.yml:26`:** `workflow_dispatch:` (null). `workflows.test.ts:606-608` asserts the trigger keys
  and `on.workflow_dispatch` toBeNull, so the F5 `runner` input changes `:608`.
- **The restore drill:**
  - `restore-drill.db.test.ts:96-102` sets `compatible = await restorer.compatibility()` (client major ≥ server
    major), with the `PG_BIN_DIR` override at `:97`; `:191-192` calls `context.skip()`;
  - the comment at `:73-75` gives the reason "as on a CI runner against the postgres:18 service". ci-deps rewords
    `:75`, and ci-browser should then say it runs on 26.04;
  - the 24.04 runner's pg_dump is 16 (the format sample at `rds-restorer.test.ts:167`). 26.04 has PostgreSQL 18.6, so
    the drill runs. The PR states db 9,050 passed, 0 skipped.
- **The local CfT 156 layout:** missing, see §0 item 8. storage.googleapis.com is reachable; the pinned SHAs are in
  `CFT_BUILDS`.
