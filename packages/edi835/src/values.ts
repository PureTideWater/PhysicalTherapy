/**
 * Element values: the checks of PRD section 10, step 6 on one element's text, and the typed view of
 * a segment the transaction builder reads after its elements are checked. Amounts go through
 * @tp/money's `parseAmount` (a decimal with at most two places, to integer cents); quantities and
 * units stay exactly as written.
 */
import { type Cents, parseAmount } from '@tp/money';

import { type CodeListName, type CodeListProvider, type ExternalCodeList } from './code-lists';
import { type EdiError, type Position, type SyntaxReason, syntaxError, unknownCode } from './errors';
import { type ComponentSpec, type SegmentSpec } from './spec';
import { type Segment } from './tokenizer';

const DECIMAL = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;
const WHOLE = /^\d+$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function leap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** CCYYMMDD as an ISO date, or null when it is not a valid calendar date. */
export function isoDate(text: string): string | null {
  if (!/^\d{8}$/.test(text)) {
    return null;
  }
  const year = parseInt(text.slice(0, 4), 10);
  const month = parseInt(text.slice(4, 6), 10);
  const day = parseInt(text.slice(6, 8), 10);
  const days = month === 2 && leap(year) ? 29 : DAYS_IN_MONTH[month - 1];
  if (days === undefined || day < 1 || day > days) {
    return null;
  }
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

/** YYMMDD (ISA09) as a valid date in this century, or null. */
export function isoShortDate(text: string): string | null {
  return /^\d{6}$/.test(text) ? isoDate(`20${text}`) : null;
}

export function isDecimal(text: string): boolean {
  return DECIMAL.test(text);
}

/** A decimal above zero (service units). */
export function isPositiveDecimal(text: string): boolean {
  return DECIMAL.test(text) && !text.startsWith('-') && /[1-9]/.test(text);
}

/**
 * An unknown reason or remark code (CARC or RARC, the external lists a rule release carries): loaded
 * with this flag, never dropped (PRD section 10). A value outside one of the structure's own code sets
 * is not flagged: it holds the transaction set (EDI_SYNTAX invalid_code).
 */
export interface UnknownCode extends Position {
  readonly code: 'EDI_UNKNOWN_CODE';
  readonly list: ExternalCodeList;
  /** The code as sent (a reason or remark code, never a patient field). */
  readonly value: string;
  readonly message: string;
}

/** Where checks report: a hold (the transaction cannot load) or an unknown-code flag (it loads). */
export interface CheckSink {
  hold(error: EdiError): void;
  flag(code: UnknownCode): void;
}

export interface CheckContext {
  readonly codeLists: CodeListProvider;
  /** The date external code lists are checked on (the transaction's BPR16). */
  readonly codeDate: string;
  readonly sink: CheckSink;
}

/** A checked segment: typed accessors over its elements. */
export class Fields {
  private readonly amounts = new Map<number, Cents>();
  private readonly dates = new Map<number, string>();

  constructor(readonly segment: Segment) {}

  /** The element's text ('' when absent), components still joined. */
  raw(position: number): string {
    return this.segment.elements[position - 1] ?? '';
  }

  /** The element's text, or null when empty. */
  text(position: number): string | null {
    const value = this.raw(position);
    return value === '' ? null : value;
  }

  /** Every component of a composite element (trailing empty components kept as ''). */
  components(position: number): string[] {
    return this.raw(position).split(this.segment.delimiters.component);
  }

  /** One component, or null when empty. */
  component(position: number, component: number): string | null {
    const value = this.components(position)[component - 1] ?? '';
    return value === '' ? null : value;
  }

  /** A checked amount, or null when absent or invalid (an invalid one holds the transaction). */
  cents(position: number): Cents | null {
    return this.amounts.get(position) ?? null;
  }

  /** A checked date as ISO, or null when absent or invalid. */
  date(position: number): string | null {
    return this.dates.get(position) ?? null;
  }

  setAmount(position: number, value: Cents): void {
    this.amounts.set(position, value);
  }

  setDate(position: number, value: string): void {
    this.dates.set(position, value);
  }
}

function where(segment: Segment, elementPosition: number, componentPosition?: number): Position {
  return componentPosition === undefined
    ? { segmentIndex: segment.index, segmentId: segment.id, elementPosition }
    : { segmentIndex: segment.index, segmentId: segment.id, elementPosition, componentPosition };
}

export function flagUnknown(context: CheckContext, segment: Segment, list: ExternalCodeList, value: string, elementPosition: number, componentPosition?: number): void {
  if (!context.codeLists.has(list, value, context.codeDate)) {
    const position = where(segment, elementPosition, componentPosition);
    context.sink.flag({ ...unknownCode(position, list), code: 'EDI_UNKNOWN_CODE', list, value });
  }
}

/**
 * Checks a code against its list (PRD section 10, step 6): an unknown CARC or RARC loads flagged; a
 * value outside one of the structure's own sets (claim status, adjustment group, provider adjustment
 * reason, payment method, every qualifier) holds the transaction set at its position, as pyx12 does.
 */
export function checkCode(context: CheckContext, segment: Segment, list: CodeListName, value: string, elementPosition: number, componentPosition?: number): void {
  if (list === 'carc' || list === 'rarc') {
    flagUnknown(context, segment, list, value, elementPosition, componentPosition);
  } else if (!context.codeLists.has(list, value, context.codeDate)) {
    context.sink.hold(syntaxError(where(segment, elementPosition, componentPosition), 'invalid_code'));
  }
}

const KIND_REASON: Readonly<Record<'decimal' | 'units' | 'date' | 'date6' | 'number', SyntaxReason>> = {
  decimal: 'invalid_decimal',
  units: 'units_not_positive',
  date: 'invalid_date',
  date6: 'invalid_date',
  number: 'invalid_number',
};

/**
 * Checks a segment's elements against its spec: required elements present, no repeated element,
 * amounts, decimals, units, dates and whole numbers well formed, and codes in the structure's own
 * sets (each failure holds the transaction), and reason and remark codes known (each unknown one is
 * flagged). Returns the typed view.
 */
export function checkSegment(segment: Segment, spec: SegmentSpec, context: CheckContext): Fields {
  const fields = new Fields(segment);
  const { sink } = context;
  spec.forEach((element, index) => {
    const position = index + 1;
    const raw = fields.raw(position);
    if (element === null) {
      return;
    }
    if (raw === '') {
      if (element.required) {
        sink.hold(syntaxError(where(segment, position), 'missing_element'));
      }
      return;
    }
    if (segment.id !== 'ISA' && raw.includes(segment.delimiters.repetition)) {
      sink.hold(syntaxError(where(segment, position), 'element_repeats'));
      return;
    }
    switch (element.kind) {
      case 'composite':
        (element.components as readonly ComponentSpec[]).forEach((spec, componentIndex) => {
          const value = fields.component(position, componentIndex + 1);
          if (value === null) {
            if (spec.required) {
              sink.hold(syntaxError(where(segment, position, componentIndex + 1), 'missing_element'));
            }
          } else if (spec.list !== undefined) {
            checkCode(context, segment, spec.list, value, position, componentIndex + 1);
          }
        });
        return;
      case 'id':
        if (element.list !== undefined) {
          checkCode(context, segment, element.list, raw, position);
        }
        return;
      case 'text':
        return;
      case 'money':
        try {
          fields.setAmount(position, parseAmount(raw));
        } catch {
          sink.hold(syntaxError(where(segment, position), 'invalid_amount'));
        }
        return;
      case 'date':
      case 'date6': {
        const iso = element.kind === 'date' ? isoDate(raw) : isoShortDate(raw);
        if (iso === null) {
          sink.hold(syntaxError(where(segment, position), KIND_REASON[element.kind]));
        } else {
          fields.setDate(position, iso);
        }
        return;
      }
      case 'decimal':
      case 'units':
      case 'number': {
        const reason = !(element.kind === 'number' ? WHOLE.test(raw) : isDecimal(raw))
          ? KIND_REASON[element.kind === 'units' ? 'decimal' : element.kind]
          : element.kind === 'units' && !isPositiveDecimal(raw)
            ? KIND_REASON.units
            : null;
        if (reason !== null) {
          sink.hold(syntaxError(where(segment, position), reason));
        }
        return;
      }
    }
  });
  return fields;
}
