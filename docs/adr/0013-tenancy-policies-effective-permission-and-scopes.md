# 0013. Enforce tenancy in PostgreSQL: forced policies on every tenancy table, effective permission in SQL, and one transaction API

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 3 (the model, personas, authorization in code, lifecycle events), 6 (organizations, practices,
  grants; agreements; audit log), 8 (core records, invariants), 15 (database, request path for a PHI page), 16 (tenant
  isolation, grants, authorization in depth); Data dictionary, Tenancy and access; test matrix SEC-01 to SEC-06;
  ADRs 0001 and 0009

## Context

Milestone 1 builds the records every later table hangs from: organization, practice, user, membership, grant,
agreement, support grant and the PHI table registry. The plan fixes the boundary (every PHI table forces row-level
security with a policy on `current_setting('app.practice_ids', true)::uuid[]`, the application role owns nothing and
cannot bypass) but leaves open how the tenancy tables themselves are protected, how the allowed-practice set is
computed, which role-specific actions the database enforces, and what "a practice always has an administrator"
means for a practice whose administrator has only been invited (PRD 5, J1: the platform administrator creates the
practice, then invites its administrator).

## Decision

**Every tenancy table forces row-level security, the owner included.** A table with a NOT NULL `practice_id` is a PHI
table (registered in `phi_table_registry`, practice_id indexed, the registered policy `<table>_tenant` permissive, for
every command and role, USING and WITH CHECK exactly `practice_id = ANY (current_setting('app.practice_ids',
true)::uuid[])`). `practice` is registered on `id`; `grant` and `support_grant` are PHI tables by that rule.
`organization`, `user`, `membership`, `agreement` (nullable `practice_id`) and `audit_event` (nullable `practice_id`)
force row-level security too, with the policies the data dictionary's Policy column names:

| Table | Application role (`tp_app`) | Owner role (`tp_owner`) |
| --- | --- | --- |
| organization | members read; platform administrators read, create, update | all |
| user | self, platform administrators and administrators of the user's organizations read; administrators invite (status `invited`, no MFA); self and platform administrators update, and only a platform administrator changes status or the hardware-key rule (a user may accept: invited to active) | all |
| membership | the member and the organization's administrators read; administrators insert and update | all |
| practice | tenant policy; platform administrators create (J1); restrictive: only its practice administrators update | read (the resolver) |
| agreement | parties read (the organization's members, the practice in scope, platform administrators); administrators record; immutable | all |
| grant | tenant policy; restrictive: read by its practice's administrators and the grantee's members, insert approved by and update revoked by a practice administrator of the practice | read (the resolver) |
| support_grant | tenant policy (the practice sees its own); platform administrators read and create (restrictive: only they create) | read (the resolver) |

"Organization administrators" are practice administrators of a group, firm principals of a firm and platform
administrators of the internal organization. Policies call SECURITY DEFINER helpers owned by `tp_owner`
(`app_actor_*`), wrapped in `(SELECT ...)` so each runs once per statement; that is what lets a membership policy
consult memberships without recursing, and it is why the owner has the read policies in the right-hand column.
Owner writes to a PHI table still need the practice in scope. Nothing on these tables is deletable or truncatable by
the application role; column privileges limit each update to the columns the actions need (never
`practice.data_key_ref`).

**Effective permission in SQL.** `effective_practice_access()` (SECURITY DEFINER) returns, for `app.actor_id`, one row
per route to a practice: ownership (a current customer-role membership of the practice's owning group, no grant
needed), a grant in force (a current membership of the grantee whose role is in `grant.scope.roles`, `starts_at <=
now() < ends_at`, not revoked), or a support grant (the user's own, unexpired, at most four hours old, with a current
`support` membership of the internal organization). Only active users with MFA enrolled have memberships that count
(PRD 6: no PHI route without MFA). The internal organization can own no practice and receive no grant (triggers
refuse both), so internal roles have no standing access. `now()` is the transaction's start, so revocation and expiry
take effect on the next transaction. `allowed_practice_ids()` is its set; `open_practice_scope(requested)` sets
`app.practice_ids` (SET LOCAL) to the requested practices among them and returns their access rows.

**One transaction API** in `packages/db/src/authz` (100% branch coverage): `withActor(pool, actorId, run)` for identity
resolution (actor set, empty practice scope); `withPracticeScope(pool, { actorId, practiceIds }, run)` for requests
(the scope is computed by `open_practice_scope`, never trusted from the caller, and is the empty set when nothing
requested is reachable); `withJobScope(pool, { jobId, practiceId }, run)` for jobs, which refuses anything but exactly
one practice before taking a connection and builds `ARRAY[$2::uuid]` in SQL, with the job as the service actor
(SEC-06). `readWithAudit` and `recordAuditEvent` write audit events through the same transaction (ADR 0014).
`app.practice_ids` remains a setting the application role could set by hand; the policies protect against a missed
`WHERE`, and the effective-permission function protects against a stale scope, as PRD 3 and ADR 0001 intend.

**Grant shape.** `scope` is `{"roles": [...]}` over the grantee's customer and firm roles (an empty scope admits no
one); `ends_at` is required (grants expire, PRD 8); an approver must be a current practice administrator of the
practice, so a practice without an administrator cannot be granted (J3); after approval a grant changes only by its
revocation, once, by a practice administrator. Roles must fit the organization's kind, and an organization's kind
never changes.

**"A practice always has an administrator"** is enforced at commit (deferred constraint triggers): once a practice's
owning group has an open, non-disabled practice-admin membership, no change to memberships, users or the practice's
owner may leave it with none, so an administrator hands the role over in one transaction. A practice whose
administrator is still invited (none yet active) is allowed, because J1 creates the practice first. Memberships with a
future `ends_at` do not count toward the invariant, since time alone would end them.

**Statuses the dictionary leaves open:** organization `active | suspended | closed`; user `invited | active |
disabled`; practice `active | deleted`, with a data key required unless deleted (ADR 0015).

**Catalog and generated tests.** `catalogProblems()` (`packages/db/src/catalog.ts`) is the catalog test as a function
(also run by the restore drill). The tables with a nullable `practice_id` are a fixed list with the dictionary's
reason (`agreement`, `audit_event`); any other nullable `practice_id` fails. The cross-tenant tests are generated from
the catalog (registry plus every table with `practice_id`) by a row factory that reads columns, foreign keys, check
constraints and enums; each table is probed through a request scope, a job scope and a hand-set scope.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| ENABLE without FORCE on the non-PHI tenancy tables | Simpler helpers, but the owner (loads, migrations, operator jobs) would read and write them unfiltered; forced everywhere keeps one rule with no exceptions |
| Re-derive the allowed set inside every PHI policy | Jobs have no memberships, so a service path would need its own setting the application role could also set; the scope is computed once per transaction instead |
| A BYPASSRLS role for the resolver | The plan forbids bypass for the application, and a non-superuser deploy login cannot create one on RDS |
| Throwing when a request asks for a practice it cannot reach | Callers learn the reachable set from the scope; zero rows is the safe default and the handler decides the response |
| Counting invited administrators as missing | J1 would be impossible: the practice exists before its administrator accepts |

## Consequences

- Every new PHI table needs its migration, its registry row and nothing else to get its cross-tenant tests; a table the
  row factory cannot fill fails with the constraint named.
- Identity lookup by Cognito subject (sub to user ID) needs a SECURITY DEFINER function when sign-in lands; reading
  `user` requires an actor.
- Platform administrators see the agreements and support grants they administer, never a practice's own rows.
- A firm keeps reading the agreements it is a party to after its grant ends; the practice's data disappears from it at
  once.

## Revisit when

Firm flows land (milestone 12: invitations, portfolio, per-practice billing), sign-in lands (sub lookup, session
revocation), or a role-specific action other than grant changes needs a database policy (packet approval, milestone 8).
