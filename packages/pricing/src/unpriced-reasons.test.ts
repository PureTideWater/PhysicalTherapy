import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { UNPRICED_REASONS } from './index';

const PRODUCT = path.resolve(import.meta.dirname, '../../../docs/product');

/** The rows of the markdown table that starts with `| Reason |` in `text`, as cell arrays. */
function reasonTable(text: string): string[][] {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.startsWith('| Reason |'));
  expect(start, 'the table of unpriced reasons').toBeGreaterThanOrEqual(0);
  const rows: string[][] = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith('|')) {
      break;
    }
    rows.push(line.slice(1, -1).split(' | ').map((cell) => cell.trim()));
  }
  return rows;
}

describe('docs/product/unpriced-reasons.md', () => {
  const closedList = readFileSync(path.join(PRODUCT, 'unpriced-reasons.md'), 'utf8');
  const rulesReference = readFileSync(path.join(PRODUCT, 'rules-reference.md'), 'utf8');

  it("copies the rules reference's table of unpriced reasons and remedies word for word", () => {
    expect(reasonTable(closedList)).toEqual(reasonTable(rulesReference));
    const tableOf = (text: string) => text.slice(text.indexOf('| Reason |')).split('\n\n')[0]?.trimEnd();
    expect(tableOf(closedList)).toBe(tableOf(rulesReference));
  });

  it('lists exactly the reasons the engine can return, each with a meaning and a remedy', () => {
    const rows = reasonTable(closedList);
    expect(rows.map(([reason]) => reason?.replaceAll('`', '')).sort()).toEqual([...UNPRICED_REASONS].sort());
    for (const row of rows) {
      expect(row).toHaveLength(3);
      expect(row.every((cell) => cell.length > 0)).toBe(true);
    }
  });
});
