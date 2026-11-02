import type { Cues } from './index';

/**
 * The cues of the terms a clause or a statute counts (./index.ts; docs/adr/0086): which day count a figure before
 * "days" is, and the words around the count, which page a page is, and which percentage a percentage is. Built anew on
 * each call, as every family of the reader's words is (./index.ts), and mutated in a shard of its own
 * (stryker/shards.json, packets-words-days).
 */
export function dayWords() {
  /** The day counts' cues: the one right after "days", else the nearest before the count since the figure before it. */
  const DAY_CUES: Cues = [
    ['within', ['window_days']],
    ['window', ['window_days']],
    ['dispute', ['window_days']],
    ['disputes', ['window_days']],
    ['disputed', ['window_days']],
    ['appeal', ['window_days']],
    ['appeals', ['window_days']],
    ['appealed', ['window_days']],
    ['file', ['window_days']],
    ['filed', ['window_days']],
    ['filing', ['window_days']],
    ['raise', ['window_days']],
    ['raised', ['window_days']],
    ['submit', ['window_days']],
    ['submitted', ['window_days']],
    ['deadline', ['window_days']],
    ['respond', ['window_days']],
    ['timely', ['window_days']],
    ['reconsideration', ['window_days']],
    ['redetermination', ['window_days']],
    ['to pay', ['days_to_pay']],
    ['pay within', ['days_to_pay']],
    ['pays within', ['days_to_pay']],
    ['paid within', ['days_to_pay']],
    ['payment within', ['days_to_pay']],
    ['must pay', ['days_to_pay']],
    ['requires payment', ['days_to_pay']],
    ['require payment', ['days_to_pay']],
    ['required payment', ['days_to_pay']],
    ['prompt pay', ['days_to_pay']],
    ['clean', ['days_to_pay']],
    ['late', ['days_late']],
    ['overdue', ['days_late']],
    ['past due', ['days_late']],
    ['unpaid', ['days_late']],
    ['accrue', ['days_late']],
    ['accrues', ['days_late']],
    ['accrued', ['days_late']],
    ['accruing', ['days_late']],
    ['interest', ['days_late']],
    ['between', ['days_late']],
    ['elapsed', ['days_late']],
    ['delay', ['days_late']],
    ['delayed', ['days_late']],
  ];
  /** Words after a day count's "days" that tie it to an event ("3650 days after payment"): those words are the count's, not a date's after it. */
  const DAY_ANCHORS = new Set(['after', 'of', 'from', 'following', 'since', 'before', 'past', 'beyond']);
  /** The kinds of day between a count and "days": "3650 calendar days", "10 business days". */
  const DAY_BASES = new Set(['calendar', 'business', 'working']);
  /**
   * The pages' cues: the dispute window's page or the contract clause's. A clause, a quote, a section or what is cited
   * may be either, so those are no cue (a page with no cue, or with cues of both, is either), and a word that names one
   * of them says which ("the dispute window clause").
   */
  const PAGE_CUES: Cues = [
    ['window', ['window_page']],
    ['dispute', ['window_page']],
    ['disputes', ['window_page']],
    ['appeal', ['window_page']],
    ['appeals', ['window_page']],
    ['deadline', ['window_page']],
    ['timely', ['window_page']],
    ['rate', ['citation_page']],
    ['rates', ['citation_page']],
    ['schedule', ['citation_page']],
    ['citation', ['citation_page']],
    ['amount', ['citation_page']],
    ['method', ['citation_page']],
    ['pays', ['citation_page']],
  ];
  /** The percentages' cues: the contract's percentage or the interest rate. */
  const PERCENT_CUES: Cues = [
    ['contract', ['contract_percent']],
    ['contracted', ['contract_percent']],
    ['agreement', ['contract_percent']],
    ['medicare', ['contract_percent']],
    ['fee schedule', ['contract_percent']],
    ['billed', ['contract_percent']],
    ['charges', ['contract_percent']],
    ['interest', ['interest_rate']],
    ['annual', ['interest_rate']],
    ['annually', ['interest_rate']],
    ['yearly', ['interest_rate']],
    ['per annum', ['interest_rate']],
    ['a year', ['interest_rate']],
    ['per year', ['interest_rate']],
  ];
  return {
    // Day counts.
    DAY_CUES,
    DAY_BASES,
    DAY_ANCHORS,
    // Pages.
    PAGE_CUES,
    // Percentages.
    PERCENT_CUES,
  } as const;
}
