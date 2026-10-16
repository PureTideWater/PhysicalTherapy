import type { LoggedCitation } from '@tp/db';
import type { z } from 'zod';

import type { PromptVersion } from './prompts';
import type { ModelPurpose } from './purposes';

/**
 * What each purpose-typed function gives the gateway's one call path (./gateway.ts): its prompt
 * version, the validator its answer must pass, how it prepares the user message from its input
 * (refusing an input that breaks a minimization rule before anything is sent), and its verifier, which
 * checks the answer against the input and returns the proposal a person reviews.
 */

export interface PreparedCall<C> {
  /** The user message: the input framed as data (./untrusted.ts). */
  readonly user: string;
  /** The SHA-256 of every input document (or of the facts sent), as model_call.input_hashes records them. */
  readonly inputHashes: readonly string[];
  /** The prompt's model variant to call ("default" unless the input asks for another). */
  readonly variant: string;
  /** What the verifier needs from preparation (a redaction's placeholders). */
  readonly context: C;
}

export interface Verified<P> {
  readonly proposal: P;
  /** Whether the verifier found nothing to reject. */
  readonly passed: boolean;
  /** The citations the answer returned, as references (never the quoted text). */
  readonly citations: readonly LoggedCitation[];
}

export interface PurposeSpec<I, O, P, C = undefined> {
  readonly purpose: ModelPurpose;
  readonly prompt: PromptVersion;
  readonly output: z.ZodType<O>;
  prepare(input: I): PreparedCall<C>;
  verify(input: I, output: O, context: C): Verified<P>;
}
