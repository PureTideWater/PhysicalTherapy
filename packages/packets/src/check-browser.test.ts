import { describe, expect, it, vi } from 'vitest';

import { assemblePacket } from './assemble';
import { draftNarrative } from './draft';
import { assemblyInput } from './test-support';

/**
 * The browser's check never loads the letter reader's matcher or the server's reading for identifiers (docs/adr/0047,
 * amendment of 2026-11-11): @tp/packets/check reads for no identifier (readsNoIdentifier), and nothing it imports,
 * however far, imports @tp/redact or ./verifier/identifiers.ts. Here the modules are loaded afresh with both made to
 * throw when anything loads them: the browser's module still loads and checks a narrative, and the server's entry,
 * which needs the reading, does not load. (The content is built first: the test's own helpers load the server's entry.)
 */

const content = assemblePacket(assemblyInput());
const draft = draftNarrative(content);

describe('the browser’s check (@tp/packets/check)', () => {
  it('loads and checks a narrative and a template with neither the matcher nor the server’s reading loaded', async () => {
    vi.resetModules();
    vi.doMock('@tp/redact', () => {
      throw new Error('the letter reader’s matcher was loaded');
    });
    vi.doMock('./verifier/identifiers', () => {
      throw new Error('the server’s reading for identifiers was loaded');
    });
    try {
      const check = await import('./check');
      expect(check.checkNarrative(draft, content).mismatches).toEqual([]);
      expect(check.checkReading(draft, check.narrativeFacts(content)).check.passed).toBe(true);
      // A name is words to the browser: it holds no identifier to read for, and the server's check is the one stored.
      expect(check.checkNarrative(`${draft} The payer told Zoe Quarrington so [3].`, content).mismatches).toEqual([]);
      expect(check.checkTemplate('The remittances show {{fact:pattern.allowed}} for Zoe Quarrington [1].', content).check.mismatches.map((item) => item.code)).not.toContain('identifier_in_narrative');
      // The same two made to throw stop the server's entry, which loads the reading: the check above is no empty one.
      await expect(import('./verifier')).rejects.toThrow();
      await expect(import('./index')).rejects.toThrow();
    } finally {
      vi.doUnmock('@tp/redact');
      vi.doUnmock('./verifier/identifiers');
      vi.resetModules();
    }
  });
});
