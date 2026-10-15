import { describe, expect, it } from 'vitest';

import { WorkerConfigError, readWorkerConfig } from './config';

const DATABASE_URL = 'postgres://u:p@localhost:5432/d';

describe('readWorkerConfig', () => {
  it('defaults the heartbeat to thirty seconds', () => {
    expect(readWorkerConfig({ DATABASE_URL })).toEqual({ databaseUrl: DATABASE_URL, heartbeatMs: 30_000 });
    expect(readWorkerConfig({ DATABASE_URL, WORKER_HEARTBEAT_SECONDS: '' }).heartbeatMs).toBe(30_000);
  });

  it('reads the heartbeat interval in seconds', () => {
    expect(readWorkerConfig({ DATABASE_URL, WORKER_HEARTBEAT_SECONDS: '15' }).heartbeatMs).toBe(15_000);
  });

  it.each(['0', '-5', '1.5', '10s', '07', '1000000'])('refuses a heartbeat of %j', (value) => {
    expect(() => readWorkerConfig({ DATABASE_URL, WORKER_HEARTBEAT_SECONDS: value })).toThrow(WorkerConfigError);
  });

  it('requires DATABASE_URL', () => {
    expect(() => readWorkerConfig({})).toThrow(WorkerConfigError);
    expect(() => readWorkerConfig({})).toThrow(/DATABASE_URL is not set/);
  });
});
