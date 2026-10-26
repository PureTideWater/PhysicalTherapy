import { citationSchema, pageTextHash, parseRateTerms, quoteOnPage } from '@tp/contracts';
import { describe, expect, it } from 'vitest';

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { referenceCandidate } from '../../eval/reference';
import { sha256Hex } from '../hash';
import { SYNTHETIC_CONTRACT_PAGES, syntheticContractInput, syntheticContractOutput } from '../testing';
import { CITED_FIELDS, type ContractTermsCandidate, type FieldReview, MAX_PAGES, contractTermsOutput, contractTermsSpec, rowProblems, scopesOverlap, verifyContractTerms } from './contract-terms';

/**
 * proposeContractTerms's verifier (test matrix MOD-01, MOD-02): every quote on its page, every amount,
 * date and code in its own quote and readable by code, conflicting candidates flagged and never merged.
 * Synthetic pages only.
 */

const input = syntheticContractInput();
const first = () => syntheticContractOutput().candidates[0] as ContractTermsCandidate;
const verify = (...candidates: ContractTermsCandidate[]) => verifyContractTerms(input, { candidates });
const review = (candidate: ContractTermsCandidate) => verify(candidate).proposal.candidates[0];

describe('MOD-01: contract proposal quotes verify', () => {
  it('verifies every quote of the synthetic exhibit as a substring of its page, and proposes rate records', () => {
    const output = syntheticContractOutput();
    const { proposal, passed, citations } = verifyContractTerms(input, output);
    expect(passed).toBe(true);
    for (const candidate of output.candidates) {
      for (const field of [candidate.method, candidate.codes, candidate.amount, candidate.rounding, candidate.effective_from, candidate.effective_to]) {
        expect(field).not.toBeNull();
        expect(quoteOnPage(field?.quote ?? '', SYNTHETIC_CONTRACT_PAGES[(field?.page ?? 0) - 1] ?? '')).toBe(true);
      }
    }
    expect(proposal.candidates.map((candidate) => candidate.fields.every((field) => field.verified))).toEqual([true, true]);
    expect(proposal.candidates.map((candidate) => candidate.conflictsWith)).toEqual([[], []]);
    const [record] = proposal.candidates.map((candidate) => candidate.rateRecord);
    expect(record).toEqual({
      scope: { codes: ['97110'], effective_from: '2026-01-01', effective_to: '2027-01-01' },
      method: 'FIXED_SCHEDULE',
      parameters: { amount_cents: '3250' },
      flags: { apply_mppr: false, apply_assistant_reduction: false, apply_sequestration: false, apply_ncci: false, timed_units_rule: 'UNKNOWN' },
      rounding: 'HALF_UP_CENT',
      evidence: { document_id: input.documentId, page: 2, quote: 'CPT 97110 Therapeutic exercise, each 15 minutes $32.50 per unit', hash: pageTextHash(SYNTHETIC_CONTRACT_PAGES[1] ?? '') },
      proposed_by: 'model',
    });
    // The proposed record's terms are valid stored rate terms (the specialist still approves each field).
    const { evidence, proposed_by: _proposer, ...terms } = record ?? { evidence: null, proposed_by: 'model' };
    expect(() => parseRateTerms(terms)).not.toThrow();
    expect(citationSchema.safeParse(evidence).success).toBe(true);
    expect(proposal.candidates[0]?.defaults).toEqual(['effective_to_as_last_day', 'flags']);
    // Citations are references: field, page and the quote's hash, never the quoted text.
    expect(citations).toContainEqual({ field: 'candidates[0].amount', page: 2, quote_sha256: sha256Hex('CPT 97110 Therapeutic exercise, each 15 minutes $32.50 per unit') });
    expect(JSON.stringify(citations)).not.toContain('Therapeutic');
  });
});

describe('MOD-02: a field whose date is not in its quote', () => {
  it('is rejected, and its candidate proposes no rate record; the rest of the candidate stands for the specialist', () => {
    const candidate = { ...first(), effective_from: { written: 'January 1, 2026', page: 1, quote: 'Section 5. Rounding.' } };
    const result = verify(candidate);
    expect(result.passed).toBe(false);
    const reviewed = result.proposal.candidates[0];
    expect(reviewed?.fields.find((field) => field.field === 'effective_from')).toMatchObject({ verified: false, problems: ['not_in_quote'] });
    expect(reviewed?.fields.filter((field) => field.field !== 'effective_from').every((field) => field.verified)).toBe(true);
    expect(reviewed?.rateRecord).toBeNull();
    expect(reviewed?.problems).toEqual(['fields_rejected']);
  });

  it('also rejects an amount, a code, a modifier or a place of service its quote does not hold', () => {
    const quote = 'CPT 97110 Therapeutic exercise, each 15 minutes $32.50 per unit';
    const cases: [Partial<ContractTermsCandidate>, string][] = [
      [{ amount: { written: '$35.00', page: 2, quote } }, 'amount'],
      [{ codes: { written: ['97110', '97112'], page: 2, quote } }, 'codes'],
      [{ modifiers: { written: ['GP'], page: 2, quote } }, 'modifiers'],
      [{ places_of_service: { written: ['11'], page: 2, quote } }, 'places_of_service'],
      [{ fee_schedule_year: { written: '2025', page: 2, quote } }, 'fee_schedule_year'],
    ];
    for (const [change, field] of cases) {
      expect(review({ ...first(), ...change })?.fields.find((entry) => entry.field === field)?.problems, field).toEqual(['not_in_quote']);
    }
  });

  it('rejects a date it cannot read, a quote that is not on its page, and a page the document does not have', () => {
    const candidate = {
      ...first(),
      effective_to: { written: 'the end of the year', page: 1, quote: 'Section 4. Compensation. Payer pays Provider the rates in Exhibit A for each unit of service.' },
      rounding: { value: 'HALF_UP_CENT' as const, page: 1, quote: 'Amounts are always rounded down.' },
      method: { value: 'FIXED_SCHEDULE' as const, page: 9, quote: 'EXHIBIT A' },
    };
    const fields = review(candidate)?.fields ?? [];
    expect(fields.find((field) => field.field === 'effective_to')?.problems).toEqual(['not_in_quote', 'unreadable']);
    expect(fields.find((field) => field.field === 'rounding')?.problems).toEqual(['quote_not_on_page']);
    expect(fields.find((field) => field.field === 'method')?.problems).toEqual(['page_missing']);
  });

  it('rejects a written value code cannot read even when the quote holds it', () => {
    const quote = 'EXHIBIT A - FEE SCHEDULE';
    expect(review({ ...first(), amount: { written: 'EXHIBIT A', page: 2, quote } })?.fields.find((field) => field.field === 'amount')?.problems).toEqual(['unreadable']);
    expect(review({ ...first(), codes: { written: ['EXHIBIT'], page: 2, quote } })?.fields.find((field) => field.field === 'codes')?.problems).toEqual(['unreadable']);
    expect(review({ ...first(), percentage: { written: 'FEE', page: 2, quote } })?.fields.find((field) => field.field === 'percentage')?.problems).toEqual(['unreadable']);
  });
});

describe('MOD-02: a value that is only a fragment of a figure in its quote', () => {
  // A SYNTHETIC page whose figures hold shorter figures inside them.
  const page = 'SYNTHETIC EXHIBIT. CPT 97110 billed with modifier GP is paid $32.50 per unit, effective 11/1/2026 through 12/1/2026, or 110% of Medicare; CPT 97140 is $59.00 per visit.';
  const pages = [page];
  const quote = page;
  const base: ContractTermsCandidate = {
    label: 'SYNTHETIC 97110',
    method: { value: 'FIXED_SCHEDULE', page: 1, quote },
    codes: { written: ['97110'], page: 1, quote },
    modifiers: null,
    places_of_service: null,
    amount: { written: '$32.50', page: 1, quote },
    percentage: null,
    fee_schedule_year: null,
    lesser_of_schedule: null,
    flags: null,
    rounding: null,
    effective_from: { written: '11/1/2026', page: 1, quote },
    effective_to: { written: '12/1/2026', page: 1, quote },
  };
  const reviewOn = (candidate: ContractTermsCandidate) => verifyContractTerms({ ...input, pages }, { candidates: [candidate] }).proposal.candidates[0];
  const problemsOf = (candidate: ContractTermsCandidate, field: string) => reviewOn(candidate)?.fields.find((entry) => entry.field === field)?.problems;

  it('verifies the whole figures the page writes', () => {
    const reviewed = reviewOn(base);
    expect(reviewed?.fields.every((field) => field.verified)).toBe(true);
    expect(reviewed?.rateRecord).toMatchObject({ parameters: { amount_cents: '3250' }, scope: { effective_from: '2026-11-01' } });
    expect(problemsOf({ ...base, method: { value: 'PERCENT_OF_MEDICARE', page: 1, quote }, amount: null, percentage: { written: '110%', page: 1, quote } }, 'percentage')).toEqual([]);
    expect(problemsOf({ ...base, modifiers: { written: ['GP'], page: 1, quote } }, 'modifiers')).toEqual([]);
  });

  it.each([
    ['amount', { amount: { written: '$3', page: 1, quote } }],
    ['amount', { amount: { written: '$32', page: 1, quote } }],
    ['amount', { amount: { written: '2.50', page: 1, quote } }],
    ['percentage', { method: { value: 'PERCENT_OF_MEDICARE' as const, page: 1, quote }, amount: null, percentage: { written: '10%', page: 1, quote } }],
    ['effective_from', { effective_from: { written: '1/1/2026', page: 1, quote } }],
    ['effective_to', { effective_to: { written: '2/1/2026', page: 1, quote } }],
    ['places_of_service', { places_of_service: { written: ['11'], page: 1, quote } }],
    ['places_of_service', { places_of_service: { written: ['12'], page: 1, quote } }],
    ['modifiers', { modifiers: { written: ['59'], page: 1, quote } }],
    ['fee_schedule_year', { fee_schedule_year: { written: '2026', page: 1, quote } }],
  ] as const)('rejects %s written as a fragment of a longer figure (%j)', (field, change) => {
    const reviewed = reviewOn({ ...base, ...change } as ContractTermsCandidate);
    expect(reviewed?.fields.find((entry) => entry.field === field)?.problems).toEqual(['not_in_quote']);
    expect(reviewed?.rateRecord).toBeNull();
    expect(reviewed?.problems).toContain('fields_rejected');
  });

  it('reads a code with its modifiers attached, and refuses a code range or a slash joining a place to a date', () => {
    const attached = 'SYNTHETIC: 97110-GP-59 is paid $32.50 per unit; 97112-97116 at $40.00; POS 11/22 excluded.';
    const on = (candidate: Partial<ContractTermsCandidate>) =>
      verifyContractTerms({ ...input, pages: [attached] }, { candidates: [{ ...base, ...candidate, effective_from: null, effective_to: null }] }).proposal.candidates[0];
    const cite = (written: string[]) => ({ written, page: 1, quote: attached });
    expect(on({ method: { value: 'FIXED_SCHEDULE', page: 1, quote: attached }, codes: cite(['97110']), modifiers: cite(['GP', '59']), amount: { written: '$32.50', page: 1, quote: attached } })?.fields.every((field) => field.verified)).toBe(true);
    for (const [field, written] of [
      ['codes', ['97112']],
      ['codes', ['97116']],
      ['places_of_service', ['11']],
      ['places_of_service', ['22']],
    ] as const) {
      expect(on({ method: { value: 'FIXED_SCHEDULE', page: 1, quote: attached }, amount: { written: '$32.50', page: 1, quote: attached }, [field]: cite([...written]) })?.fields.find((entry) => entry.field === field)?.problems, `${field} ${written.join()}`).toEqual(['not_in_quote']);
    }
  });
});

describe('conflicting candidates', () => {
  it('are flagged against each other and never merged: two rates for the same code and dates both stay', () => {
    const second = { ...first(), label: 'Exhibit A, 97110 again', amount: { written: '$30.25', page: 2, quote: 'CPT 97140 Manual therapy, each 15 minutes $30.25 per unit' } };
    const { proposal } = verify(first(), second, syntheticContractOutput().candidates[1] as ContractTermsCandidate);
    expect(proposal.candidates).toHaveLength(3);
    expect(proposal.candidates.map((candidate) => candidate.conflictsWith)).toEqual([[1], [0], []]);
    expect(proposal.candidates[0]?.rateRecord?.parameters).toEqual({ amount_cents: '3250' });
  });

  it('overlap only when codes, modifiers, places and dates all overlap', () => {
    const scope = { codes: ['97110'], modifiers: null, places: null, from: '2026-01-01', lastDay: '2026-12-31' };
    expect(scopesOverlap(scope, { ...scope, codes: null })).toBe(true);
    expect(scopesOverlap(scope, { ...scope, codes: ['97140'] })).toBe(false);
    expect(scopesOverlap({ ...scope, modifiers: ['GP'] }, { ...scope, modifiers: ['GP', 'KX'] })).toBe(false);
    expect(scopesOverlap({ ...scope, modifiers: ['GP', 'KX'] }, { ...scope, modifiers: ['KX', 'GP'] })).toBe(true);
    expect(scopesOverlap({ ...scope, places: ['11'] }, { ...scope, places: ['22'] })).toBe(false);
    expect(scopesOverlap(scope, { ...scope, from: '2027-01-01', lastDay: null })).toBe(false);
    expect(scopesOverlap(scope, { ...scope, from: '2026-12-31', lastDay: null })).toBe(true);
    expect(scopesOverlap({ ...scope, from: null, lastDay: null }, scope)).toBe(true);
  });
});

describe('the terms code builds from the verified text', () => {
  const page1 = 'Section 4. Compensation. Payer pays Provider the rates in Exhibit A for each unit of service.';

  it('a percent of Medicare locked to a year, with the defaults the specialist confirms', () => {
    const pages = [`${page1}\nAll other services: 110% of the 2025 Medicare Physician Fee Schedule.`];
    const quote = 'All other services: 110% of the 2025 Medicare Physician Fee Schedule.';
    const candidate: ContractTermsCandidate = {
      ...first(),
      method: { value: 'PERCENT_OF_MEDICARE', page: 1, quote },
      codes: null,
      amount: null,
      percentage: { written: '110%', page: 1, quote },
      fee_schedule_year: { written: '2025', page: 1, quote },
      rounding: null,
      effective_from: null,
      effective_to: null,
    };
    const reviewed = verifyContractTerms({ ...input, pages }, { candidates: [candidate] }).proposal.candidates[0];
    expect(reviewed?.rateRecord?.parameters).toEqual({ percentage: '110', year_basis: 'LOCKED:2025', locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'non_qualifying_apm' });
    expect(reviewed?.rateRecord?.scope).toEqual({});
    expect(reviewed?.rateRecord?.evidence.quote).toBe(quote);
    expect(reviewed?.defaults).toEqual(['locality_basis', 'conversion_factor', 'flags', 'rounding']);
    // Without a year the schedule follows the current year, which the specialist confirms too.
    const current = verifyContractTerms({ ...input, pages }, { candidates: [{ ...candidate, fee_schedule_year: null }] }).proposal.candidates[0];
    expect(current?.rateRecord?.parameters).toMatchObject({ year_basis: 'CURRENT' });
    expect(current?.defaults).toContain('year_basis');
  });

  it('a lesser-of with a fixed or a percentage schedule, a per-visit rate, and an unsupported term', () => {
    const quote = 'CPT 97110 Therapeutic exercise, each 15 minutes $32.50 per unit';
    const lesser = review({ ...first(), method: { value: 'LESSER_OF', page: 2, quote }, lesser_of_schedule: 'FIXED_SCHEDULE' });
    expect(lesser?.rateRecord?.parameters).toEqual({ schedule: { method: 'FIXED_SCHEDULE', amount_cents: '3250' }, charge_basis: 'LINE_CHARGE' });
    const pages = [...SYNTHETIC_CONTRACT_PAGES, 'Lesser of billed charges or 95% of the Medicare fee schedule.'];
    const percentQuote = 'Lesser of billed charges or 95% of the Medicare fee schedule.';
    const lesserPercent = verifyContractTerms(
      { ...input, pages },
      {
        candidates: [
          {
            ...first(),
            codes: null,
            amount: null,
            method: { value: 'LESSER_OF', page: 3, quote: percentQuote },
            lesser_of_schedule: 'PERCENT_OF_MEDICARE',
            percentage: { written: '95%', page: 3, quote: percentQuote },
          },
        ],
      },
    ).proposal.candidates[0];
    expect(lesserPercent?.rateRecord?.parameters).toEqual({
      schedule: { method: 'PERCENT_OF_MEDICARE', percentage: '95', year_basis: 'CURRENT', locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'non_qualifying_apm' },
      charge_basis: 'LINE_CHARGE',
    });
    expect(review({ ...first(), method: { value: 'PER_VISIT', page: 2, quote } })?.rateRecord?.parameters).toEqual({ amount_cents: '3250' });
    const unsupported = review({ ...first(), method: { value: 'UNSUPPORTED', page: 2, quote }, amount: null });
    expect(unsupported?.rateRecord).toMatchObject({ method: 'UNSUPPORTED', parameters: {}, evidence: { quote } });
  });

  it('keeps the contract’s flags when it states them', () => {
    const quote = 'Section 4. Compensation. Payer pays Provider the rates in Exhibit A for each unit of service.';
    const flags = { apply_mppr: true, apply_assistant_reduction: false, apply_sequestration: false, apply_ncci: true, timed_units_rule: 'PER_CODE' as const, page: 1, quote };
    const reviewed = review({ ...first(), flags });
    expect(reviewed?.rateRecord?.flags).toEqual({ apply_mppr: true, apply_assistant_reduction: false, apply_sequestration: false, apply_ncci: true, timed_units_rule: 'PER_CODE' });
    expect(reviewed?.defaults).not.toContain('flags');
  });

  it('proposes no record for terms that are not valid rate terms (a fixed schedule with no amount)', () => {
    const reviewed = review({ ...first(), amount: null });
    expect(reviewed?.problems).toEqual(['terms_invalid']);
    expect(reviewed?.rateRecord).toBeNull();
    expect(review({ ...first(), method: { value: 'LESSER_OF', page: 2, quote: 'EXHIBIT A - FEE SCHEDULE' }, lesser_of_schedule: null })?.rateRecord).toBeNull();
  });

  it('passes an empty proposal for pages that state no term', () => {
    expect(verifyContractTerms(input, { candidates: [] })).toEqual({ proposal: { documentId: input.documentId, candidates: [] }, passed: true, citations: [] });
  });
});

describe('preparing the call', () => {
  it('frames every page as data and hashes the document and each page', () => {
    const prepared = contractTermsSpec.prepare(input);
    expect(prepared.user).toContain('<document kind="contract" pages="2">');
    expect(prepared.user).toContain('<page number="2">');
    expect(prepared.inputHashes).toEqual([input.documentSha256, ...SYNTHETIC_CONTRACT_PAGES.map(pageTextHash)]);
    expect(prepared.variant).toBe('default');
    expect(contractTermsSpec.prepare({ ...input, ambiguous: true }).variant).toBe('ambiguous');
  });

  it('refuses a document it cannot identify, one with no text, and one longer than a call reads', () => {
    expect(() => contractTermsSpec.prepare({ ...input, documentId: 'not-an-id' })).toThrow(expect.objectContaining({ code: 'input_invalid' }));
    expect(() => contractTermsSpec.prepare({ ...input, documentSha256: 'x' })).toThrow(expect.objectContaining({ code: 'input_invalid' }));
    expect(() => contractTermsSpec.prepare({ ...input, pages: [] })).toThrow(expect.objectContaining({ code: 'no_text' }));
    expect(() => contractTermsSpec.prepare({ ...input, pages: ['  ', '\n'] })).toThrow(expect.objectContaining({ code: 'no_text' }));
    expect(() => contractTermsSpec.prepare({ ...input, pages: Array.from({ length: MAX_PAGES + 1 }, () => 'SYNTHETIC') })).toThrow(expect.objectContaining({ code: 'too_many_pages' }));
  });

  it('reads a contract or an exhibit only: a payer letter (PHI) or any other kind is refused before anything is framed', () => {
    expect(contractTermsSpec.prepare({ ...input, kind: 'exhibit' }).user).toContain('<document kind="exhibit"');
    for (const kind of ['payer_letter', 'remittance_835', 'posting_export', '']) {
      expect(() => contractTermsSpec.prepare({ ...input, kind } as unknown as typeof input), kind).toThrow(expect.objectContaining({ code: 'document_kind' }));
    }
  });

  it('validates the answer’s shape strictly: no field the schema does not name', () => {
    expect(contractTermsOutput.safeParse(syntheticContractOutput()).success).toBe(true);
    expect(contractTermsOutput.safeParse({ candidates: [{ ...first(), approve: true }] }).success).toBe(false);
    expect(contractTermsOutput.safeParse({ candidates: [], status: 'signed_off' }).success).toBe(false);
  });
});

describe('the row check (not_in_row, docs/adr/0070 Part 1)', () => {
  // A SYNTHETIC rate table: each row names its codes before its figures.
  const table = [
    'SYNTHETIC EXHIBIT A. Fee schedule',
    'CPT 97110 Therapeutic exercise $43.10 per unit',
    'CPT 97112-GP Neuromuscular re-education $45.00 per unit',
    'CPT 97140, 97530 Manual therapy and therapeutic activities $41.25 per unit in place of service 11',
    'CPT 97161, 97162, 97163 Evaluation $120.00 per visit',
    'CPT 97035 Ultrasound: 110% of the 2025 Medicare fee schedule',
  ];
  const page = table.join('\n');
  const pages = [page];
  const [, row97110 = '', row97112 = '', row97140 = '', row97161 = '', row97035 = ''] = table;
  const base = (codes: readonly string[], codesQuote: string): ContractTermsCandidate => ({
    label: `SYNTHETIC ${codes.join(', ')}`,
    method: { value: 'FIXED_SCHEDULE', page: 1, quote: codesQuote },
    codes: { written: [...codes], page: 1, quote: codesQuote },
    modifiers: null,
    places_of_service: null,
    amount: null,
    percentage: null,
    fee_schedule_year: null,
    lesser_of_schedule: null,
    flags: null,
    rounding: null,
    effective_from: null,
    effective_to: null,
  });
  const reviewOn = (candidate: ContractTermsCandidate, on: readonly string[] = pages) => verifyContractTerms({ ...input, pages: on }, { candidates: [candidate] }).proposal.candidates[0];
  const problemsOf = (candidate: ContractTermsCandidate, field: string, on: readonly string[] = pages) => reviewOn(candidate, on)?.fields.find((entry) => entry.field === field)?.problems;

  it('passes a row field quoted from its own row', () => {
    const reviewed = reviewOn({ ...base(['97110'], row97110), amount: { written: '$43.10', page: 1, quote: row97110 } });
    expect(reviewed?.fields.every((field) => field.verified)).toBe(true);
    expect(reviewed?.rateRecord).toMatchObject({ parameters: { amount_cents: '4310' } });
  });

  it('rejects swapped rows: the codes from one row, the amount quoted from another', () => {
    const reviewed = reviewOn({ ...base(['97110'], row97110), amount: { written: '$45.00', page: 1, quote: row97112 } });
    expect(reviewed?.fields.find((field) => field.field === 'amount')).toMatchObject({ verified: false, problems: ['not_in_row'] });
    expect(reviewed?.fields.find((field) => field.field === 'codes')?.verified).toBe(true);
    expect(reviewed?.rateRecord).toBeNull();
    expect(reviewed?.problems).toEqual(['fields_rejected']);
  });

  it('rejects a quote across rows whose figure is another row’s, and passes the same quote for the figure of its own row', () => {
    const across = `${row97110}\n${row97112}`;
    expect(problemsOf({ ...base(['97110'], row97110), amount: { written: '$45.00', page: 1, quote: across } }, 'amount')).toEqual(['not_in_row']);
    expect(problemsOf({ ...base(['97110'], row97110), amount: { written: '$43.10', page: 1, quote: across } }, 'amount')).toEqual([]);
  });

  it('rejects a row field quoted from a fragment that names no code', () => {
    expect(problemsOf({ ...base(['97110'], row97110), amount: { written: '$43.10', page: 1, quote: '$43.10 per unit' } }, 'amount')).toEqual(['not_in_row']);
  });

  it('rejects an item of a list field taken from another row: a modifier of 97112 on 97110', () => {
    const across = `${row97110}\n${row97112}`;
    expect(problemsOf({ ...base(['97110'], row97110), modifiers: { written: ['GP'], page: 1, quote: across } }, 'modifiers')).toEqual(['not_in_row']);
    expect(problemsOf({ ...base(['97112'], row97112), modifiers: { written: ['GP'], page: 1, quote: row97112 } }, 'modifiers')).toEqual([]);
  });

  it('passes a multi-code row, a place of service on it, a per-visit group, and a percentage and year on their row', () => {
    const multi = { ...base(['97140', '97530'], row97140), amount: { written: '$41.25', page: 1, quote: row97140 }, places_of_service: { written: ['11'], page: 1, quote: row97140 } };
    expect(reviewOn(multi)?.fields.every((field) => field.problems.length === 0)).toBe(true);
    const visit = { ...base(['97161', '97162', '97163'], row97161), method: { value: 'PER_VISIT' as const, page: 1, quote: row97161 }, amount: { written: '$120.00', page: 1, quote: row97161 } };
    expect(reviewOn(visit)?.fields.every((field) => field.problems.length === 0)).toBe(true);
    const percent = {
      ...base(['97035'], row97035),
      method: { value: 'PERCENT_OF_MEDICARE' as const, page: 1, quote: row97035 },
      percentage: { written: '110%', page: 1, quote: row97035 },
      fee_schedule_year: { written: '2025', page: 1, quote: row97035 },
    };
    expect(reviewOn(percent)?.fields.every((field) => field.problems.length === 0)).toBe(true);
  });

  it('passes a prose sentence that names the code after the figure, and one that names it before', () => {
    const after = 'Payer shall pay $43.10 per unit for CPT 97110.';
    const before = 'For CPT 97110, Payer shall pay $43.10 per unit.';
    for (const sentence of [after, before]) {
      expect(problemsOf({ ...base(['97110'], sentence), amount: { written: '$43.10', page: 1, quote: sentence } }, 'amount', [sentence]), sentence).toEqual([]);
    }
  });

  it('passes a quote holding the word TOTAL, which is no code (the match is case-sensitive and never upper-cases)', () => {
    const sentence = 'CPT 97110 is paid $43.10 per unit, the TOTAL for each unit; Payer shall pay it within 30 days.';
    expect(problemsOf({ ...base(['97110'], sentence), amount: { written: '$43.10', page: 1, quote: sentence } }, 'amount', [sentence])).toEqual([]);
  });

  it('rejects, as known behaviour, a figure whose nearest token is a ZIP code, and the “respectively” sentence', () => {
    // A visible rejection the specialist enters by hand, never a wrong value shown as checked (notice N3).
    const zip = 'CPT 97110 provided at the SYNTHETIC clinic, SYNTHETIC TOWN 99999, is paid $43.10 per unit.';
    expect(problemsOf({ ...base(['97110'], zip), amount: { written: '$43.10', page: 1, quote: zip } }, 'amount', [zip])).toEqual(['not_in_row']);
    const respectively = 'CPT 97110 and CPT 97112 are paid at $43.10 and $45.00 per unit respectively.';
    expect(problemsOf({ ...base(['97110'], respectively), amount: { written: '$43.10', page: 1, quote: respectively } }, 'amount', [respectively])).toEqual(['not_in_row']);
    expect(problemsOf({ ...base(['97112'], respectively), amount: { written: '$45.00', page: 1, quote: respectively } }, 'amount', [respectively])).toEqual([]);
  });

  it('applies only to a candidate that states its codes, and adds nothing to a field already rejected', () => {
    const uncoded = { ...base(['97110'], row97110), codes: null, amount: { written: '$43.10', page: 1, quote: '$43.10 per unit' } };
    expect(problemsOf(uncoded, 'amount')).toEqual([]);
    expect(problemsOf({ ...base(['97110'], row97110), amount: { written: '$45.01', page: 1, quote: row97112 } }, 'amount')).toEqual(['not_in_quote']);
    // The method, flags, rounding and dates are not row fields: a wrong one is the evaluation gate's to measure.
    expect(problemsOf({ ...base(['97110'], row97110), method: { value: 'FIXED_SCHEDULE', page: 1, quote: row97112 } }, 'method')).toEqual([]);
  });

  it('passes every reference answer of the committed synthetic contract set (MOD-01), all 742 fields', () => {
    // Each true record as the reference provider answers it (eval/reference.ts), every cited field as the
    // verifier would pass it: the row check alone, over every case's truth.
    const root = path.resolve(import.meta.dirname, '../../../../fixtures/synthetic/MOD-01/contract-set');
    const truths = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => JSON.parse(readFileSync(path.join(root, entry.name, 'truth.json'), 'utf8')) as { readonly id: string; readonly records: Parameters<typeof referenceCandidate>[0][] });
    expect(truths).toHaveLength(40);
    let fields = 0;
    for (const truth of truths) {
      for (const record of truth.records) {
        fields += Object.keys(record.fields).length;
        const candidate = referenceCandidate(record);
        const reviews: FieldReview[] = CITED_FIELDS.flatMap((field) => {
          const value = candidate[field];
          return value === null ? [] : [{ field, page: value.page, quote: value.quote, written: 'written' in value ? value.written : null, verified: true, problems: [] }];
        });
        expect([...rowProblems(candidate, reviews)], `${truth.id} ${record.label}`).toEqual([]);
      }
    }
    expect(fields).toBe(742);
  });
});
