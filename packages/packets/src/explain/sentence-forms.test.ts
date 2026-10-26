import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { RENDERER_REVISION } from './version';

/**
 * The sentence forms move the words version (review finding: WORDS_VERSION bypassed by a sentence edit; docs/adr/0072).
 * WORDS_VERSION hashes the word tables, the slot table and RENDERER_REVISION, not the sentences ./line.ts,
 * ./worksheet.ts and ./figures.ts build around them, so an edit to one of those files changes no table and could leave
 * the version, and the guards that hold the reviewer's words to the payer's, where they were. This pins the SHA-256 of
 * the three files' text beside the revision it was written under: any edit to them fails here until RENDERER_REVISION
 * is raised (which moves WORDS_VERSION, so version.test.ts asks for the literal again) and both values below are
 * written again. An edit that changes no sentence (a comment) is written again the same way: the reviewer of the
 * change reads the golden pins to see that no word moved.
 *
 * Mutation runs leave this file out (vitest.mutation.config.ts): Stryker's instrumentation rewrites the files it reads.
 */
const PINNED = {
  revision: 4,
  sha256: '948d313deb6d400b5a8f0eee9a92c1b68dd5de886ef89a7f6da3f2708a453d0b',
} as const;

const FILES = ['line.ts', 'worksheet.ts', 'figures.ts'] as const;

/** The SHA-256 of the sentence forms' files, each its name and its text (line endings as LF), in a fixed order. */
function sentenceFormsSha256(): string {
  const hash = createHash('sha256');
  for (const file of FILES) {
    hash.update(`${file}\n`, 'utf8');
    hash.update(readFileSync(path.join(import.meta.dirname, file), 'utf8').replaceAll('\r\n', '\n'), 'utf8');
    hash.update('\0', 'utf8');
  }
  return hash.digest('hex');
}

describe('the sentence forms', () => {
  it('are the text RENDERER_REVISION was raised for', () => {
    const built = sentenceFormsSha256();
    const rewrite = `raise RENDERER_REVISION in packages/packets/src/explain/version.ts, then write PINNED = { revision: ${String(RENDERER_REVISION)}, sha256: '${built}' } here and WORDS_VERSION again`;
    expect(PINNED.sha256, `the sentence forms changed: ${rewrite}`).toBe(built);
    expect(RENDERER_REVISION, `RENDERER_REVISION is not the revision the sentence forms were pinned under: ${rewrite}`).toBe(PINNED.revision);
  });
});
