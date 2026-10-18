import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { ActionState } from '../../lib/http/next';
import { ScreeningConvertForm } from './convert-form';
import { ScreeningSplitForm, splitCodes, splitSettings } from './split-form';

/**
 * The screening's two forms (CO-04; decision D20 a): the conversion to an audit request, which asks only what the
 * screening does not already hold, and the contract specialist's place-of-service split, sent as one JSON object of
 * code to setting. SYNTHETIC values.
 */

const action = (state: ActionState): Promise<ActionState> => Promise.resolve(state);
const ARRANGEMENTS = [
  { value: 'in_house', label: 'In-house billing' },
  { value: 'billing_firm', label: 'A billing firm' },
];
const TOKEN = 'qwertyuiopasdfghjklzxcvbnmqwerty';

describe('the conversion form', () => {
  it('asks for the contact’s name, locations, payers and billing arrangement, and carries the result’s link token', () => {
    const html = renderToStaticMarkup(<ScreeningConvertForm action={action} resultId={TOKEN} arrangements={ARRANGEMENTS} requested={false} converted={false} />);
    for (const name of ['contactName', 'locations', 'payers', 'billingArrangement']) {
      expect(html).toContain(`name="${name}"`);
    }
    expect(html).toContain(`<input type="hidden" name="resultId" value="${TOKEN}"/>`);
    expect(html).not.toContain('name="contactEmail"');
    expect(html).not.toContain('name="organizationName"');
    expect(html).toContain('Request an audit');
  });

  it('says the request was received once sent, and does not ask twice', () => {
    const sent = renderToStaticMarkup(<ScreeningConvertForm action={action} resultId={TOKEN} arrangements={ARRANGEMENTS} requested converted />);
    expect(sent).toContain('Audit request received');
    expect(sent).not.toContain('<form');
    const before = renderToStaticMarkup(<ScreeningConvertForm action={action} resultId={TOKEN} arrangements={ARRANGEMENTS} requested={false} converted />);
    expect(before).toContain('An audit was requested from this screening');
    expect(before).not.toContain('<form');
  });
});

describe('the place-of-service split form', () => {
  it('reads two-digit codes, padding a one-digit code, and keeps each once in order', () => {
    expect(splitCodes('22, 21 21;2')).toEqual({ codes: ['02', '21', '22'], invalid: [] });
    expect(splitCodes('00 100 1a')).toEqual({ codes: [], invalid: ['00', '100', '1a'] });
  });

  it('builds the split as the server takes it: code to setting, in code order', () => {
    expect(splitSettings('22 21', '11, 12')).toEqual({ settings: JSON.stringify({ '11': 'non_facility', '12': 'non_facility', '21': 'facility', '22': 'facility' }) });
  });

  it('refuses a code in both lists, a malformed code and an empty split', () => {
    expect(splitSettings('11', '11')).toEqual({ problems: ['Place of service 11 is listed as both facility and non-facility.'] });
    expect(splitSettings('x', '')).toEqual({ problems: ['Each place of service is a two-digit code from 01 to 99.', 'List at least one place of service.'] });
    expect(splitSettings('', '')).toEqual({ problems: ['List at least one place of service.'] });
  });

  it('sends only the built split: the two lists have no name', () => {
    const html = renderToStaticMarkup(<ScreeningSplitForm action={action} facility="22" nonFacility="11" formKeys={<input type="hidden" name="requestKey" value="k" />} />);
    expect(html).toContain('<input type="hidden" name="requestKey" value="k"/>');
    expect(html).toContain(`name="settings" value="${JSON.stringify({ '11': 'non_facility', '22': 'facility' }).replace(/"/g, '&quot;')}"`);
    expect([...html.matchAll(/<input [^>]*>/g)].map((match) => match[0]).filter((input) => !input.includes('type="hidden"')).every((input) => !input.includes('name='))).toBe(true);
    expect(html).toContain('Facility places of service');
    expect(html).toContain('Approve this split');
  });
});
