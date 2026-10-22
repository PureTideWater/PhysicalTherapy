import { randomUUID } from 'node:crypto';

import { LOCATION_STATUSES, type LocationStatus, locationStatusText } from '@tp/contracts';
import { AGREEMENT_KINDS, MEMBERSHIP_ROLES, type MembershipRole, type ScopeClient, provisionPracticeKey } from '@tp/db/runtime';
import { z } from 'zod';

import { revokeUserSessions } from '../auth/sessions';
import { PracticeSettingsError, type PracticeSettingsForm, practiceSettingsInput, settingsDocument, settingsForm } from '../console/practice-settings';
import { platformRoute } from '../http/invoke';
import { InputError, type MutationResult, NotFoundError } from '../http/route';
import { localityReading, releaseInForce } from '../pricing/location';
import { ZIP_CODE_FORMAT, type ZipCode, parseZipCode } from '../zip';
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

/**
 * A platform administrator suspends a customer organization, or reinstates it (PRD 7, Internal console,
 * Organizations and practices: "Create, edit, hold, suspend"; PRD 5, J18; docs/adr/0055). A suspension refuses new
 * runs for the organization's practices by the path a nonpayment suspension takes (organization_run_refusal: the
 * routes, the job chain and the database), and leaves every record readable; reinstating lifts it at once. Setting
 * the status it has changes nothing. A closed organization, and the company's own, are neither.
 */
export const setOrganizationStatus = platformRoute({
  id: 'console.organization_status',
  kind: 'action',
  path: '/console/organizations/[organizationId]',
  phi: false,
  permission: 'organization.manage',
  params: z.object({}),
  input: z.object({ organizationId: opaqueId, status: z.enum(['suspended', 'active'], { message: 'suspend or reinstate' }) }),
  audit: { action: 'organization_status_set', objectType: 'organization' },
  handle: async ({ scope, input }): Promise<MutationResult> => {
    const found = (await scope.client.query<{ status: string }>("SELECT status FROM organization WHERE id = $1 AND kind IN ('group', 'firm')", [input.organizationId])).rows[0];
    if (found === undefined) {
      throw new NotFoundError();
    }
    if (found.status === 'closed') {
      throw new InputError([{ field: 'status', message: 'a closed organization is neither suspended nor reinstated' }]);
    }
    if (found.status !== input.status) {
      await scope.client.query('UPDATE organization SET status = $2 WHERE id = $1', [input.organizationId, input.status]);
    }
    return { objectId: input.organizationId, redirect: `/console/organizations/${input.organizationId}` };
  },
  sample: { params: () => ({}), input: (refs) => ({ organizationId: refs.organizationId, status: 'active' }) },
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

export interface InvitationSummary {
  readonly id: string;
  readonly email: string;
  readonly role: MembershipRole;
  readonly sentAt: Date;
  readonly expiresAt: Date;
  readonly sends: number;
  readonly acceptedAt: Date | null;
  readonly expired: boolean;
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

/** A status the console's setters returned, as a redirect names it (anything else is ignored). */
const locationParam = optionalText(z.enum(LOCATION_STATUSES)).catch(undefined);

/** A practice's location as the console last set it: its status in the release in force, in words. */
export interface ConsoleLocation {
  readonly practiceId: string;
  readonly status: LocationStatus;
  readonly text: string;
}

/**
 * The words for a location the console just set, from the status its setter returned. The console reads a practice's
 * five-digit ZIP alone (console_practice_settings()), never its ZIP+4, so a ZIP+4's locality and digits are named
 * only as "its ZIP+4" here; the practice's own Pricing settings name them.
 */
export async function consoleLocationText(client: ScopeClient, practiceId: string, status: LocationStatus): Promise<string> {
  const zip = (await client.query<{ zip: string | null }>('SELECT zip FROM console_practice_settings($1)', [practiceId])).rows[0]?.zip ?? null;
  const releaseNo = await releaseInForce(client);
  if (status === 'ready') {
    const five = await localityReading(client, releaseNo, zip === null ? null : { zip, zipPlusFour: null });
    return five.status === 'ready' ? five.text : `Medicare prices this location under rule release ${String(releaseNo)}, in the locality of its ZIP+4.`;
  }
  if (status === 'zip_plus_four_unknown') {
    // Right under either answer to Q37: the digits may be right and the list incomplete.
    return 'Medicare’s ZIP+4 list in force does not list this ZIP+4. If the practice confirms the four digits, check them against Medicare’s list.';
  }
  return locationStatusText(status, { zip, releaseNo });
}

export const organizationPage = platformRoute({
  id: 'console.organization',
  kind: 'page',
  path: '/console/organizations/[organizationId]',
  phi: false,
  permission: 'organization.manage',
  // created and location: the practice just created and its location's status (console_set_practice_location()).
  params: z.object({ organizationId: opaqueId, created: optionalText(opaqueId).catch(undefined), location: locationParam }),
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
    // Invitations (PRD 5, J2), with whether each has lapsed: an expired one is sent again from here.
    const invitations = await scope.client.query<{ id: string; email: string; role: MembershipRole; sent_at: Date; expires_at: Date; sends: number; accepted_at: Date | null; expired: boolean }>(
      `SELECT i.id, u.email, m.role, i.sent_at, i.expires_at, i.sends, i.accepted_at, (i.accepted_at IS NULL AND i.expires_at <= now()) AS expired
         FROM invitation i JOIN "user" u ON u.id = i.user_id JOIN membership m ON m.id = i.membership_id
        WHERE i.organization_id = $1 ORDER BY i.accepted_at IS NOT NULL, i.sent_at DESC, i.id LIMIT 100`,
      [id],
    );
    return {
      organization: organizationOf(organization),
      invitations: invitations.rows.map(
        (row): InvitationSummary => ({
          id: row.id,
          email: row.email,
          role: row.role,
          sentAt: row.sent_at,
          expiresAt: row.expires_at,
          sends: row.sends,
          acceptedAt: row.accepted_at,
          expired: row.expired,
        }),
      ),
      roles: ROLES_BY_KIND[organization.kind],
      practices: practices.rows.map((row) => ({ id: row.practice_id, name: row.name, status: row.status, createdAt: row.created_at })),
      created:
        params.created !== undefined && params.location !== undefined && practices.rows.some((row) => row.practice_id === params.created)
          ? ({ practiceId: params.created, status: params.location, text: await consoleLocationText(scope.client, params.created, params.location) } satisfies ConsoleLocation)
          : null,
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

/** The billing ZIP as a console form sends it: required, five digits or ZIP+4 (parseZipCode). */
export const billingZip = z
  .string()
  .trim()
  .transform((text, context): ZipCode => {
    const parsed = parseZipCode(text);
    if (parsed === null) {
      context.addIssue({ code: 'custom', message: ZIP_CODE_FORMAT });
      return z.NEVER;
    }
    return parsed;
  });

/** The location setters' refusals of a malformed ZIP or ZIP+4, named on the form's field. */
function locationRefused(error: unknown): InputError | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23514' && 'constraint' in error) {
    if (error.constraint === 'practice_site_zip' || error.constraint === 'practice_site_zip_plus_four') {
      return new InputError([{ field: 'zip', message: ZIP_CODE_FORMAT }]);
    }
  }
  return undefined;
}

/** console_set_practice_location()'s answer: the location's status, or null for a practice that does not exist or is deleted. */
async function setLocation(client: ScopeClient, practiceId: string, zip: ZipCode): Promise<LocationStatus | null> {
  let status: string | null | undefined;
  try {
    status = (await client.query<{ status: string | null }>('SELECT console_set_practice_location($1, $2, $3) AS status', [practiceId, zip.zip5, zip.plusFour])).rows[0]?.status;
  } catch (error) {
    throw locationRefused(error) ?? error;
  }
  return status === null || status === undefined ? null : (LOCATION_STATUSES.find((known) => known === status) ?? null);
}

/**
 * Creates a practice of a group with its own data key (PRD 3) and its pricing location (audit #33; docs/adr/0064):
 * the billing ZIP is required, five digits or ZIP+4, and set by console_set_practice_location() in the creating
 * transaction, before the database's deferred check (practice_has_site) runs at commit. A ZIP that needs its ZIP+4, or
 * one the release in force does not map, is accepted and its status shown beside the new practice, never refused.
 */
export const createPractice = platformRoute({
  id: 'console.create_practice',
  kind: 'action',
  path: '/console/organizations/[organizationId]',
  phi: false,
  permission: 'organization.manage',
  params: z.object({}),
  input: z.object({ organizationId: opaqueId, name: requiredText(200), npi, taxIdLast4: lastFour, zip: billingZip }),
  audit: { action: 'practice_created', objectType: 'practice' },
  handle: async ({ scope, input, services }): Promise<MutationResult> => {
    const id = randomUUID();
    // The practice is created with its own data key (PRD 3), wrapped by the key provider.
    const key = await provisionPracticeKey(services.keys, id);
    await scope.client.query('INSERT INTO practice (id, organization_id, name, npi, tax_id_last4, data_key_ref) VALUES ($1, $2, $3, $4, $5, $6)', [
      id,
      input.organizationId,
      input.name,
      input.npi ?? null,
      input.taxIdLast4 ?? null,
      key.dataKeyRef,
    ]);
    const status = await setLocation(scope.client, id, input.zip);
    if (status === null) {
      throw new NotFoundError();
    }
    return { objectId: id, redirect: `/console/organizations/${input.organizationId}?created=${id}&location=${status}` };
  },
  sample: { params: () => ({}), input: (refs) => ({ organizationId: refs.organizationId, name: 'SYNTHETIC CONSOLE PRACTICE', zip: '00011' }) },
});

export interface PracticeSettingsPageData {
  readonly practice: { readonly id: string; readonly organizationId: string; readonly name: string };
  readonly form: PracticeSettingsForm;
  readonly saved: boolean;
  /** The location's five-digit billing ZIP (the console never reads its ZIP+4), or null when it has none. */
  readonly zip: string | null;
  /** The location as the console just set it, from its setter's status; null otherwise. */
  readonly location: ConsoleLocation | null;
}

/**
 * A practice's pricing and triage settings in the console (PRD 5, J8: "materiality thresholds ... are
 * practice settings with defaults"; PRD 11, Inputs; PRD 12, Deadlines and pursuit cost; ADR 0040): the
 * billing ZIP, the place-of-service split, the default rounding, the line and case materiality, the
 * anomaly cohort minimum and threshold, and the staff rate and minutes the pursuit-cost estimate uses.
 * None is a patient's data; read through console_practice_settings(), never the practice's records.
 */
export const practiceSettingsPage = platformRoute({
  id: 'console.practice',
  kind: 'page',
  path: '/console/practices/[practiceId]',
  phi: false,
  permission: 'organization.manage',
  params: z.object({ practiceId: opaqueId, saved: optionalText(z.literal('1')), location: locationParam }),
  handle: async ({ scope, params }): Promise<PracticeSettingsPageData> => {
    const { rows } = await scope.client.query<{ practice_id: string; organization_id: string; name: string; zip: string | null; settings: unknown }>(
      'SELECT practice_id, organization_id, name, zip, settings FROM console_practice_settings($1)',
      [params.practiceId],
    );
    const row = rows[0];
    if (row === undefined) {
      throw new NotFoundError();
    }
    return {
      practice: { id: row.practice_id, organizationId: row.organization_id, name: row.name },
      form: settingsForm(row.settings),
      saved: params.saved !== undefined,
      zip: row.zip,
      location: params.location === undefined ? null : { practiceId: row.practice_id, status: params.location, text: await consoleLocationText(scope.client, row.practice_id, params.location) },
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

/**
 * Sets a practice's pricing and triage settings (a blank field returns it to its default; the practice's other
 * settings stay). Validated here as the engine and triage read them, written by console_set_practice_settings() in
 * the practice's one scope, and audited. The billing ZIP is the location's own form (setPracticeLocation): this
 * passes none, which leaves the location as it is.
 */
export const setPracticeSettings = platformRoute({
  id: 'console.practice_settings',
  kind: 'action',
  path: '/console/practices/[practiceId]',
  phi: false,
  permission: 'organization.manage',
  params: z.object({}),
  input: practiceSettingsInput.extend({ practiceId: opaqueId }),
  audit: { action: 'practice_settings_set', objectType: 'practice' },
  handle: async ({ scope, input }): Promise<MutationResult> => {
    let document;
    try {
      document = settingsDocument(input);
    } catch (error) {
      if (error instanceof PracticeSettingsError) {
        throw new InputError([{ field: error.field, message: error.message }]);
      }
      throw error;
    }
    const { rows } = await scope.client.query<{ changed: boolean }>('SELECT console_set_practice_settings($1, NULL, $2) AS changed', [input.practiceId, JSON.stringify(document.settings)]);
    if (rows[0]?.changed !== true) {
      throw new NotFoundError();
    }
    return { objectId: input.practiceId, redirect: `/console/practices/${input.practiceId}?saved=1` };
  },
  sample: {
    params: () => ({}),
    input: (refs) => ({ practiceId: refs.practiceId, facilityPlaces: '22', nonFacilityPlaces: '11', defaultRounding: 'HALF_UP_CENT', lineMateriality: '5.00', caseMateriality: '250.00' }),
  },
});

/**
 * Sets a practice's pricing location from the console (audit #33; docs/adr/0064): its billing ZIP and, where
 * Medicare's locality list needs it, its ZIP+4, entered whole each time (the console never reads the stored ZIP+4, so
 * a save replaces it). Written by console_set_practice_location() (organization.manage, checked again there) in the
 * practice's one scope, audited, and the monitoring chain queued by this request's ID so the months waiting on the
 * location are planned again. The practice's Getting started then asks a person of the practice to confirm it.
 */
export const setPracticeLocation = platformRoute({
  id: 'console.practice_location',
  kind: 'action',
  path: '/console/practices/[practiceId]',
  phi: false,
  permission: 'organization.manage',
  params: z.object({}),
  input: z.object({ practiceId: opaqueId, zip: billingZip }),
  audit: { action: 'console_pricing_location_set', objectType: 'practice' },
  handle: async ({ scope, input, request, services, afterCommit }): Promise<MutationResult> => {
    const status = await setLocation(scope.client, input.practiceId, input.zip);
    if (status === null) {
      throw new NotFoundError();
    }
    // Queued once the save has committed, so the plan reads the saved location (see setPricingLocationAction).
    afterCommit(() => services.queue.enqueue('monitor', { practice_id: input.practiceId, request_id: request.requestId }));
    return { objectId: input.practiceId, redirect: `/console/practices/${input.practiceId}?location=${status}` };
  },
  sample: { params: () => ({}), input: (refs) => ({ practiceId: refs.practiceId, zip: '00011' }) },
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
  /** The grantee's internal role: a support engineer, a contract specialist (docs/adr/0028) or a reimbursement reviewer (docs/adr/0038). */
  readonly granteeRole: 'support' | 'contract_specialist' | 'reviewer' | null;
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
    // Who a support grant can go to: support engineers, contract specialists and reimbursement reviewers (support_grant_role()).
    const engineers = await scope.client.query<{ id: string; email: string; role: 'support' | 'contract_specialist' | 'reviewer' }>(
      `SELECT u.id, u.email, support_grant_role(u.id) AS role FROM "user" u
        WHERE support_grant_role(u.id) IS NOT NULL
        ORDER BY support_grant_role(u.id) DESC, u.email`,
    );
    const emails = await scope.client.query<{ id: string; email: string; role: 'support' | 'contract_specialist' | 'reviewer' | null }>('SELECT id, email, support_grant_role(id) AS role FROM "user" WHERE id = ANY ($1::uuid[])', [
      grants.rows.map((row) => row.user_id),
    ]);
    const practiceName = new Map(practices.rows.map((row) => [row.practice_id, row.name]));
    const emailOf = new Map(emails.rows.map((row) => [row.id, row.email]));
    const roleOf = new Map(emails.rows.map((row) => [row.id, row.role]));
    return {
      grants: grants.rows.map(
        (row): ConsoleSupportGrant => ({
          id: row.support_grant_id,
          practiceId: row.practice_id,
          practiceName: practiceName.get(row.practice_id) ?? '',
          engineerEmail: emailOf.get(row.user_id) ?? '',
          granteeRole: roleOf.get(row.user_id) ?? null,
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
    // A support engineer, or a contract specialist who abstracts the practice's contracts (docs/adr/0028).
    const grantee = await scope.client.query<{ role: string | null }>('SELECT support_grant_role($1) AS role', [input.userId]);
    if ((grantee.rows[0]?.role ?? null) === null) {
      throw new InputError([{ field: 'userId', message: 'a support engineer or a contract specialist with a current role' }]);
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

export interface QueuePractice {
  readonly practiceId: string;
  readonly name: string;
  readonly documentsAwaiting: number;
  readonly drafts: number;
  readonly proposalsAwaiting: number;
  readonly awaitingSignOff: number;
  readonly openQuestions: number;
  /** Packets citing the Medicare Advantage regulation that wait for a specialist's confirmation. */
  readonly regulationsAwaiting: number;
  /** When the caller's own open support grant on the practice ends; null without one. */
  readonly grantEndsAt: Date | null;
}

export const QUEUE_PRACTICES_PER_PAGE = 25;

/**
 * The internal console's specialist queue (PRD 7, Internal console: "documents awaiting abstraction,
 * proposals awaiting verification, questions to customers ... abstract, verify, approve, ask"): per
 * practice, counts only (console_contract_queue(): no document, contract, question or packet is read
 * here), the regulations waiting for a specialist's confirmation among them (docs/adr/0047),
 * and whether the specialist's own support grant to the practice is open, which is the only way into
 * its records (docs/adr/0028). Proposals stay empty until the model gateway proposes abstractions
 * (milestone 10). Practices with nothing waiting are left out unless asked for.
 */
export const specialistQueuePage = platformRoute({
  id: 'console.specialist_queue',
  kind: 'page',
  path: '/console/specialist-queue',
  phi: false,
  permission: 'contract.review',
  params: z.object({ all: z.enum(['1']).optional().catch(undefined), page: z.coerce.number().int().min(1).max(100_000).default(1) }),
  handle: async ({ scope, params }) => {
    const { rows } = await scope.client.query<{
      practice_id: string;
      name: string;
      documents_awaiting: string;
      drafts: string;
      proposals_awaiting: string;
      awaiting_sign_off: string;
      open_questions: string;
      regulations_awaiting: string;
      support_grant_ends_at: Date | null;
    }>('SELECT * FROM console_contract_queue()');
    const all = rows.map(
      (row): QueuePractice => ({
        practiceId: row.practice_id,
        name: row.name,
        documentsAwaiting: Number.parseInt(row.documents_awaiting, 10),
        drafts: Number.parseInt(row.drafts, 10),
        proposalsAwaiting: Number.parseInt(row.proposals_awaiting, 10),
        awaitingSignOff: Number.parseInt(row.awaiting_sign_off, 10),
        openQuestions: Number.parseInt(row.open_questions, 10),
        regulationsAwaiting: Number.parseInt(row.regulations_awaiting, 10),
        grantEndsAt: row.support_grant_ends_at,
      }),
    );
    const working = (practice: QueuePractice) =>
      practice.documentsAwaiting + practice.drafts + practice.proposalsAwaiting + practice.awaitingSignOff + practice.openQuestions + practice.regulationsAwaiting > 0 || practice.grantEndsAt !== null;
    const shown = params.all === '1' ? all : all.filter(working);
    const pages = Math.max(1, Math.ceil(shown.length / QUEUE_PRACTICES_PER_PAGE));
    const current = Math.min(params.page, pages);
    return {
      showAll: params.all === '1',
      practices: shown.slice((current - 1) * QUEUE_PRACTICES_PER_PAGE, current * QUEUE_PRACTICES_PER_PAGE),
      totals: {
        documentsAwaiting: all.reduce((sum, practice) => sum + practice.documentsAwaiting, 0),
        proposalsAwaiting: all.reduce((sum, practice) => sum + practice.proposalsAwaiting, 0),
        openQuestions: all.reduce((sum, practice) => sum + practice.openQuestions, 0),
        regulationsAwaiting: all.reduce((sum, practice) => sum + practice.regulationsAwaiting, 0),
      },
      page: current,
      pages,
      total: shown.length,
    };
  },
  sample: { params: () => ({}) },
});

export const CONSOLE_ROUTES = [
  organizationsPage,
  createOrganization,
  organizationPage,
  setOrganizationStatus,
  createPractice,
  practiceSettingsPage,
  setPracticeSettings,
  setPracticeLocation,
  inviteMember,
  endMembership,
  unlockUser,
  recordAgreement,
  supportPage,
  createSupportGrant,
  endSupportGrant,
  specialistQueuePage,
] as const;
