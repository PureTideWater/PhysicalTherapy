import { readDatabaseUrl } from '@tp/db';

export interface WorkerConfig {
  readonly databaseUrl: string;
  readonly heartbeatMs: number;
}

const DEFAULT_HEARTBEAT_SECONDS = 30;

export class WorkerConfigError extends Error {
  override readonly name = 'WorkerConfigError';
}

/** Reads the worker's settings from the environment. */
export function readWorkerConfig(env: Readonly<Record<string, string | undefined>> = process.env): WorkerConfig {
  const raw = env.WORKER_HEARTBEAT_SECONDS ?? '';
  if (raw !== '' && !/^[1-9]\d{0,5}$/.test(raw)) {
    throw new WorkerConfigError('WORKER_HEARTBEAT_SECONDS must be a whole number of seconds from 1 to 999999');
  }
  const seconds = raw === '' ? DEFAULT_HEARTBEAT_SECONDS : Number.parseInt(raw, 10);
  let databaseUrl: string;
  try {
    databaseUrl = readDatabaseUrl(env);
  } catch (error) {
    throw new WorkerConfigError((error as Error).message);
  }
  return { databaseUrl, heartbeatMs: seconds * 1000 };
}
