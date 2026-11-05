import { PAGE_READ_LIMITS, readInChild } from '../pages';

/**
 * Crashes the stand-in reader (stub-reader.ts) the ways a document can, from a parent whose core-file limit the test
 * raised (pages.test.ts: `ulimit -c unlimited`), and prints one line of JSON: each crash's outcome. The test then looks
 * for a core file: a crashed reader's memory holds the document's bytes and text, so it must never dump one.
 */

const STUB = new URL('./stub-reader.ts', import.meta.url);
const outcomes: Record<string, string> = {};
for (const behaviour of ['segv', 'abort']) {
  outcomes[behaviour] = await readInChild({ format: 'csv', bytes: new TextEncoder().encode(behaviour), maxPages: 10, maxTextCharacters: 100_000, maxInflatedBytes: 1024 }, PAGE_READ_LIMITS, STUB).then(
    (reply) => reply.kind,
    (error: unknown) => (error as Error).message,
  );
}
process.stdout.write(`${JSON.stringify(outcomes)}\n`);
