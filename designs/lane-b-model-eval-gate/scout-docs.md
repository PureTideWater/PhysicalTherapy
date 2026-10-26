# Scout "docs": the documents, records and checks the model-eval-gate design must fit (queue item 12, #84 and #120)

This was a read-only scan of /home/user/PhysicalTherapy at `claude/build-platform` 6ddd587. I ran nothing heavy. The
only GitHub calls were REST reads of PR #42's file list. Line numbers are at 6ddd587. The sibling scouts' reports
(`scout-eval.md`, the scorer and the sets; `scout-serving.md`) cover the code. This report covers format, documents and
checks.

---

## 0. In one screen

- **Format.** Use the shape of `designs/lane-b-pr15-ledger-tests.md`, with a section per PR as in `designs/lane-b-ci.md`
  (section 3 below). Write one **ADR 0070**, with a `## Part N (\`co-001/<branch>\`)` per PR, as ADR 0066 does. Status,
  Deciders and PRD sections carry one line per part. Amend ADRs 0051, 0052 and 0054 in the house form (section 2).
- **"PRD 16 (AI statement)" does not exist.** PRD section 16 is "Security and compliance engineering"
  (`docs/product/PRD.md:655-692`). I searched for an "AI statement" in `docs/`, `docs/policies/`,
  `legal-surfaces.md` and `apps/web/src` and found none. The relevant PRD text is:
  - PRD 14 (`:558-587`), in particular "PHI minimization" (`:573-575`: "Contracts carry no PHI") and "Logging and
    evaluation" (`:581-583`);
  - PRD 16's "Threats the design addresses by name" (`:689-691`: "a payer document carrying injected instructions");
  - PRD 18's Model layer row (`:756`).
- **Rows.** The new rows are MOD-07 to MOD-12 in `docs/product/test-matrix.md:197-206`, after MOD-06. The same rows go
  word for word into `packages/synth/src/cases/matrix.ts:279`, and entries into `registry.ts:446` (section 4). The
  registry supports no-file entries: `none(...)`, as MOD-05, MOD-06 and CI-* use. Such an entry still writes
  `fixtures/synthetic/<ID>/expected.json`.
- **Mutation gate.** `packages/model-gateway` is **not** mutation-gated (`stryker/shards.json` holds money, ledger,
  packets and pricing only). It is also not in the 100% branch gate (`vitest.config.ts:17-23`). It **is** in ESLint's
  `MONEY_PACKAGES` (`eslint.config.js:66-78`), so the money syntax rules apply. A change to `packages/packets/src`
  (scan.ts, verifier) **does** run the `mutation` gate on the packets shards.
- **The hidden cost: the screening-capacity measurement.** Every file under `packages/model-gateway/{src,prompts}`,
  `eval/baseline.json`, `packages/packets/src` and `packages/synth/src` (eval/ included) is in
  `tools/screening-capacity/watched-paths.txt`. Both PRs therefore trigger the capacity job, which took 13:20 to 16:00
  and has a 100-minute timeout. That job, not `all green` (about 10 minutes), sets when each PR can merge. A new import
  on the measured path needs `pnpm exec tsx tools/screening-capacity/watched.ts --write`, and a unit test holds the
  committed list to it.
- **No migration is needed for anything the documents imply** (section 7). The closest calls I checked:
  - keeping accepted proposals as examples is an application rule (`contract-proposals.ts:371`). The schema
    (`eval_example`, `model_proposal`) does not restrict it;
  - a new refusal code fits `model_call.error_code`'s open pattern;
  - a new audit purpose fits `audit_event.purpose`'s open pattern.
- **Missing document.** No runbook exists for the people-only first real-model baseline run. It lives only in
  README `:459-471` and in the Consequences of ADRs 0051 and 0054. Recommend a new `docs/runbooks/model-evaluation.md`
  (section 2.6).

---

## 1. The exact format to follow

### 1.1 The Lane B design document (`/home/user/ops/designs/lane-b-model-eval-gate.md`)

Models: `designs/lane-b-pr15-ledger-tests.md` (938 lines) and `designs/lane-b-ci.md` (1,665 lines, four PRs).
Their common shape:

1. **Title.** `# <Item> (Lane B, item 12): <subject>, the design contract`. The CI design's version is
   `# The CI PR (Lane B, item 1): the plan, as four pull requests`.
2. **Header paragraph.** It gives:
   - "Base: `claude/build-platform` at <sha> (main checkout, clean). Design step only: nothing was built, committed,
     pushed or posted. Date …";
   - Lane B's claim line (`LANES.md:170` for this item);
   - the branch and worktree (`co-001/model-eval-gate`, `/home/user/model-eval-gate`; LANES rule 5).
3. **A bold Status line** when the work is stopped on a question, as in PR 15's "**Status: STOPPED on the owner's
   question L1**".
4. **Sources.** A bulleted list with `file:line` citations: the audit lines, the LANES rules, the reconciliation
   checks, the PRD, ADRs and code. The CI design numbers its scout reports [S1]..[S4] and its review [R], and keeps
   them in `designs/<name>/`.
5. **`## 0. In one screen`.** Bullets: the verdict, the scope, the counts, what was pre-validated.
6. Numbered sections:
   - what exists today;
   - the decisions;
   - a section per PR (`### 3.1 \`co-001/<branch>\` (audit #NN)` in the CI design);
   - **Rows**: a table `| ID | Title | Assertion | Registry \`assertedBy\` |`, with a note that the rows live in three
     places;
   - **Documents, and why (no) ADR**: the documents edited, those deliberately not edited, and the reason;
   - **Checks**: the builder's numbered steps (`export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH`; heavy runs under
     `flock /tmp/laneb-heavy.lock`; `<mb>` = `git merge-base HEAD origin/claude/build-platform`; scope diffs that
     must be empty), then **the fresh-clone verifier**'s steps (clone, `pnpm install --frozen-lockfile`, focused runs,
     reading CI with `get_job_logs`);
   - **Conflicts** (LANES rule 6: the PR merged second resolves, keeping both);
   - **Risks**;
   - **Founder questions**: one batch, recommended option first, in a table
     `| ID | Question | Recommended | Alternatives | What each gives up | Blocks |`, then **Notices** (N1..), each
     "decided by the build under the standing rule; the founder can reverse any";
   - **Migration check**: each PR's verifier asserts that `git diff --name-only <mb> -- packages/db/migrations
     docs/product/domain-model.md packages/db/domain-model` is empty, and the section states "Nothing is handed to
     Lane A today";
   - **Where this plan departs from a scout, and why**;
   - **Open items**;
   - **Evidence index**;
   - **Review** (the reviewer's findings and the disposition of each).
7. **Appendices** carry the pre-validated code and measured numbers, because scratchpad paths do not survive the
   session.

### 1.2 The ADR (docs/adr/0070-<imperative-title>.md)

The template is `docs/adr/0000-template.md` (30 lines):
- `# NNNN. Title in the imperative`;
- the bullets `- **Status:**`, `- **Date:**`, `- **Deciders:**` and `- **PRD sections:**`;
- `## Context`, `## Decision`, `## Alternatives considered` (a table `| Option | Why not (or when we would switch) |`),
  `## Consequences` and `## Revisit when`.

ADR 0054 writes its alternatives as bullets instead of the table. Either is accepted. The template's table is the
canonical form.

**One ADR with a part per PR**, as ADR 0066 does:
- `docs/adr/0066-*.md:3-25`: Status names each part with its branch and audit item, for example "accepted, Part 1
  (`co-001/ci-speed`, combined audit #109) and Part 4 …", and parts to come are "appended by that pull request".
- Deciders and PRD sections carry a nested `- **Part 4:**` line each.
- Each part is a `## Part N (\`co-001/<branch>\`)` with its own `### Context`, `### Decision (Part N: …)`,
  `### Measured`, `### Alternatives considered`, `### Notices (decided by the build under the standing rule; the
  founder can reverse any)` with **N#** numbering continued across parts, `### Consequences` and `### Revisit when`.
  See `:27`, `:54`, `:167`, `:193`, `:208`, `:216`, `:238`, `:243-249` (the placeholders), `:251-520`.
- If the item ships as two PRs, the PR merged second fills its part under rule 6. The ci-mutation merge commit da4d7e9
  shows how: "ADR 0066 as one file, ci-speed's header with this branch's Part N lines under its Status, Deciders and
  PRD sections".
- Deciders, house wording (ADR 0066 `:15-19`): "the founder, Tyler Williams, who adopted the combined best-option audit
  in full on 2026-10-20 (items #84 and #120 among it) … under the standing rule of 2026-10-18; the build (Lane B), for
  the notices below".

**Amending an older ADR** (needed for 0051, 0052 and 0054; see section 2.2):
- the Status line gets "; amended <date> by [0070](0070-….md), Part N: <what> ("Amendment (<date>)", below)", as in
  `docs/adr/0010-*.md:3`;
- an appended `## Amendment (<date>): <subject>` section, as in 0010 `:67`, 0063 `:388` and `:484`, and 0064 `:193` and
  `:409`. The latter uses `## Amendment (\`co-001/ci-mutation\`, 2026-10-25): …`.

### 1.3 Test-matrix rows

- Format: `| MOD-07 | <Case> | <Assertion> |` under `## Model gateway (MOD)` (`test-matrix.md:197-206`).
- `packages/synth/src/fixtures.test.ts:33-43` parses each row with
  `/^\| ([A-Z]{2,3}-\d{2}) \| (.*) \| (.*) \|$/`. It requires `TEST_MATRIX` to equal the rows word for word and in
  order, and the registry keys to equal the IDs. A cell must therefore not contain ` | `. Use two-digit IDs.
- A section may carry a provenance paragraph under its table (LED `:137`) or above it (CI `:210-212`, "CI-11 to CI-14
  and CI-18 to CI-20 are reserved for…"). Recommend one under MOD-12: "MOD-07 to MOD-12 were added by combined audit
  #84 and #120 (docs/adr/0070) …".
- The matrix's own rule (`:5`): "A pull request that adds behavior adds a row here first."

### 1.4 The PR description

Copy `.github/pull_request_template.md` (CLAUDE.md: GitHub offers it only from main). Its sections:
- What changes;
- Why (#84 and #120, combined audit lines 949 and 1275);
- What it does not change: six lines to answer (pricing, ledger, schema and migrations, content, domain model with its
  approval line and approvers.json, CI and GitHub settings);
- Checks: a command-and-result table, with the `required-checks` markers left intact;
- Reviewer agents' findings: one row per finding;
- Freeze exception: "No: it changes none of them";
- Domain model: "No migration; the document is unchanged.";
- The founder's approval: boilerplate.

End the description with the attribution footer from the session.

---

## 2. Every document the PRs must update

### 2.1 Shared documents (LANES rule 6; #42 changes some of them too)

| Document | Change | Conflict with #42 |
|---|---|---|
| `docs/product/test-matrix.md:206` | MOD-07 to MOD-12 after MOD-06, plus the provenance paragraph | #42 adds JOB-05, SCR-21, SCR-22, SEC-18 and SEC-19 in other sections. A textual merge only |
| `packages/synth/src/cases/matrix.ts:279` | The same six rows, word for word | #42 edits it. Merge keeps both |
| `packages/synth/src/cases/registry.ts:446` | Six entries (section 4) | #42 edits it. Merge keeps both |
| `docs/product/reconciliation-001.md` | (a) **Item 16** (`:246-250`), PR 16's red team: append in the house form `*Amended <date> (<PR>; combined audit #84):*`, adding #84's attacks to the brief (swapped rows, injected-instruction twins, decoy amended rates, struck-through rates, OCR-layer scans) and #120's (an EOB or letter filed as a contract). (b) Under **What must not change, as checks**, nothing changes unless a check is touched; PRD 14 amendments are not among the checks. (c) **Do not edit** the status rows `:19` (milestone 10) and `:28` (section 18, "MOD 6"). The PR 15 design's precedent leaves status rows as their review dates state them. An amendment note on `:19` is optional | #42 edits reconciliation-001. Merge by section |
| `docs/adr/0070-*.md` | New (section 1.2) | none |
| `tools/screening-capacity/watched-paths.txt` | Regenerate with `pnpm exec tsx tools/screening-capacity/watched.ts --write` if a new src file is imported on the measured path (for example a contract records check in model-gateway, or a new `apps/web/src/lib/models` import) | **#42 also edits it.** Whichever PR merges second must **regenerate** the file, not hand-merge it. It is derived, and a unit test fails on any difference |

### 2.2 ADRs to amend (house form, section 1.2)

- **ADR 0051.** The scorer's definition (`:48-54`) changes: a wrong-but-verified field is counted apart from a rejected
  one and gated (never rising, zero on faithful cases). The gate rule (`:64-71`) changes: absolute recall floors per
  field, and set v2 requires a new baseline instead of comparing fractions across sets. The set description (`:27-38`,
  "120 records, 742 fields") changes too. The Consequences bullet on the first real run (`:93-100`) gains "the bar is
  the floors, not wherever the run lands".
- **ADR 0054.** Three parts change:
  - "Terms are proposed from a contract or an exhibit only" (`:62-73`) gains #120's records check, in the same
    `screen` step the letter reader uses (`:84-92`);
  - "Production serves only what the gate recorded" (`:134-149`) changes from "every model feature is off" to off
    **per feature**, which is #84's "switching that feature off rather than the whole provider". Today "the refusal
    works like unconfirmed prices: every model feature is off" (`:144-145`);
  - the permitted run (`:187-226`) keeps accepted proposals too.
- **ADR 0052.** "Under the data-rights terms" (`:75-83`): "A contract proposal that was corrected or rejected becomes an
  `eval_example`" changes to include accepted proposals. The code mirror is `apps/web/src/lib/models/contract-proposals.ts:37`
  and `:371`.
- **ADR 0048.** Probably untouched. Check its PHI-minimization text if #120 adds a purpose step.
- **Not ADR 0055.** #42 edits it. Do not touch it unless it is unavoidable.

### 2.3 PRD (covered by the founder's adoption of the whole audit on 2026-10-20, as F6 in the CI series ruled; record it in ADR 0070 as a notice and ask if unsure)

- **PRD 14, "Logging and evaluation"** (`PRD.md:583`):
  - "Reviewer corrections become evaluation examples" changes to corrections and acceptances;
  - "field-level precision and recall on that set with no regression" gains wrong-but-verified never rising, zero on
    faithful cases, and absolute per-field recall floors;
  - "starts with 40 synthetic contracts" changes to set v2's tiers.
- **PRD 14, "PHI minimization"** (`:575`): "Contracts carry no PHI" changes to "and each contract or exhibit is checked
  against the practice's records before it is sent".
- **PRD 14, "Operational limits"** (`:587`): the kill switch stays global. The per-feature refusal is new wording.
- **PRD 18, Layers, Model row** (`:756`): "No regression on any prompt or model change" changes to the new gate.
- **PRD 16, Threats** (`:691`): optionally add "a payer letter filed as a contract (checked against the practice's
  records)". The controls table is not required to change.
- **Untouched:** PRD 17's milestone 10 check (`:712`) and `docs/product/milestone-prompts.md:35`. Changing them would
  breach reconciliation-001's "fourteen milestones and their checks … unchanged" (`:477`). #84's floors set the bar for
  the people-run baseline, not the milestone check.

### 2.4 README

`README.md:459-471` is the evaluation paragraph: set sizes, "lowers either", the permitted task. Update it for
wrong-but-verified, the floors, set v2 and the per-feature refusal. `:446-455` (the model proposals paragraph:
"a corrected contract proposal becomes an evaluation example") changes to accepted as well.

### 2.5 Package-local records

- `packages/model-gateway/prompts/<name>/CHANGELOG.md`: if any prompt text or schema changes, it must be a **new
  version** `v2/`. `tools/check-releases-immutable.sh` (CI step "Published releases and prompt versions unchanged",
  ci.yml `:94-97`) refuses any edit to an existing `prompts/<name>/v<n>`. A unit test holds each version to the hash
  its CHANGELOG records. A new version also needs a new baseline entry, and production refuses the real provider until
  one exists (ADR 0054 `:140-145`).
- `packages/model-gateway/eval/baseline.json` (formats `tp-model-eval-baseline/2` and `tp-model-eval-contract/1`): a
  new format version if wrong-but-verified counts, `variant` or floors are added. It is in the watched paths.
- `fixtures/synthetic/MOD-*/…`: regenerated by `pnpm synth --all`, never by hand. CI diffs them (ci.yml `:112-118`).
- `docs/product/data-dictionary.md:80-81` (`model_call`, `eval_example`): no column changes, so it stays untouched.

### 2.6 New runbook (recommended, an improvement)

`docs/runbooks/model-evaluation.md`: the people-only first real-model baseline run. It should cover:
- who runs it (with credentials, outside production for the synthetic sets);
- the commands `pnpm --filter @tp/model-gateway eval --provider configured [--variant ambiguous] --record`;
- checking the floors before `--record`;
- reviewing and committing `baseline.json` through a PR;
- the twin and decoy verdicts to read;
- `evaluate-permitted` inside the PHI boundary (README `:468-471`), run outside working hours because it spends the
  practice budget (ADR 0054 `:231-233`);
- what to do on a floor miss: the feature stays off.

PRD 19's runbook table (`PRD.md:778-790`) has no row for it, and adding one would be a PRD change. Recommend only the
runbook file. #84 makes this run the moment the bar is set, and today nothing written tells the person how to run it.

### 2.7 Agent briefs

- `.claude/agents/security-reviewer.md` scopes itself to "any change under packages/db, apps/, or
  packages/observability". #120's upload panel (`apps/web/src/components/uploads/uploader.tsx`) and its records check
  (an audited PHI read in `apps/worker` or `apps/web`) are in scope. **Run it on #120**, and on #84 if
  `apps/web/src/lib/models` changes for accepted examples. It looks for "any model call outside the gateway" and "PHI
  in … errors", and #120's refusal message must carry the code only.
- `.claude/agents/payment-engine-reviewer.md` covers `packages/packets` and "any path where a model output reaches a
  number or a stage". Run it if the packets scanner or verifier changes.
- `.claude/agents/qa-fixture-builder.md` is PR 16's red-team tool. #84's "Add these attacks to PR 16's red team" goes
  into reconciliation-001 item 16's brief (section 2.1), not into the agent file.

---

## 3. The upload panel, and why it is not #42's

- #120's "upload panel preselects 'contract'" is `apps/web/src/components/uploads/uploader.tsx:141`:
  `useState<UploadKind>(kinds?.[0] ?? …)`. The first kind offered is preselected. The contracts page passes its kinds
  at `apps/web/src/app/p/[practiceId]/contracts/page.tsx:207`.
- #42 edits `apps/web/src/components/screening/upload-form.tsx`, a different file. **No overlap.**
- The same `kinds?.[0]` preselect also serves the reconciliation page (`reconciliation/page.tsx:272`, posting versus
  EFT) and the uploads page (`uploads/page.tsx:40`). The best option is to leave the kind unset for every multi-kind
  panel, since a misfiled posting export also goes wrong. That widens the change beyond contracts, so the design should
  name it as a notice. The e2e already picks the kind explicitly on contracts (`apps/web/e2e/contracts.spec.ts:42`
  `selectOption('contract')`). Check every other spec that uploads through a multi-kind panel.
- The server-side kind check already exists:
  - `apps/web/src/lib/models/contract-proposals.ts:119-129` refuses `document_kind`;
  - the gateway's `contractTermsSpec.prepare` does the same (ADR 0054 `:66-73`).

  #120 adds the records check inside the same gate. The model for it is the letter reader's `OtherPatientCheck`:
  `apps/worker/src/packets/letter-records.ts`, an audited read with purpose `letter_screen`, run in the caller's
  scope, decrypted and compacted in memory, answering yes or no.
- **#42 also touches `packages/observability/src/fields.ts` and `apps/worker/src/config.ts`.** If #120 needs a new log
  field, prefer the existing `error_code` field (fields.ts `:41`), which avoids touching #42's file.

---

## 4. Registry entries (how a case is registered)

`packages/synth/src/cases/registry.ts`:
- `Entry { completesIn; assertedBy?; build?; noFile? }` at `:19-25`;
- `none(completesIn, reason, assertedBy)` at `:27`.

| Case | How to register |
|---|---|
| A set or fixture case (set v2, twins, decoys) | `{ completesIn: 10, build: (b) => { …; addContractSetV2(b); }, assertedBy: [...] }`, as MOD-01 does (`:415-429`, `workflow.mod01` plus `addContractSet` from `../eval/cases`) |
| A behavior with no file of its own (the gate's wrong-but-verified rule, per-feature serving, the records refusal on a synthetic world) | `none(10, '<why no file>', [tests])`. It still writes `fixtures/synthetic/<ID>/expected.json` (MOD-05 and CI-01 directories exist with only that file) |

Rules the fixtures test enforces (`packages/synth/src/fixtures.test.ts`):
- every `assertedBy` path exists (`:57-63`);
- with `completesIn` ≤ `CODE_BUILT_THROUGH_MILESTONE` = 10 (`registry.ts:56`), `assertedBy` must be non-empty
  (`:71-75`). MOD-07 to MOD-12 at `completesIn: 10` therefore all need tests named;
- `completesIn` is between 0 and 13;
- each case writes files or gives a reason (`:46-55`).

The large tier (80 pages): follow PAR-29 (`registry.ts:29-37`). `b.noFiles(…)` plus `b.generatedFile({ path, sha256,
bytes, … })` record the size and hash. The file goes into `fixtures/synthetic/<ID>/generated/`, which git ignores
(`b.addAuxiliary('.gitignore', 'generated/\n')`; `write.ts:372` skips `generated`). CI already runs `pnpm synth --large`
in `static` (ci.yml `:146`), so a large eval tier joins that command or gets its own flag.

The fixture guard (`packages/synth/src/write.ts:342-360`; run by `pnpm check:fixtures`, the pre-push hook and CI):
- **a PDF passes only when its Producer names the synth exhibit or scan writer.** New writers (OCR-layer scans,
  invisible or white text, strike-through) must use those Producers or extend the guard. Extending the guard is a
  security-relevant change to `packages/synth/src/guard`;
- a CSV needs SYNTHSENDER in one ID column of every row.

---

## 5. Every check (CI job) the PRs must pass

Required checks (`docs/runbooks/ci.md:9-15`, `tools/required-checks.ts`): `all green`, `mutation`,
`screening-capacity gate` and `approval-of-record`. `approval-of-record` passes until `APPROVAL_REVIEW_REQUIRED`;
non-schema PRs merge on green after the fresh-clone verification (LANES rule 7).

`ci.yml` jobs under `all green` (`docs/runbooks/ci.md:23-33`):

| Job | Timeout | Why it matters here |
|---|---|---|
| `static` | 15 min | Runs:<br>- the dependency audit and the secret scan;<br>- **`pnpm check:fixtures`**: set v2's PDFs and CSVs must pass the guard;<br>- `pnpm verify-content`;<br>- **"Published releases and prompt versions unchanged"** (`tools/check-releases-immutable.sh`): any prompt edit must be a new version;<br>- the engine freeze (no `packages/pricing/src` change);<br>- **`pnpm synth --all` with a clean `git diff` of fixtures/synthetic**;<br>- `pnpm typecheck` and **`pnpm lint:logs`**: #120's refusal logs a code only;<br>- **`pnpm test:golden`**: `eval/gate.golden.test.ts` holds the gate. It takes 11-17 s today, with a 180 s `beforeAll` (scout-eval section 7), and set v2 plus the new faults must stay well inside the 15-minute job;<br>- `pnpm synth --large` and `pnpm test:oracle`;<br>- `pnpm licenses:check` |
| `lint` | 15 min | ESLint in three groups. `MONEY_PACKAGES` holds model-gateway and synth (no floats on amounts). The provider SDK is refused outside the gateway (SEC-09) |
| `unit` | 20 min | `pnpm test` with coverage: `score.test.ts`, the gateway unit tests, `fixtures.test.ts` (matrix and registry), and the watched-paths unit test. Coverage includes only `packages/*/src`, so `eval/` is not measured. No branch gate on model-gateway |
| `db (k/N)` | 20 min | `gateway.db.test.ts`, `models-routes.db.test.ts`, the records-check db test for #120 (as `letter-records.db.test.ts`), and the catalog and cross-tenant tests |
| `domain model` | 10 min | Must stay green with no migration: the document is unchanged |
| `build` | 15 min | Web and worker build |
| `e2e (k/M)` | 25 min | `apps/web/e2e/models.spec.ts` and `contracts.spec.ts`, plus any spec that uploads through a panel whose kind is no longer preselected |
| `images` | 20 min | Unaffected |
| `all green` | 5 min | Needs every job |

Other workflows:
- **`mutation`** (mutation.yml; changes 5, stryker 30, mutation 10 min). It runs the shards of packages whose closure
  the PR changes (CI-17). `packages/model-gateway` is not a mutation package, so a gateway-only PR passes in about a
  minute. **Touching `packages/packets/src`** (for example the scanner, for role-aware figures) runs the packets shards
  (13-17 min), and every new survivor fails until it is killed or recorded as equivalent (ADR 0066 Part 4,
  Consequences `:494-512`). Note on `packages/synth`: check whether a money package's closure reads synth, since tests
  that import `@tp/synth` count.
- **`screening-capacity gate`**. It **will measure on both PRs**, because model-gateway src, prompts, `baseline.json`,
  packets src and synth src are all watched (`watched-paths.txt`). The measurement takes 13-16 min and the job has a
  100-minute timeout. It passes on a measurement that passes every check but time. It works on the free 4-CPU runner
  only while the repository is public (`docs/runbooks/screening-capacity.md:328-331`). A new import on the measured path
  must be followed by regenerating the list (`watched.ts --write`).
- **`approval-of-record`**: 5 min.

Local commands for the builder and verifier (CLAUDE.md, Commands; the pattern of the PR 15 design's section 9):
`pnpm synth --all` (idempotent: a second run writes 0 files), `pnpm check:fixtures`, `pnpm test`,
`pnpm db:migrate && pnpm test:db`, `pnpm test:golden`, `pnpm typecheck`, `pnpm lint`, `pnpm lint:logs`,
`pnpm verify-content`, `pnpm --filter @tp/model-gateway eval` (local provider),
`pnpm exec tsx tools/screening-capacity/watched.ts` (check mode), `tools/check-releases-immutable.sh <mb>`, and the
scope diffs, each of which must be empty:
- `git diff --stat <mb> -- packages/pricing/src packages/ledger/src packages/db content/releases docs/product/domain-model.md`;
- `apps/web/src/components/screening` (the file #42 owns).

---

## 6. The other records the design must fit

- **LANES.md.** Queue item 12 is at `:124`: "One PR or two, before PR 16 and before the first real-model baseline
  run". The claim is at `:170`. It reserves ADR 0070, "MOD-7 to MOD-12" (which must become **MOD-07 to MOD-12**: the
  regex needs two digits) and synth cases. Status is in `approval-summaries/lane-b-model-eval-gate-status.md`.
  Rule 12: no model identifier in any repository artifact. ADR 0070, the runbook, test names and baseline prose must
  name a model by role ("the default model", "the larger contract model"). `baseline.json` and `prompt.json` already
  carry identifiers as configuration, so do not copy them into prose.
- **The combined audit.** `/home/user/ops/audits/combined/combined-report.md`:
  - #84 at `:949-956` (High, AI safety, 50-80 h, "Database: no");
  - #120 at `:1275-1282` (8-14 h, "Database: no");
  - **#15 at `:326-333` (Critical) overlaps.** Its "Add synthetic scans with seeded OCR digit errors, invisible text, a
    white box over a superseded rate and a remapped font to the evaluation set" asks for the same set v2 cases.
    Its intake change (Textract on every page, page images) needs a migration ("a page-image status on documents and
    a new page-text format version", domain model approval) and lands in the "Contract-evidence integrity PR". Set v2
    should build those scans so that #15 reuses them. #84's "zero wrong-but-verified on cases where the page text is
    faithful" exists precisely because, until #15, the OCR-layer, invisible and struck-through cases have unfaithful
    page text. The design should state that split.
  - The people-only list (`:1448-1495`) includes "the recall floors for the model evaluation gate" (founder with the
    specialist, `:1470`) and the model path agreements, including "whether keeping accepted contract proposals as
    evaluation examples is covered" (`:1460`). Both are founder questions for the design's batch. The floors cannot be
    invented by the build: ship the mechanism with the floors **unset**, and have production refuse a feature whose
    floors are unset. Keeping accepted examples needs the agreement's coverage confirmed (counsel, a people step).
    Gate it behind that answer.
- **reconciliation-001.**
  - D34 (`:423-427`): "milestone 10's real-model gate is already blocked on credentials".
  - The milestone 10 row (`:19`): "the real-model run waits on credentials and on counsel's read of the model path".
  - Item 16, PR 16 (`:246-250`): its brief currently names "tenant leaks across routes, PHI in logs, CSRF, rate limits
    and the billing and e-signature roles". This is where #84's and #120's attacks are added.
  - D22 (`:373-376`): the red team's reproducing tests go in a quarantined `redteam` Vitest project, `it.fails` until
    fixed. It is PR 7's to create. If item 12 lands first, the attacks it adds are its own gate tests, not `redteam`
    tests.
- **PRD 17's milestone 10 check** (`PRD.md:712`) and `milestone-prompts.md:35` stay unchanged (reconciliation `:477`).

---

## 7. Migration check (for the record)

There is no migration anywhere in the documented scope. What I checked:
- `eval_example` (`20261029090000_model_gateway.sql:250-266`) constrains source, purpose, `input_ref` pattern, the
  agreement and synthetic letters only. Nothing restricts it to corrected proposals.
- `model_proposal` (`20261029190000_model_proposals.sql:25-112`) links an example once, after review, whatever the
  decision.
- `model_call.error_code` is `^[a-z][a-z0-9_]{0,63}$` (`:158` area), so a new refusal code needs no DDL.
- `audit_event.purpose` is `^[a-z][a-z0-9_]{0,63}$` (`20261015140500_audit_and_operations.sql:15`), so a new purpose
  such as `contract_screen` needs no DDL.
- Per-feature serving is configuration and code (`src/config.ts`, `src/evaluated.ts`, `feature_flag` rows), not schema.

**Watch for:** a design that stores floors, verdicts or twin results in the database instead of `baseline.json`. That
would be a migration. Keep them in the committed baseline.

---

## 8. Improvements noticed

1. Write MOD-07 to MOD-12, never MOD-7. The fixtures regex requires two digits, and the LANES claim row should be
   corrected when the design is pushed.
2. Add `docs/runbooks/model-evaluation.md` for the people-only baseline run (section 2.6).
3. Have every multi-kind upload panel leave the kind unset, not only contracts (section 3).
4. Build set v2's OCR-layer, invisible and struck-through scans so that #15's PR reuses them (section 6), and say so in
   ADR 0070's Consequences.
5. Ship the floors as founder and specialist inputs, unset until set. Production refuses a feature whose floors are
   unset, so the first real run cannot "set the bar wherever it lands", which is #84's own complaint.
6. In the PR that merges second, regenerate `watched-paths.txt`. Never hand-merge it against #42.
7. Plan the merge timeline around the capacity measurement (13-16 min per push to a watched path), not around
   `all green`.
