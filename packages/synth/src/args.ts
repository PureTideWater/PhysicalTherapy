import { parseArgs } from 'node:util';

/** What `pnpm synth` was asked to generate. */
export type SynthRequest = { readonly kind: 'all' } | { readonly kind: 'case'; readonly caseId: string };

export class SynthUsageError extends Error {
  override readonly name = 'SynthUsageError';
}

/** Test-matrix case IDs: a three-letter module and a two-digit number (PAR-01, PRC-13, LED-06). */
const CASE_ID = /^[A-Z]{3}-\d{2}$/;

export const SYNTH_USAGE = 'usage: pnpm synth --all | pnpm synth --case <id>   (for example --case PAR-08)';

export function parseSynthArgs(argv: readonly string[]): SynthRequest {
  let values: { all?: boolean; case?: string };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: { all: { type: 'boolean' }, case: { type: 'string' } },
      strict: true,
      allowPositionals: false,
    }));
  } catch {
    throw new SynthUsageError(SYNTH_USAGE);
  }
  if (values.all === true && values.case === undefined) {
    return { kind: 'all' };
  }
  if (values.all !== true && values.case !== undefined) {
    if (!CASE_ID.test(values.case)) {
      throw new SynthUsageError(`case IDs look like PAR-01; see docs/product/test-matrix.md\n${SYNTH_USAGE}`);
    }
    return { kind: 'case', caseId: values.case };
  }
  throw new SynthUsageError(SYNTH_USAGE);
}
