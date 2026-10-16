import { readFileSync } from 'node:fs';
import path from 'node:path';

import { SYNTHETIC_PM_EXPORT_V1, readPostingExport } from '@tp/ledger';
import { describe, expect, it } from 'vitest';

import { templateForm, templateOf } from './template';

/** The posting-template mapping form (PRD 20; docs/adr/0043): a built-in template, or the practice's own mapping of its columns. */

const FIXTURES = path.resolve(import.meta.dirname, '../../../../../fixtures/synthetic');

describe('the posting-template form', () => {
  it('names a built-in template by its ID alone', () => {
    expect(templateOf(templateForm.parse({ template: 'synthetic_pm_export_v1', system: 'ignored' }))).toEqual({ template: SYNTHETIC_PM_EXPORT_V1 });
  });

  it('maps the practice’s own columns, which read the export as the built-in template does', () => {
    const read = templateOf(
      templateForm.parse({
        template: 'practice',
        system: ' SYNTHETIC PM SYSTEM ',
        date_format: 'MM/DD/YYYY',
        column_posted_on: 'Post Date',
        column_check_or_trace: 'Check/EFT #',
        column_amount: 'Paid Amount',
        column_payer: '',
        column_batch: 'Batch',
      }),
    );
    expect(read).toEqual({ template: { id: 'practice', system: 'SYNTHETIC PM SYSTEM', columns: { posted_on: 'Post Date', check_or_trace: 'Check/EFT #', amount: 'Paid Amount', batch: 'Batch' }, dateFormat: 'MM/DD/YYYY' } });
    const text = readFileSync(path.join(FIXTURES, 'LED-04/posting-export.csv'), 'utf8');
    const own = 'template' in read ? readPostingExport(text, read.template) : null;
    expect(own).toMatchObject({ kind: 'read', rows: [{ checkOrTrace: '880060040002', amountCents: 3000n, postedOn: '2026-06-11', batch: 'SYNBATCH-0401' }] });
  });

  it('names each field a mapping lacks, and a mapping the ledger cannot use', () => {
    expect(templateOf(templateForm.parse({ template: 'practice' }))).toEqual({
      issues: [
        { field: 'system', message: 'name the practice-management system the export comes from' },
        { field: 'date_format', message: 'choose how the export writes dates' },
        { field: 'column_posted_on', message: 'choose the column that holds the posting date' },
        { field: 'column_check_or_trace', message: 'choose the column that holds the check or eft trace number' },
        { field: 'column_amount', message: 'choose the column that holds the amount posted' },
      ],
    });
    const twice = templateOf(templateForm.parse({ template: 'practice', system: 'S', date_format: 'YYYY-MM-DD', column_posted_on: 'Date', column_check_or_trace: 'Date', column_amount: 'Paid' }));
    expect(twice).toEqual({ issues: [{ field: 'template', message: 'each column holds one field' }] });
    expect(templateForm.safeParse({ template: 'not_a_template' }).success).toBe(false);
  });
});
