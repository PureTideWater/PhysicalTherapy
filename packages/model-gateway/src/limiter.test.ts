import { describe, expect, it } from 'vitest';

import { CallLimiter, DEFAULT_CALL_LIMITS } from './limiter';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

describe('CallLimiter (docs/adr/0055)', () => {
  it('holds a process to its cap and a practice to its own, and frees a place once', () => {
    const limiter = new CallLimiter({ perProcess: 3, perPractice: 2 });
    const first = limiter.tryAcquire(A);
    const second = limiter.tryAcquire(A);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    // The practice is at its cap; another practice is not.
    expect(limiter.tryAcquire(A)).toBeNull();
    const other = limiter.tryAcquire(B);
    expect(other).not.toBeNull();
    // The process is at its cap, for every practice and for a synthetic call that names none.
    expect(limiter.tryAcquire(B)).toBeNull();
    expect(limiter.tryAcquire(null)).toBeNull();
    expect(limiter.current(A)).toEqual({ total: 3, practice: 2 });
    first?.();
    first?.();
    expect(limiter.current(A)).toEqual({ total: 2, practice: 1 });
    const third = limiter.tryAcquire(null);
    expect(third).not.toBeNull();
    expect(limiter.current(null)).toEqual({ total: 3, practice: 0 });
    third?.();
    second?.();
    other?.();
    expect(limiter.current(A)).toEqual({ total: 0, practice: 0 });
    expect(limiter.current(B)).toEqual({ total: 0, practice: 0 });
  });

  it('keeps the web app’s calls well under its pool, and refuses limits that mean nothing', () => {
    expect(DEFAULT_CALL_LIMITS).toEqual({ perProcess: 4, perPractice: 2 });
    expect(new CallLimiter().limits).toBe(DEFAULT_CALL_LIMITS);
    for (const limits of [
      { perProcess: 0, perPractice: 0 },
      { perProcess: 2, perPractice: 3 },
      { perProcess: 3 / 2, perPractice: 1 },
      { perProcess: 2, perPractice: 1 / 2 },
    ]) {
      expect(() => new CallLimiter(limits)).toThrow(RangeError);
    }
  });
});
