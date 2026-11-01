# Lane B: ci-findings-transport, design

The content calendar's findings reach `notify` as one environment string that Linux refuses past 131,072 bytes.
Branch `co-001/ci-findings-transport`, cut from `claude/build-platform` after #86 (`co-001/ci-images-digest`, head
83167b8f) merges. Written 2026-11-01 between 16:59 and 17:40 UTC by Lane B (session_01FcouKQ3BjYKaME5uBLn8Lz), its review folded the
same evening (§15), for
the item #86's design names (`/home/user/ops/designs/lane-b-ci/ci-images-digest.md`, §12 P3 :1092-1112, C7 :1013-1027).

Rulings it is taken under: the co-founder's of 2026-10-26, about 00:20 UTC ("Don't ask for approvals anymore just
build and optimize": every choice its recommended option, security the safer one, each recorded with its reason); his
ruling of 2026-10-25, about 21:34 UTC, on wording (`.claude/rules/brand.md`); the founder's standing rule (the best
option, never weighted by effort).

**No COUNTER REQUEST.** No ADR number, no test-matrix number and no migration. ADR 0071 takes an amendment section,
ADR 0066's Part 3 sentence (#86's `:982-983`) is rewritten, and RCC-08's assertion gains one clause (§8). CI-30 and
CI-31 are not taken (§9).

**No setting.** Nothing here changes a repository or Actions setting: job-level `permissions:` are in the workflow
file, and the artifact's retention (1 day) is inside every repository's allowed range (§4.2).

Line numbers are at 83d71fd6 unless marked `#86:`, which means at 83167b8f (`git show origin/co-001/ci-images-digest:<path>`).
#86 does not change `content-calendar.yml`, `tools/content-calendar/**`, ADR 0071 or `content-updates.md`
(`git diff --stat 83d71fd6 origin/co-001/ci-images-digest`: nine files, none of them).

---

## 1. Goal and acceptance

**Goal.** Whatever the calendar finds, the notify job receives every finding whole: so the 20 it opens carry their full
bodies and the "findings not filed" issue lists every other title. No value it reads can stop bash before it starts,
and a test holds the capacity property.

**Acceptance.**
- A1. No step of `content-calendar.yml` takes a value that can pass 131,072 bytes as one environment string. T6
  (#86: `workflows.test.ts:3213-3297`) has no content-calendar row (today's are `:3228-3240`), and the `over` field
  (#86: `:3197-3198`) is gone.
- A2. The property test (T-P, §6) passes. It requires that the worst-case findings file fits `MAX_FILE_BYTES`, that
  `MAX_FILE_BYTES` fits the transport, and that every issue notify writes fits GitHub's limits.
- A3. A local run of notify's own script with a findings file over 98,292 bytes, and with the exact worst case of
  1,540,660 bytes, starts bash, opens 20 issues and lists the other 21 titles (§7, done).
- A4. The check fails closed as before. A check stopped at a runtime bound (the file's bytes, or a title's length,
  a guard the calendar's 80-character entry titles keep unreachable today) still writes its summary naming every finding and exits with the CLI's status. A notify that cannot read the
  findings opens or comments on "Content calendar check failing".
- A5. Notify keeps its shape: no `uses:`, nothing checked out, no repository code, no `${{` in `run:`. Its
  permissions are exactly `{ actions: read, issues: write }`, and it makes one Actions call, the download (T-N). The
  new `handoff` job (pull requests only) has the same shape with `{ actions: read }` alone, and its download lines are
  notify's, word for word (T-H).
- A6. The first run of record is this item's own pull-request run, with `handoff` green: the real `gh run download`
  of a running run's artifact, on a runner, before the merge. The second is the merge's own `push` run, with check
  and notify both green and the `findings` artifact listed (§10).

---

## 2. The live code, re-read

**`.github/workflows/content-calendar.yml`**
- `:3-12`, the header. `:9-11` says the notify job "checks nothing out and runs no repository code, every value
  reaching its shell through env".
- `:18-32`, the triggers. A push to `claude/build-platform` touching `tools/content-calendar/**` or the workflow
  (`:23`, `:25`) runs both jobs. A pull request runs only the check (`:67`).
- `:45-46`, `check.outputs.findings: ${{ steps.calendar.outputs.findings }}`.
- `:54-60`, the calendar step (`id: calendar`) under `set -euo pipefail`. It runs `tsx tools/content-calendar/index.ts`
  (`:58`), then appends the summary (`:59`), then writes `findings=$(base64 -w0 findings.json)` to `$GITHUB_OUTPUT`
  (`:60`). Because of `-e`, a failed CLI skips `:59`, so the summary is lost exactly when it is needed.
- `:65-71`, notify: `needs: check`, `if: always() && github.event_name != 'pull_request'`, `timeout-minutes: 5`, and
  `permissions: issues: write` only.
- `:74-81`, env. `FINDINGS_B64: ${{ needs.check.outputs.findings }}` is at `:78`, and `MAX_OPENED: "20"` at `:81`.
- `:84`, `gh label create`. `:86`, `gh api --paginate` of the open `content-due` issues. `:94` and `:123`, `gh issue
  create`. `:96`, `gh issue comment`. `:133`, `gh issue close`.
- `:99-102`, the decode: `printf '%s' "$FINDINGS_B64" | base64 -d > findings.json || : > findings.json`, only when
  `CHECK_RESULT` is `success`.
- `:103-108`, the fail-closed check: anything that is not an array of `{title: string, body: string}` opens or comments
  on "Content calendar check failing" (fix round S8, `lane-b-release-content-checks.md:2305-2307`).
- `:109-135`, the filing loop: at most `MAX_OPENED` new titles, the rest in `unfiled.txt` and in "Content calendar:
  findings not filed" (SB-5).

**`tools/content-calendar/render.ts`**
- `:15`, `MAX_OPENED_PER_RUN = 20`. `:16`, `MAX_BODY = 6_000`, counted in UTF-16 units (`body.length`, `:43`, `:53`).
  `:17-18`, `MAX_FILE_BYTES = 700_000`, "its base64 stays under 1 MB".
- `:41-58`, `bounded()`. Its last resort `body.slice(0, MAX_BODY)` (`:57`) can split a surrogate pair.
- `:116-125`, `findings()`. It refuses a title with CR or LF, but it has no bound on a title's length or on the number
  of findings.
- `:127-135`, `findingsJson()`, two-space JSON plus a newline. It throws ``the findings file holds ${String(bytes)}
  bytes, over ${String(MAX_FILE_BYTES)}`` (`:132`): the numbers have no separators.
- `:137-149`, `summaryMarkdown()`: titles only.

**`tools/content-calendar/index.ts`**
- `:20`, exit 1 when "the findings pass the file's bound". `:24-31`, `CalendarRun`, whose test seams are `calendar`,
  `fetcher` and `sleep`.
- `:79-87`: `findings()` and `findingsJson()` share one `try`. The findings file is written (`:86`) before the
  summary (`:87`), so a refusal at the bound writes no summary.

**`packages/rules/src/calendar.ts` and `tools/content-calendar/fetch.ts`** (why the number of findings is bounded)
- `calendar.ts:15-29`: 13 `CONTENT_FAMILIES`. `:81-88`: the schema refuses a family in the calendar twice. `:38`: an
  entry's title is at most 80 characters.
- `contentDue()` (`calendar.ts:518-590`) yields: `no_release` (at most one), `calendar_unreviewed` (at most one),
  `calendar_review_due` (at most one per entry), and `familyDue` (at most one per entry; "One item per family at
  most", `:515`).
- `watchSources()` (`fetch.ts:195-229`) pushes at most one finding per entry.
- So a run has at most 2 + 3 × 13 = **41** findings. The true maximum is 40, since an entry is either reviewed or not;
  41 is the stated bound.

**`tools/content-calendar/content-calendar.test.ts:578-585`**: the file-bound test. It counts each finding as
`MAX_BODY + 60` bytes of ASCII (`:580`), and it asserts the base64 under 1,000,000 (`:584`), not under 131,072.

**`tools/test/workflows.test.ts` (#86)**
- `:13`, imports `MAX_FILE_BYTES` and `MAX_OPENED_PER_RUN` from `render.ts`.
- `:1130-1139`, `expectQuietNotify`. It pins `permissions` to exactly `{ issues: 'write' }` (`:1134`), no `uses:`
  (`:1135`), no `${{` in `run:` (`:1136`), no secret-like env, no `secrets.`. Release-capacity's notify uses it too
  (`:1292`).
- `:1156-1167`, the check job's test: `outputs` equal `{ findings: … }` (`:1166`).
- `:1173-1193`, `fakeGh`. `:1195`, `notifyStep`. `:1198-1204`, `runNotify`, which sets no `RUNNER_TEMP` and no
  `GITHUB_RUN_ID`. `:1205`, `b64`.
- `:1208-1266`, notify's three tests. They feed `FINDINGS_B64`.
- `:1752-1770`: every `actions/upload-artifact` step of every workflow sets `overwrite: true`.
- `:1911-1923`, T2's E2BIG pattern: assert `result.error` undefined first, then the environment's bytes under 131,072.
- `:3064`, T3 `unboundedValueProblems`. `:3194-3199`, `BoundedValue` with `over?: 'ci-findings-transport'`.
  `:3228-3240`, the two content-calendar rows. `:3307-3311`, the over assertions, `:3311` among them:
  `4 × ⌈700,000/3⌉ + 13 + 1 > 131,072`.

**Documents**
- ADR 0071: `:3-6` Status, `:7` Date, `:235-242` the workflow paragraph, ending "bounded at 700,000 bytes so its
  base64 fits a job output". `:250-256`, Q1, on what a public issue holds.
- ADR 0066 (#86: `:982-983`): "One listed value is over the limit and named so: the content calendar's findings
  (`FINDINGS_B64`). Their transport is an item of its own."
- `docs/runbooks/ci.md`: `:56` says each issue holds only public references. `:60` is the check row. `:61` is the
  notify row: "It alone holds `issues: write`, checks nothing out and runs no repository code". #86 changes `:123` and
  `:392`, not these lines.
- `docs/runbooks/content-updates.md`: `:20-21` covers notify. `:89`, the "Check failing" row, lists "findings past the
  file's bound".

**Today.** Every run has succeeded: 41315385814 (schedule, 2026-11-01 14:16 UTC, 83d71fd6), 41206542657,
41069380201, 40890577605, 40701931556, and push 40593100120 (`gh api …/workflows/content-calendar.yml/runs`, read
17:05 UTC). Check job 124874197660 logged "content-calendar: 16 findings on 2026-11-01". The 16 open `content-due`
issues hold 12,140 body characters in all (largest 1,699; longest title 84), so today's file is about 14 KB. The
defect is latent: the first day past 98,292 bytes files nothing.

---

## 3. The capacities, with numbers

Measured with Node 24 on `JSON.stringify(list, null, 2) + '\n'`, `render.ts:129`'s form (commands in §13).

| Quantity | Value |
| --- | --- |
| One environment string (`MAX_ARG_STRLEN`, #86 §2.2) | 131,072 bytes, name, `=` and NUL included |
| `FINDINGS_B64=` value at most | 131,058 bytes, so base64 of at most **98,292** file bytes (4 × 32,764 = 131,056) |
| `FINDINGS_B64_n=` value at most (option a) | 131,056 characters |
| Job outputs | 1 MB per job, "approximated based on UTF-16" (`github/docs data/reusables/actions/output-limitations.md:1`, read at 33b1f4a): 500,000 base64 characters, so **375,000** file bytes |
| JSON overhead (two-space form) | 39 bytes an entry, plus 2 between entries (`,` and a newline), plus 5 for the list (`[`, `]` and three newlines); an empty list is 3 (`[]` and a newline). Measured: lists of zero, one and two empty entries take 3, 44 and 85 bytes |
| Worst escaped unit | 6 bytes, the maximum over all 65,536 UTF-16 code units (measured, each unit alone): a control character (`\u0001`) or a lone surrogate (`\ud800`; well-formed `JSON.stringify` escapes it). A BMP letter takes 3, `"` and `\` take 2, a surrogate pair 4 for its 2 units |
| Worst entry (title 256 units, body 6,000 units, all `\u0001`) | **37,575** bytes (39 + 6 × 6,256); 37,577 with its separator |
| Worst file, 41 findings | **1,540,660** bytes = 5 + 41 × 37,575 + 40 × 2 |
| 20 worst findings alone | 751,543 bytes (5 + 20 × 37,575 + 19 × 2), over today's 700,000 bound and over 375,000 |
| 41 findings, 3-byte text | 771,172 bytes |
| 41 findings, ASCII bodies of 6,000 | 258,180 bytes |

**What follows.**
- **The 700,000 bound.** Today's bound cannot hold P3's 20 full findings in the escaped worst case
  (751,543 > 700,000). So the bound changes whatever the transport.
- **Job outputs.** Under the 1 MB limit, a job output holds ⌊375,000 / 37,577⌋ = 9 worst-case findings, or 59
  ASCII-bodied ones (#86's "about 60"). No transport through job outputs can carry 20 worst-case findings.
- **Can a body reach the worst case?** Its characters come from repository text, the calendar (each entry's title is
  at most 80 characters, with no character class), and source file names that are plain `[A-Za-z0-9._-]` or
  percent-encoded (ADR 0071 Q1). So 6 bytes a unit is not reachable today, and 3 is. The bound is still set at 6,
  because a byte bound has to be honest without an argument about content.

---

## 4. The candidates

### 4.1 Weighed

| | Capacity (file bytes) | Holds 41 worst? | 20 worst + titles? | Notify's privileges | New code in notify | T6 rows | Changes issue text |
| --- | --- | --- | --- | --- | --- | --- | --- |
| (a) `FINDINGS_B64_0` to `_3` | 375,000 (outputs, UTF-16) | no | no (9) | unchanged | none (bash joins four env values) | 8 | no |
| (b) artifact + `gh run download` | `MAX_FILE_BYTES`; no artifact cap found below storage | **yes** | **yes** | + `actions: read` | none (`gh` already runs, `:84-:133`) | 0 | no |
| (c) a body budget so the file fits one env (98,292) | 98,292 | only by cutting each body to about 2,397 bytes (about 400 worst-case units) | only by cutting | unchanged | none | 2 | **yes**, every body on a busy day |
| (d) check picks the 20, using an `issues: read` token | still job outputs, 375,000 | n/a | no (751,543 > 375,000), so it needs (a) too | unchanged; **check gains a token** | none | 2+ | no |
| (e) gzip + base64 in outputs | depends on the content: no honest bound | unknown | unknown | unchanged | `gunzip` | 2+ | no |
| (f) `actions/download-artifact` in notify | as (b) | yes | yes | **unchanged**: a same-run download uses the runner's runtime token; `github-token` has no default (pin `9000827c`, #86: `ci.yml:553`; `action.yml:23-27`, `src/download-artifact.ts:22`, `:66-75`) | **third-party Node code on the VM of the job holding `issues: write`**, before the step that uses it | 0 | no |
| (g) read check's log through the API | a log line; masking and timestamps | fragile | fragile | + `actions: read` | parsing | 0 | no |
| (h) `actions/cache` between jobs | n/a | n/a | n/a | needs `uses:` | an action | 0 | no |
| (i) fewer bytes a finding (compact JSON) | saves 16 of 41 overhead bytes an entry | no | no | unchanged | none | n/a | no |

### 4.2 The choice: (b), the run's own artifact, read with `gh`

- **Accuracy.** (b) is the only option that carries every finding whole in the worst case: 1,540,660 ≤
  `MAX_FILE_BYTES` = 2,000,000, with room for 53 worst-case findings, 17 families. Notify keeps its own dedupe and its
  20-a-run selection unchanged. (a), (c), (d) and (e) cannot hold P3 in the escaped worst case, and (c) would cut what
  an issue says.
- **Security.**
  - *Least privilege.* `actions: read` is the permission that listing and downloading artifacts with `GITHUB_TOKEN`
    takes. The REST description (`github/rest-api-description`, `api.github.com.json`, read 17:04 UTC) says of
    `GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}` that it "Gets a redirect URL … This
    URL expires after 1 minute", and it needs a token even on a public repository. GitHub's own example pairs
    `actions: read` with `issues: write` for this pattern (`github/docs
    content/actions/reference/workflows-and-actions/events-that-trigger-workflows.md:1253-1263`, at 33b1f4a). On this
    public repository, it reads only what any signed-in user can read: runs, jobs, logs, artifacts and workflow files.
    It writes nothing. Job-level `permissions:` replace the workflow's, so notify keeps `contents: none`.
  - *No new code where the write token is, at the price of `actions: read`.* (f) is the narrower on permissions: it
    adds none, since `actions/download-artifact` at the repository's pin reads the current run with the runner's
    runtime token when `github-token` is not given (`action.yml:23-27`: "If this is not specified, the action will
    attempt to download artifacts from the current repository and the current workflow run"; `src/download-artifact.ts`
    sets `findBy` with a token only `if (inputs.token)`, `:66-75`). (b) pays `actions: read` for something (f) cannot
    give: no third-party code on the VM of the job that writes issues. Under (f), Node code from outside the
    repository runs in notify before the step that holds `issues: write`, on the same VM, and could change what that
    step runs (a `gh` placed earlier on `PATH`, a changed file under `$HOME`). It would break notify's invariant (no
    action: #86 `expectQuietNotify`, `workflows.test.ts:1135`; `ci.md:61`; ADR 0071 `:235-236`), and put a new
    dependency inside the writing job, to audit and pin-age at every bump. `actions: read` on a public repository reads
    what any signed-in user can read and writes nothing; its reach grows only if the repository turns private, which
    ADR 0071's "Revisit when" now names (§8, R1). So the safer option is (b). Considered and refused: a download
    with no action and no Actions permission. A `run:` step never receives the runtime token: the runner hands
    `ACTIONS_RUNTIME_TOKEN` to a Node action's environment (`actions/runner` main
    `src/Runner.Worker/Handlers/NodeScriptActionHandler.cs:56-57`), and `ScriptHandler.cs` sets none.
  - *No token in the check.* (d) puts one in a job that runs `pnpm install`'s packages and fetches third-party pages.
  - *What the artifact discloses.* It is public to signed-in users for one day. It holds what the issues hold (ADR
    0071 Q1: calendar data, public page addresses, file names plain or percent-encoded, release numbers, commands).
    The only addition is the bodies of findings not yet filed, from the same generator. No new class of data.
  - *Untrusted bytes.* A subverted check could already hand on any text today. Notify still checks the file's shape
    (`:103`) and now also caps it at `MAX_FILE_BYTES` before `jq` reads it. `gh` extracts the zip under `safepaths`
    and skips any entry that would escape (`cli/cli` v2.103.2 `internal/zip/zip.go:19-31`), into a fresh
    `$RUNNER_TEMP/findings`.
  - *Fail closed.* No artifact, an expired one, a 403 or 404, a 5xx after three tries, a file over the cap, or a file
    that is not a list all leave `findings.json` empty. Notify then takes S8's path to "Content calendar check
    failing", with `gh`'s message in the log (proof §7, cases 3 and 4).
- **Reliability.**
  - *Available at once.* "Once uploaded, an Artifact ID is returned and Artifacts are immediately available in the UI
    and REST API. Previously, you would have to wait for the run to be completed" (`actions/toolkit
    packages/artifact/README.md:29`). Notify starts only after check completes, so after the upload step's finalize.
    The toolkit's own public download path is that REST path: `downloadArtifactPublic`
    (`packages/artifact/src/internal/download/download-artifact.ts:176`, main, read 2026-11-01) calls
    `api.rest.actions.downloadArtifact` (`:193`), the zip endpoint `gh` uses. That is source and documentation, not a
    runner observation, so the `handoff` job (c1) proves it on a runner on every calendar pull request, this item's
    own first (§10). That closes #86's P3 open question ("Whether a running run's own v4 artifact downloads through
    the API is not verified") before the merge.
  - *How `gh` reads it.* The runner image ships GitHub CLI 2.103.2 (`actions/runner-images`
    `images/ubuntu/Ubuntu2604-Readme.md:101`, main, read 2026-11-01). `gh run download <run-id>` lists
    `repos/{o}/{r}/actions/runs/{id}/artifacts` (`pkg/cmd/run/shared/artifacts.go:23-60`), setting only `per_page`. It
    skips expired artifacts, keeps the first artifact of each name (`pkg/cmd/run/download/download.go:156-168`),
    downloads the zip and extracts it (`http.go:31-78`). With one `-n`, it extracts into `-D` itself
    (`download.go:215-232`). The four files cited (`download.go`, `http.go`, `shared/artifacts.go`,
    `internal/zip/zip.go`) are byte-identical at v2.103.2 and v2.103.3 (SHA-256 prefixes `b0952b62bb63`,
    `0f27d058326a`, `38007fba8e3a`, `df031ac59515` at both tags), so the lines cited hold for both. What notify relies
    on is that behaviour, not the version: a later `gh` on the image that changed it would show in `handoff` on the
    next calendar pull request, or fail closed in notify (R3).
  - *Transient failures.* Three tries, 10 s apart, so a transient API failure does not open a false "check failing"
    issue.
- **Re-runs and names.**
  - The artifact is named `findings` with `overwrite: true`, which the repository already requires of every upload
    (#86: `workflows.test.ts:1752-1770`). `actions/upload-artifact`'s `action.yml` at the pin: "If true, an artifact
    with a matching name will be deleted before a new one is uploaded".
  - A re-run of all jobs replaces the artifact. A re-run of notify alone reads the first attempt's artifact while it
    lives, as it reads that attempt's outputs today. After a day the artifact has expired, and notify fails closed.
  - If `overwrite` ever left an earlier attempt's `findings` beside the new one, notify still reads the newest: `gh`
    sends no `direction`, the list endpoint's `direction` defaults to `desc` (`api.github.com.json`,
    `components.parameters.direction`, on `actions/list-workflow-run-artifacts`), and `gh` keeps the first of each
    name. A run can list more than one artifact of a name (the toolkit's `filterLatest`,
    `packages/artifact/src/internal/find/list-artifacts.ts:172-186`, sorts by ID itself to keep one). The description
    gives the default direction but not its sort key, so the guarantee is `overwrite: true`, and the order a backstop.
  - `GITHUB_RUN_ID` is the same in every attempt.
- **Retention.** `retention-days: 1`, the minimum ("Minimum 1 day", the pin's `action.yml`; public repositories allow
  1 to 90, `data/reusables/actions/about-artifact-log-retention.md:15`). No setting changes.
- **Cost.** About 14 KB today, at most 2 MB, for one day. Free on a public repository. One upload step of a few
  seconds, and about 6 a month of the check's 450 standard minutes once private (ADR 0071 Q2). `handoff` runs only
  on calendar pull requests, about one billed minute each once private, with no install.
- **Maintainability.** T6 loses both content-calendar rows and the `over` field. Notify's script changes in two
  places (the download block and the "not filed" cap), and the download block exists once in text for two jobs,
  held equal by T-H. No new pin: the upload reuses `actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2`
  (#86: `ci.yml:480`, `:573`, and five other workflows), so #82's three-day floor for a new pin does not apply.
- **The pull request runs the upload too**, fork pull requests included (the runtime token, no permission), and the
  `handoff` job then downloads it with `gh` exactly as notify will (a fork's read-only token still carries `actions:
  read`). That proves the whole hand-over on this item's own pull request before the merge, and on every later
  calendar pull request; the artifact holds only that branch's findings.

**Why the others lose**, in one line each:
- (a) caps at 9 worst-case findings and adds eight T6 rows.
- (c) changes what every issue says on a busy day.
- (d) needs (a) anyway and puts a token beside third-party code.
- (e) has no honest bound.
- (f) adds no permission, but puts third-party Node code on the VM of the writing job, before the step that writes.
- (g) parses logs, which are no contract.
- (h) needs `uses:`.
- (i) saves 0.04 % of the worst case.

---

## 5. What changes, per file

### c1. `.github/workflows/content-calendar.yml`

**The header**, from "The check job only reads" (`:8`) to the end (`:12`), becomes (it keeps the public-data sentence, now naming every public output, and the last
line names the new job):

> The check job only reads (contents: read, no secrets) and uploads its findings as this run's own artifact, kept one
> day; the notify job alone writes issues, with the job's own token, reads only that artifact (actions: read), checks
> nothing out and runs no repository code, every value reaching its shell through env or that artifact. Issues, the
> check's summary and its one-day findings artifact hold only calendar data, release numbers, public page addresses
> and file names seen on those pages, plain or percent-encoded (docs/adr/0071). A pull request runs the check and the
> handoff job, which downloads the artifact as notify would and writes nothing. Not a required check.

**The check job.**
- Delete `:45-46` (`outputs:`) and `id: calendar` (nothing reads them).
- The step's script becomes the following. The runner starts it as `bash -e -o pipefail`, and `|| status=$?` keeps `-e`
  from stopping before the summary. It also logs the file's size and SHA-256, which `handoff` logs again after the
  download, so a pull-request run shows the hand-over byte for byte.

```yaml
      - name: Read the calendar and the content
        run: |
          set -euo pipefail
          status=0
          pnpm exec tsx tools/content-calendar/index.ts --today "$(date -u +%F)" --out "$RUNNER_TEMP/findings.json" --summary "$RUNNER_TEMP/summary.md" || status=$?
          # The summary names every finding, also when the check stopped at a bound (index.ts writes it first).
          if [ -f "$RUNNER_TEMP/summary.md" ]; then cat "$RUNNER_TEMP/summary.md" >> "$GITHUB_STEP_SUMMARY"; fi
          if [ -f "$RUNNER_TEMP/findings.json" ]; then printf 'content-calendar: the findings file holds %s bytes, SHA-256 %s\n' "$(wc -c < "$RUNNER_TEMP/findings.json" | tr -d ' ')" "$(sha256sum "$RUNNER_TEMP/findings.json" | cut -d ' ' -f 1)"; fi
          exit "$status"
      # The findings, every one whole, as this run's own artifact: the notify job reads it with gh (docs/adr/0071).
      - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
        with:
          name: findings
          path: ${{ runner.temp }}/findings.json
          if-no-files-found: error
          retention-days: 1
          overwrite: true
```

`archive` stays at its default, `true`: the download endpoint serves only `zip` (REST description, above), and `gh`
reads a zip (`http.go:57`). `compression-level` stays at 6, since JSON compresses well and the file is small.

**The download block**, shared word for word by notify and handoff between its two marker lines (T-H holds them
equal). It replaces notify's `:99-102` (from `: > findings.json` through the decode's `fi`). Proof §7 runs exactly
these lines, as `work/proposed-notify.sh:17-36` and `work/proposed-handoff.sh:2-21` (SHA-256 `beb9ab0f…d37c` and
`5c850d4e…1790`), indented here by ten spaces:

```bash
          # The download, word for word in the notify and the handoff job (tools/test/workflows.test.ts holds the two equal).
          # The findings the check uploaded, this run's own artifact (docs/adr/0071), in three tries DOWNLOAD_PAUSE seconds
          # apart, gh's error each time in the log; at most MAX_FILE_BYTES, as the check bounds it, or no findings list.
          : > findings.json
          downloaded=false
          if [ "$CHECK_RESULT" = "success" ]; then
            for try in 1 2 3; do
              rm -rf "$RUNNER_TEMP/findings"
              if gh run download "$GITHUB_RUN_ID" -n findings -D "$RUNNER_TEMP/findings"; then
                downloaded=true
                break
              fi
              if [ "$try" -lt 3 ]; then sleep "$DOWNLOAD_PAUSE"; fi
            done
          fi
          if [ "$downloaded" = true ]; then
            head -c "$((MAX_FILE_BYTES + 1))" "$RUNNER_TEMP/findings/findings.json" > findings.json 2>/dev/null || : > findings.json
            [ "$(wc -c < findings.json)" -le "$MAX_FILE_BYTES" ] || : > findings.json
          fi
          # End of the download.
```

`GITHUB_RUN_ID` and `RUNNER_TEMP` are the runner's default variables, so no expression enters the script. `GH_REPO`
selects the repository for `gh run download` as it does for `gh api`.

**The notify job.**
- `permissions:` becomes `{ actions: read, issues: write }`.
- The comment at `:62-64` gains: "It reads the findings from the run's own `findings` artifact, which a step's
  environment could not carry (one string stops at 131,072 bytes)."
- Env: delete `FINDINGS_B64` (`:78`), and add three literals:

```yaml
          # tools/content-calendar/render.ts, MAX_FILE_BYTES.
          MAX_FILE_BYTES: "2000000"
          # Seconds between the three tries to download the findings.
          DOWNLOAD_PAUSE: "10"
          # The most titles the "findings not filed" issue lists, so its body stays under GitHub's 65,536 characters.
          MAX_LISTED: "200"
```

- `:99-102` becomes the download block above. `:103-127` do not change.
- The "findings not filed" body (`:128`) lists at most `MAX_LISTED` titles, then one line naming how many more, so its
  size no longer rests on how many findings a run has (§6, T-P). Proof §7 runs it:

```bash
            unfiled=$(wc -l < unfiled.txt | tr -d ' ')
            # At most MAX_LISTED titles, so the body stays under GitHub's 65,536 characters whatever the count.
            {
              printf 'A run opens at most %s new issues. These %s findings were not filed by %s; a later run files them:\n\n' "$MAX_OPENED" "$unfiled" "$RUN_URL"
              head -n "$MAX_LISTED" unfiled.txt
              if [ "$unfiled" -gt "$MAX_LISTED" ]; then printf -- '- and %s more, each named in the run'"'"'s summary\n' "$((unfiled - MAX_LISTED))"; fi
            } > body.md
```

  At today's bound a run never reaches it (at most 21 unfiled, §2); it is there so the body's limit holds by
  construction, not by the count argument alone. 200 × 259 + 150 + 60 = 52,010 ≤ 65,536. The visible change, a
  closing "- and N more, each named in the run's summary" line past 200, is plain wording under brand.md and is
  reported (§8, Issue text).

**The new `handoff` job**, written in the file between `check` and `notify` (the jobs list at #86 `:1153` is held in
YAML order; CI-10's table at `:2734` names its 5 minutes, §6). It is the only way to exercise notify's download on a runner without
writing an issue: workflow permissions cannot depend on the event, so notify itself cannot run on a pull request
without `issues: write`.

```yaml
  # On a pull request, the hand-over the notify job depends on, proved on a runner without writing anything: this run's
  # findings artifact downloads with gh and reads as a findings list, as the notify job reads it (docs/adr/0071).
  handoff:
    needs: check
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-26.04
    timeout-minutes: 5
    permissions:
      actions: read
    steps:
      - name: Download the findings as the notify job does
        env:
          GH_TOKEN: ${{ github.token }}
          GH_REPO: ${{ github.repository }}
          CHECK_RESULT: ${{ needs.check.result }}
          # tools/content-calendar/render.ts, MAX_FILE_BYTES.
          MAX_FILE_BYTES: "2000000"
          # Seconds between the three tries to download the findings.
          DOWNLOAD_PAUSE: "10"
        run: |
          set -euo pipefail
          <the download block>
          if ! jq -e 'type == "array" and all(.[]; (.title | type) == "string" and (.body | type) == "string")' findings.json > /dev/null 2>&1; then
            printf 'content-calendar: the notify job could not read this run'"'"'s findings (the check: %s)\n' "$CHECK_RESULT" >&2
            exit 1
          fi
          printf 'content-calendar: the notify job reads %s findings, %s bytes, SHA-256 %s\n' "$(jq length findings.json)" "$(wc -c < findings.json | tr -d ' ')" "$(sha256sum findings.json | cut -d ' ' -f 1)"
```

- `if:` without `always()` runs it only when check succeeded; a failed check is already red on the pull request.
  Its paths are the workflow's own `pull_request` paths, the same as the check's.
- It logs only the count, the size and the SHA-256, never a title or a body. It checks nothing out, runs no action
  and no repository code, holds no `issues` or `contents` permission (job-level `permissions:` replace the workflow's
  `contents: read`), and a fork's read-only token suffices. Its three expressions are notify's own forms, which T3
  already admits.
- It is not a required check, like the rest of the workflow. A red `handoff` on a calendar pull request means notify
  would fail closed on the push: fix it before merging.

### c2. `tools/content-calendar/render.ts`

- **The doc comment** (`:5-12`): "…the file at most MAX_FILE_BYTES, every finding whole even at its worst (each
  character escaped as six bytes), handed to the notify job as the run's own artifact."
- **New constants**, beside `MAX_BODY`:
  - `export const MAX_TITLE = 256;` "GitHub refuses a longer issue title, and the title is the dedupe key." Today's
    longest possible title is about 145 characters (`Content due: <80-character entry title>, loaded content ends within
    45 days (<date>)` is 141).
  - `export const FINDINGS_PER_FAMILY = 3;` "Per family at most its review, its due item and its source's
    (content-calendar.test.ts holds each to one)." and `export const MAX_FINDINGS = 2 + FINDINGS_PER_FAMILY *
    CONTENT_FAMILIES.length;` (41) "The most findings a run has: the calendar's two of its own and three per family.
    A bound the tests hold, not one checked at run time: the file's byte bound is." It imports `CONTENT_FAMILIES`
    from `@tp/rules/calendar`, the subpath `render.ts` already imports from, so the placement rule of ADR 0071 holds.
- **`MAX_FILE_BYTES = 2_000_000`.** The doc says: "The findings file's bound in bytes: MAX_FINDINGS findings at their
  worst (a 256-unit title and a 6,000-unit body, each unit escaped as six bytes) take 1,540,660; the notify job
  downloads the file as an artifact and refuses one over this bound too."
- **`findings()`** (`:116-125`) does not change: its one refusal, a title that is not one line, stays before the
  summary as today (a multi-line title would break the summary's list). It gets no count refusal. A runtime throw on
  the count would turn a run the transport can carry (42 realistic findings are about 260 KB of the 2,000,000 bound)
  into "check failing" with nothing filed, and it guards nothing the byte bound misses. The count is held at test
  time instead, structurally (§6, T-K).
- **`findingsJson(list, maxBytes = MAX_FILE_BYTES)`** holds the runtime refusals, both after the summary (c3):
  - a title over `MAX_TITLE` units: ``a finding's title is ${String(n)} characters, over ${String(MAX_TITLE)}``. A
    guard, unreachable from the CLI today: the schema, checked first (`index.ts:55-60`), caps an entry's title at 80
    (`calendar.ts:38`), so a finding title is at most about 145. It holds the byte formula's `MAX_TITLE` term if a
    later finding kind or a schema change lengthens titles; T-R tests it as a unit (§6);
  - the file over `maxBytes`, as today against `MAX_FILE_BYTES`.
  The messages keep `String()`, with no separators. These two bounds are what make §6's byte property a check, not
  an argument, whatever the count.
- **`bounded()`'s last resort** (`:57`): `body.slice(0, MAX_BODY)` drops a high surrogate left last
  (`/[\uD800-\uDBFF]$/`). Otherwise a cut could leave a lone surrogate, which JSON escapes as 6 bytes and which an
  issue shows as a replacement character.

### c3. `tools/content-calendar/index.ts`

- `CalendarRun` gains `readonly maxFileBytes?: number;` ("the findings file's bound, MAX_FILE_BYTES unless given;
  tests make it small"), beside the existing seams.
- `:77-87` becomes: `findings()` in its `try` (exit 1 on its one refusal, a title that is not one line, as today).
  Then `writeFileSync(summary, summaryMarkdown(list, today))`. Then `findingsJson(list, run.maxFileBytes)` in a
  second `try`, which on refusal (the file's bytes, or a title's length, which the schema keeps unreachable today,
  c2) prints `content-calendar: <message>` and
  returns 1 with no `--out` written. Then `writeFileSync(out, text)`.
- The doc (`:20`) gains: "the summary is written first, so a check stopped at a title's length or the file's bound
  still names every finding."

### c4. Tests: `tools/content-calendar/content-calendar.test.ts` and `tools/test/workflows.test.ts`

See §6.

---

## 6. Tests, failing first

All synthetic: titles like `Finding 7`, bodies of `x` or `\u0001`. No data of any kind (CLAUDE.md, "Never").

**`content-calendar.test.ts`**
- **T-K, the count, held structurally** (fast-check, already a root dev dependency and used under `tools/`, e.g.
  `tools/check-licenses/check.test.ts`): "a run has at most MAX_FINDINGS findings: two of the calendar's own and, per
  family, one review, one due item and one source finding (ci-findings-transport)".
  - Arbitraries: a calendar of 1 to 13 entries drawn from `CONTENT_CALENDAR` (families unique, as the schema
    requires), each `review` null or an arbitrary date; `DueSources` with `releaseNo` null or 1 to 5, and `inForce`
    and `pending` mapping each content of those entries to absent or an arbitrary `ContentState` (windows, newest
    start and retrieval dates); `today` an arbitrary date from 2025 to 2030; a stand-in fetcher answering each page
    with null (unreachable) or a page listing arbitrary file names, some matching the entry's pattern, and each
    entry's `knownFiles` null or an arbitrary subset.
  - It runs the real generators, `contentDue` and `watchSources` (with `sleep` a no-op), and asserts: at most one
    item with `family === null` of each of `no_release` and `calendar_unreviewed`, so at most 2; per family at most
    one `calendar_review_due`, at most one other due item, and at most one source finding (`finding.entry.family`);
    so `FINDINGS_PER_FAMILY` is 3 and `findings(...).length <= MAX_FINDINGS`.
  - A new kind of finding per entry then fails here in the pull request that adds it (a second due item or source
    finding for one family), and must either reuse a slot or raise `FINDINGS_PER_FAMILY`, which moves `MAX_FINDINGS`
    and so T-P's byte proof in the same pull request. A property test reaches a branch only by generation, so the
    runtime byte bound stays the fallback (R5).
- **T-P, the bytes** (replaces `:578-585`): "every finding reaches the notify job whole, and every issue it writes
  fits GitHub's limits (ci-findings-transport)".
  - The worst unit is computed, not assumed: `Math.max` over all 65,536 `String.fromCharCode(c)` of
    `Buffer.byteLength(JSON.stringify(s)) - 2` equals 6, and `'\u{1F600}'` measures 4 bytes for its 2 units.
  - The worst file is `findingsJson(Array.from({ length: MAX_FINDINGS }, () => ({ title: '\u0001'.repeat(MAX_TITLE), body: '\u0001'.repeat(MAX_BODY) })))`
    (`findingsJson` has no duplicate-title rule, so equal full-length titles are valid input). It does not throw,
    and `Buffer.byteLength` of it equals `5 + MAX_FINDINGS * (39 + worstUnit * (MAX_TITLE + MAX_BODY)) + 2 *
    (MAX_FINDINGS - 1)`, which equals 1,540,660 and is at most `MAX_FILE_BYTES`. A change to the JSON form or to any
    constant then fails on the formula, not only on a number.
  - **P3, stated as #86 wrote it.** `MAX_OPENED_PER_RUN` worst entries plus the other `MAX_FINDINGS −
    MAX_OPENED_PER_RUN`, whole, fit `MAX_FILE_BYTES`: the same worst file. The file holds the rest whole too, so their
    titles are a fortiori inside. The transport's capacity is `MAX_FILE_BYTES` itself, since an artifact has no
    smaller cap: the README names only 500 artifacts a job and the storage quota (`actions/upload-artifact` README,
    "Number of Artifacts").
  - **What notify writes.**
    - An opened body is `MAX_BODY` + `'\n\n\nOpened by the content-calendar workflow: '.length` (44, the `jq -r`
      newline included) + a 100-character run URL ≤ 65,536.
    - The "not filed" body is its 150-character header + `MAX_LISTED` × (`MAX_TITLE` + 3) + its 60-character last
      line ≤ 65,536 (52,010), whatever the count. `MAX_LISTED` is read from the workflow's notify env and held equal
      to the test's constant 200.
    - Every title is ≤ 256 (`MAX_TITLE`).
    - The check step's summary fits GitHub's per-step limit: `Buffer.byteLength(summaryMarkdown(list, '2026-11-01'))`
      of `MAX_FINDINGS` titles of `MAX_TITLE` units each, every unit `'\u0800'` (3 bytes in UTF-8, the most a UTF-16
      unit takes: a lone surrogate encodes as the 3-byte replacement, a pair as 4 for 2), is at most 1,048,576. It
      measures 31,794 (Node 24), about 33 times under. The limit is documented: "each step is restricted to a
      maximum size of 1MiB … If more than 1MiB of content is added for a step, then the upload for the step will
      fail and an error annotation will be created. Upload failures for job summaries do not affect the overall
      status of a step or a job" (`github/docs content/actions/reference/workflows-and-actions/workflow-commands.md:933-935`,
      "Step isolation and limits", at 33b1f4a). So past it the titles would be lost from the summary, not the run:
      the bound matters because the "not filed" issue sends the reader to the summary for titles past `MAX_LISTED`.
    - 65,536 and 256 are GitHub's API refusals ("body is too long (maximum is 65536 characters)", "title is too
      long"). They are written as constants with that note.
  - **Why the old transport failed.** A comment line and one assertion: `4 × ⌈98,293 / 3⌉ + 'FINDINGS_B64='.length + 1
    > 131,072`. It keeps #86's `:3311` arithmetic where the bound now lives.
- **T-R, the refusals.**
  - `findingsJson(list, 100)` throws `RangeError` with ``over 100``, and `findingsJson` of a list one byte over
    `MAX_FILE_BYTES` throws ``over 2000000``. The message is `String()`, with no separators (#86 review N7).
  - `findingsJson` refuses a 257-unit title with its message, and admits a 256-unit one. This unit case is the only
    test of the title bound: the CLI cannot reach it (T-O).
  - `findings()` still refuses a two-line title, and refuses no count.
- **T-O, the order.** `run(['--today', …, '--no-fetch'], calendar)` with `maxFileBytes: 100` returns code 1, its
  summary names every finding (`- Content due: …`), `findings.json` does not exist, and the error is exactly
  ``content-calendar: the findings file holds ${String(n)} bytes, over 100\n``. The helper at `:489-508` passes
  `maxFileBytes` through.
  - No end-to-end title case. `runContentCalendar` checks the calendar's schema first (`index.ts:55-60`), and the
    schema caps an entry's title at 80 (`calendar.ts:38`, `z.string().min(3).max(80)`); every finding title is an
    entry title plus fixed text (at most about 145, c2), so a 257-unit title cannot reach `findingsJson` through the
    CLI and such a calendar exits 1 at the schema with no summary. The title bound is a guard, held by T-R's unit
    case; its order is the byte case's, since both refusals are the one `findingsJson` call in the same `try` after
    the summary (c3). No seam (such as a `findingsFor` override on `CalendarRun`) is added only to reach it: that
    would be production surface for a test of an unreachable branch.
- **T-S, the surrogate cut.** A body of 6,001 units that ends in pairs, with no cuttable line, comes back at most
  `MAX_BODY` units with no lone surrogate (`/[\uD800-\uDBFF]$/` fails).

**`workflows.test.ts` (on #86's text)**
- **`expectQuietNotify(name, needs, condition, permissions = { issues: 'write' })`.** Content-calendar passes
  `{ actions: 'read', issues: 'write' }`, and release-capacity (`:1292`) keeps the default. The other four assertions
  do not change.
- **The jobs.** `Object.keys(calendar.jobs)` (#86 `:1153`) becomes `['check', 'handoff', 'notify']`. That list is
  in YAML order, so `handoff` sits between `check` and `notify` in the file (c1).
- **The CI-10 timeout table** (#86 `:2724-2746`, `job timeouts (CI-10)`, "give every job of every workflow the timeout
  its table names"). It builds every job's `timeout-minutes` of every workflow and holds the whole map with
  `toEqual`, so a new job turns it red until the table names it. The row at `:2734` becomes
  `'content-calendar.yml': { check: 15, handoff: 5, notify: 5 },` and its comment at `:2733` becomes "The daily
  calendar check, its one issues call, and on a pull request the hand-over proof (docs/adr/0071)." (`toEqual` ignores
  key order; the row is written in file order to match the jobs list.) The test-matrix CI-10 row
  (`test-matrix.md:276`, "Every job of every workflow has the timeout its table names") already covers it, so no
  row and no number is taken.
- **T-N, notify's single Actions call.** The script's `gh` calls outside `gh api …/issues`, `gh label` and `gh issue`
  are exactly one line, `gh run download "$GITHUB_RUN_ID" -n findings -D "$RUNNER_TEMP/findings"`. The env has
  `MAX_FILE_BYTES === String(MAX_FILE_BYTES)`, `DOWNLOAD_PAUSE === '10'` and `MAX_LISTED === '200'`, and no
  `FINDINGS_B64`.
- **T-H, the handoff job.** `needs: 'check'`, `if: "github.event_name == 'pull_request'"`, `permissions` exactly
  `{ actions: 'read' }`, `timeout-minutes: 5`, one step, no `uses:`, no `${{` in `run:`, no `secrets.`, env keys
  exactly `GH_TOKEN, GH_REPO, CHECK_RESULT, MAX_FILE_BYTES, DOWNLOAD_PAUSE`, with the two literals equal to notify's.
  - The download block: the lines from `# The download, word for word` to `# End of the download.` are found once in
    each job's script and are equal (one extraction function for both).
  - Its script has no `gh issue`, `gh label` or `gh api` call: the one `gh` line is the download.
  - Run as the runner runs it, through the fake: a valid artifact exits 0 and prints the count, the byte size and
    the SHA-256 of the file staged; no artifact, a file over `MAX_FILE_BYTES` and `{"title":"x"}` each exit 1 with
    the message on stderr; the fake's log has no issue call in any case.
- **The check job's test** (`:1156-1167`) is renamed "…and uploads its findings as the run's own artifact".
  - `check.outputs` is undefined.
  - The last step equals `{ uses: pinOf('actions/upload-artifact'), with: { name: 'findings', path: '${{ runner.temp }}/findings.json', 'if-no-files-found': 'error', 'retention-days': 1, overwrite: true } }`.
  - The calendar step comes directly before it.
- **T-C, the check step as the runner runs it.** `runScript` of the step with a stand-in `pnpm` on `PATH`, three
  cases:
  - (i) it writes the summary and exits 1: the step exits 1, and `GITHUB_STEP_SUMMARY` holds the summary;
  - (ii) it exits 2 with no summary: the step exits 2, the summary file is empty, and no `cat` error;
  - (iii) it exits 0 with a findings file: the step exits 0, with the summary appended and the log line naming the
    file's size and SHA-256.
- **`fakeGh` gains `run download`.**
  - It copies `$FAKE_DIR/fake/findings.json` to `<-D>/findings.json`. When that is absent, it prints "no valid
    artifacts found to download" and exits 1.
  - A `fake/fail` counter fails that many tries first.
  - Its fixtures stay under `fake/`. The script's working directory must not be the fake's, because `: >
    findings.json` would truncate it (found while proving, §7).
- **`runNotify`** adds `RUNNER_TEMP` (a fresh directory), `GITHUB_RUN_ID: '1'` and `DOWNLOAD_PAUSE: '0'`. It takes
  `findings: string | null`, staged as the fake's artifact, and `b64` becomes `json`.
  - Its env comes from **`notifyEnv(step, findings)`**, modelled on #86's `identityEnv` (`:1875-1889`): the
    literals as written, and each expression form the step has mapped to the runner's value: `${{ github.token }}`,
    `${{ github.repository }}`, `${{ needs.check.result }}` (the case's result), the `RUN_URL` form, and
    `${{ needs.check.outputs.findings }}` to the base64 of the same file. Any other form throws ("a form this
    emulator does not know"). In commit 2 the step has no findings expression, so the mapping is unused and the
    harness is unchanged; any future `${{ }}` env value it does not know fails the tests, so a large value cannot
    creep back in unnoticed.
- **Notify's three tests** (`:1208-1266`) keep every expectation, fed through the fake.
  - S8's six cases become:
    - `failure` with no artifact;
    - `cancelled` with one (and notify must not download);
    - `success` with no artifact;
    - `success` with `!!not json!!`;
    - `success` with `{"title":"x"}`;
    - `success` with `[{"title":"x"}]`.
  - Added cases:
    - a file over `MAX_FILE_BYTES` (env `MAX_FILE_BYTES: '100'`), which goes to "check failing";
    - two failed tries then success, which files the finding;
    - three failed tries, which goes to "check failing";
    - 400 short findings: 20 opened, the "not filed" body lists 200 titles and ends "- and 180 more, each named in
      the run's summary".
  - The log shows the download only when `CHECK_RESULT` is `success`.
- **T-E, the E2BIG proof** (#86 T2's pattern, `:1916-1921`). `runNotify` with the 98,293-byte file and with the
  worst 41-finding file (1,540,660 bytes).
  - `result.error` is undefined first (`runScript` asserts it, `:276`): bash started.
  - The environment's bytes are under 131,072. The longest string is 53 bytes.
  - 20 creates, then "Content calendar: findings not filed" listing 21 titles.
  - Its name cites the 98,292-byte edge and #86 T6's `over` row.
- **T6.**
  - Delete the rows at `:3228-3240`, `over?` at `:3197-3198` and its doc line, and `:3307-3311`.
  - In their place: "No row is over the limit: the content calendar hands its findings on as the run's own artifact
    (ci-findings-transport)". This asserts that `content-calendar.yml`'s jobs declare no `outputs`, and that no
    workflow file contains `FINDINGS_B64`.
  - T3 finds no content-calendar value over a bound, so the set equality at `:3302` holds with the two rows gone;
    handoff's three expressions are notify's forms.
  - `runner.temp` in `with:` is admitted (#86: `:3159`).
- **The header.** One assertion that the workflow's header names "one-day findings artifact" among what holds only
  public data, so the sentence cannot drift from the upload step.

**Failing first.** Commit 1 adds T-K, T-P, T-R, T-O, T-S, T-C, T-N, T-H, T-E, `notifyEnv` and the new fake and T6
assertions against the unchanged code. Each fails for its own reason:
- T-K and T-P: `FINDINGS_PER_FAMILY`, `MAX_FINDINGS` and `MAX_TITLE` are undefined, and 1,540,660 > 700,000;
- T-O: no summary;
- T-C: step (i)'s summary is lost under `-e`;
- T-N, T-H, the jobs list and the check test: `FINDINGS_B64`, `outputs`, the permissions and no `handoff`;
- CI-10's timeout table: its row names `handoff: 5`, which the unchanged workflow lacks;
- T-E: on the 98,293-byte file, bash does not start (E2BIG): `notifyEnv` resolves `FINDINGS_B64` to a 131,074-byte
  string, as #42's job met it and as §7's case 1 shows. That is the defect itself;
- T6: its rows are still found.

Commit 2 makes c1 to c3, and commit 3 the documents. `pnpm test`, `pnpm typecheck` and `pnpm lint` run after each
(§11).

---

## 7. Local proof (done, 17:10 UTC; re-run 2026-11-01 after the review's fold)

`designs/lane-b-ci/ci-findings-transport/proof/scripts/prove.mjs` (SHA-256 `23394532…34ec`), run as
`node proof/scripts/prove.mjs proof/work`. It writes `proof/local-proof.txt` (SHA-256 `2e279a22…ed74`). It runs
`work/proposed-notify.sh` (`beb9ab0f…d37c`) and `work/proposed-handoff.sh` (`5c850d4e…1790`), whose download lines
are §5's block. The script starts each step as the runner does (`bash --noprofile --norc -e -o pipefail <file>`),
with a stand-in `gh`. It uses synthetic data only. Results:

| Case | Result |
| --- | --- |
| Base notify (83d71fd6 `:78`), file of 98,292 B, `FINDINGS_B64=` string 131,070 B | started, one issue |
| Base notify, file of 98,293 B, string 131,074 B | **bash did not start, E2BIG** |
| Proposed notify, the exact worst case: 41 full-length findings at 6 B a unit, file 1,540,660 B | exit 0; 20 issues + "not filed" with 21 titles (5,581 chars); environment 346 B, longest string 53 B |
| Proposed, a near-worst file (2-digit title prefixes), 1,540,045 B | the same |
| Proposed, 41 ASCII findings, 248,084 B | exit 0; 20 + "not filed" with 21 titles |
| Proposed, 98,293 B (one body, transport only) | exit 0; filed |
| Proposed, 400 short findings (21,093 B) | exit 0; 20 + "not filed" listing 200 titles (2,911 chars), last line "- and 180 more, each named in the run's summary" |
| No artifact; check `failure`; file over `MAX_FILE_BYTES`; not a list | each "check failing" (downloads 3, 0, 1, 1) |
| Two failed tries, then success; three failed tries | filed; "check failing" |
| Handoff: the download block equal in both scripts | true (20 lines) |
| Handoff, the exact worst case | exit 0; "the notify job reads 41 findings, 1540660 bytes, SHA-256 dde573f4…"; no issue call |
| Handoff: no artifact; file over `MAX_FILE_BYTES`; not a list | each exit 1 (downloads 3, 1, 1); no issue call |

What it does not show: the real artifact service. A stand-in `gh` copies a file; that `gh run download` reads a
running run's artifact on a runner is shown by `handoff` on the pull request (§10).

---

## 8. Documents

The amendment's date is the builder's to fill: `<merge date, UTC>` below is replaced with the UTC date of the merge
commit (YYYY-MM-DD) before the merge (§11 step 7); the literal never ships.

**ADR 0071**
- `:3`, Status: append "Amended <merge date, UTC> (`co-001/ci-findings-transport`): the findings reach the notify job
  as the run's own artifact (Amendment, below)."
- `:240-242` ends: "…bounded at 2,000,000 bytes, every finding whole at its worst, and handed to the notify job as
  the run's own artifact (Amendment, below)."
- New section, before `## Alternatives considered`:

> ## Amendment (<merge date, UTC>): the findings travel as the run's own artifact
>
> The check job handed the findings on as a job output, and the notify job read them as one environment variable.
> Linux refuses an environment string over 131,072 bytes, so any findings file over 98,292 bytes stopped the notify
> job before its shell started, and nothing was filed (latent: no run had reached it; ADR 0066, Part 3, N29). The
> check now uploads `findings.json` as the run's own artifact `findings`, kept one day and replaced on a re-run, and
> the notify job downloads it with `gh run download`, in three tries, refusing a file over its bound. For that it
> holds `actions: read` beside `issues: write`. On this public repository, that reads only what any signed-in user
> can read; once the repository is private it reads private run logs and artifacts, which Revisit when names. The
> notify job still checks nothing out, runs no action and runs no repository code: `actions/download-artifact` would
> have needed no permission, but would have run third-party code beside the write token. A download that fails
> opens or comments on "Content calendar check failing". On a pull request, a `handoff` job with `actions: read`
> alone downloads the artifact with the same lines as the notify job and writes nothing, so the hand-over is proved
> on a runner before a change merges. The file's bound is 2,000,000 bytes: a run has at most 41 findings (two of the
> calendar's own and three per family, held by a property test of the generators), titles at most 256 characters,
> and at their worst they take 1,540,660 bytes, so the notify job always receives every finding whole, opens 20 and
> lists the rest by title (at most 200 titles, a bound a run does not reach). The artifact and the check's summary
> hold what the issues hold (Q1). Job outputs were weighed and refused: GitHub caps them at 1 MB counted as UTF-16,
> nine worst-case findings. So was cutting every body to fit, which changes what an issue says. The check writes its
> summary before it bounds a title or the file, so a refused run still names every finding.

- Revisit when, the private bullet (`:319-320`), gains: "…, and whether issues stay the signal; and the notify
  job's `actions: read`, which then reads this repository's private run logs and artifacts: weigh again a same-run
  download that needs no permission (`actions/download-artifact` without a token) against running an action beside
  the write token."
- Deciders, `:13`: "…for the cost and security trade-offs Q1 and Q2, both taken as recommended, and for the
  findings' transport (the Amendment)."

**ADR 0066** (#86: `:982-983`) becomes:

> - The content calendar's findings, once a job output read as one environment variable over the limit, travel as
>   the run's own artifact (docs/adr/0071, Amendment, `co-001/ci-findings-transport`); no listed value is over it.

**`docs/runbooks/ci.md`**
- `:56`: "Each issue they open holds only public references: …" → "Everything they publish holds only public
  references: page addresses, file names, release numbers and run links. That is each issue they open, and for the
  content calendar also the check's summary and its one-day `findings` artifact."
- `:60`: "the findings to its summary" → "the findings to its summary and to this run's `findings` artifact, kept one
  day".
- A row after `:60`: "| `content-calendar`, `handoff` | on a pull request only, after the check: downloads this
  run's `findings` artifact with the notify job's own lines and checks it reads as a findings list, logging its count,
  size and SHA-256. It holds `actions: read` alone, checks nothing out, runs no repository code and writes nothing |
  5 min |".
- `:61`'s last sentence → "It alone holds `issues: write`, with `actions: read` to download this run's `findings`
  artifact; it checks nothing out, runs no action and runs no repository code."

**`docs/runbooks/content-updates.md`**
- `:20-21`: "…opens one issue per finding…, at most 20 new ones a run, reading the findings from the run's own
  artifact, and lists the rest in one issue (section 4);".
- `:88`, the "Findings not filed" row, gains after "the titles not opened yet": "(at most 200; past that, the run's
  summary names every finding)".
- `:89`, the "Check failing" row: "…findings past the file's bound, findings the notify job could not download, or a
  broken run…", and after "fix the cause": "If the cause has passed (a download refused, or a run re-run after its
  findings expired a day later), the next daily run files the findings; to file them sooner, run the workflow on
  request." The row keeps its wording otherwise (brand.md: plain words, no new term). A notify that fails closed
  exits 0, so no job is red and "re-run failed jobs" does nothing; running the workflow on request checks today's
  calendar, not the old commit.

**`docs/product/reconciliation-001.md`** (after #86's paragraph, `#86: :659-661`; rule 6, the PR merged second keeps
both sides):

> Under the same ruling of October 26, 2026 (about 00:20 UTC), the content calendar's findings transport, which #86
> recorded over the limit (`co-001/ci-findings-transport`, `docs/adr/0071`, Amendment):
>
> - **The findings as the run's own artifact:** the check uploads `findings.json` (one day, replaced on a re-run) and
>   the notify job, with `actions: read` beside `issues: write`, downloads it with `gh`, failing closed into "check
>   failing"; a pull-request-only `handoff` job proves the download on a runner and writes nothing; the file's bound
>   is 2,000,000 bytes, 41 findings at their worst, so every finding reaches the notify job whole; job outputs and a
>   body budget were refused (`docs/adr/0071`, Amendment). Not an exception to a check above.

(The design's own names for the refused options are §4.1's candidates (a), (d) and (e), job outputs, and (c), the
body budget; the repository text cites the ADR, since `C1` and `C2` already mean other things in
`reconciliation-001.md`, `:26`, `:289-290` and #86's `:661`.)

**Test matrix (RCC-08)**, `docs/product/test-matrix.md:319` and `packages/synth/src/cases/matrix.ts:451`, word for
word. It appends to the assertion: "…listing the rest in one issue; every finding reaches it whole, as the run's own
artifact". `registry.ts` does not change (its case, `:653-661`, already lists `content-calendar.test.ts` and
`workflows.test.ts`), but its generated fixture does: `fixtures/synthetic/RCC-08/expected.json` holds the assertion
word for word (`packages/synth/src/cases/builder.ts:175`), and `packages/synth/src/fixtures.test.ts:91-92` requires
the fixtures to be exactly what `pnpm synth --all` writes, as the pre-push hook's fixture check does. So it is
regenerated with `pnpm synth --all`, and only its `assertion` field changes.

**Issue text.** What an issue says changes in one place, past a bound no run reaches today: a "findings not filed"
issue with more than 200 titles lists 200 and ends "- and N more, each named in the run's summary" (brand.md: plain
words; reported here under the ruling of 2026-10-25). The "check failing" body keeps its sentence. A download failure
reads "did not hand on its findings (the check: success)", which is true, and the run link leads to `gh`'s message.

---

## 9. Migration, test matrix, numbers

- **Migration: none.** No table, no SQL.
- **Test-matrix row: none.** CI-30 and CI-31 stay unreserved. The behaviour belongs to RCC-08 ("the workflow's
  check job only reads and its notify job alone writes issues…"), whose registry case already names both test files.
  A CI row would split one workflow's claims across two rows. #86 took no row for N29 under the same reasoning.
  The new job's timeout is held by the existing CI-10 row ("Every job of every workflow has the timeout its table
  names", `test-matrix.md:276`), whose test's table gains `handoff: 5` (§6); CI-10 is not renumbered or reworded.
- **ADR numbers: none.** Only an amendment to 0071, and an edited sentence in 0066 Part 3. There is no new N-number:
  the N29 sentence is rewritten, not added to.

---

## 10. The run of record

Two runs, in R7's form (#86, `ci-images-digest.md:1068-1073`), each recorded in the status file.

- **First: this item's own pull-request run, with `handoff` green.** Notify never runs on a pull request (`:67`), so
  `handoff` is where the real `gh run download` first reads a running run's v4 artifact on a runner, before the
  merge (§4.2; #86's P3 question). Record: run ID, head SHA, check and handoff green, from check's log the line
  "the findings file holds N bytes, SHA-256 X", from handoff's log the `gh run download` with no error and "the
  notify job reads M findings, N bytes, SHA-256 X" (the same N and X: the hand-over byte for byte), and read-only
  `gh api repos/PureTideWater/PhysicalTherapy/actions/runs/<id>/artifacts --jq '.artifacts[] | [.name,
  .size_in_bytes, .expires_at]'` showing `findings` with one day to expiry. A red `handoff` stops the merge.
- **Second: the merge's own `push` run.** The push paths include `.github/workflows/content-calendar.yml` and
  `tools/content-calendar/**` (`:23`, `:25`), so the merge starts `content-calendar` on `claude/build-platform`, as
  #49's merge started 40339580175 (push, d7259775, success).
  - Record: run ID, head SHA, both jobs' conclusions, the artifact listed with its `size_in_bytes`, and from
    notify's log the `gh run download` line with no error.
  - Also recorded: the issues it touched. Today's 16 findings are all open, so expect no `issue create` and the
    "not filed" issue left closed.
- **What these runs do not show.** Both carry today's file, about 14 KB (16 findings), far under the old 98,292-byte
  edge: they show the artifact transport working on a runner, not the large case. The large case is held on every
  pull request by T-E, T-P and the 400-finding notify case, which run in ci.yml's `unit` job on
  `ubuntu-26.04` (83d71fd6 `.github/workflows/ci.yml:187-188`, `pnpm test` at `:287`), real bash under the runner's kernel limit with a stand-in
  `gh`: the 98,293-byte file, and the worst 41-finding file of 1,540,660 bytes. §7 repeats them locally. The pull
  request's evidence cites that CI job's ID beside T-E, so no later scheduled run with more findings is needed to
  close the item.
- **No `workflow_dispatch`** on the branch: it would file real `content-due` issues on the public repository from a
  branch's code. The next scheduled run (07:17 UTC daily, `:16`) is a third proof.
- **If the merge run's notify fails** ("check failing" opened, with `gh`'s message), the status file records it, and
  §11's rollback applies before the next day's run.

---

## 11. Builders' steps

1. Cut `co-001/ci-findings-transport` from `claude/build-platform` after #86 merges. Check that #86's merge left
   `content-calendar.yml`, `tools/content-calendar/**`, ADR 0071 and `content-updates.md` as at 83d71fd6.
2. Commit 1 (red): §6's tests. Run under `flock /tmp/laneb-heavy.lock`:
   `pnpm vitest run tools/content-calendar tools/test/workflows.test.ts`. Record each failure's reason; T-E's must be
   E2BIG on the 98,293-byte file, and CI-10's timeout table's must be the missing `handoff`.
3. Commit 2: c1 to c3 (`handoff` written between `check` and `notify`). Run the same tests green, CI-10's table
   included, then `pnpm typecheck`, `pnpm lint`, `pnpm lint:logs`, and actionlint
   with #86's flags.
4. Commit 3: §8's documents, `matrix.ts` with `test-matrix.md`, then `pnpm synth --all`, committing
   `fixtures/synthetic/RCC-08/expected.json` in the same commit. `git diff --stat fixtures/synthetic` must show that
   file alone, and `git diff` its `assertion` line alone; any other drift is a base problem to report, not to commit.
   Then `pnpm test` (the fixtures test holds `matrix.ts`, the matrix and the generated fixtures equal, `:41-42` and
   `:91-92`).
5. Because a workflow changed, run `pnpm actions:check` and `BASE=origin/claude/build-platform pnpm toolchain:check`
   (networked). No new pin, so #82's floor is not met.
6. Push through the hook (`git push origin co-001/ci-findings-transport`, never `--no-verify`; the hook's fixture
   check reads the regenerated RCC-08 fixture). Open the pull request from `.github/pull_request_template.md`, its
   evidence holding §7's table, the pull-request run of §10 (handoff green, the matching size and SHA-256, the
   artifact listing) and the `pnpm test` CI job's ID for T-E and T-P, with the sentence of §10 "What these runs do not
   show".
7. Before the merge, replace `<merge date, UTC>` in ADR 0071 (Status and the Amendment's heading) with the UTC date
   the merge will carry, in the pull request's last commit; `grep -n '<merge date' docs/adr/0071*` must print
   nothing. Merge under ADR 0063, with an explicit message in #48's form. Then record §10's push run.

---

## 12. Risks and rollback

- **R1. `actions: read` on the writing job.** It is wider than none, and wider than (f) would have been (§4.2): the
  price of keeping third-party code off the VM that writes issues. On a public repository it equals what anyone
  signed in can read, and it writes nothing. No repository code and no action runs in the job. When the repository
  turns private, it lets notify (and `handoff`) read this repository's private run logs and artifacts, still only
  with `gh`'s one download call (T-N, T-H). This item adds that to ADR 0071's "Revisit when", the private bullet, and
  to the Amendment (§8), so the move to private re-weighs it against a same-run `actions/download-artifact`.
- **R2. The artifact service is down.** Three tries, then "check failing" (fail closed). This is no worse than today,
  where outputs depend on the same backend.
- **R3. `gh`'s behaviour changes** on the runner image (2.103.2 today). `-n` with one name, `-D` and zip extraction
  have held since gh 2.x. A change shows red in `handoff` on the next calendar pull request, and fails closed in
  notify; T-N and T-H pin the one command line.
- **R4. A download fails, or notify is re-run after the artifact expired.** Notify opens or comments on "check
  failing" and exits 0, so no job is red and "re-run failed jobs" does nothing (#86's `ci.md:130-132` covers failed
  jobs, not this). That is fail-closed: the next daily run uploads a fresh artifact and files the findings. To file
  sooner, run the workflow on request from the default branch (`workflow_dispatch`, `:17`), which checks today's
  calendar and content; re-running all jobs of the old run also works but checks the old commit. The runbook's
  "Check failing" row says so (§8). Proposal outside this item: one clause in #86's `ci.md:130-132` that a job which
  reports its failure as an issue and exits 0 is followed by a run on request, not a re-run (§14, P4).
- **R5. A new kind of finding or family.** A new family raises `MAX_FINDINGS` through `CONTENT_FAMILIES`, and T-P
  recomputes the worst file against it. A new kind of finding per entry fails T-K in the pull request that adds it
  when fast-check reaches the branch; if it does not, the run is still carried, since there is no runtime count
  refusal: past the byte bound (or a title's, should a later change lengthen titles past the schema's 80-character
  entry title), the check fails after writing its summary naming every finding, and
  notify opens "check failing"; the "not filed" body stays under 65,536 whatever the count (`MAX_LISTED`).
- **R6. The 65,536 and 256 limits are not documented** in the docs read, only as the API's refusals. (The step
  summary's 1 MiB is documented, `workflow-commands.md:933-935` at 33b1f4a, §6 T-P.) The margins are
  1.26× for the "not filed" body at its cap (52,010), more than 10× for an opened body, and 1.7× for a title (about
  145 of 256).
- **R7. A red `handoff`** on an unrelated calendar pull request (the artifact service down) blocks nothing, since
  the workflow is not a required check; the pull request's author re-runs failed jobs, an infrastructure failure
  under `ci.md:130-132`.
- **Rollback.** Revert the merge commit. That restores the env transport and its latent 98,292-byte cliff, and
  removes `handoff`. T6's `over` row returns with it, so the revert is self-describing.

---

## 13. Interplay

- **#86** merges first. This item edits #86's lines in `workflows.test.ts` (T6, `expectQuietNotify`, the jobs list,
  the notify tests), ADR 0066 `:982-983` and reconciliation-001 after `:661`.
- **#82** (96758e44) merges before #86. No new pin or digest, so its three-day floor applies to nothing here.
- **#42** (be63bdc2, open). It shares `workflows.test.ts` (a 7-line images hunk, not the content-calendar describe),
  `reconciliation-001.md`, `test-matrix.md`, `matrix.ts` and `registry.ts` (not RCC-08's lines). It regenerates
  other fixtures (`JOB-05`, `SCR-21`, `SCR-22`, `SEC-18`, `SEC-19` `expected.json`; pr42-files.txt `:101-105`), not
  `RCC-08`'s, so the fixtures do not overlap. Under LANES rule 6, the pull request merged second keeps both sides,
  and re-runs `pnpm synth --all` if its fixtures test reports drift.
- No other open head touches `content-calendar.yml`, `tools/content-calendar/**`, ADR 0071 or `content-updates.md`.

**Commands and sources.**
- `git show 83d71fd6:<path>` and `git show origin/co-001/ci-images-digest:<path>`.
- `curl https://raw.githubusercontent.com/actions/upload-artifact/cf430e03…/action.yml` and `/README.md`.
- `curl https://raw.githubusercontent.com/actions/download-artifact/9000827ccba6bdab643e8b6fd33ac0654aef8333/action.yml`
  (`github-token`, `:23-27`, no default) and `src/download-artifact.ts` (`:22`, `:66-75`).
- `actions/toolkit main packages/artifact/README.md`, `src/internal/download/download-artifact.ts` (`:176`, `:193`)
  and `src/internal/find/list-artifacts.ts` (`:172-186`).
- `actions/runner main src/Runner.Worker/Handlers/NodeScriptActionHandler.cs:56-57` and `ScriptHandler.cs` (no
  `ACTIONS_RUNTIME_TOKEN`), read with `curl … | grep -n ACTIONS_RUNTIME_TOKEN`.
- `actions/runner-images main images/ubuntu/Ubuntu2604-Readme.md:101` ("GitHub CLI 2.103.2").
- `cli/cli v2.103.2 pkg/cmd/run/download/{download,http}.go`, `pkg/cmd/run/shared/artifacts.go` and
  `internal/zip/zip.go` (byte-identical at v2.103.3).
- `github/rest-api-description descriptions/api.github.com/api.github.com.json`, the three artifact operations and
  `components.parameters.direction`.
- `github/docs` at 33b1f4a, a blobless sparse clone: docs.github.com is refused by the proxy (403). Read there:
  `data/reusables/actions/output-limitations.md:1`, `events-that-trigger-workflows.md:1253-1263`, and
  `content/actions/reference/workflows-and-actions/workflow-commands.md:933-935` ("Step isolation and limits", the
  job summary's 1MiB per step), found with `grep -rn -i "1 *MiB" content/actions`.
- `gh api` (read-only) for runs, jobs, the job log and the open issues.
- Node 24 byte checks: the 65,536-unit maximum, lists of 0, 1 and 2 empty entries (3, 44, 85), the worst file
  1,540,660 and the 20-finding file 751,543.

---

## 14. Proposals, outside this change

- **P1. Unique entry titles in the calendar schema** (`packages/rules/src/calendar.ts:81-88`). Two entries with one
  title would give two findings one title, and notify would open both, since it dedupes against open issues only.
  The schema should refuse it beside "is in the calendar twice". That is Lane B's own file, but outside this item.
- **P2. Release-capacity's `ADVISORIES_B64`** (#86 T6 row, `release-capacity.yml:140`) is bounded at one line and
  stays an env value. Recorded so the two notify jobs' transports are known to differ on purpose.
- **P3. GitHub's issue limits as constants** shared by both notify jobs' tests (256 and 65,536), once a second user
  appears.
- **P4. #86's re-run rule** (`docs/runbooks/ci.md:130-132`) gains one clause: a job that reports its failure as an
  issue and exits 0 (the content calendar's notify) is followed by a run on request, not a re-run of failed jobs,
  which finds nothing failed. #86's file; recorded for its owner (§12, R4).

---

## 15. Review (2026-11-01)

The review (`ci-findings-transport-review.md`) raised six S and eight N findings; each was re-checked here and has
two skeptics' verdicts, all "real". All fourteen are fixed, eleven of them refined with a skeptic's better fix. None
is rejected. Rejected parts of a skeptic's fix are named with the evidence. The local proof was re-run on the
changed scripts (§7).

| Id | Disposition | What changed |
| --- | --- | --- |
| S1 | fixed, refined | Re-checked: `actions/download-artifact@9000827c` `action.yml:23-27` gives `github-token` no default; a same-run download needs no permission. §4.1 row (f) now says "unchanged"; §4.2 states the real trade-off: (b) pays `actions: read` to keep third-party code off the VM that writes, and that is the safer choice. Considered and refused: a download with no action and no permission (a `run:` step never gets `ACTIONS_RUNTIME_TOKEN`, `NodeScriptActionHandler.cs:56-57`). The one-liner at §4.2's end is corrected. R1 records the price and the private-repository reach (with S5). |
| S2 | fixed, refined | Re-checked: `builder.ts:175` copies the assertion into `fixtures/synthetic/RCC-08/expected.json`, and `fixtures.test.ts:91-92` requires no drift. §8 says the fixture is regenerated (only `assertion` changes); §11 step 4 runs `pnpm synth --all`, commits that one file and checks `git diff --stat`; §13 records that #42 regenerates other fixtures, not RCC-08's. |
| S3 | fixed, refined | Both skeptics' fixes combined. No runtime count refusal: `findings()` keeps only its one-line title check; the 256-unit title refusal moves into `findingsJson`, after the summary (c2, c3), so every runtime refusal leaves the summary. The count is held by T-K, a fast-check property over the real generators (per family at most one review, one due item, one source finding; at most two of the calendar's own), with `FINDINGS_PER_FAMILY` named. The "not filed" body is capped at `MAX_LISTED` = 200 titles (52,010 ≤ 65,536 whatever the count, proof §7's 400-finding case), so GitHub's limit no longer rests on the count. R5, A4 and c2's sentence rewritten. Not taken: skeptic 1's typed slot list exported from `calendar.ts` and `fetch.ts`; it changes `packages/rules` for a property the test can read from `DueItem.family`, `stage` and `SourceFinding.entry`. |
| S4 | fixed, refined | A pull-request-only `handoff` job (c1): `needs: check`, `permissions: { actions: read }`, no `uses:`, no checkout, the download block word for word between marker lines (T-H holds the two equal; proof §7 checks it), the same shape check, exit 1 on failure, logging count, size and SHA-256 (the check logs the same two values). The pull-request run is now the first run of record (§10, A6); the toolkit sources are cited (§4.2); R3 and R7 name it; ADR 0071's Amendment, `ci.md` and the header mention it. Not taken: skeptic 2's `if: … && needs.check.result == 'success'` — without `always()` a job already runs only when its needs succeeded, so the clause adds nothing. |
| S5 | fixed, refined | Re-checked: ADR 0071 `:319-320` and the Amendment never named `actions: read`, and #86's `ci.md:130-132` is about failed jobs (notify exits 0 when it fails closed). ADR 0071's private Revisit-when bullet and the Amendment now name it (§8); R1 cites only what exists; R4 is rewritten (fail closed, the next daily run files; to file sooner, run the workflow on request, which checks today's calendar); `content-updates.md:89` says so in plain words. `ci.md:130-132` left to #86's owner as P4. |
| S6 | fixed, refined | Re-measured with Node 24: the maximum over all 65,536 units is 6 bytes, a surrogate pair 4 for 2; lists of 0, 1, 2 empty entries take 3, 44, 85, so the overhead is 39 + 2 + 5; the worst entry is 37,575 (37,577 with its separator), the worst file 1,540,660, T-P's old generator 1,540,300, the proof's 1,540,045. §3 restated; T-P computes the unit maximum, builds the worst file from full-length titles and asserts the formula equal to the measured bytes; the proof now runs the exact 1,540,660-byte file and calls 1,540,045 near-worst (A3, §7). |
| N1 | fixed, refined | v2.103.2 is the version cited (runner-images `Ubuntu2604-Readme.md:101`), with the four files' SHA-256 equal at both tags, and one sentence that notify relies on the behaviour, which `handoff` re-checks, not on the version. |
| N2 | fixed, refined | §4.2 "Re-runs" says why the first of a name is the newest (`direction` defaults to `desc`; `gh` sets only `per_page`), cites `filterLatest`, and says `overwrite` is the guarantee and the order a backstop, since the description names no sort key. Citation corrected to `download.go:156-168`. Not taken: fetching by `artifact-id` with `gh api …/zip`; it trades `gh`'s own safe extraction for a bespoke unzip, for no correctness gain. |
| N3 | fixed, refined | `: > findings.json` now sits inside the shared block in both the design and the proof script, the block is marked, and the claim names the exact lines and the new SHA-256s (`proposed-notify.sh:17-36`, `proposed-handoff.sh:2-21`), "indented here by ten spaces"; the proof checks the two copies equal. |
| N4 | fixed, refined | The repository text cites `docs/adr/0071`, Amendment, since `C1`/`C2` already mean other things in `reconciliation-001.md` (`:289-290`, #86's `:661`); the design's own letters (candidates (a), (d), (e) and (c)) are named outside the quote. |
| N5 | fixed, refined | Re-checked: the design's header rewrite would have dropped the "Issues hold only…" sentence. The header now keeps it and names the summary and the one-day artifact; `ci.md:56` names every public output, scoped to the content calendar; the ADR Amendment says the artifact and the summary hold what the issues hold; a test asserts the header names the artifact. |
| N6 | fixed, refined | §10 "What these runs do not show": both runs of record carry about 14 KB; the large case is held by T-E, T-P and the 400-finding case in ci.yml's `unit` job on `ubuntu-26.04` (real bash, the runner's kernel limit), cited by job ID in the pull request, and by §7 locally. |
| N7 | fixed, refined | Skeptic 2's fix taken over the review's: `runNotify` builds its env through `notifyEnv`, modelled on #86's `identityEnv`, which resolves `${{ needs.check.outputs.findings }}` to the base64 of the staged file and throws on an unknown form. On the old code T-E then fails with E2BIG (`runScript` asserts `result.error`, `:276`), the defect itself; nothing temporary is added and dropped. |
| N8 | fixed | Divisor 37,577 (§3); A1 keeps the whole-list citation and adds today's rows `:3228-3240`; the date is `<merge date, UTC>`, filled by the builder in §11 step 7 with a grep that must print nothing. |

### Completeness critic (2026-11-01)

Three gaps, each re-checked against #86's head (83167b8f) and the base (83d71fd6) before it was closed.

| Gap | Disposition | What changed |
| --- | --- | --- |
| G1. CI-10's timeout table is not edited | fixed, refined | Real: #86 `tools/test/workflows.test.ts:2724-2746` builds every job's `timeout-minutes` of every workflow and holds it with `toEqual`; `:2734` is `'content-calendar.yml': { check: 15, notify: 5 }`. §6 now edits that row to `{ check: 15, handoff: 5, notify: 5 }` and the comment at `:2733` to "The daily calendar check, its one issues call, and on a pull request the hand-over proof (docs/adr/0071)."; "Failing first" names it (red on the missing `handoff`); §11 steps 2 and 3 record and run it; §9 says the existing CI-10 row (`test-matrix.md:276`) covers it, so no row or number is taken; c1 places `handoff` between `check` and `notify`. Refined: `toEqual` ignores key order, so only the jobs list (`:1153`) depends on YAML order; the table row is written in file order for reading, not because the test needs it. |
| G2. T-O's title case cannot be built | fixed | Real: `index.ts:55-60` checks the schema before any finding exists and returns 1 with no summary; `calendar.ts:38` caps an entry title at 80, so every finding title is at most about 145. T-O's title case is dropped; T-O keeps the `maxFileBytes: 100` case, which also proves the order for the title refusal (the same `findingsJson` call in the same `try`, after the summary). T-R's unit case (refuses 257, admits 256) is named the title bound's only test. c2, c3, A4 and R5 say the title refusal is a guard the schema keeps unreachable today. Not taken: a `findingsFor` seam on `CalendarRun`; it would add production surface only to reach an unreachable branch. |
| G3. The 1 MiB step-summary limit is uncited | fixed, refined | Real: no source was given. It is documented: `github/docs content/actions/reference/workflows-and-actions/workflow-commands.md:933-935` ("Step isolation and limits", at 33b1f4a): 1MiB per step, and an overflow fails the summary upload with an annotation but not the step or the job. T-P's line now states the exact assertion (`Buffer.byteLength(summaryMarkdown(...))` of 41 titles of 256 three-byte units ≤ 1,048,576; measured 31,794 with Node 24) and the consequence (titles lost from the summary, which the "not filed" issue points to past `MAX_LISTED`). R6 notes this limit is documented, unlike 65,536 and 256; §13 lists the docs file. |
