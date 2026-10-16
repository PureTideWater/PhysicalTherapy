import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { canonicalJson, isSha256, jsonSha256 } from '../hash';
import { type ModelProvider, type ModelRequest, type ModelResponse, ProviderFailure } from '../provider';

/**
 * The local deterministic provider for development, tests and the e2e suite: not a model. It returns
 * the fixed output registered for a request's key, the SHA-256 of the prompt version and the user
 * message (the input as the gateway frames it), and refuses any other request (no_fixed_output). It
 * reads nothing, guesses nothing and costs nothing (zero tokens); its model identifier names it as
 * what it is. Outputs are registered in code, or read from a directory of
 * <key>.json files ({ "format": "tp-local-model-output/1", "output": ... }).
 */

export const LOCAL_OUTPUT_FORMAT = 'tp-local-model-output/1';

/** The key a fixed output is registered under: what the gateway sends, apart from the model's identifier. */
export function localOutputKey(request: Pick<ModelRequest, 'promptVersion' | 'user'>): string {
  return jsonSha256({ prompt_version: request.promptVersion, user: request.user });
}

const fileSchema = z.strictObject({ format: z.literal(LOCAL_OUTPUT_FORMAT), output: z.unknown() });

export class LocalDeterministicProvider implements ModelProvider {
  readonly kind = 'local' as const;
  private readonly outputs = new Map<string, string>();
  /** Every request answered or refused, for tests that check what would have been sent. */
  readonly requests: ModelRequest[] = [];

  /** Registers the fixed output for a request (its JSON, as a model would write it). */
  register(request: Pick<ModelRequest, 'promptVersion' | 'user'>, output: unknown): this {
    return this.registerKey(localOutputKey(request), output);
  }

  registerKey(key: string, output: unknown): this {
    if (!isSha256(key)) {
      throw new TypeError('a local output is registered under a SHA-256 key');
    }
    this.outputs.set(key, typeof output === 'string' ? output : canonicalJson(output));
    return this;
  }

  /** Reads every <key>.json in a directory of fixed outputs. */
  static fromDirectory(dir: string): LocalDeterministicProvider {
    const provider = new LocalDeterministicProvider();
    for (const name of readdirSync(dir).filter((file) => file.endsWith('.json')).sort()) {
      const file = fileSchema.parse(JSON.parse(readFileSync(path.join(dir, name), 'utf8')));
      provider.registerKey(name.slice(0, -'.json'.length), file.output);
    }
    return provider;
  }

  complete(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(request);
    const text = this.outputs.get(localOutputKey(request));
    if (text === undefined) {
      return Promise.reject(new ProviderFailure('no_fixed_output'));
    }
    return Promise.resolve({ text, tokensIn: 0, tokensOut: 0, stopReason: 'end' });
  }
}
