# A packet narrative's figures are placeholders bound to facts and rendered by code (`co-001/packet-figure-placeholders`)

Lane B, design of 2026-11-04, after #84 (`co-001/packet-day-counts`, ADR 0086), revised the same day after two reviews
(section 11). Design step only: nothing was built, committed, pushed or posted. Read on `/home/user/packet-day-counts` at
bbe25cca (HEAD of `co-001/wip-packet-day-counts-2`) and `origin/claude/build-platform`. Reserved: ADR 0089; test-matrix
CAS-52 to CAS-55; `packages/synth` cases CAS-52 to CAS-55. Migration: one, for Lane A to build (section 6.3). Paths are
relative to the repository root. All data named here is synthetic.

---

## 0. The problem and the decision

- **The problem.** ADR 0086 reads every figure of a narrative in the role and scope its English words give it. Its
  known limit (ADR 0086, Consequences, "Known limit (2026-11-04)"): a sentence that names a part of the lines in
  words its trigger list does not hold ("on a subset of the lines", "apiece", "for her") still passes a total. The
  review rounds of 2026-11-04 found new words each pass. A list of English words cannot close this.
- **The decision** (Lane A's orchestrator, 2026-11-04). The narrative's figures become placeholders bound to fact
  ids. Code renders them at export. A model's narrative with a free-text number is refused.
- **This design, in short.**
  - The stored narrative is a template: text plus `{{fact:<id>}}` tokens.
  - A fact id names one value the version's own content holds, or a sum code computes over an explicit set of lines.
    One set of lines has one id (section 1, canonical ids).
  - Code renders each token as a noun phrase: the role's words, the figure and the scope, with the set of lines
    named. The payer reads what each figure is and what it covers from code, never from prose.
  - A template's free text holds no figure of any kind the scanner reads, from a model or a person (section 2.4).
    The scanner is the one list.
  - ADR 0086's reader stays only as a contradiction check over the rendered text, in both directions: a part named
    beside an all-lines figure, and a total named beside a part figure (section 4).
  - Verifier format `tp-packet-verifier/3` adds `rendered_sha256`. The approval and the export are both checked
    against it (section 5). That is Lane A's migration, the one ADR 0086 already reserves for `/3`.
  - The packet content format (`tp-packet/2`) does not change.

## 1. The placeholder form

**Syntax.**
- The token is `{{fact:<id>}}`. Its pattern is `FACT_PLACEHOLDER_PATTERN = /\{\{fact:([a-z][a-z0-9_.+]{0,95})\}\}/g`,
  in `packages/packets/src/placeholders.ts`, beside `PLACEHOLDER_PATTERN` (:12).
- An id is at most 96 characters (the grammar's `{0,95}` after its first letter). A set of rows whose canonical
  `lines.*` id would pass that has no id (`canonicalFactId` returns none; slice 1's review, MONEY-B-1): the narrative
  names such a set by its code or claim, or states its figures line by line.
- An id always starts with a letter. The identifier pattern `\{\{([a-z_]+):(\d{1,6})\}\}` therefore never matches a
  fact token, and the two renderers never take each other's tokens.
- The builder is `factPlaceholder(id)`.
- Any `{{` or `}}` that neither pattern matches fails as `unknown_fact` (section 4). Malformed tokens are never
  printed.

**Codes and modifiers in ids.** Ids are lowercase so that one code has one spelling.
- A code segment is the content's `procedure_code` lowercased: `code.g0283`, `code.0275t`, `code.97110`.
- Only a content code matching `^[A-Z0-9]{5}$` (the CPT and HCPCS shape) gets an id. The lowercase form is then
  one-to-one with the content's code. A content code of any other shape gets no code id: its lines are named by
  their rows, and the printed schedule shows its code.
- The renderer prints a code, and a modifier, **from the content**, never from the id. `code.g0283` renders `G0283`
  because the catalog entry points to the content row whose code is `G0283`.
- Modifiers: `line.<r>.modifiers` (one row's modifiers) and `code.<c>.modifiers` (present only when every line of
  the code holds the same modifiers). A modifier gets rendered only when it matches `^[A-Z0-9]{2}$`. They render as
  "modifiers GP and KX" or "modifier 59".

**What an id names.** An id is `<subject>.<measure>`. Each id is one entry of a new catalog,
`packages/packets/src/fact-catalog.ts`. An entry holds:
- the id;
- the kind (`amount`, `count`, `units`, `percent`, `date`, `date_span`, `page`, `version`, `release`, `year`, `days`,
  `code`, `modifiers`, `level`, `quote` or `reference`);
- the value's source: a path in content (`FigureSource.from = 'content'`, section 5), or the rows it sums over;
- its role (`FIGURE_ROLES`, `roles-reader/kinds.ts:10`);
- its scope (`unit`, `line`, `total` or `part`), and for `part` the set of lines;
- its phrase: the code-written words it renders as (section 5);
- whether a model may use it (section 2.2).

`narrativeFacts` (`facts.ts:257`; the `sum` helper is at :251) is rebuilt from the catalog, so the catalog and the
facts cannot drift apart. The subjects:

| Subject | Ids (examples) | Scope |
|---|---|---|
| The pattern (all lines) | `pattern.lines`, `pattern.claims`, `pattern.patients`, `pattern.units`, `pattern.expected`, `pattern.allowed`, `pattern.paid`, `pattern.variance`, `pattern.patient_share`, `pattern.service_dates` | total over all lines |
| Each line's equal value | `pattern.expected_each`, `pattern.allowed_each`, ... (present only where every line holds one value, as facts.ts does now) | line |
| A code | `code.97110` (the code itself), `code.97110.lines`, `.units`, `.expected`, `.allowed`, `.variance`, `.modifiers` | part (the code's lines) |
| A line | `line.3.expected`, `.allowed`, `.paid`, `.variance`, `.units`, `.service_date`, `.paid_on`, `.received_on`, `.window_ends_on`, `.code`, `.modifiers` | part (one row) |
| An explicit set of lines | `lines.1+2+4.expected`, `.allowed`, `.paid`, `.variance`, `.units`, `.service_dates` | part (those rows) |
| A claim | `claim.3.lines`, `claim.3.expected`, `.allowed`, `.variance` (the claim whose first row is row 3) | part (the claim's rows) |
| The contract or regulation | `citation.version`, `citation.page`, `citation.effective`, `citation.reference`, `citation.quote`, `contract.rate`, `contract.percent.<n>`, `contract.year.<n>`, `release.no.<n>` | none (`contract.rate`: unit or visit) |
| The packet | `packet.as_of`, `packet.level`, `deadline.ends_on`, `deadline.window_days` | none |
| Interest | `interest.total`, `interest.rate`, `interest.days_to_pay`, `interest.release` (only where `interestStated`) | total |

**Conditional ids** (an id the condition does not allow is `unknown_fact`):
- `contract.rate`: one fact, read from `citation.parameters` through `contractAmount()` (`assemble.ts:105`, exported
  for this). It exists only when the citation is a contract, the method is `FIXED_SCHEDULE`, `PER_VISIT` or a
  `LESSER_OF` whose schedule side is `FIXED_SCHEDULE`, and the amount is whole cents (`^\d+$`, as `facts.ts`
  `amount()` requires). No per-code rate exists: the content's per-code `contract_amount_cents` is the citation's one
  amount copied to every code (`assemble.ts:151,161`), and code must not label it as one code's own.
- `contract.percent.<n>` and `contract.year.<n>`: one id per entry of `pattern.contract_percentages` and
  `pattern.contract_years`, numbered from 1 in content order. `release.no.<n>` likewise over `rule_releases`.
- `line.<r>.window_ends_on`: only where the deadline basis is not `next_level_window` (`facts.ts:344,351`). Above the
  first level the payer's copy prints no first-level window.
- `deadline.window_days`: only at the first level, and only when exactly one distinct day count is stated across the
  `contract_window` sources (`facts.ts:369-373`). Several different counts make it ambiguous, so it is `unknown_fact`
  and the person cites the clause's page instead.
- Interest ids: only where `interestStated`.

**Canonical ids: one set of lines has one id.**
- A subset of the lines is named by exactly one subject, by this precedence:
  1. `pattern.*`, when the set is all the lines;
  2. `code.<c>.*`, when the set is one code's lines;
  3. `claim.<r>.*`, when the set is one claim's lines, written with `r` the claim's first row;
  4. `line.<r>.*`, when the set is one row;
  5. `lines.<a>+<b>+....*`, otherwise: rows ascending and distinct, at least 2 and fewer than all.
- The catalog holds only canonical ids. So:
  - a pattern of one code has no `code.*` ids except `code.<c>` itself (the code) and `code.<c>.modifiers`;
  - a claim whose rows are all the lines, or exactly one code's lines, has no `claim.*` ids;
  - a one-line claim has no `claim.*` ids; its row is `line.<r>`;
  - `lines.*` over a code's rows or a claim's rows is not canonical.
- A well-formed id that names a set by a lower-precedence subject (`claim.4` when row 4 is not the claim's first row,
  `lines.1+2` when rows 1 and 2 are code 97110's lines, `code.97110.variance` in a one-code pattern, `lines.2+1`)
  fails as `fact_not_canonical`. Its mismatch names the canonical id, so the editor offers it.
- The picker, the model's fact table and the verifier all use the same canonical rule (`canonicalFactId()` in the
  catalog). The id the picker inserts is the id the verifier requires.

**How each kind is computed.** Code computes every value; nobody types one.
- `pattern.*` and `code.*` amounts, units and counts are **the stored content values** (`pattern.expected_cents`,
  `pattern.codes[].variance_cents`, `pattern.units`, ...). They are already hashed; the renderer does not sum again.
- `lines.*` and `claim.*` are summed from the rows of the hashed content:
  - cents with `sumCents` from `@tp/money` (bigint);
  - units with the same decimal sum as `assemble.ts:147` (`sumUnits`, exported), printed in `canonicalNumber` form;
  - counts as integers.
- A property test holds that the row sum over a code's rows, and over all rows, equals the stored code total and
  pattern total for every amount and for units. A future assembly change that splits the two paths fails it.
- Every line's variance is above zero (`assemble.ts:239`), so no sign or offsetting-sum case exists.

**No patient subset.** The content holds no patient key: `assemble.ts:50` keeps it outside the content, only to
count patients. A person names a patient's lines by their rows. The printed schedule shows which rows are whose.
Adding a patient key would need `tp-packet/3`. Not taken: rows say the same thing with no new format.

**Rows are stable across versions only by meaning.** A new version's content is reassembled (`services.ts:156-170`).
A template's row-bound ids (`line.`, `lines.`, `claim.`) must therefore still name the same lines.
- A person's write carries the shown version's row map: the SHA-256 of `[row, service_line_id]` pairs.
- If the reassembled content's map differs and the template holds a row-bound id, the write is refused with
  `schedule_changed`, a web problem code with no database change. The person then sees the new schedule and saves
  again.
- A model's template holds no row-bound id (section 2.2), so no row map travels with a model draft. Its pattern,
  code and contract ids render from the content the write reassembles, which is the content its version holds.
  A code id that the reassembled content no longer holds fails the write's verifier as `unknown_fact`.

## 2. The code-written draft and the model's draft

**2.1 The code-written draft.**
- `draft.ts` `draftNarrative` writes tokens in place of `dollars()` and `String()`. For example:
  "The remittances show {{fact:pattern.allowed}} [3]."
- It stays the template that the draft property test holds, now to pass `/3`.
- It stays the local provider's synthetic output (`model-gateway/src/testing.ts:150-152`), now serialized from
  segments by `serializeDraft` (section 2.3) so the local run goes through the same path as a model's.
- ADR 0086's sentence splits (codes and dates in sentences of their own) stay: they keep a code token from being a
  part trigger beside a pattern total (section 4).

**2.2 The model's input: pattern-level ids only.**
- New prompt `draft-packet-narrative/2`: a new `v2/` directory with a CHANGELOG entry and new `PROMPTS` and
  `PROMPT_FILES` imports (`src/prompts.ts`). v1 is immutable.
- **No value is sent.** No amount, count, date, rate or quote. A model given no values cannot copy one wrongly or
  compute one. Without the quote, this purpose sends no document text (v1's only document text is the quote,
  `narrative.ts:70`), which removes its injection surface.
- **No row is sent.** The model is offered only the subjects `pattern`, `code`, `citation`, `contract`, `release`,
  `packet`, `deadline` and `interest`. It gets no `line.*`, `lines.*` or `claim.*` id and no row table. That keeps
  PRD 14's minimization (pattern-level facts only), keeps the prompt's size independent of the number of rows, and
  means no model choice can place an identifier placeholder in the prose (a claim's phrase carries one). People
  still name rows and claims through the picker. A model's template holding any other id fails as `unknown_fact` in
  the gateway's verify.
- **The exact input object** (`narrativeInputs` v2; the keys test at `narrative.test.ts:18-24` is replaced by one
  over these keys):

  ```
  {
    format: 'tp-narrative-input/2',
    citation_kind: 'contract' | 'regulation',
    method: <PACKET_METHODS enum>,             // the citation's method
    behavior: <PATTERN_BEHAVIORS enum>,        // what the payer did: a denial, a reduction, ...
    level: 'first' | 'above_first',
    service_dates: 'one_date' | 'range',
    interest_stated: boolean,
    requested_action: { kind: 'reprocess_at_contract' | 'reprocess_at_medicare', interest: boolean },
    sources: [{ marker: int, kind: <SOURCE_KINDS enum> }],
    facts: [{ id: string, kind: <fact kind enum>, role: <FIGURE_ROLES enum> | null,
              scope: 'unit' | 'visit' | 'line' | 'total' | 'part' | null, renders_as: string }],
  }
  ```

  - Every field except `facts[].id`, `facts[].renders_as` and `sources[].marker` is an enum or a boolean.
  - `facts[].id` holds the only content-derived text sent: a code (`code.g0283`). The grammar allows nothing else.
  - `renders_as` is the fact's phrase skeleton with its value slots, for example "the allowed amount of <amount> in
    total for the <count> lines" or "a shortfall of <amount> in total for the <count> lines of <code>". The model
    knows each token is a complete noun phrase and what it says (GW-9).
  - `requested_action` is not sent as text. The payer's copy prints `content.requested_action` after the narrative
    (`apps/worker/src/packets/html.ts:347`), with its level. The model refers to it in words and states the level,
    if at all, as `{{fact:packet.level}}`.
  - The array facts are indexed (`contract.percent.1`, `contract.year.2`), so several percentages are each a fact.
- **The fact descriptions are part of the prompt version.** `renders_as` and the per-id text come from
  `prompts/draft-packet-narrative/v2/facts.json`, which `promptContentSha256` (`prompts.ts:60-62`) covers: the
  function hashes `facts` when the file has one, so v1's hash is unchanged. Editing a description is therefore a new
  prompt version, a CHANGELOG entry and a `prompt_changed` re-evaluation (`eval/baseline.ts:167-170`). A drift test
  asserts that `facts.json`'s skeletons equal the packets phrase table (section 5) with the values slotted out, so
  the renderer and the prompt cannot say different things.
- **The pre-call identifier guard runs over the content-derived parts only.** `prepare` keeps `mentionsIdentifier`,
  but over the codes in the fact ids (and nothing else is content-derived). The fixed vocabulary (field names, enums,
  `renders_as`) is built with no content parameter; a unit test holds that by construction, so a patient surnamed
  Page, Day or Rate no longer refuses every draft with `identifier_in_input`. CAS-52 keeps a case with a synthetic
  surname equal to a vocabulary word. `narrative.test.ts:28` ("no `{{` in the user message") still holds.
- Rejected: sending the values "for reading only". They invite the model to judge or restate them, and nothing the
  model writes needs them, because code prints every value.

**2.3 The model's output schema and its serialization.**
- The zod schema (`schema.json` derived by `providerSchema`; bounds are enforced in zod, since `providerSchema`
  strips them, `prompts.ts:107-128`):

  ```
  { paragraphs: [ { sentences: [ { segments: [ {text: string} | {fact: string} ], sources: int[] } ] } ] }
  ```

  - paragraphs: 1 to 3 (as the prompt says); sentences per paragraph: 1 to 8; segments per sentence: 1 to 24;
  - `text`: 1 to 400 characters, holding none of `{`, `}`, `[` or `]` (a zod refinement; GW-5);
  - `fact`: matches `^[a-z][a-z0-9_.+]{0,95}$`, the token grammar's id;
  - `sources`: 1 to 3 entries, distinct, each 1 to 999;
  - two `fact` segments are never adjacent: a `text` segment stands between them;
  - a `text` segment holds no sentence-ending punctuation except at the very end of the sentence's last segment,
    under the verifier's own sentence-boundary rule (exported from the verifier), so one model sentence is one
    verifier sentence.
- `fact` is a string, not an enum. Ids depend on the content (codes), and a prompt's schema is fixed per version.
  Code checks the string against the model's subset of the catalog.
- **`serializeDraft`** (new, pure, `packages/packets/src/serialize.ts`, used by the gateway's verify, the eval and
  the local provider):
  - a sentence is its segments joined as they stand, a fact segment written `{{fact:<id>}}`;
  - then ` [n]` per source, in the order given, written before the sentence's final `.`, `!` or `?` when its last
    text segment ends in one ("... show {{fact:pattern.allowed}} [3]."), and followed by `.` when the sentence ends
    in a fact segment;
  - sentences joined by one space, paragraphs by `\n\n`.
- A property test holds that, for generated outputs, the verifier's sentence count after serialization equals the
  model's sentence count, and every verifier sentence carries its markers.
- The serialized text then goes through the `/3` verifier like any template. There is one rule for both writers.

**2.4 What free text may hold (decided, for a model and a person alike).**

The one source is the scanner, `packages/packets/src/scan.ts`. Its tables (`UNITS`, `TEENS`, `TENS`, `MULTIPLIERS`,
`SCALES`, `ORDINALS`, `MULTIPLES`, :150-195) are exported, and `/3`'s pass 1 runs `scanText` over the masked free text
in a strict mode. No second list exists.

| In free text | Decision |
|---|---|
| Any figure `scanText` reads, of any `FigureKind`: a digit run, an amount, a percent, a date, a procedure code, a Roman numeral after level, appeal or tier ("level II"), an ordinal day ("March fifth"), an identifier-like digit run; and any `\p{N}` after `readableText`, and `$`, `%`, `§`, `#`, `¢` | **Refused** (`free_figure`). Every figure is a token. |
| A number in words `scanText` reads: cardinals, teens, tens, hundred, dozen, score, thousand, million, ordinals first to millionth, half, twice, thrice, "<words> percent" | **Refused** (`number_word`). In strict mode a lone "one" or "zero" is not exempt (the exemption at `scan.ts:507` stays for the non-strict uses). |
| Words added to the scanner's tables for this: zero, nil, nought, billion, quarter, double, triple, once; plurals of the cardinals, scales and fractions (hundreds, thousands, millions, dozens, scores, halves, thirds, quarters); currency unit words (dollar, dollars, cent, cents, penny, pennies) | **Refused** (`number_word`). They are added to `scan.ts`'s tables, marked strict-only where the non-strict reader should not change. |
| A zero-amount phrase after a payment or allowance verb: "paid nothing", "allowed nothing", "made no payment", "paid none" | **Refused** (`number_word`): it states the figure 0 in prose. The fact is written `{{fact:pattern.paid}}`, which renders "payment of $0.00 ...". |
| Citation markers `[n]` | **Allowed for a person**, required on every sentence (unchanged). **A model writes none**: its text segments hold no `[` or `]` (section 2.3); code writes its `sources`. |
| CPT/HCPCS codes, modifiers | **Tokens** (`{{fact:code.97110}}`, `{{fact:line.3.modifiers}}`). A code in free text is a figure to the scanner, and a wrong code misleads, so it is never typed. |
| Dates | **Tokens** (`line.3.service_date`, `pattern.service_dates`, `deadline.ends_on`, ...). |
| Section numbers, regulation references, the clause's text | **Tokens** (`citation.reference`, `citation.page`, `citation.quote`). A contract section number that no fact holds is not stated; the page and the quote are. |
| Identifier placeholders `{{claim_control_number:3}}` | **Allowed for a person** (unchanged). **Impossible in a model's output**: text segments hold no `{` or `}`, and no fact a model may use renders one. This is new: today neither the gateway nor the verifier refuses a valid identifier placeholder in a model narrative (`verifier/mismatches.ts:337-339` flags only unknown ones). |

**Accepted false refusals**, recorded in ADR 0089: "one of the lines", "first", "once", "double-check", "a quarter"
(of a year), "the dollar amount", "level one" (it must be `{{fact:packet.level}}`). Each is named in the mark with a
rewording ("To begin,", "one line among them" becomes "a line among them"), so the person rewords in one step, and
the model is told the rule in its system prompt.

Why a person too: if people's figures were still read by ADR 0086's reader, the known limit would remain for every
person-written packet, and those are most of them before a model is served. The editor (section 3) keeps this easy.

**2.5 The v2 system prompt** (`prompts/draft-packet-narrative/v2/prompt.json`; `max_tokens` 4000 and `effort`
medium as v1; the model pins are v1's, unchanged; its SHA-256 recorded as for every version):

1. "You draft the narrative of a payment dispute packet that an outpatient therapy practice sends to a payer. Your
   draft is a proposal: code checks it, code prints every figure in it, and a person edits and approves it before it
   is sent. You cannot change, approve or send anything."
2. "The input, inside a <facts> element, is built by code. It holds no document text, no values and no identifiers:
   only what kind of citation and method apply, what the payer did, the level, whether interest is stated, the
   numbered sources, and a table of facts. Each fact has an id and says what it renders as."
3. "Write every figure as a fact segment holding a fact id from the table, never as text. A fact segment is printed
   by code as a complete noun phrase with its own value, role and lines, for example 'the allowed amount of <amount>
   in total for the <count> lines'. Write it where a noun phrase belongs, after neutral words such as 'the
   remittances show' or 'the contract sets', and do not repeat its role or its lines in your own words."
4. "Your text segments hold no digit, no money or percent sign, no number word (including zero, one, first, once,
   half, double and a dozen), no Roman numeral, no date, no code, and none of the characters { } [ ]. Write 'To
   begin,' rather than 'First,'. Never name a patient, a member or a claim, and never write an identifier."
5. "Write plain, factual, courteous sentences: what the contract or regulation requires, what the remittances show,
   the difference, and that the requested action printed after the narrative follows. Give every sentence the
   markers of the sources it rests on, from the sources listed, in its sources field."
6. "Answer with JSON that follows the schema exactly, one to three paragraphs, and nothing else."

## 3. The person's editor

`apps/web/src/components/packets/narrative-editor.tsx`:
- **Picker.** An "Insert figure" control lists the catalog's canonical facts, grouped by subject: Pattern, each code,
  each claim, each line, Contract, Deadline, Interest. Each entry shows its rendered phrase and value, for example
  "the allowed amount of $210.00 in total for the 3 lines". Choosing one inserts the token at the cursor.
  - "Sum of lines..." takes row checkboxes and inserts `canonicalFactId()` of the chosen rows: `pattern.*`, a code,
    a claim, one line or `lines.a+b`, whichever the precedence names.
  - It runs on `@tp/packets/check`, browser-safe like `narrativeFacts` today. Facts are figures, not identifiers, so
    they are not PHI.
- **The textarea shows tokens as typed.** A preview pane beside it shows the rendered text, with each figure as a
  chip carrying its role and scope as an accessible label. A plain textarea with a preview keeps keyboard, paste and
  screen-reader behavior simple, and the stored text is exactly what is typed.
- **A typed number** shows a live `free_figure` or `number_word` mark (from `checkReading`, every keystroke) with its
  fix. ADR 0086's reader reads the typed figure's role and scope:
  - When exactly one fact **other than `lines.*`** holds that value in that role and scope, the mark offers "Use
    {{phrase}}". One click replaces the typed text with the token; the person accepts each replacement. The match
    runs over the catalog's facts (linear in the number of facts), never over row subsets.
  - Otherwise, including any typed figure that could only be a sum of some rows, the mark says "Insert this figure
    from the list" and opens the picker filtered to that value, with "Sum of lines..." available. Code never guesses
    a row set.
  - Nothing is converted without the person's click, and a refused figure is never saved as passed.
- **A non-canonical id** shows a `fact_not_canonical` mark offering the canonical id ("Use the code's id").
- `mismatchShown` (`apps/web/src/lib/packets/view.ts:57-71`, an exhaustive switch) gains one case per new code. An
  unknown or stale fact shows its id's subject in words ("a figure for line 7, which this schedule does not have"),
  never the raw braces.

## 4. The verifier

`tp-packet-verifier/3` (`format.ts:27`). `readNarrative` (`verifier/mismatches.ts:306-357`) reads the template in
two passes.

**Pass 1: the template.**
- `scan.ts:341-361` masks fact tokens first, then identifier placeholders and markers, as it does for placeholders
  now. The digits inside `code.97110` or `lines.1+2` are therefore never read as figures.
- Then `scanText` runs over the masked free text in strict mode (section 2.4).
- New closed codes:
  - `free_figure`: any figure the scanner reads in free text that is written with a digit, a sign or a numeral
    (number, amount, percent, date, code, Roman numeral, identifier-like run).
  - `number_word`: any figure the scanner reads in free text that is written in words, including the strict-only
    words and zero-amount phrases.
  - `unknown_fact`: an id the catalog does not hold for this content (no line 7, interest not stated, a next level
    the payer's copy does not print, a `deadline.window_days` with several counts), or a `{{`/`}}` neither pattern
    reads.
  - `fact_not_canonical`: a well-formed id for a set that a higher-precedence id names, or a row set out of order,
    repeated, of one row or of all rows (section 1). The mismatch carries the canonical id.
  - `fact_contradicted`: pass 2.
- Unchanged: `hidden_character`, `unreadable_figure`, `identifier_in_narrative`, `unknown_placeholder`,
  `unknown_citation`, `sentence_without_citation`, `empty_narrative`.

**Pass 2: the rendered text, as a contradiction check only.**
- The template is rendered (section 5) with identifier placeholders left unfilled.
- ADR 0086's reader (`roles.ts`, `roles-reader/`) reads it, with each rendered phrase passed in as a pre-read figure.
  **A token's own role and scope are authoritative**: they come from the catalog, and the phrase's own words are not
  read again. The reader decides only whether the sentence around a token contradicts it:
  - **Role cue.** The nearest role cue in free text, per ADR 0086's order. A cue that names a role the fact does not
    hold fails as `fact_contradicted`. Example: "the payer paid {{fact:pattern.allowed}}" where paid and allowed differ.
  - **Part named beside an all-lines fact.** In the same sentence as an all-lines fact (`pattern.*` totals), each of
    these is a part trigger and fails it as `fact_contradicted`:
    - ADR 0086's closed trigger list in free text ("on the remaining lines");
    - any token that names part of the lines: `code.<c>` and every `code.*` id, every `line.*`, `lines.*` and
      `claim.*` id, and any identifier placeholder (each names its row's set; `{{patient_name:2}}` names row 2).
    - Exemption: when the part-naming tokens of the sentence together cover every line (each code of a two-code
      pattern named), they do not name a part. The union is computed by code over row sets.
    Example: "For {{fact:code.97110}}, the payer owes {{fact:pattern.variance}} [1]." fails on a pattern with 97110
    and 97112, as ADR 0086 fails it today.
  - **Total named beside a part fact.** In the same sentence as a part fact (`code.*`, `line.*`, `lines.*`, `claim.*`
    amounts, units and counts), ADR 0086's total-scope and all-lines words in free text ("the total", "in total",
    "in all", "altogether", "overall", "every line", "all the lines", "across the lines") fail it as
    `fact_contradicted`. ADR 0086's cue tables are exported from `roles-reader/cues.ts` as the one list. Example:
    "The total the payer owes is {{fact:lines.1+2.variance}} [1]." fails.
  - A part fact beside a part trigger passes, and an all-lines fact beside a total cue passes.
- **Why the known limit closes.** A trigger the list does not hold ("on a subset of the lines") no longer changes what
  the payer reads. The figure prints as "a shortfall of $90.00 in total for the 3 lines", its set stated by code, and
  any token naming a part beside it fails. The prose can be clumsy; it cannot make a figure mean another set. English
  is checked only for contradiction, never to decide a figure's role or scope. The residual is English that names a
  part without a token or a listed trigger ("for her"); there the payer still reads the figure's own set from code.
- Mismatch spans are reported in template offsets. The renderer returns a span map, so the editor's and the
  display's marks stay on the stored text.

**Hash.**
- `narrative_sha256` stays the SHA-256 of the stored template text (`verifier/index.ts:33`). `versionSha256`
  (`hash.ts:30-34`), which the approval names, still covers template and content.
- `/3` adds `rendered_sha256`: the SHA-256 of the rendered text with identifier placeholders unfilled, so no PHI is
  hashed and the hash is the same on every screen.
- The report's other keys and `passed = (no mismatches)` are unchanged.

## 5. Rendering at export and on screens

**`renderFacts(template, content)`** (new, pure, browser-safe, `packages/packets/src/render.ts`) returns `Segment[]`
(the ADR 0072 shape, `explain/figures.ts:47-52`) plus the span map.
- `FigureSource.from` (`explain/figures.ts:30-31`, today `'trace' | 'citation'`) gains `'content'`, with `path` into
  the content, or `rows` for a summed fact. ADR 0072's explain views are unchanged.
- Each figure's form, by kind:
  - `amount`: a new `dollars` formatter that is pure code (below), never by division;
  - `count`, `days`, `page`, `version`, `release`, `level`: `integer`, with the plural chosen by code ("1 line",
    "3 lines");
  - `units`: a new form `units`, printing the `canonicalNumber` decimal ("4.5 units"), never truncated;
  - `date` and `date_span`: the ISO calendar dates the schedule prints;
  - `percent`, `year`: `verbatim`;
  - `code` and `modifiers`: the content's text, set as a `code` segment.
- **A pure currency formatter.** `formatUsd` goes through `Intl.NumberFormat` (`packages/money/src/cents.ts:67-70`),
  and `formatUnroundedUsd` calls `formatUsd` (:80-89), so neither is free of ICU. `rendered_sha256` is compared across
  time and processes, so the renderer formats amounts with a new `formatUsdPlain` in `@tp/money`: the sign, `$`, the
  whole dollars grouped by commas in code, `.` and two digits, from `formatCents`. A golden test holds that it equals
  `formatUsd(amount, 'en-US')` on a fixed set of amounts, run in the worker's tests and in a browser test; an ICU
  change then fails that test rather than refusing saved versions.
- Phrases come from a word table in `packages/packets`, for example:
  - `pattern.allowed`: "the allowed amount of $210.00 in total for the 3 lines"
  - `pattern.allowed_each`: "the allowed amount of $70.00 per line on each of the 3 lines"
  - `code.97110.variance`: "a shortfall of $60.00 in total for the 2 lines of 97110"
  - `lines.1+2+4.paid`: "payment of $112.00 in total for lines 1, 2 and 4"
  - `claim.3.expected`: "the contract amount of $200.00 in total for the 2 lines of claim {{claim_control_number:3}}"
    (the identifier token is filled at export by `fillPlaceholders`)
  - `pattern.units`: "4.5 units in total for the 3 lines"
  - `contract.rate`, by `citation.method`:
    - `FIXED_SCHEDULE`: "the contract's fee-schedule amount of $70.00 per unit"
    - `PER_VISIT`: "the contract's amount of $70.00 per visit"
    - `LESSER_OF`: "the contract's fee-schedule amount of $70.00 per unit, the schedule side of the contract's
      lesser-of rule" (never "the contract amount" for the lines, which is `pattern.expected`)
  - `pattern.service_dates`: "service dates from 2026-03-02 to 2026-03-10"
  - `line.3.modifiers`: "modifiers GP and KX"
- The table, the catalog, the renderer's revision and `formatUsdPlain` join `WORDS_VERSION`'s inputs
  (`words-version.ts:16`), so the export job's words-version gate (`export.ts:316`) covers them. The model-facing
  skeletons are copied into the prompt's `facts.json` (section 2.2), with a drift test.

**Approval is bound to the rendered text.**
- `verifierNow` (`apps/worker/src/packets/verifier-now.ts:47-56`) also renders the stored template over the stored
  content, recomputes `rendered_sha256`, and returns `fails_now` when it differs from the stored report's. Every
  caller of it (the approval request, the approval, the builder's badge and history, the case line and timeline, and
  the export) therefore treats a renderer change as "fails now".
- The approval request and the approval action carry the `rendered_sha256` that the approver's screen rendered,
  beside the version hash. The handler refuses with a new web problem `rendered_changed` when it differs from the
  recomputed one. The approver therefore approves the text they read, and the stored report's hash, which the export
  guard requires again, is that same text.
- The approver's screens (`StoredNarrative`, the review page, the approval request) render with the same
  `renderFacts` and `formatUsdPlain` the worker uses, from `@tp/packets/check`.

**Export** (`apps/worker/src/packets/export.ts:196-214`). The order:
1. `verifierNow` over the stored template: `/3` passes, the stored `narrative_sha256` matches, and the recomputed
   `rendered_sha256` matches the stored report's.
2. `renderFacts`.
3. `insertIdentifiers`.
4. Assert that no `{{` survives (`render_failed`, an existing failure code).
5. `packetHtml`. Figures are marked by their segment's source; the `escapeWithFigures` regex is no longer used for
   the narrative (it stays for `requested_action`, which is code text).
6. `export_verifier_report` is written with the same `rendered_sha256`.

The PDF's `export_sha256` covers the printed bytes, as now.

**Properties.**
- **Idempotent.** Rendering is a pure function of template, content and `WORDS_VERSION`. Rendered text holds no fact
  token, so rendering it again changes nothing.
- **What the payer sees.** The rendered text, with identifiers filled, is what the payer reads.
- **Screens.**
  - `StoredNarrative` (`display.tsx:344-401`) shows the rendered text, each figure as a chip with its role and scope
    label and identifier tokens as today's `Placeholder` chips.
  - The review page and the approval request show the rendered text too.
  - A "Show template" toggle shows the stored tokens.

## 6. Formats, versions and the migration

**6.1 Formats.**
- `PACKET_FORMAT` stays `tp-packet/2`. The catalog is derived from the immutable content, and a resolved figure
  table in content would only repeat values code already derives from the hash.
- `VERIFIER_FORMAT` becomes `tp-packet-verifier/3`.
- ADR 0089 takes over the `/3` migration ADR 0086 reserved for Lane A, so it is written once. If Lane A has already
  merged a `/3` of ADR 0086's alone, this becomes `/4` with the same content.
- **A model draft that fails `/3` is not written.** Under v2, any `/3` mismatch makes the gateway's verify return
  `passed = false`, and `draftNarrative` (`apps/web/src/lib/models/narrative-drafts.ts`) returns `not_drafted` with no
  version written. CAS-08 (a failing version is stored and unapprovable) still holds for a person's save. A model's
  failing draft would put a flawed letter in the person's name for them to repair; the decision refuses it instead.
  - Mismatch codes map to one `ModelProblem`: `misstated` (`notices.ts:8`). `MODEL_PROBLEMS` keeps its meaning (call
    outcomes) and gains no verifier codes. Its text becomes "The model's narrative did not pass the checks of its
    figures; nothing was written. Draft it by hand, or ask again." The `not_drafted` result carries the `/3`
    report, and the screen lists each mismatch through `mismatchShown`, the editor's own words.
  - A text segment holding `{`, `}`, `[` or `]`, or an output outside the schema's bounds, is `invalid_output`
    (the schema's refinement, section 2.3).
  - Retired with v1's consumer: `narrative-roles.ts`, `NarrativeProposal.roles`, the `roles.length > 0` branch
    (`narrative-drafts.ts:77-79`) and `checkNarrative`'s roles check (`eval/score.ts:357-372`), all replaced by
    `fact_contradicted`. v1's code stays only as long as v1 is served.
- **`model_proposal` format `tp-narrative-draft/2`** holds the format, the sorted mismatch codes (empty for a written
  draft) and the sorted fact ids the template used. Ids are not text and carry no value. No segments and no template:
  `model_proposal.proposal` is plaintext jsonb, a narrative is stored only encrypted, and today's row holds codes only
  for that reason (`narrative-drafts.ts:21-25,96`).
- **A refused draft writes no `model_proposal` row.** `model_proposal_subject`
  (`packages/db/migrations/20261029190000_model_proposals.sql:42`) requires a `packet_version_id` for this purpose, and
  a refused draft has none. It is recorded on its `model_call` row (`outcome = 'completed'`, `verifier_passed =
  false`, as the gateway already writes) and in the step's audit event, which lists the mismatch codes (codes only).
  No second migration.

**6.2 Versions written before.**
- `/1` and `/2` rows stay valid rows. Their hashes and exported files stand, and nothing is backfilled. SQL cannot
  decrypt a narrative, and `packet_version_rules` freezes it.
- Read now by `/3`, they fail (`free_figure`) and read `verifier_outdated` (set at `approval.ts:86`; its text at
  `queries.ts:525`).
- They are re-drafted by the editor's one-click conversions (section 3) into a new version, or by a new model draft.
- They are not verified by ADR 0086's reader alone any more. Before launch no real version exists (ADR 0086).
- The previous image during a deploy cannot approve or export once the migration is in (`/2` is refused). That fails
  closed.

**6.3 The migration for Lane A (record and design; Lane B does not build it).**
`packages/db/migrations/<after the base's latest, 20261108090000 today; named by /new-migration>_packet_verifier_v3_rendered_figures.sql`,
header "Runs as tp_owner. Safe with the previous image running; its /2 reports can no longer be approved or
exported."
1. `CREATE OR REPLACE FUNCTION packet_verifier_report_valid(jsonb)`, same signature, IMMUTABLE:
   - Formats `/1`, `/2` and `/3`.
   - Key set: `/1` and `/2` keep `checked, format, mismatches, narrative_sha256, passed, sentences`. `/3` is those
     plus `rendered_sha256` (`^[0-9a-f]{64}$`).
   - Codes: `/3` allows `/2`'s plus `free_figure`, `number_word`, `unknown_fact`, `fact_not_canonical` and
     `fact_contradicted`.
   - Kinds add `fact`.
   - `passed = (no mismatches)` is unchanged.
2. `packet_version_current_verifier()`: an approval requires `verifier_report ->> 'format' = 'tp-packet-verifier/3'`,
   which carries a `rendered_sha256`. The database cannot render, so the check that the approver's rendered text is
   the stored report's is the app's (section 5: `verifierNow` and the approval's `rendered_sha256`), in the handler,
   with the database holding the format and the export guard holding the hash.
3. `packet_version_export_guard()` (unchanged from the first draft of this design):
   - The export report is `/3` and passes.
   - Its `narrative_sha256` equals the stored report's (as now).
   - Its `rendered_sha256` equals the stored report's.
4. Nothing else: no column, no new CHECK on rows, no backfill. `packet_export_failure_codes` is unchanged
   (`render_failed` exists). `model_proposal_subject` is unchanged (section 6.1).
5. CO-02, in the same pull request:
   - regenerate `packages/db/functions/{packet_verifier_report_valid,packet_version_current_verifier,packet_version_export_guard}.sql`;
   - regenerate `docs/product/domain-model.md` (`pnpm db:domain-model --check --require-approval`), with the
     founder's approval of record;
   - update the comments in `packages/db/src/schema/packets.ts:100,126` and the fixture in `row-factory.ts:154`.
6. Order: the migration merges before, or with, the slice that sets `VERIFIER_FORMAT` to `/3`. Writing `/3` against
   today's check fails every version write.

## 7. The evaluation

- A new set, `fixtures/synthetic/MOD-03/narrative-set-v2` (`tp-eval-narratives/2`):
  - the same 300 assemblies;
  - reference outputs as segments, generated by `packages/synth` from its own sums, so each reference figure is the
    fact it came from; only model-allowed, canonical ids;
  - required facts as `{fact, what}` plus required sources. A required fact is a canonical id, so a one-code pattern
    requires `pattern.variance`, never an alias.
- Today's text is not reverse-mapped to facts: a value held by two facts is the ambiguity this removes.
- `eval/sets.ts` loads both versions. `score.ts` adds the problem codes `free_figure`, `number_word`, `unknown_fact`,
  `fact_not_canonical` and `fact_contradicted` (the same five as sections 4, 6.1 and 6.3), and `invalid_output` for a
  schema refusal. `missingFacts` checks the template's ids.
- The report adds the `fact_contradicted` rate on the reference drafts and on the provider's drafts, so false
  refusals from cues beside phrases are measured, not guessed.
- Gate: zero-tolerance on 300 of 300, unchanged. The local v1 entry in `eval/baseline.json` is replaced by a local v2
  entry: prompt version 2, its sha (now covering `facts.json`), the new `set_sha256` and a new report under
  `eval/reports`. This lands in the same pull request as the prompt and set.
  - The ADR 0070 two-step re-baseline does not apply: v1 cannot run on the v2 set (the output shape differs).
  - Hardening: add `set_changed` and `new_set_with_change` for narratives (`baseline.ts:314-341`), so a later set
    change alone cannot pass silently.
- **What the local run proves.** The local provider's output is the code draft (`testing.ts:150-152`), so 300 of 300
  on local proves the pipeline (schema, serialization, verifier, scoring), not a model. Real providers stay
  `no_entry` (`gate.golden.test.ts:366-372`) until a person records a v2 run. ADR 0089 states this. Nothing served
  is lost.
- Faults (`eval/faults.ts:506-611`), working on the segments and the catalog, never on values from the request (v2
  sends none), with their expectations in `gate.golden.test.ts:650-697`:
  - `addFigure` (a digit literal in a text segment) -> `free_figure`;
  - new `addNumberWord` (a word drawn from the scanner's tables) -> `number_word`;
  - new `addZero` ("paid nothing", "zero") -> `number_word`;
  - new `addRoman` ("a level II appeal") -> `free_figure`;
  - new `addUnknownFact` -> `unknown_fact`;
  - new `addNonCanonical` (a row set out of order, or a lower-precedence spelling) -> `fact_not_canonical`;
  - new `useAlias` (`code.<c>.variance` in a one-code pattern) -> `fact_not_canonical`;
  - new `addRowFact` (a `line.*` or `claim.*` id in a model's output) -> `unknown_fact`;
  - new `addIdentifierPlaceholder` (`{{patient_name:1}}` in a text segment) and `smuggleToken` (`{{fact:...}}` or
    `[7]` in a text segment) -> `invalid_output`;
  - `dropCitation` -> `sentence_without_citation` (or `invalid_output` when `sources` is emptied);
  - `dropFact` -> `fact_missing`;
  - `swapAmounts` / `swapCounts`, rewritten: two fact segments of one kind with different roles are swapped under
    each other's cues, chosen from the catalog -> `fact_contradicted`;
  - new `addPartTrigger`, in two forms (a closed-list trigger word, and a part-naming token such as `code.<c>` in a
    sentence with a `pattern.*` total) -> `fact_contradicted`;
  - new `addTotalCueToPart` ("in total", "altogether" beside a `code.*` fact) -> `fact_contradicted`.
- No gate is lowered.

## 8. Tests and test-matrix rows

| Row | Covers |
|---|---|
| CAS-52 | Free text holds no figure: every figure `scanText` reads in strict mode (digit runs, signs, Roman numerals after a level, ordinal days, every word of the scanner's tables, "zero", "thousands", "paid nothing") fails at its span (`free_figure`, `number_word`), from a person or a model, while markers (a person's), identifier placeholders (a person's) and fact tokens pass. A model's draft with any `/3` mismatch is not written (`not_drafted`, `misstated`); a text segment with `{`, `}`, `[` or `]` is `invalid_output`; a model's `line.*`/`claim.*` id is `unknown_fact`. The pre-call guard passes a synthetic surname equal to a vocabulary word. |
| CAS-53 | Fact ids: every catalog id renders for its content; an id the content lacks (row out of range, interest not stated, a code not in the pattern, `deadline.window_days` with two counts, a window id above the first level, `contract.rate` for a fractional amount or a percentage method) and a stray `{{` fail (`unknown_fact`); a non-canonical id (rows out of order, `claim.4` not a first row, a one-line claim, `lines.*` equal to a code's rows, a code id in a one-code pattern) fails (`fact_not_canonical`) and names the canonical id; codes G0283, 0275T and 97110 and a modifier render from content; an off-shape code has no id; a typed subset sum opens the picker and is never matched to a row set; a person's write whose row map changed under a row-bound id is refused (`schedule_changed`). |
| CAS-54 | Contradiction, both directions: a free-text role cue naming a role the fact does not hold; a closed-list trigger, or a part-naming token (`code.*`, `line.*`, `lines.*`, `claim.*`, an identifier placeholder), beside an all-lines fact; and a total or all-lines word beside a part fact, each fail (`fact_contradicted`); part-naming tokens covering every line together pass. ADR 0086's known-limit sentences ("on a subset of the lines", "apiece", "for her", ...) render with their set stated by code, and no sentence with a part-naming token or a listed trigger passes with an all-lines figure. |
| CAS-55 | Render, approval and export: the render equals each fact's phrase with `formatUsdPlain` amounts, stored pattern and code totals, and code-computed row sums (bigint cents, decimal units); it is idempotent; it is the same in the browser and the worker, and `formatUsdPlain` equals `formatUsd` en-US in both; a renderer change between save and approval makes `verifierNow` read `fails_now` and blocks the approval (`rendered_changed` when the screen's hash differs); the export refuses a `rendered_sha256` that differs or a surviving `{{`; the v2 set passes 300 of 300 at the gate on the local provider. |

- **Unit tests.** Catalog (every id's source, role, scope and form; ids unique and canonical; `narrativeFacts` from
  the catalog; `contract.rate` for each method: `FIXED_SCHEDULE`, `PER_VISIT`, `LESSER_OF` with a fixed schedule,
  `LESSER_OF` without, a percentage method, a regulation); scan masking and strict mode; each new mismatch code;
  renderer phrases and forms (`units` decimal, plurals); the span map; `serializeDraft`'s punctuation rules; the
  fixed vocabulary built with no content parameter; the `facts.json` drift test.
- **Property tests** (`roles.property.test.ts` style, 40 seeds):
  - the code draft of every generated pattern passes `/3`;
  - the row sum over a code's rows and over all rows equals the stored code and pattern totals, for every amount
    and for units;
  - any canonical row set's sum equals the sum of its rows, and `canonicalFactId` is idempotent and unique per set;
  - inserting any digit, or any word drawn from the scanner's own exported tables, into any text segment fails at
    that span;
  - inserting any part-naming token into a sentence holding an all-lines fact fails, unless the sentence's
    part-naming tokens cover every line;
  - inserting any total cue into a sentence holding a part fact fails;
  - serialization keeps the model's sentence count;
  - render then re-render is identity.
- **Db tests** (with Lane A's migration): the `/3` report key set and codes; approval needs `/3`; the export guard
  needs the `rendered_sha256` match; the catalog and cross-tenant tests pass unchanged.
- **Synth** (`packages/synth`, cases CAS-52 to CAS-55):
  - templates with free figures, number words, zero phrases, Roman numerals, unknown and non-canonical ids,
    contradictions in both directions and the known-limit sentences;
  - patterns with several codes (including G0283 and 0275T shapes and modifiers), several claims, one-code,
    one-claim and one-line patterns, fractional units, and lines whose values differ;
  - the v2 MOD-03 set.

  All synthetic.
- **Existing tests that change on purpose:**
  - the draft property test and `draft.test.ts`;
  - `narrative.test.ts` (the keys test at :18-24 replaced), `score.test.ts:538` and `gate.golden.test.ts`;
  - the `/2` fixtures (`packets.db.test.ts:417`, `workbench-routes.db.test.ts:446`) and the web route tests feeding
    `{paragraphs}`;
  - e2e `models.ts:118`.

## 9. Rollout, in pull-request-sized slices

Each slice lists its review lenses. "Money" and "model" each mean two adversarial reviews.

1. **Catalog and renderer** (`packages/packets`: `fact-catalog.ts` with canonical ids, `render.ts`, word table,
   `narrativeFacts` from the catalog, `WORDS_VERSION` inputs; `@tp/money` `formatUsdPlain` with its golden test).
   No behavior change: nothing emits tokens yet. CAS-55's render half. Lenses: correctness, money (two),
   maintainability.
2. **Verifier `/3` behind the format constant.** Masking, strict scanning with the scanner's tables extended and
   exported, the new codes, pass 2 contradiction in both directions, the span map, `rendered_sha256` and
   `serializeDraft`. The draft emits tokens. `VERIFIER_FORMAT` stays `/2` until slice 3. CAS-52, 53 and 54. Lenses:
   correctness, money (two), security (fail-closed tokens), test quality.
3. **Lane A's migration** (section 6.3) and the one-line `VERIFIER_FORMAT = '/3'`. CO-02 approval of record. Lenses:
   db and RLS, compliance, deploy order.
4. **Worker export, write and approval path.** The render order, `verifierNow`'s `rendered_sha256`, the approval's
   `rendered_changed`, segment-marked HTML, the no-`{{` assertion and `schedule_changed`. CAS-55's approval and
   export half. Lenses: correctness, money (two), privacy (no PHI hashed or logged), reliability.
5. **Web.** Picker, preview, one-click conversion, `StoredNarrative` and the review page rendered, `mismatchShown`
   cases, notices. Lenses: UX and accessibility (keyboard, screen reader, phone width), privacy, correctness.
6. **Gateway prompt v2 and output.** The exact input object, `facts.json` in the prompt hash, the system prompt,
   the bounded segment schema, serialization, the guard over content-derived parts, refusal as `not_drafted`, the
   consumer `tp-narrative-draft/2`, retiring v1's roles check. Lenses: model and AI safety (two), privacy (no values,
   no rows, no document text sent), correctness.
7. **Evaluation.** v2 set from synth, scoring codes, rewritten and new faults, the `fact_contradicted` rate, v2 local
   baseline entry, narrative `set_changed`. Lenses: model (two), test quality; gate unchanged at zero tolerance.

Then ADR 0089, with ADR 0086's "Revisit when" item marked done. The ADR goes in slice 2's pull request, its
consequences completed in slice 7's. It records the accepted false refusals (section 2.4), the residual English part
names (section 4) and that real-provider assurance stays `no_entry` until a recorded v2 run.

## 10. Risks and alternatives

**Risks.**
- **A row-bound id rebinds after reassembly.** Mitigated by `schedule_changed` for a person (section 1); a model uses
  no row-bound id; the approver reads the rendered text against the printed schedule.
- **Clumsy prose around a correct figure** ("On some lines, a shortfall of $90.00 in total for the 3 lines"). Caught
  by the closed triggers and part-naming tokens where present; otherwise the figure is still true and states its
  set. The person reads it.
- **False failures from number words** ("First, ..."). Accepted and listed in ADR 0089: the scanner's one list, named
  in the mark, reworded in one step.
- **False refusals of a careful model** from cues beside phrases. Reduced by `renders_as` and the system prompt
  (section 2.5), and measured by the eval's `fact_contradicted` rate.
- **A renderer change after save.** `verifierNow` reads `fails_now`, so it cannot be approved or exported; it is saved
  and approved again.
- **An ICU change.** It no longer touches the hash (`formatUsdPlain`); the golden test reports it.
- **Deploy overlap.** The previous image's `/2` approvals and exports are refused by the database once the migration
  is in. That fails closed.
- **A model's prose misstates something without a figure** ("the payer denied these lines"). Out of this item's
  scope, as today. The person approves the text; the model only proposes it.

**Alternatives considered.**
- **Keep free text with ADR 0086 only and grow the trigger list.** Rejected. Review rounds found new words each
  pass; the class cannot close by listing English. It leaves rule 1 resting on reading prose.
- **Placeholders for a model only, people read by ADR 0086.** Rejected. It leaves the known limit in every
  person-written packet. The picker and the one-click conversion make the stricter rule cheap to follow.
- **Bare figures in tokens, with scope read from the prose.** Rejected. It keeps the limit; the scope must be printed
  by code with the set it covers.
- **Ordinal fact ids** (`{{fact:12}}`). Rejected. They collide with `PLACEHOLDER_PATTERN`, are unreadable to a person,
  and are not stable across versions.
- **Storing a resolved figure table in content (`tp-packet/3`).** Rejected. It repeats what code derives from the
  hashed content and adds a format and a migration for no accuracy gain.
- **Sending values to the model for reading.** Rejected (section 2.2).
- **Sending rows to the model.** Rejected (section 2.2): wider minimization, identifiers in prose, prompt size.
- **A second, short phrase form per fact for use after a role verb.** Not taken: it doubles the ids for one value.
  `renders_as` and the prompt address the need; the eval's rate says whether to revisit.
- **Uppercase codes in ids.** Not taken: a lowercase canonical form keeps one spelling per code, and the code is
  rendered from content either way.
- **Writing a failing model draft as an unapprovable version (CAS-08 for models).** Rejected under v2 (section 6.1).
- **A per-sentence `says` kind in the model's schema, checked by a role table.** Not taken. It would give a model's
  draft a check a person's text cannot have. One verifier for both writers is simpler and keeps every screen in step.

**Why this is the best option by the founder's standing rule.**
- **Accuracy and dispute success.** Every figure is computed and phrased by code with its role and set; a part named
  beside a total, or a total named beside a part, fails.
- **Quality and user experience.** The person picks figures, sees the rendered letter, and converts a typed figure in
  one click; a typed sum opens the picker rather than a guess.
- **Security and privacy.** The model gets no values, no rows and no document text. No PHI is hashed; identifiers are
  still filled only at export.
- **Compliance.** CLAUDE.md rule 1 holds by construction. The approval is checked against the rendered text the
  approver's screen rendered (in the handler, through `verifierNow`), and the export against the same stored hash
  (in the database).
- **Reliability.** The renderer is pure, idempotent and free of ICU in what it hashes, and every check fails closed.
- **AI safety.** A model can only choose among code's pattern-level facts, and its descriptions are versioned with
  its prompt.
- **Maintainability.** One catalog feeds the facts, the picker, the prompt, the renderer and the verifier. One
  scanner list is the free-text rule. ADR 0086's trigger list stops growing.
- **Cost to serve.** Smaller prompts; no value, row or quote tokens.

## 11. Review and departures (2026-11-04)

Two reviews of the first draft: the packet-engine review (PE-1 to PE-10) and the model-gateway review (GW-1 to GW-15).
Each finding and its resolution:

| Id | Severity | Resolution |
|---|---|---|
| PE-1 | blocking | Fixed (section 4, pass 2). A token's scope is authoritative; every part-naming token (`code.*`, `line.*`, `lines.*`, `claim.*`, identifier placeholders) is a part trigger beside an all-lines fact, with one exemption: tokens whose rows together cover every line. The reverse rule (total or all-lines words beside a part fact) is added. CAS-54, the faults (`addPartTrigger` with a token form, new `addTotalCueToPart`) and two property tests cover both directions. The code draft keeps ADR 0086's sentence splits (section 2.1). |
| PE-2 | should fix | Fixed (sections 2.4, 4). Pass 1 is every figure `scanText` reads in the masked free text, in strict mode (no lone one/zero exemption), plus `\p{N}` and the signs. The extra words (zero, nil, nought, quarter, double, triple, once, plurals, billion, currency words) go into `scan.ts`'s exported tables: one list. "Paid nothing" and its kin are refused as `number_word` in pass 1 rather than a pass-2 cue (stricter: it is a figure in prose). CAS-52 updated. |
| PE-3 | should fix | Fixed (section 5, "Approval is bound to the rendered text"; section 6.3 step 2; CAS-55). `verifierNow` recomputes `rendered_sha256` and reads `fails_now` on a difference; the approval request and approval carry the screen's `rendered_sha256` and refuse `rendered_changed`. The migration records that approval's rendered check is the app's, and the export guard is unchanged. The "Compliance" claim is restated. |
| PE-4 | should fix | Fixed (section 1, conditional ids; section 5 phrases; unit tests). `code.<cpt>.rate` is removed; one `contract.rate` comes from `contractAmount()`, whole cents only, for `FIXED_SCHEDULE`, `PER_VISIT` and a fixed-schedule `LESSER_OF`; "per unit" or "per visit" by method; the `LESSER_OF` phrase names the schedule side. |
| PE-5 | should fix | Fixed (section 1, "How each kind is computed"; section 5 forms). Cents by `sumCents`, units by `sumUnits`' decimal sum in `canonicalNumber` form with a new `units` form, counts as integers. `pattern.*` and `code.*` render the stored values; only `lines.*` and `claim.*` are summed; a property test ties row sums to stored totals. |
| PE-6 | should fix | Fixed (section 1, canonical ids; section 3). Precedence pattern, code, claim (first row only), line, `lines`; the catalog holds only canonical ids, and a lower-precedence spelling fails `fact_not_canonical` naming the canonical id. The one-click match excludes `lines.*`, runs over the catalog's facts only, and a typed sum opens the picker. CAS-53 updated. |
| PE-7 | nit | Fixed (section 1, "Codes and modifiers in ids"). The code segment is the content's code lowercased, only for `^[A-Z0-9]{5}$`, rendered from content; modifier ids `line.<r>.modifiers` and `code.<c>.modifiers`. CAS-53 updated. |
| PE-8 | nit | Fixed (section 5, "A pure currency formatter"), with a departure on the premise: `formatUnroundedUsd` also calls `formatUsd` and so uses ICU (`cents.ts:80-89`). A new `formatUsdPlain` in `@tp/money` formats hashed figures in code, with a golden test against `formatUsd` en-US in the worker and a browser. |
| PE-9 | nit | Fixed. `verifier_outdated` is set at `approval.ts:86`, its text at `queries.ts:525`; `NUMBER_WORDS` is in `scan.ts:195` (and `FIGURE_ROLES` in `roles-reader/kinds.ts:10`); the migration is named "after the base's latest (20261108090000 today), named by /new-migration"; `FigureSource.from` gains `'content'` with a form for each fact kind; `MODEL_PROBLEMS` keeps `misstated` as the one verifier notice, with the codes in its report (section 6.1). |
| PE-10 | nit | Fixed, with one departure. The window rules are stated (`line.<r>.window_ends_on` only at the first level; `deadline.window_days` only for exactly one stated day count; else `unknown_fact`) and added to CAS-53. Departure: the row map does not travel in the model's proposal, because a model's template can no longer hold any row-bound id (GW-4); its pattern and code ids render from the content its write reassembles, and a code the new content lacks fails as `unknown_fact`. A person's write still carries the row map. |
| GW-1 | blocking | Fixed, as PE-2 (section 2.4): the scanner is the single, exported source; strict mode removes the one/zero exemption; the missing words are added to its tables; a property test draws from those tables; CAS-52 has rows for "zero", "level II" and "thousands"; accepted false refusals are listed for ADR 0089. "A dollar" and "a penny" are covered by refusing currency unit words. |
| GW-2 | blocking | Fixed (section 1). Resolved by the canonical lowercase form, not uppercase in the grammar, so one code has one spelling; codes outside `^[A-Z0-9]{5}$` get no id and are named by rows; modifier ids added; CAS-53 cases for G0283, 0275T, a modifier and an off-shape code, and a synth pattern holding them. |
| GW-3 | should fix | Fixed (section 2.2, the exact input object). Sources, behavior, method, citation kind, level, interest and the requested action as enums; array facts indexed; the keys test replaced. The requested action is not sent as text, since the copy prints it after the narrative. |
| GW-4 | should fix | Fixed (section 2.2). The model is offered pattern, code, citation, contract, release, packet, deadline and interest subjects only, and no row table; a row-bound id from a model is `unknown_fact`; fault `addRowFact` and a CAS-52 case. ADR 0089 records it. |
| GW-5 | should fix | Fixed (sections 2.3, 2.4, 6.1). The schema refuses `{`, `}`, `[` and `]` in text segments (`invalid_output`); the "as now" claim is corrected; faults `addIdentifierPlaceholder` and `smuggleToken`. |
| GW-6 | should fix | Fixed (section 6.1). Any `/3` mismatch in a v2 model draft is `not_drafted`, no version written; CAS-08 stays for a person's save. All mismatch codes map to `misstated`, with the report shown through `mismatchShown`; `roleMismatches`, `NarrativeProposal.roles`, the `misstated` roles branch and `checkNarrative`'s roles check are retired in favour of `fact_contradicted`. |
| GW-7 | should fix | Fixed (section 6.1). `tp-narrative-draft/2` holds the format, the mismatch codes and the fact ids only; a refused draft writes no `model_proposal` row and is recorded on `model_call` (`verifier_passed = false`) and in the audit event. No second migration. |
| GW-8 | should fix | Fixed (section 2.2). The descriptions and skeletons live in `v2/facts.json`, covered by `promptContentSha256` (v1's hash unchanged), so a change is a new prompt version and `prompt_changed`; a drift test ties them to the packets phrase table. |
| GW-9 | should fix | Fixed (sections 2.2, 2.5, 7). `renders_as` sends each skeleton; the system prompt says a token is a complete noun phrase; the eval reports the `fact_contradicted` rate. The short form is considered and not taken (section 10). |
| GW-10 | should fix | Fixed (section 2.3). Zod bounds on every level; `serializeDraft` in `packages/packets` with its punctuation rules; one model sentence is one verifier sentence; a property test on the count. |
| GW-11 | should fix | Fixed, as PE-6 (section 1). Alias ids are not in the catalog; one-code, one-claim and one-line patterns use `pattern.*`; required eval facts are canonical; fault `useAlias`; CAS-53 cases and a property test. |
| GW-12 | should fix | Fixed (section 2.5). The v2 system text is written out, with `max_tokens`, effort and v1's model pins unchanged. |
| GW-13 | should fix | Fixed (section 7). New faults for identifier placeholders, smuggled tokens, zero, Roman numerals, non-canonical ids, aliases, row facts and the reverse direction; the swaps work from the catalog; the local run is stated to prove the pipeline only, and real providers stay `no_entry`. |
| GW-14 | should fix | Fixed (section 2.2). The pre-call guard runs over the content-derived parts (the codes in the ids); the fixed vocabulary is built with no content parameter, held by a unit test; CAS-52 keeps a surname-equals-vocabulary case. |
| GW-15 | nit | Fixed. `narrativeFacts` at `facts.ts:257` (`sum` at :251); `NUMBER_WORDS` at `scan.ts:195`; the marker rule is "a person's allowed, a model writes none" (section 2.4); sections 4, 6.1, 6.3 and 7 use one list of five codes (`free_figure`, `number_word`, `unknown_fact`, `fact_not_canonical`, `fact_contradicted`). |

**Departures from a reviewer's suggested fix**, each argued in its section:
- PE-2: zero-amount phrases are refused in pass 1, not added as pass-2 contradiction cues.
- PE-8: its premise that `formatUnroundedUsd` avoids ICU does not hold; a new formatter is added instead.
- PE-10: no row map in a model proposal; a model holds no row-bound id.
- GW-2: lowercase canonical code segment rather than uppercase in the grammar (one of the two fixes the review offers).
- GW-6 and PE-9: one `misstated` notice with the report's codes, rather than a `ModelProblem` per code.
