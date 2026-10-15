import { z } from 'zod';

import { selfRoute } from '../http/invoke';
import type { Route } from '../http/route';
import { ABSTRACTION_ROUTES } from './abstraction';
import { ACCOUNT_ROUTES } from './account';
import { CONSOLE_ROUTES } from './console';
import { CONTRACT_ROUTES } from './contracts';
import { COVERAGE_ROUTES } from './coverage';
import { MAPPING_ROUTES } from './mapping';
import { PRACTICE_ROUTES } from './practice';
import { REMITTANCE_ROUTES } from './remittances';
import { SIGN_IN_ROUTES } from './sign-in';
import { UPLOAD_ROUTES } from './uploads';

/**
 * The route registry: every page, server action and route handler of apps/web, with its access
 * (public, self, a practice permission or a platform permission), its practice scoping and whether it
 * can show PHI. src/lib/routes/registry.test.ts proves every page.tsx, route.ts and server action is
 * registered here; route-tests.db.test.ts generates the cross-tenant, role, MFA and session tests for
 * every entry (test matrix SEC-02, SEC-15), so a route added later gets its tests with no extra work.
 */

/** The home page: where a signed-in user starts (their first practice, or the console). */
export const homePage = selfRoute({
  id: 'home',
  kind: 'page',
  path: '/',
  phi: false,
  params: z.object({}),
  handle: () => Promise.resolve({}),
  sample: { params: () => ({}) },
});

export const ROUTES: readonly Route[] = [
  homePage,
  ...SIGN_IN_ROUTES,
  ...ACCOUNT_ROUTES,
  ...PRACTICE_ROUTES,
  ...UPLOAD_ROUTES,
  ...REMITTANCE_ROUTES,
  ...MAPPING_ROUTES,
  ...COVERAGE_ROUTES,
  ...CONTRACT_ROUTES,
  ...ABSTRACTION_ROUTES,
  ...CONSOLE_ROUTES,
];

export function routeById(id: string): Route | undefined {
  return ROUTES.find((route) => route.id === id);
}
