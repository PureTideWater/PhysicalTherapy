# Adversarial review of section 3.3 (ci-browser), re-read at 6ddd587

Reviewed: `scratchpad/ci-browser/section-3.3.md` (737 lines, 01:12 UTC), against `claude/build-platform` 6ddd587
(`/home/user/PhysicalTherapy`), ci-deps' section 3.2 as re-read (`designs/lane-b-ci.md:512-1670`), the 2026-10-24 text
(`designs/lane-b-ci.md:1671-1840`), `lanes/lane-b.md`, #42's file list, the npm registry, raw.githubusercontent.com
and the tarballs in the scratchpad. Work log: `progress/review.md`.

**Counts: 1 blocking (B), 11 should-fix (S), 9 nits (N).**

## What checks out (cite, command, result)

- Versions: `npm view <pkg> dist-tags` (2026-10-26): `@playwright/test`, `playwright`, `playwright-core` latest 1.64.1,
  next 1.65.0-alpha-2026-10-25; `@axe-core/playwright` 4.14.0 (deps `axe-core ~4.14.0`, peer `playwright-core >= 1.0.0`,
  engines `node >=22.12.0`); `axe-core` 4.14.0 published 2026-10-05T17:43:36Z; `@playwright/test@1.64.1` 2026-10-14T11:58:13Z.
- `browsers.json` of playwright-core 1.64.1 (scratchpad `pwcore/x/package/browsers.json`): chromium and
  chromium-headless-shell, revision 1248, 156.0.8078.4.
- Hashes: `sha256sum` of both zips in `scratchpad/ci-browser/cft/` = `c3e50596…ba20` and `43fd3176…9d79`, equal to
  `setup-container.sh:957-960`'s 1248 rows; `zsha.py` gives the binaries `4fa61f0b…f9d6` and `377a9fc0…5f025`.
- `coreBundle.js` (1.64.1): `:9230` ubuntu26.04 support, `:9248` debian13, `:32773` the 26.04 table, `:33435-33444` and
  `:33681-33688` (`sudo -- sh -c "apt-get update&& apt-get install …"`), `:33999-34006` cftUrl on `cdn.playwright.dev`,
  `:34169-34184` executable paths, `:35014-35019` the host override. No download checksum anywhere (`grep -i 'sha256\|checksum'`).
- apt: `apt/acquire-item.cc:3578-3591` trusts a cached `.deb` by size alone. Correct, and the verify step is needed.
- axe: 4.13.0 `axe.js:32994` tags `label-content-name-mismatch` `experimental`, 4.14.0 `:37472` does not.
- `--update-snapshots=all` is valid in 1.64.1 (`playwright/lib/program.js:226`, choices all|changed|missing|none|default).
- 6ddd587 cites: `shell.tsx:56, :84-88`; `a11y.ts:12`; `brand.spec.ts:69, :77, :325-345, :330-331`; `sign-in.spec.ts:18`;
  12 specs and 66 `expectAccessible(` calls; no other widget `aria-label` whose visible text differs (grep of
  `apps/web/src`); 23 `runs-on` lines as listed; `Dockerfile:9, :16-17, :23-28`; `release.yml:107, :228-229`;
  `containers.ts:544-548, :568-570`; `measure.test.ts:225, :232`; `run.ts:127-128, :181-182, :821-826, :1060`;
  `report.ts:56, :327-357, :339-346`; `launch-check.ts:104, :166-168, :400`; `workflows.test.ts:146-163, :349-360,
  :473, :478-487, :519-520, :606-608, :1205-1225, :1285-1293`; `restore-drill.db.test.ts:96-102, :191-192`, with
  `compatibility()` comparing majors only (`pg-dump-restorer.ts:91-103`); `ci-chromium.ts:12`.
- Runner facts: `toolset-2404.json` docker-ce 28.0.4, compose 2.38.2; `toolset-2604.json` docker-ce 29.4.2, compose 5.1.3
  (raw.githubusercontent.com, main); docker/docs `containerd.md:11-12` (containerd store default on fresh 29.0+ installs);
  `Ubuntu2604-Readme.md`: 20261023.163.3, Node 24.21.0, PostgreSQL 18.6, jq 1.8.1.
- Parallel build: P1 and P2 own disjoint files; the interfaces between them (`browser.json`'s fields, the
  `browser-build.ts` command line, the test file names `collection.test.ts` lists) are fixed in §4. Buildable in parallel,
  with S6 below.
- V3 cannot poison a push or tag run: a pull request's caches are scoped to its merge ref; push runs restore only their
  branch's and the default branch's; `release.yml` restores none (ci-deps' rule); and `verify` checks every file against
  the signed index before apt sees it. The only gap is in the browsers cache, not the apt one (S3).
- Nothing of substance from the 2026-10-24 text is lost: every bullet of its 3.3.1 to 3.3.4 is kept, replaced with a
  reason in the 3.3.5 table, or dropped by a ruling (F5 (a) and (b), F1 (b), the person's inspection).

## Blocking

### B1. The baseline step can be bypassed by an ordinary rendering change, and its red then lands on the build branch

- **Evidence.** The step runs on a pull request only when the diff touches six inputs (`browser.json`, `brand.spec.ts`,
  its snapshots, `fonts.conf`, `playwright.config.ts`, `packages/brand/assets/fonts/**`). The seven pictures are also
  drawn by application code: the header by `apps/web/src/components/shell.tsx` and the lockup components, with
  `globals.css` and the brand tokens; the covers by worker code that `brand.spec.ts` imports
  (`brand.spec.ts:10-12`: `worker/src/mail/mail`, `mail/template`, `reconcile/statement-html`). The journey's own
  comparisons pass a change under 1% (`brand.spec.ts:69` `VISUAL`: `maxDiffPixelRatio: 0.01`), so such a pull request
  is green, merges, and the next push run's baseline step fails on `claude/build-platform` with no pull request open to
  fix it. ADR 0058 names the case itself (`:225`, "A deliberate change to the header or the cover … may need new
  baselines"), and the section expects it: #42's rail link is "decided" only "on the merged head's push run" (§3.3.1, O6).
  Under ci-browser's own rule that CI renders the committed bytes, that is a bypass.
- **A second bypass.** `--update-snapshots=all` writes only the screenshots a run reaches
  (`playwright/lib/matchers/expect.js:12640-12660`). A run that stops before a screenshot, or a step that keeps the
  Playwright exit status to print pictures (`|| status=$?`), leaves a stale file untouched, and `git diff --exit-code`
  passes.
- **Fix.**
  1. Run the step in `e2e (1/M)` on every pull request and every push, with no diff condition. It costs one more run of
     one spec on one shard. Measure that cost on the PR and record it in ci.md. If it is ever too slow, derive the
     inputs from the import closure of `brand.spec.ts` and the header's components with the same `watched.ts`
     mechanism. Never use a hand list.
  2. Before regenerating, `rm` the seven PNGs. Then require Playwright's exit status 0 and exactly seven
     "is re-generated" lines, so a picture that was not drawn shows up as a deleted file in `git diff --exit-code`.
  3. Add both to the `workflows.test.ts` baseline-step test and to CI-18's assertion.

## Should fix

### S1. The release's integrity checks are circular, under ci-deps' `overwrite: true`

- **Evidence.** `<image>.tar.sha256` and `<image>.id` ride in the same artifact as the tarball (§3.3.1, "Where each
  identity is read"; ci-deps keeps it so, `designs/lane-b-ci.md` §3.2.1, "The image and its `.id` file stay one
  artifact"). ci-deps gives the image uploads `overwrite: true` (§3.2.1, "Its uploads overwrite"). The `capacity` job
  runs repository code: `pnpm install` of the whole workspace, the harness and the measured images
  (`release.yml:153-186`). A step that can reach the run's artifact token, for example by reading the runner's memory
  with the passwordless sudo the hosted runner gives, can replace `image-worker`, its `.tar.sha256` and its `.id`
  together. Then `push`'s `sha256sum -c` and its post-push registry check both pass on the replaced image. The checks
  prove transport integrity, not identity. The section's "removes none" is also literal only: it replaces `:228-229`'s
  pre-push `.Id` compare with a check made after `docker push` (§3.3.1, `release.yml push`), so a mismatch is found only
  once the tag is public.
- **Fix.** The build job exports each image's tarball SHA-256, config digest and top-level descriptor digest as job
  outputs under per-image names (`sha256-<image>`, `config-<image>`, `target-<image>`), which no later job can
  rewrite. Then:
  - `push` checks the downloaded tarball against `needs.build.outputs`, not against the artifact's own file;
  - `push` compares the loaded image before any push, store-aware in shell (classic `.Id` = config, containerd `.Id` =
    target);
  - `push` keeps the registry check after the push.
  - `capacity` passes the same outputs to the harness (`--expect-image web=<config>`).

  Add the rule to `workflows.test.ts`. Have the dry run prove the outputs arrive (it builds `web` only).

### S2. Under the containerd store, the harness's ".Id equals the manifest digest" rule fails on images that carry attestations

- **Evidence.** On the containerd store, `.Id` is the digest of the image's top-level descriptor in `index.json`. Buildx
  keeps provenance attestations on that store (it drops them only on the classic store), so that descriptor is an
  index, not the linux/amd64 manifest. image-id.ts as specified returns the linux/amd64 manifest's digest (§3.3.1,
  "image-id.ts"), so the 26.04 probe (F5) and the `images` equality on 26.04 would stop with "loaded tag is not the
  archive". This is PLAUSIBLE: no daemon here, so not reproduced.
- **Fix.**
  - image-id.ts also returns `index.json`'s top-level descriptor digest. The harness compares a containerd `.Id`
    against it.
  - `image-id.test.ts` gains an index-with-attestation-manifest case (`unknown/unknown` platform).
  - Pass `provenance: false` and `sbom: false` explicitly on every `build-push-action` step that feeds an identity
    check, so both stores see one manifest. Release attestation is the report job's, not buildx's.

### S3. The browser check binds only the two executables, not the build that renders

- **Evidence.**
  - `browser.json` records the SHA-256 of `chrome-headless-shell` and `chrome`. The headless shell's zip has 287
    entries (`zipfile` listing of `cft/chrome-headless-shell-linux64.zip`), among them `libGLESv2.so`, `libEGL.so`,
    `libvk_swiftshader.so` (software GL), `icudtl.dat` and `.pak` resources, all of which affect rendering.
  - Playwright verifies no download (no checksum in `coreBundle.js`), and the browsers cache is restored by key alone
    (`ci.yml:185-191`).
  - So a different file beside an equal executable, from a mirror that differs (§9's own risk) or from a cache entry,
    passes the check. "browser.json binds the baselines to the build" holds for one file of 287.
- **Fix.**
  - Record, per browser, `treeSha256`: the SHA-256 of the sorted `"<sha256>  <path>"` lines of every regular file of
    the zip, computed from the zip with no extraction (as `zsha.py` does).
  - `browser-build.ts` computes the same over the installed directory, skipping Playwright's two marker files, and
    fails on any difference. That is about 1 s for about 500 MB.
  - Keep `sha256` for the message, and `--image` hashes the image's tree the same way.

### S4. CI-18's "every job that installs the browser … holds it to `browser.json`" is false as designed, and the shipped worker image is never checked

- **Evidence.**
  - `CHROMIUM_INSTALL` also runs in `large-zip.yml:37`, `release.yml:157` (the binding capacity run's browser) and
    `screening-capacity.yml`'s `capacity`. §3.3.1 adds the check only to `unit`, `db`, `e2e` and `images`.
  - The release's `build` (`release.yml:60-118`) builds the worker image that ships, with the browser downloaded at tag
    time from `cdn.playwright.dev` and unverified. The `images` job checks a different build of the same Dockerfile.
- **Fix.**
  - `node tools/ci/browser-build.ts` follows every `CHROMIUM_INSTALL` in every workflow.
  - `--image` runs in `release.yml`'s and `release-dry-run.yml`'s `build` before `docker save`. Both jobs already run
    repository code; `push` and `report` stay clean.
  - The `workflows.test.ts` rule: every install step is followed by the check.

### S5. `browser-build.ts` cannot find playwright-core as specified, and the `images` job installs nothing

- **Evidence.**
  - "the installed playwright-core's `browsers.json` (resolved from `apps/web`)": `apps/web/node_modules` holds only
    `@playwright/test` (`ls apps/web/node_modules | grep -i playwright` → `@playwright`; `ls node_modules | grep
    ^playwright` → nothing). pnpm does not hoist playwright-core.
  - The `images` job has no `pnpm install` (`ci.yml:466-514`), so `--image` there has neither node_modules nor a
    pinned Node.
- **Fix.**
  - Resolve through the chain, with `createRequire` from `apps/web/package.json`: `@playwright/test/package.json` →
    `playwright/package.json` → `playwright-core/package.json`. All three export `./package.json` (checked in the 1.64.1
    tarballs and the installed `@playwright/test`).
  - In `--image` mode, read the image's own `/app/node_modules/playwright-core/browsers.json` through `docker run` and
    need no install. Node 24 is on both runner images (or add setup-node with no cache).
  - Test both paths in `browser-build.test.ts`.

### S6. #42's overlapping files are not all named, with the reason and the order

- **Evidence.** #42's 143 files (`scratchpad/pr42-files.txt`) that ci-browser also edits: `apps/web/package.json`,
  `apps/worker/package.json`, `pnpm-lock.yaml`, `tools/screening-capacity/report.test.ts`,
  `packages/synth/src/cases/{matrix,registry}.ts`, `docs/product/test-matrix.md`, `docs/product/reconciliation-001.md`,
  ADR 0062, `report.ts`, `run.ts`, `test-support/measurements.ts` and `shell.tsx`. The section gives hunks and the
  rule-6 basis only for `shell.tsx`, `run.ts`, `report.ts`, `measurements.ts` and ADR 0062.
- **Fix.** Add one table to §3.3.2 listing, for each overlapping file:
  - #42's hunks (`pulls/42/files`) and ci-browser's lines;
  - the merge rule: the lockfile re-resolved with `pnpm install`, never hand-merged (`lanes/lane-b.md:67`); the
    manifests kept on both sides; the matrix and registry rows appended in merge order;
  - the ruling that covers it: Q2 for `shell.tsx` and the harness, rule 6 for documents and manifests.

  Also state that `report.test.ts` and `measurements.ts` take format 9 whichever pull request merges second.

### S7. The sequencing omits "after the checklist PR", on which acceptance step 9 depends

- **Evidence.** `lanes/lane-b.md:135`: "4. ci-browser … After ci-deps, and after the checklist PR." The section says
  only "after ci-deps merges". Acceptance 9 needs the UX and brand reviewer (`lanes/lane-b.md:143`), whose file
  `.claude/agents/ux-brand-reviewer.md` lands with that checklist PR (`lanes/lane-b.md:75, :186`). It is absent at
  6ddd587 (`ls .claude/agents | grep -i ux` → nothing).
- **Fix.** State both prerequisites in §3.3's opening paragraph and in §4's row. The branch is cut after ci-deps and the
  `co-001/ux-brand-reviewer` PR merge, or the UX review runs from that PR's file at its head SHA, and the section names
  which.

### S8. "Failing first" covers only tests that read the tree; the harness and launch-check behaviours have no red run

- **Evidence.** §3.3.3's command runs `workflows.test.ts` and `browser-version.test.ts` with `CI_TREE` (ci-deps'
  mechanism reroutes file reads only, §3.2.3). The behaviour fixes in `measure.test.ts` (the loaded tag proved per
  store), `launch-check.test.ts` (another `ImageOS`, `imageSource: save`, format 8 refused) and `report.test.ts`
  (format 9) import modules and cannot be pointed at the base by `CI_TREE`. The section claims "Each test below that
  fixes a behaviour fails on the merge base's tree", but gives no mechanism for these.
- **Fix.** Add a second recorded red run, in a worktree at the merge base with the head's three test files copied in:
  `git worktree add $tmp <mb> && cp tools/screening-capacity/{measure,report,launch-check}.test.ts $tmp/tools/screening-capacity/
  && (cd $tmp && pnpm install --frozen-lockfile && pnpm exec vitest run --project unit tools/screening-capacity -t '<names>')`.
  Each named test must fail there. The PR description records it beside the `CI_TREE` run.

### S9. A browser-tests Dependabot PR would show nothing but the browser check: A4 (c) cannot be observed

- **Evidence.**
  - The check runs right after the install in `unit`, `db` and `e2e`, and every later step has the default `success()`
    condition, so on a bump `pnpm test`, the db shards and the journeys never run. "Red only on the browser check"
    (acceptance 10) is then true by construction, and says nothing of real incompatibilities.
  - `browser.json`'s `playwright` field is a version literal that `browser-version.test.ts` holds equal to the manifests.
    That is the duplication the section rejects for the Dockerfile ("a literal held equal by a test, which is the
    duplication A4 (b) forbids"), and it would make the bump red a second time.
- **Fix.**
  - The tests after the check take `if: ${{ !cancelled() }}`. The cache saves keep `success()`, so a failed build is
    still never cached.
  - Drop `playwright` from `browser.json`, since `revision` and `browserVersion` are what bind. Or record why it is not
    a duplicate, and leave it out of `browser-version.test.ts`.

### S10. The `images` job moves to the containerd store with no plan for Trivy there

- **Evidence.** `images` scans `tp-web:scan` and `tp-worker:scan` from the daemon (`ci.yml:480-514`, `image-ref`). On
  26.04 the daemon is Docker 29.4.2 on a fresh install, so the containerd store applies (S2's sources). Trivy's
  daemon source reads images through the Docker API, and images with attestation indexes on that store are a known
  failure class. `images` is under `all green`, and §9 lists no such risk.
- **Fix.** Make the scan store-independent:
  - build `outputs: type=docker,dest=$RUNNER_TEMP/<name>.tar`;
  - scan with trivy-action `input: <tar>`;
  - give image-id.ts and the browser check that same archive;
  - load it only for `--image`.

  Then the scanned bytes are the bytes checked, on either store. Add the §9 row.

### S11. Documents left stating "every job on ubuntu-24.04", and ADR 0062 cites that point elsewhere

- **Evidence.**
  - `reconciliation-001.md:576` says "every job runs on `ubuntu-24.04`" (the gate moves).
  - ADR 0063 (`:478`, item 15) says approval-of-record "runs on `ubuntu-24.04`, as every job has since #24".
  - ADR 0062's binding text, which the amendment must reword, is at `:1096` and `:1322-1325` ("the containerd store's
    `{{.Id}}`, a manifest's digest, is never read"), not at the cited `:1115`, `:1164-1166` and `:1186` (runner-layout
    text; `sed -n` at 6ddd587).
- **Fix.** Add `reconciliation-001.md:576` and ADR 0063:478 (amended by ADR 0066 Part 3, or a one-line ADR 0063
  amendment) to §3.3.2. Correct ADR 0062's cites to `:1096, :1322-1325` (plus `:1164-1166` for F5's runner line).

## Nits

- **N1. The fsevents claim is wrong.** `npm view playwright@1.64.1 --json` shows dependencies `{playwright-core: 1.64.1}`
  and no `optionalDependencies` (1.56.1 had `fsevents 2.3.2`). `fsevents@2.3.2` is referenced only by playwright
  (`pnpm-lock.yaml:2877, :5946, :6376`), so the lockfile loses it, and the diff is not "version swaps only". Fix:
  restate it as "version swaps plus fsevents 2.3.2 removed".
- **N2. The run count is off by one.** `logs/install-durations.tsv` holds 92 installs from 14 distinct runs
  (`awk '{print $1}' | sort -u | wc -l` → 14), not 15. The 10 over 60 s (86-612 s) is right. Fix: say 14 runs.
- **N3. The `restore-keys` second prefix needs its own output.** `apt-v1-<ImageOS>-` needs `ImageOS` alone, and the
  `runner-image` step writes only `key=$ImageOS-$ImageVersion`. Fix: also write `os=$ImageOS`, and name both outputs in
  the test.
- **N4. The release build's setup-node needs both cache inputs off.** It must also set `package-manager-cache: false`,
  as ci-deps' release rule requires (§3.2.1, "setup-node takes no cache and sets `package-manager-cache: false`").
  Fix: write it in the build step and the test.
- **N5. The dry-run equality rule must follow two changes.** ci-deps' rule allows only "the image list and the push lines
  removed" (§3.2.1). It must also strip the post-push registry check and admit the build's new setup-node and
  image-id.ts steps. The dry run builds `web` only, so the worker's `--image` check (S4) is not exercised there. Fix:
  state both.
- **N6. A failing probe would open the real capacity issue.** The `notify` job (`screening-capacity.yml:262-266`,
  `if: failure() && github.event_name != 'pull_request'`) would open or update the capacity-failure issue on a failing
  advisory 26.04 probe. Fix: add `&& !(github.event_name == 'workflow_dispatch' && inputs.runner == 'ubuntu-26.04')`,
  with the probe's result going to #41 by hand.
- **N7. The apt script is not watched for the capacity job.** `screening-capacity.yml`'s `capacity` will run
  `tools/ci/apt-archives.sh`, but neither its push `paths` (`:29-43`) nor `watched-paths.txt` (a #42 file) names
  `tools/ci/**`, so a change to the script never runs on that job's 24.04 image until a later push or the weekly run.
  Fix: add `tools/ci/apt-archives.sh` to the push paths and to `watched.ts`'s fixed list, or drop the apt cache from
  that job.
- **N8. Two comments go stale.** `launch-check.ts:400` ("both workflows build them on ubuntu-24.04") is false for a
  dispatched probe; reword it. §3.3.1's "the base branch's is written only by its push runs" becomes, under F1 (a)
  (default branch = build branch), "only by runs of the build branch's own code (push, schedule, dispatch)"; reword
  ci.md's Caches paragraph to match.
- **N9. The 2.5.3 computed check is described ambiguously and is vacuous on mobile.**
  - It names both `locator.evaluate` and `ariaSnapshot`, which are different mechanisms.
  - At 390 px the account control's only visible text is the initial, which the fix makes CSS generated content. That
    is invisible to `innerText`, so the check passes trivially there.
  - Fix: take the name from `ariaSnapshot()` (or `toHaveAccessibleName`). Take the visible text from `innerText` plus
    `getComputedStyle(el, '::before').content`. Assert the lower-cased name contains it. axe itself returns
    "incomplete" for a one-letter label (`axe.js` 4.14.0 `labelContentNameMismatchEvaluate`, `is_human_interpretable
    < 1`), so this check is the only guard there.
