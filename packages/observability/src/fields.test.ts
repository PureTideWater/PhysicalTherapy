import { describe, expect, it } from 'vitest';

import { ALLOWED_LOG_FIELDS, NUMERIC_LOG_FIELDS, forbiddenFieldLabel, isAllowedLogField, isNumericLogField } from './fields';

describe('ALLOWED_LOG_FIELDS', () => {
  it('holds only identifier and code fields', () => {
    for (const field of ALLOWED_LOG_FIELDS) {
      expect(field).toMatch(/^[a-z]+(_[a-z]+)*_(id|no|type|code)$/);
    }
  });

  it('never contains a forbidden field', () => {
    for (const field of [...ALLOWED_LOG_FIELDS, ...NUMERIC_LOG_FIELDS]) {
      expect(forbiddenFieldLabel(field), field).toBeUndefined();
    }
  });

  it('has no duplicates', () => {
    const all = [...ALLOWED_LOG_FIELDS, ...NUMERIC_LOG_FIELDS];
    expect(new Set(all).size).toBe(all.length);
  });

  it('answers membership', () => {
    expect(isAllowedLogField('practice_id')).toBe(true);
    expect(isAllowedLogField('elapsed_ms')).toBe(true);
    expect(isAllowedLogField('patient_name')).toBe(false);
  });
});

describe('NUMERIC_LOG_FIELDS', () => {
  it('names a measure, milliseconds or a count, and nothing that could hold text', () => {
    expect([...NUMERIC_LOG_FIELDS]).toEqual(['elapsed_ms', 'record_count']);
    for (const field of NUMERIC_LOG_FIELDS) {
      expect(field).toMatch(/^[a-z]+(_[a-z]+)*_(ms|count)$/);
      expect(isNumericLogField(field)).toBe(true);
    }
    expect(isNumericLogField('practice_id')).toBe(false);
  });
});

describe('forbiddenFieldLabel', () => {
  it.each([
    ['name', 'name'],
    ['first_name', 'name'],
    ['patientName', 'name'],
    ['dob', 'date of birth'],
    ['patient_dob', 'date of birth'],
    ['birth_date', 'date of birth'],
    ['member_id', 'member ID'],
    ['subscriber_id', 'member ID'],
    ['claim_number', 'claim number'],
    ['patient_control_number', 'claim number'],
    ['payer_claim_control_number', 'claim number'],
    ['pcn', 'claim number'],
    ['document_text', 'document text'],
    ['page_text', 'document text'],
    ['body', 'document text'],
  ])('flags %s as %s', (key, label) => {
    expect(forbiddenFieldLabel(key)).toBe(label);
  });

  it.each(['practice_id', 'claim_id', 'job_type', 'error_code', 'release_no'])('allows %s', (key) => {
    expect(forbiddenFieldLabel(key)).toBeUndefined();
  });
});
