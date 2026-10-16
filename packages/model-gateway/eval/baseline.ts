import { readFileSync } from 'node:fs';
import path from 'node:path';

import { TRUTH_FIELDS, type TruthField } from '@tp/synth';
import { z } from 'zod';

import { PROVIDER_KINDS, type ProviderKind } from '../src/provider';
import type { EvaluationReport } from './harness';
import { type Counts, below, precision, recall } from './score';

/**
 * The committed baseline and the gate (PRD 14: "the gate for a prompt or model change is field-level
 * precision and recall on that set with no regression ... Narrative drafting has a zero-tolerance
 * gate: any verifier failure on the 300-case synthetic set blocks the change"; docs/adr/0051).
 *
 * baseline.json holds one entry per purpose, prompt version, provider and model it was recorded for,
 * with the counts it scored and the SHA-256 of the set it scored them on. A report passes when:
 *
 * - contracts: against the baseline entry for its provider (the same prompt version and model when
 *   there is one; otherwise the same model under an earlier prompt, so a prompt change is held to the
 *   prompt it replaces; otherwise the provider's latest entry, so a model change is held to the model
 *   it replaces), neither overall nor any field's precision or recall is lower, the set is the one the
 *   baseline was recorded on, and every quote the answers cite is on its page;
 * - narratives: no case has a critical error (zero tolerance, whatever the baseline says).
 *
 * A provider with no entry fails ("no_baseline"): its first baseline is recorded on purpose, by a
 * person, with ./cli.ts --record, from a run where that provider can be called.
 */

export const BASELINE_FORMAT = 'tp-model-eval-baseline/1';
export const BASELINE_PATH = path.resolve(import.meta.dirname, 'baseline.json');

const counts = z.strictObject({ tp: z.number().int().min(0), fp: z.number().int().min(0), fn: z.number().int().min(0) });

const contractEntry = z.strictObject({
  purpose: z.literal('proposeContractTerms'),
  prompt_version: z.string(),
  provider: z.enum(PROVIDER_KINDS),
  model_id: z.string(),
  set_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  cases: z.number().int().min(1),
  fields: z.strictObject(Object.fromEntries(TRUTH_FIELDS.map((field) => [field, counts])) as Record<TruthField, typeof counts>),
  total: counts,
  recorded_on: z.iso.date(),
});

const narrativeEntry = z.strictObject({
  purpose: z.literal('draftPacketNarrative'),
  prompt_version: z.string(),
  provider: z.enum(PROVIDER_KINDS),
  model_id: z.string(),
  set_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  cases: z.number().int().min(1),
  failures: z.literal(0),
  recorded_on: z.iso.date(),
});

const baselineSchema = z.strictObject({
  format: z.literal(BASELINE_FORMAT),
  synthetic: z.literal(true),
  note: z.string(),
  entries: z.array(z.discriminatedUnion('purpose', [contractEntry, narrativeEntry])),
});

export type Baseline = z.output<typeof baselineSchema>;
export type ContractBaseline = z.output<typeof contractEntry>;
export type NarrativeBaseline = z.output<typeof narrativeEntry>;

export function parseBaseline(value: unknown): Baseline {
  return baselineSchema.parse(value);
}

export function readBaseline(file: string = BASELINE_PATH): Baseline {
  return parseBaseline(JSON.parse(readFileSync(file, 'utf8')));
}

export type GateProblem =
  | { readonly code: 'no_baseline'; readonly purpose: string; readonly provider: ProviderKind }
  | { readonly code: 'set_changed'; readonly purpose: string }
  | { readonly code: 'precision_regressed' | 'recall_regressed'; readonly field: TruthField | 'all' }
  | { readonly code: 'quotes_off_page'; readonly count: number }
  | { readonly code: 'narrative_failures'; readonly count: number; readonly cases: readonly string[] };

export interface GateResult {
  readonly passed: boolean;
  readonly problems: readonly GateProblem[];
  /** The contract baseline entry the report was held to, if any. */
  readonly heldTo: ContractBaseline | null;
}

/** The contract entry a report is held to (see above), or null when the provider has none. */
export function contractBaselineFor(baseline: Baseline, report: { readonly provider: ProviderKind; readonly promptVersion: string; readonly modelId: string }): ContractBaseline | null {
  const entries = baseline.entries.filter((entry): entry is ContractBaseline => entry.purpose === 'proposeContractTerms' && entry.provider === report.provider);
  return (
    entries.find((entry) => entry.prompt_version === report.promptVersion && entry.model_id === report.modelId) ??
    entries.filter((entry) => entry.model_id === report.modelId).at(-1) ??
    entries.at(-1) ??
    null
  );
}

function regressions(current: Counts, held: Counts, field: TruthField | 'all'): GateProblem[] {
  const problems: GateProblem[] = [];
  if (below(precision(current), precision(held))) {
    problems.push({ code: 'precision_regressed', field });
  }
  if (below(recall(current), recall(held))) {
    problems.push({ code: 'recall_regressed', field });
  }
  return problems;
}

export function gate(report: EvaluationReport, baseline: Baseline): GateResult {
  const problems: GateProblem[] = [];
  let heldTo: ContractBaseline | null = null;
  const { contracts, narratives } = report;
  if (contracts !== null) {
    heldTo = contractBaselineFor(baseline, { provider: report.provider, promptVersion: contracts.promptVersion, modelId: contracts.modelId });
    if (heldTo === null) {
      problems.push({ code: 'no_baseline', purpose: contracts.purpose, provider: report.provider });
    } else {
      if (heldTo.set_sha256 !== contracts.setSha256) {
        problems.push({ code: 'set_changed', purpose: contracts.purpose });
      }
      problems.push(...regressions(contracts.total, heldTo.total, 'all'));
      for (const field of TRUTH_FIELDS) {
        problems.push(...regressions((contracts.fields)[field], heldTo.fields[field], field));
      }
    }
    if (contracts.quotesOffPage > 0) {
      problems.push({ code: 'quotes_off_page', count: contracts.quotesOffPage });
    }
  }
  if (narratives !== null && narratives.failures.length > 0) {
    problems.push({ code: 'narrative_failures', count: narratives.failures.length, cases: narratives.failures.map((failure) => failure.id) });
  }
  return { passed: problems.length === 0, problems, heldTo };
}

/**
 * The baseline with this report's results recorded (replacing any entry for the same purpose, prompt
 * version, provider and model). A narrative result is recorded only with zero failures, and a contract
 * result only when the gate passes or the provider had no baseline yet.
 */
export function recordBaseline(baseline: Baseline, report: EvaluationReport, recordedOn: string): Baseline {
  const result = gate(report, baseline);
  const blocking = result.problems.filter((problem) => problem.code !== 'no_baseline' && problem.code !== 'set_changed');
  if (blocking.length > 0) {
    throw new Error(`the report regresses or fails the narrative gate; nothing is recorded (${blocking.map((problem) => problem.code).join(', ')})`);
  }
  const entries: Baseline['entries'][number][] = [];
  const { contracts, narratives } = report;
  if (contracts !== null) {
    entries.push({
      purpose: 'proposeContractTerms',
      prompt_version: contracts.promptVersion,
      provider: report.provider,
      model_id: contracts.modelId,
      set_sha256: contracts.setSha256,
      cases: contracts.cases,
      fields: contracts.fields,
      total: contracts.total,
      recorded_on: recordedOn,
    });
  }
  if (narratives !== null) {
    entries.push({ purpose: 'draftPacketNarrative', prompt_version: narratives.promptVersion, provider: report.provider, model_id: narratives.modelId, set_sha256: narratives.setSha256, cases: narratives.cases, failures: 0, recorded_on: recordedOn });
  }
  const same = (a: Baseline['entries'][number], b: Baseline['entries'][number]) => a.purpose === b.purpose && a.prompt_version === b.prompt_version && a.provider === b.provider && a.model_id === b.model_id;
  return { ...baseline, entries: [...baseline.entries.filter((entry) => !entries.some((added) => same(entry, added))), ...entries] };
}
