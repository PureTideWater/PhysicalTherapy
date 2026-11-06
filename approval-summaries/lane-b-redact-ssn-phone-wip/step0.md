# redact-ssn-phone: build step 0 (design section 13, step 0)

Written 2026-11-04 by the acting Lane B session on `co-001/redact-ssn-phone` (/home/user/redact-ssn-phone, HEAD 00fd2906,
clean, nothing committed). Synthetic twins only. No tracked file was changed. Scratch scripts and tables, all outside the
repository:
- `/tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/ssn/scratch/probe.ts`: 182 rows
  run against the merged redactor. Results: `.../ssn/scratch/probe-table.md`.
- `.../ssn/scratch/probe-old.ts` with `.../ssn/scratch/old/redact.ts`, a copy of 871faff9's redact.ts: the same rows on the
  base the design was written on. Results: `.../ssn/scratch/probe-table-871.md`.
- `.../ssn/scratch/dates.ts` (datesIn on chain shapes), `.../ssn/scratch/phi.ts` (phi-guard examples),
  `.../ssn/scratch/n6.ts` (sampling of the N6 property's generator).

**Verdict.** The design still fits the merged code in its structure: the one pass in `matchesIn`, the same `found` list,
`merge`, placeholders, `masked`, the self-check in `prepare`, the screen in `screen`, and amending ADR 0054. No rule has to
be dropped. Thirteen adaptations are needed (list A). Five of them correct real defects in the design: A3 (R7 date and
amount barriers leak `SSN 900-12-03-56`), A4 (the N6 property will fail), A6 (R11 names a phi-guard example phi-guard does
not flag), A7 (R5 keep-nouns across a sentence end), and A9 (the prototype files the design cites are gone). The rest
are line numbers, names, joiner sets and things #75 or #115 already did.

---

## 1. Files diffed (871faff9..00fd2906)

| File | Change | What it means for the design |
|---|---|---|
| `packages/model-gateway/src/redact.ts` | +279/-37 (1,408 lines) | See section 2 for each change; line map in section 6 |
| `src/redact.test.ts` | +35/-11 | N6 property now draws digit-only groups and asserts `matcher === (letterReads \|\| labeledReads)`, with new label prefixes; pinned "other way" rows use the prefix `Also` (no label); bar and backslash rows; other-script and full-width digit rows (A4) |
| `src/redact.property.test.ts` | +560/-45 | MOD-13 generator: wider `NUMBER_JOINERS`, labeled and unlabeled prefixes, the plausible-year date oracle; two fixed-seed runs (`YEAR_BELOW_1900_SEED` 1162287068, `LABEL_BOUNDARY_SEED` 460548619); about 12 new named MOD-13 tests; a second MOD-14 property (G1: labeled `.` and `/`). `EXACT` at :266, `PARTS` at :30, MOD-14 `PLACEHOLDERS` at :898 |
| `src/functions/denial-letter.ts` | no change | Every design line number in it still holds (`OtherPatientCheck` doc :47-52, `LetterContext` :93, `verifyDenialLetter` :124, `unknown_claim` test :142, `identifier_left` :222-223, `screen` :232-237, import :9) |
| `src/functions/denial-letter.test.ts` | +5/-3 | One test: digits joined by `.` or `/` are the number after a label (`Ref 1234.5678` is now `[CLAIM_1]`); the 100 kB `it.each` is still at :311-329 |
| PRD section 14, PHI minimization (PRD.md:575) | no change | The sentence the design rewrites is word for word as the design quotes it |
| ADR 0054 | +86/-11 (491 lines) | #75's amendments. #80's residual sentence ("addresses, phone numbers and Social Security numbers, which PRD 14 does not list") is now :433-434 (design said :372-373). The last amendment heading is `## Amendment (co-001/contract-phi-check, 2026-10-27)` at :457. The Status line is :3-8 |
| ADR 0070 | +70 | Part 3, N6 is at :1327. Its join bullets now record F4-1, R5-1, G1, G4 and phi-G2-regress-1, so the design's quote ("no `*` and no `.` `/` `_` between two digits") is out of date (A10) |
| `docs/product/test-matrix.md` | +141/-16 | MOD-13 and MOD-14 at :261-262; MOD-17 and MOD-18 already follow them; a placeholder note for MOD-15/16 at :275-276 (8540a129: "added by its own pull request") that the build replaces |
| `packages/synth/src/cases/matrix.ts` / `registry.ts` | large (other items) | MOD-14 at matrix.ts:509 and registry.ts:735; insert by key after MOD-14 |
| `docs/product/reconciliation-001.md` | +23 | 677 lines; the last `Ruled by` paragraph is at :665 (design said after :658) |
| `apps/worker/src/packets/letter-records.ts` | no change | Header :5-11 as the design quotes it; still a watched path (watched-paths.txt:170) |
| `packages/observability/src/phi-guard.ts` | +23/-3 (payload lists only) | Shapes now at :42-46 (design said :41-45); the shapes themselves are unchanged |

Commits read, in order: 3a033b32 (fix 4: `years()` plausible year 1900-2099, `EARLIEST_WRITTEN_YEAR`/`LATEST_WRITTEN_YEAR`
exported), cf61a828 (fix 4b: `_`, `|`, `\` join a number anywhere; `writtenAsDate`, the whole-date rule, replaces `DASHED`),
1677792a (R5-1 to R5-3, OVR-1/2: apostrophes, `~`, middle dots, bullets, `;` and double quotes join; `IDENTIFIER_LABEL`
makes a date-shaped number the number), d2a609fd (G1-G4: `Form.labeled` with `GAP.labeledNumber` over `.` and `/` after a
label; `labeledDigitsJoin` in the candidates; a label is a head word of its kind; primes join), 49c7a781
(phi-G2-regress-1: `ANY_IDENTIFIER_LABEL`, so after any label, digits joined over `.` or `/` that are not a whole written
date are the number), 7639392f (`LABEL_END` takes `=`, any dash and the minus sign), a8149341 (phi-numero-glued:
`GLUED_LABEL`, `gluedLabelBefore`, `unglued` reading in the candidates), and #115 (a01a0737, 3356df22, cbe89f0c,
4a51f77e, 30946b56, d6e2b3d9: `labelsBefore` with `LINE_OR_SENTENCE_START`, so a sentence or line start adds the label it
begins; a bare `ID` with a qualifier; `ID` or `No.` after any full stop).

## 2. Each merged change against the design

1. **Plausible years (fix 4).** `years()` returns nothing for a four-digit year outside 1900-2099. `datesIn` spans for
   `0023-04-26` and `2100-04-26` therefore have `dates: []`. Today's own-form rule (`otherDates`) and `writtenAsDate`
   both need a reading, so such a span is never kept as a date. **R14(a) is done.** R14(b): MOD-13 already holds the own
   claim's regression (`reads a written date only with a year from 1900 to 2099`, redact.property.test.ts:587). The build
   adds only the SSN/phone side: another patient's date-shaped ID offered to the screen, and the scan (R14c below).
   **R14(c) comes for free** if the survivor scan's date barrier is "a separated `datesIn` span with a reading" (A3).
   Probe R14a: `Claim 0023-04-26 on file.` for a non-own number is unchanged and passes, as it should.
2. **Wider number joiners (fix 4b, R5-1, G4).** The call's own number now joins over `_ | \ ' ' ʼ ʹ ˊ ′ ″ ‵ ` ~ ～ · ‧ ∙
   ⋅ ・ • ; " " " ˗ ➖` anywhere (`NUMBER_JOINERS`, :348). Probe O13 (`Member 900_12_3456`) and O14 (`900·12·3456`) are
   now `[MEMBER_ID]`. `letterJoins` (:1012) and so `identifierCandidates` join over them too. Probe R7-5/6/7:
   `202•555•0123`, `900·12·3456` and `900_12_3456` are now offered whole to the screen (they were not at 871faff9).
   Design section 3.1 says SEP is "never an underscore", and R12 leaves `•`, `·`, `_` to the survivor scan as
   refusals. A1 and A2 adapt both.
3. **The whole-date rule (`writtenAsDate`, fix 4b).** A digits-only own number stays as a date only when its own written
   range is that whole separated date. The survivor scan's date barrier must follow the same rule (A3).
4. **Labeled numbers over `.` and `/` (R5-2, G1, phi-G2-regress-1).** After any identifier label (`ANY_IDENTIFIER_LABEL`,
   :600, which includes `Member`, `Subscriber`, `Account`, `Ref`, `ID`, `Patient ID`, `Policy #`), the call's own
   digits-only number matches over `.` and `/` (`Form.labeled`, :397; matchesIn :731-741). Probe O7 (`Claim 202.555.0123`)
   and O11/O12 (`Member [ID] 900.12.3456`) are now redacted as the call's own. **Design 4.2 is still needed**: O6
   `Claim (202) 555-0123`, O6u `Seen (202) 555-0123` and O7u `Seen 202.555.0123` are still sent today, and O10 is still
   `Claim +1 [CLAIM_1]`. Only its reasoning changes (A11). On the screen side, `labeledDigitsJoin` (:1024) now offers
   `Subscriber 900.12.3456` → `900123456` (probe S14) and `ID: 900.55.1234` → `900551234` (probe L-4).
5. **Glued labels (a8149341).** The call's number glued to a label word (`ICN99887766`, `No99887766`) is read
   (matchesIn :743-761), and the candidates add an `unglued` reading. The patterns already allow a letter before a match
   (3.1: `Tel202-555-0123`, `SSN900-12-3456`), so nothing conflicts. Design section 5, item 2's
   `identifierCandidates(screenText)` inherits the second reading automatically.
6. **#115's label rules (`labelsBefore`, `LINE_OR_SENTENCE_START`).** These decide only when the call's own number,
   written as a whole date, counts as the number. They never redact a number that is not the call's own, so they do not
   overlap the SSN/phone patterns. One lesson carries over: a sentence end breaks a label's reach. The design's R5
   keep-noun window has no such rule, which matters because a keep-noun keeps a number, the unsafe direction (A7).
7. **`identifierTokenRuns` signature.** `joins` now takes a fourth argument (`run`). `letterJoins` keeps its
   three-argument form. Section 5's R6(c) ("joined to the token written against it when `letterJoins` would join them")
   can call `letterJoins` as is.
8. **Nothing changed** in `merge`, `RANK`, `PLACEHOLDERS`, `PLACEHOLDER`, `masked`, `holdsIdentifier`,
   `holdsNameOrNumber`, `letterSubject`, `redactionSpans`, `redactLetter`, `Redacted` or `index.ts`'s exports (:208), apart
   from line numbers. Design sections 4.1, 4.3, 6 and R10a apply as written.

## 3. Rule by rule (section 17 R1-R14, Appendix A, and the sections they amend)

| Rule | Fits the merged code? | Adaptation |
|---|---|---|
| 2 Scope, `Subject.patterns` | Fits. `Subject` :450; `letterSubject` :908; `holdsNameOrNumber` :965 | `patterns: true` in `letterSubject` only; `holdsNameOrNumber` and the contract screen get none |
| 3.1 Same view, same `found` | Fits. `matchesIn` :688 now has three own-form loops (pattern, `labeled`, glued) before the initials | The patterns run after all three and after the initials. "The last match found before the number" (label window end) must include the labeled and glued matches; they are in `found` already |
| 3.1 SEP ("never `_`, `:`, `#`") | Adapt | **A1**: add a "joiner gap" for single number joiners that are not white space |
| 3.2, 3.3 shapes, area rule, HICN, extension, labeled bare, local seven | Fit | Names in Appendix A that are not defined (`SSN_LABEL_GLUED`, `SSN_LABEL_BEFORE`, `PHONE_SHAPED`, `shaped`, `decideBare`, `survivorLeft`) must be written from section 17's text (**A9**) |
| 3.4 / R5 labels and keep-nouns | Adapt | **A7** (sentence end cuts a keep-noun's naming), **A8** (connectors aligned with `LABEL_END`) |
| 3.5 guards | Fit. Probe: every K, D, N, C, Z1-2, T, I, E, R row unchanged on both bases | None |
| 4.1 kinds and ranks | Fits. `Kind` :380; `RANK` :886; `PLACEHOLDERS` :887; `merge` :894 | Insertions at those lines |
| 4.2 own identifier in a pattern shape | Fits; still needed (O6, O6u, O7u, O10) | **A11**: reword its reason (`.` already joins after a label) |
| 4.3 `PLACEHOLDER`, masking, counting | Fits. `PLACEHOLDER` :254; `masked` :953 | MOD-13's `EXACT` is at redact.property.test.ts:266 |
| 5 / R6 / R10a screen candidates | Fits. `identifierCandidates` :1053 now reads two readings and `labeledDigitsJoin` | Item 1 and 2 inherit them; the item 3 join uses `letterJoins` (:1012, three arguments). `redactLetterForScreen` stays module-internal (`index.ts`:208 exports `redactLetter` and `identifierCandidates`; `letter-records.db.test.ts` still calls `identifierCandidates` directly, which stays valid) |
| 6 self-check, `identifier_left` | Fits. denial-letter.ts:222-223 unchanged | None |
| 7 completeness | Fits as corrected by R7 | Drop the remark "`DOB 03/03/1961<ZWSP>5550198765` fired it": not reproduced on 871faff9 or on the merged code (probe R4-3 passes on both; today's self-check does not fire there). It is irrelevant after R4 |
| 8 time | Fits; see the probe timing (section 5). | **A12** |
| R1 period never with white space; amount guards on a white-space gap | Fits | None. Probe R1-1..6 unchanged today, as R1 must keep them |
| R2 line breaks, indentation, `DASH{1,2}` | Fits. `LINE_BREAK` :350 (U+0085, U+2028, U+2029, CRLF) | Reuse `LINE_BREAK`, do not redefine it |
| R3 digit values (`digits` view) | Adapt (shape only) | **A5**: `viewOf` (:292) takes the invisible mode (`join` / `drop` / `space`) and needs a digit flag beside it, not a fourth mode, because R4 and R7 need `digits` on two invisible readings each |
| R4 join and space readings | Fits; `viewOf` already has `space` | The patterns read (digits, join) and (digits, space); the scan reads (digits, drop) and (digits, space), as R7 says |
| R5 | Adapt | **A7**, **A8** |
| R6 | Fits | `merge` unchanged since 871faff9, so R6(b)'s change lands as designed |
| R7 survivor scan | **Adapt (defect)** | **A2** (joiner set), **A3** (date and amount barriers) |
| R8 | Fits | None |
| R9 tests | Fits, with additions | **A4** (N6), **A13** (MOD-13 seeds) |
| R10a / R10b | Fit | R10b at denial-letter.ts:140-143 (`/^\[[A-Z_]+(_\d+)?\]$/`) |
| R11 phi-guard superset test | **Adapt (defect)** | **A6** |
| R12 rare forms | Adapt | **A1** turns the `•`, `·`, `_` refusals into redactions; `/` and `)` stay refusals |
| R13 records | Fit; locations moved | Section 6 line map; ADR 0070 N6 sentence (**A10**) |
| R14 | (a) done by #75; (b) partly done; (c) free with A3 | See section 2, item 1 |
| 10.3 N6 property and pinned rows | **Adapt (defect)** | **A4** |
| 10.3 MOD-14 candidates line | Fits, now two properties | Both MOD-14 properties (the first at about :901 and G1's at about :919) gain the `redactLetterForScreen(...).candidates` assertion |
| 10.4 synth, matrix, mutation | Fits | Insert after `MOD-14` by key; replace the test-matrix placeholder note at :275-276 |
| 11 docs | Fits, locations moved | ADR 0054: new last section after :457's amendment, Status line :3-8; #80's residual sentence (:433-434) left as decided; PRD :575 sentence as designed; reconciliation after :665 |
| 13 step 9 (re-run review tables, `apply/run.mjs`) | **Cannot run as written** | **A9** |
| 16.1, 16.2 proposals | Narrowed by #75 | **A11** |

## A. The adaptation list the builder must follow

**A1. Shaped SSN and phone patterns accept one non-space number joiner as a gap (supersedes 3.1's "never an underscore"
and R12's refusal of `•`, `·`, `_`).** Since cf61a828, 1677792a and d2a609fd, the call's own number joins over `_ | \ ' '
ʼ ʹ ˊ ′ ″ ‵ ` ~ ～ · ‧ ∙ ⋅ ・ • " " " ˗ ➖` (and `;`). The letter's SSN and phone shapes should read the same joiners, so that
`900_12_3456`, `202•555•0123` and `900·12·3456` are redacted rather than refusing the letter. Add a `GAP_JOINER` built from
`NUMBER_JOINERS` minus white space, the dashes (already `GAP_DASH`), VANISHED, `;` and the double quotes: an optional
VANISHED, one such character, an optional VANISHED. Like `GAP_PERIOD`, it **never pairs with a white-space gap** (R1a).
It may mix with dash, period and invisible gaps. Dates (4-2-2 or 2-2-4) and amounts are never 3-2-4 or 3-3-4, so this
costs no must-stay row. Keep these out of the patterns: `/` (a date's), `)` beyond the `(AAA)` form, `,` (R1b lists), and
`;` (a list separator). They stay with the survivor scan. Update R12's built list and the ADR's "Still not covered"
list to match.

**A2. Survivor scan joiners (R7.2).** The scan's single joiner set becomes: one or two dashes, `.`, `(`, `)`, `/`, every
`NUMBER_JOINERS` character that is not white space, and `;` only when no white space follows it (`900;12;3456` counts;
`Lines 101; 102; 103` does not). The scan stays independent: write its own constant. A comment says it mirrors
`NUMBER_JOINERS` and a named test pins one row per character. It must never import the patterns' constants.

**A3. Survivor scan barriers follow the whole-date rule (defect in R7.1).** As written, R7.1 makes "every `datesIn` span"
and "a group followed by `.`/`,` and one or two digits" barriers. Probe (`.../ssn/scratch/dates.ts`): `SSN 900-12-03-56`,
`SSN 900.12.03.56` and `SSN 900-11-20-26` each hold a separated `datesIn` span with a reading (`12-03-56`, `12.03.56`,
`11-20-26`). The barrier removes it, the `900` left over is no chain, the patterns do not read the 3-2-2-2 shape, and the
letter is **sent**. `SSN 900-12-34.56` likewise loses `34.56` to the amount barrier. Rule for the build:
- A date barrier is a `datesIn` span that is **separated, has a reading** (this makes R14(c) automatic), and is **whole**:
  not joined on either side to another digit group by a non-white-space joiner of A2. This is #75's `writtenAsDate`
  rule (cf61a828) applied to the scan.
- An unsigned amount token (comma thousands, or a group followed by `.` or `,` and one or two digits) is a barrier only
  when no non-white-space joiner joins it to a digit group on its left. A currency-signed amount is always a barrier.
- Spaces-alone and compact `datesIn` spans are **not** barriers. `SSN 900 12 03 56` reads `12 03 56` as a non-separated
  date; as a barrier it would leak. Unbarriered it is a 9-digit chain and is refused.
- Two dates or a date and an amount joined by white space stay barriers (`2026-10-28 2026-11-01`,
  `Paid $150.00 2026-11-01`, `DOS 11/01/2026 97110 GP 1`), so R7's no-refusal rows hold.
- Record as a residual: an SSN written with an OCR space and then a whole slashed or dashed date for its last six
  (`SSN 900 12/03/56`). Add named rows for `SSN 900-12-03-56`, `SSN 900.12.03.56`, `SSN 900-11-20-26` and
  `SSN 900-12-34.56` (each refused) and `2026-10-28 2026-11-01` (not refused).

**A4. The N6 property in `src/redact.test.ts` (:167-205) will fail after the build; design C1's premise is out of date.**
C1 said differing cases are near zero (280 000 samples, none). That was at 871faff9. d2a609fd/49c7a781 added a
digit-only group arbitrary (`digitGroup`, 1-6 digits, `.`/`/` separators), and sampling it (`.../ssn/scratch/n6.ts`,
200 000 draws) gives about **3.7 cases per 2,000-run execution** where neither `letterReads` nor `labeledReads` holds and
the text is a 9- or 10-digit chain of groups under five digits (for example `234.567.8901`, `234/567/8901`). The patterns
or the survivor scan fire on those, so `matcher` becomes true. The expectation becomes
`matcher === (letterReads || labeledReads || wroteSsnOrPhone)`, with `wroteSsnOrPhone` computed on the generator side from
the drawn groups and separators: digits only; no `*`; and either the groups are 3-2-4 or 3-3-4 (area `[2-9]`) with
separators a pattern reads, or the scan rule holds (one to four consecutive groups with 9-10 digits, or 11 starting with
1, and no group of five or more). Also account for the prefix: a bare nine or ten after `Member ID:`, `ID `, `(`, `X\n`,
`\t`, `The number ` or `no. ` is redacted, while after `Claim#`, `see the claim `, `ICN (`, `Claim: “`, `**Claim:** `,
`reference: ` or `Re: ` it is kept only per R5 and A8. The candidate expectation is unchanged, because the screen is
asked via `identifierCandidates` on the raw text here. The pinned "other way" rows (`Also 1234.567890`,
`Also 20261234/01`, `Also 123*4567890`, `Also SYN*PCN*44551`) stay `false`: each is under nine digits per chain, or has
a group of five or more, or uses `*`. Change the design's new pinned rows: `Member 555.012.3456 on file` is now read by
#75 itself (`Member` is a label). Use `Also 202.555.0123 on file` and `Also 900123456*1 on file`, both `true` only
through the patterns. Run the property over 60 seeds before relying on it. The 2,000-run property already has a 60 s
timeout.

**A5. `viewOf` gets a digit flag (R3).** `viewOf(normal, invisible, digits = false)`. With `digits`, each `\p{Nd}` code
point after the fold is replaced by its ASCII value, keeping one unit per code point so `from`/`to` (and `inNormal`)
stay as they are. Compute the value as `(codePoint - zeroOfItsRun) % 10`, scanning back while still `\p{Nd}` (every Nd
range starts at a zero). Cache by code point as `fold` does. The patterns use (digits, join) and (digits, space). The
scan uses (digits, drop) and (digits, space) on the masked text. The own-form matcher keeps today's views unchanged
(its other-script residual stays, proposal 16.3).

**A6. R11's phi-guard test: `(555)012-3456` is not flagged by phi-guard (defect).** `textPhiFindings('(202)555-0123')`
returns `[]` (`.../ssn/scratch/phi.ts`): phi-guard's phone shape needs a separator after `)` (phi-guard.ts:46). This was
already so at 871faff9, since the shapes did not change. Assert "flagged by phi-guard and redacted by the letter" for
`900-12-3456`, `(202) 555-0123`, `202.555.0123`, `202 555 0123` and `202-555 0123`. Assert
`(202)555-0123` as redacted by the letter and **not** flagged by phi-guard, as one more intended difference. Add that to
proposal 16.9. `202.555 0123` is flagged by phi-guard and refused by the letter's self-check (R1a/R7), as designed.
`123-456-7890` is flagged by phi-guard and kept by the letter (area 1), as designed. Use phones in `NPA-555-01xx`
(the item prompt's rule) rather than the design's `555-012-3456`.

**A7. A keep-noun's naming ends at a sentence end (#115's lesson; supersedes part of R5(a)).** R5(a) lets `.` and white
space stand between a keep-noun and the number, any number of times. So `See our claim. 900551234 is the subscriber
number.` would keep a bare nine (an SSN or member ID) because `CLAIM` "names" it across a sentence end (probe R5-18 shows
it sent today, as everything is). A keep-noun only ever keeps, which is the unsafe direction. #115 has the same
asymmetry: a sentence or line start only ever adds a label. Rule:
- Between a keep-noun and the number, a full stop, `!` or `?` followed by white space and then a letter ends the naming,
  as `LINE_OR_SENTENCE_START` reads one, past marks. The exception is the abbreviation full stop of the connectors `NO.`,
  `NBR.` and `NUM.`, or of `REF.` itself, which may be followed by a connector or the number (`Ref. No. 2025550123`,
  `Claim no. 900123456` stay kept).
- A bare line break with no full stop does not end it, so a wrapped `Claim\nNumber: 900123456` stays kept.
- SSN and phone labels keep R5's reach. A line break does not end them, nor does a sentence end inside the 64-character
  window, since they only add redaction.
- Write the rule in R5's own code. Do not call `labelsBefore`: its lists and purpose differ, and reusing it would tie the
  two features together. Add named rows: `See our claim. 900551234 is the subscriber number.` → `[SSN]`,
  `Ref. No. 2025550123` kept, `Claim\nNumber: 900123456` kept, and `Claim. ID 900551234` → `[SSN]`.

**A8. R5(a) connectors read a label's end as #75 does.** `LABEL_END` (:575) reads `*` (Markdown bold), `=`, any dash and
the minus sign, one `,`, `(` and an opening quote after a label (G3, phi-label-end-dash). Without these as connectors,
`**Claim:** 900123456`, `Claim, 900123456`, `ICN (12345678901`, `Claim: “2025550123` and `Claim = 2025550123` would have
the payer's reference redacted, because the keep-noun would not "name" the number. Add `*`, `=`, `−`, `\p{Pd}`, one `,`,
`(` and `“ ‘ " '` to R5's connectors. An SSN or phone label in the window still wins (R5c), so this costs no
redaction. MOD-16's keep-noun rows gain these forms, from the generator's own copy of the list (risk 14.6).

**A9. The design's scratch prototype is not available; build from section 17's text.** `apply/refined.mjs`, `run.mjs`,
`more.mjs`, `f12.mjs`, `review/attack-table.tsv`, `real-table.tsv`, `designer/proto.test.ts` and `probe/probe.test.ts`
were in the design session's scratchpad (another container). They are not on this machine or in /home/user/ops.
Appendix A's `shaped`, `decideBare`, `survivorLeft`, `npiCheckDigitValid`, `PHONE_SHAPED`, `SSN_LABEL_GLUED` and
`SSN_LABEL_BEFORE` are named "as the prototype" but not given, so the builder writes them from 3.2-3.4 and R1-R12, as
amended here. Section 13 step 9's re-run of "both review tables and `apply/run.mjs`" becomes a re-run of this step's
probe (`.../ssn/scratch/probe.ts`, 182 rows: S, P, O, X, K, D, N, C, Z, T, I, E, R, and section 17's R1-R12 examples
reconstructed from the design text) against the build. Every `redact` row must show `[SSN]`/`[PHONE]`, every `keep` row
must be byte-identical, every O row must have its placeholder, every X row must be offered, and every `refuse` row must
be refused. The design's "66 named rows" are not listed in it; the reconstructed set covers each example the design
text names.

**A10. ADR 0070 Part 3, N6 sentence.** N6 (:1327 onward) now lists the letter path's joiners through phi-G2-regress-1
(2026-11-04). The dated sentence goes after its join bullets and says: "Amended 2026-11-04 (docs/adr/0054, amendment of
that day): the letter path also reads every Social Security and phone shape whatever its separators (dashes, periods, the
number joiners above, a line break), refuses a letter in which a 9- to 11-digit chain survives, and the screen is asked
about the redactor's candidates ..." Date the ADR 0054 amendment, the PRD and the reconciliation by the build's own date.
Keep the ruling's date as 2026-11-01 and record who and when as the design says. The amendment heading becomes
`Amendment (co-001/redact-ssn-phone, <build date>)`, ruled 2026-11-01. This is a convention choice. If the build keeps
"2026-11-01" as the heading date, use it consistently in the `describe` names, matrix note and Status line.

**A11. Reword 4.2's reason and proposals 16.1/16.2.** `.` and `/` already join the call's digits-only number after any
identifier label (#75: G1, phi-G2-regress-1), and the screen offers such digits after a label. 4.2 is still needed for
`(`/`)` (O6, O6u), an unlabeled `.` (O7u) and the `+1` prefix (O10). Proposal 16.1 narrows to "`)` and an unlabeled `.`
between digits". Proposal 16.2 narrows to "`)` and the three-token cap" (`.` after a label is done).

**A12. Time: the merged code's worst case is already about 1 s.** Today's redaction plus self-check on 100 kB of `5<ZWSP>`
takes **989 ms** (871faff9: 1,033 ms), median of 3 in this container under the heavy lock. Other shapes take 86-180 ms;
the existing slash-dates letter takes 417 ms. The design's 189-277 ms for that shape was the pattern scan alone. With R4
(two pattern readings) and R7 (two scan readings), the build adds four linear passes on top. Measure that letter first,
right after `patternMatchesIn` and the scan exist. If redaction plus self-check passes about 2 s on it, fold the R4
readings into one pass before going on, since the 3 s budget must keep headroom on a loaded runner. Add the 100 kB
letters design 10.1 and R17 list to the `it.each` at denial-letter.test.ts:311-329. Use the twin phones `NPA 555-01xx`.

**A13. MOD-13's fixed seeds and generator.** Two fixed-seed runs (1162287068, 460548619) and the 400-run property must
still pass with the patterns and the scan. By reading the generator, MOD-13 letters hold no 9-11-digit chain other than
the call's own numbers, which are masked. Kept dates are whole and separated, and the filler has `$150.00`, `May 30,
2026` and `REF-SYN-77`, so no `[SSN]`/`[PHONE]` and no scan refusal is expected. Run the three before anything else
in the build's test stage, and run all of MOD-13 over 60 seeds once with the new code. If a scan refusal shows up
there, it is A3's barrier rule or A2's `;` rule, never a reason to loosen the scan. MOD-13's `EXACT` (:266), `PARTS` (:30)
and MOD-14's `PLACEHOLDERS` (:898) gain `SSN|PHONE` as designed.

## 4. Things the merged code makes wrong or unnecessary in the design

1. **Wrong now:** design 4.2's "`(`, `)` and `.` join digits only next to a letter, :341". `.` and `/` also join after any
   label (A11).
2. **Wrong now:** design 3.1 "never an underscore" and R12's refusal of `•`, `·`, `_`, which the call's own number now
   joins over (A1).
3. **Wrong now:** C1/10.3's claim that the N6 property's expectation change is "about truth, not a flake". It will fail
   about 3.7 times per run (A4). The design's pinned row `Member 555.012.3456` is already true today (A4).
4. **Wrong from the start, found here:** R7.1's barriers leak `SSN 900-12-03-56`-type letters (A3). R11's example
   `(555)012-3456` is not flagged by phi-guard (A6). Section 7's remark that `DOB 03/03/1961<ZWSP>…` fired today's
   self-check does not reproduce (probe R4-3).
5. **Unnecessary now:** R14(a), done by #75 (3a033b32). Most of R14(b): the own-claim regression exists
   (redact.property.test.ts:587 onward). R14(c), with A3's "with a reading" barrier, needs no code of its own.
6. **Unnecessary now:** proposal 16.2's `.`-after-a-label part, and 16.1's `.`-after-a-label part (A11).
7. **Out of date, cosmetic:** every redact.ts line number in the design (section 6 map), ADR 0054 :372-373 → :433-434,
   phi-guard :41-45 → :42-46, reconciliation :658 → :665, `BIRTH_LABEL` :181 → :194, `unknown_claim` :143 → :142.
8. **Not affected:** denial-letter.ts (unchanged), PRD 14's sentence (unchanged), `index.ts` exports, `merge`, `masked`,
   the placeholders, the screen path, the watched paths (no new file or import edge; R11's test imports
   `@tp/observability`, which `src/gateway.ts` and `src/testing.ts` already import).

## 5. Probe results

Patient A: `ZEPHYRA Q VANTREE`, DOB 1961-03-03, member `ZZ1234567`, claim `SYNCLAIM0001`. Patient B (O rows): member
`900-12-3456`, claims `202-555-0123` (claim 1) and `9001234567` (claim 2). Other patient (X rows): `900-55-1234`,
`2025550198`. Phones are `NPA-555-01xx` twins (the design's `555-012-3456` rows mapped onto them); SSNs are 9xx. The full
tables are `.../ssn/scratch/probe-table.md` (merged) and `.../ssn/scratch/probe-table-871.md` (871faff9).

**The 36 SSN and phone forms** (S1-S20 and P1-P15, P17; plus S14b Arabic-Indic and S21 masked): on both bases, **every one
is sent unchanged and the self-check passes**, as the design's probe found. P16 (vanity) and P17 / S18 (keep-noun) are
unchanged, as they must stay.

**The must-not-redact list** (K1-K4 amounts, D1-D13 every `datesIn` form, N1-N3 NPIs, C1-C5 codes, Z1-Z2 ZIP and ZIP+4,
T1-T2 TINs, I1-I3 ICNs, E1-E2 EFT and check, R1, R3-R5 references and page numbers): unchanged on both bases, self-check
passes. D14 (the patient's own DOB) is `[DATE_OF_BIRTH]` by its own rule, as before. Z3 (`CA 900011234`) and R2's phone are
unchanged today; the design redacts them.

**Section 17's examples** (R1-R12, glued and labeled rows; 78 rows): all unchanged and passing today on both bases. Every
row the design means to redact or refuse is sent today, and every row it means to keep is kept. Nothing on the merged
base already redacts an SSN or phone that is not the call's own. G3 (`RE: Vantree900-12-3456`) is still sent with the
glued name (design 7.4).

**Changes between 871faff9 and the merged base** (the only rows that differ):

| Row | Letter | 871faff9 | Merged (00fd2906) | Why |
|---|---|---|---|---|
| O7 | `Claim 202.555.0123` (own claim 1) | sent | `Claim [CLAIM_1]` | labeled form over `.` (d2a609fd / 49c7a781) |
| O11 | `Member 900.12.3456 on file` (own member) | sent | `Member [MEMBER_ID] on file` | same (`Member` is a label) |
| O12 | `Member ID 900.12.3456 on file` | sent | `[MEMBER_ID]` | same |
| O13 | `Member 900_12_3456 on file` | sent | `[MEMBER_ID]` | `_` joins anywhere (cf61a828) |
| O14 | `Member 900·12·3456 on file` | sent | `[MEMBER_ID]` | middle dot joins (1677792a) |
| S14 | `Subscriber 900.12.3456 on file.` | candidates lack `900123456` | offers `900123456` | `labeledDigitsJoin` (G1, phi-G2-regress-1) |
| L-4 | `ID: 900.55.1234` | offers `ID900` only | offers `900551234` | same |
| R7-5/6/7 | `202•555•0123`, `900·12·3456`, `900_12_3456` | nothing offered | offers `2025550123` / `900123456` | `letterJoins` over the wider joiners |
| D10, R2 | `Nov 1st '26`, `…0123; call…` | | extra candidates only (`NOV1ST26`, `0123CALL`) | apostrophe and `;` join in candidates |

Still sent on the merged base, so design 4.2 and R6 are still needed: O6 `Claim (202) 555-0123`, O6u
`Seen (202) 555-0123`, O7u `Seen 202.555.0123` (own claim), O10 `Claim +1 [CLAIM_1]`. X5 `Also claim (202) 555-0198`
is still not offered whole (`)` never joins), and X7 `900-55-1234-01` is not offered as `90055123401` (four tokens). Both
are as the design says; R6 offers them.

**Time** (redaction plus self-check, merged base's code, 100 kB, median of 3 in this container): phones back to back
111 ms, SSNs back to back 93 ms, `202 555 0123 ` chains 86 ms, a 100 k digit run 93 ms, `5-` 107 ms, **`5<ZWSP>` 989 ms**,
nine-digit runs 145 ms, `Phone ` before digits 140 ms, `5⏎    ` 114 ms, `5--⏎  ` 105 ms, `$150.00 2026-11-01` 180 ms;
the existing slash-dates letter 417 ms and dates-with-a-claim letter 329 ms. 871faff9 gives about the same (`5<ZWSP>`
1,033 ms). See A12.

## 6. Line map (merged base, `packages/model-gateway/src/redact.ts`)

| Name | Line | | Name | Line |
|---|---|---|---|---|
| `BEFORE` / `AFTER` | 85-86 | | `LABEL_END` / `LABEL_HEAD` | 575 / 576 |
| `EARLIEST_/LATEST_WRITTEN_YEAR`, `plausibleYear`, `years` | 109-118 | | `IDENTIFIER_LABEL` | 583 |
| `DATE_SEPARATOR` | 135 | | `LINE_OR_SENTENCE_START` | 591 |
| `DATE_PATTERNS` | 152 | | `ANY_IDENTIFIER_LABEL` | 600 |
| `BIRTH_LABEL` | 194 | | `GLUED_LABEL` | 608 |
| `datesIn` | 210 | | `labelsBefore` / `labelFor` / `anyLabelAt` | 630 / 670 / 676 |
| `VANISHED` / `BARRIER` / `PLACEHOLDER` | 245 / 252 / 254 | | `Found` / `matchesIn` | 678 / 688 |
| `fold` | 259 | | `firstIndex` | 857 |
| `viewOf` | 292 | | `RANK` / `PLACEHOLDERS` / `merge` | 886 / 887 / 894 |
| `inNormal` | 326 | | `letterSubject` | 908 |
| `NUMBER_JOINERS` / `LINE_BREAK` / `GAP` | 348 / 350 / 353 | | `redactionSpans` / `redactLetter` | 931 / 936 |
| `compactFolded` | 378 | | `masked` / `holdsIdentifier` / `holdsNameOrNumber` | 953 / 956 / 965 |
| `Kind` / `Form` (`labeled` :397) | 380 / 382 | | `identifierTokenRuns` | 981 |
| `Subject` / `formsOf` | 450 / 459 | | `letterJoins` / `labeledDigitsJoin` / `unglued` | 1012 / 1024 / 1038 |
| `isAmount` / `writtenAsDate` | 538 / 546 | | `identifierCandidates` | 1053 |

Other files: denial-letter.ts as at 871faff9 (see section 1); redact.property.test.ts `PARTS` :30, `NUMBER_JOINERS` :92,
`EXACT` :266, MOD-13 `describe` :391, MOD-14 `PLACEHOLDERS` :898 and `describe` :900; redact.test.ts N6 property :167-205,
pinned writings :207-259; test-matrix.md MOD-14 :262, placeholder note :275-276; matrix.ts MOD-14 :509; registry.ts
MOD-14 :735; ADR 0054 Status :3-8, #80 residuals :427-434, last amendment :457; ADR 0070 N6 :1327; reconciliation-001
last `Ruled by` :665; phi-guard shapes :42-46; watched-paths.txt redact.ts :405, denial-letter.ts :386,
letter-records.ts :170.
