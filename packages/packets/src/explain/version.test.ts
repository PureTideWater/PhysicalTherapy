import { describe, expect, it } from 'vitest';

import { wordsVersionOf } from '../words-version';
import { RENDERER_REVISION, WORDS_VERSION } from './version';
import { WORD_TABLES } from './words';

/**
 * The words version (finding M1; docs/adr/0072): the literal ./version.ts holds is the SHA-256 of the word tables,
 * the slot table and RENDERER_REVISION as built, so a change to any of them without the literal written again fails
 * here, and the surfaces' guards (the approve and export-request forms, the export job) see the renderer move.
 */
describe('WORDS_VERSION', () => {
  it('is the words version of the tables, the slots and the revision as built', () => {
    const built = wordsVersionOf();
    expect(WORDS_VERSION, `write WORDS_VERSION = '${built}' in packages/packets/src/explain/version.ts`).toBe(built);
    expect(WORDS_VERSION).toMatch(/^[0-9a-f]{64}$/);
    expect(Number.isSafeInteger(RENDERER_REVISION) && RENDERER_REVISION >= 1).toBe(true);
  });

  it('moves with any table entry and any slot', async () => {
    const before = wordsVersionOf();
    const table = WORD_TABLES.ROUNDING_TEXT as Record<string, string>;
    const kept = table.HALF_UP_CENT as string;
    table.HALF_UP_CENT = `${kept} `;
    try {
      expect(wordsVersionOf()).not.toBe(before);
    } finally {
      table.HALF_UP_CENT = kept;
    }
    expect(wordsVersionOf()).toBe(before);
    const { SLOTS } = await import('./slots');
    const slots = SLOTS as unknown as Record<string, unknown>;
    const slot = slots['summary.rounded'];
    slots['summary.rounded'] = { from: 'trace', path: ['steps', 'rounding', 'unrounded_cents'] };
    try {
      expect(wordsVersionOf()).not.toBe(before);
    } finally {
      slots['summary.rounded'] = slot;
    }
    expect(wordsVersionOf()).toBe(before);
  });
});
