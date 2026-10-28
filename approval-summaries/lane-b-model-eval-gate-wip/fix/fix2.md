# PART fix 2: PR #75 after the fresh-clone verification (co-001/contract-phi-check, on f5292c6c)

Worktree: /home/user/contract-phi-check. The changes are edited in place. Nothing is committed and nothing is pushed.

Boundaries:
- Every value is synthetic.
- No migration.
- No #42 file, checked against /home/user/ops/LANES.md. `services.ts`, `rate-limit.ts`, `settings.ts` and `fields.ts` are untouched.
- Nothing changes under packages/pricing, packages/ledger, content/releases or fixtures/golden.
- No model name or identifier appears in any file. I grepped the added lines.

Where things are:
- Progress: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/progress/fix2.md
- Logs: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/fix2-logs/
- Measurement scripts: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/fix2-scripts/
  - `measure.mts`: set v2's framed request sizes;
  - `hold.mts`: the budget hold's arithmetic;
  - `bound.mts`: the screen's time at a given size.

The diff is 27 files, 761 insertions and 173 deletions.

## Item 1: P11, a character cap on the framed contract request (phi-screen F5's skeptic, fix 5)

### The change

`packages/model-gateway/src/functions/contract-terms.ts`:
- **`MAX_REQUEST_CHARACTERS = 1_000_000`** (:68). It counts a string's length. Its doc comment (:52-67) gives the evidence below.
- **`TOO_LONG_MESSAGE`** (:71, exported). It is a fixed sentence that names the cap and nothing of the document, its length included.
- **Two checks in `prepare`.** Both throw `InputRefusedError('too_long', TOO_LONG_MESSAGE)`.
  - :565-568: the pages' total length, checked right after the kind check, before `no_text`. A page is never normalized, framed or hashed for an over-long document: the frame only adds characters, so this refuses a subset of what the second check refuses, early.
  - :575-579: the framed `user` text itself. The cap therefore holds what would be sent, which is what the screen reads, even for pages that read differently the second time they are asked for.
- `prepare` runs before the variant check, the idempotency key, the budget read, `beforeScreen`, the screen, the hold and the call. An over-long document therefore reads none of the practice's records, takes no screen limit, writes no person's event, holds nothing and writes no `model_call` row.
- **No log line.** The gateway does not log refusals from `prepare` (`spec.prepare` is not wrapped), so, following the existing pattern, none is added. lint:logs is unchanged.

Other code:
- `packages/model-gateway/src/index.ts:169` exports `MAX_REQUEST_CHARACTERS`.
- `packages/model-gateway/src/permitted.ts:217` (and its doc at :199-204): `'refused:too_long'` joins `OUTSIDE_MODEL_PROBLEMS`, as `refused:too_many_pages` is there. Without it, a practice's over-long contract would make a permitted run unmeasured, and record-permitted would refuse the whole run. `permitted.test.ts:422` now checks 7 codes.
- Web, `apps/web/src/lib/models/notices.ts`:
  - `'too_long'` is added to `MODEL_PROBLEMS` (:36);
  - its text is at :54;
  - the doc block is at :8-12.
- Web, `apps/web/src/lib/models/path.ts:172-192`: `SCREEN_PROBLEMS` is renamed `CONTRACT_PROBLEMS`, gains `too_long: 'too_long'` and has a rewritten doc comment. It is still mapped before the generic `refused`.
- `packages/model-gateway/src/gateway.ts:34-37`: step 4 now names the cap.

### How the value was chosen (all synthetic; reasoning in the doc comment and in ADR 0070 Part 3, "The request's length")

**What set v2 needs** (`measure.mts`, the framed text as `prepare` builds it):
- The largest case is L02 at 173,684 characters (80 pages). L01 and L03 are 163,247 and 165,238.
- The 40-page cases are L04 at 89,153 and L05 at 72,437.
- No medium case is above 20,100, and no small case above 4,124.
- The longest page is 2,524 characters, so 100 pages (`MAX_PAGES`) at that density come to about 255,000.
- The cap is 5.7 times the largest case and 3.9 times that 100-page figure.

**What the model can read:**
- The prompt version has no input limit, and its `max_tokens` is 16,000.
- The pinned models have a context of one million tokens. That figure comes from the API reference; no model is named in any file.
- The runbook estimates about 1,250 tokens a page, or 100,000 for an 80-page document. That is about 1.7 characters a token on L02.
- At that rate the cap is about 575,000 tokens, inside the context with the answer's 16,000 tokens.
- Intake's own cap is 16 MiB (`PAGE_READ_LIMITS.maxTextCharacters`), about ten million tokens.

**What the budget hold allows** (`mostCost`: a token per byte, plus the system prompt (3,237 bytes), the schema (3,413) and 1,000 framing tokens, and 16,000 tokens out):
- At `config/models.json`'s prices, which are still unconfirmed, a request at the cap holds about 218 cents. The larger model's holds about 435.
- Both fit the default daily budget of 500 cents on a day with no spend.
- The largest request that default budget can hold is 2,412,350 bytes, or 1,162,350 for the larger model.
- A 16 MiB request held 3,373 cents (6,746 for the larger model). It was refused only after a full screen.

**The screen's time at the cap** (`bound.mts`: 50,000 identifiers, 96 MiB heap, this 4-CPU machine):

| Text | At the cap | At 16 MiB |
| --- | --- | --- |
| Prose, identifier last | 47 ms | 623 ms |
| Worst case | 122 ms | 1,380 ms |
| Kept identifiers of every length from 6 to 80 | 379 ms | about 7 s (the ADR's earlier figure) |

The two alternatives:
- **A larger cap** would admit requests the models cannot be relied on to read, and that the default hold refuses for the larger model.
- **A smaller cap** (say 500,000) would leave less margin over a dense 100-page schedule, for no gain the screen needs.

### Tests and results before and after (every "without" run used a temporary edit to the cap checks, restored afterwards; `cmp` confirmed each restore)

| Test | Without the cap | With it |
| --- | --- | --- |
| `contract-terms.test.ts:319` "refuses a request longer than its character cap …" (sum check; a page of blanks gives `too_long`, not `no_text`; prepared exactly at the cap; refused one character over; shifting pages refused; 100 pages of 2,500 characters under a third of the cap) | fails; also fails with only the sum check removed, and with only the framed check removed | passes |
| `gateway.test.ts:796` "refuses a contract longer than a call sends in its preparation …" (no screen connection, no audit row, no `completedCall`, no `spentSince`, no hold, nothing sent, no row, no log line; the same pages within the cap are screened and give `names_patient`) | fails (`names_patient` after a screen read) | passes |
| `gateway.test.ts:375-377`, an ambiguous over-cap call on a gateway serving only the default variant | fails (`not_evaluated`): the cap comes before the variant check | `too_long` |
| `permitted.test.ts:422` | — | `refused:too_long` is outside the model |
| `apps/web/src/lib/models/path.test.ts:14` (`too_long` maps to its own problem; the text has no figure) | — | passes |
| `apps/web/src/lib/routes/models-routes.db.test.ts:651`: a SYNTHETIC CSV fee schedule past the cap, its last row holding the CAS-08 claim's patient control number (redirect, nothing sent, no `model_call` or proposal row, no person's event, no screen limit taken, no read, no log line, the page's `modelNotice`) | fails: `?model=names_patient` (the screen read the practice's records) | `?model=too_long`, 17/17 in the file |

Run counts:
- The cap's unit tests: 3 failed without the cap, 103 of 103 passed with it.
- The eval gate (`pnpm --filter @tp/model-gateway eval`) passed:
  - 63 documents, precision and recall 0.996941;
  - the large tier reached the model, with tp 827 and recall 1.000000, so set v2 does not trip the cap;
  - narratives 300 of 300.

### Test support

`apps/web/src/lib/routes/test-support/contract-world.ts:102-127`: `storeCsvDocument` reads a CSV through the bounded reader, as intake does. `storeContractDocument` now delegates to a shared `storeReadDocument`. `models-routes.db.test.ts` `draftContract` accepts `{ csv, kind }` extras.

### Docs

ADR 0070 Part 3:
- New Decision bullet "The request's length" (:675).
- "The gateway's order" names the cap (:660).
- "What it gives up": "The time per click" rewritten (:1020), and a new "A document longer than a call sends" (:1025).
- Departure 30 (:1242).
- Notice N14 (:1287). N7 is Part 2's, so the new notice takes the next free number.
- "Consequences": the P11 bullet is replaced (:1308).
- "Tests": a cap paragraph (:1413).
- "Open matters": P11 recorded as fixed in this pull request (:1481), so it is out of every deferred list.
- Part 2's permitted allowlist gains `refused:too_long` (:468).

Runbook `docs/runbooks/model-evaluation.md`:
- `refused:too_long` is added to the record-permitted allowlist (:187).
- New bullet "A contract proposal is refused as too long" (:233-238).

PRD 14 lists no notices, so it is unchanged.

## Item 2: "the screen comes last of the gateway's refusals" was inexact

Now: the screen is last of the refusals before the budget's hold and the call, and the hold can still refuse after it.

| Where | Before | Now |
| --- | --- | --- |
| `packages/model-gateway/src/gateway.ts:47-53` | "the screen is the last step that can refuse a call before it is made" | "every refusal the gateway can make before the budget's hold comes first … the screen is the last refusal before the hold and the call; the hold (step 9) can still refuse a call after it" |
| `packages/model-gateway/src/spec.ts:47-50` | "runs last of the gateway's refusals" | "last of the gateway's refusals before the budget's hold and the call … the hold can still refuse after it" |
| `packages/model-gateway/src/functions/contract-terms.ts:511-514` (the screen's doc) | the same slip | the same fix, citing steps 8 and 9 |
| ADR 0054's amendment (:280-286) | the same slip | the same fix ("No audited read runs for a call the gateway refuses before the hold") |
| ADR 0070 "The gateway's order" (:660) | the same slip | says the hold can refuse a screened call when calls in flight take the day's spend to the budget |
| ADR 0070 departure 26 (:1226) | the heading | "**The screen runs last of the gateway's refusals before the budget's hold and the call**" |

The runbook and the PRD do not carry the slip.

## Item 3: the twin shapes in ADR 0070 Part 3

- Departure 8 (:1164) now names all three member-ID shapes, matching `packages/synth/src/screen/patient-twins.ts:60-69`:
  - a third `ZZ` and 7 digits;
  - a third `9NN00NNNN`;
  - a third 11 characters holding a B, L, S or Z.
- The "Measured: the false refusals" paragraph (:1086) already had all three.
- The PR description's line "the twins (9NN00NNNN, and the 11-character IDs with B, L, S or Z)" still leaves out ZZ. Correct it there too (see the last section).

## Item 4: P12, a pool brand and a scope brand, built

**Feasibility.**
- Both production pools come from `openPool`:
  - the web's `modelPool` (`services.ts:214`, not edited);
  - the worker's run pool (`apps/worker/src/models/permitted-cli.ts:45`).
- Both production scopes come from packages/db:
  - the web's request scope, from `withPracticeScope` in `apps/web/src/lib/http/invoke.ts:494`;
  - the worker's, from `withJobScope`.
- So the brands need no #42 file and no migration. The ADR's old reason ("issued where the services build their pools, a #42 file") did not hold, and the ADR now says so.
- #42's own `services.ts` diff (origin/co-001/pr-06b-mail-streams) does not touch pool construction.

**Soundness.** Each brand is a module-private `WeakMap`, filled only where the object is made. The check reads that registry, never the object's own properties.
- `packages/db/src/connect.ts`:
  - `opened` (:28) is filled in `openPool` (:30-36). The pool's `connect` is bound at that moment (:33), so a `connect` assigned to the pool later is never used.
  - `openedPool(pool)` (:43).
  - Exported through `runtime.ts:28`.
- `packages/db/src/authz/scope.ts`:
  - `openedScopes` (:135);
  - `opened(pool, scope, reach)` (:138) is called in `withPracticeScope` and `withJobScope`'s open callbacks (:264-273, :323-332). It records the access closure the database answered, only when the pool is one `openPool` opened;
  - `recorded(scope, run)` (:146) marks the scope open while the caller's work runs and closed when it ends, whether it succeeds or fails;
  - `openScopeReaches(scope, practiceId)` (:167);
  - exported through `authz/index.ts:24`.
- `packages/model-gateway/src/patient-records.ts`:
  - `practiceRecordsCheck` (:197-205) throws `ScopeError` unless `openedPool` and `openScopeReaches` hold, then reads through the recorded connector;
  - `practiceRecordsCheckByShape` (:214) is the same check by shape, for tests (memory practices, fault-injecting or racing pools);
  - `recordsCheck` (:218) is the private body that issues the check;
  - the module doc is updated at :31-38.
- `testing.ts` re-exports `practiceRecordsCheckByShape` (:80-87), and `syntheticPracticeCheck` uses it (:305). The main entry does not export it.

What is refused:
- a stub pool, a wrapper of the pool's shape, and a `pg` pool `openPool` did not open;
- a copied scope, and a scope whose `access` or `practiceIds` were reassigned;
- a scope opened on a pool of the right shape, and a scope kept past its transaction.

What the brands do not cover:
- **The database a pool reaches** is not proved. A pool `openPool` opened on another database passes, so `lint.test.ts` still pins the two production call sites.
- **Code that replaces pg's `Pool.prototype.connect` before a pool is opened** is not stopped. That is the same class as a rewritten built-in, which "The guards' reach" already covers.

### Tests, before and after

| Test | Without the brand checks | With them |
| --- | --- | --- |
| `packages/model-gateway/src/patient-records.test.ts:51`: the in-memory scope and pool, each alone, refused with nothing read; by shape they are accepted | 1 failed | 29/29 |
| `packages/model-gateway/src/patient-records.db.test.ts:219`, case 1: a hand-built pool, a stray `new pg.Pool`, a copied scope, a scope claiming another practice, a scope kept past its transaction, and a scope opened on the stray pool, all refused with no connection taken | failed | passes |
| `patient-records.db.test.ts:219`, case 2: a stub `connect` assigned after `openPool` is never used, and the EOB still gives `names_patient` | failed | passes |
| The rest of `patient-records.db.test.ts` | — | 12/12 in the file |
| `packages/db/src/authz/scope.test.ts:243` and `:301` (`openScopeReaches` for request and job scopes, after the work, after a failure, copies, reassigned properties, unbranded pools and non-objects; `openedPool` frozen, ignores reassignment, nothing for other pools) | — | 33/33 |

- authz branch coverage stays at the 100% gate: 88 of 88 branches across the authz unit tests.
- `lint.test.ts:83-100` pins the issuing body: `recordsCheck` is private, called only by the two factories, and `issue(` appears 3 times.
- `lint.test.ts:181` pins `practiceRecordsCheckByShape` to `patient-records.ts`, `testing.ts` and tests, and never the entry.
- `lint.test.ts:164-167` updates the comment on the production-caller pin.

### Test adjustments

- `gateway.test.ts`, `functions/contract-terms.test.ts` and `patient-records.test.ts` use `practiceRecordsCheckByShape` with memory records.
- `patient-records.db.test.ts` and `gateway.db.test.ts` open their pools with `openPool`. Fault and race pools use the by-shape factory (`webCheck`'s `faulty`, and `racing`).

### ADR 0070

- "Bound to the caller's scope" has three new sub-bullets (:632-660).
- "The guards' reach" (:1071).
- Departure 31 (:1245).
- Tests for patient-records unit and db, `scope.test.ts` and `lint.test.ts`.
- "Open matters" records P12 as fixed (:1481).

## Suite (worktree, each heavy step under `flock /tmp/laneb-heavy.lock`)

| Command | Result |
| --- | --- |
| `pnpm typecheck` | passed, 22 projects |
| `pnpm lint` | first run: 5 errors in my new db code (unbound-method, no-misused-promises), fixed; second run passed, 1,631 files, 0 errors, 0 warnings |
| `pnpm lint:logs` | 1,061 files; every log call uses allowlisted fields |
| `pnpm lint:copy` | 514 files read; the product copy keeps the brand's words |
| `pnpm test` (unit, coverage on, including its gates) | 388 files; 6,480 passed, 4 skipped. That is 9 new tests over the CI total on f5292c6c. The skips depend on the machine |
| `pnpm --filter @tp/model-gateway eval` | gate passed (above) |
| `pnpm test:db --shard=N/4` | each shard on its own fresh, migrated `phi_fix2_shard_N` at localhost:5433, dropped afterwards |
| | shard 1: 32 files, 3,155 passed, 1 skipped (the restore drill) |
| | shard 2: 32 files, 2,064 passed |
| | shard 3: 32 files, 3,100 passed |
| | shard 4: 32 files, 929 passed |
| | total: 9,248 passed, 3 more than 9,245 (the 3 new db tests) |
| e2e `models.spec.ts` and `contracts.spec.ts` | built here, `E2E_DATABASE=phi_fix2_e2e`, port 3197; 2 passed in 2.3 min. The model proposal ran through the production build, so `servicesFromConfig`'s `openPool` pool and `invoke.ts`'s scope pass the brands |
| `tools/screening-capacity/watched.ts --write` | 535 lines, unchanged |
| `pnpm synth --all` | 240 cases, 0 written, 640 unchanged; EMR 16 unchanged |
| `pnpm check:fixtures` | passed |

Databases:
- I created phi_fix2_db, phi_fix2_db2, the four shard databases and phi_fix2_e2e, and dropped them all.
- What remains at localhost:5433 was there before I started: tp_e2e, tp_e2e_ux and three tp_test_*.

Mutation: `tools/stryker/affected.ts` compares commits, so it was not run on uncommitted work. packages/money, pricing, ledger and packets import nothing from @tp/db (grep), so the db changes should leave every money closure untouched. Run it after the commit:

```
pnpm -s exec tsx tools/stryker/affected.ts --event pull_request --base ecebdc90
```

## Every changed string a person sees

| Where | Text |
| --- | --- |
| `apps/web/src/lib/models/notices.ts:54` (`too_long`, new: the version page's notice after a refused proposal) | "This document is too long to send to the model, so nothing was sent. Enter its terms by hand below." |

The wording:
- It follows the four contract-screen notices ("This document …, so … Enter its terms by hand below.").
- It has no figure, since the person cannot shorten the document. ADR notice N14 records that choice, and the founder can reverse it.
- It contains no "AI", which lint:copy checks.

Not shown to a person:
- `contract-terms.ts:71`, the refusal's message: "a call sends at most 1,000,000 characters of a document; this one is longer and was not sent".
- `patient-records.ts:200` and `:203`, the construction errors:
  - "the screen reads the practice’s records only through a pool the database package opened";
  - "the caller’s scope is not one the database package opened, still open, that reaches the practice".

Neither holds an identifier or any document text.

## For the PR description

**Findings and items:**
- **P11 is fixed in this PR.** Cite phi-screen F5's skeptic, fix 5. Give the cap of 1,000,000 characters and its reasoning (above), and the new `too_long` notice. Take P11 out of the deferred list.
- **P12 is fixed in this PR**, with the scope and pool brands in `packages/db`. No #42 file and no migration. The verification's nit was right: `openPool` is where the production pools are made.
- **The order wording.** Every place now says "last before the budget's hold and the call". The heading "The screen comes last of the gateway's refusals" and the commit subject of bac083ac use the old phrase. The commit cannot change, but the description should.
- **The twin line** must name all three member-ID shapes: ZZ plus 7 digits, 9NN00NNNN, and 11 characters with B, L, S or Z.

**Counts and CI** (the verification's other items):
- Replace the CI paragraph with the run on the new head once it is pushed. Mention the f5292c6c base merge of ecebdc90, which resolved nothing by hand.
- Name ecebdc90 as the base for `tools/engine-freeze/check.ts` and `stryker/affected.ts`.
- Update the local counts to the ones above:
  - unit: 388 files, 6,480 passed, 4 skipped;
  - db: 128 files, 9,248 passed, 1 skipped;
  - synth: 240 cases, 640 unchanged;
  - watched-paths: 535 lines;
  - lint:logs: 1,061 files.
- Take the PR out of draft. That is the integrator's step.

**Base and history:**
- origin/claude/build-platform has moved to 0dd1ba7e (#80 merged). #80 edits `redact.ts`, so this PR needs a base merge that resolves `redact.ts`.
- Suggested commit split:
  - (1) model-gateway and web: the request's character cap (P11);
  - (2) db and model-gateway: the scope and pool brands (P12);
  - (3) docs: ADR 0070 and 0054, and the runbook (the order wording, the twins, P11, P12).

**Still open:**
- P10 and S2, after #42.
- F3 and F4, Lane A.
- P13, and P9 / N6.
