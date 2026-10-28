# PART check 3: PR #75 (co-001/contract-phi-check), the merge of claude/build-platform a6e754fc checked and committed

- **Worktree:** /home/user/contract-phi-check.
- **New head:** `871faff9`, the merge commit (parents 4b886fcc and a6e754fc). Nothing is pushed: origin/co-001/contract-phi-check is still f5292c6c, and 4b886fcc is at origin/co-001/wip-contract-phi-check-2.
- **Paths:**
  - progress: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/progress/check3.md
  - logs: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/check3-logs/
  - scripts: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/check3-scripts/
    - `sides.py` compares each side's added and removed lines against the merge;
    - `run.sh` runs each step under the lock;
    - `db-shards.sh` runs the db shards;
    - `e2e.sh` runs the end-to-end journeys.
  - copies of the staged files before this check's edits: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/check3-work/ (`redact.test.staged.ts`, `adr0070.staged.md`)
- **Boundaries:**
  - Every value is synthetic (ZZ… and SYN… IDs).
  - No migration.
  - No model name or identifier in an added line (grepped).
  - Compared with the base, nothing changes under packages/pricing, packages/ledger, content/releases or fixtures/golden, and `domain-model.md` is untouched. Engine freeze: "problems: none".
  - None of #42's four files is touched relative to the base. #80's `apps/worker/src/packets/services.ts` comes in with the base, byte for byte.
  - Nothing was rebased, forced or pushed.

## Adversarial re-read of the resolution

I compared the staged tree with both parents (`git diff --cached HEAD`, `git diff --cached origin/claude/build-platform`), file by file and then line by line (`sides.py`). I probed both paths on the separators with a temporary tsx script, since removed.

### What was checked and holds

- **File sets.**
  - #75's 75 files are exactly the merge's 75 files against the base.
  - #79's and #80's 112 files, plus ADR 0070 and `redact.test.ts`, are exactly the merge's 114 files against HEAD.
  - Every file only one side changed has that side's blob, except ADR 0070 and `redact.test.ts`, which were edited on purpose.
- **Both-sided files: nothing of #79's or #80's is lost.**
  - `contracts/page.tsx`, `reconciliation/page.tsx`, `narrative.ts`, `test-matrix.md`, `matrix.ts` and `registry.ts` keep every added line of both sides.
  - `uploader.tsx`: #79's two class lines live inside #75's `KindField`. The wrapper is `min-w-0 max-w-full`, the select is `max-w-full`, and the format select matches. #79's whole-file-name span auto-merged.
  - ADR 0054:
    - #80's amendment is verbatim, and the prefix is #80's except for the status line;
    - #75's amendment is verbatim plus one sentence.
- **`redact.ts`.**
  - Lines 1 to 819 are #80's except for the `identifierTokenRuns` comment.
  - Line 820 onward is #75's screen section, byte for byte, except for one comment added by this check (below).
  - No code line differs from either side.
  - The only name the screen uses from above its section is `compactIdentifier`, which #80 did not change.
- **No screen bypass.** `contract-terms.ts`, `gateway.ts`, `patient-records.ts`, `specs.ts`, `spec.ts` and `index.ts` are HEAD's. #80's new narrative `names` field passes through the frozen spec, and its tests pass.
- **No regression of the letter path.** It is #80's code exactly, and #80's `redact.property.test.ts`, `denial-letter.test.ts` and `narrative.test.ts` pass in `pnpm test`.
- **The one thing of #75's that is lost** is the F1 widening of `identifierPattern` (joining `*`, and `.`/`/`/`_` between digits, in letters). That function went with #80. The dot and slash case is #80's recorded residual; the `*` case is now P14 (below).

### Findings, each fixed in the merge commit

| # | Finding | Fix |
| --- | --- | --- |
| C1 | N6 said the accent case "is in 'Not caught'". It was not. The probe shows `holdsIdentifier` folds `ZŽ1234567` to ZZ1234567, `identifierCandidates` does not, and neither does the screen. | "Not caught" gains the accented letter. N6 says the matcher folds accents and the candidates do not. |
| C2 | N6's list of what only the letter path joins was incomplete. Next to a letter, the letter path also joins a dot, slash or underscore with a space or another separator beside it (`ZZ / 1234567`, `ZZ .1234567`, `ZZ-.1234567`, `ZZ./1234567`), and it never joins `,`, `+` or `)`. | N6 and the "Not caught" sentence now give #80's grammar exactly: any run of white space and dashes; next to a letter, any such run containing `.` `/` `_` `:` `#` or `(`; neither path joins `,` `+` `)`. They also say that `storedSeparators` never keeps a tab, a line break, two spaces or a dash with two spaces. |
| C3 | N6's description of the property left out its skip of digits-only writings that a letter reads as a separated date. | Added. |
| C4 | merge2 wrote U+2212, SHY, ZWSP, BOM, U+2043, U+0301 and U+3164 into `redact.test.ts` as literal characters. The file writes them as escapes; only NBSP and U+3000 are literal there. | Changed to escapes. |
| C5 | The table did not pin the writings found in C1 and C2. | Three letter-only rows (`ZZ / 1234567`, `ZZ-.1234567`, the accent) and a "neither" loop (`ZZ,1234567`, `ZZ+1234567`, `ZZ)1234567`: neither path reads these, and the screen reads them only when the practice's own value holds that separator). The title says so. |
| C6 | `INVISIBLE`'s comment (in #75's screen section, an error that predates the merge) says `compactIdentifier` drops every default-ignorable character. It does not drop the Hangul fillers. | Comment only: the fillers are letters by class and stay in a token. |
| C7 | merge2's open points 1 and 2 were recorded nowhere in the ADR. | ADR 0070 proposals: **P14**, the letter path joins `*` next to a letter (#80's `GAP.numberNearLetter`, `letterJoins`), measured first against #80's properties and its amounts rule. **P15**, the screen joins U+2043 as a dash (`JOIN`, `storedSeparators`) and reads the fillers as a space, measured first against set v2's false refusals and gate.golden. N6 ends with "(P14)". |

`redact.test.ts` after these edits: 1 file, 30 passed (30), 15.6 s (`redact.log`).

### ADR 0070 Part 3 now says

- **N6.**
  - #80's one-pass matcher (`matchesIn`, behind `redactLetter` and `holdsIdentifier`) and `identifierTokenRuns` replace `identifierPattern`.
  - The screen keeps `someIdentifierRun`, and the two paths join differently: three lists (both join; only the screen joins; only the letter path joins), each with its reason. The letter path rewrites text, so amounts and deadlines must survive; the screen only refuses. A contract is tables; a letter is one patient.
  - The property, as now written: 2,000 runs over every gap `JOIN` takes.
    - The screen finds each writing.
    - `holdsIdentifier` reads exactly the writings with no `*` and no `.`, `/` or `_` between two digits. `identifierCandidates` reads the same writings when they span at most three tokens and hold a digit.
    - Separated dates of digits alone are left out.
  - The table: letter-only writings, the five screen-only writings, and the writings neither path reads.
  - "A letter is therefore no longer redacted of everything the screen would find (P14)."
- **"Not caught."** U+2043, the Hangul fillers, the accented letter, and exactly which of these the letter path reads.
- **The tokenizer bullet.** `compactIdentifier` keeps the fillers.
- **The Tests line.**
- **P14 and P15**, as above.
- ADR 0054 keeps #80's text verbatim. #75's amendment ends with the sentence saying the contract screen does not tokenize through `identifierTokenRuns`.

## Commands

All in the worktree, every one under `flock /tmp/laneb-heavy.lock`, one at a time, with `PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH:/opt/node22/bin`.

| Command | Printed totals |
| --- | --- |
| `pnpm typecheck` | passed, 22 projects in 36.4 s wall |
| `pnpm lint` | passed, 1,638 files in 3 groups, 0 errors, 0 warnings, 102.6 s wall |
| `pnpm lint:logs` | 1063 files scanned; every log call uses allowlisted fields |
| `pnpm lint:copy` | 516 files read; the product copy keeps the brand's words |
| `pnpm test` | Test Files 392 passed (392); Tests 6591 passed, 4 skipped (6595); 244.3 s; exit 0. `workflows.test.ts`, `rerun-rule.property.test.ts` and packets' `verifier.test.ts` all passed, so nothing needed a rerun. The stderr line "sha256sum: …/icudtl.dat: Input/output error" is `browser-build.test.ts`'s deliberate stand-in (line 445) |
| `pnpm test:golden` | Test Files 5 passed (5); Tests 381 passed (381); 32.7 s |
| `pnpm test:oracle` | pyx12 4.0.0 agrees with all 688 synthetic 835 fixtures (677 valid with identical summaries; 11 malformed, rejected as expected). packages/edi835 agrees on every segment, amount, balance and verdict |
| `pnpm --filter @tp/model-gateway eval` | **gate: passed.** 63 documents, precision 0.996941, recall 0.996941, quotes off page 0; tp 2607, wrong 5, rejected 3; wrong-but-verified on faithful cases 0; 9 conflict pairs, none unflagged; 3 twins, none differing; tier large recall 1.000000 (tp 827); narratives 300 of 300 without a critical error |
| `pnpm synth --all` | 246 cases; 0 files written, 646 unchanged, 0 removed. 8 EMR formats; 0 written, 16 unchanged |
| `pnpm exec tsx tools/screening-capacity/watched.ts --write` | 535 lines; `watched-paths.txt` unchanged (worktree clean) |
| `pnpm db:migrate && pnpm test:db --shard=1/4` on fresh `phi_check3_db1` | 32 files passed; 3155 passed, 1 skipped (3156); 189.2 s |
| … `--shard=2/4` on fresh `phi_check3_db2` | 32 files passed; 2064 passed (2064); 151.1 s |
| … `--shard=3/4` on fresh `phi_check3_db3` | 32 files passed; 3100 passed (3100); 243.5 s |
| … `--shard=4/4` on fresh `phi_check3_db4` | 32 files passed; 929 passed (929); 135.7 s |
| (shard check) | The four JSON file lists together hold 128 files, each once, equal to every tracked `*.db.test.ts`. Each database was dropped after its shard |
| `pnpm check:fixtures` | 341 files read by the guard, 3825 text files searched for an X12 header; every interchange synthetic |
| `pnpm verify-content` | every content set passes (content/drafts: 10 records, no problems) |
| `tsx tools/engine-freeze/check.ts origin/claude/build-platform`, before and after the commit | no non-test file under packages/pricing/src changes; let through by the exception: nothing; problems: none |
| `tsx tools/stryker/affected.ts --event pull_request --base origin/claude/build-platform`, after the commit (diffed from a6e754fc) | money: not affected; ledger: not affected. **pricing and packets: affected**, by `packages/db/src/authz/index.ts`, `authz/scope.ts`, `connect.ts` and `runtime.ts` (imported). Not run |
| `pnpm build` | exit 0 in 57 s (web and worker) |
| `git rev-parse HEAD > apps/web/.next/BUILD_COMMIT` | 871faff9… |
| `E2E_PREBUILT=1 DATABASE_URL=postgres://postgres:test@localhost:5433/postgres E2E_DATABASE=phi_check3_e2e E2E_PORT=3197 pnpm test:e2e --workers=2` | **56 passed (8.5m); exit 0**, including both `tables-phone.spec.ts` tours, `contracts.spec.ts`, `models.spec.ts` and `uploads.spec.ts`. `phi_check3_e2e` was dropped; tp_e2e was not touched |
| `gitleaks git --log-opts="4b886fcc..HEAD" --no-banner` (pinned 8.24.3) | 17 commits scanned, ~495.01 KB in 223 ms, no leaks found; exit 0. The range holds 23 commits; gitleaks' plain log shows no merge diff, so the hook's remerge scan (next row) covers the merge's own resolution |
| `.githooks/pre-push origin <url>`, run standalone; stdin `refs/heads/co-001/contract-phi-check 871faff9… refs/heads/co-001/contract-phi-check f5292c6c…` | "1 commit checked: 0 file(s) read by the fixture guard, 11 text file(s) searched for an X12 header, and gitleaks found no secret."; exit 0; nothing pushed |

The databases left at localhost:5433 are the ones that were there before: tp_e2e, tp_e2e_ux and three tp_test_*.

## Commits (not pushed)

- `871faff9` Merge claude/build-platform (a6e754fc: #80 redact-placeholders, #79 table scrolling) into co-001/contract-phi-check
  - Parents 4b886fcc and a6e754fc. 114 files against HEAD (+7325 −2373); 75 files against the base (+7857 −240).
  - **The body names each of the six conflicts and its resolution (rule 6):** redact.ts, uploader.tsx, ADR 0054, test-matrix.md, synth matrix.ts and registry.ts.
  - **It also names:**
    - the hand-checked auto-merges;
    - the edits beyond the markers: redact.test.ts, ADR 0070 Part 3 with P14 and P15, and the two comments in redact.ts;
    - the regenerated files, none of which needed staging.
  - It ends, after a blank line, with exactly the two lines (Co-Authored-By, Claude-Session).
- There is no separate docs commit: the ADR update is in the merge commit.

## Mutation shards CI will run

The tool printed these shards: packets-scan, packets-rest, packets-explain, pricing-engine, pricing-recompute and pricing-rest. They are triggered by #75's packages/db changes (`authz/index.ts`, `authz/scope.ts`, `connect.ts`, `runtime.ts`), the same as in check 2. money and ledger are not affected.

## Open items

1. **P14, the letter path and `*`.** The letter path no longer joins `*`, so a letter's `SYN*PCN*44551` is sent. This is the one change of #75's the merge loses: #75 widened a function that #80 removed. The proposal is to add `*` next to a letter in #80's `GAP.numberNearLetter` and `letterJoins`, after measuring against #80's property tests and its amounts rule. This is for the founder or Lane B to schedule; it is a change to #80's matcher, so it was not made in a merge.
2. **P15, two writings the screen misses.** U+2043 HYPHEN BULLET (which #80 says PDF text writes for a hyphen) and a Hangul filler inside an identifier: the letter path reads both, the contract screen does not. The recommended fix is U+2043 in `JOIN`'s dash class and in `storedSeparators`, and the fillers read as a space before tokenizing. Measure first against set v2's false refusals and gate.golden. Both are recorded in "Not caught" and P15.
3. **The accented letter.** `identifierCandidates` (#80's other-patient screen) does not fold an accented letter, though #80's matcher does. That is #80's own asymmetry, now stated in N6; nothing is proposed here.
4. **ADR 0054's order.** The two same-day amendments are ordered #80 then #75, the order they reached the base. Reorder them if the founder reads "date order" as the order the pull requests were opened.
5. **Push.** 871faff9 is ready for the orchestrator to push, through the hook (`git push origin co-001/contract-phi-check`). The pre-push check passes standalone.
