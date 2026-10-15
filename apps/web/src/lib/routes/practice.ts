import { readWithAudit, rolesPermit } from '@tp/db/runtime';
import { z } from 'zod';

import { practiceRoute } from '../http/invoke';
import { NotFoundError } from '../http/route';
import { opaqueId } from './schemas';

/**
 * The practice workspace (PRD 7, Customer workspace). In this milestone its home shows the practice
 * record, its agreement chain and, for its administrators, the support (break-glass) grants on it
 * with the list of records each one read (PRD 5, J15: the practice administrator's notice links
 * here). Every read of the practice record goes through readWithAudit, so a support engineer's view
 * of it appears in that list.
 */

interface PracticeRecord {
  readonly id: string;
  readonly practiceId: string;
  readonly name: string;
  readonly npi: string | null;
  readonly taxIdLast4: string | null;
  readonly zip: string | null;
  readonly localityCode: string | null;
  readonly status: string;
}

export interface AgreementSummary {
  readonly id: string;
  readonly kind: string;
  readonly version: string;
  readonly signer: string;
  readonly signedAt: Date;
  readonly sha256: string;
  readonly documentRef: string;
}

export interface SupportGrantSummary {
  readonly id: string;
  readonly ticket: string;
  readonly reason: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly notifiedAt: Date | null;
  readonly open: boolean;
}

const SUPPORT_GRANT_COLUMNS = `id, ticket, reason, created_at, expires_at, notified_at, (now() < expires_at AND now() < created_at + interval '4 hours') AS open`;

interface SupportGrantRow {
  readonly id: string;
  readonly ticket: string;
  readonly reason: string;
  readonly created_at: Date;
  readonly expires_at: Date;
  readonly notified_at: Date | null;
  readonly open: boolean;
}

function supportGrant(row: SupportGrantRow): SupportGrantSummary {
  return { id: row.id, ticket: row.ticket, reason: row.reason, createdAt: row.created_at, expiresAt: row.expires_at, notifiedAt: row.notified_at, open: row.open };
}

export const practiceHome = practiceRoute({
  id: 'practice.home',
  kind: 'page',
  path: '/p/[practiceId]',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId }),
  handle: async ({ scope, practiceId, access, request }) => {
    const [practice] = await readWithAudit(
      scope,
      { objectType: 'practice', purpose: 'workspace', requestId: request.requestId },
      async (client) =>
        (
          await client.query<PracticeRecord>(
            'SELECT id, id AS "practiceId", name, npi, tax_id_last4 AS "taxIdLast4", zip, locality_code AS "localityCode", status FROM practice WHERE id = $1',
            [practiceId],
          )
        ).rows,
      (row) => ({ objectId: row.id, practiceId: row.practiceId }),
    );
    if (practice === undefined) {
      throw new NotFoundError();
    }
    const agreements = await scope.client.query<{ id: string; kind: string; version: string; signer: string; signed_at: Date; sha256: string; document_ref: string }>(
      'SELECT id, kind, version, signer, signed_at, sha256, document_ref FROM agreement WHERE practice_id = $1 ORDER BY signed_at DESC, id',
      [practiceId],
    );
    const administers = rolesPermit(access.roles, 'access_log.read');
    const supportGrants = administers
      ? (await scope.client.query<SupportGrantRow>(`SELECT ${SUPPORT_GRANT_COLUMNS} FROM support_grant WHERE practice_id = $1 ORDER BY created_at DESC, id LIMIT 20`, [practiceId])).rows.map(supportGrant)
      : null;
    return {
      practice: { id: practice.id, name: practice.name, npi: practice.npi, taxIdLast4: practice.taxIdLast4, zip: practice.zip, localityCode: practice.localityCode, status: practice.status },
      agreements: agreements.rows.map(
        (row): AgreementSummary => ({ id: row.id, kind: row.kind, version: row.version, signer: row.signer, signedAt: row.signed_at, sha256: row.sha256, documentRef: row.document_ref }),
      ),
      access: { via: access.via, roles: access.roles },
      supportGrants,
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

export interface RecordRead {
  readonly objectType: string;
  readonly objectId: string | null;
  readonly purpose: string | null;
  readonly at: Date;
}

export const supportAccessPage = practiceRoute({
  id: 'practice.support_access',
  kind: 'page',
  path: '/p/[practiceId]/support-access/[supportGrantId]',
  phi: true,
  permission: 'access_log.read',
  params: z.object({ practiceId: opaqueId, supportGrantId: opaqueId }),
  handle: async ({ scope, params, practiceId }) => {
    const { rows } = await scope.client.query<SupportGrantRow>(`SELECT ${SUPPORT_GRANT_COLUMNS} FROM support_grant WHERE id = $1 AND practice_id = $2`, [params.supportGrantId, practiceId]);
    const [grant] = rows;
    if (grant === undefined) {
      throw new NotFoundError();
    }
    // The practice's access log (audit_event, readable by its administrators inside its scope).
    const reads = await scope.client.query<{ object_type: string; object_id: string | null; purpose: string | null; at: Date }>(
      "SELECT object_type, object_id, purpose, at FROM audit_event WHERE grant_id = $1 AND practice_id = $2 AND action = 'read' ORDER BY at, id",
      [params.supportGrantId, practiceId],
    );
    return {
      grant: supportGrant(grant),
      reads: reads.rows.map((row): RecordRead => ({ objectType: row.object_type, objectId: row.object_id, purpose: row.purpose, at: row.at })),
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, supportGrantId: refs.supportGrantId }) },
});

export const PRACTICE_ROUTES = [practiceHome, supportAccessPage] as const;
