import { PAGE_READ_LIMITS } from '@tp/contracts/pages';

import { SCREEN_MAX_IDENTIFIERS, identifierEntries, pagesName, screenSet } from '../patient-records';
import { SCREEN_MAX_RUN } from '../redact';
import { framePages } from '../untrusted';

/**
 * A child process for redact.test.ts's bound on the contract screen (phi-screen F5; docs/adr/0070 Part 3): it builds
 * SYNTHETIC page text of the largest size intake accepts (PAGE_READ_LIMITS.maxTextCharacters), frames it as the
 * purpose's prepare does, screens it with pagesName against a SYNTHETIC practice at the screen's bound and prints one
 * JSON line: the answer, the time it took and the heap. The test runs it under a heap flag far below the web task's.
 *
 * Usage: tsx screen-bound.ts <prose|dense> <none|last>
 * - prose: 100 pages of single-spaced words in 90-character lines, a figure written with a decimal point and a
 *   no-break space among them, as a word processor's PDF writes one (so the text is not in NFKC form, each line is
 *   normalized as it is read, and normalizing the whole text at once would hold a second copy of it);
 * - dense: one page of one-character tokens joined by single spaces with no line break, the most runs a text can hold;
 * - last: the practice's identifier written at the very end, so the whole text is read before the match.
 * Every value is invented; nothing here is read from a file.
 */

const [shape = 'prose', hit = 'none'] = process.argv.slice(2);
const characters = PAGE_READ_LIMITS.maxTextCharacters;

// A seeded generator, so every run screens the same text.
let state = 0x2f6b_1d3a;
const next = () => {
  state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
  return state / 0x1_0000_0000;
};
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const words = Array.from({ length: 3_000 }, () => Array.from({ length: 2 + Math.floor(next() * 8) }, () => LETTERS[Math.floor(next() * 26)] ?? 'a').join(''));

function prose(size: number): string {
  const lines: string[] = [];
  let length = 0;
  while (length < size) {
    const line: string[] = [];
    let width = 0;
    while (width < 90) {
      // Out of a hundred words, 8 are a figure with a decimal point and 3 end with a no-break space and "per".
      const draw = Math.floor(next() * 100);
      const word = draw < 8 ? `${String(Math.floor(next() * 99_999))}.${String(Math.floor(next() * 99))}` : `${words[Math.floor(next() * words.length)] ?? 'and'}${draw < 11 ? ' per' : ''}`;
      line.push(word);
      width += word.length + 1;
    }
    const text = line.join(' ');
    lines.push(text);
    length += text.length + 1;
  }
  return lines.join('\n');
}

function dense(size: number): string {
  // Built flat in 64 KiB chunks (one byte a character), so the text itself is all the child holds.
  const chunks: string[] = [];
  const bytes = new Uint8Array(65_536);
  for (let length = 0; length < size; length += bytes.length) {
    for (let at = 0; at < bytes.length; at += 2) {
      bytes[at] = ALPHABET.charCodeAt(Math.floor(next() * ALPHABET.length));
      bytes[at + 1] = 0x20;
    }
    chunks.push(new TextDecoder('latin1').decode(bytes));
  }
  return chunks.join('').slice(0, size);
}

const named = 'ZZ90000001';

/** The request as the purpose's prepare frames it; its pages are let go once framed, so the text is all the child holds. */
function framed(): string {
  const pages = shape === 'dense' ? [dense(characters)] : Array.from({ length: 100 }, () => prose(characters / 100));
  if (hit === 'last') {
    pages[pages.length - 1] = `${pages.at(-1) ?? ''}\nMember ID ${named}`;
  }
  return `Read the exhibit pages below and propose the rate terms they state, in the JSON the schema describes.\n\n${framePages('exhibit', pages)}`;
}
const user = framed();

// A practice at the screen's bound (SCREEN_MAX_IDENTIFIERS): member IDs, patient control numbers and payer claim
// numbers of five lengths, and one claim number of the longest run the screen compares, so every page run up to
// SCREEN_MAX_RUN characters is a candidate. Every value is kept (none is below its floor, letter-only or a date).
const memberIds = [named];
const patientControlNumbers: string[] = [];
const payerClaimNumbers = [`QQ${'7'.repeat(SCREEN_MAX_RUN - 2)}`];
for (let n = 0; memberIds.length + patientControlNumbers.length + payerClaimNumbers.length < SCREEN_MAX_IDENTIFIERS; n += 1) {
  if (n % 4 === 0) {
    memberIds.push(`ZZ${String(1_000_000 + n)}`);
  } else if (n % 4 === 1) {
    memberIds.push(`A${String(n).padStart(9, '0')}Z`);
  } else if (n % 4 === 2) {
    patientControlNumbers.push(`SYNPCN${String(n).padStart(8, '0')}`);
  } else {
    payerClaimNumbers.push(`77${String(n).padStart(11, '0')}`);
  }
}
const set = screenSet(identifierEntries({ memberIds, patientControlNumbers, payerClaimNumbers }));

const gc = (globalThis as { gc?: () => void }).gc;
gc?.();
const before = process.memoryUsage().heapUsed;
const started = performance.now();
const found = pagesName([user], set);
const ms = performance.now() - started;
const after = process.memoryUsage().heapUsed;
process.stdout.write(
  `${JSON.stringify({ shape, hit, characters: user.length, identifiers: set.values.size, found, ms: Math.round(ms), heapBeforeMiB: Math.round(before / 2 ** 20), heapAfterMiB: Math.round(after / 2 ** 20) })}\n`,
);
