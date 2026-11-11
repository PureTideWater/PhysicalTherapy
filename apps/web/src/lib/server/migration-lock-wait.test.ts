import { MIGRATION_LOCK_WAIT } from '@tp/db';
import { describe, expect, it } from 'vitest';

import { WEB_LOCK_TIMEOUT_MS } from './lock-timeout';

describe('a web request queued behind a waiting migration', () => {
  it('is let through before it would be refused as busy: the migration gives its wait up first, with a second to spare', () => {
    // docs/adr/0009, the amendment of 2026-11-11: a request's wait starts no earlier than the migration's, so it ends
    // within the migration's limit, and the rest is the request's own work under the lock it then gets.
    expect(MIGRATION_LOCK_WAIT.timeoutMs + 1_000).toBeLessThanOrEqual(WEB_LOCK_TIMEOUT_MS);
  });
});
