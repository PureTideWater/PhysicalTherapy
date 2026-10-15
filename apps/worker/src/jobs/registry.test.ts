import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { assertNoPhi } from '@tp/observability';

import { JOB_PAYLOADS, JOB_TYPES, type JobPayload, type JobType, QUEUE_OPTIONS, parsePayload, queueOptions, singletonKey } from './registry';

const PRACTICE = '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01';
const OTHER_PRACTICE = '1e4b8f8a-2c1d-4f7e-8b3a-5d6c7e8f9a02';
const SUBJECT = '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03';

const examples: { readonly [T in JobType]: JobPayload<T> } = {
  intake: { practice_id: PRACTICE, document_id: SUBJECT },
  parse_835: { practice_id: PRACTICE, document_id: SUBJECT },
  price: { practice_id: PRACTICE, pricing_run_id: SUBJECT },
  triage: { practice_id: PRACTICE, pricing_run_id: SUBJECT },
  reconcile: { practice_id: PRACTICE, document_id: SUBJECT },
  digest: { practice_id: PRACTICE, period: '2026-10' },
  export: { practice_id: PRACTICE, export_job_id: SUBJECT },
};

describe('job registry', () => {
  it('registers the six job types of PRD section 15 and intake, which queues parse_835', () => {
    expect(JOB_TYPES).toEqual(['intake', 'parse_835', 'price', 'triage', 'reconcile', 'digest', 'export']);
    expect(Object.keys(JOB_PAYLOADS).sort()).toEqual([...JOB_TYPES].sort());
  });

  it.each(JOB_TYPES)('accepts a valid %s payload', (type) => {
    expect(parsePayload(type, examples[type])).toEqual(examples[type]);
  });

  it.each(JOB_TYPES)('carries no PHI in a %s payload (SEC-08)', (type) => {
    expect(() => {
      assertNoPhi('job_payload', examples[type]);
    }).not.toThrow();
  });

  it.each(JOB_TYPES)('refuses a %s payload that carries anything but IDs', (type) => {
    expect(() => parsePayload(type, { ...examples[type], patient_name: 'SYNTHETIC TWIN' })).toThrow(ZodError);
  });

  it.each(JOB_TYPES)('refuses a %s payload without a practice', (type) => {
    const { practice_id: _omitted, ...rest } = examples[type];
    expect(() => parsePayload(type, rest)).toThrow(ZodError);
  });

  it('refuses identifiers that are not UUIDs and periods that are not months', () => {
    expect(() => parsePayload('parse_835', { practice_id: PRACTICE, document_id: 'SYNPCN0001' })).toThrow(ZodError);
    expect(() => parsePayload('digest', { practice_id: PRACTICE, period: '2026-13' })).toThrow(ZodError);
    expect(() => parsePayload('digest', { practice_id: PRACTICE, period: '2026-1' })).toThrow(ZodError);
  });
});

describe('singletonKey', () => {
  it.each([
    ['intake', `intake:${PRACTICE}:${SUBJECT}`],
    ['parse_835', `parse_835:${PRACTICE}:${SUBJECT}`],
    ['price', `price:${PRACTICE}:${SUBJECT}`],
    ['triage', `triage:${PRACTICE}:${SUBJECT}`],
    ['reconcile', `reconcile:${PRACTICE}:${SUBJECT}`],
    ['digest', `digest:${PRACTICE}:2026-10`],
    ['export', `export:${PRACTICE}:${SUBJECT}`],
  ] as const)('keys %s jobs by type, practice and subject', (type, key) => {
    expect(singletonKey(type, examples[type])).toBe(key);
  });

  it('differs across practices for the same subject', () => {
    const other = singletonKey('parse_835', { practice_id: OTHER_PRACTICE, document_id: SUBJECT });
    expect(other).not.toBe(singletonKey('parse_835', examples.parse_835));
  });

  it('gives two jobs the same key only when type, practice and subject are all the same (property)', () => {
    const month = fc.tuple(fc.integer({ min: 2000, max: 2099 }), fc.integer({ min: 1, max: 12 })).map(([year, m]) => `${String(year)}-${String(m).padStart(2, '0')}`);
    const job = fc.oneof(
      fc.record({ type: fc.constant('parse_835' as const), practice: fc.uuid(), subject: fc.uuid() }),
      fc.record({ type: fc.constant('price' as const), practice: fc.uuid(), subject: fc.uuid() }),
      fc.record({ type: fc.constant('reconcile' as const), practice: fc.uuid(), subject: fc.uuid() }),
      fc.record({ type: fc.constant('digest' as const), practice: fc.uuid(), subject: month }),
    );
    const keyOf = (item: { type: 'parse_835' | 'price' | 'reconcile' | 'digest'; practice: string; subject: string }) => {
      switch (item.type) {
        case 'parse_835':
          return singletonKey(item.type, { practice_id: item.practice, document_id: item.subject });
        case 'price':
          return singletonKey(item.type, { practice_id: item.practice, pricing_run_id: item.subject });
        case 'reconcile':
          return singletonKey(item.type, { practice_id: item.practice, document_id: item.subject });
        case 'digest':
          return singletonKey(item.type, { practice_id: item.practice, period: item.subject });
      }
    };
    fc.assert(
      fc.property(job, job, (a, b) => {
        const same = a.type === b.type && a.practice === b.practice && a.subject === b.subject;
        expect(keyOf(a) === keyOf(b)).toBe(same);
      }),
    );
  });
});

describe('QUEUE_OPTIONS', () => {
  it('refuses a duplicate key while queued or active, and allows three attempts', () => {
    expect(QUEUE_OPTIONS).toEqual({ policy: 'exclusive', retryLimit: 2, retryDelay: 30, retryBackoff: true });
  });

  it('gives intake an hour per attempt and every other queue the shared settings', () => {
    expect(queueOptions('intake')).toEqual({ ...QUEUE_OPTIONS, expireInSeconds: 3600 });
    for (const type of JOB_TYPES.filter((candidate) => candidate !== 'intake')) {
      expect(queueOptions(type)).toBe(QUEUE_OPTIONS);
    }
  });
});
