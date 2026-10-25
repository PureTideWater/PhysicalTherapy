import fc from 'fast-check';
import { cents } from '@tp/money';
import { describe, expect, it } from 'vitest';

import { type AssemblyInput, PacketAssemblyError, assemblePacket, dollars, requestedAction } from './assemble';
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

  it('refuses each malformed packet by its class, name and message', () => {
    const refusals: readonly [string, Partial<AssemblyInput>, string][] = [
      ['no line', { lines: [] }, 'a packet asks for at least one line of its case that is not written off'],
      ['one line of several not paid short', { lines: [line(1), line(2, { varianceCents: cents(0n) }), line(3)] }, 'every line a packet asks for is paid below its expected amount'],
      ['a line paid above its expected amount', { lines: [line(1, { varianceCents: cents(-1n) })] }, 'every line a packet asks for is paid below its expected amount'],
      ['level 0', { disputeLevel: 0 }, 'a dispute level is a whole number from 1'],
      ['level -1', { disputeLevel: -1 }, 'a dispute level is a whole number from 1'],
      // A level and a half, even with a next window stated.
      ['level 3/2', { disputeLevel: 3 / 2, nextLevelDeadline: { status: 'verified', source: 'release', endsOn: '2026-12-15', cause: null } }, 'a dispute level is a whole number from 1'],
      ['level 2 without its window', { disputeLevel: 2 }, 'a dispute after the first level states its next window and whether it is verified'],
    ];
    for (const [label, overrides, message] of refusals) {
      let error: unknown = null;
      try {
        assemblePacket(assemblyInput(overrides));
      } catch (caught) {
        error = caught;
      }
      expect(error, label).toBeInstanceOf(PacketAssemblyError);
      expect((error as Error).name, label).toBe('PacketAssemblyError');
      expect((error as Error).message, label).toBe(message);
    }
    // One cent short is short.
    expect(assemblePacket(assemblyInput({ lines: [line(1, { varianceCents: cents(1n) })] })).pattern.variance_cents).toBe('1');
  });

  it('orders the schedule by service date, then code, then claim, then service line, whatever order the lines come in', () => {
    const at = (n: number, serviceDate: string, procedureCode: string, claim: string, serviceLine: string) =>
      line(n, { serviceDate, procedureCode, claimId: `20000000-0000-4000-8000-00000000000${claim}`, serviceLineId: `10000000-0000-4000-8000-00000000000${serviceLine}` });
    // In schedule order: the earlier date first; on one date 97110 before 97140; for 97110, claim 5 before claim 6;
    // for claim 5, service line 3 before 7. Each key's order disagrees with the next key's, so each decides its own place.
    const [r1, r2, r3, r4, r5] = [at(1, '2026-03-04', '97530', '9', '9'), at(2, '2026-03-05', '97110', '5', '3'), at(3, '2026-03-05', '97110', '5', '7'), at(4, '2026-03-05', '97110', '6', '1'), at(5, '2026-03-05', '97140', '2', '2')];
    for (const lines of [
      [r5, r4, r3, r2, r1],
      [r3, r5, r1, r4, r2],
    ]) {
      const packet = assemblePacket(assemblyInput({ lines }));
      expect(packet.lines.map((item) => [item.row, item.service_date, item.procedure_code, item.claim_id.slice(-1), item.service_line_id.slice(-1)])).toStrictEqual([
        [1, '2026-03-04', '97530', '9', '9'],
        [2, '2026-03-05', '97110', '5', '3'],
        [3, '2026-03-05', '97110', '5', '7'],
        [4, '2026-03-05', '97110', '6', '1'],
        [5, '2026-03-05', '97140', '2', '2'],
      ]);
      // The pattern lists its codes sorted, and counts claims and patients once each.
      expect(packet.pattern.codes.map((code) => [code.procedure_code, code.lines, code.units])).toStrictEqual([
        ['97110', 3, '6'],
        ['97140', 1, '2'],
        ['97530', 1, '2'],
      ]);
      expect(packet.pattern).toMatchObject({ lines: 5, claims: 4, patients: 5, units: '10', first_service_date: '2026-03-04', last_service_date: '2026-03-05' });
    }
  });

  it('states every figure of the pattern and its codes, summed exactly from the lines', () => {
    const packet = assemblePacket(
      assemblyInput({
        lines: [
          line(1, { units: '1.5', expectedCents: cents(7500n), observedCents: cents(5000n), varianceCents: cents(2500n), paidCents: cents(4000n) }),
          line(2, { procedureCode: '97140', units: '2', expectedCents: cents(12001n), observedCents: cents(8000n), varianceCents: cents(4001n), paidCents: cents(6400n) }),
          line(3, { units: '0.25', claimId: '20000000-0000-4000-8000-000000000001', patientKey: '40000000-0000-4000-8000-000000000001', expectedCents: cents(1250n), observedCents: cents(1000n), varianceCents: cents(250n), paidCents: cents(800n) }),
        ],
      }),
    );
    expect(packet.pattern).toStrictEqual({
      behavior: 'BELOW_CONTRACT_RATE',
      method: 'FIXED_SCHEDULE',
      contract_percentages: [],
      contract_years: [],
      codes: [
        { procedure_code: '97110', lines: 2, units: '1.75', expected_cents: '8750', observed_cents: '6000', variance_cents: '2750', contract_amount_cents: '5000' },
        { procedure_code: '97140', lines: 1, units: '2', expected_cents: '12001', observed_cents: '8000', variance_cents: '4001', contract_amount_cents: '5000' },
      ],
      lines: 3,
      claims: 2,
      patients: 2,
      units: '3.75',
      expected_cents: '20751',
      observed_cents: '14000',
      variance_cents: '6751',
      first_service_date: '2026-03-05',
      last_service_date: '2026-03-07',
    });
    // Each row states its own figures as given, its units canonical.
    expect(packet.lines.map((item) => [item.units, item.expected_cents, item.observed_cents, item.variance_cents, item.paid_cents, item.paid_on, item.received_on, item.window_ends_on])).toStrictEqual([
      ['1.5', '7500', '5000', '2500', '4000', '2026-04-08', null, '2036-04-05'],
      ['2', '12001', '8000', '4001', '6400', '2026-04-08', null, '2036-04-05'],
      ['0.25', '1250', '1000', '250', '800', '2026-04-08', null, '2036-04-05'],
    ]);
  });

  it('states the contract’s own amount for a code only where the term fixes one: a fixed schedule’s, a per-visit term’s or a lesser-of term’s fixed schedule', () => {
    const amountOf = (method: 'FIXED_SCHEDULE' | 'PERCENT_OF_MEDICARE' | 'LESSER_OF' | 'PER_VISIT', parameters: Readonly<Record<string, unknown>>) =>
      assemblePacket(assemblyInput({ citation: contractCitation({ method, parameters }) })).pattern.codes.map((code) => code.contract_amount_cents);
    expect(amountOf('FIXED_SCHEDULE', { amount_cents: '5000' })).toStrictEqual(['5000']);
    expect(amountOf('PER_VISIT', { amount_cents: '9000' })).toStrictEqual(['9000']);
    expect(amountOf('LESSER_OF', { schedule: { method: 'FIXED_SCHEDULE', amount_cents: '4500' }, charge_basis: 'LINE_CHARGE' })).toStrictEqual(['4500']);
    // A lesser-of term's own top-level amount is not its schedule's.
    expect(amountOf('LESSER_OF', { amount_cents: '1234', schedule: { method: 'FIXED_SCHEDULE', amount_cents: '4500' } })).toStrictEqual(['4500']);
    for (const [method, parameters] of [
      // No amount, or one that is not cents as text.
      ['FIXED_SCHEDULE', {}],
      ['FIXED_SCHEDULE', { amount_cents: 5000 }],
      ['PER_VISIT', { amount_cents: null }],
      // A percent-of-Medicare term fixes no amount, whatever its parameters hold.
      ['PERCENT_OF_MEDICARE', { percentage: '120', amount_cents: '1234' }],
      ['PERCENT_OF_MEDICARE', { percentage: '120', schedule: { method: 'FIXED_SCHEDULE', amount_cents: '4500' } }],
      // A lesser-of term against a percent-of-Medicare schedule, against no schedule, or a schedule with no amount.
      ['LESSER_OF', { schedule: { method: 'PERCENT_OF_MEDICARE', percentage: '110', amount_cents: '4500' }, charge_basis: 'LINE_CHARGE' }],
      ['LESSER_OF', { charge_basis: 'LINE_CHARGE' }],
      ['LESSER_OF', { amount_cents: '1234', charge_basis: 'LINE_CHARGE' }],
      ['LESSER_OF', { schedule: { method: 'FIXED_SCHEDULE' }, charge_basis: 'LINE_CHARGE' }],
    ] as const) {
      expect(amountOf(method, parameters), `${method} ${JSON.stringify(parameters)}`).toStrictEqual([null]);
    }
    // A regulation states no contract amount.
    expect(assemblePacket(assemblyInput({ citation: REGULATION, contractDocuments: [] })).pattern.codes.map((code) => code.contract_amount_cents)).toStrictEqual([null]);
  });

  it('reads the percentages and locked years at the term’s top, its schedule and its adjustment, sorted, each once', () => {
    const pattern = (parameters: Readonly<Record<string, unknown>>) => assemblePacket(assemblyInput({ citation: contractCitation({ method: 'PERCENT_OF_MEDICARE', parameters }) })).pattern;
    // Read top first, then the schedule, then the adjustment: sorted, the percentages as text and the years as numbers.
    expect(
      pattern({
        percentage: '95',
        year_basis: 'LOCKED:2025',
        schedule: { percent: '120.50', year_basis: 'LOCKED:2019', contract_adjustment: { percentage: '95.0', year_basis: 'LOCKED:2022' } },
        contract_adjustment: { kind: 'PERCENT', percent: '100', year_basis: 'LOCKED:2025' },
      }),
    ).toMatchObject({ contract_percentages: ['100', '120.5', '95'], contract_years: [2019, 2022, 2025] });
    // A year basis that is not locked names no year; a part that is null or not an object holds nothing.
    expect(pattern({ percentage: '120', year_basis: 'CURRENT', schedule: null, contract_adjustment: null })).toMatchObject({ contract_percentages: ['120'], contract_years: [] });
    expect(pattern({ percentage: '120', year_basis: 'CURRENT_LOCKED:2020', schedule: 'LOCKED:2021', contract_adjustment: 7 })).toMatchObject({ contract_percentages: ['120'], contract_years: [] });
    // A percentage that is not text is not read.
    expect(pattern({ percentage: 120, percent: '80' })).toMatchObject({ contract_percentages: ['80'], contract_years: [] });
    // A regulation states neither.
    expect(assemblePacket(assemblyInput({ citation: REGULATION, contractDocuments: [] })).pattern).toMatchObject({ contract_percentages: [], contract_years: [] });
  });

  it('lists each piece of evidence once, labelled, in its order: the cited document, the version’s others, the remittances by payment date, the releases by number, then attachments', () => {
    const other = '00000000-0000-4000-8000-0000000000c1';
    const attached = '00000000-0000-4000-8000-0000000000d1';
    const packet = assemblePacket(
      assemblyInput({
        citation: contractCitation({ page: 4, version_no: 3 }),
        contractDocuments: [
          { documentId: IDS.document, sha256: SHA },
          { documentId: other, sha256: null },
          { documentId: other, sha256: null },
        ],
        remittances: [
          { documentId: '00000000-0000-4000-8000-0000000000bb', sha256: 'b'.repeat(64), paidOn: '2026-04-10' },
          { documentId: '00000000-0000-4000-8000-0000000000cc', sha256: 'c'.repeat(64), paidOn: '2026-04-08' },
          { documentId: '00000000-0000-4000-8000-0000000000aa', sha256: 'd'.repeat(64), paidOn: '2026-04-10' },
        ],
        releases: [
          { release_no: 900003, manifest_sha256: 'e'.repeat(64) },
          { release_no: 900001, manifest_sha256: SHA },
          { release_no: 900002, manifest_sha256: 'f'.repeat(64) },
        ],
        attachedDocuments: [{ documentId: attached, sha256: SHA }],
      }),
    );
    expect(packet.evidence).toStrictEqual([
      { kind: 'contract_document', document_id: IDS.document, sha256: SHA, label: 'Contract document cited at page 4 (contract version 3)' },
      { kind: 'contract_document', document_id: other, sha256: null, label: 'Contract document of version 3' },
      { kind: 'remittance', document_id: '00000000-0000-4000-8000-0000000000cc', sha256: 'c'.repeat(64), label: '835 remittance paid 2026-04-08' },
      { kind: 'remittance', document_id: '00000000-0000-4000-8000-0000000000aa', sha256: 'd'.repeat(64), label: '835 remittance paid 2026-04-10' },
      { kind: 'remittance', document_id: '00000000-0000-4000-8000-0000000000bb', sha256: 'b'.repeat(64), label: '835 remittance paid 2026-04-10' },
      { kind: 'rule_release', document_id: null, sha256: SHA, label: 'Rule release 900001' },
      { kind: 'rule_release', document_id: null, sha256: 'f'.repeat(64), label: 'Rule release 900002' },
      { kind: 'rule_release', document_id: null, sha256: 'e'.repeat(64), label: 'Rule release 900003' },
      { kind: 'attached_document', document_id: attached, sha256: SHA, label: 'Document attached to the packet' },
    ]);
    expect(packet.rule_releases.map((release) => release.release_no)).toStrictEqual([900001, 900002, 900003]);
    expect(packet.sources).toStrictEqual([
      { marker: 1, kind: 'citation', evidence_index: null },
      { marker: 2, kind: 'rule_release', evidence_index: null },
      { marker: 3, kind: 'line_schedule', evidence_index: null },
      ...packet.evidence.map((_item, index) => ({ marker: index + 4, kind: 'evidence', evidence_index: index })),
    ]);
  });

  it('lists each deadline source once, sorted by what it is, a contract window by its version and document and a release record by its number and hash', () => {
    const window = (version: string, document: string) => contractWindowSource({ contract_version_id: `00000000-0000-4000-8000-00000000005${version}`, document_id: `00000000-0000-4000-8000-00000000007${document}` });
    const record = (releaseNo: number, sha: string) => ({ kind: 'release_record', release_no: releaseNo, sha256: sha.repeat(64), program: 'medicare', level: 'L2' }) as const;
    const sources = [record(900002, 'b'), window('2', '1'), record(900001, 'b'), window('1', '2'), record(900001, 'a'), window('1', '1'), record(900002, 'b'), window('1', '2')];
    const { deadline } = assemblePacket(assemblyInput({ deadlineSources: sources }));
    expect(deadline.sources).toStrictEqual([window('1', '1'), window('1', '2'), window('2', '1'), record(900001, 'a'), record(900001, 'b'), record(900002, 'b')]);
  });

  it('states the deadline’s causes once each, sorted, and its earliest end whatever the lines’ order', () => {
    const packet = assemblePacket(
      assemblyInput({
        lines: [
          line(1, { windowEndsOn: '2027-03-01', deadline: { status: 'unverified', source: 'contract', endsOn: '2027-03-01', cause: 'NEXT_LEVEL_UNCITED' } }),
          line(2, { windowEndsOn: '2027-02-01', deadline: { status: 'unverified', source: 'contract', endsOn: '2027-02-01', cause: 'CONTRACT_WINDOW_UNCITED' } }),
          line(3, { windowEndsOn: null, deadline: { status: 'unverified', source: null, endsOn: null, cause: 'NEXT_LEVEL_UNCITED' } }),
        ],
      }),
    );
    expect(packet.deadline).toStrictEqual({ basis: 'line_windows', ends_on: '2027-02-01', status: 'unverified', lines_verified: 0, lines: 3, causes: ['CONTRACT_WINDOW_UNCITED', 'NEXT_LEVEL_UNCITED'], sources: [contractWindowSource()] });
    // No line with a window: no end.
    const none = assemblePacket(assemblyInput({ lines: [line(1, { windowEndsOn: null, deadline: { status: 'unverified', source: null, endsOn: null, cause: 'CONTRACT_WINDOW_UNCITED' } })] }));
    expect(none.deadline).toMatchObject({ ends_on: null, status: 'unverified', lines_verified: 0, lines: 1, causes: ['CONTRACT_WINDOW_UNCITED'] });
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

describe('assemblePacket’s dates as text, whatever text they hold', () => {
  // The deadline's end and the pattern's first and last service dates are compared as text, in code-unit order, which
  // orders every YYYY-MM-DD date by the calendar. These cases hold what the comparison rests on with text that is not a
  // date, where a coincidence of order that calendar dates share would otherwise hide the difference.
  const uncited = (endsOn: string | null) => ({ status: 'unverified', source: endsOn === null ? null : 'contract', endsOn, cause: 'CONTRACT_WINDOW_UNCITED' }) as const;

  it('takes the deadline from the lines that state an end, leaving out a line without one rather than sorting it last', () => {
    // Compared as text, a missing end would read "null", which sorts after every date but before "pending".
    const packet = assemblePacket(assemblyInput({ lines: [line(1, { windowEndsOn: null, deadline: uncited(null) }), line(2, { windowEndsOn: 'pending', deadline: uncited('pending') })] }));
    expect(packet.deadline).toMatchObject({ basis: 'line_windows', ends_on: 'pending', status: 'unverified', lines_verified: 0, lines: 2 });
  });

  it('states the pattern’s first and last service dates in code-unit order, not in the schedule’s collation order', () => {
    // The schedule lists its lines by localeCompare, which puts "a" before "B"; code-unit order puts "B" first.
    expect('a'.localeCompare('B')).toBeLessThan(0);
    const packet = assemblePacket(assemblyInput({ lines: [line(1, { serviceDate: 'B' }), line(2, { serviceDate: 'a' })] }));
    expect(packet.lines.map((item) => item.service_date)).toStrictEqual(['a', 'B']);
    expect(packet.pattern).toMatchObject({ first_service_date: 'B', last_service_date: 'a' });
  });
});
