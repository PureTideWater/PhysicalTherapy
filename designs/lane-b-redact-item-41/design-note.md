<!-- RESUME-BLOCK
item 41, Lane B designer; a measured design note only (no product build, no PR). State: PENDING_STATE.
Scripts: scripts/ (lay41.sh lays the trees, protos41.py the three prototypes, measure41.sh runs gen40, gate, unseen,
residuals and sweeps; widened.mts, phone-sides.mts, nel-or-ellipsis.mts for the widening). Counts: measure/.
Synthetic rows stay in the scratch root (never in the repo). Next: answer the rulings below; nothing else is open.
-->
# Queues item 41: mending a letter's text at extraction, the in-product count, and the widened residuals

Lane B, 2026-11-13. Base 4d40557f (its reader is byte for byte 17c234d2's, sha256 3b34d2a2...) and item 40's head
`co-001/wip-redact-item-40` at the ref in `measure/trees.sha256` (reader bfd54281...). Synthetic values only (item 40's
generated set: 51,833 letters, 1,425 patients, seed 40; the gate's 975,489 letters). Nothing in `packages/` is
written: `scripts/lay41.sh` lays each reader outside the checkout as `redact-core.ts` behind a `redact.ts` that applies
one text function first (`scripts/mend.ts`), as extraction would, so the reader's rules are untouched. Item 40's
runners are called, not copied (`generated-run-40.mts`, `stage-2/every.mts`, `stage-3/every-unseen.mts`,
`stage-4/other-names.mts`, the gate's `run.sh`). The bar throughout: nothing the reader A redacts or refuses may be
shown or sent by B.

## Where a letter's text enters the reader

One choke point. `readDocumentPages` (`packages/contracts/src/evidence/pages.ts:578`) serves both intake
(`apps/worker/src/intake/pages.ts` `readAndStorePages`, which serializes the pages into the sealed page-text object at
`documentPagesKey`, written only if absent) and the evidence resolver (`pages.ts:614`). The C1 characters come from
two places: `csvText` (`page-reader.ts:302`) falls back to `Buffer` `latin1`, which turns every byte 0x80-0x9F into the
C1 code point of the same number; and a PDF's own text (pdfjs `getTextContent`, `page-reader.ts:101`) when the PDF's
font maps a Windows-1252 byte that way. `normalizePageText` (NFKC, white space collapsed) feeds `pageTextHash`, the
hash a citation carries.

## (b) Mending as the item writes it fails the bar

`mendExtracted`: U+0085 becomes a line break, a C1 character becomes its Windows-1252 character, the five undefined
bytes (0x81, 0x8D, 0x8F, 0x90, 0x9D) stay. One code unit for one, so every offset and span stays valid.

| pair (generated set 40) | letters changed | refused A | refused B | sent by B that A hid or refused |
| --- | --- | --- | --- | --- |
| base : base-m | 769 | 2,366 | 2,447 (81 newly refused) | 10 names |
| base : head-m | 9,261 | 2,366 | 8,198 | 22 (20 probe names, 2 numbers) |
| head : head-m | 728 | 8,570 | 8,198 | 317 (claim 88, DOB 79, member 56, phone 36, SSN 36, name 10) |

The mechanism is the mending itself. A C1 that item 40 reads as an unseen character (and refuses inside an identifier)
becomes a visible character the reader does not count as part of the identifier: a letter (Š š Ž ž Œ œ Ÿ ƒ ˆ ˜ ™) glued
to a name ends the name's match, so `ZEPHYRAš` is no longer the patient's surname to the reader and goes out; a `€`, a
quote, a dash or `…` inside a number splits it into two runs neither of which is the stored number. The item 40 unseen
sweep says the same: on head nothing is sent in clear (0 of 35,154); on head-m 4,578 are
(`measure/every-unseen-head-m.out`). Against base the gate's 975,489 letters do not move (94 hold a C1; differ 0).

U+0085 alone (`measure/nel-or-ellipsis.out`, 20 forms): as a line break 16 hidden, 1 clear, 3 refused; as `…` 15, 3, 2
(`3007…2299` sends the member ID); left alone 10, 1, 9. The one clear form under every choice is a surname glued to the
word before it (`Paid in fullZEPHYRA`), a separate finding below.

## (b) The design that holds: two texts from one extraction

1. **Stored**: the page text exactly as extracted. The sealed page-text object, `pageTextHash` and every citation are
   unchanged, so nothing already cited moves and the original bytes stay the evidence.
2. **What the reader reads**: variant d, `readerTextBreaksOutsideNumbers`: every run of C1 characters becomes as many
   line breaks, except a run with a digit on both sides, which stays as it is so the reader refuses it as item 40 does.
3. **What a person sees**: `mendExtracted`, the Windows-1252 characters, derived at read time from the stored text
   (never stored as a second copy, never hashed, never sent to a model).

Both functions are length-preserving, so a span the reader finds on (2) is the same span in (1) and (3): the redaction
a person reviews lines up with what they read.

| pair (generated set 40) | changed | refused B | sent by B that A hid or refused | real-shaped refusals given back (of 52) |
| --- | --- | --- | --- | --- |
| base : head-n (every C1 a break) | 9,261 | 8,074 | 0 | n/a |
| head : head-n | 812 | 8,074 | **64 dates of birth** | 52 |
| base : head-s (every C1 a space) | 9,265 | 8,202 | 0 | n/a |
| head : head-s | PENDING_S | | | |
| base : head-d (recommended) | PENDING_D1 | | | |
| head : head-d | PENDING_D2 | | | |

Variant n's 64 are `03/1?4/1980` and `March 1?4, 1980` with any of the 32 C1 characters between two digits: the break
splits the date and neither half is one. Variant d leaves exactly those runs alone. The full gate for d:
PENDING_DGATE.

Item 40's 52 real-shaped refusals (real.c1 32: a code range 16 and no identifier 16; real.nel 20: no identifier 16, a
number then a date on the next line 4): PENDING_GIVEBACK.

**Decoding.** `csvText`'s fallback should decode with `new TextDecoder('windows-1252')` (WHATWG: `latin1` and
`iso-8859-1` are labels of windows-1252; Node 24.22.1 decodes 0x80-0x9F correctly, issue #60888's regression is not
present). New CSV text then holds no C1 at all, except 0x85, which windows-1252 decodes as `…`; that is the wrong reading
for mainframe text, so the reader-side rule above still runs on every page and old stored text is read the same way. A
PDF's text keeps going through the two functions; its extracted text was not measured here (no synthetic PDF with a
1252 font map exists; see the questions).

## (a) The in-product count, before real PHI

- **What**: per page-text object, the occurrences of each code point U+0080-U+009F (`c1Counts`), counted once when
  intake stores the pages (the same job, the same transaction). IDs and counts only: practice, document, code point,
  count. No character context, no text.
- **Where**: a table `page_text_character (practice_id, source_document_id, code_point, occurrences)` with FORCE ROW
  LEVEL SECURITY, the app role owning nothing. Payer is not stored: it comes at read time from
  `source_document.filed_for_submission_id` → submission → payer, and is shown as "payer not yet known" until the letter
  is filed. That is a migration, so it is a schema PR that needs the founder's approval of the regenerated domain model.
- **Who sees it and how**: an operator, on `/console/models` beside the denial-letter flag, counts only, the way
  `console_model_spend` is shown (`apps/web/src/lib/routes/console-models.ts`): letters holding a C1 by code point and by
  payer, with an audited read. No practice user sees it; nobody sees a letter through it.

## The three residuals the brief names

| residual | measured on head | if taken | decision |
| --- | --- | --- | --- |
| unstored phone (item 40's sweep) | 11,285 clear, 255 refused | the reviewer's phone pass: 11,540 clear, 0 refused (it sends the 255) | not taken |
| Name.X. chain (`Maria.M.L.`) | other-names sweep: 176,448 clear of 453,888 | (f): 58,904 clear | PENDING_F |
| undotted last initial before a lower-case word | in the S-5 forms: 28 of 540 left on head-s5 | (f) does not reach it | not taken |

## The widening (orchestrator, 19:54 UTC)

**S-5** (`measure/widened.out`, 540 forms: five ways to write the name; J and Q with eight unseen characters before
the period, or `/ : · 。` as the joiner; three frames). Mending does not close it: 540 of 540 send the initials on
base, head, head-m, head-n and head-d (a C1 made a break leaves the initial standing; U+200B, U+00AD, U+2060 and
U+0000 are not C1). The prototype head-s5 (`scripts/protos41.py`: `periodAt` skips `\p{Cc}\p{Cf}` before the period;
the four joiners join) hides 512 and leaves 28: `Name/J/Q` with the last initial undotted, and a comma then a joiner
(`Zephyra,/J/Q`). Generated set: differ 0. Sentence starts: 0 of 25 changed. Gate: PENDING_S5GATE.

**Phone, ruling (c)'s caveat** (`measure/phone-sides.out`, 135 forms: ↀ ① ¹ ½ Ⅳ before, inside or after three phone
shapes). Head: clear 80, refused 55, and side does decide it: after the number 45 of 45 refused or hidden on the pass,
but on head itself after is refused 27 and clear 18, before refused 20 and clear 25, inside refused 8 and clear 37. The
pass (number characters touching or inside a phone-shaped run read as spaces, before NFKC) hides 85 and sends 50, but
5 that head refused are sent in clear (`½` after a seven-digit phone: the half becomes a space and the bare phone is
the unstored residual again), and on item 40's every-identifier sweep it sends the 255 head refused. Generated set: 72
expectation failures, all sent with the number hidden (`⅓5913242` → ` [MEMBER_ID]`). It fails the bar. Gate:
PENDING_PHGATE.

**Ruling (f)'s partial fix** (take `Name.X.` only when another period follows; take an undotted capital after an
initial already taken, except A, I and O). Other-names sweep: clear 176,448 → 58,904. Sentence starts: 10 of 25
change, all hiding a patient initial (`Zephyra.J.Q.`, `Okafor.A.I.`, `Zephyra J.Q`); two may hide a letter that is not
the patient's: `Zephyra. J. Smith called` and `Zephyra J. Q is the code`. A, I and O stand (`Okafor.I am writing`
unchanged). Generated set: differ 0. Gate: PENDING_FGATE.

## Side findings

- A surname glued to the word before it (`Paid in fullZEPHYRA`) is sent under every mending choice and on head: item
  40's name match needs a boundary before the surname. Not this item's; a queue item.
- U+FFFC inside a stored number is item 40's fix round's, as ruled.

## Prior art (5 calls)

- ftfy (`fix_c1_controls`, Apache-2.0, python-ftfy 6.3.1) maps C1 to Windows-1252 the same way. It is a display repair
  with no notion of what a redactor counts as an identifier, which is this note's finding. No code copied.
- WHATWG Encoding: `latin1` is a label of windows-1252 in every browser and in Node's `TextDecoder`.
- Node issue #60888: windows-1252 decoding of 0x80-0x9F regressed in v20.18.3 and v22.13.0; not in v24.22.1 here.

## Questions for a ruling

PENDING_QUESTIONS
