import type { LoggedCitation } from '@tp/db/runtime';
import type { z } from 'zod';

import type { CallContext } from './gateway';
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

/**
 * Every member is readonly (properties, not methods), so assigning or deleting one, the screen above all, does not
 * compile; each spec is frozen where it is defined (./functions/*) and again by ./specs.ts, so it throws at run time too.
 */
export interface PurposeSpec<I, O, P, C = undefined> {
  readonly purpose: ModelPurpose;
  readonly prompt: PromptVersion;
  readonly output: z.ZodType<O>;
  readonly prepare: (input: I) => PreparedCall<C>;
  /**
   * A check of the prepared call against records outside the input (the denial-letter reader asks the
   * practice's records whether the letter names another patient; a contract's check asks whether the pages
   * name any patient of the practice, combined audit item 120); it refuses by throwing an InputRefusedError,
   * and runs after preparation and the variant's serving check, before the idempotency key, the budget and
   * the call. The call's context says which practice the call reads, so a screen can hold its records
   * check to that practice.
   */
  readonly screen?: (input: I, prepared: PreparedCall<C>, context: CallContext) => Promise<void>;
  readonly verify: (input: I, output: O, context: C) => Verified<P>;
}
