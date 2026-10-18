import { readFileSync } from 'node:fs';
import path from 'node:path';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { buildZip } from './test-support/zip-writer';
import { EICAR, HEAD_BYTES, ISA_SEPARATOR_POSITIONS, signatureOf, sniff, validIsaHeader } from './sniff';

const FIXTURES = path.resolve(import.meta.dirname, '../../../../fixtures/synthetic');
const fixture = (relative: string) => readFileSync(path.join(FIXTURES, relative)).subarray(0, HEAD_BYTES);

/** The synthetic ISA header of PAR-01 (sender SYNTHSENDER, GS02 SYNTH), 106 characters. */
const ISA = fixture('PAR-01/remit.835').subarray(0, 106);

describe('sniff', () => {
  it('knows an 835 by its ISA header, with any delimiters and after a byte order mark (PAR-01, PAR-04, PAR-05)', () => {
    expect(ISA.length).toBe(106);
    for (const file of ['PAR-01/remit.835', 'PAR-04/remit.835', 'PAR-05/remit.835', 'PAR-25/truncated.835']) {
      expect(sniff(fixture(file)), file).toEqual({ type: 'x12' });
    }
    // An 837 or a 277 is an X12 interchange too: the parser refuses it as EDI_NOT_835 (PAR-24).
    expect(sniff(fixture('PAR-24/claim-status-277.835'))).toEqual({ type: 'x12' });
  });

  it('refuses an ISA header that is not 106 characters with its separators in place', () => {
    const header = Buffer.from(ISA);
    expect(validIsaHeader(header)).toBe(true);
    expect(sniff(header.subarray(0, 105))).toEqual({ type: 'x12_malformed' });
    const moved = Buffer.from(header);
    moved.write('**', 5, 'latin1');
    expect(sniff(moved)).toEqual({ type: 'x12_malformed' });
    const lettered = Buffer.from(header);
    lettered.write('A', 103, 'latin1');
    expect(validIsaHeader(lettered)).toBe(false);
    const sameDelimiters = Buffer.from(header);
    sameDelimiters.write('*', 104, 'latin1');
    expect(validIsaHeader(sameDelimiters)).toBe(false);
    const spaced = Buffer.from(header);
    spaced.write(' ', 105, 'latin1');
    expect(validIsaHeader(spaced)).toBe(false);
    const letters = Buffer.from(header);
    letters.write('ABCDEFGHI', 90, 'latin1');
    expect(validIsaHeader(letters)).toBe(false);
    expect(validIsaHeader(Buffer.from(`ISB${header.subarray(3).toString('latin1')}`, 'latin1'))).toBe(false);
    expect(ISA_SEPARATOR_POSITIONS).toHaveLength(16);
  });

  it('accepts a header whose segment terminator is a line break', () => {
    const header = Buffer.from(ISA);
    header.write('\n', 105, 'latin1');
    expect(sniff(header)).toEqual({ type: 'x12' });
  });

  it('knows zips, PDFs, legacy workbooks and CSV by their bytes, whatever their names', () => {
    expect(sniff(buildZip([{ name: 'a.835', data: Buffer.from('x') }]))).toEqual({ type: 'zip' });
    expect(sniff(Buffer.from('PK\u0005\u0006' + '\u0000'.repeat(18), 'latin1'))).toEqual({ type: 'zip' });
    expect(sniff(Buffer.from('%PDF-1.7\n%synthetic contract\n'))).toEqual({ type: 'pdf' });
    expect(sniff(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]))).toEqual({ type: 'ole2' });
    expect(sniff(Buffer.from('check,amount,posted\nSYN-1,10.00,2026-01-02\n'))).toEqual({ type: 'csv' });
    expect(sniff(Buffer.from('﻿trace;amount\n'))).toEqual({ type: 'csv' });
    expect(sniff(Buffer.alloc(0))).toEqual({ type: 'empty' });
    expect(sniff(Buffer.from('a plain sentence with no delimiters\n'))).toEqual({ type: 'unknown' });
    expect(sniff(Buffer.from([0x01, 0x02, 0x03, 0x2c, 0x05, 0x06]))).toEqual({ type: 'unknown' });
    expect(sniff(Buffer.from('a,b\u0000c'))).toEqual({ type: 'unknown' });
    expect(sniff(Buffer.from('PK'))).toEqual({ type: 'unknown' });
  });

  it('knows executables, scripts and the EICAR test file, before anything else (PAR-28)', () => {
    const elf = fixture('PAR-28/upload.zip');
    expect(sniff(elf)).toEqual({ type: 'zip' });
    expect(signatureOf(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]))).toBe('executable');
    expect(signatureOf(Buffer.concat([Buffer.from('MZ'), Buffer.alloc(62)]))).toBe('executable');
    expect(signatureOf(Buffer.from('MZ,amount\n'))).toBeUndefined();
    for (const magic of [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe]) {
      const bytes = Buffer.alloc(8);
      bytes.writeUInt32BE(magic, 0);
      expect(signatureOf(bytes)).toBe('executable');
    }
    expect(signatureOf(Buffer.from('#!/bin/sh\necho synthetic\n'))).toBe('script');
    expect(signatureOf(Buffer.from('﻿#!/usr/bin/env node\n'))).toBe('script');
    expect(sniff(Buffer.from(EICAR))).toEqual({ type: 'signature', signature: 'eicar_test_file' });
    expect(sniff(Buffer.from(`ISA*${EICAR}`))).toEqual({ type: 'signature', signature: 'eicar_test_file' });
    expect(EICAR).toHaveLength(68);
    expect(signatureOf(Buffer.from('M'))).toBeUndefined();
    expect(signatureOf(Buffer.from('#'))).toBeUndefined();
  });

  it('never calls delimited text an executable or a script (property)', () => {
    fc.assert(
      fc.property(fc.string({ unit: fc.constantFrom(...'abcXYZ019,;.-# \n'.split('')), maxLength: 200 }), (text) => {
        const head = Buffer.from(text);
        const found = signatureOf(head);
        expect(found === undefined || (found === 'script' && text.startsWith('#!'))).toBe(true);
      }),
    );
  });
});
