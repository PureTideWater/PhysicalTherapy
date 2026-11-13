# Stage 5b fix round 1: adversarial review 1, leaks only

Delta: `61600c7c..ae0b6a3f` (/tmp/claude-0/delta-5b.diff, read whole). OLD reader is /tmp/claude-0/m5b/s3, NEW is
/tmp/claude-0/m5b/head. The production path is `redactLetterForScreen` followed by `holdsIdentifier(r.text, ..., checkWorkOf(r))`.
Synthetic call only: JANE Q ZEPHYRA, 1980-03-14, member IDs 76543210 and ZZ7654321, claim ZZ99887.
Probe scripts are in /tmp/claude-0/rev5b-1/ (probe.mts, diffs.mts, strict.mts, entries.mts, overlap.mts).

## Verdict

**No leak is introduced by the delta.** In every letter I tried, the NEW commit sends nothing in clear that the
OLD commit refused or replaced. Every outcome that changed went one of two ways: it was sent before and is refused
now, or it was sent before and more of it is replaced now. No letter went from refused to sent.

## What was run

- **probe.mts, 20,332 letters.** Ten identifiers (both member IDs, the claim, SSN twin 900-12-3456, phone twin
  (555) 010-2345 and 555-010-2345, DOB 03/14/1980 and 1980-03-14, the full name, the surname) in 8 frames. One of 17
  characters went at every place: U+FFFC, U+2180, ½, ², U+3007, U+217C, U+10107, ①, ⅰ, U+0F33, Ⅻ, U+2189, U+09F4,
  U+2CFD, U+1D360, U+16EE, U+2007. Then every identifier pair was joined by each of those characters, singly and
  doubled. 2,629 outcomes differ between OLD and NEW. Letters where NEW holds an identifier in clear and OLD refused
  it or did not hold it: **0**.
- **diffs.mts, 4,672 letters.** Each changed outcome was classified: 84 went from sent to sent with more replaced,
  1,248 went from sent to refused, and **0 went from refused to sent**. Examples:
  - `Member ID 7<U+FFFC>6543210 was denied.` was sent as is on OLD. NEW sends `Member ID [MEMBER_ID] was denied.`
  - `Claim ZZ9<U+1D360>9887 denied.` was sent on OLD and is refused on NEW.
  - `ZZ99<U+16EE>887` was sent on OLD and is refused on NEW.

  OLD sent both of the last two with the stored number readable to a person. NEW closes them.
- **strict.mts.** The same check, but the output is compacted to ASCII letters and digits. That compaction makes a
  number character inside an identifier count as in clear. On NEW, no stored member ID or claim number is held in
  clear in any letter. Every in-clear result left is an SSN, phone, DOB or name, and each one is identical on OLD
  (see S-1 below).
- **entries.mts, 857 letters.** The same letters went through all three entries and the drafter's check:
  - `redactLetterForScreen`: changed only from sent to refused, or to more replaced.
  - `redactLetter` (with its check): same as above.
  - `redactionSpans`: 190 texts changed, every one with more replaced.
  - `holdsNameOrNumber`: 21 changed from false to true, and none from true to false. The wider LETTER_GAP and
    LABELED_GAP only add runs.
- **overlap.mts.** I crafted overlaps to look for a placeholder that swallows a neighbour, or a joiner that makes a
  match start or end inside another identifier:
  - `Ref ZZ9988<U+FFFC>7<U+FFFC>6543210 ok` was sent as is on OLD. NEW sends `Ref [CLAIM_1] ok`, because the
    overlapping spans are covered as one.
  - `Ref 7654321<U+FFFC>0<U+FFFC>900-12-3456` was sent on OLD with the member ID's digits visible. NEW sends
    `Ref [MEMBER_ID]<U+FFFC>[SSN]`.
  - `Claim ZZ9988<U+FFFC>7654321 ok`, `Member ID ZZ765432<U+FFFC>10 ok` and `Member ID ZZ76543<U+FFFC>210` were
    sent on OLD and are refused on NEW.
  - `Call 555-010-234<U+FFFC>76543210` is refused on both.
  - `Ref ZZ99887<U+FFFC>6543210` gives `Ref [CLAIM_1]<U+FFFC>6543210` on both. The letter is ambiguous because
    the 7 is shared by the two identifiers, and both commits give the same output.

  I found no case where a new joiner lets the first reading's placeholder take over digits of another identifier
  while the gates (refusedAsFirstRead, refusedAsTheBaseRead) refuse less than before.

## Change 2 (the check charged in refusedWithNumberCharactersAsOne)

I read redact.ts lines 3870-3912 and 4188-4200. The refusal is the same disjunction as before:

- `refused`
- `PLACEHOLDER_BESIDE_ONE_NUMBER_CHARACTER`
- the ONE_NUMBER_CHARACTER count
- `asGiven === undefined && check`

The one difference: the check is now `holdsIdentifierCounted` starting from `counted`, and its count is written
back to `further.spent`. The old `holdsIdentifier(again.text, ..., counted)` already started from `counted`, so the
only change is that the caller's later check now starts from a higher count. That can only add refusals on cost.
Where the check is now skipped because `refused` is already true, the letter is refused anyway. No outcome other
than cost changed in the probes above.

## Findings

- **S-1 (should; identifier in clear on NEW; also on OLD; not introduced by this delta).** U+FFFC is now accepted as
  "what PDF text writes for an object" inside a stored number. But the same character, or a number character NFKC
  keeps (U+2180, U+3007, U+10107, U+0F33, U+1D360, U+16EE), inside an SSN, a phone number, a date of birth or a name
  is sent in clear. Examples, with OLD and NEW identical in each:
  - `Member ID 9<U+FFFC>00-12-3456 was denied.` is sent unchanged (SSN pattern).
  - `Ref 76543210<U+FFFC>9<U+FFFC>00-12-3456` is sent as `Ref [MEMBER_ID]<U+FFFC>9<U+FFFC>00-12-3456`.
  - `Member ID (55<U+FFFC>5) 010-2345 was denied.` and `Member ID 55<U+FFFC>5.010.2345 was denied.` are sent
    unchanged (phone pattern).
  - `Member ID 03<U+FFFC>/14/1980 was denied.` and `DOB 03<U+FFFC>14<U+FFFC>1980` are sent unchanged (stored DOB).
  - `Member ID Z<U+2180>ephyra was denied.` is sent unchanged, and `Member ID JANE Z<U+2180>EPHYRA was denied.` is
    sent as `Member ID [PATIENT_NAME] Z<U+2180>EPHYRA was denied.` (stored name).

  Tallies from strict.mts: each of these characters at every place inside the identifier gives about 24 to 40
  in-clear rows per identifier. ADR 0054's "Left, each recorded" names only a phone number by pattern that is not
  stored, with a number character beside it. It does not name a character inside an SSN, a stored DOB or a stored
  name, or U+FFFC inside any of them. Queues item 42 covers only "a letter or other visible character inside a
  number". Recommendation: record this as a residual or queue it. It is outside this delta's scope: MASK_GAP,
  the date gaps and NAME_JOINERS are unchanged. The code is the joiner sets `MASK_GAP` (redact.ts:1933),
  `WORD_DATE_GAP` (3126) and `NAME_JOINERS` (around 663), none of which holds U+FFFC or a number character.
- **N-1 (nit; no leak).** The ADR text (redact.ts:667-672) says the added joiners are number characters "NFKC leaves
  as it is". The class added is all of `\p{Nl}\p{No}`, which includes ², ① and ½, characters NFKC rewrites. No
  outcome depends on this, since those are digits or `1⁄2` by the time they are matched, and the probes found no
  leak either way. The wording is narrower than the code.

Nothing else found.
