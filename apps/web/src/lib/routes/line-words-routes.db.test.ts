import { randomUUID } from 'node:crypto';

import { plainText } from '@tp/packets/explain';
import { describe, expect, it } from 'vitest';

import { SESSION_COOKIE } from '../auth/sessions';
import type { Outcome } from '../http/route';
import { type LinePageData, linePage } from './remittances';
import { type Actor, MemoryJar, type World, routeWorldsForThisFile } from './route-tests/world';

/**
 * A contract line's calculation in words on the line trace page (combined audit #38; design 3.9, finding m4; CAS-30,
 * CAS-31), on the route tests' world: its 97110 line priced under the signed-off version's fixed schedule, the rate
 * record citing page 2. The words cite the page only while the record that priced the line is signed off (verified),
 * and say no page once it is not; the viewer's words are the manager's less every date. SYNTHETIC data only.
 */

const worlds = routeWorldsForThisFile();

async function lineAs(world: World, actor: Actor) {
  const session = await worlds.signIn(actor);
  const outcome: Outcome<LinePageData> = await linePage.invoke(
    {
      cookies: new MemoryJar({ [SESSION_COOKIE]: session.token }),
      params: { practiceId: world.refs.practiceId, lineId: world.refs.serviceLineId, run: world.refs.pricingRunId },
      requestId: `test-${randomUUID()}`,
      userAgent: null,
    },
    worlds.services,
  );
  if (outcome.status !== 'ok') {
    throw new Error(`expected ok, got ${outcome.status}`);
  }
  return outcome.data;
}

const groupActor = (world: World, role: Actor['persona']['role']) => world.actors.find((actor) => actor.persona.kind === 'group' && actor.persona.role === role) as Actor;

describe('a contract line’s words', () => {
  it('cite the signed-off rate record’s page, and no page once the record is not signed off (m4); the viewer’s hold no date', async () => {
    const world = await worlds.buildWorld('line words');
    const manager = groupActor(world, 'billing_manager');
    const viewer = groupActor(world, 'viewer');

    const asManager = await lineAs(world, manager);
    expect(asManager.wordsRefusal).toBeNull();
    expect(asManager.pricing?.method).toBe('FIXED_SCHEDULE');
    const summary = plainText(asManager.words?.summary ?? { segments: [] });
    expect(summary).toMatch(/^2 units × \$32\.00 = \$64\.00 under the contract’s clause on page 2; rounded once to \$64\.00; observed allowed \$110\.00; variance -\$46\.00 \(overpaid: recorded, never pursued\)\.$/);
    expect(asManager.worksheets).toEqual([]);
    // The internal words state the dispute window's dates (a fixed line reads no fee schedule, so no service date).
    expect(plainText(asManager.words?.steps.find((step) => step.step === 'window')?.sentences[0] ?? { segments: [] })).toMatch(
      /^Dispute window: 3,650 days from the payment date 2026-04-06, under the contract; it ends on \d{4}-\d{2}-\d{2}; on \d{4}-\d{2}-\d{2} it is open\.$/,
    );

    const asViewer = await lineAs(world, viewer);
    expect(plainText(asViewer.words?.summary ?? { segments: [] })).toBe(summary);
    expect(asViewer.pricing?.trace).toBeNull();
    expect(asViewer.steps).toEqual([]);
    expect(JSON.stringify(asViewer)).not.toContain('2026-03-15');
    expect(JSON.stringify(asViewer.words)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(plainText(asViewer.words?.steps.find((step) => step.step === 'window')?.sentences[0] ?? { segments: [] })).toBe('Dispute window: 3,650 days from the payment date, under the contract.');

    // The record that priced the line, no longer signed off (written past its triggers, as no workflow would): no page.
    const rateRecordId = asManager.pricing?.rateRecordId ?? '';
    await worlds.owner.query('BEGIN');
    await worlds.owner.query('SET LOCAL session_replication_role = replica');
    await worlds.owner.query('UPDATE rate_record SET verified_by = NULL, verified_at = NULL WHERE id = $1', [rateRecordId]);
    await worlds.owner.query('COMMIT');
    const unsigned = await lineAs(world, manager);
    expect(plainText(unsigned.words?.summary ?? { segments: [] })).toBe(summary.replace(' under the contract’s clause on page 2', ''));
    expect(JSON.stringify(unsigned.words)).not.toContain('page');
  }, 120_000);
});
