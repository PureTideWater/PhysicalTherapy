import {
  type Checklist,
  CompliancePlatformError,
  type EvidenceRecord,
  POLICIES,
  type PersonRecordKind,
  type RestoreDrillRow,
  buildExport,
  evaluateChecklist,
  exportFileName,
  policyApprovalSubject,
  serializeExport,
  utcDate,
} from '@tp/compliance';
import { COMPLIANCE_RECORD_KINDS } from '@tp/db/runtime';
import { z } from 'zod';

import { platformRoute } from '../http/invoke';
import { type Download, InputError, type MutationResult } from '../http/route';
import type { Services } from '../server/services';
import { opaqueId, optionalText } from './schemas';

/**
 * The SOC 2 Type I evidence checklist in the internal console (PRD 16, SOC 2 and HIPAA evidence; milestone 11;
 * docs/adr/0053), for platform administrators (compliance.manage):
 *
 * - /console/compliance: every control of PRD 16's table with its criteria and each evidence source's status,
 *   the policies and whether their current versions are approved, the program's own evidence (the risk analysis,
 *   the security official), and the records kept so far. Repository evidence is proved at build time
 *   (packages/compliance/src/controls.test.ts); what a person does is read live from compliance_record, the
 *   restore drill from restore_drill, and the workforce from compliance_workforce().
 * - Record evidence: a policy approved, an access review, a tabletop, a training and device attestation per
 *   workforce member, a vendor review, the risk analysis, the security official named. By reference and SHA-256
 *   (the document itself is kept where the program keeps its records); evidence is recorded for what has happened.
 *   The form offers the kinds compliance_record accepts; the quarterly review of merged pull requests is offered
 *   once a migration adds its kind (packages/compliance/src/controls.ts).
 * - The export ("tp-compliance-evidence/1"), downloaded as JSON or sent over CompliancePlatform. No PHI and no
 *   person's name is in it.
 */

const RECORD_LABELS: Readonly<Record<PersonRecordKind, string>> = {
  policy_approval: 'Policy approved by the security official',
  access_review: 'Quarterly access review',
  change_review: 'Quarterly review of merged pull requests',
  tabletop_exercise: 'Incident response tabletop',
  training_attestation: 'Training and device attestation',
  vendor_review: 'Quarterly vendor and data-flow review',
  risk_analysis: 'Risk analysis reviewed',
  security_official: 'Security official named',
};

/** The subject each kind of record carries when it is not a policy's version or a person. */
const FIXED_SUBJECTS: Readonly<Partial<Record<PersonRecordKind, string>>> = {
  access_review: 'quarterly-access-review',
  change_review: 'merged-pull-requests',
  tabletop_exercise: 'incident-response-tabletop',
  vendor_review: 'subprocessor-inventory',
  risk_analysis: 'risk-analysis',
};

export interface WorkforceMember {
  readonly userId: string;
  readonly email: string;
  readonly roles: readonly string[];
}

export interface RecordView extends EvidenceRecord {
  readonly id: string;
  readonly createdAt: Date;
}

export interface CompliancePageData {
  readonly checklist: Checklist;
  readonly workforce: readonly WorkforceMember[];
  readonly records: readonly RecordView[];
  readonly recordKinds: readonly { readonly value: PersonRecordKind; readonly label: string }[];
  readonly policies: readonly { readonly id: string; readonly title: string; readonly version: string; readonly file: string }[];
  readonly platformConnected: boolean;
  readonly sent: string | null;
}

interface Queryable {
  query<T extends object>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

async function readEvidence(client: Queryable, services: Services): Promise<{ checklist: Checklist; workforce: WorkforceMember[]; records: RecordView[] }> {
  const records = await client.query<{ id: string; kind: PersonRecordKind; subject: string; occurred_on: string; document_ref: string; sha256: string; created_at: Date }>(
    "SELECT id, kind, subject, to_char(occurred_on, 'YYYY-MM-DD') AS occurred_on, document_ref, sha256, created_at FROM compliance_record ORDER BY occurred_on DESC, created_at DESC, id",
  );
  const drills = await client.query<{ started_at: Date; completed_at: Date | null; outcome: string; catalog_problems: number | null }>(
    'SELECT started_at, completed_at, outcome, catalog_problems FROM console_restore_drills(12)',
  );
  const workforce = await client.query<{ user_id: string; email: string; roles: string[] }>('SELECT user_id, email, roles FROM compliance_workforce()');
  const views = records.rows.map((row): RecordView => ({ id: row.id, kind: row.kind, subject: row.subject, occurredOn: row.occurred_on, documentRef: row.document_ref, sha256: row.sha256, createdAt: row.created_at }));
  const checklist = evaluateChecklist({
    today: utcDate(services.now()),
    records: views,
    restoreDrills: drills.rows.map((row): RestoreDrillRow => ({ startedAt: row.started_at, completedAt: row.completed_at, outcome: row.outcome, catalogProblems: row.catalog_problems })),
    workforce: workforce.rows.map((row) => row.user_id),
  });
  return { checklist, workforce: workforce.rows.map((row) => ({ userId: row.user_id, email: row.email, roles: row.roles })), records: views };
}

export const compliancePage = platformRoute({
  id: 'console.compliance',
  kind: 'page',
  path: '/console/compliance',
  phi: false,
  permission: 'compliance.manage',
  params: z.object({ sent: optionalText(z.string().regex(/^[A-Za-z0-9:._-]{1,120}$/)).catch(undefined) }),
  handle: async ({ scope, services, params }): Promise<CompliancePageData> => {
    const evidence = await readEvidence(scope.client, services);
    return {
      ...evidence,
      recordKinds: COMPLIANCE_RECORD_KINDS.map((value) => ({ value, label: RECORD_LABELS[value] })),
      policies: POLICIES.map((policy) => ({ id: policy.id, title: policy.title, version: policy.version, file: policy.file })),
      platformConnected: services.compliancePlatform !== null,
      sent: params.sent ?? null,
    };
  },
  sample: { params: () => ({}) },
});

const isoDate = z.iso.date({ message: 'a date, YYYY-MM-DD' });

export const recordEvidence = platformRoute({
  id: 'console.compliance_record',
  kind: 'action',
  path: '/console/compliance',
  phi: false,
  permission: 'compliance.manage',
  params: z.object({}),
  input: z.object({
    kind: z.enum(COMPLIANCE_RECORD_KINDS, { message: 'choose what is recorded' }),
    policy: optionalText(z.enum(POLICIES.map((policy) => policy.id) as [string, ...string[]])),
    member: optionalText(opaqueId),
    occurredOn: isoDate,
    documentRef: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9:/._-]{1,200}$/, 'a reference of letters, digits and : / . _ - (where the record is kept, never a person’s name)'),
    sha256: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[0-9a-f]{64}$/, 'the document’s SHA-256, 64 hexadecimal characters'),
  }),
  audit: { action: 'compliance_evidence_recorded', objectType: 'compliance_record' },
  handle: async ({ scope, input, services }): Promise<MutationResult> => {
    if (input.occurredOn > utcDate(services.now())) {
      throw new InputError([{ field: 'occurredOn', message: 'the date is after today: enter the day it happened, today or earlier' }]);
    }
    let subject: string;
    if (input.kind === 'policy_approval') {
      const policy = POLICIES.find((candidate) => candidate.id === input.policy);
      if (policy === undefined) {
        throw new InputError([{ field: 'policy', message: 'choose the policy approved' }]);
      }
      subject = policyApprovalSubject(policy);
    } else if (input.kind === 'training_attestation' || input.kind === 'security_official') {
      const member = input.member;
      const { rows } = await scope.client.query<{ user_id: string }>('SELECT user_id FROM compliance_workforce() WHERE user_id = $1', [member ?? null]);
      if (member === undefined || rows.length === 0) {
        throw new InputError([{ field: 'member', message: 'choose a member of the internal workforce' }]);
      }
      subject = member;
    } else {
      subject = FIXED_SUBJECTS[input.kind] ?? input.kind;
    }
    const { rows } = await scope.client.query<{ id: string }>(
      'INSERT INTO compliance_record (kind, subject, occurred_on, document_ref, sha256, recorded_by) VALUES ($1, $2, $3, $4, $5, app_actor_id()) RETURNING id',
      [input.kind, subject, input.occurredOn, input.documentRef, input.sha256],
    );
    return { objectId: rows[0]?.id, redirect: '/console/compliance' };
  },
  sample: {
    params: () => ({}),
    input: () => ({ kind: 'policy_approval', policy: 'access-control', occurredOn: '2026-10-01', documentRef: 'records:policies/access-control-0.1-approval.pdf', sha256: 'c'.repeat(64) }),
  },
});

export const exportEvidence = platformRoute({
  id: 'console.compliance_export',
  kind: 'handler',
  method: 'GET',
  path: '/console/compliance/export',
  phi: false,
  rateLimit: 'export',
  permission: 'compliance.manage',
  params: z.object({}),
  handle: async ({ scope, services }): Promise<Download> => {
    const { checklist } = await readEvidence(scope.client, services);
    const evidence = buildExport(checklist, { environment: services.environment, generatedAt: services.now() });
    const { text, sha256 } = serializeExport(evidence);
    return { download: { filename: exportFileName(evidence, sha256), contentType: 'application/json; charset=utf-8', body: text } };
  },
  sample: { params: () => ({}) },
});

export const sendEvidence = platformRoute({
  id: 'console.compliance_send',
  kind: 'action',
  path: '/console/compliance',
  phi: false,
  rateLimit: 'export',
  permission: 'compliance.manage',
  params: z.object({}),
  input: z.object({}),
  audit: { action: 'compliance_evidence_sent', objectType: 'compliance_export' },
  handle: async ({ scope, services }): Promise<MutationResult> => {
    const platform = services.compliancePlatform;
    if (platform === null) {
      throw new InputError([{ field: 'platform', message: 'no compliance platform is connected yet: download the export and give it to the platform' }]);
    }
    const { checklist } = await readEvidence(scope.client, services);
    const evidence = buildExport(checklist, { environment: services.environment, generatedAt: services.now() });
    try {
      const receipt = await platform.send(evidence);
      return { redirect: `/console/compliance?sent=${encodeURIComponent(receipt.reference)}` };
    } catch (error) {
      if (error instanceof CompliancePlatformError) {
        throw new InputError([{ field: 'platform', message: error.message }]);
      }
      throw error;
    }
  },
  sample: { params: () => ({}), input: () => ({}) },
});

export const COMPLIANCE_ROUTES = [compliancePage, recordEvidence, exportEvidence, sendEvidence] as const;
