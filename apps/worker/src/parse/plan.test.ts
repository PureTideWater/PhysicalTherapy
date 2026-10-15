import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type LoadableRemittance, type Name, isLoadable, remittancesOf } from '@tp/edi835';
import { SYNTHETIC_BODY, parseText, syntheticInterchange } from '@tp/edi835/testing';
import { describe, expect, it } from 'vitest';

import { type LoadPlan, type PlanResult, fitsNumeric93, loadPlan, normalizeKeyPart, payerIdentity, personKey, planKey } from './plan';

/**
 * The load plan (plan.ts): what each loadable transaction set becomes, from SYNTHETIC 835s parsed with
 * the SYNTHETIC release's code lists.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../../fixtures/synthetic');

function remittances(text: string): LoadableRemittance[] {
  const all = remittancesOf(parseText(text));
  return all.map((remittance) => {
    if (!isLoadable(remittance)) {
      throw new Error(`not loadable: ${remittance.heldReasons.map((reason) => reason.message).join('; ')}`);
    }
    return remittance;
  });
}

function only(text: string): LoadableRemittance {
  const [remittance] = remittances(text);
  return remittance as LoadableRemittance;
}

/** SYNTHETIC_BODY with segments replaced (by their first characters) or added after one. */
function body(edit: (segments: string[]) => string[]): string {
  return syntheticInterchange([edit([...SYNTHETIC_BODY])]);
}

function replace(prefix: string, ...by: string[]) {
  return (segments: string[]) => segments.flatMap((segment) => (segment.startsWith(prefix) ? by : [segment]));
}

function after(prefix: string, ...added: string[]) {
  return (segments: string[]) => segments.flatMap((segment) => (segment.startsWith(prefix) ? [segment, ...added] : [segment]));
}

function planned(result: PlanResult): LoadPlan {
  if (result.kind !== 'plan') {
    throw new Error('refused');
  }
  return result.plan;
}

const fixture = (relative: string) => readFileSync(path.join(FIXTURES, relative), 'latin1');

describe('the load plan', () => {
  it('maps a transaction set to its remittance, payer, claim, line and adjustments', () => {
    const plan = planned(loadPlan(only(syntheticInterchange())));
    expect(plan.remittance).toEqual({
      senderId: 'SYNTHSENDER',
      receiverId: 'SYNTHRECEIVER',
      isa13: '000000001',
      gs06: '1',
      st02: '0001',
      trn02: 'SYNTRACE0001',
      trn03: '1SYN00000A',
      bpr02Cents: 10000n,
      creditDebit: 'C',
      method: 'ACH',
      bpr16Date: '2026-04-06',
      payerName: 'SYNTHETIC PAYER A',
      payeeId: '9900000001',
      payeeIdQualifier: 'XX',
      productionDate: '2026-04-05',
      balanceDiffCents: 0n,
      claimCount: 1,
      plbTotalCents: 0n,
    });
    expect(plan.payer).toEqual({ payerIdRaw: '2U:SYNPAYERA', nameRaw: 'SYNTHETIC PAYER A' });
    expect(plan.providerAdjustments).toEqual([]);
    const [claim] = plan.claims;
    expect(claim).toMatchObject({
      claimNo: 1,
      patientControlNumber: 'SYNPCN0001',
      payerClaimControlNumber: 'SYNCCN0001',
      statusCode: '1',
      chargeCents: 15000n,
      paidCents: 10000n,
      patientRespCents: 2000n,
      filingIndicator: '12',
      facilityType: '11',
      frequencyCode: '1',
      planKey: 'CLP06:12',
      patient: { key: 'name|SYNTHLAST|SYNTHFIRST||', lastName: 'SYNTHLAST', firstName: 'SYNTHFIRST', memberId: 'SYNMBR0001', groupNumber: null },
      insured: null,
      serviceFrom: '2026-03-15',
      serviceTo: '2026-03-15',
      adjustments: [],
      reversal: null,
      correction: null,
    });
    expect(claim?.lines).toEqual([
      {
        lineNo: 1,
        procedureQualifier: 'HC',
        procedureCode: '97110',
        modifiers: ['GP'],
        revenueCode: null,
        chargeCents: 15000n,
        paidCents: 10000n,
        units: '2',
        originalUnits: null,
        serviceDate: '2026-03-15',
        serviceDateTo: null,
        lineAllowedCents: null,
        observedAllowedCents: 12000n,
        observedAllowedBasis: 'paid_plus_pr',
        observedAllowedAllocated: false,
        patientShareCents: 2000n,
        renderingNpi: null,
        adjustments: [
          { groupCode: 'CO', reasonCode: '45', unknownCode: false, amountCents: 3000n, quantity: null, position: 1 },
          { groupCode: 'PR', reasonCode: '2', unknownCode: false, amountCents: 2000n, quantity: null, position: 2 },
        ],
      },
    ]);
  });

  it('names the payer by N103 and N104, else REF 2U, else TRN03, each as sent (V24)', () => {
    expect(payerIdentity(only(body(replace('N1*PR', 'N1*PR*SYNTHETIC PAYER A*XV*SYNPLANID42'))))).toEqual({ payerIdRaw: 'XV:SYNPLANID42', nameRaw: 'SYNTHETIC PAYER A' });
    expect(payerIdentity(only(body(replace('REF*2U'))))).toEqual({ payerIdRaw: 'TRN03:1SYN00000A', nameRaw: 'SYNTHETIC PAYER A' });
    const january = only(fixture('variants/V24-payer-id-format-change/january.835'));
    const february = only(fixture('variants/V24-payer-id-format-change/february.835'));
    expect([payerIdentity(january).payerIdRaw, payerIdentity(february).payerIdRaw]).toEqual(['2U:00042', 'XV:SYNPLANID42']);
  });

  it('keys the plan by REF CE, else by the claim filing indicator', () => {
    const [claim] = only(body(after('NM1*QC', 'REF*CE*SYNPLAN-X'))).claims;
    expect(claim === undefined ? null : planKey(claim)).toBe('CE:SYNPLAN-X');
    expect(planned(loadPlan(only(syntheticInterchange()))).claims[0]?.planKey).toBe('CLP06:12');
  });

  it('keeps the insured apart from the patient, gives the group number to the insured, and never takes an SSN as a member ID', () => {
    const remittance = only(
      body((segments) =>
        after('NM1*QC', 'NM1*IL*1*SYNTHSUBSCRIBER*SYNTHFIRST****MI*SYNMBR0002', 'REF*1L*SYNGROUP01')(
          replace('NM1*QC', 'NM1*QC*1*SYNTHLAST*SYNTHFIRST*Q**JR*34*SYN0000001')(segments),
        ),
      ),
    );
    const [claim] = planned(loadPlan(remittance)).claims;
    expect(claim?.patient).toEqual({ key: 'name|SYNTHLAST|SYNTHFIRST|Q|JR', lastName: 'SYNTHLAST', firstName: 'SYNTHFIRST', memberId: null, groupNumber: null });
    expect(claim?.insured).toEqual({ key: 'name|SYNTHSUBSCRIBER|SYNTHFIRST||', lastName: 'SYNTHSUBSCRIBER', firstName: 'SYNTHFIRST', memberId: 'SYNMBR0002', groupNumber: 'SYNGROUP01' });
    const own = planned(loadPlan(only(body(after('NM1*QC', 'REF*1L*SYNGROUP01'))))).claims[0];
    expect(own?.patient.groupNumber).toBe('SYNGROUP01');
  });

  it('keys a patient by name, else by identifier, else by the patient control number', () => {
    const name = (overrides: Partial<Name>): Name => ({
      segmentIndex: 1,
      entity: 'QC',
      entityType: '1',
      lastOrOrganization: null,
      first: null,
      middle: null,
      suffix: null,
      idQualifier: null,
      id: null,
      ...overrides,
    });
    expect(personKey(name({ lastOrOrganization: ' synth  last ', first: 'Ａnn' }))).toBe('name|SYNTH LAST|ANN||');
    expect(personKey(name({ idQualifier: 'MI', id: 'syn1' }))).toBe('id|MI|SYN1');
    expect(personKey(name({}))).toBeNull();
    expect(normalizeKeyPart(null)).toBe('');
    const remittance = only(syntheticInterchange());
    const [claim] = remittance.claims;
    const nameless = { ...remittance, claims: [{ ...claim, names: [name({})] }] } as unknown as LoadableRemittance;
    expect(planned(loadPlan(nameless)).claims[0]?.patient).toEqual({ key: 'pcn|SYNPCN0001', lastName: null, firstName: null, memberId: null, groupNumber: null });
  });

  it('takes the rendering NPI from the line, else from the claim’s rendering provider', () => {
    const fromClaim = planned(loadPlan(only(body(after('NM1*QC', 'NM1*82*1*SYNTHPT*SYNTHETIC****XX*9900000002'))))).claims[0];
    expect(fromClaim?.lines[0]?.renderingNpi).toBe('9900000002');
    const fromLine = planned(loadPlan(only(body((segments) => after('DTM*472', 'REF*HPI*9900000003')(after('NM1*QC', 'NM1*82*1*SYNTHPT*SYNTHETIC****XX*9900000002')(segments)))))).claims[0];
    expect(fromLine?.lines[0]?.renderingNpi).toBe('9900000003');
  });

  it('keeps a service period as its first and last day (PAR-23)', () => {
    const [claim] = planned(loadPlan(only(fixture('PAR-23/range-472-rd8.835')))).claims;
    expect(claim?.lines[0]).toMatchObject({ serviceDate: '2026-04-06', serviceDateTo: '2026-04-10' });
  });

  it('stores the allocated share of claim-level patient responsibility on lines that carry none (PAR-10)', () => {
    const [claim] = planned(loadPlan(only(fixture('PAR-10/remit.835')))).claims;
    expect(claim?.lines.map((line) => [line.observedAllowedCents, line.observedAllowedAllocated, line.patientShareCents, line.paidCents])).toEqual([
      [10934n, true, 2134n, 8800n],
      [6066n, true, 1266n, 4800n],
    ]);
    expect(claim?.adjustments.map((item) => [item.groupCode, item.reasonCode])).toEqual([
      ['CO', '45'],
      ['PR', '2'],
    ]);
  });

  it('flags unknown codes on the adjustment that carries them (PAR-21)', () => {
    const [claim] = planned(loadPlan(only(fixture('PAR-21/remit.835')))).claims;
    expect(claim?.lines[0]?.adjustments.map((item) => [item.reasonCode, item.unknownCode])).toEqual([
      ['45', false],
      ['2', false],
      ['Z999', true],
    ]);
  });

  it('records a debit payment and provider adjustments with their categories', () => {
    const plan = planned(loadPlan(only(fixture('PAR-16/remit.835'))));
    expect(plan.providerAdjustments).toEqual([expect.objectContaining({ position: 1, reasonCode: 'WO', category: 'recoupment' })]);
    const remittance = only(syntheticInterchange());
    expect(planned(loadPlan({ ...remittance, payment: { ...remittance.payment, creditDebit: 'D' } })).remittance.creditDebit).toBe('D');
  });

  it('links a reversal to its original and a correction to its reversal inside the transaction set, and nothing across sets', () => {
    const reversal = [
      'CLP*SYNPCN0001*22*-150.00*-100.00*-20.00*12*SYNCCN0001*11*8',
      'NM1*QC*1*SYNTHLAST*SYNTHFIRST****MI*SYNMBR0001',
      'SVC*HC:97110:GP*-150.00*-100.00**2',
      'DTM*472*20260315',
      'CAS*CO*45*-30.00',
      'CAS*PR*2*-20.00',
    ];
    const text = body((segments) => [...replace('BPR', SYNTHETIC_BODY[0]?.replace('*100.00*', '*0.00*') ?? '')(segments), ...reversal]);
    const [original, reversed] = planned(loadPlan(only(text))).claims;
    expect([original?.reversal, reversed?.reversal]).toEqual([null, { reversedClaimNo: 1 }]);
    const [first, correction] = planned(loadPlan(only(fixture('PAR-08/correction.835')))).claims;
    expect(first?.reversal).toEqual({ reversedClaimNo: null });
    expect(correction?.correction).toEqual({ payerClaimControlNumber: 'SYNCCNPAR080001', reversalClaimNo: 1 });
    // A link to a claim of another transaction set is never taken as one of this set's claims.
    const remittance = only(text);
    const elsewhere = {
      ...remittance,
      claims: remittance.claims.map((claim) => (claim.reversal === null ? claim : { ...claim, reversal: { ...claim.reversal, reversed: { interchange: 0, group: 0, transaction: 1, claim: 0 } } })),
    };
    expect(planned(loadPlan(elsewhere)).claims[1]?.reversal).toEqual({ reversedClaimNo: null });
  });

  it('refuses units and quantities numeric(9,3) cannot hold exactly, at their element', () => {
    expect(loadPlan(only(body(replace('SVC', 'SVC*HC:97110:GP*150.00*100.00**2.0001'))))).toEqual({ kind: 'refused', at: { segmentIndex: 19, segmentId: 'SVC', elementPosition: 5 } });
    expect(loadPlan(only(body(replace('SVC', 'SVC*HC:97110:GP*150.00*100.00**2*HC:97110*1234567'))))).toEqual({ kind: 'refused', at: { segmentIndex: 19, segmentId: 'SVC', elementPosition: 7 } });
    expect(loadPlan(only(body(replace('CAS*CO', 'CAS*CO*45*30.00*1.0005'))))).toEqual({ kind: 'refused', at: { segmentIndex: 21, segmentId: 'CAS', elementPosition: 4 } });
    expect(planned(loadPlan(only(body(replace('SVC', 'SVC*HC:97110:GP*150.00*100.00**2.5000'))))).claims[0]?.lines[0]?.units).toBe('2.5000');
  });

  it('refuses a payee without its qualifier, which the parser never leaves loadable', () => {
    const remittance = only(syntheticInterchange());
    expect(() => loadPlan({ ...remittance, payee: { ...remittance.payee, idQualifier: null } })).toThrow(/payee with a qualifier/);
  });
});

describe('fitsNumeric93', () => {
  it.each([
    ['1', true],
    ['1.5', true],
    ['.5', true],
    ['1.500', true],
    ['1.5000', true],
    ['-1.25', true],
    ['000123456.123', true],
    ['123456.1234', false],
    ['1234567', false],
    ['0.0001', false],
    ['', false],
    ['.', false],
    ['-', false],
    ['-.', false],
    ['1e3', false],
  ])('%s fits: %s', (text, fits) => {
    expect(fitsNumeric93(text)).toBe(fits);
  });
});
