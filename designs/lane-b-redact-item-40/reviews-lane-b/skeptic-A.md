# Skeptic A: Nl/No character inside a stored identifier

Verdict: PARTLY REPRODUCED. The leak is real, but the mechanism is wrong, it is not a regression, and it is not specific to Nl/No.

Probe: $S/skeptic/A/probe.mts (my own script), run with `npx tsx` from each worktree's packages/model-gateway. It follows the
production path in packages/model-gateway/src/functions/denial-letter.ts:230-233: redactLetterForScreen, then
holdsIdentifier(text, patient, claims, checkWorkOf(redacted)). Outputs: $S/skeptic/A/head.out and $S/skeptic/A/base.out.
Patient (synthetic): names ['JANE Q ZEPHYRA'], DOB 1980-03-14, memberIds ['76543210','ZZ7654321']; claim 'C2026000417'.
Six kinds, with c placed inside the identifier: `Member ID 7654{c}3210`, `Member ID ZZ7654{c}321`, `Patient JANE ZEPH{c}YRA`,
`DOB 03/14/19{c}80`, `Claim C20260{c}00417`, `SSN 900-12-{c}3456` (9xx twin).

## Sample: 47 Nl/No characters x 6 kinds = 282 letters
Head and base give the same result: 259/282 are sent with the identifier's fragment in clear (memberDigits 38, memberPrefixed 45,
name 47, DOB 43, claim 47, SSN 39). The rest are refused, or NFKC turns the character into a digit and a pattern replaces the
whole run (e.g. `7654¹3210` is sent as `[SSN]`, `7654⑬3210` as `[PHONE]`). Nl/No inside an identifier gives the same
output on head and on base.

## The claim's specific examples (head = base unless stated)
- `Member ID 7654ↀ3210 was denied.` is sent unchanged.
- `Ref 7654٣3210 on file.` is sent unchanged. U+0663 is \p{Nd}, not Nl/No.
- `Member ID 7654Ⅰↀ3210 was denied.` is sent as `Member ID 7654Iↀ3210 was denied.`
- `Patient JANE Zeph²yra was seen.` is sent as `Patient [PATIENT_NAME] Zeph2yra was seen.`
- `Member ID 7654\u0085ↀ3210 was denied.` is sent unchanged.
- Beside, not inside: `Member ID 76543210ↀ was denied.` is REFUSED on head and sent unchanged on base. This is the item-40 fix working.

## Controls refute the stated mechanism
A plain Latin `X` inside gives the same result on head and on base:
- `Member ID 7654X3210` is sent unchanged.
- `ZZ7654X321` is sent unchanged.
- `ZEPHXYRA` is sent unchanged.
- `03/14/19X80` is sent unchanged.
- `C20260X00417` is sent unchanged.
- `900-12-X3456` is sent unchanged.

`.` inside a letter-prefixed ID, a claim number or an SSN is also sent (`ZZ7654.321`, `C20260.00417`, `900-12-.3456`).
U+0085 inside an ID or a DOB is sent on base and refused on head, a small improvement on head.

## Corrected severity
This is a pre-existing gap on base, not a blocker this change introduces. The redactor does not find a stored identifier when any
interior character that is not a separator splits it. The cause is not the item-40 Nl/No rule: that rule only looks at characters
BESIDE an identifier and does not claim to cover characters inside one. Whether it is a blocker for the redaction work in general
is a policy question. It is plausibly a leak of a stored number. On realistic input (OCR noise or a typo inside an ID) a stray
Latin letter or `.` is likelier than U+2180, so a fix scoped to Nl/No would leave the main case open. The fix to judge would be
matching stored identifiers with an arbitrary single interior junk character, applied to every character class.

## Reasoning
I reproduced the observable behaviour across all six kinds on the production path: an Nl/No character inside a stored identifier
leaves its digits or letters in clear, as written or folded by NFKC. But base behaves the same. A Latin `X` and the Nd digit U+0663
produce the identical leak. The item-40 code (redact.ts:3811-3901) only handles a character next to an identifier, and the head
probe confirms it does that. So "Nl/No inside is sent in clear on head and base" is true as stated. Its framing as a defect of this
change, and the Nl/No mechanism, are wrong: it is the general residual of a split identifier. The count 5,718/5,718 is overstated
for SSN and member-ID digits, because some characters fold to digits that a pattern then replaces whole.
