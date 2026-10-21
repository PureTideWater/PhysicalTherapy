import { performance } from 'node:perf_hooks';
import v8 from 'node:v8';
import vm from 'node:vm';

import { openPool } from '@tp/db';
import { renderToString } from 'react-dom/server';

import { PublicHeader } from '../../../components/public-header';
import { ScreeningResultView } from '../../../components/screening/result-view';
import type { ActionState } from '../../http/next';
import { screeningResult } from '../routes';
import { pageRequest, screeningServices } from './page-services';

/**
 * A screening's result page read and rendered as the web server does it, in a process of its own under the heap its
 * parent gives it (result-page.large.db.test.ts starts it with a 512 MiB heap, the web task's memory; audit #53
 * part 1): for each page of groups asked, the route's read of the database (the summary, the counts and
 * sums over every group, one page of groups, the coverage and the top rows) and the page's whole render below the
 * public header. It prints one JSON line: the heap's limit, and for each page the page shown, the groups it lists, the
 * HTML's size, the heap before the read, after the render (before any collection) and after a full collection, and
 * the milliseconds. It prints no token, link or figure.
 *
 *   tsx render-result.tsx <the application login's database URL> <the result's token> <page>[,<page>...]
 */

const MIB = 1024 * 1024;

/** A full collection: global.gc when the process was started with --expose-gc, else V8's own through the flag. */
function collect(): void {
  const gc = (globalThis as { gc?: () => void }).gc ?? (v8.setFlagsFromString('--expose-gc'), vm.runInNewContext('gc') as () => void);
  gc();
}

const heapMiB = () => process.memoryUsage().heapUsed / MIB;

async function main(): Promise<void> {
  const [url, token, pages] = process.argv.slice(2);
  if (url === undefined || token === undefined || pages === undefined) {
    throw new Error('usage: render-result.tsx <database url> <token> <page>[,<page>...]');
  }
  const pool = openPool(url, 2);
  const services = screeningServices(pool);
  const convert = (state: ActionState): Promise<ActionState> => Promise.resolve(state);
  const measured: Record<string, unknown>[] = [];
  try {
    for (const asked of pages.split(',')) {
      collect();
      const before = heapMiB();
      const started = performance.now();
      const outcome = await screeningResult.invoke(pageRequest({ params: { resultId: token, groups: asked } }), services);
      if (outcome.status !== 'ok') {
        throw new Error(`the result page answered ${outcome.status}`);
      }
      const html = renderToString(
        <>
          <PublicHeader />
          <ScreeningResultView data={outcome.data} convert={convert} />
        </>,
      );
      const rendered = heapMiB();
      const ms = performance.now() - started;
      const listed = html.match(/data-group-no="/g)?.length ?? 0;
      const othersRow = html.includes('data-group="others"');
      const bytes = Buffer.byteLength(html);
      collect();
      measured.push({ asked, page: outcome.data.groupPage.page, pages: outcome.data.groupPage.pages, groups: outcome.data.groupPage.groups, listed, othersRow, htmlBytes: bytes, heapBeforeMiB: before, heapAfterRenderMiB: rendered, heapAfterCollectionMiB: heapMiB(), ms });
    }
  } finally {
    await pool.end();
  }
  process.stdout.write(`${JSON.stringify({ heapLimitMiB: v8.getHeapStatistics().heap_size_limit / MIB, pages: measured })}\n`);
}

await main();
