'use client';

import { DATE_FORMATS, type DateFormat, POSTING_FIELDS, type PostingField, type PostingTemplate, REQUIRED_POSTING_FIELDS, exportColumns, readPostingExport } from '@tp/ledger';
import { formatUsd } from '@tp/money';
import { Label } from '@tp/ui';
import { type ChangeEvent, useMemo, useState } from 'react';

import { FIELD_LABELS, OWN_TEMPLATE, columnField } from '../../lib/reconciliation/template';

/**
 * The posting-template mapping, with its preview on a sample (PRD 20: "one per practice-management
 * system, mapped at onboarding"; docs/adr/0043). The person chooses a built-in template or maps their
 * system's columns: a sample export they choose is read here, in the browser, for its column headers and
 * a preview of the first rows as the template reads them (the same reader the reconcile uses,
 * @tp/ledger). The sample is never sent anywhere: its file input has no name, so the form carries the
 * mapping alone. A claim reference is shown only as present or not. A built-in template whose columns no
 * format description has confirmed yet (the vendor placeholders, docs/adr/0059) says so beside its name.
 */

const PREVIEW_ROWS = 10;
/** The most of a sample read: the header and the first rows are all the preview needs. */
const SAMPLE_BYTES = 256 * 1024;

export interface TemplateMapperProps {
  readonly builtIn: readonly PostingTemplate[];
  readonly current: PostingTemplate | null;
}

function sampleText(file: File): Promise<string> {
  return file.slice(0, SAMPLE_BYTES).text();
}

/** The whole lines of a sample cut at SAMPLE_BYTES: a row cut in two is left out. */
function wholeLines(text: string, cut: boolean): string {
  if (!cut) {
    return text;
  }
  const last = text.lastIndexOf('\n');
  return last === -1 ? text : text.slice(0, last + 1);
}

export function TemplateMapper({ builtIn, current }: TemplateMapperProps) {
  const own = current !== null && current.id === OWN_TEMPLATE ? current : null;
  const [choice, setChoice] = useState<string>(current?.id ?? builtIn[0]?.id ?? OWN_TEMPLATE);
  const [system, setSystem] = useState(own?.system ?? '');
  const [dateFormat, setDateFormat] = useState<DateFormat>(own?.dateFormat ?? 'MM/DD/YYYY');
  const [columns, setColumns] = useState<Partial<Record<PostingField, string>>>(own?.columns ?? {});
  const [sample, setSample] = useState<string | null>(null);
  const [sampleProblem, setSampleProblem] = useState<string | null>(null);

  const headers = useMemo(() => (sample === null ? null : exportColumns(sample)), [sample]);
  const template: PostingTemplate | null = useMemo(() => {
    if (choice !== OWN_TEMPLATE) {
      return builtIn.find((item) => item.id === choice) ?? null;
    }
    return { id: OWN_TEMPLATE, system: system.trim(), columns, dateFormat };
  }, [builtIn, choice, columns, dateFormat, system]);
  const preview = useMemo(() => {
    if (sample === null || template === null) {
      return null;
    }
    if (REQUIRED_POSTING_FIELDS.some((field) => (template.columns[field] ?? '') === '')) {
      return null;
    }
    return readPostingExport(sample, template);
  }, [sample, template]);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file === undefined) {
      setSample(null);
      return;
    }
    const text = wholeLines(await sampleText(file), file.size > SAMPLE_BYTES);
    const found = exportColumns(text);
    setSampleProblem(found === null || found.length === 0 ? 'That file is not a CSV with a header row.' : null);
    setSample(found === null ? null : text);
  }

  const options = headers ?? [];
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Template</legend>
        {builtIn.map((item) => (
          <label key={item.id} className="flex items-center gap-2 text-sm">
            <input type="radio" name="template" value={item.id} checked={choice === item.id} onChange={() => { setChoice(item.id); }} />
            {item.system} {item.status === 'unconfirmed' ? '(built in, format unconfirmed)' : '(built in)'}
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="template" value={OWN_TEMPLATE} checked={choice === OWN_TEMPLATE} onChange={() => { setChoice(OWN_TEMPLATE); }} />
          Our own practice-management system’s export
        </label>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="template-sample">A sample export, for the preview (read in this browser only, never uploaded)</Label>
        <input id="template-sample" type="file" accept=".csv,text/csv,text/plain" onChange={(event) => void choose(event)} className="text-sm" />
        {sampleProblem === null ? null : (
          <p className="text-sm text-destructive" data-state="sample-problem">
            {sampleProblem}
          </p>
        )}
      </div>

      {choice !== OWN_TEMPLATE ? null : (
        <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Column mapping">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="template-system">Practice-management system</Label>
            <input id="template-system" name="system" value={system} maxLength={100} required onChange={(event) => { setSystem(event.target.value); }} className="h-9 rounded-md border bg-background px-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="template-date-format">Dates are written</Label>
            <select id="template-date-format" name="date_format" value={dateFormat} onChange={(event) => { setDateFormat(event.target.value as DateFormat); }} className="h-9 rounded-md border bg-background px-2 text-sm">
              {DATE_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {format}
                </option>
              ))}
            </select>
          </div>
          {POSTING_FIELDS.map((field) => {
            const id = `template-${field}`;
            const value = columns[field] ?? '';
            const required = REQUIRED_POSTING_FIELDS.includes(field);
            return (
              <div key={field} className="flex flex-col gap-1.5">
                <Label htmlFor={id}>
                  {FIELD_LABELS[field]}
                  {required ? ' (required)' : ''}
                </Label>
                <select
                  id={id}
                  name={columnField(field)}
                  value={value}
                  required={required}
                  onChange={(event) => {
                    setColumns({ ...columns, [field]: event.target.value });
                  }}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">{required ? 'Choose a column' : 'Not in the export'}</option>
                  {[...new Set([...options, ...(value === '' ? [] : [value])])].map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}

      <section aria-label="Preview" className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Preview</h3>
        {sample === null ? (
          <p className="text-sm text-muted-foreground">Choose a sample export above to see how the template reads its first rows.</p>
        ) : preview === null ? (
          <p className="text-sm text-muted-foreground">Map the posting date, the check or trace number and the amount to see the preview.</p>
        ) : preview.kind === 'refused' ? (
          <p className="text-sm text-destructive" data-state="preview-refused">
            {preview.reason === 'missing_columns'
              ? `The sample has no column ${preview.missing.map((field) => `for the ${FIELD_LABELS[field as PostingField].toLowerCase()}`).join(', ')} as the template names it.`
              : 'The sample cannot be read as a CSV.'}
          </p>
        ) : (
          <>
            <p className="text-sm" data-state="preview">
              {preview.rows.length} {preview.rows.length === 1 ? 'row reads' : 'rows read'}; {preview.problems.length} {preview.problems.length === 1 ? 'row is' : 'rows are'} left out for an unreadable field.
            </p>
            <div className="overflow-x-auto">
              <table aria-label="Preview rows" className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-1 pr-3">Row</th>
                    <th className="py-1 pr-3">{FIELD_LABELS.posted_on}</th>
                    <th className="py-1 pr-3">{FIELD_LABELS.check_or_trace}</th>
                    <th className="py-1 pr-3 text-right">{FIELD_LABELS.amount}</th>
                    <th className="py-1 pr-3">{FIELD_LABELS.payer}</th>
                    <th className="py-1 pr-3">Claim reference</th>
                    <th className="py-1 pr-3">{FIELD_LABELS.batch}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, PREVIEW_ROWS).map((row) => (
                    <tr key={row.rowNo} className="border-b">
                      <td className="py-1 pr-3">{row.rowNo}</td>
                      <td className="py-1 pr-3">{row.postedOn}</td>
                      <td className="py-1 pr-3 font-mono">{row.checkOrTrace}</td>
                      <td className="py-1 pr-3 text-right font-mono tabular-nums">{formatUsd(row.amountCents)}</td>
                      <td className="py-1 pr-3">{row.payerName ?? '—'}</td>
                      <td className="py-1 pr-3">{row.claimReference === null ? 'none (check level)' : 'present (line level)'}</td>
                      <td className="py-1 pr-3">{row.batch ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.problems.length === 0 ? null : (
              <p className="text-sm text-muted-foreground">
                Left out: {preview.problems.slice(0, PREVIEW_ROWS).map((problem) => `row ${String(problem.rowNo)} (${FIELD_LABELS[problem.field as PostingField].toLowerCase()})`).join(', ')}.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
