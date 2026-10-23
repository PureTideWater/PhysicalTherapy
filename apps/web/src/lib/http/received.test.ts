import { describe, expect, it } from 'vitest';

import { RECEIVED_AT_HEADER, receivedAtFrom, receivedStamp } from './received';

/** The receipt stamp read back (decision 14; docs/adr/0062): the proxy's own value, or none. */
describe('receivedAtFrom', () => {
  const now = new Date('2026-11-06T12:00:00.000Z');

  it('reads the proxy\'s stamp back as the time it was taken', () => {
    const stamp = receivedStamp(now.getTime() - 3_900);
    expect(receivedAtFrom(stamp, now)?.toISOString()).toBe('2026-11-06T11:59:56.100Z');
    expect(RECEIVED_AT_HEADER).toBe('x-tp-received-at');
  });

  it('gives none for no stamp, anything but decimal milliseconds, or a time after the handler\'s own clock', () => {
    for (const value of [null, undefined, '', ' 1', '1e12', '-1', '1.5', '0x10', 'Thu, 06 Nov 2026 12:00:00 GMT', '1'.repeat(16), String(now.getTime() + 1)]) {
      expect(receivedAtFrom(value, now)).toBeNull();
    }
  });
});
