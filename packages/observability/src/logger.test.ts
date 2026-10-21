import { afterEach, describe, expect, it, vi } from 'vitest';

import { type LogFields, allowlistedFields, createLogger } from './logger';

const fixedClock = () => new Date('2026-10-14T12:00:00.000Z');

function capture() {
  const lines: string[] = [];
  return { lines, sink: (line: string) => lines.push(line) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createLogger', () => {
  it('writes one JSON line per entry with the allowlisted fields', () => {
    const { lines, sink } = capture();
    createLogger({ sink, now: fixedClock }).info('job started', { job_id: 'j-1', practice_id: 'p-1' });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '')).toEqual({
      job_id: 'j-1',
      practice_id: 'p-1',
      time: '2026-10-14T12:00:00.000Z',
      level: 'info',
      msg: 'job started',
    });
  });

  it('drops a synthetic patient record that reaches it through a cast (canary)', () => {
    const { lines, sink } = capture();
    const synthetic = {
      practice_id: 'p-1',
      first_name: 'SYNTHETIC',
      last_name: 'TWIN',
      dob: '1950-01-01',
      member_id: 'SYN000000001',
      patient_control_number: 'SYNPCN0001',
      document_text: 'CLP*SYNPCN0001*1*100*80',
    } as unknown as LogFields;
    createLogger({ sink, now: fixedClock }).warn('canary', synthetic);
    const line = lines[0] ?? '';
    expect(JSON.parse(line)).toEqual({ practice_id: 'p-1', time: '2026-10-14T12:00:00.000Z', level: 'warn', msg: 'canary' });
    for (const leaked of ['SYNTHETIC', 'TWIN', '1950-01-01', 'SYN000000001', 'SYNPCN0001', 'CLP*']) {
      expect(line).not.toContain(leaked);
    }
  });

  it('logs IDs only, whatever a synthetic record hands it (canary, SEC-07)', () => {
    const { lines, sink } = capture();
    const ids = { practice_id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c01', claim_id: '9c8b7a65-4321-4fed-8cba-987654321001', job_id: '5e4d3c2b-1a09-4f8e-8d7c-6b5a49382701' };
    const record = {
      ...ids,
      patient_name: 'SYNTHETIC TWIN',
      dob: '1950-01-01',
      member_id: 'SYN000000001',
      subscriber_id: 'SYN000000002',
      payer_claim_control_number: 'SYNICN0001',
      claim_number: '123456789',
      document_text: 'CLP*SYNPCN0001*1*100*80~',
      address: { line1: 'SYNTHETIC STREET' },
    } as unknown as LogFields;
    const logger = createLogger({ sink, now: fixedClock, level: 'debug' });
    logger.debug('canary', record);
    logger.child(record).info('canary child');
    for (const line of lines) {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      for (const [key, value] of Object.entries(parsed)) {
        if (['time', 'level', 'msg'].includes(key)) {
          continue;
        }
        expect(key).toMatch(/_id$/);
        expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      }
      expect(parsed).toMatchObject(ids);
      expect(line).not.toMatch(/SYN|TWIN|1950|123456789|CLP|STREET/);
    }
    expect(lines).toHaveLength(2);
  });

  it('drops nested objects and arrays even under an allowlisted key', () => {
    const fields = { practice_id: { name: 'x' }, job_id: ['a'], case_id: undefined } as unknown as LogFields;
    expect(allowlistedFields(fields)).toEqual({});
  });

  it('serializes bigint, number, boolean and null values', () => {
    expect(allowlistedFields({ release_no: 1n, job_type: null, error_code: true, worker_id: 7 })).toEqual({
      release_no: '1',
      job_type: null,
      error_code: true,
      worker_id: 7,
    });
  });

  it('filters entries below the configured level', () => {
    const { lines, sink } = capture();
    const logger = createLogger({ sink, level: 'warn', now: fixedClock });
    logger.debug('a');
    logger.info('b');
    logger.warn('c');
    logger.error('d');
    expect(lines.map((line) => (JSON.parse(line) as { msg: string }).msg)).toEqual(['c', 'd']);
  });

  it('defaults to info', () => {
    const { lines, sink } = capture();
    const logger = createLogger({ sink });
    logger.debug('hidden');
    logger.info('shown');
    expect(lines).toHaveLength(1);
  });

  it('carries base and child fields, and the call fields win', () => {
    const { lines, sink } = capture();
    const logger = createLogger({ sink, now: fixedClock, base: { worker_id: 'w-1' } });
    logger.child({ practice_id: 'p-1', job_id: 'j-1' }).error('failed', { job_id: 'j-2', error_code: 'EDI_SYNTAX' });
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({
      worker_id: 'w-1',
      practice_id: 'p-1',
      job_id: 'j-2',
      error_code: 'EDI_SYNTAX',
      level: 'error',
    });
  });

  it('writes to standard output by default', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    createLogger().info('to stdout');
    expect(write).toHaveBeenCalledTimes(1);
    expect(String(write.mock.calls[0]?.[0])).toMatch(/"msg":"to stdout"}\n$/);
  });
});

describe('numeric fields', () => {
  it('keeps a phase’s elapsed milliseconds and record count only as finite, non-negative numbers', () => {
    const { lines, sink } = capture();
    const logger = createLogger({ sink, now: fixedClock });
    logger.info('phase', { screening_run_id: 'r-1', elapsed_ms: 1234, record_count: 0 });
    logger.info('phase', { elapsed_ms: 'SYNTHETIC TWIN', record_count: Number.NaN } as unknown as LogFields);
    logger.info('phase', { elapsed_ms: -1, record_count: Number.POSITIVE_INFINITY });
    expect(lines.map((line) => JSON.parse(line) as Record<string, unknown>)).toEqual([
      { screening_run_id: 'r-1', elapsed_ms: 1234, record_count: 0, time: '2026-10-14T12:00:00.000Z', level: 'info', msg: 'phase' },
      { time: '2026-10-14T12:00:00.000Z', level: 'info', msg: 'phase' },
      { time: '2026-10-14T12:00:00.000Z', level: 'info', msg: 'phase' },
    ]);
    expect(allowlistedFields({ elapsed_ms: 10n })).toEqual({});
  });
});
