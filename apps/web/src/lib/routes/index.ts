import { z } from 'zod';

import { selfRoute } from '../http/invoke';
import type { Route } from '../http/route';
import { ABSTRACTION_ROUTES } from './abstraction';
import { ACCOUNT_ROUTES } from './account';
import { BILLING_ROUTES } from './billing';
import { COMPLIANCE_ROUTES } from './compliance';
import { CONSOLE_ROUTES } from './console';
import { CONSOLE_MODEL_ROUTES } from './console-models';
import { CONSOLE_ONBOARDING_ROUTES } from './console-onboarding';
import { CONTRACT_ROUTES } from './contracts';
import { COVERAGE_ROUTES } from './coverage';
import { MAPPING_ROUTES } from './mapping';
import { MODEL_ROUTES } from './models';
import { MONITORING_ROUTES } from './monitoring';
import { ONBOARDING_ROUTES } from './onboarding';
import { PACKET_ROUTES } from './packets';
import { PRACTICE_ROUTES } from './practice';
import { PRICING_ROUTES } from './pricing';
import { RECONCILIATION_ROUTES } from './reconciliation';
import { RELEASE_ROUTES } from './releases';
import { REMITTANCE_ROUTES } from './remittances';
import { REPORT_DOCUMENT_ROUTES } from './report-documents';
import { REPORT_ROUTES } from './reports';
import { ROI_ROUTES } from './roi';
import { RULE_RELEASE_ROUTES } from './rule-releases';
import { SECURITY_ROUTES } from './security';
import { SETTINGS_ROUTES } from './settings';
import { SIGN_IN_ROUTES } from './sign-in';
import { SPECIALIST_ROUTES } from './specialist';
import { SUBMISSION_ROUTES } from './submissions';
import { SUPPORT_ROUTES } from './support';
import { TRIAGE_ROUTES } from './triage';
import { UPLOAD_ROUTES } from './uploads';
import { WORKBENCH_ROUTES } from './workbench';

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
  ...PRICING_ROUTES,
  ...TRIAGE_ROUTES,
  ...WORKBENCH_ROUTES,
  ...PACKET_ROUTES,
  ...SUBMISSION_ROUTES,
  ...REPORT_ROUTES,
  ...REPORT_DOCUMENT_ROUTES,
  ...RECONCILIATION_ROUTES,
  ...ROI_ROUTES,
  ...MONITORING_ROUTES,
  ...RELEASE_ROUTES,
  ...CONTRACT_ROUTES,
  ...ABSTRACTION_ROUTES,
  ...MODEL_ROUTES,
  ...SPECIALIST_ROUTES,
  ...CONSOLE_ROUTES,
  ...RULE_RELEASE_ROUTES,
  ...BILLING_ROUTES,
  ...ONBOARDING_ROUTES,
  ...CONSOLE_ONBOARDING_ROUTES,
  ...SETTINGS_ROUTES,
  ...SUPPORT_ROUTES,
  ...SECURITY_ROUTES,
  ...COMPLIANCE_ROUTES,
  ...CONSOLE_MODEL_ROUTES,
];

export function routeById(id: string): Route | undefined {
  return ROUTES.find((route) => route.id === id);
}
