import { readDatabaseUrl } from '@tp/db';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { shadowReconciles, shadowed } from './test-support/led-shadow';

/**
 * CAS-49.2 (SUITE-CAP-3; design section 7, item 2; docs/adr/0087): a reconcile pass writes what the per-line pass wrote
 * on LED-01 to LED-18's own worlds. The LED tests are run here a second time, unchanged (ledger.db.test.ts holds LED-01
 * to LED-13, payment-terms.db.test.ts LED-14 to LED-18; importing a test file registers its tests in this one), with
 * the shadow on (test-support/led-shadow.ts): each reconcile they run is run by the per-line reference on a copy of the
 * world and by the shipped pass on the world itself, and the two sides' writes are compared as CAS-49.1 compares them.
 * A difference fails the LED test whose reconcile it was. The LED files themselves run as they always have, with no
 * shadow, in their own right. Synthetic data only.
 */

const off = shadowReconciles(readDatabaseUrl());
// Each reconcile here is two passes, a copy of the database and a comparison: the LED tests keep their assertions and
// get the time for it (the project's 30 s is sized for one pass).
vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

await import('./ledger.db.test');
await import('./payment-terms.db.test');

describe('old against new on the LED worlds (CAS-49.2)', () => {
  afterAll(() => {
    off();
    // Counts only, for the pull request's record.
    process.stdout.write(`CAS-49.2: ${String(shadowed.reconciles)} reconciles compared; ${String(shadowed.writing)} wrote rows; ${String(shadowed.searchDecrypting)} decrypted a claim in the search; ${String(shadowed.refused)} refused on both sides\n`);
  });

  // Registered after the LED tests, so it runs once they have: the shadow compared their reconciles, most of which write.
  it('compared every reconcile the LED tests ran, most of them writing', () => {
    expect(shadowed.reconciles).toBeGreaterThanOrEqual(150);
    expect(shadowed.writing).toBeGreaterThanOrEqual(120);
    // The search's decrypts were recorded and compared in some of them, never nothing with nothing throughout.
    expect(shadowed.searchDecrypting).toBeGreaterThanOrEqual(10);
    // No LED test expects a reconcile to be refused.
    expect(shadowed.refused).toBe(0);
  });
});
