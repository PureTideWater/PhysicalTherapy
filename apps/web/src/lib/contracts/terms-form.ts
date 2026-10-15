import { MoneyError, centsToString, parseAmount } from '@tp/money';

import type { Issue } from '../http/route';

/**
 * Manual abstraction (PRD 5, J5: "in v0 the specialist abstracts it by hand into rate records with
 * page references"): the specialist's form fields, as text, turned into a rate record's terms in the
 * form packages/contracts accepts (rateTermsInputSchema: cents as integer text, a percentage as decimal
 * text, flags left out are off). Amounts are read as dollars with at most two places and become cents
 * without a float. Every problem is returned with the form field it belongs to; packages/contracts then
 * validates the terms themselves.
 */

export interface TermsFormFields {
  readonly method: string;
  readonly codes: string;
  readonly modifierSets?: string;
  readonly placesOfService?: string;
  readonly scopeFrom?: string;
  readonly scopeLastDay?: string;
  readonly amount?: string;
  readonly percentage?: string;
  readonly yearBasis?: string;
  readonly lockedYear?: string;
  readonly localityBasis?: string;
  readonly carrier?: string;
  readonly locality?: string;
  readonly conversionFactor?: string;
  readonly scheduleMethod?: string;
  readonly applyMppr?: string;
  readonly applyAssistantReduction?: string;
  readonly applySequestration?: string;
  readonly applyNcci?: string;
  readonly timedUnitsRule?: string;
  readonly rounding?: string;
}

type Json = string | boolean | readonly Json[] | { readonly [key: string]: Json | undefined };

export type TermsFromForm = { readonly ok: true; readonly terms: Readonly<Record<string, Json | null>> } | { readonly ok: false; readonly issues: readonly Issue[] };

function words(text: string | undefined, separator: RegExp): string[] {
  return (text ?? '')
    .split(separator)
    .map((part) => part.trim().toUpperCase())
    .filter((part) => part !== '');
}

/** "GP; GP 59; none": each set separated by a semicolon, its modifiers by spaces or commas; "none" is the empty set. */
export function modifierSets(text: string | undefined): string[][] | undefined {
  const sets = (text ?? '')
    .split(';')
    .map((set) => set.trim())
    .filter((set) => set !== '');
  if (sets.length === 0) {
    return undefined;
  }
  return sets.map((set) => (set.toLowerCase() === 'none' ? [] : words(set, /[\s,]+/)));
}

/** The day after a last day (the scope's exclusive end). */
function dayAfter(lastDay: string): string {
  const next = new Date(`${lastDay}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The rate record's terms from the specialist's form, or the fields that need fixing. */
export function termsFromForm(fields: TermsFormFields): TermsFromForm {
  const issues: Issue[] = [];
  const scope: Record<string, Json> = { codes: words(fields.codes, /[\s,]+/) };
  const sets = modifierSets(fields.modifierSets);
  if (sets !== undefined) {
    scope.modifier_sets = sets;
  }
  const places = words(fields.placesOfService, /[\s,]+/);
  if (places.length > 0) {
    scope.places_of_service = places;
  }
  for (const [field, value] of [
    ['scopeFrom', fields.scopeFrom],
    ['scopeLastDay', fields.scopeLastDay],
  ] as const) {
    if (value !== undefined && value !== '' && !DATE.test(value)) {
      issues.push({ field, message: 'a date (YYYY-MM-DD)' });
    }
  }
  if (fields.scopeFrom !== undefined && DATE.test(fields.scopeFrom)) {
    scope.effective_from = fields.scopeFrom;
  }
  if (fields.scopeLastDay !== undefined && DATE.test(fields.scopeLastDay)) {
    scope.effective_to = dayAfter(fields.scopeLastDay);
  }

  const amount = (): string | undefined => {
    try {
      const cents = parseAmount((fields.amount ?? '').trim().replace(/^\$/, '').replaceAll(',', ''));
      if (cents < 0n) {
        issues.push({ field: 'amount', message: 'an amount of zero or more' });
        return undefined;
      }
      return centsToString(cents);
    } catch (error) {
      if (error instanceof MoneyError) {
        issues.push({ field: 'amount', message: 'dollars and cents, such as 32.00' });
        return undefined;
      }
      throw error;
    }
  };
  const percent = (): Record<string, Json> => {
    const yearBasis = fields.yearBasis === 'LOCKED' ? `LOCKED:${(fields.lockedYear ?? '').trim()}` : 'CURRENT';
    const locality: Record<string, Json> =
      fields.localityBasis === 'NAMED' ? { kind: 'NAMED', carrier: (fields.carrier ?? '').trim(), locality: (fields.locality ?? '').trim() } : { kind: 'PRACTICE' };
    return {
      percentage: (fields.percentage ?? '').trim().replace(/%$/, ''),
      year_basis: yearBasis,
      locality_basis: locality,
      conversion_factor: fields.conversionFactor === 'qualifying_apm' ? 'qualifying_apm' : 'non_qualifying_apm',
    };
  };

  let parameters: Record<string, Json> = {};
  switch (fields.method) {
    case 'FIXED_SCHEDULE':
    case 'PER_VISIT': {
      const cents = amount();
      parameters = cents === undefined ? {} : { amount_cents: cents };
      break;
    }
    case 'PERCENT_OF_MEDICARE':
      parameters = percent();
      break;
    case 'LESSER_OF': {
      if (fields.scheduleMethod === 'PERCENT_OF_MEDICARE') {
        parameters = { schedule: { method: 'PERCENT_OF_MEDICARE', ...percent() }, charge_basis: 'LINE_CHARGE' };
      } else {
        const cents = amount();
        parameters = { schedule: { method: 'FIXED_SCHEDULE', ...(cents === undefined ? {} : { amount_cents: cents }) }, charge_basis: 'LINE_CHARGE' };
      }
      break;
    }
    case 'UNSUPPORTED':
      break;
    default:
      issues.push({ field: 'method', message: 'one of the rate methods' });
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  const on = (value: string | undefined) => value === 'on' || value === 'true';
  return {
    ok: true,
    terms: {
      scope,
      method: fields.method,
      parameters,
      flags: {
        apply_mppr: on(fields.applyMppr),
        apply_assistant_reduction: on(fields.applyAssistantReduction),
        apply_sequestration: on(fields.applySequestration),
        apply_ncci: on(fields.applyNcci),
        timed_units_rule: fields.timedUnitsRule === 'MEDICARE_POOLED' || fields.timedUnitsRule === 'PER_CODE' ? fields.timedUnitsRule : 'UNKNOWN',
      },
      rounding: fields.rounding === 'HALF_UP_CENT' || fields.rounding === 'HALF_EVEN_CENT' || fields.rounding === 'TRUNCATE' ? fields.rounding : null,
    },
  };
}
