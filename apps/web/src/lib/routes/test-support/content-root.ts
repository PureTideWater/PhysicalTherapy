import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { serializeRecords, sha256 } from '@tp/rules';
import { exampleRecord } from '@tp/rules/testing';

/**
 * Test support: a scratch content checkout for the console's Rule releases screen (docs/adr/0037):
 * content/drafts holding hand-typed therapy-threshold records verified to L2 with their second pass,
 * quoting a stored source the checker can read, so the checker passes and every "prepare" assembles the
 * next release number into content/outgoing. Invented text, nothing from a real source.
 */

const SOURCE_TEXT = 'The KX threshold is $1,111 for PT and SLP combined, with review at $1,333.\n';
const SOURCE_PATH = 'content/sources/therapy_threshold/rules.md';

export interface ScratchContentRoot {
  readonly root: string;
  remove(): void;
}

export function scratchContentRoot(): ScratchContentRoot {
  const root = mkdtempSync(path.join(tmpdir(), 'tp-content-root-'));
  const write = (file: string, text: string) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  };
  write(SOURCE_PATH, SOURCE_TEXT);
  write('content/drafts/README.md', '# drafts\n');
  write('content/outgoing/README.md', '# outgoing\n');
  const records = [
    exampleRecord('therapy_threshold', {
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
      verification: { level: 'L2', by: 'A. Reviewer', on: '2026-10-20', questions: [] },
      quotes: ['$1,111 for PT and SLP combined, with review at $1,333'],
    }),
  ];
  write('content/drafts/therapy_threshold/2026/records.json', serializeRecords(records));
  write(
    'content/drafts/therapy_threshold/2026/records.second-pass.json',
    JSON.stringify({
      transcribed_by: 'second',
      transcribed_on: '2026-10-15',
      records: records.map(({ record_type, key, value, effective_from, effective_to, quotes }) => ({ record_type, key, value, effective_from, effective_to, quotes })),
    }),
  );
  return { root, remove: () => rmSync(root, { recursive: true, force: true }) };
}
