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
 * hardware key, so its line pages too. The three lines of docs/adr/0093 follow them, with their own comment below.
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
 * A provider sign-out that was not delivered (docs/adr/0095; test matrix SGN-19). The web asks the provider for no
 * sign-out: an ended membership, a completed reset (or one whose outcome is unknown) and a hardware key removal each
 * write their audit event, the database queues one `provider_sign_out` row in that transaction, and the platform job
 * `provider_sign_outs` sends it and retries (apps/worker/src/platform/provider-sign-outs.ts). The app's own sessions
 * end and the account's sign-in mark moves at the commit, so what a late sign-out leaves open is only what the
 * provider's own tokens can do. The job writes this line at error for a row that is late (`error_code` LATE) and for
 * one it has given up (GAVE_UP), with the sign-out's ID, the user's ID and the cause's request ID only, at least once
 * each. One alarms, on the **platform** log group: it replaces the web's two alarms for the lines the web no longer
 * writes (a reset's failed sign-out, docs/adr/0091, D10; an ended membership's, docs/adr/0094).
 */
export const PROVIDER_SIGN_OUT_NOT_DELIVERED_ALARM = {
  metricName: 'ProviderSignOutNotDelivered',
  message: 'security event: provider sign-out not delivered',
  threshold: 1,
  periodSeconds: SECURITY_ALARM_PERIOD_SECONDS,
} as const;

/**
 * The provider_sign_outs job not running (docs/adr/0095, D16). The platform heartbeat says the process is alive and
 * the final-failure filter says a run failed; neither hears a schedule that stops firing this one job, and then no
 * sign-out is sent and none becomes late, so the alarm above stays silent. The job writes this line once a run, every
 * minute, with a count only (apps/worker/src/platform/provider-sign-outs.ts). The alarm is on the line's absence:
 * `missedPeriods` consecutive periods with none, a period with no data counting as missed.
 */
export const PROVIDER_SIGN_OUTS_NOT_RUNNING_ALARM = {
  alarmName: 'ProviderSignOutsNotRunning',
  metricName: 'ProviderSignOutsRun',
  message: 'provider sign-outs run',
  periodSeconds: 300,
  missedPeriods: 2,
} as const;

/**
 * The provider's sign-out failing try after try (docs/adr/0095; the round-1 review, B1). With the provider slow and
 * rows queued, each run makes about one try a minute and fresh rows are tried first, so a row's fourth try, which is
 * what makes it late, can be hours away, and the alarm on an undelivered sign-out stays silent all that time. The job
 * writes this line at warn for every failed try, with the sign-out's ID, the user's ID and the error's name only
 * (apps/worker/src/platform/provider-sign-outs.ts). Three in fifteen minutes alarm, on the **platform** log group.
 */
export const PROVIDER_SIGN_OUT_ATTEMPTS_FAILING_ALARM = {
  metricName: 'ProviderSignOutAttemptsFailing',
  message: 'provider sign-out attempt failed',
  threshold: 3,
  periodSeconds: 900,
} as const;

/**
 * The provider answering "no such user" (docs/adr/0095; the round-1 review, B4). That answer counts as done: nothing
 * is left to sign out. A worker given another pool's ID gets it for every row, so every sign-out is recorded done and
 * none was made. The job's done line carries the answer in `outcome_code`
 * (apps/worker/src/platform/provider-sign-outs.ts). Three in fifteen minutes alarm, on the **platform** log group.
 */
export const PROVIDER_SIGN_OUT_NO_SUCH_USER_ALARM = {
  metricName: 'ProviderSignOutNoSuchUser',
  outcomeCode: 'no_such_user',
  threshold: 3,
  periodSeconds: 900,
} as const;

/**
 * The relying-party ID the web was given is not the provider's (docs/adr/0095; the round-1 review, A6). The web
 * refuses every hardware-key step and logs a line at error with this code in `error_code` and the request's ID only
 * (apps/web/src/lib/auth/sign-in.ts). It fails closed, and nobody with a key signs in until a deploy mends it: one
 * alarms, on the **web** log group.
 */
export const RELYING_PARTY_MISMATCH_ALARM = {
  metricName: 'RelyingPartyMismatch',
  errorCode: 'RELYING_PARTY_MISMATCH',
  threshold: 1,
  periodSeconds: SECURITY_ALARM_PERIOD_SECONDS,
} as const;

/**
 * The provider offers neither algorithm the product registers a hardware key under, ES256 or RS256 (ruling R2;
 * docs/adr/0095; the delta review, D2). The web refuses the registration step and logs a line at error with this code
 * in `error_code` and the user's and the request's IDs only (apps/web/src/lib/auth/sign-in.ts). It fails closed, and
 * no hardware key is registered until the pool's settings are mended: one alarms, on the **web** log group.
 */
export const KEY_ALGORITHMS_NOT_OFFERED_ALARM = {
  metricName: 'KeyAlgorithmsNotOffered',
  errorCode: 'KEY_ALGORITHMS_NOT_OFFERED',
  threshold: 1,
  periodSeconds: SECURITY_ALARM_PERIOD_SECONDS,
} as const;

/**
 * A removed hardware key used (docs/adr/0095): a sign-in answered with a key that two platform administrators removed
 * from the account. The web refuses it and logs the line at error with the user's ID and the request's ID only
 * (apps/web/src/lib/auth/sign-in.ts). Someone still holds the removed key: one alarms.
 */
export const REMOVED_HARDWARE_KEY_USED_MESSAGE = 'security event: removed hardware key used';

/**
 * The four lines of a sign-in around a password reset (docs/adr/0093; test matrix SGN-17 and SGN-18). The web logs each
 * as the `msg` of a JSON line with the user's ID, the request's ID and a code in `error_code` only
 * (apps/web/src/lib/auth/sign-in.ts).
 *
 * A step refused: a sign-in step begun at or before the account's latest recorded reset was answered after it
 * (docs/adr/0093, D5). The web logs it at warn with the step in `error_code`, and only for that reason: a step with no
 * start, an unknown account and a start ahead of the database's clock are refused without it (the last logs
 * `sign-in step start is ahead of the database clock` at error, which no filter here counts). A reset asked for in the same browser
 * replaces that browser's pending step, so a stale step is another browser or device; at the code step it means the old
 * password was proved around the reset. It is counted for every step but `key`: no password was proved there, and a new
 * attempt succeeds.
 *
 * A key registered across a reset: a hardware-key registration already at the provider when the reset was recorded
 * came back registered (docs/adr/0093, D6). The web asks the provider to remove the key and logs the line at error with
 * `error_code` removed, not_removed (the key stays and the account is locked, so the key signs in to nothing until a
 * platform administrator unlocks it) or not_removed_not_locked (the key stays and the lock failed too: the urgent one).
 *
 * A crossed account: the address typed names one account and the provider's subject another (docs/adr/0093, D5). The
 * web refuses the sign-in outright and logs the line at warn with the subject's account's ID. A sound database has
 * none; finding and repairing one is Schema PR 6's.
 *
 * An unknown outcome: the provider did not say whether it reset the password (docs/adr/0093, D9). The web ends the
 * account's sessions, moves its mark, queues no password-changed email and logs the line at error with the provider
 * error's name; `user_id` is null when the address names no account.
 */
export const STEP_REFUSED_AFTER_RESET_MESSAGE = 'security event: sign-in step refused after a password reset';
export const STEP_REFUSED_AFTER_RESET_COUNTED_STEPS = ['new_password', 'mfa_setup', 'mfa', 'register_key', 'key_registered'] as const;
/** The one step the line is logged for and not counted. */
export const STEP_REFUSED_AFTER_RESET_UNCOUNTED_STEP = 'key';
export const KEY_REGISTERED_ACROSS_RESET_MESSAGE = 'security event: hardware key registered across a password reset';
export const KEY_REGISTERED_ACROSS_RESET_CODES = ['removed', 'not_removed', 'not_removed_not_locked'] as const;
/** Logged at error, counted by no filter: a start ahead of the database's clock is a clock fault, not evidence of a person. */
export const STEP_START_AHEAD_OF_CLOCK_MESSAGE = 'sign-in step start is ahead of the database clock';
export const CROSSED_ACCOUNT_REFUSED_MESSAGE = 'security event: sign-in refused for a crossed account';
export const PASSWORD_RESET_OUTCOME_UNKNOWN_MESSAGE = 'security event: password reset outcome unknown';

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
  { metricName: 'SignInStepRefusedAfterReset', message: STEP_REFUSED_AFTER_RESET_MESSAGE, errorCodes: STEP_REFUSED_AFTER_RESET_COUNTED_STEPS, threshold: 1, periodSeconds: SECURITY_ALARM_PERIOD_SECONDS },
  { metricName: 'HardwareKeyRegisteredAcrossReset', message: KEY_REGISTERED_ACROSS_RESET_MESSAGE, errorCodes: [], threshold: 1, periodSeconds: SECURITY_ALARM_PERIOD_SECONDS },
  { metricName: 'PasswordResetOutcomeUnknown', message: PASSWORD_RESET_OUTCOME_UNKNOWN_MESSAGE, errorCodes: [], threshold: 1, periodSeconds: SECURITY_ALARM_PERIOD_SECONDS },
  { metricName: 'SignInRefusedCrossedAccount', message: CROSSED_ACCOUNT_REFUSED_MESSAGE, errorCodes: [], threshold: 1, periodSeconds: SECURITY_ALARM_PERIOD_SECONDS },
  { metricName: 'RemovedHardwareKeyUsed', message: REMOVED_HARDWARE_KEY_USED_MESSAGE, errorCodes: [], threshold: 1, periodSeconds: SECURITY_ALARM_PERIOD_SECONDS },
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
