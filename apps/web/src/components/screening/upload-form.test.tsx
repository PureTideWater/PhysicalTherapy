import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { ActionState } from '../../lib/http/next';
import { ScreeningUploadForm } from './upload-form';

/**
 * The screening's upload form as the server renders it (CO-04; decisions D18 a, D20 a and D21 a): the file is read in
 * the browser, so its input has no name and no submission can carry it; no ZIP+4 is asked for (the pricing cannot use
 * one); the contact's email is where the link goes; and it says, in plain words, that a row of fewer than 11 claim
 * lines is left out and that denied lines stay out of every total (the founder's rulings of 2026-10-18). SYNTHETIC
 * values.
 */

const action = (state: ActionState): Promise<ActionState> => Promise.resolve(state);

describe('the screening upload form', () => {
  const html = renderToStaticMarkup(<ScreeningUploadForm action={action} states={[{ value: 'MN', label: 'MN' }]} maxRows={50_000} minClaimLines={11} serverTime="2026-10-18T12:00:00.000Z" />);

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

  it('asks who the screening is for, and where its link is emailed, never for a ZIP+4 it could not use, and says so', () => {
    for (const name of ['practiceName', 'state', 'zip', 'contactEmail']) {
      expect(html).toContain(`name="${name}"`);
    }
    expect(html).not.toContain('name="zipPlusFour"');
    expect(html).toContain('a ZIP code that spans two Medicare localities cannot be screened yet');
    expect(html).toContain('<option value="">Choose a state</option>');
    expect(html).toContain('<option value="MN">MN</option>');
    expect(html).toContain('50,000 rows');
  });

  it('says what it refuses and offers the template, never words a screening does not use', () => {
    expect(html).toContain('No names, dates of birth, member IDs, dates of service or claim numbers');
    expect(html).toContain('Download the column template');
    expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(/\b(?:owed|under-?paid|recovered)\b/i);
  });

  it('says, in plain words, that a row of fewer than 11 claim lines is left out, that denied lines stay out of every total, and that the template’s first lines say so', () => {
    const text = html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(text).toContain('a row of fewer than 11 claim lines is left out, so that no row can describe one patient’s care');
    expect(text).toContain('The template’s first lines state its rules: each row sums at least 11 claim lines, and denied lines are left out of every total and claim count.');
    expect(text).toContain('this page skips them, so you can keep them');
    expect(html).toMatch(/aria-describedby="screening-template-rules"/);
  });
});
