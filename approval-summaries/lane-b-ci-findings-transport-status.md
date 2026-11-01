# Lane B: ci-findings-transport (the content calendar's findings could exceed one environment string): status

Created 2026-11-01T14:50:00Z by Lane B's orchestrator (session_01FcouKNNHsdecRMzfTs7XwW), which took the item back on
2026-11-01; it runs in its own item session (prompt `lanes/lane-b-item-prompts-2026-11-01/ci-findings-transport.md`).
Session: session_01FcouKQ3BjYKaME5uBLn8Lz (https://claude.ai/code/session_01FcouKQ3BjYKaME5uBLn8Lz), started 2026-11-01 16:57 UTC. Claimed in LANES.md on 2026-10-28 at
06:55 UTC; branch `co-001/ci-findings-transport` (not on origin; cut after #86 merges). Reserved: test-matrix CI-30 to CI-31,
only if a row is needed, with their `packages/synth` registry cases (allocated 2026-11-01 14:50 UTC in the claim row); no new
ADR expected (ADR 0071 amended; ADR 0066's Part 3 sentence at `:982-983` on #86 edited). Any other number goes in a
"COUNTER REQUEST: <what>" line at the top of this file. No migration expected. Every choice takes the recommended option
(security the safer), recorded here and in the PR description.

Open questions: none.

<!-- RESUME-BLOCK -->
## Current state (2026-11-01T17:47:59Z): design done; waiting on #86's merge
- **Stage: design done (folded); waiting on #86.** Workflow wf_963d4fd3-855 (33 agents: author, adversarial reviewer
  for CI/test infrastructure with the security lens on notify, two skeptics per finding, fold, completeness critic,
  second fold), archived as `workflow-scripts/lane-b-ci-findings-transport-design-wf_963d4fd3-855.js`.
  - Design `designs/lane-b-ci/ci-findings-transport.md` (SHA-256 `074b5432…`), review
    `designs/lane-b-ci/ci-findings-transport-review.md` (`896aca92…`), local proof in
    `designs/lane-b-ci/ci-findings-transport/proof/` (`local-proof.txt`, `scripts/prove.mjs`, `work/*.sh`).
  - Review: 14 findings (S1-S6, N1-N8), each held real by its skeptics, all fixed (11 with a skeptic's better fix);
    critic: 3 gaps (G1 CI-10 timeout table, G2 T-O's unreachable title case, G3 the 1 MiB step-summary citation), all fixed.
- **Choice (recommended option, recorded with reasons in the design §4):** the run's own artifact. check uploads
  `findings.json` as artifact `findings` with the repository's existing pin `actions/upload-artifact@cf430e03 # v7.0.2`
  (no new pin, so #82's floor does not apply), retention 1 day, `overwrite: true`, `if-no-files-found: error`; notify
  reads it with `gh run download "$GITHUB_RUN_ID" -n findings` (three tries 10 s apart, size refused past the bound),
  every failure into "Content calendar check failing"; notify's permissions exactly `{ actions: read, issues: write }`,
  still no `uses:`, no checkout, no repository code. A new `handoff` job (pull requests only, `{ actions: read }`,
  no `uses:`, same download lines held equal by T-H) makes the PR's own run the first run of record; the merge's push
  run is the second. Why the others lose: job outputs (1 MB as UTF-16) hold only 9 worst-case findings (so
  `FINDINGS_B64_0.._3` and a check-side selection both fail P3); a body budget cuts what issues say; download-artifact
  would put third-party Node code beside the write token.
- **Numbers:** worst entry 37,575 bytes (6 bytes a unit when JSON-escaped), at most 41 findings (T-K property test),
  worst file 1,540,660 bytes; `MAX_FILE_BYTES` 700,000 → 2,000,000; `MAX_TITLE` 256; "not filed" lists at most 200
  titles (`MAX_LISTED`, a visible line past it, reported under the wording ruling). No migration, no new ADR, no
  COUNTER REQUEST; CI-30/CI-31 not taken (RCC-08's assertion gains a clause; `fixtures/synthetic/RCC-08/expected.json`
  regenerated with `pnpm synth --all`). ADR 0071 amended; ADR 0066 Part 3 sentence; `ci.md`, `content-updates.md`,
  reconciliation-001.
- **Proposals (outside):** P1 the calendar schema refuses two entries with one title; P4 (for #86's owner) a ci.md
  `:130-132` clause on jobs that report failure as an issue.
- **Heads at 2026-11-01T17:47:59Z:** #82 merged (9db52a2b); #86 open at 83167b8f, not merged; base 83d71fd6.
- **Next:** poll #86 (`gh api repos/PureTideWater/PhysicalTherapy/pulls/86 --jq '.merged, .merge_commit_sha'`, send_later
  check-ins; do not subscribe to #86). After it merges: re-read the design against the merge commit (T3, T6,
  expectQuietNotify, CI-10 line numbers; adapt `lane-b-ci-pin-age-reread-wf_05b5c43a-d57.js` if anything moved), cut
  and push the branch, setup with `co-001/ci-findings-transport:/home/user/ci-findings-transport`, build red first
  (adapt `lane-b-ci-pin-age-build-wf_6cbdbf9d-9c3.js`), draft PR, subscribe.
- **Waiting on someone:** none (#86's merge only).
<!-- RESUME-BLOCK -->

## Log (UTC)
- 2026-11-01T14:50:00Z: created by Lane B's orchestrator; CI-30 to CI-31 reserved in the claim row (only if a row is needed).
  The item session starts now.
- 2026-11-01T16:59:14Z: session session_01FcouKQ3BjYKaME5uBLn8Lz started; setup OK (GitHub login PureTideWater); the design workflow starts.
- 2026-11-01T17:47:59Z: design done (wf_963d4fd3-855; design 074b5432…, review 896aca92…); artifact transport chosen; waiting on #86.
