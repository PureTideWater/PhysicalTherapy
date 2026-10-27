# Scout: versions, browsers and runners (2026-10-27, ~01:49-02:05 UTC)

Head: /home/user/ci-browser at 2ab2b15 (merge of e908c21). All registry, git and proxy reads are dated 2026-10-27.
Raw packuments: scratchpad/reread2/npm/*.json; runner-images and actionlint partial clones: scratchpad/reread2/{runner-images,actionlint}.git.

## 1. npm: versions, age, trust, dependencies

| Package | latest | Published (UTC) | Newer stable? | Prereleases after it |
|---|---|---|---|---|
| `@playwright/test` | 1.64.1 | 2026-10-14 11:58:13 | none | 1.65.0-alpha-2026-10-21 … -10-26 (`next` = 1.65.0-alpha-2026-10-26) |
| `playwright` | 1.64.1 | 2026-10-14 11:54:49 | none | same alphas |
| `playwright-core` | 1.64.1 | 2026-10-14 11:54:58 | none | same alphas |
| `@axe-core/playwright` | 4.14.0 | 2026-10-15 13:33:17 | none | `next` 4.14.1-55245d5.0.sha-55245d5, `rc` 4.14.1-d1531a9.0.sha-d1531a9 (prereleases only) |
| `axe-core` | 4.14.0 | 2026-10-05 17:43:36 | none | `next` 4.14.0-canary.6b52b84 |

- Evidence: `curl https://registry.npmjs.org/<pkg>` at 01:49 UTC, dist-tags and `time`. Packument `modified`: playwright* 2026-10-26 05:2x, `@axe-core/playwright` 2026-10-15 16:39, axe-core 2026-10-21 21:13. GitHub tags agree: `git ls-remote --tags https://github.com/microsoft/playwright 'v1.64*' 'v1.65*'` gives v1.64.0 and v1.64.1 only; dequelabs/axe-core and axe-core-npm `v4.14*` give v4.14.0 only.
- **No 1.64.2, no 1.65.0, no stable 4.14.1.** The gates do not need to be re-run against a newer version.
- Age (`minimumReleaseAge` 4320 min): all were over three days old by 2026-10-18 at the latest. Pass.
- Trust (`trustPolicy: no-downgrade`): every version from 1.62.1/4.11.3 to 1.64.1/4.14.0 has `_npmUser.trustedPublisher` `{"id":"github",…}` and `dist.attestations`. One cosmetic change: from 1.64.0 and 4.14.0 the `oidcConfigId` lost its `oidc:` prefix (same UUID: `oidc:005e5f14-…` becomes `005e5f14-…` for playwright-core). Evidence of a trusted publisher is unchanged, so this is not a downgrade. Whether pnpm 10.34.8 reads it that way: not re-verified here. The design's `trust.js` scoring ([SV] §2) passed on the same packuments, and phase 2's `pnpm install` under the gates is the proof.
- Dependencies (packument `versions[...]`):
  - `@playwright/test` 1.64.1 depends on `playwright` 1.64.1 (engines node >=20).
  - `playwright` 1.64.1 depends on `playwright-core` 1.64.1, with optionalDependencies `{}`. 1.62.1 still had `fsevents` 2.3.2, and 1.63.0 already dropped it.
  - `playwright-core` has no dependencies.
  - `@axe-core/playwright` 4.14.0 depends on `axe-core ~4.14.0`, peers on `playwright-core >= 1.0.0` and requires engines node >=22.12.0.
  - **No new transitive package.** `fsevents@2.3.2` leaves the lockfile, as the design says. At 2ab2b15 it sits at `pnpm-lock.yaml:2924` and `:6001`, not the design's `:2877, :5946`.
- The published tarball `playwright-core-1.64.1.tgz` matches the packument's `dist.integrity` (sha512-BC4s8y6S…xyDQ==). Its `package/browsers.json` names chromium and chromium-headless-shell at **revision 1248, 156.0.8078.4**. raw.githubusercontent.com answered CONNECT 403, so I read the tarball instead.
- **Recommendation: take 1.64.1 and 4.14.0, unchanged.** The merged tree still names the old versions: `apps/web/package.json:47-48` (4.13.0, 1.56.1), `apps/worker/package.json:53` and `tools/package.json:34` (1.56.1; the design says `:33`), and lockfile `:1015, :2055, :2537, :3452, :3457`. Phase 2's bump is unchanged.

## 2. The browser build

- **1248 stands.** No newer Playwright exists, so the revision does not move.
- `/home/user/ci-browser/apps/web/e2e/browser.json:2-3` names revision 1248 and 156.0.8078.4. Its `zipSha256` values are `c3e50596…b8ba20` for the headless shell (`:11`) and `43fd3176…129d79` for chromium (`:19`).
- `/home/user/ops/tools/setup-container.sh` (claude/build-ops, last commit 07e96172, clean) carries the same zip SHA-256s in its `CFT_BUILDS` rows:
  - `:967` `chromium-1248|156.0.8078.4|chrome-linux64.zip|43fd31766c…129d79|chrome-linux64|`
  - `:968` `chromium_headless_shell-1248|156.0.8078.4|chrome-headless-shell-linux64.zip|c3e50596ae…b8ba20|chrome-headless-shell-linux64|`
  - Both equal browser.json. The design's cite `:957-960` on 99b2e05 is now `:965-968` (1194 at `:965-966`).
- `curl -sSI https://storage.googleapis.com/chrome-for-testing-public/` (01:50 UTC) gives `curl: (56) CONNECT tunnel failed, response 403`. `https://cdn.playwright.dev/` gives the same. The proxy status lists `storage.googleapis.com:443 connect_rejected` among its recent relay failures.
- `/opt/pw-browsers` holds `chromium-1243`, `chromium_headless_shell-1243` and `ffmpeg-1011` (the base image's own). It holds no 1194 and no 1248.
- Phase 1 also committed `apps/web/e2e/browser-builds/{chrome-headless-shell-linux64,chrome-linux64}.sha256`, the file lists each `treeSha256` hashes. They were computed from Google's zips, so they stand or fall with browser.json.

## 3. Runner images

`git ls-remote --tags https://github.com/actions/runner-images`, then a partial clone and `git show <tag>:<path>`:

| | ubuntu26 | ubuntu24 |
|---|---|---|
| Newest tag | **`ubuntu26/20261026.180`** (e2ea192b; readme commit 2026-10-26T21:30:39Z). The design names 20261023.163 (c3c3ced4), which is now one behind | **`ubuntu24/20261026.354`** (ac85c719). The design names 20261023.334 as current |
| Image | 20261026.180.1, Ubuntu 26.04.1 LTS, kernel 7.0.0-1017-azure (`Ubuntu2604-Readme.md:9-11`) | 20261026.354.1, 24.04.5 LTS, kernel 7.0.0-1017-azure (`Ubuntu2404-Readme.md:9-11`) |
| Node | **24.22.1** (`:25`; was 24.21.0) | 22.23.4 (`:26`) |
| Docker client/server | 29.4.2 (`:74-75`) | 28.0.4 (`:77-78`) |
| Compose | 5.1.3 (`:72`) | 2.38.2 (`:75`) |
| Buildx | **0.38.1** (`:73`; was 0.38.0) | 0.38.1 (`:76`) |
| PostgreSQL | 18.6, service disabled (`:161-164`) | 16.15 (`:173`) |

- The other 2604 change from .163 to .180 that touches the browser: `libnss3-tools` went from 2:3.120-1ubuntu2.1 to 2:3.120-1ubuntu2.2 (`git diff ubuntu26/20261023.163 ubuntu26/20261026.180 -- images/ubuntu/Ubuntu2604-Readme.md`). It changes nothing in the design. The apt key changes with `ImageVersion`, as designed.
- **`toolset-2404.json` still pins `docker-ce` and `docker-ce-cli` 28.0.4**, with `containerd.io` at latest. Evidence: `:199-206` at ubuntu24/20261026.354 and at main 6d35e161 (2026-10-26). `toolset-2604.json` pins 29.4.2. The "After #42" trigger (24.04 moving past docker-ce 28) has not fired.
- **The ubuntu-latest move date is not verified.**
  - `gh api` and the GitHub MCP refuse actions/runner-images (not in this session's repositories), and github.com's HTML answers 403 through the proxy, so #14748 could not be read.
  - `README.md:25` at main and at the 26 tag still maps `ubuntu-latest` to 24.04 and names no date. `:93-97` says the migration is gradual "over 1-2 months".
  - It does not matter for ci-browser: the runner rule refuses `-latest`.

## 4. actionlint

- The newest release tag is **v1.7.12** (914e7df2, 2026-03-31), and main is at 011a6d15 (2026-04-19). There is no release since, per `git ls-remote --tags https://github.com/rhysd/actionlint`.
- `rule_runner_label.go:44-47` and `:85-88`, at v1.7.12 and at main, list `ubuntu-24.04(-arm)` and `ubuntu-22.04(-arm)` only. **No 26.04.**
- **So the `-ignore 'label "ubuntu-26\.04" is unknown'` stays**, as built in phase 1: actionlint 1.7.7 with the ignore returned rc 0 (build summary).
- `setup-container.sh:90-93` pins 1.7.7. Moving it to 1.7.12 would not help with 26.04, so ci-browser should not move it. It is an ops-side proposal only (below).

## 5. Baselines without a local browser: can CI's baseline step do the whole regeneration?

**The mechanism at 2ab2b15:**
- `ci.yml:595-645`, the step "The brand baselines, regenerated from nothing" (e2e shard 1, `if: !cancelled() && browser-install success`):
  1. lists the committed set with `git ls-files`;
  2. removes the seven PNGs;
  3. runs `--update-snapshots=all --retries=0` with its own `--output`;
  4. requires exit 0, the written set to equal the committed set, and no diff;
  5. prints the SHA-256 of every PNG;
  6. on failure, prints each changed or new picture as `path base64`.
- The browser check runs right after the install (`:546-552`) and holds both trees to browser.json and `browser-builds/*.sha256`.

**Two new facts from this machine (01:55-02:00 UTC):**
- (a) **CI artifacts and the REST log endpoint are unreachable here.** Both `gh api …/actions/artifacts/<id>/zip` (the `playwright-1` artifact of run 40401493722) and `gh api …/actions/jobs/121849065662/logs` redirect to `productionresultssa18.blob.core.windows.net`, which the proxy refuses (CONNECT 403). **The GitHub MCP `get_job_logs` with `return_content: true` works**, because it fetches on GitHub's side: job 121849065662 returned 639 lines. So the `path base64` log lines are the only route for CI's bytes to reach this machine, not merely the convenient one. Whether MCP or the log store keeps a 66,216-character line whole (with-seal cover: 49,661 bytes, so base64 66,216) is **not verified**. The step's SHA-256 print makes it checkable: decode, then `sha256sum`, then compare with the printed line.
- (b) **If the mirror's bytes differ from Google's, one CI run cannot give the new records.** `browser-build.ts` prints only the first ten differing paths (`:243-255`, `:274-276`). The full found list comes only under `--list` (`:330`), and ci.yml runs it without `--list` (`:241`, `:353`, `:552`). Rebuilding `browser-builds/*.sha256` and the `treeSha256` from CI would need a further run with a changed step.

**The CI-only plan and its cost:**
1. **Run 1:** push phase 2's no-browser commits (the bump, the lockfile under the gates, everything except the PNGs).
   - Browser check:
     - **if** Playwright's mirror equals Google's 156.0.8078.4 (unproven; P11/O9), it passes, and that run is the first proof of mirror and Google equality for 156;
     - **if not**, it fails, and per (b) the run must also print the full lists.
   - e2e: the journeys compare against the old (141) baselines. They may fail: [S3] M5 measured six at 0 px and the without-seal cover at 1,611 px. This is expected red.
   - The baseline step fails and prints only the pictures whose bytes changed. A picture byte-equal to the old one is not printed, and that is correct: its committed bytes already stand.
   - The session reads the log through MCP, decodes, checks each picture against the printed SHA-256 and commits CI's bytes.
2. **Run 2:** the baseline step regenerates all seven from nothing, byte for byte, and prints the seven SHA-256s. That is A9's proof of record, and e2e goes green.
3. **Cost:**
   - two full ci.yml runs (three if the mirror differs, unless the improvement below lands first);
   - one extra commit of seven PNGs;
   - no local browser.
   - Hold run 1 and run 2 on the same `ImageVersion`, because a weekly image between them could move a font. Both are printed in "Set up job". The next ubuntu26 image is likely within a week (tags since 08-24 are about weekly).
4. **The rule.** "Never stand in another browser build for a result of record" (`lanes/lane-b-session-brief.md:9`) is kept. CI's 1248, held by the browser check to browser.json's hashes, is the build of record itself, not a stand-in. Design 3.3.1 already says that "if local and CI disagree, CI's bytes are committed" (CI is where comparisons run). Committing CI's bytes first only removes the local first step.

**What still needs a local 1248:**
- **Acceptance 4's local no-op** ("a second `--update-snapshots=all` leaves `git status` clean locally"). Its only added value over CI's from-nothing regeneration is the host-independence finding for ADR 0058 (`:162-176`). It waits, recorded as "waiting on the person: storage.googleapis.com".
- **The 13 specs locally** (sign-in plus the twelve axe specs). Not needed for the record: CI's e2e (all 51 tests on 1248, ubuntu-26.04) is the record for tests (brief:9). Run them locally once 1248 can be laid out, as a convenience, not as a gate.
- **The UX review's before and after shots** (1280 and 390 px light, 1280 px dark; `.claude/agents/ux-brand-reviewer.md:9`). `brand.spec.ts` writes exactly such shots to `brand-screenshots/` (`:376`, `:432`, `:443`, `:462`), and CI uploads them (`ci.yml:580`). But artifacts are unreachable here (fact a), and e908c21's "before" artifact expires 2026-11-02T21:13:55Z. Under the brief this review stage waits for the local browser, unless the session chooses to print those shots to the log as well (proposal, below).
- **A9's inspection.** It can run on CI's bytes: the old blobs from git and the new ones from CI's log. It does not need a local browser.

**Recommendation:** do the whole regeneration from CI.
1. Push phase 2 with the improvement below in the same commit.
2. Commit CI's printed bytes after checking each against the printed SHA-256.
3. Take run 2 as ADR 0058's proof.
4. Have A9's agent inspect old git blobs against CI's bytes, with the side-by-side images in the status file.
5. Record the local no-op and the UX shots as waiting on storage.googleapis.com.
6. Open the draft PR on run 2's green, and run the UX review stage when the host is allowed (or from CI shots if the proposal is taken).

**Improvement inside ci-browser's scope (recommended, in phase 2's first push):**
- In `ci.yml`'s three browser-check steps (`:241`, `:353`, `:552`), or in `browser-build.ts` itself, print every file line of a build whose `treeSha256` differs. The second option is simpler: on a tree mismatch `run()` prints `found.lines` as `--list` does. A first run then gives everything needed to rewrite browser.json's `treeSha256`/`sha256` and `browser-builds/*.sha256` from CI if the mirror differs, which saves one run. The cost is about 590 log lines, only on a red check.

## Changes 3.3 needs

1. **§3.3.1 Versions bullet "All are npm `latest`; no stable release follows 1.64.1 … `next` is 1.65.0-alpha-2026-10-25"**
   - New text: "… `next` is 1.65.0-alpha-2026-10-26 (2026-10-27 01:49 UTC); `@axe-core/playwright`'s `next`/`rc` are 4.14.1 prereleases (4.14.1-55245d5.0.sha-55245d5); no 1.64.2, 1.65.0 or 4.14.1 stable."
   - Evidence: registry packuments 2026-10-27, and `git ls-remote` of the three repositories.
2. **§3.3.1 Trust bullet.** Add: "from 1.64.0/4.14.0 the `trustedPublisher.oidcConfigId` drops its `oidc:` prefix (same UUID); the evidence is unchanged."
   - Evidence: packument `versions[*]._npmUser.trustedPublisher`.
3. **§3.3.1 "`tools/package.json:33`"** becomes `:34` (at 2ab2b15); the design's table header "Where (at 6ddd587)" stays.
   - Evidence: `grep -n playwright tools/package.json`.
4. **§3.3.1 "`fsevents@2.3.2` … (`pnpm-lock.yaml:2877, :5946, :6376`)"** becomes "`:2924`, `:6001` (and the importer line) at 2ab2b15".
   - Evidence: `grep -n fsevents@ pnpm-lock.yaml`.
5. **§3.3.1 "`setup-container.sh`'s `CFT_BUILDS`, `:957-960` on claude/build-ops 99b2e05"** becomes "`:965-968` on claude/build-ops 07e96172".
   - Evidence: `grep -n CFT_BUILDS` and `git log -1 -- tools/setup-container.sh`.
6. **§3.3.1 The 26.04 image** ("the newest tag `ubuntu26/20261023.163`, c3c3ced4: image 20261023.163.3 … Node 24.21.0 … Buildx 0.38.0")
   - becomes "`ubuntu26/20261026.180`, e2ea192b: image 20261026.180.1, Ubuntu 26.04.1 LTS, kernel 7.0.0-1017-azure, Node 24.22.1, Docker 29.4.2, Compose 5.1.3, Buildx 0.38.1, PostgreSQL 18.6 (service disabled)";
   - and "20261023.334.3 is current" becomes "20261026.354.1 is current (Node 22.23.4, Docker 28.0.4, Compose 2.38.2, Buildx 0.38.1, PostgreSQL 16.15)".
   - Evidence: `Ubuntu2604-Readme.md:9-11, :25, :72-75, :161` and `Ubuntu2404-Readme.md:9-11, :26, :75-78, :173` at those tags.
7. **§3.3.1 "Docker 29 reaches 24.04 only by a toolset change"** stays. Add "re-checked 2026-10-27: `toolset-2404.json:199-206` docker-ce/docker-ce-cli 28.0.4 at ubuntu24/20261026.354 and main 6d35e161".
8. **§3.3.1 and P13 "`ubuntu-latest` moves to 26.04 in November 2026 (#14748)"**
   - Append "(not re-verified 2026-10-27: #14748 is unreadable from this session; runner-images `README.md:25` still maps `ubuntu-latest` to 24.04)". The comment at `workflows.test.ts` that cites it should keep "#14748" and not a day.
9. **§3.3.1 actionlint**: "v1.7.12 (the latest release) and main" becomes "v1.7.12 (still the latest release on 2026-10-27; main 011a6d15, 2026-04-19) … lists 22.04 and 24.04 only (`rule_runner_label.go:44-47, :85-88`)". The `-ignore` stays.
10. **§3.3.1 "Where CI downloads from" / the baselines.** Replace "on the local 1248 layout (below)" in the regeneration bullet with:
    - "from CI's baseline step: the first push's run prints each changed picture as `path base64`;
    - the session reads the log through the GitHub MCP's `get_job_logs` (artifacts and the REST log endpoint redirect to `*.blob.core.windows.net`, which this environment refuses), decodes each picture, checks it against the step's printed SHA-256 and commits CI's bytes;
    - the next run regenerates all seven byte for byte and is ADR 0058's proof;
    - CI's 1248, held to browser.json, is the build of record, not a stand-in."
    - Evidence: `ci.yml:595-645`, `gh api …/artifacts/<id>/zip` and `…/jobs/121849065662/logs` gave 403 at `productionresultssa18.blob.core.windows.net`, MCP `get_job_logs` returned 639 lines, `lanes/lane-b-session-brief.md:9`.
11. **§3.3.1 "A local no-op too" and A9's "A second `--update-snapshots=all` leaves `git status` clean locally".** Add: "waits on storage.googleapis.com and does not block the PR; until then CI's from-nothing regeneration is the proof; when 1248 is laid out the no-op runs and any disagreement is recorded against ADR 0058:162-176".
    - Evidence: the same as item 10, and `/opt/pw-browsers` holds no 1248.
12. **§3.3.1 browser check message, "names the first ten paths … which it prints in full under `--list`".** Add: "and in full whenever a build's tree differs, so a single CI run gives everything browser.json and `browser-builds/*.sha256` need if Playwright's mirror differs from Google's". This is an improvement in scope.
    - Evidence: `browser-build.ts:243-255, :274-276, :330`, and ci.yml `:241, :353, :552` without `--list`.
13. **§3.3.4, and the pipeline line on the UX review.** State that the before and after shots exist as CI's `brand-screenshots/` artifact (`brand.spec.ts:376-463`, `ci.yml:580`) but are unreachable from this environment, so the UX review stage waits on the local browser, or on a log print (proposal P15). e908c21's artifact expires 2026-11-02T21:13:55Z.
    - Evidence: `gh api …/runs/40401493722/artifacts`.
14. **§9 "Playwright's mirror … serves other bytes" row.** Add "the browser check prints the full lists, so one run gives the new records" (with item 12).

## Proposals outside ci-browser (notes)

- **P14 (ops):** move `setup-container.sh:90-93`'s actionlint pin from 1.7.7 to 1.7.12 (its tarball's SHA-256 from the release's checksums file). It changes nothing for 26.04; it is only currency.
- **P15:** ask the person to allow `*.blob.core.windows.net` (`productionresultssa18.blob.core.windows.net`) beside storage.googleapis.com, so CI artifacts (brand-screenshots, the Playwright report) and REST job logs can be read here. With that, the UX review's after shots could come from CI's 1248 run (the build of record) instead of waiting. Whether that satisfies the brief's "local screenshots" wording is the co-founder's call.
- **P16 (runner rule; the base's new workflows):** `release-capacity.yml`'s `capacity` (`:36`, building the production worker image with `load: true` at `:61-65`, a capacity measurement like screening-capacity's) and `content-calendar.yml`'s `check` and `notify` (`:43`, `:68`) are on ubuntu-24.04 and outside `RELEASE_CHAIN` (`workflows.test.ts:210`). This is the known runner-rule failure. Under F5's reasoning, `release-capacity.yml capacity` likely belongs in `RELEASE_CHAIN` (comparable timings, classic store), and content-calendar moves to 26.04. Whether its worker image should also get `browser-build.ts --image`: not verified.
