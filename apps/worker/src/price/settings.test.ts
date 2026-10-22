import { describe, expect, it } from 'vitest';

import { settingsOf } from './settings';

/**
 * The settings a run prices with (docs/adr/0029 and 0064; test matrix PRC-24): the practice's location (its ZIP and
 * ZIP+4), its rounding and its own places of service, and every place it has not set from the place-of-service split
 * the run pinned. The practice's own setting wins; with no split pinned, its own places apply alone.
 */

const SPLIT = { '11': 'non_facility', '12': 'non_facility', '21': 'facility', '22': 'facility', '23': 'facility' };

describe('settingsOf', () => {
  it('takes every place the practice has not set from the run’s split, and the practice’s own setting wins', () => {
    expect(settingsOf('00011', { default_rounding: 'HALF_UP_CENT', place_of_service_settings: { '22': 'non_facility', '99': 'facility' } }, { split: SPLIT })).toEqual({
      zip: '00011',
      defaultRounding: 'HALF_UP_CENT',
      placeOfServiceSettings: { '11': 'non_facility', '12': 'non_facility', '21': 'facility', '22': 'non_facility', '23': 'facility', '99': 'facility' },
    });
  });

  it('prices with the practice’s own places alone when the run pinned no split, and with the split alone when the practice set none', () => {
    const own = { place_of_service_settings: { '11': 'non_facility' } };
    expect(settingsOf('00011', own, { split: null }).placeOfServiceSettings).toEqual({ '11': 'non_facility' });
    expect(settingsOf('00011', own).placeOfServiceSettings).toEqual({ '11': 'non_facility' });
    expect(settingsOf('00011', {}, { split: SPLIT }).placeOfServiceSettings).toEqual(SPLIT);
  });

  it('gives the engine the ZIP+4 when the location has one, and leaves it out when it has none, as the trace does', () => {
    expect(settingsOf('00012', {}, { zipPlusFour: '5000' })).toEqual({ zip: '00012', zipPlusFour: '5000', defaultRounding: null, placeOfServiceSettings: {} });
    expect(settingsOf('00012', {}, { zipPlusFour: null })).toEqual({ zip: '00012', defaultRounding: null, placeOfServiceSettings: {} });
    expect('zipPlusFour' in settingsOf('00012', {}, { zipPlusFour: null })).toBe(false);
  });

  it('keeps a malformed split or setting as text the engine refuses, never dropped', () => {
    expect(settingsOf('00011', {}, { split: ['11'] }).placeOfServiceSettings).toEqual({ invalid: '["11"]' });
    expect(settingsOf('00011', { place_of_service_settings: 'facility' }, { split: SPLIT }).placeOfServiceSettings).toMatchObject({ '11': 'non_facility', invalid: 'facility' });
    expect(settingsOf('00011', {}, { split: { '11': 3 } }).placeOfServiceSettings).toEqual({ '11': '3' });
  });
});
