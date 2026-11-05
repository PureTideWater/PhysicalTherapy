import { createHash } from 'node:crypto';

import { cents, formatUsdPlain } from '@tp/money';

import { SLOTS } from './explain/slots';
import { RENDERER_REVISION } from './explain/version';
import { WORD_TABLES } from './explain/words';
import { factWords } from './fact-words';
import { canonicalJson } from './hash';



/**
 * The words version of the renderers as built (finding M1; docs/adr/0072): the SHA-256 of the canonical JSON of every
 * word table, the slot table, RENDERER_REVISION, and a packet narrative's facts' tables (./fact-words.ts: their kinds,
 * roles, scopes, phrases and nouns) with the text code prints its amounts in (formatUsdPlain of zero, a cent, each
 * width of whole dollars around a comma's place, and a negative amount; design
 * lane-b-packet-figure-placeholders, section 5). The facts' catalog and renderer (./fact-catalog.ts, ./render.ts) are
 * pinned beside the sentence forms under RENDERER_REVISION (./explain/sentence-forms.test.ts), so an edit to them
 * moves it too. ./explain/version.ts holds it as a literal (WORDS_VERSION), which version.test.ts requires to equal
 * this; computed here, at the package's root, since it needs node:crypto, which the browser-safe subpath does not
 * import.
 */
export function wordsVersionOf(): string {
  const amounts = [0n, 1n, 99n, 100n, 99_999n, 100_000n, 123_456_789n, -123_456n].map((amount) => formatUsdPlain(cents(amount)));
  const facts = { tables: factWords(), amounts };
  // Hash.update reads a string as UTF-8 by default, so no encoding is named (naming one leaves a mutant no input tells apart).
  return createHash('sha256').update(canonicalJson({ tables: WORD_TABLES, slots: SLOTS, revision: RENDERER_REVISION, facts })).digest('hex');
}
