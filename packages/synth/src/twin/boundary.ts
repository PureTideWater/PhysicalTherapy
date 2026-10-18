/**
 * Where the twin generator may run (PRD section 16, development data boundary). A real file exists
 * only in production, so the generator runs on one only there: `TwinBoundary.production()` requires
 * NODE_ENV=production and TP_ENVIRONMENT=production (staging and dev also run NODE_ENV=production or
 * none, but never TP_ENVIRONMENT=production). Anywhere else the only boundary is
 * `TwinBoundary.syntheticInputOnly()`, under which the generator refuses any input that is not already
 * synthetic (every ISA06 SYNTHSENDER and every GS02 SYNTH), so a test can exercise it and nothing real
 * can pass through it outside production. Only the twin leaves the boundary.
 */
import { SYNTH_GS02, SYNTH_ISA06 } from '../identity';
import { type X12Document, elementValue } from '../x12/segments';

export class TwinBoundaryError extends Error {
  override readonly name = 'TwinBoundaryError';
}

type Env = Readonly<Record<string, string | undefined>>;

export class TwinBoundary {
  private constructor(readonly kind: 'production' | 'synthetic_input_only') {}

  /** The production boundary. Throws anywhere but production. */
  static production(env: Env = process.env): TwinBoundary {
    if (env.NODE_ENV !== 'production' || env.TP_ENVIRONMENT !== 'production') {
      throw new TwinBoundaryError('the twin generator runs on real files only inside the production boundary (NODE_ENV and TP_ENVIRONMENT production)');
    }
    return new TwinBoundary('production');
  }

  /** For tests and development: the generator accepts only input that is already synthetic. */
  static syntheticInputOnly(): TwinBoundary {
    return new TwinBoundary('synthetic_input_only');
  }

  /** Refuses a document this boundary may not twin. The message never carries a value from it. */
  admit(document: X12Document): void {
    if (this.kind === 'production') {
      return;
    }
    for (const interchange of document.interchanges) {
      for (const segment of interchange.segments) {
        if (segment.id === 'ISA' && elementValue(segment, 6) !== SYNTH_ISA06) {
          throw new TwinBoundaryError('outside production the twin generator accepts synthetic input only (ISA06 SYNTHSENDER)');
        }
        if (segment.id === 'GS' && elementValue(segment, 2) !== SYNTH_GS02) {
          throw new TwinBoundaryError('outside production the twin generator accepts synthetic input only (GS02 SYNTH)');
        }
      }
    }
  }
}
