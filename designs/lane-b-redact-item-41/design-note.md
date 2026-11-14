<!-- RESUME-BLOCK
Queues item 41, Lane B designer. A measured design note only (no product build, no PR). State: done, with the rulings
below open. Two runs were not finished after container restarts, and none bears on a recommendation: the gate of
variant j against head (j is not recommended), and the gate of the phone pass (it already fails the bar on the
sweeps). The gate of variant k against base: see "Gate" under (b).
Scripts: scripts/ (lay41.sh lays every tree, protos41.py the three prototypes, measure41.sh runs gen40, gate,
unseen, residuals and sweeps; widened.mts, phone-sides.mts and nel-or-ellipsis.mts the widening). Counts: measure/.
Synthetic rows stay in the scratch root, never in the repo.
-->
# Queues item 41: mending a letter's text at extraction, the in-product count, and the widened residuals

Lane B, 2026-11-13/14.

**What was measured.** Base 4d40557f (its reader is byte for byte 17c234d2's, sha256 3b34d2a2...) and item 40's head
`co-001/wip-redact-item-40` (reader bfd54281..., ref and hashes in `measure/trees.sha256`). Synthetic values only:
- item 40's generated set: 51,833 letters, 1,425 patients, seed 40;
- the gate's 975,489 letters, of which 94 hold a C1 character, all U+0085.

**How.** Nothing in `packages/` is written. `scripts/lay41.sh` lays each reader outside the checkout as `redact-core.ts`,
behind a `redact.ts` that applies one text function first (`scripts/mend.ts`), as extraction would. The reader's rules
are untouched. Item 40's runners are called, not copied:
- `generated-run-40.mts`;
- `stage-2/every.mts`, `stage-3/every-unseen.mts` and `stage-4/other-names.mts`;
- the gate's `run.sh`.

**The bar.** Nothing the reader A redacts or refuses may be shown or sent by B. "Sent" means sent in clear: the
runners' PHI classes.

## Where a letter's text enters the reader

There is one choke point: `readDocumentPages` (`packages/contracts/src/evidence/pages.ts:578`). It serves two callers:
- intake: `apps/worker/src/intake/pages.ts` `readAndStorePages` serializes the pages into the sealed page-text object
  at `documentPagesKey`, written only if it is absent;
- the evidence resolver (`pages.ts:614`).

C1 characters come from two places:
- `csvText` (`page-reader.ts:302`) falls back to `Buffer` `latin1`, which turns each byte 0x80-0x9F into the C1 code
  point of the same number;
- a PDF's text (pdfjs `getTextContent`, `page-reader.ts:101`), when its font maps Windows-1252 bytes that way.

`normalizePageText` (NFKC, white space collapsed) feeds `pageTextHash`, which every citation carries.

## (b) Mending as the item writes it fails the bar

`mendExtracted` turns U+0085 into a line break and each other C1 character into its Windows-1252 character. The five
undefined bytes stay as they are. It swaps one code unit for one, so offsets and spans stay valid.

| generated set 40 | letters changed | refused A | refused B | sent in clear by B (bar rows) |
| --- | --- | --- | --- | --- |
| base : base-m | 769 | 2,366 | 2,447 | 10 names |
| base : head-m | 9,261 | 2,366 | 8,198 | 22 (20 probe names, 2 numbers) |
| head : head-m | 728 | 8,570 | 8,198 | 317 (claim 88, DOB 79, member 56, phone 36, SSN 36, name 10) |

The cause is the mending itself. A C1 that item 40 reads as an unseen character, and refuses inside an identifier,
becomes a visible character the reader does not count as part of one:
- A letter glued to a name (Š š Ž ž Œ œ Ÿ ƒ ˆ ˜ ™) ends the name's match. `ZEPHYRAš` is no longer the surname.
- A `€`, a quote, a dash or `…` inside a number splits it into two runs, and neither run is the stored number.

Item 40's unseen sweep (35,154 forms) shows the same: 0 sent in clear on head, 4,578 on head-m.

U+0085 alone (`measure/nel-or-ellipsis.out`, 20 forms; hidden / clear / refused):

| U+0085 read as | hidden | clear | refused |
| --- | --- | --- | --- |
| a line break | 16 | 1 | 3 |
| `…` | 15 | 3 | 2 (`3007…2299` sends the member ID) |
| left as it is | 10 | 1 | 9 |

## (b) The design that holds: variant k

The text functions measured, each as what the reader reads:

| reader's text | against base | against head | given back of item 40's 52 | unseen sweep, sent in clear |
| --- | --- | --- | --- | --- |
| n: every C1 a line break | holds | **64 DOB sent** | 52 | not run |
| s: every C1 a space | holds | **64 DOB sent** | 52 | not run |
| d: n, except a C1 between digits is left as it is | holds | holds | 0 | **224** |
| j: C1 a kept break; the check also reads the text joined | holds | holds | 4 | 0 |
| **k: n, falling back to the unmended reading (below)** | **holds** | **holds** | **52** | **0** |

- **Why n and s fail.** n's 64 are `03/1?4/1980` and `March 1?4, 1980`, with any of the 32 C1 characters between two
  digits. The break splits the date, and neither half is a date.
- **Why d and j give back little.** Every one of item 40's 52 real-shaped refusals has its C1 between two digits:
  `97110–97112`, `150.00⏎01/05/2026`, `30072299⏎01/05/2026`. d leaves those runs alone and so still refuses them. j's
  joined reading refuses them on a phone- or SSN-shaped pattern: `97110` and `97112` joined is ten digits.

**How k works.** For a letter with no C1 nothing changes. Otherwise the reader reads the text twice:
1. with every C1 as a line break;
2. with every C1 taken out.

If reading 2 replaces more of the patient's **stored** identifiers than reading 1 does (date of birth, member ID, name,
claim: every placeholder except the pattern-found `[PHONE]` and `[SSN]`), a C1 split one of them. The letter is then
read as item 40 reads it, unmended, which refuses it. Pattern-only finds on the joined text do not count. A split SSN
or phone is already refused on reading 1, as n's zero SSN and phone failures show. The functions are
`readerTextBreaks`, `withoutC1` and `storedFoundOnlyJoined` in `scripts/mend.ts`, and the wrapper is in `lay41.sh`.
In the product this belongs inside the reader's entry, not in a wrapper.

**k measured:**
- Generated set against head: 748 letters change, 432 newly sent with every stored value hidden, 0 newly refused,
  0 failures, no PHI class.
- Against base: 0 failures, no PHI class. The 5,772 letters base sends and k refuses are item 40's own refusals, less
  the 432.
- Item 40's 52 real-shaped refusals: all 52 given back, all sent with the member ID replaced. They are code range 16,
  no identifier 16 and 16, and number then date line 4.
- Unseen sweep: sent in clear 0, hidden 13,464 (head 5,334), refused 20,295 (head 28,425).
- Gate against head: none of the 975,489 letters differ (`measure/gate-head-head-k.report.md`). The gate against base
  is PENDING_KBASE.
- Time: the slowest generated-set letter took 28 ms (n: 25 ms). A letter with a C1 is read three times. The gate's
  timing cases hold no C1: their maximum is 956 ms against a 3,000 ms budget.

**Where the text lives, and what a person sees:**
1. **Stored**: the page text exactly as extracted. The sealed page-text object, `pageTextHash` and every citation are
   unchanged, so nothing already cited moves and the original bytes stay the evidence. There is no second stored copy.
2. **What the reader reads**: k's text, derived from (1) on every read. It is never stored or hashed, and never goes
   to a model unredacted.
3. **What a person sees**:
   - the redaction review shows the reader's output, with a line break where the C1 was;
   - the document view shows (1) through `mendExtracted` at render time, so `’ “ ” – — …` read as the payer wrote them.

   Both functions keep length, so a span on (2) is the same span on (1) and (3), and the redaction a person reviews
   lines up with the text they read.

**Decoding.** `csvText`'s fallback should decode with `new TextDecoder('windows-1252')`:
- In WHATWG Encoding, `latin1` and `iso-8859-1` are labels of windows-1252. Node 24.22.1 decodes 0x80-0x9F correctly;
  the regression in issue #60888 is not present.
- New CSV text then holds no C1 at all. 0x85 is decoded as `…`, the wrong reading for mainframe text, so k still runs
  on every page.
- Stored text is not re-extracted.

**Not measured.** The text of a real PDF with a 1252 font map: no synthetic PDF of that kind exists yet.

## (a) The in-product count, before real PHI

- **What**: for each page-text object, the occurrences of each code point U+0080-U+009F (`c1Counts`). They are counted
  once, when intake stores the pages, in the same job and transaction. IDs and counts only (practice, document, code
  point, count): no character context, no text.
- **Where**: a table `page_text_character (practice_id, source_document_id, code_point, occurrences)`.
  - It has FORCE ROW LEVEL SECURITY, and the app role owns nothing.
  - The payer is not stored. It is read through `source_document.filed_for_submission_id` → submission → payer, and
    shown as "payer not yet known" until the letter is filed.
  - It is a migration: a schema PR that needs the founder's approval of the regenerated domain model.
- **Who sees it, and how**: an operator, on `/console/models` beside the denial-letter flag, counts only.
  - It follows `console_model_spend`'s precedent (`apps/web/src/lib/routes/console-models.ts`), with an audited read.
  - It shows letters holding a C1, by code point and by payer.
  - No practice user sees it, and nobody can open a letter through it.
- On the synthetic sets: the generated set has 912 letters with a C1, every code point 21 to 117 times (U+0085 117,
  U+0093 to U+0096 85). The gate has 94, all U+0085 (`measure/residuals-head.out`).

## The three residuals the brief names

| residual | on head | if taken now | recommendation |
| --- | --- | --- | --- |
| unstored phone (item 40's every-identifier sweep) | clear 11,285, refused 255 | phone pass: clear 11,540, refused 0 | not in this item |
| `Name.X.` chain (`Maria.M.L.`), other-names sweep | clear 176,448 of 453,888 | (f): clear 58,904 | take (f) |
| undotted last initial before a lower-case word | 28 of S-5's 540 left on head-s5; 6 sent gate letters | neither prototype reaches it | not in this item |

- **Unstored phone.** The only measured option is the phone pass, and it sends the 255 that head refuses (below).
  Neither corpus has a sent letter with a phone-shaped run beside a number character (`residuals-head.out`: 0 and 0).
- **Undotted last initial.** A lone capital before a lower-case word reads as English as often as it reads as an
  initial. Taking it needs the patient-initial test (f) uses, plus a rule for sentence starts. That is a design of
  its own.

## The widening (orchestrator, 19:54 UTC)

### S-5

`measure/widened.out`, 540 forms:
- the name written five ways;
- J and Q with eight unseen characters before the period, or `/`, `:`, `·` or `。` as the joiner;
- three frames.

**Mending does not close it.** 540 of 540 send the initials on base, head, head-m, head-n and head-d. A C1 read as a
break leaves the initial standing, and U+200B, U+00AD, U+2060 and U+0000 are not C1.

**The prototype head-s5** (`scripts/protos41.py`): `periodAt` skips `\p{Cc}\p{Cf}` before the period, and the four
joiners join.
- It hides 512 and leaves 28: `Name/J/Q` with the last initial undotted, and a comma then a joiner (`Zephyra,/J/Q`).
- Generated set: 0 letters differ. Gate: 0 of 975,489 differ, no KEEP.
- Sentence starts: 0 of 25 change.
- The extra joiners cost nothing measured.

### Phone, ruling (c)'s caveat

`measure/phone-sides.out`, 135 forms: ↀ ① ¹ ½ Ⅳ before, inside or after three phone shapes.

| side | head: refused / clear | the pass: hidden / clear |
| --- | --- | --- |
| after the number | 27 / 18 | 25 / 20 |
| before it | 20 / 25 | 25 / 20 |
| inside it | 8 / 37 | 35 / 10 |

Side decides less than the caveat says.

**The reviewer's pass** reads number characters touching or inside a phone-shaped run as spaces, before NFKC.
- It hides 85 and sends 50. 5 that head refused are sent in clear: `½` beside a seven-digit phone becomes a space, and
  the bare phone is the unstored residual again.
- On item 40's every-identifier sweep it sends the 255 that head refuses.
- Generated set: 1,752 letters newly sent, all with the number hidden (`⅓5913242` → ` [MEMBER_ID]`). That makes 72
  expectation failures and no PHI class.
- **It fails the bar.**

### Ruling (f)'s cheap partial fix

Take `Name.X.` only when another period follows; take an undotted capital after an initial already taken, except A, I
and O.
- Other-names sweep: clear goes from 176,448 to 58,904.
- Generated set: 0 differ. Gate: 0 of 975,489 differ, no KEEP.
- Sentence starts: 10 of 25 change, every one hiding a patient initial (`Zephyra.J.Q.`, `Okafor.A.I.`, `Zephyra J.Q`).
  - Two of them may also hide a letter that isn't the patient's: `Zephyra. J. Smith called` and
    `Zephyra J. Q is the code`. That over-redacts on the safe side.
  - A, I and O stand: `Okafor.I am writing` is unchanged.

## Side findings

- A surname glued to the word before it (`Paid in fullZEPHYRA`) is sent on head and under every mending choice:
  item 40's name match needs a boundary before the surname. This is not item 41's; it is a queue item.
- U+FFFC inside a stored number is item 40's fix round's, as ruled.

## Prior art (5 tool calls)

- **ftfy** (`fix_c1_controls`, Apache-2.0, python-ftfy 6.3.1) maps C1 to Windows-1252 the same way as `mendExtracted`.
  It is a display repair and knows nothing about what a redactor counts as an identifier. That gap is this note's
  finding. No code copied.
- **WHATWG Encoding**: `latin1` is a label of windows-1252, in browsers and in Node's `TextDecoder`.
- **Node issue #60888**: windows-1252 decoding of 0x80-0x9F regressed in v20.18.3 and v22.13.0. It is not present in
  v24.22.1 here.

## Questions for a ruling

1. Mending as written (b)? Recommend no: it fails the bar (22 against base, 317 against head). Cost: none.
2. Variant k as the reader's text: line breaks, a stored-identifier join check, the unmended reading on a mismatch?
   Recommend yes: it holds both bars and gives back 52 of 52. Cost: one function in the reader's entry, and three
   reads of a letter with a C1 (slowest 28 ms).
3. Store as extracted, with the 1252 view only at render and never stored? Recommend yes. Cost: one render function;
   no hash or citation moves.
4. `csvText` decodes with `TextDecoder('windows-1252')`? Recommend yes. Cost: a one-line change, and new CSV pages
   hash differently from the latin1 reading; stored pages are unchanged.
5. (a) the count as `page_text_character`, shown counts-only on /console/models? Recommend yes, before real PHI. Cost:
   one schema PR (the founder's domain-model approval), one intake write and one audited read.
6. S-5: take head-s5 (`periodAt`, plus `/ : · 。` as joiners)? Recommend yes. Cost: 4 edits; 0 gate or generated
   letters change; 28 of 540 left for the undotted item.
7. The phone pass of ruling (c)? Recommend no: it fails the bar (255 + 5). Cost: none. The 11,285 residual stays open
   for a pass that refuses instead of spacing.
8. Ruling (f)'s partial fix? Recommend yes. Cost: 2 edits; 0 gate or generated letters change; 2 of 25 sentence-start
   forms over-redact a non-patient letter.
9. The undotted last initial before a lower-case word? Recommend a later item of its own. Cost now: 28 S-5 forms and
   6 gate letters stay sent.
10. The glued surname (`fullZEPHYRA`)? Recommend a queue item for item 40's name match. Cost: none now.
