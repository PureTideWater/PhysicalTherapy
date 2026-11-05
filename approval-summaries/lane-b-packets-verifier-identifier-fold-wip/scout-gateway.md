# Scout: the gateway's fold and matcher, for the packets verifier (packets-verifier-identifier-fold)

Worktree /home/user/packets-verifier-identifier-fold at 23b25ad0. No tracked file changed. Probes live in
/tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/pvf/scratch/ (probe.ts, probe2.ts, probe3.ts, probe4.ts and their *-out.txt; redact-probe.ts is a scratch copy of redact.ts with one added line, `export { matchesIn, merge, formsOf, viewOf };`). All data is synthetic.

## 1. Verdict on the package boundary

- **The verifier cannot import @tp/model-gateway.** packages/model-gateway/package.json already depends on `@tp/packets`
  (functions/narrative.ts:1 imports `verifyNarrative`, `narrativeFacts`, `dollars`; redact.property.test.ts:1 imports
  `identifierForms`), so the import would make a workspace cycle. It would also pull the gateway's runtime deps
  (`@anthropic-ai/sdk`, `@aws-sdk/client-bedrock-runtime`, `@tp/db`, `@tp/observability`, `@tp/contracts`, `@tp/rules`)
  into a money package and into the browser bundle (`@tp/packets/check` runs `findMismatches` client-side: packages/packets/src/check.ts:4-22,
  apps/web/src/components/packets/narrative-editor.tsx:4).
- **redact.ts itself is pure.** It has no `import` at all (grep: none). It uses only `String.prototype.normalize`, Unicode
  regexes (`\p{Default_Ignorable_Code_Point}`, `\p{Pd}`, `\p{Sc}`, `\p{M}`, `\p{Nd}`, lookbehind) and module-level
  `Map` caches (`foldedCodePoints`, `digitValues`). There is no Node module, clock, network, SDK, db or logging, so it runs in
  the browser as is.
- **The only import rules in lint** are eslint.config.js:16 `MODEL_SDK_PATTERNS` (the SDKs, outside the gateway) and
  eslint.config.js:70 `MONEY_PACKAGES` (no parseFloat, Number(), or float literals; both packets and model-gateway are listed).
  No eslint/dependency-cruiser rule forbids gateway↔packets, and CODEOWNERS has no package-boundary line. The cycle is the
  real blocker.
- **There is precedent for moving shared text logic.** ADR 0054's amendment of 2026-10-28 (docs/adr/0054-…md:497-515) moved
  the role grammar from the gateway into `@tp/packets` (roles.ts), and the gateway now imports it from packets.

### Where the shared core could live (for the design lead)
| Option | For | Against |
|---|---|---|
| A. Move the matcher core into `@tp/packets` (e.g. src/identifiers/), and have the gateway's redact.ts import it from `@tp/packets` (as ADR 0054/0086 did for roles) | no new manifest or lockfile change; the edge already exists | **every file under packages/packets/src is mutated** (stryker/shards.json: each file of a package's config is in exactly one shard; packets is a MUTATION_PACKAGE, tools/stryker/affected.ts:107). About 1,700 regex-heavy lines would bring thousands of mutants into the 30-min shard budget (shards.json $comment: roles.ts at 1,917 mutants ran past 40 min) and need kills or equivalent entries. It also puts PHI redaction inside a money package. |
| B. New pure package (e.g. `packages/text-fold`, `@tp/identifier-match`) that both import | clean boundary; the gateway keeps ownership of its semantics; not a mutation package (its files are only in packets' closure, so a change re-runs packets' mutation run, but the new files are not mutated) | needs a package.json, tsconfig, a pnpm-lock change (CLAUDE.md: `pnpm toolchain:check` after a manifest/lockfile change), adding it to apps/web/next.config.ts:33 `transpilePackages` (a watched path) and to the web's/packets'/gateway's dependencies, possibly adding it to eslint `MONEY_PACKAGES`, and regenerating tools/screening-capacity/watched-paths.txt (`pnpm exec tsx tools/screening-capacity/watched.ts --write`; the list already includes packages/model-gateway/src/redact.ts:413 and packages/packets/src/verifier/*.ts:461-462). /package.json and /vitest.config.ts are founder-owned (CODEOWNERS), but per-package manifests other than db's are not. |
| C. Second implementation in packets | – | forbidden by the brief (drift) |

## 2. The functions (packages/model-gateway/src/redact.ts)

Public exports from packages/model-gateway/src/index.ts:208 are only `LetterClaim`, `PatientIdentifiers`, `SCREEN_FLOORS`,
`compactIdentifier`, `identifierCandidates`, `identifierRuns`, `redactLetter`. Everything else is imported by relative path
inside the gateway (functions/narrative.ts:8 `holdsNameOrNumber`; functions/denial-letter.ts:9; patient-records.ts:16; contract-terms.ts:12; testing.ts:20).

| Symbol | Line | What it is | Exported from redact.ts |
|---|---|---|---|
| `fold(codePoint)` | 270 | NFD, drop marks, toLowerCase().toUpperCase() (ß→SS), NFD and drop marks again; cached | yes |
| `viewOf(normal, 'join'\|'drop'\|'space', digits?)` | 329 | folded view of NFKC text, with `from`/`to` unit maps back to the input. Blanks (BLANK, 246) become a space; a default-ignorable run becomes one VANISHED (U+00AD, 256) in `join`, is removed in `drop`, or becomes a space in `space`; `digits` maps other-script Nd to ASCII (pattern view only) | no (`View` is internal, 291) |
| `inNormal(view,s,e)` | 373 | view range → input range | no |
| `numberForm` / `nameForm` / `nameWords` / `formsOf(subject)` | 459 / 480 / 472 / 515 | build one folded regex per form: whole name, each word, each part (PIECE_SPLIT 422 splits on dashes and apostrophes); numbers compacted (compactFolded 428) with GAP joiners (403; NUMBER_JOINERS 395, NAME_JOINERS 385, HYPHENATION across a line break 401) | no |
| `Subject` | 504 | `{ names, memberIds, claims: string[][], datesOfBirth: string[] \| null, initials, patterns }` | no |
| `matchesIn(normal, subject)` | 746 | **the one-pass matcher**: dates on `drop` and `space` views (`datesIn` 217), then every form on the `join` view; name spacing check `spacedPiecesPass` 554; excludes amounts (`isAmount` 594, claim kind only) and the number's own written calendar date (`writtenAsDate` 602) unless a label of its kind introduces it (`labelFor` 726 → `labelsBefore` 686 with IDENTIFIER_LABEL 639, LINE_OR_SENTENCE_START 647, #115); labeled "."/"/" joins (`anyLabelAt` 732, ANY_IDENTIFIER_LABEL 656); glued labels (`gluedLabelBefore` 707, GLUED_LABEL 664); initials (849) when `subject.initials`; SSN/phone (`patternMatchesIn` 1306, #127) when `subject.patterns`. Returns `Found[]` (`{start,end,kind,claim,compacts?}`, 734) as **ranges in the string passed in** (no renormalization inside) | no |
| `merge(found)` | 685 | overlapping matches → one span with a placeholder ranked by kind (RANK 1673) | no |
| `masked(text, claims)` | 1790 | NFKC, then exact gateway placeholders → BARRIER (U+0001, 263) so nothing matches across them. Only the gateway's own placeholder set (PLACEHOLDER 265: `[PATIENT_NAME]`, `[CLAIM_n]`, …), **not** the packets placeholders (`[PATIENT_NAME_1]`-style, PLACEHOLDER_KINDS) | no |
| `holdsIdentifier(text, patient, claims)` | 1797 | `matchesIn(masked) > 0 \|\| survivorLeft` (the letter self-check: patterns and the survivor scan on) | yes |
| **`holdsNameOrNumber(text, {names, numbers})`** | 1807 | **already "the narrative drafter's check of its facts"**: `matchesIn(masked(text), { names, memberIds: numbers, claims: [], datesOfBirth: null, initials: false, patterns: false })`. Boolean only | yes (used by functions/narrative.ts:119 `mentionsIdentifier`, with names and numbers split by `identifierKinds`, narrative.ts:105: a value with no digit is a name) |
| `redactionSpans(text, patient, claims)` | 1733 | NFKC + unbracketed + `merge(matchesIn(...letterSubject))`: spans, but with the **letter** subject (initials, patterns and DOB labels on) | yes |
| `datesIn`, `dateForms`, `compactIdentifier`, `identifierCandidates` (1895), `survivorIn`/`survivorLeft` (1561/1664) | – | helpers | partly |

**What the verifier needs is "spans, with the narrative subject"**, which no export gives today: holdsNameOrNumber is a
boolean, and redactionSpans uses the letter subject. The smallest pure API to share is something like
`identifierMatches(normal, { names, numbers, … }): {start,end,kind}[]` = `merge(matchesIn(normal, subject))` (kind kept,
placeholder dropped), with holdsNameOrNumber re-expressed as `identifierMatches(masked(text), …).length > 0` so the two
cannot drift.

**Size of what moves.** matchesIn reaches lines ~75-958 (dates, fold/view, forms, labels, initials) and, through
`patternMatchesIn`, ~959-1672 (SSN/phone patterns, decideBare/decideNamed, NPI check, survivor scan). That is about 1,700
of 2,250 lines (128,891 bytes for the whole file). The screen's run tokenizer (1823-2250: identifierTokenRuns,
identifierCandidates, runIndex, someIdentifierRun, screenIdentifier) is separate and could stay in the gateway, except
that redactLetterForScreen (1765) uses identifierCandidates. If SSN/phone patterns are out of the verifier's scope, they
still move with matchesIn unless matchesIn is split (patterns behind a parameter or a callback).

## 3. Inputs: the verifier versus the gateway

- Verifier today (packages/packets/src/verifier/mismatches.ts:250-284; call at 333-336): `identifierSpans(text,
  identifiers: string[], skip)`, a **flat** list. Forms are the whole value and each word split on `[\s,;/]+`, at least 2
  letters or digits. The match is a case-insensitive whole word with `\s+` for spaces. It runs on `readableText(narrative).text`
  (packages/packets/src/readable.ts: per-cluster NFKC with **hidden characters removed** and flagged `hidden_character`),
  and positions map back through `readable.original`. `skip` is the scan's placeholders, citation markers, and date/month/month_day figures.
- Server sources: apps/worker/src/packets/identifiers.ts `ScheduleIdentifiers { all, names }`. The worker already knows
  which values are names. Today `verifyNarrative` receives only the flat list (services.ts:130, verifier-now.ts:51,
  gateway narrative.ts:136 passes `input.identifiers`). There are no dates of birth (none selected), so `datesOfBirth: null`.
- **Number kind matters.** Probe2: number 20260305 in "Claim 2026-03-05" is found only when it is a *claim* form, and in
  "Member ID 2026-03-05" only when it is a *member* form. holdsNameOrNumber passes every number as memberIds only, so it
  misses the claim-labeled case. Since the verifier's numbers have no kind, pass each number as **both** a member ID and a
  claim (`memberIds: numbers, claims: [numbers]`). Probe2 "both" flags both labels, and amounts stay unflagged.
- Names and numbers split: use the worker's `names` if the verifier's signature is widened. Otherwise use the gateway's
  rule (identifierKinds: no digit means a name). A letters-only member ID would then be matched as a name, which still finds it,
  with name gaps.

## 4. Probe results (probe-out.txt, probe2-out.txt, probe4-out.txt)
On readableText(raw).text: verifier `identifierSpans` versus gateway `merge(matchesIn(…, narrative subject))`. ids: ORLA VANTREE,
MARY O'BRIEN-SMITH, JOSÉ GARCÍA, STRAUSS, ZZ1234567, 900123456, SYN555001, 1234567890, 20260305.

| Text | verifier | gateway |
|---|---|---|
| Patient Jose Garcia / JOSE GARCIA | – | flagged (marks folded) |
| Mary O’Brien–Smith | "Mary" only | whole name |
| Mary OBrienSmith | "Mary" | whole |
| Van-⏎tree | – | flagged (hyphenation) |
| Van­tree | flagged (readable strips SHY) | flagged |
| Dear​Orla | – | – (readable strips ZWSP, giving "DearOrla"; still fails as `hidden_character`) |
| ZZ 1234567 / ZZ-123-4567 / zz_1234567 | – | flagged |
| ID: 900-12-3456 (own member ID) | – | flagged |
| SYN-555-001 / ClaimSYN555001 (glued label) | – | flagged |
| STRAUß | – | flagged (ß→SS) |
| In Orla. Vantree next. | two spans | one span "Orla. Vantree" |
| ＺＺ１２３４５６７ (fullwidth) | flagged | flagged |
| $1,234,567.89 / 2026-03-05 / 97110 / NPI 1234567893 (not ids) | – | – |
| $12,345.67, 03/05/2026, 2026-03-05 (not ids) | – | – |
| 20260305 compact (an id) | flagged | flagged |
| $12,345,678 / $123,456.78 / $123456.78 with id 12345678 | – | – (no over-flag on amounts) |
| NPI 1234567893 / Code 97110 when that *is* an id | flagged | flagged (same as today: the value is the case's own) |
| SSN 900-55-0101, phone 202-555-0123 (not the case's) | – | – (patterns off, as holdsNameOrNumber and redact.test.ts:552 intend) |
| "Paid on June 5" (patient JUNE) | – (skipped: month_day figure) | **"June" flagged**. Keep the verifier's dated-figure skip for name-kind matches |
| "Claim 2026-03-05" for claim 20260305 | – (skipped as a date) | flagged (both kinds). **The verifier's whole-overlap skip of date figures would drop this #115 form** |
| [PATIENT_NAME_1], [MEMBER_ID_1], [1] markers | – | – |

Skip handling to keep: drop matches that overlap placeholders or markers (as today). For dated figures, drop only
**name-kind** matches inside a dated figure (a month word). Let number-kind matches stand, because matchesIn already
keeps a number's own unlabeled written date (writtenAsDate + labelFor). Otherwise the labeled-date fix is lost. The
alternative is to mask the skip spans length-preservingly (each unit → BARRIER) before matching. That works for
placeholders and markers, but not for dated figures, for the same reason.

## 5. Cost (probe.ts, probe3.ts; tsx on node 24, warm, this container)
| Case | verifier today | gateway matchesIn+merge |
|---|---|---|
| 10,380-char text, 9 ids | 0.16 ms | 7.5 ms |
| same, 80 ids | 29 ms | 73 ms |
| same, **0 ids** (browser path) | ~0 | **4.5-6.9 ms** (two date views plus the join view are built regardless) |
| typical 138-char narrative, 2 ids | – | 0.34 ms |

The verifier must short-circuit on an empty identifier list. The browser always passes [], and check.ts runs on every
keystroke. With that, the editor pays nothing, and the server pays well under 10 ms for a realistic narrative. The bundle
grows by roughly the moved core (~95 KB of source before minification) in the web client chunk that imports
@tp/packets/check, unless it is code-split or imported only on the server path.

## 6. How the gateway tests compare (oracles)
- redact.property.test.ts (1,568 lines). The oracle is **the generator, never the matcher** (header 8-24). Segments are
  written by `writePart` (49: marks, ß, typographic apostrophes/dashes, spaced, invisible variants), `writeNumber` (91)
  and `assemble` (253), which record where each secret was written. MOD-13 asserts that no letter or digit of a secret survives,
  and pins the label-boundary seeds (397-588). MOD-14 covers the screen, MOD-15 SSN/phone (`writeSsn` 1019, `writePhone`
  1043, survivors 1249-1316), and MOD-16 keeps amounts, dates, NPIs, codes and named numbers unchanged (1474-1563).
  These generators are file-local, not exported. A verifier differential would need them moved to a test-support module or
  re-created.
- **A legacy oracle uses the verifier's code**: redact.property.test.ts:1 and :306 build "today's code" from `@tp/packets`
  `identifierForms` (`legacyReplaced` 289, `legacyPattern` 280). If the fix changes or removes `identifierForms`, that
  gateway oracle changes too. Keep `identifierForms` exported and unchanged (it is in the packets index, index.ts:150),
  or freeze a copy into the gateway test.
- redact.test.ts:552-557 pins holdsNameOrNumber with patterns off (SSN/phone shapes not flagged unless they are the case's own number).
- Suggested differential (the verifier and the matcher never drift): over generated narratives (the gateway generators
  plus packets' amounts, dates, markers and placeholders), `verifier flags identifier_in_narrative` ⇔ `holdsNameOrNumber(readable.text with skip spans masked, {names, numbers})`
  (with kinds as in section 3), and each flagged span's letters and digits ⊇ every generator-recorded secret position. Also check
  `identifierSpans ⊇ old identifierSpans` (a frozen copy, as narrative-roles.base.fixture.ts does) so nothing caught today is lost.
- Mutation equivalents reference the current verifier code by `original`+`occurrence`
  (tools/stryker/equivalent/packets.json:916-953: `/[\s,;/]+/`, `[]` occurrence 13, `form.trim()`,
  `identifier.normalize('NFKC').trim()`; tools/stryker/unicode.json:31). Rewriting identifierSpans/identifierForms makes
  entries stale, and the gate fails on stale entries (tools/stryker/gate.ts:381). Update them in the same change.

## 7. Notes for the fix
- ADRs to amend: 0047 (docs/adr/0047-…md:42-47, "the verifier fails every whole-word occurrence … without regard to case")
  and 0054 (the redact-placeholders amendment at 274 and the redact-ssn-phone amendment at 516; residuals at 274+158).
  No new ADR is obviously needed.
- Hidden characters: readable.text has already removed them, so "Dear<ZWSP>Orla" fuses into "DearOrla" and is not flagged
  as an identifier. The narrative still fails on `hidden_character`. Optionally also run the matcher with the hidden
  characters read as VANISHED, by matching on a readable variant that keeps them as U+00AD at the same positions.
- Engine, ledger, amounts, stages and packet content are untouched. Only the set of `identifier_in_narrative` mismatches changes,
  and only by growing, plus "Orla. Vantree" merging into one span. The span count can change where merge joins adjacent matches.
