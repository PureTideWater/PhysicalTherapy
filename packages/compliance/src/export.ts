import { createHash } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import type { Checklist, EvaluatedEvidence } from './checklist';

/**
 * The export the compliance platform ingests (milestone 11; docs/adr/0053): the checklist as it stood, as JSON
 * in the format "tp-compliance-evidence/1". The vendor is not named yet, so it goes over CompliancePlatform: a
 * file in a directory (the console's download is the same document) until the vendor's connector is chosen. It
 * holds no PHI and no person's name: controls, criteria, evidence references, dates and hashes.
 */

export const EXPORT_FORMAT = 'tp-compliance-evidence/1';

export const CRITERIA_NOTE =
  'The SOC 2 criteria (2017 trust services criteria) and HIPAA Security Rule sections are the build’s proposed mapping, for the security official and the auditor to confirm before the Type I examination.';

const status = z.enum(['in_repository', 'current', 'stale', 'missing', 'awaiting_approval', 'failed', 'collected_externally', 'not_built']);

const evidenceSchema = z.object({
  kind: z.enum(['ci_job', 'database_test', 'unit_test', 'e2e_test', 'cdk_assertion', 'runbook', 'policy', 'record', 'external', 'not_built']),
  /** The file, the workflow, the policy, the record kind or the system it is collected from. */
  reference: z.string().min(1),
  detail: z.string(),
  status,
  latest: z.object({ occurred_on: z.iso.date(), document_ref: z.string().nullable(), sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable() }).nullable(),
  outstanding_count: z.number().int().min(0),
  note: z.string(),
});

export const complianceExportSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  environment: z.enum(['dev', 'staging', 'production', 'test']),
  generated_at: z.iso.datetime(),
  as_of: z.iso.date(),
  criteria_note: z.string(),
  counts: z.object({ ready: z.number().int().min(0), action_needed: z.number().int().min(0), partial: z.number().int().min(0) }),
  controls: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z_]+$/),
        name: z.string().min(1),
        implementation: z.string().min(1),
        plan_evidence: z.string().min(1),
        soc2: z.array(z.string().regex(/^(CC|A|C|PI|P)\d+\.\d+$/)).min(1),
        hipaa: z.array(z.string().regex(/^164\.\d{3}(\([A-Za-z0-9]+\))*$/)).min(1),
        status: z.enum(['ready', 'action_needed', 'partial']),
        evidence: z.array(evidenceSchema).min(1),
      }),
    )
    .min(1),
  program: z.array(evidenceSchema),
  policies: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      file: z.string(),
      version: z.string(),
      status: z.enum(['approved', 'awaiting_approval', 'stale']),
      approved_on: z.iso.date().nullable(),
    }),
  ),
});

export type ComplianceExport = z.infer<typeof complianceExportSchema>;

function exported(item: EvaluatedEvidence): ComplianceExport['program'][number] {
  const { source } = item;
  const base = { status: item.status, latest: item.latest === null ? null : { occurred_on: item.latest.occurredOn, document_ref: item.latest.documentRef, sha256: item.latest.sha256 }, outstanding_count: item.outstanding.length, note: item.note };
  switch (source.kind) {
    case 'ci_job':
      return { kind: source.kind, reference: source.workflow, detail: `${source.step}: ${source.what}`, ...base };
    case 'database_test':
    case 'unit_test':
    case 'e2e_test':
    case 'cdk_assertion':
      return { kind: source.kind, reference: source.file, detail: source.test, ...base };
    case 'runbook':
      return { kind: source.kind, reference: source.file, detail: '', ...base };
    case 'policy':
      return { kind: source.kind, reference: source.policy, detail: '', ...base };
    case 'record':
      return { kind: source.kind, reference: source.record, detail: `${source.what} (every ${String(source.withinDays)} days)`, ...base };
    case 'external':
      return { kind: source.kind, reference: source.system, detail: source.what, ...base };
    case 'not_built':
      return { kind: source.kind, reference: `milestone ${String(source.milestone)}`, detail: source.what, ...base };
  }
}

export function buildExport(checklist: Checklist, options: { readonly environment: ComplianceExport['environment']; readonly generatedAt: Date }): ComplianceExport {
  return complianceExportSchema.parse({
    format: EXPORT_FORMAT,
    environment: options.environment,
    generated_at: options.generatedAt.toISOString(),
    as_of: checklist.today,
    criteria_note: CRITERIA_NOTE,
    counts: checklist.counts,
    controls: checklist.controls.map((item) => ({
      id: item.control.id,
      name: item.control.name,
      implementation: item.control.implementation,
      plan_evidence: item.control.planEvidence,
      soc2: item.control.soc2,
      hipaa: item.control.hipaa,
      status: item.status,
      evidence: item.evidence.map(exported),
    })),
    program: checklist.program.map(exported),
    policies: checklist.policies.map((item) => ({ id: item.policy.id, title: item.policy.title, file: item.policy.file, version: item.policy.version, status: item.status, approved_on: item.approvedOn })),
  });
}

/** The export's bytes (stable key order, one trailing newline) and their SHA-256. */
export function serializeExport(evidence: ComplianceExport): { readonly text: string; readonly sha256: string } {
  const text = `${JSON.stringify(complianceExportSchema.parse(evidence), null, 2)}\n`;
  return { text, sha256: createHash('sha256').update(text).digest('hex') };
}

/** The file name an export goes by: its time and the start of its hash, nothing else. */
export function exportFileName(evidence: ComplianceExport, sha256: string): string {
  return `tp-compliance-evidence-${evidence.generated_at.replace(/[^0-9]/g, '').slice(0, 14)}-${sha256.slice(0, 12)}.json`;
}

export interface CompliancePlatformReceipt {
  /** Where the platform keeps it (a file name, or the vendor's reference once there is one). */
  readonly reference: string;
  readonly sha256: string;
}

/** The compliance platform's ingestion, behind which the vendor's connector goes once one is chosen. */
export interface CompliancePlatform {
  readonly kind: 'file' | 'memory';
  send(evidence: ComplianceExport): Promise<CompliancePlatformReceipt>;
}

export class CompliancePlatformError extends Error {
  override readonly name = 'CompliancePlatformError';
}

/** Writes each export once into a directory the compliance platform collects from. */
export class FileCompliancePlatform implements CompliancePlatform {
  readonly kind = 'file' as const;

  constructor(private readonly directory: string) {}

  async send(evidence: ComplianceExport): Promise<CompliancePlatformReceipt> {
    const { text, sha256 } = serializeExport(evidence);
    const name = exportFileName(evidence, sha256);
    await mkdir(this.directory, { recursive: true });
    const handle = await open(path.join(this.directory, name), 'wx', 0o600).catch((error: unknown) => {
      throw new CompliancePlatformError((error as NodeJS.ErrnoException).code === 'EEXIST' ? 'this export was already sent' : 'the export could not be written');
    });
    try {
      await handle.writeFile(text, 'utf8');
    } finally {
      await handle.close();
    }
    return { reference: name, sha256 };
  }
}

/** Keeps what was sent, for tests. */
export class MemoryCompliancePlatform implements CompliancePlatform {
  readonly kind = 'memory' as const;
  readonly sent: ComplianceExport[] = [];

  send(evidence: ComplianceExport): Promise<CompliancePlatformReceipt> {
    const { sha256 } = serializeExport(evidence);
    this.sent.push(evidence);
    return Promise.resolve({ reference: `memory:${String(this.sent.length)}`, sha256 });
  }
}
