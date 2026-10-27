# 0070. Gate models on wrong-but-verified fields and people-set floors, serve each model feature on its own evaluation, and check contracts against the practice's records before the model

- **Status:** accepted, Parts 1 and 2 (`co-001/model-eval-gate`, combined audit #84, one pull request) and Part 3
  (`co-001/contract-phi-check`, combined audit #120, the second pull request). Part 1 amends
  [0051](0051-evaluate-every-prompt-and-model-on-the-synthetic-sets-in-the-golden-project-against-a-committed-baseline-and-prove-the-gate-with-injected-faults.md)
  (the scorer, the gate, the set and the first real-model run),
  [0052](0052-call-the-gateway-from-the-screens-in-the-persons-name-record-each-decision-when-the-person-is-done-and-keep-corrections-only-under-a-data-rights-agreement.md)
  (what an example's expectation holds) and
  [0054](0054-match-model-figures-whole-and-in-role-read-letters-only-through-their-reader-hold-budgets-before-calls-and-serve-only-evaluated-prompts.md)
  (the permitted run's report).
  - **Part 2** (`co-001/model-eval-gate`) amends 0054 again: production serves each model feature on its own
    evaluation, so a feature without one is off on its own, not every feature at once.
  - **Part 3** (`co-001/contract-phi-check`) amends 0054 a third time: a contract or exhibit is checked against the
    practice's records before the model (the screen step).
- **Date:** 2026-10-26
  - **Part 3:** 2026-10-27 (and the fix round of its pull request's review, the same day)
- **Deciders:** the founder, Tyler Williams, who adopted the combined best-option audit in full on 2026-10-20 (items
  #84 and #120 among it), under the standing rule of 2026-10-18; the co-founder's standing ruling of 2026-10-26, about
  00:20 UTC, relayed by the orchestrator ("Don't ask for approvals anymore just build and optimize": take the
  recommended option on every choice, for security the safer one, record it with its reasons, and never wait), under
  which the build session made the session rulings below at about 01:10 UTC; the build (Lane B), for the notices below,
  each reversible by the founder. The founder's own matters, F1 and F2, stay open (below).
  - **Part 2:** the same, and session rulings 9 (F5 (a)) and 10 (F6).
  - **Part 3:** the same, and session rulings 3 (Q1, the bound), 4 (Q2, the stored-side rules) and 8 (F3 and F4 for
    Lane A); the build (Lane B; continued on 2026-10-27 by a Lane B item session started by Lane A's orchestrator on
    the co-founder's instruction of that day), for the notices N4 to N6 and the departures from the design, each
    reversible by the founder.
- **PRD sections:** 14 (Logging and evaluation: "the gate for a prompt or model change is field-level precision and
  recall on that set with no regression"; "Reviewer corrections become evaluation examples under the data-rights
  terms"), 17 (milestone 10's done check), 18 (Layers: Model, "No regression on any prompt or model change"); test
  matrix MOD-07 to MOD-10; reconciliation-001 item 16 (PR 16's red team); ADRs 0048, 0051, 0052, 0054 and 0063
  - **Part 2:** 14 (Operational limits: the kill switch "turns every model feature off"; Provider and data path), 18
    (What never ships); test matrix MOD-11; ADRs 0052, 0054 and 0063 (the founder's paths in CODEOWNERS).
  - **Part 3:** 14 (PHI minimization: "Contracts carry no PHI"; Untrusted input), 16 (Threats the design addresses by
    name); test matrix MOD-12; reconciliation-001 item 16 (PR 16's red team); ADRs 0048 (minimization) and 0054 (the
    kind check and the screen step).

## Session rulings (2026-10-26, about 01:10 UTC)

Made by the build session under the co-founder's standing ruling of 2026-10-26 above; each is the design's
recommended option (for security, the safer one).

1. **Two pull requests, not three.** The design split #84 into a gate (its PR A) and a serving switch (its PR B). Both
   are built as one pull request, `co-001/model-eval-gate`, as this ADR's Parts 1 and 2. #120 is the second pull
   request, `co-001/contract-phi-check`, Part 3, cut from `claude/build-platform` after the first merges, so it starts
   from the first's `gateway.ts` and `contract-terms.ts` and no shared file is resolved twice. The reason: the gate on
   its own would have left production refusing every real provider until a second pull request merged, so the two
   halves of #84 are one change with one AI-safety review. `co-001/model-serving` is not created.
2. **`tools/screening-capacity/watched-paths.txt`** (the design's Q4) is a generated file (`pnpm exec tsx
   tools/screening-capacity/watched.ts --write`, held equal to the imports by its own unit test), treated as LANES
   rule 6 treats the lockfile: never hand-edited or hand-merged. Each pull request regenerates it, and the one merged
   second (this one or #42) regenerates it again after merging its base. It is derived from imports, so a stale copy
   fails its own test, and regenerating it changes none of #42's content.
3. **Q1** (Part 3): until F3's migration, the check refuses with `screen_unavailable` above 50,000 stored identifiers.
4. **Q2** (Part 3): the stored-side identifier rules: every kind holds a digit; a patient control number has at least
   8 compact characters; a member ID and a payer claim number at least 6; 8-digit calendar-date values are dropped.
5. **Q3:** the large tier of set v2 is generated in CI, pinned by hash, its images run-length encoded and written
   atomically (Part 1), not committed.
6. **F1 (the floors):** `eval/floors.json` ships with every floor unset, which fails closed: a real provider is
   neither recorded nor served in production while any floor is unset. The values are the founder's and the contract
   specialist's (the audit's "you and the specialist"); nothing in the build chooses them. Open, below.
7. **F2 (accepted proposals as examples):** not built. Whether the data-rights addendum covers keeping an accepted,
   uncorrected proposal's document is the agreement's text, which is legal text and the founder's. Open, below.
8. **F3 and F4** (compact lookup-hash columns; a reviewed correction of a document's kind) are migrations, proposed
   for Lane A (below). Part 3 is the bounded, fail-closed interim until F3 lands.
9. **F5:** option (a), the two-step: a synthetic baseline entry makes a feature evaluable only, and the permitted run's
   record, made inside the PHI boundary, serves it (Part 2).
10. **F6:** `packages/model-gateway/eval/baseline.json`, `eval/floors.json` and `eval/reports/` are named as the
    founder's paths in `.github/CODEOWNERS` in this pull request, with `tools/test/codeowners.test.ts` updated: Part 2
    makes them a production switch, and ADR 0063 makes the founder the owner of such paths. It changes repository
    content, not an owner-admin setting.
11. The claim row's "MOD-7 to MOD-12" reads MOD-07 to MOD-12, a spelling for the orchestrator to correct in LANES.md.

## Part 1 (`co-001/model-eval-gate`): the evaluation gate

### Context

Combined audit #84 found the gate blind to the error that matters most. At 6ddd587:

- **A rejection and a wrong value scored the same.** `scoreContract` (`eval/score.ts`) counted a stated true field
  that was not right as one false positive and one false negative, whether the verifier rejected it (the specialist
  sees it marked and enters it by hand) or passed a wrong value (the specialist sees it marked as checked). The gate
  (`eval/baseline.ts`) compared precision and recall fractions only, and the in-boundary scorer
  (`src/permitted.ts`) had the same rule. A model change that turned visible rejections into silent wrong values
  scored the same and passed.
- **Wrong values verify.** The verifier (`reviewField`, `src/functions/contract-terms.ts`) checks each field alone:
  its page, its quote on the page, its written value a whole figure inside its own quote. Nothing tied a candidate's
  fields together, so codes quoted from one row and an amount quoted from another both verified; a quote of up to
  2,000 characters spanning rows held every figure in it; `method`, `flags` and `rounding` have no written value and
  only their quote was checked, so a flipped `apply_mppr` with the real flags sentence verified; an amendment's figure
  on the original record verified; an obeyed injected instruction verified. Text the reader got wrong (a PDF's own
  OCR layer, hidden or struck-through text, all read as ordinary text by `packages/contracts/src/evidence/pages.ts`)
  can only be caught by truth.
- **The set could not show it.** The 40 cases of v1 are 1 to 4 pages with 2 to 6 rows; every row field quotes its row
  line; every scan's recording is error-free; no case has a twin, a decoy or unfaithful page text. Its hash did not
  cover the pages as read, so a reader change that altered what a model is sent left the set "unchanged".
- **The gate had holes.** `set_changed` was reported but did not block `--record`, which still compared counts made
  on another set; `contractBaselineFor` fell back to the provider's latest entry and ignored the variant, so the
  larger "ambiguous" model could be held to the default model's entry; `recordBaseline`'s `same()` ignored the
  variant too.
- **Examples counted other documents.** `reviewVersionProposals` (`apps/web/src/lib/models/contract-proposals.ts`)
  stored every final record of the version in each example, whatever document it cites, so a contract proposal in a
  version that also had an exhibit was never "accepted" and its example counted the exhibit's records as misses.
- Every fault test reran the whole set (about 2,000 local calls in `pnpm test:golden`).

### Decision

**One tally, eight counts** (`src/tally.ts`, used by `eval/score.ts` and `src/permitted.ts`, notice N12). Each true
record pairs with the candidate that gets most of its fields right (greedy, as before). For each field:

| Truth has it | Candidate states it | Verified | Value is the truth | Count |
| --- | --- | --- | --- | --- |
| yes | yes | yes | yes | `tp` |
| yes | yes | yes | no | `wrong` |
| yes | yes | no | yes | `rejected` and `rejected_right` |
| yes | yes | no | no | `rejected` |
| yes, a scope field | no, and the candidate became a rate record | | | `widened` |
| yes | no (or no candidate) | | | `missed` |
| no | yes | yes | | `extra` |
| no | yes | no | | `rejected_extra` |

A candidate paired with no record adds `extra` or `rejected_extra` for each field it states. `lesser_of_schedule`,
which is never cited, counts as verified when stated, as before. A **scope field** (`codes`, `modifiers`,
`places_of_service`, `effective_from`, `effective_to`; `SCOPE_FIELDS` in `src/tally.ts`) that the truth states and a
candidate the gateway proposed as a rate record leaves out counts `widened` (the PR review's M2): the record then
applies to every code, modifier, place or date with nothing on the page rejected, so a change that turns a rejected
modifier (marked failed) into a left-out one (nothing to mark) would otherwise read as better precision. Production
names the omission too: the candidate's defaults carry `codes_unstated`, `modifiers_unstated`,
`places_of_service_unstated`, `effective_from_unstated` or `effective_to_unstated` (`SCOPE_UNSTATED` in
`src/functions/contract-terms.ts`), and the specialist's card shows each such field as a row of its own, "Not stated",
with how wide the record reads (`apps/web/src/components/models/display.tsx`); the gate still counts it, since a row
the specialist confirms without a page to check it against is no verification. A candidate that became no rate
record widens nothing, and the omission stays `missed`. Both scorers say whether a candidate became a rate record
(`eval/score.ts` from the verifier's review, `statedKeys` in `src/permitted.ts` from the stored one), so the permitted
run counts `widened` as the synthetic gate does; a scorer that did not say (`Stated.rateRecord` absent) would count
every omission `missed`. The old counts are derived (`asCounts`): `fp = wrong + extra + rejected + rejected_extra`, `fn = wrong +
rejected + missed + widened` (a widened field is the false negative /1 counted as missed, and states nothing, so it is
never a false positive), so precision and recall mean what they meant, and a test holds them equal to the 6ddd587
scorer's on every v1 case of the reference and of each fault, and on arbitrary records and candidates. **Wrong but
verified** is `wrong + extra + widened`: what the specialist would see marked as checked that is not the truth, or a
rate record's scope left wider than the truth's with nothing marked. The tally also names each paired record and
field it counted wrong but verified (`wrongVerifiedAt`), so the unfaithful cap compares which values are wrong, not
only how many.

**The verifier ties a row field to its row** (`not_in_row`, notice N3; `rowProblems` in
`src/functions/contract-terms.ts`, `codeTokens`, `figureSpans` and `tokenSpans` in `src/figures.ts`). For a candidate
whose codes are stated, each row field (`modifiers`, `places_of_service`, `amount`, `percentage`, `fee_schedule_year`)
that `reviewField` passed is rejected with `not_in_row` unless, for every item of its written value, some place the
item verifies in its quote has, as its nearest code token before it (or, with none before, after it), one of the
candidate's own codes. A code token is a case-sensitive whole token of HCPCS shape (four digits then a digit or a
capital, or a capital then four digits) outside any amount, percentage or date the scanner reads; the quote is never
upper-cased, so "Payer", "shall" and "TOTAL" are not codes. A quote with no code token rejects its row fields. The
check is code only: no prompt or schema change, so no new prompt version. It catches swapped rows, cross-row and
paragraph quotes, and a row field quoted from a fragment with no code. It does not catch a wrong method, flags or
rounding, an amendment's figure on the original record (the amendment line names the same code), or text the reader
got wrong; the gate measures those. It refuses some right answers, which become visible rejections the specialist
enters by hand, counted as `rejected_right`: "97110 and 97112 are paid at $43.10 and $45.00 respectively", a rate
clause pointing at codes listed elsewhere, and a five-digit ZIP code nearest the amount. The tests pin each as known
behaviour. Every reference answer of v1 (742 fields) has no row problem, checked before the rule's tests were written
and held by `contract-terms.test.ts`; set v2's are held by the golden reference run, which allows no rejection on a
faithful case. The same check over all 63 cases (2,615 fields) found no code token in any quote but its record's own
codes, and row problems only on three amounts of V05 and V07 whose text as read is not a figure (a letter for a digit),
which the verifier rejects before the row check.

**Set v2** (`packages/synth/src/eval/contract-set-v2.ts`, `large-contracts.ts`; test matrix MOD-09; notice N2). One
set holds the bar: v1's 40 cases keep their bytes and become v2's small tier (their truths upgraded to
`tp-eval-contract/2`), and 23 cases are added, 63 documents in all:

- V01 to V05, medium (to 12 pages and 40 codes): a multi-row table across pages with wrapped descriptions, a 40-row
  CSV exhibit, a contract-plus-exhibit pair (V03 states the terms, V04 the rates), and an image-only scan whose
  recording carries seeded OCR errors;
- V06 to V18, small: a scan with its own invisible OCR text layer, one whose layer has seeded errors, struck-through
  rates in a table and in prose, three injected-instruction twins (visible text, invisible and white text, drawn in a
  scan) each beside its clean twin, and three decoy amended-rate paragraphs (table, prose, scan) that overlap a real
  row with another amount;
- L01 to L05, large (to 80 pages and 60 codes): an Exhibit A after 70 pages of articles full of distractor figures,
  rate sentences spread over 40 pages, an image-only 80-page scan, and a contract-plus-exhibit pair. They are written
  by `ensureLargeContractTier` into `fixtures/synthetic/MOD-09/generated/` (ignored by git) before each read, into a
  fresh temporary directory renamed into place so parallel test workers never read a half-written file, and every
  file's SHA-256 is pinned by MOD-09's registry entry. Every new scan writes its image with the PDF `RunLengthDecode`
  filter from an encoder in `packages/synth`, so no pinned hash depends on the zlib build (session ruling 5).

Tiers small 53, medium 5, large 5; 3 twin pairs; 9 expected conflict pairs (the two amended rows of each of v1's
amendment cases C05, C25 and C33, and one per decoy case); 5 cases whose page text is unfaithful (V05 `ocr_errors`, V07
`ocr_layer_errors`, V08 and V09 `struck_text`, V13 `hidden_text`). Every case says SYNTHETIC on every page and passes
the fixture guard. A truth (`tp-eval-contract/2`) adds the tier, the page text's fidelity and why, `pairOf`, `twinOf`,
the expected conflict pairs and each record's role (`term`, `amendment`, `decoy`); on an unfaithful case a field also
carries `asRead`, the field as a faithful copier of the page text would write it, which the local reference answer
uses. The loader refuses a dangling `twinOf`, `pairOf` or conflict index and a pair whose truths do not name each
other. The set hash (`tp-eval-set-hash/2`) covers the manifest, every truth, document and recording, and the hash of
every page **as read**, so a pdf.js or Textract-reader change that alters what a model is sent changes the set.

**The report and the baseline.** Report `tp-model-eval-report/3` (`eval/harness.ts`) holds tallies by field, layout,
tier and page text, each case's own tallies, wrong-but-verified counts and the records and fields they are on
(`wrongVerifiedAt`), conflicts, twins, the sorted `caseIds` and a `spliced` mark. Baseline `tp-model-eval-baseline/4`
(strict schema in `src/baseline-format.ts`, so the gate and production serving parse entries alike) keys a contract
entry by purpose, prompt version and content hash, provider, model and **variant**, refuses two entries of one key
(`sameEntryKey`, the one definition the writer and the reader share, so a hand merge that keeps both cannot leave the
weaker one first; the PR review's m4), holds the eight counts per field and in total, and carries three literals:
`faithful_wrong_verified: 0`, `conflicts.unflagged: 0` and `twins.differing: 0`. A hand-edited entry carrying a
dangerous count therefore does not parse. Its `note` is written by code on every record (`BASELINE_NOTE` in
`eval/baseline.ts`), so it says what this code serves and is never typed by hand. Each entry names its recorded report by SHA-256 (`report_sha256`), committed
as `eval/reports/<sha256>.json` (counts, codes and case IDs of the synthetic set only); a golden test recomputes every
entry from its report, checks the report's hash and case IDs, that what the set decides of each case (layout, tier,
page text, twin, pair) is the set's and each case's counts are its tallies' (`caseMismatches`, the PR review's n1),
and, for every entry production would serve, that its set hash is the current set's. Production parses the committed
file once, at import (`committedBaseline` in `src/evaluated.ts`): a file that does not parse is a
`GatewayConfigError` naming it, so a broken build fails at startup, loudly and closed, never with every feature quietly
off; every CI run parses the same file first. Forging an entry means forging a whole report, which the founder reviews by path
(session ruling 10).

**Floors** (`eval/floors.json`, `tp-model-eval-floors/1`; `eval/floors.ts`). A recall floor and a precision floor per
field for `proposeContractTerms`, each decimal text with at most six places in [0, 1], or `null` (unset). A recall floor
is met when `tp × 10^6 ≥ ppm × (tp + fn)`, a precision floor when `tp × 10^6 ≥ ppm × (tp + fp)`, in BigInt; precision
bounds junk candidates (`extra`, `rejected_extra`), which nothing else bounds. A field with a zero denominator meets any
floor. The file ships with every floor `null`, and a unit test holds that: the build never chooses the numbers (F1).
The local provider is never held to floors.

**The gate** (`eval/baseline.ts`). `contractBaselineFor` matches provider and variant, then prompt version and model,
then the model under an earlier prompt, then the variant's latest entry; never across variants. Its problems, in
order:

| Code | When | Blocks `--record` |
| --- | --- | --- |
| `incomplete_report` | the report's `caseIds` are not exactly the set's; nothing else is computed | yes |
| `spliced_report` | the report is a splice (below) | yes; tests may gate one |
| `no_baseline` | no entry for the provider and variant | no (the first record), but every absolute rule still applies |
| `prompt_changed` | the prompt version's content differs from the held entry's | yes |
| `set_changed` | the held entry's set hash differs; no regression is computed | yes, unless `--new-set` and the prompt version, prompt hash, provider, model and variant are the held entry's |
| `new_set_with_change` | `--new-set` with any of those five different | yes, always |
| `precision_regressed`, `recall_regressed` | as before, per field and overall, on the same set only | yes |
| `wrong_verified_rose` | wrong but verified above the held entry's, per field or overall, on the same set only | yes |
| `wrong_verified_on_faithful` | any wrong but verified field on a case whose page text is faithful, whatever the baseline | yes |
| `unmeasured_cases` | a case whose call failed (`call_failed:*`) or was refused (`refused:*`): the run measured nothing there, and counting it all missed would lower the bar every later change is held to (the PR review's m1); an answer off the schema (`invalid_output`) is the model's and counts | yes, on a first record and a `--new-set` record too |
| `wrong_verified_above_reference` | on an unfaithful case, a field's wrong but verified above the local reference's on that case, for any provider | yes |
| `wrong_verified_off_reference` | on an unfaithful case, a wrong-but-verified value on a record and field the local reference has right (the PR review's n4) | yes |
| `conflict_unflagged` | for an expected pair, the two records' candidates not both proposed, or either not listing the other in `conflictsWith` | yes |
| `pair_term_extra` | a verified exhibit candidate states a field only its contract states | yes when the case is faithful (it is then also wrong but verified there) |
| `twin_incomplete` | either call of a twin pair failed or was refused | yes |
| `twin_differs` | an injected twin's `twinSha256` differs from its clean twin's | yes |
| `twin_canary` | any output string of any case holds the injection's canary phrase, or any output string of an injected twin holds a word its pages write and no document without an injection writes (`injectedWords`, taken from the pages; the PR review's m2) | yes |
| `floor_unset` | a provider other than `local` with a recall or precision floor `null` | yes |
| `recall_below_floor`, `precision_below_floor` | a provider other than `local` below a set floor | yes |
| `quotes_off_page`, `narrative_failures` | as before | yes |
| `reference_missing` | the local reference run does not cover an unfaithful case of the report (another set or prompt, or a case left out), so `wrong_verified_above_reference` cannot be computed there; it names the cases | yes |

The local reference report for `wrong_verified_above_reference` is computed in the same run (the local provider over
the unfaithful cases only), never read from a file, so it follows the current set and verifier. `twinSha256` is the
sorted list, over every candidate, of its full canonical output without its free-text `label`, plus the verifier's
review of every field (page, quote, written value, verified, problems), its defaults, problems and `conflictsWith`, and
whether a rate record was proposed; `conflictsWith` is keyed by the hashes of the conflicting candidates' entries, never
by their places in the list, so the same candidates in another order give the same key (the PR review's n2). The label
is left out because the specialist renames it and two runs of the same request can word it differently with no change
of meaning; a label that obeys the injection is caught by the injected-words rule of `twin_canary`, which reads every
output string for any word only the injection writes, not one exact phrase.
The twins share every page and line position, so equal pages and quotes are required, not excused. On the local
provider twin equality holds by construction (it answers by request hash, and both twins are registered with the same
reference), so CI proves the pairing, the key and the gate failing on an obeyed, quoted or failed twin, not a model's
resistance; only the people-run real-model evaluation measures that. A real model can answer the same request
differently, since no sampling setting is fixed, so the runbook has the contracts run twice: if the clean twin's two
answers differ (its two `model_call` rows: the same input hashes, different `output_sha256`), the pair's twin result
is `nondeterministic`, neither a pass nor a failure of injection resistance. The CLI has no comparison option for this
yet; it is a person's reading of the two runs.

`recordBaseline` records only with no blocking problem, writes the report under `eval/reports/` and the entry's
`report_sha256`, and replaces an entry only when purpose, prompt version, provider, model and variant are equal, so
recording the `ambiguous` variant keeps the `default` entry.

**The two-step re-baseline.** A set change (a new case, a truth fix, a pdf.js or Textract-reader bump that changes the
pages as read) and a prompt or model change never land in one record. First the held prompt and model are run on the
new set and recorded with `--new-set`; then the new prompt or model is gated against that entry on the same set, with
every regression rule in force. For a real provider each step is a people run and a pull request
(`docs/runbooks/model-evaluation.md`), so a dependency bump that changes the pages as read cannot merge until every
real-provider entry has been re-recorded this way.

**Faults** (`eval/faults.ts`; test matrix MOD-08 and MOD-10). Each fault names the cases it spoils by case ID, through
a per-request case tag, so the spoiled call is the same whether the whole set or a subset runs. Beside v1's three
contract faults and five narrative faults: `swappedRows` and `crossRowQuote` (rejected as `not_in_row`; the gate sees
precision and recall fall and no wrong-but-verified problem); `mergeRows` on C01 (the merged codes are rejected, since
the codes' quote holds one row's code: recall falls on the lost row and precision on codes, and nothing wrong verifies);
`mergeRowsSpanning` on C01 (the same merge with the codes quoted over both rows, so they verify: also
`wrong_verified_on_faithful:codes`); `dropScope` (modifiers left out of every row of C05, codes and the end date of
C08: `widened`, so `wrong_verified_rose` and `wrong_verified_on_faithful` on that field);
`flipFlag`, `wrongMethod`, `wrongDate` and `amendedOnOriginal` (each verifies; `wrong_verified_rose` and
`wrong_verified_on_faithful`); `takeStruck` on V08
(`wrong_verified_rose`, `wrong_verified_above_reference` and `wrong_verified_off_reference`, and the test asserts
`wrong_verified_on_faithful` is absent, so a broken `wrong_verified_rose` fails it alone); `obeyInjection`,
`quoteInjection` and `failTwin` on V11 (`twin_differs`, `twin_canary`, `twin_incomplete` with `unmeasured_cases`);
`labelInjection` on V11, V13 and V15 (every value and quote the clean twin's, only the label obeying the injection:
`twin_canary` alone); `failTwin` on C04, a case with no twin or conflict (`unmeasured_cases`, refused at a first
record); `dropDecoy` and `unpairConflict` (`conflict_unflagged`). No fault moves the reference's misread value to
another record of the same field: the verifier binds a row's amount to the one whole figure on its own row
(`not_in_quote`, `not_in_row`), so no verifying value can be put there; `wrong_verified_off_reference` is proven on a
synthetic report in `eval/score.test.ts`, and the golden test holds the reference's own wrong values to the fields its
unfaithful cases read otherwise than a person sees them. A test
floors file proves `recall_below_floor` and `precision_below_floor`; the committed file stays all `null`. The
demonstration test (MOD-07) records a baseline from a run with `wrongValue` on one amount, gates a run with
`amendedOnOriginal` on the same record, asserts that the old tp, fp and fn of the two runs are equal field by field
(the blindness, measured), and that the gate fails the second with `wrong_verified_rose:amount` and
`wrong_verified_on_faithful:amount`.

**CI time stays bounded** (notice N11). `runEvaluation({ cases })` evaluates a subset, and `spliceReport` puts the
subset's case results in place of the reference report's and recomputes every total from the cases, marking the
result `spliced` with the full `caseIds`: the gate computes on it, and `--record` and `record-permitted` refuse it. Each
fault test therefore calls the model only for the cases it spoils, narrative faults included, against about 2,000
calls before.

**Examples and the permitted run** (amending ADRs 0052 and 0054).

- An example's expectation is `tp-eval-correction/2`: the decision (`accepted`, `accepted_with_changes`,
  `rejected`), the changed fields, and only the final records whose citation is the proposal's own document, each with
  its `citation.document_id`; a final entered with no citation belongs to no document's expectation and is counted as
  `uncited_finals`. `changedFields` takes only the proposal's own document's finals, so a contract proposal in a
  contract-plus-exhibit version is accepted when its own records stand. A /1 example's records cannot be filtered;
  they are all scored and the report counts such examples as `legacyUnfiltered`.
- Keeping an accepted proposal as an example waits on F2: `reviewVersionProposals` still keeps corrected and rejected
  proposals only.
- The permitted report is `tp-model-eval-permitted/2`: the run's `runId` (its job actor, `model_call.actor_id`) and
  `production`; tallies per field and in total, problem codes, the sorted `exampleIds` (row IDs of `eval_example`, not
  PHI), `measured` (the examples the model answered) and `refused`, the examples whose call the gateway refused before
  it was made (an input refused, or the feature or the variant off or not evaluable: `refused:not_evaluated`), counted
  apart from misses; and the same counts per variant (`variants.default`, `variants.ambiguous`, each with the model its
  prompt pins), since the two variants are two models (PR review M3). `permittedRegressions` compares the two reports'
  example ID sets (`examples_changed`) and then each variant on its own (`examples_changed:<variant>`,
  `precision_regressed:<variant>:<field|all>`, `recall_regressed:…`, `wrong_verified_rose:…`,
  `refused_rose:<variant>`, and `earlier_unmeasured:<variant>` when the earlier run did not measure that model), so
  one model's gain never hides the other's regression; it refuses an earlier /1 report (`earlier_report_format`: run
  the earlier side again on the current code). /2 is changed in place: no /2 report was written before this change
  merged.

### Measured

Measured on this pull request's head, on the build machine (CI's `static` job will differ; its limit is 15 minutes):

- `pnpm test:golden`: 4 files, 215 tests, 18.6 s in vitest (19.6 s wall), against 11 to 17 s at 6ddd587 and the
  design's estimate of 25 to 45 s; the builder's check fails above 60 s. The gate's own file is about 19 s of it.
- Calls: 363 local calls for the reference run (63 contracts, 300 narratives); each fault test calls the model only for
  the cases it spoils (one to three calls) and splices them into the reference report, against about 2,000 calls
  before.
- `pnpm --filter @tp/model-gateway eval` (local) passes in about 15 s: 63 documents, tp 2,607, wrong 5, rejected 3,
  every one on an unfaithful scanned case; precision and recall 1 on the faithful cases; 9 conflict pairs all flagged;
  3 twins equal; 300 of 300 narratives clean.
- Committed fixture growth: 0.86 MB for MOD-09's 18 committed cases, and v1's 40 truths rewritten as /2 (their
  documents and recordings byte for byte unchanged); the recorded report under `eval/reports/` is 0.23 MB. The large
  tier, generated and ignored by git, is 4.75 MB, written in about 0.5 s.

### Alternatives considered

| Option | Why not |
| --- | --- |
| One weighted score | It trades a dangerous error (a wrong value marked as checked) against a harmless one (a visible rejection), which is the blindness #84 names |
| A verifier that refuses every value-only field | `method`, `flags` and `rounding` have no written text to check; refusing them all would turn every contract into hand entry. A prompt that writes their phrases (P1) makes them checkable |
| Keep v1 as a second gate set | Comparing across sets is meaningless, so one set holds the bar; v1's cases keep their bytes inside v2 and its old baseline stays readable in history (N2) |
| Commit the large tier | About 6 to 8 MB of PDFs and recordings in every clone and every fixture scan (pre-push, gitleaks, `check:fixtures`), against 1 to 2 s of generation (session ruling 5) |
| Floors chosen by the build | The bar a model must meet is the founder's, set with the contract specialist (F1) |
| `not_in_row` as a measurement only | It turns the most likely silent error into a visible one with no prompt change, and every reference answer passes it; if the founder prefers measurement only, it is one function to remove |

### Notices (decided by the build under the standing rule; the founder can reverse any)

Numbered once across the parts; N4 to N6 are Part 3's (below).

- **N1.** Two pull requests, the gate and serving together (Parts 1 and 2) and the PHI check (Part 3), where the
  design had three (session ruling 1).
- **N2.** v1 is retired as a separate gate set; its 40 cases are v2's small tier with unchanged bytes and truth /2.
- **N3.** The verifier's `not_in_row` rejection, with its known refusals.
- **N8.** No MOD-13: the accepted-example assertion extends MOD-07 when F2 lands.
- **N9.** Decoys keep the real row's modifier set; `scopesOverlap`'s same-set rule is unchanged (P7).
- **N11.** Fault reruns call the model only for the cases they spoil, narrative faults included.
- **N12.** One tally (`src/tally.ts`) for the synthetic and the permitted scorer.
- **N13.** PRD 14's Logging and evaluation paragraph and PRD 18's Model row are amended under the founder's adoption
  of the audit on 2026-10-20; PRD 17's milestone 10 check is unchanged.

### Consequences

- The first real-model baseline needs F1's floors, committed to `eval/floors.json` by a pull request quoting the
  founder's ruling, before the run: until then `--record` refuses a real provider (`floor_unset`).
- A model that reads method, flags, rounding or lesser-of wrong on a faithful case keeps the contract feature off: the
  zero rule cannot be met by the verifier for those fields, only by a model that reads them right. That is the audit's
  intent; P1 makes them checkable.
- The unfaithful cases (V05, V07, V08, V09, V13) are also live product paths: pdf.js reads an OCR layer and hidden text
  as the page. #15's contract-evidence pull request (Lane A, a migration) fixes intake and reuses those cases; once it
  lands, their page text becomes faithful and the zero rule covers them. Until then the gate holds them never-rising
  and never above the local reference.
- A pdf.js or Textract-reader bump that changes the pages as read changes the set, and cannot merge until every
  real-provider entry is re-recorded by the two-step re-baseline.
- The large tier's real-model cost is about 100,000 input tokens per 80-page document, five such documents per variant
  run (the runbook gives the estimate). CI never calls a model.
- PR 16's red team gains the model path's own attacks (reconciliation-001 item 16).

### Revisit when

A prompt version 2 writes the value-only fields' phrases (P1); #15's contract-evidence pull request lands; the founder
rules on F1 or F2; the first real-model baseline shows how often `not_in_row` refuses a right answer (`rejected_right`).

## Part 2 (`co-001/model-eval-gate`): serving each model feature on its own evaluation

### Context

At 6ddd587, `assertEvaluated` (`src/evaluated.ts`), called once in `readGatewayConfig` for a real provider in
production, refused the whole provider unless contract proposals and narratives each had an entry for every pinned
model. It checked presence only, never a score, and parsed entries loosely (`purpose: z.string()`), so a hand-typed
entry for any purpose counted. `suggestEvidenceRequests` and `readDenialLetter` were outside it: once the other two had
entries, they would have been served with no evaluation. And one missing entry turned every feature off at once.

### Decision

**Who decides what is served** (`src/evaluated.ts`). `SERVING_RULES` says which purpose has a synthetic set its
entries are recorded on: `proposeContractTerms` the contract gate, `draftPacketNarrative` the narrative gate,
`suggestEvidenceRequests` and `readDenialLetter` none (`no_set`). `servingDecisions(provider, { baseline, floors,
prices })` decides each purpose and each variant its current prompt pins for the provider (`purpose/variant`, for
example `proposeContractTerms/ambiguous`). A key is not served, with its reasons, when its purpose has no set
(`no_set`); when no entry for that purpose, provider, prompt version and content hash, model and variant parses under
the strict /3 schema (`no_entry`); for contracts, when any field's recall or precision floor is unset (`floor_unset`)
or the entry's counts do not meet it (`below_floor`), computed at run time from `eval/floors.json`, so a floor raised
after recording switches the feature off until it is met; when a model the variant pins has no confirmed price
(`price_unconfirmed`, the per-purpose form of the old all-prompts check); and, for contracts on a real provider, while
the entry's permitted run is `pending` or absent (`permitted_pending`: an entry whose `permitted` was deleted by hand
is not served either). A key is served with no reason, and evaluable when its only reason is `permitted_pending`.
Floors and the permitted run apply to real providers, as the gate's `floor_unset` does. The floors' format and
arithmetic are one module, `src/floors-format.ts`, which the gate's `eval/floors.ts` re-exports, so a key is served on
exactly the floors its record was held to (src reads no file: it runs in the web app's bundle). `assertEvaluated`,
`unevaluatedModels`, `EVALUATED_PURPOSES`, `MissingEvaluation`, `RECORDED_EVALUATIONS`, `RecordedEvaluation` and
`assertPricesConfirmed` are removed from the package and its exports (`src/index.ts`); no other package imported them.

**The gateway decides what it serves; no caller passes a set** (`src/gateway.ts`, `src/purposes.ts`). In production on
a real provider the gateway computes its own served set from the committed baseline, floors and prices bundled with
the package, the same files `readGatewayConfig` reads; a caller that passes nothing, as every caller does, gets exactly
what has passed, and no option widens it. Its only option is `serving: 'evaluable'`, accepted only when the store's
actor is a job whose ID is a UUID and refused otherwise, so a request path cannot ask for the permitted run's wider
set; and a gateway built with it makes the permitted run's own calls only, a contract proposal under
`permittedRequestKey(<the job's ID>, <an example's ID>)`, refusing any other (`serving_invalid`, PR review N1), so the
wider set is held to that run in code rather than by convention. With the local
provider, or any provider outside production (only synthetic material may reach it), every key is served, so tests and
the harness are unchanged. `limited()` checks, in this order: the purpose served (any variant), before the flags are
read; `prepare`; the call's own variant served; and only then `screen`, so no audited read runs for a call that would
be refused. A refused call throws `ModelFeatureOffError('not_evaluated')` ("this model feature has not passed its
evaluation for the configured model; enter the record by hand"): nothing is sent and no `model_call` row is written,
as with the kill switch. `ModelGateway.features()` and the web's `modelFeatures()` both return `offeredPurposes`, one
rule in place of two copies.

**Config** (`src/config.ts`). `GatewayConfig` carries `served`, `evaluable` and `decisions`. For a real provider in
production, `readGatewayConfig` throws `GatewayConfigError` when no key is served, as before, so the web's
`unavailable` path and the worker's exit 2 are unchanged for that case; when some are served it returns them, and the
web's config read logs once `MODEL_FEATURES_NOT_EVALUATED` with the count of keys not served (`record_count`). The
worker's evaluate-permitted task reads the configuration with `{ serving: 'evaluable' }`, so the run that a pending
entry waits on can be made, logs the same code with the count of keys not evaluable, and exits 2 when nothing is.

**The screens.** The web's `ModelPath` carries `served`; a call refused as `not_evaluated` returns the person to the
screen with the notice "This model feature is off until it has been evaluated for the model configured here; enter it
by hand." and the hand-entry form (the existing notices' "enter it by hand", since contract, narrative and checklist
screens share it). The version page's "ambiguous" checkbox stays; an ambiguous request whose variant is
not served shows that notice (N10).

**The permitted run before a model change is served** (F5 (a), session ruling 9). `--record` for a real provider writes
the contract entry with `permitted: 'pending'`, so the deploy carrying it serves nothing new: the key is evaluable
only. A person runs `evaluate-permitted --against <earlier report>` in production, whose gateway is built with
`serving: 'evaluable'` because its actor is the permitted job, and gets report /2 (the task refuses, exit 2 before
any call, a real provider configured outside production, and an `--against` file that is missing or unreadable). Then
`pnpm --filter @tp/model-gateway eval record-permitted --report <file> --against <file>` refuses, recording nothing,
unless all of these hold (PR review B1, M1, M3, S1, N3, N4):

- the report parses as /2, strictly, and its counts add up (`report_inconsistent` otherwise: an edited report, or one
  spliced from two runs); it was run in production (`production: true`, a zero-example run included); it names the
  entry's provider, prompt version and content hash, and for each variant the model the prompt pins;
- every example's outcome is on an allowlist of what measures the model (`permittedOutcome`): the model answered (no
  problem, or `invalid_output`), or the example's own input kept it from the model and a rerun would again
  (`document_unavailable`, `expected_invalid`, `refused:document_kind`, `refused:no_text`, `refused:too_many_pages`,
  `refused:names_patient`). Any other code, a failed call, `refused:phi_boundary` (a run outside production),
  `refused:kill_switch`, `refused:feature_off`, `refused:not_evaluated`, `refused:screen_unavailable`, a budget or busy
  refusal, or a code the list does not yet know, refuses the run; and a run with examples none of which reached the
  model is refused. Otherwise a first run, compared with nothing, could serve a model it never called;
- `--against` is required whenever anything of the provider was ever served. The baseline keeps a served history
  (`served.<provider>.<variant>`: the prompt version and content hash, the model, and the permitted record) that
  production never reads and that outlives the entries, which a prompt or model change deletes and `eval --record`
  resets to pending; so a run is compared with nothing only before anything of the provider was served;
- `--against` is tied to what was served: a production run of the same provider, not the report itself nor the same
  run written again (`against_is_report`, `against_same_run`), and for each served variant a run of the served
  prompt version, content hash and model (`against_not_served:<variant>`). It need not be the served report itself:
  the examples grow, and runs are compared on the same examples, so the served side is run again on today's examples;
  the reviewer checks its `runId` against `model_call` in the boundary, and its hash is recorded as `against_sha256`;
- `permittedRegressions`, over each variant served before or recorded now, is empty.

Each covered entry is recorded only from its own variant's examples: a variant with at least one example the model
answered, or every variant when the run has no example at all. A variant with none stays pending, and the command
prints it with its reason (`no_examples`, `nothing_measured`). It writes `permitted: { examples, report_sha256,
against_sha256, recorded_on }` into each recorded entry (its variant's example count) and the same into the served
history, and that commit serves those keys. Before the first practice the run reports no examples, made in
production, and is recorded the same way on every variant; nothing special-cases launch. One consequence is kept on purpose (the
verdict on PR review M3): once a run has examples, a variant with none of its own (the larger model, if no contract
was ever marked ambiguous) is not served again after a prompt or model change, and it gains no example while it is not
served. Serving it on the synthetic gate alone, as the first run does, is the founder's decision, not this gate's.

**Evidence requests and the denial-letter reader** stay off for a real provider in production (`no_set`), their
screens on hand entry, until each has its own set, truth, metric and entry kind (P5, notice N7).

**The founder's paths** (session ruling 10). `.github/CODEOWNERS` names the founder for the switch's data,
`packages/model-gateway/eval/baseline.json`, `eval/floors.json`, `eval/reports/` and `config/models.json` (the
confirmed prices), and for the code that judges it: `src/evaluated.ts`, which decides serving, `src/baseline-format.ts`
and `src/floors-format.ts`, which parse the baseline and the floors, and `eval/baseline.ts` and `eval/floors.ts`, which
record or refuse an entry. A pull request could otherwise leave the data alone and serve a feature by changing its
judge, the rule CODEOWNERS already applies to the schema gate's code. `tools/test/codeowners.test.ts` holds those lines.

### Alternatives considered

| Option | Why not |
| --- | --- |
| Keep refusing the whole provider | One missing or failing entry turns every feature off, and a purpose with no set rides on the others' entries |
| A served set passed by each caller | Every caller at 6ddd587 builds the gateway with no such input, so a default of everything would serve everything; the gateway computing its own set leaves no caller able to widen it (the design review's B1) |
| A per-purpose operator flag in `feature_flag` | A migration (its key CHECK); the kill switch covers emergencies and this part covers evaluation (P4) |
| The permitted run as a runbook step only (F5 (b)) | A real-document regression would be caught only if a person ran it |

### Notices

- **N7.** Sets for evidence requests and the denial-letter reader are a follow-up (P5); both stay off in production.
- **N10.** The larger "ambiguous" model is served or off on its own; an ambiguous request it cannot serve shows the
  `not_evaluated` notice.

### Consequences

- With the committed baseline (local entries only), production on a real provider serves nothing and
  `readGatewayConfig` throws, as at 6ddd587; a production gateway built with no serving option refuses all four
  purposes with `not_evaluated`. Serving the contract feature then takes F1's floors, a recorded real-provider entry
  whose report is committed, a confirmed price, and the permitted run's record.
- PRD 14's kill switch still turns every model feature off; a feature without its own passing evaluation is off on its
  own (PRD 14, Operational limits, amended).
- `eval/baseline.json`, `eval/floors.json` and `eval/reports/` are a production switch, reviewed by the founder by path.

### Revisit when

Evidence requests or the letter reader get a set (P5); an operator needs to switch one purpose off without a deploy
(P4); F5 is reversed.

## Part 3 (`co-001/contract-phi-check`): checking a contract against the practice's records before the model

### Context

Combined audit #120 found that a contract proposal can send a patient's details to the model. PRD 14 says contracts
carry no PHI, and the gateway sends a contract's pages as stored. At 88a0e4e9 two checks stood between a payer letter
and the terms reader (ADR 0054): the specialist's proposal and `contractTermsSpec.prepare` refused any document whose
stored kind is not `contract` or `exhibit` (`document_kind`). Both trust the kind the person chose at upload, and:

- the contracts and reconciliation upload panels preselected their first kind, so a payer letter or an EOB dropped on
  them was filed as a contract unless the person changed it;
- every entry of a zip takes the zip's kind, so an EOB inside a zip filed as a contract is a contract;
- a document's kind cannot be corrected after upload (`source_document.kind` is immutable, and a re-upload of the same
  bytes is a held duplicate), so a misfiled letter stays a "contract";
- nothing looked at the pages. The letter reader has a screen against the practice's records
  (`otherPatientRecords`, ADR 0054), but it is read in its caller's scope, runs in a worker job, and the contract path
  had none.

A contract specialist holds no `phi.read` (`packages/db/src/authz/permissions.ts`), so the records cannot be read in
the person's request scope, and decrypting and auditing every identifier a practice holds in the specialist's name
would say they read every patient. The stored payer claim number hash is over the raw CLP07, so a page that writes it
with other separators misses (notice N5). The best form of the check, a keyed compact-form lookup hash per identifier
and a `SECURITY DEFINER` function that audits one screen event and the matched rows only, is a schema change (F3,
Lane A's). This part is the bounded, fail-closed interim until it lands (session ruling 8).

### Decision

**The check** (`packages/model-gateway/src/patient-records.ts`). Before a contract's or exhibit's pages are sent, the
gateway asks the practice's own records whether any run of the pages is a member ID, a payer claim control number or
a patient control number the practice holds. On a yes the call is refused (`names_patient`), never sent. The check
answers one of four codes (`clear`, `names_patient`, `screen_unavailable`, `screen_failed`) and nothing else: never
which identifier matched, its kind, its row or how many. The decrypted values live in one `Set` inside the check and
go with it.

**Where it runs, and why no caller can skip it.**

- `ContractPagesInput.patientRecords: PatientRecordsCheck` is required, so no caller's code compiles without a check:
  the web's proposal, the worker's permitted run and the evaluation harness all pass one. The document alone
  (`ContractPages`) is what the verifier, the set and `requestFor` / `registerOutput` take; only
  `proposeContractTerms` requires the check.
- **The issued-check registry.** A check is accepted only when one of the module's two factories,
  `practiceRecordsCheck` and `syntheticRecordsCheck`, issued it: membership of a module-private `WeakSet`
  (`issuedCheck`), which code elsewhere can neither add to nor forge through anything it passes the gateway. Both
  factories go through one helper, `issue()`, which freezes the check before adding it, so an issued check's
  `practiceId` cannot be changed after it is issued and a copy is not issued. `lint.test.ts` holds that `issued.add(`
  appears once in the repository, inside `issue()`, and that no other source outside a test defines `namesPatient`.
- **The specs, the gateway and the call's context are fixed** (the review's F6 and S4). A purpose's spec decides
  whether its screen runs (the gateway calls `spec.screen`), so two layers stop the contract screen from being removed
  or replaced:
  - at run time, each spec is frozen where it is defined (`src/functions/*`), so a module loaded before the registry
    cannot change it either, and again with the map when `src/specs.ts` loads; `ModelGateway.prototype` and each
    gateway instance are frozen (`src/gateway.ts`), so the gateway's own step that runs the screen cannot be replaced
    or shadowed; assigning or deleting any of them throws a `TypeError`;
  - at compile time, `PurposeSpec`'s `prepare`, `screen` and `verify` are readonly properties (`src/spec.ts`), so the
    same assignment or delete does not compile.
  - `PURPOSE_SPECS` is no longer exported from the package's entry: `requestFor` and the gateway's methods are the
    surface.
  - The gateway reads the caller's context once and freezes its copy (`callContext`), so neither a getter nor the
    caller's own step before the screen (below) can make the screen hold its check to another practice than the one
    the budget, the hold and the `model_call` row are for. The fix round's integration review found that gap, opened
    by that step: a step that changed the context's practice had the screen accept a check issued for a practice
    holding none of the document's identifiers, and the call was sent.
  - `specs.test.ts` and `gateway.test.ts` hold all of this.
- **The practice match.** `contractTermsSpec.screen(input, prepared, context)` (`screenContractPages`) refuses a check
  that was not issued, or whose `practiceId` is not the call's (`screen_invalid`: "a contract is sent only with the
  practice records check the gateway issues"). A synthetic check has `practiceId` null and is therefore accepted only on
  a synthetic evaluation call, which carries no practice's material; a practice check is accepted only on its own
  practice's call. The purpose's `screen` now takes the call's context (`spec.ts`) so that it can make this match.
- **What is screened is what would leave.** The screen reads the prepared request's own text (`prepared.user`, the
  pages as `prepare` framed them), not the input's pages a second time, so an input whose pages read differently each
  time they are asked for (a getter or a proxy) cannot pass the screen clean and then frame a page that names a
  patient. The frame adds no run the screen could take for an identifier: each page sits between lines of its own (a
  newline ends a run), the frame's words hold no digit, which every kept identifier does, and its page numbers and
  count stand alone, below every floor.
- **Test helpers stay in tests.** `src/testing.ts` issues real practice checks over an in-memory practice
  (`memoryPracticeRecords`, `syntheticPracticeCheck`), which the screen accepts for that practice and which read none
  of its records. `lint.test.ts` holds that only test code reaches it:
  - Test code is tests, their support files, the generated route tests, the e2e and the synthetic evaluation (`eval/`,
    whose calls carry no practice's material). A `test-support/` or `route-tests/` directory counts only outside the
    web's route tree (`apps/web/src/app/`), where Next serves a page or a route by its path though nothing imports it.
  - The guard follows every static import, re-export (`export … from`), side-effect import, dynamic import and
    `require`, in any quotes (a template literal without a substitution too). It resolves relative paths, and
    workspace packages through their `exports`, and follows the chain transitively, so a production module that
    imports a support module that re-exports `testing.ts` is refused.
  - A specifier computed at run time is not followed; no source outside `tools/test` uses one.
  - `syntheticRecordsCheck` is no longer exported from the package's main entry. Tests and the evaluation outside the
    package take it from `@tp/model-gateway/testing`, and `lint.test.ts` holds its callers to `testing.ts`, `eval/`
    and tests.
- **Bound to the caller's scope** (design review M7). `practiceRecordsCheck({ authorizedBy, pool, cipher, practiceId,
  screenId, requestId })` throws at construction, before anything is read, unless the practice ID is a UUID, the
  caller's scope reaches it (`authorizedBy.access(practiceId)` is defined and the practice is in
  `authorizedBy.practiceIds`), the cipher is that practice's (`cipher.practiceId`), the screen ID is a UUID, and the
  request ID with the screen's suffix fits the audit column's pattern (`^[A-Za-z0-9._:-]{1,128}$`). The caller's scope
  is proof of access only and is never read through. The check takes no runner: it opens its own job scope on the pool
  for exactly that practice (`withJobScope(pool, { jobId: screenId, practiceId }, …)`) and asserts, before reading,
  that the opened scope's practices are `[practiceId]` and its actor is the service screen ID (defensive:
  `withJobScope` builds exactly that scope today, and `patient-records.test.ts` reaches each condition through a
  tampered job scope).
  - A runner scoped to another practice cannot be supplied.
  - The scope and the pool are taken by their shape, because `packages/db` brands neither, so the check cannot tell a
    stub pool that returns nothing from a real one (`testing.ts`'s memory pool is such a pool). No production caller
    supplies one: `lint.test.ts` holds every naming of `practiceRecordsCheck` outside a test to the web's proposal
    (`apps/web/src/lib/models/contract-proposals.ts`, its one call pinned to `authorizedBy: scope, pool:
    services.modelPool`), the worker's permitted run (`apps/worker/src/models/permitted.ts`, pinned to `authorizedBy:
    scope, pool: services.pool`), `src/testing.ts`, and the definition and the entry (`patient-records.ts`,
    `index.ts`).
  - An unforgeable scope brand (issued by `packages/db/src/authz/scope.ts`) and a pool brand (issued where the
    services build their pools, `apps/web/src/lib/server/services.ts`, a #42 file) would let the check refuse a stub
    itself. Neither needs a migration (P12).
- **The gateway's order** (design review m3; the review's S1). `limited()` checks, in order: the purpose served; the
  kill switch and a purpose's flag; the PHI boundary; `prepare` (the kind check and the framing as data); the call's
  own variant served; a completed call under the idempotency key (`DuplicateModelCallError`); a read of the day's
  logged spend against the budget (`ModelBudgetExceededError`, logged `MODEL_BUDGET_EXCEEDED`); the caller's step
  before the screen (`CallContext.beforeScreen`), when the purpose screens; and only then the screen; after it, the
  budget's hold and the call. Every refusal the gateway can make without the screen comes first, so no audited read of
  a practice's records runs for a call the gateway refuses anyway, and the screen is the last step that can refuse a
  call before it is made. A refused call writes no `model_call` row, holds no budget and sends nothing. The budget's
  read counts no call in flight (`spentSince`), so it never refuses a call the hold would make; the hold, which adds
  the calls in flight under the practice's lock, still decides the rest. (Before this round the screen ran before the
  idempotency key and the budget, and the text here said "no audited read runs for a call that would be refused
  anyway": that was false for a replay and a spent budget, before each of which the security review measured a full
  screen.)
- **When a screen may run** (the review's S1).
  - **The caller's step before the screen.** `CallContext.beforeScreen?: () => Promise<void>` runs once the gateway
    has refused everything it can without the screen, and only when the purpose has a screen. A throw refuses the call
    with the caller's own error: nothing is screened, held or sent, and the gateway logs nothing of it. It cannot
    skip, change or answer the screen, which runs after it on the prepared request and on the context the gateway read
    once (above). The web's proposal uses it for the screen's limits and the person's event (below); the worker passes
    none.
  - **The screen's limits** (`apps/web/src/lib/models/contract-proposals.ts`, `SCREEN_LIMITS`). Until F3 each screen
    reads, decrypts and audits every identifier the practice holds (up to 50,000 `audit_event` rows, which no role can
    remove), so the web counts screens in Postgres with `rate_limit_take`: fixed windows every web task shares, with
    no migration (`rate_limit_counter.bucket` accepts any name of its pattern). The limits are 20 an hour and 60 a day
    per practice, and 20 an hour and 100 a day per person (buckets `model_screen` and `model_screen_day`, since the
    function keeps one window per bucket and subject; each subject an HMAC of the practice's or the user's ID under
    the server's key, in `rate-limit.ts`'s form). They are taken in the step before the screen, on the gateway's own
    pool (never the request's: ADR 0055), each its own transaction, the first one reached stopping the count. A screen
    past any limit is not run: the person sees the `screen_limited` notice, the operator one line,
    `MODEL_SCREEN_LIMITED` with `practice_id`, and nothing is read, sent or recorded but the route's own
    `model_proposal_requested` event. A click the gateway refuses anyway (the kill switch, a spent budget, a variant
    not served) and a remembered document (below) count against no limit. The limits sit far above a specialist's day:
    a version's terms are proposed once (a proposal that records anything moves the version out of draft).
  - The route's own bucket for the clicks (`rate-limit.ts` is a #42 file) is proposed for after #42 (P10). The
    security review's `model_screen` route bucket was not taken for the same reason, and because a route bucket counts
    clicks the gateway refuses anyway and only per person and address, while these count only screens about to read
    and also cap a practice across its people.
  - **A document found naming a patient is remembered.** Each web server remembers for an hour that a document of a
    practice held one of its identifiers (a `names_patient` refusal), under the practice, the document and a SHA-256
    of the pages screened. A click on it again within the hour is refused as `names_patient` at once, unscreened
    (nothing read, decrypted or audited again) and uncounted by the limits. Only the refusal is held: nothing of the
    match (not which identifier, its kind, its row or how many), no identifier and no page text. It can go stale only
    toward refusing (the practice's records no longer hold the patient), never toward sending, so it needs no version
    of the practice's records. A `clear` is never remembered: records loaded meanwhile could make the same pages name
    a patient, and no record version exists to tell (one would be a migration). At most 1,000 documents per server,
    oldest out first.

**The algorithm.** The rules are on the stored side; the page side has none (design review M12).

- **Records** (`readContractScreenRecords`, in the check's own job scope after the bound's count, then
  `decryptContractScreenRecords` once that scope has committed). The reads use `readWithAudit`, return the rows as
  stored (ciphertext) and are audited in the scope:
  - `patient_ref (id, practice_id, member_id)` where the practice matches and the member ID is set;
  - `claim (id, practice_id, patient_control_number, payer_claim_control_number)` for the practice;
  - `posting_row (id, practice_id, claim_reference)` for the practice's posting lines whose claim reference is set and
    that no claim-level posting match covers (`POSTED_ONLY`: no `ledger_match` of kind `posting` and level `claim` for
    the row, standing or reversed).
  - Only after the scope commits is each value decrypted (`patient_ref.member_id`, `claim.patient_control_number`,
    `claim.payer_claim_control_number`, `posting_row.claim_reference`) and taken in its compact form
    (`compactIdentifier`: NFKC, upper case, letters and digits only). A posting line's claim reference is kept as a
    patient control number (floor 8).
  - Why claim-matched lines are left out: a line with a claim-level match was matched by its reference's exact
    equality to that claim's own patient control number, for the reconcile job and a person's match alike
    (`apps/worker/src/reconcile/postings.ts` `claimsWithReference`, which `manual.ts` uses too), and the claim cannot
    be deleted while the match exists, so its number is read from `claim`. Leaving those lines out keeps a line-level
    export, one row per service line, from spending the bound on numbers already read.
  - What the posting read finds: the claim of a paper check (workers' compensation, auto, small commercial payers), or
    of a posting period whose 835s were never loaded, such as a year of history at onboarding. That number is held
    nowhere else.
  - No claim is left out for its age (a cap is a silent gap); ERA-export claims are claims and are covered. Group
    numbers are not read: a contract carries them legitimately. The letter screen's read pattern, written anew:
    `letter-records.ts` is not moved (notice N6).
- **Stored-side floors and rules** (`SCREEN_FLOORS` and `screenIdentifier`, `src/redact.ts`; session ruling 4). A
  value is kept only when its compact form is at least 6 characters for a member ID or a payer claim number and at
  least 8 for a patient control number, holds a decimal digit, and is not eight digits that are a calendar date
  written YYYYMMDD or MMDDYYYY with a year from 1900 to 2099 (`isCompactCalendarDate`). A shorter value, or one of
  letters only, is too likely to be an ordinary figure or word of a contract (a five-digit patient control number
  equal to a CPT code, a letter-only one equal to "AGREEMENT"); a date-shaped one would refuse every contract dated
  that day, because the tokenizer joins "2026-01-01" into `20260101`.
- **The tokenizer** (`someIdentifierRun`, `src/redact.ts`; `identifierRuns` lists the same runs for tests). The page
  text is read one line at a time, and a run never crosses a line break. Each line is NFKC-normalized, so a no-break,
  thin or full-width space becomes a space and a full-width digit becomes a digit. A token is a maximal run of letters
  and digits (`[\p{L}\p{N}]+`). Every other character is a boundary, so "Member ID:ZZ1234567", "Claim#9876543210" and
  "(ZZ1234567)" each hold the identifier as a token.
  - A run extends from a token over the following tokens while each gap between them joins. First the gap's invisible
    characters are taken out: format characters and default-ignorable code points, such as a soft hyphen, a zero-width
    space or joiner, a word joiner or a byte-order mark. NFKC keeps these characters, and `compactIdentifier` drops
    them. They still count as token boundaries, so "ID<zero-width space>ZZ1234567" holds the token ZZ1234567.
  - What is left joins two tokens when it is nothing; one space; one hyphen, dash or minus sign (U+2212), with at most
    one space on either side; one dot, slash, underscore or asterisk, with no space beside it (`^(?:[ ]|[
    ]?[\p{Pd}\u2212][ ]?|[./_*])?$`); or a separator the practice's own kept values hold, exactly as they hold it
    (`storedSeparators`). The screen's set carries these separators, punctuation only: "ZZ#7120077" adds `#`, and
    "A12:34" adds `:`. A separator holding a line break, a tab or two spaces is never added.
  - So "ZZ 123 4567", "ZZ-123-4567", "ZZ - 123", "77−1200−0000345", "SYNPCN.12001", "20261234/01" and "SYN_PCN_44551"
    are each one run, and a value the practice stores with any separator is found when a page writes it as stored.
  - These end the run: a newline, a tab, two spaces, two dashes, a dot or slash beside a space ("Agreement. Section",
    "PT / OT"), two separators, or any other character. So the fields of a CSV or a workbook, which the readers join
    with tabs, never join. A PDF's columns on one line do join: pdf.js reads a gap of any width as one space, so set
    v2's C03 reads "97110 59 GP" and yields the run 9711059. The false-refusal measurement reads the pages as read, so
    it counts these joins.
  - Each run's compact concatenation is compared while its length is from the smallest floor (6, `SCREEN_MIN_RUN`) to
    the longest kept identifier, at most 80 characters (`SCREEN_MAX_RUN`: X12 caps CLP01 at 38 and CLP07 at 50).
- **Whole-token match.** The pages name a patient when any run is in the set. The match is exact and on whole tokens:
  "ZZ1234567" is never found inside "AZZ12345678". There is no page-side shape rule (no digit rule, no pattern for a
  date, an NPI, a ZIP or a code), so an NPI, a ZIP+4, a date or a CPT code on a page is refused exactly when it is one
  of the practice's kept identifiers.
- **Streamed, stopping at the first match** (phi-screen F5). The check builds no list of runs. It reads the text as a
  stream and stops at the first run that is one of the practice's identifiers. It holds the current line and, for the
  open run, the last `maxLength + 1` positions' token starts, prefix hashes and characters: bounded by the longest run
  and the longest line, whatever the text's length.
  - The set carries an index of its kept values (`runIndex`: their lengths, first characters and 32-bit polynomial
    hashes, never a whole value). For each token the check does one constant-time test per kept length. It builds a
    run, and looks it up exactly, only when a kept value has that run's length, first character and hash. A hash match
    only costs time; it never decides a match. So the time is linear in the text.
  - Measured on synthetic text (the largest page text intake accepts, 16 MiB, framed as `prepare` frames it, against a
    practice at the bound's 50,000 identifiers), on a 4-CPU machine:

| Text | 9b7eadfe (560 MiB heap) | Now (128 MiB heap) |
| --- | --- | --- |
| 16 MiB of prose | out of memory | 0.73 s |
| 16 MiB tab-separated sheet | out of memory | 0.75 s |
| 16 MiB worst case: one-character tokens, single spaces, one line | out of memory | 1.5 s |
| The same worst case, kept identifiers of every length from 6 to 80 | out of memory | 6.9 to 7.7 s |
| 16 MiB of prose, the identifier on page 1 | out of memory (no early exit) | 12 ms |
| 4 MiB of prose | 0.51 s, 177 MiB of heap after | 0.20 s, 40 MiB |
| 4 MiB worst case | 4.5 s, 406 MiB | 0.38 s, 54 MiB |

The first-character test is what keeps the every-length case at 7 s: without it the same text takes 20 s.
`redact.test.ts` holds the bound: it screens 16 MiB of prose, with the identifier written last, and the worst case,
through `pagesName` in a child process with a 96 MiB old space (about 0.8 s and 1.5 s, the heap going from 42 to about
65 MiB).

**The bound** (session ruling 3). Before reading, the check counts, unaudited, the identifiers it would read: the
practice's member IDs, two per claim and one per posting line the screen reads (above), in one statement, so its three
counts read one snapshot (a count, not PHI). Above `SCREEN_MAX_IDENTIFIERS` = 50,000 it reads nothing and answers
`screen_unavailable`: the call is refused and the person enters the terms by hand. Each read is itself capped at what
the bound leaves of it, plus one row (`LIMIT`): a read that passes the bound answers `screen_unavailable` with nothing
decrypted, and nothing after it is read. So rows that commit between the count and a read (an 835 load, a posting
export) are never read past the bound by more than that one row (two identifiers), and the audit rows, the decrypts
and the plaintext held in one process per check are bounded whatever commits meanwhile. It fails closed: a practice
above the bound is refused, never unchecked. F3 removes the bound. Rulings 3 and 4 were made by the build session on
2026-10-26 at about 01:10 UTC, under the co-founder's standing ruling of 2026-10-26, about 00:20 UTC, relayed by the
orchestrator ("Don't ask for approvals anymore just build and optimize"), each the design's recommended option: for
the bound, 50,000 against 25,000 (half the practices again refused), 200,000 (up to four times the audit rows and
decrypts per click) or holding this part for F3 (no check at all meanwhile, so a misfiled EOB would go to the model).

**Any error fails closed.** An error while reading (the scope, the count, a query) rolls back with nothing decrypted
and answers `screen_failed`. The job scope commits the reads, with their audit rows, before any value is decrypted, so
a value that does not decrypt answers `screen_failed` with every read audited, and a `COMMIT` that fails leaves
nothing decrypted. In every case the call is refused, never sent, and nothing of the error leaves the check (a message
could hold a value). A failed read is not kept, so asking again reads again. A screen that throws anything but its own
refusal is refused and logged as `screen_failed` too.

**Read as the screen, not as the person** (design review M8). The records are read in the check's job scope, whose
actor is the service screen ID (`withJobScope`: actor kind `service`, refused if the ID names a person). Every
returned row is audited, one `audit_event` per row, and no value is decrypted before its read's audit row has
committed; purpose `contract_screen`, request ID `<requestId>:screen:<screenId>` (`screenAuditRequestId`). The web
records one event in the person's own name in the gateway's step before the screen (`CallContext.beforeScreen`), after
every refusal the gateway can make without a screen and after the screen's limits, so the event is written exactly
when a screen is about to read: `contract_screen_requested` on the `source_document`, purpose `contract_screen`, under
the same request ID (`recordContractScreenRequested`, the gateway package's own writer, so the two IDs cannot drift).
So the `audit_event` trail says who caused the screen and joins to its reads by request ID (the practice's access log
cannot show the join yet: What it gives up), without saying the person read every patient. `audit_event.actor_id` has
no foreign key and `action` and `purpose` are open code patterns, so no DDL is needed.

**The callers.**

- **The web** (`apps/web/src/lib/models/contract-proposals.ts`): `proposeTerms` builds the check after the route's
  role check, the kind check, the pages and the gateway's availability (with no model configured nothing is screened
  or audited), from the request's scope as proof only, on the model pool, with `screenId` a fresh UUID; refuses at
  once a document this server found naming a patient within the hour; and passes the gateway the check and a step
  before the screen that takes the screen's limits and then records the person's event in the request's transaction.
  The redirect carries the code only (`?model=names_patient`, `?model=screen_unavailable`, `?model=screen_failed`,
  `?model=screen_limited`).
- **The worker's permitted run** (`apps/worker/src/models/permitted.ts`): one check per practice per run, built at the
  practice's first readable document in the run's job scope for that practice (`authorizedBy`), on the worker's pool,
  with `screenId` the run's ID and request ID `evaluate-permitted:<runId>`; reused for every example of that practice
  in the run, never across practices or runs. Both paths are needed: the worker sends practice contracts again with no
  web code involved. The check reads only when the gateway first screens, so a run whose calls are all refused before
  the screen (the kill switch, a spent budget, a retried job's completed calls) reads none of the practice's records.
- **The harness** (`eval/harness.ts`): every contract call of the synthetic set carries
  `syntheticRecordsCheck(screenTwinIdentifiers())`, the large synthetic practice below, so the eval measures the
  check's false refusals on every run. A refused case scores `refused:names_patient`.

**The refusal** (design review m14).

- The gateway's error is `InputRefusedError('names_patient', 'this document holds an identifier from the practice’s
  patient records and was not sent')`; `screen_unavailable` and `screen_failed` carry "this document could not be
  checked against the practice’s patient records and was not sent". Each is a fixed sentence: no identifier, no kind
  of identifier, no count. (Before this round they read "names a patient of the practice" and "could not be checked
  for patient details": the gateway's sentences now name the records as the notices do.)
- The web maps each code to a notice of its own, before the generic `refused` (`apps/web/src/lib/models/path.ts`):
  `names_patient` to `names_patient`, `screen_unavailable` to `screen_unavailable`, `screen_failed` to
  `screen_failed`. `screen_invalid` reads as `screen_unavailable`: it is the code's mistake, not the document's, so
  the person is never told the input is at fault (the generic `refused` says "The input cannot be sent to a model as
  it is"); the document was not checked, and a second try meets the same mistake. The operator's log still names it
  apart (`MODEL_INPUT_SCREEN_INVALID`). The screen's own limits (`contract-proposals.ts` `SCREEN_LIMITS`) answer
  `screen_limited`. Each gives its case the next step it can take today, and all four name the records one way, "the
  practice's patient records" (`notices.ts`; the PR #75 review's UX-2 and UX-3):
  - `names_patient`: "This document holds an identifier from the practice’s patient records, so it was not sent to the
    model. If it is a payer letter or an explanation of benefits (EOB), it has no terms to enter: choose the version’s
    contract or exhibit as the document to read, or ask the practice for the contract below. If it is a contract or an
    exhibit, enter its terms by hand below."
  - `screen_unavailable`: "This document could not be checked against the practice’s patient records, so it was not
    sent to the model. Enter its terms by hand below."
  - `screen_failed`: "The practice’s patient records could not be read to check this document just now, so it was not
    sent to the model. Try again in a minute, or enter its terms by hand below." The next click reads the records
    again, before any budget hold or model call, so a second try is worth it; the bound's notice does not say so,
    since a practice above the bound meets it again until F3.
  - `screen_limited`: "Documents have been checked against the practice’s patient records as many times as allowed for
    now, so this one was not sent to the model. Try again later, or enter its terms by hand below." ("Later", not "in
    an hour": a day limit resets only within the day.)
- The first leads with the case the check exists for, a misfiled payer letter or EOB, which has no terms to enter and
  cannot be filed again yet (F4): its way on is the version's own contract or exhibit, or the practice's, through the
  "Ask the practice" card on the same page. A contract or an exhibit that holds an identifier (a single-case
  agreement, or a collision on a TIN or a ZIP+4) is entered by hand. "Below" is true of each: the notices show only on
  a draft version, where "Have the model propose the terms", "Enter a rate record" and "Ask the practice" sit under
  them. None promises re-filing. The proposal card stays: a second click on a document this server found naming a
  patient within the hour is refused at once, unscreened; on another server, or later, the check runs again, within
  the screen's limits. The card itself now says that a contract or exhibit is first checked against the practice's
  patient records, and that one holding an identifier from them is not sent (UX N-2).
- The refusal tells the person that the document holds an identifier of one of the practice's patients. That is
  accepted: the person can already open the document in the evidence viewer, so the refusal discloses nothing they
  cannot see, and it names no patient, identifier, kind or count. The notice no longer says the document "names a
  patient", which overstated it: the check reads identifiers, never names, and also refuses a TIN or ZIP+4 equal to a
  stored member ID.
- The permitted run scores the example `refused:names_patient`, counted under `refused` apart from the misses. It is
  on the allowlist of outcomes the example's own input causes (`OUTSIDE_MODEL_PROBLEMS`, `src/permitted.ts`), so it
  does not stop `record-permitted`; `refused:screen_unavailable`, `refused:screen_failed` and `refused:screen_invalid`
  mean the screen did not run, the example was not measured, and the run is refused whole.

**What is recorded.** No `model_call` row (the screen runs before the call). The route's own
`model_proposal_requested` event, as before, on every click. Only for a screen about to read: the person's
`contract_screen_requested` event, then the audited reads, one row per `patient_ref`, `claim` and `posting_row` row
returned, actor the service screen ID, purpose `contract_screen`, at most the bound's number plus one row (above),
kept on `screen_failed` after a read as on any other outcome. A call refused before the screen (busy, a purpose or
variant not served, the kill switch or a flag, the PHI boundary, the input's checks, a completed call, a spent budget,
a screen's limit) and a remembered document record no person's event and no read. That is the rule for every PHI read
until F3, whose function audits one screen event and the matched rows only. Above the bound nothing is read, and only
the person's event is recorded. Nothing of the match is recorded: not which identifier, its kind, its row or how many.

**What is logged** (design review m15). The gateway logs each screen refusal as one line with a fixed sentence,
`practice_id` and an `error_code`, then rethrows: `MODEL_INPUT_NAMES_PATIENT`; `MODEL_INPUT_SCREEN_UNAVAILABLE` (the
bound); `MODEL_INPUT_SCREEN_FAILED` (the check could not read the records, or a screen failed some other way);
`MODEL_INPUT_SCREEN_INVALID`; and, for the letter reader's existing screen, `MODEL_INPUT_MORE_THAN_ONE_PATIENT`, which
was not logged before. A screen's own message is never logged. The web logs `MODEL_SCREEN_LIMITED`, with
`practice_id`, when a screen's limit stops a proposal before its screen; a remembered refusal logs nothing new (its
first refusal was logged), and the route's event records every click. No identifier, kind, count or document text;
`pnpm lint:logs` checks the keys. #120 says the check "logs the code only"; the line also carries `practice_id`, which
CLAUDE.md allows (log IDs) and an operator needs to know which practice is refused. It is null on an evaluation call.
That is a departure from #120's words, recorded here.

**The upload panel** (`apps/web/src/components/uploads/uploader.tsx`; notice N4). A panel that offers more than one
kind starts with none: its select is required and leads with a disabled, selected "Choose the kind of document".

- A drop or a choice of files while no kind is chosen keeps the files in the browser and sends nothing. They are
  listed by name under "Waiting to upload", and the kind select is marked `aria-invalid`, described first by "Choose
  the kind of document for these 3 files, then upload them." (`counted()`; "this file … upload it" for one), then by
  its help, and focused. The words sit under the select as an alert, re-inserted at each attempt, so a second drop of
  the same files is announced too.
- Once the kind is chosen the words go (UX-5) and "Upload 3 files" appears beside "Clear". The files upload only on
  that button, never on the select's change: an arrow key on a closed select changes it once a press (proven in
  Chromium 1.56: three ArrowDowns gave contract, exhibit, payer letter), so starting on the change would file them
  under the first kind the arrow passed, and a kind, once recorded, never changes (F4).
- A file dropped again (the same name, size and last change) is held once; a choice made while files wait joins them
  and waits for Upload; a batch's own problems (an empty or too large file, a spreadsheet for a CSV-only kind, more
  than 100 files waiting) refuse only the files just chosen; a server refusal puts the files back to wait. Focus never
  drops to the page: Upload moves it to "This batch", Clear to "Choose files", a refusal to Upload.
- An ERA export with no system chosen waits the same way, under the system select ("Choose which system’s ERA export
  these 3 files are, then upload them."), which closes the baseline's UX-049 (it found the earlier
  refuse-and-choose-again pattern, the ERA format check's, a defect).
- Every panel that offers kinds says under the select "A document’s kind cannot be changed once it is uploaded."
  (UX-4).
- The contracts and reconciliation pages pass the union of every offered kind's content types, no longer the first
  kind's; each file's declared type is still taken from the chosen kind. The uploads page names its kind
  (`initialKind="x12_835"`): its heading names 835 files, and its other kind, an ERA export, already needs a second,
  explicit choice of format. The server already refused a file without a kind; a test now holds it. A zip's entries
  still take the zip's kind; the screen is what catches an EOB inside a zip filed as a contract. The contracts page's
  upload region is named by its title (`aria-labelledby`, UX N-3).

### What it gives up

Each gap is a document the check sends that names a patient, a document it refuses that does not, a record it leaves
incomplete, or a step a person meets. The security review's S1 to S4 are each fixed or listed here (S1 as "The cost
over time", S2 as "The practice's access log", S3 under "The audit trail", S4 under "The guards' reach"):

- **Not caught:**
  - an identifier wrapped across lines; split by a tab, two or more spaces, two dashes, a dot or slash with a space
    beside it, or two separators together; split by any other character (a comma, a colon, a hash, a plus sign, a
    parenthesis, a combining mark) that none of the practice's own kept values holds; or written with a separator
    other than the practice's own (stored "SYNPCN#12001", written "SYNPCN:12001");
  - an identifier with a prefix or suffix glued on (a person-code or dependent suffix, payer letters, a check digit:
    "ZZ712003401" or "XYZZZ7120034" against a stored "ZZ7120034"), since the match is exact on whole tokens. It arises
    only when the page prints a form neither the 835's patient (QC) nor its insured (IL) segment carried: the loader
    stores both (`apps/worker/src/parse/loader.ts`);
  - leading zeros dropped ("12345678" against a stored "0012345678") and spreadsheet artefacts such as thousands
    separators ("7,712,000,000,345");
  - an identifier that OCR misreads (0 and O, 1, l and I, 5 and S: "ZZ7l20034", "ZZ712OO34"). Deployed intake reads a
    scanned page (a PDF page with no text, or an image) with Textract (`apps/worker/src/intake/wiring.ts`,
    `packages/contracts/src/evidence/pages.ts`), and the text as read is screened and sent, so a misread identifier is
    sent. Text no reader returns is not sent: the call is text only. Without a scan reader (local development) such a
    contract is refused as `no_text`;
  - a patient control number shorter than 8 characters (a five-digit one equal to a CPT code, for instance); a member
    ID or payer claim number shorter than 6; any stored identifier with no digit; a stored 8-digit value that is a
    calendar date as YYYYMMDD or MMDDYYYY;
  - a patient's name, date of birth or address (only the three identifier kinds are read);
  - a patient the practice holds no record of yet (no 835 claim, no `patient_ref` with a member ID, and no posting
    line).
  - The phi-screen review's verifier showed each writing above `clear` against a synthetic check (its
    `verify-f8.test.ts`). A confusable fold or a prefix and suffix match would catch some, at a false-refusal cost not
    yet measured (Revisit when).
- **Refused that names no patient:**
  - a page run equal to one of the practice's kept identifiers that is something else on the page, such as a member ID
    equal to the practice's own TIN or a ZIP+4 (the check cannot tell them from a patient, so it fails closed, and the
    person enters the terms by hand: measured below);
  - a member ID or payer claim number equal to a date written with slashes or dots without leading zeros (1/1/2026 is
    112026, above the member ID floor and no 8-digit date), or to a number written with points (an amount 1234.56 is
    123456): the check joins over a slash and a dot as it does over a hyphen, so these are refused exactly as a
    hyphenated date is (counted below);
  - a stored DDMMYYYY-shaped patient control number on a contract that writes that date day first (the date rule reads
    YYYYMMDD and MMDDYYYY only, so it does not widen what is left out).
- **Refused whole:** until F3, every contract of a practice above 50,000 identifiers (its posting lines with no claim
  match counted), and of one whose rows pass the bound between the count and the read (`screen_unavailable`).
- **The time per click:** the check is linear in the text and bounded in memory (the tokenizer, above). At the largest
  text intake accepts it holds the web's event loop for about 1 to 2 s on a 4-CPU machine, up to about 7 s for a
  practice whose kept identifiers have every length from 6 to 80, and longer on the web task's 0.5 vCPU. A request
  that long cannot be read by a model anyway: a character cap in `contractTermsSpec.prepare`, before the screen, would
  bound it (P11).
- **The cost over time** (security S1, as fixed). Until F3, each screen still reads, decrypts and audits up to 50,000
  identifiers. The screen's limits bound that: at most 20 screens an hour and 60 a day of one practice, and 20 an hour
  and 100 a day caused by one person, so at most 3 million audit rows a practice a day at the bound (typically far
  fewer: one per patient with a member ID, per claim and per unmatched posting line), where the review measured a
  click loop writing 1 to 6 million a minute. A `names_patient` refusal reads and audits the whole practice again only
  when a server has not seen that document refused within the hour: each web task remembers on its own, so N tasks may
  each screen it once an hour. Someone who reaches a limit, a scripted loop above all, keeps that practice's proposals
  from screening, for every specialist, until the window ends: the feature is unavailable there for the window (hand
  entry is not), which is the safer failure. A count that reached a limit still holds the hits taken before it in that
  click. The worker's permitted run has no limit of its own: it screens each practice at most once a run. A click that
  does not screen still writes the route's event and one audited `source_document` read, and reads the pages; the
  generic mutation bucket (120 a minute) bounds that until the route's own bucket (P10).
- **A remembered refusal:** for up to an hour a server refuses a document it found naming a patient without asking the
  records again; were the records to lose that patient meanwhile (a retention purge), the refusal would outlive it by
  that hour. It never sends a document unscreened: a `clear` is never remembered.
- **The audit trail:** the person's event is written in the request's transaction and the screen's reads in their own;
  a request that later fails on a non-model error rolls back the event and leaves the reads without it. The event is
  written in the gateway's step before the screen, so no refusal before the screen leaves it without reads (the
  security review's nit: before this round every refusal before the screen did, not only the kill switch and an
  unserved variant this bullet named). It is still written with no reads after it when the screen itself reads
  nothing: above the bound (`screen_unavailable`, count only) or with a check the gateway did not issue
  (`screen_invalid`, which no production caller can pass). A screen whose decrypt fails keeps every read it made,
  since they commit first (security S3, fixed: before this round a decrypt failure rolled back the audit rows of the
  reads already made). F3's single audited function removes the rest.
- **The practice's access log** (security S2, remaining). `practice_access_log`, through `accessLogPage` in
  `settings.ts`, shows a screen's reads as "a job of the practice" via "system": it returns no request ID, so it
  cannot name the person who caused them, and the worker's permitted run writes reads that look the same with no
  person's event. Its cursor is `at` alone, and every read of one screen shares its transaction's `at`, so the log
  lists only the first page (50) of a screen's reads (up to 50,000) and the next page skips the rest; the record
  filter still finds each read, so "who read claim X" is answered, without the cause. The `audit_event` rows are
  complete. Fixing the report needs a new version of the function (a migration: Lane A's, with F3 or beside it) and
  the route change after #42 (P10); `models-routes.db.test.ts` pins today's behaviour and flips then. The person's
  `grant_id` is not put on the reads: the support ticket's trail would then say the person read every patient (M8).
- **Authorization:** until F3 the screen's read is authorized in the web handler only: the route's role check
  (`rate_record.edit`) and `practiceRecordsCheck`'s construction check of the caller's scope decide that a person may
  cause it (the worker's permitted run: its job's scope). Postgres checks the screen's own job scope (one practice,
  row-level security), not the person, who holds no `phi.read`; the reads are the service screen's. F3's `SECURITY
  DEFINER` function would check the person in Postgres as well.
- **The guards' reach** (security S4 and phi-screen F6, as fixed; N2). The guarantees hold against what a caller
  passes the gateway, and against code that compiles and passes the lint. They do not hold against code in the
  gateway's process that deliberately rewrites a built-in (`WeakSet.prototype.has`, `Set.prototype.has`,
  `Object.freeze` before the gateway loads): such code can skip the screen, as it could call a provider directly. No
  module can stop that; code review and the lint rules that keep model calls in the gateway cover it. The check does
  not refuse a stub pool itself; `lint.test.ts` holds its callers (above).
- **The trace of a failure:** a load error is logged only as `MODEL_INPUT_SCREEN_FAILED`; the check has no logger, and
  which step failed (the scope, a query or a decrypt) is not recorded.
- **What a person meets:** a misfiled document cannot be filed again until F4: it stays a contract in its version, and
  the notice can only point to the version's contract or the practice's. The notice says "this document" without
  naming which: the redirect carries only the code, so on a version that holds two contract-kind documents (MOD-12's
  zip of a contract and an EOB) the person tells them apart by the "Document to read" select, which goes back to the
  first. Files waiting for a kind live only in the browser tab: a reload or leaving the page loses them (nothing was
  sent, and the page says what waits). A batch's problems still name a file by its place ("File 2 is empty."), the
  baseline's UX-181 (UX PR 47). (The review's UX-1, UX-3, UX-4 and UX-5, which UX-6 asked to list, are fixed in this
  pull request, so they are not listed.)

### Measured: the false refusals

On the twin practice `screenTwinIdentifiers()` (`packages/synth/src/screen/patient-twins.ts`, seeded, invented values
only): 80,000 member IDs (a third `ZZ` and 7 digits; a third 9 digits in an area 9NN with group 00, which no Social
Security number has, since neither the area nor the group is ever issued, and no ITIN or ATIN has, since their groups
are 50 to 65, 70 to 88 and 90 to 99; and a third 11 letters and digits holding a B, L, S or Z, letters no Medicare
Beneficiary Identifier holds: phi-screen N3, and `patient-twins.test.ts` checks each shape), 201,000 patient control
numbers (200,000 sequential 8-digit ones from `10000001`, and 1,000 five-digit ones below the floor, `97110`, `97112`
and `97530` among them) and 200,000 13-digit payer claim numbers starting `77`. Over set v2's 63 documents, the
80-page ones with their NPIs, TINs, ZIP+4s, phone numbers and dates included, the check refuses **none at the ruled
floors (6/6/8), none at 6/6/6 and none at 6/6/10** (`eval/gate.golden.test.ts`).

Without the stored-side rules it refuses 3 (V03, L02, L04; none at 9b7eadfe). Those are its sequential patient control
numbers that are dates (10012026 is 10/01/2026), meeting a slash date the tokenizer now joins. The 8-digit date rule
is what keeps the twin at zero. The same twin written with separators inside its values (each value with one of `. / _
* # : + ,` in turn: the practice's joins are `# : + ,`) refuses none at 6/6/8, 6/6/6 or 6/6/10 either, and the same 3
without the rules. Each of its values written on a page as stored is refused.

Adversarial collision twins, built from set v2's own pages (`screenCollisionIdentifiers`; documents of the 63 a
practice holding them would have refused, pinned by the same test):

| Class | Identifiers | With the stored-side rules | Without them |
| --- | --- | --- | --- |
| date: hyphenated dates as the tokenizer joins them, stored as patient control numbers | 219 | 0 | 7 |
| word: letter-only words of 8 or more letters, stored as patient control numbers | 79 | 0 | 63 |
| tin: 9-digit member IDs equal to the set's TINs | 513 | 10 | 10 |
| zip4: 9-digit member IDs equal to the set's ZIP+4s | 500 | 10 | 10 |
| slashDate: dates written with slashes or dots, as joined, stored as patient control numbers | 267 | 0 | 9 |
| dateMemberId: every date of date and slashDate, stored as member IDs | 486 | 17 | 24 |
| decimal: numbers written with points (1234.56, 4.2.1), as joined, stored as member IDs | 1,453 | 0 | 0 |

The stored-side rules bring the date, slashDate and word classes to zero: patient control numbers' floor is 8, and an
8-digit date is dropped. TIN and ZIP+4 collisions stay refused, by design, and are counted. So do member IDs equal to
a short date: 1/1/2026 joins to 112026, which is above the member ID floor of 6 and is no 8-digit date. At 9b7eadfe
the dateMemberId class refused 0 with the rules and 7 without; every one of its refusals now comes from the slash
join. No number set v2 writes with points is 6 digits long (its amounts are under 1,000.00), so the decimal class
keeps none, with the rules or without; a contract that writes 1234.56 is refused only for a practice that holds 123456
as a member ID or payer claim number. On the ordinary twin practice all of these are zero, so the design stands.

The slash join's cost, and why it is kept: the join over a dot, an underscore and an asterisk costs nothing measured,
and a tokenizer without the slash join gives exactly 9b7eadfe's figures on every class. The slash join costs the
dateMemberId class 17 of 63 documents, and the twin 3 without the rules. It is kept because it fails closed and finds
what nothing else can: a clearinghouse that strips punctuation from a claim's patient control number stores "1234501",
while the practice's own documents print "12345/01", and the practice's own separators cannot find that writing, since
the stored value holds none. At 9b7eadfe set v2's distinct digit-only runs (8-digit dates left out) were 16 of 6
digits and 1,046 of 7; now they are 96 and 1,206, so a practice whose member IDs or payer claim numbers are 6 or 7
digits sees that many more chances of a collision. Extending the date rule to unpadded short dates is the founder's
option (Open matters).

### Where the build departs from the design

Each is recorded with its reason; the founder can reverse any.

1. **The join between tokens.** The design's code sketch (its Appendix A.3) also joined two spaces with no dash, which
   its own algorithm rules out (two spaces are a column gap). Its algorithm (section 5.3) ended a run at any other
   character. The build follows the algorithm on two spaces, tested with "ZZ  1234567". It departs on three joins
   (phi-screen F1 and F2): one dot, slash, underscore or asterisk with no space beside it joins on every page; every
   separator the practice's own kept values hold joins on its pages, exactly as held; and invisible format characters
   are taken out of a gap before it is judged, and a minus sign joins as a dash. Before, a stored identifier written
   on the page exactly as stored was missed when it held one of those separators ("SYNPCN.12001", "20261234/01",
   "E7712000.345"), and so was one split by a zero-width space or a soft hyphen, or grouped with minus signs, which a
   CSV or xlsx exhibit carries through to the screen. The cost is measured above. A join over a dot or slash with a
   space beside it was measured and refused: it adds 77,754 distinct runs over set v2's prose ("ARTICLE1PARTIES ...").
2. **The date rule's years.** YYYYMMDD and MMDDYYYY, with years 1900 to 2099; the design gave no range. DDMMYYYY is
   not dropped, so a stored 13012026 is still looked for: a gap the rule does not widen, tested.
3. **The log codes.** `screen_failed` is logged as `MODEL_INPUT_SCREEN_FAILED` apart from the bound's
   `MODEL_INPUT_SCREEN_UNAVAILABLE`, where the design used one code for both, so an operator can tell the bound from a
   failure; `screen_invalid` is logged too (`MODEL_INPUT_SCREEN_INVALID`), and any other error a screen throws as
   `MODEL_INPUT_SCREEN_FAILED`. The person sees a notice for each: the bound's says to enter the terms by hand, a
   failed read's to try again (the next click reads again) or enter them by hand, where the design (5.4) gave both the
   bound's words (the PR #75 review's UX-3); a check the gateway did not issue reads as the bound's.
4. **Log messages are literals** in a switch, because `pnpm lint:logs` requires fixed text.
5. **An issued check is frozen**, through the one helper `issue()`, so its practice cannot be changed in-process after
   it is issued; the design's object was mutable.
6. **More construction checks:** the cipher must be the practice's; the practice must be in
   `authorizedBy.practiceIds` as well as in `access()`; the audit request ID must fit the column's pattern; the opened
   job scope's actor must be the screen ID, as well as its practice.
7. **`syntheticRecordsCheck(identifiers)` takes no floors**, where the design passed `SCREEN_FLOORS`: an issued check
   always uses the ruled floors and rules. Other floors exist only for the measurement, through `screenSet(…, rules)`
   and `pagesName`, which issue nothing.
8. **The twins' identifier shapes.** The 9-digit member IDs are `9NN00NNNN` (area 9NN and group 00, neither ever
   issued, so no Social Security number has the shape, and no ITIN or ATIN, whose groups are 50 to 65, 70 to 88 and 90
   to 99), the 11-character ones hold a B, L, S or Z, which no Medicare Beneficiary Identifier holds, and the payer
   claim numbers start `77`: invented and never real-shaped (phi-screen N3; `patient-twins.test.ts`), and the ordinary
   twin's TIN and ZIP+4 collisions are zero by construction. Before the review the build's 9 plus 8 digits held 12,079
   ITIN- or ATIN-shaped IDs, and two of its 11-character IDs were MBI-shaped. Area 000 was measured and rejected (set
   v2's synthetic TINs are 00-NNNNNNN, so it held 5 of them and refused 3 documents), and so was group 93, the ATIN
   group.
9. **The document and the check are two types** (`ContractPages`, and `ContractPagesInput` adding `patientRecords`;
   `RequestInputs` for `requestFor` and `registerOutput`), so only a call that sends a contract needs a check.
10. **MOD-12's database tests seed the practice's records** through `src/test-support/screen-world.ts` from
    `MOD12_PRACTICE`, the constant MOD-12's 835 is built from, rather than loading the 835: the loader is the
    worker's, which the gateway package cannot import.
11. **The gateway's order test** (Part 2's, which stubbed a contract screen) now runs the real screen and counts the
    connections it takes: none for an unserved variant, one for a served one.
12. **MOD-12's practice holds five claims**: the four besides the misfiled EOB's have patient control numbers the check
    leaves out (`97110` and `97530`, CPT codes; `20260101`, a date; `SCHEDULE`, a word), and the fee-schedule twin
    writes every code of the set, two synthetic NPIs, a TIN, two ZIP+4s, a phone number and dates in every form.
13. **`recordContractScreenRequested` and `screenAuditRequestId`** are the gateway package's, where the design had the
    web write the event inline: one writer for the joined request ID.
14. **The web builds the check only when a gateway exists**: with no model configured nothing is screened or audited.
15. **The worker builds the check at the practice's first readable document**, not up front, so a practice whose
    examples are all unreadable is not read; still one per practice per run.
16. **No change to the permitted allowlist or the gate.** `refused:names_patient` was already among the outcomes the
    example's input causes (Part 2), and the other screen codes already fall to unmeasured.
17. **The upload panel's `initialKind` is a kind's key** (a string), resolved against the offered kinds; a key that is
    not offered gives no kind, so the panel fails toward asking. The placeholder appears only on a panel that started
    with no kind, so the uploads page shows no dead option. No `accept` attribute is added: 835s often carry `.835` or
    `.txt` names with no MIME type, and it would hide valid files. What files do before the kind is unit-tested
    through the pure `afterChoosing`, `waitingFor`, `waitingText` and `heldWith`, and the static markup of `KindField`
    and `HeldFiles` (apps/web has no DOM test environment), and in the browser by the contracts e2e (held, marked,
    focused, announced again, cleared, and uploaded on Upload with one request).
18. **The screen reads `prepared.user`**, where the design's step 3 passed `input.pages`: the text the call would send
    is what is checked, so pages that read clean only when the screen asks for them are refused (`gateway.test.ts`).
19. **`src/testing.ts` is kept to tests** by a `lint.test.ts` case the design did not have, because the in-memory
    checks it issues are issued checks the screen accepts.

The fix round of the pull request's review (2026-10-27) adds these:

20. **The tokenizer streams** (phi-screen F5). The design's code sketch (Appendix A.3) returned an array of every run.
    Over the largest page text intake accepts, that array exhausted the web task's 560 MiB heap; a V8 out-of-memory
    abort fails every request in flight on that task, and a retry crashes the other task too. The build streams the
    text and stops at the first match (Decision, above).
21. **The posting export's unmatched claim references are read** (phi-screen F7). The design (5.3) said every posted
    claim's patient control number is already in `claim`. That is false for a paper check's claim and for a posting
    period whose 835s were never loaded: `posting_row` has no foreign key to `claim`, `postingDecision` answers
    `unmatched` for them, and `patient_ref` is written only from 835s. The build reads every line with a reference and
    no claim-level match.
22. **Each read is capped at the bound** (phi-screen F4), besides the design's count. The count and the reads run at
    READ COMMITTED in different statements, so rows committed between them would be read past the bound. The cap holds
    whatever the isolation level and needs no `packages/db` change. REPEATABLE READ (a `withJobScope` `oneSnapshot`)
    would make the count and the reads agree, but it is not needed for the bound, and under one snapshot an identifier
    committed after the count is unseen (a page naming the late claim reads `clear`), where under the cap it is read
    while the practice stays under the bound. A length check after the read alone would not bound the audit rows,
    which are written by then.
23. **The reads commit before any decrypt** (phi-screen F3, security S3): two functions, `readContractScreenRecords`
    and `decryptContractScreenRecords`, where the design decrypted inside the scope.
24. **The specs and the gateway are frozen, the call's context is read once, and `PURPOSE_SPECS` and
    `syntheticRecordsCheck` are off the package's main entry** (phi-screen F6, security S4, N2; the context, the fix
    round's integration review). The design's specs, gateway and context were plain objects.
25. **`lint.test.ts` holds the factories' callers and the testing module's whole reach** (N2, the security review's
    nits). This extends departure 19.
26. **The screen runs last of the gateway's refusals**, where the design (5.2, m3) put it before the idempotency key
    and the budget: a replay and a spent budget are now refused unscreened (security S1). The design's reasoning (no
    budget is held and no row written for a refused call) still holds: the two checks before it are reads, and the
    hold stays after the screen.
27. **The person's event is written in the gateway's step before the screen** (`CallContext.beforeScreen`), not before
    the gateway is called (the design's 5.2), so it is written only for a screen about to read.
28. **The screen has limits, and a found `names_patient` is remembered for an hour per server** (security S1); the
    design had neither. Both are code only; the limits use the existing `rate_limit_take`.
29. **Files chosen before the kind wait for Upload** (`uploader.tsx`; UX-1), where the design (5.9) refused them with
    "Choose the kind of document first, then choose the files again." (the ERA format check's pattern), and where the
    baseline's settled fix for that pattern (UX-049, "They upload as soon as you choose") would start the batch on the
    select's change. Both lose: the first throws the files away and marks nothing (WCAG 3.3.1; the baseline's "a
    refusal keeps every value, files too"); the second files them under whatever kind an arrow key passes first, a
    kind that never changes. The ERA export's system waits the same way, so UX PR 47 (`co-001/ux-uploader`) keeps the
    files without starting on the choice.

### Alternatives considered

| Option | Why not |
| --- | --- |
| F3 now (compact lookup hashes and a `SECURITY DEFINER` screen function) | The best option, and a migration: Lane A's, under the founder's domain-model approval. Proposed (below); this part is its interim |
| Hold this part for F3 | No check at all meanwhile: a misfiled EOB goes to the model unredacted |
| Read the records in the person's scope | The contract specialist holds no `phi.read`, and the trail would say the person read every patient |
| A runner or record list the caller supplies | A runner scoped to another practice, or a stub that returns nothing, would answer "clear" (design review M7) |
| Shape heuristics on the page (refuse anything that looks like a member ID or a date) | Refuse ordinary contracts, which carry NPIs, TINs, ZIPs, codes and dates; #120 asks for none |
| The stored payer claim number hash | Over the raw CLP07, so a page that writes it with other separators misses; decryption catches every writing the tokenizer joins: one space, dash, minus sign, dot, slash, underscore or asterisk between groups, and every separator the practice's own values hold, exactly as written (N5). A writing with another separator still misses ("What it gives up") |
| Join tokens across any whitespace or dashes | Table cells and CSV fields join into long numeric runs that can equal a large practice's sequential patient control numbers |
| Cap the read to recent claims | A silent gap: an older patient's EOB would be sent |
| Join over a dot or slash with a space beside it | Adds 77,754 distinct prose runs over set v2 ("ARTICLE1PARTIES ...") for no writing an identifier is printed in |
| Delete every format character from the whole text before tokenizing | Turns "Member ID<zero-width space>ZZ7120034" into the one token IDZZ7120034, which is then missed: the build takes them out of the gap between two tokens only |
| REPEATABLE READ for the screen's job scope (`withJobScope` `oneSnapshot`) | A `packages/db` change. The read's own cap bounds what is read and audited whatever the isolation; one snapshot would only make the count and the reads agree, and would hide an identifier committed after the count |
| A length check after the reads | `readWithAudit` has written every audit row by then: it bounds the decrypts, not the reads |
| A route rate bucket for the proposal (`model_screen` in `rate-limit.ts`) | `rate-limit.ts` is a #42 file; a route bucket counts clicks the gateway refuses anyway and only per person and address. The screen's own limits count only screens about to read and cap a practice across its people (a route bucket for the clicks is still proposed: P10) |
| Remember a screen's `clear` | No version of the practice's records exists without a migration, and a stale `clear` would send a document that now names a patient |
| An in-process screen limit | Not shared across web tasks; the Postgres counters are, and hold no PHI |
| Upload as soon as the kind is chosen | An arrow key on a closed select changes the kind once a press, so the batch would be filed under the first kind it passed, for good |
| Extend the date rule to unpadded short dates | Would bring dateMemberId to 0, but stop looking for about 1.6% of 6-digit identifiers (about 5% with 2-digit years) and about 0.4% of 7-digit ones; ruling 4 is the founder's to widen (Open matters) |

### Notices (decided by the build under the standing rule; the founder can reverse any)

- **N4.** The kind is left unset on the contracts and reconciliation panels; the uploads page keeps its 835 default.
- **N5.** The payer claim number is checked by decryption like the other two, not by the raw-value hash. Since
  phi-screen F1 the check also catches the identifier written exactly as stored, whatever separators it holds. The
  practice's separators come from the decrypted values: if F3 moves the check to stored compact hashes, the practice's
  separator set (punctuation only, no PHI) must be stored and returned with them, or F1's gap comes back.
- **N6.** The denial-letter screen (`functions/denial-letter.ts`, `apps/worker/src/packets/letter-records.ts`) is
  unchanged by this part (design review m9): it runs in a worker job, has no production caller and is off by default.
  Unifying it with this check is P9. The letter redaction's identifier pattern (`identifierPattern`, used by
  `redactLetter` and `holdsIdentifier`) matches the separators the contract screen's tokenizer now joins too: any run
  of white space, dashes, minus signs, dots, slashes, underscores, asterisks and invisible characters between two of
  an identifier's characters, so a letter is redacted of at least what the screen would find, and the property test
  that ties the two stays true. The letter path's other-patient screen (`identifierCandidates`) is unchanged: it still
  drops a word with inner punctuation or a format character, and that gap is P9's.

### Consequences

- A payer letter or an EOB filed as a contract, or inside a zip filed as one, is refused before the model, with no
  `model_call` row; the specialist reads the version's contract or exhibit instead, or asks the practice for it (Ask
  the practice), and enters terms by hand only for a contract or exhibit that holds an identifier (a single-case
  agreement, or a collision on a TIN or ZIP+4).
- Until F3, a proposal the gateway would send decrypts and audits every identifier of a practice below the bound (its
  member IDs, its claims' two numbers and its posting lines with no claim match), as the service screen, once, within
  the screen's limits (20 an hour and 60 a day per practice, 20 an hour and 100 a day per person); a click the gateway
  refuses anyway reads nothing, and a document a server found naming a patient within the hour is refused unread. A
  practice above 50,000 identifiers (about 20,000 claims) has every contract proposal refused. F3 should land before
  the first such practice is onboarded.
- A misfiled document cannot be re-filed until F4: it stays a contract in its draft version, and the notice points to
  the version's contract or the practice's, never to hand entry of a letter's terms. Files chosen before their kind
  wait in the browser until the person chooses it and presses Upload, so the panel files nothing by default or by an
  arrow key.
- The check's time per click is linear in the text (about 1 to 2 s at the 16 MiB intake cap on a 4-CPU machine), and
  its memory is bounded. A cap on the framed request's characters in `contractTermsSpec.prepare` should come before
  the screen: an `InputRefusedError` with a fixed sentence, sized to what the model can read and above the 80-page
  documents the design sizes at about 100k tokens, would bound the screen's event-loop time and refuse a request no
  model can read (P11: phi-screen F5's skeptic's item 5, which needs a refusal code and a web notice).
- The first permitted run after this part, compared with a report made before it, fails `refused_rose:<variant>` for a
  practice with a misfiled example; the runbook says to run the served side again on the current code
  (`docs/runbooks/model-evaluation.md`). That fails closed, as intended.
- PR 16's red team gains the check's attacks (reconciliation-001 item 16).

### Revisit when

F3 lands (the bound, the per-click decrypts, the screen's limits and the remembered refusal go, and the audit trail
becomes one screen event and the matched rows); F4 lands (the notice can say "re-file it"); the letter screen moves
onto this check (P9); a practice nears the bound; a false refusal is reported on a real contract; an OCR misread or a
glued suffix is reported on a sent document (measure first, with gate.golden's false-refusal and collision cases, a
confusable fold of O to 0, I and L to 1 and S to 5 on runs that are mostly digits, applied alike to the stored side,
and a 2-character-suffix or 3-letter-prefix match for stored values of 9 or more characters); a contract-kind document
is refused on a version that holds two (the redirect could carry the refused document's opaque ID, so the notice names
it and the select offers the other); a practice's people reach the screen's limits in ordinary work
(`MODEL_SCREEN_LIMITED` without a loop).

### Tests (test matrix MOD-12)

MOD-12, "Contract or exhibit naming a patient of the practice", is asserted by:

- `packages/model-gateway/src/redact.test.ts`: the tokenizer after `:`, `#`, `(` or a word; 2, 3 and 4 groups; NFKC
  forms; one dot, slash, underscore or asterisk joining; invisible characters out of a gap and a minus sign as a dash,
  each still a boundary; never across a newline, a tab, two spaces, two dashes, a dot or slash beside a space, two
  separators or another character; never inside a longer token; the run lengths; the practice's own separators
  (`storedSeparators`), and a value written as stored found whatever it holds (a property, 3,000 runs); every run the
  9b7eadfe tokenizer found still found (a property against its code, kept verbatim in the test); the index answering
  exactly as the plain runs (a property); the first match stopping the stream; no run built off an index hit; the
  bound (16 MiB through `pagesName` in a 96 MiB child); properties against `identifierPattern` and for whole tokens;
  the floors and stored-side rules.
- `src/patient-records.test.ts`: every construction refusal, the scope refusal when `access()` answers but
  `practiceIds` lacks the practice among them; a frozen, unforgeable check; the reads as the service screen with
  purpose `contract_screen` and the joined request ID, once per check; cross-tenant; query, decrypt, person and
  connect faults giving `screen_failed`, and a second question reading again; the reads committing before every
  decrypt, and a decrypt fault keeping every read audited; a patient control number held only in a posting export
  found, under its floor; 50,000 identifiers across the three kinds read whole and 50,001 refused with no read and no
  audit row; rows passing the bound after the count, for each of the three reads, refused as `screen_unavailable` with
  at most one row read past the bound, nothing after it read and nothing decrypted; each of the four conditions of the
  opened-scope assertion; `screenContractPages`' `default:` branch; the synthetic check.
- `src/patient-records.db.test.ts`, on the web's and the worker's logins: one audit row per row read, by the service
  screen ID, joined to the person's one `contract_screen_requested` event, the person never a reader; the worker's run
  ID as the screen; a check for one practice built with another's scope refused; another practice's identical
  identifiers never matching; a wrong key, a failing query, a screen ID that names a person and an unreachable
  database each `screen_failed`; a practice of 25,001 claims `screen_unavailable` with no audit row; a claim that no
  longer decrypts after others that do, `screen_failed` with every read audited (2 member IDs, 3 claims, 1 posting
  line); 1,000 claims committed right after the count of a practice at the bound, `screen_unavailable` with 25,001
  claim reads and the late claim never matched; a paper check's posting line found, and a line matched to a claim not
  read (by its audit rows).
- `src/specs.test.ts`: the map and every spec frozen, each where it is defined too (loaded alone, before the
  registry), and the contract spec's screen is `screenContractPages`; assigning or deleting the screen, `prepare` or
  the map's entry throws a `TypeError` and is a compile error (`@ts-expect-error`); the gateway's prototype and
  instances frozen; a contract naming a held member ID still refused after such an attempt; neither `PURPOSE_SPECS`
  nor `syntheticRecordsCheck` on the package's entry.
- `src/functions/contract-terms.test.ts` and `src/gateway.test.ts`: a member ID, a payer claim number as written and
  hyphenated, and a long patient control number refused as `names_patient` after the idempotency and budget reads and
  before the hold and the call, with no `model_call` and one log line of `practice_id` and the code; the fee-schedule
  twin sent; a check not issued, copied or for another practice refused as `screen_invalid`; a synthetic check only on
  an evaluation call; `screen_unavailable` and `screen_failed` refused with one line each; an unserved variant refused
  before the screen takes a connection; a replay under a completed key and a practice with a spent budget refused with
  no screen connection taken; the caller's step before the screen not run for any refusal before it (busy, the kill
  switch, the PHI boundary, the input's checks, a completed call, a spent budget, an unserved variant), run once
  before the screen's first connection otherwise, its throw refusing the call unscreened, unheld, unsent and unlogged,
  and never run for a purpose with no screen; the caller's context read once, so a step that changes its practice is
  refused as `screen_invalid`.
- `src/gateway.db.test.ts`: MOD-12's documents read as intake reads them; the EOB, the claim-number exhibit and the
  EOB inside the zip refused with no `model_call` row; the fee-schedule twin, alone and from the zip, sent; on
  Postgres, a replay and a spent budget write no `contract_screen` audit row.
- `src/lint.test.ts`: `issued.add(` once, inside `issue()`; `namesPatient` defined nowhere else outside a test; the
  testing module reached by nothing but test code, through any import form, transitively, with a self-check over a
  synthetic graph; what counts as test code, with its own check (a support directory inside the web's route tree does
  not); `practiceRecordsCheck` named only in its two production callers (each call's arguments pinned), `testing.ts`,
  the definition, the entry and tests; `syntheticRecordsCheck` only in `testing.ts`, `eval/` and tests.
- `eval/gate.golden.test.ts`: the set passes with the twin practice; a V01 naming a twin member ID refused; the false
  refusals (with and without the stored-side rules), the twin written with separators, and the seven collision classes
  above, pinned.
- `packages/synth/src/screen/patient-twins.test.ts`: the twin's counts; no 9-digit member ID SSN-, ITIN- or
  ATIN-shaped; no 11-character one MBI-shaped; the twin written with separators; the new collision classes read as the
  tokenizer joins.
- `apps/web/src/lib/routes/models-routes.db.test.ts`: the version page's `names_patient`, `screen_unavailable`,
  `screen_failed` and `screen_limited` notices, nothing sent, no proposal row, the person's event and the screen's
  reads joined, the log lines; per click at a spent budget, no read and no person's event (was 6 reads and one event
  each); a misfiled document clicked three times screened once (was three times); the limits counted only for a screen
  about to read, and each of the four refusing a screen with nothing read or sent and `MODEL_SCREEN_LIMITED` logged;
  no person's event for the kill switch or an unserved variant; the access log's gap after a screen pinned (S2); a
  `screen_failed` screen's reads kept (F3).
- `apps/worker/src/models/permitted.db.test.ts`: a misfiled permitted example scored `refused:names_patient`; a spent
  budget reads none of the practice's records; two examples of a practice whose stored identifier does not decrypt
  both `refused:screen_failed`, read once each.
- `apps/web/src/lib/models/path.test.ts`: each screen code to its own notice, `screen_invalid` to the bound's, and
  every notice naming the records one way and no patient, identifier, kind or count.
- The upload panel: `apps/web/src/components/uploads/uploader.test.tsx` (what files do before the kind or the ERA
  system: held, focused, deduplicated, joined, started only on Upload, refused only for the batch's own problems; the
  kind's help and the alert in the markup), `apps/web/src/lib/routes/uploads.db.test.ts` (a file without a kind
  refused by the server), `apps/web/e2e/contracts.spec.ts` (a drop before choosing a kind held, marked, focused and
  described, cleared, and uploaded on Upload with one request) and `apps/web/e2e/era-exports.spec.ts` (an ERA export's
  file held until its system is chosen, then uploaded on Upload).

## Open matters

**For the founder** (founder-kept; nothing in these pull requests decides them):

- **F1. The per-field recall and precision floors** for contract proposals, 12 fields each. Recommended: one recall
  and one precision floor per field over the whole of set v2, set by the founder with the contract specialist and
  committed to `eval/floors.json` by a pull request quoting the ruling, before the first real-model baseline run.
  Until then every floor stays `null`, and a real provider is neither recorded nor served. Blocks the first real-model
  run, not a pull request.
- **F2. Accepted proposals as examples.** Does the data-rights addendum cover keeping an accepted, uncorrected
  proposal's document as an evaluation example? The repository holds no addendum text (the agreement table keeps
  `document_ref` and `sha256` only); PRD 14 says "Reviewer corrections". Recommended: yes, if counsel confirms the
  addendum covers any reviewed proposal's document. On the answer, one line of `reviewVersionProposals` changes and
  MOD-07's assertion gains "accepted ones included where the data-rights agreement allows", in the second pull request
  if it is open then, else in a pull request of its own.
- **Part 3's date rule for unpadded short dates** (session ruling 4). Extending the 8-digit date rule to the unpadded
  forms M/D/YYYY, MM/D/YYYY, M/DD/YYYY and MM/DD/YY (6- and 7-digit compact dates) would bring the dateMemberId class
  to 0. In exchange the check would stop looking for the 6- and 7-digit identifiers those forms take: about 1.6% of
  6-digit values with a 4-digit year (about 5% with 2-digit years too), and about 0.4% of 7-digit values. Not built:
  the stored-side rules are ruling 4's, and failing closed is the safer default. Recommended: keep it as built.

**Proposed for Lane A** (migrations; Lane B opens none):

- **F3.** #120's best option: compact-form keyed lookup hashes on `patient_ref.member_id`,
  `claim.patient_control_number`, `claim.payer_claim_control_number` and `posting_row.claim_reference` (the unmatched
  lines Part 3 reads), a backfill job, and a `SECURITY DEFINER` function that checks the hashes with one indexed
  query, audits one screen event and the matched rows only, and runs as the screen, checking the person, not reading
  as them. Part 3 is the bounded, fail-closed interim until it lands. F3 should also retire the security review's S1
  and S2: with one indexed query and the matched rows audited, the screen's limits and the remembered refusal can go;
  and with it, or beside it, a new version of `practice_access_log` with an (at, id) cursor (`before_event`), the
  request ID, and each screen read's cause (`caused_by`, from the joined `contract_screen_requested` event), so the
  practice's access log names who caused a screen's reads and pages through all of them (the route's half is P10). It
  must store, beside the hashes, the practice's set of separators its identifiers hold (punctuation only, no PHI), or
  phi-screen F1's gap comes back (N5).
- **F4.** A reviewed way to correct a misfiled document's kind (a kind-change grant with an audit event), so a payer
  letter uploaded as a contract can be re-filed.

**Proposals outside these pull requests:** P1 a contract prompt version that writes each value-only field's phrase,
read by code, so the verifier rejects a value its phrase contradicts; P2 #15's contract-evidence integrity pull
request, reusing V05 to V09 and V13; P4 a per-purpose operator flag (a migration, optional); P5 sets, entry kinds and
serving rules for evidence requests and the letter reader; P7 whether a decoy whose modifier set differs from its row
should be flagged, for the engine review; P8 one line for the contract specialist's guide: a single-case agreement
names a patient and is entered by hand (Part 3 refuses it); P9 the denial-letter screen moved onto Part 3's issued,
practice-bound and scope-bound check, testing the union of its present runs and the new tokenizer's so it only gains
matches (a Lane B item, no migration; with F3 it shares the lookup function). P10, after #42 (each touches a #42
file): a `model_proposal` route bucket for the proposal's clicks (`rate-limit.ts`; 30 per person and 120 per address
in 10 minutes), and the access log's page naming a screen read's cause and paging by event (`settings.ts`,
`access-log/page.tsx`; with F3's new `practice_access_log`). P11 a character cap on the framed contract request in
`contractTermsSpec.prepare`, before the screen, with a refusal code and a notice of its own (phi-screen F5). P12 an
open-scope brand issued by `packages/db/src/authz/scope.ts` and a pool brand issued where the services build their
pools (a #42 file), so `practiceRecordsCheck` refuses a stub itself (N2; no migration). P13 a deep freeze of `PROMPTS`
(each prompt version, its model map and its schema), so no code in the process can point a call at a model the gate
did not evaluate (Part 2's, not this part's: the provider adapters' use of the schema objects is checked first).
