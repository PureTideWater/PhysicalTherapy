import { rolesPermit } from '@tp/db/runtime';
import { parseAmount } from '@tp/money';
import { SUBMISSION_CHANNELS } from '@tp/packets';
import { z } from 'zod';

import { underPacketRules } from '../cases/refusals';
import { practiceRoute } from '../http/invoke';
import { InputError, type MutationResult, NotFoundError } from '../http/route';
import { type ResponseDocument, type SubmissionView, defaultFollowUpOn, logSubmissionOnce, recordResponseOnce, responseDocuments, submissionsOf, submittableVersion } from '../packets/submissions';
import { type CaseSummary, caseOf } from '../triage/queries';
import { opaqueId, optionalText } from './schemas';

/**
 * Submissions and responses, per case (PRD 5, J9: "the manager submits it through the practice's own
 * payer channel and logs the submission (date, channel, reference)"; J10: "logs the payer's response
 * (accepted, partially accepted, denied, more information requested) with the document"; PRD 7,
 * Submissions and responses: "log a submission or response; set a follow-up; overdue follow-ups
 * surface on the dashboard"; PRD 12; test matrix CAS-12, CAS-14; docs/adr/0041 and 0044).
 *
 * Reading is practice.open (the payer's references show to the roles that read PHI); logging a
 * submission and recording a response are submission.log (the billing manager and the firm
 * principal), checked again by the database, in the person's own name, with an audit event, once.
 */

const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'a date, YYYY-MM-DD');

export interface SubmissionsPageData {
  readonly practiceId: string;
  readonly asOf: string;
  readonly case: CaseSummary;
  readonly submissions: readonly SubmissionView[];
  /** The exported current version a submission sends now, with its hashes; null before an export. */
  readonly submittable: Awaited<ReturnType<typeof submittableVersion>>;
  /** Today's default follow-up date (45 days on). */
  readonly defaultFollowUpOn: string;
  readonly documents: readonly ResponseDocument[];
  readonly notice: 'logged' | 'recorded' | null;
  readonly canLog: boolean;
  readonly canReadPhi: boolean;
}

export const submissionsPage = practiceRoute({
  id: 'practice.cases.submissions',
  kind: 'page',
  path: '/p/[practiceId]/cases/[caseId]/submissions',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, caseId: opaqueId, notice: optionalText(z.enum(['logged', 'recorded'])) }),
  handle: async ({ scope, practiceId, params, request, access, services }): Promise<SubmissionsPageData> => {
    const asOf = services.now().toISOString().slice(0, 10);
    const found = await caseOf(scope, practiceId, params.caseId, asOf, request.requestId);
    if (found === undefined) {
      throw new NotFoundError();
    }
    const canReadPhi = rolesPermit(access.roles, 'phi.read');
    const canLog = rolesPermit(access.roles, 'submission.log');
    return {
      practiceId,
      asOf,
      case: found,
      submissions: await submissionsOf(scope, services.keys, { practiceId, caseId: params.caseId, readsPhi: canReadPhi, asOf, requestId: request.requestId }),
      submittable: await submittableVersion(scope, { practiceId, caseId: params.caseId }),
      defaultFollowUpOn: defaultFollowUpOn(asOf),
      documents: canLog ? await responseDocuments(scope, practiceId) : [],
      notice: params.notice ?? null,
      canLog,
      canReadPhi,
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, caseId: refs.submittedCaseId }) },
});

/**
 * Logs a submission the customer made through the payer's own channel (the product never submits):
 * the date, channel, reference (kept encrypted) and follow-up date (45 days on unless named), carrying
 * the export's SHA-256 into the log (CAS-12). The database refuses a version not exported, a date
 * before the export or after today, a dispute the payer answered (unless a denial reopened it, within
 * the next level's window), and anyone who does not log submissions. The same submission again does
 * nothing.
 */
export const logSubmissionAction = practiceRoute({
  id: 'practice.cases.submissions.log',
  kind: 'action',
  path: '/p/[practiceId]/cases/submissions/log',
  phi: true,
  permission: 'submission.log',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({
    caseId: opaqueId,
    versionId: opaqueId,
    submittedOn: isoDate,
    channel: z.enum(SUBMISSION_CHANNELS),
    reference: optionalText(z.string().max(200, 'at most 200 characters')),
    followUpOn: optionalText(isoDate),
  }),
  audit: { action: 'submission_logged', objectType: 'submission' },
  handle: async ({ scope, practiceId, input, request, services }): Promise<MutationResult> => {
    const { rowCount } = await scope.client.query('SELECT 1 FROM packet_version v JOIN packet p ON p.id = v.packet_id WHERE v.id = $1 AND p.case_id = $2 AND v.practice_id = $3', [
      input.versionId,
      input.caseId,
      practiceId,
    ]);
    if (rowCount !== 1) {
      throw new NotFoundError();
    }
    const logged = await underPacketRules(() =>
      logSubmissionOnce(scope, services.keys, {
        practiceId,
        caseId: input.caseId,
        versionId: input.versionId,
        submittedOn: input.submittedOn,
        channel: input.channel,
        reference: input.reference ?? null,
        followUpOn: input.followUpOn ?? null,
        requestId: request.requestId,
      }),
    );
    return { objectId: logged.submissionId, redirect: `/p/${practiceId}/cases/${input.caseId}/submissions?notice=logged` };
  },
  sample: {
    params: (refs) => ({ practiceId: refs.practiceId }),
    // The world's submission again (the same version, day and channel): nothing new is logged.
    input: (refs) => ({ caseId: refs.submittedCaseId, versionId: refs.exportedVersionId, submittedOn: new Date().toISOString().slice(0, 10), channel: 'payer_portal', reference: '', followUpOn: '' }),
  },
});

/** The kinds a person records (reprocessed with no change is the recovery ledger's, from a remittance). */
export const PERSON_RESPONSE_KINDS = ['accepted', 'partial', 'denied', 'info_requested'] as const;
export const DENIAL_CATEGORIES = ['authorization', 'visit_limit', 'modifier', 'medical_necessity', 'timely_filing', 'bundling', 'other'] as const;

/** An amount in dollars and cents from a form, as integer cents; blank means none. */
const optionalDollars = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value),
  z
    .string()
    .regex(/^\d{1,9}(\.\d{1,2})?$/, 'dollars and cents, such as 120.00')
    .transform((text) => parseAmount(text))
    .optional(),
);

/**
 * Records the payer's response to the case's latest submission with its document (PRD 12: accepted,
 * partial, denied, information requested, and amounts): an accepted or partial response states what
 * the payer accepted; a denial may name its reason and, with one, reopen the case for the next dispute
 * level within its window (the database computes the window and refuses a reopen without one).
 * Recording it writes no ledger entry and moves no line (LED-01). The same response again does nothing.
 */
export const recordResponseAction = practiceRoute({
  id: 'practice.cases.submissions.respond',
  kind: 'action',
  path: '/p/[practiceId]/cases/submissions/respond',
  phi: true,
  permission: 'submission.log',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({
    caseId: opaqueId,
    submissionId: opaqueId,
    kind: z.enum(PERSON_RESPONSE_KINDS),
    amount: optionalDollars,
    documentId: opaqueId,
    receivedOn: isoDate,
    denialCategory: optionalText(z.enum(DENIAL_CATEGORIES)),
    reopensCase: optionalText(z.literal('on')),
    notes: optionalText(z.string().max(2000, 'at most 2000 characters')),
  }),
  audit: { action: 'payer_response_recorded', objectType: 'payer_response' },
  handle: async ({ scope, practiceId, input, request, services }): Promise<MutationResult> => {
    const accepts = input.kind === 'accepted' || input.kind === 'partial';
    if (accepts !== (input.amount !== undefined)) {
      throw new InputError([{ field: 'amount', message: accepts ? 'what the payer accepted, in dollars and cents' : 'only an accepted or partial response states an amount' }]);
    }
    if (input.amount !== undefined && input.amount <= 0n) {
      throw new InputError([{ field: 'amount', message: 'more than zero' }]);
    }
    if (input.kind !== 'denied' && (input.denialCategory !== undefined || input.reopensCase !== undefined)) {
      throw new InputError([{ field: 'denialCategory', message: 'only a denial has a reason or reopens the case' }]);
    }
    if (input.reopensCase !== undefined && input.denialCategory === undefined) {
      throw new InputError([{ field: 'denialCategory', message: 'a denial reopens the case for the next level only with its reason' }]);
    }
    const { rowCount } = await scope.client.query('SELECT 1 FROM submission WHERE id = $1 AND case_id = $2 AND practice_id = $3', [input.submissionId, input.caseId, practiceId]);
    if (rowCount !== 1) {
      throw new NotFoundError();
    }
    const recorded = await underPacketRules(() =>
      recordResponseOnce(scope, services.keys, {
        practiceId,
        submissionId: input.submissionId,
        kind: input.kind,
        amountCents: input.amount ?? null,
        documentId: input.documentId,
        receivedOn: input.receivedOn,
        denialCategory: input.denialCategory ?? null,
        notes: input.notes ?? null,
        reopensCase: input.reopensCase === 'on',
        requestId: request.requestId,
      }),
    );
    return { objectId: recorded.responseId, redirect: `/p/${practiceId}/cases/${input.caseId}/submissions?notice=recorded` };
  },
  sample: {
    params: (refs) => ({ practiceId: refs.practiceId }),
    input: (refs) => ({ caseId: refs.submittedCaseId, submissionId: refs.submissionId, kind: 'info_requested', amount: '', documentId: refs.responseDocumentId, receivedOn: new Date().toISOString().slice(0, 10) }),
  },
});

export const SUBMISSION_ROUTES = [submissionsPage, logSubmissionAction, recordResponseAction] as const;
