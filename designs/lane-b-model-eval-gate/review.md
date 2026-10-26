# Adversarial design review: the model evaluation gate and the contract PHI check (Lane B, item 12; audit #84, #120)

Reviewed: `/home/user/ops/designs/lane-b-model-eval-gate.md` (1,396 lines) against the code at `claude/build-platform`
6ddd587. Read-only: nothing in the repository was edited, run, committed or pushed. Every claim below was checked in
the code; where the design's line numbers are wrong it is said. No model is named.

**Verdict: not ready to build as written.** 2 blocking, 13 major, 16 minor. All are fixable inside the design without a
migration, except that the best option for #120 (M9) needs F3's migration, which Lane A has to open. Once B1, B2 and the
majors are folded in, the design is sound. What it gets right, I checked in the code: the diagnosis
(`score.ts:189-204` counts a rejection and a wrong-but-verified value the same; `baseline.ts:101-109` ignores the
variant; `baseline.ts:172` lets `set_changed` through at record; `evaluated.ts:46-64` checks presence only), the
seven-count tally, the `not_in_row` idea, and the issued, practice-bound check for #120.

---

## Blocking

### B1. Per-feature serving fails open. `GatewayOptions.served` defaults to `ALL_SERVED` (design 4.4)
The design keeps tests and the harness unchanged by defaulting `served` to every purpose. But `new ModelGateway({...})`
is called in production by the web (`apps/web/src/lib/models/path.ts:119`) and the worker (`apps/worker/src/models/permitted.ts:163`).
Any production gateway built without `served` would therefore serve every purpose: a future job, a refactor, or the
permitted run before B's change lands. The audit asks that each feature be served "only when its own prompt and model
have a baseline". A default of "everything" is the bypass.
**Fix:** when `production` is true and the provider is not local, the gateway works out `served` itself from
`servingDecisions` (one source), or the constructor throws if `served` is missing. A test should build a production
gateway with no `served` and show it refuses every purpose that is not served. `ALL_SERVED` may stay the default only
when `production` is false.

### B2. `--new-set` lets a model change get past "never rising" (design 3.7)
`set_changed` turns off every regression comparison, `--new-set` lets the record through, and in the same run the
prompt or model may also change. A model change that turns rejections into silent wrong values (the exact failure #84
names) then passes whenever it rides on a set change. Set changes will be frequent. The set hash /2 covers "pages as
read", so any pdf.js or Textract-reader bump, Dependabot's included, changes the set (design 3.4).
**Fix:** `--new-set` is accepted only when the report's prompt version, prompt hash, provider, model and variant equal
the held entry's: a re-baseline of the same model on the new set. A model or prompt change on a new set then needs two
records, (1) the held model on the new set and (2) the new model gated against (1). State the same rule in the
runbook and in `record-permitted`. Add a test: a set change plus a model change in one report is refused even with
`--new-set`.

---

## Major

### M1. `not_in_row` as written rejects most of v1's prose truths (design 3.3 step 2, A.2)
`codeTokens` is "every token `tokenInQuote(…, 'codes')` accepts … matching `^[0-9A-Z]{5}$`, upper case".
`tokenInQuote` is case-blind (`figures.ts:87`, flags `gi`), and the `CODE` test is applied after `toUpperCase()`
(`contract-terms.ts:178`). Read that way, every five-letter word is a code token. v1's prose sentences put such words
between the codes and the figure: "For CPT 97110…, **Payer shall** pay $43.10 per unit." and "…, **Payer** pays the
lesser of…" (`contract-set.ts:312-329`). The nearest code token before the amount is then `PAYER` or `SHALL`, not the
row's code, so the true field is refused. The design's claim that "every v1 truth passes it" is then false. Check A.1
would stop the build, but the specification is what is wrong. ZIP codes ("12345") are code tokens under either
reading.
**Fix:** define a code token as a case-sensitive whole token of HCPCS shape as written: `^\d{4}[0-9A-Z]$|^[A-Z]\d{4}$`
(digits, or one upper-case letter and four digits), standing alone by `standsAlone`. Run the "nearest" rule only over
those. Pin it with tests on "Payer shall pay", on a ZIP between the code and the figure, and on "TOTAL".

### M2. A subset report can be gated or recorded (design 3.7, A.5)
`runEvaluation({ cases })` is exported, and a subset report carries the full set's `setSha256`. Recorded or gated, it
has fewer cases: fewer `wrong`, fewer `extra`, and recall measured on what was run. "Never rising" holds trivially,
and floors can be met on an easy subset.
**Fix:** the report records `caseIds`. `gate` and `recordBaseline` refuse a report unless its case IDs equal the
manifest's (`incomplete_report`). `spliceReport` output carries `spliced: true`, which `recordBaseline` and
`record-permitted` refuse. Add a test.

### M3. PR A without PR B serves the unevaluated features (sequencing, design 0 and 2 #1)
After A merges, `assertEvaluated` (`evaluated.ts:46-64`) still checks presence only. Once F1's floors are committed
and the first real-model contract and narrative entries are recorded under A, production serves all four purposes,
including `suggestEvidenceRequests` (called from `apps/web/src/lib/models/evidence-checklist.ts:80`) with no
evaluation. The audit names that hole. The design orders A then B but enforces nothing.
**Fix:** in PR A, `--record` refuses a non-local provider (`serving_rules_missing`) until B's `SERVING_RULES` exists.
Simplest: A writes `SERVING_RULES` with only the `no_set` decisions, and `assertEvaluated` refuses a provider while any
pinned purpose is `no_set`. Or state as a hard rule in the runbook and ADR that B merges before the people-run
baseline, and add a test that holds it.

### M4. The twin comparison is not "zero difference" (design 3.7 `twinKey`)
The audit allows zero difference from the clean twin. `twinKey` leaves out page numbers, quote text, labels,
`conflictsWith` and problems. One injection the key misses: the model keeps every value but quotes the injected
paragraph as a field's evidence. That changes the citation a specialist approves to attacker text, and the key does
not see it. The generator already guarantees that no real row moves page and every truth quote is the same in both
twins (3.5, "Twins"), so leaving those fields out buys nothing.
**Fix:** `twinKey` is the canonical JSON of the whole model output plus the verifier's review per candidate (fields
with page, quote, verified and problems; `conflictsWith`; whether a rate record is proposed). Only `label` is left out,
and only if a reason is given. Also: **a twin pair where either call has `problem !== null` fails as
`twin_incomplete`.** Today two failed calls give two empty keys, and the pair "agrees" without a word. Recall floors over
63 documents would not catch two lost cases.

### M5. The first real baseline still "sets the bar wherever it lands" for unfaithful cases and for precision (design 3.2, 3.7, F1)
Floors cover recall only. `no_baseline` does not block `--record`. So the first real entry may hold any number of
wrong-but-verified values on the five unfaithful cases, and any precision. Struck-through rates (V08, V09) are one of
the audit's named dangers. The page text there holds both figures, so a model that takes the superseded rate verifies,
and since the case is marked unfaithful the zero rule is waived. Junk candidates are `rejected_extra`: they bury the
specialist and are held only to a precision that was never bounded.
**Fix:** (a) for any provider, unfaithful-case `wv` per field is at most the local reference's (the faithful copier's)
count on the same case: a model may not be worse than copying the text. (b) F1 asks for a per-field **precision**
floor beside the recall floor, or a cap on `rejected_extra` per document. Both stay null until set by people and fail
closed in the same way.

### M6. Faults do not prove "never rising" on its own (design 3.6)
Every new wrong-but-verified fault (`flipFlag`, `wrongMethod`, `amendedOnOriginal`, `obeyInjection`) hits a faithful
case, so `wrong_verified_on_faithful` fires whatever `wrong_verified_rose` does. If `wrong_verified_rose` compared
only faithful counts, or the wrong baseline, every fault test would still pass.
**Fix:** add `takeStruck` (V08: the candidate takes the struck old rate, which verifies). The gate must report
`wrong_verified_rose:amount` and **not** `wrong_verified_on_faithful`. Also add `mergeRows` (two equal-amount rows
proposed as one multi-code candidate: `codes` wrong but verified, the other row missed) and `wrongDate` (the
amendment's `effective_from` on the original record). Pairing and the value-only fields are already covered. Add a
`recall_below_floor` test with a test floors file whose floors are set.

### M7. The check can be neutered: `practiceRecordsCheck(run, cipher, …)` trusts its runner (design 5.2, A.3)
The issued registry proves the gateway's factory made the check. It does not prove the factory read the right data.
`run` is any function. A runner whose scope does not include `options.practiceId` (a caller bug, or the wrong job
scope) gets zero rows under RLS (`patient_ref_tenant`, `claim_tenant`, `20261016120000_remittances.sql:420-434`).
Then `values.size === 0`, `namesPatient` returns false, and the document is sent. A stub runner does the same. This is
a silent fail-open.
**Fix:** take `PracticeScope` itself, not a runner. Before reading, assert `scope.access(practiceId) !== undefined`
(the same check `readWithAudit` makes per row, `audit.ts:77-80`) and that the scope's actor is a person or job. Any
error while loading (decrypt failure, timeout) refuses the call with `InputRefusedError('screen_failed', …)`, never a
pass. Test: a scope for practice B with a check for practice A is refused.

### M8. The screen reads every patient's identifiers as a persona without PHI read, inside the request (design 5.2, 5.5, Q1)
The propose route needs `rate_record.edit` (`routes/models.ts:46-47`). The `contract_specialist` persona has no
`phi.read` (`packages/db/src/authz/permissions.ts:200-204`; the reviewer persona lists it explicitly). The screen
decrypts every member ID, patient control number and payer claim number in that person's transaction. With the house
rule of one audit row per row read, the access log then shows the contract specialist reading every patient of the
practice on every click: about 1.08M rows at a large practice. That misattributes access. It makes an
accounting-of-access report useless. And it holds plaintext for the whole practice in the web process, inside a
transaction that also waits on the model call (ADR 0055 keeps the call off the request pool, not the request's
transaction). The design's "correct at every size" is not true of a request that must insert about 1M audit rows
before its 60-second call.
**Fix (the best option, regardless of effort):** F3 is part of #120's best option, not an optimization. It needs a
migration, which Lane B cannot open: **say so loudly to the founder and Lane A.** The migration adds compact keyed
hashes and a `SECURITY DEFINER` function `practice_document_names_patient(practice_id, hashes[])`. The function
returns a boolean, audits one screen event (and the matched rows only), and runs as the screen, not as the person.
Until it lands, PR C may ship the decrypt path as an interim, with (a) a hard bound: above N stored identifiers the
screen refuses with `screen_unavailable` (fail closed, hand entry) rather than run for minutes, and (b) the read run
as the gateway's job actor with purpose `contract_screen`, if the scope model allows it. Add a gate: production serves
contract proposals to a practice above the bound only once F3 exists.

### M9. #120's best option needs a migration (the no-migration claim, design 12)
Design 12 is correct for the three PRs. I checked: `eval_example.expected` is any object (`20261029090000_model_gateway.sql:250-266`),
`audit_event.purpose` is an open pattern (`20261015140500_audit_and_operations.sql:15`), RLS on `patient_ref` and
`claim` is practice-only, and no `feature_flag` key is added. **But per M8, the best option for #120 is F3, a
migration.** The design should state that up front, not as an optional scale fix: "#120's best option needs Lane A's
migration F3; PR C is the interim, bounded and fail-closed".

### M10. `watched-paths.txt` is one of PR #42's files (design 3.1, 9)
PR #42's file list (REST `pulls/42/files`) includes `tools/screening-capacity/watched-paths.txt`. A, B and C each
regenerate it, because `tally.ts`, `patient-records.ts` and `floors.json` enter the screening path's import closure
(`watched-paths.txt:340-358` lists model-gateway `src` and `eval/baseline.json`). The brief allows shared documents
(the test matrix, the synth registry, ADRs) and nothing else of #42's. This is a generated tool file, not one of those.
**Fix:** get the ruling before the build starts (classify it as a shared generated file under rule 6), or build each
PR after #42 merges. Do not leave it to "regenerate after the merge".

### M11. The pinned hashes of the generated large tier depend on zlib's bytes (design 3.5 "Large tier", Q3)
`scannedPdf` deflates with `node:zlib` (`formats/scan.ts:11,123`). The repository's own zip writer refuses deflate for
exactly this reason: "deflate output can differ between zlib builds" (`formats/zip.ts:1-4`). L03 (80 scanned pages)
is regenerated on every run and checked against pinned SHA-256s, and its bytes feed `set_sha256`. A Node or zlib change
on a runner would (a) fail every golden run and (b) change the set hash, so every real-provider entry would face
`set_changed`.
**Fix:** for generated files, pin and hash the uncompressed content (the raster bitmaps and the PDF's other objects).
Or write L03's images uncompressed or run-length encoded with the repository's own encoder. Or commit L03 alone.
Generate the tier into a temporary directory with an atomic rename, so parallel vitest workers never race on
`MOD-09/generated/`.

### M12. `practiceRecordsCheck`'s false-refusal test has no adversarial identifiers (design 5.7, check C.4)
The twin practice's PCNs are sequential 8-digit numbers from `10000001`, so they never meet the forms ordinary
contracts produce. The tokenizer joins over one hyphen, so ISO dates `2026-01-01` become the run `20260101`: an 8-digit
run, equal to a PCN wherever a practice's system numbers accounts by date. That is common. A TIN `12-3456789` becomes a
9-digit run, as does a ZIP+4. Letter-only PCNs (name-derived account numbers, allowed because the PCN floor has no
digit rule) can equal a contract word ("PROVIDER", "SCHEDULE").
**Fix:** the twin practice also holds PCNs `YYYYMMDD` and `YYYYMMDDnn` across the set's date range, 9-digit member
IDs equal to the set's TINs and ZIP+4s, and letter-only PCNs equal to common contract words. Report the refusals in the
PR. If date-shaped PCNs refuse contracts, require a digit and a letter in a PCN below 10 characters, or require
`[A-Z]` absent from an 8-digit all-digit run that reads as a valid date. These are record-side rules, not page-side
heuristics, so they keep to the audit's "no shape heuristics".

### M13. A fabricated baseline entry serves (design 4.2)
The schema's literals refuse an entry with a dangerous count. They do not refuse a well-formed entry typed by hand,
with counts that meet the floors and no run behind them. PR B makes such an entry a production switch.
**Fix:** `--record` also commits the full report (`eval/reports/<sha256>.json`: counts, codes and case IDs only, as
today) and stores `report_sha256` in the entry. A unit test recomputes every entry's totals from its committed report,
and the report's `setSha256` and case IDs from the current set. Ask that `eval/baseline.json` and `eval/floors.json`
be founder-approved paths under ADR 0063's approval-of-record, by name.

---

## Minor

1. **`recordBaseline`'s `same()` (`baseline.ts:205`) ignores the variant.** Recording `ambiguous` on a model shared
   with `default` replaces the default entry. Add `variant` to `same`. The design changes `contractBaselineFor`, but
   not this.
2. **Wrong line citations.** `config.ts` has 107 lines: `assertPricesConfirmed` is at `:59-66` and the production
   checks at `:80-83`, not at `:123-130`, `:144-147` or `:117-156` (design 1.4, 4.2, 15). `assertEvaluated` and
   `unevaluatedModels` are exported from `src/index.ts:25`, so removing them changes the package's API; their test is
   `config.test.ts:9`, not the golden file (design 4.1).
3. **Screen order.** Put B's per-variant served check before C's `screen`, so an unserved ambiguous call never runs an
   audited PHI read. Say so in section 9's `gateway.ts` row.
4. **Fault selection.** `FaultyProvider`'s `calls` indexes calls in order of arrival (`faults.ts:47-53`), which
   changes under `runEvaluation({ cases })`. Select the spoiled call by case ID (`request.user` hash or document ID).
5. **Dangling references.** `loadContractSet` must refuse a `twinOf`, `pairOf` or `conflicts` index that names no case
   or record.
6. **Conflict pairs.** Define `conflict_unflagged` as: the candidates paired with records `i` and `j` both exist, both
   propose a rate record, and each lists the other in `conflictsWith`. Being flagged against any candidate is not
   enough.
7. **The permitted run.** `permittedRegressions` compares `examples` by count (`permitted.ts:279-281`). Compare by
   example ID set, or a different set of the same size is compared as the same.
8. **MOD-13 is outside the reservation** (MOD-07 to MOD-12). Fold the accepted-example assertion into MOD-07 (which
   already names the permitted examples), or get the claim row corrected before the build. The design asks for the
   latter; the former needs no coordination.
9. **The denial-letter screen** (N6) is rewritten in what the audit calls "a small PR". `readDenialLetter` has no
   production caller, so the risk is low, but it is scope. Keep `OtherPatientCheck` and add the issued check in a
   follow-up, or justify it in the ADR.
10. **"Multi-row tables".** V01 has multi-code rows across pages, but no row that wraps over two lines (a description
    cell that wraps, so the rate sits on the next line). Add one to V01. It also exercises `not_in_row` on a two-line
    quote.
11. **Contract-plus-exhibit pairs** are read one document at a time, as the product does. Say what `pairOf` asserts.
    It is recorded but no gate reads it. For example: an exhibit's candidate stating flags or rounding it cannot quote
    counts as `extra`.
12. **Twins on a real model.** Two samples of one prompt are not identical, even with sampling settings fixed (no
    temperature is set: `grep temperature src` finds none). Zero difference is right per the audit, but the runbook
    should say: run the clean twin twice; if those two runs differ, the result is "nondeterministic", not a pass.
13. **A pdf.js bump changes the set hash** (by design). Put that in the runbook and in ADR 0070's consequences: such a
    bump needs B2's two-step re-baseline of every real entry before it can merge.
14. **The refusal tells the specialist a bit:** that the document holds an identifier of the practice. That is
    acceptable, because the evidence viewer already shows the document's pages to the specialist
    (`lib/contracts/evidence.ts:43`). Record it in ADR 0070 Part 3.
15. **The refusal log carries `practice_id` and the code.** The audit says "logs the code only". An ID is allowed
    (CLAUDE.md: "Log IDs"), but say in the ADR that the departure is deliberate.
16. **MOD-09's registry entry** mixes committed cases with `b.generatedFile`. PAR-29 uses `noFiles` with
    `generatedFile` (`registry.ts:28-37`). Confirm the builder supports both in one case before relying on it.

---

## (1) Evaluation correctness

- **Does the metric see a silent wrong value?** Yes for a paired wrong value (`wrong`) and for an unpaired verified
  candidate (`extra`). I traced A.1 against `score.ts:168-217`: `asCounts` reproduces /1's tp/fp/fn exactly, because a
  stated, not-right truth field adds one fp and one fn in both.
- **Fewer fields stated:** they become `missed`, which lowers recall. It is caught by recall regression and the floors,
  but not by `wv`. Correct.
- **Splitting a row:** one part pairs (`codes` wrong) and the rest is unpaired (`extra` on every field), so `wv`
  rises. **Merging rows:** `codes` wrong and the other row missed, so `wv` rises. **Swapping rows:** `not_in_row`
  rejects them once M1 is fixed. Pairing is greedy in truth order and the first index wins ties. I found no way to turn
  a wrong value into `tp` or `missed` while keeping it in a proposable rate record: a candidate yields a rate record only
  when every field it fills verified.
- **"Never rising":** well defined on one set (raw counts on identical cases). It is not well defined across set changes
  (B2) or subsets (M2).
- **Fail closed, path by path:** missing baseline: recall floors close it for a real provider, but unfaithful `wv` and
  precision stay open (M5). Missing floor: closed (`floor_unset`; floors.json unreadable means config throws). Set
  changed: open through `--new-set` (B2). Twin pair incomplete: open (M4). Crash mid-run: closed (a non-gateway error
  rethrows, `harness.ts:117-129`, and nothing is recorded). Failed calls: counted as misses, closed. Subset: open
  (M2). Unserved purpose: open by default (B1).
- **Are the faults sufficient?** No (M6).

## (2) AI safety

- **No model output reaches a money path, an approval or a stage.** These PRs change none of the paths, and
  `contract-proposals.ts:156-171` still stores only proposed rate records that need the specialist's approval.
  `not_in_row` only adds rejections. Confirmed.
- **The injection twins' comparison is not exact** (M4).
- **Per-feature serving can be bypassed** by the constructor default (B1). The evaluable set must be reachable only by
  the permitted run: add a lint test that `config.evaluable` appears only in `apps/worker/src/models/permitted*.ts`.
- **Hand-edited or fabricated entries** (M13).

## (3) PHI and security (#120)

- **Can a caller skip the check?** Not by omitting it: the required field, the issued registry and the practice
  binding hold. But a caller can neuter it with a wrong or stub scope (M7).
- **What it logs and stores:** only the code and `practice_id`; nothing of a match (design 5.5, 5.6). Correct. The
  route redirect carries only the code.
- **False positives:** acceptable once M12 is measured. **False negatives:** identifiers wrapped across lines, short
  PCNs, and EOBs for claims not yet loaded from any 835. The last gap is missing from the ADR's list; add it.
- **Decrypt-in-request exposure:** major (M8).
- **Upload kind, server side:** the server already requires a kind (`lib/routes/uploads.ts:174-185`, `fileSchema.kind`
  is `z.enum`). The UI change is the fix the audit asks for. Zip entries take the zip's kind (`intake.ts:326-328`); the
  screen is what catches those.
- **#42's files:** PR C touches none of #42's code files (`components/screening/upload-form.tsx`, `apps/worker/src/config.ts`,
  `packages/observability/src/fields.ts`, `lib/server/services.ts`, ADR 0055 all untouched; `gatewayFor` lives in
  `path.ts`, not `services.ts`), except `watched-paths.txt` (M10).

## (4) Feasibility

- **CI time:** the estimate (25-45 s for `test:golden`, from 11-17 s) is plausible. About 360 reference calls plus
  about 40 per fault, against about 2,000 today. 480k synthetic identifiers held in memory for the harness's screen
  cost about a second.
- **Repository size:** v1's 40 cases are 856 KB (`du fixtures/synthetic/MOD-01`), and one scanned page is about 10 KB,
  not the design's 40 KB. The committed v2 growth of about 1.5 MB is therefore conservative. Generating the large tier
  is fine apart from M11.
- **The fixture guard:** PDFs pass only with a synthetic producer (`write.ts:328-333`), so `writeRichPdf` must set
  `EXHIBIT_PRODUCER`. A CSV is checked for the SYNTHSENDER marker only where a header names an ID column; V02's header
  names none, as v1's CSVs already pass. MOD-12's 835 goes through `assertSyntheticX12`. Directories named `generated/`
  are skipped by the drift check (`write.ts:372-386`).
- **gitleaks:** the twin identifiers are generated in memory, not committed. MOD-12 commits a few `ZZ`-prefixed
  identifiers and 13-digit numbers, which no default rule targets. Run `pnpm gitleaks` on the branch before the first
  push.
- **Mutation shards:** no money package imports `@tp/synth` or `@tp/model-gateway` from `src`
  (`MUTATION_PACKAGES = money, pricing, ledger, packets`). Check A.8 is the right guard.
- **Screening-capacity gate:** it measures on all three PRs (synth `src` and model-gateway `src` are watched), so plan
  13-16 minutes each.

## (5) Completeness, clause by clause

**#84's best option**
| Clause | Covered? |
|---|---|
| Report "wrong but verified" per field apart from rejections | Yes (3.2) |
| …and gate it: never rising | Partly: escapes via `--new-set` (B2) and subsets (M2) |
| …zero on cases where the page text is faithful | Yes (`wrong_verified_on_faithful`; schema literal) |
| You and the specialist set an absolute recall floor per field before production | Yes, as F1 with null floors that fail closed; extend to precision (M5) |
| Add swapped-row faults the gate must catch | Yes (`swappedRows`, `crossRowQuote`), with a correct code-token rule needed (M1) |
| Set v2: size tiers to 60 codes and 80 pages | Yes (L01-L05) |
| contract-plus-exhibit pairs | Yes (V03/V04, L04/L05); what `pairOf` asserts is unstated (minor 11) |
| multi-row tables | Partly: no wrapped rows (minor 10) |
| scans with seeded OCR errors | Yes (V05, V07) |
| struck-through rates | Yes (V08, V09), but their bar is unbounded for the first real run (M5) |
| injected-instruction twins (zero difference from the clean twin allowed) | Partly: the key is not exact and failed pairs pass (M4) |
| decoy amended-rate paragraphs (both must be flagged as conflicting) | Yes (V16-V18 and v1's three amendment cases); define pairwise (minor 6) |
| Keep accepted proposals as examples too, under the data-rights agreement | Waits on F2 (right: legal text); the line is identified (`contract-proposals.ts:371`) |
| Serve each model feature in production only when its own prompt and model have a baseline | Yes (PR B), but fails open by default (B1) and is not sequenced (M3) |
| switching that feature off rather than the whole provider | Yes (`not_evaluated`; the config throws only when nothing is served) |
| Add these attacks to PR 16's red team | Yes (reconciliation-001 item 16 amendment) |
| Lands in a new evaluation PR before the people-only first real-model baseline | Yes for A; B must also precede it (M3) |

**#120's best option**
| Clause | Covered? |
|---|---|
| Before a contract or exhibit is sent | Yes (after `prepare`, before the key, budget and call) |
| check it against the practice's own records | Yes, but can be neutered (M7) and costs as in M8 |
| for an exact member ID, payer claim number or long patient control number | Yes (whole-token runs, floors 6/6/8, Q2) |
| a hit refuses the call ('this document names a patient of the practice and was not sent') | Yes, the exact sentence |
| and logs the code only | The code plus `practice_id` (minor 15) |
| No shape heuristics | Yes on the page side; the record-side floors are acceptable (M12) |
| The upload panel leaves the kind unset until the person picks one | Yes on the contracts and reconciliation panels; the uploads page keeps its 835 default (N4, defensible: neither kind goes to a model) |
| Lands in a small PR before PR 16 | PR C is about 25 files with a letter-screen rewrite (minor 9) |

## (6) The no-migration claim

It holds for A, B and C as designed (M9 gives the evidence). **But the best option for #120 needs a migration (F3), and
Lane B never opens one: the founder and Lane A must be told plainly, and PR C must ship as a bounded, fail-closed
interim (M8).** F4 (re-filing a misfiled document's kind) is also a migration and is correctly handed off.

## Improvements named along the way
- Code-token shape as a named constant shared by the verifier and `not_in_row` (M1).
- Commit each recorded report and verify entries against it (M13).
- Twin determinism probe in the runbook (minor 12).
- A record-side digit-and-letter rule for short PCNs, if M12's measurement calls for it.
- Fold MOD-13 into MOD-07, so no new ID is needed (minor 8).
