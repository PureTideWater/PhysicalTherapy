/**
 * The parser on small SYNTHETIC documents, one defect or feature at a time: envelopes and control
 * numbers, required and misplaced segments, element checks, balancing, observed allowed, reversal
 * linkage and the report.
 */
import { cents } from '@tp/money';
import { describe, expect, it } from 'vitest';

import { type EdiError, Edi835UsageError } from './errors';
import { Edi835Parser } from './parser';
import { remittancesOf } from './stream';
import { SYNTHETIC_BODY, parseText, releaseDirectoryCodeLists, syntheticInterchange, syntheticIsa } from './testing';
import { type Claim, type ParseReport, type Remittance } from './types';

const codeLists = releaseDirectoryCodeLists();
const parse = (text: string) => parseText(text, codeLists);

/** An error as "CODE reason-or-scope at ID index.element". */
function describeError(error: EdiError): string {
  const detail = error.reason ?? error.scope ?? error.found ?? '';
  return `${error.code} ${detail} at ${error.segmentId} ${String(error.segmentIndex)}.${String(error.elementPosition)}`.replace('  ', ' ');
}

function holds(report: ParseReport, transaction = 0): string[] {
  return (report.transactions[transaction]?.heldReasons ?? []).map(describeError);
}

function documentErrors(result: { readonly report: ParseReport }): string[] {
  return result.report.documentErrors.map(describeError);
}

const replace = (body: readonly string[], prefix: string, ...segments: string[]): string[] => {
  const position = body.findIndex((segment) => segment.startsWith(prefix));
  return [...body.slice(0, position), ...segments, ...body.slice(position + 1)];
};
const insertAfter = (body: readonly string[], prefix: string, ...segments: string[]): string[] => {
  const position = body.findIndex((segment) => segment.startsWith(prefix));
  return [...body.slice(0, position + 1), ...segments, ...body.slice(position + 1)];
};
const without = (body: readonly string[], prefix: string): string[] => replace(body, prefix);

function only(text: string): { remittance: Remittance; report: ParseReport } {
  const result = parse(text);
  const [remittance] = remittancesOf(result);
  if (remittance === undefined) {
    throw new Error(`no transaction: ${documentErrors(result).join('; ')}`);
  }
  return { remittance, report: result.report };
}

const claimOf = (body: readonly string[]): Claim => only(syntheticInterchange([body])).remittance.claims[0] as Claim;

describe('a valid transaction set', () => {
  it('emits the envelope and transaction events and a loaded report', () => {
    const result = parse(syntheticInterchange());
    expect(result.events.map((event) => event.type)).toEqual(['interchange', 'group', 'transaction', 'group_end', 'interchange_end']);
    const { report } = result;
    expect(report.outcome).toBe('loaded');
    expect(report.documentErrors).toEqual([]);
    expect(report.envelopeErrors).toEqual([]);
    expect(report.segments).toBe(25);
    expect(report.bom).toBe(false);
    expect(report.codeListRelease).toBe(900001);
    expect(report.memory.peakTransactionSegments).toBe(21);
    expect(report.receipt).toEqual({ transactions: 1, claims: 1, lines: 1, reversals: 0, plbTotalCents: cents(0n), held: [], unknownCodes: [], loaded: { transactions: 1, claims: 1, lines: 1 } });
    const [remittance] = remittancesOf(result);
    expect(remittance?.loadable).toBe(true);
    expect(remittance?.dedupKey).toEqual({ senderId: 'SYNTHSENDER', payeeId: '9900000001', isa13: '000000001', trn02: 'SYNTRACE0001', bpr02Cents: cents(10000n) });
    expect(remittance?.payment).toMatchObject({ segmentIndex: 4, handling: 'C', amountCents: cents(10000n), creditDebit: 'C', method: 'ACH', format: 'CCP', date: '2026-04-06', paymentCents: cents(10000n) });
    expect(remittance?.payment?.senderDfi).toEqual({ qualifier: '01', id: '999999999', accountQualifier: 'DA', account: 'SYNACCT1' });
    expect(remittance?.payment?.receiverDfi).toEqual({ qualifier: '01', id: '999999998', accountQualifier: 'DA', account: 'SYNACCT2' });
    expect(remittance?.payment?.originatingCompanyId).toBe('1SYN00000A');
    expect(remittance?.trace).toEqual({ segmentIndex: 5, type: '1', number: 'SYNTRACE0001', originatorId: '1SYN00000A', supplemental: null });
    expect(remittance?.productionDate).toBe('2026-04-05');
    expect(remittance?.payer).toMatchObject({ entity: 'PR', name: 'SYNTHETIC PAYER A', idQualifier: null, id: null, references: [{ segmentIndex: 10, qualifier: '2U', value: 'SYNPAYERA' }] });
    expect(remittance?.payer?.address).toEqual({ lines: ['1 SYNTHETIC WAY'], city: 'SYNTHVILLE', state: 'NC', postalCode: '00013', country: null, countrySubdivision: null });
    expect(remittance?.payer?.contacts).toEqual([{ segmentIndex: 11, function: 'BL', name: 'SYNTHETIC HELP DESK', communications: [{ qualifier: 'TE', number: '5555550100' }] }]);
    expect(remittance?.payee).toMatchObject({ entity: 'PE', idQualifier: 'XX', id: '9900000001', deliveryMethod: null });
    expect(remittance?.payerIdentifiers).toEqual([
      ['2U', 'SYNPAYERA'],
      ['TRN03', '1SYN00000A'],
    ]);
    expect(remittance?.headerNumbers).toEqual([{ segmentIndex: 16, number: '1', summaries: [] }]);
    expect(remittance?.trailer).toEqual({ segmentIndex: 23, segmentCount: '21', controlNumber: '0001' });
    const claim = remittance?.claims[0];
    expect(claim).toMatchObject({ index: 0, segmentIndex: 17, headerNumber: '1', status: '1', chargeCents: cents(15000n), paidCents: cents(10000n), patientResponsibilityCents: cents(2000n), patientShareCents: cents(2000n), reversal: null, correction: null });
    expect(claim?.names).toEqual([{ segmentIndex: 18, entity: 'QC', entityType: '1', lastOrOrganization: 'SYNTHLAST', first: 'SYNTHFIRST', middle: null, suffix: null, idQualifier: 'MI', id: 'SYNMBR0001' }]);
    expect(claim?.lines[0]).toMatchObject({
      lineNo: 1,
      procedure: { qualifier: 'HC', code: '97110', modifiers: ['GP'], description: null },
      units: '2',
      serviceFrom: '2026-03-15',
      serviceTo: '2026-03-15',
      observedAllowed: { cents: cents(12000n), basis: 'paid_plus_pr', allocatedFromClaim: false, allocatedPatientShareCents: null },
      differenceCents: cents(0n),
    });
  });

  it('streams a whole document chunk by chunk to the same events', () => {
    const text = syntheticInterchange([SYNTHETIC_BODY, replace(SYNTHETIC_BODY, 'TRN', 'TRN*1*SYNTRACE0002*1SYN00000A')]);
    const parser = new Edi835Parser({ codeLists });
    const events = [...Buffer.from(text)].flatMap((byte) => parser.write(Uint8Array.of(byte)));
    const end = parser.end();
    expect([...events, ...end.events]).toEqual(parse(text).events);
    expect(end.report.memory.peakBufferedCharacters).toBeLessThanOrEqual(106);
    expect(() => parser.write(Uint8Array.of(1))).toThrow(Edi835UsageError);
    expect(() => parser.end()).toThrow(Edi835UsageError);
  });
});

describe('envelopes and control numbers', () => {
  const text = syntheticInterchange();

  it('refuses an ISA with a malformed control number or date, or another version, for the whole document', () => {
    expect(documentErrors(parse(text.replace('*000000001*0*T', '*00000000A*0*T')))).toEqual(['EDI_SYNTAX invalid_number at ISA 1.13']);
    expect(documentErrors(parse(text.replace('*260406*0915*^', '*261340*0915*^')))).toEqual(['EDI_SYNTAX invalid_date at ISA 1.9']);
    expect(documentErrors(parse(text.replace('*00501*', '*00401*')))).toEqual(['EDI_NOT_835 00401 at ISA 1.12']);
  });

  it('refuses an ISA header that is not fixed width', () => {
    expect(documentErrors(parse(text.replace('SYNTHSENDER    ', 'SYNTHSENDER')))).toEqual(['EDI_SYNTAX header at ISA 1.6']);
  });

  it('accepts a TA1 in the interchange and checks it', () => {
    expect(parse(text.replace('~GS*', '~TA1*000000001*260406*0915*A*000~GS*')).report.outcome).toBe('loaded');
    expect(documentErrors(parse(text.replace('~GS*', '~TA1*000000001*269999*0915*A*000~GS*')))).toEqual(['EDI_SYNTAX invalid_date at TA1 2.2']);
  });

  it('refuses a malformed GS, GE or IEA, and anything out of place in the envelope', () => {
    expect(documentErrors(parse(text.replace('*20260406*0915*1*X', '*20261306*0915*1*X')))).toEqual(['EDI_SYNTAX invalid_date at GS 2.4']);
    expect(documentErrors(parse(text.replace('GE*1*1~', 'GE*1~')))).toEqual(['EDI_SYNTAX missing_element at GE 24.2']);
    expect(documentErrors(parse(text.replace('IEA*1*000000001', 'IEA*X*000000001')))).toEqual(['EDI_SYNTAX invalid_number at IEA 25.1']);
    expect(documentErrors(parse(text.replace('~GS*', '~BPR*C~GS*')))).toEqual(['EDI_SYNTAX unexpected_segment at BPR 2.0']);
    expect(documentErrors(parse(text.replace('~ST*835*0001~', '~ST*835*0001~').replace('~GS*HP*SYNTH*SYNTHRCV*20260406*0915*1*X*005010X221A1~', '~GS*HP*SYNTH*SYNTHRCV*20260406*0915*1*X*005010X221A1~LX*1~')))).toEqual(['EDI_SYNTAX unexpected_segment at LX 3.0']);
    expect(documentErrors(parse(`${syntheticIsa()}IEA*0*000000001~`))).toEqual(['EDI_SYNTAX missing_segment at GS 2.0']);
    expect(documentErrors(parse(`${syntheticIsa()}GS*HP*SYNTH*SYNTHRCV*20260406*0915*1*X*005010X221A1~GE*0*1~IEA*1*000000001~`))).toEqual(['EDI_SYNTAX missing_segment at ST 3.0']);
    expect(documentErrors(parse(text.replace('ST*835*0001~', 'ST*835~')))).toEqual(['EDI_SYNTAX missing_element at ST 3.2']);
  });

  it('refuses an 837, a 277 or another version as not an 835, at the transaction set, the group or the version', () => {
    expect(documentErrors(parse(text.replace('ST*835*', 'ST*277*')))).toEqual(['EDI_NOT_835 277 at ST 3.1']);
    expect(documentErrors(parse(text.replace('GS*HP*', 'GS*HN*')))).toEqual(['EDI_NOT_835 HN at GS 2.1']);
    expect(documentErrors(parse(text.replace('*X*005010X221A1', '*X*004010X091A1')))).toEqual(['EDI_NOT_835 004010X091A1 at GS 2.8']);
  });

  it('reports every count and control number that does not match, and holds what they enclose', () => {
    const se = parse(text.replace('SE*21*0001', 'SE*20*0002'));
    expect(holds(se.report)).toEqual(['EDI_CONTROL_MISMATCH 20 at SE 23.1', 'EDI_CONTROL_MISMATCH 0002 at SE 23.2']);
    expect(se.report.transactions[0]?.heldReasons[0]).toMatchObject({ expected: '21', found: '20' });
    expect(holds(parse(text.replace('SE*21*0001', 'SE*2X*0001')).report)).toEqual(['EDI_SYNTAX invalid_number at SE 23.1']);
    const ge = parse(text.replace('GE*1*1', 'GE*2*7'));
    expect(ge.report.envelopeErrors.map(describeError)).toEqual(['EDI_CONTROL_MISMATCH 2 at GE 24.1', 'EDI_CONTROL_MISMATCH 7 at GE 24.2']);
    expect(ge.events.find((event) => event.type === 'group_end')).toMatchObject({ group: { transactionCount: '2', controlNumber: '7' } });
    expect(holds(ge.report)).toEqual(['EDI_CONTROL_MISMATCH 2 at GE 24.1', 'EDI_CONTROL_MISMATCH 7 at GE 24.2']);
    expect(ge.report.outcome).toBe('held');
    const iea = parse(text.replace('IEA*1*000000001', 'IEA*2*000000009'));
    expect(holds(iea.report)).toEqual(['EDI_CONTROL_MISMATCH 2 at IEA 25.1', 'EDI_CONTROL_MISMATCH 000000009 at IEA 25.2']);
    expect(iea.report.receipt.held).toEqual([{ st02: '0001', reasons: ['EDI_CONTROL_MISMATCH'] }]);
  });

  it('holds a repeated ST02 in a group and a group whose GS06 repeats in the interchange', () => {
    const repeated = syntheticInterchange([SYNTHETIC_BODY, replace(SYNTHETIC_BODY, 'TRN', 'TRN*1*SYNTRACE0002*1SYN00000A')]).replace('ST*835*0002', 'ST*835*0001').replace('SE*21*0002', 'SE*21*0001');
    const result = parse(repeated);
    expect(holds(result.report, 0)).toEqual([]);
    expect(holds(result.report, 1)).toEqual(['EDI_CONTROL_MISMATCH 0001 at ST 24.2']);
    expect(result.report.outcome).toBe('partially_held');
    const group = syntheticInterchange().replace(/(GS\*.*?GE\*1\*1~)/, '$1$1').replace('IEA*1*', 'IEA*2*');
    const groups = parse(group);
    expect(groups.report.transactions).toHaveLength(2);
    expect(holds(groups.report, 0)).toEqual([]);
    expect(holds(groups.report, 1)).toEqual(['EDI_DUPLICATE at TRN 28.2', 'EDI_CONTROL_MISMATCH 1 at GS 25.6']);
  });

  it('holds the second of two identical remittances in one document as a duplicate', () => {
    const twice = syntheticInterchange([SYNTHETIC_BODY, SYNTHETIC_BODY]);
    const result = parse(twice);
    expect(holds(result.report, 0)).toEqual([]);
    expect(holds(result.report, 1)).toEqual(['EDI_DUPLICATE at TRN 26.2']);
    expect(result.report.receipt.held).toEqual([{ st02: '0002', reasons: ['EDI_DUPLICATE'] }]);
  });

  it('reports a missing SE, GE or IEA as a truncation, and a header segment inside a transaction set as a missing SE', () => {
    const cut = (marker: string) => documentErrors(parse(text.slice(0, text.indexOf(marker))));
    expect(cut('SE*')).toEqual(['EDI_SYNTAX truncated at SE 23.0']);
    expect(cut('GE*')).toEqual(['EDI_SYNTAX truncated at GE 24.0']);
    expect(cut('IEA*')).toEqual(['EDI_SYNTAX truncated at IEA 25.0']);
    expect(documentErrors(parse(text.replace('SE*21*0001~', '')))).toEqual(['EDI_SYNTAX missing_segment at SE 23.0']);
    expect(documentErrors(parse(text.replace('SE*21*0001~', 'ISA*00~')))).toEqual(['EDI_SYNTAX missing_segment at SE 23.0']);
    const truncated = parse(text.slice(0, text.indexOf('SE*')));
    expect(truncated.report.outcome).toBe('held');
    expect(remittancesOf(truncated)).toEqual([]);
  });

  it('holds every transaction of a document that later fails, and keeps hashing every byte', () => {
    const later = `${syntheticInterchange()}${syntheticInterchange(undefined, '000000002').replace('ST*835', 'ST*837')}`;
    const result = parse(later);
    expect(remittancesOf(result)).toHaveLength(1);
    expect(holds(result.report)).toEqual(['EDI_NOT_835 837 at ST 28.1']);
    expect(result.report.outcome).toBe('held');
    expect(result.report.bytes).toBe(Buffer.byteLength(later));
    expect(result.report.receipt.loaded).toEqual({ transactions: 0, claims: 0, lines: 0 });
  });
});

describe('the transaction structure', () => {
  const check = (body: readonly string[]) => holds(only(syntheticInterchange([body])).report);

  it('requires BPR first and only first', () => {
    const moved = [...SYNTHETIC_BODY.slice(1, 2), ...SYNTHETIC_BODY.slice(0, 1), ...SYNTHETIC_BODY.slice(2)];
    expect(check(moved)).toEqual(['EDI_SYNTAX missing_segment at BPR 4.0', 'EDI_SYNTAX unexpected_segment at BPR 5.0']);
    expect(holds(parse(`${syntheticIsa()}GS*HP*SYNTH*SYNTHRCV*20260406*0915*1*X*005010X221A1~ST*835*0001~SE*2*0001~GE*1*1~IEA*1*000000001~`).report)).toEqual([
      'EDI_SYNTAX missing_segment at BPR 4.0',
      'EDI_SYNTAX missing_segment at TRN 4.0',
      'EDI_SYNTAX missing_segment at N1 4.0',
      'EDI_SYNTAX missing_segment at N1 4.0',
    ]);
  });

  it('never repeats a value from the document in an error unless it is shaped like an ID, a code or a count', () => {
    const garbage = only(syntheticInterchange([insertAfter(SYNTHETIC_BODY, 'TRN', 'SYNTH PATIENT NAME*1')])).report.transactions[0]?.heldReasons[0];
    expect(garbage).toMatchObject({ code: 'EDI_SYNTAX', reason: 'unexpected_segment', segmentIndex: 6, segmentId: '' });
    expect(garbage?.message).toBe('EDI_SYNTAX at segment 6 (segment): the segment is not allowed here');
    const first = only(syntheticInterchange([['SYNTH PATIENT NAME*1', ...SYNTHETIC_BODY]])).report.transactions[0]?.heldReasons[0];
    expect(first).toMatchObject({ reason: 'missing_segment', segmentId: 'BPR', expected: 'BPR', found: '' });
    const named = parse(syntheticInterchange().replace('ST*835*', 'ST*SYNTH NAME*')).report.documentErrors[0];
    expect(named).toMatchObject({ code: 'EDI_NOT_835', found: '(not shown)' });
    expect(named?.message).toBe('EDI_NOT_835 at segment 3 (ST element 1): found (not shown), expected 835');
    const empty = parse(syntheticInterchange().replace('SE*21*0001', 'SE*21')).report.transactions[0]?.heldReasons;
    expect(empty?.map((error) => error.message)).toEqual(['EDI_CONTROL_MISMATCH at segment 23 (SE element 2): the control number is empty, expected 0001', 'EDI_SYNTAX at segment 23 (SE element 2): a required element is empty']);
  });

  it('refuses unknown and misplaced segments', () => {
    expect(check(insertAfter(SYNTHETIC_BODY, 'TRN', 'ZZZ*1'))).toEqual(['EDI_SYNTAX unexpected_segment at ZZZ 6.0']);
    expect(check(insertAfter(SYNTHETIC_BODY, 'N3*1', 'CUR*PR*USD'))).toEqual(['EDI_SYNTAX unexpected_segment at CUR 9.0']);
    expect(check(insertAfter(SYNTHETIC_BODY, 'SVC', 'NM1*82*1*SYNTHPROVIDER****XX*9900000002'))).toEqual(['EDI_SYNTAX unexpected_segment at NM1 20.0']);
    expect(check(insertAfter(SYNTHETIC_BODY, 'CLP', 'NM1*XX*1*SYNTHLAST'))).toEqual(['EDI_SYNTAX unexpected_segment at NM1 18.0']);
    expect(check(insertAfter(SYNTHETIC_BODY, 'CLP', 'NM1'))).toEqual(['EDI_SYNTAX unexpected_segment at NM1 18.0']);
    expect(check(insertAfter(SYNTHETIC_BODY, 'TRN', 'N1*XX*SOMEONE'))).toEqual(['EDI_SYNTAX unexpected_segment at N1 6.0']);
    expect(check(insertAfter(SYNTHETIC_BODY, 'TRN', 'N1'))).toEqual(['EDI_SYNTAX unexpected_segment at N1 6.0']);
    expect(check(insertAfter(SYNTHETIC_BODY, 'PER', 'N1*PR*SYNTHETIC PAYER B'))).toEqual(['EDI_SYNTAX segment_repeats at N1 12.0']);
  });

  it('requires TRN, the payer loop with its address and technical contact, the payee loop, a claim in each LX and the patient in each claim', () => {
    expect(check(without(SYNTHETIC_BODY, 'TRN'))).toEqual(['EDI_SYNTAX missing_segment at TRN 6.0']);
    expect(check(SYNTHETIC_BODY.filter((segment, index) => index < 3 || index > 7))).toEqual(['EDI_SYNTAX missing_segment at N1 7.0']);
    expect(check(without(without(without(SYNTHETIC_BODY, 'N3*1'), 'N4*SYNTHVILLE'), 'PER'))).toEqual([
      'EDI_SYNTAX missing_segment at N3 9.0',
      'EDI_SYNTAX missing_segment at N4 9.0',
      'EDI_SYNTAX missing_segment at PER 9.0',
    ]);
    expect(check(replace(SYNTHETIC_BODY, 'PER', 'PER*CX*SYNTHETIC CLAIMS*TE*5555550101'))).toEqual(['EDI_SYNTAX missing_segment at PER 12.0']);
    expect(check(insertAfter(SYNTHETIC_BODY, 'REF*TJ', 'LX*9'))).toEqual(['EDI_SYNTAX missing_segment at CLP 17.0']);
    expect(check([...SYNTHETIC_BODY, 'LX*2'])).toEqual(['EDI_SYNTAX missing_segment at CLP 24.0']);
    expect(check([...SYNTHETIC_BODY, 'LX*2', 'PLB*9900000001*20261231*WO:SYN1*0'])).toEqual(['EDI_SYNTAX missing_segment at CLP 24.0']);
    expect(check(without(SYNTHETIC_BODY, 'NM1'))).toEqual(['EDI_SYNTAX missing_segment at NM1 22.0']);
    expect(holds(parse(syntheticInterchange([SYNTHETIC_BODY.slice(0, 8)])).report)).toEqual(['EDI_SYNTAX missing_segment at N1 12.0']);
    expect(holds(parse(syntheticInterchange([SYNTHETIC_BODY.slice(0, 7)])).report)).toEqual([
      'EDI_SYNTAX missing_segment at PER 11.0',
      'EDI_SYNTAX missing_segment at N1 11.0',
    ]);
  });

  it('refuses a segment repeated more often than its loop allows', () => {
    expect(check(insertAfter(SYNTHETIC_BODY, 'DTM*405', 'DTM*405*20260405'))).toEqual(['EDI_SYNTAX segment_repeats at DTM 7.0']);
    expect(check(insertAfter(SYNTHETIC_BODY, 'TRN', 'REF*EV*SYN1', 'REF*F2*SYN2', 'REF*EV*SYN3'))).toEqual(['EDI_SYNTAX segment_repeats at REF 8.0']);
    expect(check(insertAfter(SYNTHETIC_BODY, 'NM1*QC', 'NM1*QC*1*SYNTHLAST'))).toEqual(['EDI_SYNTAX segment_repeats at NM1 19.0']);
    const lines = Array.from({ length: 1000 }, () => ['SVC*HC:97110*1.00*1.00**1', 'DTM*472*20260315']).flat();
    const many = [...replace(SYNTHETIC_BODY.slice(0, 15), 'CLP', 'CLP*SYNPCN0001*1*1000.00*1000.00**12*SYNCCN0001*11*1').map((segment) => segment.replace('BPR*C*100.00', 'BPR*C*1000.00')), ...lines];
    expect(check(many)).toEqual(['EDI_SYNTAX segment_repeats at SVC 2017.0']);
  });

  it('checks every element: amounts, dates, codes it needs, and units above zero', () => {
    expect(check(replace(SYNTHETIC_BODY, 'CLP', 'CLP*SYNPCN0001*1*150.005*100.00*20.00*12*SYNCCN0001*11*1'))).toEqual(['EDI_SYNTAX invalid_amount at CLP 17.3']);
    expect(check(replace(SYNTHETIC_BODY, 'SVC', 'SVC*HC:97110:GP*150.00*100.00**0'))).toEqual(['EDI_SYNTAX units_not_positive at SVC 19.5']);
    expect(check(replace(SYNTHETIC_BODY, 'SVC', 'SVC*HC:97110:GP*150.00*100.00**-1'))).toEqual(['EDI_SYNTAX units_not_positive at SVC 19.5']);
    expect(check(replace(SYNTHETIC_BODY, 'DTM*472', 'DTM*472*20260231'))).toEqual(['EDI_SYNTAX invalid_date at DTM 20.2']);
    expect(check(replace(SYNTHETIC_BODY, 'BPR', SYNTHETIC_BODY[0]?.replace('*C*ACH', '*X*ACH') ?? ''))).toEqual(['EDI_SYNTAX invalid_code at BPR 4.3']);
    expect(check(replace(SYNTHETIC_BODY, 'SVC', 'SVC*HC*150.00*100.00**2'))).toEqual(['EDI_SYNTAX missing_element at SVC 19.1']);
    expect(check(replace(SYNTHETIC_BODY, 'CAS*CO', 'CAS*CO*45*30.00^1.00'))).toEqual(['EDI_SYNTAX element_repeats at CAS 21.3']);
  });

  it('reads DTM02, or DTM05 D8 or RD8 with DTM06, and refuses anything else', () => {
    const line = (dtm: string) => replace(SYNTHETIC_BODY, 'DTM*472', dtm);
    expect(claimOf(line('DTM*472****D8*20260316')).lines[0]).toMatchObject({ serviceFrom: '2026-03-16', serviceTo: '2026-03-16', dates: [{ date: null, periodFormat: 'D8', period: '20260316', from: '2026-03-16', to: '2026-03-16' }] });
    expect(claimOf(line('DTM*472****RD8*20260301-20260315')).lines[0]).toMatchObject({ serviceFrom: '2026-03-01', serviceTo: '2026-03-15' });
    expect(claimOf(line('DTM*472*20260301***RD8*20260301-20260302')).lines[0]).toMatchObject({ serviceFrom: '2026-03-01', serviceTo: '2026-03-02', dates: [{ date: '2026-03-01' }] });
    expect(check(line('DTM*472****XX*20260301'))).toEqual(['EDI_SYNTAX invalid_code at DTM 20.5']);
    for (const period of ['20260301', '20260315-20260301', '20260301-20260315-20260316', '20260301-2026', '']) {
      expect(check(line(`DTM*472****RD8*${period}`)), period).toEqual(['EDI_SYNTAX invalid_date at DTM 20.6']);
    }
    expect(check(line('DTM*472****D8*20261301'))).toEqual(['EDI_SYNTAX invalid_date at DTM 20.6']);
    expect(check(line('DTM*472'))).toEqual(['EDI_SYNTAX missing_element at DTM 20.2']);
  });

  it('checks the pairs of CAS and PLB: a reason or code needs its amount, an amount its reason or code', () => {
    expect(check(replace(SYNTHETIC_BODY, 'CAS*PR', 'CAS*PR*2*20.00**1*0.00'))).toEqual([]);
    expect(check(replace(SYNTHETIC_BODY, 'CAS*PR', 'CAS*PR*2*20.00***1.00'))).toEqual(['EDI_SYNTAX missing_element at CAS 22.5']);
    expect(check(replace(SYNTHETIC_BODY, 'CAS*PR', 'CAS*PR*2*20.00****1'))).toEqual(['EDI_SYNTAX missing_element at CAS 22.5']);
    expect(check(replace(SYNTHETIC_BODY, 'CAS*PR', 'CAS*PR*2*20.00**1'))).toEqual(['EDI_SYNTAX missing_element at CAS 22.6']);
    expect(check(replace(SYNTHETIC_BODY, 'CAS*PR', 'CAS*PR**20.00'))).toEqual(['EDI_SYNTAX missing_element at CAS 22.2']);
    const plb = (segment: string, bpr = '100.00') => [...replace(SYNTHETIC_BODY, 'BPR', SYNTHETIC_BODY[0]?.replace('C*100.00', `C*${bpr}`) ?? ''), segment];
    expect(check(plb('PLB*9900000001*20261231*WO:SYNREF1*10.00*L6*-2.50', '92.50'))).toEqual([]);
    expect(check(plb('PLB*9900000001*20261231*WO:SYNREF1*10.00**-2.50', '90.00'))).toEqual(['EDI_SYNTAX missing_element at PLB 23.5']);
    expect(check(plb('PLB*9900000001*20261231*WO:SYNREF1*10.00*L6', '90.00'))).toEqual(['EDI_SYNTAX missing_element at PLB 23.6']);
    expect(check(plb('PLB*9900000001*20261231**10.00', '90.00'))).toEqual(['EDI_SYNTAX missing_element at PLB 23.3']);
    expect(check(plb('PLB*9900000001*20261231*WO', '100.00'))).toEqual(['EDI_SYNTAX missing_element at PLB 23.4']);
  });

  it('holds malformed amounts and dates wherever they are, and reads them as zero or absent', () => {
    const bpr = SYNTHETIC_BODY[0] as string;
    expect(check(replace(SYNTHETIC_BODY, 'BPR', bpr.replace('C*100.00', 'C*100.001')))).toEqual(['EDI_SYNTAX invalid_amount at BPR 4.2']);
    expect(check(replace(SYNTHETIC_BODY, 'BPR', bpr.replace('*20260406', '*20260431')))).toEqual(['EDI_SYNTAX invalid_date at BPR 4.16']);
    expect(check(replace(SYNTHETIC_BODY, 'SVC', 'SVC*HC:97110:GP*1x*1y**2'))).toEqual(['EDI_SYNTAX invalid_amount at SVC 19.2', 'EDI_SYNTAX invalid_amount at SVC 19.3']);
    expect(check([...SYNTHETIC_BODY, 'AMT*B6*1.234'])).toEqual(['EDI_SYNTAX invalid_amount at AMT 23.2']);
    expect(check(insertAfter(SYNTHETIC_BODY, 'NM1*QC', 'AMT*AU*1.234'))).toEqual(['EDI_SYNTAX invalid_amount at AMT 19.2']);
    expect(check(replace(SYNTHETIC_BODY, 'CAS*PR', 'CAS*PR*2'))).toEqual(['EDI_SYNTAX missing_element at CAS 22.3']);
    expect(check([...SYNTHETIC_BODY, 'PLB*9900000001*20261331*WO*0.00'])).toEqual(['EDI_SYNTAX invalid_date at PLB 23.2']);
    expect(check([...SYNTHETIC_BODY, 'PLB*9900000001*20261231*WO*1.001'])).toEqual(['EDI_SYNTAX invalid_amount at PLB 23.4']);
    const { remittance } = only(syntheticInterchange([[...SYNTHETIC_BODY, 'PLB*9900000001*20261331*WO*1.001']]));
    expect(remittance.providerAdjustments[0]).toMatchObject({ fiscalPeriodDate: '', cents: cents(0n) });
    expect(holds(parse(syntheticInterchange([SYNTHETIC_BODY.slice(0, 2)])).report)).toEqual(['EDI_SYNTAX missing_segment at N1 6.0', 'EDI_SYNTAX missing_segment at N1 6.0']);
  });

  it('holds nothing for balance when the transaction already has a syntax error', () => {
    const body = replace(SYNTHETIC_BODY, 'CLP', 'CLP*SYNPCN0001*1*150.00*1x*20.00*12*SYNCCN0001*11*1');
    expect(check(body)).toEqual(['EDI_SYNTAX invalid_amount at CLP 17.4']);
  });
});

describe('typed loops', () => {
  it('reads the header, payer and payee loops', () => {
    const body = [
      ...SYNTHETIC_BODY.slice(0, 2),
      'CUR*PR*USD',
      'REF*EV*SYNRECEIVER',
      'REF*F2*SYNVERSION',
      SYNTHETIC_BODY[2] as string,
      'N1*PR*SYNTHETIC PAYER A*XV*SYNPLANID1',
      'N3*1 SYNTHETIC WAY*SUITE 2',
      'N4*SYNTHVILLE*NC*00013*US***NC1',
      'REF*2U*SYNPAYERA',
      'PER*CX*SYNTHETIC CLAIMS*TE*5555550101*EX*12',
      'PER*BL*SYNTHETIC HELP DESK*TE*5555550100*EM*HELP@SYNTH.TEST*FX*5555550102',
      'PER*IC**UR*WWW.SYNTH.TEST',
      'N1*PE*SYNTHETIC THERAPY GROUP*XX*9900000001',
      'REF*TJ*999999997',
      'RDM*EM*SYNTHETIC REMITS*REMITS@SYNTH.TEST',
      ...SYNTHETIC_BODY.slice(12),
    ];
    const { remittance, report } = only(syntheticInterchange([body]));
    expect(report.outcome).toBe('loaded');
    expect(remittance.currency).toBe('USD');
    expect(remittance.references.map((reference) => reference.qualifier)).toEqual(['EV', 'F2']);
    expect(remittance.dates).toEqual([{ segmentIndex: 9, qualifier: '405', date: '2026-04-05', periodFormat: null, period: null, from: '2026-04-05', to: '2026-04-05' }]);
    expect(remittance.payer?.address).toEqual({ lines: ['1 SYNTHETIC WAY', 'SUITE 2'], city: 'SYNTHVILLE', state: 'NC', postalCode: '00013', country: 'US', countrySubdivision: 'NC1' });
    expect(remittance.payer?.contacts.map((contact) => [contact.function, contact.communications.map((item) => item.qualifier)])).toEqual([
      ['CX', ['TE', 'EX']],
      ['BL', ['TE', 'EM', 'FX']],
      ['IC', ['UR']],
    ]);
    expect(remittance.payerIdentifiers).toEqual([
      ['XV', 'SYNPLANID1'],
      ['2U', 'SYNPAYERA'],
      ['TRN03', '1SYN00000A'],
    ]);
    expect(remittance.payee?.address).toBeNull();
    expect(remittance.payee?.deliveryMethod).toEqual({ code: 'EM', name: 'SYNTHETIC REMITS', communication: 'REMITS@SYNTH.TEST' });
  });

  it('reads the 2000 provider summaries and every claim and line segment', () => {
    const body = [
      ...SYNTHETIC_BODY.slice(0, 13),
      ['TS3', '9900000001', '11', '20261231', '1', '150.00', ...Array.from({ length: 7 }, () => ''), '10.00', '', '20.00', ...Array.from({ length: 7 }, () => ''), '1.5', '5.00'].join('*'),
      'TS2*1.00*2.00***3.00**4.00',
      'CLP*SYNPCN0001*1*150.00*100.00*20.00*12*SYNCCN0001*11*1**SYNDRG*1.25*0.5',
      'NM1*QC*1*SYNTHLAST*SYNTHFIRST*M***MI*SYNMBR0001',
      'NM1*IL*1*SYNTHINSURED*SYNTHFIRST****MI*SYNMBR0002',
      'NM1*74*1*SYNTHCORRECTED',
      'NM1*82*1*SYNTHPROVIDER*SYNTHFIRST****XX*9900000002',
      'NM1*TT*2*SYNTHETIC CROSSOVER CARRIER*****PI*SYNXOVER1',
      'NM1*PR*2*SYNTHETIC PRIORITY PAYER*****PI*SYNPRIOR1',
      'NM1*GB*1*SYNTHOTHER',
      'MIA*0**1*10.00*N901***************N902*MA901',
      'MOA*0.8*5.00*N901*N902****1.00*2.00',
      'REF*CE*SYNPLAN-COMM-01',
      'REF*1A*SYNPROVIDER1',
      'DTM*232*20260301',
      'DTM*233*20260331',
      'DTM*050*20260320',
      'PER*CX*SYNTHETIC CLAIMS*TE*5555550101',
      'AMT*AU*120.00',
      'QTY*CA*1.5',
      'SVC*HC:97110:GP:59:KX:CQ:SYNTHETIC EXERCISE*150.00*100.00*0420*2.5*HC:97110*2',
      'CAS*CO*45*30.00',
      'CAS*PR*2*20.00',
      'REF*6R*SYNLINE1',
      'AMT*B6*120.00',
      'QTY*ZK*1',
      'LQ*HE*N901',
      'LQ*RX*SYNRX1',
    ];
    const { remittance, report } = only(syntheticInterchange([body]));
    expect(holds(report)).toEqual([]);
    expect(remittance.headerNumbers[0]?.summaries).toEqual([
      {
        segmentIndex: 17,
        segmentId: 'TS3',
        providerId: '9900000001',
        facilityCode: '11',
        fiscalPeriodDate: '2026-12-31',
        amounts: [
          { elementPosition: 5, cents: cents(15000n) },
          { elementPosition: 13, cents: cents(1000n) },
          { elementPosition: 15, cents: cents(2000n) },
          { elementPosition: 24, cents: cents(500n) },
        ],
        quantities: [
          { elementPosition: 4, quantity: '1' },
          { elementPosition: 23, quantity: '1.5' },
        ],
      },
      {
        segmentIndex: 18,
        segmentId: 'TS2',
        providerId: null,
        facilityCode: null,
        fiscalPeriodDate: null,
        amounts: [
          { elementPosition: 1, cents: cents(100n) },
          { elementPosition: 2, cents: cents(200n) },
          { elementPosition: 5, cents: cents(300n) },
        ],
        quantities: [{ elementPosition: 7, quantity: '4.00' }],
      },
    ]);
    const claim = remittance.claims[0] as Claim;
    expect(claim).toMatchObject({ drgCode: 'SYNDRG', drgWeight: '1.25', dischargeFraction: '0.5', statementFrom: '2026-03-01', statementTo: '2026-03-31', serviceFrom: '2026-03-01', serviceTo: '2026-03-31', planRef: 'SYNPLAN-COMM-01', allowedCents: cents(12000n) });
    expect(claim.names.map((name) => name.entity)).toEqual(['QC', 'IL', '74', '82', 'TT', 'PR', 'GB']);
    expect(claim.names[0]).toMatchObject({ middle: 'M', suffix: null });
    expect(claim.inpatient).toEqual({
      segmentIndex: 27,
      amounts: [{ elementPosition: 4, cents: cents(1000n) }],
      quantities: [
        { elementPosition: 1, quantity: '0' },
        { elementPosition: 3, quantity: '1' },
      ],
      remarks: [
        { segmentIndex: 27, elementPosition: 5, qualifier: 'HE', code: 'N901' },
        { segmentIndex: 27, elementPosition: 20, qualifier: 'HE', code: 'N902' },
        { segmentIndex: 27, elementPosition: 21, qualifier: 'HE', code: 'MA901' },
      ],
    });
    expect(claim.outpatient).toEqual({
      segmentIndex: 28,
      reimbursementRate: '0.8',
      hcpcsPayableCents: cents(500n),
      remarks: [
        { segmentIndex: 28, elementPosition: 3, qualifier: 'HE', code: 'N901' },
        { segmentIndex: 28, elementPosition: 4, qualifier: 'HE', code: 'N902' },
      ],
      esrdPaymentCents: cents(100n),
      nonpayableProfessionalComponentCents: cents(200n),
    });
    expect(claim.references.map((reference) => reference.qualifier)).toEqual(['CE', '1A']);
    expect(claim.dates.map((date) => date.qualifier)).toEqual(['232', '233', '050']);
    expect(claim.contacts).toHaveLength(1);
    expect(claim.quantities).toEqual([{ segmentIndex: 36, qualifier: 'CA', quantity: '1.5' }]);
    const line = claim.lines[0];
    expect(line).toMatchObject({
      procedure: { qualifier: 'HC', code: '97110', modifiers: ['GP', '59', 'KX', 'CQ'], description: 'SYNTHETIC EXERCISE' },
      revenueCode: '0420',
      units: '2.5',
      originalProcedure: { qualifier: 'HC', code: '97110', modifiers: [], description: null },
      originalUnits: '2',
      serviceFrom: '2026-03-01',
      serviceTo: '2026-03-31',
      lineAllowedCents: cents(12000n),
      observedAllowed: { cents: cents(12000n), basis: 'amt_b6', allocatedFromClaim: false },
    });
    expect(line?.references).toEqual([{ segmentIndex: 40, qualifier: '6R', value: 'SYNLINE1' }]);
    expect(line?.quantities).toEqual([{ segmentIndex: 42, qualifier: 'ZK', quantity: '1' }]);
    expect(line?.remarks.map((remark) => [remark.qualifier, remark.code])).toEqual([
      ['HE', 'N901'],
      ['RX', 'SYNRX1'],
    ]);
  });

  it('flags unknown reason and remark codes and loads them: CARC, RARC in MIA, MOA and LQ HE', () => {
    const body = [
      ...SYNTHETIC_BODY.slice(0, 15),
      'MOA***Z901',
      'SVC*HC:97110:GP*150.00*100.00**2',
      'DTM*472*20260315',
      'CAS*CO*Z45*30.00',
      'CAS*PR*2*20.00',
      'LQ*HE*Z902',
      'LQ*RX*Z903',
    ];
    const { remittance, report } = only(syntheticInterchange([body]));
    expect(report.outcome).toBe('loaded');
    expect(remittance.unknownCodes.map((code) => [code.list, code.value, code.segmentId, code.elementPosition])).toEqual([
      ['rarc', 'Z901', 'MOA', 3],
      ['carc', 'Z45', 'CAS', 2],
      ['rarc', 'Z902', 'LQ', 2],
    ]);
    expect(report.receipt.unknownCodes).toEqual(['carc:Z45', 'rarc:Z901', 'rarc:Z902']);
    expect(holds(only(syntheticInterchange([[...SYNTHETIC_BODY, 'LQ*HE']])).report)).toEqual(['EDI_SYNTAX missing_element at LQ 23.2']);
  });

  it('holds a value outside one of the structure\'s own code sets at its position, as pyx12 rejects it', () => {
    const check = (body: readonly string[]) => {
      const { report } = only(syntheticInterchange([body]));
      expect(report.receipt.unknownCodes).toEqual([]);
      return holds(report);
    };
    const bpr = SYNTHETIC_BODY[0] ?? '';
    expect(check(replace(SYNTHETIC_BODY, 'CLP', 'CLP*SYNPCN0001*99*150.00*100.00*20.00*12*SYNCCN0001*11*1'))).toEqual(['EDI_SYNTAX invalid_code at CLP 17.2']);
    expect(check(SYNTHETIC_BODY.map((segment) => (segment === 'CAS*CO*45*30.00' ? 'CAS*XX*45*30.00' : segment)))).toEqual(['EDI_SYNTAX invalid_code at CAS 21.1']);
    expect(check(replace(SYNTHETIC_BODY, 'BPR', bpr.replace('BPR*C*', 'BPR*Q*')))).toEqual(['EDI_SYNTAX invalid_code at BPR 4.1']);
    expect(check(replace(SYNTHETIC_BODY, 'BPR', bpr.replace('*ACH*', '*XYZ*')))).toEqual(['EDI_SYNTAX invalid_code at BPR 4.4']);
    const plb = [...replace(SYNTHETIC_BODY, 'BPR', bpr.replace('C*100.00', 'C*90.00')), 'PLB*9900000001*20261231*ZZ:SYNREF*10.00'];
    expect(check(plb)).toEqual(['EDI_SYNTAX invalid_code at PLB 23.3']);
    expect(only(syntheticInterchange([plb])).report.transactions[0]?.heldReasons[0]?.componentPosition).toBe(1);
    expect(check(replace(SYNTHETIC_BODY, 'SVC', 'SVC*QQ:97110:GP*150.00*100.00**2'))).toEqual(['EDI_SYNTAX invalid_code at SVC 19.1']);
    // An identifier that slipped into a qualifier position (a missing separator) is held, never repeated anywhere.
    const { report } = only(syntheticInterchange([replace(SYNTHETIC_BODY, 'NM1', 'NM1*QC*1*SYNTHLAST*SYNTHFIRST***MI*SYN12345')]));
    expect(holds(report)).toEqual(['EDI_SYNTAX invalid_code at NM1 18.8']);
    expect(JSON.stringify({ held: report.transactions[0]?.heldReasons, receipt: report.receipt }, (_key, value: unknown) => (typeof value === 'bigint' ? String(value) : value))).not.toContain('SYN12345');
  });
});

describe('balancing (docs/adr/0021)', () => {
  const check = (body: readonly string[]) => holds(only(syntheticInterchange([body])).report);
  const describeHold = (body: readonly string[]) => (only(syntheticInterchange([body])).report.transactions[0]?.heldReasons ?? []).map((error) => [error.scope, error.segmentIndex, error.elementPosition, error.differenceCents]);

  it('holds a transaction whose claims and PLB do not make BPR02, with the exact difference at BPR02', () => {
    const body = replace(SYNTHETIC_BODY, 'BPR', SYNTHETIC_BODY[0]?.replace('C*100.00', 'C*101.00') ?? '');
    expect(describeHold(body)).toEqual([['transaction', 4, 2, cents(-100n)]]);
    expect(only(syntheticInterchange([body])).remittance.balance).toEqual({ claimsPaidCents: cents(10000n), plbTotalCents: cents(0n), paymentCents: cents(10100n), differenceCents: cents(-100n), balanced: false, claimsBalanced: true });
  });

  it('counts a debit payment negative and a PLB amount against the payment', () => {
    const body = [...replace(SYNTHETIC_BODY, 'BPR', 'BPR*D*20.00*D*ACH*CCP*01*999999999*DA*SYNACCT1*1SYN00000A**01*999999998*DA*SYNACCT2*20260406'), 'PLB*9900000001*20261231*WO:SYNRECOUP*120.00'];
    const { remittance } = only(syntheticInterchange([body]));
    expect(remittance.balance).toMatchObject({ paymentCents: cents(-2000n), plbTotalCents: cents(12000n), differenceCents: cents(0n), balanced: true });
    expect(remittance.providerAdjustments).toEqual([
      { segmentIndex: 23, elementPosition: 3, providerId: '9900000001', fiscalPeriodDate: '2026-12-31', code: 'WO', reference: 'SYNRECOUP', cents: cents(12000n), category: 'recoupment', counted: true },
    ]);
  });

  it('holds an unbalanced claim at CLP04, line charges at CLP03 and an unbalanced line at SVC03', () => {
    const claim = replace(replace(SYNTHETIC_BODY, 'CLP', 'CLP*SYNPCN0001*1*150.00*95.00*20.00*12*SYNCCN0001*11*1'), 'BPR', SYNTHETIC_BODY[0]?.replace('C*100.00', 'C*95.00') ?? '');
    expect(describeHold(claim)).toEqual([['claim', 17, 4, cents(500n)]]);
    const charges = replace(SYNTHETIC_BODY, 'CLP', 'CLP*SYNPCN0001*1*160.00*100.00*20.00*12*SYNCCN0001*11*1');
    expect(describeHold(replace(charges, 'CAS*CO', 'CAS*CO*45*30.00', 'CAS*OA*23*10.00')).slice(0, 1)).toEqual([['claim_lines', 17, 3, cents(-1000n)]]);
    const line = replace(SYNTHETIC_BODY, 'SVC', 'SVC*HC:97110:GP*150.00*90.00**2');
    expect(describeHold(line)).toEqual([['line', 19, 3, cents(1000n)]]);
    expect(check(SYNTHETIC_BODY)).toEqual([]);
  });

  it('reconciles a line without CAS under claim-level CAS by the claim alone, and allocates the claim PR over every line by charge', () => {
    const body = [
      ...SYNTHETIC_BODY.slice(0, 13),
      'CLP*SYNPCN0001*1*200.00*100.00*20.00*12*SYNCCN0001*11*1',
      'CAS*CO*45*80.00',
      'CAS*PR*2*20.00',
      'NM1*QC*1*SYNTHLAST*SYNTHFIRST****MI*SYNMBR0001',
      'SVC*HC:97110*150.00*75.00**2',
      'SVC*HC:97140*25.00*12.50**1',
      'SVC*HC:97530*25.00*12.50**1',
      'AMT*B6*20.00',
    ];
    const { remittance, report } = only(syntheticInterchange([body]));
    expect(report.outcome).toBe('loaded');
    const claim = remittance.claims[0] as Claim;
    expect(claim.lines.map((line) => [line.differenceCents, line.observedAllowed.cents, line.observedAllowed.basis, line.observedAllowed.allocatedFromClaim, line.observedAllowed.allocatedPatientShareCents])).toEqual([
      [null, cents(9000n), 'paid_plus_pr', true, cents(1500n)],
      [null, cents(1500n), 'paid_plus_pr', true, cents(250n)],
      [null, cents(2000n), 'amt_b6', false, null],
    ]);
    expect(claim.serviceFrom).toBeNull();
    expect(claim.lines[0]?.serviceFrom).toBeNull();
    expect(claim.patientShareCents).toBe(cents(2000n));
  });

  it('never gives the lines without B6 the share a B6 line already holds: the lines total the claim allowed', () => {
    const body = [
      ...replace(SYNTHETIC_BODY.slice(0, 13), 'BPR', (SYNTHETIC_BODY[0] ?? '').replace('C*100.00', 'C*120.00')),
      'CLP*SYNPCN0001*1*200.00*120.00*40.00*12*SYNCCN0001*11*1',
      'CAS*CO*45*40.00',
      'CAS*PR*2*40.00',
      'NM1*QC*1*SYNTHLAST*SYNTHFIRST****MI*SYNMBR0001',
      'SVC*HC:97110*100.00*60.00**2',
      'AMT*B6*80.00',
      'SVC*HC:97140*100.00*60.00**2',
    ];
    const { remittance, report } = only(syntheticInterchange([body]));
    expect(report.outcome).toBe('loaded');
    const lines = (remittance.claims[0] as Claim).lines.map((line) => [line.observedAllowed.cents, line.observedAllowed.basis, line.observedAllowed.allocatedPatientShareCents]);
    expect(lines).toEqual([
      [cents(8000n), 'amt_b6', null],
      [cents(8000n), 'paid_plus_pr', cents(2000n)],
    ]);
  });

  it('reads a claim without lines (institutional) with claim-level CAS', () => {
    const body = [...SYNTHETIC_BODY.slice(0, 13), 'CLP*SYNPCN0001*1*150.00*100.00*20.00*13*SYNCCN0001*13*1', 'CAS*CO*45*30.00', 'CAS*PR*1*20.00', 'NM1*QC*1*SYNTHLAST', 'DTM*232*20260301'];
    const claim = claimOf(body);
    expect(claim.balance).toEqual({ claimDifferenceCents: cents(0n), lineChargeDifferenceCents: null, balanced: true });
    expect(claim).toMatchObject({ statementFrom: '2026-03-01', statementTo: null, serviceFrom: '2026-03-01', serviceTo: null });
  });

  it('takes a line service period from DTM 150 and 151, either alone, else the statement dates', () => {
    const period = (...dates: string[]) => claimOf([...replace(SYNTHETIC_BODY, 'DTM*472', ...dates)]).lines[0];
    expect(period('DTM*150*20260301', 'DTM*151*20260305')).toMatchObject({ serviceFrom: '2026-03-01', serviceTo: '2026-03-05' });
    expect(period('DTM*150*20260301')).toMatchObject({ serviceFrom: '2026-03-01', serviceTo: '2026-03-01' });
    expect(period('DTM*151*20260305')).toMatchObject({ serviceFrom: '2026-03-05', serviceTo: '2026-03-05' });
    const statement = claimOf([...insertAfter(without(SYNTHETIC_BODY, 'DTM*472'), 'NM1*QC', 'DTM*232*20260301')]);
    expect(statement.lines[0]).toMatchObject({ serviceFrom: '2026-03-01', serviceTo: '2026-03-01' });
    expect(statement).toMatchObject({ serviceFrom: '2026-03-01', serviceTo: '2026-03-01' });
  });
});

describe('reversals and corrections', () => {
  const reversal = ['CLP*SYNPCN0001*22*-150.00*-100.00*-20.00*12*SYNCCN0001*11*8', 'NM1*QC*1*SYNTHLAST', 'SVC*HC:97110:GP*-150.00*-100.00**2', 'CAS*CO*45*-30.00', 'CAS*PR*2*-20.00'];
  const correction = (ref: string | null) => ['CLP*SYNPCN0001*1*150.00*110.00*20.00*12*SYNCCN0002*11*7', 'NM1*QC*1*SYNTHLAST', ...(ref === null ? [] : [ref]), 'SVC*HC:97110:GP*150.00*110.00**2', 'CAS*CO*45*20.00', 'CAS*PR*2*20.00'];
  const document = (...claims: string[][]) => {
    const paid = 100 + claims.reduce((total, item) => total + (item[0]?.includes('*22*') === true ? -100 : 110), 0);
    return only(syntheticInterchange([[...replace(SYNTHETIC_BODY, 'BPR', SYNTHETIC_BODY[0]?.replace('C*100.00', `C*${String(paid)}.00`) ?? ''), ...claims.flat()]]));
  };

  it('links a reversal to an earlier claim with the same payer claim control number, and the correction to the reversal', () => {
    const { remittance, report } = document(reversal, correction(null));
    expect(report.outcome).toBe('loaded');
    expect(remittance.counts).toEqual({ claims: 3, lines: 3, reversals: 1, plbItems: 0 });
    const [original, reversed, corrected] = remittance.claims;
    expect(original?.reversal).toBeNull();
    expect(reversed?.reversal).toEqual({ payerClaimControlNumber: 'SYNCCN0001', reversed: { interchange: 0, group: 0, transaction: 0, claim: 0 } });
    expect(reversed?.lines[0]?.observedAllowed.cents).toBe(cents(-12000n));
    expect(corrected?.correction).toEqual({ payerClaimControlNumber: 'SYNCCN0001', reversal: { interchange: 0, group: 0, transaction: 0, claim: 1 } });
  });

  it('takes the corrected claim from REF F8, and leaves the links to the loader when the claims are elsewhere', () => {
    const elsewhere = only(syntheticInterchange([[...replace(SYNTHETIC_BODY.slice(0, 13), 'BPR', SYNTHETIC_BODY[0]?.replace('C*100.00', 'C*10.00') ?? ''), ...reversal, ...correction('REF*F8*SYNCCN0001')]]));
    const [reversed, corrected] = elsewhere.remittance.claims;
    expect(reversed?.reversal).toEqual({ payerClaimControlNumber: 'SYNCCN0001', reversed: null });
    expect(corrected?.correction).toEqual({ payerClaimControlNumber: 'SYNCCN0001', reversal: { interchange: 0, group: 0, transaction: 0, claim: 0 } });
    const unrelated = document(correction('REF*F8*SYNCCN0777'));
    expect(unrelated.remittance.claims[1]?.correction).toEqual({ payerClaimControlNumber: 'SYNCCN0777', reversal: null });
    const different = document(reversal, ['CLP*SYNPCN0009*1*150.00*110.00*20.00*12*SYNCCN0009*11*1', 'NM1*QC*1*SYNTHLAST', 'SVC*HC:97110:GP*150.00*110.00**2', 'CAS*CO*45*20.00', 'CAS*PR*2*20.00']);
    expect(different.remittance.claims[2]?.correction).toBeNull();
  });
});
