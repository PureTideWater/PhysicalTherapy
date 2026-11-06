import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The facts' catalog and renderer are pure and browser-safe (design lane-b-packet-figure-placeholders, section 5): the
 * rendered text is hashed and compared across processes and time, so it is a function of the template, the content and
 * the words version alone. Their files name no clock, randomness, locale data, environment or network, and nothing
 * they import, however far, reads a Node module, so @tp/packets/check carries them to the browser. Amounts are printed
 * by @tp/money formatUsdPlain, never through Intl.
 */

const SOURCE = import.meta.dirname;
const FILES = ['fact-catalog.ts', 'fact-words.ts', 'render.ts'] as const;
const FORBIDDEN = [/\bDate\b/, /\bMath\./, /\bIntl\b/, /\btoLocale\w*\(/, /\bprocess\./, /\bfetch\(/, /\bsetTimeout\(/, /\brequire\(/, /\bimport\(/, /\bparseFloat\b/, /\bformatUsd\(/, /\bformatUnroundedUsd\b/];

/** The relative modules a file imports or re-exports, as files of the package. */
function imports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?from\s+'([^']+)'/g)].map((match) => match[1] as string);
}

describe('the facts’ catalog and renderer', () => {
  it('name no clock, randomness, locale data, environment or network', () => {
    for (const file of FILES) {
      const text = readFileSync(path.join(SOURCE, file), 'utf8');
      for (const pattern of FORBIDDEN) {
        expect(pattern.test(text), `${file}: ${pattern.source}`).toBe(false);
      }
    }
  });

  it('import no Node module, however far', () => {
    const seen = new Set<string>();
    const queue = FILES.map((file) => path.join(SOURCE, file));
    while (queue.length > 0) {
      const file = queue.pop() as string;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const specifier of imports(file)) {
        expect(specifier.startsWith('node:') || ['crypto', 'fs', 'path', 'os'].includes(specifier), `${path.relative(SOURCE, file)} imports ${specifier}`).toBe(false);
        if (specifier.startsWith('.')) {
          queue.push(path.join(path.dirname(file), `${specifier}.ts`));
        }
      }
    }
    expect(seen.size).toBeGreaterThan(FILES.length);
  });
});
