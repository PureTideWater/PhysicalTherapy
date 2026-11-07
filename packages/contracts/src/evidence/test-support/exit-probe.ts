import { readdirSync, readFileSync } from 'node:fs';

import { PAGE_READ_LIMITS, readInChild } from '../pages';

/**
 * A worker that exits mid-read (pages.test.ts): starts the silent stand-in through readInChild, prints the stand-in's
 * pid once it runs, and exits. The stand-in has no orphan check of its own, so only pages.ts's exit handler stops it.
 */

function readerChild(): number | undefined {
  for (const task of readdirSync(`/proc/${String(process.pid)}/task`)) {
    for (const pid of readFileSync(`/proc/${String(process.pid)}/task/${task}/children`, 'utf8').split(' ').filter((word) => word !== '')) {
      if (readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\u0000').some((word) => word.endsWith('stub-silent.ts'))) {
        return Number.parseInt(pid, 10);
      }
    }
  }
  return undefined;
}

void readInChild({ format: 'csv', bytes: new TextEncoder().encode('never read'), maxPages: 1, maxTextCharacters: 10, maxInflatedBytes: 10 }, PAGE_READ_LIMITS, new URL('./stub-silent.ts', import.meta.url));
const started = Date.now();
const timer = setInterval(() => {
  const pid = readerChild();
  if (pid !== undefined || Date.now() - started > 20_000) {
    clearInterval(timer);
    process.stdout.write(`${String(pid)}\n`);
    process.exit(0);
  }
}, 10);
