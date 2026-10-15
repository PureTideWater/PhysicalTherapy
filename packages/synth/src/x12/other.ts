/**
 * Interchanges that are not 835s, for test matrix PAR-24 (a 277 uploaded as an 835) and PRD section
 * 10's "a file that is an 837 by mistake". They carry the synthetic sender and enough of their own
 * transaction's opening segments to be recognizable; the parser must refuse them with EDI_NOT_835.
 */
import { type CalendarDate, toIsaDate, toX12Date } from '../core/dates';
import { SYNTH_GS02, SYNTH_ISA06 } from '../identity';
import { interchangeControl } from './build835';
import { DEFAULT_DELIMITERS, type X12Document, type X12Segment, seg } from './segments';

export interface WrongTransactionSpec {
  readonly kind: '277' | '837';
  readonly isa13: number;
  readonly date: CalendarDate;
  readonly payerName: string;
  readonly providerName: string;
}

function body(spec: WrongTransactionSpec): X12Segment[] {
  const date = toX12Date(spec.date);
  if (spec.kind === '277') {
    return [
      seg('BHT', '0085', '08', 'SYNBHT0001', date, '0915', 'TH'),
      seg('HL', '1', undefined, '20', '1'),
      seg('NM1', 'PR', '2', spec.payerName, undefined, undefined, undefined, undefined, 'PI', 'SYNPAYERA'),
      seg('TRN', '1', 'SYNTRN277001'),
      seg('DTP', '050', 'D8', date),
      seg('DTP', '009', 'D8', date),
      seg('HL', '2', '1', '21', '0'),
      seg('NM1', '41', '2', spec.providerName, undefined, undefined, undefined, undefined, '46', 'SYNSUB0001'),
    ];
  }
  return [
    seg('BHT', '0019', '00', 'SYNBHT0002', date, '0915', 'CH'),
    seg('NM1', '41', '2', spec.providerName, undefined, undefined, undefined, undefined, '46', 'SYNSUB0001'),
    seg('PER', 'IC', 'SYNTHETIC BILLING CONTACT', 'TE', '5555550199'),
    seg('NM1', '40', '2', spec.payerName, undefined, undefined, undefined, undefined, '46', 'SYNPAYERA'),
  ];
}

export function wrongTransactionDocument(spec: WrongTransactionSpec): X12Document {
  const functional = spec.kind === '277' ? 'HN' : 'HC';
  const version = spec.kind === '277' ? '005010X214' : '005010X222A1';
  const transaction = body(spec);
  const segments: X12Segment[] = [
    seg(
      'ISA',
      '00',
      ' '.repeat(10),
      '00',
      ' '.repeat(10),
      'ZZ',
      SYNTH_ISA06,
      'ZZ',
      'SYNTHRECEIVER'.padEnd(15, ' '),
      toIsaDate(spec.date),
      '0915',
      DEFAULT_DELIMITERS.repetition,
      '00501',
      interchangeControl(spec.isa13),
      '0',
      'T',
      DEFAULT_DELIMITERS.component,
    ),
    seg('GS', functional, SYNTH_GS02, 'SYNTHRCV', toX12Date(spec.date), '0915', String(spec.isa13), 'X', version),
    seg('ST', spec.kind, '0001', version),
    ...transaction,
    seg('SE', String(transaction.length + 2), '0001'),
    seg('GE', '1', String(spec.isa13)),
    seg('IEA', '1', interchangeControl(spec.isa13)),
  ];
  return { interchanges: [{ delimiters: DEFAULT_DELIMITERS, segments }] };
}
