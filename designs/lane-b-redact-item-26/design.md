# Queues item 26 (MOD-23): K-1, two name forms, stored numbers with a separator: design note

W17, 2026-11-11, on the base f3f5a642 (`packages/redact/src/redact.ts`). Synthetic twins only. Scripts: `scripts/`.

## One construction for all three: the first reading stands, and a second reading only adds

`matchesIn`, `appliedMatches`, `merge`, the patterns and the survivor scan are **not changed by one character**. The
base's `redactLetterForScreen` and `holdsIdentifier` become `screenAsFirstRead` and `holdsAsFirstRead`, bodies unchanged.
Around them:

- **Redaction.** `widerMatchesIn` reads the call's own names and numbers a second, wider way (below). Its matches are
  applied only to a letter the first reading's own check does not refuse. A letter the base refuses is returned exactly
  as the base wrote it and is refused again (the head's check reads no less). In a letter the base sends, `merge` only
  joins and widens spans, so every span the base replaced is replaced, and every run the base offered the other-patient
  screen is still offered (the base's candidates, plus those of the sent text).
- **The check.** `holdsIdentifier` = the base's check, or any wider match left in the text; and, where the text holds a
  CR LF, the same once more on the text with each CR LF written as LF. Refused if either reading refuses.

So "nothing the base redacts or refuses is shown or sent by the head" holds by how the functions are composed, not by a
case analysis. This follows two rules the base already has: a fresh match is applied only where the scan does not refuse
without it (`appliedMatches`), and a second reading whose worse answer is taken (`chainLeft`'s case-glued label).

## The gaps

| Gap | Rule (the simplest that closes it) | Must-stay cost, measured | Deliberately left |
| --- | --- | --- | --- |
| **K-1** (an SSN in clear: a CR LF counts two against a label's reach) | The check reads a text that holds a CR LF once more with each CR LF as LF; the worse answer is taken. Every reach (label, noun, window), not only `LABEL_REACH`. | A CR LF letter is refused wherever its LF writing is. Of `k1.txt`'s 29 letters, 7 turn from sent to refused (each the LF row's answer), none the other way. The check runs twice on CR LF letters (time; the gate's 3 s budget is the test). | The letter is refused, not redacted, where the LF writing would have redacted (redaction still reads the text as written). One character further is the "label out of reach" residual, unchanged. Not W5's narrower idea (count CR LF once inside `scanLabeled`, with `departs`): it reaches one label only and needs the scan's internals. |
| **MOD-23 name forms** (`Zephy ra`, `Zephy. ra`, `Z e p h y r a`) | In the wider reading a space or a period joins anywhere inside a name's part, whatever the pieces' case or length (`spacedPiecesPass` not asked; every gap inside a part is the form's existing spaced gap). One rule for both forms; an initial beside such a name is taken as beside any name. Read on the plain fold and the look-alike fold, as the first reading is. | Redaction only, never a refusal by itself. Over the repository's prose (500 texts, 210,403 characters: fixtures' `.txt` and `.md`, the narrative set, the letters quoted in the gateway's tests), each of 64 names alone as the patient (`scripts/cost-names.mts`): INA loses "in a" (32 places, 23 texts), ASA "as a" (19), ISA "is a" (11), TOBE "to be" (5), THEO, BEA, IDA one or two; NEWMAN, UNDERWOOD and 52 others lose nothing. The gate's 975,489 letters give the refusal count (running). | The narrative's check and the packet verifier keep the base's reading (`subject.patterns` false, as for #146's joiners: there "in a" would fail every narrative of a patient INA, not cost two words). A name glued to other letters, a part split by `*`, `/`, `{`: as recorded. A capitals-or-length rule to spare "in a" was not taken: it is the rule that leaks today, and any narrower one needs a case per form. |
| **P6 stored numbers** (`ZZ12345/01`, `.01`, `,01`, `+01` written as stored; a digits-only claim number held `1234.56` with no label) | In the wider reading, what the records themselves write between two characters of a number joins them at that place too, beside the usual joiners (the contract screen's `storedSeparators` idea, on the form's own gaps). The base's exclusions still apply (a claim's digits as a currency amount with cents; a whole written calendar date with no label). | None on any current fixture or corpus (no stored value holds such a separator). For a patient whose stored number does: that exact writing is replaced wherever it stands (`1234.56 units` for a claim held `1234.56`; `$1,234.56` is kept). | One piece of a stored number alone (`ZZ12345` of `ZZ12345 01`): a form per piece would replace every `01` in a letter. A name held with a plus sign (`JANE+ZEPHYRA` is one part): a change to how names split, which reaches the verifier; proposed for the queue. The narrative drafter's own check does not read stored separators (not the letter path); proposed for the queue. |
| **N-1, N-2** (the screen is asked more) | Not closed: no rule above touches what the base offers (the head offers the base's candidates and adds). | None. | Recorded as they are; they err on the safe side. |
| **Digits-only ID glued to a letter** (`Fax X76543210`) | **Not in this pull request.** The 2026-10-27 amendment records it as a chosen reading: glued digits are another, longer identifier, kept for the screen, since no boundary can be known. Closing it means refusing letters, which needs a floor on the number's length (a claim number `0283` would refuse every `G0283`): a second case, and its own measurement over real ID lengths. | n/a | **For the orchestrator's queue, before real PHI in my view:** a card's letter prefix before a stored digits-only ID (`XYZ76543210` for 76543210) is the realistic form. Proposed rule: `numberGlued` reads a digits-only number of N digits or more with a letter right before or after it (refuse), N to be ruled. |

## Tests and gate

Failing-first rows in `redact.leaks.test.ts` (the pinned "sent today" rows of K-1 and MOD-23 turn to refused and
redacted; P6's rows are new) from synthetic letters; a property: for generated letters and patients, whatever the first
reading alone replaced or refused, the head replaces or refuses. W5's and W13's battery with their seeds and fresh
seeds; the gate against f3f5a642 (B reads `packages/redact/src` copied to the gate's layout).
