# Skeptic G: non-ASCII \p{Nd} glued to a digits-only member ID

Verdict: PARTLY REPRODUCED. The behaviour is real, but it is not a blocker, the change did not introduce it (base gives the same output), and the stated mechanism is wrong.

Scripts: $S/skeptic/G/probe.ts (all 760 non-ASCII \p{Nd} code points) and $S/skeptic/G/ctrl.ts (controls). Both run with `npx tsx` from packages/model-gateway. They use the production path from denial-letter.ts:230-233: `redactLetterForScreen`, then `holdsIdentifier(text, patient, claims, checkWorkOf(redacted))`. Patient: names ['JANE Q ZEPHYRA'], DOB 1980-03-14, memberIds ['SYNMEMBER0042', '76543210']. Claims: SYNCLAIM0001 (plus 4455667788 in ctrl).

## Counts (head e17c1192 and base 17c234d2 are identical)
| shape | clear | hidden | refused |
|---|---|---|---|
| `Ref <d>76543210 on file.` | 760 | 0 | 0 |
| `Ref 76543210<d> on file.` | 760 | 0 | 0 |
| `Member ID <d>76543210 on file.` | 0 | 760 (`Member ID [SSN] on file.`) | 0 |
| `Member ID 76543210<d> on file.` | 0 | 760 | 0 |
| `Patient <d>ZEPHYRA seen.` | 0 | 0 | 760 |
| `DOB 03/14/1980<d> seen.` | 0 | 0 | 760 |

The other reviewer's "3,040 rows all hidden" is the labelled shape (760 x 4 = 3,040). With the label, the folded 9-digit number takes [SSN]. Without the label it is sent in clear. Both reports are right for the shape each one tested.

## Exact inputs and outputs (head = base unless noted)
- `Ref ٣76543210 on file.` -> sent unchanged
- `Ref 76543210१ on file.` -> sent unchanged
- `Ref ٣٣76543210 on file.` -> sent unchanged
- `Ref ３76543210 on file.` and `Ref \u{1D7D1}76543210 on file.` -> NFKC turns these into ASCII; sent as `Ref 376543210 on file.`
- ASCII control: `Ref 376543210 on file.` and `Ref 765432103 on file.` -> sent unchanged
- `Ref ٣ 76543210 on file.` -> `Ref ٣ [MEMBER_ID] on file.`
- `Claim ٣4455667788 open.` -> sent unchanged (a claim number behaves the same way)
- `Ref A76543210`, `Ref Ⅳ76543210` -> REFUSED
- `Ref ³76543210`: head REFUSED; base sent as `Ref 376543210` (this is what the change actually fixed: \p{No})

## Corrected severity
The case falls inside a residual that ADR 0054 already records (lines 439-442): "a digits-only one glued so (... `Claim 123456780.00` for claim 12345678), read as another number and sent". A non-ASCII decimal digit gives the same result as an ASCII digit in the same place:
- `Ref 376543210` (ASCII) is sent exactly as `Ref ٣76543210` is.
- The fullwidth and mathematical digits become literally `376543210`.

So this is not a regression and not a blocker for this change. At most it is a minor note, or a question about the recorded residual itself.

## Reasoning
1. The claim's facts hold: the stored 8 digits do go out in clear, beside a glued non-ASCII digit.
2. The mechanism it gives is wrong.
   - The character is not an unhandled "number character". The digit view (`digitValue`, redact.ts ~460) reads every \p{Nd} as its ASCII value, so `٣ 76543210` is read as the 9-digit number 376543210.
   - The system deliberately treats a longer digit run as a different number. It does the same for ASCII 376543210 and has done so since base.
   - Names and dates are refused because different rules govern them. That is not an inconsistency specific to \p{Nd}.
3. The proposed fix (add \p{Nd} minus [0-9] to NUMBER_CHARACTER and rule (a)'s lookarounds) would make the check refuse `٣ 76543210` while it still sends `376543210`. Non-ASCII digits would be judged more strictly than ASCII ones, which closes nothing for the ASCII form.
4. The claim's line references (~4280/~4284) do not match head. NUMBER_CHARACTER is at redact.ts:3828.
5. Closing this properly means re-ruling the ADR 0054 residual for all digits (a stored digits-only ID inside a longer digit run). That is a policy decision, not a fix to this change.
