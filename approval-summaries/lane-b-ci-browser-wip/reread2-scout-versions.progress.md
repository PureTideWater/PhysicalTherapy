# scout-versions progress (2026-10-27)

## 1 npm (done, 01:49 UTC)
- registry.npmjs.org packuments saved in scratchpad/reread2/npm/*.json.
- @playwright/test, playwright, playwright-core: latest 1.64.1 (10-14 11:58:13 / 11:54:49 / 11:54:58); next 1.65.0-alpha-2026-10-26; no 1.64.2, no 1.65.0. GitHub tags v1.64.0, v1.64.1 only.
- @axe-core/playwright latest 4.14.0 (10-15 13:33:17); rc/next 4.14.1-<sha> prereleases only (next 4.14.1-55245d5.0.sha-55245d5). axe-core latest 4.14.0 (10-05 17:43:36), next 4.14.0-canary.6b52b84. GitHub v4.14.0 only in both repos.
- All trustedPublisher github + attestations, old (1.56.1/4.13.0 era) and new. Note oidcConfigId lost its "oidc:" prefix from 1.64.0 / 4.14.0 (same UUID).
- deps: playwright 1.64.1 -> playwright-core 1.64.1 only, opt {} ; @axe-core/playwright 4.14.0 axe-core ~4.14.0, peer playwright-core >=1.0.0, engines node >=22.12.0.
- tarball playwright-core-1.64.1.tgz integrity matches packument; its browsers.json: chromium + headless shell 1248 / 156.0.8078.4.
- Recommendation: stay 1.64.1 / 4.14.0.

## 2 browser (done)
- 1248 stands. browser.json (ci-browser apps/web/e2e/browser.json:2-3) 1248 / 156.0.8078.4; zipSha256 :11 c3e50596..., :19 43fd3176...
- setup-container.sh (ops claude/build-ops, last commit 07e96172) :965-968 CFT_BUILDS 1248 rows carry 43fd3176... (chromium) and c3e50596... (headless) = browser.json.
- curl -sSI storage.googleapis.com/chrome-for-testing-public/ -> CONNECT 403 (01:50 UTC); cdn.playwright.dev same. Proxy status recentRelayFailures lists storage.googleapis.com connect_rejected.
- /opt/pw-browsers holds chromium-1243, chromium_headless_shell-1243, ffmpeg-1011 (base image), no 1194, no 1248.
- Merged tree still names 1.56.1 / 4.13.0 (apps/web/package.json:47-48, apps/worker/package.json:53, tools/package.json:34 (design says :33), lockfile).

## 3 runners (done, ~01:55 UTC)
- git ls-remote: newest ubuntu26/20261026.180 (e2ea192b, readme commit 2026-10-26T21:30:39Z), previous ubuntu26/20261023.163 (c3c3ced4); newest ubuntu24/20261026.354 (ac85c719), previous 20261023.334, 20261012.334.
- Ubuntu2604-Readme.md @ ubuntu26/20261026.180: image 20261026.180.1, 26.04.1 LTS, kernel 7.0.0-1017-azure, Node 24.22.1 (was 24.21.0), Docker client/server 29.4.2, Compose 5.1.3, Buildx 0.38.1 (was 0.38.0), PostgreSQL 18.6 (disabled). Readme lines 9-11, 25, 72-75, 161. Only other relevant diff vs .163: libnss3-tools 2:3.120-1ubuntu2.1 -> .2.
- Ubuntu2404-Readme.md @ ubuntu24/20261026.354: 20261026.354.1, 24.04.5, Node 22.23.4, Docker 28.0.4, Compose 2.38.2, Buildx 0.38.1, PostgreSQL 16.15 (lines 9-11, 26, 75-78, 173).
- toolset-2404.json docker-ce and docker-ce-cli 28.0.4 at ubuntu24/20261026.354 and main (6d35e161, 2026-10-26) lines 199-206; toolset-2604.json 29.4.2.
- ubuntu-latest move date: NOT verified. README.md (main and tag) line 25 still maps ubuntu-latest to 24.04, no date. gh api / MCP refuse actions/runner-images (not in session); github.com HTML 403 via proxy.

## 4 actionlint (done)
- newest tag v1.7.12 (914e7df2, 2026-03-31); main 011a6d15 (2026-04-19). rule_runner_label.go:44-47, :85-88 at both: ubuntu-24.04(-arm), 22.04(-arm) only; no 26.04. -ignore stays. setup-container.sh:90-93 pins 1.7.7; may move to 1.7.12 (outside scope, ops proposal), changes nothing for 26.04.

## 5 CI-only baselines (findings gathered, ~02:00 UTC)
- ci.yml @2ab2b15: browser-install :546-552 (e2e), baseline step :595-645 (shard 1, deletion-first, git ls-files set compare, sha256 of all, base64 of changed on failure); failed-comparisons print :586-593; upload-artifact :573-584 runs BEFORE the baseline step and does not include apps/web/e2e/brand.spec.ts-snapshots.
- Artifacts AND job logs via gh api redirect to productionresultssa18.blob.core.windows.net -> proxy 403 (artifact 'playwright-1' of run 40401493722 and job 121849065662 logs). GitHub MCP get_job_logs(return_content) works (server side): so CI bytes reach this machine only through the log route; artifacts unreachable.
- browser-build.ts on mismatch prints first ten differing paths only (:243-255, :274-276); full list only with --list (:330). CI step :241/:552 runs without --list -> if mirror differs, browser-builds/*.sha256 cannot be rebuilt from that run.
- brand-screenshots (header-1280/390, dashboard-1280, dashboard-dark-1280, claims, reconciliation) uploaded by e2e (:580), brand.spec.ts:376-463; e908c21's playwright-1 artifact expires 2026-11-02T21:13:55Z but unreachable here.
- release-capacity.yml capacity (:36) and content-calendar.yml (:43, :68) on ubuntu-24.04 not in RELEASE_CHAIN (workflows.test.ts:210); release-capacity builds the worker image (:61-65 load: true).

## DONE: report written to scratchpad/reread2/scout-versions.md (02:05 UTC)
