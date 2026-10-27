# PR #75 fresh-clone verification (co-001/contract-phi-check)

`summary.md` was not written: the tool refuses report files from subagents, so the summary is below.

- Head: `f5292c6c…`.
- Base: `claude/build-platform` at `ecebdc90…`, which is also the merge base.
- Clone: `/tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/verify-clone`
- Scratch copy for the reverts: `/tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/verify-revert`
- Logs: `/tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/verify/logs/`
- Progress: `/tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/progress/verify.md`

## Verdict: FAIL

CI is green on the head, including all four required checks, and the boundaries hold. The fixes for the majors and for I1 are real: each named test fails when I revert the fix's core lines.

It is not merge-ready for three reasons:
- the PR description is stale against the head;
- one item the description defers (P11) is within this PR's reach;
- the PR is still a draft.

### What must change

1. **P11 can be done in this PR.** P11 is phi-screen F5's character cap on the framed contract request.
   - It belongs in `contractTermsSpec.prepare` (`packages/model-gateway/src/functions/contract-terms.ts`), with a refusal code, a notice in `notices.ts` and a mapping in `path.ts`.
   - All three are this PR's own files. None is a migration or a #42 file.
   - The F5 skeptic asked for it as an "Improvement in the same PR" (findings-all, F5, skeptic's fix 5).
   - The fix round deferred it because "it needs a refusal code and a notice" (`fix/integrate.md`). That is an effort reason, which the founder's standing rule excludes.
   - Build it here with a test, or record a ruling that waives it.
   - The streaming fix itself is in place. Until the cap exists, a 16 MiB request is still screened, budget-held and sent. Per the ADR, that holds the event loop for about 1–2 s, up to about 7 s, and longer at 0.5 vCPU.
2. **The description is stale against the head.**
   - **CI paragraph.** It still reports CI on 9b7eadf with `unit` failing. It says the two flaky tests "are now Lane B's `co-001/test-flakes` item", but #76 has merged and is in the head. It says "CI totals for 53076d2 are added once its run ends"; they never were. Replace it with CI on f5292c6c, all green, with the totals below.
   - **Base merge.** The description never mentions f5292c6c (ecebdc90: #76, #77 and 68 more). Its tree equals a clean automatic merge of 53076d2 and ecebdc90 (tree 7220ad46), so nothing was resolved by hand.
   - **Old base.** `tools/engine-freeze/check.ts e908c214` and `stryker/affected.ts --base e908c214` name the old base. Against ecebdc90 both pass:
     - engine freeze: nothing let through, no problems;
     - affected.ts: no money path changed, no shard runs.
   - **Local counts are 53076d2's.** Label them so or rerun them on the head:

     | Check | Description (53076d2) | Head (f5292c6c) |
     | --- | --- | --- |
     | synth | 237 cases, 637 unchanged | 240 cases, 640 unchanged |
     | watched-paths | 531 lines | 535 lines |
     | lint:logs | 1,058 files | 1,061 files |
     | unit | 383 files, 6,384 passed, 4 skipped | 388 files, 6,474 passed, 1 skipped (CI) |

3. **Imprecise wording.**
   - The heading "The screen comes last of the gateway's refusals" is not exact. The budget's hold (gateway.ts step 9, `store.hold` then `refuseOverBudget`) can still refuse after the screen. Say "last before the budget's hold and the call", as ADR 0054's amendment and `spec.ts` already do.
   - `packages/model-gateway/src/gateway.ts:50` has the same slip: "the screen is the last step that can refuse a call before it is made" contradicts its own step 9.
   - The twin sentence leaves out that a third of the member IDs are "ZZ" plus 7 digits. The numbers are right; the shapes are incomplete.
4. **Take the PR out of draft.** The API reports draft=true (mergeable_state clean, no reviews).

Optional nit: the ADR says P12's pool brand needs `services.ts` (a #42 file). But `openPool` lives in `packages/db/src/connect.ts`, which is not a #42 file, so a brand issued there might not need `services.ts`. Either restate the reason or check that route.

Informational: open PR #80 also edits `redact.ts`; whichever PR merges second will have to resolve it.

## Step 1: fresh clone

- I cloned fresh, fetched both branches and checked out the head detached.
- `origin/co-001/contract-phi-check` still points at f5292c6c and equals the PR head (API and ls-remote).
- `pnpm install --frozen-lockfile` exited 0.

## Step 2: the description's claims

Everything below matches the clone, apart from the items listed above.

**The check (`patient-records.ts`, `redact.ts`)**
- The screen reads `prepared.user`.
- The identifiers come from `patient_ref.member_id`, the claim's PCN and CCN, and `posting_row.claim_reference` for rows with no claim-level match.
- Matching is on whole tokens: NFKC, upper case, letters and digits.
- Groups join over a space, a dash or minus with at most one space either side, or `. / _ *` with no space. They also join over the practice's own stored separators, with invisible characters taken out of a gap.
- A newline, a tab or two spaces end a run.
- The screen streams and stops at the first match. I measured 986 ms on prose and 1,460 ms on the worst case, in a 96 MiB heap.
- `SCREEN_FLOORS` is 6 / 6 / 8, each needing a digit; 8-digit dates are dropped.

**Guards**
- `ContractPagesInput.patientRecords` is required.
- Only checks the module issued itself are accepted (a module-private WeakSet), bound to the call's own practice; anything else gives `screen_invalid`.
- The check reads through its own job scope as the service screen actor, and any load error gives `screen_failed`.
- The specs, the prototype and each gateway instance are frozen, and `callContext()` reads the context once.
- `lint.test.ts` guards the two factories, the two production call sites and every import form of the testing module.

**Gateway order:** serving, kill switch, PHI boundary, prepare, variant check, idempotency, budget read, `beforeScreen`, screen, hold, call.

**Limits:** `SCREEN_LIMITS` is 20 an hour and 60 a day per practice, and 20 an hour and 100 a day per person. They go through `rate_limit_take` in `rate-limit.ts`'s form. A refusal is remembered for `REMEMBERED_MS` = 3,600,000 (one hour); a `clear` is never remembered.

**Bound:** 50,000 identifiers, each read capped at what the bound leaves plus one row, and the reads commit before any decrypt.

**Log codes:** `MODEL_INPUT_NAMES_PATIENT`, `_MORE_THAN_ONE_PATIENT`, `_SCREEN_UNAVAILABLE`, `_SCREEN_INVALID` and `_SCREEN_FAILED` from the gateway; `MODEL_SCREEN_LIMITED` from the web.

**Wording:** each of these is word for word in the code:
- the four notices;
- the propose card's sentence;
- every uploader string;
- the region's name, now taken from its title through `aria-labelledby`.

**Uploader behaviour**
- The contracts and reconciliation panels start with no kind chosen.
- The uploads page keeps its 835 default (`initialKind="x12_835"`).
- Files chosen before a kind wait in the panel; the select is marked invalid, described and focused.

**Worker:** `refused:names_patient` is counted outside the model. `refused_rose` is pinned at `permitted.db.test.ts:240` and `:272`, and the runbook covers it.

**Documents**
- The test-matrix MOD-12 row is identical to `matrix.ts`.
- The registry's MOD-12 lists 10 files that assert it; all exist.
- ADR 0070 Part 3:
  - "What it gives up" carries S2, P10, P11, F3 and F4;
  - "Open matters" carries F3 (retiring S1 and S2), F4, P10, P11 and P12;
  - P12 appears in the Decision section and Open matters only, which the description does not contradict.
- ADR 0054's amendment, PRD 14 and 16, reconciliation-001 item 16 and the runbook are all present.
- The design's session rulings and the dispositions M7, M8, M9, M12, m3, m9, m14 and m15 are there.

**Other claims**
- Every role with `file.upload` also holds `phi.read`.
- `audit_event`'s action, purpose and request_id columns are open patterns.
- The eval set and baseline are unchanged; `sets.ts` and `harness.ts` change only types.

**Commits:** 88a0e4e, 9b7eadf, e908c21, 25be3ab, e552399, 527f2c5, bac083a, 4450750 and 53076d2 are all ancestors of the head, and each touches what the description says.

## Step 3: boundaries

- 67 files change, none under content/releases, fixtures/golden, db migrations, db functions, pricing/src or ledger/src. No workflow, manifest or lockfile changes.
- Of PR #42's 212 files, the only overlap is `test-matrix.md`, `reconciliation-001.md`, `matrix.ts` and `registry.ts`, plus the regenerated `watched-paths.txt`.
- No model name or identifier appears in the 6,800 added lines.
- `pnpm check:fixtures` passes. I read the MOD-12 fixtures and the twins: all synthetic. The added lines hold no Luhn-valid NPI, no SSN-shaped value and no MBI-shaped value.

## Step 4: commands in the clone

| Command | Result |
| --- | --- |
| `pnpm typecheck` | passed, 22 projects |
| `pnpm lint:logs` | passed, 1,061 files |
| `pnpm lint:copy` | passed, 514 files |
| `pnpm test:golden` | 5 files, 381 passed |
| `pnpm --filter @tp/model-gateway eval` | gate passed: 63 documents, precision and recall 0.996941; narratives 300 of 300 |
| `pnpm synth --all` | 240 cases, nothing written |
| `watched.ts --write` | `watched-paths.txt` unchanged |
| `tools/engine-freeze/check.ts` against ecebdc90 | passes |
| The 5 db files, on my own fresh migrated database at localhost:5433 | 72 tests passed |

I dropped both of my databases afterwards.

## Step 5: findings marked fixed

For every finding the description marks fixed, I confirmed the fix in the code and read the test that covers it.

For the majors and I1, I reverted the fix's core lines in the scratch copy, ran the tests, then restored:

| Finding | What I reverted | What failed |
| --- | --- | --- |
| F1 | the extra separators in the join | 6 redact tests |
| F5 | the streaming (every run built, no early stop) | the 16 MiB test: the child ran out of heap |
| S1, order | the screen moved back before idempotency and the budget read | 4 gateway unit tests, 1 gateway.db test, 1 models-routes.db test |
| S1, limits and remembered refusal | both disabled | 2 models-routes.db tests |
| UX-1 | files refused before a kind; the `aria-invalid` mark | 5 uploader tests |
| I1 | context read without freezing | "reads the caller's context once": the call was sent |

Deferred findings:
- **S2:** needs a migration and `settings.ts` (#42). Out of reach, and pinned by a db test that passes.
- **P10:** `rate-limit.ts` is a #42 file. Out of reach.
- **P12:** plausibly needs a #42 file (see the nit above).
- **P11:** not out of reach (item 1 above).

## Step 6: CI on f5292c6c

- All 21 check runs completed. Everything succeeded except stryker and notify, which were skipped (no money path changed).
- The four required checks are green: all green, mutation, screening-capacity gate, approval-of-record.
- No job failed.
- `gh api` could not fetch the job logs (the proxy returned 403 on the log storage host), so I read them through the GitHub connector's job-log tool instead.

| Suite | Description (local, 53076d2) | CI on f5292c6c |
| --- | --- | --- |
| unit | 383 files; 6,384 passed, 4 skipped | 388 files; 6,474 passed, 1 skipped |
| golden | 5 files, 381 passed | 5 files, 381 passed |
| db | 128 files; 9,245 passed, 1 skipped | 128 files; 9,246 passed (3,156 + 2,062 + 3,099 + 929), 0 skipped |
| e2e | 54 passed | 54 passed (27 + 27) |

- **unit:** the base merge's 70 commits (#76, #77 among them) add 5 files and 90 tests, with 3 fewer skipped.
- **db:** the extra pass is the restore drill. It is skipped locally (pg_dump 16 against a PostgreSQL 18 server) and runs in CI.