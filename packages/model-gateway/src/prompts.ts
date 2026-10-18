import { z } from 'zod';

import contractTermsPrompt from '../prompts/propose-contract-terms/v1/prompt.json' with { type: 'json' };
import contractTermsSchema from '../prompts/propose-contract-terms/v1/schema.json' with { type: 'json' };
import denialLetterPrompt from '../prompts/read-denial-letter/v1/prompt.json' with { type: 'json' };
import denialLetterSchema from '../prompts/read-denial-letter/v1/schema.json' with { type: 'json' };
import narrativePrompt from '../prompts/draft-packet-narrative/v1/prompt.json' with { type: 'json' };
import narrativeSchema from '../prompts/draft-packet-narrative/v1/schema.json' with { type: 'json' };
import evidencePrompt from '../prompts/suggest-evidence-requests/v1/prompt.json' with { type: 'json' };
import evidenceSchema from '../prompts/suggest-evidence-requests/v1/schema.json' with { type: 'json' };
import { jsonSha256 } from './hash';
import { EFFORTS, type Effort, PROVIDER_KINDS, type ProviderKind } from './provider';
import { MODEL_PURPOSES, type ModelPurpose } from './purposes';

/**
 * Prompt text and output schemas, versioned in the repository under packages/model-gateway/prompts/
 * (PRD 14, Operational limits): prompts/<name>/v<n>/prompt.json (the system prompt, the model
 * identifiers pinned per provider, the token limit and effort) and schema.json (the JSON schema the
 * answer must follow), with prompts/<name>/CHANGELOG.md. Each prompt.json records the SHA-256 of its
 * version's content; a test recomputes it, so a released version cannot change in place: a change is a
 * new version directory and a changelog entry.
 *
 * Model identifiers live only here, in configuration (PRD 14: "pinned per prompt version, never a
 * floating alias"). A purpose may name a second model for a case the specialist marks (the
 * "ambiguous" variant of proposeContractTerms, PRD 14: the larger model is reserved for contracts the
 * specialist marks as ambiguous); every provider names a default.
 */

export const PROMPT_FORMAT = 'tp-model-prompt/1';

const modelIds = z.record(z.string().regex(/^[a-z]+$/), z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/)).refine((ids) => ids.default !== undefined, 'every provider names a default model');

const promptFile = z.strictObject({
  format: z.literal(PROMPT_FORMAT),
  id: z.string().regex(/^[a-z][a-z0-9-]{0,63}\/[1-9][0-9]{0,3}$/),
  purpose: z.enum(MODEL_PURPOSES),
  models: z.strictObject(Object.fromEntries(PROVIDER_KINDS.map((kind) => [kind, modelIds])) as Record<ProviderKind, typeof modelIds>),
  max_tokens: z.number().int().min(256).max(64_000),
  effort: z.enum(EFFORTS),
  system: z.array(z.string().min(1)).min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
type PromptFile = z.output<typeof promptFile>;

export interface PromptVersion {
  /** As model_call.prompt_version records it: <name>/<version>. */
  readonly id: string;
  readonly purpose: ModelPurpose;
  /** Model identifiers by provider and variant ("default", and any other the purpose names). */
  readonly models: Readonly<Record<ProviderKind, Readonly<Record<string, string>>>>;
  readonly maxTokens: number;
  readonly effort: Effort;
  /** The system prompt: the file's paragraphs joined by blank lines. */
  readonly system: string;
  readonly schema: Readonly<Record<string, unknown>>;
  /** The SHA-256 the file records for its content. */
  readonly sha256: string;
}

/** What a version's SHA-256 covers: everything a call of it sends or is pinned to. */
export function promptContentSha256(file: Omit<PromptFile, 'sha256' | 'format'>, schema: unknown): string {
  return jsonSha256({ id: file.id, purpose: file.purpose, models: file.models, max_tokens: file.max_tokens, effort: file.effort, system: file.system, schema });
}

function promptVersion(raw: unknown, schema: Readonly<Record<string, unknown>>): PromptVersion {
  const file = promptFile.parse(raw);
  return {
    id: file.id,
    purpose: file.purpose,
    models: file.models,
    maxTokens: file.max_tokens,
    effort: file.effort,
    system: file.system.join('\n\n'),
    schema,
    sha256: file.sha256,
  };
}

/** The prompt version each purpose calls now. */
export const PROMPTS: Readonly<Record<ModelPurpose, PromptVersion>> = {
  proposeContractTerms: promptVersion(contractTermsPrompt, contractTermsSchema),
  readDenialLetter: promptVersion(denialLetterPrompt, denialLetterSchema),
  draftPacketNarrative: promptVersion(narrativePrompt, narrativeSchema),
  suggestEvidenceRequests: promptVersion(evidencePrompt, evidenceSchema),
};

/** The raw files, for the test that recomputes each version's SHA-256. */
export const PROMPT_FILES: readonly { readonly prompt: unknown; readonly schema: unknown }[] = [
  { prompt: contractTermsPrompt, schema: contractTermsSchema },
  { prompt: denialLetterPrompt, schema: denialLetterSchema },
  { prompt: narrativePrompt, schema: narrativeSchema },
  { prompt: evidencePrompt, schema: evidenceSchema },
];

/** The model a call of the prompt uses on a provider: its variant's, else the default. */
export function modelFor(prompt: PromptVersion, provider: ProviderKind, variant = 'default'): string {
  const ids = prompt.models[provider];
  const id = ids[variant] ?? ids.default;
  if (id === undefined) {
    throw new TypeError('the prompt names no default model for the provider');
  }
  return id;
}

/** JSON-schema keywords the provider's structured outputs are not given: code's own validator holds those rules. */
const CODE_ONLY_KEYWORDS = new Set(['$schema', 'minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minItems', 'maxItems', 'pattern', 'format']);

function stripped(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripped);
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !CODE_ONLY_KEYWORDS.has(key))
      .map(([key, item]) => [key, key === 'properties' ? Object.fromEntries(Object.entries(item as object).map(([name, property]) => [name, stripped(property)])) : stripped(item)]),
  );
}

/**
 * The JSON schema a purpose's output validator stands for, as the provider is given it: types, enums,
 * required fields and closed objects. Bounds and patterns stay with the validator, which checks every
 * answer whatever the provider enforced.
 */
export function providerSchema(validator: z.ZodType): Record<string, unknown> {
  return stripped(z.toJSONSchema(validator)) as Record<string, unknown>;
}
