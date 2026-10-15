import { z } from 'zod';

import { clearSession } from '../auth/pending';
import { endSession, listDevices, revokeDevice } from '../auth/sessions';
import { selfRoute } from '../http/invoke';
import { type MutationResult, NotFoundError } from '../http/route';
import { opaqueId } from './schemas';

/**
 * The signed-in user's own account: the device list with revocation (PRD 7, Sign-in and MFA) and
 * signing out. Self routes: any signed-in user, for their own records only (user_device and
 * user_session policies admit only the actor's rows).
 */

export const devicesPage = selfRoute({
  id: 'account.devices',
  kind: 'page',
  path: '/account/devices',
  phi: false,
  params: z.object({}),
  handle: async ({ scope, actor }) => ({ devices: await listDevices(scope), currentDeviceId: actor.deviceId }),
  sample: { params: () => ({}) },
});

export const revokeDeviceAction = selfRoute({
  id: 'account.revoke_device',
  kind: 'action',
  path: '/account/devices',
  phi: false,
  params: z.object({}),
  input: z.object({ deviceId: opaqueId }),
  audit: { action: 'device_revoked', objectType: 'user_device' },
  handle: async ({ scope, input, actor, request }): Promise<MutationResult> => {
    if (!(await revokeDevice(scope, input.deviceId))) {
      throw new NotFoundError();
    }
    if (input.deviceId === actor.deviceId) {
      clearSession(request.cookies);
      return { objectId: input.deviceId, redirect: '/sign-in?reason=device_revoked' };
    }
    return { objectId: input.deviceId, redirect: '/account/devices' };
  },
  sample: { params: () => ({}), input: (refs) => ({ deviceId: refs.actorDeviceId }) },
});

export const signOutAction = selfRoute({
  id: 'account.sign_out',
  kind: 'action',
  path: '/account/devices',
  phi: false,
  params: z.object({}),
  input: z.object({}),
  audit: { action: 'sign_out', objectType: 'user_session' },
  handle: async ({ scope, actor, request }): Promise<MutationResult> => {
    await endSession(scope, actor.sessionId);
    clearSession(request.cookies);
    return { objectId: actor.sessionId, redirect: '/sign-in?reason=signed_out' };
  },
  sample: { params: () => ({}), input: () => ({}) },
});

export const ACCOUNT_ROUTES = [devicesPage, revokeDeviceAction, signOutAction] as const;
