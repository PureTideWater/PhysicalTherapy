import { createLogger } from '@tp/observability';
import { describe, expect, it, vi } from 'vitest';

import { signOutAtProviderAfterCommit } from './provider-sign-out';

const MEMBERSHIP_END_PROVIDER_SIGN_OUT_FAILED_MESSAGE = 'security event: membership end provider sign-out failed';

function arrange(globalSignOut: (sub: string) => Promise<void>) {
  const lines: Record<string, unknown>[] = [];
  const committed: (() => Promise<unknown>)[] = [];
  const provider = { globalSignOut: vi.fn(globalSignOut) };
  const deps = { provider, logger: createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) }) };
  return { lines, committed, provider, deps, afterCommit: (work: () => Promise<unknown>) => void committed.push(work) };
}
const ids = { userId: '0b0e7a52-5f0b-4f0e-9d7e-1a2b3c4d5e6f', requestId: 'test-request' };

describe('the provider sign-out after an ended membership (docs/adr/00XX; SGN-XX)', () => {
  it('asks nothing until the commit, then asks once and logs nothing on success', async () => {
    const { lines, committed, provider, deps, afterCommit } = arrange(() => Promise.resolve());
    signOutAtProviderAfterCommit(afterCommit, deps, ids, 'synthetic-subject');
    expect(provider.globalSignOut).not.toHaveBeenCalled();
    expect(committed).toHaveLength(1);
    await committed[0]?.();
    expect(provider.globalSignOut).toHaveBeenCalledExactlyOnceWith('synthetic-subject');
    expect(lines).toEqual([]);
  });

  it('never throws into the request: a failure is one error line with IDs and the error’s name only', async () => {
    const { lines, committed, deps, afterCommit } = arrange(() => Promise.reject(Object.assign(new Error('synthetic-subject at person@synthetic.test'), { name: 'InternalErrorException' })));
    signOutAtProviderAfterCommit(afterCommit, deps, ids, 'synthetic-subject');
    await expect(committed[0]?.()).resolves.toBeUndefined();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: 'error', msg: MEMBERSHIP_END_PROVIDER_SIGN_OUT_FAILED_MESSAGE, user_id: ids.userId, request_id: ids.requestId, error_code: 'InternalErrorException' });
    expect(JSON.stringify(lines)).not.toMatch(/synthetic-subject|@/);
  });

  it('logs the same line, and asks the provider nothing, when the subject could not be read', async () => {
    const { lines, committed, provider, deps, afterCommit } = arrange(() => Promise.resolve());
    signOutAtProviderAfterCommit(afterCommit, deps, ids, undefined);
    await committed[0]?.();
    expect(provider.globalSignOut).not.toHaveBeenCalled();
    expect(lines).toMatchObject([{ level: 'error', msg: MEMBERSHIP_END_PROVIDER_SIGN_OUT_FAILED_MESSAGE, user_id: ids.userId, request_id: ids.requestId, error_code: 'NO_PROVIDER_SUBJECT' }]);
  });
});
