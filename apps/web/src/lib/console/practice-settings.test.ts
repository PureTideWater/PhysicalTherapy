import { triageSettings } from '@tp/triage';
import { describe, expect, it } from 'vitest';

import { PRACTICE_SETTING_KEYS, PracticeSettingsError, practiceSettingsInput, settingsDocument, settingsForm } from './practice-settings';

/** The console's practice settings form (PRD 5, J8; PRD 11, Inputs; PRD 12, Deadlines and pursuit cost). SYNTHETIC values only. */

const parse = (form: Record<string, string>) => practiceSettingsInput.parse(form);

describe('a practice’s pricing and triage settings from the console', () => {
  it('stores the places, rounding, materiality, anomaly and pursuit settings as the readers read them', () => {
    const document = settingsDocument(
      parse({
        facilityPlaces: '22, 19',
        nonFacilityPlaces: '11',
        defaultRounding: 'HALF_UP_CENT',
        lineMateriality: '5.00',
        caseMateriality: '250',
        anomalyMinimumCohort: '30',
        anomalyThreshold: '7.5',
        staffRatePerHour: '60.00',
        minutesPerPacket: '45',
        minutesPerFollowUp: '30',
      }),
    );
    expect(document).toEqual({
      settings: {
        place_of_service_settings: { '11': 'non_facility', '19': 'facility', '22': 'facility' },
        default_rounding: 'HALF_UP_CENT',
        line_materiality_cents: '500',
        case_materiality_cents: '25000',
        anomaly_minimum_cohort: 30,
        anomaly_threshold_cents: '750',
        staff_rate_cents_per_hour: '6000',
        minutes_per_packet: 45,
        minutes_per_follow_up: 30,
      },
    });
    expect(Object.keys(document.settings).every((key) => (PRACTICE_SETTING_KEYS as readonly string[]).includes(key))).toBe(true);
    expect(triageSettings(document.settings)).toMatchObject({ lineMaterialityCents: 500n, caseMaterialityCents: 25000n, pursuit: { staffRateCentsPerHour: 6000n, minutesPerPacket: 45, minutesPerFollowUp: 30 } });
    // And back to the form, as the console shows it.
    expect(settingsForm(document.settings)).toEqual({
      facilityPlaces: '19, 22',
      nonFacilityPlaces: '11',
      defaultRounding: 'HALF_UP_CENT',
      lineMateriality: '5.00',
      caseMateriality: '250.00',
      anomalyMinimumCohort: '30',
      anomalyThreshold: '7.50',
      staffRatePerHour: '60.00',
      minutesPerPacket: '45',
      minutesPerFollowUp: '30',
    });
  });

  it('leaves a blank field to its default, and reads an empty or odd document as blank', () => {
    expect(settingsDocument(parse({ lineMateriality: ' ' }))).toEqual({ settings: {} });
    expect(settingsForm({})).toMatchObject({ facilityPlaces: '', lineMateriality: '', minutesPerPacket: '' });
    expect(settingsForm('not an object')).toMatchObject({ defaultRounding: '', caseMateriality: '' });
    expect(settingsForm({ line_materiality_cents: 500, minutes_per_packet: '45', place_of_service_settings: [] })).toMatchObject({ lineMateriality: '', minutesPerPacket: '', facilityPlaces: '' });
  });

  it('takes no billing ZIP: the location has its own form and setter (PR 6b)', () => {
    expect(Object.keys(practiceSettingsInput.shape)).not.toContain('zip');
    expect(Object.keys(settingsDocument(parse({ zip: '00011' })))).toEqual(['settings']);
  });

  it('refuses what a run or triage would refuse', () => {
    for (const form of [{ facilityPlaces: '1' }, { defaultRounding: 'HALF_UP' }, { lineMateriality: '5.001' }, { caseMateriality: '-1' }, { anomalyMinimumCohort: '0' }, { minutesPerPacket: '10001' }]) {
      expect(practiceSettingsInput.safeParse(form).success, JSON.stringify(form)).toBe(false);
    }
    expect(() => settingsDocument(parse({ facilityPlaces: '11', nonFacilityPlaces: '11' }))).toThrow(PracticeSettingsError);
    expect(() => settingsDocument(parse({ staffRatePerHour: '60.00' }))).toThrow(/staff rate and both times together/);
  });
});
