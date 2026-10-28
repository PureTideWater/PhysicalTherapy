# PART check 2: PR #75 (co-001/contract-phi-check), fix 2 checked, fixed and committed on f5292c6c

- Worktree: /home/user/contract-phi-check.
- New head: `4b886fcc` (two commits on f5292c6c). Nothing is pushed; origin/co-001/contract-phi-check is still f5292c6c.
- Progress: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/progress/check2.md
- Logs: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/check2-logs/
- Scripts: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/check2-scripts/
  - `expand.mts`: the screen at the cap on text that NFKC lengthens;
  - `measure-bytes.mts`: set v2's framed bytes, as sent and in NFKC form;
  - `db.sh`: the db files on a fresh database;
  - `reflow.py`: re-wraps ADR bullets.

Boundaries:
- Every value is synthetic: U+FDFA, the euro sign, the "fi" ligature, ZZ… IDs and SYNTHETIC fee lines.
- No migration.
- No #42 file. I checked the diff against /home/user/ops/LANES.md "Not while #42 is open"; `services.ts`, `settings.ts`, `rate-limit.ts` and `fields.ts` are untouched.
- Nothing changes under packages/pricing, packages/ledger, content/releases or fixtures/golden, and `domain-model.md` is untouched.
- No model name or identifier appears in an added line (grepped).

## Adversarial re-read of fix 2's diff: two findings, both fixed

### C1 (bypass of the cap's bound; fixed with tests)

**The gap.** `MAX_REQUEST_CHARACTERS` counted a string's length. But the two readers it was meant to bound count differently:
- **The screen** reads each non-ASCII line in NFKC form (`someIdentifierRun`). A compatibility character expands there: U+FDFA, one character, becomes 18 characters and 33 bytes.
- **The budget's hold** counts a token per UTF-8 byte (`mostCost`).

So a request within the cap could still:
- make the screen read 18 times the cap;
- be 3 MB as sent, past the 2,412,350 bytes the default budget holds. The hold would then refuse it after the screen, with a false `MODEL_BUDGET_EXCEEDED` "spent its daily model budget" alert.

The doc comment's "0.12 s worst case" and "fits the default budget" were therefore not bounds.

**Measured on the old cap** (`check2-logs/expand-before.log`, synthetic, 50,000 identifiers):

| Request | What the screen read | Time |
| --- | --- | --- |
| 1,000,000 × U+FDFA | 17,996,991 characters (2,999,646 bytes sent) | 1,277 ms; 2,076 ms with kept identifiers of every length |
| ASCII worst case | 999,999 characters | 83 / 366 ms |

Heap for the U+FDFA request:
- under a 96 MiB and a 192 MiB heap the screen alone runs out of memory ("FATAL ERROR: Reached heap limit");
- under 384 MiB it passes (2,509 ms).

The ASCII worst case fits in 96 MiB.

Also checked: the largest NFKC expansion over all code points, in both Python and Node, is U+FDFA, at 6 UTF-16 units a byte and 11 bytes a byte.

**The fix.**
- `packages/model-gateway/src/functions/contract-terms.ts`:
  - `MAX_REQUEST_BYTES = 1_000_000`, renamed from `MAX_REQUEST_CHARACTERS`. Its doc comment gives the reasoning and the measurement.
  - `TOO_LONG_MESSAGE` is now "a call sends at most 1,000,000 bytes of a document; this one is longer and was not sent".
  - `overCap(texts)` counts UTF-8 bytes as sent first, so a text already over is never normalized. Then it counts `screenedBytes`.
  - The pages pre-check is now: the length sum (free), then `overCap(pages)`. It runs before the `no_text` check normalizes anything, since that check, and `pageTextHash`, also NFKC the pages.
  - The framed check is `overCap([user])`.
- `packages/model-gateway/src/redact.ts` gains `screenedBytes(text)`: the UTF-8 bytes of the text as the screen reads it, with an ASCII fast path.
- `index.ts` exports `MAX_REQUEST_BYTES`.

**Tests.**
- `contract-terms.test.ts`:
  - the existing cap test, now in bytes: exactly at the cap is prepared, one byte over is refused;
  - a new test of the two counts:
    - 400,000 three-byte characters are refused;
    - 40,000 × U+FDFA (120,000 bytes sent, 1,320,000 in NFKC form) are refused, and also when the pages read differently only when framed;
    - a ligature page is counted as sent;
    - the largest admitted U+FDFA request has an NFKC form of at most the cap.
- `gateway.test.ts`: the P11 test loops over a long ASCII document and a U+FDFA page. Each gives `too_long` with no screen connection, no audit row, no hold, nothing sent, no row and no log line.
- `redact.test.ts`:
  - The largest U+FDFA request `prepare` admits is framed by `prepare` itself (new `expanding` shape in `test-support/screen-bound.ts`) and screened in a 96 MiB child. Result: 30,474 characters, 999,978 bytes read, 58 to 70 ms, heap 34 to 43 MiB.
  - A 3,000-run property checks `screenedBytes` against the screen's own line-by-line normalization.
- `path.test.ts` and `models-routes.db.test.ts` take the new name. The notice's no-figure regex now also excludes "byte".

| Variant (temporary edit, restored, `cmp` checked) | Result |
| --- | --- |
| Old length-only cap | 3 failed: the counts test; the gateway test (`names_patient` after a screen read); the expanding child, out of memory in 96 MiB (`c1-unit-without.log`) |
| Bytes sent only | 3 failed |
| NFKC form only | 1 failed (the ligature line) |
| Fix | 5 files, 168/168 (`c1-unit-after.log`) |

**Docs.**
- ADR 0070 Part 3: "The request's length" is rewritten. It says why bytes and both forms, records the finding and its measurement, and adds the 70 ms U+FDFA figure. The cap's new unit also changed:
  - the gateway's order;
  - "The time per click";
  - "A document longer than a call sends";
  - departure 30;
  - N14;
  - Consequences;
  - Tests (with the variant results);
  - Open matters.
- ADR 0054's amendment.
- The runbook bullet.
- The doc comments in `gateway.ts`, `notices.ts` and `path.ts`.

Set v2 is all ASCII (`measure-bytes.log`: bytes equal characters equal NFKC bytes, largest 173,684). So every set v2 figure, the 218/435-cent hold and the eval gate carry over unchanged.

### D1 (the pool brand's limit stated exactly; docs only)

`openedPool` binds `connect`, so a `connect` assigned to the pool later is never used. That claim holds. But pg's `connect` itself reads the pool's own state at call time: `this.Client`, `this.options`, `this._idle`, `newClient` and `_pulseQueue` (pg-pool 3.14.0). Code in the process that rewrites those after `openPool` can therefore still redirect reads.

That is the same class as a rewritten built-in, and it cannot be closed: `_idle` is mutated by design. Freezing the pool's options or `Client` would only narrow it, at a risk to every production pool.

`connect.ts`'s `openedPool` doc and the ADR's "What it does not prove" now say so. No code changes.

**No other bypass, leak or regression found.** I read every hunk of fix 2's diff:
- the scope registry: entries open only while `run` executes; a closure `access`, never the object's properties;
- the `recorded()` wrapper keeps the semantics for unrecorded scopes;
- `opened()` registers only for `openPool` pools;
- both production constructions happen inside an open scope: `contract-proposals.ts` in the request's scope, `permitted.ts` inside `inScope`;
- `services.ts:214` builds `modelPool` with `openPool`;
- the lint pins on `recordsCheck` and `practiceRecordsCheckByShape`;
- the `too_long` mapping and notice;
- the CSV test support;
- the permitted allowlist;
- the order wording.

`neutralize` only adds characters, and every page sits between line breaks, so the pages pre-check is a subset of the framed check.

## Commands (worktree; each heavy step under `flock /tmp/laneb-heavy.lock`, PATH as required)

| Command | Printed totals |
| --- | --- |
| `pnpm typecheck` | passed, 22 projects in 43.5 s wall |
| `pnpm lint` | passed, 1,631 files in 3 groups, 0 errors, 0 warnings |
| `pnpm lint:logs` | 1061 files scanned; every log call uses allowlisted fields |
| `pnpm lint:copy` | 514 files read; the product copy keeps the brand's words |
| `pnpm test` (unit, coverage, gates) | Test Files 388 passed (388); Tests 6483 passed, 4 skipped (6487); exit 0. This is 3 more than fix 2's 6,480: the counts test, the expanding child and the property. None of `tools/test/workflows.test.ts`, `rerun-rule.property.test.ts` or `packets/src/verifier.test.ts` failed, so no rerun was needed |
| `pnpm test:golden` | Test Files 5 passed (5); Tests 381 passed (381) |
| `pnpm --filter @tp/model-gateway eval` | gate: passed. 63 documents, precision and recall 0.996941; tier large tp 827, recall 1.000000; narratives 300 of 300 |
| `pnpm synth --all` | 240 cases; 0 written, 640 unchanged, 0 removed; 8 EMR formats, 16 unchanged |
| `tsx tools/screening-capacity/watched.ts --write` | 535 lines; `watched-paths.txt` unchanged (`git status` clean) |
| db: `patient-records.db`, `gateway.db`, `models-routes.db`, `uploads.db`, `permitted.db` on fresh, migrated `phi_check2_db` at localhost:5433 | Test Files 5 passed (5); Tests 75 passed (75). The fix added no db test; `models-routes.db` changed (its name only) and is included. The database was dropped afterwards |
| `tsx tools/stryker/affected.ts --event pull_request --base ecebdc90` (after the commit) | money: not affected; ledger: not affected. **pricing and packets: affected** by `packages/db/src/authz/index.ts`, `authz/scope.ts`, `connect.ts` and `runtime.ts` (imported). Shards: packets-scan, packets-rest, packets-explain, pricing-engine, pricing-recompute, pricing-rest (see open items) |
| `tsx tools/engine-freeze/check.ts ecebdc90` (before and after the commit) | no non-test file under `packages/pricing/src` changes; let through by the exception: nothing; problems: none |
| `pnpm check:fixtures` | 341 files read by the guard, 3811 text files searched for an X12 header; every interchange synthetic |
| `pnpm build` | exit 0 (web and worker) |
| `git rev-parse HEAD > apps/web/.next/BUILD_COMMIT` | 4b886fcc… |
| `E2E_PREBUILT=1 DATABASE_URL=postgres://postgres:test@localhost:5433/postgres pnpm test:e2e --workers=2` (with `E2E_DATABASE=phi_check2_e2e`, `E2E_PORT=3198`, so tp_e2e is not dropped; chromium-1248 matches the lockfile's playwright-core) | 54 passed (8.1m); exit 0. Among them `models.spec.ts` (the proposal through `openPool`'s pool and `invoke.ts`'s scope) and `contracts.spec.ts`. `phi_check2_e2e` was dropped afterwards |
| `gitleaks git --log-opts="f5292c6c..HEAD" --no-banner` (pinned 8.24.3) | 2 commits scanned, about 74.81 KB; no leaks found; exit 0 |
| `.githooks/pre-push origin <url>`, standalone, stdin `refs/heads/co-001/contract-phi-check 4b886fcc… refs/heads/co-001/contract-phi-check f5292c6c…` | "2 commits checked: 0 file(s) read by the fixture guard, 30 text file(s) searched for an X12 header, and gitleaks found no secret."; exit 0; nothing pushed |

The databases left at localhost:5433 are the ones that were there before: tp_e2e, tp_e2e_ux and three tp_test_*.

## Commits (on f5292c6c; not pushed)

Each ends, after a blank line, with the two required lines.

- `4a099795` model-gateway, db, web: the contract request's cap, in bytes as sent and as screened (P11), and the records check on the database package's own scope and pool only (P12)
  - 27 files, 765 insertions, 121 deletions: all code and tests.
- `4b886fcc` docs: ADR 0070 Part 3 and ADR 0054 with P11 and P12 fixed, the screen last before the hold, and the runbook
  - 3 files, 191 insertions, 67 deletions.

Total against f5292c6c: 30 files, 956 insertions, 188 deletions.

## Open items

1. **Mutation will run 6 shards in CI.** `affected.ts` reports pricing and packets affected through their imports of `packages/db` (the P12 brands in `connect.ts` and `authz/scope.ts`). Fix 2's prediction ("no money path changed") was wrong, so the PR description must not repeat it.
   - The shards: packets-scan, packets-rest, packets-explain, pricing-engine, pricing-recompute, pricing-rest.
   - No money code changes, and the brands change no behaviour for pools `openPool` did not open, so the scores should match the base. But the required mutation check runs these shards, and I did not run them locally.
2. **The base moved.** origin/claude/build-platform is now a6e754fc (#80 and #79 merged).
   - `git merge-tree` of HEAD with it conflicts in 6 files: `uploader.tsx`, ADR 0054, `test-matrix.md`, `redact.ts`, `synth/src/cases/matrix.ts` and `registry.ts`.
   - The same 6 conflict at f5292c6c, so none comes from this round; `redact.ts`'s conflict hunk is at :91-112, not at `screenedBytes`.
   - The base merge is the integrator's step.
3. **The PR description needs updating:**
   - P11 is a cap of 1,000,000 UTF-8 bytes, counted as sent and in NFKC form (`MAX_REQUEST_BYTES`), with the C1 reason; the internal sentence now says "bytes";
   - P12 is fixed;
   - the order wording ("last before the budget's hold and the call");
   - the twin line names all three member-ID shapes (ZZ plus 7 digits, 9NN00NNNN, 11 characters with B, L, S or Z);
   - name ecebdc90 as the base for engine-freeze and affected.ts, with the shard result above;
   - the counts: unit 388 files, 6,483 passed, 4 skipped; golden 381; the five db files 75; e2e 54; synth 240 cases, 640 unchanged; watched-paths 535; lint 1,631; lint:logs 1,061;
   - the CI paragraph, from the run on the pushed head;
   - take the PR out of draft (the integrator's step).
4. **Still deferred, unchanged:** P10 and S2 (after #42), F3 and F4 (Lane A), P13, and P9 / N6.
5. **Not run here:** the full `pnpm test:db` (4 shards). Fix 2 ran it on the uncommitted tree: 9,248 passed. This round changes no db code; its one db-test edit is a rename in `models-routes.db.test.ts`, which passed above.
