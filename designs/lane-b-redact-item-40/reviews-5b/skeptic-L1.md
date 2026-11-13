# Skeptic re-test of review-1 S-1 (lane B, item 40, reviews-5b)

## Verdict

**REPRODUCED, and the delta did not cause it.** I tested every example the finding gives. Each one behaves on OLD
(61600c7c) and NEW (ae0b6a3f) exactly as the review says, and BASE (4d40557f) gives the same output as OLD on
every row. The delta (OLD to NEW) made no row worse. It improved four stored SSN or phone rows, plus the stored member ID control (all marked **bold** below).

One correction to the finding: it says "OLD and NEW identical in each". That holds for the review's own examples,
which use numbers that are not stored. It does not hold once the SSN or phone is stored as a member ID. NEW then
replaces or refuses `9<U+FFFC>00-12-3456`, `55<U+FFFC>5.010.2345`, `9<U+2180>00-12-3456` and
`55<U+2180>5.010.2345`, which OLD sends in clear. This is the delta's intended U+FFFC and number-character joiner
in stored numbers. It does not reach the parenthesised phone form `(55<U+FFFC>5) 010-2345`, which NEW still sends
unchanged even when stored.

## Is the gap specific to U+FFFC and number characters?

No. In numbers, the gap is the general one: a visible character that is not on a joiner list sits inside an
identifier.

- **SSN, phone and DOB.** A plain `X` or `#` in place of U+FFFC is sent unchanged on all three commits, whether
  the number is stored or not (`9X00-12-3456`, `55#5.010.2345`, `03#14#1980`, `03X/14/1980`). A stored member ID
  with a letter inside (`7654X3210`) is also sent unchanged on all three. That is the case Queues item 42 covers.
  U+FFFC and U+2180 are two more instances of the same gap. The delta closes it only for stored numbers written
  without parentheses.
- **Names behave differently.** U+FFFC or `#` inside the stored name is caught on all three commits:
  `Z<U+FFFC>ephyra` becomes `[PATIENT_NAME]`, and so does `ZEPH#YRA`. A letter-like character is not caught on
  any of them: U+2180 or a plain `X` (`ZXephyra`, `ZEPHXYRA`, `JANE ZXEPHYRA` gives `[PATIENT_NAME] ZXEPHYRA`).
  So the name gap is about a letter, or a number letter (U+2180 is \p{Nl}), inside a name token. It is not about
  U+FFFC. The review's U+2180 name examples reproduce. The finding lists U+FFFC as a leak inside a name, and that
  part does **not** reproduce: U+FFFC inside a stored name is redacted on all three commits.

The controls with no inserted character are redacted on all three commits. The probes therefore hit the matchers,
and the leaks come from the inserted character.

## Setup

- Production path: `r = H.redactLetterForScreen(letter, P, C); refused = H.holdsIdentifier(r.text, P, C, H.checkWorkOf(r))`.
- Patient: `{ pseudonym: 'synthetic-patient-x', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['76543210','ZZ7654321'] }`.
  "stored" rows add `'900123456'` (SSN rows) or `'5550102345'` (phone rows) to memberIds.
- Claims: `[{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-x', claimNumbers: ['ZZ99887'] }]`. Synthetic only.
- Scripts: /tmp/claude-0/skeptic-5b-L1/s1.mts (grid), /tmp/claude-0/skeptic-5b-L1/s2.mts (extra rows); raw output in s1.out and s2.out there.
- Readers: BASE /tmp/claude-0/m5b/base, OLD /tmp/claude-0/m5b/s3, NEW /tmp/claude-0/m5b/head (packages/model-gateway/src/redact.ts).
- `j=` is the character inserted: FFFC = U+FFFC, 2180 = U+2180, X, #, none (control).

## Results

| case | input | BASE 4d40557f | OLD 61600c7c | NEW ae0b6a3f |
|---|---|---|---|---|
| ssn j=FFFC unstored | `Member ID 9<U+FFFC>00-12-3456 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| ssn j=FFFC stored | `Member ID 9<U+FFFC>00-12-3456 was denied.` | SENT UNCHANGED | SENT UNCHANGED | **SENT: Member ID [MEMBER_ID] was denied.** |
| phone() j=FFFC unstored | `Member ID (55<U+FFFC>5) 010-2345 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| phone() j=FFFC stored | `Member ID (55<U+FFFC>5) 010-2345 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| phone. j=FFFC unstored | `Member ID 55<U+FFFC>5.010.2345 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| phone. j=FFFC stored | `Member ID 55<U+FFFC>5.010.2345 was denied.` | SENT UNCHANGED | SENT UNCHANGED | **SENT: Member ID [MEMBER_ID] was denied.** |
| dob-dash j=FFFC | `DOB 03<U+FFFC>14<U+FFFC>1980` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| dob-slash j=FFFC | `Member ID 03<U+FFFC>/14/1980 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| name JANE Z_EPHYRA j=FFFC | `Member ID JANE Z<U+FFFC>EPHYRA was denied.` | SENT: Member ID [PATIENT_NAME] [PATIENT_NAME] was denied. | SENT: Member ID [PATIENT_NAME] [PATIENT_NAME] was denied. | SENT: Member ID [PATIENT_NAME] [PATIENT_NAME] was denied. |
| name Z_ephyra j=FFFC | `Member ID Z<U+FFFC>ephyra was denied.` | SENT: Member ID [PATIENT_NAME] was denied. | SENT: Member ID [PATIENT_NAME] was denied. | SENT: Member ID [PATIENT_NAME] was denied. |
| name ZEPH_YRA j=FFFC | `Member ID ZEPH<U+FFFC>YRA was denied.` | SENT: Member ID [PATIENT_NAME] was denied. | SENT: Member ID [PATIENT_NAME] was denied. | SENT: Member ID [PATIENT_NAME] was denied. |
| ssn j=2180 unstored | `Member ID 9<U+2180>00-12-3456 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| ssn j=2180 stored | `Member ID 9<U+2180>00-12-3456 was denied.` | SENT UNCHANGED | SENT UNCHANGED | **REFUSED** |
| phone() j=2180 unstored | `Member ID (55<U+2180>5) 010-2345 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| phone() j=2180 stored | `Member ID (55<U+2180>5) 010-2345 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| phone. j=2180 unstored | `Member ID 55<U+2180>5.010.2345 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| phone. j=2180 stored | `Member ID 55<U+2180>5.010.2345 was denied.` | SENT UNCHANGED | SENT UNCHANGED | **REFUSED** |
| dob-dash j=2180 | `DOB 03<U+2180>14<U+2180>1980` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| dob-slash j=2180 | `Member ID 03<U+2180>/14/1980 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| name JANE Z_EPHYRA j=2180 | `Member ID JANE Z<U+2180>EPHYRA was denied.` | SENT: Member ID [PATIENT_NAME] Z<U+2180>EPHYRA was denied. | SENT: Member ID [PATIENT_NAME] Z<U+2180>EPHYRA was denied. | SENT: Member ID [PATIENT_NAME] Z<U+2180>EPHYRA was denied. |
| name Z_ephyra j=2180 | `Member ID Z<U+2180>ephyra was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| name ZEPH_YRA j=2180 | `Member ID ZEPH<U+2180>YRA was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| ssn j=X unstored | `Member ID 9X00-12-3456 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| ssn j=X stored | `Member ID 9X00-12-3456 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| phone() j=X unstored | `Member ID (55X5) 010-2345 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| phone() j=X stored | `Member ID (55X5) 010-2345 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| phone. j=X unstored | `Member ID 55X5.010.2345 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| phone. j=X stored | `Member ID 55X5.010.2345 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| dob-dash j=X | `DOB 03X14X1980` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| dob-slash j=X | `Member ID 03X/14/1980 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| name JANE Z_EPHYRA j=X | `Member ID JANE ZXEPHYRA was denied.` | SENT: Member ID [PATIENT_NAME] ZXEPHYRA was denied. | SENT: Member ID [PATIENT_NAME] ZXEPHYRA was denied. | SENT: Member ID [PATIENT_NAME] ZXEPHYRA was denied. |
| name Z_ephyra j=X | `Member ID ZXephyra was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| name ZEPH_YRA j=X | `Member ID ZEPHXYRA was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| ssn j=# unstored | `Member ID 9#00-12-3456 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| ssn j=# stored | `Member ID 9#00-12-3456 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| phone() j=# unstored | `Member ID (55#5) 010-2345 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| phone() j=# stored | `Member ID (55#5) 010-2345 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| phone. j=# unstored | `Member ID 55#5.010.2345 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| phone. j=# stored | `Member ID 55#5.010.2345 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| dob-dash j=# | `DOB 03#14#1980` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| dob-slash j=# | `Member ID 03#/14/1980 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| name JANE Z_EPHYRA j=# | `Member ID JANE Z#EPHYRA was denied.` | SENT: Member ID [PATIENT_NAME] [PATIENT_NAME] was denied. | SENT: Member ID [PATIENT_NAME] [PATIENT_NAME] was denied. | SENT: Member ID [PATIENT_NAME] [PATIENT_NAME] was denied. |
| name Z_ephyra j=# | `Member ID Z#ephyra was denied.` | SENT: Member ID [PATIENT_NAME] was denied. | SENT: Member ID [PATIENT_NAME] was denied. | SENT: Member ID [PATIENT_NAME] was denied. |
| name ZEPH_YRA j=# | `Member ID ZEPH#YRA was denied.` | SENT: Member ID [PATIENT_NAME] was denied. | SENT: Member ID [PATIENT_NAME] was denied. | SENT: Member ID [PATIENT_NAME] was denied. |
| ssn j=none unstored | `Member ID 900-12-3456 was denied.` | SENT: Member ID [SSN] was denied. | SENT: Member ID [SSN] was denied. | SENT: Member ID [SSN] was denied. |
| ssn j=none stored | `Member ID 900-12-3456 was denied.` | SENT: Member ID [MEMBER_ID] was denied. | SENT: Member ID [MEMBER_ID] was denied. | SENT: Member ID [MEMBER_ID] was denied. |
| phone() j=none unstored | `Member ID (555) 010-2345 was denied.` | SENT: Member ID [PHONE] was denied. | SENT: Member ID [PHONE] was denied. | SENT: Member ID [PHONE] was denied. |
| phone() j=none stored | `Member ID (555) 010-2345 was denied.` | SENT: Member ID [MEMBER_ID] was denied. | SENT: Member ID [MEMBER_ID] was denied. | SENT: Member ID [MEMBER_ID] was denied. |
| phone. j=none unstored | `Member ID 555.010.2345 was denied.` | SENT: Member ID [PHONE] was denied. | SENT: Member ID [PHONE] was denied. | SENT: Member ID [PHONE] was denied. |
| phone. j=none stored | `Member ID 555.010.2345 was denied.` | SENT: Member ID [MEMBER_ID] was denied. | SENT: Member ID [MEMBER_ID] was denied. | SENT: Member ID [MEMBER_ID] was denied. |
| dob-dash j=none | `DOB 03141980` | SENT: DOB [DATE_OF_BIRTH] | SENT: DOB [DATE_OF_BIRTH] | SENT: DOB [DATE_OF_BIRTH] |
| dob-slash j=none | `Member ID 03/14/1980 was denied.` | SENT: Member ID [DATE_OF_BIRTH] was denied. | SENT: Member ID [DATE_OF_BIRTH] was denied. | SENT: Member ID [DATE_OF_BIRTH] was denied. |
| name JANE Z_EPHYRA j=none | `Member ID JANE ZEPHYRA was denied.` | SENT: Member ID [PATIENT_NAME] [PATIENT_NAME] was denied. | SENT: Member ID [PATIENT_NAME] [PATIENT_NAME] was denied. | SENT: Member ID [PATIENT_NAME] [PATIENT_NAME] was denied. |
| name Z_ephyra j=none | `Member ID Zephyra was denied.` | SENT: Member ID [PATIENT_NAME] was denied. | SENT: Member ID [PATIENT_NAME] was denied. | SENT: Member ID [PATIENT_NAME] was denied. |
| name ZEPH_YRA j=none | `Member ID ZEPHYRA was denied.` | SENT: Member ID [PATIENT_NAME] was denied. | SENT: Member ID [PATIENT_NAME] was denied. | SENT: Member ID [PATIENT_NAME] was denied. |
| ref member+ssn FFFC | `Ref 76543210<U+FFFC>9<U+FFFC>00-12-3456` | SENT: Ref [MEMBER_ID]<U+FFFC>9<U+FFFC>00-12-3456 | SENT: Ref [MEMBER_ID]<U+FFFC>9<U+FFFC>00-12-3456 | SENT: Ref [MEMBER_ID]<U+FFFC>9<U+FFFC>00-12-3456 |
| control: stored member ID 7654<FFFC>3210 | `Member ID 7654<U+FFFC>3210 was denied.` | SENT UNCHANGED | SENT UNCHANGED | **SENT: Member ID [MEMBER_ID] was denied.** |
| control: stored member ID 7654X3210 | `Member ID 7654X3210 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
| phone() FFFC after paren stored | `Member ID (555)<U+FFFC>010-2345 was denied.` | SENT UNCHANGED | SENT UNCHANGED | SENT UNCHANGED |
