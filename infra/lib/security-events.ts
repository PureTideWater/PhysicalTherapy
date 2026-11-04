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
 * per-user alarm shows; a pool quota shows here).
 */
export const PASSWORD_RESET_NOT_DELIVERED_MESSAGE = 'password reset request not delivered';
export const PASSWORD_RESET_NOT_DELIVERED_CONFIG_CODES = ['UserNotFoundException', 'NotAuthorizedException', 'InvalidParameterException', 'CodeDeliveryFailureException'] as const;
export const PASSWORD_RESET_NOT_DELIVERED_THROTTLE_CODES = ['LimitExceededException', 'TooManyRequestsException'] as const;
export const PASSWORD_RESET_FAILED_MESSAGE = 'password reset request failed';
export const ENROLMENT_REFUSED_MESSAGE = 'security event: second-factor enrolment refused';
export const CLIENT_CREDENTIAL_REFUSED_MESSAGE = 'security event: client credential refused';

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
