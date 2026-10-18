import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { type RuleRecord, serializeRecords, sha256 } from '@tp/rules';
import { exampleRecord } from '@tp/rules/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ReleaseToolError, checkWorkspace, nextReleaseNumber, prepareRelease, readWorkspace } from './workspace';

/**
 * The content workspace the console's Rule releases screen reads (docs/adr/0037): drafts by file and
 * level, prepared releases with their notes, the checker's result, the next release number and
 * preparing it, as the release commands do. Never content/releases.
 */

let root = '';
const SOURCE_TEXT = 'The KX threshold is $1,111 for PT and SLP combined, with review at $1,333.\n';
const SOURCE_PATH = 'content/sources/therapy_threshold/rules.md';

function write(file: string, text: string): void {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

function draft(level: 'L1' | 'L2', overrides: Partial<RuleRecord> = {}): RuleRecord {
  return exampleRecord('therapy_threshold', {
    source: {
      title: 'Therapy rules page',
      url: 'https://example.invalid/rules',
      path: SOURCE_PATH,
      retrieved: '2026-10-15',
      sha256: sha256(SOURCE_TEXT),
      method: 'hand_typed',
      transcribed_by: 'first',
      transcribed_on: '2026-10-15',
      locator: 'line 1',
      synthetic: false,
    },
    verification: { level, by: level === 'L1' ? 'pnpm verify-content' : 'A. Reviewer', on: '2026-10-20', questions: [] },
    quotes: ['$1,111 for PT and SLP combined, with review at $1,333'],
    ...overrides,
  });
}

function writeDrafts(records: readonly RuleRecord[]): void {
  write('content/drafts/therapy_threshold/2026/records.json', serializeRecords(records));
  write(
    'content/drafts/therapy_threshold/2026/records.second-pass.json',
    JSON.stringify({
      transcribed_by: 'second',
      transcribed_on: '2026-10-15',
      records: records.map(({ record_type, key, value, effective_from, effective_to, quotes }) => ({ record_type, key, value, effective_from, effective_to, quotes })),
    }),
  );
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'release-workspace-'));
  write(SOURCE_PATH, SOURCE_TEXT);
  write('content/drafts/README.md', '# drafts\n');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the content workspace', () => {
  it('lists the drafts by file, type and level, and the releases prepared and published', () => {
    expect(readWorkspace(root)).toEqual({ drafts: [], prepared: [], published: [] });
    writeDrafts([draft('L2'), draft('L1', { key: { discipline: 'OT' } })]);
    const workspace = readWorkspace(root);
    expect(workspace.drafts).toEqual([{ file: 'therapy_threshold/2026/records.json', recordTypes: ['therapy_threshold'], records: 2, levels: { L1: 1, L2: 1, L3: 0 }, problems: 0 }]);
    expect(checkWorkspace(root).problems).toEqual([]);

    expect(nextReleaseNumber(root, [])).toBe(1);
    const prepared = prepareRelease(root, 1, '2026-10-21');
    expect(prepared).toMatchObject({ dir: 'content/outgoing/1', records: 1, excluded: 1 });
    mkdirSync(path.join(root, 'content/releases/3'), { recursive: true });
    const after = readWorkspace(root);
    expect(after.prepared).toEqual([{ release: 1, records: 1, manifestSha256: prepared.manifestSha256, notes: expect.stringContaining('# Content release 1') as string, problems: [] }]);
    expect(after.published).toEqual([3]);
    // One above every real release published, prepared or loaded; SYNTHETIC numbers never count.
    expect(nextReleaseNumber(root, [900001, 2])).toBe(4);
    expect(nextReleaseNumber(root, [7])).toBe(8);
    expect(() => nextReleaseNumber(root, [899999])).toThrow(RangeError);
    // A number is used once, as pnpm release:assemble refuses.
    expect(() => prepareRelease(root, 1, '2026-10-21')).toThrow(ReleaseToolError);
  });

  it('reports a prepared release that does not verify, and the checker’s problems', () => {
    writeDrafts([draft('L2', { quotes: ['not in the source at all'] })]);
    expect(checkWorkspace(root).ok).toBe(false);
    expect(() => prepareRelease(root, 1, '2026-10-21')).toThrow(/the drafts do not pass pnpm verify-content/);
    mkdirSync(path.join(root, 'content/outgoing/2'), { recursive: true });
    expect(readWorkspace(root).prepared).toEqual([{ release: 2, records: 0, manifestSha256: '', notes: '', problems: ['MANIFEST.json is missing'] }]);
  });
});
