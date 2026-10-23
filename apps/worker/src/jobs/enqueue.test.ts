import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { SCREENING_PRICE_JOB, SCREENING_PRICE_WAITING_JOB, enqueueScreeningRun, screeningPriceKey } from './enqueue';
import { QUEUE_OPTIONS, SCREENING_JOB_HEARTBEAT_SECONDS, SCREENING_QUEUE_OPTIONS } from './registry';

const RUN = '5e4d3c2b-1a09-4f8e-8d7c-6b5a49382701';

function recorder() {
  const sent: { name: string; data: unknown; options: unknown }[] = [];
  return {
    sent,
    boss: {
      send: (name: string, data: object | null, options?: object) => {
        sent.push({ name, data, options });
        return Promise.resolve('job-1');
      },
    } as unknown as Parameters<typeof enqueueScreeningRun>[0],
  };
}

/**
 * A screening run's job (docs/adr/0062, PR 6b-3): its singleton key, its place in the queue (the founder's Q7) and the
 * screening heartbeat on every send, so a dead consumer's job is failed and the run claimed again within minutes even
 * when the job was sent before any consumer set the heartbeat on the queue.
 */
describe('enqueueScreeningRun', () => {
  it('sends the run by its ID under its singleton key, at priority 0 by default, with the 60-second heartbeat', async () => {
    const { sent, boss } = recorder();
    expect(await enqueueScreeningRun(boss, RUN)).toBe('job-1');
    expect(sent).toEqual([{ name: SCREENING_PRICE_JOB, data: { screening_run_id: RUN }, options: { singletonKey: screeningPriceKey(RUN), priority: 0, heartbeatSeconds: 60 } }]);
    expect(screeningPriceKey(RUN)).toBe(`screening_price:${RUN}`);
  });

  it('sends a run of the waiting tier to its own queue at its own priority, -1 to -20, and refuses any other', async () => {
    const { sent, boss } = recorder();
    await enqueueScreeningRun(boss, RUN, { priority: -1 });
    await enqueueScreeningRun(boss, RUN, { priority: -20 });
    expect(sent.map((send) => (send.options as { priority: number }).priority)).toEqual([-1, -20]);
    expect(sent.map((send) => send.name)).toEqual([SCREENING_PRICE_WAITING_JOB, SCREENING_PRICE_WAITING_JOB]);
    expect(SCREENING_PRICE_WAITING_JOB).toBe('screening_price_waiting');
    // Under the run's one singleton key, as a normal run's: a run's tier never changes.
    expect(sent.map((send) => (send.options as { singletonKey: string }).singletonKey)).toEqual([screeningPriceKey(RUN), screeningPriceKey(RUN)]);
    for (const priority of [1, -21, 0.5, Number.NaN]) {
      await expect(enqueueScreeningRun(boss, RUN, { priority }), String(priority)).rejects.toThrow(ZodError);
    }
    await expect(enqueueScreeningRun(boss, 'not-a-run')).rejects.toThrow(ZodError);
    expect(sent).toHaveLength(2);
  });

  it('puts the same heartbeat on the screening queues, beside the shared settings, and has each send to them notify the consumer', () => {
    expect(SCREENING_JOB_HEARTBEAT_SECONDS).toBe(60);
    expect(SCREENING_QUEUE_OPTIONS).toEqual({ ...QUEUE_OPTIONS, heartbeatSeconds: 60, notify: true });
  });
});
