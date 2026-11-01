# Lane B: a payer letter's Social Security and phone numbers, redacted by pattern (`co-001/redact-ssn-phone`)

Written 2026-11-01 by the Lane B item session session_01FcouKP1U2GGDFhhZT9CaUV (design stage), from the probe of the same
day (scratchpad `probe/probe-report.md`, read-only worktree at 871faff9, synthetic twins only) and a prototype of the
patterns below run over the probe's rows and crafted letters (scratchpad `designer/proto.test.ts`, `proto-table.tsv`,
`proto-timing.tsv`; not repository code).
Base: the build is cut from a `claude/build-platform` head that contains #75's merge (`co-001/contract-phi-check`, which
contains #80); every line number below is #75's head, 871faff9. Reserved: ADR 0088 (**released**: this design amends ADR
0054, section 11); test matrix MOD-15 and MOD-16; `packages/synth` `matrix.ts` entries and `registry.ts` entries
`none(10, ...)` in the existing module 9 (MOD; the `10` is `completesIn`). No migration, no schema, no new file of code,
no prompt version, nothing a person sees (the letter reader has no screen yet; the refusal reuses an existing code).
Reviewed the same day (one reviewer, a completeness critic, each finding verified through a security lens and a
correctness lens; section 18) and revised: **section 17 is the rule set the build follows** wherever it differs from
sections 3 to 13 and Appendix A, and each superseded passage carries a pointer to it. The revised rules were run as a
second prototype (scratch `apply/refined.mjs`, `run.mjs`, `more.mjs`: 66 named rows from both review tables and both
verifications, none wrong; the crafted 100 kB letters at 17 to 381 ms with the survivor scan).

## 1. The ruling, and what happens today

**The ruling.** The founder (Tyler Williams) ruled on 2026-11-01 that a payer letter has its Social Security numbers and
phone numbers redacted **by pattern** before the model reads it (`readDenialLetter`), as a PRD 14 "PHI minimization"
requirement. The co-founder relayed it to Lane A (session_01TrKDxeLbxVo7t7zwRXFzrg, commit 18bbe0e9, 14:04 UTC) and
confirmed it in session_01FcouKNNHsdecRMzfTs7XwW at about 14:40 UTC. Addresses stay a residual: the ruling does not cover
them. Today PRD 14 (PRD.md:575) lists only names, dates of birth, member IDs and claim numbers, and ADR 0054:372-373 lists
"addresses, phone numbers and Social Security numbers, which PRD 14 does not list for redaction" as residuals.

**Today (probed on 871faff9).** `redact.ts` redacts only the call's own identifiers (`formsOf`, :427; `matchesIn`, :521).

| Class (probe rows) | Letter (synthetic) | Sent today | Self-check | Screen |
|---|---|---|---|---|
| SSN, any writing (S1-S20: dashes of every kind, spaces, invisible characters inside, full-width digits, labeled bare nine, HICN) | `SSN 900-12-3456 on file.` | unchanged | passes | offered `900123456` |
| Phone, any writing (P1-P15, P17: parentheses, dots, `+1`, `1-800`, extensions, labeled bare ten, TTY line) | `Call (555) 012-3456 today.` | unchanged | passes | `5550123456` **not** offered (`)` never joins) |
| The call's own claim, phone-shaped with `(` `)` or `.` (O6, O7; a MOD-13 gap) | claim `555-012-3456`, letter `Claim (555) 012-3456` | unchanged | **passes** | n/a |
| The call's own member or claim in other SSN or phone shapes (O1-O5, O8-O10) | member `900-12-3456`, letter `Member ID 900 12 3456` | `[MEMBER_ID]` | passes | n/a |
| Another patient's ID, SSN- or phone-shaped (X1-X5) | `Also claim 555-019-8765.` | unchanged | passes | offered, but X5 `(555) 019-8765` is not |
| What must stay (K, D, N, C, Z, T, I, E, R rows: amounts, every `datesIn` form, NPIs, codes, ZIPs, TINs, ICNs, traces, references) | `Rendering NPI 1234567893.` | unchanged | passes | as today |

A whole synthetic letter through `denialLetterSpec.prepare` is sent as `... Member ID [MEMBER_ID], SSN 900-12-3456 ...
Questions: (555) 012-3456, TTY 711 ...` (probe `extras.json`). Nothing that must stay is altered today: MOD-16's
baseline is "byte-identical after NFKC".

## 2. Scope: which callers get the patterns, and why

| Gateway purpose | Text sent to a model | SSN and phone patterns | Why |
|---|---|---|---|
| `readDenialLetter` (`functions/denial-letter.ts`) | a payer letter, PHI | **yes** (redacted, refused if one survives) | the ruling; the letter is the only PHI document a model reads |
| `proposeContractTerms` (`functions/contract-terms.ts`) | contract and exhibit pages, sent as stored | no | PRD 14: contracts carry no PHI; a contract's phone numbers are the payer's and its parties'; the verifier holds every quote to the stored page (`quoteOnPage`), so a changed page would reject true quotes. A contract that names a patient is refused by its own screen (MOD-12) |
| `draftPacketNarrative` (`functions/narrative.ts`, `mentionsIdentifier` → `holdsNameOrNumber`, redact.ts:766) | code-built pattern-level facts, no identifiers | no (`patterns: false`) | the facts hold clause quotes, amounts, codes and references by design; a payer's phone in a clause quote would refuse every narrative. Its check stays the case's own identifiers |
| `suggestEvidenceRequests` (`functions/evidence-requests.ts`) | reason codes, counts, procedure codes | no | no document text |

**A payer letter misfiled as a contract (review C3).** PRD 14 (PRD.md:575) says a contract that names a patient is most
often a misfiled payer letter or EOB. The contract screen (MOD-12) refuses a page only when it holds a member ID, payer
claim number or patient control number the practice holds, so a misfiled letter for a patient not yet in the records,
or one that names a person only by an SSN, reaches `proposeContractTerms` with its SSNs and phone numbers as written.
This PR does not redact contract pages (the reasons above stand: a changed page would reject true quotes, and a
contract's phones are the payer's). The route is recorded in the ADR amendment's "Still not covered" list, decided for
the co-founder the safer way (15.16) and proposed as its own item (16.8): the contract screen **refuses** (never
redacts) a page holding a dash-, period- or invisible-joined 3-2-4 SSN, a masked SSN or an SSN-labeled nine, never a
white-space-joined 3-2-4 (fee-schedule rows such as `250 10 1500` would refuse real contracts) and never a phone.

So the patterns are a property of the letter's subject only: `Subject` gains `patterns: boolean`, true in `letterSubject`
(redact.ts:709) and false in `holdsNameOrNumber` (:767). `redactLetter`, `redactionSpans` and `holdsIdentifier` get them;
`holdsNameOrNumber` and every contract-screen function (`identifierRuns`, `someIdentifierRun`, `screenIdentifier`) do not.

## 3. The patterns

### 3.1 Where they run: the same matcher, the same view, the same found list

`matchesIn` (:521) already reads names and numbers on `viewOf(normal, 'join')` (:541): NFKC text, each code point folded
(`fold`, :246: NFD, marks dropped, full case fold, so letters are upper case), a blank a space, and a run of invisible
characters one VANISHED U+00AD (:232) that is neither a letter nor a digit. The patterns run on **that view, inside
`matchesIn`**, last (after the forms loop and the initials, whose ranges end a label's window, 3.4), and push into
the **same `found` list**, each match mapped
back with `inNormal` (:313). Nothing is scanned twice and nothing is replaced before every match is found, so #80's
one-pass rule holds: each pattern is one linear `matchAll` over the view, as each form already is. NFKC has made
full-width digits ASCII; every other decimal digit (Arabic-Indic, Devanagari) is read by `\p{Nd}`, so the patterns
redact those too (section 15, item 5).

Building blocks (written over the folded view; Appendix A gives them as code):

- **D** = `\p{Nd}`; a **group of n digits** = `D(?:VANISHED?D){n-1}`: digits with at most one invisible run between two
  of them (probe S10-S13, P15: `900-1<ZWSP>2-34<ZWSP>56`).
- **DASH** = `[\p{Pd}−⁃]`: every dash, the minus sign and the hyphen bullet (as `NUMBER_JOINERS`, :327).
- **SEP**, a separator between two groups, never empty: an optional VANISHED, then one of: up to two white-space
  characters, a dash and up to two white-space characters; one to three white-space characters; or one period; then an
  optional VANISHED. Or a VANISHED alone. White space includes one line break (`SSN 900-12-⏎3456`, PDF wrapping). **Never
  a slash** (dates write `11/01/2026`), **never a comma** (amounts write `1,234,567`), never an underscore, colon or `#`.
- **Boundaries.** No digit immediately before or after, an invisible run between included: `(?<!D VANISHED?)` and
  `(?!VANISHED? D)`. The rule before applies to a match that starts with a digit; a match that starts with `(` or `+`
  is already separated by it and needs none (`Claim 5550123456(555) 019-8765` still finds the phone). Unlike
  `BEFORE`/`AFTER` (:83-84), which forbid a letter too, a **letter may touch** a pattern match:
  `Tel555-012-3456`, `SSN900-12-3456`, `555-012-3456x123` are redacted (a lost space in PDF text must not send a phone).
  The digit rule alone keeps every pattern from matching inside a longer unseparated run of digits (an 11- to 14-digit
  ICN, a 100 kB digit run). It does **not** keep a separated chain out (review R8: `Ref 1234-555-012-3456` reads its last
  ten as `[PHONE]`; recorded with section 15, item 3). Section 7 shows what the letter rule changes in the completeness
  argument (a refusal, never a leak). **Superseded in part by section 17** (R1-R4: the period rule, the amount guards
  on a shaped match with a white-space gap, line breaks with indentation, digit values, and the space reading).

**The repository's other SSN and phone shapes (review C4).** `packages/observability/src/phi-guard.ts:41-45` already
defines "an SSN shape" (`\d{3}-\d{2}-\d{4}`), "a phone number shape" (`\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}`) and "a run of
nine or more digits", used by `textPhiFindings` (ADR 0053; ADR 0062, decision 11) to refuse a short field or log value
that looks like PHI. The letter matcher does not reuse them, because the job differs: phi-guard refuses a short string
outright, so a wide net costs nothing; the letter matcher **redacts** inside a folded letter that must keep amounts,
dates, NPIs and references, and must read `+1`, extensions, invisible characters, line breaks, other-script digits and
mixed separators that phi-guard's ASCII shapes miss. The two are meant to differ in three places, recorded so nobody
"aligns" them by accident: phi-guard takes an area code starting 0 or 1 (`123-456-7890`, which the letter keeps as a
reference), takes `[-. ]` per gap independently (the letter never mixes a period with white space, R1), and refuses any
run of nine or more digits (the letter keeps an 11- to 14-digit ICN and a keep-noun-named nine or ten). A named test pins
the one direction that must hold (section 17, R11): every phi-guard SSN example, and every phi-guard phone example whose
area code starts 2-9, is redacted by `redactLetter`. Aligning phi-guard with the letter's NANP area rule and mixed
separators is a proposal in its own item (16.9).

### 3.2 Social Security numbers (kind `ssn`, placeholder `[SSN]`)

1. **Shaped**: a group of 3, SEP, a group of 2, SEP, a group of 4 (`900-12-3456`, `900 12 3456`, `900.12.3456`,
   `900–12–3456`, `900‑12‑3456` (NFKC makes U+2011 U+2010), `900−12−3456`, `900<ZWSP>12<ZWSP>3456`, `９００-１２-３４５６`,
   `٩٠٠-١٢-٣٤٥٦`). **No SSA validity rule** (area 000, 666 and 900-999 are never issued as SSNs, but 900-999 is the ITIN
   range, and every synthetic twin uses it): the shape decides.
2. **Masked**: three of `X * • ●`, SEP, two of them, SEP, a group of 4 (`XXX-XX-3456`, `***-**-3456`), preceded by no
   letter or digit. The last four of an SSN are themselves identifying under many state rules and cost the task nothing.
3. **Labeled bare nine**: a group of 9 (`900123456`, `9001<ZWSP>23456`) whose nearest label (section 3.4) is an SSN label.
4. **Unlabeled bare nine**: a group of 9 with no label and no keep-noun nearest (section 3.4): redacted as `[SSN]`.
5. **HICN**: any of 1, 3 or 4 followed by a beneficiary suffix, a letter and an optional letter or digit, attached or
   after one dash, ending a word (`900123456A`, `900-12-3456-A`, `900-12-3456B1`), is one `[SSN]` span: a HICN is the
   SSN with a suffix. The suffix is never taken across a space (`900-12-3456 Approved` keeps `Approved`).
6. **MBI** (the Medicare Beneficiary Identifier, 11 characters, `1EG4-TE5-MK73`): **not** a pattern here. It is neither an
   SSN nor a phone number; it is a member ID, which the matcher already redacts when the records hold it, and which the
   screen offers whole when it is another patient's (4-3-4 is three tokens). Section 15, item 4.

### 3.3 Phone numbers (kind `phone`, placeholder `[PHONE]`)

North American numbers. **Area code** `[2-9]DD` (no NANP area code starts with 0 or 1, so this costs no phone and keeps
`1234567893`-style NPIs, `1900123456` EFT traces and `123-456-7890`-style references out); **exchange any three digits**
(the NANP's `[2-9]` exchange rule would also be free of real phones, but it would let the call's own claim `555-012-3456`
written `(555) 012-3456` through, probe O6; section 4.2).

1. **Shaped**:
   - `(AAA) EEE-LLLL`: `(`, optional space, area, optional space, `)`, up to two spaces and an optional dash, the
     exchange, an optional SEP, the line (`(555) 012-3456`, `(555)012-3456`, `(555)-012-3456`, `(555) 0123456`);
   - `AAA SEP EEE SEP LLLL` (`555-012-3456`, `555.012.3456`, `555 012 3456`, `555–012–3456`, `555-01<ZWSP>2-3456`);
   - with a country prefix inside the span: `+1`, `+ 1` or `1`, then an optional SEP (`+1 555 012 3456`, `1-800-555-0100`,
     `1 (800) 555-0100`, `+1(555)012-3456`);
   - `+` and ten digits, with or without the 1 (`+15550123456`, `+1 5550123456`).
2. **Extension, inside the span**: up to two spaces and an optional `,` or `;`, then `EXT`, `EXTENSION`, `X` or `#`, an
   optional `.` or `:`, up to two spaces and one to six digits (`x123`, `ext. 45`, `extension 6789`, `#12`, `, ext: 12`).
   The extension alone is not identifying, but leaving `x123` after `[PHONE]` costs the task nothing to remove.
3. **Labeled bare ten** (any first digit, since the label says what it is) and **labeled `1` plus ten**: a group of 10,
   optionally after `1` and an optional SEP, whose nearest label is a phone label (`Phone: 5550123456`, `Fax 5550123457`,
   `Phone (toll-free): 5550123456`, `Phone⏎5550123456`).
4. **Labeled seven-digit local number**: a group of 3, SEP, a group of 4, preceded by white space, `(`, `:`, an invisible
   run or the start, with a phone label nearest (`Call 555-0100`). Never after a letter-and-dash run, so
   `SYN-APL-555-0123` is never read as a phone, however near a phone label (probe R2, prototype L16).
5. **Unlabeled bare ten**: a group of 10 starting `[3-9]`, or starting `2` and **not** a valid NPI (the Luhn check over
   the `80840` prefix), with no label and no keep-noun nearest: `[PHONE]`. A ten-digit number starting 0 or 1 is never a
   NANP phone and is kept (NPIs `1xxx`, EFT traces).
6. **Kept**: a three-digit service code (`711`, TTY relay); a vanity number with letters (`1-800-555-SYNP`; a payer's,
   never a patient's); an 11-digit or longer bare run (an ICN), unless after `+` or a phone label.

### 3.4 Labels and keep-nouns: what decides a bare number

A bare nine- or ten-digit number (3.2.3-4, 3.3.3-5) is decided by the **nearest** label word or noun before it, found
the way `BIRTH_LABEL` is (:181, read on the 40 view characters before a date, :530): on the 64 view characters before the
number, the last of these words, with at most 24 characters between it and the number, no digit among them and at most
one line break. **The window ends at the last match already found before the number** (the call's own names, numbers,
initials and dates of birth, and the shaped SSN and phone matches, which `matchesIn` finds first; the bare patterns run
last) **and at a BARRIER**: a label inside a span never counts, and a label never reaches across one. In the masked text
the self-check reads, each span is a BARRIER, so both read exactly the same characters between the last span and the
number (section 7, step 3). A patient named `CLAIM` or `CALL` therefore never makes a bare number kept or labeled, in
the letter or in the self-check.

- **SSN labels**: `SSN`, `S.S.N.`, `SS#`, `SS NO`, `SOC SEC`, `SOCIAL SECURITY`, `HIC`, `HICN`, `MEDICARE`.
- **Phone labels**: `PHONE`, `PH`, `TEL`, `TELEPHONE`, `FAX`, `FACSIMILE`, `CALL`, `CALLING`, `CALLED`, `TTY`, `TDD`,
  `TOLL-FREE`, `TOLL FREE`, `CELL`, `MOBILE`, `CONTACT`.
- **Keep-nouns** (a number the letter itself names as something that is not a person's SSN or phone):
  `CLAIM`, `CLAIMS`, `ICN`, `DCN`, `REF`, `REFERENCE`, `APPEAL`, `CASE`, `NPI`, `TIN`, `EIN`, `TAX ID`, `CHECK`, `EFT`,
  `TRACE`, `CONTROL`, `INVOICE`, `AUTH`, `AUTHORIZATION`, `ZIP`, `GROUP`.

The nearest decides: an SSN label makes a bare nine `[SSN]`; a phone label makes a bare ten (or `1` plus ten, or a
seven-digit local) `[PHONE]`; a keep-noun keeps it as written; no word in reach leaves it to rules 3.2.4 and 3.3.5.
(**Superseded by section 17, R5**: a keep-noun keeps a number only when it names it, with nothing but connectors
between them; a label of the other kind never keeps a number; an SSN or phone label in the window wins over a keep-noun,
except that a Luhn-valid ten named by `NPI` and a nine named by `TIN`, `EIN` or `TAX ID` are always kept; and `MEDICARE`
labels a nine, never a ten. So the `claim 5550123456` example below is now `[PHONE]`.) So
`Please call regarding claim 5550123456` keeps the claim (the nearest word is `CLAIM`), `TIN 900123457` and
`check 000555012` are kept, `Rendering NPI 2345678900` is kept, `SSN/Member ID 900123456` is `[SSN]` (MEMBER is no
keep-noun: a member ID is a person's identifier, and some legacy member IDs are SSNs). `MEMBER`, `ID`, `ACCOUNT` and
`POLICY` are deliberately not keep-nouns: each names a person's identifier, which is redacted (the call's own) or
screened (another's), never needed by the task as written. The words are matched on the folded view with ASCII word
boundaries (the view is upper case; `\b` sees VANISHED as a boundary).

**Shaped numbers (3.2.1, 3.2.2, 3.2.5, 3.3.1) ignore labels and keep-nouns**: a 3-2-4 or phone-shaped number is
redacted wherever it stands, `Reference 555-019-8765` included (section 15, item 3).

### 3.5 Guards: what keeps each must-stay class from matching

| Class | Example (probe row) | Why no pattern takes it |
|---|---|---|
| Amounts | `$1,234.56`, `1,234,567.00`, `$123-45`, `$900,123,456.00` (K1-K4) | a comma is never a SEP; no amount has 3-2-4 or 3-3-4 groups; a bare nine or ten is never taken right after a currency sign (`\p{Sc}` and an optional space) or beside a decimal point or comma with a digit (`900123456.00`, `1,900123456`; prototype L23) |
| Dates, every `datesIn` form | `2026-11-01`, `11/01/2026`, `11-01-2026`, `01.11.2026`, `2026 11 01`, `11 01 2026`, `20261101`, `110126`, `November 1, 2026`, `Nov 1st '26`, `01-NOV-26`, `11/30/26` (D1-D12) | `datesIn`'s numeric forms are 4-2-2 or 2-2-4 (or 1-digit parts), compact forms 8 or 6 digits; no SEP is a slash; none has a 3-2-4 or 3-3-4 shape or 9 or 10 bare digits. A date of birth is still `[DATE_OF_BIRTH]` by its own rule |
| Claim numbers (the call's) | `Claim 5550123456` (O8) | the call's own forms match first; a pattern span equal to one takes its placeholder (4.2) |
| NPIs | `NPI 1234567893`, `NPI 2345678900`, `Provider 1234567893` (N1-N3) | bare and ten digits: a `1xxx` NPI is no NANP area code; a `2xxx` NPI is kept by the `NPI` keep-noun or, unlabeled, by its Luhn check digit |
| Codes | CPT `97110`, HCPCS `G0283`, CARC `CO-45`, RARC `N130`, ICD-10 `M54.50`, `97110-GP-59` (C1-C5) | five characters or fewer per group, no 3-2-4 or 3-3-4 shape |
| ZIP and ZIP+4 | `90001`, `90001-1234` (Z1, Z2) | 5 and 5-4 shapes. A ZIP+4 written as nine bare digits with no `ZIP` word nearest (Z3 `CA 900011234`) is `[SSN]`: an address part, already a residual of PHI, so redacting it costs nothing |
| TIN / EIN | `90-0123456`, `TIN 900123457` (T1, T2) | 2-7 shape; bare nine kept by `TIN`/`EIN`/`TAX ID`. The dashed TIN has the same compact digits as `900-12-3456`, which is why every rule is by group shape, never by compact digits |
| ICNs | 11 to 14 digits (I1-I3) | the digit boundary: no pattern matches inside a longer digit run; 11+ bare is never a phone without `+` or a phone label |
| EFT traces, checks | `1900123456`, `check 000555012`, `TRN*1*SYN20261101*1900000001~` (E1, E2) | a ten-digit trace starts with 1 (no NANP area); `CHECK`, `EFT`, `TRACE` are keep-nouns |
| References | `2026-1101-0001`, `SYN-APL-555-0123`, `Group 900123 plan 55501`, `REF-SYN-77` (R1-R3) | 4-4-4, letter-dash-3-4 (never a local number), six and five digits |
| Times and local numbers without a label | `Hours 8:00-5:00, 555-0100 local` (R4) | a local number needs a phone label nearest |

(**Amended by section 17**: R1 replaces the amount guards for shaped matches, R5 the keep-noun rule; the rows above hold
under both, and section 17 lists the rows the review added.)

### 3.6 The table of cases (what is sent; the prototype's reading of every probe row)

Patient A: `ZEPHYRA Q VANTREE`, member `ZZ1234567`, claim `SYNCLAIM0001`. Patient B (O rows): member `900-12-3456`,
claims `555-012-3456` ([CLAIM_1]) and `9001234567` ([CLAIM_2]). Other patient (X rows): member `900-55-1234`, claim
`5550198765`.

| Row | Letter | Sent | Screen offered |
|---|---|---|---|
| S1-S14 | `Subscriber 900-12-3456 on file.` in every dash, spacing, invisible and digit form | `Subscriber [SSN] on file.` | `900123456` |
| S15-S17 | `SSN: 900123456`, `Social Security No. 900123456`, `SS#900123456` | `SSN: [SSN]` ... | `900123456` |
| S18 | `Reference 900123456 applies.` | unchanged (keep-noun) | `900123456` (as today) |
| S19, S20 | `HICN 900123456A`, `Medicare no. 900-12-3456-A` | `HICN [SSN]`, `Medicare no. [SSN]` | `900123456A`, `900123456` |
| S21 | `SSN ending in 3456, xxx-xx-3456` | `SSN ending in 3456, [SSN]` | (the last four alone: residual, 15.6) |
| P1-P9, P13-P15 | `Call (555) 012-3456 today.`, dotted, `+1`, `1-800-555-0100`, `x123`, `ext. 45`, `extension 6789`, `#12`, en dash, full width, ZWSP | `Call [PHONE] today.` | `5550123456` (and with prefix or extension) |
| P10, P11 | `Phone: 5550123456`, `Fax 5550123457` | `Phone: [PHONE]`, `Fax [PHONE]` | the ten digits |
| P12 | `TTY users call 711 or 1-800-555-0199 (TTY).` | `TTY users call 711 or [PHONE] (TTY).` | `18005550199`, `8005550199` |
| P16 | `Call 1-800-555-SYNP.` | unchanged (vanity) | as today |
| P17 | `Reference 5550123456 applies.` | unchanged (keep-noun) | as today |
| O1-O4 | `Member ID 900-12-3456` / `900123456` / `900 12 3456` / `900–12–3456` (B's own member) | `Member ID [MEMBER_ID]` | never |
| O5-O8, O10 | `Claim 555-012-3456` / `(555) 012-3456` / `555.012.3456` / `5550123456` / `+1 555 012 3456` (B's own claim 1) | `Claim [CLAIM_1]` (O6, O7 fixed; O10 takes `+1` into the span) | never |
| O9 | `Claim 900-123-4567` (B's claim 2) | `Claim [CLAIM_2]` | never |
| X1 | `Also member 900-55-1234 (SYN OTHER).` | `Also member [SSN] (SYN OTHER).` | `900551234` → refused `more_than_one_patient` |
| X2 | `Also member 900551234.` | `Also member [SSN].` (no keep-noun) | `900551234` → refused |
| X3 | `Also claim 5550198765.` | unchanged (keep-noun) | `5550198765` → refused (as today) |
| X4, X5 | `Also claim 555-019-8765.`, `Also claim (555) 019-8765.` | `Also claim [PHONE].` | `5550198765` → refused (X5 newly) |
| K, D, N, C, Z1, Z2, T, I, E, R | every must-stay row | unchanged | as today |
| Z3 | `Los Synth, CA 900011234.` | `Los Synth, CA [SSN].` | `900011234` |
| glued | `Tel555-012-3456`, `SSN900-12-3456` | `Tel[PHONE]`, `SSN[SSN]` | the digits, and `TEL5550123456`, `SSN900123456` |
| glued to the patient's name | `RE: Vantree900-12-3456` | refused, `identifier_left` (section 6) | n/a |

## 4. Precedence, placeholders and the merge

### 4.1 Two kinds, ranked below the call's own

`Kind` (:354) becomes `OwnKind | PatternKind`, with `PatternKind = 'ssn' | 'phone'`. `Form.kind` stays `OwnKind` (a form
is the call's own). `RANK` (:687) becomes `{ claim: 0, member: 1, birth: 2, name: 3, ssn: 4, phone: 5 }`, and
`PLACEHOLDERS` (:688) gains `ssn: '[SSN]'` and `phone: '[PHONE]'`. `merge` (:695) is unchanged: it already fuses every
overlap into one span and picks the best rank, so a pattern span that overlaps any of the call's own matches (O1-O5,
O8-O10: the own form matches the same digits) becomes the call's placeholder, never `[SSN]` or `[PHONE]`, and the merged
span covers both (O10: `+1 555 012 3456` is one `[CLAIM_1]`, where today `+1 [CLAIM_1]` is sent).

Two placeholder words, not one: `[PHONE]` beside "call" and `[SSN]` beside "subscriber" tell the model what was there
without the value, and neither is a claim (the verifier rejects any bracketed claim reference that is not one of the
call's claims as `unknown_claim`, denial-letter.ts:143, so `[SSN]` or `[PHONE]` can never be cited as a claim).

### 4.2 A pattern span that is the call's own identifier takes its placeholder

`matchesIn` builds, from `formsOf(subject)`, a map from each claim and member form's `compact` (`Form.compact`, the
folded letters and digits) to its kind and claim, the lowest rank winning (a claim before a member, the lowest claim
first). Each pattern match is looked up by its compact forms: the whole match's (`compactFolded` of its view text: with
a prefix, suffix or extension), and its **core** (the nine SSN or ten phone digits, the capture group in Appendix A). On a
hit the match is pushed as that own kind (`claim` with its number, or `member`), not as `ssn`/`phone`. This closes probe
O6 and O7 for every SSN and phone shape: the call's own digits-only claim written `(555) 012-3456` or `555.012.3456`,
which its own form does not read (`(`, `)` and `.` join digits only next to a letter, :341), is `[CLAIM_1]` and the model
can still cite it. The general gap (any number with `)` or `.` between digits) stays a proposal (section 16).

### 4.3 The placeholder list, masking and counting

- `PLACEHOLDER` (:241) becomes `/\[(?:PATIENT_NAME|DATE_OF_BIRTH|MEMBER_ID|SSN|PHONE|CLAIM_([1-9]\d*))\]/g`. `masked`
  (:754) then turns `[SSN]` and `[PHONE]` into the BARRIER for `holdsIdentifier`, `holdsNameOrNumber` and
  `identifierCandidates`, exactly as it does the others: a patient named `PHONE` or `SSN` does not refuse every letter
  that holds the placeholder, and the placeholder's word never joins a neighbouring token in the screen's runs.
- **Uncorruptable.** Placeholders are written once, after every match is found on the letter (`unbracketed`, :729, has
  already made the letter's own `[` `]` parentheses), so no pass reads them: a letter that writes `[SSN]` itself sends
  `(SSN)`, which is never a placeholder.
- **Counted.** `replaced` counts every merged span, pattern spans included, so MOD-13's "every bracket is exact and
  counted" holds with `EXACT` (redact.property.test.ts:232) widened the same way.
- `redactionForms` (:718) is unchanged: it lists the call's forms, and no pattern is a form.

## 5. The one-patient screen (MOD-14 must still hold)

**The problem.** `denialLetterSpec.screen` asks the records about `identifierCandidates(prepared.context.text)`
(denial-letter.ts:233), and `context.text` is the sent text. Once `900-55-1234` is `[SSN]`, another patient's member ID
written that way is no longer in it, so MOD-14 would break (X1, X2, X4).

**The design: the redactor computes the screen's runs in the same call, from the same spans, and returns them in
memory.** (**Superseded in part by section 17**: R6 offers every pattern match that is not the call's own, whatever its
span's placeholder, and joins the token on either side; R10a keeps `Redacted` as it is and returns the candidates from a
module-internal `redactLetterForScreen`, so the block below describes that function's result, not `Redacted`.)
`Redacted` (:58) gains

```ts
/**
 * The runs the one-patient screen asks the practice's records about, as compact identifiers (compactIdentifier's form):
 * identifierCandidates of the sent text and of the letter with only the call's own identifiers replaced, and the
 * compact form of every Social Security or phone number redacted by pattern that is not the call's own (with its core
 * digits, and joined to the token written against it). PHI: kept in memory for the screen only; never sent, logged,
 * stored, put in an error or a job payload.
 */
readonly candidates: readonly string[];
```

computed by `redactLetter` as the union, sorted and deduplicated, of:
1. `identifierCandidates(sent)`: exactly what the screen is offered today, so for a letter with no pattern match nothing
   changes;
2. `identifierCandidates(screenText)`, where `screenText` is the NFKC letter with only the spans whose placeholder is the
   call's own replaced (the pattern-only spans left as written): every run today's tokenizer finds across or inside an
   SSN or phone shape, `SYN900-55-1234` → `SYN900551234` (three tokens) included;
3. for each span whose placeholder is `[SSN]` or `[PHONE]`, the compact form (`compactIdentifier`) of each pattern match
   in it, whole and core (`(555) 019-8765` → `5550198765`, which today's tokenizer never forms because `)` never joins;
   `1-800-555-0100` → `18005550100` and `8005550100`; `900-12-3456-A` → `900123456A` and `900123456`; a nine-digit number
   in four or more pieces → whole, which the three-token cap never forms), and joined to the token written against it
   when `letterJoins` (:802) would join them (`ZZ-555-019-8765` → `ZZ5550198765`, four tokens today), each kept by
   `identifierCandidates`' own rule (a digit, five characters or more).

`LetterContext` (denial-letter.ts:93) gains `candidates`; `prepare` passes `redacted.candidates`; `screen` becomes
`const { candidates } = prepared.context; if (candidates.length > 0 && (await input.otherPatients.holdsOtherPatient(candidates))) throw ...`
with the same code and message. `denial-letter.ts` stops importing `identifierCandidates`.

**Why both properties hold.** Nothing SSN- or phone-shaped reaches the model (section 7); another patient's identifier
written in such a shape is offered whole (item 3) and in every run today's tokenizer would form around it (item 2), and
every candidate offered today is still offered (item 1). The call's own identifiers are never offered: their spans are
masked in 1 and 2, and item 3 takes only spans whose placeholder is `[SSN]` or `[PHONE]`, which by 4.1-4.2 overlap none
of the call's matches. The stored side is unchanged: `otherPatientRecords` (apps/worker/src/packets/letter-records.ts:38)
compacts each stored member ID and claim number with `compactIdentifier` and compares by equality (:85), so
`900-55-1234` stored is `900551234` on both sides.

**No PHI on that path.** The candidates live in the prepared call's context, which the gateway passes only to `screen`
and `verify` (gateway.ts:273, :407) and never stores, logs or hashes (the idempotency key reads `inputHashes` only,
:261). The records check answers yes or no. A screen refusal is logged by the gateway as one line with `practice_id` and
`MODEL_INPUT_MORE_THAN_ONE_PATIENT` (gateway.ts:339), never the screen's message; the `InputRefusedError` message is the
fixed sentence it is today. `readDenialLetter` runs in the caller's process, so no job payload carries the input or the
candidates. `redactLetter` is exported (index.ts:208), so a field on its result type `Redacted` would carry the
candidates onto the package's public surface; R10a therefore keeps them off it (a module-internal
`redactLetterForScreen`, whose doc comment marks them PHI). The guarantee that no number reaches an error message rests
on the fixed literal sentences in `denial-letter.ts` and the named test `expect(message).not.toMatch(/\p{Nd}/u)` (10.1);
`pnpm lint:logs` (tools/lint-logs/scan.ts) checks the fields of log calls against the allowlist only, not thrown errors
(review C9).

Cost: two tokenizations instead of one, 7 to 55 ms each on a 100 kB letter (probe timings).

## 6. The self-check and the refusal

`holdsIdentifier` (:757) is `matchesIn(masked(text), letterSubject(...))`, and `letterSubject` now carries
`patterns: true`, so the same SSN and phone patterns run on the masked sent text: **any SSN or phone form that survives
refuses the letter**, with no new code path. (**Superseded in part by section 17, R7**: `holdsIdentifier` on the
letter path also runs an independently written survivor scan, because the patterns alone cannot refuse a form they
miss; same code, same sentence.) The refusal is the existing one, `identifier_left`, "the letter still holds
an identifier after redaction; it is not sent" (denial-letter.ts:223): a fixed sentence that names no number, no kind and
no count, which is what CLAUDE.md requires of an error message. A separate code (`pattern_left`) was considered and not
taken: it would tell an operator only which of two matchers fired on a guard that, by section 7, fires only on glued
text; no caller or UI reads the code yet (the letter reader has no screen and is behind `model.read_denial_letter`), and
the gateway does not log a `prepare` refusal (it reaches the caller as thrown). The worker's and web's future mapping of
`identifier_left` needs no new string.

## 7. Why it is complete

The output is the NFKC letter with each merged span replaced (`redactLetter`, :737). #80's argument (its design,
section 3) covers the call's own forms; for the patterns:

1. Every pattern match found on the letter lies inside a merged span, so none of its characters is sent.
2. A pattern match starts and ends on a digit, a letter (a HICN suffix, an extension word's digits), `(` or `+`, and has
   **no digit** beside it (an invisible run between included). Its neighbours may be letters (3.1).
3. In the masked sent text every placeholder is the BARRIER, which is no digit, no SEP character, no label letter and no
   VANISHED. A pattern match M in the masked text holds no BARRIER, so it lies inside one kept segment, whose characters
   are the letter's own. Its neighbours inside the segment are as in the letter; a neighbour at the segment's edge is a
   BARRIER where the letter had the last (or first) character of a span S. If that character is no digit, M's boundary
   reads the same in the letter, so M was a match of the letter, inside a span: a contradiction. If it is a digit, then
   M's first (or last) character is kept beside S: an own span allows no letter or digit beside it, and a pattern span no
   digit, so M's edge character is not a digit; M then starts with `(` or `+` (no digit rule applies there, 3.1) or is a
   masked form or ends with a HICN suffix letter, and in each case the same match, or its form without the suffix, was a
   match of the letter (the suffix is optional and a letter ends no digit run). Bare matches also read the label window
   (3.4), which ends at the last span and at a BARRIER, so it reads the same characters in the letter and in the masked
   text. Hence no SSN or phone pattern matches the masked sent text unless the letter held one that was not found:
   `holdsIdentifier` finds no SSN or phone in `redactLetter`'s output. The property test asserts it on generated letters
   (10.1), and the guard stays in `prepare` as defence in depth.
(**Corrected by section 17**: this argument shows the patterns find nothing in their own output, which is why the
self-check needs the independent survivor scan of R7. Item 4 below is therefore no longer the only place the self-check
fires: the scan fires on any 9-, 10- or 11-digit chain the patterns did not take, such as `SSN 900-12-34 56`; and the
claim that only glued names fire it was already wrong before R4, since a digit and an invisible run before a number
(`DOB 03/03/1961<ZWSP>5550198765`) fired it too.)
4. **The one place the self-check can now fire on redactor output:** the call's own name or number glued to a pattern
   span by a letter (`Vantree900-12-3456`). In the letter, `VANTREE` is followed by a digit, so its form (with `AFTER`)
   does not match and it is sent today (a lost space in PDF text, the kind of gluing ADR 0054:369 records as a
   residual for a name glued to the word before it); now the span
   becomes a BARRIER, `AFTER` holds, and the self-check refuses the letter. A refusal, never a leak, and the safer
   outcome: the name is in the letter.
5. **Kinds and placeholders.** By 4.1-4.2 every span holding a match of the call's own forms carries the call's
   placeholder (the lowest claim of equal claims), and every pattern span that equals the call's identifier does too; the
   rest are `[SSN]` or `[PHONE]`.

## 8. Linear time, and the verifier

**Time.** Each pattern is a fixed sequence of bounded pieces (groups of fixed length; SEP at most five characters; the
extension at most about 20; a label window of 64 characters read once per bare match), with no quantifier over a piece
that can also match its neighbour unboundedly, so each start position costs constant work and each `matchAll` is linear
in the view. The prototype (scratch `designer/proto-timing.tsv`, median of three, this container under another
workload) took 9 to about 280 ms per 100 kB for the pattern scans alone (two runs): phones back to back 64 ms, SSNs back to back 55 ms,
`555 012 3456 ` chains 16 ms, a 100 k digit run 12 ms, `5-` repeated 12 ms, `5<ZWSP>` repeated 189 to 277 ms (the view's
invisible runs), nine-digit runs back to back 75 ms, `Phone ` repeated before nine digits 19 ms, and #80's five crafted
letters (T1, T3-T5) 36 to 47 ms. Today's worst, redaction and self-check, is 307 ms (T1); the two tokenizations add up
to 110 ms. The 3 s budget (denial-letter.test.ts:311-329) keeps about 5x headroom. The build adds the new shapes to that
`it.each` (section 10.3).

The second prototype's figures for section 17's rules are at the end of section 17 (17 to 381 ms per 100 kB).

**The verifier** (`verifyDenialLetter`, denial-letter.ts:124) checks quotes against `context.text`, the sent text, as
today. Dates: no `datesIn` form is touched (3.5), so a deadline the letter writes in a form `readDate` reads
(figures.ts:243-259) still verifies; `readDate`'s narrower forms are unchanged and stay a proposal (section 16).
References: an alphanumeric reference, a 4-4-4 reference, `REF-SYN-77` and any bare nine or ten after a keep-noun are
sent as written and verify as references; a reference written in an SSN or phone shape does not (section 15, item 3).
`[SSN]` and `[PHONE]` cited as a claim are rejected as `unknown_claim` (:143).

## 9. The prompt: no new version

`prompts/read-denial-letter/v1/prompt.json:15` says the patients' names, dates of birth, member IDs and claim numbers are
placeholders in square brackets, "such as [PATIENT_NAME] and [CLAIM_1]", and "Never try to recover or guess what they
stand for"; the user message (built in code, denial-letter.ts:226, not part of the versioned prompt) says "Identifiers in
it are placeholders in square brackets; cite a claim by its placeholder". `[SSN]` and `[PHONE]` are self-describing,
are identifiers in square brackets, and are covered by both sentences; no field the prompt asks for (payer, claim
references, reason, deadline, documents) is a phone or SSN, and the verifier rejects either cited as a claim. A v2 would
change nothing the model must do. So no new version (a new version is a directory and a changelog entry, prompts.ts:21,
and is decided with the letter reader's evaluation set, which does not exist yet: `SERVING_RULES.readDenialLetter` is
`no_set`, evaluated.ts:75). Proposal (section 16): when that set is built, the next version lists every placeholder.

## 10. Tests

(**Extended by section 17, R9 and R11-R13**: the generators' blind spots, the named rows of both review tables and both
verifications, the survivor scan's no-refusal rows, #75's N6 property, and the assertion shapes.)

### 10.1 MOD-15: every SSN and phone form is redacted, and a letter where one survives is refused (`src/redact.property.test.ts`)

The generator is the oracle (as MOD-13: it records which segments it wrote a number into), never the matcher. Follow the
file's conventions: `fc.assert` with a fixed `numRuns` (the file's 200 to 400), no `fc.pre`, no check whose coverage
depends on chance, the repository's unseeded runs (seeded only by the mutation config, tools/stryker/seed-setup.ts),
synthetic values only (SSNs from `9\d{8}`, phones with exchange `555` and line `01\d\d`, or area `[2-9]\d\d` and any
exchange). Before relying on unseeded runs, run the new properties once over 60 seeds at their run counts (as #80 did).

- **Generator** (`ssnPhoneCase`): MOD-13's patient and claims (so the call's own identifiers are in the same letters),
  then slots of kind `ssn`, `phone`, `own-shaped` (the call's nine-digit member or ten-digit claim written in an SSN or
  phone shape) and filler. `writeSsn(value, picks)`: shaped with a SEP from `[' ', '-', '–', '—', '‐', '−', '.', '​',
  '­', '  ', ' - ', '\n']` per gap, an invisible character inside a group, full-width or Arabic-Indic digits,
  masked, labeled bare (a label from 3.4's list and up to 20 characters of filler with no digit), unlabeled bare after a
  neutral word (`Subscriber`, `Patient`, nothing), or with a HICN suffix. `writePhone(value, picks)`: every 3.3 form,
  prefix and extension choices, labeled bare ten and local seven, unlabeled bare ten (area `[3-9]`). Contexts before:
  `SSN `, `Call `, `(`, `ID:`, a letter glued (`Tel`, `SSN`), a line break; after: `.`, `;`, ` on file.`, a letter glued.
- **Asserts**, per letter: the output equals the letter with `redactionSpans`' spans replaced; every letter or digit of
  an `ssn` or `phone` segment lies in a span whose placeholder is `[SSN]` or `[PHONE]`, or the call's own placeholder when
  the generator wrote the call's own value; every bracket is exact (EXACT with `SSN|PHONE`) and counted;
  `holdsIdentifier` is false, except where the generator glued the patient's name to a pattern, where `prepare` throws
  `identifier_left` (the generator records it).
- **Refusal** (named, `functions/denial-letter.test.ts`): `holdsIdentifier` is true on hand-made redacted texts that
  hold each surviving form (`Call [CLAIM_1] at 555-012-3456`, `SSN 900 12 3456`, `Phone: 5550123456`, `xxx-xx-3456`);
  `denialLetterSpec.prepare` on `RE: Vantree900-12-3456` throws `identifier_left` whose message equals the fixed sentence
  and holds no digit (`expect(message).not.toMatch(/\p{Nd}/u)`).
- **Time** (named): the 100 kB crafted letters gain phones back to back, SSNs back to back, `555 012 3456 ` chains, a
  100 k digit run, `5-` and `5<ZWSP>` repeated, nine-digit runs back to back and `Phone ` before digits, each redacted,
  self-checked and narrative-checked under the existing 3 s budget.

### 10.2 MOD-16: what must stay is sent unchanged; the call's identifiers keep their placeholders; another patient's are screened (`src/redact.property.test.ts`)

- **Must-stay generator** (`keptLetter`): segments of amounts (`$d,ddd.cc`, `d,ddd,ddd.cc`, `$ddd-cc`), dates in every
  `datesIn` form with every separator (a reading from `fc.date`), NPIs (Luhn-valid `1xxxxxxxxx` and `2xxxxxxxxx`, after
  `NPI`, `Rendering NPI` or `Provider`), CPT, HCPCS, CARC and RARC, ICD-10, ZIPs and ZIP+4s with their dash, TINs
  (`dd-ddddddd`, or bare after `TIN`), ICNs of 11 to 14 digits, EFT traces `1\d{9}`, checks after `check`, references
  (`SYN-APL-ddd-dddd`, `REF-SYN-n`, `dddd-dddd-dddd`), each after a neutral word and joined by `; ` or `. ` (and, by
  R9, by one space, a line break, CRLF with indentation, or nothing between two number cells). Asserts:
  `redactLetter(text, patient, claims)` `toMatchObject({ text: text.normalize('NFKC'), replaced: 0 })` (`Redacted` also
  carries `claims`; the same shape as the existing property at redact.property.test.ts:400), `holdsIdentifier` is false
  (the survivor scan included), and
  `verifyDenialLetter` verifies a deadline written as each generated date in a form `readDate` reads and a claim
  reference written as each generated reference (both quoted from their segment).
- **Own identifiers**: the call's nine-digit member and ten-digit claims written in every SSN and phone shape (the MOD-15
  writers) are inside a span whose placeholder is `[MEMBER_ID]` or `[CLAIM_n]` (n no higher than the claim's), never
  `[SSN]` or `[PHONE]`, and never in `candidates`.
- **Another patient's**: an `otherId` of nine or ten digits (`9\d{8}`, `[2-9]\d{9}`), optionally with a letter prefix
  glued or dashed (`SYN`, `ZZ-`), written in every SSN and phone shape, in a letter for MOD-14's patient:
  `redactLetterForScreen(...).candidates` (R10a) contains `compactIdentifier(id)` (with its prefix when written), and the
  sent text holds none of its
  digits. A placeholder's word, `SSN` and `PHONE` included, is never a candidate (MOD-14's second property's
  `PLACEHOLDERS` gains `[SSN]` and `[PHONE]`).
- **Unlabeled bare numbers**: a bare nine, and a bare ten starting `[3-9]`, after a neutral word, are redacted; after a
  keep-noun, sent unchanged; a Luhn-valid bare ten starting 2 is sent unchanged.

### 10.3 Named tests, the existing tests, and the generators MOD-13 and MOD-14 share

- **Every probe row by name** in `functions/denial-letter.test.ts`, in a new `describe('Social Security and phone numbers
  by pattern (MOD-15, MOD-16; docs/adr/0054, amendment of 2026-11-01)')`, as `it.each` rows `[row, patient, letter,
  sent, offered]` for S1-S21, P1-P17, K1-K4, D1-D13, O1-O10, X1-X7, N1-N3, C1-C5, Z1-Z3, T1-T2, I1-I3, E1-E2, R1-R4 and
  the prototype's L1-L26 (glued, masked, HICN, `+1` bare, local seven, other-script digits, spaced-thousands, keep-nouns,
  the label across one line break), each with the sent text and, for X rows, the candidates.
- **Through the gateway** (`functions/denial-letter.test.ts`, "a letter that names a second patient"): a letter with
  `Also member 900-55-1234.` and `syntheticRecords(['900551234'])` is refused `more_than_one_patient` before anything is
  sent (`local.requests` empty, `store.calls` empty), `records.asked` holds `900551234`, and never the call's own; the
  same letter with records that hold none is sent with `[SSN]` and no digit of it.
- **`src/redact.test.ts`** (#75's file): `PLACEHOLDER` masking of `[SSN]` and `[PHONE]` (a patient named `PHONE`
  reads none in `[PHONE]`), `identifierCandidates` never offering `SSN` or `PHONE`, and `holdsNameOrNumber` ignoring a
  phone or SSN (the narrative check's `patterns: false`).
- **Existing tests**: MOD-13's `EXACT` and MOD-14's `PLACEHOLDERS` gain `SSN|PHONE`; MOD-13's name `PARTS` gain `SSN`
  and `PHONE` (placeholder words as names, as #80 added the others). MOD-14's existing property
  (redact.property.test.ts:425-426) gains `expect(screenResult.candidates).toContain(compactIdentifier(id))`, so it keeps
  testing what the screen is really asked (C8). #75's N6 property in `src/redact.test.ts` (:167-189, "the letter path
  reads exactly those with no `*` and no `.`, `/` or `_` between two digits") changes its expectation to
  `matcher === (letterReads || wroteSsnOrPhoneShape)`, the second computed on the generator side from the groups and
  separators it drew, and gains pinned rows `Member 555.012.3456 on file` and `Member 900123456*1 on file`, both true (C1:
  the property's statement would otherwise become false; a sampling run of 280 000 cases found no case that differs
  today, so this is about truth, not a flake). Apart from these, nothing else changes: MOD-13's generated numbers of
  nine digits written `123-45-6789` now also match the SSN pattern, and 4.2 gives them the call's placeholder; the
  "unchanged text" property's phrases hold no nine- or ten-digit number. `apps/worker/src/packets/letter-records.db.test.ts`
  is unchanged (it calls `identifierCandidates` directly and reads its claim through the gateway's screen, whose
  candidates are a superset of today's).

### 10.4 `packages/synth`, the test matrix, and mutation

(Every "after :NNN" below is #75's head; on the merged base each insertion is located by key, `MOD-14` or the last
`Ruled by` paragraph, never by line number: on today's base MOD-13 and MOD-14 sit at registry.ts:579-580. Section 13,
step 0.)
- `packages/synth/src/cases/matrix.ts`: entries `MOD-15` and `MOD-16` after `MOD-14` (:378), title and assertion equal to
  the matrix rows below.
- `packages/synth/src/cases/registry.ts`, after :590:
  `'MOD-15': none(10, 'Letters are generated in memory by the property test, which records where it wrote each Social Security and phone number; no file.', ['packages/model-gateway/src/redact.property.test.ts', 'packages/model-gateway/src/functions/denial-letter.test.ts'])`,
  `'MOD-16': none(10, 'Letters are generated in memory by the property test, which records what it wrote to stay; no file.', [the same two paths])`.
- `fixtures/synthetic/MOD-15/expected.json` and `MOD-16/expected.json`, written by `pnpm synth --case MOD-15` and
  `--case MOD-16` (as MOD-13's): case metadata only (`files: []`), no document.
- `docs/product/test-matrix.md`, after MOD-14 (:233), in MOD-13's form:

  `| MOD-15 | A payer letter that writes a Social Security number (3-2-4 with any dash, spaces, a period, a line break or an invisible character between or inside its groups, full-width or other-script digits, masked as XXX-XX-1234, nine digits with an SSN label or no label, a HICN suffix) or a phone number ((AAA) EEE-LLLL, dashes, periods or spaces, +1 or 1, an extension, ten digits with a phone label or none, a seven-digit local number with a phone label), glued to a word, in a comma list with no space, wrapped across a line with indentation or inside a group, after a digit and an invisible character, after a label of the other kind or a word that does not name it, the call's own identifiers among them, or crafted to make redaction slow | No digit of it is sent: each is [SSN] or [PHONE], or the call's own placeholder when its digits are the call's member ID or claim number; every placeholder is exact and counted; the self-check refuses (identifier_left, a fixed message with no number) a text in which one survives, a letter in which a nine-, ten- or eleven-digit chain no pattern read survives (an OCR space inside a group), and a letter in which the patient's name is glued to one; a crafted letter of 100 kB is redacted and checked within its time budget |`

  `| MOD-16 | A payer letter with amounts, dates in every form datesIn reads, NPIs, procedure, adjustment and diagnosis codes, ZIPs and ZIP+4s, TINs, ICNs, EFT traces, checks and references, nine- and ten-digit numbers after a word that names them (claim, NPI, TIN, check, reference ...), an NPI or TIN after Medicare or contact, service-line rows (codes, units and amounts in columns, a slashed date before a code) and amounts directly before dates and numbers, the call's member ID and claim numbers written SSN- or phone-shaped, and another patient's nine- or ten-digit member ID or claim number written SSN- or phone-shaped | The first are sent unchanged (after NFKC), the self-check refuses none of them, and the verifier still reads their dates and references; the call's identifiers keep their placeholders ([MEMBER_ID], [CLAIM_n], the lowest of equal claims), never [SSN] or [PHONE], and are never offered to the screen; another patient's is offered to the one-patient screen whole and with a prefix written against it, so the letter is refused (more_than_one_patient) with nothing of it logged or in the refusal |`

  and after the MOD-13/MOD-14 note (:239): "MOD-15 and MOD-16 were added with the letter's Social Security and phone
  numbers redacted by pattern (the founder's ruling of 2026-11-01; docs/adr/0054, amendment of 2026-11-01): the generated
  letters' oracle is the generator, which records where it wrote each number."
- **Mutation:** nothing. `stryker/shards.json` holds no model-gateway shard (`MUTATION_PACKAGES` in `stryker/base.mjs:24`
  is money, pricing, ledger and packets), so no shard or `noMutants` entry changes.

## 11. Docs

- **ADR 0054, amended (ADR 0088 released).** The change is inside 0054's decision ("read letters only through their
  reader" and its PHI minimization), uses #80's one-pass matcher and placeholders, and changes no other decision, so it is
  a dated amendment, as #80's and #75's were. ADR 0088 is released (to be recorded in the status file and told to the
  orchestrator). The amendment:
  - the header's **Status** line gains "amended 2026-11-01: a payer letter's Social Security and phone numbers redacted by
    pattern ("Amendment (`co-001/redact-ssn-phone`, 2026-11-01)", below)";
  - a new last section, **"Amendment (`co-001/redact-ssn-phone`, 2026-11-01): Social Security and phone numbers by
    pattern"**, opening with the ruling and who and when (as section 1, word for word), then bullets: the scope (section
    2); the patterns (3.1-3.3); labels and keep-nouns (3.4); what stays (3.5); the placeholders and ranks (4.1-4.3); the
    call's own identifier in a pattern shape (4.2); the screen's candidates and why no PHI leaves (5); the self-check and
    the glued-name refusal (6, 7.4); time (8); no new prompt version (9); tests (MOD-15, MOD-16); "Still not covered"
    (section 15's residuals: addresses (the ruling does not cover them); an MBI; a phone written in words or with letters
    (vanity); an SSN's last four in prose (`ending in 3456`); an unlabeled bare ten-digit phone starting 2 that passes
    the NPI check; a seven-digit local number with no phone label; a non-NANP phone number; a reference written in an SSN
    or phone shape, which is redacted and cannot be reported; other-script digits in names, member IDs and dates offered
    to the screen, which the stored side never matches (narrowed by R3: SSN and phone shapes are offered as ASCII); a
    payer letter misfiled as a contract, which reaches `proposeContractTerms` unredacted unless its patient is already
    in the records (section 2, proposal 16.8); and the rare writings R12 leaves unread, each refused by the survivor
    scan or sent, listed there by name);
  - the residual sentence of #80's amendment (:372-373) **stays as decided**, following the convention #80's amendment
    states ("the text above stays as it was decided, and where it differs, this amendment holds") and #75 kept; the new
    amendment says, first among its bullets, "Social Security numbers and phone numbers are no longer residuals of
    #80's amendment: they are redacted by pattern (below); addresses still are" (review C10: the in-place edit planned
    before review is dropped);
  - **ADR 0070, Part 3, N6** (around :1302-1334, "its other-patient screen (`identifierCandidates`) tokenizes through
    identifierTokenRuns" and "the letter path reads exactly those with no `*` and no `.` `/` `_` between two digits")
    gains one dated sentence: "Amended 2026-11-01 (docs/adr/0054, amendment of that day): the letter path also reads
    every Social Security and phone shape whatever its separators, and the screen is asked about the redactor's
    candidates (runs of the sent text, of the letter with only the call's identifiers replaced, and every SSN- or
    phone-shaped match that is not the call's), not only runs of the sent text" (review C1, C2).
- **PRD 14, PHI minimization** (PRD.md:575), its sentence on letters becomes: "Denial letters do carry PHI; the gateway
  sends the minimum text needed, strips names, dates of birth, member IDs and claim numbers by exact match before the call
  where the task allows it, redacts Social Security numbers and phone numbers by pattern wherever the letter writes them
  (ruled by the founder, Tyler Williams, on November 1, 2026; docs/adr/0054), and never sends more than one patient's
  material in one call." Addresses are not added.
- **reconciliation-001**, a paragraph after the last ruling (after :658), in the file's form: "Ruled by the founder, Tyler
  Williams, on November 1, 2026, relayed by the co-founder to Lane A (session_01TrKDxeLbxVo7t7zwRXFzrg, commit 18bbe0e9,
  14:04 UTC) and confirmed in session_01FcouKNNHsdecRMzfTs7XwW at about 14:40 UTC: a payer letter has its Social Security
  numbers and phone numbers redacted by pattern before the model reads it, as a PRD 14 PHI minimization requirement.
  Recorded in PRD 14 and ADR 0054 (amendment of 2026-11-01), built in `co-001/redact-ssn-phone` (#n). Not an exception to
  the checks above:" then bullets: **Scope** (the letter reader only, section 2); **What stays** (amounts, dates, NPIs,
  codes, ZIPs, TINs, ICNs, traces and references named by a word, MOD-16); **The call's identifiers** keep their
  placeholders, and the call's digits-only claim written `(555) 012-3456` or `555.012.3456` is now its placeholder;
  **The screen** is offered another patient's SSN- or phone-shaped identifier whole (MOD-14, MOD-16); **The self-check**
  also runs an independent survivor scan and refuses a letter in which an SSN- or phone-length chain survives;
  **Addresses** stay a residual (the ruling does not cover them), and so does a payer letter misfiled as a contract
  (a proposal); **The co-founder's points** (section 15), each decided as the safer option.
- **Code comments**: redact.ts's header (:1-38) gains a paragraph on the patterns and the survivor scan;
  `denial-letter.ts`'s header (:18-27) says SSN and phone numbers are replaced too and that the screen reads the
  redactor's candidates; the `OtherPatientCheck` doc comment (denial-letter.ts:47-52, "does any of these runs of the
  letter") becomes "does any of these candidates (compact runs of the letter, and the compact form of every Social
  Security or phone number it writes that is not the call's own)"; and the header of
  `apps/worker/src/packets/letter-records.ts` (:5-9, "whether any run of the redacted letter is a member ID ...") says
  "whether any of the letter's candidates (docs/adr/0054, amendment of 2026-11-01) is a member ID ..." (comment only;
  review C2).

## 12. Watched paths and CI

`redact.ts` and `functions/denial-letter.ts` are screening-capacity watched paths (tools/screening-capacity/
watched-paths.txt:366, :385). The design adds **no file and no import edge**: everything is inside `redact.ts`, and
`denial-letter.ts` drops one named import from the same module (`identifierCandidates`), which changes no module in the
closure. So `watched-paths.txt` does not change; the build still runs `pnpm exec tsx tools/screening-capacity/watched.ts
--write` and expects no diff (the unit test `watched.test.ts` holds it). Changing a watched path makes the PR's
screening-capacity workflow measure (advisory on pull requests, the founder's ruling of 2026-10-23), which is expected.
Also run: `pnpm typecheck`, `pnpm lint`, `pnpm lint:logs`, `pnpm verify-content` (docs), `pnpm test` (gateway and synth;
the fixtures test reads `expected.json`), `pnpm test:golden`, and `pnpm test:db` for `letter-records.db.test.ts`
(PG18 on port 5433, as the lane notes say), each heavy one under `flock /tmp/laneb-heavy.lock`.

## 13. Build plan (after #75 merges; branch cut from a `claude/build-platform` head containing #75's merge)

(Section 17 supersedes the details of steps 1 to 5 where they differ: the refined patterns, the `digits` view and space
reading, the survivor scan, R6's candidates and `redactLetterForScreen`.)

0. **Check #75's merged state before writing code (review C5).** #75 was a draft with base conflicts when this was
   designed (head 871faff9; the base, bce57f16 at review, differs from it in every file below). On the merged base run
   `git diff 871faff9 <base> -- packages/model-gateway/src/{redact.ts,redact.test.ts,redact.property.test.ts,functions/denial-letter.ts,functions/denial-letter.test.ts} docs/product/PRD.md 'docs/adr/0054-*' 'docs/adr/0070-*' docs/product/test-matrix.md docs/product/reconciliation-001.md packages/synth/src/cases/{matrix.ts,registry.ts} apps/worker/src/packets/letter-records.ts`.
   If any model-gateway file changed, re-run the probe (scratch `probe/probe.test.ts`, `extras.test.ts`) and the second
   prototype's rows against it, and re-check sections 3.1, 4, 5 and 17 before writing code. Locate every insertion by key
   (`MOD-14`, the last `Ruled by` paragraph, the ADR's last amendment heading), never by line number. Record the diff's
   result in the status file.
1. **`packages/model-gateway/src/redact.ts`**
   - header comment (pattern paragraph); `Kind` split into `OwnKind` and `PatternKind`; `Form.kind: OwnKind`;
   - the pattern constants after `GAP` (:342): `PATTERN_DIGIT`, `group(n)`, `PATTERN_DASH`, `PATTERN_SEP`, the boundaries,
     `SSN_SHAPED`, `SSN_BARE`, `PHONE_SHAPED`, `PHONE_BARE`, `PHONE_LOCAL`, `HICN_SUFFIX`, `EXTENSION`, the three word
     lists and `NEAREST_WORD`, `npiCheckDigitValid` (Appendix A);
   - `patternMatchesIn(view, own)`: runs the five patterns on the join view, applies 3.4 to bare matches and 3.5's bare
     guards, maps each match with `inNormal`, and looks each up in `own` (4.2); returns `Found`s with `kind`, `claim` and,
     for pattern kinds, `compacts` (whole and core);
   - `Subject.patterns`; `matchesIn` calls `patternMatchesIn` last (after the initials) when `subject.patterns`, with the
     matches found so far and the own-compact map built from
     `formsOf(subject)`'s claim and member forms; `letterSubject` sets `patterns: true`; `holdsNameOrNumber` sets `false`;
   - `RANK`, `PLACEHOLDERS`, `PLACEHOLDER` (4.1, 4.3); `Found` gains optional `compacts`; `merge` unchanged but keeps,
     per merged span, the pattern matches inside it (for 5.3);
   - `Redacted.candidates`; `redactLetter` builds `sent`, `screenText` and the candidates (section 5); `redactionSpans`
     unchanged in signature.
2. **`packages/model-gateway/src/functions/denial-letter.ts`**: header comment and the `OtherPatientCheck` doc comment
   (C2); `LetterContext.candidates`; `prepare` calls `redactLetterForScreen` and passes its candidates (R10a); `screen`
   reads `prepared.context.candidates`; `verifyDenialLetter` rejects a reference holding a placeholder fragment (R10b);
   import list.
3. **`packages/model-gateway/src/redact.property.test.ts`**: MOD-15 and MOD-16 (10.1, 10.2); `EXACT`, `PLACEHOLDERS`,
   `PARTS`.
4. **`packages/model-gateway/src/functions/denial-letter.test.ts`**: the named rows, the gateway refusal, the refusal
   message, the time letters (10.1, 10.3).
5. **`packages/model-gateway/src/redact.test.ts`**: masking and the narrative check (10.3); #75's N6 property's
   expectation and its pinned rows (C1); the phi-guard superset test (R11).
6. **`packages/synth/src/cases/matrix.ts`**, **`registry.ts`**; **`fixtures/synthetic/MOD-15/expected.json`**,
   **`MOD-16/expected.json`** (generated).
7. **`docs/product/test-matrix.md`**, **`docs/product/PRD.md`**, **`docs/adr/0054-*.md`**, **`docs/adr/0070-*.md`**
   (N6's dated sentence), **`docs/product/reconciliation-001.md`** (section 11); **`apps/worker/src/packets/
   letter-records.ts`**, header comment only (C2).
8. Not changed, and checked: `prompts/**`, `prompts.ts`, `index.ts` (R10a keeps `redactLetterForScreen` unexported),
   `testing.ts`, the code of `apps/worker/src/packets/letter-records.ts` (its header comment changes, step 7; it is a
   watched path, :155, so the screening-capacity measure runs, advisory), `packages/observability/**` (the R11 test
   imports `textPhiFindings` through the gateway's existing `@tp/observability` dependency; no new package edge),
   `stryker/**`, `tools/screening-capacity/watched-paths.txt`, any migration.
9. Before the PR: the new properties over 60 seeds once (scratchpad log), the full local suite, the probe's table, both
   review tables (`review/attack-table.tsv`, `real-table.tsv`) and the second prototype's rows (`apply/run.mjs`) re-run
   against the build (every `redact` row redacted, every `keep` row byte-identical, every O row its placeholder, every X
   row offered), the PR description from `.github/pull_request_template.md`.

## 14. Risks

1. **Over-redaction of a reference the task needs.** A payer reference written in an SSN or phone shape, or as nine or
   ten bare digits with no keep-noun near it, is redacted, and the reader cannot report it as a claim reference. The
   call's own claims are unaffected (4.2), and a reference after `REF`, `Reference`, `Claim`, `ICN`, `Appeal`, `Case` ...
   stays. Measured on the probe's rows: no must-stay row is touched except Z3's bare ZIP+4 (an address part). Section 15.
2. **Glued-name refusals** (7.4): a letter whose text glues the patient's name to a pattern span is refused rather than
   sent. Today it sends the glued name. Safe; it may refuse a few PDF-extracted letters, which then go by hand.
3. **Label lists are English and finite.** A phone introduced by a word not in 3.4 (`Ring us at`) is unlabeled: a bare
   ten starting `[3-9]` is still redacted, a local seven is not. A keep-noun not in the list makes a bare number
   unlabeled, which redacts it (safe side).
4. **Time.** The label window is read per bare match only; the prototype's worst shape is under 280 ms. The named time tests
   hold the bound.
5. **Concurrent change.** `redact.ts` is #80's and #75's file; this branch is cut after #75 merges, so there is nothing
   to resolve unless another item touches `redact.ts` first (LANES rule 6: the PR merged second keeps both). #75 was
   still a draft with base conflicts at review, so every line number here is #75's head and may move: step 0 diffs the
   merged base against 871faff9 first and locates insertions by key (C5).
7. **Survivor-scan refusals.** The scan (R7) refuses a letter in which a 9-, 10- or 11-digit chain of short groups
   survives. Its barriers (dates, amounts, named runs) and its rule that a chain holding a five-digit group does not count
   keep every service-line row the reviews found from refusing (MOD-16 asserts it), but an unusual table can still
   refuse. Safe (the letter goes by hand); the count of such refusals cannot be seen until prepare refusals are logged
   (proposal 16.10).
8. **Rules the scan and the patterns share.** The scan reuses `datesIn`, the amount shape and the keep-noun rule (R5) for
   its barriers, so it is independent of the patterns' shapes and separators but not of those three. A gap in `datesIn`
   or the keep-noun list is not caught by the scan; MOD-15's oracle is the generator, which keeps its own copies.
6. **Tests that read the matcher.** MOD-15 and MOD-16 take their oracle from the generator and from what it records,
   never from the patterns; the keep-noun and label lists are read by the generator from its own copies, so a pattern
   change that drops a label fails the property rather than passing with it.

## 15. For the co-founder (each decided here as the safer option; none blocks)

1. **Unlabeled bare nine- and ten-digit numbers are redacted** (a nine as `[SSN]`; a ten starting 3-9, or 2 and not a
   valid NPI, as `[PHONE]`), unless a word that names them as something else stands directly before them (claim, ICN,
   reference, NPI, TIN, check, trace ..., with only connectors between: R5). Why: such a number may be an SSN or phone
   written bare; the call's own member ID or claim keeps its placeholder, and another patient's is still offered to the
   screen, so redacting costs only an unknown reference. The alternative (leave every unlabeled bare number to the
   screen, the probe's first suggestion) would send an unlabeled SSN.
2. **The payer's own phone numbers are redacted** with any other (letterhead, appeals line, fax, TTY numbers): a pattern
   cannot tell whose number it is, and no field the reader returns needs one.
3. **A reference written in an SSN or phone shape is redacted** (`Reference 555-019-8765`, and the last ten of a dashed
   4-3-3-4 chain, `Ref 1234-[PHONE]`): the shape is decisive, whatever word stands before it, so an SSN or phone written
   after "reference" is never sent. The reader then cannot report that reference (the call's own claims are unaffected),
   and a reference holding a placeholder fragment is rejected (item 17).
4. **MBIs are not a pattern here**: the ruling names SSNs and phone numbers; an MBI is a member ID, redacted when the
   records hold it and screened when another patient's. Recommended as its own small item (an 11-character pattern with
   its own probe), not built here.
5. **Other-script digits** (Arabic-Indic, Devanagari) in an SSN or phone shape are read by value (R3), so they are
   redacted and another patient's identifier written in them is offered to the screen in ASCII, which the stored side
   equals. Other-script digits in names, member IDs and dates stay a residual, closed by the fold proposal (16.3).
6. **Masked SSNs (`XXX-XX-3456`, `###-##-3456`, `___-__-3456`, `SSN *****3456`) are redacted whole**; an SSN's last
   four in prose (`SSN ending in 3456`) is not (no shape to find; four digits alone are everywhere in a letter).
7. **A seven-digit local number is redacted only after a phone label**; without one it is kept (`555-0100 local`), since
   a three-four shape also ends references.
8. **An unlabeled bare ten-digit phone starting 2 that passes the NPI check digit is kept**, and a Luhn-valid ten named
   by `NPI` is kept whatever label is in the window (R5), so no NPI is ever altered (about one in ten such phones is
   kept; formatted phones are always redacted).
9. **Refusals reuse `identifier_left`**, with its fixed message; no new code or UI string.
10. **White-space table columns of small numbers read as an SSN or phone** (R1): `Line 001 02 1500` and
    `Row 250 100 1500`, with no decimals, are `[SSN]` and `[PHONE]`, because a 3-2-4 or 3-3-4 written with spaces is a
    common way to write an SSN or phone. With cents (`1500.00`) the amount guard keeps the row. Also: an SSN written with
    spaces directly before a comma and another (`900 12 3456,900 55 1234`) has its second number refused by the
    survivor scan rather than redacted.
11. **An SSN or phone label in the window beats a keep-noun** (R5): `Please call regarding claim 5550123456` and
    `Patient contact for this claim: 5550123456` are `[PHONE]`; a label of the other kind never keeps a number
    (`Call about subscriber 900551234` is `[SSN]`). Two exceptions keep what is plainly not a person's number: a
    Luhn-valid ten named by `NPI`, and a nine named by `TIN`, `EIN` or `TAX ID`. `MEDICARE` labels a nine, not a ten.
    `CONTACT` labels wherever it stands in the window; the verification proposed that it label only when nearest, which
    would send the patient's phone in the second example, so the safer reading is taken.
12. **The survivor scan may refuse a letter** (R7) in which a 9-, 10- or 11-digit chain of short groups survives that no
    pattern read: an OCR space inside a group, a slash, bullet or underscore between groups, an unusual table. The letter
    goes by hand. Dates, amounts, named runs and chains holding a five-digit group never refuse.
13. **A letter whose text glues the patient's name to an SSN or phone (`RE: Vantree900-12-3456`) is refused**
    (`identifier_left`, 7.4), where today it is sent with the glued name: a new class of refusal that sends some
    PDF-extracted letters to hand handling. Never sent, because the name is in it.
14. **A bare ZIP+4 with no ZIP word directly before it (`CA 900011234`) is redacted as `[SSN]`** (3.5): a ZIP+4 is an
    address part, already a residual of PHI, and nine bare digits may be an SSN.
15. **A keep-noun keeps a bare number only when it names it** (R5, C6): only connectors (`:`, `#`, `-`, `.`, `NO`,
    `NUMBER`, `NBR`, `ID` ...) may stand between, so `Case manager reachable at 5550123456` and `Group subscriber
    900123456` are redacted; `Claim number is 5550123456` is redacted too (`IS` is no connector), which costs an
    unknown reference only.
16. **A payer letter misfiled as a contract is not redacted here** (section 2, C3). It reaches `proposeContractTerms`
    as stored unless its patient is already in the records. Decided: contract pages stay unredacted in this PR (a
    redacted page would reject true quotes), the route is recorded as a residual, and the safer fix is recommended as its
    own item (16.8): the contract screen refuses a page holding a dash-, period- or invisible-joined 3-2-4 SSN, a masked
    SSN or an SSN-labeled nine. A contract has no legitimate SSN, and a refusal costs only hand entry.
17. **A claim reference that holds a placeholder without being one is rejected** (`ZZ[SSN]`, `1234-[PHONE]`, as
    `unknown_claim`; R10b), so a fragment of a redacted number is never stored as a payer reference.

## 16. Proposals (outside this PR)

1. **The call's own digits-only identifier with `)` or `.` between digits** (probe finding 3, ADR 0054's exact-match
   reading): this PR closes it for SSN and phone shapes (4.2); the general fix (`.` and `)` as number joiners between
   digits, with the amount guard) belongs to the matcher's own amendment.
2. **The screen's tokenizer gaps** (probe findings 4 and 5): `)` and `.` between digits, and the three-token cap, for any
   other patient's number, not only SSN and phone shapes (this PR offers those shapes whole).
3. **Fold every `\p{Nd}` to its ASCII value in `viewOf` and the screen's tokenizer** (probe finding 6), closing
   other-script digits for names' digits, member IDs, dates and the screen at once (#80's security-review proposal; this
   PR's `digits` view, R3, is the same fold for the patterns only).
4. **`readDate` reads fewer forms than `datesIn`** (probe finding 7): a deadline written `11-30-2026`, `30.11.2026` or
   `Nov 30th '26` is rejected as unreadable.
5. **An MBI pattern** (section 15, item 4).
6. **The read-denial-letter prompt's next version** lists every placeholder, `[SSN]` and `[PHONE]` included, when the
   letter reader's evaluation set is built (section 9).
7. **The packets verifier's `identifierSpans`** (`packages/packets/src/verifier/mismatches.ts`) could reject a
   narrative that writes an SSN or phone shape (#80's proposal list already names its folding gaps).
8. **The contract screen refuses a page holding an SSN** (C3, item 15.16): a dash-, period- or invisible-joined 3-2-4,
   a masked SSN, or an SSN-labeled nine, never a white-space-joined 3-2-4 (fee-schedule rows `250 10 1500` would refuse
   real contracts) and never a phone (contracts carry the payer's). Refuse, never redact, so quotes still verify against
   the stored page. Its own item in `packages/model-gateway` (`functions/contract-terms.ts`, MOD-12's screen), with its
   own test-matrix row.
9. **Align `packages/observability` phi-guard's SSN and phone shapes with the letter's** (C4): take the NANP area rule
   for phones and the letter's separators (dashes of every kind, mixed period and dash, invisible characters), keep its
   refuse-on-sight job. Its own item in `packages/observability`, since phi-guard guards URLs, S3 keys, job payloads and
   log text (ADR 0053, ADR 0062 decision 11).
10. **Log `prepare` refusals once the letter reader has a caller** (C10): one line with `practice_id` and an error code
    (e.g. `MODEL_INPUT_IDENTIFIER_LEFT`), never the text, so an operator can count refusals from glued names and the
    survivor scan (15.12, 15.13). Today the gateway logs a screen refusal but not a `prepare` one.

## 17. The rule set after review (supersedes the passages it names)

The first review (one reviewer) ran the Appendix A patterns (the prototype) over crafted synthetic letters (scratchpad
`review/attack.test.ts`, `attack-table.tsv`; `review/real.test.ts`, `real-table.tsv` on 871faff9) and wrote R1-R10 here.
Two verifiers then checked every finding, one through a security lens and one through a correctness lens, and each
proposed narrower forms of R1, R2, R5, R6 and R7 that the first versions over- or under-read (scratch
`verify-security/r1.mjs`, `verify-correctness/scan.mjs`). The apply stage took those forms (the safer one where they
differ), ran them as a second prototype (scratch `apply/refined.mjs`, `run.mjs`, `more.mjs`, `f12.mjs`: every row of
both verifications and both review tables read as the rules below say), and rewrote this section. Each rule
**supersedes** the text it names (sections 3, 4.2, 5, 6, 7, 10 and Appendix A); the build follows this section where
they differ.

- **R1. Amounts and dates are never read across a period and white space (F1).** Found: `Billed $150.00 2026-11-01`
  sent `$[SSN]-11-01` (the deadline lost), `150.00 1200.00` sent `[SSN].00`, `Total 1,250.00 2026` sent `1,[SSN]`,
  `Row 250 10 1500.00` sent `[SSN].00`, `Row 250 100 1500.00` sent `[PHONE].00`, `Paid 150.00⏎2026-11-01` likewise.
  (a) A period gap may sit with other period, dash or invisible gaps, **never with a white-space gap** (a line break is
  white space): `900.12.3456`, `555.012-3456` and `555-012.3456` are read; `150.00 2026` and `150.00⏎2026` never are.
  (b) **Amount guards apply to a shaped match only when one of its gaps is white space**: not right after a digit
  followed by `.` or `,`, and not right before `.` or `,` followed by one or two digits and no third (cents). Every
  shaped match is also never right after a currency sign and an optional space. A dash-, period- or invisible-joined
  match takes no other guard: no amount is written 3-2-4 or 3-3-4 with dashes or two periods, and a comma list with no
  space (`900-12-3456,900-55-1234`, `555-012-3456,555-019-8765`, `555.012.3456,555.019.8765`) is a list, every number
  of it redacted. The bare patterns keep the full bare guards (3.5). Not taken: the first review's "a period only when
  every gap is a period" (it stopped reading `555.012-3456`, which no scan caught) and "the full bare guards on every
  shaped match" (it stopped reading comma lists). Accepted cost: 15.10.
- **R2. A line break, with indentation, inside or between groups (F2).** Found sent: `SSN 900-12-34⏎56`,
  `900-12-34-⏎56`, `Call 555-012-34⏎56`, `SSN 900-<CRLF>    12-3456`, `SSN 900⏎    12 3456`, `Call (555)⏎    012-3456`,
  `Call 555 - <CRLF> 012-3456`, `900<NEL>12<NEL>3456`, `900--12--3456`, `555‐‐012-3456`. (a) White space is
  `[\s\u0085]`; a white-space gap is one to three spaces or tabs, or one line break (`LINE_BREAK`, :327, U+0085
  included; CRLF is one break) with up to 16 spaces or tabs on each side; around a dash, up to two spaces or that
  line-break form; the dash is `DASH{1,2}`. (b) **Inside a group**, between two digits: an optional dash, up to 16
  spaces or tabs, one line break, up to 16 spaces or tabs (PDF wrapping inside a number, as #80's `GAP.number` allows
  for the call's own numbers), **in the shaped patterns and in a labeled bare group only**, never in an unlabeled bare
  nine or ten (`20261101⏎1`, `97110⏎1500` stay as written). (c) A labeled bare match that crosses a line break takes
  extended digit boundaries (no digit across another such break on either side), so `12345⏎6789⏎0123` is not cut in
  the middle; every other match keeps the plain boundary, so a phone at the end of a line followed by a numbered line
  (`Call 555-012-3456⏎2. Submit the form`) is still read. Everything is bounded, so each start stays constant work. An
  OCR space inside a group (`900-12-34 56`) is not read by the patterns; R7 refuses it.
- **R3. Digit values, not digit code points (F5).** Found sent: `Call ٥٥٥-٠١٢-٣٤٥٦`, `Call (٥٥٥) ٠١٢-٣٤٥٦`,
  `Call ५५५-०१२-३४५६`, `Subscriber ٥٥٥٠١٢٣٤٥٦`: `AREA` is ASCII `[2-9]`, and the unlabeled first-digit rule and the NPI
  check read ASCII. The pattern pass reads the join view with every `\p{Nd}` replaced by its ASCII value (one more
  `viewOf` mode, `digits`, positions mapped as today), so `AREA`, the first-digit rule, `npiCheckDigitValid` and the
  compacts offered to the screen read values. This closes residual 15.5 for SSN and phone shapes; ADR 0054's "digits of
  other scripts" residual narrows to names' digits, member IDs and dates (16.3). Section 1's claim is now true.
- **R4. A digit and an invisible run before or after (F6).** Found sent: `On 11/01/2026<ZWSP>555-012-3456`,
  `Claim 12345<ZWSP>900-12-3456`. The patterns run on the `join` reading **and** on the `space` reading (an invisible
  run read as a space), as dates already are (:524); a match in either is redacted, and the self-check (patterns and
  survivor scan) reads both. Two linear passes. Section 7's "only glued names fire the self-check" was already wrong
  (`DOB 03/03/1961<ZWSP>5550198765` fired it); with R4 that letter is redacted instead.
- **R5. Labels and keep-nouns (F4, C6).** Found sent: `Please contact us regarding member 900551234`, `Call about
  subscriber 900551234`, `Phone/SSN: 5550123456`, `Medicare 3456789012`, `Phone on file for claim: 5550123456`,
  `Member SSN or claim 900551234`, `Case manager reachable at 5550123456`, `Group subscriber 900123456`. The window is
  3.4's (64 characters back, ending at the last span and at a BARRIER, words within 24 characters, no digit, at most one
  line break). For a bare nine, ten, `1` plus ten or local seven:
  (a) **A keep-noun names the number only when everything between them is connectors** from a closed list, repeated in
  any order within the window: white space, `:`, `#`, `-`, `.`, `(S)`, `NO`, `NUMBER`, `NUMBERS`, `NBR`, `NUM`, `ID`
  (`Reference no.: 5550123456`, `Tax ID number 900123457`, `Claim #: 900123456`). A keep-noun that does not name the
  number counts for nothing.
  (b) **Always kept**, whatever label is in the window: a Luhn-valid ten named by `NPI`; a nine named by `TIN`, `EIN`
  or `TAX ID` (`Medicare provider NPI 1234567893`, `Contact your provider, NPI 1234567893`, `Medicare Advantage TIN
  900123457`).
  (c) Otherwise **an SSN or phone label in the window decides, over a keep-noun**; between an SSN and a phone label the
  nearer decides. A phone label never keeps a nine (it is `[SSN]`), and an SSN label makes a ten `[SSN]`.
  (d) **`MEDICARE` is an SSN label for a nine only** (the HICN's base), never for a ten: `Medicare Advantage claim
  1900123456` is kept (named by `CLAIM`), `Medicare 3456789012` is `[PHONE]` by the unlabeled rule. `CONTACT` stays a
  phone label wherever it stands in the window (15.11 says why the verification's narrower reading was not taken).
  (e) A keep-noun that names the number, with no label in the window, keeps it. No word: rules 3.2.4 and 3.3.5. A digit
  in the window still ends it (`Phone 1: 555-0100`: a residual for the local seven only; a nine or ten is redacted
  unlabeled anyway).
  MOD-16's generator reads its own copies of the lists (risk 14.6).
- **R6. The screen reads every pattern match, not every pattern span (F7).** Found (real redactor): the call's own
  short claim `1234` matches inside another patient's `900-55-1234`; the merged span takes `[CLAIM_1]`, so section 5's
  items 2 and 3 never offer `900551234`, and the model is told the other patient's number is claim 1. (a) Item 3 offers
  the compacts of **every pattern match** that is not the call's own (4.2), whatever its merged span's placeholder.
  (b) In `merge`, a call's own match **contained in and not equal to** a pattern match that is not the call's own does
  not lend its rank: the span is `[SSN]` or `[PHONE]`. An own match that only partly overlaps a pattern match still
  lends its rank (the call's placeholder: safe). (c) The joined compacts take the token written against the match on
  **either side** (`900-55-1234-01` offers `90055123401`, a member ID with a dependent suffix), and 4.2 looks those
  joined compacts up too; when one is the call's own, **the merged span extends over that token**, so `Claim SYN (555)
  012-3456` for the call's claim `SYN5550123456` is sent `Claim [CLAIM_1]`, not `Claim SYN[CLAIM_1]` or `SYN [PHONE]`.
  Section 5's "the call's own identifiers are never offered" holds again.
- **R7. An independent survivor scan in the self-check (F3).** Section 7 proves the patterns find nothing in their own
  output, so the self-check as first designed refused no survivor the patterns miss: every leak above passed it.
  `holdsIdentifier` on the letter path (`patterns: true`) also runs a **survivor scan**, written separately from the
  patterns, on the masked text's `digits` view with invisible runs dropped, on both readings (R4):
  1. **Barriers first**: every placeholder; every `datesIn` span; every amount token (a currency sign and the number
     after it; a number with comma thousands; a group followed by `.` or `,` and one or two digits and no third, with
     those digits); every bare run R5 keeps (named by a keep-noun with no label, and R5(b)'s NPI and TIN runs).
  2. **Chains**: digit groups joined by at most three spaces or tabs, or one line break with up to 16 spaces or tabs on
     each side, with at most one of: one or two dashes, `.`, `(`, `)`, `/`, `•`, `·`, `_`; invisible characters
     anywhere.
  3. **Refuse** (`identifier_left`, the same fixed sentence) when one to four consecutive groups of a chain hold 9 or
     10 digits, or 11 starting with `1` across two or more groups, **unless** the groups are two or more and one has
     five or more digits (CPT, ZIP, ZIP+4, TIN and ICN columns: `97110 1 1200.00`, `97110⏎1500`, `90001-1234`,
     `90-0123456`, `97110/97140`), or the group is one of ten starting `0` or `1` (EFT traces, `1xxx` NPIs), one of ten
     starting `2` that passes the NPI check, or one of eleven or more (an ICN).
  The second prototype refuses `SSN 900-12-34 56`, `Phone 555.012 3456`, `555/012-3456`, `555)012-3456`,
  `555•012•3456`, `900·12·3456`, `900_12_3456`, and refuses none of `97110   1   1200.00`, `Page 1 of 2   97110 1
  150.00`, `Claim lines 1 2 3 4 5 6 7 8 9`, `Paid $150.00 2026-11-01`, `DOS 11/01/2026 97110 GP 1`,
  `Billed 150.00⏎2026-11-01`, `20261101⏎1`, `97110⏎1500 units`, `Codes 97110 97140 97530 G0283`, nor any must-stay row
  of the probe. Its errors are refusals (the letter goes by hand), never leaks, and it turns any later gap in the
  patterns into a refusal. Not taken: the first review's form (any white space up to 20 characters, any number of
  groups, no barriers), which refused service-line tables and `Paid $150.00 2026-11-01`. Costs: 15.12, risks 14.7-14.8.
- **R8. Section 3.1's claim corrected** (F9, made inline): a dashed 4-3-3-4 chain reads its last ten as a phone (15.3).
- **R9. Tests close the generators' blind spots (F8).** MOD-16's `keptLetter` joins segments also with one space, a
  line break, CRLF with indentation, and nothing between two number cells; writes an amount immediately before a date,
  a four-digit number and another amount; writes service-line rows (`97110   1   1200.00`, `Page 1 of 2   97110 1
  150.00`), a slashed date before a code (`11/01/2026 97110 GP 1`), number columns joined by line breaks (`20261101⏎1`,
  `97110⏎1500`), an NPI or TIN after `MEDICARE` or `CONTACT`, keep-nouns with connectors (`Reference no.:`, `Tax ID
  number`), and one row per survivor-scan barrier and exception (each asserted not refused). MOD-15's writers add a line
  break (with and without a dash and indentation) inside a group, CRLF with indentation between groups, Arabic-Indic and
  Devanagari phones, a digit and an invisible run before the number, mixed period and dash phones (`555.012-3456`,
  `555-012.3456`), comma lists with no space (`900-12-3456,900-55-1234`, `555-012-3456,555-019-8765`), cross-kind
  labels, a keep-noun beside a label, a keep-noun that does not name the number (C6), the masked forms of R12, and the
  survivor forms of R7 (asserted refused). The unlabeled-bare writer puts a digit-bearing filler or a barrier before the
  number, so a keep-noun from the previous segment never reaches it unrecorded (the oracle and the window would
  otherwise disagree by chance). Every row of `review/attack-table.tsv`, `review/real-table.tsv` and the second
  prototype's `run.mjs` and `f12.mjs` is a named row in `denial-letter.test.ts`. The 60-seed run stays.
- **R10. Smaller (F10, F11).** (a) `Redacted` stays as it is; the candidates come from a module-internal
  `redactLetterForScreen` used only by `denial-letter.ts` and not exported from `index.ts`, so the PHI list is not part
  of the package's public type (`redactLetter` returns `redactLetterForScreen(...)` without them). (b)
  `verifyDenialLetter` rejects a claim reference that **contains** a placeholder without being exactly one of the
  call's claims (`ZZ[SSN]`, `1234-[PHONE]`) as `unknown_claim` (today's check at denial-letter.ts:143 tests only a
  whole bracketed token).
- **R11. phi-guard (C4).** Section 3.1's paragraph. A named test in `src/redact.test.ts` writes phi-guard's SSN and
  phone examples with area codes 2-9 (`900-12-3456`, `(555) 012-3456`, `(555)012-3456`, `555.012.3456`, `555 012
  3456`, `555-012 3456`), asserts `textPhiFindings` (from `@tp/observability`, already a dependency) flags each, and
  asserts `redactLetter` redacts each; `555.012 3456` (a period with a space, which phi-guard flags) is asserted
  refused by the self-check instead (R1a, R7). The intended differences (area 0 or 1; 11- to 14-digit runs) are pinned
  the other way: kept by the letter.
- **R12. Rare forms (F12).** Built: `MASK` gains `#` and `_` (`SSN ###-##-3456`, `SSN ___-__-3456`); a mask may follow
  an SSN label with no space (`SSNXXX-XX-3456`); five mask characters and four digits after an SSN label
  (`SSN *****3456`) are `[SSN]`; the scan's joiners take `/`, `)`, `•`, `·` and `_`, so `555/012-3456`,
  `555)012-3456`, `555•012•3456`, `900·12·3456` and `900_12_3456` are refused. Still sent, recorded in the ADR's "Still
  not covered": `Patient 15550123456` (an unlabeled `1` plus ten as one run, kept as an 11-digit ICN is, 3.3.6),
  `Phone 1: 555-0100` (a digit in a local seven's label window), and `555-012-3456555-012-3457` (two phones with nothing
  between them; the scan's five-digit-group exception lets it through, and narrowing that exception would refuse CPT
  ranges such as `97110-97546`).
- **R13. Records and tests the change list missed (C1, C2, C5, C8, C9, C10).** #75's N6 property and its pinned rows
  (10.3, step 5); ADR 0070 N6's dated sentence, the `OtherPatientCheck` and `letter-records.ts` comments (section 11,
  steps 2 and 7); build step 0 against #75's merged state, insertions by key (section 13, 10.4); `toMatchObject` and
  MOD-14's `candidates` line (10.2, 10.3); the corrected claims about exports and `lint:logs` (section 5); #80's residual
  sentence left as decided and superseded by the new amendment (section 11), with logging of `prepare` refusals as
  proposal 16.10.

**Time, with the rules above.** The second prototype (crude, unoptimized, this container under another workload) took
17 to 381 ms per 100 kB for redaction plus survivor scan over the crafted letters (phones, SSNs, `555 012 3456` chains,
a 100 k digit run, `5-`, `5<ZWSP>`, `5⏎    ` and `5--⏎  ` repeated, nine-digit runs, `Phone ` before digits,
`$150.00 2026-11-01` repeated); every added piece is bounded (16-character indentation, two dashes, a 64-character
window, chains read once), so section 8's bound and the 3 s budget's headroom stand. The named time tests gain the
`5⏎    `, `5--⏎  ` and amount-before-date letters.

## 18. Design review (one reviewer, a completeness critic, two-lens verification)

Run 2026-11-01 on this design and the read-only worktree at 871faff9, synthetic data only. The reviewer reproduced
defects by running the Appendix A patterns and the real redactor; the completeness critic checked the design against
the code, the docs and the item's requirements; each finding was then checked by two verifiers, one through a security
lens and one through a correctness lens. No finding was refuted by either verifier. Where a verifier gave a better fix,
it was taken (for security, the safer of the two); the one place a verifier's better fix was not fully taken is F4's
`CONTACT` limit, for the reason in 15.11.

| Id | Severity | Finding | How it was applied |
|---|---|---|---|
| F1 | blocking | A period gap and a space gap combine across an amount and the next number (`$150.00 2026-11-01` sent `$[SSN]-11-01`) | R1 in both verifiers' narrower form: a period never sits with white space; amount guards (cents only after) only on a match with a white-space gap; comma lists and mixed period-dash phones stay redacted; MOD-15 and MOD-16 rows (R9); cost 15.10 |
| F2 | blocking | A line break with indentation, or inside a group, lets a number through, and the self-check passes it | R2: `[\s\u0085]`, breaks with up to 16 spaces or tabs, `DASH{1,2}`, in-group break in shaped and labeled bare groups only (correctness lens), extended boundaries only on a labeled bare match that crosses a break (so a phone before a numbered line is still read) |
| F3 | blocking | The self-check is the same matcher, so it refuses no form the patterns miss | R7: an independent survivor scan with barriers (dates, amounts, named runs; correctness lens), chains of one to four groups with bounded joiners and the five-digit-group exception (security lens); no-refusal rows in MOD-16; 15.12, risks 14.7-14.8 |
| F4 | blocking | A label of the other kind, or a nearer keep-noun, keeps an SSN- or phone-like number | R5: label beats keep-noun; NPI (Luhn) and TIN/EIN/TAX ID named directly always kept; `MEDICARE` labels nines only; `CONTACT` kept as a full label (safer than the verifier's narrower form); 15.8, 15.11 |
| F5 | should fix | Phones in other scripts' digits leak | R3 (`digits` view); 15.5 narrowed; ADR residual narrowed |
| F6 | should fix | A digit and an invisible run before the number hide it | R4 (join and space readings, self-check too); section 7 corrected |
| F7 | should fix | MOD-14: another patient's SSN-shaped ID is lost when the call's own short number matches inside it | R6 (a)-(c), with the correctness lens's clarifications: "contained and not equal", partial overlap lends rank, the span extends over a joined own token |
| F8 | should fix | The test plan's generators cannot catch F1, F2, F4, F5, F6, and can flake | R9, extended with both verifiers' rows (comma lists, mixed separators, service-line tables, number columns, `MEDICARE`/`CONTACT` before an NPI or TIN, one row per scan barrier) |
| C1 | should fix | #75's N6 property and ADR 0070 N6 become untrue | 10.3 and step 5: expectation `letterReads \|\| wroteSsnOrPhoneShape`, pinned rows; ADR 0070 N6 dated sentence (section 11). Recorded that the flake is near zero (280 000 samples, none), so this keeps the claim true |
| C2 | should fix | Docs describing the screen's input as runs of the redacted letter are not in the change list | Section 11 and steps 2, 7, 8: `OtherPatientCheck` doc, `letter-records.ts` header (comment only; a watched path), ADR 0070 N6 |
| C3 | should fix | A payer letter misfiled as a contract reaches a model with SSNs and phones intact, unrecorded | Section 2 paragraph; ADR "Still not covered"; 15.16; proposal 16.8 in the correctness lens's form (never a white-space 3-2-4, never a phone) |
| C4 | should fix | phi-guard's SSN and phone shapes are not mentioned | Section 3.1 paragraph (why separate, intended differences); R11's named test in the security lens's precise one-way form; proposal 16.9 |
| C5 | should fix | The plan assumes #75's merged state without checking it | Build step 0 (diff against 871faff9, re-run the probe and prototype if the gateway changed, insert by key, record the result); 10.4 note; risk 14.5 |
| C6 | should fix | A keep-noun shields a phone or SSN it does not name | R5(a): connectors only, repeatable, with plurals (correctness lens); 15.15 |
| C7 | should fix | Three trade-offs missing from "For the co-founder" | 15.13 (glued-name refusal), 15.14 (bare ZIP+4), 15.15 (keep-noun names the number); and the F3/F4 refinements in 15.11-15.12 |
| F9 | nit | 3.1 claimed the digit rule keeps 4-3-3-4 out | Corrected inline (R8); 15.3 |
| F10 | nit | Candidates would join the exported `Redacted` type | R10a (`redactLetterForScreen`, not exported); section 5 and 10.2 follow it |
| F11 | nit | The verifier accepts a reference containing a placeholder fragment | R10b; 15.17 |
| F12 | nit | Rare forms unread and unrecorded | R12: masks with `#`, `_`, glued to an SSN label, `*****3456` built; `/ ) • · _` scan joiners (refused); the rest listed in the ADR's "Still not covered" |
| C8 | nit | 10.2's equality and MOD-14's property do not match the new shape and input | 10.2 `toMatchObject`; MOD-14 property checks the screen's candidates (10.3) |
| C9 | nit | Two claims in section 5 slightly wrong (what index.ts exports; what lint:logs checks) | Section 5 reworded: the message guarantee is the literal and the no-digit test |
| C10 | nit | The in-place edit of #80's residual sentence breaks the amendment convention; prepare refusals unseen | #80's sentence left as decided, the new amendment says SSNs and phones are no longer residuals (section 11); proposal 16.10 |

**Refuted by both verifiers:** none. Every finding stands; no finding was set aside.

## Appendix A. The patterns, as code (to be built; amended by section 17)

The first prototype ran the shape below; the second (scratch `apply/refined.mjs`) runs section 17's rules. Where they
differ, section 17 holds; the pieces it changes are marked.

```ts
// Over the folded 'digits' view (R3: upper case; every \p{Nd} its ASCII value; an invisible run is VANISHED, U+00AD,
// on the join reading, or a space on the space reading, R4; both are read).
const PATTERN_DIGIT = '\\d';
const INDENT = '[ \\t]{0,16}';
const BREAK = `(?:\\r\\n|[\\n\\r\\u0085\\u2028\\u2029])`;                                   // R2 (LINE_BREAK, :327)
const PATTERN_DASH = '[\\p{Pd}\\u2212\\u2043]{1,2}';                                          // R2: one or two
/** R2(b): between two digits of a group; `wrap` only in shaped and labeled bare groups. */
const IN_GROUP = (wrap: boolean) => wrap ? `(?:\\u00AD|(?:${PATTERN_DASH})?${INDENT}${BREAK}${INDENT})` : '\\u00AD';
const group = (n: number, wrap: boolean) => `${PATTERN_DIGIT}(?:${IN_GROUP(wrap)}?${PATTERN_DIGIT}){${String(n - 1)}}`;
/** R1(a), R2(a): gap kinds. A period never pairs with white space. */
const GAP_DASH = `\\u00AD?(?:[ \\t]{0,2}|${INDENT}${BREAK}${INDENT})${PATTERN_DASH}(?:[ \\t]{0,2}|${INDENT}${BREAK}${INDENT})\\u00AD?`;
const GAP_SPACE = `\\u00AD?(?:[ \\t]{1,3}|${INDENT}${BREAK}${INDENT})\\u00AD?`;
const GAP_PERIOD = '\\u00AD?\\.\\u00AD?';
const GAP_INVISIBLE = '\\u00AD';
/** R1(b): only a match with a GAP_SPACE takes these. */
const SPACED_GUARD_BEFORE = `(?<!${PATTERN_DIGIT}[.,])`;
const SPACED_GUARD_AFTER = `(?![.,]${PATTERN_DIGIT}{1,2}(?!${PATTERN_DIGIT}))`;
const CURRENCY_GUARD = '(?<!\\p{Sc}\\s?)';                                                   // every shaped match
const NO_DIGIT_BEFORE = `(?<!${PATTERN_DIGIT}\\u00AD?)`;
const NO_DIGIT_AFTER = `(?!\\u00AD?${PATTERN_DIGIT})`;
/** R2(c): for a labeled bare match that crosses a break. */
const NO_DIGIT_ACROSS_BEFORE = `(?<!${PATTERN_DIGIT}(?:${PATTERN_DASH})?${INDENT}${BREAK}${INDENT})`;
const NO_DIGIT_ACROSS_AFTER = `(?!(?:${PATTERN_DASH})?${INDENT}${BREAK}${INDENT}${PATTERN_DIGIT})`;
const MASK = '[X*#_\\u2022\\u25CF]';                                                         // R12: # and _
const HICN_SUFFIX = `(?:${PATTERN_DASH}?[A-Z][A-Z0-9]?(?![\\p{L}\\p{N}]))?`;
const EXTENSION = `(?:\\s{0,2}[,;]?\\s{0,2}(?:EXT(?:ENSION)?|X|#)[.:]?\\s{0,2}${PATTERN_DIGIT}{1,6})?`;
const AREA = `[2-9](?:${IN_GROUP(true)})?${PATTERN_DIGIT}(?:${IN_GROUP(true)})?${PATTERN_DIGIT}`;
const BARE_GUARD_BEFORE = `(?<!\\p{Sc}\\s?)(?<!${PATTERN_DIGIT}[.,])`;
const BARE_GUARD_AFTER = `(?![.,]${PATTERN_DIGIT})`;

/**
 * A shaped a-b-c: every pair of gaps but period with white space (R1a); the pairs with a GAP_SPACE wrapped in the
 * spaced guards (R1b); CURRENCY_GUARD on all. Built once at module load, a fixed alternation.
 */
function shaped(a: string, b: string, c: string): string { /* as scratch apply/refined.mjs `shaped` */ }

// Each has one capture group, the core (nine SSN or ten phone digits), for 4.2 and section 5.
const SSN_SHAPED = new RegExp(`${NO_DIGIT_BEFORE}(?:${shaped(group(3, true), group(2, true), group(4, true))}|(?:(?<![\\p{L}\\p{N}])|(?<=${SSN_LABEL_GLUED}))${MASK}{3}(?:${GAP_DASH}|${GAP_SPACE}|${GAP_PERIOD})${MASK}{2}(?:${GAP_DASH}|${GAP_SPACE}|${GAP_PERIOD})${group(4, true)}|(?<=${SSN_LABEL_BEFORE})${MASK}{5}${group(4, true)})${HICN_SUFFIX}${NO_DIGIT_AFTER}`, 'gu');
const PAREN = `\\(\\s?${AREA}\\s?\\)(?:[ \\t]{0,2}|${INDENT}${BREAK}${INDENT})(?:${PATTERN_DASH}[ \\t]{0,2})?${group(3, true)}(?:${GAP_DASH}|${GAP_SPACE}|${GAP_PERIOD}|${GAP_INVISIBLE})?${group(4, true)}`;
const PLAIN = shaped(AREA, group(3, true), group(4, true));
const PHONE_SHAPED = /* as before, over PAREN and PLAIN; the "+1" and "1" prefixes take GAP_DASH, GAP_SPACE or GAP_PERIOD */;
/** Bare: the unlabeled form never wraps (R2b); the labeled form is a second regex with group(n, true) and the across-boundaries. */
const SSN_BARE = new RegExp(`${NO_DIGIT_BEFORE}${BARE_GUARD_BEFORE}(${group(9, false)})${HICN_SUFFIX}${NO_DIGIT_AFTER}${BARE_GUARD_AFTER}`, 'gu');
const PHONE_BARE = new RegExp(`${NO_DIGIT_BEFORE}${BARE_GUARD_BEFORE}(?:1(?:${GAP_DASH}|${GAP_SPACE})?)?(${group(10, false)})${EXTENSION}${NO_DIGIT_AFTER}${BARE_GUARD_AFTER}`, 'gu');
const PHONE_LOCAL = new RegExp(`(?<=^|[\\s:(\\u00AD])(${group(3, true)}(?:${GAP_DASH}|${GAP_SPACE}|${GAP_PERIOD})${group(4, true)})${EXTENSION}${NO_DIGIT_AFTER}`, 'gu');

const SSN_WORDS = '\\bS\\.?\\s?S\\.?\\s?N\\b|\\bSS\\s?#|\\bSS\\s?NO\\b|\\bSOC(?:IAL)?\\.?\\s*SEC(?:URITY)?\\b|\\bHICN?\\b';
const MEDICARE_WORD = '\\bMEDICARE\\b';                                                      // R5(d): nines only
const PHONE_WORDS = `\\bPHONE|\\bPH\\b|\\bTEL(?:EPHONE)?\\b|\\bFAX\\b|\\bFACSIMILE\\b|\\bCALL(?:ING|ED|S)?\\b|\\bTTY\\b|\\bTDD\\b|\\bTOLL${PATTERN_DASH}?\\s?FREE\\b|\\bCELL\\b|\\bMOBILE\\b|\\bCONTACT\\b`;
const KEEP_WORDS = '\\b(?:CLAIMS?|ICN|DCN|REF|REFERENCE|APPEAL|CASE|NPI|TIN|EIN|TAX\\s?ID|CHECK|EFT|TRACE|CONTROL|INVOICE|AUTH|AUTHORIZATION|ZIP|GROUP)\\b';
/** R5(a): what may stand between a keep-noun and the number it names. */
const CONNECTORS = '^(?:[\\s:#.\\-]|\\(S\\)|\\bNO\\b|\\bNUMBERS?\\b|\\bNBR\\b|\\bNUM\\b|\\bID\\b)*$';

/** An NPI's check digit (Luhn over the 80840 prefix and the first nine digits). */
function npiCheckDigitValid(ten: string): boolean { /* as the prototype */ }

/** R5: 'keep' | 'ssn' | 'phone' | 'none' for a bare number, from its window (3.4). */
function decideBare(window: string, digits: string): 'keep' | 'ssn' | 'phone' | 'none' { /* as scratch apply/refined.mjs `decide` */ }

/** R7: true when a survivor chain is left; the masked text's digits view, invisible runs dropped, both readings. */
function survivorLeft(masked: string): boolean { /* as scratch apply/refined.mjs `survivor`, with datesIn for dates */ }

function patternMatchesIn(view: View, found: readonly Found[], own: ReadonlyMap<string, { kind: 'claim' | 'member'; claim: number }>): Found[] {
  // On both readings (R4): the shaped patterns first, then the bare ones. For a bare match, the window on the view text
  // from the later of (start - 64), the end of the last match found before it (the call's own, `found`, and the shaped
  // matches) and the last BARRIER, up to start (3.4); decideBare (R5); the unlabeled rules (3.2.4, 3.3.5). Then
  // range = inNormal(view, start, end); compacts = [whole, core, joined either side] (R6c); the own kind of the first
  // compact `own` holds (4.2, extending the range over a joined token), else 'ssn' or 'phone'. "The last match before
  // it" is a binary search over the found ranges sorted by end with a running maximum (firstIndex, :658), so the bare
  // matches stay linear.
}
```

The first prototype (scratch `designer/proto.test.ts`; it read the label window without ending it at earlier spans,
which changes no probe row) read every probe row as section 3.6 says. Two of its readings shaped the design:
`Total 1 234 567 8901 units` (a spaced-thousands amount, not how a US letter writes one) is read as `1` plus a phone,
accepted since the reader extracts no amount; and `Fax⏎5550123457` was missed until the label window crossed one line
break (3.4). The second prototype is cruder than the build will be (its date barrier is a regular expression, not
`datesIn`; it reads the 1-plus-ten rule more strictly than 3.3.6) and is evidence for the rules, not their oracle.
