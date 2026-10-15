# Sessions and sign-in rules

The session rules the milestone 1 prompt refers to ("Add Cognito integration with mandatory MFA and the session rules in docs/product/sessions.md"). Every rule below is taken from the build plan; the section it comes from is named in brackets. Nothing here adds a requirement the plan does not state.

## Identity

- Identity is a Cognito user pool, under the AWS business associate agreement. [PRD 3, Authorization in code; PRD 15, Stack]
- MFA is mandatory for every user: TOTP or a hardware key. Hardware keys are required for internal roles (platform administrator, contract specialist, reimbursement reviewer, support engineer). [PRD 3; PRD 6, Identity and sessions; PRD 16, Authentication]
- A user without MFA cannot reach any PHI route. [PRD 6, Identity and sessions, acceptance]
- Password policy and lockout are enforced; sign-in locks after ten failures. [PRD 16, Authentication; PRD 7, Sign-in and MFA]
- Internal users see the hardware-key requirement on the sign-in screen. [PRD 7, Sign-in and MFA]

## Session cookies

| Rule | Value | Source |
| --- | --- | --- |
| Cookie attributes | `HttpOnly`, `Secure`, `SameSite=Lax` | PRD 6, Identity and sessions |
| Absolute expiry | 12 hours from sign-in | PRD 6, Identity and sessions |
| Idle expiry on PHI screens | 30 minutes without activity | PRD 6, Identity and sessions; Test matrix SEC-15 |
| Session lifetime in general | Short-lived sessions | PRD 15, Stack (Identity) |

A session that passes either limit is expired: the next request is refused and the user signs in again. The idle limit applies to every screen that can show PHI.

## What every request re-checks

- Every request resolves the user's memberships and the grants in force, producing the allowed-practice set; the transaction opens with `SET LOCAL app.practice_ids` to that set and `app.actor_id` to the user. A session never caches the practice set. [PRD 3, Authorization in code]
- A revoked grant denies on the next request; an expired grant yields zero rows. A firm's sessions lose access to a practice within one request of the grant ending. [PRD 3, Lifecycle events; PRD 16, Grants; Test matrix SEC-03, SEC-04]
- When a user leaves an organization, their memberships end and their sessions are revoked. [PRD 3, Lifecycle events]
- Role checks run in the route handler or server action and, for role-specific actions, again in Postgres; never in middleware alone. [PRD 3, Authorization in code]
- Support (break-glass) access is a grant with a ticket number, a reason and a four-hour expiry; the practice administrator is notified at creation and at expiry with the list of records read. [PRD 3; PRD 5, J15; Test matrix SEC-05]

## Devices and sign-in events

- The sign-in screen shows the user's device list and lets the user revoke a device. [PRD 7, Sign-in and MFA]
- Device and sign-in events are recorded in the audit log. [PRD 6, Identity and sessions, acceptance]
- Failed MFA bursts, sign-ins from new devices, bulk exports, grant changes and role escalations raise security events reviewed weekly. [PRD 5, J16; PRD 19, Monitoring and alerts]

## Responses

- Every response that carries PHI sets `Cache-Control: private, no-store`. [PRD 15, Stack (Web); .claude/rules/privacy-and-tenant.md]
- Identifiers never appear in URLs; URLs carry opaque IDs. [PRD 7, Information architecture rules]
- CSRF protection on every mutation and rate limits arrive with production readiness. [Milestone 11 prompt]

## Tests that hold these rules

| Rule | Test |
| --- | --- |
| No PHI route without MFA | Integration test per PHI route (PRD 6) |
| 30-minute idle expiry | SEC-15 |
| Grant expiry and revocation | SEC-03, SEC-04 |
| Support grant after four hours | SEC-05 |
| Sign-in events in the audit log | PRD 6 acceptance |
