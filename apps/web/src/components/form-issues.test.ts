import { describe, expect, it } from 'vitest';

import { fieldName, summaryLead } from './form-issues';

/**
 * The name a refused form's summary gives each field, read from the label the person sees, and the summary's lead
 * (test matrix FRM-04; docs/adr/0077, D3). The browser behaviour is action-form.browser.test.tsx's.
 */

describe('a field’s name in the summary (FRM-04)', () => {
  it('drops one trailing parenthetical, whatever note it holds', () => {
    for (const [label, name] of [
      ['Billing ZIP (ZIP+4 if Medicare needs one)', 'Billing ZIP'],
      ['NPI (optional)', 'NPI'],
      ['Tax ID, last four (optional)', 'Tax ID, last four'],
      ['Why (for “Other” only)', 'Why'],
      ['Per line (dollars)', 'Per line'],
      ['Carrier (when named)', 'Carrier'],
      ['Pursuit cost (estimate)', 'Pursuit cost'],
      ['Deadline (earliest open window)', 'Deadline'],
      ['Policy (for an approval)', 'Policy'],
      ['Notice before an anniversary (days)', 'Notice before an anniversary'],
      ['Mailing address (optional: all of street, city, state and ZIP, or none)', 'Mailing address'],
      ['Prompt-pay state (interest, its own line)', 'Prompt-pay state'],
    ] as const) {
      expect(fieldName(label), label).toBe(name);
    }
  });

  it('drops only the last of two parentheticals, and none that is not at the end', () => {
    expect(fieldName('Amount (dollars) (optional)')).toBe('Amount (dollars)');
    expect(fieldName('The (first) day')).toBe('The (first) day');
  });

  it('keeps a parenthetical that says posted or deposited, which "recovered" must carry', () => {
    expect(fieldName('Recovered principal, net (posted)')).toBe('Recovered principal, net (posted)');
    expect(fieldName('Recovered principal, net (deposited)')).toBe('Recovered principal, net (deposited)');
    expect(fieldName('Recovered (posted or deposited)')).toBe('Recovered (posted or deposited)');
  });

  it('collapses white space and drops a trailing colon, before or after the note', () => {
    expect(fieldName('  Last\n   day  ')).toBe('Last day');
    expect(fieldName('Reason:')).toBe('Reason');
    expect(fieldName('First day (optional):')).toBe('First day');
    expect(fieldName('Components affected')).toBe('Components affected');
  });
});

describe('the summary’s lead (FRM-04)', () => {
  const invalid = (fields: readonly string[]) => ({
    error: 'Fix the fields listed here, then try again.',
    invalid: true,
    issues: fields.map((field) => ({ field, message: 'a rule' })),
  });

  it('is singular for one field placed, plural for several, and absent when none is', () => {
    expect(summaryLead(invalid(['zip']), 1)).toBe('Fix the field listed here, then try again.');
    expect(summaryLead(invalid(['name', 'phone']), 2)).toBe('Fix the fields listed here, then try again.');
    // Issues on hidden fields or record keys (the run an Accept button carries, a pattern): they stand alone.
    expect(summaryLead(invalid(['runId']), 0)).toBeNull();
    expect(summaryLead(invalid(['pattern', 'zip']), 1)).toBe('Fix the field listed here, then try again.');
  });

  it('counts, before the page is read, every issue whose key is neither input nor requestKey', () => {
    expect(summaryLead(invalid(['zip']), null)).toBe('Fix the field listed here, then try again.');
    expect(summaryLead(invalid(['input']), null)).toBeNull();
    expect(summaryLead(invalid(['input', 'requestKey', 'name']), null)).toBe('Fix the field listed here, then try again.');
    expect(summaryLead(invalid(['name', 'email', 'input']), null)).toBe('Fix the fields listed here, then try again.');
  });

  it('is every other error as the action gave it, and none without an error', () => {
    expect(summaryLead({ error: 'Not available to your role: mapping.edit.' }, 0)).toBe('Not available to your role: mapping.edit.');
    expect(summaryLead({ error: 'That did not match.', issues: [{ field: 'code', message: 'enter the code your authenticator app shows now' }] }, 1)).toBe('That did not match.');
    expect(summaryLead({ error: 'Fix the fields listed here, then try again.', invalid: true, issues: [] }, 0)).toBe('Fix the fields listed here, then try again.');
    expect(summaryLead({}, 1)).toBeNull();
  });
});
