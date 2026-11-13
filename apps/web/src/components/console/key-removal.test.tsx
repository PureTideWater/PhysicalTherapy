import type * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ActionState } from '../../lib/http/next';
import type { MemberSummary } from '../../lib/routes/console';
import type { KeyRemovalSummary } from '../../lib/routes/console-keys';
import { KeyRemovalActions, KeyRemovalState } from './key-removal';

/**
 * A member's hardware-key state and actions in the console as the server renders them (docs/adr/0095; UX review U2,
 * U3, U5, U6, U10, U12, U14): every button names its account after its visible words, the state's words are true to
 * the record, and the state text can take the focus. The browser half is e2e/key-registry.spec.ts. Synthetic values only.
 */

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useActionState: <S,>(_action: unknown, initial: S): [S, () => void, boolean] => [initial, () => undefined, false] };
});
vi.mock('../form-keys', () => ({ FormKeys: () => <input type="hidden" name="requestKey" value="synthetic-request-key" /> }));
// The server actions reach the routes and the database; the markup needs only something to post to.
vi.mock('../../app/console/actions', () => {
  const action = (state: ActionState): Promise<ActionState> => Promise.resolve(state);
  return { requestKeyRemovalAction: action, confirmKeyRemovalAction: action, cancelKeyRemovalAction: action, openKeyRegistrationAction: action };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const ORGANIZATION = '00000000-0000-4000-8000-0000000000a1';
const REMOVAL = '00000000-0000-4000-8000-0000000000b1';
const USER = '00000000-0000-4000-8000-0000000000e1';
const EMAIL = 'key-removal-member@synthetic.test';
const NOW = new Date('2026-11-12T21:00:00Z');

const removal = (over: Partial<KeyRemovalSummary> = {}): KeyRemovalSummary => ({
  removalId: REMOVAL,
  state: 'requested',
  requestedById: '00000000-0000-4000-8000-0000000000c1',
  requestedByEmail: 'key-removal-requester@synthetic.test',
  mine: false,
  requestedAt: new Date('2026-11-12T20:43:00Z'),
  expiresAt: new Date('2026-11-13T20:43:00Z'),
  decidedAt: null,
  liveKeys: 1,
  registrationOpenUntil: null,
  registrationClosed: false,
  ...over,
});
const member = (keyRemoval: KeyRemovalSummary | null, over: Partial<MemberSummary> = {}): MemberSummary => ({
  membershipId: '00000000-0000-4000-8000-0000000000d1',
  userId: USER,
  email: EMAIL,
  role: 'support',
  userStatus: 'active',
  mfaEnrolled: true,
  locked: false,
  endsAt: null,
  current: true,
  self: false,
  keyRemoval,
  ...over,
});
const actions = (one: MemberSummary): string => renderToStaticMarkup(<KeyRemovalActions member={one} organizationId={ORGANIZATION} now={NOW} />);
const CONFIRMED = { state: 'confirmed', decidedAt: new Date('2026-11-12T20:50:00Z'), liveKeys: 0, registrationClosed: true } as const;

describe('the hardware-key actions of a member', () => {
  it('names the account after each button’s visible words (U2)', () => {
    expect(actions(member(null))).toContain(`Request key removal<span class="sr-only"> for ${EMAIL}</span>`);
    const requested = actions(member(removal()));
    expect(requested).toContain(`Confirm key removal<span class="sr-only"> for ${EMAIL}</span>`);
    expect(requested).toContain(`Cancel removal request<span class="sr-only"> for ${EMAIL}</span>`);
    expect(requested).not.toContain('Cancel request');
    expect(actions(member(removal(CONFIRMED)))).toContain(`Open key registration<span class="sr-only"> for ${EMAIL}</span>`);
  });

  it('groups them under the account’s name (U14)', () => {
    expect(actions(member(null))).toContain(`role="group" aria-label="Hardware keys of ${EMAIL}"`);
  });

  it('says what a confirmation removes for good, and what mends the account (U6)', () => {
    const text = actions(member(removal()));
    expect(text).toContain('They cannot sign in until an administrator opens registration and they register a new key; the removed keys cannot be restored.');
    expect(text).not.toContain('cannot be undone');
  });

  it('tells the account itself that one more administrator decides, not two (U12)', () => {
    const text = actions(member(removal(), { self: true }));
    expect(text).toContain('Another platform administrator asked to remove your hardware keys at 2026-11-12 20:43 UTC. A second administrator confirms or cancels it; no one acts on the keys of their own account.');
    expect(text).not.toContain('Two others decide');
    expect(text).not.toContain('<button');
  });

  it('lets each state’s words take the focus, under the account’s id (U3)', () => {
    const focusable = `id="key-state-${USER}" tabindex="-1"`;
    expect(actions(member(removal({ mine: true })))).toMatch(new RegExp(`<p ${focusable}[^>]*data-key-state="requested"[^>]*>You asked to remove`));
    expect(actions(member(removal({ state: 'cancelled', decidedAt: new Date('2026-11-12T20:45:00Z') })))).toMatch(new RegExp(`<p ${focusable}[^>]*data-key-state="cancelled"[^>]*>No key removal stands for this account: the request of 2026-11-12 20:43 UTC was cancelled\\.`));
    expect(actions(member(removal({ state: 'expired' })))).toContain('No key removal stands for this account: the request of 2026-11-12 20:43 UTC expired.');
    expect(actions(member(removal(CONFIRMED)))).toMatch(new RegExp(`<p ${focusable}[^>]*data-key-state="removed"[^>]*>Keys removed at 2026-11-12 20:50 UTC\\.`));
    // Registered again since: the account is as any other's, and nothing is said of the old removal.
    expect(actions(member(removal({ ...CONFIRMED, registrationClosed: false })))).not.toContain('data-key-state');
  });

  it('says after a reload when a lost code can be replaced (U5)', () => {
    const text = actions(member(removal({ ...CONFIRMED, registrationOpenUntil: new Date('2026-11-12T21:50:00Z') })));
    expect(text).toContain('Registration of a new key is open until 2026-11-12 21:50 UTC. The code was shown once to the administrator who opened it. If it was lost, open registration again after 2026-11-12 21:50 UTC.');
    expect(text).not.toContain('<button');
  });
});

describe('the key-state badge', () => {
  it('shows a pending request as a neutral state and removed keys as danger (U10)', () => {
    const pending = renderToStaticMarkup(<KeyRemovalState member={member(removal())} now={NOW} />);
    expect(pending).toContain('key removal requested');
    expect(pending).not.toContain('danger');
    expect(renderToStaticMarkup(<KeyRemovalState member={member(removal(CONFIRMED))} now={NOW} />)).toContain('danger');
  });
});
