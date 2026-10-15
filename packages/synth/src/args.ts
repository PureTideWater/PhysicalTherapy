import { parseArgs } from 'node:util';

/** What `pnpm synth` was asked to generate. */
export type SynthRequest = { readonly kind: 'all' } | { readonly kind: 'case'; readonly caseId: string } | { readonly kind: 'large' };

export class SynthUsageError extends Error {
  override readonly name = 'SynthUsageError';
}

/**
 * Case IDs: a test-matrix ID (a three-letter module and a two-digit number: PAR-01, PRC-13, LED-06)
 * or an oracle variant (V01).
 */
const CASE_ID = /^(?:[A-Z]{3}-\d{2}|V\d{2})$/;

export const SYNTH_USAGE =
  'usage: pnpm synth --all | pnpm synth --case <id> | pnpm synth --large   (--case PAR-08, or V01 for an oracle variant; --large writes the 10,000-claim PAR-29 file to its ignored path)';

export function parseSynthArgs(argv: readonly string[]): SynthRequest {
  let values: { all?: boolean; case?: string; large?: boolean };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: { all: { type: 'boolean' }, case: { type: 'string' }, large: { type: 'boolean' } },
      strict: true,
      allowPositionals: false,
    }));
  } catch {
    throw new SynthUsageError(SYNTH_USAGE);
  }
  const chosen = [values.all === true, values.case !== undefined, values.large === true].filter(Boolean).length;
  if (chosen !== 1) {
    throw new SynthUsageError(SYNTH_USAGE);
  }
  if (values.all === true) {
    return { kind: 'all' };
  }
  if (values.large === true) {
    return { kind: 'large' };
  }
  if (values.case !== undefined) {
    if (!CASE_ID.test(values.case)) {
      throw new SynthUsageError(`case IDs look like PAR-01 (docs/product/test-matrix.md) or V01 (an oracle variant)\n${SYNTH_USAGE}`);
    }
    return { kind: 'case', caseId: values.case };
  }
  throw new SynthUsageError(SYNTH_USAGE);
}
