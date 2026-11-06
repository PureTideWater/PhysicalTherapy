# 0089. Write a narrative's figures as fact tokens rendered by code, refuse every free figure, and read English only for contradiction

- **Status:** proposed (`co-001/packet-figure-placeholders`, Lane B, slice 2 of the design
  `lane-b-packet-figure-placeholders`); accepted when the founder approves its pull request (docs/adr/0063). Amends
  [0086](0086-read-every-narrative-figure-in-the-role-its-words-give-it-and-hold-each-input-to-the-roles-its-record-gives-it.md)
  (its "Revisit when" item on placeholders is done here; its reader stays, as the contradiction check of format /3 and
  as format /2's whole reading) and takes over the `/3` migration 0086 reserves for Lane A, so that migration is
  written once. Reverses none of 0086's rulings. Its consequences are completed with slice 7 (the evaluation).
- **Date:** 2026-11-06
- **Deciders:** Lane A's orchestrator, 2026-11-04 (a narrative's figures become placeholders bound to fact ids, rendered
  by code, and a model's free-text number is refused); the build (Lane B), for the design's choices and its two
  reviews' findings (PE-1 to PE-10, GW-1 to GW-15), each reversible by the founder; the founder, on the pull request's
  review
- **PRD sections:** 12 (The packet: "any figure that is not in the input fails verification"), 14
  (draftPacketNarrative), 7 (Packet builder: the narrative editor), 18 (Mutation testing); CLAUDE.md rule 1; test
  matrix CAS-52 to CAS-55

## Context

ADR 0086 reads every figure of a narrative in the role and scope its English words give it. Its known limit: a
sentence that names a part of the lines in words its trigger list does not hold ("on a subset of the lines",
"apiece", "for her") still passes a total. The review rounds of 2026-11-04 found new words each pass; a list of
English words cannot close the class. Slice 1 (#128) built the facts' catalog (`packages/packets/src/fact-catalog.ts`:
every value a narrative may name, each with its id, kind, role, scope, rows and phrase, and one canonical id per set
of lines) and the renderer (`render.ts`: each `{{fact:<id>}}` becomes its phrase, every value printed by code, with a
span map from template to rendered text). Nothing emitted a token, and the verifier did not read one: a fact token
passed format /2 silently.

## Decision

A narrative is a template: free text, markers, identifier placeholders and fact tokens. Code prints every figure, with
its role and the lines it covers; free text holds no figure; English is read only to find a sentence that contradicts
a token. This slice builds the verifier format `tp-packet-verifier/3` and the code draft that writes it, behind an
explicit format, so nothing served changes.

**(a) Nothing served changes.** `VERIFIER_FORMAT` stays `tp-packet-verifier/2`. Format /3 is reached only by naming it:
`verifyTemplate(template, content, identifiers)` and `verifyAtFormat(format, narrative, content, identifiers)` in
`@tp/packets`, and `checkTemplate` in `@tp/packets/check`. Every caller (web, worker, gateway, evaluation) keeps its /2
behaviour byte for byte: `verifyAtFormat` at /2 is `verifyNarrative` over `narrativeFacts(content)`. The code draft
(`draft.ts` `draftNarrative`) writes fact tokens only when asked for /3 (`{ format: VERIFIER_FORMAT_V3 }`); its default
output is the text it wrote before, held byte for byte against a copy of that function
(`legacy-draft.test-support.ts`) over every named content, the role reader's contents and two generators, a thrown
error (a fraction of a cent) included. So the gateway's local provider and every test see today's text.

**(b) Fail closed on tokens.** Under /2, any `{{...}}` run that is not an identifier placeholder, and any lone `{{` or
`}}`, fails as `unknown_placeholder` at its span (`verifier/mismatches.ts` `strayBraces`): a fact token can no longer
pass /2. Under /3, any `{{` or `}}` that neither the fact pattern nor the identifier pattern reads, and any well-formed
id the catalog does not hold for this content, is `unknown_fact`; a token whose characters differ from what it shows
(fullwidth braces, a hidden character inside) is `unknown_fact` too, since the renderer reads the text as written. A
well-formed id that names its set by a lower subject is `fact_not_canonical`, its mismatch carrying the canonical id
(the catalog's `lookupFact`, the one rule the picker and the verifier share). A malformed token is never echoed: a
mismatch holds codes, positions and a canonical id only, and the web shows none of its text.

**(c) The /3 report** is the /2 report's keys plus `rendered_sha256`, with `format: 'tp-packet-verifier/3'`.
`narrative_sha256` stays the SHA-256 of the stored template; `rendered_sha256` is the SHA-256 of the template rendered
with identifier placeholders left unfilled (no identifier is hashed), or of no text when a token renders nothing (such
a report always fails). `passed` is no mismatches. The report type allows both formats (`VerifierReportV2 |
VerifierReportV3`).

**(d) Spans are template offsets.** Every mismatch, pass 2's included, is reported at its span in the stored template:
pass 2 reads the rendered text through the renderer's span map and reports each contradicted token at that token's
template span, so the editor's and the display's marks stay on the stored text.

**(e) `serializeDraft`** (`packages/packets/src/serialize.ts`, pure, browser-safe) writes a drafted narrative's segments
as a template, by section 2.3 of the design: a sentence is its segments joined as they stand, a fact segment written
`{{fact:<id>}}`; then ` [n]` per source in the order given, before the sentence's final `.`, `!` or `?` when its last
segment is text ending in one, and followed by `.` otherwise (a sentence ending in a fact, or in text with no final
mark); sentences joined by one space, paragraphs by a blank line. Its shapes are plain types with no schema library
(`DraftOutput`, `DraftParagraph`, `DraftSentence`, `DraftSegment`). A property holds that the verifier's sentence count
of the serialized text equals the drafted count and each verifier sentence carries exactly its drafted markers
(`templateSentenceSpans`, the rule exported for the gateway's schema). The gateway does not use it yet (slice 6).

**(f) Strict scanning, one list.** `scan.ts`'s tables (`UNITS`, `TEENS`, `TENS`, `MULTIPLIERS`, `SCALES`, `ORDINALS`,
`MULTIPLES`, `NUMBER_WORDS`) are exported, and `scanText(text, { strict: true })` is pass 1's reading: fact tokens
masked first, then identifier placeholders, then any other braced run or lone brace (a stray), then markers; every
figure read with no lone "one" or "zero" exemption; and these strict-only additions: nil, nought, naught, billion,
quarter, double, triple, once (`STRICT_NUMBER_WORDS`); the plurals of the cardinals, the multipliers and scales and the
fractions third to millionth, halves and quarters, but not "firsts" or "seconds" (`STRICT_PLURALS`); dollar, dollars,
cent, cents, penny, pennies (`CURRENCY_WORDS`); a zero amount after a payment or allowance verb ("paid nothing",
"allowed none", "made no payment", "nothing was paid": `ZERO_AMOUNT_PHRASES`); and any leftover `\p{N}` character or
`$ % § # ¢`. Scanning without the option is unchanged for every importer (ADR 0086's reader, the facts, the assembly,
the catalog, the gateway's figures, the evidence requests, the evaluation's faults and score); their tests pass
unchanged.

**Pass 1, the template** (`verifier/template.ts` `readTemplate`). Five new closed codes: `free_figure` (a figure
written in digits, a sign or a numeral: a number, an amount, a percent, a date, a code, a Roman numeral after level,
appeal or tier, an ordinal day of a month, an identifier-like run), `number_word` (a figure in words, the strict-only
words and zero phrases included), `unknown_fact`, `fact_not_canonical` and `fact_contradicted`. Mismatch `kind` gains
`fact`. /2's rules all still apply: hidden characters, unreadable figures, the case's identifiers, identifier
placeholders naming no kind or row, markers naming no source, sentences with no marker, an empty template. Sentences
are counted with each token read as a word, so a token can stand alone as a sentence and the dots inside an id never
end one.

**Pass 2, contradiction only** (`verifier/contradiction.ts`). The rendered text is given to ADR 0086's reader
(`roles.ts` `readAround`) with each fact's phrase replaced, through the span map, by a stand-in figure of its kind (an
amount, a percentage, a date or a number) that carries no words: a token's role and scope are the catalog's and its
phrase is never read again. A token fails as `fact_contradicted` when:
- its free-text role cue (ADR 0086's steps, one cue's roles) names roles that do not include the fact's, names several
  the figure must be held in every one of, or puts it in a "respectively" list in neither plain form; a token with no
  role (a code, modifiers, a quote, a reference) has none to contradict;
- it is an all-lines fact (the pattern's totals, counts and span) in a sentence that holds a word of ADR 0086's closed
  trigger list in its free text (`NumberReader.wordPart`: a part of the lines; a claim or a patient where the pattern
  has more than one; a scope phrase of each line beside no figure), a scope phrase of each line or unit right after
  it, or a part-naming token: every `code.*`, `line.*`, `lines.*` and `claim.*` id, and every identifier placeholder,
  which names its row. Exemption: part-naming tokens whose rows together cover every line (each code of a two-code
  pattern), a union code computes over row sets;
- it is a part fact (an amount, units or a count of a code, a claim, a line or a set of rows) in a sentence that holds
  a total cue in its free text: `roles-reader/cues.ts` `totalCues()`, the one list, built from the reader's tables
  ("in total", "in all", "total", "totals", "altogether", "overall", each or every line, and all of or across the
  rows: "all the lines", "across the lines").
A part fact beside a part trigger passes, and an all-lines fact beside a total cue passes.

**The code draft at /3** writes the same statement with every figure a token a model may also use (no row-bound id),
and names a fact only where the catalog holds it. ADR 0086's sentence splits stay: the codes and the service dates are
in sentences with no all-lines amount. A property holds that it passes /3 for every generated pattern.

**Accepted false refusals** (the scanner's one list, named in the mark with a rewording, and told to the model in its
system prompt from slice 6): "one of the lines", "first" ("To begin,"), "once", "double-check", "a quarter" (of a year),
"the dollar amount", "level one" (it must be `{{fact:packet.level}}`), "on one of the lines" (also a part beside an
all-lines fact). Ordinal days and Roman numerals are figures (`free_figure`), by the design's section 2.4 table.

**The residual: English that names a part without a token or a listed trigger** ("on a subset of the lines",
"apiece", "for her", "to the claimant"). Such a sentence still passes, but it can no longer change what the payer
reads: the figure prints its own set ("a shortfall of $202.50 in total for the 6 lines"), stated by code. The prose
can be clumsy; it cannot make a figure mean another set. English is read only for contradiction, never to decide a
figure's role or scope, so ADR 0086's trigger list stops growing.

**Real providers stay `no_entry`** at the evaluation gate until a recorded run of prompt v2 (slice 6 and 7): the local
provider's run proves the pipeline only.

**Deploy order.** Slice 3 (Lane A's migration and the one-line `VERIFIER_FORMAT = '/3'`) must ship with or after slice
4 (the worker's export renders the template, checks `rendered_sha256` and asserts no `{{` survives), because the export
prints only rendered text: a /3 template exported by today's worker would print its tokens.

**Notes for slice 3's migration**, decided here:
- A /3 report's mismatch may carry a sixth key, `canonical`, on `fact_not_canonical` only (a fact id, never text), and
  kind `fact`; `packet_verifier_report_valid` must accept both in /3 reports. The editor offers the canonical id from
  the stored report without recomputing the catalog.
- The five new codes are added to the report's closed code list for /3 reports only.

## Alternatives considered

- **Grow ADR 0086's trigger list.** Rejected: review rounds found new words each pass; rule 1 would still rest on
  reading prose.
- **Placeholders for a model only, people read by ADR 0086.** Rejected: the known limit stays in every person-written
  packet, most of them before a model is served.
- **Flip `VERIFIER_FORMAT` in this slice.** Rejected: the database accepts no /3 report until slice 3's migration, and
  the export prints tokens until slice 4.
- **Bare figures in tokens, scope read from prose.** Rejected: it keeps the limit; scope must be printed by code.
- **Read the phrase's own words in pass 2.** Rejected: "the payer paid the allowed amount of ..." would read the
  phrase's "allowed" as the cue; the catalog is the authority for a token's role and scope.
- **Leave /2 passing a fact token.** Rejected: a template saved under /2 would pass with tokens no export renders.
- **Zero-amount phrases as pass-2 cues** (the review's suggestion, PE-2). Not taken: "paid nothing" states the figure 0
  in prose, so pass 1 refuses it outright.

## Consequences

- Every figure of a /3 narrative is computed and phrased by code with its role and set; a part named beside a total,
  or a total named beside a part, fails.
- A stored /2 narrative that held stray double braces would now read `fails_now` (none of the tests' or the synthetic
  sets' does). A fact token can no longer pass /2.
- The stricter scan refuses the accepted false refusals above in /3 free text; the person rewords in one step.
- Checks: CAS-52 to CAS-54 (`docs/product/test-matrix.md`; `scan-strict.test.ts`, `verifier-template.test.ts`,
  `draft-template.test.ts`, `serialize.test.ts`), the /2 differential, and the properties of section 8 this slice owns
  (the code draft passes /3; a digit or a word of the scanner's tables inserted fails at its span; a part-naming token
  beside an all-lines fact fails unless covering; a total cue beside a part fact fails; serialization keeps the
  sentence count). Each ran under 40 seeds before the pull request.

## Not covered

- The migration and the format flip (slice 3); the worker's export, write and approval path, `verifierNow`'s
  `rendered_sha256`, `rendered_changed` and `schedule_changed` (slice 4); the editor's picker, preview and one-click
  conversion (slice 5; the web's `mismatchShown` already has plain cases for the five codes); the gateway's prompt v2,
  segment schema and use of `serializeDraft` (slice 6); the v2 evaluation set (slice 7).

## Not verified here

- The database tests (no migration in this slice) and real providers.

## Revisit when

- The evaluation's `fact_contradicted` rate (slice 7) shows careful drafts refused by cues beside phrases: consider a
  short phrase form per fact (design section 10), never a looser check.
- People's narratives show an accepted false refusal often enough to cost more than its rewording.
- A patient subset is needed beyond rows (it needs `tp-packet/3`).
