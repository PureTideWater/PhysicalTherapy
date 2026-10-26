import { randomUUID } from 'node:crypto';

import {
  AGREEMENT_KINDS,
  OFFERED_DECLINED_REASONS,
  PROSPECT_STATUSES,
  type ProspectBillingArrangement,
  type ProspectDeclinedReason,
  type ProspectStatus,
} from '@tp/db/runtime';
import { z } from 'zod';

import { AgreementDocumentError, agreementDocumentKey, isPdf, readAgreementUpload } from '../agreements/documents';
import { platformRoute } from '../http/invoke';
import { InputError, type MutationResult, NotFoundError } from '../http/route';
import { opaqueId, optionalText, requiredText } from './schemas';

/**
 * The internal console's part of onboarding (PRD 5, J1: "The platform administrator creates the organization and
 * the practice, and sends the practice administrator invitation"; PRD 6, Agreements; PRD 7, Internal console:
 * organizations, practices and agreements; docs/adr/0053). Platform routes, no practice in scope:
 *
 * - Prospect requests (/console/prospects): the audit requests the public form received, marked contacted or
 *   declined (with the reason, from a closed list: audit #57, the founder's ruling of 2026-10-20), or converted into a
 *   new practice group named after the request.
 * - Invitations, sent again from the organization's page (Cognito's resend; the local outbox in development).
 * - A signed agreement recorded by upload: the server hashes the PDF it receives and keeps it under an opaque key
 *   (the e-signature vendor's webhook records the others; the console's existing form records one by reference).
 * - The terms of use by version (/console/terms): published by reference and SHA-256; every customer accepts the
 *   version in force before anything else.
 */

const PROSPECTS_PER_PAGE = 50;

/** Why a request was declined, as the console offers it (decision 9; not_recorded is a past decline's, never offered). */
export const DECLINED_REASON_LABELS: Readonly<Record<ProspectDeclinedReason, string>> = {
  no_response: 'Stopped responding',
  not_now: 'Not now',
  price: 'Price',
  too_little_to_recover: 'Too little to recover',
  chose_other: 'Chose another vendor or their billing firm',
  doing_it_themselves: 'Doing it themselves',
  data_unavailable: 'Could not provide remittances or contracts',
  compliance_declined: 'Their compliance or security review said no',
  not_a_fit: 'Not a fit',
  not_a_prospect: 'Not a prospect (spam, vendor, student or duplicate)',
  other: 'Other',
  not_recorded: 'Not recorded',
};

export interface ProspectView {
  readonly id: string;
  readonly contactName: string;
  readonly contactEmail: string;
  readonly organizationName: string;
  readonly locations: number;
  readonly payers: readonly string[];
  readonly billingArrangement: ProspectBillingArrangement;
  readonly status: ProspectStatus;
  readonly organizationId: string | null;
  readonly createdAt: Date;
  readonly reviewedAt: Date | null;
  /** Why it was declined; null unless declined. */
  readonly declinedReason: ProspectDeclinedReason | null;
}

export const prospectsPage = platformRoute({
  id: 'console.prospects',
  kind: 'page',
  path: '/console/prospects',
  phi: false,
  permission: 'organization.manage',
  params: z.object({ status: z.enum([...PROSPECT_STATUSES, 'all']).default('new').catch('new'), page: z.coerce.number().int().min(1).max(100_000).default(1).catch(1) }),
  handle: async ({ scope, params }) => {
    const filter = params.status === 'all' ? null : params.status;
    const { rows } = await scope.client.query<{
      id: string;
      contact_name: string;
      contact_email: string;
      organization_name: string;
      locations: number;
      payers: string[];
      billing_arrangement: ProspectBillingArrangement;
      status: ProspectStatus;
      organization_id: string | null;
      created_at: Date;
      reviewed_at: Date | null;
      declined_reason: ProspectDeclinedReason | null;
      total: string;
    }>(
      `SELECT *, count(*) OVER () AS total FROM prospect_request WHERE ($1::text IS NULL OR status = $1)
        ORDER BY created_at DESC, id LIMIT $2 OFFSET $3`,
      [filter, PROSPECTS_PER_PAGE, (params.page - 1) * PROSPECTS_PER_PAGE],
    );
    const total = Number.parseInt(rows[0]?.total ?? '0', 10);
    return {
      status: params.status,
      page: params.page,
      pages: Math.max(1, Math.ceil(total / PROSPECTS_PER_PAGE)),
      total,
      prospects: rows.map(
        (row): ProspectView => ({
          id: row.id,
          contactName: row.contact_name,
          contactEmail: row.contact_email,
          organizationName: row.organization_name,
          locations: row.locations,
          payers: row.payers,
          billingArrangement: row.billing_arrangement,
          status: row.status,
          organizationId: row.organization_id,
          createdAt: row.created_at,
          reviewedAt: row.reviewed_at,
          declinedReason: row.declined_reason,
        }),
      ),
      declinedReasons: OFFERED_DECLINED_REASONS.map((value) => ({ value, label: DECLINED_REASON_LABELS[value] })),
    };
  },
  sample: { params: () => ({}) },
});

export const reviewProspect = platformRoute({
  id: 'console.prospect_review',
  kind: 'action',
  path: '/console/prospects',
  phi: false,
  permission: 'organization.manage',
  params: z.object({}),
  input: z.object({
    prospectId: opaqueId,
    status: z.enum(['contacted', 'declined']),
    // Required when declining, and only then; blank is none.
    declinedReason: z.preprocess((value) => (value === '' ? undefined : value), z.enum(OFFERED_DECLINED_REASONS, { message: 'choose why the request was declined' }).optional()),
  }),
  audit: { action: 'prospect_reviewed', objectType: 'prospect_request' },
  handle: async ({ scope, input }): Promise<MutationResult> => {
    if (input.status === 'declined' && input.declinedReason === undefined) {
      throw new InputError([{ field: 'declinedReason', message: 'choose why the request was declined' }]);
    }
    if (input.status === 'contacted' && input.declinedReason !== undefined) {
      throw new InputError([{ field: 'declinedReason', message: 'a reason is given only when declining' }]);
    }
    const { rowCount } = await scope.client.query(
      "UPDATE prospect_request SET status = $2, declined_reason = $3, reviewed_by = app_actor_id() WHERE id = $1 AND status IN ('new', 'contacted')",
      [input.prospectId, input.status, input.declinedReason ?? null],
    );
    if (rowCount !== 1) {
      throw new NotFoundError();
    }
    return { objectId: input.prospectId, redirect: '/console/prospects' };
  },
  sample: { params: () => ({}), input: (refs) => ({ prospectId: refs.prospectId, status: 'contacted' }) },
});

/** Converts a request into its practice group (J1): the organization named as the request named it, then its practice and invitation. */
export const convertProspect = platformRoute({
  id: 'console.prospect_convert',
  kind: 'action',
  path: '/console/prospects',
  phi: false,
  permission: 'organization.manage',
  params: z.object({}),
  input: z.object({ prospectId: opaqueId }),
  audit: { action: 'prospect_converted', objectType: 'organization' },
  handle: async ({ scope, input }): Promise<MutationResult> => {
    const prospect = (
      await scope.client.query<{ organization_name: string }>("SELECT organization_name FROM prospect_request WHERE id = $1 AND status IN ('new', 'contacted') FOR UPDATE", [input.prospectId])
    ).rows[0];
    if (prospect === undefined) {
      throw new NotFoundError();
    }
    const organizationId = randomUUID();
    await scope.client.query("INSERT INTO organization (id, kind, name) VALUES ($1, 'group', $2)", [organizationId, prospect.organization_name]);
    await scope.client.query("UPDATE prospect_request SET status = 'converted', organization_id = $2, reviewed_by = app_actor_id() WHERE id = $1", [input.prospectId, organizationId]);
    return { objectId: organizationId, redirect: `/console/organizations/${organizationId}` };
  },
  sample: { params: () => ({}), input: (refs) => ({ prospectId: refs.prospectId }) },
});

export const resendInvitationFromConsole = platformRoute({
  id: 'console.resend_invitation',
  kind: 'action',
  path: '/console/organizations/[organizationId]',
  phi: false,
  permission: 'organization.manage',
  params: z.object({}),
  input: z.object({ organizationId: opaqueId, invitationId: opaqueId }),
  audit: { action: 'invitation_resent', objectType: 'invitation' },
  handle: async ({ scope, input, services }): Promise<MutationResult> => {
    const invitation = (
      await scope.client.query<{ email: string }>('SELECT u.email FROM invitation i JOIN "user" u ON u.id = i.user_id WHERE i.id = $1 AND i.organization_id = $2', [
        input.invitationId,
        input.organizationId,
      ])
    ).rows[0];
    if (invitation === undefined) {
      throw new NotFoundError();
    }
    const resent = (await scope.client.query<{ resent: boolean }>('SELECT resend_invitation($1) AS resent', [input.invitationId])).rows[0]?.resent === true;
    if (!resent) {
      throw new InputError([{ field: 'invitationId', message: 'this invitation was accepted, or its membership has ended' }]);
    }
    await services.provider.resendInvitation(invitation.email);
    return { objectId: input.invitationId, redirect: `/console/organizations/${input.organizationId}` };
  },
  sample: { params: () => ({}), input: (refs) => ({ organizationId: refs.organizationId, invitationId: refs.invitationId }) },
});

/** A signed agreement uploaded as a PDF: hashed here, kept under an opaque key, recorded by reference and SHA-256. */
export const uploadAgreement = platformRoute({
  id: 'console.upload_agreement',
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
  }),
  audit: { action: 'agreement_recorded', objectType: 'agreement' },
  handle: async ({ scope, input, request, services }): Promise<MutationResult> => {
    if (request.upload === undefined) {
      throw new InputError([{ field: 'document', message: 'choose the signed PDF' }]);
    }
    let read;
    try {
      read = await readAgreementUpload(request.upload.body);
    } catch (error) {
      if (error instanceof AgreementDocumentError) {
        throw new InputError([{ field: 'document', message: error.message }]);
      }
      throw error;
    }
    if (!isPdf(read.bytes)) {
      throw new InputError([{ field: 'document', message: 'a signed agreement is a PDF' }]);
    }
    const id = randomUUID();
    const key = agreementDocumentKey(input.organizationId, id);
    await scope.client.query(
      `INSERT INTO agreement (id, organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
       VALUES ($1, $2, $3, $4, $5, $6::date::timestamptz, $7, $8, $9)`,
      [id, input.organizationId, input.practiceId ?? null, input.kind, input.version, input.signedOn, input.signer, `upload:${key}`, read.sha256],
    );
    // Written after the row, in the same request: a refused row writes nothing; a failed write rolls the row back.
    await services.agreementDocuments.putNew(key, read.bytes);
    return { objectId: id, redirect: `/console/organizations/${input.organizationId}` };
  },
  sample: {
    params: () => ({}),
    input: (refs) => ({ organizationId: refs.organizationId, practiceId: refs.practiceId, kind: 'baa', version: '2', signer: 'SYNTHETIC SIGNER', signedOn: '2026-10-01' }),
    upload: () => ({ contentType: 'application/pdf', body: new TextEncoder().encode('%PDF-1.4\n% SYNTHETIC SIGNED AGREEMENT\n%%EOF\n') }),
  },
});

export interface TermsVersionRow {
  readonly id: string;
  readonly version: string;
  readonly documentRef: string;
  readonly sha256: string;
  readonly publishedAt: Date;
  readonly inForce: boolean;
  readonly acceptances: number;
}

export const consoleTermsPage = platformRoute({
  id: 'console.terms',
  kind: 'page',
  path: '/console/terms',
  phi: false,
  permission: 'agreement.record',
  params: z.object({}),
  handle: async ({ scope }) => {
    const { rows } = await scope.client.query<{ id: string; version: string; document_ref: string; sha256: string; published_at: Date; in_force: boolean; acceptances: string }>(
      `SELECT t.id, t.version, t.document_ref, t.sha256, t.published_at, t.id = current_terms_version() AS in_force,
              (SELECT count(*) FROM terms_acceptance a WHERE a.terms_version_id = t.id) AS acceptances
         FROM terms_version t ORDER BY t.published_at DESC, t.id DESC LIMIT 50`,
    );
    return {
      versions: rows.map(
        (row): TermsVersionRow => ({
          id: row.id,
          version: row.version,
          documentRef: row.document_ref,
          sha256: row.sha256,
          publishedAt: row.published_at,
          inForce: row.in_force,
          acceptances: Number.parseInt(row.acceptances, 10),
        }),
      ),
    };
  },
  sample: { params: () => ({}) },
});

/**
 * Publishes a new version of the terms of use, by reference and SHA-256; from now on every customer accepts it
 * before anything else (the route wrapper's terms gate).
 */
export const publishTerms = platformRoute({
  id: 'console.publish_terms',
  kind: 'action',
  path: '/console/terms',
  phi: false,
  permission: 'agreement.record',
  params: z.object({}),
  input: z.object({
    version: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._-]{1,40}$/, 'use only letters, digits, dots, underscores and hyphens, such as 2026-11'),
    documentRef: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9:/._-]{1,200}$/, 'the document’s reference (letters, digits and : / . _ -)'),
    sha256: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[0-9a-f]{64}$/, 'the document’s SHA-256, 64 hexadecimal characters'),
  }),
  audit: { action: 'terms_published', objectType: 'terms_version' },
  handle: async ({ scope, input }): Promise<MutationResult> => {
    const id = randomUUID();
    try {
      await scope.client.query('INSERT INTO terms_version (id, version, document_ref, sha256, published_by) VALUES ($1, $2, $3, $4, app_actor_id())', [id, input.version, input.documentRef, input.sha256]);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        throw new InputError([{ field: 'version', message: 'that version is published already' }]);
      }
      throw error;
    }
    return { objectId: id, redirect: '/console/terms' };
  },
  sample: { params: () => ({}), input: (refs) => ({ version: `synthetic-${refs.practiceId.slice(0, 8)}`, documentRef: 'terms/synthetic-next', sha256: 'b'.repeat(64) }) },
});

export const CONSOLE_ONBOARDING_ROUTES = [prospectsPage, reviewProspect, convertProspect, resendInvitationFromConsole, uploadAgreement, consoleTermsPage, publishTerms] as const;
