import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { segmentText } from './explain/figures';
import { type FactEntry, factCatalog } from './fact-catalog';
import { FACT_CONTENTS, type FactContent } from './fact-contents.test-support';
import { renderFact } from './render';

/**
 * Every fact of each named SYNTHETIC packet (./fact-contents.test-support.ts), pinned as code renders it (design
 * lane-b-packet-figure-placeholders, sections 1 and 5; test matrix CAS-55): its id, kind, role, scope, the rows it
 * covers, whether a model may use it, whether code summed it, and its phrase with every value printed. A pin changes
 * only in the change that changes the words or the catalog, where its reviewer reads it; CI runs without -u.
 */

const describeEntry = (entry: FactEntry) =>
  [entry.id, entry.kind, entry.role ?? '-', entry.scope ?? '-', entry.rows.length === 0 ? '-' : entry.rows.join(','), entry.model ? 'model' : 'person', entry.summed ? 'summed' : 'stored'].join(' | ');

function pinned(name: FactContent): string {
  const content = FACT_CONTENTS[name]();
  const catalog = factCatalog(content);
  return `${catalog.entries.map((entry) => `${describeEntry(entry)}\n  ${renderFact(content, entry).map(segmentText).join('')}`).join('\n')}\n`;
}

describe('the facts of each named packet, rendered', () => {
  for (const name of Object.keys(FACT_CONTENTS) as FactContent[]) {
    it(name, async () => {
      await expect(pinned(name)).toMatchFileSnapshot(path.join('__golden__', 'facts', `${name}.txt`));
    });
  }
});
