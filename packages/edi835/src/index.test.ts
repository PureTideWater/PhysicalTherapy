import { describe, expect, it } from 'vitest';

import { EDI_ERROR_CODES, TRANSACTION_VERSION } from './index';

describe('@tp/edi835', () => {
  it('reads the 005010X221A1 version of the 835', () => {
    expect(TRANSACTION_VERSION).toBe('005010X221A1');
  });

  it('has the closed list of typed errors from PRD section 10', () => {
    expect(EDI_ERROR_CODES).toEqual([
      'EDI_SYNTAX',
      'EDI_CONTROL_MISMATCH',
      'EDI_UNBALANCED',
      'EDI_UNKNOWN_CODE',
      'EDI_DUPLICATE',
      'EDI_NOT_835',
    ]);
  });
});
