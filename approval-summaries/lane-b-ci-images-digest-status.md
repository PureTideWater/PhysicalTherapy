# Lane B: ci-images-digest (`images` refuses a long pull-request description): status

An item handed to this Lane B session (session_01UzQ6wgZgtThBRBxXTFYhRB, ci-browser then P1, P2, P4) by Lane A's
orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg) on 2026-10-28 at 05:45 UTC, ahead of #82's later stages and in parallel
with #82's fix round. Branch `co-001/ci-images-digest`; no ADR or test-matrix number expected (a COUNTER REQUEST goes at
the top of this file if one turns out to be needed). Every choice takes the recommended option (security the safer),
recorded here and in the PR description.

Open questions: none.

<!-- RESUME-BLOCK -->
## Current state (2026-10-28 05:30 UTC): claimed; branch cut; design, build and draft PR running
- **The defect** (the orchestrator's evidence: #42's job 122624309161, run 40630123457): `ci.yml`'s two identity steps
  in `images` (`:734`, `:746` at 165c5993, from #77) pass the whole build-push-action metadata into one environment
  variable (`METADATA`). buildx writes `buildx.build.provenance` into it even with `provenance: false`, holding
  `github_event_payload`, the whole event with the PR description; on #42 (95,324 characters) it reached 132,387
  bytes, over Linux's 131,072-byte limit for one environment string, so bash never started ("Argument list too
  long"). Push runs pass; a re-run reuses the event.
- **Branch** `co-001/ci-images-digest` cut at claude/build-platform **165c5993**, worktree `/home/user/ci-images-digest`
  (local; not pushed yet).
- **Recommended fix (the orchestrator's):** each step takes only the digest it uses in the expression
  (`fromJSON(steps.web.outputs.metadata)['containerimage.config.digest']`), the test pins updated
  (`tools/test/workflows.test.ts` `:1802`, `:1803`, `:1811`), a test that no step's `env` takes a whole
  `steps.*.outputs.metadata` or a `github.event` object, and `BUILDX_METADATA_PROVENANCE: disabled` evaluated on the
  build steps (taken if it holds, recorded either way). The CI run of record is a pull_request run whose event carries
  a description over 100,000 characters.
- **Pipeline:** design with one reviewer, build, draft PR, two adversarial reviews (CI; security), the fix round with
  the full local suite, a fresh-clone verification reading CI, the merge. #42 ports the digest lines and test pins;
  if the shape changes after review, the final diff goes to the orchestrator.
- **Next:** the design-to-reviews workflow (archived as `workflow-scripts/lane-b-ci-images-digest-*.js`).
<!-- RESUME-BLOCK -->
