import { DOCUMENT_KINDS, type DocumentKind } from '@tp/db';
import { describe, expect, it } from 'vitest';

import { ACCEPTED_CONTENT, PARSED_KINDS, dispose } from './classify';
import type { Sniffed } from './sniff';

const top = { entry: false };
const entry = { entry: true };

describe('dispose', () => {
  it('queues a clean 835 for parse and stores a clean document of another kind', () => {
    expect(dispose('x12_835', { type: 'x12' }, top)).toEqual({ action: 'parse', status: 'scanned' });
    expect(dispose('x12_835', { type: 'x12' }, entry)).toEqual({ action: 'parse', status: 'scanned' });
    expect(dispose('contract', { type: 'pdf' }, top)).toEqual({ action: 'store', status: 'stored' });
    expect(dispose('posting_export', { type: 'csv' }, top)).toEqual({ action: 'store', status: 'stored' });
    expect(dispose('eft_export', { type: 'csv' }, entry)).toEqual({ action: 'store', status: 'stored' });
    expect(dispose('exhibit', { type: 'zip' }, { entry: false, spreadsheetZip: true })).toEqual({ action: 'store', status: 'stored' });
    expect(dispose('other', { type: 'unknown' }, top)).toEqual({ action: 'store', status: 'stored' });
  });

  it('holds what is not the declared kind with its reason: not an 835, or not the declared type', () => {
    expect(dispose('x12_835', { type: 'pdf' }, top)).toEqual({ action: 'hold', status: 'not_835' });
    expect(dispose('x12_835', { type: 'zip' }, { entry: false, spreadsheetZip: true })).toEqual({ action: 'hold', status: 'not_835' });
    expect(dispose('contract', { type: 'csv' }, top)).toEqual({ action: 'hold', status: 'wrong_type' });
    expect(dispose('contract', { type: 'x12_malformed' }, top)).toEqual({ action: 'hold', status: 'wrong_type' });
    expect(dispose('payer_letter', { type: 'x12' }, top)).toEqual({ action: 'hold', status: 'wrong_type' });
  });

  it('holds a posting or EFT export that is a workbook, .xlsx or .xls, as not its type: exports are read as CSV only (docs/adr/0059)', () => {
    for (const kind of ['posting_export', 'eft_export'] as const) {
      expect(ACCEPTED_CONTENT[kind]).toEqual(new Set(['csv']));
      expect(dispose(kind, { type: 'zip' }, { entry: false, spreadsheetZip: true })).toEqual({ action: 'hold', status: 'wrong_type' });
      expect(dispose(kind, { type: 'zip' }, { entry: true, spreadsheetZip: true })).toEqual({ action: 'hold', status: 'wrong_type' });
      expect(dispose(kind, { type: 'ole2' }, top)).toEqual({ action: 'hold', status: 'wrong_type' });
      expect(dispose(kind, { type: 'pdf' }, top)).toEqual({ action: 'hold', status: 'wrong_type' });
      // A zip of exports is still expanded, each entry judged on its own.
      expect(dispose(kind, { type: 'zip' }, top)).toEqual({ action: 'expand' });
    }
  });

  it('queues a clean ERA export for parse as CSV only, and holds a workbook, an 835 or a PDF declared as one as not its type (docs/adr/0060)', () => {
    expect(ACCEPTED_CONTENT.era_export).toEqual(new Set(['csv']));
    expect([...PARSED_KINDS].sort()).toEqual(['era_export', 'x12_835']);
    expect(dispose('era_export', { type: 'csv' }, top)).toEqual({ action: 'parse', status: 'scanned' });
    expect(dispose('era_export', { type: 'csv' }, entry)).toEqual({ action: 'parse', status: 'scanned' });
    expect(dispose('era_export', { type: 'zip' }, { entry: false, spreadsheetZip: true })).toEqual({ action: 'hold', status: 'wrong_type' });
    expect(dispose('era_export', { type: 'zip' }, { entry: true, spreadsheetZip: true })).toEqual({ action: 'hold', status: 'wrong_type' });
    expect(dispose('era_export', { type: 'ole2' }, top)).toEqual({ action: 'hold', status: 'wrong_type' });
    expect(dispose('era_export', { type: 'x12' }, top)).toEqual({ action: 'hold', status: 'wrong_type' });
    expect(dispose('era_export', { type: 'x12_malformed' }, top)).toEqual({ action: 'hold', status: 'wrong_type' });
    expect(dispose('era_export', { type: 'pdf' }, top)).toEqual({ action: 'hold', status: 'wrong_type' });
    expect(dispose('era_export', { type: 'unknown' }, top)).toEqual({ action: 'hold', status: 'wrong_type' });
    expect(dispose('era_export', { type: 'empty' }, top)).toEqual({ action: 'hold', status: 'unreadable' });
    // A zip of exports is expanded, each entry judged on its own.
    expect(dispose('era_export', { type: 'zip' }, top)).toEqual({ action: 'expand' });
  });

  it('expands a zip, but holds a zip inside a zip', () => {
    expect(dispose('x12_835', { type: 'zip' }, top)).toEqual({ action: 'expand' });
    expect(dispose('x12_835', { type: 'zip' }, entry)).toEqual({ action: 'hold', status: 'nested_zip' });
  });

  it('quarantines an executable, a script or the EICAR file whatever the kind, and holds empty or broken 835s as unreadable', () => {
    for (const kind of DOCUMENT_KINDS) {
      for (const signature of ['executable', 'script', 'eicar_test_file'] as const) {
        expect(dispose(kind, { type: 'signature', signature }, top)).toEqual({ action: 'hold', status: 'quarantined' });
      }
      expect(dispose(kind, { type: 'empty' }, entry)).toEqual({ action: 'hold', status: 'unreadable' });
    }
    expect(dispose('x12_835', { type: 'x12_malformed' }, top)).toEqual({ action: 'hold', status: 'unreadable' });
    // A legacy .xls is no exhibit: its pages cannot be cited (ADR 0033); an .xlsx is.
    expect(dispose('exhibit', { type: 'ole2' }, top)).toEqual({ action: 'hold', status: 'wrong_type' });
    expect(dispose('exhibit', { type: 'zip' }, { ...top, spreadsheetZip: true })).toEqual({ action: 'store', status: 'stored' });
  });

  it('gives every kind and content a disposition, and accepts for each kind exactly its contents', () => {
    const contents: readonly Sniffed[] = [{ type: 'x12' }, { type: 'pdf' }, { type: 'ole2' }, { type: 'csv' }, { type: 'unknown' }];
    const classes = { x12: 'x12', pdf: 'pdf', ole2: 'legacy_spreadsheet', csv: 'csv', unknown: 'unknown' } as const;
    for (const kind of DOCUMENT_KINDS as readonly DocumentKind[]) {
      for (const content of contents) {
        const accepted = ACCEPTED_CONTENT[kind].has(classes[content.type as keyof typeof classes]);
        expect(dispose(kind, content, top).action, `${kind} ${content.type}`).toBe(accepted ? (PARSED_KINDS.has(kind) ? 'parse' : 'store') : 'hold');
      }
    }
  });
});
