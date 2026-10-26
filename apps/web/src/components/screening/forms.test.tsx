import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { ActionState } from '../../lib/http/next';
import { ScreeningConvertForm } from './convert-form';
import { ScreeningSplitForm, splitCodes, splitFaults, splitSettings } from './split-form';

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
    const html = renderToStaticMarkup(<ScreeningConvertForm action={action} resultId={TOKEN} arrangements={ARRANGEMENTS} requested={false} converted={false} keptWith="none" />);
    for (const name of ['contactName', 'locations', 'payers', 'billingArrangement']) {
      expect(html).toContain(`name="${name}"`);
    }
    expect(html).toContain(`<input type="hidden" name="resultId" value="${TOKEN}"/>`);
    expect(html).not.toContain('name="contactEmail"');
    expect(html).not.toContain('name="organizationName"');
    expect(html).toContain('Request an audit');
  });

  it('says what the request keeps: the screening’s summary, or, when that is already kept with an earlier request of the practice, that it has none of its own', () => {
    const own = renderToStaticMarkup(<ScreeningConvertForm action={action} resultId={TOKEN} arrangements={ARRANGEMENTS} requested={false} converted={false} keptWith="none" />);
    expect(own).toContain('data-legal-surface="screening-kept-convert"');
    expect(own).toContain('with your request for 12 months from the screening');
    const carried = renderToStaticMarkup(<ScreeningConvertForm action={action} resultId={TOKEN} arrangements={ARRANGEMENTS} requested={false} converted={false} keptWith="earlier_request" />);
    expect(carried).toContain('already kept with an audit request made from an earlier screening of this practice');
    expect(carried).toContain('with no summary of its own');
  });

  it('says the request was received once sent, and does not ask twice', () => {
    const sent = renderToStaticMarkup(<ScreeningConvertForm action={action} resultId={TOKEN} arrangements={ARRANGEMENTS} requested converted keptWith="own_request" />);
    expect(sent).toContain('Audit request received');
    expect(sent).not.toContain('<form');
    const before = renderToStaticMarkup(<ScreeningConvertForm action={action} resultId={TOKEN} arrangements={ARRANGEMENTS} requested={false} converted keptWith="own_request" />);
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

  it('says which list each problem concerns: a malformed code its own list, a code in both lists both, no code the facility list', () => {
    expect(splitFaults('22', '11')).toEqual({ facility: false, nonFacility: false });
    expect(splitFaults('22', '1a')).toEqual({ facility: false, nonFacility: true });
    expect(splitFaults('x', '11')).toEqual({ facility: true, nonFacility: false });
    expect(splitFaults('11 22', '11')).toEqual({ facility: true, nonFacility: true });
    expect(splitFaults('', '')).toEqual({ facility: true, nonFacility: false });
  });

  it('holds its status region from the first render, empty until the lists have a problem, and marks the field at fault', () => {
    const keys = <input type="hidden" name="requestKey" value="k" />;
    const empty = renderToStaticMarkup(<ScreeningSplitForm action={action} facility="" nonFacility="" formKeys={keys} />);
    expect(empty).toContain('<div id="split-problems" role="status"></div>');
    expect(empty).not.toContain('aria-invalid="');
    const both = renderToStaticMarkup(<ScreeningSplitForm action={action} facility="11" nonFacility="11" formKeys={keys} />);
    expect(both).toContain('Place of service 11 is listed as both facility and non-facility.');
    expect(both).toMatch(/<div id="split-problems" role="status"><ul [^>]*data-state="split-problems"/);
    for (const id of ['split-facility', 'split-non-facility']) {
      const input = [...both.matchAll(/<input [^>]*>/g)].map((match) => match[0]).find((tag) => tag.includes(`id="${id}"`)) ?? '';
      expect(input).toContain('aria-invalid="true"');
      expect(input).toContain(`aria-describedby="split-problems ${id}-hint"`);
    }
  });

  it('places a server issue on the built split on the facility field', () => {
    const html = renderToStaticMarkup(<ScreeningSplitForm action={action} facility="22" nonFacility="11" formKeys={null} />);
    expect([...html.matchAll(/<input [^>]*>/g)].map((match) => match[0]).find((tag) => tag.includes('id="split-facility"'))).toContain('data-issue-for="settings"');
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
