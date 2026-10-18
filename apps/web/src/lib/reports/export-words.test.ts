import { describe, expect, it } from 'vitest';

import { EXPORT_FILE_WORDS, EXPORT_RECORD_WORDS, exportWhat } from './export-words';

/** The export history's entries in words (the screen tour's C1: "PDF of a audit report"). */

describe('an export history entry', () => {
  it('names the file and the record it is of, each record with its own article', () => {
    expect(exportWhat({ file: 'pdf', kind: 'audit_report' })).toBe('PDF of an audit report');
    expect(exportWhat({ file: 'line_csv', kind: 'audit_report' })).toBe('line CSV of an audit report');
    expect(exportWhat({ file: 'pdf', kind: 'roi_statement' })).toBe('PDF of an ROI statement');
    expect(exportWhat({ file: 'csv', kind: 'report_document' })).toBe('CSV of a report');
    expect(exportWhat({ file: 'csv', kind: 'monthly_summary' })).toBe('CSV of the monthly summary');
    expect(exportWhat({ file: 'packet', kind: 'packet_export' })).toBe('PDF or CSV schedule of a packet, identifiers inserted');
  });

  it('never puts "a" before a vowel, nor "an" before a consonant sound, for any file of any record', () => {
    for (const file of Object.keys(EXPORT_FILE_WORDS) as (keyof typeof EXPORT_FILE_WORDS)[]) {
      for (const kind of Object.keys(EXPORT_RECORD_WORDS) as (keyof typeof EXPORT_RECORD_WORDS)[]) {
        const what = exportWhat({ file, kind });
        expect(what, what).not.toMatch(/\ba [aeiou]/i);
        expect(what, what).not.toMatch(/\ban (?![aeiou]|ROI\b)/i);
      }
    }
  });
});
