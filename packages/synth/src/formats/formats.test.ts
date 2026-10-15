import { describe, expect, it } from 'vitest';

import { calendarDate } from '../core/dates';
import { dollars } from '../x12/factory';
import { EFT_EXPORT_HEADER, POSTING_EXPORT_HEADER, eftExport, postingExport } from './csv';
import { EXHIBIT_BANNER, exhibitPageLines, exhibitPdf, exhibitText } from './exhibit';
import { writePdf } from './pdf';
import { readZip, writeZip } from './zip';

describe('zip', () => {
  it('writes stored entries that read back, the same bytes every time', () => {
    const entries = [
      { name: 'a.835', bytes: new Uint8Array(Buffer.from('ISA*one')) },
      { name: 'dir/b.835', bytes: new Uint8Array(Buffer.from('ISA*two')) },
    ];
    const archive = writeZip(entries);
    expect(Buffer.from(writeZip(entries)).equals(Buffer.from(archive))).toBe(true);
    expect(readZip(archive).map((entry) => [entry.name, Buffer.from(entry.bytes).toString()])).toEqual([
      ['a.835', 'ISA*one'],
      ['dir/b.835', 'ISA*two'],
    ]);
    expect(Buffer.from(archive).readUInt32LE(archive.length - 22)).toBe(0x06054b50);
  });

  it('refuses names that are not plain paths, and deflated entries on reading', () => {
    for (const name of ['../x', '/x', 'a b', 'a//b']) {
      expect(() => writeZip([{ name, bytes: new Uint8Array() }]), name).toThrow(/plain ASCII/);
    }
    const archive = Buffer.from(writeZip([{ name: 'a', bytes: new Uint8Array(Buffer.from('x')) }]));
    archive.writeUInt16LE(8, 8);
    expect(() => readZip(new Uint8Array(archive))).toThrow(/stored/);
  });
});

describe('pdf', () => {
  it('writes one page per exhibit page with the text readable in the file and a valid cross-reference', () => {
    const pdf = Buffer.from(writePdf([['Page one (first)'], ['Page two \\ back']], 'SYNTHETIC title')).toString('latin1');
    expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
    expect(pdf).toContain('/Count 2');
    expect(pdf).toContain('(Page one \\(first\\)) Tj');
    expect(pdf).toContain('(Page two \\\\ back) Tj');
    const xref = Number.parseInt(/startxref\n(\d+)\n%%EOF\n$/.exec(pdf)?.[1] ?? '0', 10);
    expect(pdf.slice(xref, xref + 4)).toBe('xref');
    const offsets = [...pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number.parseInt(match[1] ?? '0', 10));
    offsets.forEach((offset, index) => expect(pdf.slice(offset).startsWith(`${String(index + 1)} 0 obj`)).toBe(true));
  });

  it('refuses no pages and non-ASCII text', () => {
    expect(() => writePdf([], 't')).toThrow(/one page/);
    expect(() => writePdf([['café']], 't')).toThrow(/ASCII/);
  });
});

describe('exhibits', () => {
  const exhibit = { title: 'SYNTHETIC agreement', pages: [{ heading: 'Article 1', lines: ['One.'] }, { heading: 'Exhibit A', lines: ['97110  $44.00 per unit'] }] };

  it('puts the banner, title and page number on every page, in text and PDF alike', () => {
    const lines = exhibitPageLines(exhibit);
    expect(lines[1]?.slice(0, 3)).toEqual([EXHIBIT_BANNER, 'SYNTHETIC agreement', 'Page 2 of 2']);
    expect(exhibitText(exhibit).split('\f')).toHaveLength(2);
    expect(Buffer.from(exhibitPdf(exhibit)).toString('latin1')).toContain('(97110  $44.00 per unit) Tj');
  });
});

describe('exports', () => {
  it('writes the posting export with US dates, quoting and CRLF', () => {
    const text = postingExport([
      { postedOn: calendarDate(2026, 6, 11), checkOrTrace: '881', payerName: 'SYNTHETIC PAYER, A', amount: dollars('24.00'), batch: 'B1' },
      { postedOn: calendarDate(2026, 6, 12), checkOrTrace: '882', payerName: 'P "Q"', claimReference: 'SYNPCN1', procedureCode: '97110', serviceDate: calendarDate(2026, 3, 9), amount: dollars('-5.00'), batch: 'B2' },
    ]);
    expect(text.split('\r\n')).toEqual([POSTING_EXPORT_HEADER.join(','), '06/11/2026,881,"SYNTHETIC PAYER, A",,,,24.00,B1', '06/12/2026,882,"P ""Q""",SYNPCN1,97110,03/09/2026,-5.00,B2', '']);
  });

  it('writes the bank export with ISO dates', () => {
    expect(eftExport([{ depositedOn: calendarDate(2026, 6, 9), description: 'D', trace: 'T', amount: dollars('30.00'), batchReference: 'X' }]).split('\r\n')).toEqual([EFT_EXPORT_HEADER.join(','), '2026-06-09,D,T,30.00,X', '']);
  });
});
