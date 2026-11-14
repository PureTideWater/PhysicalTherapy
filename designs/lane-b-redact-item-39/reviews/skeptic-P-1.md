# Skeptic check of P-1 (letter check: long gap after U+0085 splits an identifier)

Verdict: **REPRODUCED**

Trees: base `/home/user/PhysicalTherapy` at 6299c550, head `/home/user/item39` at c1caa730; both with no change
to `packages/redact` in the working tree. Synthetic data only. Independent script, not the reviewer's.

Command: `cd /home/user/sk1 && /opt/node24/bin/node --no-warnings p1.mts`

The script copies each tree's `packages/redact/src/redact.ts` unpatched (only the `./confusables` import path is
made absolute) and runs the check as the product does: `redactLetterForScreen(text, patient, claims)`,
`checkWorkOf(r)`, over `CHECK_WORK_BUDGET` = REFUSED, else `holdsIdentifier(r.text, patient, claims, spent)`
true = HELD, false = sent. Patient: pseudonym p1, name JANE Q ZEPHYRA, member ID 76543210, date of birth
1961-03-03; one claim with number SYN556000.

## 1. Main input: `'Member ID 7654\u0085' + ' '.repeat(256) + '3210'`

| tree | verdict | placeholders written | output text |
|---|---|---|---|
| base | HELD | 0 | `Member ID 7654<U+0085><256 spaces>3210` (plus the trailing U+0001 barrier) |
| head | **sent** | 0 | `Member ID 7654<U+0085><256 spaces>3210` |

## 2. Gap length (U+0085 followed by n spaces, member ID)

| n spaces after U+0085 | base | head |
|---|---|---|
| 0, 1, 200, 250, 253, 254, 255 | HELD | HELD |
| 256 | HELD | **sent** |
| 257, 300, 1000 | HELD | **sent** |

The head flips between 255 and 256 spaces after the U+0085 (256 and 257 characters of gap counting the U+0085).
The base holds at every length tried.

The U+0085 is needed. With spaces only (254 to 257) or 255 hyphens and one space, and no U+0085, both trees
redact the whole span to `[MEMBER_ID]` and send it, with no digits in clear: no difference there.

## 3. Variants

| input | base | head | in clear on head |
|---|---|---|---|
| member ID, U+0085 + 255 hyphens + 1 space | HELD | **sent** | 7654, 3210 |
| member ID with a half: `76` U+0085 256sp `54½32` U+0085 256sp `10` | HELD | **sent** | 76, 54, 32, 10 (the half written out as 1⁄2) |
| same with gaps of 20 spaces | HELD | HELD | |
| claim number: `Claim number SYN55` U+0085 256sp `6000 was paid.` | HELD | **sent** | SYN55, 6000 |
| same with a gap of 20 spaces | HELD | HELD | |
| date of birth: `Date of birth 1961-03` U+0085 256sp `-03.` | HELD | **sent** | 1961-03, -03 |
| same with a gap of 20 spaces | HELD | HELD | |

Two other date shapes tried show no difference between the trees and are not part of this finding:
`Born 03/03/19` U+0085 gap `61.` has `03/03/19` replaced by `[DATE_OF_BIRTH]` on both; `Born 0303` U+0085 gap
`1961.` is sent in clear by both at 20 and at 256 spaces (the same on the base, so not introduced by the head).

## 4. Are the digits in clear in what the head sends?

Yes. The head's output for the main input has no placeholder at all (replaced = 0) and literally contains `7654`
and `3210`, in order, separated only by the U+0085 and the spaces. The same holds for each **sent** row above.

## Conclusion

The claim reproduces as stated: for an identifier split by U+0085 and a gap of 256 or more further characters,
the base refuses the letter and the head sends it with the identifier's characters in clear, for a member ID, a
claim number and an ISO date of birth. Shorter gaps hold on both. One correction to the claim's wording: hyphens
or spaces alone do not flip it; the U+0085 (or presumably another character of its kind, not tested here) has to
be in the gap.
