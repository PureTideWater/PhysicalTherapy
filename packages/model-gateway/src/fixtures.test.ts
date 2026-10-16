import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { ContractPagesInput, ContractTermsCandidate, ContractTermsProposal } from './functions/contract-terms';
import { sha256Hex } from './hash';
import { PROMPTS } from './prompts';
import { requestFor } from './specs';
import { SYNTHETIC_IDS, localGateway, registerOutput } from './testing';

/**
 * The test matrix's synthetic contract cases (fixtures/synthetic/MOD-01, MOD-02 and MOD-04, generated
 * by packages/synth) through the gateway on the local provider: each agreement's pages as intake stores
 * their text, and for MOD-01 and MOD-02 the answer the case's proposal.json records, written in the
 * prompt's schema. Each case's own expected.json says what must happen. SYNTHETIC only.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');
const BANNER = 'SYNTHETIC CONTRACT EXHIBIT - INVENTED TERMS - NOT A REAL AGREEMENT';

const proposalFile = z.strictObject({
  synthetic: z.literal(true),
  purpose: z.literal('proposeContractTerms'),
  document: z.string(),
  fields: z.array(z.strictObject({ field: z.string(), value: z.string(), page: z.number().int().min(1), quote: z.string() })).min(1),
});
type FixtureField = z.output<typeof proposalFile>['fields'][number];

const expectedFile = z.looseObject({ case: z.string(), synthetic: z.literal(true), outcome: z.record(z.string(), z.unknown()) });

function read(caseId: string, file: string): string {
  return readFileSync(path.join(FIXTURES, caseId, file), 'utf8');
}

/** The agreement's pages, page 1 first: each page of the text starts with the synthetic banner. */
function agreement(caseId: string): ContractPagesInput {
  const text = read(caseId, 'agreement.txt');
  const pages = text
    .split(BANNER)
    .slice(1)
    .map((page) => `${BANNER}${page}`.trim());
  for (const [index, page] of pages.entries()) {
    if (!page.includes(`Page ${String(index + 1)} of ${String(pages.length)}`)) {
      throw new Error(`${caseId}: page ${String(index + 1)} of the agreement's text is not where its banner says`);
    }
  }
  return { documentId: SYNTHETIC_IDS.contract, documentSha256: sha256Hex(text), kind: 'contract', pages };
}

function proposal(caseId: string): FixtureField[] {
  return proposalFile.parse(JSON.parse(read(caseId, 'proposal.json'))).fields;
}

function expectation(caseId: string): Record<string, unknown> {
  const expected = expectedFile.parse(JSON.parse(read(caseId, 'expected.json')));
  expect(expected.case).toBe(caseId);
  return expected.outcome;
}

const cited = (field: FixtureField) => ({ page: field.page, quote: field.quote });
const written = (field: FixtureField | undefined) => (field === undefined ? null : { written: field.value, ...cited(field) });

function candidate(label: string, method: ContractTermsCandidate['method'], fields: Partial<ContractTermsCandidate>): ContractTermsCandidate {
  return {
    label,
    method,
    codes: null,
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
    ...fields,
  };
}

const CONTEXT = { practiceId: SYNTHETIC_IDS.practice, requestKey: 'synthetic-fixture-call' };

async function propose(input: ContractPagesInput, output: unknown) {
  const harness = localGateway();
  registerOutput(harness.local, 'proposeContractTerms', input, output);
  const result = await harness.gateway.proposeContractTerms(CONTEXT, input);
  expect(harness.store.calls).toHaveLength(1);
  return result;
}

function reviews(result: { readonly proposal: ContractTermsProposal | null }) {
  return (result.proposal?.candidates ?? []).flatMap((entry) => entry.fields);
}

describe('MOD-01: a contract proposal whose quotes all verify', () => {
  it('verifies every quote of the case’s proposal as a substring of its page, and proposes its rates as written', async () => {
    expect(expectation('MOD-01')).toEqual({ verifier: 'every quote is a substring of its page' });
    const input = agreement('MOD-01');
    const fields = proposal('MOD-01');
    const from = fields.find((field) => field.field === 'effective_from');
    const rates = fields.filter((field) => field.field.startsWith('rate.'));
    expect(rates).toHaveLength(2);
    const output = {
      candidates: rates.map((rate) => {
        const code = rate.field.slice('rate.'.length);
        return candidate(`Exhibit A, ${code}`, { value: 'FIXED_SCHEDULE', ...cited(rate) }, { codes: { written: [code], ...cited(rate) }, amount: written(rate), effective_from: written(from) });
      }),
    };
    const result = await propose(input, output);
    expect(result.passed).toBe(true);
    for (const review of reviews(result)) {
      expect(review.verified, review.field).toBe(true);
      expect(input.pages[review.page - 1]?.replace(/\s+/g, ' ')).toContain(review.quote.replace(/\s+/g, ' '));
    }
    expect(result.proposal?.candidates.map((entry) => entry.rateRecord?.parameters)).toEqual([{ amount_cents: '4310' }, { amount_cents: '3990' }]);
    expect(result.proposal?.candidates.map((entry) => entry.conflictsWith)).toEqual([[], []]);
  });
});

describe('MOD-02: a proposal with a date not in its quote', () => {
  it('rejects the date’s field and accepts the rest, as the case expects', async () => {
    const outcome = expectation('MOD-02') as { rejected: string[]; accepted: string[] };
    const input = agreement('MOD-02');
    const fields = proposal('MOD-02');
    const percentage = fields.find((field) => field.field === 'percentage');
    const to = fields.find((field) => field.field === 'effective_to');
    expect(percentage && to).toBeDefined();
    const output = {
      candidates: [candidate('Article 2', { value: 'PERCENT_OF_MEDICARE', ...cited(percentage as FixtureField) }, { percentage: written(percentage), effective_to: written(to) })],
    };
    const result = await propose(input, output);
    expect(result.passed).toBe(false);
    const byField = new Map(reviews(result).map((review) => [review.field as string, review]));
    for (const field of outcome.rejected) {
      expect(byField.get(field)?.verified, field).toBe(false);
      expect(byField.get(field)?.problems, field).toEqual(['not_in_quote']);
    }
    for (const field of outcome.accepted) {
      expect(byField.get(field)?.verified, field).toBe(true);
    }
    // A rejected field keeps the candidate from becoming a proposed rate record; the specialist sees why.
    expect(result.proposal?.candidates[0]?.rateRecord).toBeNull();
    expect(result.proposal?.candidates[0]?.problems).toContain('fields_rejected');
  });
});

describe('MOD-04: a document with embedded instructions', () => {
  const input = agreement('MOD-04');
  const exhibit = input.pages[2] ?? '';
  const exhibitLine = '97110  $43.10 per unit';
  const method = { value: 'FIXED_SCHEDULE' as const, page: 3, quote: exhibitLine };

  it('holds the instructions on its page, sent as data inside the frame with no tools', () => {
    expect(expectation('MOD-04')).toEqual({ proposal: 'rates still come only from Exhibit A and are verified against the page', authority: 'the embedded text approves nothing and changes no amount' });
    expect(input.pages[1]).toMatch(/SYNTHETIC INJECTED TEXT/);
    const request = requestFor('proposeContractTerms', input);
    expect(request.user.match(/<\/document>/g)).toHaveLength(1);
    expect(request.user.indexOf('SYNTHETIC INJECTED TEXT')).toBeGreaterThan(request.user.indexOf('<document'));
    expect(request).not.toHaveProperty('tools');
    expect(request.system).toBe(PROMPTS.proposeContractTerms.system);
  });

  it('proposes the rate from Exhibit A, verified against the page', async () => {
    expect(exhibit).toContain(exhibitLine);
    const output = { candidates: [candidate('Exhibit A, 97110', method, { codes: { written: ['97110'], page: 3, quote: exhibitLine }, amount: { written: '$43.10', page: 3, quote: exhibitLine } })] };
    const result = await propose(input, output);
    expect(result.passed).toBe(true);
    expect(result.proposal?.candidates[0]?.rateRecord).toMatchObject({ proposed_by: 'model', parameters: { amount_cents: '4310' } });
  });

  it('rejects an amount the embedded text asks for that Exhibit A does not write', async () => {
    const output = { candidates: [candidate('Exhibit A, 97110', method, { codes: { written: ['97110'], page: 3, quote: exhibitLine }, amount: { written: '999.00', page: 3, quote: exhibitLine } })] };
    const result = await propose(input, output);
    expect(result.passed).toBe(false);
    expect(reviews(result).find((review) => review.field === 'amount')?.problems).toEqual(['not_in_quote']);
    expect(result.proposal?.candidates[0]?.rateRecord).toBeNull();
  });

  it('gives an answer that marks itself approved no way to say so: the schema refuses it, and nothing is proposed', async () => {
    const output = { candidates: [], approved: true };
    await expect(propose(input, output)).resolves.toMatchObject({ passed: false, proposal: null, problems: ['invalid_output'] });
  });
});
