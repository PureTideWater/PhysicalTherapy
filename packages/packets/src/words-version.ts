import { createHash } from 'node:crypto';

import { SLOTS } from './explain/slots';
import { RENDERER_REVISION } from './explain/version';
import { WORD_TABLES } from './explain/words';
import { canonicalJson } from './hash';

/**
 * The words version of the renderer as built (finding M1; docs/adr/0072): the SHA-256 of the canonical JSON of every
 * word table, the slot table and RENDERER_REVISION. ./explain/version.ts holds it as a literal (WORDS_VERSION), which
 * version.test.ts requires to equal this; computed here, at the package's root, since it needs node:crypto, which the
 * browser-safe subpath does not import.
 */
export function wordsVersionOf(): string {
  return createHash('sha256').update(canonicalJson({ tables: WORD_TABLES, slots: SLOTS, revision: RENDERER_REVISION }), 'utf8').digest('hex');
}
