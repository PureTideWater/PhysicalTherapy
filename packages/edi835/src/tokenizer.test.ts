import { describe, expect, it } from 'vitest';

import { type EdiError } from './errors';
import { ISA_LENGTH, MAX_SEGMENT_LENGTH, type Segment, Tokenizer, readIsaHeader, segmentIdOf } from './tokenizer';
import { syntheticInterchange, syntheticIsa } from './testing';

function tokenize(chunks: readonly string[]): { segments: Segment[]; errors: EdiError[]; tokenizer: Tokenizer } {
  const segments: Segment[] = [];
  const errors: EdiError[] = [];
  const tokenizer = new Tokenizer({ segment: (segment) => segments.push(segment), error: (error) => errors.push(error) });
  for (const chunk of chunks) {
    tokenizer.write(chunk);
  }
  tokenizer.end();
  return { segments, errors, tokenizer };
}

const position = (error: EdiError | undefined) => (error === undefined ? undefined : { code: error.code, segmentIndex: error.segmentIndex, segmentId: error.segmentId, elementPosition: error.elementPosition, reason: error.reason });

describe('the ISA header', () => {
  it('is 106 characters and gives the delimiters from positions 4, 105 and 106 and ISA11', () => {
    const isa = syntheticIsa();
    expect(isa).toHaveLength(ISA_LENGTH);
    const header = readIsaHeader(isa, 1);
    expect(header).toEqual({
      delimiters: { element: '*', component: ':', repetition: '^', segment: '~' },
      elements: ['00', '          ', '00', '          ', 'ZZ', 'SYNTHSENDER    ', 'ZZ', 'SYNTHRECEIVER  ', '260406', '0915', '^', '00501', '000000001', '0', 'T', ':'],
    });
  });

  it('refuses an element whose width is not the fixed width, at that element', () => {
    const narrow = syntheticIsa().replace('SYNTHSENDER    ', 'SYNTHSENDER   ') + ' ';
    expect(position(readIsaHeader(narrow, 1) as EdiError)).toEqual({ code: 'EDI_SYNTAX', segmentIndex: 1, segmentId: 'ISA', elementPosition: 6, reason: 'header' });
    const shifted = `ISA*0*${syntheticIsa().slice(6)} `;
    expect(position(readIsaHeader(shifted, 3) as EdiError)).toMatchObject({ segmentIndex: 3, elementPosition: 1 });
  });

  it('refuses a delimiter that is a letter, digit or space, or the same as an earlier one', () => {
    const base = syntheticIsa();
    const withRepetition = (character: string) => base.replace('*^*', `*${character}*`);
    expect(position(readIsaHeader(withRepetition('U'), 1) as EdiError)).toMatchObject({ elementPosition: 11, reason: 'header' });
    expect(position(readIsaHeader(withRepetition('*'), 1) as EdiError)).toMatchObject({ elementPosition: 11 });
    expect(position(readIsaHeader(`${base.slice(0, 104)}^~`, 1) as EdiError)).toMatchObject({ elementPosition: 16 });
    expect(position(readIsaHeader(`${base.slice(0, 105)}:`, 1) as EdiError)).toMatchObject({ elementPosition: 16 });
    expect(position(readIsaHeader(`${base.slice(0, 105)}A`, 1) as EdiError)).toMatchObject({ elementPosition: 16 });
    const letters = base.replaceAll('*', 'X');
    expect(position(readIsaHeader(letters, 1) as EdiError)).toMatchObject({ elementPosition: 1 });
  });
});

describe('the tokenizer', () => {
  it('reads segments with their index, ID, raw elements and delimiters, across any chunk boundaries', () => {
    const text = syntheticInterchange();
    const whole = tokenize([text]);
    const byCharacter = tokenize([...text]);
    expect(whole.errors).toEqual([]);
    expect(byCharacter.segments).toEqual(whole.segments);
    expect(whole.segments.map((segment) => segment.index)).toEqual(whole.segments.map((_segment, index) => index + 1));
    expect(whole.segments[0]?.id).toBe('ISA');
    expect(whole.segments.find((segment) => segment.id === 'SVC')?.elements).toEqual(['HC:97110:GP', '150.00', '100.00', '', '2']);
    expect(whole.tokenizer.segments).toBe(whole.segments.length);
    expect(whole.tokenizer.peakBuffered).toBeGreaterThanOrEqual(text.length);
    expect(byCharacter.tokenizer.peakBuffered).toBeLessThan(ISA_LENGTH + 1);
  });

  it('skips a byte-order mark, line breaks and spaces between segments and at the end, unless they are delimiters', () => {
    const plain = tokenize([syntheticInterchange()]).segments;
    const crlf = tokenize(['﻿', syntheticInterchange().replaceAll('~', '~\r\n'), '  \n']);
    expect(crlf.errors).toEqual([]);
    expect(crlf.tokenizer.bom).toBe(true);
    expect(crlf.segments.map((segment) => [segment.id, segment.elements])).toEqual(plain.map((segment) => [segment.id, segment.elements]));
    // A line feed as the segment terminator, with a carriage return before it.
    const newline = syntheticInterchange().replace(/~$/, '').replaceAll('~', '\r\n');
    const lf = tokenize([`${newline.slice(0, 105)}\n${newline.slice(107)}\r\n`]);
    expect(lf.errors).toEqual([]);
    expect(lf.segments.map((segment) => [segment.id, segment.elements])).toEqual(plain.map((segment) => [segment.id, segment.elements]));
    // A carriage return as the terminator is a delimiter, never stripped.
    const carriage = syntheticInterchange().replaceAll('~', '\r');
    expect(tokenize([carriage]).segments.map((segment) => segment.elements)).toEqual(plain.map((segment) => segment.elements));
  });

  it('ignores blank lines after an IEA even when a line feed is the segment terminator', () => {
    const plain = tokenize([syntheticInterchange()]).segments;
    const newline = syntheticInterchange().replaceAll('~', '\n');
    for (const tail of ['\n', '\r\n', ' \t\r\n\n']) {
      const result = tokenize([`${newline}${tail}`]);
      expect(result.errors, JSON.stringify(tail)).toEqual([]);
      expect(result.segments.map((segment) => [segment.id, segment.elements])).toEqual(plain.map((segment) => [segment.id, segment.elements]));
      expect(tokenize([...`${newline}${tail}`]).errors).toEqual([]);
    }
    const second = syntheticInterchange(undefined, '000000002').replaceAll('~', '\n');
    const two = tokenize([`${newline}\r\n\n${second}\n`]);
    expect(two.errors).toEqual([]);
    expect(two.segments.filter((segment) => segment.id === 'ISA')).toHaveLength(2);
    // Text after the blank line that is not whitespace must still be another ISA.
    expect(tokenize([`${newline}\nGS*HP\n`]).errors.map(position)).toEqual([{ code: 'EDI_SYNTAX', segmentIndex: plain.length + 1, segmentId: 'GS', elementPosition: 0, reason: 'unexpected_segment' }]);
  });

  it('reads each interchange with its own delimiters', () => {
    const second = syntheticInterchange(undefined, '000000002').replaceAll('*', '|').replaceAll(':', '>').replaceAll('~', "'");
    const result = tokenize([`${syntheticInterchange()}\n${second}`]);
    expect(result.errors).toEqual([]);
    const isas = result.segments.filter((segment) => segment.id === 'ISA');
    expect(isas.map((segment) => segment.delimiters)).toEqual([
      { element: '*', component: ':', repetition: '^', segment: '~' },
      { element: '|', component: '>', repetition: '^', segment: "'" },
    ]);
    expect(result.segments.filter((segment) => segment.id === 'SVC').map((segment) => segment.elements[0])).toEqual(['HC:97110:GP', 'HC>97110>GP']);
  });

  it('refuses a document that does not begin with ISA as not an 835', () => {
    for (const text of ['', 'IS', 'GS*HP~', '\u007fELF\u0002\u0001\u0001', ' ISA']) {
      expect(tokenize([text]).errors.map(position), JSON.stringify(text)).toEqual([{ code: 'EDI_NOT_835', segmentIndex: 1, segmentId: '', elementPosition: 0, reason: undefined }]);
    }
  });

  it('reports a truncated header or segment at the segment and element the input ended in', () => {
    expect(tokenize(['ISA*00*    ']).errors.map(position)).toEqual([{ code: 'EDI_SYNTAX', segmentIndex: 1, segmentId: 'ISA', elementPosition: 2, reason: 'truncated' }]);
    expect(tokenize(['ISA']).errors.map(position)).toEqual([{ code: 'EDI_SYNTAX', segmentIndex: 1, segmentId: 'ISA', elementPosition: 0, reason: 'truncated' }]);
    const text = syntheticInterchange();
    const cut = text.indexOf('CLP*') + 'CLP*SYNPCN0001*1*15'.length;
    expect(tokenize([text.slice(0, cut)]).errors.map(position)).toEqual([{ code: 'EDI_SYNTAX', segmentIndex: 17, segmentId: 'CLP', elementPosition: 3, reason: 'truncated' }]);
    expect(tokenize([`${text.slice(0, text.indexOf('CLP*'))}?`]).errors.map(position)).toEqual([{ code: 'EDI_SYNTAX', segmentIndex: 17, segmentId: '', elementPosition: 0, reason: 'truncated' }]);
    const segments = text.split('~').length - 1;
    expect(tokenize([`${text}IS`]).errors.map(position)).toEqual([{ code: 'EDI_SYNTAX', segmentIndex: segments + 1, segmentId: '', elementPosition: 0, reason: 'truncated' }]);
    expect(tokenize([`${text}ISA*00`]).errors.map(position)).toEqual([{ code: 'EDI_SYNTAX', segmentIndex: segments + 1, segmentId: 'ISA', elementPosition: 1, reason: 'truncated' }]);
  });

  it('refuses anything but another ISA after an IEA, and stops reading after an error', () => {
    const text = syntheticInterchange();
    const segments = text.split('~').length - 1;
    const result = tokenize([`${text}GS*HP*SYNTH~`, 'ST*835~']);
    expect(result.errors.map(position)).toEqual([{ code: 'EDI_SYNTAX', segmentIndex: segments + 1, segmentId: 'GS', elementPosition: 0, reason: 'unexpected_segment' }]);
    expect(result.errors[0]?.expected).toBe('ISA');
    expect(result.tokenizer.stopped).toBe(true);
    expect(result.segments).toHaveLength(segments);
    expect(tokenize([`${text}SE*1~`]).errors.map(position)).toEqual([{ code: 'EDI_SYNTAX', segmentIndex: segments + 1, segmentId: 'SE', elementPosition: 0, reason: 'unexpected_segment' }]);
    expect(tokenize([`${text}?*1~`]).errors.map(position)).toEqual([{ code: 'EDI_SYNTAX', segmentIndex: segments + 1, segmentId: '', elementPosition: 0, reason: 'unexpected_segment' }]);
    const halted = tokenize([]);
    halted.tokenizer.halt();
    halted.tokenizer.write(text);
    halted.tokenizer.end();
    expect(halted.segments).toEqual([]);
  });

  it('refuses a segment longer than it will hold, whether or not a terminator follows', () => {
    const text = syntheticInterchange();
    const at = text.indexOf('CLP*');
    const long = `${text.slice(0, at)}CLP*${'9'.repeat(MAX_SEGMENT_LENGTH)}`;
    const tooLong = [{ code: 'EDI_SYNTAX', segmentIndex: 17, segmentId: 'CLP', elementPosition: 0, reason: 'segment_too_long' }];
    expect(tokenize([long]).errors.map(position)).toEqual(tooLong);
    expect(tokenize([`${long}~${text.slice(at)}`]).errors.map(position)).toEqual(tooLong);
    const streamed = tokenize([`${text.slice(0, at)}CLP*`, ...Array.from({ length: 20 }, () => '9'.repeat(4096))]);
    expect(streamed.errors.map(position)).toEqual(tooLong);
    expect(streamed.tokenizer.peakBuffered).toBeLessThan(MAX_SEGMENT_LENGTH + 4096 + 200);
    // A segment of exactly the longest length is read.
    expect(tokenize([`${text.slice(0, at)}CLP*${'9'.repeat(MAX_SEGMENT_LENGTH - 4)}${text.slice(text.indexOf('~', at))}`]).errors).toEqual([]);
  });

  it('names a segment ID only when the text is shaped like one', () => {
    expect(segmentIdOf('CLP')).toBe('CLP');
    expect(segmentIdOf('N1')).toBe('N1');
    expect(segmentIdOf('clp')).toBe('');
    expect(segmentIdOf('SYNTHLAST')).toBe('');
    expect(segmentIdOf('1X')).toBe('');
  });
});
