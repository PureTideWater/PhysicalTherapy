import { cents } from '@tp/money';

import type { AssemblyInput, AssemblyLine } from './assemble';
import type { ContractCitation, RegulationCitation } from './format';
import type { PromptPayRecord } from './interest';

/**
 * SYNTHETIC inputs for the packet tests: a fixed-schedule contract that pays 97110 at 50.00 per unit
 * and three 97110 x 2 lines allowed 70.00 each (test matrix CAS-08), invented identifiers only.
 */

export const IDS = {
  practice: '00000000-0000-4000-8000-000000000001',
  payer: '00000000-0000-4000-8000-000000000002',
  plan: '00000000-0000-4000-8000-000000000003',
  contract: '00000000-0000-4000-8000-000000000004',
  version: '00000000-0000-4000-8000-000000000005',
  rateRecord: '00000000-0000-4000-8000-000000000006',
  document: '00000000-0000-4000-8000-000000000007',
  remittanceDocument: '00000000-0000-4000-8000-000000000008',
  run: '00000000-0000-4000-8000-000000000009',
  case: '00000000-0000-4000-8000-00000000000a',
} as const;

export const SHA = 'a'.repeat(64);

export function contractCitation(overrides: Partial<ContractCitation> = {}): ContractCitation {
  return {
    kind: 'contract',
    contract_id: IDS.contract,
    contract_title: 'SYNTHETIC FIXED SCHEDULE AGREEMENT',
    contract_version_id: IDS.version,
    version_no: 1,
    effective_from: '2026-01-01',
    effective_to: null,
    rate_record_id: IDS.rateRecord,
    method: 'FIXED_SCHEDULE',
    parameters: { amount_cents: '5000' },
    document_id: IDS.document,
    document_sha256: SHA,
    page: 2,
    quote: '97110 is paid 50.00 per unit',
    page_sha256: SHA,
    ...overrides,
  };
}

export const REGULATION: RegulationCitation = {
  kind: 'regulation',
  method: 'MA_NONCONTRACTED',
  reference: '42 CFR 422.214',
  statement: 'A non-contracting provider accepts as payment in full what it could collect under Original Medicare.',
};

export function line(n: number, overrides: Partial<AssemblyLine> = {}): AssemblyLine {
  const hex = n.toString(16).padStart(12, '0');
  return {
    serviceLineId: `10000000-0000-4000-8000-${hex}`,
    claimId: `20000000-0000-4000-8000-${hex}`,
    pricedLineId: `30000000-0000-4000-8000-${hex}`,
    pricingRunId: IDS.run,
    patientKey: `40000000-0000-4000-8000-${hex}`,
    serviceDate: `2026-03-0${String(4 + n)}`,
    procedureCode: '97110',
    modifiers: [],
    units: '2',
    expectedCents: cents(10000n),
    observedCents: cents(7000n),
    varianceCents: cents(3000n),
    paidCents: cents(5600n),
    paidOn: '2026-04-08',
    receivedOn: null,
    windowEndsOn: '2036-04-05',
    ...overrides,
  };
}

export function promptPayRecord(overrides: Partial<PromptPayRecord> = {}): PromptPayRecord {
  return {
    state: 'ZZ',
    release_no: 900001,
    sha256: SHA,
    effective_from: '2026-01-01',
    effective_to: null,
    days_to_pay: 33,
    day_basis: 'calendar',
    annual_rate_percent: '9',
    exclusions: ['self_funded_plans'],
    statute: 'SYNTHETIC statute ZZ 1-2-3',
    ...overrides,
  };
}

export function assemblyInput(overrides: Partial<AssemblyInput> = {}): AssemblyInput {
  return {
    asOf: '2026-10-16',
    disputeLevel: 1,
    practice: { practice_id: IDS.practice, name: 'SYNTHETIC THERAPY GROUP 01', npi: null, tax_id_last4: null },
    payer: { payer_id: IDS.payer, name: 'SYNTHETIC PAYER Q', payer_id_raw: '2U:SYNPAYERQ', plan_id: IDS.plan, plan_key: 'CE:SYNPLAN-FIX-ONE', plan_name: null },
    citation: contractCitation(),
    releases: [{ release_no: 900001, manifest_sha256: SHA }],
    behavior: 'BELOW_CONTRACT_RATE',
    lines: [line(1), line(2), line(3)],
    interest: null,
    contractDocuments: [{ documentId: IDS.document, sha256: SHA }],
    remittances: [{ documentId: IDS.remittanceDocument, sha256: SHA, paidOn: '2026-04-08' }],
    attachedDocuments: [],
    ...overrides,
  };
}
