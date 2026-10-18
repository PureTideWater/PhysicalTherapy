import { readFileSync } from 'node:fs';
import path from 'node:path';

import { UNPRICED_REASONS } from '@tp/pricing';
import { describe, expect, it } from 'vitest';

import { REMEDY_SCREEN_NAMES, UNPRICED_REASON_TEXT, remedyPath, unpricedReasonText } from './remedies';

const RULES_REFERENCE = path.resolve(import.meta.dirname, '../../../../../docs/product/rules-reference.md');

/** The rows of the rules reference's "Unpriced reasons and their remedies" table. */
function remedyTable(): string[][] {
  const lines = readFileSync(RULES_REFERENCE, 'utf8').split('\n');
  const start = lines.findIndex((line) => line.startsWith('| Reason | Meaning | Remedy shown on the Coverage screen |'));
  expect(start).toBeGreaterThanOrEqual(0);
  const rows: string[][] = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith('|')) {
      break;
    }
    rows.push(line.slice(1, -1).split(' | ').map((cell) => cell.trim()));
  }
  return rows;
}

describe('the Coverage screen’s unpriced reasons and remedies', () => {
  it('copies the rules reference’s table word for word, in its order', () => {
    expect(UNPRICED_REASON_TEXT.map((entry) => [`\`${entry.reason}\``, entry.meaning, entry.remedy])).toEqual(remedyTable());
  });

  it('covers exactly the engine’s closed list of reasons', () => {
    expect(UNPRICED_REASON_TEXT.map((entry) => entry.reason).sort()).toEqual([...UNPRICED_REASONS].sort());
    for (const reason of UNPRICED_REASONS) {
      expect(unpricedReasonText(reason).reason).toBe(reason);
    }
  });

  it('links a remedy to the screen it is taken on, and a reason whose remedy is none to nothing', () => {
    for (const entry of UNPRICED_REASON_TEXT) {
      expect(entry.screen === null, entry.reason).toBe(/^None|^Deferred|^Operator/.test(entry.remedy));
    }
    expect(unpricedReasonText('NO_MAPPING').screen).toBe('mapping');
    expect(unpricedReasonText('DATE_OUTSIDE_VERSIONS').screen).toBe('contracts');
    expect(remedyPath('3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a60', 'mapping')).toBe('/p/3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a60/mapping');
    expect(REMEDY_SCREEN_NAMES.claims).toBe('Claims and lines');
  });
});
