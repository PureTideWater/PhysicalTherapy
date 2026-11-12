import { createLogger } from '@tp/observability';
import { describe, expect, it, vi } from 'vitest';

import { signOutAtProviderAfterCommit } from './provider-sign-out';

const MEMBERSHIP_END_PROVIDER_SIGN_OUT_FAILED_MESSAGE = 'security event: membership end provider sign-out failed';

function arrange(globalSignOut: (sub: string) => Promise<void>) {
  const lines: Record<string, unknown>[] = [];
  const committed: (() => Promise<unknown>)[] = [];
  const provider = { globalSignOut: vi.fn(globalSignOut) };
  const deps = { provider, logger: createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) }) };
  const unknown: (() => Promise<unknown>)[] = [];
  const afterCommit = (work: () => Promise<unknown>, options?: { readonly whenCommitUnknown?: () => Promise<unknown> }) => {
    committed.push(work);
    if (options?.whenCommitUnknown !== undefined) {
      unknown.push(options.whenCommitUnknown);
    }
  };
  return { lines, committed, unknown, provider, deps, afterCommit };
}
const ids = { userId: '0b0e7a52-5f0b-4f0e-9d7e-1a2b3c4d5e6f', requestId: 'test-request' };

describe('the provider sign-out after an ended membership (docs/adr/0094; SGN-19)', () => {
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

  it.each([
    ['an address', 'person@synthetic.test'],
    ['words', 'no sign-out for synthetic-subject'],
    ['a name too long', 'A'.repeat(65)],
    ['nothing', ''],
  ])('logs `unknown` for an error whose name is %s: only a class-like name is a code', async (_what, name) => {
    const { lines, committed, deps, afterCommit } = arrange(() => Promise.reject(Object.assign(new Error('synthetic'), { name })));
    signOutAtProviderAfterCommit(afterCommit, deps, ids, 'synthetic-subject');
    await committed[0]?.();
    expect(lines).toMatchObject([{ level: 'error', msg: MEMBERSHIP_END_PROVIDER_SIGN_OUT_FAILED_MESSAGE, error_code: 'unknown' }]);
    expect(JSON.stringify(lines)).not.toMatch(/synthetic-subject|@|AAAA/);
  });

  it('when the commit’s answer is lost, still asks the provider once and always logs the line, so the operator is paged to confirm what ended', async () => {
    const { lines, unknown, provider, deps, afterCommit } = arrange(() => Promise.resolve());
    signOutAtProviderAfterCommit(afterCommit, deps, ids, 'synthetic-subject');
    expect(unknown).toHaveLength(1);
    await expect(unknown[0]?.()).resolves.toBeUndefined();
    expect(provider.globalSignOut).toHaveBeenCalledExactlyOnceWith('synthetic-subject');
    expect(lines).toMatchObject([{ level: 'error', msg: MEMBERSHIP_END_PROVIDER_SIGN_OUT_FAILED_MESSAGE, user_id: ids.userId, request_id: ids.requestId, error_code: 'COMMIT_OUTCOME_UNKNOWN' }]);
  });

  it('when the commit’s answer is lost and the provider fails too, logs both lines by IDs', async () => {
    const { lines, unknown, deps, afterCommit } = arrange(() => Promise.reject(Object.assign(new Error('synthetic'), { name: 'TimeoutError' })));
    signOutAtProviderAfterCommit(afterCommit, deps, ids, 'synthetic-subject');
    await expect(unknown[0]?.()).resolves.toBeUndefined();
    expect(lines.map((line) => line['error_code'])).toEqual(['TimeoutError', 'COMMIT_OUTCOME_UNKNOWN']);
    expect(JSON.stringify(lines)).not.toMatch(/synthetic-subject|@/);
  });
});
