import { describe, expect, it } from 'vitest';

import { CONTENT_TYPES, allowedContentType } from './limits';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLS = 'application/vnd.ms-excel';

describe('the types an upload may be declared as (PRD 6; docs/adr/0033, 0059)', () => {
  it('takes a posting or EFT export as CSV only: never declared .xlsx, and .xls only because browsers declare a .csv so', () => {
    for (const kind of ['posting_export', 'eft_export'] as const) {
      expect(allowedContentType(kind, 'text/csv')).toBe(true);
      expect(allowedContentType(kind, 'text/plain')).toBe(true);
      expect(allowedContentType(kind, 'application/zip')).toBe(true);
      // Windows browsers declare a .csv as the legacy Excel type where Excel is installed; the worker sniffs the bytes and holds a workbook.
      expect(allowedContentType(kind, XLS)).toBe(true);
      expect(allowedContentType(kind, XLSX)).toBe(false);
      expect(allowedContentType(kind, 'application/octet-stream')).toBe(false);
    }
  });

  it('takes an ERA export as CSV only, like a posting export (docs/adr/0060)', () => {
    expect(CONTENT_TYPES.era_export).toEqual(['text/csv', 'text/plain', XLS, 'application/zip', 'application/x-zip-compressed']);
    expect(allowedContentType('era_export', XLSX)).toBe(false);
    expect(allowedContentType('era_export', 'application/edi-x12')).toBe(false);
    expect(allowedContentType('era_export', 'application/octet-stream')).toBe(false);
  });

  it('still takes an .xlsx exhibit, whose pages can be cited, and a workbook as another document', () => {
    expect(allowedContentType('exhibit', XLSX)).toBe(true);
    expect(allowedContentType('exhibit', XLS)).toBe(false);
    expect(CONTENT_TYPES.other).toEqual(expect.arrayContaining([XLSX, XLS]));
  });
});
