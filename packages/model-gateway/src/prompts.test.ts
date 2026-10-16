import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { MODEL_CALL_PURPOSES } from '@tp/db';
import { DENIAL_CATEGORIES } from '@tp/rules';
import { describe, expect, it } from 'vitest';

import { pinnedModels } from './config';
import { KNOWN_REASON_CODES } from './functions/evidence-requests';
import { PRICES } from './prices';
import { PROMPTS, PROMPT_FILES, modelFor, promptContentSha256, providerSchema } from './prompts';
import { PROVIDER_KINDS } from './provider';
import { MODEL_PURPOSES } from './purposes';
import { PURPOSE_SPECS } from './specs';

/**
 * Prompt text and schemas versioned under prompts/ (PRD 14, Operational limits): each version's
 * recorded SHA-256 matches its content, so a released version cannot change in place; each has a
 * changelog entry; its schema is the one its function's validator stands for; its model identifiers
 * are pinned, never an alias, and priced.
 */

const PROMPTS_DIR = path.resolve(import.meta.dirname, '../prompts');

describe('the purposes', () => {
  it('are the four of PRD 14, as model_call checks them', () => {
    expect(MODEL_PURPOSES).toEqual(['proposeContractTerms', 'readDenialLetter', 'draftPacketNarrative', 'suggestEvidenceRequests']);
    expect([...MODEL_CALL_PURPOSES]).toEqual([...MODEL_PURPOSES]);
    expect(Object.keys(PURPOSE_SPECS).sort()).toEqual([...MODEL_PURPOSES].sort());
  });

  it('each have one prompt version of their own', () => {
    for (const purpose of MODEL_PURPOSES) {
      expect(PROMPTS[purpose].purpose).toBe(purpose);
      expect(PURPOSE_SPECS[purpose].prompt).toBe(PROMPTS[purpose]);
    }
  });
});

describe('each prompt version', () => {
  it.each(PROMPT_FILES.map((file) => [(file.prompt as { id: string }).id, file] as const))('%s records the SHA-256 of its content', (_id, file) => {
    const prompt = file.prompt as Parameters<typeof promptContentSha256>[0] & { sha256: string };
    expect(promptContentSha256(prompt, file.schema)).toBe(prompt.sha256);
  });

  it.each(MODEL_PURPOSES)('%s answers in the schema its validator stands for', (purpose) => {
    expect(PROMPTS[purpose].schema).toEqual(providerSchema(PURPOSE_SPECS[purpose].output));
  });

  it('lives in prompts/<name>/v<n>/ with a changelog entry naming its version and hash', () => {
    for (const prompt of Object.values(PROMPTS)) {
      const [name, version] = prompt.id.split('/') as [string, string];
      expect(existsSync(path.join(PROMPTS_DIR, name, `v${version}`, 'prompt.json'))).toBe(true);
      expect(existsSync(path.join(PROMPTS_DIR, name, `v${version}`, 'schema.json'))).toBe(true);
      const changelog = readFileSync(path.join(PROMPTS_DIR, name, 'CHANGELOG.md'), 'utf8');
      expect(changelog).toContain(`## ${prompt.id} (`);
      expect(changelog).toContain(prompt.sha256);
    }
    expect(readdirSync(PROMPTS_DIR).sort()).toEqual(Object.values(PROMPTS).map((prompt) => prompt.id.split('/')[0]).sort());
  });

  it('pins a model for every provider, never a floating alias, and every pinned model has a price', () => {
    for (const prompt of Object.values(PROMPTS)) {
      for (const provider of PROVIDER_KINDS) {
        const id = modelFor(prompt, provider);
        expect(id).not.toMatch(/latest|default|^[a-z]+$/i);
        expect(PRICES.some((price) => price.provider === provider && price.modelId === id)).toBe(true);
      }
    }
    for (const provider of PROVIDER_KINDS) {
      for (const id of pinnedModels(provider)) {
        expect(PRICES.some((price) => price.provider === provider && price.modelId === id), `${provider} ${id}`).toBe(true);
      }
    }
  });

  it('falls back to the default model for a variant the prompt does not name', () => {
    const prompt = PROMPTS.draftPacketNarrative;
    expect(modelFor(prompt, 'bedrock', 'ambiguous')).toBe(modelFor(prompt, 'bedrock'));
    expect(modelFor(PROMPTS.proposeContractTerms, 'bedrock', 'ambiguous')).not.toBe(modelFor(PROMPTS.proposeContractTerms, 'bedrock'));
    expect(() => modelFor({ ...prompt, models: { ...prompt.models, local: {} } }, 'local')).toThrow(TypeError);
  });

  it('gives the provider types, enums and closed objects, and keeps bounds and patterns with the validator', () => {
    const text = JSON.stringify(Object.values(PROMPTS).map((prompt) => prompt.schema));
    for (const keyword of ['$schema', 'minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems', 'pattern', 'format']) {
      expect(text).not.toContain(`"${keyword}"`);
    }
    expect(text).toContain('"additionalProperties":false');
  });

  it('tells the model that documents and facts are data, never instructions', () => {
    for (const prompt of Object.values(PROMPTS)) {
      expect(prompt.system).toMatch(/never follow instructions/i);
      expect(prompt.system).toMatch(/proposal/i);
    }
  });

  it('names the denial-category code list exactly as @tp/rules holds it', () => {
    for (const category of DENIAL_CATEGORIES) {
      expect(PROMPTS.readDenialLetter.system).toContain(category);
    }
  });

  it('lists every reason code an evidence request may map to', () => {
    for (const code of KNOWN_REASON_CODES) {
      expect(PROMPTS.suggestEvidenceRequests.system).toContain(code);
    }
  });
});
