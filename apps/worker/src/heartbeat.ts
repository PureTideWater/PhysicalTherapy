import type { Logger } from '@tp/observability';

export interface Heartbeat {
  stop(): void;
}

/**
 * Logs `worker heartbeat` now and every `intervalMs`. CloudWatch counts these lines; two missed
 * beats raise the alarm (PRD section 19, test matrix JOB-04; the alarm itself is milestone 1 CDK).
 */
export function startHeartbeat(logger: Logger, intervalMs: number): Heartbeat {
  const beat = () => {
    logger.info('worker heartbeat');
  };
  beat();
  const timer = setInterval(beat, intervalMs);
  return {
    stop: () => {
      clearInterval(timer);
    },
  };
}
