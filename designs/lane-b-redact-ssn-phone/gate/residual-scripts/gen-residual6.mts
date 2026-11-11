// Synthetic only. co-001/redact-ssn-phone-leaks (MOD-21, MOD-22): the residual table brought to the head that closes
// rulings A, A' and B. Every row is read again by the head's redactor on the path a letter takes (redactLetterForScreen,
// then holdsIdentifier), and the table is written back with what the head does:
// - ssnPhone and ownIdentifierA: each row keeps `p`, `gate`, `letter` and its `number` or `token`, and gets
//   `outcome: "refused"` (no `sent`) or `outcome: "redacted"` with the text the head sends. The script FAILS, writing
//   nothing, if a row is still sent with its number or token in clear: sent unchanged, sent with the number or token in the
//   text, or sent with a letter or digit of it outside every replaced span.
// - monthWordName: each row gets the head's `sent` (the script fails if one is refused, or still sends the month word).
// - loneInitial and failSafe: checked, never changed: a lone-initial row must be sent exactly as recorded, a fail-safe
//   row refused (the script fails on the first that differs).
// - `about`: what the table pins now.
// No row is added, dropped or reordered, and the file keeps the layout the earlier scripts wrote (write-residuals5.py's
// dump: one row a line); the script fails if the file as read is not in that layout. Running it again on its own output
// changes nothing (`--check` writes nothing and exits 1 if the file would change).
// Usage: node --import ../ts-resolve.mjs gen-residual6.mts [--check]   (the table and the tree: the two constants below)
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const TABLE = '/home/user/leaks/packages/model-gateway/src/redact.residuals.json';
const REDACT = '/home/user/leaks/packages/redact/src/redact.ts';

const ABOUT =
  "The residuals co-001/redact-range-glued recorded (docs/adr/0054; the orchestrator's rulings of 2026-11-07), as SYNTHETIC rows from the differential gate (975,489 synthetic letters, cc3dd7f6 against that fix's head) and the judge's review rounds 1 to 4 and review round 5, each refused by cc3dd7f6 and handled by this head exactly as written here: the rows of rulings A, A' and B as co-001/redact-ssn-phone-leaks (MOD-21, MOD-22) closed them, and the lone-initial and fail-safe classes as before. " +
  "ssnPhone (ruling A): an SSN or phone cc3dd7f6 refused only because a range's own digits chained, which the range fix sent with `number` in clear; closed: each row is refused (`outcome` \"refused\") or sent with the number replaced (`outcome` \"redacted\", `sent` the text sent, which holds no `number`). SSN digits 900-xx-xxxx (or the never-issued area 000) and phone digits 202/555-01xx, else the digits kept: 9xx, never issued, or a date's shape with a digit beside it that a fuzzer wrote as an SSN (`9 01-12-1985`, `01-12-1985 9`). " +
  "ownIdentifierA (ruling A'): the call's own name, member ID, claim number or date of birth in a form no rule read (OCR letter/digit confusions, homoglyphs, Roman or CJK months, unpadded digits, a year in words), which the range fix sent with `token` in clear; closed the same way: refused, or redacted with `sent` holding no `token`. " +
  "monthWordName (ruling B): a name part that is a month's word next to a date; decided: the month of a month-and-year phrase is the name, and `sent` holds its placeholder. " +
  'loneInitial, as before: a lone letter that is an initial of the name glued to a range\'s end, with no name, part, label or full stop beside it, sent (`token` the initial). ' +
  'failSafe, as before: letters cc3dd7f6 sent that this head refuses: unchanged (`gate` "must-stay"), with a month-word part of the name or an amount\'s digits replaced and no identifier the gate\'s oracle places (`gate` "must-stay-changed-at-base": review round 5), or from the glued check\'s rows (`gate` "glued-check"). ' +
  "Regenerate only with the scripts kept (synthetic only) in the ops repository (claude/build-ops) at designs/lane-b-redact-ssn-phone/gate/residual-scripts/, never by hand: gen-residual6.mts wrote this version from the rows as they stood and the head's redact.ts.";

interface Stored {
  readonly names: string[];
  readonly datesOfBirth: string[];
  readonly memberIds: string[];
  readonly claimNumbers: string[];
}

interface Row {
  p: number;
  gate: string;
  letter: string;
  outcome?: 'refused' | 'redacted';
  sent?: string;
  number?: string;
  token?: string;
}

interface Table {
  about: string;
  patients: Stored[];
  ssnPhone: Row[];
  ownIdentifierA: Row[];
  monthWordName: Row[];
  loneInitial: Row[];
  failSafe: Row[];
}

interface Span {
  readonly start: number;
  readonly end: number;
  readonly placeholder: string;
}

interface Redactor {
  redactLetterForScreen(text: string, patient: object, claims: object[]): { readonly text: string };
  holdsIdentifier(text: string, patient: object, claims: object[]): boolean;
  redactionSpans(text: string, patient: object, claims: object[]): { readonly text: string; readonly spans: readonly Span[] };
}

const check = process.argv.includes('--check');
const redactor = (await import(pathToFileURL(REDACT).href)) as Redactor;
const read = readFileSync(TABLE, 'utf8');
const table = JSON.parse(read) as Table;

/** The table in the layout the earlier scripts wrote: each top-level key on a line, each row of a list on a line of its own. */
function dump(value: object): string {
  const items = Object.entries(value).map(([key, held]) => (Array.isArray(held) ? `  ${JSON.stringify(key)}: [\n${held.map((row) => `    ${JSON.stringify(row)}`).join(',\n')}\n  ]` : `  ${JSON.stringify(key)}: ${JSON.stringify(held)}`));
  return `{\n${items.join(',\n')}\n}\n`;
}

const fail = (message: string, row?: Row): never => {
  console.error(`gen-residual6: ${message}${row === undefined ? '' : `\n  ${JSON.stringify(row)}`}`);
  process.exit(1);
};

if (dump(table) !== read) fail('the table as read is not in the layout this script writes; nothing written');

const call = (row: Row) => {
  const stored = table.patients[row.p];
  if (stored === undefined) return fail('a row names no patient', row);
  return {
    patient: { pseudonym: 'synthetic-patient-21', names: stored.names, datesOfBirth: stored.datesOfBirth, memberIds: stored.memberIds },
    claims: [{ claimId: 'synthetic-claim-21', patientPseudonym: 'synthetic-patient-21', claimNumbers: stored.claimNumbers }],
  };
};

/** What the head does with a row's letter: null when the check refuses it, else the text sent. */
const handled = (row: Row): string | null => {
  const { patient, claims } = call(row);
  const screened = redactor.redactLetterForScreen(row.letter, patient, claims);
  return redactor.holdsIdentifier(screened.text, patient, claims) ? null : screened.text;
};

/**
 * Whether a sent row still shows its number or token: the text sent holds it as written, or a letter or digit of a place
 * the letter writes it lies outside every span redaction replaced. The number or token must be in the letter, so the
 * check is never empty.
 */
function inClear(row: Row, secret: string, sent: string): boolean {
  const { patient, claims } = call(row);
  const { text, spans } = redactor.redactionSpans(row.letter, patient, claims);
  const written = secret.normalize('NFKC');
  if (!row.letter.includes(secret) || !text.includes(written)) fail('a row whose letter does not hold its number or token', row);
  if (sent.includes(secret) || sent.includes(written)) return true;
  for (let at = text.indexOf(written); at >= 0; at = text.indexOf(written, at + 1)) {
    for (const match of written.matchAll(/[\p{L}\p{N}]/gu)) {
      const index = at + match.index;
      if (!spans.some((span) => span.start <= index && index < span.end)) return true;
    }
  }
  return false;
}

const tally: Record<string, number> = {};
const count = (key: string) => {
  tally[key] = (tally[key] ?? 0) + 1;
};

/** A row of ruling A or A' as the head closes it. */
function closed(row: Row, name: 'ssnPhone' | 'ownIdentifierA'): Row {
  const secret = name === 'ssnPhone' ? row.number : row.token;
  if (secret === undefined || !/[\p{L}\p{N}]/u.test(secret)) return fail(`a ${name} row with no number or token`, row);
  const kept = name === 'ssnPhone' ? { number: secret } : { token: secret };
  const sent = handled(row);
  if (sent === null) {
    count(`${name} refused`);
    return { p: row.p, gate: row.gate, letter: row.letter, outcome: 'refused', ...kept };
  }
  if (inClear(row, secret, sent)) return fail(`a ${name} row is still sent with its number or token in clear; nothing written`, { ...row, sent });
  count(`${name} redacted`);
  return { p: row.p, gate: row.gate, letter: row.letter, outcome: 'redacted', sent, ...kept };
}

const MONTH_WORD = /(?<!\p{L})(?:May|June)(?!\p{L})/u;

const next: Table = {
  about: ABOUT,
  patients: table.patients,
  ssnPhone: table.ssnPhone.map((row) => closed(row, 'ssnPhone')),
  ownIdentifierA: table.ownIdentifierA.map((row) => closed(row, 'ownIdentifierA')),
  monthWordName: table.monthWordName.map((row) => {
    const sent = handled(row);
    if (sent === null) return fail('a monthWordName row is refused; nothing written', row);
    // Every row's patient is JUNE Q VANTREE and MAY ZEPHYRA: neither month word may be left in a month-and-year phrase.
    if (MONTH_WORD.test(sent)) return fail('a monthWordName row still sends the month word; nothing written', { ...row, sent });
    count(sent === row.sent ? 'monthWordName as recorded' : 'monthWordName new sent');
    return { p: row.p, gate: row.gate, letter: row.letter, sent };
  }),
  loneInitial: table.loneInitial.map((row) => {
    if (handled(row) !== row.sent) fail('a loneInitial row is no longer sent as recorded; nothing written', row);
    count('loneInitial as recorded');
    return row;
  }),
  failSafe: table.failSafe.map((row) => {
    if (handled(row) !== null) fail('a failSafe row is no longer refused; nothing written', row);
    count('failSafe refused');
    return row;
  }),
};

const written = dump(next);
console.log(JSON.stringify(tally));
if (written === read) {
  console.log('the table is already as this head handles it; nothing to write');
} else if (check) {
  console.log('the table would change (--check: nothing written)');
  process.exit(1);
} else {
  writeFileSync(TABLE, written);
  console.log(`wrote ${TABLE}`);
}
