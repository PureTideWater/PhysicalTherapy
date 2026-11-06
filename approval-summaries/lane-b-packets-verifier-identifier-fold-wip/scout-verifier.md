# Scout: the packets verifier's identifier check (packets-verifier-identifier-fold)

Worktree /home/user/packets-verifier-identifier-fold at 23b25ad0 (clean). No tracked file changed. Probes are in
scratchpad/pvf/scratch/probe.ts, probe2.ts and probe3.ts, with their output in probe.out, probe2.out and probe3.out.
All identifiers in them are synthetic.

## 1. The code as it stands

- `packages/packets/src/verifier/mismatches.ts`
  - :80-84 is the doc. Every occurrence of one of the case's own identifiers fails the narrative, "compared without
    regard to case". The server passes the identifiers and the browser passes none.
  - :296-297 `WORD_CHARACTER = /[\p{L}\p{N}]/gu`.
  - :303-315 `identifierForms(identifiers)` (exported, and public through `@tp/packets` index.ts:150). It takes each
    value in NFKC and trims it. The forms are the whole value plus its pieces split on `/[\s,;/]+/` only, each with at
    least 2 letters or digits, sorted longest first. It does not split on dashes or apostrophes, so the halves of
    `SMYTHE-JONAS` and `O'QUILL` are never forms.
  - :317-333 `identifierSpans(text, identifiers, skip)` (exported from mismatches only; verifier.test.ts:15 imports it).
    For each form it builds the regex `(?<![\p{L}\p{N}])` + the escaped form, with `\s+` for each whitespace run, +
    `(?![\p{L}\p{N}])`, flags `giu`. A match is kept unless it overlaps a skip span or an earlier match, and the result
    is sorted by start. It does no fold beyond JS `i`: no mark stripping and no ß to SS. Dashes and apostrophes match
    only literally.
  - :336 `DATED = {date, month, month_day}`.
  - :356-408 `readNarrative`. :357 `readable = readableText(narrative)` and `text = readable.text`. :383 skip is
    `scan.placeholders` (`{{kind:n}}`) + `scan.markers` (`[1]`, `[1, 3]`) + the scan figures of DATED kind (a month name
    in a date is the date, ADR 0047). :384-386 each span gives
    `add('identifier_in_narrative', 'identifier', at(span))`. `at` maps readable-text positions back to the original
    narrative, and the sentence index comes from `sentenceOf`.
  - :93-102 `MISMATCH_CODES`. A span is a **hard failure**: `passed = mismatches.length === 0` (:405). The report
    holds the code, kind `'identifier'`, the sentence and start/end only, never the text (index.ts:15-16, test :217-219).
    No separate "block" code exists. The database refuses approval of a failing version (CAS-08). The web copy is
    apps/web/src/lib/packets/view.ts:19.
- `packages/packets/src/verifier/index.ts:40-50` `verifyNarrative(narrative, facts, identifiers: readonly string[])`. It
  takes a **flat** list and is not told which values are names and which are numbers.
- `packages/packets/src/readable.ts:67-122`. The text the identifier check reads is each grapheme in NFKC with
  **hidden characters removed**. Hidden here covers Cc, Cf, Co, Cs, Cn, Zl, Zp, Default_Ignorable, and a mark on a
  non-letter (:50, :86-91). A non-Latin letter inside a Latin word is reported as hidden (confusable) but stays in the
  text (:111-119). So ZWSP, soft hyphen and the joiners never reach `identifierSpans`. They are already
  `hidden_character` failures, and the identifier is then matched across them.
- `packages/packets/src/check.ts:22,32` is the browser's live check (`findMismatches` / `readNarrative` with `[]`).
  `@tp/packets/check` is imported by the client component apps/web/src/components/packets/narrative-editor.tsx:1-4
  (`'use client'`). **Whatever the verifier imports ships in the browser bundle.** mismatches.ts:62-64 says "It holds no
  hash and reads no Node module, which is all that keeps it out of the browser."

## 2. Callers and the identifiers they pass

| Caller | Where | Identifiers |
| --- | --- | --- |
| writePacketVersion | apps/worker/src/packets/services.ts:130 (assembleVersion :167-168) | `scheduleIdentifiers(...).all` |
| verifierNow (export job, approval request, approval) | apps/worker/src/packets/verifier-now.ts:46-56; export.ts:197-200 | `identifiers.all` read now |
| caseVerifiersNow (screens) | verifier-now.ts:16-18 | none |
| draftPacketNarrative verify | packages/model-gateway/src/functions/narrative.ts:134-136 | `input.identifiers` (`input.names` exists, :43, but is not passed to the verifier) |
| browser editor | packages/packets/src/check.ts:22,32 | `[]` |
| gateway test | packages/model-gateway/src/gateway.test.ts:208 | the draft must pass |

`scheduleIdentifiers` (apps/worker/src/packets/identifiers.ts:61-99) builds `all` from each row's claim_control_number,
patient_control_number, patient last and first name, member_id, insured member_id, and insured last and first name.
Each is decrypted and kept unless blank. `names` (:79-83) holds the four name fields and is returned beside `all` (:99).
No date of birth is passed anywhere. A DOB never reaches the verifier, and DATED figures are skipped.

Names arrive as separate last and first values (`SMYTHE-JONAS`, `ZOË`), not as "LAST, FIRST". `RowIdentifiers.patient_name`
is `last, first`, but only the export uses it.

The verifier's input is the stored narrative, which writePacketVersion normalizes to NFKC (services.ts:124), or a
model's paragraphs joined, which may not be NFKC (narrative.ts:135). The narrative carries placeholders
`{{claim_control_number|patient_control_number|patient_name|member_id:n}}` (format.ts:43, placeholders.ts:12), filled in
at export (`insertIdentifiers`, export.ts:206). This is a different syntax from the gateway's `[PATIENT_NAME]` /
`[CLAIM_n]`.

## 3. Existing tests and properties (packages/packets/src/verifier.test.ts)

- :209-233 "the case's own identifiers". Identifiers are `SYNTHETIC, JANE, ABCDEFGH, SYNCCN0001, SYNPCN0001, APRIL`.
  - A narrative naming a patient, member or claim fails in any case, and the report never contains the identifier
    (:217-219).
  - Spans for `Jane Synthetic` are `['Jane','Synthetic']` from separate identifiers, and `['Jane Synthetic']` from
    `'JANE SYNTHETIC'` (:222-223).
  - Whole words only (`synthetics` passes), and `April 2026` passes. Placeholders are ignored. One-letter values
    (`'Q','A.',''`) are ignored. A fullwidth `ａ` inside a name fails (:226-232).
- :281-292 ordering. `Claim 12345-678` with identifier `12345` gives identifier_in_narrative `12345` plus
  figure_not_in_input `12345-678`. `identifierSpans('Jo and Jane Synthetic', ['JANE SYNTHETIC','JO'], [])` gives
  `[{0,2},{7,21}]`. **These are exact span assertions, and a new matcher must keep them.**
- :302-319 `identifierForms` exact output: `[' Synthetic, Jane ','Jo','AB/CD;EF','Q R']` gives
  `['Synthetic, Jane','Synthetic','AB/CD;EF','Jane','Q R','AB','CD','EF','Jo']`, and fullwidth `ＪＡＮＥ` gives `['JANE']`.
  Further cases: extra spaces either side; `Synthetic, Jane`; `Jo` from `JO SYNTHETIC`; next to a marker (`Jane[3]`,
  `[3]Jane`); `MARCH` inside `March 5` and `March 5, 2026` passes.
- :551-563 property. A random `QZ…` name in random case, appended to a passing draft, gives exactly one
  identifier_in_narrative whose span is the written name.
- :651-657 `ST. SYNTHETIC` matches `St. Synthetic` as written (regex metacharacters escaped).
- :535-549 property. Any hidden character anywhere fails with one hidden_character span.
- Outside packets, the gateway uses `identifierForms` as an oracle:
  packages/model-gateway/src/redact.property.test.ts:1,306 (the legacy redaction oracle) and
  packages/model-gateway/eval/gate.golden.test.ts:6,245. **Keep `identifierForms` exported and its output unchanged,
  or update those two oracles in the same PR.**
- facts.test.ts:258-308. Fact identifiers such as plan identifiers (`SYNPLAN-63`) are figures a narrative may state.
  They are the payer's, not the case's.

## 4. Probe results today (`verifyNarrative` with the default assemblyInput content)

"Verifier" is whether the narrative gets an `identifier_in_narrative`. "Passes?" is the whole report. "Gateway" is
`holdsNameOrNumber` (redact.ts:1807) with names and numbers split.

### Letters-only identifiers: the real gap (the narrative passes the verifier entirely)

| Gap class | Probe (identifier, narrative form) | Verifier | Passes? | Gateway |
| --- | --- | --- | --- | --- |
| control | `Quarrington` exact | flagged | no | yes |
| diacritic dropped | `Zoë` / `Zoe`; `José` / `Jose` | **no** | **yes** | yes |
| diacritic added | `Quarrington` / `Quärrington` | **no** | **yes** | yes |
| NFD diacritic | `José` / `José` | flagged (NFKC composes it) | no | yes |
| å, ß | `Ståhlberg` / `Stahlberg`; `Strauß` / `STRAUSS` | **no** | **yes** | yes |
| typographic apostrophe | `O'Quill` / `O’Quill` | **no** | **yes** | yes |
| apostrophe dropped | `O'Quill` / `OQuill` | **no** | **yes** | yes |
| modifier apostrophe | `O'Quill` / `OʼQuill` | no | no (hidden_character: ʼ is read as a non-Latin letter) | yes |
| en dash, minus | `Van-Treeby` / `Van–Treeby`, `Van−Treeby` | **no** | **yes** | yes |
| dash dropped or spaced | `VanTreeby`, `Van Treeby` | **no** | **yes** | yes |
| split halves | `Van-Treeby` / `Treeby`; `Smythe-Jonas` / `Smythe`, `Jonas` | **no** | **yes** | yes |
| line-break hyphen | `Quar-⏎rington` | **no** | **yes** | yes |
| capitalized spaced pieces | `JOANN` / `Jo Ann` | **no** | **yes** | yes |
| letters-only member ID spaced or dashed | `QQRSTUVW` / `QQ RSTUVW`, `QQ-RSTUVW` | **no** | **yes** | yes |
| fullwidth | `Ｑuarrington` | flagged | no | yes |
| Cyrillic а inside | `Quаrrington` | no | no (hidden_character) | no |

### Invisible format characters: already caught by another code

| Probe | Result |
| --- | --- |
| `Quar<ZWSP>rington` | identifier_in_narrative + hidden_character. readable drops the ZWSP, so the name matches. |
| `Quar<SHY>rington` | identifier_in_narrative + hidden_character |
| `Dear<ZWSP>Quarrington` | hidden_character only. The readable text `DearQuarrington` is no whole word. Gateway: yes. |
| `ZZ<ZWSP>1234567` | identifier_in_narrative + hidden_character |

Every invisible character fails the narrative today through hidden_character. The only effect is on which code the
report shows.

### Digit-bearing identifiers: they fail, but as `figure_not_in_input`, not as identifiers

| Probe (identifier, narrative form) | Report |
| --- | --- |
| `ZZ1234567` / `ZZ-123-4567`, `ZZ 1234567`, `ZZ–1234567`, `ZZ_1234567` | figure_not_in_input (kind identifier) |
| `SYNCCN0001` / `SYN.CCN.0001` | figure_not_in_input |
| glued label `ICNSYNCCN0001`, `Member IDZZ1234567` | figure_not_in_input, kind identifier |
| label forms `Member ID:ZZ1234567`, `Claim#SYNCCN0001` | identifier_in_narrative (the regex lookbehind sees the `:` and `#`) |
| own SSN-shaped `900551234` / `900-55-1234`; own phone `5550123` / `555-0123` | figure_not_in_input |
| another patient's SSN `900-66-4321`, phone `(212) 555-0199` | figure_not_in_input. The gateway narrative check says no: patterns are off for narratives, ADR 0054 2026-11-04 Scope, redact.ts:1807, redact.test.ts:552-557. |

So #115's label forms and #127's SSN and phone forms never pass the gate today. Every digit-bearing token is a figure,
and the inputs do not hold the case's identifiers or SSNs. The exception is a figure the inputs or a quoted clause
hold. Two consequences:

- A digit-bearing identifier written equal to a held figure is caught by the exact match only. Examples are a claim
  number that equals the code (`97110`), or one written inside a held amount (`300` in `$300.00`). Both are flagged
  today.
- An SSN or phone number inside a quoted contract clause that a narrative repeats passes the figure check.

The SSN and phone patterns are the letter reader's only (ADR 0054, Scope). Adding them to the verifier would flag a
payer's phone number quoted from the contract. "Where it applies" is therefore best read as not applying to the
narrative: the figure check already fails every unheld digit chain.

### Over-flag differences: where the gateway's matcher, used raw, would flag what the verifier keeps (probe3)

| Probe | Verifier | `holdsNameOrNumber` |
| --- | --- | --- |
| claim `2026`, `Service dates from 2026-03-05 …` | keeps (DATED skip) | **flags** (2026 is not the whole written date) |
| claim `13`, `Paid short [13].` | keeps (marker skip) | **flags** |
| names `patient` and `name`, `{{patient_name:1}}` | keeps (placeholder skip) | **flags**. The gateway masks only `[PATIENT_NAME]`-style placeholders (redact.ts:265, :1790). |
| member `SYN1` against the plan identifier fact `SYN-1` | no identifier flag | **flags** (number joiners) |
| claim `20260305` against `2026-03-05` | keeps | keeps (dashed calendar date) |
| claim `123450` against `$1234.50` | keeps | keeps (a period never joins digits) |
| name `INA` against `in a` | keeps | keeps (spacedPiecesPass) |
| name `April` against `April 2026` | keeps | keeps |
| claim `300` against `$300.00`; code `97110` | **flags** | flags (same) |
| name `May` in "may", `Will` in "will" | flags | flags. This is the known consequence in ADR 0047:136-137. |

The design must therefore keep the verifier's skip spans (placeholders, markers, DATED figures) around any reused
matcher. It must also decide how a match that overlaps a skip span is handled: drop it, as today, or mask the skip span
with a barrier before matching. Each of these four rows needs a test (no false flags on dates, markers, placeholders, or
a held fact identifier such as `SYNPLAN-63` / `SYN-1`).

## 5. The package boundary

- **`@tp/model-gateway` depends on `@tp/packets`** (packages/model-gateway/package.json `"@tp/packets": "workspace:*"`;
  narrative.ts:1, gateway.test.ts:2, redact.property.test.ts:1, eval/gate.golden.test.ts:6). If packets imported the
  gateway, that would be a **workspace cycle**. The gateway also pulls the provider SDKs, @tp/db and observability into
  a browser bundle (`@tp/packets/check` is client code). Reusing it in place is ruled out.
- The eslint rules (eslint.config.js:10-50, 125, 143-148) restrict only the model SDKs and Google fonts. No
  package-boundary rule exists. `MONEY_PACKAGES` (eslint.config.js:66-78) contains both packets and model-gateway, and
  a new shared package outside that list would get none of the money rules. It holds no amounts, but add it to the list
  for consistency if it reads digits.
- `packages/model-gateway/src/redact.ts` has **no imports** (it is pure, 2250 lines), so it can be extracted. The narrative path needs:
  - `fold` and `viewOf` (:246-370);
  - the forms, `formsOf`, `nameWords`, `nameForm`, `numberForm` and `spacedPiecesPass` (:383-590);
  - `datesIn` with its date patterns (:100-240), which `matchesIn` uses for `otherDates` even with datesOfBirth null;
  - `isAmount` and `writtenAsDate` (:594-606);
  - the labels: IDENTIFIER_LABEL, LINE_OR_SENTENCE_START, `labelsBefore`, `gluedLabelBefore`, `labelFor`,
    `anyLabelAt` (:623-732);
  - `matchesIn` (:746-833) and `firstIndex`.

  It does not need the initials (`initials: false`) or the patterns and survivor scan (`patterns: false`), :959-1670.
  `matchesIn` calls `patternMatchesIn` and `initialsNextToNames` behind flags. Extracting one module with the flags
  intact, so the gateway re-imports it, keeps a single implementation. Splitting the pattern half out would change the
  gateway's file layout.
- `matchesIn` and `Found` are not exported. `holdsNameOrNumber` (:1807) returns a boolean only. The verifier needs
  spans in NFKC positions, so it needs a span API (for example `nameOrNumberSpans(text, {names, numbers})`).
  `holdsNameOrNumber` is "the narrative drafter's check" (ADR 0054:415-420; narrative.ts:108-120): names read as names,
  every number read as a member ID (never an amount), no DOB, no initials, no patterns. That is the reading the
  verifier should share.
- **Names and numbers.** The gateway's matcher needs them split. `verifyNarrative` takes one flat list, while the worker
  has `names` (identifiers.ts:30, :99; services.ts:168). The gateway's `identifierKinds` (narrative.ts:102-105) falls
  back to "a value with no digit is a name". The verifier API either gains `{names, numbers}` (four call sites in
  section 2) or applies that same heuristic. Probe2 shows a letters-only member ID read as a name still matches `QQ RSTUVW`.
- Text basis. The gateway matches on `text.normalize('NFKC')` (its view turns an invisible run into VANISHED). The
  verifier reads `readable.text`: NFKC per grapheme, hidden characters removed, positions mapped by
  `readable.original`. Running the matcher on `readable.text` loses only the "ZWSP ends a word" reading
  (`Dear<ZWSP>Quarrington`), which hidden_character fails anyway. The differential test must say which text both
  sides read: the same `readable.text` with the skip spans applied, or NFKC narratives with no hidden characters.
- Mutation testing. stryker/base.mjs:24 `MUTATION_PACKAGES = ['money','pricing','ledger','packets']`, and :48-56
  mutates `packages/packets/src/verifier/**`, readable, scan and roles. Code moved to a new package is not mutated under
  packets, and the gateway is not a mutation package either. tools/stryker/affected.ts computes closures from the
  lockfile.
- A new workspace package changes pnpm-lock.yaml and the package.json files. CLAUDE.md then requires `pnpm
  toolchain:check` (networked, BASE=origin/claude/build-platform) and `actions:check`. CODEOWNERS `*` already covers
  the change, and `/package.json` (root) is owned. Engine freeze applies only to packages/pricing (tools/engine-freeze/check.ts:47-63),
  so packets and a new package are not frozen. Packets' money arithmetic is not touched.
- `VERIFIER_FORMAT = 'tp-packet-verifier/2'` (format.ts:29). A stricter identifier check does not change the report
  shape. verifierNow re-runs the verifier over stored passes (verifier-now.ts:46-56), so a stored version whose
  narrative holds a folded form becomes `fails_now` at the next approval step or export. That is the intended
  tightening, but the PR should name it as a consequence.

## 6. ADRs to amend (no new number needed)

- docs/adr/0047-read-narratives-as-they-show-refuse-the-cases-identifiers-…md:42-47 is the verifier's own decision
  ("every whole-word occurrence … without regard to case, outside placeholders, citation markers and dates"). The
  "Match identifiers in the browser" alternative is :121, and Consequences are :131-137 (the patient named May).
  Amend it: the occurrence is now read through the gateway's fold and matcher.
- docs/adr/0054-…md is the redaction ADR.
  - Amendment 2026-10-27 (:274+). The "narrative drafter's check" bullet is :415-420, and "Still not covered" is :431+.
    Homoglyphs, other-script digits and nicknames stay residuals.
  - Amendment 2026-11-04 (:516+). Scope is :527-530: "the narrative check (`holdsNameOrNumber`) … do not" read
    patterns. That supports leaving SSN and phone patterns out of the verifier.
  - Add an amendment stating that the packets verifier shares the matcher, together with where the code now lives.
- docs/product/test-matrix.md:264-283 runs MOD-10 to MOD-18, so MOD-19 and MOD-20 are free (reserved). CAS-08 is at :122.

## 7. Summary for the designer

1. The letters-only gap is real. Every diacritic, ß/å, ’, –/−, dropped or spaced joiner, split-half and line-break
   hyphen form of a name, and a letters-only member ID spaced or dashed, passes the verifier outright.
2. Invisible characters and digit-bearing forms (the label-glued forms, SSN- and phone-shaped own numbers) already fail
   through hidden_character or figure_not_in_input. What remains is the report code, plus the narrow case of a figure
   an input or a quote holds.
3. Importing the gateway into packets is refused by a cycle (gateway → packets) and by the browser bundle. Extract the
   pure matcher (fold, view, forms, datesIn, labels, matchesIn, with flags) into a small import-free workspace package.
   The gateway re-exports from it and `@tp/packets` depends on it. Expose a span API.
4. Keep the verifier's skip spans and its exact-span tests, keep `identifierForms` (used as a gateway test oracle), and
   decide the names/numbers split for `verifyNarrative`. Leave the SSN and phone patterns off for narratives (ADR 0054
   Scope).
5. The new false-flag risks come from using the raw gateway matcher: a year inside a date, marker digits, placeholder
   words, and a fact identifier joined by a dash (`SYN-1`). These must be tested as no-flags.
