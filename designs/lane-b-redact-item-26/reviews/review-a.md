# Review A (PHI: what is sent): queues item 26, MOD-23

Head `/home/user/rev/head/redact.ts` against base f3f5a642 `/home/user/rev/base/redact.ts`. Synthetic letters only.
Everything below was run; scripts and their output are in `reviews/a/` (how to rerun: last section).

## Verdict in one paragraph

On the path the product uses (`redactLetterForScreen`, then `holdsIdentifier`: `denial-letter.ts:230-231`) the claim
held: in 120,488 letter-and-patient screens (three seeds, nine patients) no letter the base refuses is sent by the head,
no character the base replaced stands in the head's text, no candidate of the base's is missing, the head never throws,
and the stores never changed an answer. On the path without the screen (`redactLetter`, then `holdsIdentifier`) the
claim does not hold: the wider placeholders are applied whatever the first reading's check says, and they take away what
that check refused the letter for (A-1). The same mechanism defeats K-1 on the screen path for a CR LF letter (A-2); the
base sent those letters too, so that one is not blocking.

## Findings

Patients are written as `names / datesOfBirth / memberIds / claimNumbers`; every patient is
`{ pseudonym: 'synthetic-patient-1', ... }` and every claim `{ claimId: 'synthetic-claim-n', patientPseudonym:
'synthetic-patient-1', claimNumbers: [one number] }`. "Screen path" is `redactLetterForScreen` then `holdsIdentifier`;
"letter path" is `redactLetter` then `holdsIdentifier`. REFUSED means the check returned true.

### A-1 BLOCKING (by the brief's rule; on the letter path only, which no production code calls today)

`redactionSpans` and `redactLetter` merge every wider match into the letter with no test of the first reading's check.
The comment in `screenAsBothRead` names the hazard ("no placeholder of the wider reading can hide what that check
read") and guards the screen path against it; the letter path has no such guard. The base's letter path refuses, the
head's sends.

(a) The letter is no longer "held", and a glued twin goes out. Script: `probes.mts` section 1.

- Patient: `["TOBE ZEPHYRA"] / ["1988-02-29"] / ["SYN 0042 77"] / ["150.00"]`
- Letter: `"Service 01/01/2020-150.00 Paid\nSSN on file. Statement\n\nNo. 900-12-345678"`
- Letter path, base: REFUSED (the text it read is the letter as written).
- Letter path, head: sent as `"Service 01/01/2020-[CLAIM_1] Paid\nSSN on file. Statement\n\nNo. 900-12-345678"`.
- Screen path: base REFUSED, head REFUSED.

The claim number held `150.00` is the amount of the held range; its wider placeholder replaces it, the letter is held
no more, and `900-12-345678` (which the check refuses here only while the letter is held) is sent in clear.

(b) The tail of a chain is replaced and its head is sent. Script: `probes.mts` section 1.

- Patient: `["JANE Q ZEPHYRA"] / ["1980-03-14"] / ["3456150.00"] / ["SYNCLAIM0001"]`
- Letter: `"SSN on file. Statement\nNo. 900-12-3456150.00"` (K-1's first row)
- Letter path, base: REFUSED. Letter path, head: sent as `"SSN on file. Statement\nNo. 900-12-[MEMBER_ID]"`.
- Screen path: base REFUSED, head REFUSED.
- Second letter, same patient: `"SSN: see Member\nID Number: 900-12-3456150.00. Date of birth: 03/14/1980"`: base
  REFUSED; head sent as `"SSN: see Member\nID Number: 900-12-[MEMBER_ID]. Date of birth: [DATE_OF_BIRTH]"`.

Five digits of the twin are sent, and the other four go out under the member ID's placeholder.

(c) A held letter with the name's pieces: the two paths of the head now part. Script: `probes.mts` section 1.

- Patient: `["JANE Q ZEPHYRA"] / ["1980-03-14"] / ["SYNMEMBER0042"] / ["SYNCLAIM0001"]`
- Letter: `"Seen 01/01/2020-150.00Paid in full. Dear Zephy ra, your claim"`
- Letter path, base: REFUSED. Letter path, head: sent as
  `"Seen 01/01/2020-150.00Paid in full. Dear [PATIENT_NAME], your claim"`.
- Screen path: base REFUSED, head REFUSED (the new test pins this refusal).

Nothing the base's check read is shown here: I rewrote the 189 kept rows where names alone were replaced with the name
written whole in that place, and the base then sends 188 of them (`analyze2.mts`; the 189th shows nothing either). It is
listed because the same letter is refused on one path and sent on the other.

How often, in the fuzzer (`fuzz.mts`, seeds 1 to 3): 2,040 of 48,196 letter-path letters (4.2%) are refused by the base
and sent by the head. Of the 1,200 rows kept, by a pattern over the head's text (approximate): a twin whole in clear 162
(124 where numbers alone were replaced), a chain cut before a number's placeholder 363, neither 675. The share is that
of patients I built to overlap (stored numbers that are an amount or a chain's tail), not of real records. Every span
the base's `redactionSpans` replaces is inside a span of the head's in all 48,196.

Who calls it outside tests (`grep -rn` under `apps` and `packages`): nobody calls `redactLetter` or `redactionSpans`.
`packages/model-gateway/src/index.ts:208` re-exports `redactLetter` as part of the gateway's public surface;
`denial-letter.ts` imports `redactLetterForScreen` and `holdsIdentifier` only. So this is not reachable from the
denial-letter function today; it is what any caller who pairs the exported `redactLetter` with the check would get, and
the new tests assert `redactLetter(...)`'s text (for letters with no held range).

### A-2 OTHER: K-1 does not hold on the screen path where a wider match is applied

The wider matches are applied when `holdsAsFirstRead(first.text)` is false, and that check reads the text as written
only: it has no second reading with CR LF as LF. So a CR LF letter that K-1 would refuse gets its wider placeholders
first, and they hide the chain from the LF reading that follows. Script: `probes.mts` section 2; `fuzz.mts ... k1`.

- Patient: `["JANE Q ZEPHYRA"] / ["1980-03-14"] / ["3456150.00"] / ["SYNCLAIM0001"]`
- Letter: `"SSN on file. Statement\r\nNo. 900-12-3456150.00"`
- Base: sent as written, `"SSN on file. Statement\r\nNo. 900-12-3456150.00"`.
- Head: sent as `"SSN on file. Statement\r\nNo. 900-12-[MEMBER_ID]"`.
- The same letter written with LF: base REFUSED, head REFUSED.
- The same CR LF letter for the patient with member ID `SYNMEMBER0042` (no wider match): head REFUSED.

Not blocking: the base sends this letter with the whole number in clear, and the head shows less. But the design's
sentence "a CR LF letter is refused wherever its LF writing is" is false for it. In the K-1 run (seeds 11 and 12,
86,066 CR LF letters) the head sends 44,134; for 393 of those it refuses the LF writing. 392 have a wider match applied
(390 for the fuzzer's patient who holds member ID `3456150.00`, all through a number's wider form, none through a name
alone; the base sent all 392). One
has none: `"ZЕPHYRA, Z\r\n\r\n(202) 555-0123\r\nSeen 01/01/2020-150.00Paid in full. \r\nICN\r\n"` (the second letter is
U+0415) for `["JANE Q ZEPHYRA"] / ["1980-03-14"] / ["3456150.00","12-3456","345.678"] /
["56150","0123","1/02/2020","12/3456"]`: base and head both send
`"[PATIENT_NAME], [PATIENT_NAME]\r\n\r\n[PHONE]\r\nSeen 01/01/2020-150.00Paid in full. \r\nICN\r\n"`, and both refuse
the LF writing. Nothing is shown there; redaction reads the text as written, as the design says.

### A-3 OTHER: the wider name reading does refuse by itself (the design says "redaction only, never a refusal")

Redaction's wider pattern needs something other than a letter or digit after the name; the check reads the placeholder
beside it as a barrier and finds the name. Script: `analyze2.mts` (clean rows); `fuzz.mts` category `e_no_crlf`.

- Patient: `["JANE Q ZEPHYRA"] / ["1980-03-14"] / ["SYNMEMBER0042"] / ["SYNCLAIM0001"]`
- Letter: `"Dear Z e p h y r a900-12-3456, your claim"`
- Base: sent as `"Dear Z e p h y r a[SSN], your claim"`. Head: REFUSED (both paths).
- Also `"Dear Zephy ra202-555-0123."`: base sent as `"Dear Zephy ra[PHONE]."`, head REFUSED.

The safe side (the base showed the name), but it is a refusal the cost column does not record and the gate's corpus
cannot have measured (it reports the same refusals on both). In the fuzzer: 47 of 120,488 with no CR LF in the letter;
in 30 of them the head's text differs from the base's (a wider form replaced) and its check still refuses, in 17 the
head's text is the base's.

### A-4 OTHER: forms of a split name the head still sends, beyond the recorded `*`, `/`, `{`

Script: `probes.mts` section 4 (89 splits of ZEPHYRA at three places; 40 are sent with the pieces in clear by base and
head alike). Patient: `["JANE Q ZEPHYRA"] / ["1980-03-14"] / ["SYNMEMBER0042"] / ["SYNCLAIM0001"]`. In each row below the
base and the head both send the letter exactly as written.

- `"Dear Zephy\u0085ra, your claim"`: U+0085, a line break to this file's own `LINE_BREAK` and `SPACES`, but outside
  `\s`, which is what the wider gap reads. Every other line break and space I tried is joined.
- `"Dear Zephy。ra, your claim"` (U+3002), and U+0589, U+06D4: full stops of other scripts (U+2024, U+FF0E and U+FE52
  are joined, since they normalize to a period).
- `"Dear Zephy, ra, your claim"`, `"Dear Zephy: ra, your claim"`, `"Dear Zephy; ra, your claim"`,
  `"Dear Zephy.,ra, your claim"`, `"Dear Zephy ,ra, your claim"`: a space or a period with one more mark.
- `"Dear Zephy(ra), your claim"`, and one of `! " # $ % & ) + , : ; < = > ? @ \ ^ | } ~` or a digit between the pieces.
- `"Dear Zephy・ra, your claim"` (U+30FB): it joins a number in this file and no name.

### A-5 OTHER: a stored number written otherwise than held, and held with a square bracket

Script: `probes.mts` section 5 (50 stored separators) and `analyze2.mts` (clean rows).

- Patient: `["JUNE MARCH"] / ["1975-06-01"] / ["ZZ12345/01"] / ["1234.56"]`.
  `"The member ZZ12345.01 was paid short."`, `"The member ZZ12345,01 was paid short."` and
  `"Member ID: ZZ12345.01 was paid short."`: base and head both send each as written. (As held,
  `"The member ZZ12345/01 was paid short."`: base sends it as written, head sends `"The member [MEMBER_ID] was paid
  short."`.) For 38 of the 50 separators, each of `/ . , + * & : #` written in place of the held one is sent in clear.
- Patient: `["JANE Q ZEPHYRA"] / ["1980-03-14"] / ["ZZ12345]01"] / ["SYNCLAIM0001"]`.
  `"The member ZZ12345]01 was paid short."` and `"Member ID: ZZ12345]01 was paid short."`: base and head both send
  `"The member ZZ12345)01 was paid short."` and `"Member ID: ZZ12345)01 was paid short."`. The letter's brackets are made
  parentheses before matching and the stored value's are not, so a number held with `[` or `]` is never read as held.
  These two are the only separators of the 50 the as-held rule misses (U+0001 is refused as one of the checks' marks).

The class escape itself misread nothing: `\`, `^`, `-`, an astral character, a digit and a letter of another script,
every white space, and a lone surrogate all built a pattern and none threw.

### A-6 OTHER: a CR beside another line ending is still counted as written

Script: `probes.mts` section 3 and `analyze.mts` (last lines). Patient: `["JANE Q ZEPHYRA"] / ["1980-03-14"] /
["SYNMEMBER0042"] / ["SYNCLAIM0001"]`.

- `"SSN verified. Account \r\r\nNo. 900-12-345678"`: base sends it as written, head sends it as written.
- The same with `\n`: both REFUSED. With `\r\n`: base sends, head REFUSED.
- Also sent by both: `\n\r`, `\r\n\r`, and a CR and LF with U+200B or U+00AD between them (one of K-1's seven rows each).

`replaceAll('\r\n', '\n')` turns `\r\r\n` into `\r\n`, which the second reading counts as two again. The answer equals
that of `\n\n` (sent by both), so this is the recorded "one character further" residual in another writing; I list it
because `\r\r\n` is one line ending (a file converted twice), not two.

## Checked and held (no finding)

- **Screen path, `fuzz.mts`, seeds 1, 2, 3** (about 32,000 letters each, each read for its own patient and one in four
  for a second): 120,488 screens. Both send 64,902 (the texts differ in 18,379); both refuse 51,828; base sends and head
  refuses 3,758 (3,696 hold a CR LF whose LF writing the head refuses too; 15 hold a CR LF and the head sends their LF
  writing, `\r\r\n` in the rows I read; 47 hold no CR LF: A-3). Base refuses
  and head sends: 0. A refused letter written otherwise than the base wrote it: 0. A run the base replaced standing in
  the head's text: 0. A base candidate missing: 0. Head throws: 0.
- **The composition, exactly** (the opened copy `a/open/redact.ts`, 40,163 letters): `screenAsFirstRead` gives the
  base's text and candidates in every one; `holdsAsFirstRead` gives the base's check; where the head's text differs, it
  is `merge(first.found + wider)` and every span of the first reading lies inside one of its spans.
- **The stores**: the first reading, the first check and the wider reading give the same answer inside one reading as
  outside it (40,163 letters, 0 differ); the same call twice (0 differ); two subjects with the same dates of birth and
  other names and numbers in one reading, in both orders (30 compared, 0 differ); 1,200 readings made to throw at each
  read of the patient's lists (292 threw; the three stores were null and the fold plain after each; the next call's
  answer was the reference's each time). The form list is frozen and adding to it throws; a form and its patterns are
  not frozen, and no reader left a mark on one (source, `lastIndex`, `insidePart` the same before and after every reader).
- **Time**: summed over the fuzzer, the head's screen and check took 287.2 s against the base's 280.8 s (1.02). The 17
  letters flagged slow in a run (up to 168 times the base) did not repeat: 30 runs of the worst gave a median of 1.06 ms
  against 0.92 ms.

## Not reproduced (suspicions only)

- A wider match of a name alone defeating K-1 on the screen path (A-2): none of the 392 rows is one.
- A stored answer that differs from a fresh one: none found by any of the store tests above.
- By reading only, not measured: `holdsIdentifier` makes one subject and `holdsAsFirstRead` another for the same call,
  so the forms store, keyed by the subject object, builds the first reading's forms twice in one check.

## Rerun

```
export PATH=/opt/node24/bin:$PATH NODE_OPTIONS="--import /home/user/work/ts-resolve.mjs"
cd /home/user/ops/designs/lane-b-redact-item-26/reviews/a
node fuzz.mts 1 400          # seeds 1, 2, 3: out/fuzz-<seed>.json and one .jsonl per category
node fuzz.mts 11 170 k1      # seeds 11, 12: K-1's claim on CR LF letters
node probes.mts > out/probes.txt
node analyze.mts > out/analyze.txt ; node analyze2.mts > out/analyze2.txt
```

`a/open/redact.ts` is the frozen head with one export added at its end (its internals, for the store tests); the fuzzer
checks on every third letter that it answers as the frozen head does (0 differ). Nothing outside `reviews/a/` and this
file was written.
