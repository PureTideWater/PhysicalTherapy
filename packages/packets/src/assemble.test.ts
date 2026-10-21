import fc from 'fast-check';
import { cents } from '@tp/money';
import { describe, expect, it } from 'vitest';

import { PacketAssemblyError, assemblePacket, dollars, requestedAction } from './assemble';
import { draftNarrative } from './draft';
import { narrativeFacts } from './facts';
import { IDENTIFIER_KINDS } from './format';
import { canonicalJson, versionSha256 } from './hash';
import { lineHoldsOnlyPlaceholders } from './placeholders';
import { IDS, REGULATION, SHA, assemblyInput, contractCitation, contractWindowSource, internalTermsIn, line, promptPayRecord } from './test-support';
import { verifyNarrative } from './verifier';

describe('assemblePacket', () => {
  const content = assemblePacket(assemblyInput());

  it('holds the schedule in service-date order, each line with its trace and placeholders only (CAS-11)', () => {
    expect(content.lines.map((item) => [item.row, item.service_date, item.trace_ref])).toEqual([
      [1, '2026-03-05', 'priced_line:30000000-0000-4000-8000-000000000001'],
      [2, '2026-03-06', 'priced_line:30000000-0000-4000-8000-000000000002'],
      [3, '2026-03-07', 'priced_line:30000000-0000-4000-8000-000000000003'],
    ]);
    for (const item of content.lines) {
      expect(lineHoldsOnlyPlaceholders(item)).toBe(true);
      for (const kind of IDENTIFIER_KINDS) {
        expect(item[kind]).toBe(`{{${kind}:${String(item.row)}}}`);
      }
    }
  });

  it('states the pattern: what the contract requires, what the remittances show, the delta and the count', () => {
    expect(content.pattern).toMatchObject({
      method: 'FIXED_SCHEDULE',
      lines: 3,
      claims: 3,
      patients: 3,
      units: '6',
      expected_cents: '30000',
      observed_cents: '21000',
      variance_cents: '9000',
      first_service_date: '2026-03-05',
      last_service_date: '2026-03-07',
      codes: [{ procedure_code: '97110', lines: 3, units: '6', expected_cents: '30000', observed_cents: '21000', variance_cents: '9000', contract_amount_cents: '5000' }],
    });
  });

  it('lists the evidence once each and numbers its sources', () => {
    expect(content.evidence.map((item) => item.kind)).toEqual(['contract_document', 'remittance', 'rule_release']);
    expect(content.sources.map((source) => [source.marker, source.kind])).toEqual([
      [1, 'citation'],
      [2, 'rule_release'],
      [3, 'line_schedule'],
      [4, 'evidence'],
      [5, 'evidence'],
      [6, 'evidence'],
    ]);
    expect(content.evidence_gaps).toEqual([]);
    expect(content.requested_action).toBe('Reprocess the listed claims at the contract rate cited above and pay the variance shown in the line schedule.');
  });

  it('notes a contract document whose hash is unknown, and attached documents', () => {
    const noted = assemblePacket(assemblyInput({ citation: contractCitation({ document_sha256: null }), attachedDocuments: [{ documentId: IDS.remittanceDocument.replace('8', '9'), sha256: SHA }] }));
    expect(noted.evidence_gaps).toEqual([{ code: 'contract_document_hash_unknown', row: null }]);
    expect(noted.evidence.at(-1)?.kind).toBe('attached_document');
  });

  it('refuses a packet with no line, a line not paid short, or a level that is not a whole number from 1', () => {
    expect(() => assemblePacket(assemblyInput({ lines: [] }))).toThrow(PacketAssemblyError);
    expect(() => assemblePacket(assemblyInput({ lines: [line(1, { varianceCents: cents(0n) })] }))).toThrow(PacketAssemblyError);
    expect(() => assemblePacket(assemblyInput({ disputeLevel: 0 }))).toThrow(PacketAssemblyError);
  });

  it('states the regulation for a Medicare Advantage non-contracted pattern', () => {
    const ma = assemblePacket(assemblyInput({ citation: REGULATION, contractDocuments: [] }));
    expect(ma.pattern.method).toBe('MA_NONCONTRACTED');
    expect(ma.evidence.map((item) => item.kind)).toEqual(['remittance', 'rule_release']);
    expect(ma.requested_action).toContain('Original Medicare');
    const draft = draftNarrative(ma);
    expect(draft).toContain('42 CFR 422.214 [1]');
    expect(verifyNarrative(draft, narrativeFacts(ma), []).passed).toBe(true);
  });

  it('reads the percentages and years of a percent-of-Medicare or lesser-of term', () => {
    const percent = assemblePacket(
      assemblyInput({ citation: contractCitation({ method: 'PERCENT_OF_MEDICARE', parameters: { percentage: '120.000', year_basis: 'LOCKED:2025', contract_adjustment: { kind: 'PERCENT', percent: '95' } } }) }),
    );
    expect(percent.pattern).toMatchObject({ contract_percentages: ['120', '95'], contract_years: [2025] });
    expect(percent.pattern.codes[0]?.contract_amount_cents).toBeNull();
    const lesser = assemblePacket(assemblyInput({ citation: contractCitation({ method: 'LESSER_OF', parameters: { schedule: { method: 'FIXED_SCHEDULE', amount_cents: '4500' }, charge_basis: 'LINE_CHARGE' } }) }));
    expect(lesser.pattern.codes[0]?.contract_amount_cents).toBe('4500');
    const visit = assemblePacket(assemblyInput({ citation: contractCitation({ method: 'PER_VISIT', parameters: { amount_cents: '9000' } }) }));
    for (const generated of [percent, lesser, visit]) {
      expect(verifyNarrative(draftNarrative(generated), narrativeFacts(generated), []).mismatches).toEqual([]);
    }
  });

  it('states interest as its own line and source, never inside the expected amount (CAS-15)', () => {
    const withInterest = assemblePacket(assemblyInput({ lines: [line(1, { receivedOn: '2026-03-02', paidOn: '2026-05-01' })], interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord() }, asOf: '2026-05-01' }));
    expect(withInterest.pattern.expected_cents).toBe('10000');
    expect(withInterest.interest?.lines[0]).toMatchObject({ due_on: '2026-04-04', days_late: 27, days_unpaid: 27 });
    expect(withInterest.sources.map((source) => source.kind).slice(0, 4)).toEqual(['citation', 'rule_release', 'line_schedule', 'interest']);
    expect(withInterest.requested_action).toContain('prompt-pay interest');
    const draft = draftNarrative(withInterest);
    expect(draft).toContain('Prompt-pay interest of $0.57');
    expect(verifyNarrative(draft, narrativeFacts(withInterest), []).passed).toBe(true);
    const unknown = assemblePacket(assemblyInput({ interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord({ annual_rate_percent: null }) } }));
    expect(unknown.interest?.total_cents).toBeNull();
    expect(unknown.evidence_gaps).toEqual([{ code: 'interest_rate_unknown', row: null }]);
    expect(unknown.requested_action).not.toContain('interest');
    // Nothing is said of interest no line computed (audit item #37 part 1, D9; Q4 (a)).
    expect(draftNarrative(unknown)).not.toMatch(/interest/i);
  });

  it('writes tp-packet/2: each line’s deadline with its status and source, and its calculation copied as given (CO-05)', () => {
    expect(content.format).toBe('tp-packet/2');
    for (const item of content.lines) {
      expect(item.deadline).toEqual({ ends_on: '2036-04-05', status: 'verified', source: 'contract', cause: null });
      expect(item.window_ends_on).toBe(item.deadline.ends_on);
      expect(item.calculation).toMatchObject({ method: 'FIXED_SCHEDULE', release_no: 900001, steps: [{ step: 'base', amount_cents: item.expected_cents }], trace_sha256: SHA });
      expect(item.calculation.rounding?.rounded_cents).toBe(item.expected_cents);
    }
    expect(content.deadline).toEqual({ basis: 'line_windows', ends_on: '2036-04-05', status: 'verified', lines_verified: 3, lines: 3, causes: [], sources: [contractWindowSource()] });
  });

  it('states the earliest line window, and an unverified deadline when any line’s is, with each cause once (D17)', () => {
    const uncited = { status: 'unverified', source: 'contract', cause: 'CONTRACT_WINDOW_UNCITED' } as const;
    const mixed = assemblePacket(
      assemblyInput({
        lines: [
          line(1, { windowEndsOn: '2027-01-10', deadline: { ...uncited, endsOn: '2027-01-10' } }),
          line(2, { windowEndsOn: '2026-12-01', deadline: { ...uncited, endsOn: '2026-12-01' } }),
          line(3),
        ],
        deadlineSources: [contractWindowSource({ verified_by: null, verified_at: null }), contractWindowSource({ verified_by: null, verified_at: null })],
      }),
    );
    expect(mixed.deadline).toMatchObject({ basis: 'line_windows', ends_on: '2026-12-01', status: 'unverified', lines_verified: 1, lines: 3, causes: ['CONTRACT_WINDOW_UNCITED'] });
    // A source named twice is listed once.
    expect(mixed.deadline.sources).toHaveLength(1);
    expect(mixed.lines.map((item) => item.deadline.status)).toEqual(['unverified', 'unverified', 'verified']);
  });

  it('states the next level’s window after a reopened denial, and refuses a later level without it', () => {
    const next = { status: 'unverified', source: 'contract', endsOn: '2026-12-15', cause: 'NEXT_LEVEL_UNCITED' } as const;
    const second = assemblePacket(assemblyInput({ disputeLevel: 2, nextLevelDeadline: next }));
    expect(second.deadline).toMatchObject({ basis: 'next_level_window', ends_on: '2026-12-15', status: 'unverified', lines_verified: 3, lines: 3, causes: ['NEXT_LEVEL_UNCITED'] });
    const verified = assemblePacket(assemblyInput({ disputeLevel: 2, citation: REGULATION, contractDocuments: [], nextLevelDeadline: { status: 'verified', source: 'release', endsOn: '2026-12-15', cause: null } }));
    expect(verified.deadline).toMatchObject({ basis: 'next_level_window', status: 'verified', causes: [] });
    expect(() => assemblePacket(assemblyInput({ disputeLevel: 2 }))).toThrow(PacketAssemblyError);
  });

  it('starts the requested action with its level after a reopened denial', () => {
    expect(requestedAction(contractCitation(), 2, false)).toMatch(/^Dispute level 2\. Reprocess/);
    expect(dollars('123456')).toBe('$1234.56');
  });
});

describe('draftNarrative for the payer (audit item #37 part 1, T10)', () => {
  const computed = { state: 'ZZ', releaseNo: 900001, record: promptPayRecord() };
  const notComputed = { state: 'ZZ', releaseNo: 900001, record: promptPayRecord({ annual_rate_percent: null }) };
  const received = [line(1, { receivedOn: '2026-03-02', paidOn: '2026-05-01' }), line(2, { receivedOn: '2026-03-03', paidOn: '2026-05-01' })];
  const cases = {
    'a contract, interest computed': assemblyInput({ asOf: '2026-05-01', lines: received, interest: computed }),
    'a contract, interest not computed': assemblyInput({ interest: notComputed }),
    'a contract, no interest': assemblyInput(),
    'a regulation, interest computed': assemblyInput({ asOf: '2026-05-01', citation: REGULATION, contractDocuments: [], lines: received, interest: computed }),
    'a regulation, interest not computed': assemblyInput({ citation: REGULATION, contractDocuments: [], interest: notComputed }),
    'a regulation, no interest': assemblyInput({ citation: REGULATION, contractDocuments: [] }),
  };

  for (const [name, input] of Object.entries(cases)) {
    it(`holds no internal term and passes the verifier: ${name}`, () => {
      const content = assemblePacket(input);
      const draft = draftNarrative(content);
      expect(internalTermsIn(draft)).toEqual([]);
      expect(draft).not.toMatch(/could not be computed|cannot be computed|not stated|in all/);
      expect(verifyNarrative(draft, narrativeFacts(content), []).passed).toBe(true);
    });
  }

  it('states the Medicare fee schedule a regulation’s amount comes from by its release, and interest only where it was computed', () => {
    expect(draftNarrative(assemblePacket(cases['a regulation, no interest']))).toContain('The Medicare fee schedule in effect for those service dates (release 900001) sets that amount [2].');
    expect(draftNarrative(assemblePacket(cases['a contract, interest computed']))).toContain('Prompt-pay interest of $');
    expect(draftNarrative(assemblePacket(cases['a contract, interest not computed']))).not.toContain('[4]');
  });
});

describe('versionSha256', () => {
  it('changes with any field of the content, the number or the narrative', () => {
    const content = assemblePacket(assemblyInput());
    const base = versionSha256({ packetId: IDS.case, versionNo: 1, content, narrative: 'A [1].' });
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(versionSha256({ packetId: IDS.case, versionNo: 2, content, narrative: 'A [1].' })).not.toBe(base);
    expect(versionSha256({ packetId: IDS.case, versionNo: 1, content, narrative: 'B [1].' })).not.toBe(base);
    expect(versionSha256({ packetId: IDS.case, versionNo: 1, content: { ...content, as_of: '2026-10-17' }, narrative: 'A [1].' })).not.toBe(base);
  });

  it('writes canonical JSON whatever the key order, and refuses a bigint', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null))), (record) => {
        const reversed = Object.fromEntries(Object.entries(record).reverse());
        expect(canonicalJson(reversed)).toBe(canonicalJson(record));
      }),
    );
    expect(canonicalJson({ b: [1, { d: undefined, c: 'x' }], a: null })).toBe('{"a":null,"b":[1,{"c":"x"}]}');
    expect(() => canonicalJson({ amount: 1n })).toThrow(TypeError);
  });
});
