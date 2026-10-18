import { describe, expect, it } from 'vitest';

import { declaredTypeProblem, spreadsheetExportProblem } from './csv-exports';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLS = 'application/vnd.ms-excel';
const SAVE = 'posting and EFT exports are read as CSV only. Save it as CSV (comma-separated) and upload it again.';
const EXPORT_AGAIN = 'ERA exports are read as CSV only. Export it from the system as CSV (comma-separated) and upload that file.';

describe('a spreadsheet chosen as a posting, EFT or ERA export (docs/adr/0059 and 0060)', () => {
  it('is refused before the request, named by its place in the batch, by name or by declared type', () => {
    for (const kind of ['posting_export', 'eft_export']) {
      expect(spreadsheetExportProblem(kind, { name: 'June.xlsx', type: XLSX }, 2)).toBe(`File 2 is a spreadsheet: ${SAVE}`);
      expect(spreadsheetExportProblem(kind, { name: 'june.XLS', type: XLS }, 1)).toBe(`File 1 is a spreadsheet: ${SAVE}`);
      expect(spreadsheetExportProblem(kind, { name: 'export', type: XLSX }, 3)).toBe(`File 3 is a spreadsheet: ${SAVE}`);
      for (const name of ['a.xlsm', 'a.xlsb', 'a.xltx', 'a.ods', 'a.numbers']) {
        expect(spreadsheetExportProblem(kind, { name, type: '' }, 1), name).not.toBeNull();
      }
      // A .csv that a Windows browser declares as the legacy Excel type is a CSV.
      expect(spreadsheetExportProblem(kind, { name: 'export.csv', type: XLS }, 1)).toBeNull();
      expect(spreadsheetExportProblem(kind, { name: 'export.csv', type: 'text/csv' }, 1)).toBeNull();
      expect(spreadsheetExportProblem(kind, { name: 'exports.zip', type: 'application/zip' }, 1)).toBeNull();
    }
    // An ERA export is CSV only too, with its own remedy: it is exported from the practice-management system.
    expect(spreadsheetExportProblem('era_export', { name: 'remits.xlsx', type: XLSX }, 2)).toBe(`File 2 is a spreadsheet: ${EXPORT_AGAIN}`);
    expect(spreadsheetExportProblem('era_export', { name: 'remits.csv', type: XLS }, 1)).toBeNull();
    expect(spreadsheetExportProblem('era_export', { name: 'remits.zip', type: 'application/zip' }, 1)).toBeNull();
    expect(spreadsheetExportProblem('x12_835', { name: 'remits.xlsx', type: XLSX }, 1)).toBeNull();
    // An exhibit may be a workbook (docs/adr/0033), and so may another document.
    expect(spreadsheetExportProblem('exhibit', { name: 'fees.xlsx', type: XLSX }, 1)).toBeNull();
    expect(spreadsheetExportProblem('other', { name: 'fees.xlsx', type: XLSX }, 1)).toBeNull();
  });

  it('is named by the request too, with what to do; another kind keeps its message', () => {
    expect(declaredTypeProblem('posting_export', 4)).toBe(`File 4 is not a CSV: ${SAVE}`);
    expect(declaredTypeProblem('eft_export', 1)).toBe(`File 1 is not a CSV: ${SAVE}`);
    expect(declaredTypeProblem('era_export', 3)).toBe(`File 3 is not a CSV: ${EXPORT_AGAIN}`);
    expect(declaredTypeProblem('x12_835', 1)).toBe('not a type of file this kind of document accepts');
  });
});
