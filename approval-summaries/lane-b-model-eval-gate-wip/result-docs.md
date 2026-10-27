# PR C docs part: result (worktree /home/user/contract-phi-check, on 862c9dc8; nothing committed, stashed or reset)

## Files written
- docs/adr/0070-gate-models-...-before-the-model.md
  - Header: Status now names Part 3 (`co-001/contract-phi-check`, #120, the second PR); a "Part 3 amends 0054 a third time" line; Date "Part 3: 2026-10-27"; Deciders Part 3 (session rulings 3, 4, 8; the build, continued 2026-10-27); PRD sections Part 3 (14 PHI minimization and Untrusted input, 16 Threats, MOD-12, reconciliation-001 item 16, ADRs 0048 and 0054). Part 1's note now reads "N4 to N6 are Part 3's (below)".
  - The reserved placeholder is replaced by "## Part 3 (`co-001/contract-phi-check`): checking a contract against the practice's records before the model", with these sections:
    - Context.
    - Decision:
      - the check and its four codes;
      - why no caller can skip it: the required input; the issued-check WeakSet through issue(), frozen; the practice match (screen_invalid); prepared.user is screened; testing.ts kept to tests; the scope binding (M7); the gateway order: serving, flags, the PHI boundary, prepare, the variant, then the screen, before the key, the budget and the call (m3);
      - the algorithm: the records read, the stored-side floors and rules (ruling 4), the tokenizer and its JOIN regex, the whole-token match;
      - the bound SCREEN_MAX_IDENTIFIERS = 50,000 (members + 2 per claim), failing closed. Rulings 3 and 4 are attributed to the build session at ~01:10 UTC on 2026-10-26, under the co-founder's standing ruling of ~00:20 UTC, with the alternatives they rejected;
      - any error is screen_failed;
      - the read as the service screen actor, with the person's contract_screen_requested event joined by request ID (recordContractScreenRequested);
      - the callers: web, worker, harness;
      - the refusal: errors, notices and wording, the m14 disclosure accepted, permitted-run scoring;
      - what is recorded;
      - what is logged: practice_id plus the code, five codes; m15's departure from #120's "the code only";
      - the upload panel (N4).
    - What it gives up: what is not caught, what is falsely refused, what is refused whole above the bound, the audit-transaction gap and the event recorded without reads (the paths builder's open items), and no finer failure trace.
    - Measured: the twin practice gives 0 refusals of 63 at floors 6/6/8, 6/6/6 and 6/6/10. The collision table (date 219/0/7, word 79/0/63, tin 513/10/10, zip4 500/10/10) is from the builder's notes and matches MEASURED in eval/gate.golden.test.ts. Nothing needed re-measuring.
    - Where the build departs from the design: 17 items, every adaptation in the three builders' notes (screen 1-13, paths 1/4/5/6, upload's three).
    - Alternatives; Notices N4, N5, N6.
    - Consequences: F3 before the first practice above the bound; F4; refused_rose after the PR.
    - Revisit when.
    - Tests: the MOD-12 assertedBy files plus lint.test.ts, path.test.ts, the uploader, uploads db and contracts e2e.
  - Open matters: P8 (the specialist guide line) and P9 (the letter screen onto the issued check) added to the proposals. F3 and F4 stay as Lane A's proposals (not built).
- docs/adr/0054-...md: the Status gains "amended 2026-10-27 by 0070, Part 3 ...". A new section "## Amendment (`co-001/contract-phi-check`, 2026-10-27): the contract screen" covers:
  - the kind check kept, and why it fell short;
  - screen(input, prepared, context) and its unchanged place in the order;
  - PatientRecordsCheck and names_patient;
  - the differences from the letter check: issued, practice-bound, read as the service actor, the bound, screen_failed;
  - screen refusals now logged, the letter's more_than_one_patient included;
  - otherPatientRecords unchanged (P9).
- docs/product/PRD.md:
  - PRD 14, PHI minimization: "...data-rights terms), and each contract or exhibit is checked against the practice's records before it is sent: one that holds a member ID, payer claim number or patient control number of the practice's is a misfiled payer letter or EOB, and is refused, never sent."
  - PRD 16, Threats: "a payer letter or EOB filed as a contract (checked against the practice's records before the model, and refused);". Edited inline, as Part 1 edited PRD 14 (N13).
- docs/product/reconciliation-001.md item 16: appended "*Amended 2026-10-27 (`co-001/contract-phi-check`; combined audit #120):* ...". It covers:
  - a misfiled letter or EOB, as a contract or exhibit or inside a zip filed as one;
  - identifiers after a colon, hash or parenthesis, and spaced or hyphenated in groups;
  - a forged, copied or foreign check (screen_invalid);
  - the bound (screen_unavailable, nothing read);
  - the gaps named, and fee-schedule figures sent;
  - measured by MOD-12's tests, not the redteam project (D22).

  #84's amendment and every other lane's text are untouched.
- docs/product/test-matrix.md: the MOD-12 row is added after MOD-11, word for word from matrix.ts. The note under the table now reads "MOD-07 to MOD-12 were added by combined audit items #84 and #120 (docs/adr/0070): MOD-07 to MOD-10 by Part 1, ..., MOD-11 by Part 2, ..., and MOD-12 by Part 3, the check of a contract or exhibit against the practice's records before the model."
- packages/synth/src/cases/registry.ts: MOD-12's assertedBy gains apps/web/src/lib/routes/models-routes.db.test.ts and apps/worker/src/models/permitted.db.test.ts. Both assert the refusal on the web and worker paths. fixtures/synthetic/MOD-12/expected.json was regenerated by `pnpm synth --case MOD-12`; the diff is only those two assertedBy lines.
- docs/runbooks/model-evaluation.md:
  - section 7's refusing list adds refused:screen_failed and refused:screen_invalid;
  - a new paragraph in section 6: names_patient is counted apart from the misses; refused_rose against a report made before the screen (run the served side again on current code); a practice above 50,000 identifiers is refused whole, so leave it out with --practice;
  - "When it goes wrong" gains the four MODEL_INPUT_* codes.

  It was the only runbook that mentions the permitted run's refusals or contract proposals.

## Checks run (under the lock)
- `vitest --project unit packages/synth/src/fixtures.test.ts`: 23/23 pass. Before the regeneration only the MOD-12 expected.json drift failed; the matrix row test passes.
- `vitest --project unit tools/test/placeholders.test.ts tools/test/required-checks.test.ts packages/compliance/src/controls.test.ts packages/synth/src/fixtures.test.ts`: 53/53 pass.

## For the code agent to confirm
1. contract-terms.ts screens `prepared.user`, not `input.pages` (your in-flight change). ADR Part 3 now states this and the frame argument. If you revert it, remove the "What is screened is what would leave" bullet.
2. The lint.test.ts test "no source imports testing.ts but tests, support files, e2e and eval/" is described in Part 3 under "Test helpers stay in tests" and in Tests.
3. The web calls recordContractScreenRequested (departure 13 says the web uses the gateway's writer). Keep it, or edit departure 13 and the "Read as the screen" paragraph.
4. The log codes as written: MODEL_INPUT_NAMES_PATIENT, _SCREEN_UNAVAILABLE, _SCREEN_FAILED (also covers any other screen error), _SCREEN_INVALID, _MORE_THAN_ONE_PATIENT. The runbook lists the first four.
5. The permitted.ts module comment on keeping refused_rose matches the ADR's Consequences and the runbook. If you change permittedRegressions, change both.
6. pnpm synth --all must stay at zero drift after your edits (MOD-12/expected.json now holds 9 assertedBy paths).
7. watched-paths.txt was not regenerated by me; regenerate it once the code is final.
8. Part 3's Tests section uses the builders' figures (50,000 vs 50,001; 25,001 claims; 0 connections vs 1). Correct it if your tests change.

## Not changed, named for the orchestrator (improvements outside this part's files)
- The MOD-12 row, as matrix.ts holds it, drops the design's clause "the upload panel leaves the kind unset", so the uploader tests are not in its assertedBy. Restoring the clause (and adding uploader.test.tsx, uploads.db.test.ts and e2e/contracts.spec.ts to the registry) would make the row cover N4. That changes matrix.ts and the doc together, and I left it as the brief said (word for word).
- README `:446-471` (the model gateway section) could gain one line on the contract screen. Not in this brief's list.
- The status file's handoff "What remains" can tick the docs once committed (the orchestrator's file).
