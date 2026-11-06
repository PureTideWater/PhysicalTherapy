# ci-findings-transport: adversarial review, security and supply chain

Reviewed 2026-11-04 (about 21:27 to 22:15 UTC) in a fresh clone (`/home/user/rv-cft-security-supply`, now removed).
Head 1322c7cf… (equal to `origin/co-001/wip-ci-findings-transport`), base `origin/claude/build-platform` 30871f72…,
the change `git diff $(git merge-base HEAD origin/claude/build-platform) HEAD` (13 files, +681 −212). Checklist:
`.claude/agents/security-reviewer.md` where it applies (logging, errors, uploads with limits; there is no schema,
route or model call in this change). Logs: `/tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/cft/logs/sec-*.log`,
`sec-mutations.txt`. Mutation script and scenario: `/tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/cft/sec/`.

Verdict: **no blocking finding**. One should (a test gap on the size refusal) and one nit (a signed URL in the log).

## Findings

### S1 (should): the download's size refusal is load-bearing, but no test fails if it is removed
- **Where:** `.github/workflows/content-calendar.yml`, the shared download block in notify and in handoff:
  `[ "$(wc -c < findings.json)" -le "$MAX_FILE_BYTES" ] || : > findings.json` and the `head -c "$((MAX_FILE_BYTES + 1))"` copy before it.
  The tests are in `tools/test/workflows.test.ts`: the cases "notify downloads the findings in three tries … refuses a file over
  MAX_FILE_BYTES" and handoff's "over MAX_FILE_BYTES".
- **Evidence (mutations, whole `workflows.test.ts` each, under the lock):**
  - `no-bound`: the `wc` refusal line deleted from both jobs → **142/142 passed**.
  - `cp-unbounded`: `head -c …` replaced by `cp` → **142/142 passed**.

  The only over-bound case is a 200-byte body with `MAX_FILE_BYTES=100`. That case fails either way, because the cut makes
  the JSON invalid (when `wc` is gone) or because `wc` empties the file (when `cp` is used). So neither line is tested on its own.
- **Scenario (ran):** the real notify step was taken from the YAML and run with a fake gh and `MAX_FILE_BYTES=100`. The
  artifact was a valid one-finding list followed by 200 spaces, 234 bytes. At HEAD, notify refuses it and opens "Content calendar
  check failing". With the `wc` line removed, the 101-byte cut is still a valid list, and notify files "Finding 1" from a file
  over its bound. The design states the invariant "size refused past the bound", but the suite does not enforce it.
- **Impact:** on a push run the artifact is trusted repository output, so the attack surface today is small. But the bound
  is the stated defence for the token-holding job against an oversized hand-over, and a later edit could drop it with every
  check green.
- **Fix:** add a case to both the notify test and the handoff test: a valid list padded with whitespace past `MAX_FILE_BYTES`
  must give "check failing" in notify and exit 1 in handoff. That kills `no-bound`. To kill `cp-unbounded`, assert the bounded
  read directly, for example that the block's only read of `$RUNNER_TEMP/findings/findings.json` is the `head -c "$((MAX_FILE_BYTES + 1))"`
  line (the test already holds the two blocks equal through `downloadBlock`).

### N1 (nit): a failed blob download writes the artifact's signed URL into the public run log
- **Where:** the same download block. `gh run download` stderr is not redirected; the comment says "gh's error each time in the log".
- **Evidence (ran, real gh 2.89.0, read-only):** `gh run download 41912582102 -n screening-capacity` against this repository's
  own run. The blob host was refused by this sandbox's proxy, and gh printed
  `error downloading screening-capacity: Get "https://productionresultssa10.blob.core.windows.net/…zip?…&se=…&sig=…": Forbidden`,
  which is the whole SAS URL, signature and expiry about 10 minutes out. On a runner, any blob error short of the `timeout` kill
  (a 403, 5xx or reset) would print the same line into the notify or handoff log.
- **Impact:** small today. The repository is public, so the artifact can already be read by any signed-in user and holds only
  public references (ADR 0071 Q1). The SAS URL adds anonymous access for about 10 minutes. Once the repository is private (ADR
  0071's Revisit already names `actions: read`), the log would carry a bearer link to a private artifact that outlives the reader's
  own access.
- **Fix:** either add a line to the Amendment's Revisit item ("and gh's download errors, which print the artifact's signed
  URL"), or redact the signature and keep the error:
  `… gh run download … 2> >(sed -E 's/([?&]sig=)[^&" ]*/\1***/g' >&2)`, applied identically in both jobs so T-H still holds
  them equal.

## Checked and found sound (each with its evidence)
- **Permissions, exactly as designed.** Notify has `{ actions: read, issues: write }` and handoff has `{ actions: read }`. Check
  inherits the workflow's `contents: read`, and upload-artifact needs no scope because it uses the runtime token. Each widening
  mutation fails the suite:
  - `notify-contents`: 2 failed.
  - `notify-actions-write`: 2 failed.
  - `handoff-prw` (pull-requests: write): 2 failed.
- **No `uses:` and no checkout in notify or handoff.**
  - `notify-uses` (a checkout added): 10 failed.
  - `download-artifact` (an action added to handoff): 3 failed.
  - No `${{ }}` appears in either `run:`; `expr-in-run` (`${{ github.run_id }}` in the run line) gives 10 failed.
- **Artifact scope and poisoning.** The download names this run (`"$GITHUB_RUN_ID"`, an env var, not an expression) and one
  exact name (`-n findings`). Dropping the run ID (`other-run`) gives 3 failed. No other workflow downloads by name across runs:
  - there is no `workflow_run` or `pull_request_target` trigger anywhere;
  - every `download-artifact` use is in another workflow, inside the same run.

  So a pull request's run, a fork or another run cannot put a `findings` artifact into a push or schedule run. Inside a pull
  request's own run, the PR's code can upload what it likes, but only handoff reads it. Handoff holds `actions: read` alone,
  runs only `gh`, `head`, `wc`, `jq` and `sha256sum` over it, and prints only a count, a size and a hash. A fork's token is
  read-only in any case.
- **Trigger.**
  - `pull_request`, not `pull_request_target`. Mutating to `pull_request_target` (`prt`) gives 4 failed.
  - Notify is never on a pull request. `notify-on-pr` (`if: always()`) gives 2 failed.
- **Injection into gh arguments.** Real gh 2.89.0, pointed at an invalid host so nothing was written, takes `--title "--repo=evil/x"`,
  `--title "--help"` and `--title "-R"` as the title value: the request still went to the configured host. Bodies go through
  `--body-file` and labels are literals. `jq --arg` and `grep -Fxq -f` read titles as data.

  Titles come from calendar entries, which are repository content. `findings()` refuses `\r` and `\n`, and `findingsJson` refuses
  more than 256 characters. File names from public pages are shown plain only when they match `PLAIN_NAME` and are otherwise
  percent-encoded (`fetch.ts`), so a page cannot inject a line or a workflow command. Nothing in notify or handoff echoes a title
  or body to the log. The check's new refusal messages print counts, not text.
- **TOCTOU between size check and read.** None. The bounded copy (`head -c MAX+1` into `findings.json`) is what both `wc` and
  `jq` read, and the extracted original is never read again. Each try starts with `rm -rf "$RUNNER_TEMP/findings"`, and no other
  process writes there. A missing artifact fails closed: real gh prints "no artifact matches any of the names or patterns
  provided" with rc 1, which leads to "check failing".
- **Upload-artifact pin: no new pin.** `actions/upload-artifact@cf430e03… # v7.0.2` is the repository's existing pin, used 9 more times
  in 6 other workflows, so #82's age floor does not apply. `actions:check --offline` passed. The step is exactly
  `{ name: findings, path, if-no-files-found: error, retention-days: 1, overwrite: true }`.
- **What the artifact exposes.** It is kept one day; `retention-90` gives 2 failed. It holds the findings file and nothing else
  (one path). The check job has no secret. The file holds what the issues and the run summary already hold publicly: calendar
  data, release numbers, public page addresses and percent-encoded file names (ADR 0071 Q1; the header test asserts that
  sentence). It contains no PHI and no fixture.
- **#86's value rule, not loosened.**
  - What the merge removes is only the over-limit exemption (`over`, `overAlone`, the "beside it" refusal and its cases,
    `FINDINGS_BYTES`, `FINDINGS`, the two findings rows) and T6's over-only assertions.
  - The removed ARG_MAX case was the marked-over one; the two unmarked total cases and every argument and string case are unchanged.
  - Restoring the old transport (`output-back`) gives 7 failed, including #86's own sum: "env.FINDINGS_B64: no bound for
    needs.check.outputs.findings, which no row of the table bounds". The rule refuses it outright now.
  - A new `$GITHUB_ENV` write in the check (`github-env`) gives 3 failed, so the closed file-command maps still hold content-calendar.
  - `sites` is kept for publish-content's release numbers, which is stricter than design §16.4 and correct.
- **Suites at HEAD:** install `--frozen-lockfile` ok; `workflows.test.ts` with `tools/content-calendar` 177/177; `actions:check
  --offline` ok.
- **Repository hygiene.** The diff names no model, and the fixture and synth change is RCC-08's assertion text only. The merge
  report says the amended merge commit was never pushed in its first form; nothing pushed was amended.

## Not in this lens, noted only
- ADR 0071 still holds the placeholder `<merge date, UTC>` twice. It is meant to be filled at merge.
