import { assertNoPhi } from '@tp/observability';
import { describe, expect, it } from 'vitest';

import { type StageCode, monthLinesHref, stageDollarsHref, stageLinesHref } from './links';

/** Where every report figure links (PRD 6: "every report total links to a stage"; docs/adr/0045). */

const PRACTICE = '7f0c8a52-4a7e-4c1e-9b51-0d7a8e4b2c11';
const STAGES: readonly StageCode[] = ['flagged', 'validated', 'actionable', 'payer_approved', 'recovered'];

describe('stage links', () => {
  it('open Claims and lines at the stage now, within the month when one is named', () => {
    expect(stageLinesHref(PRACTICE, 'actionable')).toBe(`/p/${PRACTICE}/claims?stage=actionable`);
    expect(stageLinesHref(PRACTICE, 'payer_approved', '2026-03')).toBe(`/p/${PRACTICE}/claims?stage=payer_approved&from=2026-03&to=2026-03`);
    expect(monthLinesHref(PRACTICE, '2026-03')).toBe(`/p/${PRACTICE}/claims?from=2026-03&to=2026-03`);
  });

  it('send each stage’s dollars to the screen they come from', () => {
    expect(STAGES.map((stage) => stageDollarsHref(PRACTICE, stage))).toEqual([
      `/p/${PRACTICE}/anomalies`,
      `/p/${PRACTICE}/claims?stage=validated`,
      `/p/${PRACTICE}/cases`,
      `/p/${PRACTICE}/reconciliation`,
      `/p/${PRACTICE}/reconciliation`,
    ]);
  });

  it('carry opaque IDs and codes only', () => {
    for (const stage of STAGES) {
      for (const href of [stageLinesHref(PRACTICE, stage, '2026-03'), stageDollarsHref(PRACTICE, stage), monthLinesHref(PRACTICE, '2026-03')]) {
        expect(() => {
          assertNoPhi('url', href);
        }).not.toThrow();
      }
    }
  });
});
