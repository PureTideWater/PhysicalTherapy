# PART check 4: PR #75 (co-001/contract-phi-check), the merge of claude/build-platform 165c5993 (#74) checked and committed

- **Worktree:** /home/user/contract-phi-check.
- **New head:** `a8bf75ca`, the docs commit. Under it is `26388626`, the merge commit (parents 871faff9 and 165c5993).
- **Nothing is pushed.** origin/co-001/contract-phi-check is still 871faff9, confirmed with `git ls-remote`. Nothing was rebased or forced. The tree is clean.
- **Paths:**
  - progress: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/progress/check4.md
  - logs: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/check4-logs/
    - the pre-commit runs of `affected` and `freeze` are in `before-commit/`;
    - `adr-edits.diff` holds the ADR edits;
    - `sides.log` holds the line-by-line side check.
  - scripts: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/check4-scripts/ (`run.sh`, `db-shards.sh`, `e2e.sh`, `sides.py`). The db and e2e scripts refuse a database name that already exists, so they never drop a database they did not create.
  - commit messages: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/check4-work/ (`merge-msg.txt`, `docs-msg.txt`)
- This run did not resume an earlier one: no check4 progress file existed when it started.

## Adversarial re-read of the resolution

I read `git diff --cached HEAD` and `git diff --cached origin/claude/build-platform`. I then compared the files both sides changed, line by line, against the base a6e754fc (`sides.py`).

- **File sets.**
  - #74's 113 files, plus `uploader.test.tsx`, are exactly the merge's 114 paths against HEAD.
  - #75's 75 files are exactly the merge's 75 paths against the base.
  - Every file only one side changed has that side's blob, except `uploader.test.tsx`, which was edited on purpose.
- **Files both sides changed (8).** contracts.spec.ts, the version page, the reconciliation page, test-matrix.md, matrix.ts, registry.ts and watched-paths.txt keep every line either side added.
- **uploader.tsx.** The only side lines missing from it are the unified ones:
  - #75's hand-written aria-invalid and aria-describedby became `controlMarks`.
  - #75's `<p role="alert">` became `FieldError` inside a `<div key={attempt} role="alert">`.
  - #75's `-help` paragraphs became `Hint`.
  - #75's `aria-invalid:border-destructive` is gone; styles.css's unlayered 2 px rule draws that border now.
  - #74's `Hint` import is now `Hint, controlMarks`.
  - #74's inline system hint is now `FORMAT_HELP`, with the same words.
  - **#79:** every `min-w-0`/`max-w-full` wrapper, `max-w-full` select and `break-all` list is kept.
  - **#74:** the file input's `tabIndex={-1}` and `aria-hidden`, and the 14 px note under an unconfirmed format, are kept.
  - **#80:** comes in only through the base, unchanged.
- **No bypass of the contract screen.**
  - None of #74's files touches the gateway, the screen, the model routes or `lib/models`.
  - On the version page, the only change to the propose form is #74's `CheckboxField` for `ambiguous`. It posts `on` as before. The form's action and its document field are unchanged.
  - The console models page only loses its `labels` prop.
  - #74 removed `ActionState.problems` and stopped exporting `guardMessage`. Nothing of #75's uses either; typecheck confirms.
  - The screen files are #75's blobs.
- **No accessibility regression in the uploader.**
  - The labels are unchanged (`htmlFor` upload-kind and upload-format).
  - `controlMarks` sets `aria-invalid` only while the words show. The description reads the words first, then the help, as before.
  - `FieldError` has no live region of its own, so each attempt is announced once, by the keyed alert div.
  - The icon and "Error:" are aria-hidden. Both the alert and the description therefore read the words alone, and `#upload-*-error` holds the words alone.
  - `Button` and `Card` take `ref` as a React 19 prop, so `focusNext` still lands on Upload, "Choose files" and "This batch".
  - The e2e assertions still match: contracts held files (`aria-invalid`, the description, `#upload-kind-error` text, focus on Clear and Upload), era-exports `#upload-format-error`, and uploads' system description at 390 px. All passed (below).
- **Boundaries.**
  - Against the base, nothing changes under packages/pricing, packages/ledger, content/releases, fixtures/golden, migrations or domain-model.
  - No migration was added.
  - None of #42's files is touched.
  - No model name or identifier appears in any line this merge or the docs commit adds.
  - All data is synthetic.

**Findings:** none in the code. The ADR text needed two updates, below.

## ADR updates (docs commit a8bf75ca; rule 6, #74's text kept)

- **ADR 0070 Part 3, the upload panel's first bullet.** One sentence was added: the waiting select's mark, words and help are the ones every refused field shows (ADR 0077, D3 and D9: `controlMarks`; `FieldError`, with "Error:" and its icon beside the words; `Hint`, at 14 px). The alert around the words belongs to the panel, since `FieldError` announces nothing itself. The rest of the paragraph was still accurate.
- **ADR 0077 D9.** The list of hand-written controls whose hints use the shared `Hint` now names "the uploader's kind and system lists"; it used to name the system list alone. Lines 145 to 147 were rewrapped, and #74's words are otherwise verbatim.

## Commands

All ran in the worktree with `PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH:/opt/node22/bin`. Every heavy command ran under `flock /tmp/laneb-heavy.lock`, one at a time.

| Command | Printed totals |
| --- | --- |
| `pnpm typecheck` | passed, 22 projects in 20.7 s wall. The tsc incremental cache was warm for all 22: no source changed since merge3's full run. Exit 0 |
| `pnpm lint` | passed, 1,650 files in 3 groups, 0 errors, 0 warnings, 98.3 s wall |
| `pnpm lint:logs` | 1068 files scanned; every log call uses allowlisted fields |
| `pnpm lint:copy` | 519 files read; the product copy keeps the brand's words |
| `pnpm test` | Test Files 398 passed (398); Tests 6697 passed, 4 skipped (6701); 270.69 s; exit 0. Nothing failed, so workflows.test.ts, rerun-rule.property.test.ts and packets' verifier.test.ts all passed and nothing was rerun. The stderr line `sha256sum … icudtl.dat: Input/output error` is browser-build.test.ts's deliberate stand-in. The engine-freeze differential is skipped because ENGINE_FREEZE_BASE is unset, as before |
| `pnpm test:golden` | Test Files 5 passed (5); Tests 381 passed (381); 31.16 s |
| `pnpm --filter @tp/model-gateway eval` | **gate: passed.** 63 documents, precision 0.996941, recall 0.996941, quotes off their page 0; tp 2607, wrong 5, extra 0, rejected 3; wrong but verified on faithful cases 0; 9 conflict pairs, none unflagged; 3 twins, none differing; tier large 1.000000 (tp 827); narratives 300 of 300 without a critical error |
| `pnpm synth --all` | 254 cases: 0 files written, 654 unchanged, 0 removed. 8 EMR formats: 0 written, 16 unchanged, 0 removed. Writes nothing |
| `pnpm exec tsx tools/screening-capacity/watched.ts --write` | 537 lines; `watched-paths.txt` unchanged |
| `pnpm db:migrate && pnpm test:db --shard=1/4` on fresh `phi_check4_db1` | 44 migrations, 0 already applied. 32 files passed; 3155 passed, 1 skipped (3156); 162.27 s |
| … `--shard=2/4` on fresh `phi_check4_db2` | 32 files passed; 2064 passed (2064); 145.88 s |
| … `--shard=3/4` on fresh `phi_check4_db3` | 32 files passed; 3100 passed (3100); 249.42 s |
| … `--shard=4/4` on fresh `phi_check4_db4` | 32 files passed; 929 passed (929); 128.19 s |
| (shard check) | The four JSON lists hold 128 files, each once, equal to every tracked `*.db.test.ts`. Each database was dropped WITH (FORCE) after its shard |
| `tsx tools/stryker/affected.ts --event pull_request --base origin/claude/build-platform` | before the commit, diffed from a6e754fc; after it, diffed from 165c5993. Both runs gave the same result: money not affected; ledger not affected; **pricing and packets affected** by `packages/db/src/authz/index.ts`, `authz/scope.ts`, `connect.ts` and `runtime.ts` (imported) |
| `tsx tools/engine-freeze/check.ts origin/claude/build-platform`, before and after the commit | no non-test file under packages/pricing/src changes; let through by the exception: nothing; problems: none |
| `pnpm check:fixtures` | 341 files read by the guard and 3847 text files searched for an X12 header; every interchange is synthetic |
| `pnpm verify-content` | every content set passes (content/drafts: 10 records, no problems) |
| `pnpm build` | exit 0 in 74 s (web and worker) |
| `git rev-parse HEAD > apps/web/.next/BUILD_COMMIT` | a8bf75ca… |
| `E2E_PREBUILT=1 DATABASE_URL=postgres://postgres:test@localhost:5433/postgres E2E_DATABASE=phi_check4_e2e E2E_PORT=3198 pnpm test:e2e --workers=2` | **62 passed (9.1m); exit 0.** Included: contracts.spec (held files), era-exports.spec (4 tests), uploads.spec (3 tests, including FRM-08 at 390 px with the ERA system list shown), forms-keep-input.spec (6 tests), models.spec, and both tables-phone tours. `phi_check4_e2e` was dropped; tp_e2e was not touched |
| `gitleaks git --log-opts="871faff9..HEAD" --no-banner` (pinned 8.24.3) | 9 commits scanned, ~426.76 KB in 271 ms, no leaks found; exit 0. The range holds 15 commits, but gitleaks' plain log shows no merge diff; the hook's check (next row) covers the merge's resolution |
| `.githooks/pre-push origin <url>`, run standalone; stdin `refs/heads/co-001/contract-phi-check a8bf75ca… refs/heads/co-001/contract-phi-check 871faff9…` | "2 commits checked: 0 file(s) read by the fixture guard, 11 text file(s) searched for an X12 header, and gitleaks found no secret."; exit 0; nothing pushed |

The databases left at localhost:5433 are the ones that were there before: postgres, tp_e2e, tp_e2e_ux and three tp_test_*. There were no findings, so nothing was amended.

## Commits (not pushed)

- **`26388626`** Merge claude/build-platform (165c5993: #74 forms keep what the person typed) into co-001/contract-phi-check
  - Parents 871faff9 and 165c5993. 114 paths against HEAD and 75 against the base.
  - The body names the one conflict: uploader.tsx, two hunks on the ERA system select. It says what each side kept.
  - It names what was unified through #74's helpers:
    - `controlMarks`;
    - `FieldError` in an alert keyed by the attempt;
    - `Hint`, with the ids now `-hint`;
    - the border rule;
    - `formatProblem`.
  - It says focus was not unified, and why.
  - It names the change to uploader.test.tsx and the auto-merged files checked by hand: contracts.spec, the version page, the reconciliation page, test-matrix, matrix.ts and registry.ts.
  - It names the files regenerated with their tools, none of which needed staging: the lockfile, watched-paths and the synth fixtures.
  - It ends, after a blank line, with exactly the two lines (Co-Authored-By, Claude-Session).
- **`a8bf75ca`** docs: ADR 0070 Part 3 and ADR 0077 after the merge of #74 (the uploader's shared marks, words and hints)
  - 2 files, +6 −4. It ends with the same two lines.

## Mutation shards CI will run

packets-scan, packets-rest, packets-explain, pricing-engine, pricing-recompute and pricing-rest. They are triggered by #75's packages/db changes (`authz/index.ts`, `authz/scope.ts`, `connect.ts`, `runtime.ts`), the same as in check 3. money and ledger are not affected. The shards were not run locally.

## Open items

1. **Push.** a8bf75ca is ready for the orchestrator to push through the hook (`git push origin co-001/contract-phi-check`). The pre-push check passes standalone.
2. **Focus is not shared.** #74 exports no focus helper for a control outside `ActionForm`, so the uploader keeps its own `focusNext`. If #74's follow-up exports one (D4), the uploader can adopt it.
3. **Screen readers were not checked by hand.** This is the same as ADR 0077's "Not verified here". The keyed alert around `FieldError` is asserted through markup (unit) and the accessible description (e2e) only. Add the uploader's waiting words to the manual 3.3.7 and 3.3.8 list of the accessibility pull request (combined audit #103).
4. **Items carried from check 3, unchanged by this merge:**
   - P14: the letter path does not join `*` next to a letter.
   - P15: the screen does not join U+2043 or read the Hangul fillers.
   - #80's accented-letter asymmetry in `identifierCandidates`.
   - The order of ADR 0054's two same-day amendments.
5. **Observation, no change made.** The names in the "Waiting to upload" list are 12 px (`text-xs`), as #75 wrote them. No control's `aria-describedby` names that list, so D9 does not cover it and `form-hints.test.ts` passes. If the founder wants the 0056 type scale's 14 px there too, it is a one-class change.
