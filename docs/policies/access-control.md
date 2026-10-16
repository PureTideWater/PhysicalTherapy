---
policy: access-control
title: Access control
version: 0.1
status: draft, awaiting the security official's approval
owner: security official
review: yearly, and on any change to roles or grants
---

# Access control policy

## Purpose and scope

How people and systems reach a practice's data, and who decides. It covers every user of the product (customers,
firms, the company's staff), every system role, and every environment. A practice is the covered entity whose data
this is; the product is its business associate.

## Principles

1. **The practice is the tenant.** Every table that can hold PHI carries `practice_id` and has row-level security
   enabled and forced. The application's database role owns nothing and cannot bypass row-level security. Each
   transaction sets the practices and the actor it acts for; each job acts for one practice.
2. **Least privilege, by role.** A user's permissions come from their role in a practice or an organization (the
   persona matrix, `packages/db/src/authz/permissions.ts`, checked in Postgres by `role_permission`). Role checks run
   in every route handler and server action and again in Postgres; middleware alone is never relied on.
3. **No standing internal access to PHI.** The company's staff hold internal roles that read no PHI. A support
   engineer reads one practice's PHI only through a break-glass grant created from a ticket: a recorded reason, the
   ticket's number, a four-hour expiry, and the practice administrator notified at creation and at expiry with the
   list of records read. No other path lets an internal user read PHI. Developers have no production database access
   without a ticket and a time-boxed role.
4. **Grants, not ownership, for anyone outside the practice.** A billing firm or the company's specialists reach a
   practice through a grant with a scope, dates, an approver and an agreement, which the practice's own administrator
   approves and can revoke; a revoked or expired grant denies on the next request.
5. **Separation of duties.** The person who drafted a dispute packet never approves it. The founder's operator role
   for platform jobs reads no PHI.

## Authentication

- Customers sign in with email and password and a second factor (TOTP or a passkey); MFA is required before any
  screen. Internal roles must sign in with a hardware security key.
- Password policy and lockout: the identity provider's policy (at least 12 characters with mixed classes); ten
  failed attempts lock the account; locked accounts are unlocked by an administrator.
- Sessions: an idle limit of 30 minutes and an absolute limit of 12 hours; cookies are `HttpOnly`, `Secure` and
  `SameSite=Lax`; sessions are revocable from the device list. Every mutation carries a session-bound CSRF token and
  passes an Origin check; sign-in, MFA, uploads, exports and mutations are rate limited per user and per address.
- Invitations expire after seven days and are re-sent by an administrator, never by the invitee.

## Joining, moving, leaving

- A customer's practice administrator invites users and sets their roles; a platform administrator invites a new
  customer's first practice administrator after the agreement chain (BAA, engagement letter, terms, data-rights
  addendum) is recorded.
- Role changes and membership ends take effect on the next request; ending a membership revokes its sessions.
- Leaving the company ends every internal role and session the same day.

## Access reviews

Quarterly, the security official (or a delegate who is not the subject of the review) reviews every membership,
every grant (including expired and break-glass grants and the records they read) and every internal role, removes
what is no longer needed, and records the review in the console (Compliance, kind "access review"). Security events
(failed-MFA bursts, sign-ins from new devices, bulk exports, grant changes, role escalations) are reviewed weekly.

## Exceptions

An exception is written, time-boxed, approved by the security official, and recorded in the risk analysis.
