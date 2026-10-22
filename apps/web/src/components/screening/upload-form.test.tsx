import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { ActionState } from '../../lib/http/next';
import { PROSPECT_SOURCE_OPTIONS } from '../../lib/routes/onboarding';
import { ABOUT_PRACTICE, UPLOAD_EMAIL_HINT } from '../../lib/screening/retention';
import { ScreeningUploadForm, ZIP_HINT } from './upload-form';

/**
 * The screening's upload form as the server renders it (CO-04; decisions D18 a, D20 a and D21 a): the file is read in
 * the browser, so its input has no name and no submission can carry it; the ZIP code field takes five digits or ZIP+4,
 * asked for only where Medicare splits the ZIP code (PR 6b; docs/adr/0064); the contact's email is where the link goes; and it says, in plain words, that a row of fewer than 11 claim
 * lines is left out and that denied lines stay out of every total (the founder's rulings of 2026-10-18); and, from the
 * founder's rulings of 2026-10-20 (audit #57), it asks how the practice heard of us and which firm referred it, both
 * optional, and says what is deleted and what is kept. SYNTHETIC values.
 */

const action = (state: ActionState): Promise<ActionState> => Promise.resolve(state);

describe('the screening upload form', () => {
  const html = renderToStaticMarkup(
    <ScreeningUploadForm
      action={action}
      states={[{ value: 'MN', label: 'MN' }]}
      maxRows={50_000}
      minClaimLines={11}
      serverTime="2026-10-18T12:00:00.000Z"
      contentQuarters={[{ from: '2026-Q1', to: '2026-Q4' }]}
      sources={PROSPECT_SOURCE_OPTIONS}
    />,
  );
  const plain = html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  it('reads the file in the browser: its input has no name, so no submission carries it', () => {
    const file = /<input[^>]*type="file"[^>]*>/.exec(html)?.[0] ?? '';
    expect(file).toContain('id="screening-file"');
    expect(file).not.toContain('name=');
    expect(html).toContain('<label data-slot="label" class');
    expect(html).toContain('for="screening-file"');
    // The form itself posts nothing by default: the browser screens the file and builds the request.
    expect(html).not.toMatch(/<form[^>]*\baction=/);
    expect(html).not.toContain('enctype="multipart/form-data"');
  });

  it('asks who the screening is for, and where its link is emailed, with one ZIP code field that takes ZIP+4 (PR 6b)', () => {
    for (const name of ['practiceName', 'state', 'zip', 'contactEmail']) {
      expect(html).toContain(`name="${name}"`);
    }
    expect(html).not.toContain('name="zipPlusFour"');
    const zip = /<input[^>]*name="zip"[^>]*>/.exec(html)?.[0] ?? '';
    expect(zip).toContain('maxLength="10"');
    expect(zip).toContain('pattern="[0-9]{5}(-?[0-9]{4})?"');
    expect(zip).toContain('aria-describedby="field-zip-hint"');
    expect(ZIP_HINT).toBe('Five digits, or ZIP+4 if you know it. A few ZIP codes span two Medicare payment areas; for those we ask for the ZIP+4.');
    expect(plain).toContain(ZIP_HINT);
    expect(plain).not.toContain('cannot be screened yet');
    // One screening a practice: a later one replaces it, so two are never held to be subtracted.
    expect(html).toContain('A practice keeps one screening at a time: a later one for the same practice name and ZIP code, or from the same email address, replaces it, and the earlier link stops opening it.');
    expect(html).toContain('<option value="">Choose a state</option>');
    expect(html).toContain('<option value="MN">MN</option>');
    expect(html).toContain('50,000 rows');
  });

  it('asks, both optional, how the practice heard of us (the closed list) and which firm referred it, and says what is deleted and what is kept (audit #57)', () => {
    expect(html).toMatch(/<select id="field-heardFrom" name="heardFrom" class/);
    expect(html).not.toMatch(/<select[^>]*name="heardFrom"[^>]*required/);
    expect(html).toContain('<option value="">Choose one (optional)</option>');
    expect(html).toContain('<option value="billing_firm">My billing firm</option>');
    expect(html).toContain('<option value="association">A professional association (APTA, AOTA, ASHA or a state chapter)</option>');
    expect(html.match(/<option value="[a-z_]+">/g)?.length).toBe(9);
    const firm = /<input[^>]*name="referringFirm"[^>]*>/.exec(html)?.[0] ?? '';
    expect(firm).toContain('maxLength="200"');
    expect(firm).not.toContain('required');
    expect(plain).toContain(UPLOAD_EMAIL_HINT);
    expect(UPLOAD_EMAIL_HINT).toContain('keep a record of counts that names no one');
    // What happens if the practice has, or asks for, an audit, without saying whether it has (decision 17).
    expect(UPLOAD_EMAIL_HINT).toContain('If an audit is requested from the screening, or was requested from an earlier screening with the same practice name and ZIP code');
    expect(plain).toContain(ABOUT_PRACTICE);
  });

  it('says what it refuses and offers the template, never words a screening does not use', () => {
    expect(html).toContain('No names, dates of birth, member IDs, dates of service or claim numbers');
    expect(html).toContain('Download the column template');
    expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(/\b(?:owed|under-?paid|recovered)\b/i);
  });

  it('says, in plain words, that a row of fewer than 11 claim lines is left out, that denied lines stay out of every total, and that the template’s first lines say so', () => {
    const text = html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(text).toContain('a row of fewer than 11 claim lines is left out, because it can describe one patient’s care');
    // The form says the risk the floor answers, never that no row can describe one patient.
    expect(text).not.toMatch(/no row can describe|no row could describe/);
    expect(text).toContain('The template’s first lines state its rules: each row sums at least 11 claim lines, and denied lines are left out of every total and claim count.');
    expect(text).toContain('this page skips them, so you can keep them');
    expect(html).toMatch(/aria-describedby="screening-template-rules"/);
  });
});
