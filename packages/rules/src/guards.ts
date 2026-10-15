import { containsNumber } from './records';
import type { RuleRecord } from './schema';

/**
 * Two checks that keep invented or mistyped values out of rule content, shared by the importer and
 * the content checker.
 */

// ---------------------------------------------------------------------------------------------
// Reserved SYNTHETIC markers

/**
 * Identifiers that exist in no real CMS or X12 file and are reserved for SYNTHETIC fixtures
 * (fixtures/synthetic/cms/README.md): the carrier (MAC) 99999, the state ZZ and the ZIP codes 00000
 * to 00099. A record outside fixtures/ that carries one is a fixture that escaped, whatever its
 * source says.
 */
export const SYNTHETIC_CARRIER = '99999';
export const SYNTHETIC_STATE = 'ZZ';
const SYNTHETIC_ZIP = /^000\d\d$/;

/** The reserved SYNTHETIC markers a record's key and value carry; empty for real-looking data. */
export function syntheticMarkers(key: Readonly<Record<string, unknown>>, value: Readonly<Record<string, unknown>>): string[] {
  const markers: string[] = [];
  const fields: readonly [string, unknown][] = [
    ...Object.entries(key).map(([name, item]): [string, unknown] => [`key.${name}`, item]),
    ...Object.entries(value).map(([name, item]): [string, unknown] => [`value.${name}`, item]),
  ];
  for (const [name, item] of fields) {
    if (typeof item !== 'string') {
      continue;
    }
    const field = name.slice(name.indexOf('.') + 1);
    if (field === 'carrier' && item === SYNTHETIC_CARRIER) {
      markers.push(`${name} ${item} is the reserved SYNTHETIC carrier`);
    } else if (field === 'state' && item === SYNTHETIC_STATE) {
      markers.push(`${name} ${item} is the reserved SYNTHETIC state`);
    } else if (field === 'zip' && SYNTHETIC_ZIP.test(item)) {
      markers.push(`${name} ${item} is a reserved SYNTHETIC ZIP code (00000 to 00099)`);
    }
  }
  return markers;
}

// ---------------------------------------------------------------------------------------------
// Hand-typed values must appear in their quotes

/** "248000" cents as a person writes it: "$2,480", "$2,480.00", "$2480" or "$2480.00". */
export function dollarForms(centsText: string): string[] {
  const negative = centsText.startsWith('-');
  const digits = negative ? centsText.slice(1) : centsText;
  const whole = digits.length > 2 ? digits.slice(0, -2) : '0';
  const fraction = digits.padStart(3, '0').slice(-2);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = negative ? '-' : '';
  const forms = fraction === '00' ? [`$${grouped}`, `$${whole}`, `$${grouped}.00`, `$${whole}.00`] : [`$${grouped}.${fraction}`, `$${whole}.${fraction}`];
  return [...new Set(forms.map((form) => `${sign}${form}`))];
}

/** "85" percent as a person writes it: "85%", "85 percent". */
export function percentForms(percentText: string): string[] {
  return [`${percentText}%`, `${percentText} percent`];
}

interface TypedValue {
  /** Path of the field, for messages ("value.kx_threshold_cents"). */
  readonly field: string;
  readonly forms: readonly string[];
}

/**
 * The money, percentage and day values of a record, each with the ways a source writes it. Money
 * fields end in `_cents`, percentages in `_percent`, and day or month counts are the integer fields
 * (`days_to_pay`, `length`, ...). Text, booleans and codes are not numbers a person retypes.
 */
export function typedValues(value: unknown, prefix = 'value'): TypedValue[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([name, item]): TypedValue[] => {
    const field = `${prefix}.${name}`;
    if (typeof item === 'string' && name.endsWith('_cents')) {
      return [{ field, forms: dollarForms(item) }];
    }
    if (typeof item === 'string' && name.endsWith('_percent')) {
      return [{ field, forms: percentForms(item) }];
    }
    if (typeof item === 'number' && Number.isInteger(item)) {
      return [{ field, forms: [String(item)] }];
    }
    return typedValues(item, field);
  });
}

/**
 * For a hand-typed record: each money, percentage or day value that appears, in a natural written
 * form and as a number of its own, in none of the record's quotes. A typo in the value (or a quote
 * that does not say the value) is caught here, because the quote itself must appear in the stored
 * source. Parsed records quote their source row instead and are not checked this way. A suspended
 * sequestration's 0% is not a figure the source states.
 */
export function unquotedValues(record: RuleRecord): string[] {
  if (record.source.method !== 'hand_typed') {
    return [];
  }
  const suspended = record.record_type === 'sequestration' && record.value.suspended;
  return typedValues(record.value)
    .filter((typed) => !(suspended && typed.field === 'value.reduction_percent'))
    .filter((typed) => !typed.forms.some((form) => record.quotes.some((quote) => containsNumber(quote, form))))
    .map((typed) => `${typed.field} does not appear in any quote (as ${typed.forms.map((form) => JSON.stringify(form)).join(' or ')})`);
}
