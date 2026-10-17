import { describe, expect, it } from 'vitest';

import { PermittedArgsError, parsePermittedArgs } from './permitted';

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
