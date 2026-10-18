import type { ContractTruth, TruthFieldValue, TruthFlags, TruthRecord } from '@tp/synth';

import type { ContractTermsCandidate, ContractTermsOutput } from '../src/functions/contract-terms';
import type { NarrativeOutput } from '../src/functions/narrative';
import type { LocalDeterministicProvider } from '../src/providers/local';
import { registerOutput } from '../src/testing';
import type { ContractCase, NarrativeCase } from './sets';

/**
 * The reference answers: what a model that read every document and every pattern statement perfectly
 * would answer, in the prompt's output schema. For a contract, the true records as candidates, every
 * field copied as the document writes it with its page and quote (built from truth.json); for a
 * narrative, the reference narrative packages/synth wrote from its own sums. The local deterministic
 * provider answers with these in CI (it is not a model and reads nothing), so the gate there proves the
 * path the answers take: framing, the schema, the verifiers, the scoring and the baseline.
 */

const cite = (value: TruthFieldValue) => ({ page: value.page, quote: value.quote });
const text = (value: TruthFieldValue | undefined) => (value === undefined ? null : { written: value.written as string, ...cite(value) });
const list = (value: TruthFieldValue | undefined) => (value === undefined ? null : { written: [...(value.written as readonly string[])], ...cite(value) });

export function referenceCandidate(record: TruthRecord): ContractTermsCandidate {
  const { fields } = record;
  const method = fields.method;
  if (method === undefined) {
    throw new Error(`${record.label}: a true record states its method`);
  }
  return {
    label: record.label,
    method: { value: method.value as ContractTermsCandidate['method']['value'], ...cite(method) },
    codes: list(fields.codes),
    modifiers: list(fields.modifiers),
    places_of_service: list(fields.places_of_service),
    amount: text(fields.amount),
    percentage: text(fields.percentage),
    fee_schedule_year: text(fields.fee_schedule_year),
    lesser_of_schedule: (fields.lesser_of_schedule?.value as ContractTermsCandidate['lesser_of_schedule'] | undefined) ?? null,
    flags: fields.flags === undefined ? null : { ...(fields.flags.value as TruthFlags), ...cite(fields.flags) },
    rounding: fields.rounding === undefined ? null : { value: fields.rounding.value as NonNullable<ContractTermsCandidate['rounding']>['value'], ...cite(fields.rounding) },
    effective_from: text(fields.effective_from),
    effective_to: text(fields.effective_to),
  };
}

export function referenceContractOutput(truth: ContractTruth): ContractTermsOutput {
  return { candidates: truth.records.map(referenceCandidate) };
}

export function referenceNarrativeOutput(item: NarrativeCase): NarrativeOutput {
  return { paragraphs: [...item.reference.paragraphs] };
}

/** Registers every case's reference answer with the local provider, under the request the gateway will send for it. */
export function registerReferences(provider: LocalDeterministicProvider, contracts: readonly ContractCase[], narratives: readonly NarrativeCase[]): LocalDeterministicProvider {
  for (const item of contracts) {
    registerOutput(provider, 'proposeContractTerms', item.input, referenceContractOutput(item.truth));
  }
  for (const item of narratives) {
    registerOutput(provider, 'draftPacketNarrative', item.input, referenceNarrativeOutput(item));
  }
  return provider;
}
