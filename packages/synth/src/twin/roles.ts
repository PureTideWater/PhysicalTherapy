/**
 * What each 835 element is, for the twin generator: a code kept as sent, an identifier or text
 * replaced, a date shifted, an amount perturbed (balanced later), or an amount scaled on its own. An
 * element the table does not know is replaced, so nothing unclassified leaves the boundary as it was.
 */
export type Role =
  /** Codes, qualifiers, counts, quantities, times: kept as sent. */
  | 'keep'
  /** Identifiers, names, addresses, free text: replaced, the same value always by the same twin value. */
  | 'replace'
  /** CCYYMMDD, shifted. */
  | 'date8'
  /** YYMMDD (ISA09), shifted. */
  | 'date6'
  /** DTM06: a date or a CCYYMMDD-CCYYMMDD range, shifted. */
  | 'period'
  /** An amount the balancing pass sets (BPR02, CLP03-05, CAS amounts, AMT, SVC02-03, PLB amounts). */
  | 'balance'
  /** An amount outside the balances (TS3, TS2, MIA, MOA), scaled with the transaction's factor. */
  | 'scale'
  /** Blanked to spaces (ISA02, ISA04). */
  | 'blank'
  /** ISA06: the synthetic sender. */
  | 'sender'
  /** GS02: SYNTH. */
  | 'gs02'
  /** ISA05: ZZ, the qualifier the synthetic sender uses. */
  | 'zz'
  /** ISA15: T. */
  | 'test';

type Table = Readonly<Record<number, Role | readonly Role[]>>;

const CAS: Table = Object.fromEntries([[1, 'keep'], ...[2, 5, 8, 11, 14, 17].flatMap((reason) => [[reason, 'keep'], [reason + 1, 'balance'], [reason + 2, 'keep']])]) as Table;
const PROCEDURE: readonly Role[] = ['keep', 'keep', 'keep', 'keep', 'keep', 'keep', 'replace', 'keep'];
const PLB: Table = Object.fromEntries([[1, 'replace'], [2, 'date8'], ...[3, 5, 7, 9, 11, 13].flatMap((position) => [[position, ['keep', 'replace']], [position + 1, 'balance']])]) as Table;
const MIA: Table = Object.fromEntries(Array.from({ length: 24 }, (_, index) => [index + 1, [1, 3, 15].includes(index + 1) || [5, 20, 21, 22, 23].includes(index + 1) ? 'keep' : 'scale']));

export const ROLES: Readonly<Record<string, Table>> = {
  ISA: { 1: 'keep', 2: 'blank', 3: 'keep', 4: 'blank', 5: 'zz', 6: 'sender', 7: 'keep', 8: 'replace', 9: 'date6', 10: 'keep', 11: 'keep', 12: 'keep', 13: 'replace', 14: 'keep', 15: 'test', 16: 'keep' },
  GS: { 1: 'keep', 2: 'gs02', 3: 'replace', 4: 'date8', 5: 'keep', 6: 'replace', 7: 'keep', 8: 'keep' },
  GE: { 1: 'keep', 2: 'replace' },
  IEA: { 1: 'keep', 2: 'replace' },
  ST: { 1: 'keep', 2: 'replace', 3: 'keep' },
  SE: { 1: 'keep', 2: 'replace' },
  BPR: { 1: 'keep', 2: 'balance', 3: 'keep', 4: 'keep', 5: 'keep', 6: 'keep', 7: 'replace', 8: 'keep', 9: 'replace', 10: 'replace', 11: 'replace', 12: 'keep', 13: 'replace', 14: 'keep', 15: 'replace', 16: 'date8' },
  TRN: { 1: 'keep', 2: 'replace', 3: 'replace', 4: 'replace' },
  CUR: { 1: 'keep', 2: 'keep', 3: 'keep' },
  REF: { 1: 'keep', 2: 'replace', 3: 'replace', 4: ['keep', 'replace', 'keep', 'replace', 'keep', 'replace'] },
  DTM: { 1: 'keep', 2: 'date8', 3: 'keep', 4: 'keep', 5: 'keep', 6: 'period' },
  N1: { 1: 'keep', 2: 'replace', 3: 'keep', 4: 'replace', 5: 'keep', 6: 'keep' },
  N3: { 1: 'replace', 2: 'replace' },
  N4: { 1: 'replace', 2: 'keep', 3: 'replace', 4: 'keep', 5: 'keep', 6: 'replace', 7: 'keep' },
  PER: { 1: 'keep', 2: 'replace', 3: 'keep', 4: 'replace', 5: 'keep', 6: 'replace', 7: 'keep', 8: 'replace', 9: 'replace' },
  RDM: { 1: 'keep', 2: 'replace', 3: 'replace' },
  LX: { 1: 'keep' },
  TS3: { 1: 'replace', 2: 'keep', 3: 'date8', 4: 'keep', ...Object.fromEntries(Array.from({ length: 20 }, (_, index) => [index + 5, 'scale'])) },
  TS2: Object.fromEntries(Array.from({ length: 19 }, (_, index) => [index + 1, 'scale'])),
  CLP: { 1: 'replace', 2: 'keep', 3: 'balance', 4: 'balance', 5: 'balance', 6: 'keep', 7: 'replace', 8: 'keep', 9: 'keep', 10: 'keep', 11: 'keep', 12: 'keep', 13: 'keep', 14: 'keep' },
  CAS,
  NM1: { 1: 'keep', 2: 'keep', 3: 'replace', 4: 'replace', 5: 'replace', 6: 'replace', 7: 'replace', 8: 'keep', 9: 'replace', 10: 'keep', 11: 'keep', 12: 'replace' },
  MIA,
  MOA: { 1: 'keep', 2: 'scale', 3: 'keep', 4: 'keep', 5: 'keep', 6: 'keep', 7: 'keep', 8: 'scale', 9: 'scale' },
  AMT: { 1: 'keep', 2: 'balance', 3: 'keep' },
  QTY: { 1: 'keep', 2: 'keep', 3: 'keep', 4: 'replace' },
  SVC: { 1: PROCEDURE, 2: 'balance', 3: 'balance', 4: 'keep', 5: 'keep', 6: PROCEDURE, 7: 'keep' },
  LQ: { 1: 'keep', 2: 'keep' },
  PLB,
};

/** The role of a component (positions from 1). Unknown segments and positions are replaced. */
export function roleOf(segmentId: string, position: number, component: number): Role {
  const table = ROLES[segmentId];
  const entry = table?.[position];
  if (entry === undefined) {
    return 'replace';
  }
  if (typeof entry === 'string') {
    return entry;
  }
  return entry[component - 1] ?? 'replace';
}
