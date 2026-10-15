# 0016. Sign in through an identity provider interface, and keep sessions, devices and the lockout in the application's database

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 3 (authorization in code, lifecycle events), 5 (J1, J2, J16), 6 (Identity and sessions), 7 (Sign-in and
  MFA), 15 (Stack: identity), 16 (Authentication); `docs/product/sessions.md`; test matrix SEC-15; ADRs 0012 and 0013

## Context

Milestone 1 adds sign-in: Cognito with mandatory MFA (TOTP or a hardware key, hardware keys required for internal
roles), a lockout after ten failures, a device list with revocation, sign-in and device events in the audit log,
security events for the weekly review, and the session rules of `sessions.md` (HttpOnly, Secure, SameSite=Lax cookies; 12
hours absolute; 30 minutes idle on PHI screens; memberships and grants re-resolved on every request). Development and the
e2e tests have no Cognito. ADR 0012 turned Cognito's device tracking off, because a remembered device skips MFA, and named
the device list and the ten-failure lockout application rules. Next.js server components cannot write cookies, so an
idle clock carried in a cookie could only be advanced by middleware, which the plan forbids relying on.

## Decision

**One `AuthProvider` interface** (`apps/web/src/lib/auth/provider.ts`) proves who someone is and nothing else: password,
a new password after a temporary one, TOTP enrollment and challenge, WebAuthn sign-in and registration, invitation
(`ensureUser`), and provider-wide sign-out. `CognitoAuthProvider` uses the choice-based flow (`USER_AUTH`: `PASSWORD`, then
`SOFTWARE_TOKEN_MFA`, `MFA_SETUP` or `NEW_PASSWORD_REQUIRED`; `WEB_AUTHN` for passkeys), verifies the ID token with
aws-jwt-verify before trusting the subject, registers passkeys with the access token, and revokes the refresh token as soon
as the application's session exists (`release`). `DevAuthProvider` enforces the same rules locally: scrypt hashes at
OWASP's minimum cost, the 12-character four-class policy, TOTP through otpauth (one step either side, each step once),
and real WebAuthn verification (@simplewebauthn/server, user verification required), so Playwright's virtual
authenticator exercises the hardware-key path; its store is a JSON file outside the database (as Cognito's is), written by
`pnpm db:seed` from derived synthetic credentials. Challenges between steps are sealed (AES-256-GCM, purpose-bound,
expiring) into a five-minute HttpOnly cookie.

**The application's rules sit above the provider, the same for both** (`SignInFlow`, `src/lib/auth/sign-in.ts`):

- *Lockout.* `user.failed_sign_ins` and `user.locked_at` (new columns the application role cannot write) count consecutive
  failures of any stage; the tenth locks the account until a platform administrator unlocks it in the console
  (`unlock_user()`). A locked account is refused before any credential is tried. The plan sets no unlock period, so none
  is invented; Cognito's own exponential lockout sits beneath it.
- *Hardware keys for internal roles.* A user with `hardware_key_required` or a current internal membership never gets a
  session from a TOTP sign-in: with no key yet, that sign-in only registers one (then they sign in with it); with a key,
  it is refused. Every request checks again that the session's second factor was a hardware key.
- *Security events* (audit `security_event`): a failed-MFA burst is the third failed second factor within fifteen minutes;
  a lock; a sign-in from a new device for a user who had devices before (a first device is no signal). The weekly review
  reads `audit_event WHERE action = 'security_event'`.

**Sessions and devices are tables** (`user_session`, `user_device`; migration 20261015170000), because the provider
cannot hold them: device tracking is off (ADR 0012), access tokens cannot be revoked for offline verification, and the
idle limit is not a provider concept. A session cookie and a device cookie each carry 256 random bits; the tables keep
only SHA-256s. `resolve_session()` runs on every request: it ends a session at 12 hours (also a check constraint), after 30
minutes without a request, on a revoked device or a disabled user, and touches it otherwise; the idle limit is enforced on
every authenticated request, which includes every screen that can show PHI. Both tables force row-level security with
self policies; the clocks (`last_seen_at`, `expires_at`) have no application-role privilege. Revoking a device ends its
sessions; ending a membership revokes all of the user's sessions (`revoke_user_sessions()`) and signs them out of the
provider. The device list's "revoke" is the application's, not Cognito's `AdminForgetDevice`: there are no Cognito
devices to forget.

**MFA is mandatory everywhere.** Sign-in has no path to a session without a second factor; `resolve_session` reports the
user's MFA enrollment and every route refuses a session whose user is not active with MFA enrolled; the
effective-permission function (ADR 0013) counts no membership of such a user.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| Cognito device tracking for the device list | Remembered devices suppress MFA (ADR 0012); tracked-only devices need device SRP in the client and still leave idle and revocation to the application |
| A sealed, stateless session cookie with a last-seen time | Server components cannot rewrite cookies, so the idle clock would need middleware; revocation would wait for token expiry |
| Counting failures from audit_event alone | Possible, but the lock then has no single row an administrator can clear; two columns are simpler to test and to explain |
| A timed unlock | The plan states the lockout, not its period; an administrator unlock invents nothing |
| Storing the development provider's credentials in the database | Production keeps none there; a separate local store keeps the two the same shape |

## Consequences

- `pnpm test:db` covers the flow end to end (`sign-in.db.test.ts`, `sign-in-routes.db.test.ts`), and the e2e suite signs
  in with TOTP, registers and uses a virtual hardware key, refuses a user without MFA, locks an account, and expires an
  idle session by moving its `last_seen_at` back 31 minutes.
- Deployment needs `AUTH_COOKIE_SECRET` (Secrets Manager), `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, and network
  reach to Cognito (its API and JWKS): the VPC has no route out yet (ADR 0012), so milestone 11's egress decision must add
  it. Cognito's acceptance of passkey sign-in with MFA required is still unproven until the first staging deploy (ADR 0012).
- Invitations from the console call `ensureUser`: Cognito emails the temporary password (SES for Cognito arrives in
  milestone 11); locally it lands in the provider's outbox directory.

## Revisit when

The first staging deploy (Cognito passkeys with MFA required), milestone 11 (customer sign-up, CSRF, rate limits), or a
customer asks for a self-service unlock.
