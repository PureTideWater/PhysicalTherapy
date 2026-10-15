import { createLogger } from '@tp/observability';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startHeartbeat } from './heartbeat';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startHeartbeat', () => {
  it('beats at start and on every interval until stopped', () => {
    const lines: string[] = [];
    const logger = createLogger({ sink: (line) => lines.push(line), base: { worker_id: 'w-1' } });
    const heartbeat = startHeartbeat(logger, 30_000);
    expect(lines).toHaveLength(1);
    vi.advanceTimersByTime(90_000);
    expect(lines).toHaveLength(4);
    heartbeat.stop();
    vi.advanceTimersByTime(90_000);
    expect(lines).toHaveLength(4);
    for (const line of lines) {
      expect(JSON.parse(line)).toMatchObject({ msg: 'worker heartbeat', worker_id: 'w-1', level: 'info' });
    }
  });
});
