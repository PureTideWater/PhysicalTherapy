# 0019. Close the standing-access paths the milestone 1 review found, and run platform jobs as an operator role that owns nothing

- **Status:** accepted (amends 0012, 0013, 0014, 0016 and 0017 where they say otherwise); amended by [0049](0049-run-the-compute-on-fargate-behind-an-https-only-load-balancer-and-waf-migrate-before-traffic-moves-and-egress-through-nat-for-what-has-no-endpoint.md) (the deploy job's logins, pg-boss's login)
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 3 (Personas: the platform administrator "must not read PHI without a support grant", support must
  not "retain access after the ticket closes"; Authorization in code: "internal roles have no standing access to PHI",
  "service accounts ... one practice per job"; The model: a grant's agreement, a practice's administrator at all times),
  5 (J1, J15, J16), 6 (Identity and sessions; Agreements; Admin console: "no admin screen can read PHI without a support
  grant"), 16 (Tenant isolation; Grants; Backups and restore; Threats: "an operator reading PHI for curiosity"), 17
  (milestone 1 check); docs/product/sessions.md; Data dictionary, Tenancy and access; test matrix SEC-01, SEC-02, SEC-05,
  SEC-06, SEC-10, SEC-13, JOB-02; migration 20261015180000

## Context

Two reviews of milestone 1 proved, against the running code, paths the plan forbids: a platform administrator could
give itself a practice-administrator membership of any group and read that practice with no support grant; the
application role could suppress both break-glass notices; the platform jobs held an owner login that could disable the
audit log's triggers; and several smaller gaps (sessions revocable without an actor, ended sessions revivable, MFA
self-recordable, grants on another tenant's agreement, agreements and support grants readable by every organization with
the practice in scope, temporary tables standing in for real ones inside SECURITY DEFINER functions, refusals sent as
HTTP 200). Each fix below is a database rule first, so it holds for every code path, and a handler check where a person
gets a reason.

## Decision

**Internal users stay internal** (migration 20261015180000, `membership_rules`, `assert_membership_fits_user`):

- No user holds a current internal membership and a current group or firm membership at once, for any role, the owner
  included (checked under a per-user advisory lock). Nobody inserts a membership for themselves or changes their own
  role through the application role. An ended membership never changes (no revival by `ends_at = NULL`).
- An organization administrator adds only users no other organization knows (no membership elsewhere, current or ended);
  a user another organization knows joins through the platform path (a platform administrator, in the console) until the
  invitations a user accepts arrive in milestone 12. The platform path adds people to group and firm organizations only;
  the internal organization's members come through its own administrators. The internal organization is created once by
  the owner; the application role can create only groups and firms.
- Defence in depth: `effective_practice_access()` ignores the ownership and grant routes of a user with a current internal
  membership, so only their own support grant reaches a practice. The console refuses the same invitations, before the
  identity provider is asked for an account. `STRUCTURAL_RULES.support_grant_required` states all of it and its database
  check tries every path.

**Break-glass notices cannot be suppressed** (PRD 5 J15; SEC-05): the application role has no UPDATE on `support_grant`
at all (and a restrictive `USING (false)` update policy); the opening notice counts only a `notice_sent` event the system
wrote; the application role's audit inserts are refused for `actor_kind` other than `user` and `service`, and for the
actions only the database or the operator writes (`notice_sent`, `security_event`, `sign_in_failed`,
`data_key_destroyed`). No new column was needed, so the data dictionary's `support_grant` is unchanged.

**A support grant can end early**: `end_support_grant()` (a platform administrator or the grant's engineer) sets
`expires_at` to now, once, while it is open; the console has "End now"; the closing notice follows as usual. A support
grant goes only to a current, active support engineer with MFA, and never to the person creating it.

**Security events are written by the database** (sessions.md: "grant changes and role escalations raise security events
reviewed weekly"): triggers record `security_event` with `actor_kind = 'system'` and the transaction's actor for every
grant approved or revoked (`grant_change`, with the practice, so it is in the practice's access log), every support grant
opened (`support_grant_opened`) or ended early (`grant_change`), every current membership created in or moved into an
administrator role or the internal organization (`role_escalation`), and every sign-in from a new device
(`new_device_sign_in`, moved from the web app into a trigger on `user_device`).

**Platform jobs run as `tp_operator`** (a NOLOGIN role like `tp_app`: no ownership, no bypass), created by the role
bootstrap; every platform transaction does `SET LOCAL ROLE tp_operator`, whatever the login. It reads `audit_event`
through its one policy (the nightly copy), writes `restore_drill` evidence, and calls three SECURITY DEFINER functions
for the notices: `operator_due_support_notices()` (IDs only), `operator_record_support_notice()` and
`operator_practice_administrator_emails()`, the last two refusing unless the transaction's scope is exactly the notice's
practice, so each notice is one practice's transaction. It reads no other table. The owner login is for migrations, and
for the restore drill's scratch copy only: the RDS drill sets a one-time master password on the scratch instance and
never reads the owner's secret; locally the drill's dump and restore use `RESTORE_DRILL_ADMIN_URL` (development only).
In AWS the operator login (`tp_operator_login`) has its own rotated secret and its own task role (`OperatorRole`, ADR
0012 amended): the operator secret, the audit-copy bucket (with `ListBucket` and `PutObjectRetention`, which the
write-once store needs), the RDS restore calls on the one scratch instance, KMS grants through RDS, and SES. The
application role no longer touches the audit copies.

**Smaller rules**: `revoke_user_sessions()` needs an identified actor and, for organization administrators, a current
membership (or one this transaction ended); ended sessions and revoked devices stay so for every role; MFA enrollment is
recorded only by `record_sign_in_with_mfa()`, for a session the same transaction opened; a grant rests only on a BAA or
engagement letter of the grantee (practice-specific or its own) or of the practice's group naming the practice;
agreements are read by their parties (the organization, the practice's own group, platform administrators) and support
grants by the practice's own group and platform administrators; agreements are recorded by `agreement.sign` holders for
their own group or by `agreement.record` holders; a practice is owned by a group until it is deleted and has a
non-disabled practice administrator (invited counts) from its creation, checked at commit, so J1 invites the
administrator before (or with) the practice; every SECURITY DEFINER function searches `pg_temp` last and `PUBLIC` has no
TEMPORARY privilege.

**The catalog test** also requires every other permissive policy on a PHI table, for any role but the owner, to keep the
tenant expression; the only exceptions are `REVIEWED_PLATFORM_POLICIES` (the platform administrator's practice insert of
J1, and its support-grant read and insert), each with the dictionary's or the plan's reason; it requires `pg_temp` last
on every SECURITY DEFINER function and that the operator role owns nothing. The generated cross-tenant tests now insert
a probe whose actor columns are the acting user (the identical row is accepted with its own practice in scope and
refused with only another's), and act as a platform administrator, a contract specialist, a support engineer without a
support grant and a firm user without a grant.

**Jobs and configuration**: practice jobs reach the database only through `JobContext.transaction`, which is
`withJobScope` for the payload's practice on the application login; a job that fails its third and last attempt logs
`job failed on its last attempt`, which a metric filter and alarm send to the operator (JOB-02, the restore drill
included). With `NODE_ENV=production` the worker refuses every local implementation (directory store, outbox, pg_dump
drill) and requires S3 with the bucket's lock mode, RDS, SES and an https origin; the web refuses the local identity and
key providers unless `TP_ALLOW_LOCAL_PROVIDERS=e2e`, which only playwright.config.ts sets. The worker's heartbeat
defaults to 60 seconds, the period the alarm counts. Cognito returns a session only for a sign-in that answered an MFA
challenge (TOTP or WebAuthn); tokens for a password alone are revoked and refused.

**HTTP refusals carry their status**: the root `loading.tsx` is gone, so a page's route runs before the response starts
and a refused session is a 307 to sign-in and an unreachable practice a 404 (the e2e suite checks both). PRD 7's loading
state goes inside a page's content, below its route's access check, when a screen first needs one (milestone 3).

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| Narrow only the console's invitation route | The database would still accept the membership from any other path; the plan puts role-specific rules in Postgres too |
| A new `opened_notified_at` column for the opening notice | Works, but changes the data dictionary's table; a system-written event the application cannot forge is the same guarantee |
| Keep the owner login for platform jobs, audited | The owner can disable the audit log's triggers; a role that owns nothing cannot |
| A unique index for the single internal organization | Test fixtures create several; refusing internal organizations from the application role closes the reported path |
| Keep `loading.tsx` and gate in layouts | Two session resolutions per request for a status code; a page-level loading state below the access check gives both |
| Cognito's Plus plan (threat protection) | Not asked for by the plan, and priced per user; the owner may turn it on (ADR 0012) |

## Consequences

- `pnpm test:db` grows: `hardening.db.test.ts`, the structural rules, the catalog cases, the outsider personas of the
  cross-tenant tests, the internal-role route tests for every practice route, the notice-suppression tests.
- The deploy job (milestone 11) creates `tp_operator_login` from its secret as it does `tp_app_login`, and the compute
  runs the platform jobs under `OperatorRole`; pg-boss's own login stays ADR 0004's open question.
- Milestone 12 replaces "the platform path adds users known elsewhere" with invitations the user accepts.

## Revisit when

Milestone 3 (the first screen needing a loading state; uploads), milestone 11 (compute, the operator task, egress),
milestone 12 (firm invitations, deletion), or a reviewer finds another path to a practice without a grant.
