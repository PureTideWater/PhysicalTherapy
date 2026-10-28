# Lane B: ci-images-digest (`images` refuses a long pull-request description): status

An item handed to this Lane B session (session_01UzQ6wgZgtThBRBxXTFYhRB, ci-browser then P1, P2, P4) by Lane A's
orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg) on 2026-10-28 at 05:45 UTC, ahead of #82's later stages and in parallel
with #82's fix round. Branch `co-001/ci-images-digest`; no ADR or test-matrix number expected (a COUNTER REQUEST goes at
the top of this file if one turns out to be needed). Every choice takes the recommended option (security the safer),
recorded here and in the PR description.

Open questions: none.

<!-- RESUME-BLOCK -->
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
<!-- RESUME-BLOCK -->
