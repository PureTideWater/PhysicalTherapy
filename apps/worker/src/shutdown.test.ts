import { EventEmitter } from 'node:events';

import { createLogger } from '@tp/observability';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type ShutdownProcess, installShutdownHandlers } from './shutdown';

class FakeProcess extends EventEmitter implements ShutdownProcess {
  exitCode: number | undefined = undefined;
  readonly exits: number[] = [];
  exit(code: number): never {
    this.exits.push(code);
    return undefined as never;
  }
}

function capture() {
  const messages: string[] = [];
  const logger = createLogger({ sink: (line) => messages.push((JSON.parse(line) as { msg: string }).msg) });
  return { messages, logger };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

afterEach(() => {
  vi.useRealTimers();
});

describe('installShutdownHandlers', () => {
  it.each(['SIGTERM', 'SIGINT'] as const)('stops the worker gracefully on %s', async (signal) => {
    const proc = new FakeProcess();
    const stop = vi.fn(() => Promise.resolve());
    const { messages, logger } = capture();
    installShutdownHandlers({ stop }, logger, proc);
    proc.emit(signal);
    await settle();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(proc.exitCode).toBe(0);
    expect(proc.exits).toEqual([]);
    expect(messages).toEqual(['worker stopping']);
  });

  it('sets a failing exit code when the stop fails', async () => {
    const proc = new FakeProcess();
    const { messages, logger } = capture();
    installShutdownHandlers({ stop: () => Promise.reject(new Error('stuck')) }, logger, proc);
    proc.emit('SIGTERM');
    await settle();
    expect(proc.exitCode).toBe(1);
    expect(messages).toEqual(['worker stopping', 'worker stop failed']);
  });

  it('forces an exit when the stop hangs', () => {
    vi.useFakeTimers();
    const proc = new FakeProcess();
    const { logger } = capture();
    installShutdownHandlers({ stop: () => new Promise<void>(() => undefined) }, logger, proc, 1_000);
    proc.emit('SIGTERM');
    vi.advanceTimersByTime(1_000);
    expect(proc.exits).toEqual([1]);
  });

  it('listens once per signal', () => {
    const proc = new FakeProcess();
    const { logger } = capture();
    installShutdownHandlers({ stop: () => Promise.resolve() }, logger, proc);
    expect(proc.listenerCount('SIGTERM')).toBe(1);
    expect(proc.listenerCount('SIGINT')).toBe(1);
    proc.emit('SIGTERM');
    expect(proc.listenerCount('SIGTERM')).toBe(0);
  });
});
