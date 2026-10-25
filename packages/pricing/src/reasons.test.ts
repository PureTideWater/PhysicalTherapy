import { describe, expect, it } from 'vitest';

import { ENGINE_ERROR_DETAILS, EngineInputError, REVIEW_DETAILS, pagesOperator } from './reasons';

describe('EngineInputError', () => {
  it('names itself and its detail, and says no more than the fixed code', () => {
    for (const detail of ENGINE_ERROR_DETAILS) {
      const error = new EngineInputError(detail);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('EngineInputError');
      expect(error.message).toBe(`pricing input problem: ${detail}`);
      expect(error.detail).toBe(detail);
      expect(String(error)).toBe(`EngineInputError: pricing input problem: ${detail}`);
    }
  });

  it('pages the operator for every detail but the two held for review', () => {
    expect(ENGINE_ERROR_DETAILS.filter((detail) => !pagesOperator(detail)).sort()).toEqual([...REVIEW_DETAILS].sort());
  });
});
