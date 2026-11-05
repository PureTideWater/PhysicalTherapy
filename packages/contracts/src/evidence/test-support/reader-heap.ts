import { createRequire, syncBuiltinESMExports } from 'node:module';
import { getHeapStatistics } from 'node:v8';

import { syntheticPdf } from '../../testing/synthetic-pdf';

/**
 * The page reader's heap limit under a parent's node flags (pages.test.ts; infra/test/heap.test.ts). Run as a process
 * of its own, `node <the task's node flags> --import tsx reader-heap.ts`: reads one SYNTHETIC PDF through the reader as
 * the worker runs it and prints one line of JSON, `{ "parent": <this process's heap_size_limit>, "reader": <the
 * reader's> }`. Today's reader is a worker thread, whose limit is read from the thread as it starts.
 */

const threads = createRequire(import.meta.url)('node:worker_threads') as typeof import('node:worker_threads');
let threadLimit: number | undefined;
const Original = threads.Worker;
threads.Worker = class extends Original {
  constructor(...args: ConstructorParameters<typeof Original>) {
    super(...args);
    this.once('online', () => {
      void this.getHeapStatistics().then((statistics) => {
        threadLimit = statistics.heap_size_limit;
      });
    });
  }
};
syncBuiltinESMExports();

const pages = await import('../pages');
const reply = await pages.readDocumentPages({ bytes: syntheticPdf([['SYNTHETIC PROVIDER AGREEMENT'], ['SYNTHETIC EXHIBIT A']]), contentType: 'application/pdf' });
process.stdout.write(`${JSON.stringify({ parent: getHeapStatistics().heap_size_limit, reader: threadLimit ?? null, read: reply.ok })}\n`);
