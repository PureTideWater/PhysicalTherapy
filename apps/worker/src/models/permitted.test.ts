import { PERMITTED_REPORT_FORMAT_V1, permittedReport, permittedResult } from '@tp/model-gateway';
import { describe, expect, it } from 'vitest';

import { PermittedArgsError, parseEarlierReport, parsePermittedArgs } from './permitted';

const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000a2';

describe('the evaluate-permitted task’s arguments', () => {
  it('reads the practices, each once, and the report files', () => {
    expect(parsePermittedArgs(['--practice', A, '--practice', B.toUpperCase(), '--practice', A, '--report', 'now.json', '--against', 'before.json'])).toEqual({
      practiceIds: [A, B],
      report: 'now.json',
      against: 'before.json',
    });
    expect(parsePermittedArgs(['--practice', A])).toEqual({ practiceIds: [A], report: null, against: null });
  });

  it('refuses no practice, a practice that is not an ID, a flag without its value, and anything else', () => {
    for (const argv of [[], ['--report', 'now.json'], ['--practice', 'north'], ['--practice'], ['--practice', '--report'], ['--practice', A, '--model', 'x'], ['--practice', A, '--report', 'a', '--report', 'b'], ['--practice', A, '--against', 'a', '--against', 'b']]) {
      expect(() => parsePermittedArgs(argv)).toThrow(PermittedArgsError);
    }
  });
});

describe('the earlier report the task is gated against (--against)', () => {
  const E1 = '00000000-0000-4000-8000-0000000000e1';
  const E2 = '00000000-0000-4000-8000-0000000000e2';
  // A report as a run writes it: one example proposing nothing, one refused before the call.
  const current = permittedReport('local', 1, [permittedResult(E1, null, { proposal: null, problem: 'expected_invalid' }), permittedResult(E2, null, { proposal: null, problem: 'refused:document_kind' })]);
  const refusal = (text: string) => {
    try {
      parseEarlierReport(text);
    } catch (error) {
      expect(error).toBeInstanceOf(PermittedArgsError);
      return (error as Error).message;
    }
    throw new Error('expected a refusal');
  };

  it('reads a /2 report as written, its refusals counted apart from the tally', () => {
    const read = parseEarlierReport(`${JSON.stringify(current, null, 2)}\n`);
    expect(read).toEqual(current);
    expect([read.format, read.exampleIds, read.refused, read.total.missed]).toEqual(['tp-model-eval-permitted/2', [E1, E2], 1, 0]);
  });

  it('refuses a /1 report by its code before anything is called, and names nothing the file holds', () => {
    const message = refusal(JSON.stringify({ format: PERMITTED_REPORT_FORMAT_V1, examples: 2, total: { tp: 1, fp: 0, fn: 0 }, note: 'SYNTHETIC CANARY 4417' }));
    expect(message).toMatch(/^--against: earlier_report_format: the earlier report is tp-model-eval-permitted\/1;/);
    expect(message).not.toContain('CANARY');
  });

  it('refuses a file that is not JSON, not a report, or a /2 report with a key added or a count that is not a count', () => {
    for (const text of ['SYNTHETIC CANARY 4417', '{}', JSON.stringify({ ...current, note: 'SYNTHETIC CANARY 4417' }), JSON.stringify({ ...current, refused: -1 }), JSON.stringify({ ...current, format: 'tp-model-eval-permitted/3' })]) {
      const message = refusal(text);
      expect(message).toMatch(/^--against is not a permitted-run report/);
      expect(message).not.toContain('CANARY');
    }
  });
});
