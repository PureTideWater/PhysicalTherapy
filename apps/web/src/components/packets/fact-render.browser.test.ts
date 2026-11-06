import { cents, formatUsd, formatUsdPlain } from '@tp/money';
import { factCatalog, factPlaceholder, renderFacts } from '@tp/packets';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FACT_CONTENTS } from '../../../../../packages/packets/src/fact-contents.test-support';
import { type Harness, chromiumInstalled, startHarness } from '../test-support/browser';

/**
 * A packet narrative's amounts and fact tokens in a real browser (test matrix CAS-55, the render half; design
 * lane-b-packet-figure-placeholders, section 5): formatUsdPlain prints each amount as formatUsd en-US does in the
 * browser's own locale data as in the worker's, and renderFacts (@tp/packets/check, as a screen loads it) renders every
 * fact of each named SYNTHETIC packet to the segments, text and span map the worker renders. The page computes in
 * Chromium through the forms' harness (test-support/browser.ts, its `fact-render` page); this file computes the same in
 * Node. An ICU change in either runtime then fails here rather than refusing a stored version. Synthetic values only.
 */

/** Zero, a cent, each width of whole dollars around a comma's place, past a float's exact integers, and each negated. */
const AMOUNTS: readonly bigint[] = [0n, 1n, 9n, 10n, 99n, 100n, 105n, 99_999n, 100_000n, 123_456n, 9_999_999n, 10_000_000n, 99_999_999n, 100_000_000n, 123_456_789_012n, 900_719_925_474_099_399n].flatMap(
  (amount) => (amount === 0n ? [amount] : [amount, 0n - amount]),
);

/** Each named packet with a template of every fact its catalog lists, each token between text. */
const renders = Object.values(FACT_CONTENTS).map((make) => {
  const content = make();
  return { content, template: factCatalog(content).entries.map((entry) => `Of ${factPlaceholder(entry.id)} [1].`).join(' ') };
});

interface FactRender {
  readonly plain: readonly string[];
  readonly enUs: readonly string[];
  readonly rendered: readonly ReturnType<typeof renderFacts>[];
}

let harness: Harness | null = null;
let browser: FactRender | null = null;

beforeAll(async () => {
  harness = chromiumInstalled() ? await startHarness() : null;
  if (harness !== null) {
    const page = await harness.open('fact-render', { init: { amounts: AMOUNTS.map(String), renders } });
    await page.waitForFunction(() => (window as unknown as { factRender?: unknown }).factRender !== undefined, null, { timeout: 30_000 });
    browser = await page.evaluate(() => (window as unknown as { factRender: FactRender }).factRender);
    await page.close();
  }
}, 120_000);

afterAll(async () => {
  await harness?.close();
});

describe.skipIf(!chromiumInstalled())('a narrative’s amounts and fact tokens in a browser', () => {
  it('formats each amount with formatUsdPlain as formatUsd en-US does, in the browser as in the worker', () => {
    const worker = AMOUNTS.map((amount) => formatUsdPlain(cents(amount)));
    expect((browser as FactRender).plain).toEqual(worker);
    expect((browser as FactRender).enUs, 'the browser’s locale data moved').toEqual(worker);
    expect(AMOUNTS.map((amount) => formatUsd(cents(amount), 'en-US')), 'the worker’s locale data moved').toEqual(worker);
    expect((harness as Harness).errors()).toEqual([]);
  });

  it('renders every fact of each named packet to what the worker renders', () => {
    const rendered = (browser as FactRender).rendered;
    expect(rendered).toHaveLength(renders.length);
    renders.forEach(({ template, content }, index) => {
      const worker = renderFacts(template, content);
      expect(worker.ok).toBe(true);
      expect(rendered[index]).toEqual(worker);
    });
  });
});
