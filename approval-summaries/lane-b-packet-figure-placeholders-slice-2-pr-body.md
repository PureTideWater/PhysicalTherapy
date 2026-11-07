## What changes

Slice 2 of narrative figures as placeholders bound to the facts (`designs/lane-b-packet-figure-placeholders.md` on `claude/build-ops`, section 9; slice 1 was #128). It builds the verifier format `tp-packet-verifier/3`, which checks a narrative written as a template, and the code draft that writes one. Both are reached only by naming the format. **`VERIFIER_FORMAT` stays `tp-packet-verifier/2`**, and the code draft's default output stays byte for byte what it wrote before, so no text a payer receives changes. The one change at /2, and the only one a person could see, is a tightening: a stray `{{ }}` or a fact token in a /2 narrative now fails closed as `unknown_placeholder` (below).

**Decision record:** ADR 0089, `docs/adr/0089-write-a-narratives-figures-as-fact-tokens-rendered-by-code-refuse-every-free-figure-and-read-english-only-for-contradiction.md` (proposed; accepted when this pull request is approved). It amends ADR 0086 and marks 0086's "Revisit when" item on placeholders done. **Test matrix:** CAS-52, CAS-53 and CAS-54, in `docs/product/test-matrix.md` and `packages/synth/src/cases/matrix.ts`, with registry entries and generated `fixtures/synthetic/CAS-52..54/expected.json`.

42 files against `claude/build-platform` (ce95546d), +3,225 / −78. The head is **79d7e1bb27aa1b8efa193b6fc64e6b4cafcf3a1b**.

- **Format /3 behind an explicit format** (`packages/packets/src/format.ts`, `verifier/index.ts`):
  - `VERIFIER_FORMAT_V3`, `VERIFIER_FORMATS` and `VerifierFormat` are new.
  - `verifyTemplate(template, content, identifiers)` and `verifyAtFormat(format, …)` are in `@tp/packets`, and `checkTemplate` is in `@tp/packets/check`. Called at /2, `verifyAtFormat` is `verifyNarrative` over `narrativeFacts(content)`.
  - A /3 report has the /2 keys plus `rendered_sha256`: the SHA-256 of the template rendered with identifier placeholders left unfilled, or of no text when a token renders nothing (such a report always fails). `narrative_sha256` stays the stored template's hash. `VerifierReport` is now `VerifierReportV2 | VerifierReportV3`.
- **Pass 1, the template** (`verifier/template.ts`, new, browser-safe):
  - Strict scanning (`scanText(text, { strict: true })` in `scan.ts`) refuses every figure in the free text: `free_figure` for one written in symbols, `number_word` for one written in words.
    - The scanner's tables are exported, with strict-only additions: nil, nought, naught, billion, quarter, double, triple and once; plurals; currency words; zero-amount phrases ("paid nothing", "made no payment", "nothing was paid").
    - Any leftover `\p{N}` character or `$ % § # ¢` fails too.
    - A number character that NFKC reads as letters ("Ⅻ") is a `free_figure` at its raw span.
    - Without the option, `scanText` is unchanged for every importer.
  - Fact ids are read through slice 1's catalog and renderer:
    - An id this content does not hold, a stray brace, or a token whose characters differ from what it shows fails as `unknown_fact`.
    - A non-canonical id fails as `fact_not_canonical` and carries the canonical id.
  - **A token stands apart** (`fact_not_separated`). These fail:
    - a sign, a point, a letter, a digit or another token typed against a token;
    - a sign, a currency sign or a sign's word ("negative", "minus", "plus", …) set off before it by whitespace, brackets or quotation marks;
    - anything after a token's run of closing punctuation, however long that run is.

    The check reads backwards from each token's start with one sticky lookbehind, so it runs in linear time.
  - All of /2's rules still apply. Every span is reported in template offsets.
- **Pass 2, contradiction only** (`verifier/contradiction.ts`, new):
  - Each fact's phrase is replaced, through the renderer's span map, by a stand-in figure of its kind. ADR 0086's reader then reads the text through the new `readAround` in `roles.ts`, so a token's role and scope always come from the catalog.
  - A token fails as `fact_contradicted` when:
    - a role cue in the free text names other roles;
    - a closed-list trigger, "per line" or "per unit", or a part-naming token stands beside an all-lines fact (unless the part-naming tokens' rows together cover every line, computed over row sets);
    - a total cue (`totalCues()`, new in `roles-reader/cues.ts`) stands beside a part fact.
  - A stand-in that cannot be read as a figure of its own fails the token closed. The check never throws.
- **`serializeDraft`** (`serialize.ts`, new, pure): writes drafted segments as a template, by design section 2.3. `templateSentenceSpans` is exported for the gateway's schema later. Nothing calls `serializeDraft` yet (slice 6).
- **The code draft** (`draft.ts`): `draftNarrative(content, { format })`.
  - The default, /2, is held byte for byte against a copy of the old function (`legacy-draft.test-support.ts`), thrown errors included.
  - At /3 it writes only tokens a model may also use, names a fact only where the catalog has one, and keeps ADR 0086's sentence splits.
- **/2 fails closed on stray braces** (`verifier/mismatches.ts` `strayBraces`): under /2, any `{{…}}` run that is not an identifier placeholder, and any lone `{{` or `}}`, now fails as `unknown_placeholder` at its span. Before this, a fact token passed /2 silently.
- **Mismatch shape:** `MISMATCH_CODES` gains six codes, `Mismatch.kind` gains `'fact'`, and there is an optional `canonical` key, set only on `fact_not_canonical`.
- **Web words** (`apps/web/src/lib/packets/view.ts`): `MISMATCH_TEXT` has plain words for the six codes, and `FIGURE_KIND_TEXT` has `fact`. `mismatchShown` shows a typed figure as typed (`free_figure`, `number_word`) and returns null for the four fact codes, so a malformed token is never echoed. No web caller reaches /3 in this slice, so these words are not shown yet.
- **Mutation:**
  - A new shard, `packets-template`, covers `verifier/template.ts`, `verifier/contradiction.ts`, `serialize.ts` and `draft.ts`. That makes 19 shards. It is added to `stryker/shards.json`; `stryker/base.mjs`'s packets set gains `serialize.ts` and `draft.ts` (the `verifier/` files were already mutated); `tools/stryker/shards.test.ts` and `tools/stryker/affected.test.ts` list the new shard.
  - `docs/runbooks/ci.md` gets the shard's row and the counts.
  - `tools/stryker/affected.ts` gets a data-file entry that makes `equivalent/packets.json` an input of `draft-template.test.ts`.
  - `tools/stryker/unicode.json` gets the new Unicode-based equivalent, and `tools/screening-capacity/watched-paths.txt` gets the three new source files.
  - `vitest.mutation.config.ts` `EXCLUDED` gains `verifier-template.performance.test.ts`, with its reason, as pricing's `performance.test.ts` is excluded: the test asserts only time, so under instrumentation on shared CPUs it passed or failed by load (7984faa8, under Checks). The unit project still runs it.
- **`facts.ts` `parameterFigures`** (79d7e1bb): its array branch is removed, with the two equivalent records that proved it redundant. An array is an object, so `Object.entries` gives its items under `'0'`, `'1'`, …, none of which ends in `_cents` or is `percent` or `percentage`, and each item is read by the same recursive call. What it returns does not change; no test changed. The reason is a CI mutation timeout, under Checks.
- **Tests (new):** `scan-strict.test.ts`, `verifier-template.test.ts`, `verifier-template.performance.test.ts` (the 100,000-character time test, moved there unchanged), `verifier-contradiction.test.ts`, `draft-template.test.ts` and `serialize.test.ts`, with the old draft kept as `legacy-draft.test-support.ts`, additions to `verifier.test.ts` (the /2 draft byte for byte, as a property) and `apps/web/src/lib/packets/view.test.ts`, and one test title in `fact-catalog.test.ts` given a CAS-53 suffix.

### For Lane A's slice-3 migration

ADR 0089 decides these, in its "Notes for slice 3's migration":
- **Six new mismatch codes**, for /3 reports only: `free_figure`, `number_word`, `unknown_fact`, `fact_not_canonical`, `fact_contradicted` and `fact_not_separated`.
- **Kind `'fact'`** on a mismatch, for /3 reports only.
- **A sixth mismatch key, `canonical`**, on `fact_not_canonical` only. It holds a fact id, never text. `packet_verifier_report_valid` must accept it, so the editor can offer the canonical id from the stored report without recomputing the catalog.
- **Deploy order:** the `VERIFIER_FORMAT` flip to /3, slice 3, must ship **with or after slice 4's export render**. Slice 4 is the worker's export: it renders the template, checks `rendered_sha256` and asserts that no `{{` survives. Today's export prints only the stored text, so a /3 template exported now would print its tokens.

## Why

ADR 0086's known limit. A sentence can name a part of the lines in words that its trigger list does not hold ("on a subset of the lines", "apiece", "for her"), and it still passes a total. The review rounds of 2026-11-04 found new words on each pass, so a list of English words cannot close the class.

The decision (Lane A's orchestrator, 2026-11-04) follows CLAUDE.md rule 1, that code computes every number. A narrative's figures become fact tokens that code renders with their role and their lines, the free text holds no figure, and English is read only to find a contradiction. Slice 1 (#128) built the catalog and the renderer. This slice builds the check and the draft that use them. Both stay behind an explicit format, because the database accepts no /3 report until slice 3's migration and the export prints tokens until slice 4.

Item: `co-001/packet-figure-placeholders` (Lane B), slice 2. Not a pull request into main.

### Decisions, with reasons (ADR 0089)

- **(a) Nothing served changes.** `VERIFIER_FORMAT` stays /2, and /3 is reached only by naming it. The database cannot store a /3 report until slice 3, and the export cannot render a template until slice 4.
- **(b) Fail closed on tokens, in both formats.**
  - Under /2, a fact token or any stray `{{ }}` now fails as `unknown_placeholder`. A template saved under /2 would otherwise pass with tokens no export renders.
  - Under /3, anything braced that neither the fact pattern nor the identifier pattern reads is `unknown_fact`. So is a token whose raw characters differ from what it shows, because the renderer reads the text as written.
  - A malformed token is never echoed: a mismatch holds codes, positions and a canonical id only.
- **(c) The /3 report** is the /2 keys plus `rendered_sha256`. The hash of the stored template and the hash of what code renders from it are both kept. Identifiers stay unhashed.
- **(d) Spans are template offsets**, pass 2's included, so the editor's marks stay on the stored text.
- **(e) `serializeDraft`** is plain, pure and browser-safe, with no schema library. A property test holds that it keeps each sentence and that sentence's markers, so the gateway can share the sentence rule in slice 6.
- **(f) One strict list.** The scanner's own tables are exported and extended once. The scanner is not given a second vocabulary, so the verifier's marks and, from slice 6, the model's prompt name the same refusals.
- **`fact_not_separated` is a new code**, not `unknown_fact` or `free_figure`, because the person's fix is a space, not another figure.
- **Accepted false refusals:** "one of the lines", "first", "once", "double-check", "a quarter" of a year, "the dollar amount", and "level one", which must be `{{fact:packet.level}}`. A possessive or a hyphenated word against a token is refused too, and so is a token after "plus" or "positive" used as an ordinary word. The person rewords in one step.
- **Accepted readings:**
  - Two tokens one space apart pass, because each phrase is printed whole by code and the space keeps the figures apart.
  - Roman numerals spelled in letters outside level, appeal or tier, and Han numerals, stay prose, as the design's one list has it. Widening that list is a design change, recorded under "Revisit when".
- **The residual:** English that names a part with no token and no listed word ("apiece", "for her") still passes, but it no longer changes what the payer reads. The figure prints its own set, stated by code. ADR 0086's trigger list stops growing.
- **Real providers stay `no_entry`** at the evaluation gate until a recorded run of prompt v2 (slices 6 and 7).

## What it does not change

- Pricing engine (`packages/pricing`): unchanged.
- Ledger (`packages/ledger`): unchanged.
- Database schema and migrations: unchanged; no migration. The /3 migration is slice 3, Lane A's. `pnpm db:domain-model --check` passes against the schema at `20261109090000_line_status_heads.sql`.
- Content releases (`content/`): unchanged.
- Domain model (`docs/product/domain-model.md`), its approval line and `approvers.json`: unchanged.
- CI and the GitHub settings: no workflow file changes, and no mutation timeout, concurrency or threshold changes. The mutation shard list gains `packets-template` (19 shards), and the mutation test set leaves out one time-only test (7984faa8). Because `stryker/shards.json`, `stryker/base.mjs`, `tools/stryker/affected.ts` and `tools/stryker/equivalent/packets.json` are global mutation inputs, CI's `mutation` job runs every shard on this pull request. The screening-capacity watched paths gain three source files.
- Nothing else served changes:
  - `VERIFIER_FORMAT` and every caller's verifier format are unchanged: web, worker, gateway and evaluation.
  - The code draft's default text is byte-identical, so the gateway's local provider sees today's text and no prompt changes.
  - Nothing changes in the worker, the export, the approval path or `verifierNow`.
  - The editor has no picker yet; that is slice 5.
  - `facts.ts`'s narrative facts are the same for every input: the removed array branch did what the object branch does (79d7e1bb).
- One /2 effect, by design: a /2 narrative holding a stray `{{` or `}}`, or a `{{…}}` run that is not an identifier placeholder, now fails as `unknown_placeholder`. A stored /2 narrative with such text would read `fails_now` on its next check. Nothing the product writes produces one, and none of the tests' or synthetic sets' narratives holds one. Every existing test passes; the only existing tests edited are the shard lists in `tools/stryker/shards.test.ts` and `affected.test.ts` (18 to 19 shards) and the one renamed title in `fact-catalog.test.ts`.
- Out of scope, by later slice:
  - slice 3: the migration and the format flip;
  - slice 4: the worker's export and approval path, with `rendered_sha256`, `rendered_changed` and `schedule_changed`;
  - slice 5: the editor's picker and preview;
  - slice 6: the gateway's prompt v2 and its use of `serializeDraft`;
  - slice 7: the v2 evaluation set.
- Known not covered (ADR 0089, "Not covered"): `scanText`, in both /2 and strict mode, takes time that grows with the square of a very long run of letters followed by whitespace, or of quotation marks: about 0.8 s at 40,000 letters and about 3 s at 80,000. Sentence splitting (`sentenceSpans`'s `continuesAfter`, unchanged and shared with /2) costs far more when many sentences follow such a run: it grows with the run's square times the number of sentences after it that start with a fact token at /3 (or with a lower-case word at /2). A 19,701-character template, 14,000 letters then 190 token-led sentences, took 19.6 s in review (R3-FAIL-CLOSED-1) and 55 s for `templateSentenceSpans` in a probe on the head; the same shape in lower-case prose took 54 s for `sentenceSpans` at /2. ADR 0089's "Not covered" names only the single-run figure. The cost predates this slice and is not fixed here. The separation check's timing test uses inputs the scanner reads in linear time.

## Checks

The required checks report on this page by themselves: <!-- required-checks -->`all green`, `mutation`,
`screening-capacity gate` and `approval-of-record`<!-- /required-checks -->.

### CI on the head 79d7e1bb27aa1b8efa193b6fc64e6b4cafcf3a1b

**Green.** All 39 check runs completed: 38 succeeded and `notify` was skipped. That includes `all green`, `unit`, `db` (1/4 to 4/4), `e2e` (1/2, 2/2), `mutation`, `screening-capacity gate`, `capacity`, `approval-of-record`, `domain model`, `images`, `build`, `lint`, `static`, both `changes` runs and all 19 Stryker shards. The mutation job's gate reads "mutation gate: passed": money 96.81% (243 of 251), pricing 98.67% (1,934 of 1,960), ledger 98.48% (2,018 of 2,049), packets 99.17% (10,757 of 10,846), and every mutant no test caught is a recorded equivalent. The unit job: 488 test files passed; 10,138 tests passed and 2 skipped (10,140). `claude/build-platform` ce95546d is an ancestor of the head.

**Fresh-clone verification on 79d7e1bb27aa1b8efa193b6fc64e6b4cafcf3a1b: pass, no problems.** A fresh clone, `pnpm install --frozen-lockfile`, then:
- Ancestry and CI as above.
- `format.ts` sets `VERIFIER_FORMAT = 'tp-packet-verifier/2'`. `VERIFIER_FORMAT_V3`, `verifyTemplate`, `verifyAtFormat` and `checkTemplate` are used only inside `packages/packets/src` and in tests. In the apps, /3 appears only in two comments this pull request does not change (`verifier-now.ts`, `approval.ts`) and in `view.ts`'s mismatch words. Every production `draftNarrative` caller passes no format (web `queries.ts`, worker `services.ts`, the gateway's `testing.ts`, e2e `models.ts`).
- The draft-template differential tests passed ("writes format /2 by default, byte for byte", on every named content and on every generated pattern). A separate probe compared the head's `draftNarrative` with cc3dd7f6's `draft.ts` on four contents built with the package's test builders (default, two codes, per visit, regulation): the /2 output was identical with no `{{fact:` token, and naming /2 explicitly gave the default's text. The /3 code draft holds tokens and passes `verifyTemplate` at /3 with no mismatches; the same text fails `verifyNarrative` at /2 (`unknown_placeholder`, `figure_not_in_input`). `verifyTemplate('The payer paid 3 units [1].')` fails with `free_figure` at characters 15 to 16.
- No migration or SQL file is in the diff, and `docs/product/domain-model.md` is unchanged against the base. ADR 0089 is present. The CAS-52, CAS-53 and CAS-54 rows in `docs/product/test-matrix.md` match the synth `TEST_MATRIX` exactly (compared by a script).
- No `.skip`, `.only`, `.todo`, `skipIf` or `runIf` is added; the one `context.skip` in cc3dd7f6..79d7e1bb is already on the base (`packages/contracts/src/evidence/pages.test.ts`). The performance test is excluded only in `vitest.mutation.config.ts`; the unit config still runs it.
- `pnpm typecheck` passed (23 projects). Vitest over `packages/packets`, `apps/web` `view.test.ts` and synth `fixtures.test.ts`: 46 files, 1,748 tests passed. Nothing was committed, pushed or posted.

### Since the full local suite: two CI mutation reds and a base merge

CI's `mutation` job failed twice after the full local suite, each time on a recorded equivalent that survives locally every time. Both were CI load, not a mutant a test tells apart. Each fix moves or removes code; **no test assertion, timeout, threshold or Stryker setting was weakened**, and no record was added.

| Commit | Cause | Fix | Shards and gate |
| --- | --- | --- | --- |
| 7984faa8 | CI run 42360596958 (on a851850d's merge ref, the same tree, the same Node 24.22.0, Unicode 17.0 and ICU 78.3) scored the recorded `template.ts:180:65` equivalent (`marker.start < span.end` → `<=`) **Killed**. Among its 70 covering tests was the packets set's only wall-clock assertion, "reads the text before each token once: 100k-character templates", under 1,500 ms per template. Inside the full shard it took 774 ms in the dry run and 923 ms with the mutant active on 4 local CPUs; on the runner's 4 shared vCPUs with 4 test runners it can exceed the bound, and Stryker counts that failure as a kill. | The time test moved, unchanged, to `verifier-template.performance.test.ts`, which the unit project still runs; `vitest.mutation.config.ts` leaves it out of mutation runs with its reason, as pricing's performance test is. The record stays. | All 15 packets shards locally: run 0, gate 0 each. The canary 5/5 and the full gate passed: packets 99.16% (10,760 of 10,851), 91 recorded equivalents, as before the move, so no mutant was detected by the time test alone. `template.ts` 208 of 209. |
| 972cae9c | Up-to-date merge of `claude/build-platform` ce95546d (#132). | Clean, no conflicts; both sides kept. The files both sides changed (`view.ts`, `view.test.ts`, the test matrix, the synth matrix and registry) merged automatically. `watched.ts --write` and `synth --all` changed nothing. typecheck, lint, lint:copy, lint:logs, check:fixtures and verify-content pass; the touched unit tests (141 files, 3,087 tests) pass. No merged file is in a Stryker shard. | — |
| 79d7e1bb | CI run 42369472158 (on 972cae9c) scored the recorded `facts.ts:226:7` equivalent (`Array.isArray(value)` → `false`, recorded 2026-10-25, a file this pull request had not touched) **Timeout**; it survived in run 42360596958 on the same code, and its twin 226:29 survived in the same job. A `describe` body in `facts.test.ts` reaches `parameterFigures`, so the mutant is static: every test of the package runs under one clock (1.5 × the dry run's net + 30 s + overhead, about 87 to 93 s). With the mutant active the tests take the time they take without it (twice each way, no per-test slowdown); CI's dry runs of the same code vary from 24.5 s to 36.4 s net. | The branch the records proved redundant is removed, with its two records (226:7 and the block at 226:29). Reading the facts inside the tests instead, so the mutant would not be static, was measured and rejected: it reorders the files static mutants run, and packets-scan took 920 s and 942 s against 672 s. | packets-facts locally: run 0, gate 0 (445 of 446, one recorded equivalent left). The full gate passed: packets 99.17% (10,757 of 10,846), 89 recorded equivalents. Unit (1,927 touched tests), typecheck, lint and lint:logs pass. CI on 79d7e1bb: green, above. |

**Proposal, not this pull request's:** an audit of every recorded packets equivalent's covering tests found about 14 other static ones at the same local margin (0.42 to 0.47 of their timeout: `scan.ts:369` and `:655`, `readable.ts:87`, `assemble.ts:110` and `:145`, `interest.ts:99` and `:120`, among others), with the same CI-load exposure; the base shares it, and any of them could flip on a loaded run. Each mutant job runs Stryker with 4 workers on 4 vCPUs, while the dry run that sets the clock runs alone. A CI-level fix, with its own reviews, would remove the class: the mutation jobs' Stryker concurrency below the vCPU count, or a timeout factor for static mutants.

### The full local suite (on a851850d)

The full local suite ran on **a851850d**, the head when this description was first written. That commit merges `claude/build-platform` 8a722f80 (#130, #131) into the branch; its first parent, ba35c381, is the last slice-2 commit. The three commits since are above. Logs are in the build's scratchpad.

| Command | Result |
| --- | --- |
| Up-to-date merge a851850d (8a722f80: #130, #131) | Clean. The four files both sides changed merged automatically: the test matrix, the synth matrix and the registry keep both sides' rows (CAS-52..54 plus SEC-24 and TBL-08). `tools/screening-capacity/watched-paths.txt` was regenerated with `watched.ts --write` and came out the same (581 paths under its 3 header lines). `synth --all` after the merge changed nothing. |
| `pnpm typecheck` | Pass, 42 s |
| `pnpm lint` | Pass, 95 s |
| `pnpm lint:copy` | Pass, 2 s |
| `pnpm lint:logs` | Pass, 3 s |
| `pnpm check:fixtures` | Pass, 0 s |
| `pnpm verify-content` | Pass, 1 s |
| `pnpm synth --all` | Pass, 3 s, no diff |
| `pnpm db:domain-model --check` | Pass. It matches the schema at `20261109090000_line_status_heads.sql` (381 functions, 100 tables). It ran against its own migrated database on PG18 (migrated in 2 s). The first two attempts were setup errors, not test failures: one had no `DATABASE_URL`, and one used an unmigrated database. |
| Unit (`pnpm test`) | 484 files: 10,057 passed, 4 skipped, 401 s |
| `pnpm test:golden` | 5 files: 381 passed, 52 s |
| `synth --large` | Pass, 1 s |
| Oracle (pyx12 against edi835) | Agree on all 689 fixtures (678 valid; 11 malformed and rejected as expected), 51 s |
| `pnpm test:db`, 4 shards run one after another on PG18 | 1/4: 38 files, 3,290 passed, 1 skipped, 509 s. 2/4: 37 files, 2,256 passed, 162 s. 3/4: 37 files, 3,311 passed, 259 s. 4/4: 37 files, 1,006 passed, 309 s. Together: 149 distinct files, each run exactly once, 9,863 passed and 1 skipped. |
| Build (stamped with `BUILD_COMMIT`), then `pnpm test:e2e` with `E2E_PREBUILT=1` | Build 66 s. e2e: 81 passed, 692 s |
| Mutation (`tools/stryker/affected.ts`: all 19 shards affected, since the branch changes global inputs) | Each shard ran its canary first, then its run and its shard gate (run 0, gate 0). Times:<br>• packets-template 210 s, packets-figures 245 s, packets-verifier 398 s, packets-scan 692 s<br>• packets-facts 282 s, packets-rest 263 s, packets-explain 432 s<br>• packets-roles 404 s, packets-roles-cues 250 s, packets-roles-numbers 329 s<br>• packets-words-labels 252 s, -amounts 190 s, -days 194 s, -dates 163 s, -prose 226 s<br>• money-ledger 234 s, pricing-engine 315 s, pricing-recompute 214 s, pricing-rest 176 s<br>About 5,469 s in total. |
| Mutation final gate, `--expected` all 19 shards | Pass on a851850d (on the head, packets is 99.17%, 10,757 of 10,846, after 79d7e1bb removed two records; above). money 96.81% (243/251), pricing 98.67% (1,934/1,960), ledger 98.48% (2,018/2,049), packets 99.16% (10,760/10,851). Every mutant no test caught is a recorded equivalent. packets-template's files: `draft.ts` 98.97%, `template.ts` 99.52%, `contradiction.ts` 100%, `serialize.ts` 100%. |
| Suite checker | ok, no problems |
| Properties | The draft-template and serialize properties each passed under 40 seeds during the build. In the full run, no test failed and none needed a re-run. The MOD-16 property test did not flake. |
| Pre-push hook (fixture check and gitleaks) | Passed on every push |

**Reviewed equivalents** (`tools/stryker/equivalent/packets.json`):

| File | Mutant | Status |
| --- | --- | --- |
| `verifier/template.ts` | EqualityOperator `marker.start < span.end` → `<=` | Recorded and signed by an independent review (2026-11-06, d96a053a). The argument: no grapheme cluster joins a sentence end's whitespace to the mark before it or to a marker's bracket. It rests on Unicode data, so it is also listed in `tools/stryker/unicode.json` (Node 24.22.0, Unicode 17.0, ICU 78.3), the same argument as the reviewed `mismatches.ts` entry. |
| `draft.ts:147` | ConditionalExpression: the interest guard's first two checks → `true` | Recorded and signed by an independent review (2026-11-07, 7e9618e3). `interestStated` stays false wherever interest or its total is null. A probe of 3,024 content variants at both formats, plus 60 generated runs for each of 11 interest variants, killed nothing. |
| `draft.ts:147` | ConditionalExpression: `interest.total_cents !== null` → `true` | Same as above. |
| `scan.ts` | StringLiteral `'0'` → `""`, occurrence 3 → 6 | Renumbered only: slice 2 added three literals before it (nil, nought, naught). A reviewer confirmed it points at the same `int(match[2] ?? '0')`, and that all 64 of `scan.ts`'s entries still point at the same code. |
| `draft.ts:147` | LogicalOperator: conjunction → disjunction | **Not equivalent; removed** (round 4, 0b5ca610). The mutant prints "Prompt-pay interest of $0.00" when every line was paid on time. A $0.00-interest case now kills it (the founder's ruling of 2026-10-20, Q4 (a)). |
| `draft.ts:40` | OptionalChaining `pattern.codes[0]?.contract_amount_cents` | **Not equivalent; removed** (round 6, 7e9618e3). An empty `pattern.codes` is a value of the declared type. A per-visit content with no codes drafts the page's sentence, where the mutant throws, and a test now kills it. |
| `facts.ts:226:7` | ConditionalExpression `Array.isArray(value)` → `false` (recorded 2026-10-25) | **Removed with the code it named** (79d7e1bb). The array branch it proved redundant is gone, so the mutant no longer exists. CI scored it Timeout under load (under Checks). |
| `facts.ts:226:29` | BlockStatement: the array branch's block → `{}` (recorded 2026-10-25) | Same as above. |
| `template.ts:180:65` | The `<=` record above | **Kept** (7984faa8). CI scored it Killed only by the wall-clock test's load; that test now runs outside mutation runs. |

## Reviewer agents' findings

The first workflow ran four adversarial reviews: Money A and Money B (payment-engine checklist), security (fail-closed) and test quality. Two skeptics checked each finding, one reproducing it and one judging it against intent and scope. A finding counted as confirmed only when both found it real. A fixer and a recheck followed; the recheck raised two new findings (NEW-1, NEW-2). The second workflow began with a carry-over: an independent review of the proposed equivalent, the two skeptics on NEW-1 and NEW-2 (split verdicts), the session's decision on them, a fix and a recheck. It then ran three loop rounds of four lenses (money, fail-closed, conformance, tests) with the same two skeptics, then a completeness critic with a second equivalents review, each followed by a fix and a recheck. The loop stopped at its three-round limit without a dry round, and the critic's recheck found one nit.

The EDI reviewer was not run: no parser or 835 code changes. The UX and brand reviewer was not run: nothing a person sees changes, because the web words for the six codes are reachable only at /3, which no web caller uses yet. No screenshots.

**Totals:**

| Round | Raised | Confirmed | Refuted |
| --- | --- | --- | --- |
| Round 1, four reviews | 18 | 9 | 9 |
| Round 1's recheck (NEW-1, NEW-2) | 2 | 2 | 0 |
| Round 2, the proposed equivalent | 1 | 1 | 0 |
| Round 3 | 15 | 8 | 7 |
| Round 4 | 10 | 4 | 6 |
| Round 5 | 5 | 2 | 3 |
| Round 6, the critic | 4 | 1 | 3 |
| Round 6, the equivalents review | 3 | 3 | 0 |
| Round 6's recheck | 1 | 1 | 0 |
| **All rounds** | **59** | **31** | **28** |

NEW-1 and NEW-2 had split verdicts. They count as confirmed because the session decisions below acted on them: one was fixed, the other recorded as an accepted reading.

Every confirmed finding was rechecked as fixed. The recheck after rounds 1, 2 and 3 each raised new findings, which went into the next round.

Commits:
- Round 1's fixes: d21f4577.
- Round 2: c3a2743e (NEW-2), 3d44aff7 (NEW-1) and d96a053a (the equivalent).
- Round 3: 2f3726ad. Round 4: 0b5ca610. Round 5: e30a44aa. Round 6: 7e9618e3.
- The final nit: ba35c381.

| Round / reviewer | ID | Severity | Finding | Outcome | Commit |
| --- | --- | --- | --- | --- | --- |
| R1 Money A | MONEY-A-1 | blocking | A sign, a point or letters typed against a fact token change the figure code prints, and /3 passed it | Fixed: new code `fact_not_separated` | d21f4577 |
| R1 Money A | MONEY-A-2 | should fix | Roman numeral characters (Ⅻ) and other numeral characters passed strict mode | Fixed within scope: a number character that NFKC reads as letters is `free_figure`. Spelled Roman and Han numerals are an accepted reading ("Revisit when") | d21f4577 |
| R1 Money A | MONEY-A-3 | should fix | Passive and slang zero-payment phrases pass | Refuted: prose with no figure, outside the design's class (section 2.4); design section 10 puts it out of scope | — |
| R1 Money A | MONEY-A-4 | should fix | Number and currency words outside the strict tables pass | Refuted: the design lists exactly which words are added; widening the list is a design change | — |
| R1 Money A | MONEY-A-5 | should fix | "each" or "apiece" after a pattern total passes | Refuted: the residual the design names and accepts; the figure prints its own set | — |
| R1 Money A | MONEY-A-6 | should fix | A `pattern.*_each` fact beside a total word passes | Refuted: not a part fact under section 4; its phrase states its own per-line scope | — |
| R1 Money B | MONEY-B-1 | blocking | Two glued tokens, or a sign or point before a token, print a figure no fact holds | Fixed with MONEY-A-1 | d21f4577 |
| R1 Money B | MONEY-B-2 | should fix | `verifyTemplate` threw a TypeError on `$` or `US$` before a count token | Fixed: the token fails closed and a report is returned | d21f4577 |
| R1 Money B | MONEY-B-3 | should fix | A token naming every line lets other part tokens through the covering exemption | Refuted: the code follows the design's covering rule (section 4, PE-1) | — |
| R1 Money B | MONEY-B-4 | nit | A per-line or per-unit fact beside a total word is not contradicted | Refuted: intended; total cues target part facts only | — |
| R1 Security | SECURITY-1 | should fix | Single braces, ornamental braces or a third `}` pass and print raw | Refuted: decision (b) limits strays to `{{` and `}}`; single braces print no figure | — |
| R1 Security | SECURITY-2 | should fix | A /3 zero-phrase span can cover a name, which the web would print | Refuted: no web caller reaches /3 in this slice; the report stores offsets only | — |
| R1 Security | SECURITY-3 | should fix | Malformed tokens are reported as `unknown_placeholder`, which the web prints | Refuted: follows decision (b) to the letter | — |
| R1 Test quality | TEST-QUALITY-1 | should fix | No test checked pass 1's spans in template offsets | Fixed: a lengthening and a shortening normalization, all 7 span mutants killed | d21f4577 |
| R1 Test quality | TEST-QUALITY-2 | should fix | Nothing checked that the /3 draft states what the /2 draft states | Fixed: parity test over named contents and a property | d21f4577 |
| R1 Test quality | TEST-QUALITY-3 | should fix | `CURRENCY_WORDS` was checked only against itself | Fixed: pinned from a literal list | d21f4577 |
| R1 Test quality | TEST-QUALITY-4 | nit | No test for nil, nought or naught in the zero phrase | Fixed | d21f4577 |
| R1 Test quality | TEST-QUALITY-5 | nit | CAS-52..54 rows claimed more than the tests asserted; `assertedBy` lists missed files | Fixed: `assertedBy` completed, pending clauses noted by slice | d21f4577 |
| R1 recheck | NEW-1 | should fix | A sign, or the word "negative", set off from a count token by a space, a bracket or a quotation mark still passes | Split verdict. **Session decision: fixed.** The separation check reads back past set-off characters, and a sign, a currency sign or a sign's word there fails the token. Only /3 changes. | 3d44aff7 |
| R1 recheck | NEW-2 | nit | Two tokens one space apart print two numbers side by side | **Session decision: accepted reading**, recorded in ADR 0089 with a test. Each phrase is printed whole by code and neither figure changes. | c3a2743e |
| R2 equivalent review | EQUIV | — | `template.ts` `marker.start < span.end` → `<=` proposed as equivalent; scan.ts renumbering | Confirmed equivalent and signed; the renumbering checked | d96a053a |
| R3 Money | R1-MONEY-1 | should fix | A code token where an amount is read passes | Refuted: a code has no role to contradict (ADR 0089 accepted reading) | — |
| R3 Money | R1-MONEY-2 | not kept | The new set-off sign check misses the minus look-alikes U+2796 and U+02D7 | Refuted (a nit at most): the sign list is ADR 0089's closed list | — |
| R3 Money | R1-MONEY-3 | nit | A currency in letters ("USD") before a bare-figure token passes | Refuted: prose, outside the design's one list | — |
| R3 Money | R1-MONEY-4 | nit | The check after a token looked only 16 characters ahead | Fixed: the whole closing run is read | 2f3726ad |
| R3 Fail-closed | R1-FAIL-CLOSED-1 | should fix | The new sign check was quadratic: about 20 s on a 19,224-character template | Fixed: one sticky lookbehind from each token's start, linear | 2f3726ad |
| R3 Fail-closed | R1-FAIL-CLOSED-2 | nit | U+2796 heavy minus set off before a token passes | Refuted: the sign list is the ADR's closed list | — |
| R3 Conformance | R1-CONFORMANCE-1 | nit | Decision (a) says /2 is byte for byte, but (b) changes /2's report for stray braces | Refuted: (a) is about callers' text and format; (b)'s /2 change is recorded under Consequences | — |
| R3 Tests | R1-TESTS-1 | should fix | Removing several signs from `SIGN`, or `‘` from the set-off list, passed every test | Fixed: literal matrix of every sign against every set-off form | 2f3726ad |
| R3 Tests | R1-TESTS-2 | should fix | Two /3 identifier-placeholder checks were never exercised | Fixed | 2f3726ad |
| R3 Tests | R1-TESTS-3 | should fix | The claims/patients `> 1` boundary in pass 2 was untested | Fixed | 2f3726ad |
| R3 Tests | R1-TESTS-4 | should fix | The /3 draft could drop the percentage, year, version, page, reference or release | Fixed: every non-amount figure /2 writes must appear in the rendered /3 text | 2f3726ad |
| R3 Tests | R1-TESTS-5 | should fix | Most of `ZERO_AMOUNT_PHRASES` was unpinned | Fixed: pinned from literal lists | 2f3726ad |
| R3 Recheck | R1-RECHECK-1 | should fix | The sign check was quadratic (as R1-FAIL-CLOSED-1) | Fixed with R1-FAIL-CLOSED-1 | 2f3726ad |
| R3 Recheck | R1-RECHECK-2 | should fix | A sign set off by a colon, an em dash or a horizontal bar passes | Refuted: the em dash and the bar are clause punctuation by ADR 0089 | — |
| R3 Recheck | R1-RECHECK-3 | nit | A few minus-like signs and "less" before a token pass | Refuted: outside the closed sign list | — |
| R4 Money | R2-MONEY-1 | should fix | A per-line or per-unit fact beside a total cue passes | Refuted: as round 1's MONEY-A-6 and MONEY-B-4 | — |
| R4 Fail-closed | R2-FAIL-CLOSED-1 | not kept | Single-brace `{fact:…}` passes /3 and prints raw | Refuted: strays are `{{`/`}}` by design; single braces print no figure | — |
| R4 Conformance | R2-CONFORMANCE-1 | should fix | The /2 report's format is typed as whatever `VERIFIER_FORMAT` holds | Refuted: correct today; re-keying /2 callers is slice 3's work | — |
| R4 Conformance | R2-CONFORMANCE-2 | should fix | A recorded `draft.ts` equivalent (the interest guard's LogicalOperator) is not equivalent | Fixed: record removed; the $0.00-interest case kills it | 0b5ca610 |
| R4 Conformance | R2-CONFORMANCE-3 | nit | The runbook's `packets-template` row omitted `draft.ts` | Fixed; the row's time was re-measured | 0b5ca610 |
| R4 Tests | R2-TESTS-1 | blocking | The unreviewed equivalent covered a real $0.00-interest output at /2 | Fixed with R2-CONFORMANCE-2 | 0b5ca610 |
| R4 Tests | R2-TESTS-2 | should fix | The /3 draft could cite the wrong rule release | Fixed: two-release edge, the last release cited as /2 cites it | 0b5ca610 |
| R4 Tests | R2-TESTS-3 | nit | Pass 2's word-to-sentence mapping unpinned at a boundary | Refuted: no surviving mutant; a hand mutation, no defect | — |
| R4 Tests | R2-TESTS-4 | nit | The horizontal bar's exemption unpinned | Refuted: the fail-closed direction, no payer effect | — |
| R4 Recheck | R2-RECHECK-1 | nit | The sign class is a hand list missing some minus and approximation signs | Refuted: the ADR enumerates the list; an optional tightening | — |
| R5 Money | R3-MONEY-1 | should fix | The /3 draft can print a contract adjustment's percentage as the contract's | Refuted for this slice: the ordering is in `assemble.ts`, unchanged here; /2 draws the same figure. A follow-up item is recommended; it is not tracked anywhere yet | — |
| R5 Fail-closed | R3-FAIL-CLOSED-1 | not kept | Sentence splitting is quadratic on a long run of letters: 19.6 s for a 19,701-character template at /3 | Refuted for this slice: `scan.ts`'s `continuesAfter` is unchanged and shared with /2 (the same shape in lower-case prose is as slow there); ADR 0089 "Not covered" records the scanner's cost, and "What it does not change" above gives the measured figures | — |
| R5 Conformance | R3-CONFORMANCE-1 | not kept | Exporting the scanner's global regexes lets an importer's `.test()` move `lastIndex` | Refuted: decision (f) exports them; no importer misuses them | — |
| R5 Conformance | R3-CONFORMANCE-2 | nit | The two remaining `draft.ts` equivalent records still argued the disjunction | Fixed: each argues only its own replacement; a test keeps the disjunction out | e30a44aa |
| R5 Tests | R3-TESTS-1 | nit | Narrowing the leftover `\p{N}` to `\p{Nd}` passed every test | Fixed: U+2180, U+0BF0 and U+3021 pinned | e30a44aa |
| R6 Critic | CRITIC-1 | should fix | A recorded `draft.ts` equivalent was refuted and none of the three was signed, so the full gate would refuse | Fixed: the OptionalChaining record removed and killed by a no-codes test; the two guard records signed; a test refuses an unsigned `draft.ts` record | 7e9618e3 |
| R6 Critic | CRITIC-2 | should fix | The design's "correctness" lens for slice 2 was never run | Refuted: a process gap that names no defect in the code | — |
| R6 Critic | CRITIC-3 | nit | The synth bullet is met by no-file entries, not recorded in ADR 0089 | Refuted: same as slice 1's CAS-55; the registry names the tests holding the synthetic templates | — |
| R6 Critic | CRITIC-4 | nit | `checkTemplate` is outside every Stryker glob | Refuted: `check.ts` was outside it before this slice; the addition is a one-line wrapper | — |
| R6 Equivalents | EQUIV2-1 | — | The interest-guard record (first two checks → true) | Confirmed equivalent; signed | 7e9618e3 |
| R6 Equivalents | EQUIV2-2 | — | The interest-guard record (`total_cents` check → true) | Confirmed equivalent; signed | 7e9618e3 |
| R6 Equivalents | EQUIV2-3 | — | The `codes[0]?.` record | Not equivalent; removed, killed by a test | 7e9618e3 |
| R6 Recheck | RECHECK2-N1 | nit | `const guard =records` spacing; the records test refuses any future OptionalChaining record for `draft.ts` | Spacing fixed. The broad rule is kept: a genuinely equivalent future record would edit the test | ba35c381 |
| CI mutation (run 42360596958) | CI-MUT-1 | blocking (red gate) | The recorded `template.ts:180:65` equivalent scored Killed: a wall-clock test failed under the runner's load | Fixed: the time test moved unchanged to `verifier-template.performance.test.ts`, out of mutation runs only; no assertion, timeout or setting weakened; all 15 packets shards and the gate green | 7984faa8 |
| CI mutation (run 42369472158) | CI-MUT-2 | blocking (red gate) | The recorded `facts.ts:226:7` equivalent, a static mutant, scored Timeout under the runner's load | Fixed: the redundant array branch removed with its two records; no test, timeout or setting changed; packets-facts and the gate green, CI green on 79d7e1bb | 79d7e1bb |

The last two rows are CI's, after the reviews: they were raised by the `mutation` job, not by a reviewer, and are not counted in the totals above.

"Not kept" means the result files do not keep the severity the reviewer filed. The second workflow's IDs (R1-…, R2-…, R3-…) number its own loop rounds, which are rounds 3, 4 and 5 in the first column, as in the commits and ADR 0089.

## Freeze exception

No: it changes none of them. The change is in `packages/packets`: the verifier's /3 format, the scanner's strict mode, the code draft and its serialization. It also adds web words that are not yet reachable, and mutation and test tooling. It changes nothing in the engine's arithmetic, the ledger's semantics, the content pipeline, the security program, or the milestones and their gates.

## Domain model

No migration; the document is unchanged.

## The founder's approval

This pull request merges only after the founder's approving GitHub review of its latest commit and green required
checks. The build waits for that review from the day it works under its own GitHub account
(`docs/runbooks/github-governance.md`, 3i), and from step 5 GitHub requires it too; before 3i, on green checks alone
(reconciliation 001, D4 (a)). The review is the record of the approval, not anything written here; a new commit
dismisses it. The build then merges, and never reviews.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01FcouKPkXdRW5ntz6ye92pL
