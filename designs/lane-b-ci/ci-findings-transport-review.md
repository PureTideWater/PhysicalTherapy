# Review: ci-findings-transport design (adversarial; CI and test infrastructure, security)

Reviewed 2026-11-01. Design: `scratchpad/findings-transport/ci-findings-transport.md` (657 lines). Lines are at base
83d71fd6 unless marked `#86:` (origin/co-001/ci-images-digest, 83167b8f).

**Verdict.** The choice holds: (b) is the best transport, an artifact the check uploads and that notify reads with
`gh run download`. No blocking finding. Six S findings: one weighing rests on a false premise, one required file is
missing from the change list, two invariants are added in the wrong place, the runner proof comes late, and an ADR
clause is cited but does not exist. Then nits.

## What I verified, and it holds

- The live code as cited: `content-calendar.yml` :45-46, :54-60, :65-135 (gh at :84, :86, :94, :96, :123, :133);
  `render.ts` :15-18, :41-58, :116-135; `index.ts` :79-87 (findings file written :86 before summary :87). On #86:
  `workflows.test.ts` expectQuietNotify :1130-1139, the check test :1156-1167, fakeGh/notifyStep/runNotify
  :1173-1205, notify tests :1208-1266, the upload rule :1752-1770, T2 E2BIG :1911-1923, T3 :3064, `runner.temp`
  admitted :3159, T6 :3194-3311. `git diff --stat 83d71fd6 origin/co-001/ci-images-digest` touches none of
  content-calendar.yml, tools/content-calendar/**, ADR 0071 or content-updates.md.
- The edge: `4·⌈98,292/3⌉ = 131,056`, plus `FINDINGS_B64=` (13) and NUL = 131,070 ≤ 131,072. 98,293 bytes gives
  131,060 + 14 = 131,074. The proof agrees (`proof/local-proof.txt` case 1).
- The escaping worst case. Node 24, every UTF-16 code unit 0..0xFFFF through `JSON.stringify`: at most 6 bytes a unit
  (control characters and lone surrogates). A 41-entry file with full 256-unit titles and 6,000-unit bodies, all
  `\u0001`, is 1,540,660 bytes. Twenty such entries are 751,543. Forty-one 3-byte entries are 771,172. The overhead
  in the two-space form is 39 bytes an entry, plus 2 between entries, plus 5 for the list.
- The bound of 41 findings: `contentDue` (calendar.ts :518-590) yields at most 2 of the calendar's own plus 2 per
  entry, and `watchSources` (fetch.ts :195-229) at most 1 per entry. The schema refuses a family twice (:81-88), and
  there are 13 families.
- gh's behaviour. The source at v2.103.3 matches v2.103.2, the version ubuntu-26.04 ships
  (`actions/runner-images images/ubuntu/Ubuntu2604-Readme.md:101`, "GitHub CLI 2.103.2"), byte for byte in
  `pkg/cmd/run/download/{download,http}.go`, `pkg/cmd/run/shared/artifacts.go` and `internal/zip/zip.go`.
  - With a run ID it lists `repos/{o}/{r}/actions/runs/{id}/artifacts` and checks no run status
    (download.go:73-99, artifacts.go:23-60).
  - With one `-n` it extracts into `-D` itself (download.go:215-232). `OpenRootDir` creates `-D`
    (`internal/safepaths`, `OpenRootDir` MkdirAll).
  - Files are created exclusively, so the design's `rm -rf` before each try is required, and correct.
  - Traversal entries are skipped (zip.go:19-31).
- REST (`github/rest-api-description`, api.github.com.json):
  - The download needs `zip` and redirects for one minute.
  - The list is "anyone with read access" and takes `name` and `direction`.
  - `direction` defaults to `desc`.
- Docs: `github/docs` output-limitations.md (1 MB, UTF-16); about-artifact-log-retention.md (public 1 to 90 days);
  events-that-trigger-workflows.md, `permissions: actions: read, issues: write` in the example.
- The upload: `actions/upload-artifact@cf430e03` action.yml says `overwrite` deletes before upload, `archive`
  defaults to true and retention is at least 1 day. The pin is in ADR 0066 (#86 :332), so no new pin and no #82 floor.
- The proof files' hashes match the design (f9a2e5cb…250f, e51f9683…a770, a1e18768…9a32).

---

## Findings

### S1. Candidate (f) is rejected on a false premise; the weighing must be redone honestly
- **Evidence.**
  - Design §4.1 row (f): "none added, but the action gets `github.token` by default". §4.2: "(f) would run a Node
    action in that job and hand it the token through its `github-token` input."
  - At the repository's own pin, `actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333` (v8.0.2;
    #86 ci.yml:553), `action.yml:23-27` gives `github-token` no default: "If this is not specified, the action will
    attempt to download artifacts from the current repository and the current workflow run."
  - A download in the same run uses the runner's runtime token. So (f) needs **no** `actions: read` and gets no
    `GITHUB_TOKEN`.
  - Command: `curl -sS https://raw.githubusercontent.com/actions/download-artifact/9000827ccba6bdab643e8b6fd33ac0654aef8333/action.yml | grep -n -A5 github-token:`
- **Why it matters.** (f) is the only candidate that adds no permission, which the item's least-privilege criterion
  rewards. (b) still wins on the item's other stated criterion, "no new third-party code in notify". A Node action
  runs on the same VM before the step that holds `issues: write`. A compromised action could replace `gh` on `PATH`
  and capture the token, and a pinned SHA lowers that risk but does not remove it. (b) instead adds a read scope that
  on a public repository reads only public data. As written, the design records the wrong reason, so the ADR
  amendment would carry it too.
- **Fix.**
  - Correct row (f): privileges "none added (runtime token; no `github-token` default at the pin, action.yml:23-27)",
    new code "a Node action on the VM of the writing job".
  - Restate why it loses: notify's invariant (`expectQuietNotify` :1135, ci.md:61, ADR 0071 :235-236: no action
    runs in the writing job), and VM tampering before the token step outweighs a read scope on a public repository.
  - Record the cost in the trade: `actions: read` is the price, and its private-repository blast radius goes into
    "Revisit when" (S6).

### S2. Changing RCC-08's assertion needs `fixtures/synthetic/RCC-08/expected.json` regenerated; the change list omits it
- **Evidence.**
  - Design §8: "Test matrix (RCC-08) … test-matrix.md:319 and matrix.ts:451, word for word … The registry case …
    does not change." §11 step 4 names `matrix.ts` and `pnpm test` only.
  - `fixtures/synthetic/RCC-08/expected.json` holds the assertion verbatim
    (`git show origin/co-001/ci-images-digest:fixtures/synthetic/RCC-08/expected.json`, key `assertion`).
  - `packages/synth/src/fixtures.test.ts:91-92` requires the fixtures to be "byte for byte what pnpm synth --all
    generates". The pre-push hook's fixture check (CLAUDE.md, Pushing) reads the same tree.
- **Fix.**
  - Add `fixtures/synthetic/RCC-08/expected.json`, regenerated with `pnpm synth --all`, to §8 and to §11 step 4
    ("then `pnpm synth --all`; only RCC-08's expected.json changes").
  - Add the file to §13's #42 interplay check. #42's file list has no `fixtures/synthetic/RCC-08`, so there is no
    conflict.

### S3. The new count and title refusals sit before the summary, and R5's "T-P fails first" is false for a new finding kind
- **Evidence.**
  - Design §5 c2: `findings()` throws past `MAX_FINDINGS` (41) and past `MAX_TITLE`. c3: `findings()` runs in the first
    `try`, before `writeFileSync(summary, …)`. §12 R5 admits "the summary is lost".
  - R5 also claims: "T-P fails first in the pull request that adds it."
  - T-P (§6) asserts only `MAX_FINDINGS === 2 + 3 * CONTENT_FAMILIES.length`. A new family moves both sides together.
    A new kind of finding per entry (a fourth push in `contentDue`/`familyDue` or `watchSources`) changes neither
    side, and no test fails.
  - The first sign would be a scheduled run with 42 or more findings. It throws, writes no summary, uploads nothing,
    and notify opens "Content calendar check failing". The transport could have carried that run: 42 realistic
    findings are about 260 KB of the 2,000,000 bound.
  - The item's carry-over 4 asks that a check stopped at a bound still names every finding.
- **Fix.**
  - (1) Run both refusals after the summary. Write the summary straight after `findings()` builds the list, then
    check the count and the titles, then `findingsJson`. Or move the count and title checks into `findingsJson`.
    T-O then also covers a count refusal: summary present, `--out` absent, message `over 41`.
  - (2) Make R5 true with a structural test. A calendar of all 13 families, each built to trigger its review-due
    item, its family item and a source finding, plus `no_release`, has `findings(...).length` ≤ `MAX_FINDINGS`.
    Separately, assert that each generator emits at most one item per (stage group, entry). A unit test over
    `contentDue` with a duplicated push then fails in the pull request that adds a kind.
  - Better still, (3) drop the runtime count refusal. Keep `MAX_FINDINGS` as the test's constant, held by (2), and
    leave the byte bound as the only runtime refusal. The count's runtime throw turns a run the transport carries
    into a failure, and the property is already held at test time.

### S4. The transport is first exercised on a runner only by the merge's push run; P3's open question is answered from one README sentence
- **Evidence.**
  - #86's design §12 P3 (`ci-images-digest.md` around :1101): "Whether a running run's own v4 artifact downloads
    through the API is not verified."
  - This design answers it with `actions/toolkit packages/artifact/README.md:29` ("immediately available in the UI
    and REST API") and the local proof, which uses a stand-in `gh`. Neither touches the real artifact service.
  - §10: notify never runs on a pull request (:67). So the first runner call of
    `gh run download "$GITHUB_RUN_ID"` against an in-progress run is the merge's push run on `claude/build-platform`.
  - If that call fails, it files "Content calendar check failing" on the public repository, and nothing is filed
    until rollback.
- **Fix.** Prove the hand-over on the pull request's own run, which carries no write permission.
  - Add a job `handoff` with `needs: check`, `if: github.event_name == 'pull_request'`,
    `permissions: { actions: read }`, no `uses:` and nothing checked out.
  - It runs notify's download block line for line (held equal by a test that compares the two scripts' download
    lines). It then runs the same `jq -e` shape check and exits non-zero on failure.
  - It proves on every calendar pull request, forks included (their token is read-only), that a running run's own v4
    artifact lists and downloads through `gh`. It touches no issue.
  - The pull request's run becomes a run of record before the merge, in R7's form: run ID, `handoff` green, its log's
    `gh run download` line.
  - If a job is judged too much, at least strengthen the evidence with source as the item asked.
    `actions/toolkit packages/artifact/src/internal/find/list-artifacts.ts:172-186` filters "the latest artifact for
    each name", and `download-artifact.ts:176` `downloadArtifactPublic` uses the REST zip endpoint. Also state the
    residual risk in §12.

### S5. R1 and R4 cite text that does not exist
- **Evidence.**
  - R1: "ADR 0071's 'Revisit when … turns private' covers it, and the Amendment says so." ADR 0071 :315-320's
    private bullet names runner labels, minutes and "whether issues stay the signal", nothing about notify's
    `actions: read` or a public artifact. The proposed Amendment (§8) says nothing about the repository turning
    private either.
  - R4: "Re-run all jobs instead (the runbook's re-run rule, #86: ci.md:130-132)". That rule is "Re-run failed jobs
    only for an infrastructure failure". On a failed download, notify exits 0 after opening "check failing", so no
    job failed and there is nothing for that rule to re-run.
- **Fix.**
  - Add to ADR 0071 "Revisit when", private bullet: "…, and notify's `actions: read`: once private it reads private
    run logs and artifacts, so weigh a per-run hand-over without it (the same-run download of S1's (f)) against an
    action in the writing job". Add the same sentence to the Amendment.
  - Rewrite R4: "A failed download fails closed and the next daily run files the findings again; to file sooner,
    re-run all jobs on the workflow (a fresh check and artifact). A notify re-run alone after a day finds the
    artifact expired."
  - Put that sentence in content-updates.md's "Check failing" row (:89).

### S6. T-P does not prove its own worst case; it asserts one witness
- **Evidence.**
  - §6: "It also checks that a lone-surrogate body measures the same, which shows that 6 bytes a unit is the
    maximum." Two equal witnesses do not show a maximum.
  - The honest bound needs the maximum over every code unit. That is cheap: `for c in 0..0xFFFF:
    Buffer.byteLength(JSON.stringify(String.fromCharCode(c))) - 2 ≤ 6` runs in milliseconds; my run gives a maximum
    of 6. Supplementary characters are pairs, at most 4 bytes for 2 units.
  - The worst-file figures also disagree:
    - §3 and A2 say 1,540,660.
    - T-P's own generator `String(i).padEnd(MAX_TITLE, '\u0001')` gives 1,540,300, and §6 nonetheless says
      "Measured: 1,540,660 with a full-length title".
    - The proof's generator (`prove.mjs:44`) gives 1,540,045, which A3 calls "the worst case".
  - Item 3 asked for the overhead to be stated precisely.
- **Fix.**
  - T-P iterates all 65,536 code units and asserts the maximum escaped length is 6. It also asserts that a surrogate
    pair takes 4 bytes for 2 units.
  - Build the worst file from full-length titles, `'\u0001'.repeat(MAX_TITLE)` (titles need not be unique for a
    byte bound), and assert exactly 1,540,660 ≤ `MAX_FILE_BYTES`.
  - State the overhead as 39 bytes an entry, plus 2 between entries, plus 5 for the list. The design's "41 bytes,
    plus 2 between entries" double-counts the separator, and §3 uses 37,579 once against 37,577 elsewhere.
  - Call the proof's 1,540,045-byte file "a near-worst file" in §7 and A3.

---

### N1. gh version
The design cites `cli/cli v2.103.3`. The runner ships 2.103.2 (Ubuntu2604-Readme.md:101). The four files are
identical between the two tags, as checked above. Cite 2.103.2 as the version that runs, and record the equality.

### N2. "first artifact of each name" should say why first is newest
download.go:156-169 keeps the first artifact of a name. The list endpoint's `direction` defaults to `desc`
(api.github.com.json, `components.parameters.direction`), so first is newest. The toolkit's `list-artifacts.ts:172-186`
shows that a run's list can hold more than one artifact of a name, across attempts. Say this in §4.2 "Re-runs", since
it is what makes a re-run read its own attempt's findings even if `overwrite` did not reach an earlier attempt's
artifact.

### N3. "proof §7 runs exactly this" is not exact
In c1, `: > findings.json` comes after the download loop. In `proof/work/proposed-notify.sh:17` it comes before. The
behaviour is the same. Make them byte-identical, or say "the same block, `: >` moved".

### N4. The reconciliation text cites "(C1, C2)", which this design never defines
§8 says "job outputs and a body budget were refused (C1, C2)". The design names candidates (a) to (i) and file changes
c1 to c4. Use "(candidates (a) and (c))", or number the choices C1… as the precedent does.

### N5. Two "public references" sentences should name the artifact
ci.md:56 ("Each issue they open holds only public references") and the workflow header :10-11 ("Issues hold only …")
speak of issues only. The artifact is now a second public carrier, readable by any signed-in user for a day. Add "and
the content calendar's one-day `findings` artifact" to ci.md:56. In the header, add "the artifact holds what the
issues hold".

### N6. The run of record cannot show the over-98,292 path; say so
§10's push run carries today's file of about 14 KB. The only proof of a file over the old edge is local (§7, T-E).
State this in §10 and in the pull request's evidence, so nobody reads the run as proof of the large case.

### N7. T-E fails first, but not for the defect's reason
On the old code, T-E fails because nothing is downloaded (§6), not because of E2BIG. The E2BIG cause is held only by
T-P's arithmetic line. That is acceptable. Add one assertion so the red commit shows the defect itself: run the base
step's env with `FINDINGS_B64` of a 98,293-byte file through `spawnSync`, as `proof/scripts/prove.mjs` case 1 does,
and expect `result.error.code === 'E2BIG'`. Drop it in commit 2 together with `FINDINGS_B64`.

### N8. Small numeric and wording slips
- §3 "⌊375,000 / 37,579⌋" should read 37,577. The answer, 9, is unchanged.
- A1 cites T6 as `:3213-3297` (the list). The rows to delete are `:3228-3240`, which §6 has right.
- The Amendment date "2026-11-0X" is a placeholder for the builder. Mark it as such in §11.

---

## Missing from the item? Checked
- Items 1 to 7 are each addressed:
  - re-read code;
  - candidates (a), (b) and (c) plus six others;
  - the property test;
  - the carry-overs (with S3);
  - the run of record and the local proof (with S4 and N6);
  - no migration and no CI-30/31 row: RCC-08 owns the workflow's claims, and I agree;
  - the documents (with S2 and S5).
- No COUNTER REQUEST is needed. No setting changes: job-level `permissions:` and `retention-days: 1` are inside the
  public range.
- Security:
  - No PHI or non-public data goes in the artifact (ADR 0071 Q1 :250-256; bodies come from repository calendar data
    and percent-encoded public file names).
  - A pull request or fork cannot reach a push or schedule run's artifact: `gh` reads by `GITHUB_RUN_ID` only.
  - Notify still runs no repository code.
  - Every failure path fails closed into "check failing".
  - The zip is bounded after extraction. A zip bomb from a subverted check is a denial of service only, no worse
    than an oversized output today.
