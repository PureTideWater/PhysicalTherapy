# images red on 4846f043 (ci run 41763423759, job 126356134153)

## Verdict
There are no HIGH or CRITICAL findings. Trivy never scanned either image. In both scan steps the Trivy binary
install inside `aquasecurity/trivy-action@ed142fd0` (v0.36.0), which calls `aquasecurity/setup-trivy@3fb12ec1`, exited
with code 6. The failure is an infrastructure one: a download was refused. #94 did not cause it, and the vulnerability
DB did not cause it.

## The exact failing lines (job 126356134153)
Web scan (log line ~912):
```
2026-11-04T02:54:17.1917825Z bash ./trivy/contrib/install.sh -b /home/runner/.local/bin/trivy-bin -c setup-trivy v0.70.0
2026-11-04T02:54:17.2232562Z aquasecurity/trivy info checking GitHub for tag 'v0.70.0'
2026-11-04T02:54:17.6254418Z aquasecurity/trivy info found version: 0.70.0 for v0.70.0/Linux/64bit
2026-11-04T02:54:17.6939803Z ##[error]Process completed with exit code 6.
```
Worker scan (log line ~2785): the same three lines, ending `2026-11-04T02:55:32.7786181Z ##[error]Process completed with exit code 6.`
The step that failed is "Install Trivy" (`__aquasecurity_setup-trivy.__run_2`, outcome=failure). Everything after it
was skipped: "Get current date", "Restore DB from cache", "Run Trivy". No DB was downloaded and no table was printed.
Both images built successfully: build-push-action finished, the web digest was sha256:bb7aaad5…, and the dockerbuild artifact was uploaded.

## Why exit code 6
The installer is `contrib/install.sh` at trivy@75c4dc0f ("chore: add client option to install script (#9962)"). It is
the ref setup-trivy pins, and it is identical to trivy's current main. Its download section, under `set -e`, is:
```
TARBALL_URL="${GET_DOWNLOAD}?os=${OS}&arch=${ARCH}&version=${VERSION}&type=${FORMAT}&client=${CLIENT}"   # GET_DOWNLOAD=https://get.trivy.dev/trivy
CHECKSUM_URL=${GITHUB_DOWNLOAD}/${TAG}/${CHECKSUM}                                                      # github.com/.../releases/download
...
code=$(curl -w '%{http_code}' -sL -o "$local_file" "$source_url")
```
The tag lookup went through api.github.com and printed "found version". The next step is the tarball download from
`https://get.trivy.dev`. curl exit 6 is CURLE_COULDNT_RESOLVE_HOST, and `set -e` passes it straight through as the
step's exit code. Each failure came 30 to 110 ms after "found version", which fits a fast name-resolution failure for
get.trivy.dev and does not fit a timeout. An HTTP error would have ended with exit 1 and a status code instead. I
could not probe get.trivy.dev from this session: the agent proxy answers 403 for it and for public DoH.

## Is it persistent? Every images job since 02:54Z failed the same way, on separate runners
| run / job | head | web install | worker install |
|---|---|---|---|
| push 41763423759 / 126356134153 | 4846f043 | 02:54:17Z exit 6 | 02:55:32Z exit 6 |
| PR #103 (Dependabot minor-and-patch-a51a8d3d37) 41764237472 / 126358751825 | c3ed1825 | 03:02:11Z exit 6 | 03:03:22Z exit 6 |
| PR #104 (co-001/ss-01-suspension-refusal) 41765454689 / 126362641812 | e4a6d2fc | 03:16:03Z exit 6 | 03:17:04Z exit 6 |

That is 6 of 6 installs over 23 minutes. It is not a single blip.

## Comparison: base 21fa10df and #94's head e3fc02e4 (both 2026-11-02)
- Base push run 41428286317, images job 125220160858 (10:24Z): `installed /home/runner/.local/bin/trivy-bin/trivy`.
  DB `[vulndb] Downloading artifact... repo="mirror.gcr.io/aquasec/trivy-db:2"` (131.09 MiB, downloaded fresh;
  the log prints no DB build date). Debian 13.7, web pkg_num=79, worker pkg_num=192. Passed.
- PR #94 images job 125226140767 (10:44Z): the same pins, the same v0.70.0, `installed …` at 10:44:22Z, the same DB
  source. Every target in both Report Summaries had 0 findings: the debian layer, `app/apps/web/package.json`, every
  `app/node_modules/.pnpm/...` package.json including @aws-sdk+client-s3@3.1160.0, and `opt/yarn-v1.22.22`. Notice:
  "Version 0.76.1 of Trivy is now available, current version is 0.70.0".
- `git diff --stat 21fa10df 4846f043` touches no `.github/` file and neither Dockerfile. It changes only package.json
  files, pnpm-lock.yaml, infra, tests and docs. The scan configuration and the installer path are byte-identical
  between the green runs and the red ones.

Per-finding table (package, installed version, fixed version, CVE, publish date, layer, whether #94 brought it): there
are no rows. The failing run produced no findings, and the last real scans of this exact lockfile (e3fc02e4) and its
base had zero HIGH or CRITICAL findings. Whether today's DB would flag something cannot be known until a scan runs.

## The repo's Trivy configuration and documented paths
- There is no `.trivyignore` and no `trivy.yaml`. The config is the two steps at `.github/workflows/ci.yml:695-731`:
  `severity: HIGH,CRITICAL`, `ignore-unfixed: true`, `exit-code: "1"`, `cache: false`, and `cache-dir` under
  runner.temp. No `version:` is set, so the run gets trivy-action v0.36.0's default, v0.70.0. release.yml and
  release-dry-run.yml use the same pin and the same `cache: false` (ADR 0066, the section headed "The release restores
  no cache"). Because `cache: false` also turns off setup-trivy's binary cache, every scan downloads the binary from
  get.trivy.dev.
- The documented path for a real finding is docs/runbooks/ci.md:148: "**`images`:** the Trivy table names each HIGH or
  CRITICAL finding with a fixed version: take the fix (a base-image or package bump), or record why not in
  docs/adr/0010's way." That path does not apply here because there is no table.
- The re-run rule is docs/runbooks/ci.md:150-151: "**Re-running.** Re-run failed jobs only for an infrastructure failure
  (a runner lost, a download refused, a service that did not start), never for a test that failed: a test that passes
  on a re-run is a flaky test, and is fixed." An installer that cannot fetch its tarball is "a download refused", so a
  re-run is allowed.
- ADR 0066's "Revisit when" section names "a newer trivy is wanted than trivy-action's default (a `version:` pin and its
  check)". Pinning a newer version would not help here, because v0.76.1 installs through the same get.trivy.dev URL.

## Open PR #86 (co-001/ci-images-digest, 83167b8f)
#86 does not touch the Trivy steps. It changes the identity steps to `BUILT: fromJSON(...)` and adds
`BUILDX_METADATA_PROVENANCE: disabled` to every build-push-action step, plus tests and docs. Its ci.md and release.yml
hunks only mention Trivy in surrounding text. It neither fixes this failure nor conflicts with a fix. #86's base is
83d71fd6 and it does not contain 4846f043. Its next CI run will go red on images like every other run while
get.trivy.dev does not resolve.

## Side finding (the 4 vs 6 db shards and 2 vs 3 e2e shards)
ci.yml:305 has `shard: ${{ fromJSON(github.event.repository.private && '[1,2,3,4,5,6]' || '[1,2,3,4]') }}`, and :506
has the e2e equivalent `[1,2,3]` vs `[1,2]`. The comment reads "Six shards on a private repository's 2-CPU runners,
four on the public 4-CPU ones". The push run's 6/3 therefore means `github.event.repository.private` was true on
2026-11-04. The repository was public on 2026-11-02, when it ran 4/2, and private by 2026-11-04 (6/3). I inferred
this from the matrix; the run API returned no `private` field. ADR 0066's "Revisit when" section lists "the repository
goes private (about 10 bot pull requests a week, about 3,500 to 4,000 billed minutes a month)" as a trigger, and
this is now met. I do not know that the visibility change caused the DNS failure. It changes the runner class (2 CPU
instead of 4), not the scan path.

## Conclusion
- **Whose it is.** No one's code. It is an outage of Trivy's binary download host get.trivy.dev, or a name-resolution
  failure for it from GitHub's runners. It started at or before 02:54Z on 2026-11-04 and was still failing at 03:17Z.
  #94 did not bring it, and it is not new data in the vulnerability DB.
- **The fix under the runbook.** Nothing should be bumped, recorded as an exception, or committed. Once get.trivy.dev
  installs again, re-run the failed `images` job on push run 41763423759. That turns ci's "all green" green for
  4846f043. Before re-running, confirm the host answers, for example with one manual re-run or by watching the next PR
  run's "Install Trivy" for `installed …`. Re-running while the host is still down just fails again. That re-run is for
  a person, or the owning lane, to do; this read-only task did not do it. If the re-run then shows a real Trivy table,
  that is a new finding and goes down the ci.md:148 path.
- **If the outage lasts.** The durable fix would be a CI change, which needs its own PR and an ADR 0066 amendment. The
  scans would install a pinned Trivy release straight from `github.com/aquasecurity/trivy/releases/download/v0.70.0/`,
  checking it against the checksums file and ideally its signature, and pass `skip-setup-trivy: true`. This removes the
  dependence on get.trivy.dev from ci.yml, release.yml and release-dry-run.yml. Do not turn on trivy-action's binary
  cache: ADR 0066 chose `cache: false` on purpose. Only start this change if the outage outlives a re-run window, and
  route it as Lane B (CI) work.
- **Who owns it.** The re-run belongs to whoever owns the build branch's red push gate: the build-platform/orchestrator
  lane, with Lane B if it holds CI. No new PR is needed unless the outage persists.
- **Other open PRs.** Yes. Every PR whose CI runs while the host is down will be red on images, whatever it changes.
  It is already red on #103 (Dependabot) and #104 (ss-01). #86, #96, #85, #84 and #75 will be red on their next push.
  Each needs only an images re-run once the host is back, never a code change for this.
