import { describe, expect, it } from 'vitest';

import { DEFAULT_TRIAGE_SETTINGS, TriageSettingsError, triageSettings } from './settings';

describe('triage settings (practice.settings)', () => {
  it('uses the defaults when the practice states nothing', () => {
    expect(triageSettings({})).toEqual(DEFAULT_TRIAGE_SETTINGS);
    expect(triageSettings(null)).toEqual(DEFAULT_TRIAGE_SETTINGS);
    expect(triageSettings(['not', 'an', 'object'])).toEqual(DEFAULT_TRIAGE_SETTINGS);
    expect(DEFAULT_TRIAGE_SETTINGS.anomalyThresholdCents).toBe(500n);
    expect(DEFAULT_TRIAGE_SETTINGS.pursuit).toBeNull();
  });

  it('reads the practice’s own thresholds and pursuit settings, beside the pricing settings', () => {
    const settings = triageSettings({
      place_of_service_settings: { '11': 'non_facility' },
      line_materiality_cents: '1000',
      case_materiality_cents: '50000',
      anomaly_minimum_cohort: 40,
      anomaly_threshold_cents: '250',
      staff_rate_cents_per_hour: '4500',
      minutes_per_packet: 90,
      minutes_per_follow_up: 20,
    });
    expect(settings).toEqual({
      lineMaterialityCents: 1000n,
      caseMaterialityCents: 50000n,
      anomalyMinimumCohort: 40,
      anomalyThresholdCents: 250n,
      pursuit: { staffRateCentsPerHour: 4500n, minutesPerPacket: 90, minutesPerFollowUp: 20 },
    });
  });

  it('has no pursuit estimate until all three pursuit settings are stated', () => {
    expect(triageSettings({ staff_rate_cents_per_hour: '4500', minutes_per_packet: 90 }).pursuit).toBeNull();
  });

  it.each([
    [{ line_materiality_cents: 500 }, 'line_materiality_cents'],
    [{ case_materiality_cents: '250.00' }, 'case_materiality_cents'],
    [{ anomaly_minimum_cohort: 0 }, 'anomaly_minimum_cohort'],
    [JSON.parse('{"minutes_per_packet": 1.5}') as object, 'minutes_per_packet'],
  ])('refuses a malformed setting rather than using its default (%j)', (stored, key) => {
    expect(() => triageSettings(stored)).toThrow(TriageSettingsError);
    expect(() => triageSettings(stored)).toThrow(new RegExp(key));
  });
});
