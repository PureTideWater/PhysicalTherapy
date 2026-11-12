# Review: authorization and privilege, End membership (co-001/operator-removes-keys)

Scope: HEAD 311c2743 against base 58fb29e5. Read only; no repository file changed. Runs: console-routes.db.test.ts -t 'SGN-19' (4 passed), sign-in.db.test.ts -t 'SGN-19' (2 passed). Latest definitions were read from packages/db/functions/*.sql (generated) and the policies from packages/db/migrations (no later ALTER/DROP POLICY on membership or "user" except membership_administrators_insert at 20261015180000_tenancy_hardening.sql:139).

## Findings

### F1. NON-BLOCKING, NEW: if the commit's outcome is unknown, the provider is never asked and no security-event line is written
- Evidence: apps/web/src/lib/http/invoke.ts:339-347 and 368-376. When the commit ends without an answer (CommitOutcomeUnknownError), `transacted` returns through `refuse` and `runCommitted` is not reached. The membership and the app's sessions may be ended, but globalSignOut never runs. The only log line is COMMIT_OUTCOME_UNKNOWN, not 'security event: membership end provider sign-out failed', so the MembershipEndProviderSignOutFailed alarm (infra/lib/security-events.ts) does not page. At base, globalSignOut ran before COMMIT, so this gap did not exist.
- Impact: the person keeps their provider tokens (they can still sign in to a session with no role, see "After the end"). No privilege survives, because the app's sessions and RLS do not depend on the provider. The operator is still not told.
- Smallest fix: in the unknown-outcome branch, give pending after-commit work an "outcome unknown" hook. Or have signOutAtProviderAfterCommit also register a line that the unknown branch writes: the same security-event words plus error_code COMMIT_OUTCOME_UNKNOWN and user_id/request_id. Add a test in console-routes.db.test.ts.

### F2. NON-BLOCKING, PRE-EXISTING: the console can end a platform administrator's own membership or the last one
- Evidence: apps/web/src/lib/routes/console.ts:780-783. The UPDATE has no `user_id <> app_actor_id()` and no organization-kind limit. membership_administrators_update (migrations/20261015140000_tenancy.sql:525-527) lets a platform admin update any row. membership_keeps_practice_administrator (functions/membership_keeps_practice_administrator.sql:15) and organization_administrator_count (role = 'practice_admin' only) guard nothing for 'platform_admin' or 'firm_principal'.
- Only a holder of organization.manage can do this, which is already the highest role, so an outside attacker cannot use it to lock anyone out. It was the same at base.
- Smallest fix: add `AND user_id <> app_actor_id()` to the console UPDATE, plus an assert that the internal organization keeps at least one current platform_admin (a trigger like membership_keeps_practice_administrator).

### F3. NON-BLOCKING, PRE-EXISTING, design note: ending a membership in A ends the person's sessions everywhere and (now reliably) signs them out at the provider account-wide
- revoke_user_sessions (functions/revoke_user_sessions.sql:29) ends every user_session of the user, whatever the organization. That was so at base. The check at lines 17-24 lets an administrator of any organization the user is a current member of do this, and it counts a membership ended in this transaction (`ends_at >= now()`).
- At base, the post-update read of cognito_sub ran under user_self_and_administrators (tenancy.sql:501-502 -> app_actor_administered_user_ids, which needs `ends_at > now()`, functions/app_actor_administered_user_ids.sql:17). So for a user the actor administers nowhere else it returned no row, and globalSignOut was skipped in silence. Now the subject is read first, so globalSignOut always runs.
- Does this widen anything? Only in effect, not in authority. The same actor, under the same checks, could already end the shared user's work in B at base, because every app session ended. The provider sign-out adds only that the person must authenticate at the provider again. No new actor gains any power, and nothing in B is read or changed. Shared users are also rare: an organization admin cannot add a user known elsewhere (membership_administrators_insert, tenancy_hardening.sql:140-145, user_known_elsewhere); only a platform admin can.
- Smallest fix, if wanted: none required for this change. If B's work should survive, that is a product decision about revoke_user_sessions.

No BLOCKING finding.

## Checked and sound

1. Pre-read versus UPDATE (settings.ts:1092-1104). The SELECT's WHERE is the UPDATE's WHERE term for term: id, organization_id = URL org, user_id <> app_actor_id(), not ended. `id` is the membership primary key, so both address the same row.
   - user_id cannot change between the two statements: tp_app holds UPDATE only on (role, ends_at) (tenancy.sql:603), and membership_rules freezes ended rows.
   - Under RLS, the SELECT can only see more than the UPDATE through the self clause (membership_self_and_administrators, tenancy.sql:517-522), and `user_id <> app_actor_id()` removes that clause.
   - The wrapper (invoke.ts:676-682) refuses an organization where the actor has no role, then requires user.invite there. Only practice_admin and firm_principal hold user.invite (packages/db/src/authz/permissions.ts:174, 197). Those are exactly the roles in app_actor_administered_organization_ids (functions/...:19), the term the UPDATE policy uses (tenancy.sql:525-527).
   - The sub is passed on only after `ended === undefined -> NotFoundError` (settings.ts:1112-1117). The afterCommit work runs only on a confirmed commit (invoke.ts:376-379). A refused, not-found, or rolled-back request (including the DEFERRED last-administrator trigger, tenancy.sql:447-448, failing at COMMIT) schedules nothing.
   - A concurrent end between the two statements makes the UPDATE re-check and return no row, so the result is NotFound.
2. Cross-tenant through the URL: organization B's membership ID under organization A's URL fails `organization_id = $2` in both statements. Organization B's URL fails the wrapper's role check and the UPDATE policy.
3. The log line's user_id comes from the UPDATE's RETURNING on a row the actor was entitled to update. It is an internal ID, which is allowed: CLAUDE.md says log IDs. The subject, address and error text are not logged (provider-sign-out.ts:26-33).
4. The afterCommit closure uses no database access: only deps.provider.globalSignOut and deps.logger (provider-sign-out.ts:25-34). The services passed in are SignedInServices without the application pool (invoke.ts:332-333). Its own try/catch means AFTER_COMMIT_FAILED cannot hide a provider failure.
5. Console read after the update (console.ts:791) runs under user_self_and_administrators. Its `app_actor_is_platform_admin()` term does not depend on the target's membership, and the route requires organization.manage (platform_admin). cognito_sub is NOT NULL UNIQUE (tenancy.sql:31), so a real user always yields a subject; null cannot slip past the `undefined` test. If the read ever returned nothing, NO_PROVIDER_SUBJECT is logged at error with the alarm's words, so it fails loudly rather than in silence. That is acceptable.
6. Ordinary roles and signed-out callers: settings needs user.invite, which analyst, viewer, billing_manager and reviewer lack. Console needs the platform permission organization.manage (invoke.ts:564, requirePlatformPermission). A signed-out caller is stopped by signedIn (invoke.ts:668-671) before any transaction. A cross-site POST is stopped before parsing (invoke.ts:657).
7. Lock-out by organization admins: they cannot end their own membership (user_id <> app_actor_id()), so the actor always remains an administrator. The last practice_admin is guarded by the deferred trigger. An organization admin cannot touch internal (platform) memberships, because the UPDATE policy does not cover the internal organization for them.
8. revoke_user_sessions: SECURITY DEFINER, search_path pg_catalog first and pg_temp last, REVOKE ALL FROM PUBLIC, EXECUTE to tp_app only (functions/revoke_user_sessions.sql:11-12, 34-36). This change does not alter it.

## After the end

What a person whose membership was ended can still do and see. The account is not disabled and sign_in_account reads no membership, so the person can still sign in. Every session they held was ended in the same transaction.

- In the organization the membership was in: nothing of the organization's.
  - app_actor_memberships filters `ends_at IS NULL OR ends_at > now()` (functions/app_actor_memberships.sql), and every scope helper derives from it: app_actor_organization_ids, app_actor_administered_organization_ids, app_actor_admin_practice_ids, app_actor_is_platform_admin, app_actor_platform_permitted. So does effective_practice_access (ownership and grant branches; the support branch needs a current internal membership).
  - The organization row is hidden (organization_members, tenancy.sql:490-491). No practice enters app.practice_ids, so every practice_tenant-style policy hides all PHI tables.
  - The "user" rows of colleagues are hidden (app_actor_administered_user_ids is empty). Membership and invitation rows of others are hidden.
  - organizationRoute answers not_found because organizationRoles is empty (invoke.ts:678-680). practiceRoute finds no practice in scope.
- Policies that ignore ends_at, and what they expose:
  - membership_self_and_administrators `user_id = app_actor_id()` (tenancy.sql:519): the person can read their own membership rows, ended ones included (organization_id, role, ends_at). This is only their own record. The organization's name stays hidden.
  - invitation_administrators_and_invitee `user_id = app_actor_id()` (20261030090000_customer_sign_in_and_readiness.sql:227): their own invitation rows. Accepting is a separate path not reviewed here; resend_invitation requires a current membership (functions/resend_invitation.sql:28).
  - user_session_self (identity_and_permissions.sql:471) and the user's own "user" row: their own data.
  - No write path: membership INSERT and UPDATE need an administered organization or platform admin, and membership_rules refuses self-grants and any change to an ended row.
- In another organization where the person keeps a live membership: exactly that organization's role, as before. The end changes nothing there except that those sessions were ended too (F3), so they sign in again.
- Pages reachable with no role: only signed-in, actor-scoped pages (own account and sessions) not reviewed here route by route. Every one runs under the RLS above, which returns nothing of the former organization.
- Note: user_known_elsewhere (functions/user_known_elsewhere.sql) ignores ends_at. After the end, the person counts as "known elsewhere" to every other organization's admin, so only a platform admin can add them again. This is restrictive, not a leak.
