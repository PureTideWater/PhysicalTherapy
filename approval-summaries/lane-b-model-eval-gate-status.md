# Lane B: model-eval-gate (#84, #120; LANES queue item 12): status

Session: the parallel Lane B session started by the orchestrator (session_01CntuGR3wkXMF6kK3at6bGh) on the co-founder's direction of 2026-10-25 ~23:40 UTC. Reserved: ADR 0070; test-matrix MOD-7 to MOD-12; `packages/synth` cases MOD-7 to MOD-12.

## Current state (2026-10-28 07:10 UTC)
- **PR #75** (draft), head on origin **871faff9** (no CI: it conflicts with the base). Local, not yet pushed, every state saved on origin: base merge 3 (#74) at a8bf75ca (`co-001/wip-contract-phi-check-4`); **fix 3** at **7f77cb19** (`co-001/wip-contract-phi-check-5`): the kind and ERA system selects keep one width (FIELD_BOX, up to 28rem) whatever is written under them, the placeholder is "Choose a kind", and the uploads page's options take the kind names ("ERA export"); unit 6,698, build, e2e 62; its shots (`lane-b-model-eval-gate-wip/fix/shots5.md`) resolve M4-1 to M4-3 with no regression.
- **The base moved again:** 83d71fd6 (#81 SUITE-CAP-1a; #78, a refused download comes back to its page, UX-010, ADR 0079), conflicting in uploader.tsx, uploader.test.tsx, the uploads page, test-matrix and the synth matrix and registry. **Base merge 4 running:** wf_d798a96c-014 (script `workflow-scripts/lane-b-model-eval-gate-phi-merge-4-wf_d798a96c-014.js`): resolve keeping both, the full checks (4 db shards, e2e), commit (no push), the uploader shots. Asked the orchestrator at 07:15 UTC to hold merges into the base that touch those files until #75 merges.
- **Then:** push once; the description refreshed from the template (P11 in bytes, P12, the order wording, the twin line, the four base merges and their resolutions, fix 3's wording, the counts, CI on the pushed head, the shot findings); verification 2 (fresh clone, reading CI including the 6 mutation shards) in parallel with CI; ready; merge with expectedHeadSha; then #32. Check-in 10:25 UTC (trig_01FQaHehjSSfphdhoEoqqMJU).
- **Gallery** (private): https://claude.ai/artifact/V2B2bKoNPjYivH9h7WV5wK.

## Open questions
None. The co-founder's standing ruling of 2026-10-26 ~00:20 UTC (relayed by the orchestrator): "Don't ask for approvals anymore just build and optimize." Every choice takes the recommended option (security: the safer one), recorded with its reasons here and in the design and PR description. Founder-kept matters stay out of scope; Lane B still opens no migration PR (LANES rule 2).

## Stage
**PR 1 (#84): merged as 88a0e4e9 on 2026-10-26 09:51 UTC. PR 2 (#120): continued 2026-10-27 (entries at the end of this section). Earlier: stopped cleanly at Lane B's wind-down (the orchestrator, 10:09 UTC), built but not integrated; branch `co-001/contract-phi-check` at d7447adb, no PR. Handoff below.**

- 2026-10-25 23:40 UTC: machine set up (`tools/setup-container.sh` printed OK; `gh api user` is PureTideWater).
- 2026-10-25 23:55 UTC: read LANES.md, lane-b.md, CLAUDE.md, reconciliation-001's checks, audit #84 and #120. #42's files: none of this item's (only the shared test-matrix and synth registry, rule 6).
- 2026-10-26 ~00:00 UTC: **Design** in progress: `designs/lane-b-model-eval-gate.md`, one adversarial reviewer (workflow).

- 2026-10-26 00:22 UTC: design scouts done (`designs/lane-b-model-eval-gate/scout-*.md`); author drafting. The PHI scout found that an exact member-ID and patient-control-number check needs decrypting every identifier the practice holds per proposal (no lookup hash), and that a document's kind cannot be corrected after upload: both better fixed by a migration, which goes to Lane A as a proposal.
- 2026-10-26 ~01:05 UTC: **Design done** (wf_82384b40-62a: four scouts, the author, one adversarial reviewer, the revision; 1.63M subagent tokens, 68 min). `designs/lane-b-model-eval-gate.md`, its review `designs/lane-b-model-eval-gate/review.md` (2 blocking, 13 major, 16 minor; every one fixed or rebutted, listed in the design's last section). **No migration** in either PR (design section 12).
- 2026-10-26 ~01:10 UTC: **Session rulings** under the co-founder's ruling of 00:20 UTC (design, "Session rulings"): two PRs, `co-001/model-eval-gate` (#84: the gate, set v2, the new faults, per-feature serving; ADR 0070 Parts 1-2) then `co-001/contract-phi-check` (#120; Part 3), cut after the first merges; `watched-paths.txt` treated as a generated file under rule 6 (regenerated, never hand-merged); Q1 50,000 identifiers; Q2 the stored-side rules; Q3 the large tier generated in CI; F5 (a); F6 CODEOWNERS lines in the first PR.

- 2026-10-26 ~01:20 UTC: **Builders** running (wf_95daa8e9-fea): synth set v2, the gateway core and the docs in parallel; then the eval harness and gate; then serving and the apps; then an integrator (full checks, generated files, commits). Draft PR opens on its first push.

- 2026-10-26 02:17 UTC: build stage 1 done (synth set v2: synth 178/178 tests, fixtures regenerated idempotently; gateway core; docs); stage 2 (the eval harness, gate and faults) half done. The account's 5-hour limit is at 90% (resets ~03:40 UTC): a self check-in at 03:50 UTC (trig_01XpjmcPPR3qYDuBCCPXa6YT) resumes wf_95daa8e9-fea with resumeFromRunId if it stopped. #84's PR comes before #120's (the orchestrator, 02:16 UTC).

- 2026-10-26 03:55 UTC: the 5-hour limit stopped the build at ~02:30 UTC (stage 1's three agents done; eval, serving, apps and integrate failed with the limit). The worker restarted; `setup-container.sh` re-run (both clusters up); wf_95daa8e9-fea resumed with resumeFromRunId (task woijlp7nr), the eval builder continuing from its progress file.

- 2026-10-26 ~04:45 UTC: **Build done** (wf_95daa8e9-fea; summary `approval-summaries/lane-b-model-eval-gate-build-summary.md`). Local, Node 24: typecheck, lint, lint:logs, lint:copy pass; unit 5,095 passed / 3 skipped / 1 failed (a `packages/packets` property-test flake at seed 2019154346, closure unchanged since 6ddd587, passes on rerun: not this PR's); golden 215 passed (~19 s); db files 7 + 15 passed; synth idempotent; engine freeze, verify-content, check:fixtures pass.
- 2026-10-26 ~05:00 UTC: the first push was refused by gitleaks (`generic-api-key` on a report field `twinKey` holding a SHA-256). Renamed to `twinSha256`, re-recorded through the CLI, folded into the two unpushed commits (tree otherwise identical), pushed.
- 2026-10-26 05:05 UTC: **Draft PR #53** (https://github.com/PureTideWater/PhysicalTherapy/pull/53), head 388f213c; description from the template, written with update_pull_request and proved byte for byte; subscribed.
- 2026-10-26 05:08 UTC: **Two adversarial reviews** running (wf_f15d6416-cdd): AI safety and evaluation correctness; security (security-reviewer.md); each finding verified by a skeptic.

- 2026-10-26 05:05 UTC: #53 conflicted with the base (4d99df8: #46, #47). Merged with a merge commit in a separate worktree (rule 6: both lanes' entries kept in matrix.ts, registry.ts, codeowners.test.ts; watched-paths and fixtures regenerated, no change); a3e08b37.
- 2026-10-26 05:10 UTC: CI on a3e08b37: only `unit` red (a new set-v2 test timed out at 5 s on the runner; every db and e2e shard, build, lint, static, images, domain model, mutation, approval-of-record green). Fixed by rendering the set once per describe (3791fec2), pushed.
- 2026-10-26 05:20 UTC: **Reviews done** (wf_f15d6416-cdd; `lane-b-model-eval-gate-review-{ai-safety,security}.md`, findings and verdicts `lane-b-model-eval-gate-review-findings.json`). AI safety: B1 (verified major: the permitted check is skipped after a version change), M1 (--against not tied to the served record), M2 (an omitted scope field silently widens a rate record), M3 (the permitted run mixes the two contract models), m1, m2, m4 confirmed minor, m3 refuted, n1-n4 nits. Security: S1 (unmeasured permitted runs, verified minor), S2 (set v2's NPI/TIN rule, minor), S3 refuted (nit), N1-N4 nits.
- 2026-10-26 05:25 UTC: **Fix round** running (wf_441cf1ff-868): every finding, then the full local suite once, then one push.

- 2026-10-26 05:30 UTC: CI fully green on 3791fec2 (`images` failed once because Trivy's database mirror returned 404, before any scan; commented on #53 and re-run once: green).
- 2026-10-26 ~06:35 UTC: the fix round's three fixers done (every finding fixed with a before/after test; dispositions in the scratchpad's fix/*.md, archived at the end). Then the 5-hour limit stopped the suite integrator mid-suite (typecheck, lint, unit, golden, oracle and db shard 1 done); the worker restarted.
- 2026-10-26 09:00 UTC: `setup-container.sh` re-run (clusters up); wf_441cf1ff-868 resumed (task w3x8gkoi6), the integrator continuing from its progress file.

- 2026-10-26 ~09:20 UTC: **Fix round done** (wf_441cf1ff-868): every finding fixed or dispositioned (table in `lane-b-model-eval-gate-fix-suite.md`; fixers' notes in `lane-b-model-eval-gate-fix-round.md`). Full local suite once at 75954972: typecheck; lint, lint:logs, lint:copy; unit 5,211 passed / 3 skipped (one failure of this PR's, `env.test.ts` on a new message, fixed and rerun); golden 221; oracle 637; test:db 4 shards 9,071 passed / 1 skipped; build + e2e 51 passed; no mutation shard affected; synth idempotent; check:fixtures, verify-content, engine freeze pass. Commits 6b02d05e, bbc13e91, 0e2f7ed9, 75954972.
- 2026-10-26 ~09:35 UTC: base moved (7ef421b, #54); merged with no conflict (rule 6); typecheck, unit 5,231 passed / 3 skipped, console/models/gateway db 54 passed. **Pushed once: head f8e0bb17.** PR description updated (findings table, checks, the new "Not stated" rows reported as wording).
- 2026-10-26 09:45 UTC: CI green on f8e0bb17: every check, the required ones included. Totals from the CI logs: unit 335 files, 5,233 passed, 1 skipped; golden 221; db 4 shards, 120 files, 9,074 passed, 1 skipped; e2e 51.
- 2026-10-26 09:46 UTC: **Fresh-clone verification** (wf_680d870c-6ad, `lane-b-model-eval-gate-verify-summary.md`): code, tests, boundaries and CI pass. It found five description errors (fixed and proved byte for byte) and one #42 file outside the shared list, `infra/test/compute.test.ts` (one line; it merges cleanly with #42's head 13f59b12). The orchestrator ruled at 09:48 UTC to keep it under rule 6, and it is recorded in the description.
- 2026-10-26 09:51 UTC: **#53 merged as 88a0e4e9** (merge commit, expectedHeadSha f8e0bb17). Unsubscribed; worktree and local branch removed; main checkout fast-forwarded and installed.
- Next: **the second PR, `co-001/contract-phi-check`** (#120, ADR 0070 Part 3, MOD-12), from 88a0e4e9.
- 2026-10-26 ~10:00 UTC: worktree `/home/user/contract-phi-check` at 88a0e4e9; **builders** running (wf_f44416d7-444): the gateway screen and its synthetic twins, the web and worker call paths, the upload panel; then an integrator (docs, full suite once, commits). #42's overlap: only the shared docs (its e2e helpers are left alone).

- 2026-10-26 10:09 UTC: wind-down (the orchestrator: weekly usage 90%, Lane B handed to Lane A). The three builders of wf_f44416d7-444 were let finish; the workflow was stopped at ~10:23 UTC as its integrator started (it had only listed files, and edited none). The tree typechecks (22 projects). Committed in three parts and pushed: **d7447adb**. No PR opened.

- 2026-10-27 ~01:43 UTC: **Continued** by a parallel Lane B item session (session_017SNqG4nQbbt6xqEG1ZDKe6), started by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg) on the co-founder's instruction of 2026-10-27, from `lanes/lane-b-session-brief.md`. Machine: `setup-container.sh` OK except Playwright's browser (the proxy refuses storage.googleapis.com; known); `gh api user` is PureTideWater. Worktree `/home/user/contract-phi-check` at d7447adb.
- 2026-10-27 ~01:43 UTC: **Base merged** (rule 6): `claude/build-platform` at e908c214 (171 commits) into the branch with a merge commit, 862c9dc8 (local, not yet pushed). One conflict, `packages/synth/src/cases/workflow.ts`'s imports, both sides kept. Lockfile and `watched-paths.txt` regenerated, unchanged. Typecheck 22 projects pass. Next: the integrator (workflow).

- 2026-10-27 01:44 UTC: **Integrator** running (wf_cedc1f41-ac5, script `workflow-scripts/lane-b-model-eval-gate-phi-integrate-wf_cedc1f41-ac5.js`): settle-code and docs in parallel, then the suite agent (synth twice, eval, the full local suite once, commits, no push). Progress files in this session's scratchpad `phi/progress/`. Check-in scheduled 06:54 UTC (trig_01EfQw1T4BDozVefFYChaFQm) to resume it with resumeFromRunId if the 5-hour limit stops it.
- 2026-10-27 01:51 UTC: **Pause** (the orchestrator, 01:50 UTC, relaying the co-founder: weekly usage 94%, resets 14:00 UTC, #42 first): the running integrator is let finish; no new workflow until 14:05 UTC. The 06:54 check-in was cancelled; a check-in at 2026-10-27T14:05:00Z (trig_01PqXoVpjkq7fjs88tiff7Do) resumes from this file (resumeFromRunId wf_cedc1f41-ac5 if the limit stopped it).
- 2026-10-27 02:37 UTC: **Integrator done** (wf_cedc1f41-ac5; 3 agents, 52 min). Settled: the screen checks `prepared.user` (what is sent), closing a getter-pages bypass (test fails without it); the web's event through `recordContractScreenRequested`; `@tp/model-gateway/testing` kept to tests (lint.test.ts); refused_rose kept fail closed (documented, pinned). Docs: ADR 0070 Part 3 (19 departures recorded), ADR 0054 amendment, PRD 14/16, reconciliation-001 item 16, MOD-12 row, the model-evaluation runbook. Full local suite once on 9b7eadfe: typecheck 22; lint, lint:logs, lint:copy; unit 381 files, 6,292 passed / 33 skipped (two of this PR's failures fixed first: the brand colour scan read "#120" as hex, so comments cite "combined audit item 120"; edi835's zip test read MOD-12's non-835 zip); golden 380; oracle 688 fixtures agree; test:db 4 shards, 128 files, 9,234 passed / 2 skipped; build; e2e 54 passed; mutation: no money path affected; check:fixtures, verify-content, engine freeze pass; synth twice idempotent; eval gate passed. Commits 25be3ab6, 11ab0b86, 9b7eadfe, **pushed** (no PR, no CI). Holding until 14:05 UTC per the orchestrator.
- 2026-10-27 14:13 UTC: **Resumed** after the weekly reset; setup re-run, OK (playwright ok). Base unchanged (e908c214).
- 2026-10-27 14:16 UTC: **Draft PR #75** opened, head 9b7eadfe; description written with update_pull_request, proved byte for byte; subscribed.
- 2026-10-27 14:18 UTC: **Reviews** running (wf_85f2ff34-1ed): security, PHI-screen correctness, and the UX and brand review on base/head shots (the PR changes the upload panel and two contract-page notices, so a person sees it).
- 2026-10-27 14:36 UTC: **The orchestrator's ruling** on #75's CI: the three flaky tests (workflows.test.ts:880, rerun-rule.property.test.ts:233-253, verifier.test.ts:384) are Lane B's `co-001/test-flakes` (session_019i9ifAWsQ6zhLLegnMqSdK); #75 keeps its scope; a head whose only red is one of them gets one re-run of the failed job, never a merge on red; once test-flakes merges, merge the base in as usual.
- 2026-10-27 ~15:50 UTC: **Reviews done**; gallery published. 16:33 UTC: **fix round** running (wf_aa0fc3e3-0ae).

## Handoff: `co-001/contract-phi-check` (#120), for whoever takes it
- **Branch:** `co-001/contract-phi-check` at **d7447adb**, from `claude/build-platform` at 88a0e4e9 (#53 merged). Commits:
  - 5196f92a: the screen;
  - fc74ee16: the call paths;
  - d7447adb: the upload panel.

  The local worktree is removed; the branch lives on origin.
- **Design:** `designs/lane-b-model-eval-gate.md`: section 5 (PR C), Appendix A.3, the review dispositions M7, M8, M9, M12, m3, m9, m14 and m15, and the "Session rulings" 1, 3, 4 and 8. Part 3 of ADR 0070 is reserved for it, and test-matrix row **MOD-12** with synth case MOD-12. The builders' notes, file by file, are in `approval-summaries/lane-b-model-eval-gate-phi-build.md`.
- **Built** (each part narrowly tested by its builder; see the notes):
  - **The screen** (`packages/model-gateway`, `packages/synth`):
    - `src/patient-records.ts`: `PatientRecordsCheck`, `practiceRecordsCheck` (bound to the caller's scope, read through its own job scope as the screen actor, bounded by `SCREEN_MAX_IDENTIFIERS` = 50,000), `syntheticRecordsCheck`, and the issued-check WeakSet;
    - `redact.ts`: `identifierRuns` and `SCREEN_FLOORS` (6, 6 and 8 characters, a digit required, calendar dates dropped);
    - `contractTermsSpec.screen`, with `ContractPagesInput.patientRecords` required;
    - `spec.ts`'s screen context, and `gateway.ts` logging a refusal with the code only (#53's serving order kept);
    - the harness on the synthetic check;
    - `packages/synth/src/screen/patient-twins.ts`: a large synthetic practice and the collision classes;
    - MOD-12's case and fixtures;
    - tests: redact, patient-records (unit and db), contract-terms, gateway (unit and db), lint, golden.
  - **The call paths:**
    - `contract-proposals.ts` builds the check after the role check and records the person's `contract_screen_requested` event;
    - `path.ts` and `notices.ts` add `names_patient` and `screen_unavailable` (which also covers `screen_failed`), with wording to report in the PR: "This document names a patient of the practice, so it was not sent to the model. Enter its terms by hand. If it is a payer letter or an EOB, it was filed as the wrong kind." and "This document could not be checked for patient details, so it was not sent to the model. Enter its terms by hand.";
    - the worker's permitted run builds one check per practice per run;
    - tests: models-routes db, permitted db, and `path.test.ts`.
  - **The upload panel:**
    - `uploader.tsx` starts with no kind when it offers more than one, with a disabled placeholder "Choose the kind of document" and the refusal "Choose the kind of document first, then choose the files again.";
    - the contracts and reconciliation pages take the union of the offered kinds' types, and the uploads page keeps its 835 default;
    - tests: `uploader.test.tsx`, uploads db, and the contracts e2e.
- **What remains, in order** (LANES rule 1's pipeline):
  1. **The integration:** settle anything left between the parts (each builder's notes list its open items). Write the docs: ADR 0070 Part 3; the ADR 0054 amendment for the screen step; PRD 14 and 16; reconciliation-001 item 16 (PR 16's red team); test-matrix MOD-12, matched in synth `matrix.ts` and `registry.ts`. Run `pnpm synth --all` twice, check that the eval gate still passes, and regenerate `watched-paths.txt`.
  2. **The full local suite once**, in lane-b.md's order.
  3. **The draft PR** into `claude/build-platform`, its description from the template, reporting the wording above.
  4. **Two adversarial reviews:** the security-reviewer (PHI, the gateway boundary, tenant isolation, logs) and an AI-safety and PHI-screen correctness review (false positives and negatives by collision class, the bound, the skip-proof enforcement).
  5. **The fix round**, then **the fresh-clone verification that reads CI**.
  6. **The merge** (rule 6: merge the latest base in first; #42's shared docs are kept on both sides; the #42 e2e helpers are left alone).
- **Not part of it:** F3 (lookup-hash columns, the scalable form of this check) and F4 (correcting a document's kind) are Lane A's migrations ("Handed to Lane A").

## Proposals outside this PR
- `apps/worker/src/price/rerun-rule.property.test.ts:233-253` (#50's PRC-25 to PRC-28 property): its after-run coverage check (every outcome reached at least once) depends on fast-check's unseeded random sequences; on #75's re-run (job 122247109398) `accept:changed_meanwhile` was reached 0 times in 3,000 runs and `unit` failed. Fix: `examples:` with one fixed sequence that reaches each listed outcome (the `:539` unit case builds one), or a pinned seed. Commented on #75.
- `tools/test/workflows.test.ts:880` (and the other notify tests that run the step's script against a fake `gh`): an explicit timeout (e.g. 30 s). On #75's first CI run (ci 40519277562, job 122241596089) the content-calendar notify test timed out at vitest's default 5 s inside the simulated-Dependabot nested run, failing `unit`; the file is not this PR's, and the base was green. Commented on #75; one re-run of the failed job.
- `packages/packets/src/verifier.test.ts:384`: the property's `fc.pre` should leave out the pattern's procedure codes (any code-shaped number), so a random count equal to a code cannot fail it (seen at seed 2019154346).
- A CLI option to run the twins twice and compare them, in place of the runbook's manual comparison.

## For the founder (founder-kept; nothing waits on them)
- **F1:** the per-field recall and precision floors (`eval/floors.json` ships unset; production refuses a real provider until set). Before the first real-model baseline run.
- **F2:** whether the data-rights addendum covers keeping an accepted, uncorrected proposal as an evaluation example (legal text). Not built until ruled.

## Proposals for Lane A (migrations; the orchestrator writes LANES.md)
- **F3:** compact keyed lookup hashes on `patient_ref.member_id`, `claim.patient_control_number` and `claim.payer_claim_control_number`, a backfill, and a SECURITY DEFINER boolean screen function that audits one screen event and only matched rows. #120's best option; PR C is the bounded fail-closed interim (refuses above 50,000 identifiers).
- **F4:** a reviewed, audited correction of a document's kind (today `source_document.kind` is immutable and a re-upload is a held duplicate).
- LANES.md's claim row: "MOD-7 to MOD-12" reads MOD-07 to MOD-12.

## Waiting on someone
- **The person: storage.googleapis.com** (the network policy refuses Playwright's pinned Chromium). Local e2e and the UX review's screenshots wait on it; CI's e2e is the record for tests. Everything else proceeds.

## Next step
See "Resume at 14:05 UTC" at the top. (Earlier:) The integrator (workflow) in `/home/user/contract-phi-check` on 862c9dc8: settle the parts, write the docs (ADR 0070 Part 3, the ADR 0054 amendment, PRD 14 and 16, reconciliation-001 item 16, MOD-12), synth twice, the eval gate, the full local suite once (e2e left to CI while the browser is missing), commits; then push and the draft PR.
