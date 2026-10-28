import { createHash } from 'node:crypto';

import { ESIGN_ROLE, PROSPECT_BILLING_ARRANGEMENTS, PROSPECT_SOURCES, type ProspectBillingArrangement, type ProspectSource } from '@tp/db/runtime';
import { textPhiFindings } from '@tp/observability';
import { z } from 'zod';

import { ESIGN_SIGNATURE_HEADER, ESignatureError } from '../agreements/esign';
import { attributionValues, readAttribution } from '../http/attribution';
import { publicRoute, selfRoute } from '../http/invoke';
import { InputError, type MutationResult } from '../http/route';
import { emailAddress, opaqueId, optionalText, requiredText } from './schemas';

/**
 * Customer onboarding's own routes (PRD 5, J1 and J2; milestone 11; docs/adr/0053):
 *
 * - The audit request (/request-audit): public, no PHI by design ("name, organization, locations, payers, billing
 *   arrangement"), each text screened for identifier shapes before it is kept, counted per address against the
 *   public form's rate limit, written only through submit_prospect_request(). The founder scopes it on a call; a
 *   platform administrator then creates the organization from it in the console. Beside it the request keeps how the
 *   requester heard of us (a closed list, optional), a referring firm (optional, screened as the other texts are) and
 *   the first-party attribution cookie's campaign codes and kind of paid click, read here on the server (audit #57;
 *   src/lib/http/attribution.ts).
 * - The e-signature vendor's webhook (/api/agreements/webhook): public, verified by the vendor's signature before
 *   anything in it is read; the signed document is fetched from the vendor and hashed here; the agreement is
 *   recorded once per event by record_esigned_agreement(), by reference and SHA-256.
 * - The terms of use (/terms): the version in force, its document's reference and hash, and the customer's
 *   acceptance with its time (terms_acceptance); a customer who has not accepted the version in force is sent here
 *   by the route wrapper first, and again whenever a new version is published.
 */

/** The fields a request names, screened for what looks like a patient's identifier. */
function screened(field: string, text: string): string {
  if (textPhiFindings(text).length > 0) {
    throw new InputError([{ field, message: 'this form takes no patient information: remove anything that looks like an identifier, a date or a phone number, then send it again' }]);
  }
  return text;
}

const payerList = z
  .string()
  .max(6000, 'at most 6,000 characters')
  .transform((text) =>
    text
      .split(/[\n,;]+/)
      .map((name) => name.trim())
      .filter((name) => name !== ''),
  )
  .pipe(z.array(z.string().max(120, 'each payer name at most 120 characters')).min(1, 'name at least one payer').max(50, 'at most 50 payers'));

export const BILLING_ARRANGEMENT_LABELS: Readonly<Record<ProspectBillingArrangement, string>> = {
  in_house: 'We bill in house',
  billing_firm: 'A billing firm bills for us',
  mixed: 'Some in house, some through a firm',
  other: 'Something else',
};

/** "How did you hear about us?", as the screening and the audit request offer it (the founder's ruling of 2026-10-20, decision 8). */
export const PROSPECT_SOURCE_LABELS: Readonly<Record<ProspectSource, string>> = {
  search: 'A search engine',
  billing_firm: 'My billing firm',
  colleague: 'A colleague or another practice',
  association: 'A professional association (APTA, AOTA, ASHA or a state chapter)',
  event: 'A conference, webinar or event',
  social: 'LinkedIn or other social media',
  paidwhole_email: 'An email from PaidWhole',
  article: 'An article, newsletter or podcast',
  other: 'Something else',
};

/** The select's options: blank (no answer) first, then the list in its order. */
export const PROSPECT_SOURCE_OPTIONS: readonly { readonly value: string; readonly label: string }[] = [
  { value: '', label: 'Choose one (optional)' },
  ...PROSPECT_SOURCES.map((value) => ({ value, label: PROSPECT_SOURCE_LABELS[value] })),
];

/** The referring firm as the form sent it: blank is none; at most 200 characters, and no identifier shapes. */
function referringFirm(text: string | undefined): string | null {
  const value = (text ?? '').trim().replace(/\s+/g, ' ');
  if (value === '') {
    return null;
  }
  if (value.length > 200) {
    throw new InputError([{ field: 'referringFirm', message: 'the firm’s name, at most 200 characters' }]);
  }
  return screened('referringFirm', value);
}

export const requestAuditPage = publicRoute({
  id: 'public.request_audit_page',
  kind: 'page',
  path: '/request-audit',
  phi: false,
  params: z.object({ sent: optionalText(z.literal('1')) }),
  handle: ({ params }) =>
    Promise.resolve({
      sent: params.sent !== undefined,
      arrangements: PROSPECT_BILLING_ARRANGEMENTS.map((value) => ({ value, label: BILLING_ARRANGEMENT_LABELS[value] })),
      sources: PROSPECT_SOURCE_OPTIONS,
    }),
});

export const requestAudit = publicRoute({
  id: 'public.request_audit',
  kind: 'action',
  path: '/request-audit',
  phi: false,
  rateLimit: 'public_form',
  params: z.object({}),
  input: z.object({
    contactName: requiredText(200),
    contactEmail: emailAddress,
    organizationName: requiredText(200),
    locations: z.coerce.number({ message: 'a whole number' }).int('a whole number').min(1, 'at least 1').max(1000, 'at most 1,000'),
    payers: payerList,
    billingArrangement: z.enum(PROSPECT_BILLING_ARRANGEMENTS, { message: 'choose how you bill' }),
    // Optional: blank is no answer.
    heardFrom: z.preprocess((value) => (value === '' ? undefined : value), z.enum(PROSPECT_SOURCES, { message: 'choose one of the listed answers, or leave it blank' }).optional()),
    referringFirm: z.string().max(400, 'enter at most 200 characters').optional(),
  }),
  handle: async ({ input, services, request }): Promise<MutationResult> => {
    const contact = screened('contactName', input.contactName);
    const organization = screened('organizationName', input.organizationName);
    const payers = input.payers.map((name) => screened('payers', name));
    const firm = referringFirm(input.referringFirm);
    const client = await services.pool.connect();
    try {
      await client.query('SELECT submit_prospect_request($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)', [
        contact,
        input.contactEmail,
        organization,
        input.locations,
        payers,
        input.billingArrangement,
        input.heardFrom ?? null,
        ...attributionValues(readAttribution(request.cookies, services.environment)),
        firm,
      ]);
    } finally {
      client.release();
    }
    return { redirect: '/request-audit?sent=1' };
  },
});

/** The most an e-signature event may be. */
export const ESIGN_WEBHOOK_MAX_BYTES = 256_000;

export const agreementWebhook = publicRoute({
  id: 'agreements.webhook',
  kind: 'handler',
  method: 'POST',
  path: '/api/agreements/webhook',
  phi: false,
  rateLimit: 'webhook',
  signedBySender: true,
  params: z.object({}),
  input: z.object({ payload: z.string().min(1).max(ESIGN_WEBHOOK_MAX_BYTES), signature: z.string().max(2048).nullable() }),
  handle: async ({ input, services, request }) => {
    const vendor = services.esign;
    if (vendor === null) {
      throw new InputError([{ field: 'payload', message: 'no e-signature vendor is configured; agreements are recorded in the console' }]);
    }
    let envelope;
    let document;
    try {
      envelope = vendor.verifyEvent(input.payload, input.signature, services.now());
      document = await vendor.signedDocument(envelope.envelopeRef);
    } catch (error) {
      if (error instanceof ESignatureError) {
        throw new InputError([{ field: 'signature', message: 'the webhook did not verify, so nothing in it was read' }]);
      }
      throw error;
    }
    const sha256 = createHash('sha256').update(document).digest('hex');
    // The webhook's own login, as tp_esign, the one role that may record an e-signed agreement (docs/adr/0055).
    const pool = services.esignPool;
    if (pool === null) {
      throw new InputError([{ field: 'payload', message: 'no e-signature login is configured; agreements are recorded in the console' }]);
    }
    const client = await pool.connect();
    let open = false;
    try {
      await client.query('BEGIN');
      open = true;
      await client.query(`SET LOCAL ROLE ${ESIGN_ROLE}`);
      const { rows } = await client.query<{ agreement_id: string; duplicate: boolean }>('SELECT agreement_id, duplicate FROM record_esigned_agreement($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)', [
        envelope.eventId,
        envelope.envelopeRef,
        envelope.organizationId,
        envelope.practiceId,
        envelope.kind,
        envelope.version,
        envelope.signedAt,
        envelope.signer,
        sha256,
        request.requestId,
      ]);
      await client.query('COMMIT');
      open = false;
      return { received: true, outcome: rows[0]?.duplicate === true ? 'duplicate' : 'recorded' };
    } catch (error) {
      if (open) {
        await client.query('ROLLBACK');
      }
      if (typeof error === 'object' && error !== null && 'code' in error && (error.code === '23514' || error.code === '23503')) {
        throw new InputError([{ field: 'payload', message: (error as unknown as Error).message }]);
      }
      throw error;
    } finally {
      client.release();
    }
  },
  sample: { params: () => ({}), input: () => ({ payload: '{"format":"tp-esign-event/1"}', signature: `t=1,v1=${'0'.repeat(64)}` }) },
});

/** The header the webhook's signature arrives in (its route.ts reads it). */
export { ESIGN_SIGNATURE_HEADER };

export interface TermsVersionView {
  readonly id: string;
  readonly version: string;
  readonly documentRef: string;
  readonly sha256: string;
  readonly publishedAt: Date;
}

export interface TermsPageData {
  readonly current: TermsVersionView | null;
  readonly acceptedCurrentAt: Date | null;
  readonly history: readonly { readonly version: string; readonly acceptedAt: Date }[];
  /** Internal staff work under the workforce policies, not the customers' terms. */
  readonly internal: boolean;
}

export const termsPage = selfRoute({
  id: 'terms.page',
  kind: 'page',
  path: '/terms',
  phi: false,
  termsExempt: true,
  params: z.object({}),
  handle: async ({ scope, platformRoles }): Promise<TermsPageData> => {
    const current = (
      await scope.client.query<{ id: string; version: string; document_ref: string; sha256: string; published_at: Date }>(
        'SELECT id, version, document_ref, sha256, published_at FROM terms_version WHERE id = current_terms_version()',
      )
    ).rows[0];
    const history = await scope.client.query<{ terms_version_id: string; version: string; accepted_at: Date }>(
      `SELECT a.terms_version_id, t.version, a.accepted_at FROM terms_acceptance a JOIN terms_version t ON t.id = a.terms_version_id
        WHERE a.user_id = app_actor_id() ORDER BY a.accepted_at DESC, a.id`,
    );
    return {
      current: current === undefined ? null : { id: current.id, version: current.version, documentRef: current.document_ref, sha256: current.sha256, publishedAt: current.published_at },
      acceptedCurrentAt: history.rows.find((row) => row.terms_version_id === current?.id)?.accepted_at ?? null,
      history: history.rows.map((row) => ({ version: row.version, acceptedAt: row.accepted_at })),
      internal: platformRoles.length > 0,
    };
  },
  sample: { params: () => ({}) },
});

export const acceptTerms = selfRoute({
  id: 'terms.accept',
  kind: 'action',
  path: '/terms',
  phi: false,
  termsExempt: true,
  params: z.object({}),
  input: z.object({ termsVersionId: opaqueId }),
  audit: { action: 'terms_accepted', objectType: 'terms_version' },
  handle: async ({ scope, input, request }): Promise<MutationResult> => {
    const current = (await scope.client.query<{ id: string | null }>('SELECT current_terms_version() AS id')).rows[0]?.id ?? null;
    if (current === null || current !== input.termsVersionId) {
      // The page showed a version no longer in force: show the one that is.
      throw new InputError([{ field: 'termsVersionId', message: 'a newer version of the terms is in force; read it and accept that one' }]);
    }
    await scope.client.query('INSERT INTO terms_acceptance (user_id, terms_version_id, request_id) VALUES (app_actor_id(), $1, $2) ON CONFLICT ON CONSTRAINT terms_acceptance_once DO NOTHING', [
      current,
      request.requestId,
    ]);
    return { objectId: current, redirect: '/' };
  },
  sample: { params: () => ({}), input: (refs) => ({ termsVersionId: refs.termsVersionId }) },
});

export const ONBOARDING_ROUTES = [requestAuditPage, requestAudit, agreementWebhook, termsPage, acceptTerms] as const;
