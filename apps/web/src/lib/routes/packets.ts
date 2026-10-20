import { rolesPermit } from '@tp/db/runtime';
import { type ExportAwaitingAttestation, NARRATIVE_MAX_LENGTH, type SubmissionUnattestedReason, packetVersionUnattestedReason } from '@tp/worker/packets';
import { z } from 'zod';

import { underPacketRules } from '../cases/refusals';
import { requestApproval } from '../cases/workbench';
import { practiceRoute } from '../http/invoke';
import { type Download, InputError, type MutationResult, NotFoundError, type PracticeContext } from '../http/route';
import { type DraftView, packetDrafts, reviewNarrativeDrafts } from '../models/narrative-drafts';
import { modelFeatures } from '../models/path';
import { canSetCorrespondence } from '../packets/contact';
import { exportRefusalText } from '../packets/export-attempts';
import { type BuilderView, approveOnce, builderView, exportFile, exportFileNameOf, requestExportOnce, versionOfCase, writeVersionOnce } from '../packets/queries';
import { ATTEST_CONFIRMATIONS, PACKET_CHECKLIST, type PacketReview, attestOnce, awaitingAttestation, packetReview } from '../packets/review';
import { sentWithoutSignOffOf } from '../packets/unattested';
import { type CaseSummary, caseOf } from '../triage/queries';
import { MODEL_NOTICES, type ModelNotice } from './models';
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
 *
 * CO-05 and D16 (docs/adr/0061): the export is refused while the version's deadline is not verified, with
 * the next step in words; once exported, the reimbursement reviewer (audit_finding.validate, the reviewer
 * role under a support grant) reviews the export's PDF and CSV on its review page and attests over their
 * SHA-256, once, and a submission is logged only after that. The reviewer edits nothing else.
 *
 * The best-option audit's items #4, #26 and #61 (the founder's ruling of 2026-10-18): the builder shows a
 * version's pricing now and blocks its approval while it is not current; the export is refused before anything
 * is queued for every reason the job would refuse it, each with its fix, and the page shows the latest attempt
 * (in progress, retrying, refused with its fix, failed); and a version is written through one form whose submit
 * buttons (save, the code-built draft, the model's draft) the page's one server action routes to the write or
 * the model draft below, each with its own schema, role, transaction and audit event.
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
  /** Whether the person may have a model draft the narrative now (packet.draft, the kill switch off: MOD-06), and the versions models drafted. */
  readonly canDraftWithModel: boolean;
  readonly drafts: readonly DraftView[];
  readonly modelNotice: ModelNotice | null;
  /** Whether the viewer sets the practice's correspondence contact (the administrator, by ownership): the Export card links to it. */
  readonly canSetContact: boolean;
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
    model: z.enum(MODEL_NOTICES).optional().catch(undefined),
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
    return {
      practiceId,
      asOf,
      case: found,
      builder,
      notice: params.notice ?? null,
      viewerId: actor.userId,
      canApprove,
      canExport: rolesPermit(access.roles, 'phi.export'),
      canReadPhi,
      canDraftWithModel: rolesPermit(access.roles, 'packet.draft') && (await modelFeatures(scope, services, practiceId)).draftPacketNarrative,
      drafts: await packetDrafts(scope, practiceId, params.caseId),
      modelNotice: params.model ?? null,
      canSetContact: canSetCorrespondence(access),
    };
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
  handle: async ({ scope, practiceId, input, services, request }): Promise<MutationResult> => {
    await versionOfCase(scope, practiceId, input.caseId, input.versionId);
    await underPacketRules(() => requestApproval(scope, services.keys, { practiceId, caseId: input.caseId, versionId: input.versionId, message: input.message ?? null }));
    // The drafter is done with any model draft of the packet: its decision is what this version says (docs/adr/0052).
    await reviewNarrativeDrafts(scope, services.keys, { practiceId, versionId: input.versionId, requestId: request.requestId });
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
  handle: async ({ scope, practiceId, input, request, services, access }): Promise<MutationResult> => {
    await underPacketRules(() => approveOnce(scope, { practiceId, caseId: input.caseId, versionId: input.versionId, versionSha256: input.versionSha256, requestId: request.requestId }));
    // A model draft not yet reviewed is decided by the version approved, by an approver who may review drafts.
    if (rolesPermit(access.roles, 'packet.draft')) {
      await reviewNarrativeDrafts(scope, services.keys, { practiceId, versionId: input.versionId, requestId: request.requestId });
    }
    return { objectId: input.versionId, redirect: `/p/${practiceId}/cases/${input.caseId}/packet?notice=approved` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ caseId: refs.caseId, versionId: refs.packetVersionId, versionSha256: refs.packetVersionSha256 }) },
});

/**
 * Asks the worker to export the approved current version: the packet_export job prints the PDF and the
 * CSV schedule with the identifiers inserted from the claim and patient records, stores both sealed
 * and records their SHA-256 on the version (CAS-11, CAS-12). An exported version is left as it is.
 * What the job would refuse is refused here at once, before anything is queued (the best-option audit's item
 * #26): one issue per reason that holds, its field the reason's code and its message the reason with its fix,
 * which the packet page lists. The job records its own refusals and failed tries, which the page shows.
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
    const asOf = services.now().toISOString().slice(0, 10);
    const outcome = await requestExportOnce(scope, services.queue, { practiceId, caseId: input.caseId, versionId: input.versionId, asOf });
    if (outcome.outcome === 'refused') {
      throw new InputError(outcome.reasons.map((reason) => ({ field: reason, message: exportRefusalText(reason, { singleUser: outcome.singleUser }) })));
    }
    return { objectId: input.versionId, redirect: `/p/${practiceId}/cases/${input.caseId}/packet?version=${input.versionId}&notice=${outcome.outcome === 'queued' ? 'export_requested' : 'exported'}` };
  },
  // The world's exported version: exported already, so nothing is queued.
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ caseId: refs.submittedCaseId, versionId: refs.exportedVersionId }) },
});

const downloadParams = z.object({ practiceId: opaqueId, caseId: opaqueId, versionId: opaqueId });

/**
 * An exported version's file, checked against its SHA-256 and recorded as a line-level export, with the name it is
 * served under (D8: the packet's reference, never a record ID); not found before the export.
 */
async function exported(context: PracticeContext<z.output<typeof downloadParams>, unknown>, file: 'pdf' | 'csv'): Promise<Download<Uint8Array<ArrayBuffer>>> {
  const { scope, practiceId, params, request, services } = context;
  const filename = await exportFileNameOf(scope, { practiceId, caseId: params.caseId, versionId: params.versionId, file });
  const bytes = filename === undefined ? undefined : await exportFile(scope, services, { practiceId, caseId: params.caseId, versionId: params.versionId, file, requestId: request.requestId });
  if (filename === undefined || bytes === undefined) {
    throw new NotFoundError();
  }
  return { download: file === 'pdf' ? { filename, contentType: 'application/pdf', body: bytes } : { filename, contentType: 'text/csv; charset=utf-8', body: bytes } };
}

/** The exported PDF (the packet with its identifiers inserted: line-level PHI), for the roles that export PHI. */
export const packetPdf = practiceRoute({
  id: 'practice.cases.packet.pdf',
  kind: 'handler',
  method: 'GET',
  path: '/p/[practiceId]/cases/[caseId]/packet/[versionId]/pdf',
  rateLimit: 'export',
  phi: true,
  permission: 'phi.export',
  params: downloadParams,
  // The file's name is the packet's reference (payment-dispute-<REF>.pdf), never a record ID, a payer's or a patient's name.
  handle: (context): Promise<Download<Uint8Array<ArrayBuffer>>> => exported(context, 'pdf'),
  sample: { params: (refs) => ({ practiceId: refs.practiceId, caseId: refs.submittedCaseId, versionId: refs.exportedVersionId }) },
});

/** The exported CSV schedule (claim numbers and patients: line-level PHI), for the roles that export PHI. */
export const packetCsv = practiceRoute({
  id: 'practice.cases.packet.csv',
  kind: 'handler',
  method: 'GET',
  path: '/p/[practiceId]/cases/[caseId]/packet/[versionId]/csv',
  rateLimit: 'export',
  phi: true,
  permission: 'phi.export',
  params: downloadParams,
  handle: (context): Promise<Download<Uint8Array<ArrayBuffer>>> => exported(context, 'csv'),
  sample: { params: (refs) => ({ practiceId: refs.practiceId, caseId: refs.submittedCaseId, versionId: refs.exportedVersionId }) },
});

const sha256 = z.string().regex(/^[0-9a-f]{64}$/, 'a SHA-256');

/** The attestation's input: the two SHA-256 and one required box per checklist item, built from the checklist (D10), so none can be left out. */
export const ATTEST_INPUT = z.object({
  caseId: opaqueId,
  versionId: opaqueId,
  pdfSha256: sha256,
  csvSha256: sha256,
  ...ATTEST_CONFIRMATIONS,
});

export interface PacketReviewsPageData {
  readonly practiceId: string;
  readonly awaiting: readonly ExportAwaitingAttestation[];
}

/** The exports waiting for the reimbursement reviewer's attestation (D16), oldest first. */
export const packetReviewsPage = practiceRoute({
  id: 'practice.packet_reviews',
  kind: 'page',
  path: '/p/[practiceId]/packet-reviews',
  phi: true,
  permission: 'audit_finding.validate',
  params: z.object({ practiceId: opaqueId }),
  handle: async ({ scope, practiceId }): Promise<PacketReviewsPageData> => ({ practiceId, awaiting: await awaitingAttestation(scope, practiceId) }),
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

export interface PacketReviewPageData {
  readonly practiceId: string;
  readonly review: PacketReview;
  readonly checklist: typeof PACKET_CHECKLIST;
  readonly notice: 'attested' | null;
  /**
   * The submission of this export logged sent without sign-off, once there is one (its pricing went stale after the
   * export; the founder's ruling of 2026-10-20): the version is never attested.
   */
  readonly sentWithoutSignOff: Awaited<ReturnType<typeof sentWithoutSignOffOf>>;
  /** Why its export may be logged without the attestation (its pricing went stale after the export); null otherwise. */
  readonly unattestedReason: SubmissionUnattestedReason | null;
}

/** The reviewer's review of one export: its content, deadline, files and their SHA-256, and the checklist to attest over them. */
export const packetReviewPage = practiceRoute({
  id: 'practice.cases.packet.review',
  kind: 'page',
  path: '/p/[practiceId]/cases/[caseId]/packet/[versionId]/review',
  phi: true,
  permission: 'audit_finding.validate',
  params: z.object({ practiceId: opaqueId, caseId: opaqueId, versionId: opaqueId, notice: optionalText(z.enum(['attested'])) }),
  handle: async ({ scope, practiceId, params, request, actor, services }): Promise<PacketReviewPageData> => ({
    practiceId,
    review: await packetReview(scope, services, { practiceId, caseId: params.caseId, versionId: params.versionId, viewerId: actor.userId, requestId: request.requestId }),
    checklist: PACKET_CHECKLIST,
    notice: params.notice ?? null,
    sentWithoutSignOff: await sentWithoutSignOffOf(scope, { practiceId, versionId: params.versionId }),
    unattestedReason: await packetVersionUnattestedReason(scope.client, { practiceId, versionId: params.versionId }),
  }),
  sample: { params: (refs) => ({ practiceId: refs.practiceId, caseId: refs.submittedCaseId, versionId: refs.exportedVersionId }) },
});

/**
 * The reviewer attests the export (D16; once: an attested export is left as it is): every item confirmed
 * and the SHA-256 of the PDF and the CSV the review showed, which must be the export's. No free text. The
 * database refuses a reviewer who drafted, wrote or approved the packet, a version not current or whose
 * case changed, and one whose deadline is not verified now.
 */
export const attestPacketExportAction = practiceRoute({
  id: 'practice.cases.packet.attest',
  kind: 'action',
  path: '/p/[practiceId]/cases/packet/attest',
  phi: true,
  permission: 'audit_finding.validate',
  params: z.object({ practiceId: opaqueId }),
  input: ATTEST_INPUT,
  audit: { action: 'packet_export_attested', objectType: 'packet_version' },
  handle: async ({ scope, practiceId, input, request }): Promise<MutationResult> => {
    await underPacketRules(() => attestOnce(scope, { practiceId, caseId: input.caseId, versionId: input.versionId, pdfSha256: input.pdfSha256, csvSha256: input.csvSha256, requestId: request.requestId }));
    return { objectId: input.versionId, redirect: `/p/${practiceId}/cases/${input.caseId}/packet/${input.versionId}/review?notice=attested` };
  },
  sample: {
    params: (refs) => ({ practiceId: refs.practiceId }),
    // The world's exported version, attested already before its submission: nothing changes.
    input: (refs) => ({
      caseId: refs.submittedCaseId,
      versionId: refs.exportedVersionId,
      pdfSha256: refs.exportedVersionPdfSha256,
      csvSha256: refs.exportedVersionCsvSha256,
      ...Object.fromEntries(PACKET_CHECKLIST.map((item) => [`confirm_${item.id}`, 'on'])),
    }),
  },
});

/** The exported PDF for the reviewer the review names it to (audit_finding.validate): read-only, checked against its SHA-256, the download recorded. */
export const reviewPacketPdf = practiceRoute({
  id: 'practice.cases.packet.review_pdf',
  kind: 'handler',
  method: 'GET',
  path: '/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/pdf',
  rateLimit: 'export',
  phi: true,
  permission: 'audit_finding.validate',
  params: downloadParams,
  handle: (context): Promise<Download<Uint8Array<ArrayBuffer>>> => exported(context, 'pdf'),
  sample: { params: (refs) => ({ practiceId: refs.practiceId, caseId: refs.submittedCaseId, versionId: refs.exportedVersionId }) },
});

/** The exported CSV schedule for the reviewer (line-level PHI, under the support grant): checked against its SHA-256, the download recorded. */
export const reviewPacketCsv = practiceRoute({
  id: 'practice.cases.packet.review_csv',
  kind: 'handler',
  method: 'GET',
  path: '/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/csv',
  rateLimit: 'export',
  phi: true,
  permission: 'audit_finding.validate',
  params: downloadParams,
  handle: (context): Promise<Download<Uint8Array<ArrayBuffer>>> => exported(context, 'csv'),
  sample: { params: (refs) => ({ practiceId: refs.practiceId, caseId: refs.submittedCaseId, versionId: refs.exportedVersionId }) },
});

export const PACKET_ROUTES = [
  packetPage,
  writeVersionAction,
  requestApprovalAction,
  approvePacketVersionAction,
  exportPacketAction,
  packetPdf,
  packetCsv,
  packetReviewsPage,
  packetReviewPage,
  attestPacketExportAction,
  reviewPacketPdf,
  reviewPacketCsv,
] as const;
