/**
 * Synthetic contract exhibits for the contract, pricing and model-gateway cases: invented parties,
 * dates and rates, laid out over pages so a rate record can cite a page and quote it. The wording of
 * the compensation clauses follows the examples in docs/product/rules-reference.md ("Typical wording
 * the specialist looks for").
 */
import { type Cents, formatCents } from '@tp/money';

import { type CalendarDate } from '../core/dates';
import { type Exhibit, type ExhibitPage, exhibitPdf, exhibitText } from '../formats/exhibit';
import { type CaseBuilder } from './builder';

export interface FeeRow {
  readonly code: string;
  readonly modifiers?: string;
  readonly amount: Cents;
}

export interface ContractSpec {
  readonly title: string;
  readonly payerName: string;
  readonly providerName: string;
  readonly version: string;
  readonly effectiveFrom: CalendarDate;
  readonly effectiveTo?: CalendarDate;
  /** The compensation clause, one sentence per line. */
  readonly compensation: readonly string[];
  readonly feeSchedule?: readonly FeeRow[];
  readonly timelyFilingDays?: number;
  readonly disputeWindowDays?: number;
  /** Extra lines on the compensation page (for example an embedded instruction, test matrix MOD-04). */
  readonly extraCompensationLines?: readonly string[];
  readonly status?: string;
}

export function feeLine(row: FeeRow): string {
  return `${row.code}${row.modifiers === undefined ? '' : ` ${row.modifiers}`}  $${formatCents(row.amount)} per unit`;
}

export function contractExhibit(spec: ContractSpec): Exhibit {
  const pages: ExhibitPage[] = [
    {
      heading: 'Article 1. Parties and term',
      lines: [
        `This SYNTHETIC agreement is between ${spec.payerName} ("Payer") and ${spec.providerName} ("Provider").`,
        `Version ${spec.version}${spec.status === undefined ? '' : ` (${spec.status})`}.`,
        `This version is effective ${spec.effectiveFrom}${spec.effectiveTo === undefined ? ' and continues until amended' : ` through ${spec.effectiveTo}`}.`,
        `Provider shall submit claims within ${String(spec.timelyFilingDays ?? 180)} days of the date of service.`,
        `Provider may dispute a payment within ${String(spec.disputeWindowDays ?? 120)} days of the remittance date.`,
      ],
    },
    {
      heading: 'Article 2. Compensation',
      lines: [...spec.compensation, ...(spec.extraCompensationLines ?? [])],
    },
  ];
  if (spec.feeSchedule && spec.feeSchedule.length > 0) {
    pages.push({ heading: 'Exhibit A. Fee schedule', lines: ['Code  Amount', ...spec.feeSchedule.map((row) => feeLine(row))] });
  }
  return { title: spec.title, pages };
}

/** Writes the exhibit as text and as a PDF beside it. */
export function addExhibit(b: CaseBuilder, name: string, spec: ContractSpec, description: string): Exhibit {
  const exhibit = contractExhibit(spec);
  b.addFile(`${name}.txt`, exhibitText(exhibit), 'text', `${description} (text; pages separated by form feeds).`);
  b.addFile(`${name}.pdf`, exhibitPdf(exhibit), 'pdf', `${description} (PDF, the same pages).`);
  return exhibit;
}

/** The lines of page `page` (from 1) as both renderings carry them, banner and heading included. */
export function pageText(exhibit: Exhibit, page: number): string {
  const found = exhibit.pages[page - 1];
  if (!found) {
    throw new Error(`no page ${String(page)}`);
  }
  return [found.heading, ...found.lines].join('\n');
}
