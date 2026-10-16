import { randomUUID } from 'node:crypto';

import { type ProofLevel, PROOF_LEVELS, ledgerSettings } from '@tp/ledger';
import { type Cents, centsToString, parseAmount } from '@tp/money';
import { triageSettings } from '@tp/triage';
import { LedgerSettingsRefused, setLedgerSettings } from '@tp/worker/ledger';
import { organizationBilling } from '@tp/worker/billing';
import { type MembershipRole, rolesPermit } from '@tp/db/runtime';
import { z } from 'zod';

import { underPacketRules } from '../cases/refusals';
import { revokeUserSessions } from '../auth/sessions';
import { organizationRoute, practiceRoute } from '../http/invoke';
import { InputError, type MutationResult, NotFoundError } from '../http/route';
import { ROLES_BY_KIND } from './console';
import { blankOptional, emailAddress, opaqueId, optionalText } from './schemas';

/**
 * The practice's Settings screen (PRD 7, Settings: "Users and roles, grants and agreements, notification
 * preferences, materiality defaults, access log, export and deletion requests, billing"; "Invite, change roles,
 * approve or revoke grants, request export or deletion"; "Administrator-only actions marked; the access log is
 * read-only"; PRD 5, J2; milestone 11; docs/adr/0053). Each section is its own route, so each is checked, scoped
 * and tested on its own:
 *
 * - /p/<practice>/settings: the sections the role reaches and, for the practice administrator, the onboarding
 *   checklist of J2 (MFA, terms, the agreement chain confirmed, the team invited, a plan chosen).
 * - Agreements and grants: the chain (BAA, engagement letter, terms, data-rights addendum) with each document's
 *   reference and SHA-256, its confirmation by the administrator (an audit event), and the grants to the
 *   practice (a view; approving and revoking firm grants are milestone 12's firm flows).
 * - Materiality and pursuit defaults: set by the people who work cases (the database checks it again).
 * - The proof level: posted or deposited, the administrator's alone, with the rule for lines already recovered
 *   stated before it is saved and applied by the next reconcile (docs/adr/0053).
 * - The access log: read-only, filtered to one record ("who read claim X") from the record's own page.
 * - Export and deletion: stated placeholders until milestone 12 builds the workflows.
 * - Users and roles (/settings/organizations/<organization>/users): the organization's members and invitations,
 *   managed by its administrator (user.invite), invitations sent through the identity provider.
 * - Notification preferences are the person's own (/account/notifications) and billing the organization's
 *   (/settings/billing/<organization>); the screen links to both.
 */

const practiceParams = z.object({ practiceId: opaqueId });

/** The agreement kinds of the chain J1 and J2 name, in the order the screen lists them. */
export const AGREEMENT_CHAIN = ['baa', 'engagement', 'terms', 'data_rights'] as const;
export type ChainKind = (typeof AGREEMENT_CHAIN)[number];

export const CHAIN_LABELS: Readonly<Record<ChainKind, string>> = {
  baa: 'Business associate agreement',
  engagement: 'Engagement letter',
  terms: 'Terms of service',
  data_rights: 'Data-rights addendum',
};

export interface ChainAgreement {
  readonly id: string;
  readonly kind: string;
  readonly version: string;
  readonly signer: string;
  readonly signedAt: Date;
  readonly sha256: string;
  readonly documentRef: string;
  /** Whether it names this practice, or the organization as a whole. */
  readonly scope: 'practice' | 'organization';
}

async function practiceOrganization(client: { query: <R extends Record<string, unknown>>(text: string, values?: unknown[]) => Promise<{ rows: R[] }> }, practiceId: string) {
  const row = (await client.query<{ organization_id: string; name: string }>('SELECT organization_id, name FROM practice WHERE id = $1', [practiceId])).rows[0];
  if (row === undefined) {
    throw new NotFoundError();
  }
  return { organizationId: row.organization_id, name: row.name };
}

async function chainAgreements(client: Parameters<typeof practiceOrganization>[0], practiceId: string, organizationId: string): Promise<ChainAgreement[]> {
  const { rows } = await client.query<{ id: string; kind: string; version: string; signer: string; signed_at: Date; sha256: string; document_ref: string; practice_id: string | null }>(
    `SELECT id, kind, version, signer, signed_at, sha256, document_ref, practice_id FROM agreement
      WHERE organization_id = $2 AND (practice_id = $1 OR practice_id IS NULL)
      ORDER BY signed_at DESC, id`,
    [practiceId, organizationId],
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    version: row.version,
    signer: row.signer,
    signedAt: row.signed_at,
    sha256: row.sha256,
    documentRef: row.document_ref,
    scope: row.practice_id === null ? 'organization' : 'practice',
  }));
}

/** The chain's kinds with none on file. */
function missingKinds(agreements: readonly ChainAgreement[]): ChainKind[] {
  return AGREEMENT_CHAIN.filter((kind) => !agreements.some((agreement) => agreement.kind === kind));
}

/** The administrator's latest confirmation of the chain (an audit event the administrators read). */
async function lastConfirmation(client: Parameters<typeof practiceOrganization>[0], practiceId: string): Promise<{ readonly at: Date; readonly by: string } | null> {
  const row = (
    await client.query<{ at: Date; email: string | null }>(
      `SELECT e.at, u.email FROM audit_event e LEFT JOIN "user" u ON u.id = e.actor_id
        WHERE e.practice_id = $1 AND e.action = 'agreement_chain_confirmed' ORDER BY e.at DESC, e.id DESC LIMIT 1`,
      [practiceId],
    )
  ).rows[0];
  return row === undefined ? null : { at: row.at, by: row.email ?? 'an administrator' };
}

export interface SetupStep {
  readonly key: 'mfa' | 'terms' | 'agreements' | 'team' | 'billing' | 'upload';
  readonly done: boolean;
  readonly href: string;
}

export const settingsPage = practiceRoute({
  id: 'practice.settings',
  kind: 'page',
  path: '/p/[practiceId]/settings',
  phi: true,
  permission: 'practice.open',
  params: practiceParams,
  handle: async ({ scope, practiceId, access }) => {
    const { organizationId, name } = await practiceOrganization(scope.client, practiceId);
    const administers = rolesPermit(access.roles, 'agreement.sign') && access.via === 'ownership';
    let checklist: SetupStep[] | null = null;
    if (administers) {
      const agreements = await chainAgreements(scope.client, practiceId, organizationId);
      const team = await scope.client.query<{ count: string }>("SELECT count(*) AS count FROM membership WHERE organization_id = $1 AND user_id <> app_actor_id() AND (ends_at IS NULL OR ends_at > now())", [
        organizationId,
      ]);
      const uploads = await scope.client.query<{ count: string }>('SELECT count(*) AS count FROM source_document WHERE practice_id = $1', [practiceId]);
      const billing = rolesPermit(access.roles, 'organization.billing') ? await organizationBilling(scope.client, organizationId) : null;
      checklist = [
        { key: 'mfa', done: true, href: '/account/devices' },
        { key: 'terms', done: true, href: '/terms' },
        { key: 'agreements', done: missingKinds(agreements).length === 0 && (await lastConfirmation(scope.client, practiceId)) !== null, href: `/p/${practiceId}/settings/agreements` },
        { key: 'team', done: Number.parseInt(team.rows[0]?.count ?? '0', 10) > 0, href: `/settings/organizations/${organizationId}/users` },
        { key: 'billing', done: billing?.subscription?.status === 'active', href: `/settings/billing/${organizationId}` },
        { key: 'upload', done: Number.parseInt(uploads.rows[0]?.count ?? '0', 10) > 0, href: `/p/${practiceId}/uploads` },
      ];
    }
    return {
      practice: { id: practiceId, name, organizationId },
      roles: access.roles,
      via: access.via,
      checklist,
      can: {
        manageUsers: administers && rolesPermit(access.roles, 'user.invite'),
        readAccessLog: rolesPermit(access.roles, 'access_log.read'),
        setProofLevel: rolesPermit(access.roles, 'proof_level.set'),
        setDefaults: rolesPermit(access.roles, 'case.work'),
        billing: administers && rolesPermit(access.roles, 'organization.billing'),
      },
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

export interface GrantView {
  readonly id: string;
  readonly granteeName: string;
  readonly granteeKind: string;
  readonly roles: readonly string[];
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly revokedAt: Date | null;
  readonly inForce: boolean;
}

export const agreementsSettingsPage = practiceRoute({
  id: 'practice.settings.agreements',
  kind: 'page',
  path: '/p/[practiceId]/settings/agreements',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, notice: optionalText(z.literal('confirmed')) }),
  handle: async ({ scope, practiceId, access, params, services }) => {
    const { organizationId } = await practiceOrganization(scope.client, practiceId);
    const agreements = await chainAgreements(scope.client, practiceId, organizationId);
    const administers = rolesPermit(access.roles, 'grant.revoke');
    const grants = administers
      ? (
          await scope.client.query<{ grant_id: string; grantee_name: string; grantee_kind: string; roles: string[]; starts_at: Date; ends_at: Date; revoked_at: Date | null }>(
            'SELECT * FROM practice_grants($1)',
            [practiceId],
          )
        ).rows.map(
          (row): GrantView => ({
            id: row.grant_id,
            granteeName: row.grantee_name,
            granteeKind: row.grantee_kind,
            roles: row.roles,
            startsAt: row.starts_at,
            endsAt: row.ends_at,
            revokedAt: row.revoked_at,
            inForce: row.revoked_at === null && row.starts_at <= services.now() && services.now() < row.ends_at,
          }),
        )
      : null;
    return {
      practiceId,
      agreements,
      missing: missingKinds(agreements),
      confirmation: administers ? await lastConfirmation(scope.client, practiceId) : null,
      canConfirm: rolesPermit(access.roles, 'agreement.sign'),
      grants,
      notice: params.notice ?? null,
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

/** The administrator confirms on screen the agreement chain as it stands (PRD 5, J2), recorded as an audit event. */
export const confirmAgreementsAction = practiceRoute({
  id: 'practice.settings.confirm_agreements',
  kind: 'action',
  path: '/p/[practiceId]/settings/agreements',
  phi: true,
  permission: 'agreement.sign',
  params: practiceParams,
  input: z.object({ confirm: z.literal('on', { message: 'tick the box to confirm the agreements above' }) }),
  audit: { action: 'agreement_chain_confirmed', objectType: 'practice' },
  handle: async ({ scope, practiceId }): Promise<MutationResult> => {
    const { organizationId } = await practiceOrganization(scope.client, practiceId);
    const missing = missingKinds(await chainAgreements(scope.client, practiceId, organizationId));
    if (missing.length > 0) {
      throw new InputError([{ field: 'confirm', message: `the chain is not complete: ${missing.map((kind) => CHAIN_LABELS[kind]).join(', ')} not on file; a platform administrator records it when it is signed` }]);
    }
    return { objectId: practiceId, redirect: `/p/${practiceId}/settings/agreements?notice=confirmed` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: () => ({ confirm: 'on' }) },
});

const dollars = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, 'dollars and cents, such as 5.00')
  .transform((text) => parseAmount(text));
const minutes = z
  .string()
  .trim()
  .regex(/^\d{1,5}$/, 'whole minutes')
  .transform((text) => Number.parseInt(text, 10))
  .pipe(z.number().int().min(0).max(10_000, 'at most 10,000 minutes'));

export const defaultsSettingsPage = practiceRoute({
  id: 'practice.settings.defaults',
  kind: 'page',
  path: '/p/[practiceId]/settings/defaults',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, notice: optionalText(z.enum(['materiality', 'pursuit'])) }),
  handle: async ({ scope, practiceId, access, params }) => {
    const settings = triageSettings((await scope.client.query<{ settings: unknown }>('SELECT settings FROM practice WHERE id = $1', [practiceId])).rows[0]?.settings);
    const text = (cents: Cents) => centsToString(cents);
    return {
      practiceId,
      materiality: { lineCents: text(settings.lineMaterialityCents), caseCents: text(settings.caseMaterialityCents) },
      pursuit:
        settings.pursuit === null
          ? null
          : { staffRateCentsPerHour: text(settings.pursuit.staffRateCentsPerHour), minutesPerPacket: settings.pursuit.minutesPerPacket, minutesPerFollowUp: settings.pursuit.minutesPerFollowUp },
      canEdit: rolesPermit(access.roles, 'case.work'),
      notice: params.notice ?? null,
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

export const settingsMaterialityAction = practiceRoute({
  id: 'practice.settings.materiality',
  kind: 'action',
  path: '/p/[practiceId]/settings/defaults',
  phi: true,
  permission: 'case.work',
  params: practiceParams,
  input: z.object({ lineMateriality: dollars, caseMateriality: dollars }),
  audit: { action: 'materiality_set', objectType: 'practice' },
  handle: async ({ scope, practiceId, input }): Promise<MutationResult> => {
    await underPacketRules(() => scope.client.query('SELECT practice_set_materiality($1, $2, $3)', [practiceId, centsToString(input.lineMateriality), centsToString(input.caseMateriality)]));
    return { objectId: practiceId, redirect: `/p/${practiceId}/settings/defaults?notice=materiality` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: () => ({ lineMateriality: '5.00', caseMateriality: '250.00' }) },
});

/** The pursuit-cost defaults (PRD 12): the staff rate and both times together, or all three blank to clear them. */
export const settingsPursuitAction = practiceRoute({
  id: 'practice.settings.pursuit',
  kind: 'action',
  path: '/p/[practiceId]/settings/defaults',
  phi: true,
  permission: 'case.work',
  params: practiceParams,
  input: z.object({ staffRatePerHour: blankOptional(dollars), minutesPerPacket: blankOptional(minutes), minutesPerFollowUp: blankOptional(minutes) }),
  audit: { action: 'pursuit_defaults_set', objectType: 'practice' },
  handle: async ({ scope, practiceId, input }): Promise<MutationResult> => {
    const values = [input.staffRatePerHour, input.minutesPerPacket, input.minutesPerFollowUp];
    if (values.some((value) => value === undefined) && values.some((value) => value !== undefined)) {
      throw new InputError([{ field: 'staffRatePerHour', message: 'the pursuit cost needs the staff rate and both times together, or none of them' }]);
    }
    await underPacketRules(() =>
      scope.client.query('SELECT practice_set_pursuit($1, $2, $3, $4)', [
        practiceId,
        input.staffRatePerHour === undefined ? null : centsToString(input.staffRatePerHour),
        input.minutesPerPacket ?? null,
        input.minutesPerFollowUp ?? null,
      ]),
    );
    return { objectId: practiceId, redirect: `/p/${practiceId}/settings/defaults?notice=pursuit` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: () => ({ staffRatePerHour: '42.00', minutesPerPacket: '45', minutesPerFollowUp: '10' }) },
});

/** The rule for lines already recovered when the proof level changes (docs/adr/0053), stated before it is saved. */
export const PROOF_LEVEL_RULE =
  'The proof level applies to the whole ledger at once. Raising it to deposited moves every line recovered by its posting but not yet deposited back to payer approved, without reopening its case, until its deposit matches; lowering it to posted moves every posted line to recovered. Statements already printed keep the level they were printed at. The next reconcile, queued when you save, makes the change.';

export const proofLevelPage = practiceRoute({
  id: 'practice.settings.proof_level',
  kind: 'page',
  path: '/p/[practiceId]/settings/proof-level',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, notice: optionalText(z.literal('saved')) }),
  handle: async ({ scope, practiceId, access, params }) => {
    const level = ledgerSettings((await scope.client.query<{ settings: unknown }>('SELECT settings FROM practice WHERE id = $1', [practiceId])).rows[0]?.settings).proofLevel;
    const other: ProofLevel = level === 'posted' ? 'deposited' : 'posted';
    // The lines the change would move: recovered now and short of the other level's proof, or the reverse.
    const { rows } = await scope.client.query<{ moving: string; eft_exports: string }>(
      `WITH latest AS (
         SELECT cl.service_line_id,
                (SELECT s.stage FROM line_status s WHERE s.service_line_id = cl.service_line_id ORDER BY s.seq DESC LIMIT 1) AS stage,
                coalesce((SELECT sum(e.amount_cents) FROM ledger_entry e WHERE e.service_line_id = cl.service_line_id AND e.stage = 'approved'), 0) AS approved,
                coalesce((SELECT sum(e.amount_cents) FROM ledger_entry e
                           WHERE e.service_line_id = cl.service_line_id AND e.stage = $2
                             AND NOT EXISTS (SELECT 1 FROM ledger_entry r WHERE r.stage = 'reversed' AND r.evidence_id = e.id)), 0) AS proved
           FROM case_line cl WHERE cl.practice_id = $1
       )
       SELECT count(*) FILTER (WHERE ($2 = 'deposited' AND stage = 'recovered' AND proved < approved) OR ($2 = 'posted' AND stage = 'payer_approved' AND approved > 0 AND proved >= approved)) AS moving,
              (SELECT count(*) FROM source_document d WHERE d.practice_id = $1 AND d.kind = 'eft_export') AS eft_exports
         FROM latest`,
      [practiceId, other],
    );
    return {
      practiceId,
      level,
      levels: PROOF_LEVELS,
      moving: Number.parseInt(rows[0]?.moving ?? '0', 10),
      eftExports: Number.parseInt(rows[0]?.eft_exports ?? '0', 10),
      rule: PROOF_LEVEL_RULE,
      canSet: rolesPermit(access.roles, 'proof_level.set'),
      notice: params.notice ?? null,
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

export const setProofLevelAction = practiceRoute({
  id: 'practice.settings.set_proof_level',
  kind: 'action',
  path: '/p/[practiceId]/settings/proof-level',
  phi: true,
  permission: 'proof_level.set',
  params: practiceParams,
  input: z.object({ proofLevel: z.enum(PROOF_LEVELS), confirm: z.literal('on', { message: 'confirm that you have read what the change does' }) }),
  audit: { action: 'proof_level_set', objectType: 'practice' },
  handle: async ({ scope, practiceId, input, request, services }): Promise<MutationResult> => {
    try {
      await setLedgerSettings(scope, { practiceId, proofLevel: input.proofLevel, requestId: request.requestId });
    } catch (error) {
      if (error instanceof LedgerSettingsRefused) {
        throw new InputError([{ field: 'proofLevel', message: error.message }]);
      }
      throw error;
    }
    // The ledger's stages follow the level on the next reconcile (the daily one's key: a second one today is queued again once it ran).
    await services.queue.enqueue('reconcile', { practice_id: practiceId, day: services.now().toISOString().slice(0, 10) });
    return { objectId: practiceId, redirect: `/p/${practiceId}/settings/proof-level?notice=saved` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: () => ({ proofLevel: 'deposited', confirm: 'on' }) },
});

export interface AccessLogEntry {
  readonly id: string;
  readonly at: Date;
  readonly actor: string;
  readonly via: string;
  readonly action: string;
  readonly objectType: string;
  readonly objectId: string | null;
  readonly purpose: string | null;
  readonly ticket: string | null;
}

export const ACCESS_LOG_PAGE_SIZE = 50;

/** The practice's access log, read-only (PRD 6, Audit log: "the access report answers 'who read claim X' in one query"). */
export const accessLogPage = practiceRoute({
  id: 'practice.settings.access_log',
  kind: 'page',
  path: '/p/[practiceId]/settings/access-log',
  phi: true,
  permission: 'access_log.read',
  params: z.object({
    practiceId: opaqueId,
    object_type: optionalText(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)).catch(undefined),
    object_id: optionalText(opaqueId).catch(undefined),
    before: optionalText(z.iso.datetime({ offset: true })).catch(undefined),
  }),
  handle: async ({ scope, practiceId, params }) => {
    const { rows } = await scope.client.query<{
      event_id: string;
      at: Date;
      actor_label: string;
      via: string;
      action: string;
      object_type: string;
      object_id: string | null;
      purpose: string | null;
      ticket: string | null;
    }>('SELECT * FROM practice_access_log($1, $2, $3, $4, $5)', [practiceId, params.object_type ?? null, params.object_id ?? null, params.before ?? null, ACCESS_LOG_PAGE_SIZE + 1]);
    const entries = rows.slice(0, ACCESS_LOG_PAGE_SIZE).map(
      (row): AccessLogEntry => ({
        id: row.event_id,
        at: row.at,
        actor: row.actor_label,
        via: row.via,
        action: row.action,
        objectType: row.object_type,
        objectId: row.object_id,
        purpose: row.purpose,
        ticket: row.ticket,
      }),
    );
    return {
      practiceId,
      // The record filtered on is named back only when this practice's log holds it (an ID from elsewhere is not echoed).
      filter: { active: params.object_id !== undefined, objectType: params.object_type ?? null, objectId: entries.length > 0 ? (params.object_id ?? null) : null },
      entries,
      next: rows.length > ACCESS_LOG_PAGE_SIZE ? (entries.at(-1)?.at.toISOString() ?? null) : null,
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, object_type: 'claim', object_id: refs.claimId }) },
});

/** Export and deletion (PRD 5, J14): stated placeholders until milestone 12 builds the workflows with legal holds and key destruction. */
export const dataSettingsPage = practiceRoute({
  id: 'practice.settings.data',
  kind: 'page',
  path: '/p/[practiceId]/settings/data',
  phi: true,
  permission: 'practice.open',
  params: practiceParams,
  handle: ({ practiceId, access }) =>
    Promise.resolve({ practiceId, canRequestExport: rolesPermit(access.roles, 'export.request'), canRequestDeletion: rolesPermit(access.roles, 'deletion.request') }),
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

export interface MemberView {
  readonly membershipId: string;
  readonly userId: string;
  readonly email: string;
  readonly role: MembershipRole;
  readonly status: 'invited' | 'active' | 'disabled';
  readonly mfaEnrolled: boolean;
  readonly self: boolean;
}

export interface InvitationView {
  readonly id: string;
  readonly email: string;
  readonly role: MembershipRole;
  readonly sentAt: Date;
  readonly expiresAt: Date;
  readonly sends: number;
  readonly acceptedAt: Date | null;
  readonly expired: boolean;
}

const organizationParams = z.object({ organizationId: opaqueId, notice: optionalText(z.enum(['invited', 'role_changed', 'ended', 'resent'])).catch(undefined) });

async function organizationKind(client: Parameters<typeof practiceOrganization>[0], organizationId: string): Promise<'group' | 'firm' | 'internal'> {
  const kind = (await client.query<{ kind: 'group' | 'firm' | 'internal' }>('SELECT kind FROM organization WHERE id = $1', [organizationId])).rows[0]?.kind;
  if (kind === undefined) {
    throw new NotFoundError();
  }
  return kind;
}

export const usersSettingsPage = organizationRoute({
  id: 'settings.users',
  kind: 'page',
  path: '/settings/organizations/[organizationId]/users',
  phi: false,
  permission: 'user.invite',
  params: organizationParams,
  handle: async ({ scope, organizationId, params }) => {
    const kind = await organizationKind(scope.client, organizationId);
    const name = (await scope.client.query<{ name: string }>('SELECT name FROM organization WHERE id = $1', [organizationId])).rows[0]?.name ?? '';
    const members = await scope.client.query<{ id: string; user_id: string; email: string; role: MembershipRole; status: MemberView['status']; mfa_enrolled: boolean; self: boolean }>(
      `SELECT m.id, m.user_id, u.email, m.role, u.status, u.mfa_enrolled, m.user_id = app_actor_id() AS self
         FROM membership m JOIN "user" u ON u.id = m.user_id
        WHERE m.organization_id = $1 AND (m.ends_at IS NULL OR m.ends_at > now())
        ORDER BY u.email, m.id`,
      [organizationId],
    );
    const invitations = await scope.client.query<{ id: string; email: string; role: MembershipRole; sent_at: Date; expires_at: Date; sends: number; accepted_at: Date | null; expired: boolean }>(
      `SELECT i.id, u.email, m.role, i.sent_at, i.expires_at, i.sends, i.accepted_at, (i.accepted_at IS NULL AND i.expires_at <= now()) AS expired
         FROM invitation i JOIN "user" u ON u.id = i.user_id JOIN membership m ON m.id = i.membership_id
        WHERE i.organization_id = $1 AND (m.ends_at IS NULL OR m.ends_at > now())
        ORDER BY i.accepted_at IS NOT NULL, i.sent_at DESC, i.id LIMIT 100`,
      [organizationId],
    );
    return {
      organization: { id: organizationId, name, kind },
      roles: ROLES_BY_KIND[kind],
      members: members.rows.map(
        (row): MemberView => ({ membershipId: row.id, userId: row.user_id, email: row.email, role: row.role, status: row.status, mfaEnrolled: row.mfa_enrolled, self: row.self }),
      ),
      invitations: invitations.rows.map(
        (row): InvitationView => ({ id: row.id, email: row.email, role: row.role, sentAt: row.sent_at, expiresAt: row.expires_at, sends: row.sends, acceptedAt: row.accepted_at, expired: row.expired }),
      ),
      notice: params.notice ?? null,
    };
  },
  sample: { params: (refs) => ({ organizationId: refs.organizationId }) },
});

function isPgError(error: unknown, codes: readonly string[]): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && codes.includes(String(error.code));
}

/**
 * Invites a person to the organization in a role it holds (J2: "invites a billing manager and a viewer"): the
 * identity provider's invitation (Cognito's email through SES; the local outbox in development), the invited user,
 * the membership, and the invitation the database writes with its seven days. A person another organization knows
 * joins through a platform administrator; the database refuses that here.
 */
export const inviteUserAction = organizationRoute({
  id: 'settings.users.invite',
  kind: 'action',
  path: '/settings/organizations/[organizationId]/users',
  phi: false,
  permission: 'user.invite',
  params: z.object({ organizationId: opaqueId }),
  input: z.object({ email: emailAddress, role: z.enum(['practice_admin', 'billing_manager', 'analyst', 'viewer', 'firm_principal', 'firm_analyst']) }),
  audit: { action: 'membership_created', objectType: 'membership' },
  handle: async ({ scope, organizationId, input, services }): Promise<MutationResult> => {
    const kind = await organizationKind(scope.client, organizationId);
    if (!ROLES_BY_KIND[kind].includes(input.role)) {
      throw new InputError([{ field: 'role', message: `a role a ${kind} organization holds` }]);
    }
    const known = (await scope.client.query<{ id: string }>('SELECT id FROM "user" WHERE lower(email) = $1', [input.email])).rows[0];
    if (known !== undefined) {
      throw new InputError([{ field: 'email', message: 'this person is already a member here, or was; change their role instead' }]);
    }
    const { sub } = await services.provider.ensureUser(input.email);
    const userId = randomUUID();
    const membershipId = randomUUID();
    try {
      await scope.client.query('SAVEPOINT invite');
      await scope.client.query(`INSERT INTO "user" (id, cognito_sub, email, status, mfa_enrolled, hardware_key_required) VALUES ($1, $2, $3, 'invited', false, false)`, [userId, sub, input.email]);
      await scope.client.query('INSERT INTO membership (id, organization_id, user_id, role) VALUES ($1, $2, $3, $4)', [membershipId, organizationId, userId, input.role]);
      await scope.client.query('RELEASE SAVEPOINT invite');
    } catch (error) {
      if (isPgError(error, ['23505', '42501', '23514'])) {
        await scope.client.query('ROLLBACK TO SAVEPOINT invite');
        throw new InputError([{ field: 'email', message: 'this person already has an account with another organization; a platform administrator adds them' }]);
      }
      throw error;
    }
    return { objectId: membershipId, redirect: `/settings/organizations/${organizationId}/users?notice=invited` };
  },
  sample: { params: (refs) => ({ organizationId: refs.organizationId }), input: (refs) => ({ email: `settings-invited-${refs.practiceId}@synthetic.test`, role: 'viewer' }) },
});

export const changeRoleAction = organizationRoute({
  id: 'settings.users.change_role',
  kind: 'action',
  path: '/settings/organizations/[organizationId]/users',
  phi: false,
  permission: 'user.invite',
  params: z.object({ organizationId: opaqueId }),
  input: z.object({ membershipId: opaqueId, role: z.enum(['practice_admin', 'billing_manager', 'analyst', 'viewer', 'firm_principal', 'firm_analyst']) }),
  audit: { action: 'membership_role_changed', objectType: 'membership' },
  handle: async ({ scope, organizationId, input }): Promise<MutationResult> => {
    const kind = await organizationKind(scope.client, organizationId);
    if (!ROLES_BY_KIND[kind].includes(input.role)) {
      throw new InputError([{ field: 'role', message: `a role a ${kind} organization holds` }]);
    }
    let rowCount: number | null;
    try {
      ({ rowCount } = await scope.client.query('UPDATE membership SET role = $3 WHERE id = $1 AND organization_id = $2 AND (ends_at IS NULL OR ends_at > now())', [input.membershipId, organizationId, input.role]));
    } catch (error) {
      if (isPgError(error, ['42501', '23514'])) {
        throw new InputError([{ field: 'role', message: (error as Error).message }]);
      }
      throw error;
    }
    if (rowCount !== 1) {
      throw new NotFoundError();
    }
    return { objectId: input.membershipId, redirect: `/settings/organizations/${organizationId}/users?notice=role_changed` };
  },
  sample: { params: (refs) => ({ organizationId: refs.organizationId }), input: (refs) => ({ membershipId: refs.spareMembershipId, role: 'billing_manager' }) },
});

/** Ends a membership now: the person's sessions end and they are signed out of the identity provider (PRD 3, Lifecycle events). */
export const endMembershipAction = organizationRoute({
  id: 'settings.users.end_membership',
  kind: 'action',
  path: '/settings/organizations/[organizationId]/users',
  phi: false,
  permission: 'user.invite',
  params: z.object({ organizationId: opaqueId }),
  input: z.object({ membershipId: opaqueId, confirm: z.literal('on', { message: 'confirm that this person loses access now' }) }),
  audit: { action: 'membership_ended', objectType: 'membership' },
  handle: async ({ scope, organizationId, input, services }): Promise<MutationResult> => {
    let ended: { user_id: string } | undefined;
    try {
      ended = (
        await scope.client.query<{ user_id: string }>(
          'UPDATE membership SET ends_at = now() WHERE id = $1 AND organization_id = $2 AND user_id <> app_actor_id() AND (ends_at IS NULL OR ends_at > now()) RETURNING user_id',
          [input.membershipId, organizationId],
        )
      ).rows[0];
    } catch (error) {
      if (isPgError(error, ['23514'])) {
        throw new InputError([{ field: 'membershipId', message: (error as Error).message }]);
      }
      throw error;
    }
    if (ended === undefined) {
      throw new NotFoundError();
    }
    await revokeUserSessions(scope, ended.user_id);
    const sub = (await scope.client.query<{ cognito_sub: string }>('SELECT cognito_sub FROM "user" WHERE id = $1', [ended.user_id])).rows[0]?.cognito_sub;
    if (sub !== undefined) {
      await services.provider.globalSignOut(sub);
    }
    return { objectId: input.membershipId, redirect: `/settings/organizations/${organizationId}/users?notice=ended` };
  },
  sample: { params: (refs) => ({ organizationId: refs.organizationId }), input: (refs) => ({ membershipId: refs.spareMembershipId, confirm: 'on' }) },
});

/** Sends an expired (or unanswered) invitation again (J2: "re-sent by the administrator, never by the firm"). */
export const resendInvitationAction = organizationRoute({
  id: 'settings.users.resend_invitation',
  kind: 'action',
  path: '/settings/organizations/[organizationId]/users',
  phi: false,
  permission: 'user.invite',
  params: z.object({ organizationId: opaqueId }),
  input: z.object({ invitationId: opaqueId }),
  audit: { action: 'invitation_resent', objectType: 'invitation' },
  handle: async ({ scope, organizationId, input, services }): Promise<MutationResult> => {
    const invitation = (
      await scope.client.query<{ email: string }>('SELECT u.email FROM invitation i JOIN "user" u ON u.id = i.user_id WHERE i.id = $1 AND i.organization_id = $2', [input.invitationId, organizationId])
    ).rows[0];
    if (invitation === undefined) {
      throw new NotFoundError();
    }
    if ((await scope.client.query<{ resent: boolean }>('SELECT resend_invitation($1) AS resent', [input.invitationId])).rows[0]?.resent !== true) {
      throw new InputError([{ field: 'invitationId', message: 'this invitation was accepted, or its membership has ended' }]);
    }
    await services.provider.resendInvitation(invitation.email);
    return { objectId: input.invitationId, redirect: `/settings/organizations/${organizationId}/users?notice=resent` };
  },
  sample: { params: (refs) => ({ organizationId: refs.organizationId }), input: (refs) => ({ invitationId: refs.invitationId }) },
});

export const SETTINGS_ROUTES = [
  settingsPage,
  agreementsSettingsPage,
  confirmAgreementsAction,
  defaultsSettingsPage,
  settingsMaterialityAction,
  settingsPursuitAction,
  proofLevelPage,
  setProofLevelAction,
  accessLogPage,
  dataSettingsPage,
  usersSettingsPage,
  inviteUserAction,
  changeRoleAction,
  endMembershipAction,
  resendInvitationAction,
] as const;
