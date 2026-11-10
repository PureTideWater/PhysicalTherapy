import { describe, expect, it } from 'vitest';

import type { Scope } from './ledger';
import { type StageEvent, insertStages } from './stages';

/**
 * insertStages' deadlock retry (SUITE-CAP-3 D3; design section 4; review round 1; docs/adr/0087), against a client that
 * records each statement and answers the stage write as a test tells it. CAS-49.6 crosses a real reopen with the pass,
 * each side the victim; this proves the rule's two bounds, which a real deadlock cannot be made to repeat on demand: only a
 * deadlock (SQLSTATE 40P01) is retried, under the savepoint, and the same statement is issued at most twice more, with
 * the same events; any other error stands at once, with no rollback to the savepoint. Synthetic ids only.
 */

const PRACTICE = '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01';
const LINES = ['1e4b8f8a-2c1d-4f7e-8b3a-5d6c7e8f9a02', '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03'] as const;
const EVENTS: readonly StageEvent[] = [
  { serviceLineId: LINES[0], stage: 'payer_approved' },
  { serviceLineId: LINES[1], stage: 'payer_approved' },
  { serviceLineId: LINES[0], stage: 'recovered' },
];
const STAGE_WRITE = /^\s*INSERT INTO line_status\b/;
/** A stage write issued more often than this is a runaway retry: the client stops it with an error the test names. */
const RUNAWAY = 10;

/** A database error as pg raises it: a message and its SQLSTATE. */
function failure(code: string): Error & { code: string } {
  return Object.assign(new Error(`synthetic ${code}`), { code });
}

/** A scope whose client records every statement and answers the n-th stage write (from 1) with `answer(n)`. */
function recording(answer: (attempt: number) => Error | null) {
  const statements: { readonly text: string; readonly values: unknown }[] = [];
  let attempts = 0;
  const query = (text: string, values?: unknown) => {
    statements.push({ text, values });
    if (STAGE_WRITE.test(text)) {
      attempts += 1;
      const error = attempts > RUNAWAY ? failure('runaway') : answer(attempts);
      if (error !== null) {
        return Promise.reject(error);
      }
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  };
  const scope = { client: { query } } as unknown as Scope;
  /** Each statement as a word: the stage write, or the savepoint statement's own text. */
  const shape = () => statements.map((statement) => (STAGE_WRITE.test(statement.text) ? 'write' : statement.text));
  const writes = () => statements.filter((statement) => STAGE_WRITE.test(statement.text));
  return { scope, shape, writes };
}

describe('insertStages’ deadlock retry (D3)', () => {
  it('writes once under the savepoint and releases it', async () => {
    const client = recording(() => null);
    await insertStages(client.scope, PRACTICE, EVENTS, null);
    expect(client.shape()).toEqual(['SAVEPOINT stage_events', 'write', 'RELEASE SAVEPOINT stage_events']);
  });

  it('re-issues the same statement with the same events after a deadlock, at most twice more, and then the deadlock stands', async () => {
    const client = recording(() => failure('40P01'));
    await expect(insertStages(client.scope, PRACTICE, EVENTS, null)).rejects.toMatchObject({ code: '40P01' });
    expect(client.shape()).toEqual(['SAVEPOINT stage_events', 'write', 'ROLLBACK TO SAVEPOINT stage_events', 'write', 'ROLLBACK TO SAVEPOINT stage_events', 'write']);
    const [first, ...again] = client.writes();
    for (const write of again) {
      expect(write).toEqual(first);
    }
  });

  it('goes on once a retry succeeds: two deadlocks, then the third statement writes', async () => {
    const client = recording((attempt) => (attempt <= 2 ? failure('40P01') : null));
    await insertStages(client.scope, PRACTICE, EVENTS, null);
    expect(client.shape()).toEqual(['SAVEPOINT stage_events', 'write', 'ROLLBACK TO SAVEPOINT stage_events', 'write', 'ROLLBACK TO SAVEPOINT stage_events', 'write', 'RELEASE SAVEPOINT stage_events']);
  });

  for (const code of ['23514', '40001', '55P03', '57014']) {
    it(`lets any other error stand at once, with no rollback to the savepoint (${code})`, async () => {
      const client = recording(() => failure(code));
      await expect(insertStages(client.scope, PRACTICE, EVENTS, null)).rejects.toMatchObject({ code });
      expect(client.shape()).toEqual(['SAVEPOINT stage_events', 'write']);
    });
  }

  it('lets an error without a SQLSTATE stand at once', async () => {
    const client = recording(() => new Error('synthetic, no code'));
    await expect(insertStages(client.scope, PRACTICE, EVENTS, null)).rejects.toThrow('synthetic, no code');
    expect(client.shape()).toEqual(['SAVEPOINT stage_events', 'write']);
  });

  it('issues no statement for no events', async () => {
    const client = recording(() => null);
    await insertStages(client.scope, PRACTICE, [], null);
    expect(client.shape()).toEqual([]);
  });
});
