import { Random } from '../core/random';

/**
 * SYNTHETIC practices for the contract PHI check's false-refusal measurement (combined audit #120; docs/adr/0070,
 * Part 3; test matrix MOD-12). The check refuses a contract when a run of its pages is one of the practice's stored
 * member IDs, patient control numbers or payer claim control numbers; these twins say how often an ordinary contract
 * would be refused by a large practice's records, and by records built to collide with a contract's own figures.
 *
 * Every value is invented here, seeded, and never written to a file: no value is a real format's
 * check-digit-valid number, and the shapes stay where real identifiers are never issued (a "ZZ" prefix; nine digits
 * starting 9, an area no Social Security number has; claim numbers starting 77). Nothing here is derived from a
 * real file.
 */

export interface ScreenTwinIdentifiers {
  readonly memberIds: readonly string[];
  readonly patientControlNumbers: readonly string[];
  readonly payerClaimNumbers: readonly string[];
}

/** The twin practice's size (the design's 5.7): about the most a practice may hold under the screen's bound, many times over. */
export const SCREEN_TWIN_COUNTS = { memberIds: 80_000, longPatientControlNumbers: 200_000, shortPatientControlNumbers: 1_000, payerClaimNumbers: 200_000 } as const;

/** Five-digit patient control numbers equal to CPT codes a contract writes: below the floor, never looked for. */
export const SHORT_PCNS_EQUAL_TO_CODES: readonly string[] = ['97110', '97112', '97530', '97140', '97116', '97161', '97162', '97163', '97164', '97535'];

let twins: ScreenTwinIdentifiers | undefined;

/**
 * A large SYNTHETIC practice's identifiers: 80,000 member IDs (a third "ZZ" and 7 digits, a third 9 digits starting
 * 9, a third 11 letters and digits), 200,000 patient control numbers (sequential 8-digit numbers from 10000001) and
 * 1,000 five-digit ones below the floor (the CPT codes of SHORT_PCNS_EQUAL_TO_CODES among them), and 200,000
 * 13-digit payer claim control numbers. The same on every machine; built once per process.
 */
export function screenTwinIdentifiers(): ScreenTwinIdentifiers {
  twins ??= buildTwins();
  return twins;
}

function buildTwins(): ScreenTwinIdentifiers {
  const random = new Random('tp-screen-twin-practice/1');
  const members = new Set<string>();
  const third = Math.floor(SCREEN_TWIN_COUNTS.memberIds / 3);
  while (members.size < third) {
    members.add(`ZZ${random.digits(7)}`);
  }
  while (members.size < 2 * third) {
    members.add(`9${random.digits(8)}`);
  }
  while (members.size < SCREEN_TWIN_COUNTS.memberIds) {
    const value = random.alphanumeric(11);
    if (/\d/.test(value) && /[A-Z]/.test(value)) {
      members.add(value);
    }
  }
  const pcns: string[] = [];
  for (let n = 0; n < SCREEN_TWIN_COUNTS.longPatientControlNumbers; n += 1) {
    pcns.push(String(10_000_001 + n));
  }
  const short = new Set<string>(SHORT_PCNS_EQUAL_TO_CODES);
  while (short.size < SCREEN_TWIN_COUNTS.shortPatientControlNumbers) {
    short.add(random.digits(5));
  }
  const ccns = new Set<string>();
  while (ccns.size < SCREEN_TWIN_COUNTS.payerClaimNumbers) {
    ccns.add(`77${random.digits(11)}`);
  }
  return { memberIds: [...members], patientControlNumbers: [...pcns, ...short], payerClaimNumbers: [...ccns] };
}

/** The adversarial collision classes of the design review's M12. */
export const COLLISION_CLASSES = ['date', 'tin', 'zip4', 'word'] as const;
export type CollisionClass = (typeof COLLISION_CLASSES)[number];

const DASH = '[-\\u2010-\\u2015]';
const NOT_BEFORE = '(?<![\\p{L}\\p{N}])';
const NOT_AFTER = '(?![\\p{L}\\p{N}])';

const int = (text: string) => Number.parseInt(text, 10);

function validDate(year: number, month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * A twin practice per collision class, built from the given pages' own text (set v2's), so each holds identifiers
 * a contract of the set really writes:
 * - date: patient control numbers equal to every hyphenated date the pages write, as the screen's tokenizer joins
 *   it ("2026-01-01" is 20260101, "01-01-2026" is 01012026);
 * - tin: nine-digit member IDs equal to every TIN the pages write (NN-NNNNNNN, joined over its hyphen);
 * - zip4: nine-digit member IDs equal to every ZIP+4 the pages write (NNNNN-NNNN, joined);
 * - word: letter-only patient control numbers equal to every word of 8 or more letters the pages write
 *   ("REIMBURSEMENT", "AGREEMENT").
 * The stored-side rules (a digit in every kind; 8-digit calendar dates dropped) should bring date and word to zero
 * refusals; TIN and ZIP+4 collisions stay refused (fail closed) and are counted.
 */
export function screenCollisionIdentifiers(pages: readonly string[]): Readonly<Record<CollisionClass, ScreenTwinIdentifiers>> {
  const dates = new Set<string>();
  const tins = new Set<string>();
  const zips = new Set<string>();
  const words = new Set<string>();
  for (const page of pages) {
    const text = page.normalize('NFKC');
    for (const match of text.matchAll(new RegExp(`${NOT_BEFORE}(\\d{4})${DASH}(\\d{1,2})${DASH}(\\d{1,2})${NOT_AFTER}`, 'gu'))) {
      const [whole, year = '', month = '', day = ''] = match;
      if (validDate(int(year), int(month), int(day))) {
        dates.add(whole.replace(/\D/g, ''));
      }
    }
    for (const match of text.matchAll(new RegExp(`${NOT_BEFORE}(\\d{1,2})${DASH}(\\d{1,2})${DASH}(\\d{4})${NOT_AFTER}`, 'gu'))) {
      const [whole, month = '', day = '', year = ''] = match;
      if (validDate(int(year), int(month), int(day)) || validDate(int(year), int(day), int(month))) {
        dates.add(whole.replace(/\D/g, ''));
      }
    }
    for (const match of text.matchAll(new RegExp(`${NOT_BEFORE}\\d{2}${DASH}\\d{7}${NOT_AFTER}`, 'gu'))) {
      tins.add(match[0].replace(/\D/g, ''));
    }
    for (const match of text.matchAll(new RegExp(`${NOT_BEFORE}\\d{5}${DASH}\\d{4}${NOT_AFTER}`, 'gu'))) {
      zips.add(match[0].replace(/\D/g, ''));
    }
    for (const match of text.matchAll(new RegExp(`${NOT_BEFORE}\\p{L}{8,}${NOT_AFTER}`, 'gu'))) {
      words.add(match[0].toUpperCase());
    }
  }
  const none: readonly string[] = [];
  return {
    date: { memberIds: none, patientControlNumbers: [...dates].sort(), payerClaimNumbers: none },
    tin: { memberIds: [...tins].sort(), patientControlNumbers: none, payerClaimNumbers: none },
    zip4: { memberIds: [...zips].sort(), patientControlNumbers: none, payerClaimNumbers: none },
    word: { memberIds: none, patientControlNumbers: [...words].sort(), payerClaimNumbers: none },
  };
}

/**
 * MOD-12's practice (test matrix MOD-12; workflow.mod12): the identifiers its 835 carries, and how its documents
 * write them. The tests that load or seed MOD-12's records take them from here, so the 835 and the tests agree.
 */
export const MOD12_PRACTICE = {
  /** The patient a misfiled EOB names (NM1*QC's MI), and how it writes the ID: after a colon, spaced in groups. */
  memberId: 'ZZ7120034',
  memberIdWritten: 'Member ID:ZZ 712 0034',
  /** That patient's claim: its patient control number (CLP01) and payer claim control number (CLP07). */
  patientControlNumber: 'SYNPCN12001',
  payerClaimNumber: '7712000000345',
  /** The exhibit's hyphenated writing of the payer claim number. */
  payerClaimNumberWritten: '77-1200-0000345',
  /** The practice's other claims' patient control numbers, each one the screen leaves out: CPT codes (below the floor), a date and a word. */
  ignoredPatientControlNumbers: ['97110', '97530', '20260101', 'SCHEDULE'],
  ignoredPayerClaimNumbers: ['7712000000346', '7712000000347', '7712000000348', '7712000000349'],
  /** The other claims' patients' member IDs: held, and written by no MOD-12 document. */
  otherMemberIds: ['SYNMBR12000002', 'SYNMBR12000003', 'SYNMBR12000004', 'SYNMBR12000005'],
} as const;

/** MOD-12's practice as the screen reads it: every member ID, patient control number and payer claim number its 835 carries. */
export function mod12Identifiers(): ScreenTwinIdentifiers {
  return {
    memberIds: [MOD12_PRACTICE.memberId, ...MOD12_PRACTICE.otherMemberIds],
    patientControlNumbers: [MOD12_PRACTICE.patientControlNumber, ...MOD12_PRACTICE.ignoredPatientControlNumbers],
    payerClaimNumbers: [MOD12_PRACTICE.payerClaimNumber, ...MOD12_PRACTICE.ignoredPayerClaimNumbers],
  };
}
