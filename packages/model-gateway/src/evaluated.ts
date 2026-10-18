import { z } from 'zod';

import baselineFile from '../eval/baseline.json' with { type: 'json' };
import { GatewayConfigError } from './errors';
import { PROMPTS } from './prompts';
import type { ProviderKind } from './provider';

/**
 * Which prompt versions and models have a recorded evaluation (PRD 14, Logging and evaluation: "the
 * gate for a prompt or model change is field-level precision and recall on that set with no
 * regression"; "any verifier failure on the 300-case synthetic set blocks the change"; docs/adr/0051
 * and 0054). The committed baseline (eval/baseline.json) holds one entry per purpose, prompt version
 * (with the SHA-256 of its content), provider and model, recorded with `eval --record`, which refuses
 * a run that regresses or that fails a narrative. A real provider is served in production only when
 * every model the current prompts pin for it, for every purpose the gate evaluates, has its entry for
 * the current prompt version and content: a prompt or model change ships only once a person has run
 * the gate against that model and committed what it recorded.
 */

/** The purposes the synthetic sets evaluate: contract extraction and narratives (PRD 14). */
export const EVALUATED_PURPOSES = ['proposeContractTerms', 'draftPacketNarrative'] as const;
export type EvaluatedPurpose = (typeof EVALUATED_PURPOSES)[number];

export interface RecordedEvaluation {
  readonly purpose: string;
  readonly prompt_version: string;
  readonly prompt_sha256: string;
  readonly provider: string;
  readonly model_id: string;
}

const entries = z.object({
  entries: z.array(z.object({ purpose: z.string(), prompt_version: z.string(), prompt_sha256: z.string(), provider: z.string(), model_id: z.string() })),
});

/** The baseline's entries, as the gate recorded them. */
export const RECORDED_EVALUATIONS: readonly RecordedEvaluation[] = entries.parse(baselineFile).entries;

export interface MissingEvaluation {
  readonly purpose: EvaluatedPurpose;
  readonly promptVersion: string;
  readonly modelId: string;
}

/** Every model the current prompts pin for the provider that has no recorded evaluation of the current prompt version and content. */
export function unevaluatedModels(provider: ProviderKind, recorded: readonly RecordedEvaluation[] = RECORDED_EVALUATIONS): MissingEvaluation[] {
  return EVALUATED_PURPOSES.flatMap((purpose) => {
    const prompt = PROMPTS[purpose];
    return [...new Set(Object.values(prompt.models[provider]))]
      .sort()
      .filter((modelId) => !recorded.some((entry) => entry.purpose === purpose && entry.provider === provider && entry.prompt_version === prompt.id && entry.prompt_sha256 === prompt.sha256 && entry.model_id === modelId))
      .map((modelId) => ({ purpose, promptVersion: prompt.id, modelId }));
  });
}

/** Refuses a provider some current prompt version and pinned model of which has no recorded evaluation. */
export function assertEvaluated(provider: ProviderKind, recorded: readonly RecordedEvaluation[] = RECORDED_EVALUATIONS): void {
  const missing = unevaluatedModels(provider, recorded);
  if (missing.length > 0) {
    throw new GatewayConfigError(
      `${provider} is refused when NODE_ENV is production until eval/baseline.json records the evaluation gate for every current prompt version and the models it pins (${String(missing.length)} missing; run the gate with --provider configured --record)`,
    );
  }
}
