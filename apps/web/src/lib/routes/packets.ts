import { rolesPermit } from '@tp/db/runtime';
import { NARRATIVE_MAX_LENGTH } from '@tp/worker/packets';
import { z } from 'zod';

import { underPacketRules } from '../cases/refusals';
import { requestApproval } from '../cases/workbench';
import { practiceRoute } from '../http/invoke';
import { type Download, InputError, type MutationResult, NotFoundError, type PracticeContext } from '../http/route';
import { NOT_EXPORTABLE, type BuilderView, approveOnce, builderView, exportFile, requestExportOnce, versionOfCase, writeVersionOnce } from '../packets/queries';
import { type CaseSummary, caseOf } from '../triage/queries';
import { opaqueId, optionalText } from './schemas';

/**
 * The packet builder (PRD 5, J9; PRD 7, Packet builder: "citation, line table, traces, narrative editor
 * with verifier results, interest, evidence list, approval panel, export history"; "edit, request
 * approval, approve (second person), export"; "verifier failures block approval; identifiers are shown
 * as placeholders until export"; PRD 12, The packet and Approval; test matrix CAS-08 to CAS-13;
 * docs/adr/0041 and 0044), one per case, under the case.
 *
 * Opening and editing a packet is packet.draft (the billing manager, the analysts, the firm principal);
 * approving it packet.approve (the billing manager and the firm principal; the database refuses the
 * person who drafted or last edited it while someone else may approve, and makes a single-user
 * practice's writer wait 24 hours); exporting and downloading the export is phi.export, since the
 * export inserts the identifiers (the billing manager and the firm principal). Every step records an
 * audit event, and is made once.
 */

const STATE_CODE = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'a two-letter state code');

export interface BuilderPageData {
  readonly practiceId: string;
  readonly asOf: string;
  readonly case: CaseSummary;
  readonly builder: BuilderView;
  readonly notice: 'written' | 'unchanged' | 'requested' | 'approved' | 'export_requested' | 'exported' | null;
  readonly viewerId: string;
  readonly canApprove: boolean;
  readonly canExport: boolean;
  readonly canReadPhi: boolean;
}

export const packetPage = practiceRoute({
  id: 'practice.cases.packet',
  kind: 'page',
  path: '/p/[practiceId]/cases/[caseId]/packet',
  phi: true,
  permission: 'packet.draft',
  params: z.object({
    practiceId: opaqueId,
    caseId: opaqueId,
    version: optionalText(opaqueId),
    notice: optionalText(z.enum(['written', 'unchanged', 'requested', 'approved', 'export_requested', 'exported'])),
  }),
  handle: async ({ scope, practiceId, params, request, access, actor, services }): Promise<BuilderPageData> => {
    const now = services.now();
    const asOf = now.toISOString().slice(0, 10);
    const found = await caseOf(scope, practiceId, params.caseId, asOf, request.requestId);
    if (found === undefined) {
      throw new NotFoundError();
    }
    const canApprove = rolesPermit(access.roles, 'packet.approve');
    const canReadPhi = rolesPermit(access.roles, 'phi.read');
    const builder = await builderView(scope, services, {
      practiceId,
      caseId: params.caseId,
      ...(params.version === undefined ? {} : { versionId: params.version }),
      viewerId: actor.userId,
      approves: canApprove,
      readsPhi: canReadPhi,
      requestId: request.requestId,
      now,
    });
    if (builder === undefined) {
      throw new NotFoundError();
    }
    return { practiceId, asOf, case: found, builder, notice: params.notice ?? null, viewerId: actor.userId, canApprove, canExport: rolesPermit(access.roles, 'phi.export'), canReadPhi };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, caseId: refs.caseId }) },
});

/** The documents a version attaches, as a form sends them: one field `attach:<document>` per checked box. */
function withAttachments(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) {
    return raw;
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  const attachments = entries.filter(([key, value]) => key.startsWith('attach:') && value === 'on').map(([key]) => key.slice('attach:'.length));
  return { ...Object.fromEntries(entries.filter(([key]) => !key.startsWith('attach:'))), attachments };
}

/**
 * Writes a packet version (CAS-13: an edit is a new version, which clears the approval): the case's
 * lines not written off and its approved records assembled by code, the narrative the person's (or the
 * code-built draft of the pattern statement when they ask for it), verified by the server and stored
 * with its result: a failing one is stored too, and cannot be approved (CAS-08). Saving what the
 * current version already holds writes nothing. A version written since this one was opened is refused.
 */
export const writeVersionAction = practiceRoute({
  id: 'practice.cases.packet.write',
  kind: 'action',
  path: '/p/[practiceId]/cases/packet/write',
  phi: true,
  permission: 'packet.draft',
  params: z.object({ practiceId: opaqueId }),
  input: z.preprocess(
    withAttachments,
    z.object({
      caseId: opaqueId,
      basedOnVersionId: optionalText(opaqueId),
      narrative: optionalText(z.string().max(NARRATIVE_MAX_LENGTH, `at most ${String(NARRATIVE_MAX_LENGTH)} characters`)),
      useDraft: optionalText(z.literal('on')),
      promptPayState: optionalText(STATE_CODE),
      attachments: z.array(opaqueId).max(20, 'at most 20 attached documents'),
    }),
  ),
  audit: { action: 'packet_version_written', objectType: 'packet_version' },
  handle: async ({ scope, practiceId, input, request, services }): Promise<MutationResult> => {
    const written = await underPacketRules(() =>
      writeVersionOnce(scope, services, {
        practiceId,
        caseId: input.caseId,
        basedOnVersionId: input.basedOnVersionId ?? null,
        narrative: input.useDraft === 'on' ? undefined : input.narrative,
        promptPayState: input.promptPayState ?? null,
        attachedDocumentIds: input.attachments,
        requestId: request.requestId,
      }),
    );
    return { objectId: written.versionId, redirect: `/p/${practiceId}/cases/${input.caseId}/packet?notice=${written.written ? 'written' : 'unchanged'}` };
  },
  sample: {
    params: (refs) => ({ practiceId: refs.practiceId }),
    // The code-built draft the world's version already holds: nothing new is written.
    input: (refs) => ({ caseId: refs.caseId, basedOnVersionId: refs.packetVersionId, useDraft: 'on' }),
  },
});

/** The longest message an approval request carries. */
export const REQUEST_MESSAGE_MAX_LENGTH = 1000;

/**
 * Asks a second person to approve the packet's current version (PRD 7: "request approval"), once the
 * verifier passed it, with optional words to the approver (kept encrypted). Asking again does nothing.
 */
export const requestApprovalAction = practiceRoute({
  id: 'practice.cases.packet.request_approval',
  kind: 'action',
  path: '/p/[practiceId]/cases/packet/request-approval',
  phi: true,
  permission: 'packet.draft',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ caseId: opaqueId, versionId: opaqueId, message: optionalText(z.string().max(REQUEST_MESSAGE_MAX_LENGTH)) }),
  audit: { action: 'packet_approval_requested', objectType: 'packet_version' },
  handle: async ({ scope, practiceId, input, services }): Promise<MutationResult> => {
    await versionOfCase(scope, practiceId, input.caseId, input.versionId);
    await underPacketRules(() => requestApproval(scope, services.keys, { practiceId, caseId: input.caseId, versionId: input.versionId, message: input.message ?? null }));
    return { objectId: input.versionId, redirect: `/p/${practiceId}/cases/${input.caseId}/packet?notice=requested` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ caseId: refs.caseId, versionId: refs.packetVersionId, message: '' }) },
});

/**
 * Approves the version, naming the hash shown (PRD 12, Approval: "Approval records the user, time and
 * the packet version hash"). The database refuses a version the verifier failed (CAS-08), one not
 * current or whose case changed, a person who does not approve packets, and the person who drafted or
 * last edited it (CAS-09) unless no one else may approve the practice's packets and 24 hours have
 * passed, which it flags (CAS-10). An approved version is left as it is.
 */
export const approvePacketVersionAction = practiceRoute({
  id: 'practice.cases.packet.approve',
  kind: 'action',
  path: '/p/[practiceId]/cases/packet/approve',
  phi: true,
  permission: 'packet.approve',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ caseId: opaqueId, versionId: opaqueId, versionSha256: z.string().regex(/^[0-9a-f]{64}$/, 'the version’s SHA-256') }),
  audit: { action: 'packet_approved', objectType: 'packet_version' },
  handle: async ({ scope, practiceId, input, request }): Promise<MutationResult> => {
    await underPacketRules(() => approveOnce(scope, { practiceId, caseId: input.caseId, versionId: input.versionId, versionSha256: input.versionSha256, requestId: request.requestId }));
    return { objectId: input.versionId, redirect: `/p/${practiceId}/cases/${input.caseId}/packet?notice=approved` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ caseId: refs.caseId, versionId: refs.packetVersionId, versionSha256: refs.packetVersionSha256 }) },
});

/**
 * Asks the worker to export the approved current version: the packet_export job prints the PDF and the
 * CSV schedule with the identifiers inserted from the claim and patient records, stores both sealed
 * and records their SHA-256 on the version (CAS-11, CAS-12). An exported version is left as it is.
 */
export const exportPacketAction = practiceRoute({
  id: 'practice.cases.packet.export',
  kind: 'action',
  path: '/p/[practiceId]/cases/packet/export',
  phi: true,
  permission: 'phi.export',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ caseId: opaqueId, versionId: opaqueId }),
  audit: { action: 'packet_export_requested', objectType: 'packet_version' },
  handle: async ({ scope, practiceId, input, services }): Promise<MutationResult> => {
    const outcome = await requestExportOnce(scope, services.queue, { practiceId, caseId: input.caseId, versionId: input.versionId });
    if (outcome === 'refused') {
      throw new InputError([{ field: 'refused', message: NOT_EXPORTABLE }]);
    }
    return { objectId: input.versionId, redirect: `/p/${practiceId}/cases/${input.caseId}/packet?version=${input.versionId}&notice=${outcome === 'queued' ? 'export_requested' : 'exported'}` };
  },
  // The world's exported version: exported already, so nothing is queued.
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ caseId: refs.submittedCaseId, versionId: refs.exportedVersionId }) },
});

const downloadParams = z.object({ practiceId: opaqueId, caseId: opaqueId, versionId: opaqueId });

/** An exported version's file, checked against its SHA-256 and recorded as a line-level export; not found before the export. */
async function exported(context: PracticeContext<z.output<typeof downloadParams>, unknown>, file: 'pdf' | 'csv'): Promise<Uint8Array<ArrayBuffer>> {
  const { scope, practiceId, params, request, services } = context;
  const bytes = await exportFile(scope, services, { practiceId, caseId: params.caseId, versionId: params.versionId, file, requestId: request.requestId });
  if (bytes === undefined) {
    throw new NotFoundError();
  }
  return bytes;
}

/** The exported PDF (the packet with its identifiers inserted: line-level PHI), for the roles that export PHI. */
export const packetPdf = practiceRoute({
  id: 'practice.cases.packet.pdf',
  kind: 'handler',
  method: 'GET',
  path: '/p/[practiceId]/cases/[caseId]/packet/[versionId]/pdf',
  phi: true,
  permission: 'phi.export',
  params: downloadParams,
  handle: async (context): Promise<Download<Uint8Array<ArrayBuffer>>> => ({
    // The file's name is the version's opaque ID, never a payer's or a patient's name.
    download: { filename: `packet-${context.params.versionId}.pdf`, contentType: 'application/pdf', body: await exported(context, 'pdf') },
  }),
  sample: { params: (refs) => ({ practiceId: refs.practiceId, caseId: refs.submittedCaseId, versionId: refs.exportedVersionId }) },
});

/** The exported CSV schedule (claim numbers and patients: line-level PHI), for the roles that export PHI. */
export const packetCsv = practiceRoute({
  id: 'practice.cases.packet.csv',
  kind: 'handler',
  method: 'GET',
  path: '/p/[practiceId]/cases/[caseId]/packet/[versionId]/csv',
  phi: true,
  permission: 'phi.export',
  params: downloadParams,
  handle: async (context): Promise<Download<Uint8Array<ArrayBuffer>>> => ({
    download: { filename: `packet-schedule-${context.params.versionId}.csv`, contentType: 'text/csv; charset=utf-8', body: await exported(context, 'csv') },
  }),
  sample: { params: (refs) => ({ practiceId: refs.practiceId, caseId: refs.submittedCaseId, versionId: refs.exportedVersionId }) },
});

export const PACKET_ROUTES = [packetPage, writeVersionAction, requestApprovalAction, approvePacketVersionAction, exportPacketAction, packetPdf, packetCsv] as const;
