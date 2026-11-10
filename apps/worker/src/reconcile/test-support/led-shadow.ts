import { randomUUID } from 'node:crypto';

import { databaseClient, openPool } from '@tp/db';
import { endPool } from '@tp/db/testing';

import type { Practice } from '../../price/test-support/pricing-world';
import { type ReconcileSummary, reconcilePractice } from '../pass';
import { LedgerWorld } from './ledger-world';
import { type SideResult, clone, compare, idsBefore, runSide } from './pass-compare';
import { referencePass } from './per-line';

/**
 * CAS-49.2 (SUITE-CAP-3; design section 7, item 2; docs/adr/0087): old against new on the LED tests' own worlds. While
 * the shadow is on, every reconcile an LED test runs (LedgerWorld.reconcile) is run twice: the per-line reference
 * (per-line.ts) on a copy of the world's database taken at that moment, and the shipped pass on the world itself, whose
 * summary the test gets, as it would have. The two sides' writes are compared as CAS-49.1 compares them
 * (pass-compare.ts: every row in its order, encrypted text by its decrypted hash, the summary, the search's decrypts),
 * and a difference fails the reconcile, and so the LED test, naming a table, an ordinal and a column, never a value.
 * A reconcile the reference refuses must be refused by the shipped pass with the same error.
 *
 * A database is copied only while no session is connected to it, so the world's own connections are closed for the copy
 * and opened again (the world's pools are replaced in place; the tests read them from the world at each use).
 * Synthetic data only.
 */

/** What the shadow saw, for the test that turned it on to check it ran. */
export const shadowed = { reconciles: 0, writing: 0, refused: 0, searchDecrypting: 0 };

interface Options {
  readonly documentId?: string;
}

/** The world's connections, as PricingWorld.open makes them, replaceable here alone. */
interface Connections {
  owner: ReturnType<typeof databaseClient>;
  app: ReturnType<typeof openPool>;
  worker: ReturnType<typeof openPool>;
}

/** A copy of the world's database as it stands: its connections closed for the copy, then opened again. */
async function copyOf(adminUrl: string, world: LedgerWorld) {
  const pricing = world.triage.pricing;
  const connections = pricing as unknown as Connections;
  await endPool(pricing.app);
  await endPool(pricing.worker);
  await pricing.owner.end();
  const reopen = async () => {
    connections.owner = databaseClient(pricing.database.url);
    await connections.owner.connect();
    connections.app = openPool(pricing.database.appUrl, 8);
    connections.worker = openPool(pricing.database.workerUrl, 8);
  };
  let copy: Awaited<ReturnType<typeof clone>>;
  try {
    copy = await clone(adminUrl, { name: pricing.database.name, url: pricing.database.url });
  } catch (error) {
    await reopen();
    throw error;
  }
  try {
    await reopen();
  } catch (error) {
    // No copy is left behind when the world's own connections cannot be opened again.
    await copy.drop();
    throw error;
  }
  return copy;
}

/** A side's outcome: what it ran and wrote, or the error it stopped on. */
type Outcome = { readonly result: SideResult } | { readonly error: unknown };

/** An error as both sides can compare it: its class, code and message (the pass's own sentences; no row's value). */
const errorText = (error: unknown) => {
  const { name, code, message } = error as { readonly name?: string; readonly code?: string; readonly message?: string };
  return `${name ?? ''} ${code ?? ''} ${message ?? ''}`;
};

async function shadow(adminUrl: string, world: LedgerWorld, target: Practice, options: Options): Promise<ReconcileSummary> {
  const copy = await copyOf(adminUrl, world);
  try {
    const url = world.triage.pricing.database.url;
    const before = await idsBefore(url, target.practiceId);
    const jobId = randomUUID();
    const built = { world, practice: target };
    const side = (name: string, at: string, pass: typeof reconcilePractice): Promise<Outcome> =>
      runSide(name, at, built, jobId, (context, services, practiceId) => pass(context, services, practiceId, options)).then(
        (result) => ({ result }),
        (error: unknown) => ({ error }),
      );
    const reference = await side('reference', copy.url, referencePass);
    const shippedSide = await side('shipped', url, reconcilePractice);
    shadowed.reconciles += 1;
    if ('error' in reference || 'error' in shippedSide) {
      if (!('error' in reference) || !('error' in shippedSide) || errorText(reference.error) !== errorText(shippedSide.error)) {
        throw new Error('CAS-49.2: the shipped pass and the per-line reference did not both stop, or stopped on different errors');
      }
      shadowed.refused += 1;
      throw shippedSide.error;
    }
    const { differences } = compare(reference.result, shippedSide.result, before, target, { searchMayDecryptNone: true });
    if (differences.length > 0) {
      throw new Error(`CAS-49.2: the shipped pass wrote other than the per-line reference: ${differences.join('; ')}`);
    }
    const wrote = [...shippedSide.result.after].some(([table, rows]) => rows.some((row) => typeof row.id === 'string' && !(before.get(table)?.has(row.id) ?? false)));
    shadowed.writing += wrote ? 1 : 0;
    // A reconcile may decrypt no claim in its search (searchMayDecryptNone); that some did is checked over the whole run,
    // so the decrypt comparison is never one of nothing with nothing.
    shadowed.searchDecrypting += reference.result.decrypts.some((decrypt) => decrypt.phase === 'search' && decrypt.column === 'claim.patient_control_number') ? 1 : 0;
    return shippedSide.result.summary;
  } finally {
    await copy.drop();
  }
}

/** Turns the shadow on for every LedgerWorld of this test file's process; returns what turns it off. */
export function shadowReconciles(adminUrl: string): () => void {
  LedgerWorld.shadow = (world, target, options) => shadow(adminUrl, world, target, options);
  return () => {
    LedgerWorld.shadow = undefined;
  };
}
