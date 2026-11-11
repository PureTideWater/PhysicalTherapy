# Design: the packets verifier reads identifiers as the letter reader's redaction does

Branch `co-001/packets-verifier-identifier-fold` (worktree `/home/user/fold`), base 4fe8bcca. Test matrix MOD-19 and MOD-20. No new ADR number: amendments to 0047, 0054 and 0066. Written 2026-11-11 by W7 from the three scouts (`approval-summaries/lane-b-packets-verifier-identifier-fold-wip/`), re-checked against the base. The code it describes is on the WIP ref `co-001/wip-packets-verifier-identifier-fold` (811706c9): commit 1 is the move, commit 2 the reading.

## 1. The gap
`packages/packets/src/verifier/mismatches.ts` `identifierSpans` fails a narrative that holds one of the case's identifiers as a whole word, without regard to case. Nothing else. So a narrative passes that writes:

| Records hold | Narrative writes |
| --- | --- |
| `ZOË`, `STÅHLBERG`, `Strauß` | `Zoe`, `Stahlberg`, `STRAUSS` |
| `O'QUILL` | `O’Quill` (a phone keyboard's apostrophe), `OQuill` |
| `VAN-TREEBY` | `Van–Treeby`, `VanTreeby`, `Van Treeby`, `Treeby` alone |
| `QUARRINGTON` | `Quar-⏎rington` |
| `JOANN` | `Jo Ann` |
| a letters-only member ID `QQRSTUVW` | `QQ RSTUVW`, `QQ-RSTUVW` |

A digit-bearing identifier written with joiners (`ZZ-123-4567`) already fails, but as `figure_not_in_input`, not as an identifier. `verifier/template.ts` (format /3) calls the same function. A person typing in the editor is the likely writer of every row above; the gateway's letter reader has read all of them since #80 and #115.

## 2. Decisions

**D1. One reader, in a pure package both import: `packages/redact` (`@tp/redact`).** `packages/model-gateway/src/redact.ts` has no import. It moves whole, by `git mv`, unchanged. The gateway imports it from `@tp/redact`; no stub stays at the old path.
- Why not import the gateway from packets: the gateway imports packets (a cycle), and its entry pulls the provider SDKs, `@tp/db` and a file reader into the verifier's closure.
- Why not a second matcher in packets: drift, which is the defect.
- Why the whole file and not a cut of it: the narrative's reading runs through `matchesIn`, which shares its views, forms, labels and date reading with the letter's. A cut edits PHI code to no gain. The whole file moved unchanged is byte-for-byte reviewable, and git's rename detection carries a concurrent edit of it (the SSN and phone leaks item, in flight, rewrites much of this file).
- Why not `packages/packets` as the home: the letter reader's redaction is not packet assembly, and every redaction change would be a packets change.
- Its tests stay in the gateway: they need the gateway's functions (`verifyDenialLetter`, the contract screen). The new package gets tests for its new export only.

**D2. One added export, `nameOrNumberMatches(normal, { names, numbers })`:** the narrative's reading, match by match, as ranges with a kind (`name` or `number`). `holdsNameOrNumber` (the drafter's check of its facts) is rewritten as `nameOrNumberMatches(masked(text), …).length > 0`, so the drafter and the verifier cannot read different forms.
- Each number is read as a member ID **and** as a claim number (`memberIds: numbers, claims: [numbers]`). The check is told only "a number", and the kind decides one thing: a digits-only number written as a calendar date is the number only after a label of its kind. Read as both, `Claim 2026-03-05` and `Member ID 2026-03-05` are both the number 20260305. This widens the drafter's check by that one case (it read numbers as member IDs only); the gateway's tests pass unchanged.
- No date of birth, no initials, no SSN or phone pattern (ADR 0054, amendment of 2026-11-04, Scope): a narrative's every digit is a figure the inputs must hold, and a payer's phone number quoted from a contract is one of them.

**D3. The verifier's reading is the union of today's and the shared one** (`packages/packets/src/verifier/identifiers.ts`, `identifierReader`). Today's whole-word reading stays, so nothing caught today is lost (it also reads each `/`, `;`, `,` or space-separated piece of a number alone, which the shared reading does not). Overlapping spans are joined; the report still holds positions only.

**D4. Skip rules for the shared reading's matches** (the whole-word reading skips as it always has):
- a match that touches a token (identifier placeholder, citation marker, fact token, stray braces) is dropped;
- a **name** in a dated figure (`date`, `month`, `month_day`) is dropped: a month's name in a date is the date (ADR 0047);
- a **number** in a dated figure stays only when it covers the whole figure. The matcher reads a whole written date as the number only after a label that says so, so `Claim 2026-03-05` fails for 20260305, while `2026` or `03-05` inside `2026-03-05` stays the date.

**D4a (added after design review 1). An identifier written across a token is read.** `Quar[1]rington` and `QQRS[1] TUVW` passed: a letter holds no token, so the matcher never reads across one, and D4 only drops matches that touch a token. The reading now takes the matcher over the text a second time with each token as one invisible character (the soft hyphen, which the readable text never holds and which redaction reads across), and keeps from it only a match that holds a token, under D4's two rules for dated figures. The filter matters: without it a label would become a number's label through a placeholder (`Member ID {{member_id:1}} 2026-03-05` would fail for 20260305). The first reading stays, so the union still never finds less than before. Cost: the matcher runs twice (about 3 ms for a typical narrative, 0.1 s at 1,600 identifiers).

**D5. The matcher never ships to the browser, and the browser has no identifier argument.** `mismatches.ts` and `template.ts` take the reading as a function (`IdentifierReader`); `check.ts` passes `readsNoIdentifier`; only `verifier/index.ts` (already server-only: it imports `node:crypto`) imports `identifiers.ts`. A test pins that `check.ts`'s import closure holds neither `@tp/redact` nor `identifiers.ts`.

**D6. The server API takes `{ names, numbers }`, required.** `verifyNarrative`, `verifyTemplate`, `verifyAtFormat`. A name and a number are read differently (a space joins a number anywhere; a name only between capitalized pieces, so `INA` is not "in a"), and every caller knows which is which: the worker reads each from its own column (`ScheduleIdentifiers.numbers` is new), the gateway has `identifierKinds(input)`. A flat list no longer type-checks, so no caller can fall back to guessing. Screens pass `NO_CASE_IDENTIFIERS` as they passed `[]`.

**D7. The report's format does not change** (`tp-packet-verifier/2`; /3 as slice 2 left it). Only which narratives get `identifier_in_narrative` changes.

## 3. Consequences, each named in the PR
1. **A stored pass can become `fails_now`.** `verifierNow` re-reads a stored version at request-for-approval, approval and export with today's identifiers. A version whose narrative holds a folded form of an identifier is refused there. That is the fix reaching stored versions. Screens read no identifier (as before) and keep saying "passed" until a step refuses.
2. **A number is read through its joiners**, as in a letter: `12-34` is patient control number 1234, and `SYN-1` is member ID SYN1 even where a fact holds `SYN-1`. Today's rule already fails an identifier written exactly as a held figure (`97110`, `$300.00` for 300); this extends it to joined forms. Short numeric identifiers make it likelier.
3. **A later redaction-only PR runs packets' mutation shards**, since the verifier's closure now holds `@tp/redact`.
4. Not read (unchanged, recorded): a name glued to other letters (`DearQuarrington`), nicknames, a look-alike letter inside a name (it already fails as `hidden_character`).

4a. Not read by the matcher itself (design review 1, recorded in ADR 0054's amendment for the leaks item): a middle dot between a name's letters, a lower-case piece after a space or period, letters spaced one by one.

## 4. Mutation testing (ADR 0066 amendment)
`verifier/identifiers.ts` joins `MUTATE.packets` in the `packets-verifier` shard, with no survivor. `packages/redact/src/redact.ts` is not mutated: it never was in the gateway, it is 3,500 lines of patterns (thousands of mutants, each survivor needing a second reviewer), and mutation-testing the letter reader is its own item, proposed to the orchestrator. ADR 0066's "the verifier and what it reads" gets that stated exception.

## 5. Tests
- **MOD-19** (`packages/packets/src/verifier-identifiers.test.ts`): each row of section 1 by name; a property with the generator as the oracle (a synthetic name or number written in a generated form, into a passing draft, fails with `identifier_in_narrative` over every letter and digit written); the skip rules; exact spans; no identifier in the report.
- **MOD-20** (same file): the differential, on generated narratives: the verifier flags an identifier exactly where today's reading or `holdsNameOrNumber` does (outside tokens and dated figures), so the adapter and the gateway's reading cannot drift; and the must-stay set (amounts, dates, codes, NPIs, markers, placeholders, a fact's plan identifier, another person's SSN- or phone-shaped number) gets no identifier flag whatever unrelated identifiers the case has.
- `packages/redact/src/narrative.test.ts`: `nameOrNumberMatches` ranges and kinds; `holdsNameOrNumber` agrees with it.
- The browser guard of D5. The worker's `scheduleIdentifiers` numbers (its DB test).
- Synth registry entries MOD-19 and MOD-20 as MOD-13's (`none(10, …)`, no fixture file).

## 6. Coordination with the SSN and phone leaks item (W5)
It edits `redact.ts` heavily and adds `confusables.ts` beside it. Whichever merges second: git follows the rename for `redact.ts`; a new file it imports is moved by hand into `packages/redact/src/`; a test's `./redact` import becomes `@tp/redact`. Whatever that item adds to the narrative's reading reaches the verifier with no further change.

## 7. Files
New: `packages/redact/{package.json,tsconfig.json,src/index.ts,src/narrative.test.ts}`, `packages/packets/src/verifier/identifiers.ts`, `packages/packets/src/verifier-identifiers.test.ts`. Moved: `redact.ts`. Changed: the gateway's 14 import lines and `functions/narrative.ts`; packets `verifier/{index,mismatches,template}.ts`, `check.ts`, `index.ts`; the worker's `identifiers.ts`, `services.ts`, `verifier-now.ts`, `export.ts`; test call sites (`[]` becomes `NO_CASE_IDENTIFIERS`); `pnpm-lock.yaml`, two manifests, `next.config.ts`, `eslint.config.js`, the watched paths, `stryker/base.mjs` and `shards.json`; ADRs 0047, 0054, 0066; the test matrix; the synth registry.

## 8. After the reviews (2026-11-11)
- Design review 1 (PHI and security): D4a above; two residuals recorded (section 3, 4 and 4a). Findings table in the status file.
- Mutation, shards `packets-verifier` and `packets-template` on Node 24.22.0: `verifier/identifiers.ts` 103 of 103 mutants killed. The union shadows the whole-word reading in the report (the matcher finds the same text), so five of its mutants and one at format /3 lost their killing tests; `identifierForms` and `identifierSpans` are now held by direct tests. The mapping of a match across tokens is written so no comparison is unreachable (a match's end is mapped as it is, and a token right after the match tells `<` from `<=`).
- Design review 2 (correctness) and build review A (PHI), fix round 5ac5d2cd. What changed in the decisions above:
  - **D2:** `holdsNameOrNumber` is the plain path again (every identifier, every form), and `nameOrNumberMatches` is the same subject asked where: it first leaves out every identifier whose letters the text does not hold (sound: a form's gaps hold no letter or digit), and takes `shortestPart`. A property holds the two to one answer, so MOD-20's differential is between two paths. A number is read as a claim only when it is digits alone. The match has no `kind`.
  - **D3 and D4:** a part of a name's word counts by itself only from four letters (`SHORTEST_PART`): "in" of HYE-IN failed every draft. One rule for dated figures: a match stays over one only when it holds the whole figure.
  - **D6:** the worker gives the gateway's drafter `numbers` beside `names`; packets' entry exports `CaseIdentifiers` and `NO_CASE_IDENTIFIERS` only.
  - **Consequence 2 gains a third:** a name that is or folds to a word of the narrative fails it at any length (TO and THE before this change; THẾ and TÔ with it), and so does a part of four letters or more that is a word (PAGE-SMITH). Proposal P1 in the status file asks for a ruling.
  - Cost: 17 ms for 10,000 identifiers the narrative holds none of; the whole-word reading's own cost at that size is as it was.
- Build review B's brief, for a session that must run it again: (A) is the prefilter sound: any text where `holdsNameOrNumber` and `nameOrNumberMatches(...).length > 0` differ; (B) is the floor right: a whole name, word or number wrongly dropped at 4, or a short part that still counts; (C) every span of the old `identifierSpans` is covered, and what new failing rows realistic names bring; (D) the tests fail when the added region of `redact.ts` is broken by hand (it is not mutated); (E) no arithmetic, stage or approval logic changed; (F) the ADRs and the test matrix against the code.
