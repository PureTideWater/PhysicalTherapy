/**
 * The letter check over a call with many claim numbers (Queues item 39, MOD-26; docs/adr/0054): the shapes of the
 * pinned rows G-1 and the cold first check. SYNTHETIC by construction: "SYN" and six digits, a twin's name.
 *
 * Run as a script (tsx), it is the cold row: in its own fresh process it checks one letter once and prints one JSON
 * line, the processor time of that first check and this machine's calibration taken after it.
 */
import { CHECK_WORK_BUDGET, type LetterClaim, type PatientIdentifiers, checkWorkOf, holdsIdentifier, redactLetterForScreen } from '@tp/redact';

import { calibrationMs } from './time-budget';

/** Claim numbers of nine characters: SYN and six digits, each its own. */
export const nineCharacterNumbers = (count: number): string[] => Array.from({ length: count }, (_, i) => `SYN${String(556_000 + i)}`);

export const TWIN: PatientIdentifiers = { pseudonym: 'p1', names: ['JANE Q ZEPHYRA'], memberIds: ['ZZ1234567'], datesOfBirth: ['1961-03-03'] };

/** One claim holding every number. */
export const oneClaim = (numbers: readonly string[]): LetterClaim[] => [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: [...numbers] }];

/** The pinned rows' letter: 19 characters, none of them an identifier. */
export const SHORT_LETTER = 'The claim was paid.';

/** One letter check as the reader runs it (denialLetterSpec.prepare): redaction, then the check over what it sends, on one counter. */
export function checkOnce(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): 'sent' | 'held' | 'refused' {
  const redacted = redactLetterForScreen(text, patient, claims);
  const spent = checkWorkOf(redacted);
  if (spent > CHECK_WORK_BUDGET) {
    return 'refused';
  }
  return holdsIdentifier(redacted.text, patient, claims, spent) ? 'held' : 'sent';
}

function threadMs(): number {
  const used = process.threadCpuUsage();
  return (used.user + used.system) / 1000;
}

if (process.argv[1] !== undefined && import.meta.filename === process.argv[1]) {
  const count = Number.parseInt(process.argv[2] ?? '1000', 10);
  const claims = oneClaim(nineCharacterNumbers(count));
  const started = threadMs();
  const outcome = checkOnce(SHORT_LETTER, TWIN, claims);
  const ms = threadMs() - started;
  process.stdout.write(`${JSON.stringify({ count, outcome, ms, calibrationMs: calibrationMs() })}\n`);
}
