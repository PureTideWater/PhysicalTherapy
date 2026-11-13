import { randomUUID } from 'node:crypto';

import { readDatabaseUrl, withPracticeScope } from '@tp/db';
import type { Practice } from '@tp/worker/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LedgerWorld } from '../../../../worker/src/reconcile/test-support/ledger-world';
import { FOUR_KEYS, type ReceivedRow, type Twins, recoupedLedSix, spied, statementTwins } from '../../../../worker/src/reconcile/test-support/statement-twins';
import { listStatements, statementCsv, statementOf } from './queries';

/**
 * The ROI statement's readers ship only the four keys a statement's page, CSV and list read (schema PR 5; the design
 * note's 4.2 and T12; docs/adr/0082): the lines a statement's actionable figure counted, which the database checks
 * when the statement is written, are never sent to a reader. A practice's SYNTHETIC LED-06, worked through to the
 * payer's recoupment, holds one statement stored twice, with the list and without: every reader receives four keys
 * for both and shows of the one exactly what it shows of the other.
 */

let led: LedgerWorld;
let practice: Practice;
let twins: Twins;

beforeAll(async () => {
  led = await LedgerWorld.open(readDatabaseUrl());
  practice = await recoupedLedSix(led, `statement readers web ${randomUUID().slice(0, 8)}`);
  twins = await statementTwins(led, practice, { periodFrom: '2026-07-01', periodTo: '2026-09-30' });
}, 240_000);

afterAll(async () => {
  await led.close();
});

/** A reader as the manager, in the practice's scope, with the statement rows its queries received. */
async function reading<T>(read: (scope: Parameters<typeof statementOf>[0]) => Promise<T>): Promise<{ readonly shown: T; readonly received: readonly ReceivedRow[] }> {
  const received: ReceivedRow[] = [];
  const shown = await withPracticeScope(led.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) => read(spied(scope as Parameters<typeof statementOf>[0], received)));
  return { shown, received };
}

const keysOf = (received: readonly ReceivedRow[]) => received.map((row) => Object.keys(row.links).sort());
const request = () => `test-${randomUUID()}`;
/** Everything a reader returned, as text (the seal's amounts are bigint cents). */
const text = (shown: unknown) => JSON.stringify(shown, (_key, value: unknown) => (typeof value === 'bigint' ? `${value.toString()} cents` : value));

describe('the ROI statement’s readers receive four keys (T12)', () => {
  it('the twins are one statement, with the lines listed and without', () => {
    expect(twins.lines).toBe(1);
    expect(twins.five).not.toBe(twins.four);
  });

  it('the detail page: four keys for both, and the same page but for the statement’s ID', async () => {
    const five = await reading((scope) => statementOf(scope, practice.practiceId, twins.five, request()));
    const four = await reading((scope) => statementOf(scope, practice.practiceId, twins.four, request()));
    expect(keysOf(five.received)).toEqual([[...FOUR_KEYS]]);
    expect(keysOf(four.received)).toEqual([[...FOUR_KEYS]]);
    expect(five.received[0]?.links).toEqual(four.received[0]?.links);
    // What the page is given: every figure, link and word, equal but for the ID (in the detail and in the seal's source).
    expect(five.shown).toBeDefined();
    expect(text(five.shown).replaceAll(twins.five, twins.four)).toBe(text(four.shown));
    // The figures are the statement's: the recoupment left recovered and an actionable case, each recomputed from its entries.
    expect(five.shown).toMatchObject({ matches: true, recovered: { matches: true } });
    expect(five.shown?.recoveredCents).not.toBe('0');
    expect(five.shown?.actionableOpenCents).not.toBe('0');
    expect(five.shown?.actionableCases).toHaveLength(1);
    expect(text(five.shown)).not.toContain('actionable_open_lines');
  });

  it('the CSV: four keys for both, and the same bytes', async () => {
    const five = await reading((scope) => statementCsv(scope, practice.practiceId, twins.five, request()));
    const four = await reading((scope) => statementCsv(scope, practice.practiceId, twins.four, request()));
    expect(keysOf(five.received)).toEqual([[...FOUR_KEYS]]);
    expect(keysOf(four.received)).toEqual([[...FOUR_KEYS]]);
    expect(typeof five.shown).toBe('string');
    expect(five.shown?.replaceAll(twins.five, twins.four)).toBe(four.shown);
    expect(five.shown).toContain('recovered,total,');
  });

  it('the list: four keys for every statement, and the same row for both but for the ID', async () => {
    const { shown, received } = await reading((scope) => listStatements(scope, practice.practiceId, 1, request()));
    // The job's statement and its two copies.
    expect(shown.total).toBe(3);
    expect(keysOf(received)).toEqual([[...FOUR_KEYS], [...FOUR_KEYS], [...FOUR_KEYS]]);
    const row = (id: string) => shown.items.find((item) => item.id === id);
    expect(row(twins.five)).toBeDefined();
    expect({ ...row(twins.five), id: twins.four }).toEqual(row(twins.four));
  });
});
