# Lane B: ci-images-digest (`images` refuses a long pull-request description): status

PR #86, branch `co-001/ci-images-digest`. First handed to the CI session (session_01UzQ6wgZgtThBRBxXTFYhRB) by Lane A's
orchestrator on 2026-10-28 05:45 UTC. Taken back by Lane B's orchestrator (session_01FcouKNNHsdecRMzfTs7XwW) on
2026-11-01 and run from 2026-11-01 16:57 UTC in this item session: session_01FcouKN1UjKZTWt4U9bZjyW
(https://claude.ai/code/session_01FcouKN1UjKZTWt4U9bZjyW). GitHub login `PureTideWater`. No ADR, test-matrix or synth
number reserved or needed (LANES.md:198, "None expected"). Every choice takes the recommended option (security the
safer), recorded here and in the PR description.

Open questions: none.

<!-- RESUME-BLOCK -->
## Current state (2026-11-01 17:33 UTC): records corrected; base merge and two reviews running (workflow wf_d3f0da30-f5f)
- **Running since 17:31 UTC:** workflow `wf_d3f0da30-f5f` (script `workflow-scripts/lane-b-ci-images-digest-merge-review-wf_d3f0da30-f5f.js`): the merge of bce57f16 with the N32 renumber, pushed to the WIP ref `co-001/wip-ci-images-digest` (not the PR); an adversarial merge check (fix loop up to 3); the two reviews (CI and test infrastructure; security and supply chain) on the WIP head, written to `approval-summaries/lane-b-ci-images-digest-review-{ci-infra,security-supply}.md`; three skeptics per B/S finding, one per nit; a completeness critic. Progress files: `approval-summaries/lane-b-ci-images-digest-wip/progress/`. A check-in is scheduled for 22:40 UTC (`trig_01QUE7hkfxkLyv4kzZCS4tcp`); resume a stopped run with resumeFromRunId in this session, or start the stage again from the WIP ref and the progress files.
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

### For ci-findings-transport (after #86 merges)
- design §12 P3; the T6 row `over: 'ci-findings-transport'` (`workflows.test.ts:3239` at 83167b8f); the "over 98,292
  bytes" bound.
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
