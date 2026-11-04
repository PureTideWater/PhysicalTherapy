import { describe, expect, it } from 'vitest';

import { vocabulary } from '../roles-words';
import type { FigureRole, Token } from './kinds';
import { type Match, Walk, cueAt, nearest, notWord, tokenize } from './walk';

/**
 * The role reader's first layer on its own (./walk.ts; docs/adr/0086): the helpers every layer shares and Walk's
 * places among a text's tokens, each held to its own answer for any index, beyond a text's last token too, not only
 * as the reader happens to call it (../roles.test.ts holds the reader).
 */

/** Walk's places, open to these tests, over a text's tokens. */
class Places extends Walk {
  static of(text: string): Places {
    const vocab = vocabulary();
    return new Places(text, tokenize(text, vocab), vocab);
  }

  texts(): string[] {
    return this.tokens.map((token: Token) => token.text);
  }

  runFrom(index: number, step: 1 | -1, stops: (token: Token) => boolean): string[] {
    return this.run(index, step, stops);
  }

  stopAt(index: number): boolean {
    return this.stop(index);
  }

  endOfSentence(index: number): number {
    return this.sentenceEnd(index);
  }

  figureBefore(index: number): number {
    return this.previousFigure(index);
  }

  breakAfter(index: number, commas: boolean): number {
    return this.nextBreak(index, commas);
  }

  wordsEnd(index: number): number {
    return this.end(index);
  }

  clauseFrom(index: number): number {
    return this.ownFrom(index);
  }
}

const match = (end: number, size: number, roles: readonly FigureRole[] = ['allowed']): { readonly match: Match } => ({ match: { start: end - size + 1, end, size, phrase: 'x', roles } });

describe('the nearest cue', () => {
  it('is the one that ends last, in whatever order the cues come', () => {
    const near = match(9, 1);
    const far = match(3, 1);
    expect(nearest([near, far])).toBe(near);
    expect(nearest([far, near])).toBe(near);
    expect(nearest([match(5, 2), match(3, 3)])?.match).toEqual(match(5, 2).match);
    expect(nearest([])).toBeUndefined();
  });

  it('is the longer of two that end together, and the first of two alike', () => {
    expect(nearest([match(5, 1), match(5, 2)])?.match.size).toBe(2);
    expect(nearest([match(5, 2), match(5, 1)])?.match.size).toBe(2);
    const first = match(5, 2);
    const second = match(5, 2);
    expect(nearest([first, second])).toBe(first);
    const one = match(5, 1);
    expect(nearest([one, match(5, 1)])).toBe(one);
  });
});

describe('a cue at a word', () => {
  it('matches its words from that word on', () => {
    const cues = [['to pay', ['days_to_pay']]] as const;
    expect(cueAt(['x', 'to', 'pay'], 1, cues)?.[0]).toBe('to pay');
    expect(cueAt(['pay', 'to', 'x'], 1, cues)).toBeUndefined();
    expect(cueAt(['to', 'pay'], 0, cues)?.[0]).toBe('to pay');
  });
});

describe('the places among a text’s tokens', () => {
  it('runs from a token to the first that stops it, or to the text’s end either way', () => {
    const places = Places.of('a b c');
    expect(places.runFrom(2, -1, notWord)).toEqual(['b', 'a']);
    expect(places.runFrom(0, 1, notWord)).toEqual(['b', 'c']);
    expect(Places.of('a, b c').runFrom(3, -1, notWord)).toEqual(['b']);
  });

  it('stops at a period, "!", "?", ";" or a blank line, never at a comma, a colon or past the text', () => {
    const places = Places.of('aa. bb, cc: dd; ee');
    expect(places.texts()).toEqual(['aa', '.', 'bb', ',', 'cc', ':', 'dd', ';', 'ee']);
    expect([1, 3, 5, 7].map((index) => places.stopAt(index))).toEqual([true, false, false, true]);
    expect(places.stopAt(0)).toBe(false);
    expect(places.stopAt(99)).toBe(false);
  });

  it('ends a sentence at its stop after the token, or at the text’s end', () => {
    const places = Places.of('Paid. 4 then');
    expect(places.texts()).toEqual(['paid', '.', 'n:4', 'then']);
    expect(places.endOfSentence(2)).toBe(4);
    expect(places.endOfSentence(0)).toBe(1);
    expect(Places.of('4 then. Next').endOfSentence(0)).toBe(2);
  });

  it('finds the figure before a token in its sentence, the sentence’s first token included, from any index', () => {
    const places = Places.of('4 claims and 5');
    expect(places.figureBefore(3)).toBe(0);
    expect(places.figureBefore(9)).toBe(3);
    expect(places.figureBefore(0)).toBe(-1);
    expect(Places.of('4 claims. And 5').figureBefore(4)).toBe(-1);
  });

  it('breaks after a token at the next figure or edge (a stop alone, without commas), or at the text’s end', () => {
    expect(Places.of('4 and 5 here').breakAfter(0, true)).toBe(2);
    expect(Places.of('4 claims here').breakAfter(0, true)).toBe(3);
    expect(Places.of('4 claims, here').breakAfter(0, true)).toBe(2);
    expect(Places.of('4 claims, here').breakAfter(0, false)).toBe(4);
    expect(Places.of('4 claims, here. Then').breakAfter(0, false)).toBe(4);
  });

  it('ends a figure’s own words at the token after it when it keeps none', () => {
    expect(Places.of('4 claims').wordsEnd(0)).toBe(1);
  });

  it('starts a figure’s own clause after the last comma or colon since the figure before, that figure’s next token included', () => {
    expect(Places.of('4, and 5').clauseFrom(3)).toBe(2);
    expect(Places.of('4 claims, and 5').clauseFrom(4)).toBe(3);
    expect(Places.of('4 claims and 5').clauseFrom(3)).toBe(1);
    expect(Places.of('a, b 5').clauseFrom(9)).toBe(4);
  });
});
