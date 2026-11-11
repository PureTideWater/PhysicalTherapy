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
(`1234,5678`) joins nothing; and a part written in lower case with a space inside it (`jo ann`) is not a name (for the
letter reader both are closed by the amendment of 2026-11-11, `co-001/redact-item-26`, below: MOD-23).
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
  as it was there: review PHI2-5, closed in review round 3; and a date read only from a start inside the written date of
  birth, its last numbers with the number after it, is no second date of birth, so "DOB 1/2/01 - 01/05/2026" for a
  patient born 2001-01-02 is "DOB [DATE_OF_BIRTH] - 01/05/2026" as it was there and not "DOB [DATE_OF_BIRTH]/05/2026":
  review round 5, F4); a range joined to a further group is still no barrier. A date cc3dd7f6's scan read with every
  letter as a space, as it reads once any letter touches a digit ("12/31 terminated. 26" in a letter with "97110GP"), is
  a barrier of the scan's first reading too where it is read with only the words no digit touches as spaces and no SSN,
  Medicare or phone label stands in it (review round 5, F6: "Coverage 10/1/2025-12/31 terminated. 26 units of 97110GP
  were billed." was refused for any patient); read over a label or a glued word it is kept only where the first reading
  has a barrier, as before ("150.00-$10-⏎SSN 9.00 12 3456Paid", "3rd—01|90 0-12-3456" stay refused). An
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
    of case, a letter with no case ending the word before it and beginning none: "OʼBrien" with U+02BC, "ʼZephyra",
    "Zephyraʼs", a letter of a script without case, review round 5, F1) or anywhere in a run of one case, or written
    with joiners or a space inside as its form reads it
    ("01/01/2020-150.00Zephyra", "Jane0.00-01/02/2020", "2020PAIDZEPHYRATODAY", "150.00ZEP HYRA"); never inside a word
    that goes on in its own case ("2020Billed" for a part BILL, "0.00Coverage" for VERA, "Remark1" for MARK: read anywhere,
    the judge's review round 1 found it refused 867 of 71,689 of the gate's MOD-16 and range letters that cc3dd7f6 sent,
    for a patient Bill, GATEWAYJ1-1); letters between a digit and the name's placeholder with only invisible characters
    between (a part the placeholder cut), and a part's head glued to a digit before the placeholder, where redaction read
    the rest of a part written with a space inside as a shorter part: the rest another part of the name, a space or a
    joiner alone between ("150.00DANIEL [PATIENT_NAME]" for DANIELLE LE; the glued property's seed 2026110710, now a fixed
    run: GATEWAYJ1-4), never an initial (a unit's letters before a name whose rest is one, "Session 30min [PATIENT_NAME]"
    for MINA ALI, and "Seen 150.00MIN [PATIENT_NAME] [PATIENT_NAME] paid" for "150.00MIN A ALI", are sent as at
    cc3dd7f6); a number's own letters are no head, whatever part they begin: an ordinal's suffix that fits the whole
    number glued before it ("1st", "2nd", "3rd", "4th", "11th" to "13th", "21st"), a unit's letters after a whole number
    (min, mins, hr, hrs, sec, secs, wk, wks, mo, mos, yr, yrs, yo, in, ft, cm, mm, kg, lb, lbs, deg, and since review
    round 5, F7, mg, ml, oz, day, days, visit, visits, unit, units: "30min", "6mo", "5in", "30mg", "4units"), "am" or
    "pm" after an hour from 1 to 12, a time h:mm or h.mm, or a time hhmm after a space or "@", and two
    letters after a procedure code of five characters (five digits, or a letter and four digits), its modifier
    ("97110CO", "G0283CO"). The whole number, hour or time has one to four digits after no digit, decimal point, comma,
    slash, currency sign, dash or colon, or stands after a range's first end and its dash or slash, that end a whole
    number, an ordinal or an hour with "am" or "pm" after it, or a time ("3rd-4th", "3rd/4th", "1-30min", "9-10am",
    "9am-10am", "10:00-11:00am", "1400-1500am"; a number after another number's slash is no hhmm, "01/2020PM"). Each was
    refused before it was read so ("On March 10th, [PATIENT_NAME]" for THOMAS, "at 9am [PATIENT_NAME]" for AMANDA: 5b8ed30f refused them, 84 of 28,428 natural
    sentences for 199 first names and 6 surnames, the judge's review round 2, GATEWAYJ2-2; "Seen on the 4th
    [PATIENT_NAME]." for NGUYEN THANH ANH, "Since the 1st [PATIENT_NAME] [PATIENT_NAME]" for TRAN STAN AN, "Appointment at
    9am [PATIENT_NAME]" for AMAL AL ZEPHYRA, "On the 4th [PATIENT_NAME]" for THAI AI: 3cf4d8cf refused them with the
    "min" letters above, 86 of 306 natural sentences for 17 patients with a first name MINA, MINH, MING, MINO, STAN,
    AMAL or THAI, four of them controls, and the reviewer's THANH ANH rows, the judge's review round 3, GATEWAYJ3-1;
    "Seen 9-10am [PATIENT_NAME]", "Appointment at 9.30am [PATIENT_NAME]" and "at 0930am" for AMAL AL HASSAN, "Seen on
    March 3rd-4th [PATIENT_NAME] [PATIENT_NAME]" for NGUYEN THANH ANH, "Session 30min [PATIENT_NAME]" for MINSEO SEO,
    "Measured 5in [PATIENT_NAME]" for INES ES, "Billed 97110CO [PATIENT_NAME]" for COLIN LIN: 69a3a2fe refused them, 66 of
    312 natural sentences for 13 patients, 10 of them with a part that is a unit's, an hour's or an ordinal's letters
    and another part (30 units, 24 times, 12 ordinal ranges; none of the 3 controls), and the review's and its skeptic's
    time, unit and modifier rows, the judge's review round 4, GATEWAYJ4-1; all sent at cc3dd7f6 and again now); after
    an amount the same letters are a head ("Paid 150.00ST AN Zephyra" for STAN AN ZEPHYRA and "Seen 150.00MIN HO paid" for
    MINHO HO are refused, fail-safes: cc3dd7f6 sends "ST" of STAN and "MIN" of MINHO in clear there), and a bare whole
    number or a range's second end glued to a head stays refused ("1Daniel Le", "Seen 9-10Daniel Le", "Seen
    3rd-4Daniel Le"); an
    initial alone with a digit right before it, before
    the name's placeholder (or a number's that a part of the name is written as), a whole part or another such initial
    ("150.00Q Zephyra", "150.00J. [PATIENT_NAME]"), never before another placeholder or a word that only begins like a part
    ("Suite 2A, [PHONE]", "Suite 2A, Albany" for AL: 4,696 of 67,392 address and row letters were refused so,
    GATEWAYJ1-3), never with a digit after it, where it is a code's letter ("ZEPHYRA G0283", "MARIA M54.50"), and never
    a letter that is the number's own by its structure (review round 5, F5): the last character of a token shaped as an
    ICD-10-CM code (a letter, a digit, a letter or digit, a dot and one to four letters or digits, after no letter,
    digit or dot: "Diagnosis S83.511A. [PATIENT_NAME] was evaluated" for ANNA DAVIS), or one of d, h, m, s, w, y, x and
    f after a whole number of one to three digits, read where a unit is ("Authorized 30d. [PATIENT_NAME]" for DANA
    SMITH, "Therapy 3x, [PATIENT_NAME]", "Patient 45F [PATIENT_NAME]", "Visit 6w [PATIENT_NAME]", "Level L4-5S,
    [PATIENT_NAME]"); after an amount's cents, a currency sign, a year's four digits or a longer number the letter
    stays an initial ("150.00D Dana Smith", "$30D", "2020D", "12345D"), as does every such letter in a held letter;
  - a member ID or claim number of letters with a digit beside it, and one of letters and digits inside any longer token
    ("Seen 150.00SYNCLAIM0001", "2020PaidZZ7654321"), and either with a part of the patient's name inside it already
    replaced, the rest of the number read beside the name's placeholder with the number's own gaps ("2020-01-02S
    MITH<SHY>[PATIENT_NAME]" for a member ID SMITHJONES of AA SMITH-JONES, redaction having read "JONES" after the soft
    hyphen as the name: review round 5, F1);
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
    "D/O/B" too, whose date redaction did not read ("DOB 1961/3", "DOB March 3rd, nineteen sixty-one", "D/O/B 2-XI-1975"),
    the label glued to anything before or after it ("Seen 01/01/2020-150.00DOB 2-XI-1975", "PaidDOB 1961/3", "2020Born
    1975/11", "DOBMar 14th"; only "D O B" written with spaces alone is read between word edges, "AND OBTAIN 2 copies" is
    sent: the judge's review round 3, PHIJ3-2, found 126 of 196 letters with a label glued to a range's end sent where
    the same letter with a space was refused, now none);
  - the judge's review round 2 (PHIJ2-2, GATEWAYJ2-3): the forms of the call's identifiers some rule reads elsewhere,
    which held letters sent: the date of birth in the forms redaction reads after a birth label (since the judge's review
    round 3, PHIJ3-1, one rule read on the letter as runs of digits and runs of letters in one pass, where round 2 read
    only the two-digit year first with "/", ".", white space or a dash between, and 4,479 of 64,944 letters of every
    order, year length, padding and separator in 12 held frames were sent): its year (four digits or two), month (a
    number in any padding, or its word) and day in any order, at most four characters of any kind between each, or any
    number of them where only white space, date separators, commas, full stops, apostrophes and "OF" stand there, as
    `datesIn` takes them between a date's parts at any length ("80-03-14", "80_03_14", "80|03|14", "80\03\14",
    "80⁃03⁃14", "1980-14-03", "03/80/14", "14/80/03", "80 March 14", "Mar., '80, 14", "14TH OF MARCH '80",
    "198014thMarch", "80  /  03  /  14", "80     March     14", "80-03-⏎        14", "14     80     March": the judge's
    review round 4, PHIJ4-1, found 1,140 of 4,992 letters of wider gaps in 12 held frames sent, two spaces around a
    separator, five spaces or more, a separator then a line break and indentation, CRLF, and 216 more with the month's
    word last that no rule read; none is since), its month's word beside one run that is its year and day ("Mar8014",
    "141980March"), and all three as one run of six to eight digits with the four-digit year or of six with the two-digit
    year padded ("19801403", "801403", "196133", "1121975"); not a run inside a longer one ("TIN 198003145"), and so for
    a patient born 1980-03-14 "Total 80.03 14 units" is refused (cc3dd7f6 refused it too: a fail-safe of a held letter,
    sent in round 2); a part of the date of birth beside the date of birth's placeholder, where redaction read only some
    of a written date ("Seen 19'[DATE_OF_BIRTH]" for "19'February 1941", which cc3dd7f6 sends so in any letter with no
    range), four characters apart or past a gap of any length of white space and separators ("[DATE_OF_BIRTH]     20"
    for "May/2009     20", redaction reading "May/2009" as May 20, 2009: round 4's widened property found 28 in 30,000
    runs, none in 60,000 since); and a part of two or three letters written letter
    by letter, each letter alone, or split anywhere by up to three spaces, line breaks, full stops or joiners ("Seen
    01/01/2020-150.00A L Paid" for AL, "T Y" for TY, "Bo b" for BOB, "An⏎n" for ANN: the judge's review round 4,
    PHIJ4-2, found 105 of 1,920 letters of a three-letter part split by a space or a bare line break sent, none since;
    no form reads it, a space splitting a part only two letters or more from each end; with no range both trees send
    it, "Seen 150.00T Y Paid"); two or more of a name's initials written together as one run of letters, in any order
    and case, for a name of any number of parts, each letter of the run counted against the initials' ("…2020JZ
    $0,000.00" and "Re: [PATIENT_NAME] (JZ)." for JANE ZEPHYRA, "SV" for SIMONE VANTREE, "QJZ" and "ZJQ" for JANE Q
    ZEPHYRA, "AG" for a name of seven parts: PHIJ4-2 found 2,024 of 6,808 letters in 296 held frames sent, none since;
    no form reads them, and with no range both trees send them, cc3dd7f6 "Re: [PATIENT_NAME] (JZ)." too, a named case
    for co-001/redact-ssn-phone-leaks's design beside ruling A' below), and the same glued to another word's letters, at
    either end of a longer run or inside it ("4thZQ was seen", "PaidZQ 150.00", "ZQpaid in full", "SeenQJZtoday":
    review round 5, PHI5-1, found 276 of 560 such letters sent at 9f953223, none since; every stretch of the initials'
    own letters is read in windows no longer than the name has parts, anywhere in a run, and a word that holds one
    initial's letter twice is no pair, "A jazz quiz was held"; where the letters spell a whole part of the name that a
    boundary sets apart, redaction replaces them and the letter is sent, "BEA" for ANA BEA CORA DINA ELLA FAYE GIA: the
    round's F2, a test's expectation corrected);
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
  review rounds 1 to 4, 2026-11-07, and of review round 5, 2026-11-10, the same counts in each but where round 5 is
  named below): the call's own identifiers that cc3dd7f6 redacted or refused and this head sends: no initial, date
  of birth, member ID or claim number, and 5 name letters (ruling B, below); SSNs 385 and phones 171 letters, all in
  letters whose chain only held barriers hold (ruling A, below). The round's own harnesses put every own-identifier shape
  in such letters (30,570 letters of short, month-word and initial parts glued to words; 342 and 3,420 of the shapes
  recorded above as sent with no range; 41,496 of every kind at a range's ends; 12,705 SSNs and phones glued there): none
  is sent but ruling A's class and a lone initial with no name beside it (below), in the forms those harnesses wrote. The
  judge's review round 2 wrote the call's identifiers in forms they did not (OCR letter/digit confusions, homoglyphs,
  other scripts, unread date writings, a short part letter by letter: 1,428 letters of three patients in 12 such frames,
  PHIJ2-2) and found 330 sent: the 55 in a form a rule reads elsewhere (45) or a short part letter by letter (10) are
  refused since (above); the 275 in forms no rule reads are ruling A' (below). The judge's review round 3 wrote the
  date of birth in every order, year length, padding and 23 separators, and in month-word forms, in 12 such frames
  (64,944 letters of three patients, PHIJ3-1), and a birth label glued to a range's end before the forms no rule reads
  (196 letters, PHIJ3-2): 4,479 in forms redaction reads after a birth label and 126 behind a glued label were sent,
  and none is since (above); of 22,329 in forms no rule reads, 135 are still sent, the two-digit-year compacts of four
  or five digits (ruling A', below). Its sentences of a unit, an ordinal or a time before the patient's name
  (GATEWAYJ3-1: 306 natural sentences for 17 patients, 15 and 11 unit rows) are all sent as at cc3dd7f6 but one fail-safe
  refusal ("Paid 150.00ST AN Zephyra", above). The judge's review round 4 found 66 more natural sentences of 312 refused
  that cc3dd7f6 sent (a range of hours or of ordinals, a time h.mm or hhmm, a unit before a part whose rest is another
  part: GATEWAYJ4-1) and a code's modifier before such a part: all sent since, but the amount's letters ("Seen
  150.00MIN HO paid", a fail-safe, above); of 756 letters that split the name at such a number's letters, none that
  cc3dd7f6 refused is sent. Its harnesses wrote, in held letters, the date of birth with gaps of any length (1,356 of
  4,992 letters sent), two or more initials together (2,024 of 6,808) and a three-letter part split (105 of 1,920):
  none is sent since (above), and the round's other harnesses (5,760 own-identifier writings, 2,516 numeric IDs, 33,326
  range letters for clean-letter refusals, 2,040 short parts) find nothing more. Review round 5 (2026-11-10, against
  dedeb35f, each finding reproduced by the reviewer's harness before and after) found:
  - PHI5-1, in held letters, two or more initials glued to another word's letters: 276 of 560 sent at 9f953223, none
    since dedeb35f (above);
  - F1, the glued property failing on 4 of 304 global seeds (85720467, 283659814, -1270007264, 708482257), two letters
    sent with an identifier in clear as cc3dd7f6 sends them: a part of the name beside a letter with no case
    ("Billed 150.00-120.00OʼBrien Aa, " for O'BRIEN AA), and a member ID or claim number of letters, begun glued to a
    digit, whose last part redaction took as the name ("DOS 2020-01-01–2020-01-02S MITH<SHY>JONES;" for a member ID
    SMITHJONES): both refused since (above), the generator unchanged;
  - F2, a test's expectation: the held initials property expected a refusal where the initials spell a whole part of
    the name that redaction replaces (seeds -893188803, -2096183961): it now expects a refusal or exactly those letters
    replaced, and draws what it drew;
  - F3, a scan quadratic in the length of one held range of many ends (Time, below);
  - F4, must-stay damage: the token after the written date of birth lost its first number, a date of service, a time,
    an amount or units, over " - ", "|", ". ", "/" and "-" (12,600 of 12,600 letters of the reviewer's harness; cc3dd7f6
    none): none since, each sent as cc3dd7f6 sends it, and the gate's 4 dates, number and word that this head changed
    and cc3dd7f6 sent, which were of this class, are none too;
  - F5, natural sentences refused that cc3dd7f6 sends with only the name replaced, a number's own last letter read as
    a lone initial before the name (304 of 1,440 diagnosis sentences for 10 patients, and "30d.", "3x,", "45F", "30s.",
    "6w" before the name): none refused since (above); the gate's 130 letters of this shape that 9f953223 refused and
    cc3dd7f6 sends with the letter in clear are sent again (114 of the round 4 skeptic's token harness, "Dx S83.511A,
    ZEPHYRA, ANNA", and 16 of "1X. Vantree" for XU VANTREE and "1M. Zephyra" for MAY ZEPHYRA, a one-letter unit's shape
    that may be an initial: sent as cc3dd7f6 sends it, where a code's letter or a unit cannot be told from an initial
    by structure);
  - F6, clean letters refused for any patient that cc3dd7f6 sends unchanged, a range whose second end has no year
    before a sentence end and a count, in a letter with a modifier glued to its code (4,584 of 6,000 letters of the
    reviewer's frame family and 4,800 of 6,000 of a second one): none refused since (above); of the gate's letters, the
    12 that a mark of every such date would have sent again with an SSN in clear, as cc3dd7f6 sends them, stay refused;
  - F7, units the head rule did not know (mg, ml, oz, days, visits, units): read since (above). Its other gaps stay
    fail-safe refusals, each only for a patient whose name has a part that begins with the number's letters and whose
    rest is another part: a modifier after a code that follows ",", "/" or "CPT", a second modifier ("97110-59CO"), a
    four-digit revenue code ("0420CO"), "9:30:00am", "9,10am", an ordinal after "Jan." or a comma;
  - F8, recorded and unchanged: after a date a birth label introduces that is not the date of birth, digits set off only
    by an invisible character are taken with it ("DOB: 01/02/1970<ZWSP>1234567893 NPI" loses the NPI's digits,
    "DOB 01/02/1970<SHY>150.00" loses "150"), where cc3dd7f6 kept them: the fail-safe reading of a birth label, a form
    only a contrived letter writes;
  - F9, recorded and unchanged: the accepted fail-safe refusal of the date of birth glued digit to digit also fires on
    numbers that are no date of birth ("97112 12 12 00 270.98" for a patient born 2012-12-12: 4 of 20,000 service-row
    letters), a person handling the letter;
  - PHI5-1's cost, recorded: a held letter is refused whenever any word in it holds two of the name's initials together
    ("Service" for S E, "Paid" for I D or A I), so for a patient with such initials most held letters are refused, as
    cc3dd7f6 refused every one of them; a patient whose initials stand together in no word of the letter (J Q Z) is
    served. No boundary inside a run of letters of one case can be read, and reading only a change of case would send
    "4thzq" and "BEST": the safer reading is kept, and co-001/redact-ssn-phone-leaks, which designs how the call's own
    identifiers are matched, may narrow it with its own measurement;
  - the re-review of the round's fixes (two reviewers, the changes since 9f953223 only), PHI5-2: a held letter sent two of
    the initials with a space, a hyphen, an apostrophe or a modifier letter between them where one began or ended a
    longer word or the modifier letter joined them in one run ("Z VPaid", "Z-VDenied", "ZʼV": 70 of 2,016 letters of the
    reviewer's harness, every one refused by cc3dd7f6). Two of the initials with one to three characters between them
    that are no letter of a word, the first not preceded by a word's letter or the second not followed by one, are now
    read as written together and the letter refused; none of the 70 is sent;
  - the re-review's findings recorded and unchanged, each the safer reading:
    - F4's mirror: where the last two numbers of a written date that is no date of birth and the number after it read
      together as the date of birth ("DOS 11/12/24 - 24 units" for a patient born 2024-12-24), they are replaced as one,
      and a date of service and a count cc3dd7f6 sent are lost. It takes a coincidence of three numbers (5,024 of 9,990
      letters built to coincide over a hyphen, a dash, a slash, a full stop or a bar; 0 of 10,010 others). Reading no
      date from a start inside any date cc3dd7f6 read was tried and sent dates of birth written straight after another
      number ("12.03/14/1980", "June 103 / 03.03.61"), so the rule stays and one row pins it;
    - F6's neighbours: a clean letter is still refused where a range's end without a year stands across a sentence end
      from a glued token on its far side ("This is the 2nd level appeal.<LF>Coverage 11/2025–10/8/26 was active.",
      "Dates of service 04/02/2023-9/26. Remark MA01 applies."): 784 and 170 of 6,000 letters of two frame families, 83
      of 70,000 of a range fuzz, none of the gate's; cc3dd7f6 sends them unchanged, reading the date over the glued
      word. Marking every such date a barrier sends them, and sends again the gate's 12 letters with an SSN in clear
      that cc3dd7f6 sends and this head refuses ("3rd—01|90 0-12-3456"): a person handles the refused letter, and
      co-001/redact-ssn-phone-leaks, which changes how those numbers are read, decides it again with its patterns;
    - a number's own last letter before the name, outside the two shapes F5 reads (an ICD-10-CM code with its dot; D, H,
      M, S, W, Y, X or F after one to three digits), is still taken for an initial and the letter refused where
      cc3dd7f6 sent it with the name replaced: "CPT 0054T Tina Vantree", "S83511A", "Box 24J", "Suite 4B" (8,008 of
      28,560 sentences written with a matching initial; 0 of 1,848 with a dotted ICD-10 code);
    - one more letter refused through F1's reading of a number with its part replaced ("…10/28/25al; Ng Therapy" for AL
      NG with the member ID ALNG: 1 of 65,000), the recorded glued own-identifier class;
  - the re-review's test finding: MOD-15's property failed on global seed 561949509 at cc3dd7f6 and here alike, its
    generator drawing the call's own claim number as the digits of a fixed survivor ("202.555 0123"), which is then
    rightly replaced and the letter sent. The generator no longer draws a survivor's digits as the call's own number;
    nothing else it draws changes. The re-review's sweeps: the 11 named seeds, 228 to 248 fresh global seeds on each
    property of the property file and 161 on the denial-letter file, that one failure only;
  - F10, the residual table: its text named rounds 1 to 3, and 8 of its 60 fail-safe rows tagged must-stay were not
    sent unchanged by cc3dd7f6 (below).
  The property file's properties hold on the round's 4 failing seeds, the five MOD-16 seeds and 304 fresh global seeds,
  and the denial-letter file's on its 2 failing seeds and 104 fresh ones. The gate after round 5: SSNs 385, phones 171
  and 5 name letters as before, no other identifier; of its 975,489 letters this head refuses 422,677 (422,804 before
  the round; cc3dd7f6 247,791). Codes, units, amounts, dates, IDs,
  references, numbers and words this head changes that cc3dd7f6 sent: none (dates 4, a number and a word 1 each before
  round 5, all in one reviewer fuzzer's letters of two patients' dates of birth: F4's class). Fail-safe refusals of
  letters cc3dd7f6 sent: 60 must-stay
  letters by the gate's oracle, each holding the call's own date of birth glued digit to digit ("Seen
  $10.00-1980/03/14150.00", one reviewer harness), refused as a glued date of birth (52 it sent unchanged; 8 it sent
  with a month-word part of the name or an amount's digits replaced, no identifier in them that the oracle places:
  tagged apart in the residual table since review round 5, F10); 598 letters whose identifiers
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
  cc3dd7f6 refused. The differential gate (its fixed corpus, oracle and runner), the scripts that write the table and
  the review rounds' harnesses whose rows it pins are kept, synthetic only, in the ops repository (`claude/build-ops`)
  at `designs/lane-b-redact-ssn-phone/gate/` (`KEEP.md` there says what each is); the table is regenerated only from
  their runs, never by hand, and co-001/redact-ssn-phone-leaks owns the next regeneration (the judge's review round 3,
  GATEWAYJ3-2; review round 5, F10, brought the table's own text to round 5 and tagged the 8 fail-safe rows cc3dd7f6
  did not send unchanged apart, by scripts kept with the others; no row was added, dropped or handled otherwise, and
  none flips in round 5: 2,291 of 2,291):
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
    `III/14/1980`, `1980年3月14日`, a two-digit-year compact of four or five digits, `80314` and `6133`, which a letter's
    random numbers hold by chance, `November second, nineteen seventy-five`, `Mar 14th` with no year).
    cc3dd7f6 sends the same forms in any letter without a range; it refused these only for the range's digits, so the
    fix exposes the shape and does not create it. 406 rows are pinned (`ownIdentifierA`, the form as sent in `token`), by
    kind: name 102, member ID 72, claim number 36, date of birth 196 (the judge's review round 3 dropped the 9 rows of
    `1121975`, refused since, and added the 135 letters of its date-of-birth harness still sent, all two-digit-year
    compacts of four or five digits; the judge's review round 2: 113 of 876 and 162 of 552
    harness letters, and PHIJ2-2's inputs); the gate holds none (an OCR and homoglyph fold of the 23,500 gate letters
    cc3dd7f6 refused and this head sends finds no own identifier). Owned by co-001/redact-ssn-phone-leaks: its design
    reads the call's own identifiers through an OCR and homoglyph fold (NFKC, a TR39-style confusable skeleton, and the
    O/0, l/1, I/1, S/5, B/8 digit map before matching), and the name's initials written together and a short part
    split, which this head refuses only in such a letter (the judge's review round 4, PHIJ4-2, above), its must-stay
    damage measured on the differential gate; its
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
  there is refused since the judge's review round 2, and one split anywhere or two initials or more written together
  since round 4 (above).
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
  slowest of the gate's timing letters takes 530 ms (100 kB of a digit and a bare line break; cc3dd7f6 445 ms in the same
  run; 592 ms before round 2; 525 ms in the judge's review round 4's run, cc3dd7f6 443 ms). The held date-of-birth rule
  reads the letter's runs of digits and letters in one pass,
  each against the two before it, and each date-of-birth placeholder once (the judge's review round 3, PHIJ3-1,
  PHIJ3-2: three 100 kB rows of near misses and glued labels are in the time rows). It tests each gap between two runs
  once for one that only white space and separators fill, reads each such gap beside a date-of-birth placeholder once
  from the placeholder it touches, and the held initials rule reads each run of letters once per name; a number's own
  letters are read in the 24 characters before them (the judge's review round 4, PHIJ4-1, PHIJ4-2, GATEWAYJ4-1: three
  100 kB rows, near misses of the held rules, the date of birth redacted again and again past wide gaps, and times,
  units and codes before the name, are in the time rows). Whether a held range stands is settled once per range:
  review round 5, F3, found one held range of many ends ("Service 01/01/2020-150.00-01/01/2020-150.00-…", or the same
  with its last date glued to a word) read again for every chain of its groups, 4.3 s at 20 kB, 30 s at 50 kB and 131 s
  at 100 kB (9.7 s, 60 s and 239 s with the glued word) where cc3dd7f6 takes 0.06 s, 0.10 s and 0.21 s; it takes 0.12 s,
  0.25 s and 0.46 s now (0.08 s, 0.20 s and 0.41 s), and both shapes are in the time rows at 100 kB. The slowest of the
  gate's timing letters takes 662 ms in round 5's run (100 kB of dates written with slashes; cc3dd7f6 452 ms in the same
  run): redaction reads the dates once more, as cc3dd7f6 matched them, for F4.
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

## Amendment (`co-001/packets-verifier-identifier-fold`, 2026-11-11): the reader in a package of its own, and the packet verifier reading through it

**`packages/model-gateway/src/redact.ts` moved, unchanged, to `packages/redact/src/redact.ts` (`@tp/redact`).** The
packet verifier failed a narrative only for a whole-word occurrence of an identifier, so it passed every form this
reader folds ([0047](0047-read-narratives-as-they-show-refuse-the-cases-identifiers-bound-ledger-corrections-and-give-them-and-the-regulation-to-the-specialist.md),
amendment of this date). The verifier cannot import the gateway: the gateway imports `@tp/packets` (a cycle), and its
entry brings the provider SDKs and the database with it. The reader has no import, so it moved whole into a package
with no dependency, which the gateway and `@tp/packets` both import. Whole, not cut: the narrative's reading runs
through `matchesIn`, which shares its views, forms, labels and date reading with the letter's, and a file moved
unchanged can be checked byte for byte. The gateway's modules import it from `@tp/redact`; the reader's tests stay in
the gateway, since they need the gateway's functions. `@tp/redact` is under the money-syntax lint rule the file was
under, and in the web app's `transpilePackages`.

**The narrative's reading has one subject (`narrativeSubject`) and is asked two ways.** `holdsNameOrNumber` (the
drafter's check of its facts) asks it plainly: every identifier, every form, over the text with the gateway's
placeholders masked. `nameOrNumberMatches` asks where, for the packet verifier: each match as a range of the text as
given, which the caller gives in its NFKC form (the plain check normalizes for itself) and in which it masks nothing
(the verifier drops a match that overlaps a token of its own). Beside those it differs from the plain check in two
ways only, each held by a test of `packages/redact/src/narrative.test.ts`:

- it reads an identifier only if the text holds the letters and digits of one of its forms in order with nothing else
  between them. No form can match otherwise (a form's gaps hold no letter or digit), so the answer is the plain
  check's, and a case of thousands of identifiers costs a narrative that holds none of them a search each, not a
  pattern each (17 ms for 10,000 identifiers, where the unfiltered reading took seconds);
- a caller may ask that a part of a name's word count by itself only from a given number of letters
  (`shortestPart`; ADR 0047's amendment says why the verifier asks for four). The default is every form, as the plain
  check reads.

What a later amendment adds to the matcher reaches both.

**Each number is read as a member ID, and one of digits alone as a claim number too.** The narrative's check is told
only that a value is a number. The kind decides one thing, and only for a number of digits alone: its digits written
as a calendar date are the number only after a label of its kind. Read as both, `Claim 2026-03-05` and `Member ID
2026-03-05` are both the number 20260305. The drafter's check read numbers as member IDs only, so it is wider by that
one case; nothing it read before is lost (a member ID's form has no amount exclusion, and a match of either kind
counts). `NarrativeInput` gains `numbers` beside `names`, which the worker fills from the records' columns.

**The drafter's check still takes every part of a name from two letters**, so it refuses to draft for a case whose
patient's name has such a part that is a word of the facts ("in" of HYE-IN): what it checks is sent to a model, and
the floor that suits a narrative's verifier is not this change's to give it. It is recorded for the letter reader's
next change.

**Scope is unchanged**: the narrative's reading takes no date of birth, no initial and no Social Security or phone
number by pattern (amendment of 2026-11-04).

**Still not covered by the narrative's reading** (found by this change's reviews; the letter path's own checks after
redaction are not part of it):

- a name's letters with a character between them that joins no name: a middle dot or the bullet U+2022
  (`Quar·rington`: with U+00B7, U+2027 and U+30FB it joins a number, not a name; the hyphen bullet U+2043 joins
  both), a slash, an asterisk, a square bracket or a brace
  (`Quar*rington`, `Quar{rington`, `Quar[x]rington`; a number's letters split by one of the last three are not read
  either, while a slash beside a letter joins a number, as a period, a colon, a number sign and an opening parenthesis
  do: `QQRS/TUVW`, `QQRS(TUVW`);
- a part written in a lower-case piece after a space or a period (`Quarring ton`, `Quar.rington`: the rule that keeps
  "in a" from being INA), and its letters spaced one by one;
- a name glued to other letters (`DearQuarrington`): the letter path refuses such a letter after redaction
  (`ownIdentifierGlued`), which is no reading of a narrative.

Each needs a person or a model to mean it; they are recorded for the letter reader's next change, since a joiner
added to a name there changes what a letter redacts and, through this function, which stored narratives fail. The
packet verifier's tests pin them as not read (`packages/packets/src/verifier-identifiers.test.ts`), so that change
shows there. The verifier does not widen them by itself: every joiner it added would be a second definition of how an
identifier is written, and a slash or a period between letters is ordinary prose ("N/A" beside a patient named NA).

**A change to the reader is now a change to the verifier**: `@tp/redact` is in the closure of `@tp/packets`, so the
mutation workflow runs the packets shards for it (docs/adr/0066, Part 4, amendment of this date).

## Amendment (`co-001/redact-ssn-phone-leaks`, 2026-11-11): the Social Security, phone and own-identifier forms the range fix exposed

The amendment above ends with three accepted residuals, by the orchestrator's rulings of 2026-11-07: (A) a Social
Security or phone number in a shape no rule reads, in a letter whose chain only the range fix's barriers hold; (A') the
call's own name, member ID, claim number or date of birth in a form no rule reads, in such a letter; (B) a name part that
is a month's word, next to a date. This amendment closes them (test matrix MOD-21 and MOD-22), for the letter reader only
(`letterSubject`'s `patterns`, `redactLetterForScreen` and `holdsIdentifier`): the narrative's check and the packet
verifier, which read through the same matcher, read as before. Its design note, the reviews' reproduction
scripts and the differential gate are in the ops repository (`claude/build-ops`,
`designs/lane-b-redact-ssn-phone-leaks/`); every count below is measured on synthetic letters. Since the packets
verifier's fold moved the matcher, `redact.ts` and the look-alike table are in `packages/redact/src`; the tests and the
pinned rows named `src/...` below are the gateway's (`packages/model-gateway/src`).

- **Acceptance.** Every pinned row of `src/redact.residuals.json` classes `ssnPhone` (697) and `ownIdentifierA` (406) is
  now redacted or refused (632 refused and 65 redacted; 200 redacted and 206 refused), and the 5 rows of `monthWordName`
  have their month word redacted as the name. The differential gate (975,489 letters) reads no SSN, phone or name letter
  against cc3dd7f6 (385, 171 and 5 at ef3e8d20), and none against ef3e8d20 either.
- **Two principles.**
  - *Two tiers.* In every letter, the shapes structure decides are read. In a held letter only (a letter whose digit
    chain only the range fix's barriers hold; cc3dd7f6 refused every one), the shapes no structure decides are refused as
    cc3dd7f6 refused them; in a letter with no held range they stay the residuals recorded above (R1's `150.00 1234`, a
    code column, a local number with no label).
  - *ef3e8d20's reading stands, and this one only adds.* The call's own identifiers are read first as ef3e8d20 read
    them. What only this reading reads is a fresh match (`Found.fresh`): a number a label names only through the call's
    own identifier or a list number (the call's own number found so too); a name written with a joiner ef3e8d20 did not
    read, and what is read only beside it (an initial next to that name: ef3e8d20's own matches are taken on the text
    with each new joiner written as the katakana middle dot, which every list of ef3e8d20 holds beside them and which
    joins no name); an identifier found only on the look-alike fold; a digit-for-letter form. The Social Security and
    phone patterns read the settled matches alone as what stands found, so a fresh match ends no label's window and is
    no item of a list. `redactLetterForScreen` applies the fresh matches only in a letter that the scan and the glued
    checks, read as ef3e8d20 read them (`chainLeft` with `strict` false), do not refuse without them (`appliedMatches`).
    Where they do, ef3e8d20 refused the letter: the fresh matches are left as written, and `holdsIdentifier`, whose
    patterns read through the call's own placeholders as redaction read through the identifiers, finds them again and
    refuses that text (`Call Zephyra at 555-0123/555-0124`, an invisible character between the two numbers or not; `ID
    SYNMEMBERO042 555-0123`). `redactLetter` and `redactionSpans`, which no check follows, apply every match, a
    pattern's match inside a run that holds an identifier glued in a look-alike form too (`900-12-3456Z3PHYRA` is
    `[SSN]Z3PHYRA` there, as at ef3e8d20; the letter reader leaves the run whole and its check refuses it). The letter
    reader leaves a pattern's match so only for a run that no match of the call's own covers whole. Where one member ID
    ends another (`ZZ7654321` and `7654321`), the longer one written with a look-alike digit is such a run and is the
    longer one's own match whole: until this build's last round the pattern's match was withheld there, the ID's
    placeholder replaced the run, nothing was left for the check, and what ef3e8d20's pattern read from the run's last
    digit on was sent as written (`ID ZZ76543<U+A6EF>1`, a line break and `01-02-2020`: ef3e8d20 reads the 1, the break
    and the date as a Social Security number and sends `ID ZZ76543<U+A6EF>[SSN]`; the build sent `ID [MEMBER_ID]` and the
    date). It was the one exception to this principle, found by the builder's fuzzer after review K (one letter in
    31,200; no reviewer's generator had drawn a patient whose one identifier ends another), and it is closed by one
    condition in `matchesIn`: the pattern's match is applied there and merges under the ID's placeholder, as it does for
    a patient with one member ID, and where the covering match is not applied (the settled matches alone) the scan as
    ef3e8d20 read it refuses the text (2,410 such letters in review L, all refused). Its cost, the safer reading: a
    letter with pattern-shaped digits right before such a writing of the ID, under a phone or Social Security label, is
    refused where ef3e8d20 and the build before sent it (`Tel. 345-62`, a line break and `03l41980` before a held range,
    for a patient whose member IDs include 03141980 and one that ends it: 32 of 4,480 letters of that family, review
    L-2), as it already was for a patient with one identifier. The first
    build tested instead whether the number stood alone, and read one look-alike fold everywhere; the reviews found an
    invisible character that defeated the test (B1-1), refusals of ef3e8d20 lost to the fold (B1-3, B1-14, C1-3, C1-4)
    and an initial beside a name written with a new joiner that stood as settled (D1-1: `Ze·ph·yra J 900 12 34, 56`,
    which ef3e8d20 refuses, was sent with its nine digits). The survivor scan keeps ef3e8d20's reading by construction
    (`survivorIn`): its strict reading is ef3e8d20's own with refusals added, but in four places where it reads a label
    ef3e8d20 did not or may hold less in a chain than ef3e8d20 held: a label found only through the call's own
    identifier or a list number, or made by a Social Security label glued after a letter, under which an amount is no
    barrier; that list number, which is no digit of a chain; and a run of nine digits or more before a decimal point,
    which is no amount. A text that holds one of them and that the strict reading does not refuse is read once more with
    none of the four read, which is ef3e8d20's scan line for line, and the worse answer is taken. The fuzzers showed the
    need: the round that took the list number out of the chain sent 22 of their letters that ef3e8d20 refuses (`Cell
    number 1) 7886924.4`, `Phone (20) 2555 0123`, the number's own first digits written as a list number: G1-1), and one
    more had been sent since the amount rule (`Telephone number 8 1234567893.1`, an eleven that starts with 1 to
    ef3e8d20). A copy of the head that always takes the second reading and reports a text where it is worse though no
    such place was marked reported none on any run (456,096 fuzz letters by the builder, 206,772 by review
    H1); always taking it was measured and not kept, at half as much time again on the slowest crafted letters.
- **In every letter.**
  - *Another number's digits glued to an SSN's or a phone's own shape* (`gluedShape`, in the survivor scan): three
    groups joined by joiners with no white space (a dash at a line's end and the next line too), the middle one of two
    digits (three for a phone; a slash only for a phone), the first of three digits or more and the last of four or
    more, one of them longer; a phone with its area code in parentheses is the shape too, a space inside the
    parentheses, a space, a dash, a point or the line's end after them and a space before its last four read with it
    (`(202) 555-0123`, `( 202 ) 555-0123`, `(202) - 555-0123`). Refused where structure says whose the other digits are.
    Before the shape: a currency amount's digits, an amount's cents joined by a point to the group before, or the end of
    a date: its two-digit year or its day, or its four-digit year after the rest of its date, which is its month and day
    in digits, its month in digits and a slash, or its month's word with its day before it, after it or left out, a line
    break before the year too; the digits and their separators with no space between them (`Sec. 2.1. 2026011-22-3333`
    is a section and a number) and a month's word with no day at its word's start (`$150.00900-12-3456`,
    `$514451/293-6215`, `150.00900-12-3456`, `01/02/20900-12-3456`, `2020-01-01900-12-3456`, `01/01/2020900-12-3456`,
    `Jan 1, 2020900-12-3456`, `01-Jan-2020900-12-3456`, `January 2020900-12-3456`, `01/2020202-555-0123`). After a shape
    that starts at its group's start: cents after a point, a range after them too (a dash or a slash and a second amount
    or a date), a second shape begun in its last group, or a date glued to it, its month in digits or as a word
    (`900-12-3456150.00`, `900-12-3456150.00-120.00`, `202-555-0123202-555-0124`, `202-555-012301/02/2020`, `(202)
    555-012301.02.2020`, `(202) 555-012301-Jan-2020`); a month's word after a space begins a date of its own, and the
    number before it is kept (`802-45-678901 Jan 15, 2026`: review G2-1); glued to the number's last digits, its
    four-digit year may follow a space or a comma (`900-12-345601Jan 2020`: H1-2), while two digits there are as often
    the day of a date of its own (`802-45-678901Jan 15, 2026`) and an amount that begins as a year does, its cents after
    it, is none (`366-535-16935Nov 2000.00`: I2-6; a comma after the year ends the date and no more, so
    `900-12-345601Jan 2020,150.00` is refused: J-1). A reference's noun and what stands between it and its number name
    the whole joined number, from the first of its joined groups, across a form's column of spaces and one line break
    after the label's last word, and the letter keeps it (`Case No. 123-45-678901.00`, `Claim # 20260115-12-3456`,
    `Policy No. 01-23456-78-9012`), under a phone word or Medicare too where the noun stands nearer the number
    (`Medicare Summary Notice 802-45-678901`, `Fax confirmation number 802-456-78901.50`, `Contact us regarding account
    802-456-789012`); no other word names one (`Patient # 900-12-3456150.00` is refused; `on file`, one phrase on one
    line, and a bare `advice` are none: `Phone on file: 202-555-0123150.00`). A label may wrap once and its number may
    stand on the line under it: one line break at most inside the label and one at most between its last word and the
    number (`Claim` over `Number: 20260112345.01`, `Claim Number:` over its number; a line break written CR LF is one:
    review J-3). More than that makes the word a heading and no label: a blank line, a rule drawn under it, a third
    line, a mark alone on a line (`REMITTANCE ADVICE`, a blank line and `900-12-3456150.00`: E1-7; `STATEMENT`, a point
    alone on a line and `No. 900-12-3456150.00`: J-2). Four rounds read those layouts (a rule under a label, a blank
    line after a label that ends as one does, a label of three lines, a table's cell under its header's rule: reviews
    G2-3, H2-1, I2-2, I2-4 and I2-5), and each reading named a number it should not have or failed the next review
    (H1-5, H2-4, H2-7, I1-1, J-2 to J-5); the reading was withdrawn for this one rule, the safer one, and what it
    refuses is a recorded cost below. Three underscores or tildes or more between a label and its number on one line are
    a form's blank and stand between them too (`Claim Number: ______ 20260112345.01`), and so does a bar or a
    box-drawing line; a `+` never does: it is a phone's own sign (`Provider: +1-202-555-0123150.00` is refused). Under a
    Social Security label no noun names a number: what follows that label is the person's whatever stands between
    (`Social Security Account Number 900-12-345678`, `SSN on file: 900-12-345678` and `SSN/Member ID: 900-12-3456150.00`
    are refused), unless a claim's or another code's own label stands nearer the number and is the scan's label for it
    (`SSN on file. Claim 802-45-678901.50` is kept); and the label right before a noun makes the noun the label's own
    word however far the number stands after it and whatever is glued before its shape (`Social Security Account
    Number:` and a column of spaces, `SSN Account 01-900-12-3456150.00`: G1-3). Under an SSN or phone label, or Medicare
    over an SSN's shape, with no such noun, the shape is the person's number whatever is glued after it, in the number's
    usual writing too (`SSN No. 900-12-345678`, `Phone number (202) 555-01234567`, `Medicare ID 900-12-345678`), with a
    point between its groups only where a date is glued after its last four (`SSN 900.12 345601/01/2020`; `Contact:
    Billing 250.75 123456` and `Medicare rate 110 32.74420` are an amount and a number) or, between the second and third
    groups, where the number's own label, the nearest, is a Social Security label, which is no ordinary word (`SSN 900
    12.3456150.00`: G1-5; with the Act named before Medicare the writing stays a rate: `Social Security Act. Medicare
    rate 110 32.74420`, H2-3), or where the label, whatever it is, stands right before the number with no other word
    between them, a number word or two and a sign or two apart (`Medicare 917 16.2677535.06`, `Call 900 77.3283150.00`,
    `Phone #: 900 77.3283150.00`, `Medicare ID No. 900 12.3456150.00`: the gate's replay and review J; `Medicare rate
    110 32.74420` and `Contact: Billing 250 75.123456` have a word between). With no structure and no label, a longer
    group is as often a reference's (`Tracking 123-456-78901`, `Referral # 123-45-67890-01`, `2026-0115-123-4567`, `29
    CFR 2590.715-2719`), and so are digits before the shape that no date, amount or currency sign places: a year or a
    longer run (`20260115-12-3456`, `2020900-12-3456`), the cells of a row joined by a bar
    (`1234567893|11|97110|2|150.00`), a file's name (`remit_20260115_01_0001.pdf`), a field after a comma
    (`1,00123-456-7890`). Each is sent as at cc3dd7f6 (the review of the fix round's delta, D2-1, D2-2 and D2-4), and a
    longer last group that nothing names is refused in a held letter only (`900-01-202012th`, `(202) 555-01234`); a
    line's own numbers written with parentheses are refused with it there (`Line (001) 420-97110`), because the two
    cannot be told apart (reviews E2-5 and G1-4).
  - *A number glued to an amount's digits*: a run of nine digits or more before a point is no amount, so the scan reads
    the run; a run of eleven or more with cents after a point is refused (`900123456150.00`, `900123456150.00-120.00`)
    unless a noun names it (`ICN 12345678901234.01`); and an amount's cents with a nine or a ten right after them
    (`150.00900123456`, `$150.002025550123`). A comma after a long number is as often the next field of a row (`20260112345,01/05/2026`, `ICN
    12345678901,12345678902`) and is read as ef3e8d20 read it.
  - *A date glued after a bare nine or ten*: a run of eleven or twelve digits whose last two begin a date with a
    four-digit year, or of thirteen or fourteen whose last four are that date's year written first, is a nine or a ten
    and a date (`SSN: 94156421006-22-2027`, `9001234562020-01-02`, `9001234562020-1-5`): refused unless a noun names the
    run (`ICN 96104065401-04-2026`). The date's parts are joined by a slash, a point, a dash (the hyphen bullet among
    them) or a dot written for one, its month a word too, its year after a space or a comma as after a shape
    (`90012345601-Jan-2020`, `90012345601Jan 2020`: I2-3); a bar, an underscore, a backslash or a tilde joins the cells
    of a row and the parts of a file's name as often (`91895853214|3|20260401|97110`, `ERA_79790014228_08_2026.pdf`:
    review G2-2) and is a date's joiner only where the run's own label is a Social Security label (`SSN:
    90012345601_02_2020`). After the date stands no digit, or digits that begin another number with a structure of its
    own, an amount or a second date in any writing (`90012345601/02/2020150.00`, `...20201,250.00`, `...202001/31/2020`,
    `...202001-Jan-2020`: H1-3), never digits that only run on (`12345678901/02/20261234`); under that label, whatever
    follows. After a nine or a ten, a date that begins with one digit is read with slashes (`20255501239/9/2020`); with
    dashes or points one digit and two groups are as often a reference's own end (`20260112345-01-2026`) and are sent.
  - *A masked SSN glued* to a word before it, or to another number's digits, the mask in an SSN's own shape: three mask
    characters (a word's own final `x` before them too), a gap the masked pattern reads, two, such a gap and four
    digits, the four on the next line too (`PaidXXX-XX-3456`, `PaidXXX - XX - 3456`, `FaxXXX-XX-3456`). The digits
    before the mask are another number's where structure says so (a year, a date's end, written year first too, an
    amount's cents, a currency amount: `2020***-**-3456`, `150.00XXX-XX-3456`, `$150XXX-XX-3456`,
    `2020-01-02XXX-XX-3456`) and wherever they are three or more, because a masked number shows one or two of its own
    first digits at most (`CPT 97110XXX-XX-3456`); after digits an underscore is a mask character too
    (`150.00___-__-3456`). A digit or two with no such structure are the masked number's own first digits (`Acct
    4XXX-XX-1234`), and underscores after a word are a form's blank (`Initials___ __ 2026`). Five mask characters and
    four digits, a gap missing, or four after `#` is as often a masked account number (`Acct#XXXX1234`, `Acct
    No.XXXXX1234`, `Acct#XXXX-XX-1234`): each is read as ef3e8d20 read it, sent in a letter with no held range and
    refused in a held one after a letter or after digits that structure places (`2020-01-02XXXXX3456`), where digits no
    structure places are the account's own (`Account 0XXXXX1234`).
  - *A Social Security label glued to the word before it*: `SSN`, `SOC SEC` and `HICN` in any case (`PatientSSN 900.12
    3456`, `PATIENTSSN`, `PatientSocialSecurityNumber`, `PatientHICN`; never `Assn` or `ISSN`), and `SS#`, `SS No` and
    `HIC` where a change of case sets them apart (`PatientSS# 900.12 3456`), read by the survivor scan only, so a refusal
    and never a redaction, and as a second reading beside the text as written, never in its place. The phone labels are
    not read glued, nor `SS#`, `SS NO` and `HIC` in capitals throughout: words end in them (`Fairfax`, `smartphone`,
    `CLASS#`, `ADDRESS NO`).
  - *A label read through the call's own identifier*: the label reads the text as it reads it with the identifier gone,
    across the one line break a label reads too (`SSN for Zephyra: 90012-3456`, `Call Zephyra at 555-0123`, `Phone (Jane
    Zephyra, home): 555.0123`, the number on the line after `Phone Zephyra`). The scan reads its chain's label so, and its
    read over the numbers before an amount (refusals: `SSN (Jane Zephyra, patient): 90012-3456`, `Phone Zephyra, Jane: 900
    13 9434.00`). The patterns redact through it a number whose own words say nothing and that no plain reading takes,
    never one wrapped across a line break; a number a noun names stays named (`Phone call with Jane Zephyra regarding
    claim 230957851`).
  - *A label's list number*: one or two digits right after an SSN or phone label (`No.`, `#`, a full stop, a dash or a
    colon between them too; the label in the plural or with `numbers` after it), in parentheses, or before `:` or `)`
    (an ordinal's suffix, a space or a word in parentheses before it too), are read through on the same terms: `Phone 1:
    555-0100` is `Phone 1: [PHONE]`, and so `Tel. 1:`, `Phone (1):`, `Phone 1 (home):`, `Tel 1)`, `Phone (2) 555-0100`,
    `Phone ( 2 ) 555-0100`, `Phone (2nd) 555-0100`, `Phone numbers (2) 555-0100` and the same with a line break before
    the parenthesis; `TTY 1: 7,439.10 942.77 3098` is refused as ef3e8d20 refuses it without the list number, and so are
    `Cell (2) is 933.67 4536` and `SSN (2). 150.00 120.00 30.00`. The list number is no digit of the number the label
    names: the scan starts no chain in it, so `Telephone call (2) 30.00 60.00` and `Fax 2) 15.00 30.00` are sent as the
    same rows are without it (review E2-1: the rule's first build counted the digit in the chain and refused such rows).
    The number in parentheses was first read only before a colon; the gate replayed both ways decided it: of the letters
    that turn on it, 275 hold a number written as an SSN or a phone and 237 hold amounts, and ef3e8d20 refuses or
    redacts every one of the second with the number in parentheses taken out. With no parentheses, colon or
    closing parenthesis, a digit and a space are as often the number's own first digit (`Phone 1 800 555 0199`): no list
    number.
  - *A pattern's placeholder is a number to what is glued to it*: where `[SSN]` or `[PHONE]` has a letter against it
    (invisible characters or a mark between them too), the glued own-identifier check runs once more with a digit on that
    side, so a name glued to a number is refused whether or not the number was redacted first.
  - *The checks' own marks*: a letter's own U+0001, U+0002 or U+0003 is read as the control character it is, never as a
    placeholder's mark (B1-4). And a letter that writes one of the three is refused whole: ef3e8d20 read a letter's own
    mark as its placeholder and refused such letters in places (`Total<U+0002>for45.00 and 9 0 0 1 2 3 4 5 6`), this
    reading had sent them since it read the mark as a control character (review H1-1), and text that holds one is no
    text to trust.
- **The look-alike fold (ruling A') is for the call's own identifiers only, and beside ef3e8d20's fold.** `fold` folds
  case first and then reads a letter or digit that the Unicode confusables data (UTS #39, `confusables.txt` 10.0.0) maps
  to one ASCII letter or digit as that one (395 entries: the sources that are one letter or number NFKC leaves as it is),
  and the 16 small capitals the data maps elsewhere (`packages/redact/src/confusables.ts`, 411 entries, its count and hash pinned by
  `confusables.test.ts` beside it), taking the capital's look-alike or, where it has none, its small letter's; a decimal digit
  of any script is its value. Names, member IDs, claim numbers and dates of birth are matched on ef3e8d20's fold and, where
  the letter or the call's identifiers hold a look-alike, on this one too (`ownFold`); the glued checks of the strict
  check run on both. The Social Security and phone patterns and the survivor scan fold as ef3e8d20 folded: a look-alike is
  theirs to read as the letter it is. A name part of two or three letters found only by the look-alike fold in a word
  written wholly in another script is that script's word (`на` in a Russian notice is no HA); a name stored in its own
  script is read as before. The table is a file in the repository, generated once: nothing is fetched at build or run
  time.
- **Digit-for-letter forms (ruling A').** A word that reads as one of the call's own name parts, member IDs or claim
  numbers position by position, with a digit for a letter or a letter for a digit (O/0, l/1, I/1, S/5, B/8, and E/3 for
  the pinned `VANTR3E`; another script's digit that looks like a letter too), half of its characters or more the form's
  own and not digits alone, the form five characters or more (six for digits alone), is redacted as that identifier,
  written in pieces too with a joiner its plain pattern reads between them (`ZZ 765432l`, `VAN-TR3E`; each piece of a
  name holds a letter, so `Week-5` is no WEEKS). Inside a longer run of letters and digits it is refused (`2020S1MONE`,
  `PaidVANTR3E`), and so is the form spelled with a look-alike among its letters there; no Social Security or phone
  pattern redacts a part of such a run first. Never a letter for a letter (`well` is no WEIL). A month's word and digits
  with no space is a date (`MAR13` is no MARIE). A form of four is as often an ordinary token (`11am` for LIAM, `CO13` for
  COLE, `80th` for BOTH: 42 of 651 common names had one among 26,143 ordinary tokens) and is not read.
- **Name joiners.** The middle dot (U+00B7), the hyphenation point (U+2027), the bullet operator, the dot operator and the
  bullet join a name's pieces as a hyphen does (`Zeph·yra` is redacted alone; in a held letter, which ef3e8d20 refused for
  the pieces, the letter stays refused): the packets verifier's fold asked for the measurement. In the letter reader
  only: the narrative's check (`holdsNameOrNumber`) and the packet verifier (`nameOrNumberMatches`) read a name as
  ef3e8d20 read it, because which stored narratives fail is the verifier's to change, and its own test pins what the
  matcher does not read (`packages/packets/src/verifier-identifiers.test.ts`).
- **Ruling B.** A month word that is a name part is a date's month only in a date with two numbers or more (a day and a
  year: `May 5, 2026`, `3 June 2026`). `May 2020` and `June 103`, which the date reader takes as a day and a year run
  together, are the name: redacted.
- **In a held letter only** (`heldStrict`, `heldBirthUnread`, `gluedShape`'s shape with no structure, the wider masked
  rule).
  - An amount (with or without a currency sign), a dash and a date as one range holds nothing: refused. A date and then
    an amount stands as at ef3e8d20.
  - Beside a held range: a number no barrier holds, or one a noun names, joined to its end by a joiner alone; a number no
    barrier holds before its first end across white space; a word glued to its end and then a bare nine or ten; a number
    of seven digits or more, one or two letters and a date with nothing between.
  - Chains read again with unsigned amounts and groups of five to seven digits as parts of a chain, twelve groups at most,
    after what must stay is placed by its structure (a currency amount; a standing date; a nine or ten that NPI, TIN or EIN
    names; a ZIP or ZIP+4 after a state's abbreviation or name or the word ZIP, a comma, a full stop or a line break
    between them too; two five-digit codes joined by a dash or a slash; a TIN written two and seven after TIN, EIN, FEIN
    or a writing of Tax ID; the codes of a list a code word begins; a service-line row's code and units before its
    amount, modifiers between them and the units in parentheses too; a code and the next line's count; a code's digits
    after its one letter, an ICD-10 code's after its point too): nine or ten digits, eleven starting with 1, or a local
    number of three and four, holding one group no barrier holds, refuses; under an SSN or phone label, nine digits or
    more of groups no barrier holds. A year beside an amount stays, and a local number's shape inside a longer token or
    after a currency amount.
  - A date written two, two and four with dashes and a lone digit across white space beside it, never a time after it.
  - The date of birth in writings no rule reads: a Roman-numeral month with day and year, the year of two digits too;
    the CJK date characters, the year of two digits or left out too; its year in words within 48 characters after its
    month's word; its month's word (no part of a longer word) with its day in digits and no year after it (`Mar 14th`,
    `March the 14th`, `14th of March`); its two-digit year, month and day run together as four or five digits, or six in
    an order a date is written in, at the start or end of a run of digits (not four digits that read as a year 1900 to
    2099). The month of May is a verb too: before its day it is the month only where the day carries an ordinal's
    suffix, on the next line too (`May` at a line's end and `14th` on the next), or, on the same line, ends its phrase,
    and after its day only with "of" between them or where a full stop or the text's end follows it (`Visits over 12 may
    require`, `the 12th may require`, `Up to 12 may, at our discretion,` and `You may` before `12.` on the next line are
    no date of birth).
- **Measured** (synthetic letters only; the scripts, the reviews' reproductions and the gate are in the ops repository).
  - *Pinned rows* (`src/redact.residuals.json`, regenerated by `residual-scripts/gen-residual6.mts` and held row by row by
    `redact.residuals.test.ts`): ruling A 697 of 697 (632 refused, 65 redacted), ruling A' 406 of 406 (200 redacted, 206
    refused), ruling B 5 of 5 (the month's word redacted as the name). The 938 rows of lone initials and the 243
    fail-safe rows stand as recorded.
  - *The differential gate* (975,489 letters). Against cc3dd7f6 and against ef3e8d20: no letter in which the older tree
    redacted or refused an identifier and this one sends it. Against ef3e8d20 this reading redacts or refuses a Social
    Security number in 16,325 letters more, a phone number in 10,703, a name in 12,645, an initial in 635 and a date of
    birth in 44. Of the letters ef3e8d20 sent unchanged and in which the gate's oracle places no number, it refuses 3,877
    that hold the call's identifiers (the glued and look-alike forms), 603 after an SSN or phone word and 3,359 others
    (1,519 of them from the earlier reviewers' own files, written with a number glued that the oracle cannot place), and it
    changes a date in 308 (a month's word that is the patient's name: ruling B), a number in 17 and an amount in 1 (a
    label read through its list number reads what ef3e8d20 reads without it: `Tel 7: is 802⏎8185.55` is `[PHONE].55`).
    It sends 33 letters ef3e8d20 refused, each for a patient whose name is a month's word, which ef3e8d20's own check
    found left in its text and this reading redacts. Against cc3dd7f6 the three classes are 2,882, 7,479 and 573; the
    13,575 must-stay letters and 4,483 with identifiers that cc3dd7f6 refused whole are sent, the range fix's gain kept;
    and 385 letters it refused that hold digits after an SSN or phone word and no number the oracle can place are sent:
    195 must-stay rows unchanged, 189 with the number redacted and one amount-shaped split of the kind recorded above.
  - *The fuzzers* the reviews left, each ef3e8d20 against this head on letters it generates, with fresh seeds after the
    last change to what is sent: no letter ef3e8d20 refuses that this head sends in 153,008 letters, and no match left as
    written and sent in 49,600; the first delta review's two fuzzers, 79,584 letters: 104 such letters, every one the
    patient whose names are months, and no letter in which this head shows what ef3e8d20's redaction replaced (one on the
    round before, the withheld match above). The property that found nothing for eleven rounds is now run for a patient
    whose one member ID ends another too, in the tests and in full (44,352 letters: 40 on the round before, none now).
  - *What the reading costs*, each the safer reading, each measured:
    - A label read through the call's own identifier or its list number refuses what ef3e8d20 refuses without them: 72
      of 12,000 letters of the must-stay fuzzer, 71 of them `Contact <own name>, <city>, IL <ZIP+4>` and one a `TTY:
      711` line with the call's identifiers and a service row on the next line; the 237 gate letters with a
      number in parentheses; `Contact 1: Springfield, IL 62701-1234`; `TTY 1: Questions? 150.00 120.00 30.00`; and a
      numbered list on the line after a phone word (`please call` and `1) Member Services 97110 97140` on the next line:
      33 of 180 and 44 of 192 letters of review G2's grid for `1)` and `1:`, none for `1.`).
    - In a held letter, which cc3dd7f6 refused whole: of 20,000 letters of ef3e8d20's own must-stay generator 359 are
      refused, every one a letter cc3dd7f6 refused (344 hold a local number with no label beside the held range); a
      named number is refused there too where its chain reads nine or ten digits (`Claim 802-456-789012`, `Policy No.
      802-456-789012 150.00`, `ACH ****1234 150.00`), and a shape with a longer last group that no listed noun names
      (`Web ID 802-456-78901`), an area code in parentheses among them (`Line (001) 420-97110`, `Table (555)
      456-23099`); and a label read through its list number hands the line to these rules, which refuse under a label
      what ef3e8d20 sends (`phone (4) pages to Tracking 802-456-71718` beside a held range: 101 of 2,241 held letters of
      review E2's generator with a label word and a number in parentheses). None of 4,000 letters of ordinary form was a
      held letter (review D2).
    - With no noun naming it: cents, a second shape or a date after a shape that starts at its group's start
      (`802-456-78901.01`, `802-45-6789012-34-5678`, `802-91-69413-01-2026`, `310.216.62432.7`), eleven digits or more
      with cents (`Visit ID 123456789.1`), an eleven- to fourteen-digit run whose last digits begin a date (`On
      12345678901/02/2026`, `Seen 12345678901-Jan-2026`), a ten and a one-digit date with slashes (`1234567899/9/2020`),
      a row joined by slashes whose third cell begins with a year (`12345678914/3/20260401/97110`), a reference and a
      month-and-year phrase glued by a lost space (`802-45-678901Jan 2026`, `Seq 12345678901Jan 2026`), a phone with its
      area code in parentheses and digits after it (`Section (123) 456-78901.50`), a year glued before a shape after a
      month's word or a month and a slash (`Plan SEP 2020802-45-6789`, `Page 3/2020900-12-3456`); under a phone word or
      Medicare with no listed noun between (`Call us about ID 802-456-78901-02`), and right after one, no word between,
      three digits, two digits, a point and four digits or more (`Medicare 110 32.74420`, `Fax 250 75.123456`); under a
      Social Security label whatever noun stands between (`Social Security Administration Notice 802-45-678901`, `SSN
      verified. Account 802-45-678901.50`); and a letter glued before a reference's digits, which un-names it (`Claim
      W2026008123456.01`). Review D2's grids: 249 of 5,200 dashed shapes under a noun, 140 of 3,600 named references
      after a phone word or Medicare, 8 of 6,000 rows of a table. A noun names its number only with nothing but its own
      connectors between them: under a header row of several columns, or after a label with other words before the
      number, a long run with a decimal suffix or a dashed shape with one has no name and is refused (every such row of
      review H2's tables: 195 of 195 with fourteen digits and `.0n`, 184 of 184 dashed; none where the number has no
      suffix), and so after a noun and `on file`. The same holds for such a number with more than one line break between
      its label and it or inside its label: under a rule drawn under the label or a table's cell under its header's
      rule, after a blank line, under a label of three lines or a mark alone on a line (`ICN`, a rule,
      `12345678901234.01`; `| Claim |`, `|-------|`, `| 20260112345.01 |`; `Claim Number:`, a blank line,
      `20260112345.01`; `Member`, `ID`, `Number`, `20260112345.01`). Four rounds of reviews measured these layouts as
      they were read; on this head every letter of review H2's table under a rule, a blank line or a boxed cell is
      refused (64 of 64 in each such layout) and 32 of 32 of review G2's, where the number has such a suffix; none with
      the label and its number on one line, across one line break, under a wrapped label or after a form's blank, and
      none where the number has no suffix. After a month's word glued to a number, a year-like number with one decimal
      or three (`366-535-16935Nov 2000.5`). One or two underscores, or a blank's underscores cut by another character,
      between a label and its number (`Claim __ 20260112345.01`).
    - A shape that starts inside a currency amount (`$1500-12-2026`, `$1000/250/5000`).
    - A name's digit-for-letter form among ordinary tokens: one of 651 common names against 26,143 tokens (`Week5` for
      WEEKS); `S83511A` for member 583511, and its pieces across a space; a month-and-year phrase for a patient named
      May or June (the 308 above); asterisks in a masked SSN's shape glued to a word (`Total due*** ** 2026`),
      and three digits or more before a masked SSN's shape (`Acct 123XXX-XX-1234`).
    - A letter that writes U+0001, U+0002 or U+0003 is refused whole, those ef3e8d20 sent among them, with a number
      redacted or not (`Our office: 555-0123. Paid<U+0002>`, `SSN<U+0001> 900 12 3456`).
  - *MOD-16's generator* (`redact.property.test.ts`, `keptLetter`) changed in three places, each said there and pinned
    on both sides in `redact.leaks.test.ts`: a letter that holds a service period or a range writes no local number with
    no label; a segment that begins with a word and holds a bare nine or ten is not glued to a range's end; no letter
    holds the date of birth run together with a two-digit year. Its five seeds and three fresh ones pass on this head.
  - *Time.* The slowest letter of the gate's timing set takes 1,137 ms (559 ms at cc3dd7f6; the budget is 3,000 ms), and
    the timing rows of `functions/denial-letter.test.ts` hold, four added. A rule of underscores or tildes between a
    noun and its number is read in time linear in its length: a round had read it with a repeated run inside a repeated
    group, a rule of sixty characters did not return (I1-1, I2-1), and a row of the leaks tests now holds rules of 48 to
    5,000 characters under a second each. The round after read a table's corner `+` two ways, and twenty-eight of them
    beside dashes took seconds (J-5): no connector is read two ways now, and a second row holds each connector
    repeated 24 to 2,500 times.
  - *The one-patient screen.* A pattern's number that merges under one of the call's own placeholders is hidden in what
    is sent and is still offered to the other-patient check as it is written: `redactLetterForScreen` reads the letter
    once more with the call's own matches alone replaced and adds that reading's candidates (`Member ID: ZZ1980O314`, a
    line break and `555-0123` for member ID ZZ19800314 is sent as `Member ID: [MEMBER_ID]` and offers 5550123, as
    ef3e8d20 offers it). The build had offered only the pattern's own reading there (3145550123) for a patient with one
    identifier, and the withheld match's fix carried that to a patient whose identifier ends or begins another, whose
    letter the build before refused (review L-1: 900 of 7,200 letters of that family). A match of the call's own inside
    a pattern's number, and not the whole of it, is that number's in this reading as it is in `merge` (R6b): a claim
    number 0123 or a member ID 555 that is a piece of the number stays as written with it (review M-1: 576 of 11,136
    letters of that family before, none now). What is sent does not change, no candidate is dropped and none of the
    call's own identifiers is offered in its own compact form (51,840 and 21,504 letters of the two families and about 75,000 generated ones);
    a run the base offers only because it does not read the call's own identifier in a look-alike writing (a piece of
    that identifier joined to its neighbour) is not offered, the identifier being replaced. Recorded, and pinned in the
    leaks tests as it is offered today (review N-1 and N-2; `LANES.md` Queues item 26): an identifier of the call's own
    that stands inside such a hidden number is the number's in this reading, so the screen is asked about it joined to
    what follows (`ID 77 202-555-0123 88` for member IDs 77202 and 5550123 is sent as `ID [MEMBER_ID] 88` and offers
    555012388) or in another script's digits (`555<U+0660>123`), where no tree before asked, though every tree asks the
    same where the number is sent as `[PHONE]`. It is more asked of the practice's own records, in memory, and nothing
    more sent; a records match on such a run would refuse the letter. The second reading costs about a quarter more time
    in this function on a 200 KB letter with a merged number on every line (548 and 675 ms).
  - *Reviews.* Two adversarial reviews of the design; two of the build (PHI, B1-1 to B1-14; what must stay, B2-1 to
    B2-9); of the fix round, two that the session's usage limit cut off before a report, which count for nothing but
    whose rows were each run and fixed (C1-1 to C1-4, C2-1 to C2-8), then two that ran to their reports (D1-1 and a note
    on `redactLetter`; D2-1 to D2-7); two of the round after that (E1-1 to E1-8; E2-1 to E2-6, the first of them a
    fault: a label's list number counted as a digit of the number the label names); two of the round after that (G1-1 to
    G1-5, the first a letter ef3e8d20 refuses that was sent, which the fuzzers' run on that round had shown too; G2-1 to
    G2-7, three of them ordinary rows the round had begun to refuse); two of the round after that (H1-1 to H1-5: the
    scan's reading held over 206,772 letters, one family of letters ef3e8d20 refuses for its own control character had
    been sent since B1-4's fix, and four of the round's give-backs were wider than recorded; H2-1 to H2-8, three of them
    new refusals of ordinary text); two of the round after that (I1: no letter ef3e8d20 or the tree before refused is
    sent outside the recorded give-backs, over about 120,000 generated letters; I1-1 and I2-1: the check did not return
    on a long rule of underscores between a noun and a number; I2-2 to I2-6, two of them forms a round had begun to
    refuse); one of the round after that, with all three lenses (J-1 to J-5, none of them a letter ef3e8d20 protects:
    a guard that turned a real year away, one CR LF read as a blank line, a table's corner read two ways, and two more
    in the reading of a label over its number, which was then withdrawn); and one of that round's delta
    (K: no letter ef3e8d20 refuses sent and no digit shown that it redacts in 192,590 generated letters, no
    refusal of ordinary text outside the recorded costs and no slow letter; K-1 and five lesser forms, recorded with the
    residuals below); one of the delta that closed the withheld match (L: no letter ef3e8d20 refuses sent and nothing its
    redaction replaced shown over about 480,000 generated letters; L-1, the screen's candidates, and L-2, the cost
    recorded above); one of the screen's second reading (M: what is sent unchanged and no candidate lost over about
    30,000 letters; M-1, a short identifier of the call's own inside the number); and one of the three lines that closed
    M-1 (N: what is sent unchanged and no candidate lost over about 20,000 letters, and no identifier of the call's own
    offered in its own compact form; N-1 and N-2, recorded with that reading above). Every finding was run before it was
    fixed, and each is a row of `redact.leaks.test.ts` on both sides; the gate, replayed against its last run after each
    round, found the forms a round re-opened (a number in parentheses after a label, a range after an amount's cents, a
    date after a bare nine or ten), which no review had, and the fuzzers found the letters ef3e8d20 refuses that a round
    sent.
- **Where the build departs from the ruling's words, and why.** Ruling A' names NFKC, a TR39-style skeleton and five
  digit pairs. The views were NFKC already, so the table holds only what NFKC leaves. It is no whole skeleton: one
  character for one ASCII letter or digit, case folded first; a look-alike written with two characters for one (`rn` for
  `m`) is not read, and the data's entries later Unicode versions added are not in it. The fold reaches the call's own
  identifiers only, never a label, a keep-noun or a month's word, and it stands beside ef3e8d20's fold, never in its
  place. E/3 is a sixth pair, because the pinned `VANTR3E` needs it. A digit stands for a letter only position by
  position in a whole own identifier of five characters or more, never letter for letter, because a fold of every word
  of a letter to digits and back redacts ordinary words.

Still not covered after this amendment, recorded as residuals: in a letter with no held range, an unlabeled
amount-shaped number, a five-four with no ZIP before it, a local number with no label, nine single digits, initials
written together and a short part split, and the date-of-birth writings listed above, as at cc3dd7f6; a phone label
glued to the word before it (`PaidPhone 202 555 01.23`), and `SS#`, `SS NO` and `HIC` glued in capitals throughout; a
label, a keep-noun or a month's word spelled with another script's look-alikes, read as ef3e8d20 read them; a second
number after "or" in a phone list (`Phone 555-0100 or 555-0101`); a bare seven digits after a phone label with a word
between (`Tel mobile 5550123`); a letter O for a zero inside an SSN or phone (`SSN 9OO-12-3456`); digit-for-letter pairs
beyond the six; a name part of four letters in a digit-for-letter form (`L1AM`), and a month's word with digits that is
such a form (`MAR10` for a patient Mario); a look-alike whose small letter looks unlike its capital inside a name split
by a joiner (`νan-tree`); letters with a stroke (`Zepħyra`); a control character inside a number or a name
(`900-12<U+0004>-3456`, as at ef3e8d20); a day of the date of birth written as an ordinal's word in a held letter
(`March fourteenth`), and for a date of birth in May its day in digits with the phrase going on after it (`May 12 for
review`, where `may 1) call us` is the verb); a number glued so that a bare nine or ten reads across the join
(`123456900-12-3456` is `[SSN]-12-3456`, as at ef3e8d20); digits glued before the shape that no date, cents after a
point or currency sign places: one to three (`150900-12-3456`), a year or a longer run (`2020900-12-3456`,
`2025550100900-12-3456`), and a comma for a decimal point (`150,00900-12-3456`); a date with a two-digit year glued
after a bare nine or ten (`90012345601-04-26`), a one-digit day or month written with dashes or points after one
(`20255501239-9-2020`), a bar, an underscore, a backslash or a tilde for the date's joiner where the run's own label is
no Social Security label (`Seen 90012345601|02|2020`, `SSN/Phone: 90012345601_02_2020`), a date written year first with
its month's word (`9001234562020-Jan-5`), and a month's word after a space following a number, or glued to it with two
digits after a space (`900-12-345601 Jan 2020`, `90012345601 Jan 2020`, `900-12-345601Jan 20`), which begins a date of
its own as often; after a shape and its glued date, another number glued (`900-12-345601/02/2020150.00`), the hyphen
bullet in that date, and a line break, a tab or three characters before its year; after a bare run's date, an amount
written with a space or a time (`90012345601/02/2020150 00`, `...202012:30`); an SSN written with spaces and glued to a
second shape after a date under its label (`SSN 2020-01-02 900 12 3456900-12-3456`); a date written with spaces around
its separators, with spaces alone or with underscores before a year glued to a shape (`01 / 02 / 2020900-12-3456`, `01
02 2020900-12-3456`), and a quarter or a fiscal year there (`Q1 2020900-12-3456`); a shape with digits glued after it
under a phone word or Medicare where a reference's noun stands nearer (`Fax / Member ID 202-555-012378`), under any
label where a claim's or another code's own label does (`SSN on file. Claim 900-12-345678`), and under a Social Security
label out of its reach or written in a form no label reads, with a noun between (`Social Security number as shown on
your record: 900-12-345678`, `S.S. No. on file: 900-12-345678`); under Medicare or a phone word that does not stand
right before the number (another word, three blanks or more, or three number words between them), a point between the
second and third groups of the usual writing (`Medicare benefit 900 12.3456150.00`, `Phone:    900 77.3283150.00`), and
under any label a middle dot or a slash there (`SSN 900 12/3456150.00`); a Social Security label and a noun with
punctuation between them (`SSN: Account 01-900-12-3456150.00`); `on file` wrapped over two lines or written otherwise
(`Phone on record: 202-555-0123150.00`); a number its label names across a form's blank or one line break (`Claim:
____ 900-12-3456150.00`; `STATEMENT`, `No.` on the next line and `900-12-3456150.00`); a shape with a month's word
glued after it and a point and two digits after its year, an amount's cents or not (`900-12-345601Jan 2020.00`,
`900-12-345601Jan 2020.12.31`); a Social Security label 24 characters before a number that a noun names, where a CR LF
stands between them: a label's reach is counted in characters on every tree and a CR LF counts two, so the label owns
the number in the writing with LF and the noun names it in the writing with CR LF (`SSN on file. Statement`, CR LF and
`No. 900-12-3456150.00`: review K-1; ef3e8d20, cc3dd7f6 and every head of this build but one sent it, and one character
further it is the label out of reach recorded above; closed by the amendment below, which refuses the letter); the label right before a number with its parts in another order,
with `is`, or with a word in parentheses (`Phone number is 900 77.3283150.00`, `Phone # : 900 77.3283150.00`, `Phone
(cell): 900 77.3283150.00`); a noun read from the first letters a slice of 120 characters shows (`Overpayment`, 113
points and a number: `PAYMENT`); one or two digits
before a mask with no year, date, cents or currency sign there (`12XXX-XX-3456`), one cent digit or a decimal comma
before it (`150.0XXX-XX-3456`, `150,00XXX-XX-3456`), mask characters with spaces between them, and underscores for the
mask glued to a word outside a held letter (`Paid___-__-3456`); a list number with no parenthesis or colon (`Phone 2
555-0100`, `Phone #2 555-0100`), as often the number's own first digit, and one in parentheses with no space after them
or written otherwise (`Phone (2)555-0100`, `Phone (#2) 555-0100`, `Phone (2 of 3) 555-0100`, `Phone line (2) 555-0100`,
a blank line before it); after an amount's cents, a slash and a number with no cents, a month's word in the date, or a
date of two parts (`900-12-3456150.00/3`, `900-12-3456150.00-01-Jan-2020`, `900-12-3456150.00-1/2020`); where ef3e8d20's
pattern takes an amount's digits and a date's year for an SSN (`$0,000.00.2020-01-01900-12-3456`), the date's end no
longer stands before the shape and the letter is sent as ef3e8d20 sends it; the shape wrapped before its last group with
an amount glued after it; the shape written with spaces and no label with an amount glued after it (`900 12 3456150.00`,
`(202) 555 0123150.00`, `(202) 555 - 0123150.00`, `{202} 555-0123150.00`); an amount with a thousands separator or a
decimal comma glued after a number (`20255501231,250.00`); a number of an SSN's shape that a reference's noun names with
digits glued after it (`Case No. 123-45-678901.00`); an SSN with a slashed date for its last six (`SSN 900 12/03/56`)
and the amount-shaped splits of review GATEWAY2-1 (`Soc Sec 93798 4 1.46`), each as recorded above. **MOD-23**
(`LANES.md` Queues item 26, to land before any real PHI is processed, after this amendment and the packets verifier's
fold): a name written with a lower-case piece after a space or a period (`Zephy ra`, `Zephy. ra`) and a name written
letter by letter (`Z e p h y r a`) are sent in clear in a letter with no held range by cc3dd7f6, ef3e8d20 and this head
alike, and refused in a held one; the kept script `leaks-scripts/name-forms.mts` in the gate's folder reproduces both on
any tree (`node --import ../ts-resolve.mjs name-forms.mts <redact.ts>...`), and `src/redact.leaks.test.ts` pinned them as
they were sent (closed by the amendment below). Of the list that ends the amendment above, this one closes: a label's list number (`Phone 1:
555-0100`, `TTY 1: 7,439.10 942.77 3098`), two phones with nothing between them, the Social Security label glued to a
word (`PatientSSN 900.12 3456`, `PATIENTSSN 900.12 3456`), a masked SSN glued to a word, a year, a date or an amount's
cents, an SSN or phone glued digit to digit to a date, an amount or a currency amount (`SSN 900-12-3456150.00`, `SSN
01/01/2020900-12-3456`, `$514451/293-6215`), a labeled SSN or phone written with spaces and an amount glued to it (`SSN
900 12 345615.00`, `Phone 202 555 012315.00`), a label with the call's own identifier before its number (`SSN Vantree
900.12 3456`, `SSN for Zephyra Vantree: 90012-3456`), and other-script digits in member IDs, claim numbers and dates.
ADR 0070's Part 3 lists the call's own number in other-script digits as not caught: for the letter reader it is caught
now.

## Amendment (`co-001/time-budget-bound`, 2026-11-11): how the letter reader's time budget is proved

**The budget does not change.** A letter of 100,000 characters is redacted and checked within 3 seconds on the
reference machine (the build's container class, on which the gate's timing table is measured). That is the product's
budget; this amendment changes how the tests prove it, not the number, and no row was removed or skipped.

**What was wrong.** The tests compared a wall clock with that number, which proves it only on a machine as fast as the
reference and as idle. On a shared CI runner three such rows read 3.2 to 4.6 s on a pull request that touched nothing
of the reader's (three of that pull request's four attempts failed `unit` there), because a wall clock also counts the
time the runner gave to other work.

**What the tests do now** (`packages/model-gateway/src/test-support/time-budget.ts`, proved by
`time-budget.test.ts` beside it):

- The reader's work is measured in the processor time of its own thread (`process.threadCpuUsage`, user and system).
  The reader is one thread and waits for nothing, so on an idle machine that is the wall clock's number within 3 %,
  and the time the runner gives to other work is not in it. Work that returns a promise is refused.
- The first run is held to the budget itself. Work under it passes against the stated number, with no allowance and
  no calibration: on the reference machine, or any as fast, the bound is 3 s (and 1 s for the two rows of
  `redact.leaks.test.ts`).
- Only work that ran over the budget is asked whether the machine is the slower one. The machine is then measured in
  the same thread, right before the work is run again, by a fixed workload of the reader's kind (regular expressions
  with look-behind and Unicode classes over 100,000 characters, 150 passes, allocating nothing) that calls none of the
  reader's code. The fastest of five runs counts, since a run can only be slowed by what else the machine does. The
  bound is `budget x (calibration now / 144 ms)`, and that ratio counts only above 1.05: a slowdown inside the
  calibration's own spread allows nothing. The work is run again at most twice, each time after its own calibration.
- The allowance cannot grow with the reader's own slowness, since the calibration runs none of its code: a reader
  that became slower is slower against the same allowance.

**The reference, as measured** (2026-11-11, this container class, four cores, Node 24.22.0, CI's major version; the
scripts are on `claude/build-ops`, `designs/time-budget-bound/scripts`). The calibration's fastest of five, taken in
a process that had run the reader, as the tests take it: 138 to 148 ms over 27 readings (Node 22: 139 to 146 over 9).
The reference is 144 ms; a thread's processor time steps by 4 ms, 3 % of it. In a process that has not run the reader
the same workload has read 132 to 174 ms; the tests never take it there, and the helper's own tests do not depend on
it, since their work is the calibration workload itself.

**What was run against it.** A reader with processor time added to reach 2.90 s passed, and to reach 3.05, 3.10,
3.20 and 3.40 s failed, each time with no allowance: 21 of 21 over three runs, one of them under eight busy processes
on the four cores. The first build of this helper (the bound `budget x max(1, calibration / 40 ms)` from the faster of
one calibration before and one after) failed that test: its calibration read over its reference on nearly every run,
so readers at 3.36 to 3.79 s passed. It was replaced before it merged. Under eight busy processes on the four cores
every timed row passed; the review read their processor time 6 to 18 % over idle under such loads, the dearest row at
2.3 s idle on Node 22 and 2.0 s on Node 24.

**What stays a wall clock, and is no budget.** The four blocks carry a 60-second test timeout in place of the test
runner's default of 5 seconds: it bounds how long a row may hang, and a loaded runner's wall clock is no part of the
reader's cost. Recorded, not changed here: under eight busy processes on four cores one other test of
`denial-letter.test.ts` (the property over synthetic letters, no timing row) ran past the runner's default 5 seconds
and failed there;
the engine's version moves the reader's cost more than the calibration's (12 to 21 % against 0 to 8 % between Node
22 and 24), so the reference is stated for Node 24; and a first run in a cold process costs 14 to 16 % more than later
runs, which the first-run rule counts whenever the first run is under the budget.

## Amendment (`co-001/redact-item-26`, 2026-11-11): a name written apart, a number as the records hold it, and a CR LF read as one line ending

The amendment above leaves three things for the letter reader to close before any real PHI is processed (test matrix
MOD-23; `LANES.md` Queues item 26): the two name forms it pins as sent (`Zephy ra` and `Zephy. ra`, `Z e p h y r a`),
with `jo ann` of the amendment of 2026-10-27; review K-1, a Social Security number sent in clear where a CR LF stands
between its label and the noun that names it; and a member ID or claim number written with the separator the records
themselves hold it with (`ZZ12345/01`; a claim number held `1234.56`, which the amendment of 2026-10-27 reads as an
amount's or a date's writing). This amendment closes the three by one construction. The base it is measured against is
f3f5a642, the merge of the amendment above.

**The construction: the first reading stands, and a second reading only adds.** `matchesIn`, `appliedMatches`, `merge`,
the patterns and the survivor scan are unchanged. The base's `redactLetterForScreen` and `holdsIdentifier` are now
`screenAsFirstRead` and `holdsAsFirstRead`, their bodies as they were. Around them:

- **Redaction.** `widerMatchesIn` reads the call's own names and numbers a second, wider way (the rules below). Its
  matches are applied only to a letter the first reading's own check does not refuse, as written or with its CR LF line
  endings read as line feeds (`refusedAsFirstRead`). A letter that check refuses is
  returned exactly as the first reading wrote it, and the check, which reads no less than before, refuses it again: no
  placeholder of the wider reading can hide what that check read. In a letter the first reading sends, `merge` only
  joins and widens spans, so every span the first reading replaced is replaced, and every run it offered the
  one-patient screen is offered (its candidates, and those of the sent text, the call's own numbers never among them).
- **The check.** `holdsIdentifier` is the first reading's check, or any wider match left in the text; and, where the
  text holds a CR LF, the same once more on the text with each CR LF written as LF. The letter is refused if either
  reading refuses it.

So nothing f3f5a642 refuses is sent and nothing it redacts is shown, by how the functions are composed and not case by
case. The reader already had both ideas: a match the base did not make is applied only where the scan does not refuse
without it (`appliedMatches`), and a second reading whose worse answer is taken (`chainLeft`). `redactLetter` and
`redactionSpans`, the reading without the screen, keep the same rule: the first reading's spans, and the wider
reading's only where the first reading's check sends the text. (The first build applied every wider match there, and
a wider placeholder then hid what the first reading's check refused the letter for: a claim number held `150.00`
replaced in a held range, and the Social Security twin after it sent. Review A-1. No production code calls that path;
the gateway exports it.)

**The three rules of the wider reading.**

1. *A name's part written apart.* A space or a period joins anywhere inside a part of a name, whatever the pieces it
   leaves, their case or their length: `Zephy ra`, `Zephy. ra`, `Z e p h y r a`, `jo ann`. The pieces rule of the
   amendment of 2026-10-27 (two letters or more each, capitalized as written) is not asked here; it stays in the first
   reading. A space is white space or a line break of any kind (U+0085 too, which `\s` does not hold). An initial beside
   a name read so is taken as beside any name. The plain fold and the look-alike fold are both
   read, as in the first reading. One blunt rule was chosen over a narrower one (a capitals or length test to spare
   `in a`): the narrower rule is the one that sent these forms, and each further form would need a case of its own.
2. *A number as the records hold it.* What the stored value itself writes between two of its characters joins them
   at that place too, beside what joins a number anywhere: a member ID held `ZZ12345/01`, `ZZ12345.01`, `ZZ12345,01`
   or `ZZ12345+01` is read as held, and a claim number of digits held `1234.56` with no label before it. A stored
   square bracket is read as the parenthesis a letter's bracket has become by then. The first reading's two exclusions
   are asked of the wider match as of any: a claim's digits followed by cents after a currency sign, and a whole written
   calendar date with no label of the number's kind before it. They do not keep an amount whose own cents are the
   stored number's last digits: `$1234.56` is replaced for a claim held `1234.56` (only the thousands comma of
   `$1,234.56` is no writing of it).
3. *A CR LF is one line ending.* Every reach of a label, a noun or a window is counted in characters, and a CR LF
   counts two. The check reads a text that holds a CR LF a second time with each written as LF (every CR of a run
   before the line feed with it: `\r\r\n` is one line ending) and takes the worse answer, for every reach and not for
   a label's alone. Redaction still reads the text as it is written, so the letter
   of review K-1 is refused, not redacted.

**What it costs, measured.**

- *The gate* (975,489 synthetic letters, f3f5a642 against this head): no PHI class; the same 462,984 letters refused on
  both; 975,476 letters identical and 13 changed, each of them `in a` replaced in "Records in a timely manner" for a
  generated patient named INA. No letter the base sent is refused.
- *Names whose letters are ordinary words apart.* Over the repository's synthetic prose (503 texts, 212,055
  characters: the fixtures' `.txt` and `.md`, the narrative set, the letters quoted in the gateway's tests), with one
  name alone as the patient, the places where words are replaced that the base kept: TOA 46 (`to a`), INA 32 (`in a`),
  OFA 31, ORA 26 (`or a`), ASA 18, TOAN 11 (`to an`), ISA 10, ONA 6, ASIT 5, TOBE 4, ORAN 4, and one to three for
  BEAN, ASAN, FORAN, ANDIS, IDA (`I'd a`: an apostrophe joined a part before this), AN, THEO, BEA, INAN and ORIN; of
  the 64 names first measured, 53 (NEWMAN, UNDERWOOD and SMITH among them) lose no ordinary word (review B-2 added the
  names the first table lacked). For such a patient the model reads `[PATIENT_NAME]` where the words stood, and the
  letter is still sent. Three things are replaced that are more than two filler words (review B-3, each pinned): the
  month of a day-and-month date for a name that is a month's word and a short word (`31 March and` for MARCHAND, `15
  May a` for MAYA: the rule that keeps a name inside a whole written date asks for two numbers); the first half of a
  hyphenated word, since a match ends at a hyphen (`and re-submit` for ANDRE, `the in-network` for THEIN); and, for a
  part of two letters, its letters with periods (`P.O.` for PO, `M.D.` for MD), with a code's letter taken as an
  initial beside such a match (`in a G-code` for INA G). Four tests that asserted the pieces rule now assert this
  cost, and MOD-13's phrase property uses names no phrase writes.
- *Refusals the wider reading adds.* Neither rule refuses a letter by what it replaces, but two families of letters
  the base sent are now refused, each the safe side and each pinned. (1) The wider form glued to a number the first
  reading replaces (`Dear Z e p h y r a900-12-3456`): redaction reads no name with a digit against it, the check reads
  the placeholder as a barrier and finds the name; the base sent the name in clear beside `[SSN]`, and refuses the
  same letter with the name whole (reviews A-3 and B S-1; 47 of 120,488 generated screens). (2) A wider placeholder
  through which a label reads to a number: the Social Security and phone patterns are read before the wider
  placeholder stands, so the number stays as written and the check, reading the label through the placeholder,
  refuses (`Social Security number of V a n t r e e, 555-0123`; `Call in`, `a`, `555-0123` on three lines for a patient
  INA; `Units 2026.00 123.45 555-0123` for a claim held `2026.00123`). With the name whole the same letter is redacted
  and sent (review B-1: 85 of 44,553 and 91 of 51,611 letters generated to provoke it; none in 41 ordinary sentences
  for a name of ordinary words, where it needs the phrase broken over a line between a label and a bare number).
- *The narrative's check and the packet verifier are not widened* (`subject.patterns` false; `holdsNameOrNumber`,
  `nameOrNumberMatches`). There a match fails the text, so `in a` would fail every narrative of a patient INA instead
  of costing two words.
- *A stored separator.* No fixture or corpus value holds one, so nothing changes today. For a patient whose stored
  number does, the separator joins at its place beside the usual joiners, white space among them, wherever the digits
  stand (review B-4, pinned): `1234.56 units` and `$1234.56` for a claim held `1234.56`; two amounts of a table row,
  `2026.00  123.45`, for a claim held `2026.00123` (sent as `[CLAIM_1].45`); `ZZ12345/01/15/2026` for a member ID held
  `ZZ12345/01`.
- *CR LF letters.* A CR LF text is refused wherever the same text with LF is; where the letter's LF writing would
  have been redacted it is refused, the safer of the two. One shape is recorded and pinned the other way (review A-2):
  redaction reads the letter as written, so a CR LF letter whose redaction differs from that of its LF writing can be
  sent, with nothing of the call's shown, where the LF writing is refused. The check reads a CR LF letter twice: the
  gate's slowest letter is a digit and a CR LF repeated to 100,000 characters, 994 ms against 707 ms on the base.
- *The dearest letter.* A wider match is applied only after the first reading's check has read the letter, so a letter
  that holds one costs one more check (about 1.7 times the base's time), and a CR LF letter that holds one is checked
  four times in all (about 2.7 times). Measured idle on the reference machine, in processor time, on the letters
  crafted to be slow, each with a CR LF and one name written apart added: 2.2 to 2.5 s against 0.8 to 1.0 s on the
  base, inside the budget of 3 s with the least room of any letter (review B-5; two such letters are budget rows).
  Time grows with the letter's length and no faster.
- *Time otherwise.* The wider reading read the letter's dates a second time and rebuilt the call's forms on every
  call: a letter of dates took about 1.4 times the base's time. The check's stores (the views and dates of a text) are
  now open around each exported reading and shared by both readings (`inOneReading`), and a subject's forms are built
  once per reading for each fold and width (`formsOf`); each store is keyed by everything its answer depends on and is
  dropped when the reading returns. The two letters of dates are back at the base's time (1.04 to 1.19 s against 1.04
  to 1.16 s on one machine), the gate's whole run takes less time on the head than on the base, and the row that counts
  regular-expression runs to show a plain letter is read once holds at its unchanged bar (2,106 runs against 2,385).
  No budget or bar was moved.
- *How the budget is proved.* By the amendment `co-001/time-budget-bound` above, which merged first: the reader's
  work in the processor time of its own thread, its first run held to the 3 seconds themselves, and an allowance only
  for a machine measured slower by a workload that runs none of the reader's code. This item's timed rows go through
  the same helper; no row was removed and no number raised.

**Left, each recorded.** Review N-1 and N-2 (the screen is asked about more than it need be) are as they were: no rule
here touches what the first reading offers; where a wider placeholder uncovers a run glued to a label word, the screen
is offered that run too (6 of 11,636 generated letters, never one of the call's own numbers). The costs above that a
narrower rule could spare (a month's word beside a day, a hyphenated word, a part of two letters, an amount that is a
stored number's writing, the two families of refusals) are for `LANES.md` Queues item 34 to weigh. Still sent in clear,
as on the base, and also Queues item 34, to land before any real PHI is processed: a part of a name split by a comma,
a colon or a semicolon with a space, by a parenthesis, or by another script's full stop (`Zephy, ra`, `Zephy(ra)`,
`Zephy。ra`; review A-4, pinned); a stored number written with another separator than the records hold (`ZZ12345.01`
for `ZZ12345/01`; A-5, pinned); a line feed before a CR, counted as written (A-6, pinned); a digits-only member ID or claim number glued to a letter (`XYZ76543210` for 76543210: the
amendment of 2026-10-27 reads glued digits as another, longer identifier, and refusing them needs a floor on the
number's length and its own measurement); a name the records hold with a plus sign (`JANE+ZEPHYRA` is one part);
one piece of a stored number alone (`ZZ12345` of `ZZ12345 01`); and the narrative drafter's own check, which does not
read stored separators. As recorded before and unchanged: a name glued to other letters, and a part split by `*`, `/`
or `{`.

**Tests.** `src/redact.leaks.test.ts`, `describe('MOD-23 ...')`: the name forms alone and in a held letter, the initial
beside them, the recorded cost rows, the stored separators, K-1 and two properties (a CR LF letter is refused wherever
its writing with LF is; no part of the name written with spaces or full stops inside it is sent, whatever the pieces).
Against f3f5a642's reader 32 of its 39 tests fail. `src/functions/denial-letter.test.ts` holds five letters of 100,000
characters that write such a name, once among dates and thousands of times, to the 3-second budget.

**Reviews.** Two adversarial reviews of the build, each finding run before any fix (`designs/lane-b-redact-item-26/
reviews` on `claude/build-ops`). Review A (what is sent; 120,488 generated screens on three seeds, and the stores read
inside and outside a reading): on the screen's path, no letter the base refuses was sent, no character it replaced
shown and no candidate lost; A-1 and A-2 above were closed, with U+0085, the stored bracket and `\r\r\n`; A-3 to A-6
are recorded above. Review B (must-stay, time, the screen; 108,164 generated letters): nothing the base refuses sent;
B-1 to B-5 are the costs recorded above. The battery of the amendment above, on its recorded seeds and on fresh ones,
head against the base run as head: the same answers but for the CR LF letters now refused; no flip but the month-named
patient's of ruling B, each of which f3f5a642 sends the same way; no departure in the audit copy.
