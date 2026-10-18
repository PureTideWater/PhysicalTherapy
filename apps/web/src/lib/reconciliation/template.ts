import { BUILT_IN_POSTING_TEMPLATES, DATE_FORMATS, POSTING_FIELDS, type PostingField, type PostingTemplate, REQUIRED_POSTING_FIELDS, templateProblems } from '@tp/ledger';
import { z } from 'zod';

import type { Issue } from '../http/route';

/**
 * The posting-template mapping form (PRD 20: "one per practice-management system, mapped at
 * onboarding"; PRD 13, Matching step 2; docs/adr/0043): a built-in template, or the practice's own
 * mapping of its system's columns (a header for each field, how dates are written, the system's name).
 * The mapping is previewed in the browser on a sample the person chooses, which never leaves it; the
 * form carries the mapping alone. Pure, safe to import in the browser.
 */

export const OWN_TEMPLATE = 'practice';

/** The form's field for the column of each posting field. */
export const columnField = (field: PostingField) => `column_${field}`;

const header = z.string().trim().max(100, 'a header of at most 100 characters').optional();

export const templateForm = z.object({
  template: z.enum([OWN_TEMPLATE, ...BUILT_IN_POSTING_TEMPLATES.map((template) => template.id)]),
  system: z.string().trim().max(100, 'at most 100 characters').optional(),
  date_format: z.enum(DATE_FORMATS).optional(),
  ...Object.fromEntries(POSTING_FIELDS.map((field) => [columnField(field), header])),
});

export type TemplateForm = z.infer<typeof templateForm>;

/** Words for each field, the same in the form and the preview. */
export const FIELD_LABELS: Readonly<Record<PostingField, string>> = {
  posted_on: 'Posting date',
  check_or_trace: 'Check or EFT trace number',
  amount: 'Amount posted',
  payer: 'Payer',
  claim_reference: 'Claim reference (patient control number)',
  procedure_code: 'Procedure code',
  service_date: 'Date of service',
  batch: 'Batch',
};

/** The template a filled form names, or the form's problems by field. */
export function templateOf(form: TemplateForm): { readonly template: PostingTemplate } | { readonly issues: Issue[] } {
  const builtIn = BUILT_IN_POSTING_TEMPLATES.find((template) => template.id === form.template);
  if (builtIn !== undefined) {
    return { template: builtIn };
  }
  const issues: Issue[] = [];
  const system = form.system ?? '';
  if (system === '') {
    issues.push({ field: 'system', message: 'name the practice-management system the export comes from' });
  }
  const dateFormat = form.date_format;
  if (dateFormat === undefined) {
    issues.push({ field: 'date_format', message: 'choose how the export writes dates' });
  }
  const columns: Partial<Record<PostingField, string>> = {};
  const values = form as Readonly<Record<string, string | undefined>>;
  for (const field of POSTING_FIELDS) {
    const value = values[columnField(field)] ?? '';
    if (value !== '') {
      columns[field] = value;
    } else if (REQUIRED_POSTING_FIELDS.includes(field)) {
      issues.push({ field: columnField(field), message: `choose the column that holds the ${FIELD_LABELS[field].toLowerCase()}` });
    }
  }
  if (issues.length > 0 || dateFormat === undefined) {
    return { issues };
  }
  const template: PostingTemplate = { id: OWN_TEMPLATE, system, columns, dateFormat };
  const problems = templateProblems(template, POSTING_FIELDS, REQUIRED_POSTING_FIELDS);
  return problems.length === 0 ? { template } : { issues: problems.map((message) => ({ field: 'template', message })) };
}
