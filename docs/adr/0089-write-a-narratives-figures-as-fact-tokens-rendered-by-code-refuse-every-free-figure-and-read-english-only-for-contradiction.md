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
`$ % § # ¢`: a digit of another script (`٣`) and a numeral NFKC leaves as it is, letter-like or other (`ↀ`, `௰`,
`〡`), not only a decimal digit, each a `free_figure` beside its `unreadable_figure` (pinned, review round 5). Scanning without the option is unchanged for every importer (ADR 0086's reader, the facts, the assembly,
the catalog, the gateway's figures, the evidence requests, the evaluation's faults and score); their tests pass
unchanged.

**Pass 1, the template** (`verifier/template.ts` `readTemplate`). Six new closed codes: `free_figure` (a figure
written in digits, a sign or a numeral: a number, an amount, a percent, a date, a code, a Roman numeral after level,
appeal or tier, an ordinal day of a month, an identifier-like run, and a number character of the template as typed
that normalization reads as letters, such as the Roman numeral character "Ⅻ", which NFKC reads as "XII" while the
renderer prints "Ⅻ"), `number_word` (a figure in words, the strict-only words and zero phrases included),
`unknown_fact`, `fact_not_canonical`, `fact_contradicted` and `fact_not_separated`. Mismatch `kind` gains `fact`.

**A token stands apart** (`fact_not_separated`, at the token's span; the review of slice 2). The renderer prints a
phrase where its token stands, and some phrases begin or end with a bare figure (units "2 units for line 1", a code
"97110", a level, every `line.N.*` phrase ending "line N"). A character typed against a token would print as part of
that figure: "-{{fact:pattern.units}}" prints "-6 units", ".{{fact:line.1.units}}" prints ".2 units",
"{{fact:code.97110}}-GP-KX" prints modifiers the content does not hold, and two tokens glued together print "line 12
units". Neither pass read it: pass 1 masks the tokens and pass 2 reads each as a stand-in with a space on each side. So
a token must have, in the text as read, whitespace, an opening bracket or quotation mark, or the text's start before
it, and whitespace or the text's end after it with only closing punctuation (`. , ; : ! ? ) ” ’ "`) between, however
long that run (review round 3: a check that read 16 characters let "{{fact:code.97110}}" and 16 closing quotation marks
then "-GP-KX" through, printing modifiers the line does not carry). Anything
else against it (a sign, a point, a comma or slash before it, a letter, a digit, another token) fails the token. The
one rule holds for a person and a model: serializeDraft joins segments as they stand, so a text segment ending in "-"
before a fact segment fails the same way. A new code rather than `unknown_fact` or `free_figure`, because the person's
fix is a space, not another figure; the editor says so. Accepted false refusals: a possessive or a hyphenated word
against a token ("97110’s rate", "{{fact:pattern.lines}}-line"), which the person rewords. Accepted readings (review
round 2): two tokens one space apart pass ("{{fact:line.1.paid_on}} {{fact:line.1.units}}" prints the two phrases side
by side), because each phrase is printed whole by code, the space keeps the figures apart and neither changes; the
sentence may read awkwardly, which is wording for the person, not a figure. A sign set off from a token fails it too
(review round 2): reading back past whitespace, opening brackets and quotation marks before a token, a sign (the
hyphen-minus, the minus, plus, plus-minus and minus-plus signs, the tilde, the hyphens, the figure and en dashes) or a
currency sign there fails it ("- {{fact:pattern.units}}", "-({{fact:pattern.units}})", -"{{fact:pattern.units}}",
"$ {{fact:code.97110}}"), and so does a sign's word there ("negative", "negatively", "minus", "plus", "positive", in any
case), each as `fact_not_separated` at the token's span, because each would print beside the phrase's bare figure as a
signed one ("- 6 units", "negative 6 units"). The rule is /3's own, in the separation check, so /2 and ADR 0086's
shared reader are unchanged and nothing served changes; "minus" before an all-lines fact also stays
`fact_contradicted` as a part word. Accepted false refusals: a token after "plus" or "positive" used as a conjunction
or an adjective, which the person rewords. The em dash and the horizontal bar are punctuation between clauses, not a
sign, so a token after one set off by a space passes. The check reads back from each token's start only (review round 3:
one sticky lookbehind, matched backwards from that one position): past any run of set-off characters, with no limit,
so 200 spaces and then "-" still fail, a sign there, or a sign's word with no letter before it ("nonnegative" passes).
Each token costs the characters between it and the text before it, and those runs never overlap, so a template checks
in time linear in its length; regular expressions over the whole text before each token took about 20 s on a
19,224-character template under the worker's 20,000-character cap. A run of closing punctuation after a token is read
the same way, from the token's end. The non-breaking hyphen (U+2011) is listed but never reached: the text as read is NFKC,
which maps it to the hyphen (U+2010), also listed. /2's rules all still apply: hidden characters, unreadable figures, the case's identifiers, identifier
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
A part fact beside a part trigger passes, and an all-lines fact beside a total cue passes. A stand-in the reader does
not read as one figure of its own (a sign before it, "$ 1" read from the "$"; one that runs past it, "1 %") fails its
token closed as `fact_contradicted`, and the check returns a report, never throws.

**The code draft at /3** writes the same statement with every figure a token a model may also use (no row-bound id),
and names a fact only where the catalog holds it. ADR 0086's sentence splits stay: the codes and the service dates are
in sentences with no all-lines amount. A property holds that it passes /3 for every generated pattern.

**Accepted false refusals** (the scanner's one list, named in the mark with a rewording, and told to the model in its
system prompt from slice 6): "one of the lines", "first" ("To begin,"), "once", "double-check", "a quarter" (of a year),
"the dollar amount", "level one" (it must be `{{fact:packet.level}}`), "on one of the lines" (also a part beside an
all-lines fact). Ordinal days and Roman numerals are figures (`free_figure`), by the design's section 2.4 table.
Letters spelling a Roman numeral outside level, appeal or tier ("XII units", "IX visits") and Han numerals (letters,
not number characters) stay prose, as the design's one list has it; widening the list is a design change (Revisit
when).

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
- The six new codes are added to the report's closed code list for /3 reports only.

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
  `draft-template.test.ts`, `serialize.test.ts`, `verifier-contradiction.test.ts`), the /2 differential, the /3 draft
  stating what the /2 draft states (its amounts, interest exactly where /2 states it, every code the catalog holds, and
  every other figure /2 writes: the version, page, percentage, year, reference, release, counts and dates, but a code
  of another shape or a reference in braces, which have no fact), the /3 draft's text for each method and edge (no rate,
  no year or percentage, no release or two (the last cited, as /2 cites it), a braced reference, off-shape codes only),
  interest computed at $0.00 because every line was paid on time (no interest stated at /2 and no `interest.total` at
  /3; the founder's ruling of 2026-10-20, Q4 (a)), the zero-amount table and the set-off signs pinned
  from literal lists, a claim or a patient read as a part from exactly two, the separation check's time on
  100,000-character templates,
  pass 1's spans in template offsets after a hidden character or a lengthening normalization, and the properties of
  section 8 this slice owns (the code draft passes /3; a digit or a word of the scanner's tables inserted fails at its
  span; a sign, a point or a letter typed against any token, or a sign or a sign's word set off before it, fails at that
  token's span; a part-naming token beside an
  all-lines fact fails unless covering; a total cue beside a part fact fails; serialization keeps the sentence
  count). Each ran under 40 seeds before the pull request. The code draft (`draft.ts`) is mutated in the
  packets-template shard with the template's check and its serialization (review round 3); its interest guard's
  conjunction made a disjunction is killed by the $0.00 case, not recorded as equivalent (review round 4); the two
  records of that guard that stay (its first two checks, or its second, replaced by true) argue only their own
  replacement, which leaves `interestStated` false wherever interest or its total is null, and a test keeps the
  disjunction out of their reasons (review round 5).

## Not covered

- The migration and the format flip (slice 3); the worker's export, write and approval path, `verifierNow`'s
  `rendered_sha256`, `rendered_changed` and `schedule_changed` (slice 4); the editor's picker, preview and one-click
  conversion (slice 5; the web's `mismatchShown` already has plain cases for the six codes); the gateway's prompt v2,
  segment schema and use of `serializeDraft` (slice 6); the v2 evaluation set (slice 7).

- The scanner's own cost on a very long run of letters followed by whitespace, or of quotation marks (shared with /2's
  scanner, which this slice does not change; about 0.8 s for 40,000 letters, growing with the square of the run): the
  timing test of the separation check uses inputs the scanner reads in linear time.

## Not verified here

- The database tests (no migration in this slice) and real providers.

## Revisit when

- The evaluation's `fact_contradicted` rate (slice 7) shows careful drafts refused by cues beside phrases: consider a
  short phrase form per fact (design section 10), never a looser check.
- People's narratives show an accepted false refusal often enough to cost more than its rewording.
- A free figure in letters outside the scanner's one list (a Roman numeral spelled in letters outside level, appeal or
  tier; a Han numeral) is seen in a draft: widen the list in the design first, then strict mode.
- A patient subset is needed beyond rows (it needs `tp-packet/3`).
