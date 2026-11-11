# Queues item 26 (MOD-23): what both reviews are given

You are an adversarial reviewer of one change to a PHI redactor. Find what is wrong with it; do not fix it.

## The change
`packages/redact/src/redact.ts` reads a payer's denial letter before a model does. `redactLetterForScreen(text, patient,
claims)` replaces the call's own identifiers (the patient's names, dates of birth, member IDs; the claims' numbers) and
any Social Security or phone number with placeholders, and returns the runs the other-patient screen asks the records
about (`candidates`). `holdsIdentifier(sentText, patient, claims)` then checks the redacted text; true means the letter
is refused and nothing is sent. `redactLetter` and `redactionSpans` are the same reading without the screen.

The change adds a second, wider reading of the call's own names and numbers on top of the first reading, which is the
base's and is meant to be unchanged:
- a name's part with a space or a period anywhere inside it (`Zephy ra`, `Zephy. ra`, `Z e p h y r a`);
- a member ID or claim number with the separators the records themselves hold it with (`ZZ12345/01`, `1234.56`);
- the check reads a text that holds a CR LF once more with each CR LF as LF, and refuses if either reading does.
The wider matches are applied only to a letter the first reading's own check does not refuse; the check refuses on
either reading. The claim to break: **nothing the base refuses is sent by the head, and nothing the base redacts is
shown by the head.** The change also opens the check's stores (views, dates, and now the subject's forms) around each
exported reading (`inOneReading`, `formsOf`), so both readings share them.

The design note (one page): `/home/user/ops/designs/lane-b-redact-item-26/design.md`. Read it first.

## Where things are (read-only: do not edit any of these, do not commit, do not push, no network)
- Head: `/home/user/rev/head/redact.ts` (a frozen copy, with `confusables.ts` beside it). Its diff against the base:
  `/home/user/rev/redact.diff` (about 300 lines; read this, not the 5,000-line file; open the file only at line ranges).
- Base (f3f5a642): `/home/user/rev/base/redact.ts`.
- Run TypeScript directly: `export PATH=/opt/node24/bin:$PATH NODE_OPTIONS="--import /home/user/work/ts-resolve.mjs"`,
  then `node your-script.mts`. Import both files by absolute path with `await import(...)`; both export
  `redactLetter`, `redactLetterForScreen`, `redactionSpans`, `holdsIdentifier`.
- Types: `patient = { pseudonym: 'synthetic-patient-1', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'],
  memberIds: ['SYNMEMBER0042'] }`; `claims = [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-1',
  claimNumbers: ['SYNCLAIM0001'] }]`.
- The new tests: `/home/user/PhysicalTherapy/packages/model-gateway/src/redact.leaks.test.ts`, the
  `describe('MOD-23` block (grep for it; about 140 lines).

## Rules
- **Synthetic letters only.** Names ZEPHYRA, VANTREE, JUNE MARCH and other invented ones; Social Security numbers
  900-xx-xxxx; phones 555-01xx; IDs SYN... and ZZ.... Never a real person's data, anywhere.
- About 20 tool calls. One larger script beats several small ones; send large output to a file and read counts.
- The machine is shared and may be loaded: judge time by the head's time against the base's on the same letter in the
  same run, not by seconds alone.
- Every finding must be one you ran: give the exact letter (as a JSON string), the patient and claims, the base's
  answer and the head's answer, and the script that shows it. A suspicion you could not reproduce goes in a separate
  list, marked as not reproduced.
- Severity: **BLOCKING** only if the base refuses a letter and the head sends it, or the base replaces a span and the
  head shows it (or a candidate the base offers the screen is not offered). Everything else is **OTHER**.
- Write no model's or vendor's name in any file. Keep your scripts in your own folder (below) so they can be rerun.
- Your final message: the report file's path and one line per finding (ID, severity, ten words). Nothing else.
