import { randomUUID } from 'node:crypto';

import { AGREEMENT_KINDS, MEMBERSHIP_ROLES, type MembershipRole, provisionPracticeKey } from '@tp/db/runtime';
import { z } from 'zod';

import { revokeUserSessions } from '../auth/sessions';
import { platformRoute } from '../http/invoke';
import { InputError, type MutationResult, NotFoundError } from '../http/route';
import { opaqueId, optionalText, requiredText } from './schemas';

/**
 * The internal console v0 (PRD 6, Admin console "v0 (minimal)"; PRD 7, Internal console):
 * organizations and practices with their members, agreements and grants, and Support with
 * break-glass grants from a ticket (PRD 5, J15). Platform routes: the actor's internal roles must
 * hold the permission, and the transaction has no practice in scope, so no console screen reads a
 * practice's data (PRD 6: "No admin screen can read PHI without a support grant"). Practices and
 * grants come from directory functions that return names, dates and counts only. Every action is
 * audited by the wrapper.
 */

/** The roles that fit each organization kind (the database refuses any other). */
export const ROLES_BY_KIND: Readonly<Record<'group' | 'firm' | 'internal', readonly MembershipRole[]>> = {
  group: ['practice_admin', 'billing_manager', 'analyst', 'viewer'],
  firm: ['firm_principal', 'firm_analyst', 'billing_manager', 'analyst', 'viewer'],
  internal: ['platform_admin', 'contract_specialist', 'reviewer', 'support'],
};

export interface OrganizationSummary {
  readonly id: string;
  readonly kind: 'group' | 'firm' | 'internal';
  readonly name: string;
  readonly status: string;
  readonly createdAt: Date;
}

interface OrganizationRow {
  readonly id: string;
  readonly kind: 'group' | 'firm' | 'internal';
  readonly name: string;
  readonly status: string;
  readonly created_at: Date;
}

const organizationOf = (row: OrganizationRow): OrganizationSummary => ({ id: row.id, kind: row.kind, name: row.name, status: row.status, createdAt: row.created_at });

export const organizationsPage = platformRoute({
  id: 'console.organizations',
  kind: 'page',
  path: '/console/organizations',
  phi: false,
  permission: 'organization.manage',
  params: z.object({}),
  handle: async ({ scope }) => {
    const { rows } = await scope.client.query<OrganizationRow>('SELECT id, kind, name, status, created_at FROM organization ORDER BY kind, name, id');
    return { organizations: rows.map(organizationOf) };
  },
  sample: { params: () => ({}) },
});

export const createOrganization = platformRoute({
  id: 'console.create_organization',
  kind: 'action',
  path: '/console/organizations',
  phi: false,
  permission: 'organization.manage',
  params: z.object({}),
  // The company's own internal organization is created once, at setup; the console creates customers.
  input: z.object({ kind: z.enum(['group', 'firm']), name: requiredText(200) }),
  audit: { action: 'organization_created', objectType: 'organization' },
  handle: async ({ scope, input }): Promise<MutationResult> => {
    const id = randomUUID();
    await scope.client.query('INSERT INTO organization (id, kind, name) VALUES ($1, $2, $3)', [id, input.kind, input.name]);
    return { objectId: id, redirect: `/console/organizations/${id}` };
  },
  sample: { params: () => ({}), input: () => ({ kind: 'firm', name: 'SYNTHETIC CONSOLE FIRM' }) },
});

export interface MemberSummary {
  readonly membershipId: string;
  readonly userId: string;
  readonly email: string;
  readonly role: MembershipRole;
  readonly userStatus: string;
  readonly mfaEnrolled: boolean;
  readonly locked: boolean;
  readonly endsAt: Date | null;
  readonly current: boolean;
}

export interface ConsoleGrant {
  readonly id: string;
  readonly granteeId: string;
  readonly granteeName: string;
  readonly practiceId: string;
  readonly practiceName: string;
  readonly roles: readonly string[];
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly revokedAt: Date | null;
  readonly agreementId: string;
}

export const organizationPage = platformRoute({
  id: 'console.organization',
  kind: 'page',
  path: '/console/organizations/[organizationId]',
  phi: false,
  permission: 'organization.manage',
  params: z.object({ organizationId: opaqueId }),
  handle: async ({ scope, params }) => {
    const id = params.organizationId;
    const organization = (await scope.client.query<OrganizationRow>('SELECT id, kind, name, status, created_at FROM organization WHERE id = $1', [id])).rows[0];
    if (organization === undefined) {
      throw new NotFoundError();
    }
    const practices = await scope.client.query<{ practice_id: string; name: string; status: string; created_at: Date }>('SELECT practice_id, name, status, created_at FROM console_practices($1)', [id]);
    const members = await scope.client.query<{
      id: string;
      user_id: string;
      email: string;
      role: MembershipRole;
      status: string;
      mfa_enrolled: boolean;
      locked: boolean;
      ends_at: Date | null;
      current: boolean;
    }>(
      `SELECT m.id, m.user_id, u.email, m.role, u.status, u.mfa_enrolled, u.locked_at IS NOT NULL AS locked, m.ends_at,
              (m.ends_at IS NULL OR m.ends_at > now()) AS current
         FROM membership m JOIN "user" u ON u.id = m.user_id
        WHERE m.organization_id = $1
        ORDER BY (m.ends_at IS NULL OR m.ends_at > now()) DESC, u.email, m.id`,
      [id],
    );
    const agreements = await scope.client.query<{ id: string; kind: string; version: string; signer: string; signed_at: Date; sha256: string; document_ref: string; practice_id: string | null }>(
      `SELECT id, kind, version, signer, signed_at, sha256, document_ref, practice_id FROM agreement
        WHERE organization_id = $1 OR practice_id IN (SELECT practice_id FROM console_practices($1))
        ORDER BY signed_at DESC, id`,
      [id],
    );
    const grants = await scope.client.query<{ grant_id: string; organization_id: string; practice_id: string; scope: { roles?: string[] }; starts_at: Date; ends_at: Date; revoked_at: Date | null; agreement_id: string }>(
      'SELECT grant_id, organization_id, practice_id, scope, starts_at, ends_at, revoked_at, agreement_id FROM console_grants($1)',
      [id],
    );
    const names = await scope.client.query<{ id: string; name: string }>(
      'SELECT id, name FROM organization WHERE id = ANY ($1::uuid[]) UNION ALL SELECT practice_id, name FROM console_practices(NULL) WHERE practice_id = ANY ($2::uuid[])',
      [grants.rows.map((row) => row.organization_id), grants.rows.map((row) => row.practice_id)],
    );
    const nameOf = new Map(names.rows.map((row) => [row.id, row.name]));
    return {
      organization: organizationOf(organization),
      roles: ROLES_BY_KIND[organization.kind],
      practices: practices.rows.map((row) => ({ id: row.practice_id, name: row.name, status: row.status, createdAt: row.created_at })),
      members: members.rows.map(
        (row): MemberSummary => ({
          membershipId: row.id,
          userId: row.user_id,
          email: row.email,
          role: row.role,
          userStatus: row.status,
          mfaEnrolled: row.mfa_enrolled,
          locked: row.locked,
          endsAt: row.ends_at,
          current: row.current,
        }),
      ),
      agreements: agreements.rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        version: row.version,
        signer: row.signer,
        signedAt: row.signed_at,
        sha256: row.sha256,
        documentRef: row.document_ref,
        practiceId: row.practice_id,
      })),
      grants: grants.rows.map(
        (row): ConsoleGrant => ({
          id: row.grant_id,
          granteeId: row.organization_id,
          granteeName: nameOf.get(row.organization_id) ?? '',
          practiceId: row.practice_id,
          practiceName: nameOf.get(row.practice_id) ?? '',
          roles: row.scope.roles ?? [],
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          revokedAt: row.revoked_at,
          agreementId: row.agreement_id,
        }),
      ),
    };
  },
  sample: { params: (refs) => ({ organizationId: refs.organizationId }) },
});

const npi = optionalText(z.string().regex(/^\d{10}$/, 'ten digits'));
const lastFour = optionalText(z.string().regex(/^\d{4}$/, 'four digits'));
const zip = optionalText(z.string().regex(/^\d{5}$/, 'five digits'));

export const createPractice = platformRoute({
  id: 'console.create_practice',
  kind: 'action',
  path: '/console/organizations/[organizationId]',
  phi: false,
  permission: 'organization.manage',
  params: z.object({}),
  input: z.object({ organizationId: opaqueId, name: requiredText(200), npi, taxIdLast4: lastFour, zip }),
  audit: { action: 'practice_created', objectType: 'practice' },
  handle: async ({ scope, input, services }): Promise<MutationResult> => {
    const id = randomUUID();
    // The practice is created with its own data key (PRD 3), wrapped by the key provider.
    const key = await provisionPracticeKey(services.keys, id);
    await scope.client.query('INSERT INTO practice (id, organization_id, name, npi, tax_id_last4, zip, data_key_ref) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
      id,
      input.organizationId,
      input.name,
      input.npi ?? null,
      input.taxIdLast4 ?? null,
      input.zip ?? null,
      key.dataKeyRef,
    ]);
    return { objectId: id, redirect: `/console/organizations/${input.organizationId}` };
  },
  sample: { params: () => ({}), input: (refs) => ({ organizationId: refs.organizationId, name: 'SYNTHETIC CONSOLE PRACTICE' }) },
});

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export const inviteMember = platformRoute({
  id: 'console.invite_member',
  kind: 'action',
  path: '/console/organizations/[organizationId]',
  phi: false,
  permission: 'organization.manage',
  params: z.object({}),
  input: z.object({ organizationId: opaqueId, email: z.string().trim().toLowerCase().pipe(z.email('an email address')), role: z.enum(MEMBERSHIP_ROLES) }),
  audit: { action: 'membership_created', objectType: 'membership' },
  handle: async ({ scope, input, services, actor }): Promise<MutationResult> => {
    const organization = (await scope.client.query<{ kind: 'group' | 'firm' | 'internal' }>('SELECT kind FROM organization WHERE id = $1', [input.organizationId])).rows[0];
    if (organization === undefined) {
      throw new NotFoundError();
    }
    if (!ROLES_BY_KIND[organization.kind].includes(input.role)) {
      throw new InputError([{ field: 'role', message: `a role a ${organization.kind} organization holds` }]);
    }
    const known = (
      await scope.client.query<{ id: string; cognito_sub: string; internal: boolean; customer: boolean }>(
        `SELECT u.id, u.cognito_sub,
                EXISTS (SELECT 1 FROM membership m JOIN organization o ON o.id = m.organization_id
                         WHERE m.user_id = u.id AND o.kind = 'internal' AND (m.ends_at IS NULL OR m.ends_at > now())) AS internal,
                EXISTS (SELECT 1 FROM membership m JOIN organization o ON o.id = m.organization_id
                         WHERE m.user_id = u.id AND o.kind IN ('group', 'firm') AND (m.ends_at IS NULL OR m.ends_at > now())) AS customer
           FROM "user" u WHERE lower(u.email) = $1`,
        [input.email],
      )
    ).rows[0];
    // Internal roles have no standing access to PHI (PRD 3): nobody joins a customer organization by
    // their own hand, and no internal user does at all (the database refuses both as well).
    if (known?.id === actor.userId) {
      throw new InputError([{ field: 'email', message: 'you cannot add yourself to an organization' }]);
    }
    if (known?.internal === true && organization.kind !== 'internal') {
      throw new InputError([{ field: 'email', message: 'an internal user cannot join a practice group or a firm; support access is a support grant' }]);
    }
    if (known?.customer === true && organization.kind === 'internal') {
      throw new InputError([{ field: 'email', message: 'a member of a practice group or a firm cannot hold an internal role' }]);
    }
    // The provider's account: created with a temporary password it delivers (an invitation), or found.
    const { sub } = await services.provider.ensureUser(input.email);
    let userId = known?.id;
    if (known !== undefined && known.cognito_sub !== sub) {
      throw new InputError([{ field: 'email', message: 'this email belongs to another identity; ask an engineer to reconcile it' }]);
    }
    if (userId === undefined) {
      userId = randomUUID();
      await scope.client.query(
        `INSERT INTO "user" (id, cognito_sub, email, status, mfa_enrolled, hardware_key_required) VALUES ($1, $2, $3, 'invited', false, $4)`,
        [userId, sub, input.email, organization.kind === 'internal'],
      );
    }
    const membershipId = randomUUID();
    try {
      await scope.client.query('INSERT INTO membership (id, organization_id, user_id, role) VALUES ($1, $2, $3, $4)', [membershipId, input.organizationId, userId, input.role]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new InputError([{ field: 'email', message: 'already a member of this organization' }]);
      }
      throw error;
    }
    return { objectId: membershipId, redirect: `/console/organizations/${input.organizationId}` };
  },
  sample: { params: () => ({}), input: (refs) => ({ organizationId: refs.organizationId, email: `invited-${refs.practiceId}@synthetic.test`, role: 'viewer' }) },
});

export const endMembership = platformRoute({
  id: 'console.end_membership',
  kind: 'action',
  path: '/console/organizations/[organizationId]',
  phi: false,
  permission: 'organization.manage',
  params: z.object({}),
  input: z.object({ membershipId: opaqueId }),
  audit: { action: 'membership_ended', objectType: 'membership' },
  handle: async ({ scope, input, services }): Promise<MutationResult> => {
    const ended = (
      await scope.client.query<{ user_id: string; organization_id: string }>(
        'UPDATE membership SET ends_at = now() WHERE id = $1 AND (ends_at IS NULL OR ends_at > now()) RETURNING user_id, organization_id',
        [input.membershipId],
      )
    ).rows[0];
    if (ended === undefined) {
      throw new NotFoundError();
    }
    // PRD 3, Lifecycle events: a user who leaves an organization has their sessions revoked.
    await revokeUserSessions(scope, ended.user_id);
    const sub = (await scope.client.query<{ cognito_sub: string }>('SELECT cognito_sub FROM "user" WHERE id = $1', [ended.user_id])).rows[0]?.cognito_sub;
    if (sub !== undefined) {
      await services.provider.globalSignOut(sub);
    }
    return { objectId: input.membershipId, redirect: `/console/organizations/${ended.organization_id}` };
  },
  sample: { params: () => ({}), input: (refs) => ({ membershipId: refs.membershipId }) },
});

export const unlockUser = platformRoute({
  id: 'console.unlock_user',
  kind: 'action',
  path: '/console/organizations/[organizationId]',
  phi: false,
  permission: 'organization.manage',
  params: z.object({}),
  input: z.object({ organizationId: opaqueId, userId: opaqueId }),
  audit: { action: 'account_unlocked', objectType: 'user' },
  handle: async ({ scope, input }): Promise<MutationResult> => {
    const unlocked = (await scope.client.query<{ ok: boolean }>('SELECT unlock_user($1) AS ok', [input.userId])).rows[0]?.ok === true;
    if (!unlocked) {
      throw new NotFoundError();
    }
    return { objectId: input.userId, redirect: `/console/organizations/${input.organizationId}` };
  },
  sample: { params: () => ({}), input: (refs) => ({ organizationId: refs.organizationId, userId: refs.lockedUserId }) },
});

export const recordAgreement = platformRoute({
  id: 'console.record_agreement',
  kind: 'action',
  path: '/console/organizations/[organizationId]',
  phi: false,
  permission: 'agreement.record',
  params: z.object({}),
  input: z.object({
    organizationId: opaqueId,
    practiceId: optionalText(opaqueId),
    kind: z.enum(AGREEMENT_KINDS),
    version: requiredText(40),
    signer: requiredText(200),
    signedOn: z.iso.date('a date (YYYY-MM-DD)'),
    documentRef: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9:/._-]{1,200}$/, 'the e-signature reference (letters, digits and : / . _ -)'),
    sha256: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[0-9a-f]{64}$/, 'the document’s SHA-256, 64 hexadecimal characters'),
  }),
  audit: { action: 'agreement_recorded', objectType: 'agreement' },
  handle: async ({ scope, input }): Promise<MutationResult> => {
    const id = randomUUID();
    await scope.client.query(
      `INSERT INTO agreement (id, organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
       VALUES ($1, $2, $3, $4, $5, $6::date::timestamptz, $7, $8, $9)`,
      [id, input.organizationId, input.practiceId ?? null, input.kind, input.version, input.signedOn, input.signer, input.documentRef, input.sha256],
    );
    return { objectId: id, redirect: `/console/organizations/${input.organizationId}` };
  },
  sample: {
    params: () => ({}),
    input: (refs) => ({
      organizationId: refs.organizationId,
      practiceId: refs.practiceId,
      kind: 'data_rights',
      version: '1',
      signer: 'SYNTHETIC SIGNER',
      signedOn: '2026-10-01',
      documentRef: 'esign:synthetic-envelope',
      sha256: 'a'.repeat(64),
    }),
  },
});

export interface ConsoleSupportGrant {
  readonly id: string;
  readonly practiceId: string;
  readonly practiceName: string;
  readonly engineerEmail: string;
  readonly ticket: string;
  readonly reason: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly notifiedAt: Date | null;
  readonly reads: number;
  readonly open: boolean;
}

export const supportPage = platformRoute({
  id: 'console.support',
  kind: 'page',
  path: '/console/support',
  phi: false,
  permission: 'support_grant.create',
  params: z.object({}),
  handle: async ({ scope }) => {
    const grants = await scope.client.query<{
      support_grant_id: string;
      practice_id: string;
      user_id: string;
      ticket: string;
      reason: string;
      created_at: Date;
      expires_at: Date;
      notified_at: Date | null;
      reads: string;
      open: boolean;
    }>("SELECT *, (now() < expires_at AND now() < created_at + interval '4 hours') AS open FROM console_support_grants() LIMIT 100");
    const practices = await scope.client.query<{ practice_id: string; name: string; status: string }>('SELECT practice_id, name, status FROM console_practices(NULL)');
    const engineers = await scope.client.query<{ id: string; email: string }>(
      `SELECT DISTINCT u.id, u.email FROM membership m JOIN "user" u ON u.id = m.user_id JOIN organization o ON o.id = m.organization_id
        WHERE o.kind = 'internal' AND m.role = 'support' AND (m.ends_at IS NULL OR m.ends_at > now()) AND u.status = 'active'
        ORDER BY u.email`,
    );
    const emails = await scope.client.query<{ id: string; email: string }>('SELECT id, email FROM "user" WHERE id = ANY ($1::uuid[])', [grants.rows.map((row) => row.user_id)]);
    const practiceName = new Map(practices.rows.map((row) => [row.practice_id, row.name]));
    const emailOf = new Map(emails.rows.map((row) => [row.id, row.email]));
    return {
      grants: grants.rows.map(
        (row): ConsoleSupportGrant => ({
          id: row.support_grant_id,
          practiceId: row.practice_id,
          practiceName: practiceName.get(row.practice_id) ?? '',
          engineerEmail: emailOf.get(row.user_id) ?? '',
          ticket: row.ticket,
          reason: row.reason,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
          notifiedAt: row.notified_at,
          reads: Number.parseInt(row.reads, 10),
          open: row.open,
        }),
      ),
      practices: practices.rows.filter((row) => row.status === 'active').map((row) => ({ id: row.practice_id, name: row.name })),
      engineers: engineers.rows,
    };
  },
  sample: { params: () => ({}) },
});

/** Support grants last four hours (PRD 3; the database refuses longer). */
export const SUPPORT_GRANT_HOURS = 4;

export const createSupportGrant = platformRoute({
  id: 'console.create_support_grant',
  kind: 'action',
  path: '/console/support',
  phi: false,
  permission: 'support_grant.create',
  params: z.object({}),
  input: z.object({
    practiceId: opaqueId,
    userId: opaqueId,
    ticket: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{1,64}$/, 'the ticket number (letters, digits and hyphens)'),
    reason: requiredText(500),
  }),
  audit: { action: 'support_grant_created', objectType: 'support_grant' },
  handle: async ({ scope, input }): Promise<MutationResult> => {
    const engineer = await scope.client.query(
      `SELECT 1 FROM membership m JOIN organization o ON o.id = m.organization_id JOIN "user" u ON u.id = m.user_id
        WHERE m.user_id = $1 AND m.role = 'support' AND o.kind = 'internal' AND (m.ends_at IS NULL OR m.ends_at > now()) AND u.status = 'active'`,
      [input.userId],
    );
    if (engineer.rowCount === 0) {
      throw new InputError([{ field: 'userId', message: 'a support engineer with a current support role' }]);
    }
    const practice = await scope.client.query("SELECT 1 FROM console_practices(NULL) WHERE practice_id = $1 AND status = 'active'", [input.practiceId]);
    if (practice.rowCount === 0) {
      throw new InputError([{ field: 'practiceId', message: 'an active practice' }]);
    }
    const id = randomUUID();
    await scope.client.query(
      `INSERT INTO support_grant (id, practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, $3, $4, $5, now() + make_interval(hours => $6))`,
      [id, input.practiceId, input.userId, input.ticket, input.reason, SUPPORT_GRANT_HOURS],
    );
    return { objectId: id, redirect: '/console/support' };
  },
  sample: { params: () => ({}), input: (refs) => ({ practiceId: refs.practiceId, userId: refs.supportEngineerId, ticket: 'SYN-100', reason: 'SYNTHETIC SUPPORT REASON' }) },
});

export const endSupportGrant = platformRoute({
  id: 'console.end_support_grant',
  kind: 'action',
  path: '/console/support',
  phi: false,
  permission: 'support_grant.create',
  params: z.object({}),
  input: z.object({ supportGrantId: opaqueId }),
  audit: { action: 'support_grant_ended', objectType: 'support_grant' },
  // PRD 3: support must not retain access after the ticket closes. The grant ends now (end_support_grant()
  // checks the actor again and records the security event); the closing notice follows as usual.
  handle: async ({ scope, input }): Promise<MutationResult> => {
    const ended = (await scope.client.query<{ ended: boolean }>('SELECT end_support_grant($1) AS ended', [input.supportGrantId])).rows[0]?.ended === true;
    if (!ended) {
      throw new NotFoundError();
    }
    return { objectId: input.supportGrantId, redirect: '/console/support' };
  },
  sample: { params: () => ({}), input: (refs) => ({ supportGrantId: refs.supportGrantId }) },
});

export const CONSOLE_ROUTES = [
  organizationsPage,
  createOrganization,
  organizationPage,
  createPractice,
  inviteMember,
  endMembership,
  unlockUser,
  recordAgreement,
  supportPage,
  createSupportGrant,
  endSupportGrant,
] as const;
