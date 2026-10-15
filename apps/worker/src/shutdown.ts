import type { Logger } from '@tp/observability';

import type { RunningWorker } from './worker';

export const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

export interface ShutdownProcess {
  once(signal: (typeof SHUTDOWN_SIGNALS)[number], listener: () => void): unknown;
  exit(code: number): never;
  exitCode?: number | string | null | undefined;
}

/**
 * On SIGTERM or SIGINT (ECS sends SIGTERM before a task stops), stops taking new jobs, lets active
 * jobs finish, and exits. A stop that hangs past `forceExitMs` exits non-zero.
 */
export function installShutdownHandlers(
  worker: RunningWorker,
  logger: Logger,
  proc: ShutdownProcess = process,
  forceExitMs = 45_000,
): void {
  const shutdown = () => {
    logger.info('worker stopping');
    const force = setTimeout(() => proc.exit(1), forceExitMs);
    force.unref();
    worker.stop().then(
      () => {
        clearTimeout(force);
        proc.exitCode = 0;
      },
      () => {
        clearTimeout(force);
        logger.error('worker stop failed', { error_code: 'WORKER_STOP_FAILED' });
        proc.exitCode = 1;
      },
    );
  };
  for (const signal of SHUTDOWN_SIGNALS) {
    proc.once(signal, shutdown);
  }
}
