ACTING (Lane A's account, https://claude.ai/code/session_019i9ifDkvaQzK4YgTGnKWC3) holds this item from 2026-11-04 02:39 UTC; Lane B: read lanes/lane-b.md's latest entries before resuming.

# Lane B: ci-images-digest (`images` refuses a long pull-request description): status

PR #86, branch `co-001/ci-images-digest`. First handed to the CI session (session_01UzQ6wgZgtThBRBxXTFYhRB) by Lane A's
orchestrator on 2026-10-28 05:45 UTC. Taken back by Lane B's orchestrator (session_01FcouKNNHsdecRMzfTs7XwW) on
2026-11-01 and run from 2026-11-01 16:57 UTC in this item session: session_01FcouKN1UjKZTWt4U9bZjyW
(https://claude.ai/code/session_01FcouKN1UjKZTWt4U9bZjyW). GitHub login `PureTideWater`. No ADR, test-matrix or synth
number reserved or needed (LANES.md:198, "None expected"). Every choice takes the recommended option (security the
safer), recorded here and in the PR description.

Open questions: none.

<!-- RESUME-BLOCK -->
## ACTING S3 (2026-11-04 02:45 UTC): repair 2 under check; then base, suite once, push R3
- Live at 02:35 UTC: PR branch 83167b8f; WIP 5c01f150 (repair 2: 21 commits a5bc1170..5c01f150 (git log; earlier "41" was wrong), 2026-11-02 08:44-09:18 UTC, after check round 2; its progress file and the round-2 verdicts other than D1-D3 were lost). Base 21fa10df (#42 22789493, #95, #91); merge-tree with 5c01f150 clean. Subscribed to #86.
- Workflow wf_2970023f-7c8 (`workflow-scripts/lane-b-ci-images-digest-finish-wf_2970023f-7c8.js`), run from this session: check round 3 over the repair-2 delta (A1 D1/D4/D8, A2 D2/D3, A3 D5-D7/D9/D10, whole diff), repair loop (round 4 at most), then the integrator: base merge once, generators, trial merges (#96), full local suite once, records, the §6.3 read (ruler 5bb5e558…), one push (R3). Progress `…-wip/progress/fix-check-A*-3.md`, `fix-integrate.md`.
- **06:00 UTC, from S4 (data; checked live):** the base's `images` is red until #107 merges (the pinned Trivy; get.trivy.dev no longer resolves); #107 conflicts with #86 only in ci.md's `images` bullet (keep both). The integrator had merged base 4846f043 (b8837f47, WIP pushed) and finished the trial merges; it was stopped before the suite and resumed (same run, wf_2970023f-7c8, step 2b added) to wait for #107, merge the base again, re-check T3/T5/T6 on #107's lines, and only then run the suite and push.
- **06:20 UTC:** the container restarted mid-run. Disk survived; setup re-run (PostgreSQL up). Run resumed 06:30 UTC (same run). State before: #107 merged as 7bf7b252; base merge 2 = 2e880412 (ci.md conflict, both kept); 9936688b lists #107's TRIVY_CMD ($GITHUB_ENV) and trivy-bin ($GITHUB_PATH) writes in the value rule (three install steps, fingerprints, a behavioural test); WIP pushed 9936688b; next was #96's trial merge, then the suite.
- **07:52 UTC check-in:** the suite on 9936688b was green through unit (432 files, 7,317 passed, 4 local skips), golden, oracle, test:db 4/4 (139 files, 9,648 passed, 1 skipped), build and stamp. The base moved to 72096e94 (#105, #75: no #86 file; doc conflicts in ADR 0066 and reconciliation-001; watched-paths.txt). The run was stopped and resumed with step 4b: after the suite, base merge 3 right before the §6.3 read, then the generators, the fast checks and workflows.test.ts, then the push, so R3's head is up to date. Next check-in at 11:53 UTC.
- **07:48 UTC (orchestrator): GitHub now enforces the ruleset's up-to-date rule.** Before the merge: if origin/claude/build-platform is not an ancestor of the head, merge the base again, run the fast checks and generators, push, wait for green, then merge promptly. For #86: if that push comes after the body cut, put the ruler back first (ruler.mjs, 5bb5e558…), so the merging head has its own run of record; then cut again.
- **07:10 UTC, lifted (orchestrator; repository public again, standard runners 4 CPUs): the capacity gate can pass; no wait on #102.** Was: **Blocker for the merge, the founder's:** #86 changes `.github/workflows/screening-capacity.yml`, a capacity-watched path, so `screening-capacity gate` (required) stays red with RUNNER_TOO_SMALL until the founder's runner decision (issue #102, opened 2026-11-04 02:56 UTC on 4846f043). Everything up to the merge goes ahead; the merge waits for that decision.
- Next: read R3's CI (images log §6.4, capacity); fresh-clone verification; one body edit (corrections, R3, cut of the ruler); ready; approval-of-record; merge with `expectedHeadSha`.

## Current state (2026-11-02 06:25 UTC): fix round's check round 2 resumed (WIP a5bc1170)
- **Check round 1** (11 verifiers, done before the 01:xx window): every disposition had issues; two loosenings
  (D4 removed FINDINGS_B64's exact-value pin; D3+D4 exempted a whole string holding the over row). **Repair 1** fixed
  them and the rest with red/green evidence: WIP **a5bc1170** (0dd58dbf…a5bc1170 on top of d257fe6d, among them
  46e555e9 the over row exempt only when it is the whole string, 212da396 release's image step refuses a static-host
  variable holding a line break). Logs `scratchpad/imgdigest/logs/R1-*`; progress `…-wip/progress/fix-repair-1.md`.
- **Check round 2** was cut by the window at ~02:30 UTC after one verifier (D2: two nits). Resumed 06:22 UTC with the
  script edited (archived): a third round re-checks only the dispositions still open plus the whole diff (the 7-day
  pacing call of 02:10 UTC: nothing that does not change the outcome), and a missing verifier or repair result now
  stops the run instead of passing as clean. Base moved to **88708069**: the integrator merges it.
- **Pacing (orchestrator, 02:10 UTC):** the account's 7-day limit is at its warning level (resets 2026-11-06 19:00 UTC);
  #86 is to be FINISHED to its merge, no stage skipped, no repeated full suite on an unchanged head, no follow-on.
  Check-in scheduled ~11:35 UTC.
- **Built** (builder of `wf_401c564d-6b7`, done before the 5-hour window cut the run at ~21:55 UTC): WIP ref
  `co-001/wip-ci-images-digest` at **d257fe6d** = 29251dbb merge of 43565235 (#83), then 8681adb9 D1, 330deea0 D2,
  c1e80912 D3, 9ac28806 D4, 6adc518f D5, a7ccead0 D6, 19cc7bf5 D7, 91910da1 D8, d5f987a4 D9, f89770ca D10, d257fe6d an
  ADR wording fix (Part 5 "N23 to N31 with an N29 of its own"). The PR branch is still 83167b8f.
- **Resumed 01:01 UTC** (same run, cached builder replayed): the eleven verifiers, then the integrator (full suite,
  trial merges, records, §6.3 read, the one push). PostgreSQL restarted by the setup script. Check-in scheduled ~06:12 UTC.
- **Fix round** `wf_401c564d-6b7` (script `workflow-scripts/lane-b-ci-images-digest-fix-round-wf_401c564d-6b7.js`),
  started ~20:53 UTC: merge the latest base (43565235, #83) first; D1–D10 below, one commit each, red/green logged, the
  WIP ref pushed as it goes; a verifier per disposition plus a whole-diff adversary (repair loop up to 2); then the
  integrator: base re-merge if moved, trial merges against #42's live head and every live co-001 head touching a cited
  file, the full local suite once, the design's "Fix round" section and `lane-b-ci-images-digest-fix-round.md`, the
  §6.3 read (body untouched; ruler hash must still be 5bb5e558…), ONE push to co-001/ci-images-digest (R3).
- **Dispositions (the recommended option; security the safer; reasons in the script and the fix-round summary):**
  - D1 (CI S1 3/3, security S2 3/3, critic C2-F2): T6 cites producers structurally (step id, job output, matrix key,
    needs, path#symbol), no typed line numbers; workflow `run:` producers fingerprinted (8-hex SHA-256 of the parsed
    scalar: a changed producer fails until its bound is re-read); tool-code producers are NOT fingerprinted (other
    lanes' code; it would turn their base merges red) but name the unit test that proves their bound.
  - D2 (security S1 3/3): any `${{` in any mapping key refused, by a whole-tree walk; T4 fixtures per evaluated place.
  - D3 (CI N4, security N1): a byte sum per environment string (name, `=`, NUL, literals, a numeric bound per
    expression; env.X resolved through scope), refused over 131,072; ci.md's E2BIG wording.
  - D4 (critic C2-F1): the over-limit findings rows pin their exact use sites.
  - D5 (CI N1): T5 without the fixed count of 7.
  - D6 (security N2): the one `$GITHUB_ENV` write closed by name, place and exact line.
  - D7 (security S3 3/3 real; design P2): `DOCKER_BUILD_RECORD_UPLOAD: ${{ github.event_name != 'pull_request' }}` on
    the seven builds (pull-request runs no longer upload a record holding the event, public for 90 days; push and
    release keep it); fallback a 7-day retention if build-push-action v7.4.0 does not honour it.
  - D8 (CI N2) UTF-16 wording; D9 (CI N3) reconciliation-001's C labels; D10 (critic C1-F3) the rule's scope stated.
  - Refuted: CI N5 (folded into D7), security N3 (`name:`/`run-name:` reach no process; by design).
- **Heads (20:50 UTC):** base 43565235 (#83 merged 20:40; no shared file); #42 at 6c28d6a2 (its bce57f16 merge);
  b2a41a00 merges cleanly with both. The orchestrator's rule of 20:36 UTC: merge when verified and green; #86 waits on
  nothing (#82 merged; #91 and P2-trivy come after it and resolve against it).
- **WIP head `b2a41a00`** on `co-001/wip-ci-images-digest` (the PR branch is still 83167b8f): 60a92a70 merge of bce57f16
  (three conflicts, both sides kept, #82 first), 5143563f T6's citations remapped to #82's lines (27 ranges in 47 rows;
  #82 adds no value T3 does not admit), b2a41a00 N29 to N32 (ADR :31 :45 :981 with the "commit messages call it N29"
  sentence, five workflows' comments, ci.md, reconciliation-001, workflows.test.ts). Regeneration changed nothing
  (`pnpm exec tsx tools/screening-capacity/watched.ts --write`, not plain `node`). Checks green: tools tests 32 files /
  456, typecheck, lint, lint:logs, actions:check (offline and BASE), toolchain:check (1 base warning). The merge check
  (fresh clone, adversarial) passed in round 1. #42 be63bdc2 merges with b2a41a00 cleanly.
- **Reviews written:** `approval-summaries/lane-b-ci-images-digest-review-{ci-infra,security-supply}.md`. Confirmed by
  three skeptics each: CI S1 (T6's line citations go stale silently; take P6, structural refs), security S1 (an
  expression in a mapping key is never checked). Confirmed nits: CI N1 (T5 count of 7), N2 (UTF-16 job-output wording),
  N3 (reconciliation-001's C labels), N4 (per-scalar sum, ci.md wording). Refuted: CI N5 (P2 retention; already a
  recorded proposal). Security S2, S3, N1–N3 and the critic were cut off by the 5-hour window at 19:10 UTC and resumed
  at 19:58 UTC (same run, `wf_d3f0da30-f5f`, cached agents replayed).
- **Next:** the fix round (one workflow): every confirmed finding fixed as its skeptics refined it (security the safer),
  the full local suite once, the #42 merge-tree and CI_TREE run, §6.3's read, one push of the merged head to #86 (R3).
- **Started** 2026-11-01 16:57 UTC; a person said "go" in this session at about 17:25 UTC ("Don't be redundant and do
  things that have already passed an ux review"; this change has no screen, so no UX review applies).
- **Machine:** setup OK at 17:26 UTC (Node v24.22.0 after moving the base image's v24.22.1 aside; worktree
  `/home/user/ci-images-digest` at 83167b8f, `pnpm install --frozen-lockfile` done; PG18; Playwright chromium-1248).
- **PR activity:** `subscribe_pr_activity` refused for #86 at 17:25 UTC ("Could not subscribe"); polling with
  `pull_request_read` and the check runs instead.
- **The item is built.** PR #86 is an open draft at **83167b8f** (= `refs/pull/86/head`), author PureTideWater, base
  `claude/build-platform`; CI green on 83167b8f (25 check runs in 5 workflow runs: 23 success, 2 skipped (`notify`,
  `stryker`), `all green`, `mutation`, `screening-capacity gate`, `approval-of-record` among them). No reviews,
  comments or labels.
- **Commits on top of 83d71fd6 (#78)** (every message says "N29"; they stay as they are, no force push):
  eeac99e2 c1 red tests (the PR opened on it); 9ec30e1d c2 the digest lines (R1's head); c9a23640 c3 red, T5;
  96cf5ccc c4 provenance disabled; abe84f0d c5 ADR 0066 N29, ci.md, reconciliation-001; 620ca983 T3 also reads a job's
  `defaults` and a step's `working-directory`; 83167b8f merge of 83d71fd6 (R2's head). WIP refs: none.
- **Runs of record:**
  - **R0 was never run.** GitHub refused the description on the create call at 07:38 UTC ("body is too long (maximum
    is 65536 characters)"): the cap applies on create. The PR opened on eeac99e2 without the ruler; its ci run
    40651583762 was cancelled by R1's push. An edit later accepted 125,892 characters.
  - **R1 passed** on 9ec30e1d: ci 40652135443, `images` job 122694617018.
  - **R2 passed** on 83167b8f: ci 40653896254 (`images` 122700187970), screening-capacity 40653896246 (capacity
    122700247351, gate 122706928679), release-dry-run 40653896300, mutation 40653896273, approval-of-record 40653896226.
    R2's `images` log (read 2026-11-01, 3,037 lines, complete): both `Metadata` groups 780 and 783 bytes with keys
    `buildx.build.ref`, `containerimage.config.digest`, `containerimage.descriptor`, `containerimage.digest`,
    `image.name`; no `buildx.build.provenance`, no ruler row, no "Argument list too long"; `BUILT` web
    `sha256:326bb524…10ae`, worker `sha256:bca9c01c…862e`. The capacity job and both release-dry-run builds show no
    provenance and no ruler.
  - **R2's description:** the pre-push read was lost with the old scratchpad. Reconstruction: the last edit was
    approval-of-record run 40653851814 at 08:01:18 UTC on 9ec30e1d; no other approval-of-record run before R2's
    `synchronize` (40653896226, 08:01:41) or since, so R2's event carried the current body (125,892 characters; inferred).
- **The PR body (read 2026-11-01 17:26 UTC):** 125,892 characters; 25,699 before the ruler, the ruler 100,061
  (`| Row | Characters so far` through the newline after row `1000`), 132 after it; ruler SHA-256
  `5bb5e558463de9bf85c0b6dc560387edbd87a6b45f444d2f6ffe05191a55675f`, re-checked. It is stale: R2 reads "pending" in both
  tables, #42 is named at 46974a25, N29 collides with #82's, P5 unanswered, the footer names the old session.
- **The ruler, saved:** `approval-summaries/lane-b-ci-images-digest-wip/ruler.mjs` generates it (`node ruler.mjs`),
  output checked at 17:27 UTC: 100,061 characters, SHA-256 `5bb5e558…`, and equal to the live body's ruler byte for
  byte. The live body without the ruler: `…-wip/body-2026-11-01-live-without-ruler.md` (a marker where the ruler sits).
- **Design** `designs/lane-b-ci/ci-images-digest.md` (1,205 lines, SHA-256 `3088a50f…a332`), its review folded (16
  items: 14 fixed, S4 in part, N7 moved). Stale but not re-designed (#78 and #82 changed none of its decisions): §9.1
  names #42 at 46974a25 (now be63bdc2), §9.2 #82 at b574d4e8 (merged as bce57f16), line 15 and §8/C9 say N29.
- **#42** (be63bdc2, open) carries the hand-over patch byte for byte (`git apply --check -R` clean at be63bdc2 and
  83167b8f). The patch is the `diff` block in the history below: 49 lines, 3,456 bytes, SHA-256
  `8cf981fbd42a39a00357c293454440774c101699f2cd96a55dc5e0b28eec221f`; it applies forward at 83d71fd6 and 96758e44.
- **#82 merged** at 17:19 UTC as **bce57f16** (checked with `git ls-remote`). Its ADR 0066 uses notices up to N31
  (Part 5: N23 to N31). **N32 is the next free notice**: checked at 17:27 UTC on bce57f16, every `co-001/*` branch,
  #42's be63bdc2 and LANES.md. This branch's N29 is renumbered to N32 in a separate commit after the base merge.
- **The trial merge of bce57f16** (17:27 UTC): conflicts in ADR 0066, reconciliation-001 and
  `tools/test/workflows.test.ts`; ci.yml, release.yml, release-dry-run.yml, release-capacity.yml,
  screening-capacity.yml and ci.md auto-merge.
- **ci-findings-transport** was claimed 2026-10-28 06:55 UTC (LANES.md:199); its own session
  (session_01FcouKQ3BjYKaME5uBLn8Lz) designs it now; its branch is cut after #86 merges.

### Plan from here (the recommended options, with reasons)
1. **Base merge first, then the reviews.** #82 has merged, so this round merges bce57f16 (keeping both sides; #82's
   numbering first) and renumbers N29 to N32 in its own commit, regenerates (`pnpm install --frozen-lockfile`,
   `watched.ts --write`, `pnpm synth --all`), and pushes the result to a WIP ref `co-001/wip-ci-images-digest` (not the
   PR branch). The two reviews (CI and test infrastructure; security and supply chain) then read the tree that will
   merge, so T1–T6 are reviewed against #82's workflows too. Why: reviewing 83167b8f would leave the merge's
   resolution unreviewed, and the round still makes one push to the PR.
2. **Fix round:** every finding fixed as the reviews recommend (security the safer), the full local suite once,
   §6.3's read before the push, **one push** of the merged and fixed head (the PR's merging head), then `images` and
   `capacity` read as runs of record (R3).
3. **One body edit, after R3 is green and recorded (changed from the item file's two edits, recorded why):** the
   corrections (R2 passed, the reconstruction, #42 at be63bdc2 and its 61,992 characters, N29 to N32, P5 answered),
   the reviews, the checks and R3, and the cut of the ruler (body ≈26k, under the 65,536 cap that GitHub applies on
   create) go in a single `update_pull_request` call. Why: the ruler is already live, so R3's `synchronize` event carries
   125,892 characters with no edit at all; every edit that keeps the ruler means re-sending 100,061 characters through
   a model, at a real risk to its bytes and with no gain to the test; the body's facts are in this file and go to the
   reviewers and the verifier directly. If any push is needed after the cut, the ruler goes back first
   (`ruler.mjs`).
4. **Verification** (one agent, fresh clone, reading CI on R3's head) checks the code, CI and the drafted body; then
   the edit, read back; ready; approval-of-record's re-run; merge with method `merge`, `expectedHeadSha`, title
   "Merge pull request #86: <title>", message the title again.

### Waiting on someone
- Founder: nothing blocks the merge (runbook 3i and `APPROVAL_REVIEW_REQUIRED` are the founder's; P1
  `publish-content.yml:55` frozen under F4, for information; P5 answered by the live setting: `merge_commit_title`
  MERGE_MESSAGE, `merge_commit_message` PR_TITLE, which copies no description; changing it stays the founder's).
- Co-founder: none. Lane: none (#82 merged).

### For ci-findings-transport (after #86 merges; by anchor text, not line)
- #86's notice is **ADR 0066 Part 3 N32**. N29 is now #82's Part 5 revert-path notice: do not cite it. Correct the
  transport design's ADR 0071 amendment ("ADR 0066, Part 3, N29" becomes N32) and its other N29 mentions.
- The sentence to rewrite is in N32's "What holds it" bullet, starting "One listed value is over the limit"; re-locate it
  by text at #86's merge commit (the fix round edits nearby text).
- The T6 rows: the two findings rows (FINDINGS_B64 with `over: 'ci-findings-transport'`, and, after D4, their `sites`
  lists), and the "over 98,292 bytes" bound; design §12 P3. Sent to the orchestrator again at the merge with final facts.
<!-- RESUME-BLOCK -->

## History: the 2026-10-28 06:41 UTC block (superseded above; kept for the hand-over patch's `diff` block)
## Current state (2026-10-28 06:41 UTC): design folded; #42's port patch handed over; build starting
- **Design** `designs/lane-b-ci/ci-images-digest.md` (1,205 lines, SHA-256 `3088a50f88fb53a2…a332`), reviewed
  (`designs/lane-b-ci/ci-images-digest-review.md`, 06:17 UTC) and folded (06:19 to 06:37 UTC): 16 items, 14 fixed as
  recommended, 1 fixed in part (S4), 1 moved with the content calendar (N7), none rejected. No COUNTER REQUEST: the one
  numbered item is ADR 0066's notice N29 (after #82's N23 to N28).
- **LANES.md check** (re-read 06:41 UTC): none of the files this change touches (`.github/workflows/{ci,release,
  release-dry-run,release-capacity,screening-capacity}.yml`, `tools/test/workflows.test.ts`, ADR 0066,
  `docs/runbooks/ci.md`, `docs/product/reconciliation-001.md`) is on the "Not while #42 is open" list
  (`LANES.md:84-91`); ADR 0066 and reconciliation-001 are rule 6 shared documents.
- **#42's port (design §9.1, C12), handed over before the build** at 2026-10-28 06:41 UTC, here and by message to the orchestrator.
  #42's head (46974a25) still has the `METADATA` lines (`ci.yml:734`, `:736`, `:746`, `:748`). #42 ports exactly the
  patch below: 49 lines, 3,456 bytes, SHA-256 `8cf981fbd42a39a00357c293454440774c101699f2cd96a55dc5e0b28eec221f`
  (file `scratchpad/imgdigest/handoff/42-port.patch` of this session). `git apply --check` is clean at 165c5993,
  56ed6279, 46974a25 and b574d4e8. This branch's c1 and c2 hold these lines byte for byte, so either merge order is
  clean. If the shape changes after this, the new patch and its SHA-256 go out the same way before any push.
  - **Why `|| '{}'`** (six characters beyond the hand-over's line): the runner evaluates a step's `env` before its
    `if:` (actions/runner v2.338.2 `StepsRunner.cs:114-138`, then `:203-237`) and `fromJSON('')` is an evaluation error
    (`FromJson.cs:16-21`), so without it an identity step whose build failed or was cancelled fails with a JSON error
    instead of skipping; with it an empty output yields `''` and reaches the step's own "nothing it reported" message.
    The new value rule (T3) refuses the unguarded form, so a port of the hand-over's line would fail on the merged tree.
  - **The content calendar moves to its own item.** The design found one other value over 131,072 bytes:
    `content-calendar.yml:78` `FINDINGS_B64` (`needs.check.outputs.findings`, up to 933,336 characters). Its fix left
    this PR for a new item, `ci-findings-transport` (design §12, P3), for the orchestrator to claim and place. This PR's
    T6 table only names it over the limit (`over: 'ci-findings-transport'`). It is latent: the last scheduled run,
    40510094317, succeeded.

```diff
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -731,9 +731,9 @@
           package-manager-cache: false
       - name: The web archive holds the image buildx built
         if: ${{ !cancelled() && steps.web.outcome == 'success' }}
-        env: { METADATA: "${{ steps.web.outputs.metadata }}" }
+        env: { BUILT: "${{ fromJSON(steps.web.outputs.metadata || '{}')['containerimage.config.digest'] }}" }
         run: |
-          built="$(jq -r '."containerimage.config.digest" // empty' <<< "$METADATA")"
+          built="$BUILT"
           read="$(node tools/screening-capacity/image-id.ts "$RUNNER_TEMP/image/web.tar" | jq -r '.config')"
           if [ -z "$built" ] || [ "$read" != "$built" ]; then
             echo "::error title=The web archive::its config digest is ${read:-unreadable}, and buildx built ${built:-nothing it reported}"
@@ -743,9 +743,9 @@
       - name: The worker archive holds the image buildx built, and loads as itself
         id: worker-identity
         if: ${{ !cancelled() && steps.worker.outcome == 'success' }}
-        env: { METADATA: "${{ steps.worker.outputs.metadata }}" }
+        env: { BUILT: "${{ fromJSON(steps.worker.outputs.metadata || '{}')['containerimage.config.digest'] }}" }
         run: |
-          built="$(jq -r '."containerimage.config.digest" // empty' <<< "$METADATA")"
+          built="$BUILT"
           identity="$(node tools/screening-capacity/image-id.ts "$RUNNER_TEMP/image/worker.tar")"
           config="$(jq -r '.config' <<< "$identity")"
           target="$(jq -r '.target // empty' <<< "$identity")"
--- a/tools/test/workflows.test.ts
+++ b/tools/test/workflows.test.ts
@@ -1799,8 +1799,8 @@
     // Each archive's config digest, read from its bytes, is the one buildx reports for its build.
     const web = stepNamed(steps, 'The web archive holds the image buildx built');
     expect(web.if).toBe("${{ !cancelled() && steps.web.outcome == 'success' }}");
-    expect(web.env).toEqual({ METADATA: '${{ steps.web.outputs.metadata }}' });
-    expect(web.run).toContain(`built="$(jq -r '."containerimage.config.digest" // empty' <<< "$METADATA")"`);
+    expect(web.env).toEqual({ BUILT: "${{ fromJSON(steps.web.outputs.metadata || '{}')['containerimage.config.digest'] }}" });
+    expect(web.run).toContain('built="$BUILT"');
     expect(web.run).toContain(`read="$(node tools/screening-capacity/image-id.ts "$RUNNER_TEMP/image/web.tar" | jq -r '.config')"`);
     expect(web.run).toContain('if [ -z "$built" ] || [ "$read" != "$built" ]; then');
     // The worker's too, then it loads as the archive's top-level descriptor on the containerd store (its config digest
@@ -1808,7 +1808,8 @@
     const worker = stepNamed(steps, 'The worker archive holds the image buildx built, and loads as itself');
     expect(worker.id).toBe('worker-identity');
     expect(worker.if).toBe("${{ !cancelled() && steps.worker.outcome == 'success' }}");
-    expect(worker.env).toEqual({ METADATA: '${{ steps.worker.outputs.metadata }}' });
+    expect(worker.env).toEqual({ BUILT: "${{ fromJSON(steps.worker.outputs.metadata || '{}')['containerimage.config.digest'] }}" });
+    expect(worker.run).toContain('built="$BUILT"');
     const script = worker.run ?? '';
     expect(script).toContain('identity="$(node tools/screening-capacity/image-id.ts "$RUNNER_TEMP/image/worker.tar")"');
     expect(script).toContain('docker load --input "$RUNNER_TEMP/image/worker.tar"');
```

- **Build** (builder workflow agent, `scratchpad/imgdigest/progress/build.progress.md`): fast-forward to 56ed6279, then
  c1 (red tests), c2 (the digest lines), c3 (red, T5), c4 (`BUILDX_METADATA_PROVENANCE: disabled` on the seven build
  steps), c5 (ADR 0066 N29, `docs/runbooks/ci.md`, reconciliation-001); red run at 165c5993 and the local proof saved.
- **Earlier (05:30 UTC):** claimed; branch `co-001/ci-images-digest` cut at claude/build-platform 165c5993, worktree
  `/home/user/ci-images-digest` (local; not pushed yet). The defect: `ci.yml`'s two identity steps in `images` pass the
  whole build-push-action metadata into one environment variable (`METADATA`); buildx writes `buildx.build.provenance`
  into it even with `provenance: false`, holding `github_event_payload`, the whole event with the PR description; on
  #42 (95,324 characters) the string reached 132,387 bytes, over Linux's 131,072, so bash never started (job
  122624309161, run 40630123457).
- **Pipeline:** design with one reviewer (done), build (running), draft PR (runs of record R0, R1, R2 with a
  description over 100,000 characters, design §6.3), two adversarial reviews (CI; security), the fix round with the
  full local suite, a fresh-clone verification reading CI, the merge (explicit commit message).
- **Next:** the build's result; then the draft PR and R0.
