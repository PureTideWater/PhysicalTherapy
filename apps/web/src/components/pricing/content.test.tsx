import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { FamilyThrough } from '../../lib/releases/content-through';
import { ReleaseLoadedThrough } from './content';

/**
 * The Releases page's "What this release covers" (audit #59; docs/adr/0071; test matrix RCC-08; review S1): every family
 * of the release in force, one it does not load, loads only in part or loads only from a later day included, in words. SYNTHETIC rows,
 * written by hand.
 */

const row = (family: FamilyThrough['family'], title: string, state: Pick<FamilyThrough, 'through' | 'open' | 'loaded' | 'partly' | 'from'>): FamilyThrough => ({ family, title, ...state });

describe('what the release in force covers', () => {
  it('lists every family it is given, a family not loaded, one partly loaded and one loaded only later included, in words', () => {
    const html = renderToStaticMarkup(
      <ReleaseLoadedThrough
        families={[
          row('fee_schedule', 'Medicare fee schedule', { through: '2026-12-31', open: false, loaded: true, partly: false, from: null }),
          row('conversion_factor', 'Conversion factor', { through: null, open: true, loaded: true, partly: false, from: null }),
          row('zip_locality', 'ZIP to locality', { through: null, open: false, loaded: false, partly: true, from: null }),
          row('therapy_thresholds', 'Therapy threshold', { through: null, open: false, loaded: false, partly: false, from: null }),
          row('ncci_mue', 'Medicare unit limits (MUE)', { through: null, open: false, loaded: true, partly: false, from: '2027-01-01' }),
          row('ncci_ptp', 'Code-pair edits (PTP)', { through: null, open: false, loaded: true, partly: false, from: null }),
        ]}
      />,
    );
    expect(html.match(/<li /g)).toHaveLength(6);
    expect(html).toContain('data-family="fee_schedule" data-through="2026-12-31"');
    expect(html).toContain('Medicare fee schedule: loaded through <span class="font-mono tabular-nums">2026-12-31</span>');
    expect(html).toContain('data-through="open">Conversion factor: in force, no end date');
    expect(html).toContain('data-family="zip_locality" data-through="partly">ZIP to locality: only partly loaded in this release');
    expect(html).toContain('data-family="therapy_thresholds" data-through="not_loaded">Therapy threshold: not loaded in this release');
    expect(html).toContain('data-through="later">Medicare unit limits (MUE): loaded only from <span class="font-mono tabular-nums">2027-01-01</span>');
    expect(html).toContain('Code-pair edits (PTP): loaded only from a later date');
  });
});
