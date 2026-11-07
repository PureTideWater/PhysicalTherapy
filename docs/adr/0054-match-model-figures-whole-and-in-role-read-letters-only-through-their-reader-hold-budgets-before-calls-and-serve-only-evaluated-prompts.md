# 0054. Match model figures whole and in their role, read letters only through their reader, hold budgets before calls, and serve only evaluated prompts

- **Status:** accepted; the real-model gate still waits on model access (see Consequences); amended 2026-10-26 by
  [0070](0070-gate-models-on-wrong-but-verified-fields-and-people-set-floors-serve-each-model-feature-on-its-own-evaluation-and-check-contracts-against-the-practices-records-before-the-model.md), Part 1: the permitted run's report and comparison, and Part 2: production serves each model feature
  on its own evaluation ("Amendment (`co-001/model-eval-gate`, 2026-10-26)", below); amended 2026-10-27: the letter
  reader's redaction in one pass over one folded view ("Amendment (`co-001/redact-placeholders`, 2026-10-27)", below);
  amended 2026-10-27 by 0070, Part 3: a contract or exhibit is checked against the practice's records before the
  model ("Amendment (`co-001/contract-phi-check`, 2026-10-27)", below);
  amended 2026-10-28 by [0086](0086-read-every-narrative-figure-in-the-role-its-words-give-it-and-hold-each-input-to-the-roles-its-record-gives-it.md): the role check's grammar moves into `@tp/packets` ("Amendment (`co-001/packet-day-counts`,
  2026-10-28)", below); amended 2026-11-04: a payer letter's Social
  Security and phone numbers redacted by pattern, as the founder ruled on 2026-11-01 ("Amendment
  (`co-001/redact-ssn-phone`, 2026-11-04)", below)
- **Date:** 2026-10-17
- **Deciders:** founder (engineering)
- **PRD sections:** 14 (Purposes and their verifiers; PHI minimization; Provider and data path; Operational limits;
  Logging and evaluation), 5 (J5, J9), 17 (milestone 10), 18 (Layers, Model; What never ships); test matrix MOD-01 to
  MOD-06, SEC-09; CLAUDE.md rules 1 and 2; ADRs 0033, 0047, 0048, 0051, 0052

## Context

A review of the model gateway and its evaluation harness found fifteen problems. Code computes every number and a
person approves what a model proposes, but several checks between the model and the person were weaker than the plan
says:

- a verifier took a fragment of a figure for the figure;
- a payer letter could reach the model as if it were a contract;
- the letter reader trusted its caller;
- the narrative verifier checked that a figure appeared, not that it appeared in its role;
- calls made at once could all pass the daily budget;
- the evaluation gate could not fail on a prompt or model change;
- the budget alert reached no one;
- nothing evaluated prompts on the permitted examples.

This ADR records how each problem was fixed, and what cannot be done in this environment.

## Decision

**A written value matches its quote as a whole figure** (`src/figures.ts`). A contract proposal's amount, percentage,
year and dates are checked with `figureInQuote`. The written text must be in the quote. The quote, scanned with the
packets scanner, must also hold a figure of the same kind whose value is the one code reads from the written text:
cents, a plain decimal, a year or an ISO date. So "$3" is not in "$32.50", "10%" is not in "110%", and "1/1/2026" is
not in "11/1/2026".

Codes, modifiers and places of service go through `tokenInQuote`, which wants each to stand alone in its quote. No
letter or digit may touch it. A "$" or "/" before it, or a "/", "%", "." or "," joined to digits after it, makes it
part of another figure. A hyphen is allowed only in a code-modifier pair such as 97110-GP. Under this rule "11" does
not verify from "11/1/2026", and "59" does not verify from "$59.00".

The letter reader's response deadline is checked as a date, and its references as whole tokens (`wholeInQuote`). A
value code cannot read is still checked only as text, and it is marked unreadable. The test matrix's MOD-02 cases for
each of these fragments are in `functions/contract-terms.test.ts` and `functions/denial-letter.test.ts`.

**Terms are proposed from a contract or an exhibit only.** A version may name a payer letter, and a payer letter is
PHI. Two checks keep it away from the terms reader:

- The specialist's proposal (`apps/web/src/lib/models/contract-proposals.ts`) refuses any other kind of document with
  `document_kind`. The screen lists only contracts and exhibits.
- The gateway refuses the same in `contractTermsSpec.prepare`, from the stored kind its caller must pass.

A letter is read only by `readDenialLetter`, with its minimization.

**The letter reader strips every written form, and refuses what it cannot vouch for** (`src/redact.ts`,
`functions/denial-letter.ts`). Redaction now:

- reads dates in their common written forms: two-digit years, compact digits, either day-month order, month names
  with padding or ordinals, and "03-MAR-61";
- removes any date written next to a birth label;
- matches member IDs and claim numbers ignoring spaces and hyphens.

A call is refused (`identifiers_missing`) without the patient's name, the member ID and at least one claim, each claim
with its number. A new optional step of a purpose, `screen`, runs before anything is sent. For the letter reader, it
asks the practice's records (`OtherPatientCheck`) whether any run of the redacted letter is a member ID or claim number
the practice holds for another patient. On a yes, the call is refused (`more_than_one_patient`). The answer is yes or
no.

The worker's `otherPatientRecords` (`apps/worker/src/packets/letter-records.ts`) is that check. It is an audited read
(purpose `letter_screen`), done in the caller's own scope, of the other patients' member IDs and claim numbers. They
are decrypted and compacted in memory, and they never leave the check.

The check covers identifiers the practice holds. It does not cover a name it cannot match exactly, or a patient the
practice has never seen. The reader stays off behind its flag (below).

**A narrative's figures are held to their roles** (`functions/narrative-roles.ts`). After the packets verifier has
matched every figure to an input:

- each count must sit next to its noun ("9 lines", "4 claims", "3 patients", "12 units");
- each amount must follow its nearest cue in the sentence ("expected" or "contract rate", "paid" or "allowed",
  "variance" or "underpaid", "interest").

A figure that matches an input of another role is `figure_in_wrong_role`. The gateway does not pass the narrative, and
the packet builder writes no version from it: it shows the person the notice `misstated` and the hand-written form.

The harness counts a role mismatch as a verifier failure. Its fault injections now include swapped amounts and
swapped counts, and the gate test proves both are caught.

This check stops a swap. It does not stop an invented role cue that no input contradicts. That would take slot
substitution (below).

**A checklist item may hold only its gap's figures** (`functions/evidence-requests.ts`). The scanner runs over each
item's document and reason. An item with any amount or percentage, any count other than its gap's, or any code not
among its gap's is dropped as `figure_not_in_gap`. An item that names a payer of the input other than its own gap's is dropped as
`payer_not_in_gap`. A payer name the input never mentions cannot be told from ordinary words, so it is not caught.
The person still keeps or drops each item, and the closed list's remedies stay on the screen.

**A call holds its most against the budget before it is made** (`src/gateway.ts`, `src/store.ts`,
`src/postgres-store.ts`; migration `20261031090000_model_budget_holds.sql`). The steps:

1. Take a transaction-scoped advisory lock on the practice.
2. Delete expired holds.
3. In one statement, read the day's logged spend and every live hold.
4. If they have reached the budget, refuse the call (`MODEL_BUDGET_EXCEEDED`).
5. Otherwise, place a hold for the most the call can cost (`mostCost`): its input bounded by its UTF-8 bytes plus
   framing, and its output token limit, at the model's price.

The call's `model_call` row is written, and its hold deleted, in one transaction. A call that ends without a row
releases its hold. A hold whose process died expires after twice the call timeout plus a margin.

Calls made at once are therefore held to the budget as calls made in turn: at most the one call that crosses it takes
the day past it. `model_budget_hold` is practice-scoped under the tenant policy and in the PHI table registry, though
it holds only an amount and two times. The catalog test and the generated cross-tenant tests cover it.

**The gate holds the prompt's content, and production serves only what the gate recorded** (`eval/baseline.ts`,
`src/evaluated.ts`, `src/config.ts`, `tools/check-releases-immutable.sh`).

- Baseline entries (format `tp-model-eval-baseline/2`) record the SHA-256 of each prompt version's content. A report on
  a version whose content differs fails with `prompt_changed`, and it is never recorded.
- The immutability check that CI already runs on every pull request now also refuses any change to a
  `prompts/<name>/v<n>` directory that exists on the base branch. A prompt change has to be a new version.
- A unit test holds each released version to the one hash its changelog records.
- In production, `readGatewayConfig` refuses a real provider until `eval/baseline.json` holds an entry for every
  current prompt version, its content hash and each model it pins for that provider, for the purposes the synthetic
  sets evaluate. The larger contract model is included: the CLI evaluates it with `--variant ambiguous`. The refusal
  works like unconfirmed prices: every model feature is off, and the screens offer hand entry.
- The golden test holds any provider with entries to every current prompt and model.

A new prompt version or model therefore ships only after a person has run `eval --provider configured --record` and
committed what it recorded.

**The alert reaches the operator, and the tasks may call the models they are pinned to** (`infra`):

- A metric filter on the web and worker log groups counts `MODEL_BUDGET_EXCEEDED` and `MODEL_BUDGET_REACHED`. An alarm
  notifies the operator topic.
- The application role may call `bedrock:InvokeModel` on the models that each purpose's current prompt version pins,
  read from the prompts' own `prompt.json`, and on nothing else of Bedrock.

Textract's permission belongs to intake and is not changed here.

**The specialist can mark a contract ambiguous.** The propose form has a checkbox, and the route passes it to the
gateway, which picks the prompt's larger model. The proposal records the choice, and the screen shows which variant
ran and the model the call was logged with.

**The lint refuses every model SDK outside the gateway, and the gateway is held to the money rules**
(`eslint.config.js`):

- Every `@anthropic-ai/*` package and every `@aws-sdk/client-bedrock*` client is refused outside
  `packages/model-gateway`, subpaths and `require` included.
- `packages/model-gateway` is in `MONEY_PACKAGES`.

The lint fixture test proves both.

**The permitted examples are evaluated inside the PHI boundary** (`packages/model-gateway/src/permitted.ts`,
`apps/worker/src/models/permitted.ts`). The worker image's `evaluate-permitted` task (`dist/evaluate-permitted.js`)
runs as a one-off task of the worker's own task definition in production. It takes `--practice <id>` once per
practice, and optionally `--report <file>` and `--against <earlier report>`.

For each practice, in that practice's job scope as the application role, the task:

1. reads the practice's permitted contract-proposal examples (audited, purpose `model_evaluation`);
2. reads each example's document page text as intake stored it, opened with the practice's key;
3. proposes the terms again through the gateway, with the current prompt and its pinned model (the larger one when
   the specialist had marked the contract ambiguous);
4. scores the proposal field by field against the specialist's final records, as the synthetic gate scores a document
   against its truth.

Each call is logged in `model_call` in the run's name and held to the practice's budget. Nothing the call proposes is
written as a proposal or a rate record.

The report (`tp-model-eval-permitted/1`) holds precision and recall counts per field, problem codes and example IDs.
It never holds a document's text, a quote or a figure. An example the run could not score (document unavailable, a
refusal, a failed call, an answer off its schema, an expectation it cannot read) counts as proposing nothing. Recall
therefore drops, so the run fails the gate instead of passing silently. With `--against`, any precision or recall
below the earlier run's, overall or per field, exits 1.

The scored fields are the ones a contract writes:

- method, codes, modifiers and places of service;
- amount, percentage, fee-schedule year and lesser-of schedule;
- the effective dates.

Flags and rounding are not scored. A final record holds them whether the contract stated them or the specialist
confirmed a default, so the two cases cannot be told apart.

**The denial-letter reader stays built and stays off.** PRD 14 places `readDenialLetter` in v1.5. It was built in
milestone 10 with the gateway, because it is the gateway's only PHI path, and the minimization rules (redaction, one
patient, references and dates in the letter) shape the gateway's design: the `screen` step, the PHI boundary and the
flag. Pulling it out now would remove tests of those rules and gain nothing.

It stays behind `model.read_denial_letter`, which is off unless a platform administrator sets it. No screen calls it,
and none will before v1.5. Turning it on for a practice is a v1.5 decision that needs a paying customer's need (PRD 4)
and the screen that would call it.

## Alternatives considered

- **Slots for narrative figures** (`{{fact:expected}}` substituted by code). This is the stronger check. It changes the
  prompt's contract with the model, the stored narrative and the packets verifier's format, and the plan does not ask
  for it. The role check plus the swap faults catch the reviewed failure. Slots remain the next step if a real model
  shows role errors the check misses.
- **Capping concurrent calls per practice** instead of holding cost. Simpler, but it does not bound spend: one large
  call can still cross the budget by any amount. A hold of the call's most bounds both.
- **A golden test that fails until a real-provider baseline exists.** It would turn CI red until someone with model
  access records one. Production's refusal enforces the same rule without blocking every other change.
- **A CI job that runs the configured provider on prompt changes.** The plan's CI workflow cannot be changed by this
  build, and no synthetic-only credentials exist here. The immutability check and the production refusal give the
  same guarantee: no prompt or model change reaches production without a recorded evaluation.

## Consequences

- MOD-02 and MOD-04 hold for whole figures. MOD-05's concurrent overshoot is bounded, and its alert reaches the
  operator. SEC-09 covers every model SDK.
- Milestone 10's done check is still not met. No real model has answered the synthetic sets or a permitted example,
  because this build has no model access. `eval --provider configured --record` on the synthetic sets, and
  `evaluate-permitted` inside the PHI boundary, have to be run by a person with credentials before the milestone
  closes. Until the first of these is committed, production refuses the real providers.
- The permitted run spends from each practice's daily budget like any call. Run it outside working hours, or raise the
  practice's budget for the run.

## Amendment (`co-001/model-eval-gate`, 2026-10-26): the permitted run's report, and serving each feature on its own evaluation

Combined audit #84, adopted by the founder with the whole audit on 2026-10-20, changes two of the decisions above
(docs/adr/0070, Parts 1 and 2, give them in full). The text above stays as it was decided; where it differs, this
amendment holds.

**Part 1: the permitted run** ("The permitted examples are evaluated inside the PHI boundary" above).

- The report is `tp-model-eval-permitted/2`. Each field is tallied as the synthetic gate tallies it (`tp`, `wrong`,
  `extra`, `rejected`, `rejected_right`, `rejected_extra`, `missed`, through `src/tally.ts`), so a wrong value the
  verifier passed is counted apart from a rejection; precision and recall are derived from those counts as before. It
  still never holds a document's text, a quote or a figure: counts, problem codes and the sorted example IDs.
- Each example is scored against the final records cited from its own document (an example written before this
  change is scored on all its records and counted apart), never against another document's records in the version.
- "An example the run could not score ... counts as proposing nothing" above changes for a refusal: an example whose
  call was refused is counted under `refused`, by its code, apart from the misses, and is not tallied; a rise in
  refusals fails the comparison on its own (`refused_rose`). The other cases still count as proposing nothing.
- With `--against`, the run exits 1 also when the two reports' example IDs differ (`examples_changed`; equal counts
  of different examples no longer pass as the same), when wrong but verified rises overall or on any field
  (`wrong_verified_rose`). An earlier report of format `/1` (`earlier_report_format`), or a file that is not a
  permitted-run report, is refused before any call is made, with exit 2: run the earlier side again on the current
  code.
- A call the gateway refuses because the feature, or the variant an example asks for, is off or not evaluable is a
  refusal (`refused:not_evaluated`, `refused:kill_switch`, `refused:feature_off`), not a miss; `eval record-permitted`
  (Part 2) refuses to record a run holding one, or a failed call, since that run did not measure the model.

**Part 2: production serves each feature on its own evaluation** ("The gate holds the prompt's content, and production
serves only what the gate recorded" above).

- "In production, `readGatewayConfig` refuses a real provider until `eval/baseline.json` holds an entry for every
  current prompt version ... The refusal works like unconfirmed prices: every model feature is off" becomes: in
  production on a real provider, each purpose, and each contract variant, is served only when its own current prompt
  version, content hash, model and variant have an entry that parses under the strict baseline schema, every recall
  and precision floor of `eval/floors.json` is set and met by its counts, each model it pins has a confirmed price, and
  (for contracts) the permitted run's record is in the entry. Anything else turns **that feature** off
  (`ModelFeatureOffError('not_evaluated')`, hand entry), never the whole provider. The gateway computes what it serves
  from the committed files itself; no caller can hand it a wider set. `readGatewayConfig` still throws when nothing is
  served, so the screens' and the worker's handling of that case is unchanged.
- Evidence requests and the denial-letter reader have no synthetic set, so a real provider never serves them in
  production until each has one.
- A new prompt version or model reaches users in two steps: the synthetic record (`eval --provider configured
  --record`) makes the feature evaluable only, and `evaluate-permitted --against` inside the PHI boundary, then `eval
  record-permitted`, serves it (`docs/runbooks/model-evaluation.md`).
- `assertEvaluated`, `unevaluatedModels`, `EVALUATED_PURPOSES`, `MissingEvaluation`, `RECORDED_EVALUATIONS`,
  `RecordedEvaluation` and `assertPricesConfirmed` are removed; serving is `servingDecisions` in `src/evaluated.ts`,
  and an unconfirmed price turns off only the features whose models it prices (`price_unconfirmed`).

## Amendment (`co-001/redact-placeholders`, 2026-10-27): the letter reader's redaction, in one pass and complete

Probed with synthetic twins on 085299b, redaction (`src/redact.ts`) had two kinds of fault. It rewrote the letter once
per form, longest first, each pass over the text the earlier ones had rewritten, so a name part that a placeholder
spells (`CLAIM`, `DATE`, `ID`, `NAME` ...) rewrote the placeholder: the model lost `[CLAIM_1]`, or a clean letter was
refused (`identifier_left`). And it matched character for character, so a name written with marks (José for JOSE), a
typographic apostrophe or dash, half a hyphenated surname, a soft hyphen, `ß`, a space inside a part or an initial, and
a member ID or claim number written with `_`, `.` or a zero-width space, were sent; the one-patient screen
(`identifierCandidates`) missed another patient's ID written those ways. "Strips names, dates of birth, member IDs and
claim numbers by exact match" (PRD 14) is read as below; the text above stays as it was decided, and where it differs,
this amendment holds.

- **One pass.** Every match (dates of birth, numbers, names, initials) is found on the letter as it is, mapped to the
  NFKC text, and overlapping matches merged; the output is the NFKC letter with each merged span replaced, built once.
  No placeholder is ever scanned, so each survives exactly. A merged span's placeholder is chosen by kind, not length:
  `[CLAIM_n]` (the lowest n) if any claim's number is in it, else `[MEMBER_ID]`, else `[DATE_OF_BIRTH]`, else
  `[PATIENT_NAME]`. Every placeholder hides the whole span; the claim's is the one the task needs.
- **One folded view.** Each code point is decomposed, its marks dropped and its case folded in full (`ß` and `ẞ` are
  `SS`), each unit mapped back to the code point it came from. A run of default-ignorable code points (soft hyphen,
  zero-width space, word joiner ...), or of marks with nothing to sit on, becomes one character that is neither a
  letter nor a digit, so it still ends a word ("Dear<ZWSP>Jane"), and that every joiner class holds, so it still joins
  inside one ("Van<SHY>tree"). The Hangul fillers and U+180E are white space. Dates are read twice, with the invisible
  characters dropped and read as spaces, and the readings united. Every form (names, member IDs, claim numbers) is
  compacted from the same fold of its stored value.
- **Numbers** (member IDs, claim numbers; two letters or digits or more) match with any white space, dash (with U+2212
  MINUS SIGN and U+2043 HYPHEN BULLET), `_`, `|`, `\` or invisible character between their characters (`_`, `|` and
  `\` between two digits since review finding F4-1, 2026-11-01: `1234_5678`, `0023|04|26`), and `.`, `/`, `:`, `#` or
  `(` only next to a letter (`SYN.555001`, `ZZ/1234567`, `ZZ#1234567`, never `150.00`). Since review finding R5-1
  (2026-11-01) a number joins anywhere over the apostrophes of digit grouping (`'`, U+2018, U+2019, U+02BC and the
  backtick: `12'345'678`, `12’345’678`), `~` (NFKC writes U+FF5E as it), the middle dots (U+00B7, U+2027, U+2219,
  U+22C5, U+30FB), the bullet U+2022, `;`, the double quotes (`"`, U+201C, U+201D), U+02D7 MODIFIER LETTER MINUS SIGN
  and U+2796 HEAVY MINUS SIGN (`1234~5678`, `1234·5678`, `ZZ~7654321`), and since review finding G4 (2026-11-02) over
  the primes OCR writes for a grouping apostrophe (U+2032, U+2035, and U+2033, which NFKC writes as two U+2032) and the
  modifier-letter prime and acute (U+02B9, U+02CA), which, like U+02BC, are letters by class read as apostrophes, in a
  name too (`Ilʹich` is ILICH). None is a date separator or an amount's punctuation, so no date or amount reads
  differently. A comma between digits still joins nothing (an amount's grouping). Since review finding R5-2
  (2026-11-01), after an identifier label a digits-only number joins over `.` and `/` between digits too
  (`Claim 1955/07/14`, `ICN 1234.5678`), never as an amount (`isAmount` still applies). The label
  (`IDENTIFIER_LABEL`, as review finding G2 narrowed it on 2026-11-02) is a head word (`Claim`, `ICN`, `PCN`, `DCN`,
  `TCN`, `Control`, `Account`, `Acct`, `Member`, `Subscriber`, `Ref`) with any of `number`, `nbr`, `no`, `id`,
  `control` and `#` after it (`Claim #`, `Claim No.`, `Member ID`, `Patient control no.`, `CLAIM NUMBER IS`);
  `Reference` only with one of those after it; `No.`, `No:` or `No#` with a capital N; `ID:` or `ID#`; `number is`;
  or `Re:`. Its end may hold white space, invisible characters, `*` (Markdown bold), one `:`, `#` or `-` or one `,`,
  `is`, and then `(` or an opening quote (`"`, `'`, U+201C, U+2018) right before the number (review finding G3:
  `**Claim:** 2026-04-26`, `Claim, 2026-04-26,`, `ICN (2026-04-26)`, `Claim: “2026-04-26”`, `Re: 2026-04-26`); since
  review finding phi-label-end-dash (2026-11-04) its `:`, `#` or `-` may be `=`, any dash or the minus sign too
  (`Member ID – 1234.5678`, `Member ID — 1234.5678`, `Member ID = 1234.5678`, `Claim # – 9988/7766`). A bare
  `no`, `number`, `id`, `#` or `reference` is no label, so "The number 2027-03-15", "No 2027-03-15 appeal",
  "Answer: no. 2027-03-15", "reference: 2027-03-15" and "Reference date #2027-03-15" keep their deadline when it equals
  a claim's digits. A member's label (`Member`, `Subscriber`) makes a whole written date a member ID only, a claim's
  label a claim's number only (`Member: 2027-03-15` keeps a deadline equal to a claim's digits), and the others
  either. Digits joined over `.` or `/` that are not a whole written date are the number after any label: one of
  these, or a bare `ID`, `number`, `nbr`, `no`, `num`, `identification`, `reference` or `#` with any qualifiers after
  it, so after any word before one (`Patient ID 1234.5678`, `Policy number 1234/5678`, `Member's ID 1234.5678`,
  `Member Identification Number 1234.5678`, `Policy # 1234.5678`, `ID 1234.5678`; `ANY_IDENTIFIER_LABEL`). Review
  finding phi-G2-regress-1 (2026-11-04) found that G2's narrowing had sent these, the patient's own number among
  them: the narrowing keeps a deadline, a whole written date, so it applies to whole written dates alone. Since review
  finding phi-numero-glued (2026-11-04) a number glued to a label word with no space before it is read as after a
  label of that word's kind (`GLUED_LABEL`: a head word, `ID`, `Nbr`, `Num`, `Ref`, or `No` with a capital N, a whole
  word or after a small letter): `ICN99887766`, `Member ID12345678`, and `Claim №99887766`, `Member №ZZ12345678` and
  `Claim№99887766`, which NFKC writes `No99887766`, `NoZZ12345678` and `ClaimNo99887766`.
  Since 2026-11-04 (MOD-13 seed 460548619) a sentence end breaks a label's head: beside the leftmost label, the
  leftmost one at or after each line break, each "!" or "?" and white space, and each full stop (an abbreviation's
  too, with or without white space) counts (`labelsBefore`), so "AA CLAIM.\nID:", "claim\nID No.", "acct. ID:", "acct.
  No." and "AA SUBSCRIBER NBR. No." are `ID:` or `No.` as well (review findings security-rlb-sec-1 and -sec-2). Only
  labels are added: a head still joins its qualifiers over its own full stop and line breaks (`Member.ID`, `Acct.
  No.`, a wrapped `Claim\nNumber:`; correctness-rlb-oracle-1), one label with no full stop keeps G2 (`Claim ID:
  1990-01-01`), a bare `ID` with a qualifier (`ID Number:`, `ID nbr`) is either's label (security-rlb-sec-3), and a
  deadline equal to a claim's digits after "the claim. ID" is replaced, an over-redaction accepted as before.
  The screen's candidates (`identifierCandidates`) join over the same characters, the label's `.` and `/` between
  digits included (review finding G1, 2026-11-02): a run of digits alone that a label introduces also joins over `.`
  and `/`, after any label when the run is no whole written date and after one of the head-word labels when it is, as
  the matcher reads them (`ICN 1234.5678` offers 12345678, `Claim 1955/07/14` 19550714, `Member ID: 7654.321` 7654321,
  and since phi-G2-regress-1 `Patient ID 1234.5678` 12345678, never `ID 2027/03/15` 20270315), and they read the
  text with each label word glued to a number set apart too (`unglued`, since phi-numero-glued: `ICN99887766` and
  `Claim №99887766` offer 99887766, `Member №ZZ12345678` ZZ12345678), so `more_than_one_patient` sees another patient's
  number written so. Digits alone are kept in two
  cases only. A claim's digits written as an amount, after a currency sign and with cents (`$15000.00` for claim
  15000), are kept: with their cents they are never the claim's own written form; `$555001`, `555001.01` and
  `555001,12` are the claim's. A member ID is never read as an amount (`$12345678` for member 12345678 is replaced).
  And digits inside a date that is not a date of birth are kept only when the date is separated (written with a slash,
  a backslash, a period, a dash, `_`, `|` or a month word) and has a calendar reading, and the match's own written form,
  read alone, is a whole such date ("Appeal by 2027-03-15" keeps its deadline), and, since review finding R5-2, no
  identifier label stands right before it: "Claim 1955-07-14" for claim 19550714 is `Claim [CLAIM_1]`, as a birth label
  makes any date a date of birth (a label of the number's kind, or of either: G2 above). Since review finding F4-2 (2026-11-01) a
  match that is only part of the date is replaced: claim 312026 in `Jan 31-2026`, claim 19991 in `1999-1<ZWSP>2-31`.
  An invisible character or a space is no date separator, and
  numbers shaped like a date no calendar holds are no date, so `1234<ZWSP>5678`, `12-34-56`, `1234-56-78`, `03 15 61`
  and "Claim 20270315" are replaced. A calendar reading needs a plausible year (2026-11-01, MOD-13 seed 1162287068):
  a four-digit year from 1900 to 2099 (`EARLIEST_WRITTEN_YEAR`, `LATEST_WRITTEN_YEAR`, what a date of birth, a date of
  service or a remittance date can be, and the range a two-digit year reads in), so a claim number 00230426 written
  `0023-04-26`, or 21000426 written `2100-04-26`, is no date and is replaced; the contract screen's
  `isCompactCalendarDate` uses the same bound (docs/adr/0070 Part 3).
- **Names**: each whole name, each word and each part (the words split on white space, `,`, `;`, `/`; the parts on
  dashes, apostrophes, `.` and `_`), two letters or digits or more. Dashes, apostrophes, `_` and invisible characters
  join anywhere; between the parts the records hold apart, white space, `.` and `,` too; inside a part, a space or `.`
  only where it leaves pieces of two letters or more, each capitalized as written (`Jo Ann`, never `in a`, `is a`,
  `to be`). A dash (or an invisible character) before a line break joins inside a part whatever the pieces' case: a word
  hyphenated at the end of a line (`Van-⏎tree`, `Vantr-⏎ee`, `Jo-⏎ann`). A name match that is the month word of a
  separated date with a calendar reading that is not a date of birth is not taken ("due June 30, 2027" keeps its
  deadline for a patient named JUNE; "May 45, 2027" is no date, so MAY is replaced); a date of birth is replaced whole.
- **Dates of birth** are read with any dash (U+2212 and U+2043 too), a slash, a backslash, a period, `_` or `|`
  between numbers (`03_03_1961`, `03\03\1961`, `03|03|1961`, each a separated date), with spaces alone
  (`03 03 1961`), with a straight or typographic apostrophe before a two-digit year (`Mar 3 ’61`), and with a month word
  between slashes or dashes (`3/Mar/1961`, `03/Mar/61`), as well as the forms above. A date written with spaces
  alone, or compact, is read as a date of birth but never kept as another date, since an ID is written that way too.
  Where one date form holds another, the longer is kept unless only the shorter has a calendar reading.
- **Initials.** A letter standing alone that is the first letter of a part of the patient's name is a name when it is
  next to a name or another taken initial: before one, past an optional `.` and white space, apostrophes or dashes
  (`J.Vantree`, `J. Q. Vantree`, `O’Brien`); after one, past an optional comma, when `.` follows it or no word written
  in lower case does (`Vantree, J.`, `Vantree, J Q`, never `Vantree, I am`). After a taken initial, the gap is
  measured past that initial's `.`, so a dotted chain after the name is taken whole (`Vantree J.Q.`, `Vantree J. Q.`,
  `Vantree, J.Q.`). Initials are taken to a fixed point. An initial is capitalized as written, or the name next to it
  is in lower case (`j. vantree`).
- **Time linear in the letter.** The letter's text comes from the payer, so no step may be quadratic in it. The gap
  after a name is one starred class and an optional comma tail (no two overlapping starred classes), and a candidate
  initial is tested only when the run of gap characters before it reaches back to the name or initial it would follow
  (a prefix array of where each run starts). The date spans are kept in one sweep in order of start (longest first),
  tracking the furthest end of a span with a reading and of any span, which gives the pairwise rule's result since
  holding is transitive. Whether a match lies in another date is a binary search over the dates by start with a
  running maximum of their ends. A 100 kB letter crafted against each step (a long gap after a name followed by 49 000
  initials, 97 s before; dates one after another, up to 9 s with the checks) redacts and checks in well under a
  second.
- **The letter's own brackets.** Before matching, each `[` and `]` the letter writes becomes `(` and `)` (one UTF-16
  unit for one, so no position moves). The only square brackets sent are placeholders, so a letter that writes a
  placeholder-shaped token itself (`[CLAIM_1]`, `[claim_2]`, a full-width `［MEMBER_ID］`) cannot have it cited as a
  claim of the call or read as a placeholder by any check.
- **The self-check** (`holdsIdentifier`, still the guard in `prepare`) masks each exact placeholder with U+0001, which
  is not a letter, digit, joiner, mark or default-ignorable and which the fold keeps, then runs the same matcher. A
  claim placeholder numbered past the call's claims keeps its digits between two barriers, so `[CLAIM_555001]` still
  holds claim 555001. The guard is defence in depth: the property test asserts no generated letter reaches it.
- **The screen's tokens.** `identifierTokenRuns` is the one tokenizer for "which run of a text is an identifier": a
  token is a maximal run of letters, digits and marks; a run joins up to `maxTokens` tokens while a caller's join rule
  accepts what lies between. `identifierCandidates` masks the exact placeholders' words (only those, so `[QQ_7654321]`
  is read, and a claim placeholder keeps its digits: `[CLAIM_7654321]` offers 7654321, while a redacted letter's
  `[CLAIM_n]` never reaches five characters) and joins up to three tokens across white space, dashes, invisible
  characters, `_`, `|`, `\` and the joiners of review findings R5-1 and G4 anywhere (`1234|5678`, `12'345'678`,
  `1234′5678`; U+02BC, U+02B9 and U+02CA read as apostrophes), `.`, `/`, `:`, `#` or `(` next to a letter, and, in a
  run of digits alone right after an identifier label, `.` and `/` (review finding G1: `ICN 1234.5678`), so
  `ID:ZZ7654321`, `ZZ_7654321`, `ZZ/7654321`, `ZZ#7654321`, `YY<ZWSP>7654321`, `REF<ZWSP>ZZ7654321`, a digits-only
  `765 4321` and `Claim 1955/07/14` are offered.
- **The narrative drafter's check** (`mentionsIdentifier`, before a `draftPacketNarrative` call) uses the same
  matcher, names as names and member IDs and claim numbers as numbers (`NarrativeInput.names`, which the worker's
  `packetDraftInputs` now passes), so a fact text that writes an identifier another way is refused. Every number there
  is read as a member ID is (never an amount: `$12345678` is refused for number 12345678), and the facts' `$300.00`
  and `2026-03-05` never read as 30000 or 20260305, since a period never joins digits and a dashed date with a
  calendar reading is kept.

Tests: test matrix MOD-13 (generated letters, the generator as the oracle, digits-only numbers written with dashes and
invisible characters and dates' digits written as numbers among them; today's redaction frozen as a second oracle:
nothing it replaced is now sent, but in a date that is not a date of birth and that the test reads, on its own, as a
calendar date with its separators, or a claim's digits written as an amount; common phrases, amounts and deadlines
sent unchanged) and MOD-14 (the screen's candidates, digits-only IDs among them), in `src/redact.property.test.ts`,
and each probed case, the review rounds' reproductions included, by name in `functions/denial-letter.test.ts` (the
crafted slow letters each with a time budget of 3 s for the redaction and both checks). Before relying on unseeded
runs, the five properties were run once over 60 seeds at 400 runs each with no failure.

Still not covered, recorded as residuals (none is new): nicknames (Bob for Robert); homoglyphs (Cyrillic `а` for Latin
`a`: a payer letter's text is not adversarial, and OCR in Latin mode does not emit them); digits of other scripts
(`٣`); a name in a script other than the records'; a date of birth in a form `datesIn` does not read (`1961 March 3`); a
name glued to another word by a lost space with no digit beside its run of letters (`DEARJANE`, `DearJane`,
`ZephyraPaid in full`), which is not a whole word (where a digit touches it, a name part its run sets apart, an initial
alone before the name, a date of birth, and a member ID or claim number that holds letters are refused by the check
since review round 3 of the range fix, 2026-11-07, below; a member ID or claim number of digits alone glued to a word is
not, nor a name glued with no digit beside it, except in a letter whose chain only that fix's barriers hold, below); a
call's member ID or claim number inside a longer token, a letter glued to its letter or a digit to its digit
(`ZZ12345678` for ZZ1234567, `2020PaidZZ7654321`, `ZZ7654321150.00-1/2/20`), which redaction keeps as another
identifier for the screen and the check refuses when the number holds letters (no boundary can be known), and a
digits-only one glued so (`Room AB99887766`, `Claim 123456780.00` for claim 12345678), read as another number and sent;
a bare monogram (`JQV`);
an identifier split into more than three tokens, which the screen does not join (the contract screen's runs are not
limited to three); another patient's identifier the screen sees only with a digit and five characters or more,
while the stored side keeps values from two; another patient's name, which the screen does not look for; and addresses,
phone numbers and Social Security numbers, which PRD 14 does not list for redaction. Recorded with the review round
(each the cost of keeping what the task reads, or not new): a digits-only member ID or claim number that is itself a
real calendar date written with dashes, `_`, `|` or `\` (a year from 1900 to 2099) reads as that date and is sent
when no identifier label stands right before it (member 031561 written `Seen 03-15-61`; since review finding R5-2,
`Claim 03-15-61` and `Member ID 03-15-61` are replaced); a claim's
digits written after a currency sign and with cents are sent as an amount (`$555001.00`); digits alone with a slash
or a period between them (`12/34/5678`, `1234.5678`) are not a number, being how dates and amounts are written, unless
an identifier label stands right before them (R5-2), and then the candidates join them too (G1); a comma between digits
(`1234,5678`) joins nothing; and a part written in lower case with a space inside it (`jo ann`) is not a name.
Recorded with review findings G2 to G4 (2026-11-02), each the cost of keeping a deadline or a word: a bare `ID`,
`number`, `no` (lower case, or with no `.`, `:` or `#`), `#` or `reference` before a claim number or member ID written as
a whole calendar date is no label, so that date is kept as an ordinary letter's would be (`ID 03-14-1962`,
`#1955/07/14`; the head words, `No.`, `ID:` and `Re:` are labels; digits with `.` or `/` between them that are no whole
date are the number after any label since review finding phi-G2-regress-1); a
claim's label before a member ID written as a whole calendar date, or a member's label before a claim's number written
so, keeps the date (`Claim# 1955-07-14` for member 19550714); a label more than 40 characters before its number, or
with other words between them (`Claim number for this service: 2026-04-26`), is none; a number glued to a word that
is no label word (`Room AB99887766`), or to `NO` after a capital letter (`CLAIMNO99887766`, which cannot be told from a
word ending in "NO"), is not read as labeled (review finding phi-numero-glued); and the katakana prolonged sound mark
U+30FC, a letter inside Japanese words and names, joins no number (`1234ー5678`). Recorded with the second review round: a
date of birth with its day or month spelled out as a word (`MARCH THIRD 1961`), which `datesIn` does not read; and the
`)` after a member ID written `ZZ(1234567)`, which is sent after the placeholder (`[MEMBER_ID])`) and holds no digit.

## Amendment (`co-001/contract-phi-check`, 2026-10-27): the contract screen

Combined audit #120, adopted by the founder with the whole audit on 2026-10-20, adds a step to "Terms are proposed
from a contract or an exhibit only" and gives the contract terms reader the screen this ADR gave the letter reader
(docs/adr/0070, Part 3, gives it in full). The text above stays as it was decided; where it differs, this amendment
holds.

- The kind check stays as it is (`document_kind`, in the specialist's proposal and in `contractTermsSpec.prepare`).
  It trusts the kind the person chose at upload, so a payer letter or an EOB filed as a contract, or inside a zip
  filed as one, passed it. A third check now runs after it: `contractTermsSpec.screen`.
- `screen` takes the call's context (`screen?(input, prepared, context)`), so a screen can bind what it reads to the
  call's own practice. The screen runs last of the gateway's refusals before the budget's hold and the call: serving,
  the kill switch and flags, the PHI boundary, `prepare` (the kind check, the request's cap in bytes and the
  framing), the variant's serving check, a completed call under the idempotency key, a read of the day's spend against
  the budget and the caller's step before the screen, then `screen`; after it, the budget's hold, which can still
  refuse a screened call when calls in flight take the day's spend to the budget, and the call. No audited read runs
  for a call the gateway refuses before the hold (ADR 0070, Part 3; its pull request review's S1, which found the
  screen running before the idempotency key and the budget).
- The contract screen asks the practice's records (`PatientRecordsCheck`, `src/patient-records.ts`) whether any run
  of the pages is a member ID, a payer claim control number or a patient control number the practice holds. On a
  yes the call is refused (`names_patient`). As with the letter's check, the answer is a code, never which
  identifier, its kind or how many.
- Unlike the letter's check, the caller cannot supply the records. `ContractPagesInput.patientRecords` is required,
  the gateway accepts only a check its own factories issued for the call's practice (`screen_invalid` otherwise), and
  that check opens its own job scope for the practice and reads as the service screen actor (purpose
  `contract_screen`), not in the caller's scope as `otherPatientRecords` does. A practice holding more than 50,000
  identifiers is refused (`screen_unavailable`) without a read (and one whose rows pass the bound while the screen
  reads, with at most one row read past it), and a read that fails is refused (`screen_failed`), with every read it
  made audited.
- A screen's refusal is now logged by the gateway, one line with `practice_id` and an `error_code`, for the letter's
  `more_than_one_patient` as for the contract's codes; the screen's own message is never logged.
- The letter reader's check, `otherPatientRecords`, is unchanged. Moving it onto the issued, practice-bound check is a
  follow-up (0070, P9). The contract screen does not tokenize through `identifierTokenRuns` (amendment of
  `co-001/redact-placeholders`, above): it streams its own runs (`someIdentifierRun`), which join differently, each path
  for its task (0070, Part 3, N6).

## Amendment (`co-001/packet-day-counts`, 2026-10-28): the packets verifier holds figures to their roles

"A narrative's figures are held to their roles" (Decision) is now the packets verifier's own rule ([0086](0086-read-every-narrative-figure-in-the-role-its-words-give-it-and-hold-each-input-to-the-roles-its-record-gives-it.md)): one reader,
`packages/packets/src/roles.ts`, reads every figure's role, and the verifier fails a figure its inputs do not hold in
that role, on a person's narrative, in the editor, when a version is written and at export, not only on a model's
draft. `roleMismatches()` (`functions/narrative-roles.ts`) keeps its API and reads the same facts: of the figures the
packets verifier failed, those whose value the inputs hold in another role are `figure_in_wrong_role`, so the person
sees a figure misstated rather than missing. Its roles are `@tp/packets`' `FIGURE_ROLES`, which split what the
remittances show into what the payer allowed and what it paid; a mismatch names the role its nearest cue gives the
figure (`role`) and every role its words give it (`roles`, `every`). The harness's swap faults now fail with both codes.
The reader takes one cue's role per figure, the nearest by the order ADR 0086 sets, as this check's reading did, never
the union of every cue in its clause; so the check before a model's draft is written is at least as strict as this
check was. `functions/narrative-roles.test.ts` proves it on every build: the check as it stood at 83d71fd6, vendored
unchanged as a fixture only (`narrative-roles.base.fixture.ts`), runs over 246 generated amount swaps and every
misstated example of the review of 2026-11-01, and each one it caught must fail the gateway (PE-2). A figure that
fails for want of a scope, or of its own words instead of "respectively" (ADR 0086's closed rules 2 and 3, 2026-11-04),
is in its role and is no `figure_in_wrong_role`: the verifier's report alone fails the draft, and the editor says what
to add.

## Amendment (`co-001/redact-ssn-phone`, 2026-11-04): Social Security and phone numbers by pattern

The founder (Tyler Williams) ruled on 2026-11-01 that a payer letter has its Social Security numbers and phone numbers
redacted **by pattern** before the model reads it (`readDenialLetter`), as a PRD 14 "PHI minimization" requirement. The
co-founder relayed it to Lane A (session_01TrKDxeLbxVo7t7zwRXFzrg, commit 18bbe0e9, 14:04 UTC) and confirmed it in
session_01FcouKNNHsdecRMzfTs7XwW at about 14:40 UTC. Addresses stay a residual: the ruling does not cover them. The text
above stays as it was decided; where it differs, this amendment holds.

- **No longer residuals.** Social Security numbers and phone numbers are no longer residuals of the amendment of
  `co-001/redact-placeholders` (its "Still not covered" list, above): they are redacted by pattern (below); addresses
  still are.
- **Scope.** The letter reader only (`letterSubject`'s `patterns`): `redactLetter`, `redactionSpans` and
  `holdsIdentifier` read the patterns; the narrative check (`holdsNameOrNumber`) and every contract-screen function do
  not. Contract pages stay as stored (a changed page would reject true quotes, and a contract's phone numbers are the
  payer's).
- **The patterns** run inside `matchesIn`, last, into the same found list as the call's own identifiers, on the letter's
  folded view with every decimal digit read as its value (Arabic-Indic and Devanagari digits too), on both readings of
  an invisible run (joined, and as a space), so "On 11/01/2026<ZWSP>202-555-0123" is read. An SSN is a 3-2-4, a masked
  one (`XXX-XX-3456`, `***`, `#`, `_`, after an SSN label `*****3456` too), a bare nine, with a HICN's suffix inside the
  span. A phone is `(AAA) EEE-LLLL`, `AAA EEE LLLL` (area code 2-9), with `+1` or `1` and an extension inside the span,
  `+` and ten digits, a bare ten, `1` and ten after a phone label, or a seven-digit local number after a phone label.
  Between two groups: one or two dashes with up to two spaces or a wrapped line around them, one to three spaces or
  tabs, a line break with indentation, a period, one of the number joiners the call's own number reads (an underscore, a
  bar, a backslash, grouping apostrophes and primes, `~`, middle dots, bullets), or an invisible run; inside a group, an
  invisible run or a wrapped line. A form feed (pdftotext's page break) and a vertical tab are line breaks, and U+1680
  and the braille blank U+2800 are blanks (review round 1, 2026-11-05: SEC-3, SEC-6). A period or a joiner never sits in
  one match with white space, and a match with white space between groups is never one beside an amount's decimal point
  or cents ("150.00 2026-11-01", "Row 250 10 1500.00" stay); no shaped match follows a currency sign. A letter may touch
  a match ("Tel202-555-0123", "SSN900-12-3456"); a digit may not. A number with a group wrapped across a line break (and
  a bare one wrapped, only after a label and on the joined reading) is never read into a number on the next or previous
  line: no digit across a break beside it that no other match holds, and no other match running over its ends.
- **Labels and keep-nouns** decide a bare number, read in a window of 64 characters before it that ends at the last
  match already found, a BARRIER, a digit or a second line break, a word counting within 24 characters. A keep-noun
  (claim, ICN, DCN, reference, appeal, case, NPI, TIN, EIN, tax ID or tax identification, check, EFT, trace, control,
  invoice, authorization, ZIP, group) keeps it only when it names it, with nothing but connectors between them (white
  space, `:`, `#`, a dash, `.`, `*`, `=`, `(`, an opening quote, one comma, `NO`, `NUMBER`, `NBR`, `NUM`, `ID`) and no
  sentence end but an abbreviation's full stop ("See our claim. 900551234" is redacted, "Ref. No. 2025550123" kept). An
  SSN or phone label in the window decides over a keep-noun, the nearer of the two (a phone label never keeps a nine),
  except that a Luhn-valid ten named by NPI and a nine named by TIN, EIN, tax ID or tax identification (the IRS's
  wording, since review round 1: corr-ssn-4) are always kept; `Medicare` labels a nine, never a ten. With no word: a
  nine is `[SSN]`; a ten starting 3-9, or 2 and failing the NPI check, is `[PHONE]`; a ten starting 0 or 1 is kept.
  A keep-noun names a list whole (review round 2, 2026-11-05, finding 3): a number whose own words decide nothing and
  that follows another number, the call's own claim or a placeholder across a comma, "and", "or" or "&" alone is kept
  when the list's first number its words decide is kept ("Claim number(s) 900123456 and 900123457", "Reference numbers
  2025550123, 2025550124"); a label in the list ("Claim 900123456 and SSN 900551234"), any other word, a line break or
  a sentence end ends it, a list after an SSN or phone label is no keep, and a list is followed back sixteen numbers at
  most (`decideNamed`, for the patterns and the scan alike).
- **What stays.** Amounts, every date `datesIn` reads (the date of birth by its own rule), NPIs, procedure, adjustment
  and diagnosis codes, ZIPs and ZIP+4s, TINs, ICNs of 11 digits or more, EFT traces, checks and references named by a
  word: no pattern takes them (test matrix MOD-16). A bare ZIP+4 with no `ZIP` word before it is `[SSN]` (an address
  part, a residual of PHI already), and a reference written in an SSN or phone shape is redacted and cannot be reported.
- **Placeholders and ranks.** `[SSN]` and `[PHONE]` rank below the call's own (`RANK`: claim, member, birth, name, ssn,
  phone), so a pattern span that overlaps the call's own match takes the call's placeholder. A pattern match that is
  the call's own member ID or claim number, whole, by its core digits or joined to the token written against it, takes
  its placeholder, over that token ("Claim (202) 555-0123", "Claim +1 202 555 0123", "Claim SYN (202) 555-0123" for
  the call's claim are `[CLAIM_n]`). A match of the call's own inside, and not equal to, another number's pattern span
  lends it no rank (the call's short claim `1234` inside another patient's `900-55-1234` is `[SSN]`). `PLACEHOLDER`
  and `masked` read `[SSN]` and `[PHONE]` as every placeholder, so a patient named `PHONE` reads none in them and
  neither word is offered to the screen. The verifier rejects a claim reference that holds a placeholder without being
  one of the call's claims ("ZZ-[SSN]") as `unknown_claim`.
- **The screen** is asked about the redactor's candidates (`redactLetterForScreen`, used by `denial-letter.ts` only and
  not exported from the package): the runs of the sent text, the runs of the letter with only the call's identifiers
  replaced, and the compact form of every SSN or phone match that is not the call's own, whole, its core digits and
  joined to the token on either side ("900-55-1234-01" offers `90055123401`). The call's own member IDs and claim
  numbers are never among them. They live in the prepared call's context only, are never sent, logged or stored, and
  the screen's refusal is the fixed `more_than_one_patient` (MOD-14, MOD-16).
- **The self-check** (`holdsIdentifier`) runs the patterns on the masked sent text and also an independent survivor
  scan, written apart from them: on the digits view with invisible runs dropped and read as spaces, after barriers
  (placeholders; whole separated dates with a reading, none joined to another group by a joiner, a date glued to a word
  read with its letters as blanks; amounts; a range, two such dates or two unsigned amounts joined by one or two dashes
  and the range joined to nothing else, "10/01/2026-10/15/2026", "2026-10-01-2026-10-15", "150.00-120.00" (review round
  2, finding 2: these were refused), while "10/01/2026-10/15/2026-0123" and A3's "SSN 900-12-03-56" are no barrier; bare
  numbers a keep-noun names, alone or in its list, or the NPI and TIN rule keeps), it refuses a letter in which one to
  four consecutive digit groups, joined by white space (up to sixteen spaces or tabs, or one line break with up to
  sixteen on each side) with at most one joiner (dashes, `.`, `(`, `)`, `/`, every non-white number joiner, `;` with no
  space after it, and U+30FC, U+2053, U+02C9, U+2215, U+2044 and U+3001), hold 9 or 10 digits, or 11 starting with 1
  across groups, unless one group has five digits or more (codes, ZIPs, TINs, ICN columns) or the one group is a ten
  starting 0 or 1, a ten starting 2 that passes the NPI check, or eleven digits or more. Under a label, that is when an
  SSN or phone label (or `Medicare`, for a nine) is the nearest word before the chain's first group within 24
  characters, no keep-noun or code word (CPT, HCPCS, code, modifier, revenue, ICD, ZIP) after it, the chain runs on over
  any number of groups and is refused at 9 or 10 digits, or 11 starting with 1, whatever their lengths; a comma joins
  there too and an unsigned amount is no barrier ("Phone: 202-5550123", "SSN 90012-3456", "SSN 9 0 0 1 2 3 4 5 6", "SSN
  900.12 3456" are refused, "Please call about CPT 97110 97140." and "Call our office, TIN 12-3456789" sent). Review
  round 1 (2026-11-05: SEC-1, SEC-2, SEC-4, SEC-5, SEC-6, corr-ssn-1) widened the scan so. The refusal is
  `identifier_left`, the fixed sentence that names no number. A letter that glues the patient's name to a pattern span
  ("RE: Vantree900-12-3456") is refused the same way (design 7.4; review round 2 of the range fix redacted both, a
  reading review round 3 reverted, below). Since 2026-11-06 (MOD-16 seed 1034253323, where "Paid $0,000.00.
  Service 01/01/2020-01/02/2020Paid $0,000.00" was refused) a range's two ends may be read on either reading and may be
  a date and an amount (with or without a currency sign), the glued reading blanks only a word glued to a digit and
  never as white space, and `datesIn` tries each date form at every number, so a match that reads as no date never hides
  a date it overlaps (that also redacts a date of birth written after an amount and a full stop, "0.00.03/14/1980",
  "0.00. 03/14/1980", "0.00.03/14/80", and, as the date rule says, keeps a month-word name written as such a date there:
  re-review PHI1-3; a digits-only claim or member number written as such a date stays only where the date is read past
  each match's end too, as cc3dd7f6 read dates, so "Paid 0.00. 01-01-2020" for claim 01012020 is "Paid 0.00. [CLAIM_1]"
  as it was there: review PHI2-5, closed in review round 3); a range joined to a further group is still no barrier. An
  unlabeled amount-shaped SSN or phone at an end of a range of two amounts is read as an amount there, as R1 reads it
  alone, and is sent, as at cc3dd7f6 ("150.00-900.12 3456", recorded below); at an end of a range the fix added (a date
  or a currency amount to an amount), with a short group after it, the letter is refused as cc3dd7f6 refused it
  ("01/01/2020-900.12 3456", "$1-900.12 3456": re-review PHI1-1, closed in review round 3, below). The review of that fix (GATEWAY1-1, GATEWAY1-2) added a third reading that blanks every word glued to a
  digit, an ordinal-like suffix too, so a range glued to "St.", "Rd.", "TH" or "nd" after its four-digit year is a
  barrier ("10/01/2026-10/15/2026St. Joseph"; since review GATEWAY2-2 the second reading keeps an ordinal suffix only
  after a day's one or two digits, so a day-first ordinal second end is read so too, "01/01/2020-4th of March, 2020St.
  Mary", which cc3dd7f6 and 6fc88092 refused: 1,012 of 327,652 must-stay range letters in the review's sweep, and
  3,432 of 993,564 in the fix's, every `datesIn` form at either end with every dash and glued before and after; none
  since), and reads SEC-5's label over the numbers before an unsigned amount and before its
  range's first end, each digit as a space, so a date, an amount, a currency amount or a range between an SSN or phone
  label and an amount-shaped number no longer shields it ("SSN: 01/01/2020-900.12 3456", "SSN 01/01/2020 900.12 3456"
  are refused). Its re-review (2026-11-06; its gateway findings reuse the ids GATEWAY1-n and are cited as re-review
  GATEWAY1-n) narrowed that read: a plain number, one in no date, amount or currency amount, is read over only in the
  amount's own run, before any word or such span ("SSN 9001 2.34 56", "SSN (2) 900.12 3456", "Phone 711 900.12 3456" are
  refused), and one after a word or a span ends the read, as a digit ends every label window, so a phone word's own
  number keeps the amounts after it when a word, a date or an amount stands between ("TTY 711. Paid 150.00 2026", "TTY
  711⏎150.00 120.00 30.00", "Fax 3 pages: 150.00 120.00" are sent, as at cc3dd7f6), but not when a units number starts
  the row ("Hearing impaired: TTY 711⏎1 150.00 0.00" is refused). On the fail-safe side a chain is refused whose first
  group a phone label is nearest ("Call us about 150.00-120.00", "Contact us. 150.00-120.00 total") or that starts at an
  amount right after the label's own number with nothing between ("TTY 711⏎150.00 1234"). Of these cc3dd7f6 refused only
  "Call us about 150.00 1234": the rest are refusals new since 435f0a68, and its review round 2 (GATEWAY2-1, 2026-11-07)
  measured them, 3,429 of 20,000 synthetic letters that a phone or contact sentence leads, all sent at cc3dd7f6, refused
  at 6fc88092. That round ends such a chain at a money amount (two decimals) that the label reaches only over the plain
  numbers of its own run, where the chain already holds a group of five digits or more and the group just before the
  amount is shorter: a service line's code and units columns ("Contact us. 97110 1 150.00", "Questions? Call
  us.⏎97110 2 150.00" are sent, as at cc3dd7f6). A five-digit group right before the amount keeps the chain, as an SSN's
  or a phone's would ("SSN 90012 34.56", "Phone 202 55501 23.45", and so "Calls are free.⏎Line 1 97110 600.50" are
  refused), as do a units number after the label's own number and a letter code ("Questions? Call us.⏎G0283 1
  150.00"): 2,247 of those 20,000 letters are still refused (1,182 kept again), a refusal, never a leak; the SEC fuzz of
  60,000 labeled letters is unchanged.
  Review round 2 of the fix (2026-11-07: PHI2-1, PHI2-2) found that the barrier sent the call's own identifiers that
  cc3dd7f6 refused only because the range then joined the next group (A3), in shapes redaction never read: a date of
  birth glued to a word, and a name, member ID or claim number glued to a digit ("Paid $0,000.00. Service
  01/01/2020-01/02/2020Zephyra $0,000.00", "DOB 150.00-03/14/1980Paid", "Seen 0.00-01/02/2020SYNCLAIM0001"). That
  round's answer, a glued reading of the call's identifiers in redaction (21684dff, 5a13c9d9), cut SSN and phone labels
  so that SSNs cc3dd7f6 redacted or refused were sent (review round 3: PHI3-1, PHI3-2, PHI3-3) and took codes, modifiers
  and units after the patient's name (GATEWAY3-1, GATEWAY3-2: "MA04" for a part MA, "97110XU", "45min", "M54.50" after
  MARIA). Review round 3 reverted it: redaction reads the call's identifiers at word boundaries again, as cc3dd7f6 read
  them, and the self-check refuses (`identifier_left`) a letter that holds one of them glued to text across a boundary no
  pattern reads (`ownIdentifierGlued`), where no boundary can be known and the letter goes to a person:
  - a part of the patient's name of four letters or more that is no month's word, folded, in a run of letters a digit
    touches, where the run sets it apart (from the run's start or a change of case, to the run's end, a digit or a change
    of case) or anywhere in a run of one case, or written with joiners or a space inside as its form reads it
    ("01/01/2020-150.00Zephyra", "Jane0.00-01/02/2020", "2020PAIDZEPHYRATODAY", "150.00ZEP HYRA"); never inside a word
    that goes on in its own case ("2020Billed" for a part BILL, "0.00Coverage" for VERA, "Remark1" for MARK: read anywhere,
    the judge's review round 1 found it refused 867 of 71,689 of the gate's MOD-16 and range letters that cc3dd7f6 sent,
    for a patient Bill, GATEWAYJ1-1); letters between a digit and the name's placeholder with only invisible characters
    between (a part the placeholder cut), and a part's head glued to a digit before the placeholder, where redaction read
    the rest of a part written with a space inside as a shorter part: the rest a part of the name or an initial, a space
    or a joiner alone between ("150.00DANIEL [PATIENT_NAME]" for DANIELLE LE; the glued property's seed 2026110710, now a
    fixed run: GATEWAYJ1-4); an ordinal's or a time's letters before the whole name are no head ("On March 10th,
    [PATIENT_NAME]" for THOMAS, "at 9am [PATIENT_NAME]" for AMANDA: 5b8ed30f refused them, 84 of 28,428 natural sentences
    for 199 first names and 6 surnames, all sent at cc3dd7f6 and again now, the judge's review round 2, GATEWAYJ2-2); an
    initial alone with a digit right before it, before
    the name's placeholder (or a number's that a part of the name is written as), a whole part or another such initial
    ("150.00Q Zephyra", "150.00J. [PATIENT_NAME]"), never before another placeholder or a word that only begins like a part
    ("Suite 2A, [PHONE]", "Suite 2A, Albany" for AL: 4,696 of 67,392 address and row letters were refused so,
    GATEWAYJ1-3), and never with a digit after it, where it is a code's letter ("ZEPHYRA G0283", "MARIA M54.50");
  - a member ID or claim number of letters with a digit beside it, and one of letters and digits inside any longer token
    ("Seen 150.00SYNCLAIM0001", "2020PaidZZ7654321");
  - a date of birth in any form `datesIn` reads with a letter or a digit beside it ("DOB03/14/1980", "114-Mar-1980-150.00",
    "DOB 03/14/1980150.00 - 01/01/2020", PHI3-4), compact with a letter beside it; none inside another date. A name or
    number written as a word of a written date of birth is that date's ("DOB June 1, 2002Paid" for a patient June), and a
    date a birth label introduces that reads as no date of birth takes the digits an invisible character joins to it.
  A part of two or three letters, a month's word or an initial set apart in a glued run is as often a code, a unit or a
  date's month ("Remark: MA04", "97110XU", "45min", "June1", "Seen 0.00-$20Al"): it is sent elsewhere, as at cc3dd7f6,
  and refused in a letter whose chain only the range fix's barriers hold, which cc3dd7f6 refused for the range's own
  digits (of the gate's 46,956 such letters it refused 46,955; the other holds no name). There no boundary is worth
  reading, and the check refuses (the judge's review round 1, 2026-11-07: PHIJ1-1, PHIJ1-3, PHIJ1-4, PHIJ1-5,
  GATEWAYJ1-4):
  - a part of the name of any length, a month's word too, folded, anywhere in any run of letters, beside a date too
    ("01/01/2020-150.00Al", "DEARAL,", "ALPAID", "dearal.", "DEARALPAID", "DEARJUNE," and "JUNE01/01/2020-150.00" for a
    part JUNE), and beside the name's placeholder any run glued to a digit or the head or tail of a part ("ANGE
    [PATIENT_NAME]", "OR [PATIENT_NAME]" for ORLA);
  - an initial at the end of a run, unless it is written small at the end of a word that holds a capital ("Dear
    [PATIENT_NAME]" for an initial R stays sent), before a placeholder, a word that begins with a part, another initial or
    a full stop ("01/01/2020-150.00J. Ma", "DEARQ Zephyra", "DEARJ. Zephyra", "JQ Zephyra", "MsQ.");
  - the call's identifiers read blind to their separators, on the letter's letters and digits alone: a member ID or claim
    number ("ZZ.765.4321", "C2026/000417", "Paid76543210", "CLAIMNO99887766", "Claim 123456780.00" for claim 12345678,
    "Total $555001.00" for 555001, "Seen 03-15-61" for member 031561, "1234ー5678"), a part of four letters or more ("Z E P
    H Y R A", "jo ann"), the initials of a name of three parts or more in order ("JQZ", "J.Q.Z."), a date of birth's
    eight digits in an order a date is written ("03⏎14⏎1980", "0 3 / 0 3 / 1 9 6 1"; not inside a longer run of digits,
    and no six-digit form, which a letter's random ICN, TIN and amount digits would hold by chance), its month's word
    within 24 characters of its year ("1961 March 3", "MARCH THIRD 1961"; read in one walk of both lists, linear: the
    judge's review round 2 measured 8.8 s for a 400 kB letter of month words and years apart, PHIJ2-4), and a birth label,
    "D/O/B" too, whose date redaction did not read ("DOB 1961/3", "DOB March 3rd, nineteen sixty-one", "D/O/B 2-XI-1975");
  - the judge's review round 2 (PHIJ2-2, GATEWAYJ2-3): the forms of the call's identifiers some rule reads elsewhere,
    which held letters sent: the date of birth year first with a two-digit year, as a date with one separator twice or six
    digits on their own ("80-03-14", "75/11/02", "80 3 14", "800314", forms redaction reads after a birth label; not
    inside a longer number or an amount, "Total 80.03 14 units" is sent), and a part of two or three letters written letter
    by letter, each letter alone ("Seen 01/01/2020-150.00A L Paid" for AL, "T Y" for TY; no form reads it, a space splitting
    a part only two letters or more from each end; with no range both trees send it, "Seen 150.00T Y Paid");
  - a masked SSN glued to a word ("PaidXXX-XX-3456", "Paid***-**-3456"); and a held range's end does not stand when a
    word and a mask's characters glue the group after it ("01/01/2020-150.00PaidXXX-XX-3456"), as for a word or a mask
    alone, while a word and a gap glue nothing ("Service 01/01/2020-150.00Paid 97110 3 1234.56", MOD-16's own letter).
  The survivor scan tells such a letter (`survivorIn`, step 5): it reads the letter again with the barriers cc3dd7f6
  read alone ("kept": a currency
  amount, and a date read as cc3dd7f6 read dates or an unsigned amount, alone or in a range of its own kind joined by a
  hyphen, a dash or the minus sign), and a chain that survives there is a survivor unless the barriers the range fix
  added ("held": a range of a date and an amount or of an amount and a currency amount, a date read only with a glued
  word blanked, a range joined by another dash) hold all of it, each standing: its ends written as a range's ends are (a
  date of one separator or a month word with its day and year apart, an amount with cents, a currency amount), no SSN
  or phone label before it, and nothing beside it that may be the other part of an identifier whose part the range
  holds (a short group no barrier holds, joined as a chain joins; an unsigned amount so; a held range that does not stand
  on that side; after it, any group glued by a word, a mask's characters or both, and a run of plain short groups in an SSN's
  or phone's shape after a word and white space). Where a range's end cannot be told from an identifier's fragment, the
  letter is refused as cc3dd7f6 refused it (the orchestrator's ruling of 2026-11-07): "Paid 01/01/2020-900.12 3456",
  "Paid $1-900.12 3456", "Paid 202 555 01.23-1/3/20", "Paid 0,900-12-19.85", "SSN 2,900-12-19.85-1/3/20", "Call 202 555
  01.23-12-150.00", "01/01/2020-150.00XXX-XX-3456Paid", "SSN 900123456120.00-01/02/2020", "Phone March 11,
  2029−2,866.66  960.58 4433", "SSN 1: is 01/01/2020-900.12 3456", "Re: SSN 01/01/2020-4th of March, 2020St 900.12 3456"
  (PHI3-5), each sent from 6fc88092 to the head of round 2. In a letter whose chain only held barriers hold, an SSN or
  phone label glued to the word before it is read too ("01/01/2020-150.00-PaidSSN 900 12 34.56"). The MOD-16 seed letter
  and its class stay sent ("Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00": the held range holds its
  chain whole and stands); a range of either kind written right after an amount and a full stop with no word between
  ("Paid $0,000.00.January 1, 2020-2020-01-02Paid") is refused, as at cc3dd7f6.
  Measured by the differential gate (975,489 synthetic letters; cc3dd7f6 against this head; the runs of the judge's
  review rounds 1 and 2, 2026-11-07, the same counts in both): the call's own identifiers that cc3dd7f6 redacted or refused and this head sends: no initial, date
  of birth, member ID or claim number, and 5 name letters (ruling B, below); SSNs 385 and phones 171 letters, all in
  letters whose chain only held barriers hold (ruling A, below). The round's own harnesses put every own-identifier shape
  in such letters (30,570 letters of short, month-word and initial parts glued to words; 342 and 3,420 of the shapes
  recorded above as sent with no range; 41,496 of every kind at a range's ends; 12,705 SSNs and phones glued there): none
  is sent but ruling A's class and a lone initial with no name beside it (below), in the forms those harnesses wrote. The
  judge's review round 2 wrote the call's identifiers in forms they did not (OCR letter/digit confusions, homoglyphs,
  other scripts, unread date writings, a short part letter by letter: 1,428 letters of three patients in 12 such frames,
  PHIJ2-2) and found 330 sent: the 55 in a form a rule reads elsewhere (45) or a short part letter by letter (10) are
  refused since (above); the 275 in forms no rule reads are ruling A' (below). Codes, units, amounts, IDs and
  references this head changes that cc3dd7f6 sent: none; dates 4, a number and a word 1 each, all in one reviewer
  fuzzer's letters of two patients' dates of birth, where a second written form of the date of birth is redacted that
  cc3dd7f6 left inside the date beside it (more redacted). Fail-safe refusals of letters cc3dd7f6 sent: 60 must-stay
  letters by the gate's oracle, each holding the call's own date of birth glued digit to digit ("Seen
  $10.00-1980/03/14150.00", one reviewer harness), refused as a glued date of birth; 598 letters whose identifiers
  cc3dd7f6 redacted (415 by the scan, as at 6fc88092; 183 by the glued check: a name part, initial, date of birth or
  number glued where no boundary can be read, which cc3dd7f6 sent in clear beside the redacted ones); 7,014 must-stay
  letters after an SSN or phone word, the class GATEWAY2-1 narrowed (6fc88092 8,455). The gate's letters name few
  patients, so the round measured the name rules for others too: the gate's 71,689 MOD-16, range and code letters re-run
  for patients whose name stands inside a payer's words are refused where cc3dd7f6 sent them for none of BILL, VERA,
  ALAN, MARK, AL, ED, MA and 14 short or month-word parts, and, as a fail-safe where a part is the whole word glued to a
  digit or in a run of capitals a digit touches, 128 for PAGE ("335.00Page 2 of 5"), 42 for RANGE and 1,459 for PAID;
  of 431 common name parts, 2 for "<Word>150.00" in title case (PAGE, WEEKS, the whole word); in capitals, a run of one
  case with no boundary to read, 14 of 422 parts of four letters or more for "<WORD>150.00" (the judge's review round 2,
  GATEWAYJ2-4: "REMARK150.00" for MARK, "PRIMARY150.00" and "SUMMARY150.00" for MARY, "BILLED150.00" for BILL,
  "BALANCE150.00" for ALAN, "ALLOWED" for LOWE, "COVERAGE" for VERA, "GENERIC" and "GENERAL" for ERIC and GENE, "EARLY"
  for EARL, "ASSISTANCE" for STAN, "GROSS" for ROSS, "FORWARD" and "TOWARD" for WARD, "TRANSFER" for TRAN, "PENALTY" for
  PENA), and the same in lower case ("remark150.00"): an all-capitals payer letter whose columns OCR glued goes to a
  person for a patient Mary, Mark or Bill, a refusal and never a leak ("REMARK150.00", "remark150.00", "PRIMARY150.00"
  and "BILLED150.00" are pinned beside "BALANCE24.00"; "Remark150.00" is sent); of 40,000
  MOD-16 letters for 14 such patients, 118, all a whole word (Page, Total, Noted, Range); of 67,392 suite and line letters,
  none; an initial alone after a digit before the patient's own name ("Room 4L, Lee Hall" for LEE) is refused. The
  gate's 243 fail-safe letters are pinned in `src/redact.residuals.json`, the round's in the tests. MOD-16's property,
  its seed 1034253323 and the three CI seeds hold; 40,000 generated MOD-16 letters on two seeds are all sent unchanged,
  the 3,050 of them cc3dd7f6 refused included; the property file's MOD-13, MOD-15 and MOD-16 properties hold on 200 more
  seeds each (the glued property failed on seed 55 before this round, "2020-01-02AUGU ST" for a part AUGUST, a month's
  word written with a space inside, now read; and on seed 2026110710, now a fixed run).
  Accepted residuals, by the orchestrator's rulings of 2026-11-07 (10:53 and 15:27), every row pinned in
  `src/redact.residuals.json` and asserted exactly as it is today by `src/redact.residuals.test.ts`, each a letter
  cc3dd7f6 refused:
  - (A) an SSN or phone written elsewhere in a letter whose chain only held barriers hold, in a shape no pattern or chain
    rule reads (385 SSN and 171 phone letters of the gate, all from reviewers' fuzzers and data files: after a word glued
    to a range's end and white space, `Re: 01/01/2020-4th of March, 2020St 90012-3456`, `…2020Paid. 900.12 3456`;
    amount-shaped, five-four or odd groupings, `1900.11-02–16–2028.`, `511.51⁃973.61, Ref 97447.74.58`; a label behind
    its own number, `01/01/2020-150.00 Call 1: 555-0123Paid`): the leak shape cc3dd7f6 already sends in a letter with no
    range, which this fix exposes and does not create; cc3dd7f6 refused each only because the range's own digits chained
    (A3). Closing the class here means refusing every such letter with another short run of digits, which MOD-16's
    must-stay letters hold too: reading every unsigned amount as no barrier there refused 297 of 20,000 generated MOD-16
    letters, and reading a word and white space after a range as joined refused about 10 of 20,000 (`2029Rd. 9 92956`,
    `2028TIN 56-0000465`, `2022-07-02Row 02 28 2030`). Owned by co-001/redact-ssn-phone-leaks (MOD-21, MOD-22): its
    acceptance test is that every pinned row flips to redacted or refused, with its generator and patterns changed
    together, and it lands before any real PHI is processed. The table (`ssnPhone`) holds the gate's 556 rows and 141 of
    the judge's round 1 (its two SSN and phone fuzzers found 729 and 53 such letters of 13,395 and 12,705, all of the
    class), each with its number as this head sends it, in clear, and asserted so (`number`): SSN digits written
    900-xx-xxxx (or the never-issued area 000, 4 rows) and phone digits 202/555-01xx where that keeps the number sent in
    clear (397 of the gate's rows already so); 25 keep their digits, a date's shape with a digit beside it that a fuzzer
    wrote as an SSN (`9 01-12-1985`, read as 901-12-1985, never issued; `01-12-1985 9`). Round 1's table pinned 8 rows
    whose mapped digits this head redacts as `[PHONE]`, a leak pinned as a redaction that the follow-on PR's acceptance
    could never flip; their gate rows are pinned as they leak now (`Re: 120.00 Call zephyra - 1900123456
    01/01/2020-150.00`, `…Medicare 2025550122(2029-02-17`, `…Seen 2025550122th10–28–2026`: the judge's review round 2,
    PHIJ2-1, GATEWAYJ2-1).
  - (A') (15:27) the call's own name, member ID, claim number or date of birth written in a form no rule reads, in a
    letter whose chain only held barriers hold: OCR letter/digit confusions (`S1MONE`, `VANTR3E`, `SYNMEMBERO042`,
    `SYNCLA1M0001`, `ZZ765432l`, `C2O26000417`, `7654321O`), homoglyphs and other-script letters (Cyrillic `ZЕРНYRА`,
    Greek `ΖΕΡΗΥRΑ`, small capitals `ᴢᴇᴘʜʏʀᴀ`, `ЅYNMEMBER0042`), and date writings no rule reads (`14-III-1980`,
    `III/14/1980`, `1980年3月14日`, unpadded `1121975`, `November second, nineteen seventy-five`, `Mar 14th` with no year).
    cc3dd7f6 sends the same forms in any letter without a range; it refused these only for the range's digits, so the
    fix exposes the shape and does not create it. 280 rows are pinned (`ownIdentifierA`, the form as sent in `token`), by
    kind: name 102, member ID 72, claim number 36, date of birth 70 (the judge's review round 2: 113 of 876 and 162 of 552
    harness letters, and PHIJ2-2's inputs); the gate holds none (an OCR and homoglyph fold of the 23,500 gate letters
    cc3dd7f6 refused and this head sends finds no own identifier). Owned by co-001/redact-ssn-phone-leaks: its design
    reads the call's own identifiers through an OCR and homoglyph fold (NFKC, a TR39-style confusable skeleton, and the
    O/0, l/1, I/1, S/5, B/8 digit map before matching), its must-stay damage measured on the differential gate; its
    acceptance test is that every pinned row of (A) and (A') flips to redacted or refused, and it lands before any real
    PHI is processed.
  - (B) the patient's name part that is a month's or a common word, next to a date (`Seen May 2020|June 103 /
    1961-03-03/03.03.61` for patients May and June: 5 letters of one fuzzer), in letters cc3dd7f6 refused only because its
    own redaction missed a date of birth this head redacts: a named case for co-001/redact-ssn-phone-leaks's design (an
    own name part that equals a month or a common word, next to a date).
  Not an identifier, and sent: a lone letter that is one of the name's initials glued to a range's end, with no name,
  part, label or full stop beside it ("Seen 01/01/2020-150.00Q Paid in full"; 959 of the round's 41,496 letters), as
  often a code's or a unit's letter; cc3dd7f6 refused it only for the range's digits, and sends it with no range ("Seen
  150.00Q Paid in full"). Pinned in `loneInitial` (938 rows: those letters, deduplicated, and PHIJ2-1's, `…150.00J Paid
  in full`), each asserted as sent with its initial (`token`); a part of two or three letters written letter by letter
  there is refused since the judge's review round 2 (above).
- **Time.** Every pattern is a fixed sequence of bounded pieces, run once per start; the label window is read once per
  bare match, the scan's chains at most four groups from each, or under a label until they hold more than eleven digits
  (twelve groups at most). A letter with no invisible run is read once, not on two readings, by the patterns and by the
  scan (review round 1: corr-ssn-2; a letter of a digit and a bare line break, repeated, takes half its time before). A
  letter of 100 kB of the crafted shapes is redacted and checked well within the 3 s budget. The folded view no longer
  reads the end of a string it is building, which made a letter of invisible runs quadratic. The scan settles ranges in
  one pass each way, and a list is followed back sixteen numbers at most (review round 2: 100 kB of date ranges, amount
  ranges or one list after a keep-noun is in the time rows). The held check's month words and years are walked together
  once (the judge's review round 2, PHIJ2-4: two 100 kB rows of them far apart are in the time rows), and one check
  builds each folded view of a text and reads its dates once, where it built the same four views up to nine times: the
  slowest of the gate's timing letters, 100 kB of dates with slashes, takes 450 ms (cc3dd7f6 365 ms; 592 ms before).
- **No new prompt version.** `[SSN]` and `[PHONE]` are identifiers in square brackets, which the prompt and the user
  message already describe; no field the reader returns is an SSN or a phone.
- **Tests.** Test matrix MOD-15 (every form redacted, the survivors refused) and MOD-16 (what stays, the call's own
  placeholders, another patient's offered), in `src/redact.property.test.ts` and `functions/denial-letter.test.ts`;
  `src/redact.test.ts` pins phi-guard's SSN and phone examples (area code 2-9) as redacted, `(202)555-0123` as redacted
  and not flagged by phi-guard, and phi-guard's wider net the other way. Reading a letter with no invisible run once
  (review round 1, corr-ssn-2) is held by a count of regular-expression runs, not a clock: that test fails with the
  fix taken out. The tests' twins read as no real phone (review round 2, finding 4): phones NPA-555-01xx, SSNs 9xx, an
  NPI twin with an exchange starting 0 and an ICN twin with area 001.
- **Where the build departs from the design, and why** (review round 2, finding 5).
  - The N6 property of `src/redact.test.ts` (0070, Part 3) now expects `matcher === (letterReads || labeledReads ||
    patterned)`: `patterned` is the self-check of the same text with no identifier to look for, so a text that holds an
    SSN or phone shape, or a chain the scan reads, is refused whatever the patient's number. It is held from the
    generator's side one way only (digits alone in a 3-2-4, or a 3-3-4 with an area code 2-9, over dashes, a space or an
    invisible character between every two groups are `patterned`), with pinned rows (`Also 202.555.0123`, `Also
    900123456*1`). The design (section 10.3, R13) implies an oracle written wholly from the generator's side. It was not
    written: this property's groups mix letters and digits, which reach the patterns, the labels and the scan, so that
    oracle would be a second copy of the scan, wrong wherever the copy is. MOD-15's and MOD-16's generators, which write
    SSN and phone shapes and what must stay, are that oracle for the pattern side.
  - A dash with white space around it counts as a white-space gap in R1(a)'s rule (stricter than R1(a)'s words, which
    name white space only): a period and a spaced dash never sit in one match. So `Paid 150.00 - 2026 total` (an amount,
    a spaced dash and a year: a 3-2-4 otherwise) is sent as written, and `Call 202.555 - 0123` is not read and the scan
    refuses it, a letter that goes by hand. An amount next to a number is common in a payer letter; a phone written with
    a period and a spaced dash is not.

Still not covered, recorded as residuals: addresses (the ruling does not cover them); an MBI (a member ID, redacted when
the records hold it); a phone written in words or with letters (`1-800-555-SYNP`); an SSN's last four in prose (`ending
in 3456`); an unlabeled bare ten starting 2 that passes the NPI check; a seven-digit local number with no phone label,
or with a digit in its label window (`Phone 1: 555-0100`), and so an SSN or phone whose label is behind a number and
then an amount (`TTY 1: 7,439.10 942.77 3098`: re-review GATEWAY1-1; cc3dd7f6 sent it too; after a range the fix added,
`SSN 1: is 01/01/2020-900.12 3456`, `Phone 1: is 2/5/26-545.68 936 90 8080172.00`, refused as cc3dd7f6 refused them
since review round 3); a non-NANP phone number; `1` and ten written as one run with no phone label
(`Patient 12025550123`, kept as an 11-digit ICN is); two phones with nothing between them (`202-555-0123202-555-0124`);
an SSN written with an OCR space and then a whole slashed or dashed date for its last six (`SSN 900 12/03/56`; next to
a range the fix added it is refused, `SSN 9 01-12-1985-150.00`, as at cc3dd7f6: re-review PHI1-2, review round 3); a
number written as two whole dates or amounts, or one of each (a currency amount too), joined by a dash, read as a range
(`9-1-26-1-23-45`; no SSN or phone in a shape the patterns read is one; an SSN read as an amount without cents and a date
of two separators, `Paid 0,900-12-19.85`, `SSN 1,900-12-19.85`, `SSN 2,900-12-19.85-1/3/20`, and a phone whose last
group and the next number read as a date that starts a range, `Call 202 555 01.23-12-150.00`, are refused since review
round 3, as cc3dd7f6 refused them: review PHI2-4); an unlabeled amount-shaped SSN or phone (`900.12 3456`, `202 555
01.23`), read as an amount as R1 keeps `150.00 1234`: alone, after white space, or as one end of a dash range of two
amounts (`150.00-900.12 3456`), as at cc3dd7f6; at an end of a range the fix added, with a short group or an amount
beside it, the letter is refused as at cc3dd7f6 (`01/01/2020-900.12 3456`, `$1-900.12 3456`, `202 555 01.23-1/3/20`:
re-review PHI1-1, review round 3); under an SSN or phone label it is refused (SEC-5, GATEWAY1-2), but a label glued to
the word before it by a lost space is no label, so there it is read as unlabeled and sent alone (`PatientSSN 900.12
3456`, `PaidPhone 202 555 01.23`, as at cc3dd7f6: review PHI2-3; owned by the follow-on leak PR,
co-001/redact-ssn-phone-leaks, with the proposal to read a label that a change of case sets apart, as `PatientSSN`, and to
refuse a glued label in capitals, `PATIENTSSN 900.12 3456`, as an unknowable boundary); at a range's end, or in a letter
whose chain only the range fix's barriers hold, the glued label is read and the letter refused (`PatientSSN
01/01/2020-900.12 3456`, `PaidPhone 202 555 01.23-1/3/20`, `01/01/2020-150.00-PaidSSN 900 12 34.56`); a masked SSN
glued after a range's end is refused as at cc3dd7f6 (`01/01/2020-150.00XXX-XX-3456Paid`; glued to a digit or a word
elsewhere it is the follow-on leak PR's class); an SSN or phone glued
digit to digit to a date, a year, an amount or a currency amount, which the scan reads as one long group (`SSN
900-12-3456150.00`, `SSN 01/01/2020900-12-3456`, `$514451/293-6215`: review GATEWAY1-3); spaced and labeled, it is
refused only where a run of its groups that starts at the label's first group, or at the amount the label reaches, holds
9 or 10 digits, or 11 starting with 1 (`SSN 900 12 3456150.00`, `SSN 900 12 34561.00`; a run from elsewhere with a group
of five digits or more is read as a code: review PHI2-6), and sent otherwise (`SSN 900 12 345615.00`, `SSN 900 12 3456150.0`, `Phone 202 555
012315.00`, `Phone 202 555 01231.00`: re-review GATEWAY1-2), as at cc3dd7f6; next to a range the fix added it is refused
as cc3dd7f6 refused it (`SSN 900 12 345615.00-01/02/2020`, `SSN 900123456120.00-01/02/2020`, `Phone:
2025550123150.00-01/03/2020`, `Tel: 202-555-01231 January 2020-150.00`: re-review PHI1-2, review round 3); an
amount-shaped SSN whose first group a date reading joins to the number before it (`SSN $10-9.00 12 3456`, where `10-9.00`
reads as a date; sent at cc3dd7f6 too); an amount-shaped SSN or phone after a range and white space with its label more
than 24 characters before it is refused since review round 3 (`Phone March 11, 2029−2,866.66  960.58 4433`, an amount
beside the range; GATEWAY1-2, PHI3-5);
an SSN or phone after its label with the call's own identifier between them, set apart by white space or punctuation
(`SSN Vantree 900.12 3456`, `SSN for Zephyra Vantree: 90012-3456`), where the scan's label window ends at the
identifier's placeholder, so a shape only a label makes a number is read as unlabeled and sent (found by review round
2's fix, sent at cc3dd7f6 as well; the call's identifier glued to the number is refused, review round 3; owned by
the follow-on leak PR, co-001/redact-ssn-phone-leaks, with the proposal to read past a placeholder that only white space
or punctuation sets apart from the number, minding a phone word's own number on the line before a row); a range whose
day-first ordinal second end has a two-digit year glued to a word that starts like an ordinal suffix
(`01/01/2020-4th March, 20St. Mary`), refused, its `St` read as a day's suffix (review GATEWAY2-2); a labeled SSN or
phone split into a group of five digits or more, a group under five and a money amount (`Soc Sec 93798
4 1.46`, `Fax: 99299 3 8.10`), which that units column ends as it ends a service line's (review GATEWAY2-1; cc3dd7f6
sent it too; 4 of 20,000 letters of the split fuzz); an amount followed by a dash and a year-first date, whose last
integer digits, cents and year are written `[SSN]`
(`Service 150.00-2020-04-05` is `Service [SSN]-04-05`: over-redaction, never a leak, GATEWAY1-5); a person's nine or ten
written bare in a list a keep-noun names
(`Claims 900123456 and 900551234`), kept as the keep-noun keeps the first; a ten-digit chain of short groups with an
area code 0 or 1 (`123-456-7890`), refused by the scan rather than sent; an SSN or phone written in two groups, one of
five digits or more, or in five groups or more, with no SSN or phone label nearest it (`Also 202-5550123`, or `Call
about claim 202-5550123`, where the keep-noun is nearer), which the scan reads as a code, ZIP or TIN column and sends;
other-script digits in names, member IDs and dates (SSN and phone shapes are read by value); and a payer letter misfiled
as a contract, which reaches `proposeContractTerms` unredacted unless its patient is already in the records (a proposal:
the contract screen refuses a page holding a dash-, period- or invisible-joined 3-2-4, a masked SSN or an SSN-labeled
nine). A slash or a closing parenthesis between groups (`202/555-0123`, `202)555-0123`), an OCR space inside a group, a
semicolon with no space, a number after a digit and an invisible run that also holds an invisible run inside a group,
and two numbers each wrapped inside a group on lines next to each other are refused by the survivor scan, never sent.
