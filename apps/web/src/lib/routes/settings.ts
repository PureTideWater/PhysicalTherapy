import { randomUUID } from 'node:crypto';

import { type ProofLevel, PROOF_LEVELS, ledgerSettings } from '@tp/ledger';
import { type Cents, centsToString, parseAmount } from '@tp/money';
import { triageSettings } from '@tp/triage';
import { LedgerSettingsRefused, setLedgerSettings } from '@tp/worker/ledger';
import { CorrespondenceContactError, type CorrespondenceContact, USPS_STATE_CODES, correspondenceText } from '@tp/packets';
import { CorrespondenceContactRefused, practiceCorrespondenceContact, setCorrespondenceContact } from '@tp/worker/packets';
import { organizationBilling } from '@tp/worker/billing';
import { type MembershipRole, rolesPermit } from '@tp/db/runtime';
import { z } from 'zod';

import { underPacketRules } from '../cases/refusals';
import {
  LOCATION_CHANGED,
  type LocationReading,
  type MonthWaitingOnLocation,
  type PracticeLocation,
  billingZipDone,
  billingZipStep,
  locationConfirmed,
  locationSettled,
  monthsWaitingOnLocation,
  practiceLocationReading,
  runsPricedElsewhere,
} from '../pricing/location';
import { runsInEffect } from '../pricing/queries';
import { ZIP_CODE_FORMAT, parseZipCode, zipCodeText } from '../zip';
import { canSetCorrespondence, correspondenceSettingsPath } from '../packets/contact';
import { revokeUserSessions } from '../auth/sessions';
import { organizationRoute, practiceRoute } from '../http/invoke';
import { InputError, type Issue, type MutationResult, NotFoundError } from '../http/route';
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
 *   checklist of J2 (MFA, terms, the agreement chain confirmed, the team invited, a plan chosen, the billing ZIP
 *   confirmed).
 * - Agreements and grants: the chain (BAA, engagement letter, terms, data-rights addendum) with each document's
 *   reference and SHA-256, its confirmation by the administrator (an audit event), and the grants to the
 *   practice (a view; approving and revoking firm grants are milestone 12's firm flows).
 * - Materiality and pursuit defaults: set by the people who work cases (the database checks it again).
 * - The proof level: posted or deposited, the administrator's alone, with the rule for lines already recovered
 *   stated before it is saved and applied by the next reconcile (docs/adr/0053).
 * - Pricing settings: the practice's pricing location (its billing ZIP and ZIP+4), its status in the rule release in
 *   force, the places of service in effect and the months waiting on the location; set and confirmed under
 *   pricing_settings.set (audit #33; docs/adr/0064).
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
  readonly key: 'mfa' | 'terms' | 'agreements' | 'team' | 'billing' | 'billing_zip' | 'upload' | 'correspondence';
  readonly done: boolean;
  readonly href: string;
  /** The step's own words where they depend on the records (the billing ZIP's status); the page's otherwise. */
  readonly title?: string;
  readonly detail?: string;
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
      const { reading } = await practiceLocationReading(scope.client, practiceId);
      checklist = [
        { key: 'mfa', done: true, href: '/account/devices' },
        { key: 'terms', done: true, href: '/terms' },
        { key: 'agreements', done: missingKinds(agreements).length === 0 && (await lastConfirmation(scope.client, practiceId)) !== null, href: `/p/${practiceId}/settings/agreements` },
        { key: 'team', done: Number.parseInt(team.rows[0]?.count ?? '0', 10) > 0, href: `/settings/organizations/${organizationId}/users` },
        { key: 'billing', done: billing?.subscription?.status === 'active', href: `/settings/billing/${organizationId}` },
        // The practice's pricing location, confirmed by a person of the practice since it last changed, with nothing left
        // for the customer to change (audit #33; docs/adr/0064). Pricing never waits for the confirmation.
        {
          key: 'billing_zip',
          done: billingZipDone(reading, await locationConfirmed(scope.client, practiceId)),
          href: pricingSettingsPath(practiceId),
          ...(billingZipStep(reading) ?? {}),
        },
        { key: 'upload', done: Number.parseInt(uploads.rows[0]?.count ?? '0', 10) > 0, href: `/p/${practiceId}/uploads` },
        // The contact every payer's copy prints; no packet is exported without it (audit item #37 part 1, D6).
        { key: 'correspondence', done: (await practiceCorrespondenceContact(scope.client, practiceId)).state === 'set', href: correspondenceSettingsPath(practiceId) },
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

/** The contact form's fields, as their refusals name them (CORRESPONDENCE_FIELDS but the whole contact's). */
const blankText = (max: number, message: string) => z.string().trim().max(max, message).optional().default('');
/** The name and the address lines hold no @: the email field holds the one email the payer's copy prints. */
const NO_AT = 'no @ here: an email goes in its own field';
const noAt = <T extends z.ZodType<string, unknown>>(schema: T): T => schema.refine((value: string) => !value.includes('@'), NO_AT);

/**
 * The correspondence contact as the form sends it (D6; Q1 (a)): a name or office and a phone required, the extension,
 * email and a full mailing address optional, and no @ in the name or an address line. The same rules again in @tp/packets
 * correspondenceContactSetting(), which the worker's setter applies before anything is written.
 */
export const correspondenceForm = z.object({
  name: noAt(z.string().trim().min(1, 'a name or office').max(120, 'a name or office of at most 120 characters')),
  phone: z.string().trim().min(1, 'a 10-digit phone number, such as (919) 555-0100').max(32, 'a 10-digit phone number, such as (919) 555-0100'),
  phone_extension: blankText(6, 'an extension of 1 to 6 digits').pipe(z.string().regex(/^\d{0,6}$/, 'an extension of 1 to 6 digits')),
  email: blankText(254, 'an email address of at most 254 characters'),
  address_line1: noAt(blankText(100, 'at most 100 characters')),
  address_line2: noAt(blankText(100, 'at most 100 characters')),
  address_city: noAt(blankText(100, 'at most 100 characters')),
  address_state: blankText(2, 'a USPS state or territory code, such as NC').pipe(z.string().toUpperCase()),
  address_zip: blankText(10, 'a ZIP code of five digits, or ZIP+4 (nine digits, with or without its hyphen)'),
});

export interface CorrespondencePageData {
  readonly practiceId: string;
  /** The contact as stored, to fill the form; null while none is set or the stored value is malformed. */
  readonly stored: CorrespondenceContact | null;
  readonly state: 'set' | 'missing' | 'malformed';
  /** The words every payer's copy prints, once set (the preview). */
  readonly printed: string | null;
  readonly states: readonly string[];
  /** The practice administrator, reached by ownership: the setter's and Postgres's own rule (canSetCorrespondence). */
  readonly canSet: boolean;
  readonly notice: 'saved' | null;
}

/**
 * The practice's correspondence contact (audit item #37 part 1, D6; the founder's ruling of 2026-10-20, Q1 (a);
 * docs/adr/0061): who a payer's examiner writes to or calls about a dispute, which every packet's payer copy prints and
 * without which none is exported. Everyone who opens the practice sees it; the practice administrator sets it.
 */
export const correspondenceSettingsPage = practiceRoute({
  id: 'practice.settings.correspondence',
  kind: 'page',
  path: '/p/[practiceId]/settings/correspondence',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, notice: optionalText(z.literal('saved')) }),
  handle: async ({ scope, practiceId, access, params }): Promise<CorrespondencePageData> => {
    const contact = await practiceCorrespondenceContact(scope.client, practiceId);
    return {
      practiceId,
      stored: contact.state === 'set' ? contact.contact : null,
      state: contact.state,
      printed: contact.state === 'set' ? correspondenceText(contact.contact) : null,
      states: USPS_STATE_CODES,
      canSet: canSetCorrespondence(access),
      notice: params.notice ?? null,
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

/**
 * The practice administrator sets the correspondence contact, replacing the one before (it is never cleared). The
 * worker's setter checks the role again and records correspondence_contact_set with the practice's ID only; the
 * database's restrictive practice_administrators_update policy admits the UPDATE for the practice's administrators
 * alone. A packet already exported keeps the contact it was printed with. The route's gate is agreement.sign, the
 * permission only the practice administrator holds (the overview's `administers`), as the proof level's action is
 * gated by proof_level.set, so the persona matrix and the setter agree; a permission of its own needs the schema
 * (docs/adr/0061, "Audit item #37, part 1").
 */
export const setCorrespondenceContactAction = practiceRoute({
  id: 'practice.settings.set_correspondence',
  kind: 'action',
  path: '/p/[practiceId]/settings/correspondence',
  phi: true,
  permission: 'agreement.sign',
  params: practiceParams,
  input: correspondenceForm,
  audit: { action: 'correspondence_contact_saved', objectType: 'practice' },
  handle: async ({ scope, practiceId, input, request }): Promise<MutationResult> => {
    try {
      await setCorrespondenceContact(scope, {
        practiceId,
        contact: {
          name: input.name,
          phone: input.phone,
          phone_extension: input.phone_extension,
          email: input.email,
          address: { line1: input.address_line1, line2: input.address_line2, city: input.address_city, state: input.address_state, zip: input.address_zip },
        },
        requestId: request.requestId,
      });
    } catch (error) {
      if (error instanceof CorrespondenceContactError) {
        throw new InputError([{ field: error.field, message: error.message }]);
      }
      if (error instanceof CorrespondenceContactRefused) {
        throw new InputError([{ field: 'contact', message: error.message }]);
      }
      throw error;
    }
    return { objectId: practiceId, redirect: `${correspondenceSettingsPath(practiceId)}?notice=saved` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: () => ({ name: 'SYNTHETIC BILLING OFFICE', phone: '(919) 555-0100' }) },
});

/** The Pricing settings section's path. */
export function pricingSettingsPath(practiceId: string): string {
  return `/p/${practiceId}/settings/pricing`;
}

/** A place of service as it prices: at the facility or the non-facility rate, and whose setting it is. */
export interface PlaceInEffect {
  readonly code: string;
  readonly setting: 'facility' | 'non_facility';
  /** The practice's own setting, or the approved place-of-service split's for a place the practice has not set. */
  readonly source: 'practice' | 'split';
}

/** A complete run in effect priced before the location last changed: the location prices it again only when it is re-run. */
export interface PricedBeforeLocation {
  readonly runId: string;
  readonly periodFrom: string;
  readonly periodTo: string;
  readonly releaseNo: number;
}

export interface PricingSettingsPageData {
  readonly practiceId: string;
  /** The location as stored, or null when the practice has none. */
  readonly location: PracticeLocation | null;
  /** The location as the screens show it: 27601, or 27601-1234. */
  readonly locationText: string | null;
  /** Its status in the release in force over the whole release, and the sentence for it. */
  readonly reading: LocationReading;
  /** Whether a person of the practice set or confirmed it since it last changed (everyone who opens the practice reads it). */
  readonly confirmed: boolean;
  readonly places: readonly PlaceInEffect[];
  /** shown: the split in force's places are listed; not_read: a split is approved but no run of the practice has pinned it yet; none: none is approved. */
  readonly split: 'shown' | 'not_read' | 'none';
  readonly waiting: readonly MonthWaitingOnLocation[];
  readonly pricedBefore: readonly PricedBeforeLocation[];
  /** pricing_settings.set: the practice administrator, the billing manager and the firm principal (the founder's answer to PR 6b's Q5 (a)). */
  readonly canEdit: boolean;
  /** What the action that led here did: saved, confirmed, or nothing, as the location changed since its page loaded. */
  readonly notice: 'saved' | 'confirmed' | 'changed' | null;
}

const PLACE_SETTINGS = new Set(['facility', 'non_facility']);

/** A stored place-of-service map as its places, in code order (anything else in it is left out). */
function placesOf(value: unknown, source: PlaceInEffect['source']): PlaceInEffect[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, PlaceInEffect['setting']] => /^\d{2}$/.test(entry[0]) && typeof entry[1] === 'string' && PLACE_SETTINGS.has(entry[1]))
    .map(([code, setting]) => ({ code, setting, source }));
}

/**
 * The places of service in effect: the practice's own settings, then the approved split's for every place the
 * practice has not set, as the price job merges them (docs/adr/0064). The split's settings are read through
 * pricing_run_split() from the practice's newest run that pinned the split in force; the application role reads the
 * split no other way.
 */
async function placesInEffect(client: Parameters<typeof practiceOrganization>[0], practiceId: string): Promise<{ readonly places: PlaceInEffect[]; readonly split: PricingSettingsPageData['split'] }> {
  const own = placesOf(
    ((await client.query<{ settings: unknown }>('SELECT settings FROM practice WHERE id = $1', [practiceId])).rows[0]?.settings as Record<string, unknown> | undefined)?.place_of_service_settings,
    'practice',
  );
  const inForce = (await client.query<{ id: string | null }>('SELECT place_of_service_split_in_force() AS id')).rows[0]?.id ?? null;
  const pinned =
    inForce === null
      ? undefined
      : (
          await client.query<{ settings: unknown }>(
            `SELECT s.settings
               FROM (SELECT r.id FROM pricing_run r WHERE r.practice_id = $1 AND r.place_of_service_split_id = $2 ORDER BY r.created_at DESC, r.id DESC LIMIT 1) newest
               CROSS JOIN LATERAL pricing_run_split(newest.id) s`,
            [practiceId, inForce],
          )
        ).rows[0];
  const set = new Set(own.map((place) => place.code));
  const fromSplit = pinned === undefined ? [] : placesOf(pinned.settings, 'split').filter((place) => !set.has(place.code));
  return {
    places: [...own, ...fromSplit].sort((left, right) => (left.code < right.code ? -1 : left.code > right.code ? 1 : 0)),
    split: inForce === null ? 'none' : pinned === undefined ? 'not_read' : 'shown',
  };
}

/**
 * Pricing settings (audit #33; #16's minimal record; the founder's answers of 2026-10-21 to PR 6b's Q2 (a) and Q5 (a);
 * docs/adr/0064): the practice's pricing location (its billing ZIP and, where Medicare's locality list needs it, its
 * ZIP+4), its status in the rule release in force in plain words, the places of service in effect, the months that
 * wait on the location, and the complete months priced before it last changed, each linked to its run to price it
 * again. Everyone who opens the practice sees it; the practice administrator, the billing manager and the firm
 * principal set and confirm the location.
 */
export const pricingSettingsPage = practiceRoute({
  id: 'practice.settings.pricing',
  kind: 'page',
  path: '/p/[practiceId]/settings/pricing',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, notice: optionalText(z.enum(['saved', 'confirmed', 'changed'])).catch(undefined) }),
  handle: async ({ scope, practiceId, access, params, request }): Promise<PricingSettingsPageData> => {
    const { location, reading } = await practiceLocationReading(scope.client, practiceId);
    const { places, split } = await placesInEffect(scope.client, practiceId);
    const inEffect = location === null ? [] : await runsInEffect(scope, practiceId, request.requestId);
    const elsewhere = location === null ? new Set<string>() : await runsPricedElsewhere(scope.client, practiceId, inEffect, location);
    const pricedBefore = inEffect
      .filter((run) => elsewhere.has(run.id))
      .map((run): PricedBeforeLocation => ({ runId: run.id, periodFrom: run.periodFrom, periodTo: run.periodTo, releaseNo: run.releaseNo }));
    return {
      practiceId,
      location,
      locationText: location === null ? null : zipCodeText(location.zip, location.zipPlusFour),
      reading,
      confirmed: await locationConfirmed(scope.client, practiceId),
      places,
      split,
      waiting: await monthsWaitingOnLocation(scope.client, practiceId),
      pricedBefore,
      canEdit: rolesPermit(access.roles, 'pricing_settings.set'),
      notice: params.notice ?? null,
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

/** The billing ZIP as the form sends it: five digits or ZIP+4, with or without its hyphen (parseZipCode). */
export const billingZipInput = z.object({
  zip: z
    .string()
    .trim()
    .transform((text, context) => {
      const parsed = parseZipCode(text);
      if (parsed === null) {
        context.addIssue({ code: 'custom', message: ZIP_CODE_FORMAT });
        return z.NEVER;
      }
      return parsed;
    }),
});

/**
 * The confirmation's refusal when the location is no longer the one its page showed, on the shown ZIP's field in the
 * notice's words: the Pricing settings form reads the page again with the notice instead (isLocationChanged).
 */
export const LOCATION_CHANGED_ISSUE = { field: 'shownZip', message: LOCATION_CHANGED } as const;

/** Whether a refusal is LOCATION_CHANGED_ISSUE: nothing was confirmed because the location changed since the page loaded. */
export function isLocationChanged(issues: readonly Issue[] | undefined): boolean {
  return (issues ?? []).some((issue) => issue.field === LOCATION_CHANGED_ISSUE.field && issue.message === LOCATION_CHANGED_ISSUE.message);
}

/**
 * The location functions' refusals a form names: a malformed ZIP or ZIP+4 (the handler's check, bypassed) on the ZIP's
 * field, and a confirmation of a location that changed since its page loaded (practice_site_changed) as
 * LOCATION_CHANGED_ISSUE.
 */
export function locationRefusal(error: unknown): InputError | undefined {
  if (isPgError(error, ['23514']) && typeof error === 'object' && error !== null && 'constraint' in error) {
    if (error.constraint === 'practice_site_zip' || error.constraint === 'practice_site_zip_plus_four') {
      return new InputError([{ field: 'zip', message: ZIP_CODE_FORMAT }]);
    }
    if (error.constraint === 'practice_site_changed') {
      return new InputError([LOCATION_CHANGED_ISSUE]);
    }
  }
  return undefined;
}

/**
 * Sets the practice's pricing location (audit #33): the role check here (pricing_settings.set) and again in Postgres
 * (practice_set_location(): a person holding it in a practice of the transaction's scope, and the ZIP's and ZIP+4's
 * shapes), in the practice's scope, audited. A ZIP that needs its ZIP+4, or one the release does not map, is
 * accepted and its status shown, never refused. The monitoring chain is queued by this request's ID, so the months
 * waiting on the location are planned again with no hand re-run, whatever daily plan is already queued.
 */
export const setPricingLocationAction = practiceRoute({
  id: 'practice.settings.pricing_location',
  kind: 'action',
  path: '/p/[practiceId]/settings/pricing',
  phi: true,
  permission: 'pricing_settings.set',
  params: practiceParams,
  input: billingZipInput,
  audit: { action: 'pricing_location_set', objectType: 'practice' },
  handle: async ({ scope, practiceId, input, request, services, afterCommit }): Promise<MutationResult> => {
    try {
      await scope.client.query('SELECT practice_set_location($1, $2, $3) AS status', [practiceId, input.zip.zip5, input.zip.plusFour]);
    } catch (error) {
      throw locationRefusal(error) ?? error;
    }
    // Queued once the save has committed, so the plan it starts reads the saved location (a job sent inside the
    // transaction could run first, plan with the old one and spend its request's key).
    afterCommit(() => services.queue.enqueue('monitor', { practice_id: practiceId, request_id: request.requestId }));
    return { objectId: practiceId, redirect: `${pricingSettingsPath(practiceId)}?notice=saved` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: () => ({ zip: '00011' }) },
});

/**
 * Confirms the location the page showed (Getting started's "Confirm your billing ZIP"): a location the platform
 * administrator entered, or changed, waits for a person of the practice to confirm it. The form carries the ZIP and
 * ZIP+4 its page showed, and only that location is confirmed: one changed since the page loaded (by the console, or by
 * a change that commits while the confirmation waits on it) is refused here and again in Postgres, which compares it
 * with the location locked (practice_site_changed), and the page is read again with LOCATION_CHANGED (verification of
 * PR 6b-2, finding 1). The role check here and in Postgres: practice_confirm_location() refuses anyone but a person
 * outside the platform's staff who holds pricing_settings.set in the active practice (42501), and a location that
 * still asks the customer for something (practice_site_settled), and records the confirmation on the location, which
 * everyone who opens the practice reads (review of PR 6b-2, findings 1, 8 and 9). Audited as pricing_location_confirmed;
 * a refusal confirms and audits nothing.
 */
export const confirmPricingLocationAction = practiceRoute({
  id: 'practice.settings.pricing_confirm',
  kind: 'action',
  path: '/p/[practiceId]/settings/pricing',
  phi: true,
  permission: 'pricing_settings.set',
  params: practiceParams,
  input: z.object({
    confirm: z.literal('on', { message: 'confirm the billing ZIP above' }),
    // The location the page showed: its ZIP, and its ZIP+4 (blank for none).
    shownZip: z.string().regex(/^[0-9]{5}$/, 'five digits'),
    shownZipPlusFour: optionalText(z.string().regex(/^[0-9]{4}$/, 'four digits')).transform((value) => value ?? null),
  }),
  audit: { action: 'pricing_location_confirmed', objectType: 'practice' },
  handle: async ({ scope, practiceId, input }): Promise<MutationResult> => {
    const { location, reading } = await practiceLocationReading(scope.client, practiceId);
    if (location === null) {
      throw new InputError([{ field: 'zip', message: 'add the billing ZIP first' }]);
    }
    if (location.zip !== input.shownZip || location.zipPlusFour !== input.shownZipPlusFour) {
      throw new InputError([LOCATION_CHANGED_ISSUE]);
    }
    // A location that still asks the customer for something (its ZIP+4, a ZIP or ZIP+4 Medicare's list lacks) is not
    // confirmed as it stands: the status says what to do first.
    if (!locationSettled(reading)) {
      throw new InputError([{ field: 'zip', message: reading.text }]);
    }
    try {
      await scope.client.query('SELECT practice_confirm_location($1, $2, $3)', [practiceId, input.shownZip, input.shownZipPlusFour]);
    } catch (error) {
      // practice_site_changed: a change that committed while the confirmation waited on the location's lock.
      throw locationRefusal(error) ?? error;
    }
    return { objectId: practiceId, redirect: `${pricingSettingsPath(practiceId)}?notice=confirmed` };
  },
  // The synthetic world's practice is created at 00011, with no ZIP+4.
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: () => ({ confirm: 'on', shownZip: '00011', shownZipPlusFour: '' }) },
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
  /**
   * When the invitation's email was reported undelivered (bounced, suppressed, rejected or complained; docs/adr/0065,
   * D10), or null. Only while that report is about the email last sent (at or after sent_at less 5 seconds, the clock
   * skew between SES and the database), so a late report of an earlier email never flags a resent one.
   */
  readonly undeliveredAt: Date | null;
  /**
   * Why, beside undeliveredAt: 'complained' when the email reached the person and was reported as spam (SES then holds
   * the address back from the transactional stream, so one sent again does not reach them), else 'undelivered'
   * (bounced, held back by SES's suppression list, or rejected); null with undeliveredAt.
   */
  readonly undeliveredReason: 'complained' | 'undelivered' | null;
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
    const invitations = await scope.client.query<{
      id: string;
      email: string;
      role: MembershipRole;
      sent_at: Date;
      expires_at: Date;
      sends: number;
      accepted_at: Date | null;
      expired: boolean;
      undelivered_at: Date | null;
      undelivered_reason: string | null;
    }>(
      `SELECT i.id, u.email, m.role, i.sent_at, i.expires_at, i.sends, i.accepted_at, (i.accepted_at IS NULL AND i.expires_at <= now()) AS expired,
              CASE WHEN i.accepted_at IS NULL AND i.undelivered_at >= i.sent_at - interval '5 seconds' THEN i.undelivered_at END AS undelivered_at,
              CASE WHEN i.accepted_at IS NULL AND i.undelivered_at >= i.sent_at - interval '5 seconds' THEN i.undelivered_reason END AS undelivered_reason
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
        (row): InvitationView => ({
          id: row.id,
          email: row.email,
          role: row.role,
          sentAt: row.sent_at,
          expiresAt: row.expires_at,
          sends: row.sends,
          acceptedAt: row.accepted_at,
          expired: row.expired,
          undeliveredAt: row.undelivered_at,
          undeliveredReason: row.undelivered_at === null ? null : row.undelivered_reason === 'complained' ? 'complained' : 'undelivered',
        }),
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
 * the membership, and the invitation the database writes with its seven days. A person who already has an account,
 * in this organization or any other, joins through a platform administrator (docs/adr/0055): the database answers
 * whether the address is in use, yes or no, before the identity provider is called, and the screen says the same
 * for every such address, so it never tells an organization that another one knows a person.
 */
export const EMAIL_IN_USE = 'this address cannot be invited from here; if the person is a member already, change their role below, otherwise a platform administrator adds them';
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
    const inUse = (await scope.client.query<{ in_use: boolean }>('SELECT invitation_email_in_use($1, $2) AS in_use', [organizationId, input.email])).rows[0]?.in_use;
    if (inUse !== false) {
      throw new InputError([{ field: 'email', message: EMAIL_IN_USE }]);
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
        // An account made for the address since the check above: the same answer as any address in use.
        await scope.client.query('ROLLBACK TO SAVEPOINT invite');
        throw new InputError([{ field: 'email', message: EMAIL_IN_USE }]);
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
  correspondenceSettingsPage,
  setCorrespondenceContactAction,
  pricingSettingsPage,
  setPricingLocationAction,
  confirmPricingLocationAction,
  accessLogPage,
  dataSettingsPage,
  usersSettingsPage,
  inviteUserAction,
  changeRoleAction,
  endMembershipAction,
  resendInvitationAction,
] as const;
