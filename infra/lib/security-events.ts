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
