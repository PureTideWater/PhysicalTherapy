import { getHeapStatistics } from 'node:v8';

import { syntheticPdf } from '../../testing/synthetic-pdf';
import { PAGE_READ_LIMITS, readInChild } from '../pages';

/**
 * The page reader's heap limit under a parent's node flags (pages.test.ts; infra/test/heap.test.ts). Run as a process
 * of its own, `node <the task's node flags> --import tsx reader-heap.ts`: reads one SYNTHETIC PDF through the reader as
 * the worker runs it and prints one line of JSON, `{ "parent": <this process's heap_size_limit>, "reader": <the
 * reader's, as its done frame reports it> }`.
 */

const limits = PAGE_READ_LIMITS;
const reply = await readInChild(
  { format: 'pdf', bytes: syntheticPdf([['SYNTHETIC PROVIDER AGREEMENT'], ['SYNTHETIC EXHIBIT A']]), maxPages: limits.maxPages, maxTextCharacters: limits.maxTextCharacters, maxInflatedBytes: limits.maxInflatedBytes },
  limits,
);
process.stdout.write(`${JSON.stringify({ parent: getHeapStatistics().heap_size_limit, reader: reply.kind === 'pages' ? reply.heapSizeLimit : null, read: reply.kind === 'pages' })}\n`);
