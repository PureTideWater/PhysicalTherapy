# redact-ssn-phone: build (design section 13, steps 1-9)

Built 2026-11-04/05 on `co-001/redact-ssn-phone` (/home/user/redact-ssn-phone), cut from claude/build-platform 00fd2906.
Three commits, not pushed: **9c9b1768** (model-gateway code and tests), **77f5f1c8** (synth, test matrix, MOD-15/16
`expected.json`), **88aaa649** (docs). Working tree clean. Synthetic twins only (SSNs 9xx, phones NPA-555-01xx). No
migration, no new file of code, no ADR, engine and ledger untouched, `index.ts` unchanged (`redactLetterForScreen`
not exported). Progress log: `.../ssn/progress/build.md`; fail-first list: `.../ssn/progress/base-run-fail-first.txt`.

## What was built (packages/model-gateway/src/redact.ts)
- **Digits view (R3, A5):** `viewOf(normal, invisible, digits)`; every `\p{Nd}` read as its value (`digitValue`).
- **Patterns (3.1-3.3, R1, R2, R4, R12, A1):** `SHAPED_PATTERNS` (SSN 3-2-4 with HICN suffix; masked `X * # _ • ●`, glued
  after `SSN`; phone `AAA EEE LLLL` with `+1`/`1` prefix and extension; `(AAA) EEE-LLLL`; `+` and ten) and
  `BARE_PATTERNS` (nine, ten with optional `1`, each plain and wrapped; `*****1234` after an SSN label; labeled local
  seven). Gaps: dashes (1-2, spaces or a wrapped line around), 1-3 spaces/tabs, a wrapped line, a period, one shape
  joiner (A1: `_ | \ ' ' ʼ ʹ ˊ ′ ‵ ` ~ · ‧ ∙ ⋅ ・ •`), an invisible run. R1a (period/joiner never with white space),
  R1b (cents and decimal-point guards only on a spaced match; currency guard on all) checked per match in code. Run in
  `matchesIn`, last, on the join and space readings; `Subject.patterns` true only in `letterSubject`.
- **Labels and keep-nouns (R5, A7, A8):** `labelWindow` (64 back, stops at a found match, BARRIER, digit, second
  break; words within 24) and `decideBare` (keep-noun names only through `CONNECTORS`, one comma, no sentence end but
  `NO./NBR./NUM./REF.`; NPI-Luhn ten and TIN/EIN/TAX ID nine always kept; nearer SSN/phone label decides over a
  keep-noun; `MEDICARE` nines only).
- **Ranks and own identifiers (4.1-4.3, R6, R10a):** `RANK` adds ssn 4, phone 5; `PLACEHOLDER` gains SSN|PHONE; a
  pattern match whose whole/core/joined-token compact is the call's own takes its kind over that token (`ownNumbers`,
  `tokenBeside`); `merge` R6b (own match strictly inside another number's pattern span lends no rank).
  `redactLetterForScreen` returns the candidates (sent text runs, own-only-replaced text runs, every non-own match's
  compacts; the call's own compacts filtered out).
- **Survivor scan (R7, A2, A3):** `survivorIn`/`survivorLeft` on the masked text's digits view, drop and space
  readings: barriers (placeholders, whole separated dates with a reading, amounts not joined to a group, keep-noun kept
  nines/tens), chains over `SCAN_GAP`, refusal per R7.3. `holdsIdentifier` = matcher || scan; refusal stays
  `identifier_left` (fixed sentence, no number).
- **denial-letter.ts:** `LetterContext.candidates`; `prepare` uses `redactLetterForScreen`; `screen` reads
  `context.candidates`; R10b (`ZZ-[SSN]` is `unknown_claim`); header and `OtherPatientCheck` comments.

## Departures from the design / step 0, each with its reason
1. **N6 property (A4):** expectation is `matcher === (letterReads || labeledReads || patterned)`, `patterned` =
   `holdsIdentifier` of the same text with no identifier, plus a one-way generator-side check (digits-only 3-2-4/3-3-4
   over dash/space/invisible ⇒ patterned) and the pinned rows `Also 202.555.0123`, `Also 900123456*1`. A full
   generator-side oracle was not written: the property's groups mix letters and digits, which touch patterns and the
   scan, so it would re-implement the scan.
2. **Dash gap with white space counts as spaced** (stricter than R1a's wording): `555.012 - 3456` is not read and is
   refused by the scan; protects amounts.
3. **R2(c) widened (found by the 60-seed runs, both real leaks or mis-spans):** `wrappedAcross` applies to shaped
   matches with an in-group wrap too; a wrapped match is not taken when another found match runs over its ends or a
   digit across a break beside it is held by no found match; wrapped bare forms read on the join reading only. Cost,
   pinned and in the ADR: two numbers each wrapped inside a group on adjacent lines are refused by the scan.
4. **Own lookup (4.2) before the bare decision:** the call's own number takes its placeholder over a prefix or
   extension whatever the words before it.
5. **Prefix `1` must stand as a word** (a HICN's `B1` was read as a country prefix and merged an SSN into a claim span).
6. **Join-view digit boundaries kept strict** (Appendix A). A relaxed boundary was tried and reverted (it chopped
   `5<ZWSP>` runs into `[SSN]`). Recorded residual: a number after a digit+invisible that also holds an invisible inside
   a group is read on neither reading and is refused by the scan (named row).
7. **`123-456-7890`** (area 1, R11's "other way"): not redacted; the scan refuses it as a ten-digit chain of short
   groups (design R7 as written). Test pins it so; ADR residual records it.
8. **viewOf performance (A12):** it read `text.endsWith` on a concatenated string (quadratic on invisible runs:
   `5<ZWSP>` 100 kB 2.7 s); now an array join plus an ASCII fast path (checked equal for all 128 ASCII code points).

## Tests (each failing first)
- denial-letter.test.ts: ~190 named rows (S, P, O, X, K, D, N, C, Z, T, I, E, R, R1-R5, R12, A1, G, L) with sent text,
  no refusal and offered candidates; R6; 12 scan refusals (A2/A3 rows, the digit+invisible residual); 17 no-refusal
  rows; hand-made refusals and the glued name (fixed message, no digit); R10b; through the gateway, refused
  `more_than_one_patient` with `900551234` asked and nothing sent, and sent with `[SSN]` when the records hold none;
  11 new 100 kB time letters. **Failed first: 197 failed / 17 passed** on a no-op base (the 17 no-refusal guards pass
  on base, as they must); against base with a stub redactLetterForScreen the guard rows listed below pass too.
- redact.property.test.ts: MOD-15 (property, 400 runs; writers' forms; survivors; R14) and MOD-16 (kept letters with
  deadline/reference verification, 300; own identifiers, 300; another patient's, 300; unlabeled bare, 200); EXACT,
  PARTS, MOD-14 PLACEHOLDERS gain SSN/PHONE; both MOD-14 properties assert `redactLetterForScreen(...).candidates`.
- redact.test.ts: masking `[SSN]`/`[PHONE]`, narrative check (patterns off), phi-guard (A6: five flagged and redacted;
  `(202)555-0123` redacted and not flagged; `202.555 0123` refused; ICN runs sent); N6 as above.
- **Failed first** (these were written after the code): run against base 00fd2906's redact.ts/denial-letter.ts with a stub
  `redactLetterForScreen`: **129 failed / 254 passed**. Not every new test failed first (corrected in check round 1,
  finding corr-ssn-6): about 90 new rows pass on base by design, as non-regression guards: the keep rows S18, P16, P17,
  K1-K4, D1-D14, N1-N4, C1-C5, Z1-Z2, T1-T2, I1-I3, E1-E2, R1-R5, R1-1..6, R5-10..25 and R12-s1..3; the own-identifier
  rows O1-O14; the MOD-16 kept-letter property; and the narrative-check test. Their proof of reality is the mutant runs:
  keep-noun off fails 18, NPI Luhn off fails 4 (the reviewer's mutants; survivor scan off 16, R6b off 1, R10b off 2,
  wrappedAcross off 1, prefix-1 boundary off 1); the currency guard had none until check round 1 (corr-ssn-3).
- **60 seeds** (20261104 + 7919·i), final run of every property in both files: **63/63 passed** (3144 s). Earlier runs
  found the three defects in departures 3 and 5's neighbourhood; each fixed and pinned.
- Probe re-run (step 0's 182 rows): every redact row redacted, keep rows byte-identical, O rows own placeholder, X rows
  offered, R7-1..4 refused, R7-5..7 redacted (A1), G3 refused.
- Timing, 100 kB, redaction + self-check (scratch build): 250-550 ms most shapes, `5<ZWSP>` ~0.34 s (was ~1 s at
  00fd2906), wrapped-line shapes ~0.8-1.0 s; in vitest the time tests take 0.36-1.6 s against the 3 s budget.

## Checks
pnpm typecheck passed (22 projects); pnpm lint passed (0 errors, after replacing `Number()` and one useless
assignment); lint:copy, lint:logs, verify-content pass; `vitest --project unit packages/model-gateway
apps/worker/src/models`: 835 passed; `pnpm --filter @tp/model-gateway eval`: gate passed, baseline not moved;
`pnpm synth --all` wrote only fixtures/synthetic/MOD-15/expected.json and MOD-16/expected.json (metadata, `files: []`);
check:fixtures passes; `watched.ts --write`: no change. Not run here: pnpm test:db, test:golden, test:e2e (no db or e2e
path changed; letter-records.ts changed in a comment only).

## Docs
PRD 14 sentence (ruling, who and when); ADR 0054 Status line and "Amendment (`co-001/redact-ssn-phone`, 2026-11-04)"
(ruling word for word, SSN/phone no longer residuals, scope, patterns, labels, what stays, ranks, screen, scan, time,
no prompt version, tests, "Still not covered" with addresses kept); #80's residual sentence left as decided; ADR 0070 N6
dated bullet; reconciliation-001 "Ruled by" paragraph; matrix rows MOD-15/16 and the note; letter-records.ts header.
ADR 0088 stays released. No runbook is named by the design.
