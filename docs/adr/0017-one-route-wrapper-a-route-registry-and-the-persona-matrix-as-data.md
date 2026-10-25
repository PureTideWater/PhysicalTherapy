# 0017. Run every route through one wrapper and one registry, and hold the persona matrix as data in code and in the database

- **Status:** accepted; amended by [0019](0019-close-the-standing-access-paths-and-run-platform-jobs-as-an-operator-role.md)
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 3 (personas, authorization in code), 5 (J15), 6 (Organizations, practices, grants; Agreements; Admin
  console v0; cross-cutting requirements), 7 (Internal console; information architecture rules), 15 (Request path for a
  PHI page), 16 (Authorization in depth); CLAUDE.md conventions; test matrix SEC-02 to SEC-05, SEC-08; ADRs 0011, 0013,
  0014 and 0016

## Context

CLAUDE.md requires every mutation to be a server action or route handler with a Zod schema, a role check, a
practice-scoped transaction and an audit event; PRD 3 requires role checks in handlers and again in Postgres for
role-specific actions, never in middleware alone; PRD 6 requires every mutation to be idempotent or guarded by a request
key, and cross-tenant tests "for every table and route". The persona table of PRD 3 lists what each role does and must
not do, but not every combination (whether a billing manager reads dashboards, whether a practice administrator reads
claims). The internal console must show practices and grants while platform administrators read no practice's data.

## Decision

**The persona matrix is data** (`packages/db/src/authz/permissions.ts`): 34 permissions, each with a scope (practice,
organization, platform); each role's "Does" as allows and its "Must not" as denials; a permission is held when one of the
actor's roles allows it and none denies it. Where the table is silent: every customer role reads what a viewer reads;
line-level PHI is read by the roles that work lines and by a support engineer under a support grant, and exported by the
billing manager and firm principal; `firm_analyst` is the Analyst persona; the practice administrator's permissions are
its column exactly (it does not read claims). "Must not" rules that are not one permission (a firm acting on an expired
grant, internal roles without a support grant, support after four hours, approving one's own packet) are
`STRUCTURAL_RULES`, each with a database test. The same matrix is the global, read-only `role_permission` table; a database
test proves the two identical. `app_actor_permitted(practice, action)` (and its organization and platform forms) is the
database's check: the grant-change policies now call it, and packet approval will. `requirePermission`,
`requireRole`, `requirePracticePermission` and `requirePlatformPermission` are the handlers' checks (100% branch coverage).

**One wrapper** (`apps/web/src/lib/http/invoke.ts`) runs every page, server action and route handler: Zod parameters
(a malformed URL ID is "not found") and input; a request key (a UUID the form was rendered with) for every mutation; the
session resolved by the database with MFA and the hardware-key rule checked; one transaction opened by
`withPracticeScope` (practice routes: the requested practice among those the effective-permission function allows right
now) or `withActor` (platform and self routes: no practice in scope); the route's permission checked in the handler's
process; the request key claimed in `mutation_request` inside the same transaction (a replay does nothing and reports
"duplicate"); the handler; the route's audit event. Database refusals come back as outcomes (42501 forbidden, 23514
invalid with the rule's own message). The Next adapters (`next.ts`, `handler.ts`) only translate outcomes into
redirects, 404s, permission states and JSON with `Cache-Control: private, no-store`. There is no middleware.

**One registry** (`apps/web/src/lib/routes`): every route declares its ID, kind, path, access (public, self, a practice
permission, a platform permission), whether it can show PHI, its schemas, its audit event, and a sample telling the tests
how to call it for a synthetic world. A unit test proves every `page.tsx`, `route.ts` and server action runs a registered
route at its own path, that path parameters are opaque IDs, that every mutation names an audit event, and that practice
routes live under `/p/[practiceId]` and platform routes under `/console`. `route-tests/define.ts` (run as twelve files,
`route-tests.0.db.test.ts` to `route-tests.11.db.test.ts`, since ADR 0066) generates, for every authenticated route: no
session, an idle session, a 12-hour-old session, a user without MFA, an internal role without a hardware key, all
thirteen personas against the matrix, a replayed request key, and every persona of another practice aimed at this
practice's records or mixing them into its own request (no record ID of this practice in the answer, and a digest of
every row of this practice unchanged). A route added later gets all of it.

**The internal console reads directory records only**, through SECURITY DEFINER functions that check the platform
permission: `console_practices`, `console_grants` and `console_support_grants` (names, dates, scope, counts of reads,
never which records). Practices are created with their data key (ADR 0015); invitations go through the identity provider
(ADR 0016); agreements are recorded by reference and SHA-256 with version, signer and date.

**Support notices** (J15) are a platform job, `support_grant_notices`, every minute on the operator connection (ADR 0014;
since ADR 0019 as `tp_operator`, through three functions, one practice per notice, and the application role can neither
mark a grant notified nor write a notice event; a support grant can also be ended early from the console):
it emails the practice's administrators when a grant opens and when it ends, links and counts only, each notice once
(an advisory lock and a recheck), recording the opening notice as an audit event and the closing one as
`support_grant.notified_at` too. The link opens the grant's page in the practice workspace, which lists every record read
under it from the practice's access log. A practice with nobody to tell is recorded and logged for the operator.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| Role checks scattered in each handler | Nothing would prove every route checks; the registry makes "every route" testable |
| The matrix only in SQL (or only in TypeScript) | Handlers need it without a round trip, policies need it without trusting the application; two copies with an equality test |
| A permissive policy letting platform administrators read practices | They would read every column of a PHI-registered table; directory functions return names and dates only |
| Idempotency by construction in each mutation | Not enforceable generically; a request-key table is one rule for all |
| Sending the notices from the web request | A failed send would either fail the grant or be lost; the job retries and records each notice once |

## Consequences

- `pnpm test:db` grows with every route (504 generated tests for 30 routes today).
- A matrix change is a TypeScript change plus a migration that rewrites `role_permission`; the equality test fails until
  both are made.
- Pages show the application shell from the same transaction as their data, so the practice switcher reflects revocations on
  the next request too.
- The notices need the operator connection (where `OPERATOR_DATABASE_URL` is set), SES from `MAIL_FROM` and the
  application's `APP_ORIGIN`; until milestone 11's compute grants the operator secret, they run only where it is held.

## Revisit when

Milestone 8 adds packet approval (its policy calls `app_actor_permitted`), milestone 11 adds CSRF tokens and rate limits to
the wrapper, or milestone 12 builds the firm flows (grant approval and revocation screens, the practice-visible access log).
