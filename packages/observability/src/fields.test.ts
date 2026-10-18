import { describe, expect, it } from 'vitest';

import { ALLOWED_LOG_FIELDS, forbiddenFieldLabel, isAllowedLogField } from './fields';

describe('ALLOWED_LOG_FIELDS', () => {
  it('holds only identifier and code fields', () => {
    for (const field of ALLOWED_LOG_FIELDS) {
      expect(field).toMatch(/^[a-z]+(_[a-z]+)*_(id|no|type|code)$/);
    }
  });

  it('never contains a forbidden field', () => {
    for (const field of ALLOWED_LOG_FIELDS) {
      expect(forbiddenFieldLabel(field), field).toBeUndefined();
    }
  });

  it('has no duplicates', () => {
    expect(new Set(ALLOWED_LOG_FIELDS).size).toBe(ALLOWED_LOG_FIELDS.length);
  });

  it('answers membership', () => {
    expect(isAllowedLogField('practice_id')).toBe(true);
    expect(isAllowedLogField('patient_name')).toBe(false);
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
