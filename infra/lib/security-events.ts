import type { EnvironmentName } from './environments';

/**
 * The failed sign-in burst contract with the web app (PRD 19, Monitoring and alerts: "failed sign-in
 * bursts"; docs/product/sessions.md: ten failures lock the account). The web app logs these lines as
 * the `msg` of a JSON line (apps/web/src/lib/auth/sign-in.ts) with the user's ID and the request's ID
 * only; a metric filter on the web log group counts them and the alarm tells the operator. Bursts of
 * sign-in requests from one address are counted by the web ACL's sign-in rate rule (Edge), whose
 * blocks raise a second alarm.
 */
export const SIGN_IN_BURST_MESSAGES = ['security event: failed second-factor burst', 'security event: account locked after ten failed sign-ins'] as const;

export const SIGN_IN_BURST_METRIC = { namespace: 'TherapyPlatform/Web', metricName: 'FailedSignInBursts' } as const;

/** One evaluation period: the operator hears within five minutes. */
export const SECURITY_ALARM_PERIOD_SECONDS = 300;

/**
 * The reset and enrolment signals (R-11; docs/adr/0088, D7; test matrix SEC-23). The web app logs each as the `msg`
 * of a JSON line with IDs and an error name only: the provider's undelivered reset request
 * (apps/web/src/lib/auth/cognito-provider.ts, by Cognito's error name), the flow's failed reset request, a refused
 * second-factor enrolment and a refused client credential (apps/web/src/lib/auth/sign-in.ts). A metric filter on the
 * web log group counts each, and its alarm tells the operator. An undelivered request is split by its code: the codes
 * that mean the app and Cognito disagree or mail is broken alarm at one (only an active, enrolled account reaches the
 * send), the throttle codes at three in an hour (one account's throttling is expected under a flood, which the
 * per-user alarm shows; a pool quota shows here). And two lines of a completed reset: one whose sessions were not ended
 * (docs/adr/0091, D15), which queues no password-changed email, so its line pages instead; and one whose sign-out at the
 * provider failed (docs/adr/0091, D10), after which a key-registration step begun before the reset can still register a
 * hardware key, so its line pages too.
 */
export const PASSWORD_RESET_NOT_DELIVERED_MESSAGE = 'password reset request not delivered';
export const PASSWORD_RESET_NOT_DELIVERED_CONFIG_CODES = ['UserNotFoundException', 'NotAuthorizedException', 'InvalidParameterException', 'CodeDeliveryFailureException'] as const;
export const PASSWORD_RESET_NOT_DELIVERED_THROTTLE_CODES = ['LimitExceededException', 'TooManyRequestsException'] as const;
export const PASSWORD_RESET_FAILED_MESSAGE = 'password reset request failed';
/**
 * A reset request answered after its floor (RESET_REQUEST_FLOOR_MS, apps/web/src/lib/auth/sign-in.ts; docs/adr/0081;
 * review security-N-1): only an active, enrolled account reaches Cognito and the message trigger, so runs over the floor
 * could tell an account from none by timing. Three in an hour alarm: raise the floor, or find the slow call.
 */
export const PASSWORD_RESET_OVER_FLOOR_MESSAGE = 'password reset request over floor';
export const ENROLMENT_REFUSED_MESSAGE = 'security event: second-factor enrolment refused';
export const CLIENT_CREDENTIAL_REFUSED_MESSAGE = 'security event: client credential refused';
/**
 * The start-up probe's refusal (apps/web/src/lib/auth/credential-probe.ts; docs/adr/0088, D8; review infra-auth-IA-2):
 * a deploy whose probe refuses is rolled back before any user reaches it, so the flow's line above is never written,
 * and this is the one line that names the cause.
 */
export const CREDENTIAL_PROBE_REFUSED_MESSAGE = 'cognito probe refused';
/**
 * A completed reset whose app sessions were not ended (docs/adr/0091, D15; docs/adr/0081, A5; review R-3): Cognito holds
 * the new password, but the one transaction that ends the app's sessions and records the reset failed twice
 * (apps/web/src/lib/auth/sign-in.ts), so no password-changed email was queued. The web logs it at error with the user's
 * ID and the request's ID only. One alarms: the operator ends the account's sessions and tells the person another way.
 */
export const PASSWORD_RESET_SESSIONS_NOT_ENDED_MESSAGE = 'security event: password reset sessions not ended';
/**
 * A completed reset whose sign-out at the provider failed (docs/adr/0091, D10; review SEC-01 of 2026-11-11): the web
 * calls the provider's global sign-out after every completed reset of an account, whether or not the app's sessions
 * ended, and logs its failure at error with the user's ID, the request's ID and the error's name only
 * (apps/web/src/lib/auth/sign-in.ts, confirmPasswordReset); the reset still lands. The provider's grant of a
 * key-registration step begun before the reset then still works for the step's 15 minutes, so a hardware key can be
 * registered after the reset. Only an account that must sign in with a hardware key and has none is ever in that step:
 * one of PaidWhole's own, never a customer's. One alarms: the operator reads the audit log for a key registered by that
 * user since the reset, the one row the failed sign-out makes possible; a sign-in by authenticator code after it is the
 * person's own (docs/runbooks/incident-response.md, "A password reset whose provider sign-out failed").
 */
export const PASSWORD_RESET_PROVIDER_SIGN_OUT_FAILED_MESSAGE = 'security event: password reset provider sign-out failed';

/** One counted line: its metric (in SIGN_IN_BURST_METRIC's namespace), its message, the codes it is narrowed to (none: every one), and its alarm. */
export interface SecurityEventCount {
  readonly metricName: string;
  readonly message: string;
  readonly errorCodes: readonly string[];
  readonly threshold: number;
  readonly periodSeconds: number;
}

export const RESET_AND_ENROLMENT_COUNTS = [
  { metricName: 'PasswordResetNotDeliveredConfig', message: PASSWORD_RESET_NOT_DELIVERED_MESSAGE, errorCodes: PASSWORD_RESET_NOT_DELIVERED_CONFIG_CODES, threshold: 1, periodSeconds: SECURITY_ALARM_PERIOD_SECONDS },
  { metricName: 'PasswordResetNotDeliveredThrottled', message: PASSWORD_RESET_NOT_DELIVERED_MESSAGE, errorCodes: PASSWORD_RESET_NOT_DELIVERED_THROTTLE_CODES, threshold: 3, periodSeconds: 3600 },
  { metricName: 'PasswordResetRequestFailed', message: PASSWORD_RESET_FAILED_MESSAGE, errorCodes: [], threshold: 1, periodSeconds: SECURITY_ALARM_PERIOD_SECONDS },
  { metricName: 'SecondFactorEnrolmentRefused', message: ENROLMENT_REFUSED_MESSAGE, errorCodes: [], threshold: 1, periodSeconds: SECURITY_ALARM_PERIOD_SECONDS },
  { metricName: 'ClientCredentialRefused', message: CLIENT_CREDENTIAL_REFUSED_MESSAGE, errorCodes: [], threshold: 1, periodSeconds: SECURITY_ALARM_PERIOD_SECONDS },
  { metricName: 'ClientCredentialProbeRefused', message: CREDENTIAL_PROBE_REFUSED_MESSAGE, errorCodes: [], threshold: 1, periodSeconds: SECURITY_ALARM_PERIOD_SECONDS },
  { metricName: 'PasswordResetRequestOverFloor', message: PASSWORD_RESET_OVER_FLOOR_MESSAGE, errorCodes: [], threshold: 3, periodSeconds: 3600 },
  { metricName: 'PasswordResetSessionsNotEnded', message: PASSWORD_RESET_SESSIONS_NOT_ENDED_MESSAGE, errorCodes: [], threshold: 1, periodSeconds: SECURITY_ALARM_PERIOD_SECONDS },
  { metricName: 'PasswordResetProviderSignOutFailed', message: PASSWORD_RESET_PROVIDER_SIGN_OUT_FAILED_MESSAGE, errorCodes: [], threshold: 1, periodSeconds: SECURITY_ALARM_PERIOD_SECONDS },
] as const satisfies readonly SecurityEventCount[];

export type ResetAndEnrolmentMetricName = (typeof RESET_AND_ENROLMENT_COUNTS)[number]['metricName'];

/**
 * Reset requests per user (R-11; ADR 0081 A4; docs/adr/0088, D7). The flow logs this line for every account a reset is
 * asked for, a code sent or not, with the user's ID and the request's ID only. A Contributor Insights rule on the web
 * log group counts the lines by `$.user_id`, and an alarm on its MaxContributorValue tells the operator when one user
 * reaches the threshold in the period; the alarm names no user (the operator reads the rule's top contributors). No
 * metric filter counts the line: a `user_id` dimension would make a metric per user, and CloudWatch disables a filter
 * past 1,000 combinations.
 */
export const PASSWORD_RESET_REQUESTED_MESSAGE = 'password reset requested';
export const RESET_REQUESTS_PER_USER = { threshold: 5, periodSeconds: 3600 } as const;

/** The rule's name, unique in the account and Region: the alarm's expression names it. */
export const resetRequestsRuleName = (environment: EnvironmentName): string => `tp-${environment}-password-reset-requests-per-user`;
