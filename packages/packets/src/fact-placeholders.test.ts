import { describe, expect, it } from 'vitest';

import { PLACEHOLDER_PATTERN, factPlaceholder, factPlaceholderPattern, isFactId } from './placeholders';

/**
 * A narrative's fact tokens (design lane-b-packet-figure-placeholders, section 1): `{{fact:<id>}}`, an id a lowercase
 * letter then at most 95 lowercase letters, digits, `_`, `.` and `+`. The identifier placeholders' pattern never reads a
 * fact token, and the fact tokens' never reads an identifier's.
 */
describe('fact tokens', () => {
  it('take an id of the grammar, whole', () => {
    for (const id of ['pattern.allowed', 'lines.1+2+4.paid', 'code.0275t', 'a', `a${'b'.repeat(95)}`, 'release.no.1', 'pattern.patient_share']) {
      expect(isFactId(id), id).toBe(true);
    }
    for (const id of ['', `a${'b'.repeat(96)}`, 'Pattern.allowed', '1a', '.a', '_a', 'a-b', 'a b', ' a', 'a ', 'code.G0283', 'a{b', 'a}', 'lines.1,2.paid']) {
      expect(isFactId(id), id).toBe(false);
    }
  });

  it('write an id as its token, and refuse one outside the grammar', () => {
    expect(factPlaceholder('pattern.allowed')).toBe('{{fact:pattern.allowed}}');
    expect(factPlaceholder('lines.1+2.units')).toBe('{{fact:lines.1+2.units}}');
    expect(() => factPlaceholder('Pattern.allowed')).toThrow(new TypeError('a fact id is a lowercase letter, then lowercase letters, digits, _, . and +'));
    expect(() => factPlaceholder('')).toThrow(TypeError);
  });

  it('are read by their own pattern alone, a new one each time', () => {
    const text = 'Shows {{fact:pattern.allowed}} for {{claim_control_number:3}}, {{fact:lines.1+2.paid}}, {{fact:1a}}, {{fact:Bad}} and {{fact:code.97110}}.';
    expect([...text.matchAll(factPlaceholderPattern())].map((match) => [match[0], match[1], match.index])).toEqual([
      ['{{fact:pattern.allowed}}', 'pattern.allowed', 6],
      ['{{fact:lines.1+2.paid}}', 'lines.1+2.paid', 63],
      ['{{fact:code.97110}}', 'code.97110', 118],
    ]);
    expect([...text.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[0])).toEqual(['{{claim_control_number:3}}']);
    const pattern = factPlaceholderPattern();
    expect(pattern.exec(text)?.[1]).toBe('pattern.allowed');
    expect(factPlaceholderPattern()).not.toBe(pattern);
    expect(factPlaceholderPattern().lastIndex).toBe(0);
    expect(factPlaceholderPattern().global).toBe(true);
    expect(`{{fact:a${'b'.repeat(96)}}}`.match(factPlaceholderPattern())).toBeNull();
    expect(`{{fact:a${'b'.repeat(95)}}}`.match(factPlaceholderPattern())).toEqual([`{{fact:a${'b'.repeat(95)}}}`]);
    expect('{{fact:pattern.allowed}'.match(factPlaceholderPattern())).toBeNull();
    expect('{fact:pattern.allowed}}'.match(factPlaceholderPattern())).toBeNull();
    expect('{{facts:pattern.allowed}}'.match(factPlaceholderPattern())).toBeNull();
  });
});
