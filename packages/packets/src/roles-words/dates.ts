import type { Cues } from './index';

/**
 * The dates' cues (./index.ts; docs/adr/0086): the words that name which date a figure is, and among them the acts of
 * payment and the services' cues. Built anew on each call, as every family of the reader's words is (./index.ts), and
 * mutated in a shard of its own (stryker/shards.json, packets-words-dates).
 */
export function dateWords() {
  /** The acts of payment among the dates' cues: a service's cue after one is what the payment was for ("paid for these services on"). */
  const PAYMENT_ACTS = new Set(['paid', 'pays', 'pay', 'remitted', 'processed', 'adjudicated', 'allowed', 'underpaid', 'denied']);
  /** The services' cues among the dates' cues. */
  const SERVICE_CUES = new Set(['service', 'services', 'serviced', 'rendered', 'treated', 'treatment', 'visit', 'visits', 'billed']);
  /** The dates' cues; "due" names a due date or a deadline, and a word beside it says which ("the prompt-pay deadline"). */
  const DATE_CUES: Cues = [
    ['service', ['service_date']],
    ['services', ['service_date']],
    ['serviced', ['service_date']],
    ['rendered', ['service_date']],
    ['treated', ['service_date']],
    ['treatment', ['service_date']],
    ['visit', ['service_date']],
    ['visits', ['service_date']],
    ['billed', ['service_date']],
    ['paid', ['paid_date']],
    ['pays', ['paid_date']],
    ['pay', ['paid_date']],
    ['payment', ['paid_date']],
    ['payments', ['paid_date']],
    ['remitted', ['paid_date']],
    ['remittance', ['paid_date']],
    ['remittances', ['paid_date']],
    ['processed', ['paid_date']],
    ['adjudicated', ['paid_date']],
    ['allowed', ['paid_date']],
    ['underpaid', ['paid_date']],
    ['denied', ['paid_date']],
    ['received', ['received_date']],
    ['receipt', ['received_date']],
    ['prompt pay deadline', ['due_date']],
    ['payment due', ['due_date']],
    ['due', ['due_date', 'deadline']],
    ['prompt pay', ['due_date']],
    ['deadline', ['deadline']],
    ['until', ['deadline']],
    ['no later than', ['deadline']],
    ['window', ['deadline']],
    ['ends', ['deadline']],
    ['end', ['deadline']],
    ['ending', ['deadline']],
    ['expires', ['deadline']],
    ['closes', ['deadline']],
    ['dispute', ['deadline']],
    ['disputes', ['deadline']],
    ['disputed', ['deadline']],
    ['appeal', ['deadline']],
    ['appeals', ['deadline']],
    ['appealed', ['deadline']],
    ['raise', ['deadline']],
    ['raised', ['deadline']],
    ['file', ['deadline']],
    ['filed', ['deadline']],
    ['filing', ['deadline']],
    ['submit', ['deadline']],
    ['submitted', ['deadline']],
    ['respond', ['deadline']],
    ['effective', ['effective_date']],
    ['effect', ['effective_date']],
    ['as of', ['as_of_date']],
    ['assembled', ['as_of_date']],
    ['prepared', ['as_of_date']],
  ];
  return { DATE_CUES, PAYMENT_ACTS, SERVICE_CUES } as const;
}
