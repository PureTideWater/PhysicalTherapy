import { rolesPermit } from '@tp/db/runtime';
import { PacketRuleError, SENT_WITHOUT_SIGN_OFF_UNCONFIRMED, packetVersionUnattestedReason } from '@tp/worker/packets';
import { parseAmount } from '@tp/money';
import { SUBMISSION_CHANNELS } from '@tp/packets';
import { z } from 'zod';

import { underPacketRules } from '../cases/refusals';
import { practiceRoute } from '../http/invoke';
import { InputError, type MutationResult, NotFoundError } from '../http/route';
import {
  type EarlierExport,
  type ResponseLetters,
  type SubmissionView,
  type SubmittableVersion,
  defaultFollowUpOn,
  earlierExports,
  logSubmissionOnce,
  loggedSubmission,
  recordResponseOnce,
  responseDocumentChoosable,
  responseDocuments,
  submissionsOf,
  submittableVersion,
} from '../packets/submissions';
import { STALE_EXPORT_SUBMISSION } from '../packets/unattested';
import { type CaseSummary, caseOf } from '../triage/queries';
import { MAX_UPLOAD_BYTES } from '../uploads/limits';
import { opaqueId, optionalText } from './schemas';
import { type UploadGate, uploadGate } from './uploads';

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
 * A submission whose version's pricing is no longer current is never refused for it (it already happened
 * outside the product): it is logged, the database flags it (submission.pricing_check), and the page says so
 * with the figures sent and the pricing in effect now (audit item #4).
 *
 * A submission sends an attested export, with the one exception the founder ruled on 2026-10-20 (docs/adr/0061):
 * when a version's pricing went stale after its export and before its attestation, the export is never attested,
 * and its submission is logged sent without sign-off, recorded unattested with its reason ('sent without sign-off:
 * pricing went stale after export') and flagged with the cause, so reconciliation tracks the payer's answer. The
 * person confirms it went that way; the database decides whether the export is one (and refuses every other
 * unattested export) and records the audit event submission_logged_unattested in their name.
 *
 * A choice that records a fact starts unchosen and is refused empty on its field (docs/adr/0085, D1): the channel,
 * the payer's answer and the payer's letter. The letter is uploaded in the response's form (D3), so the page carries
 * the person's upload permission and the practice's upload gate, and the letters a response may carry, grouped; the
 * handler refuses any other letter, a crafted post's or one tagged to a contract in another tab, under the document's
 * lock (D4).
 */

const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'a date, YYYY-MM-DD');

export interface SubmissionsPageData {
  readonly practiceId: string;
  readonly asOf: string;
  readonly case: CaseSummary;
  readonly submissions: readonly SubmissionView[];
  /** The exported current version a submission sends now, with its hashes and whether its pricing is current; null before an export. */
  readonly submittable: SubmittableVersion | null;
  /**
   * Exports an edit replaced that may still be logged as sent before the edit (attested, or never attested because
   * their pricing went stale after the export), newest first: an export that went to the payer is still logged after
   * its stale lines were written off and a new version written.
   */
  readonly earlier: readonly EarlierExport[];
  /** The case is closed written off: the database takes no submission on it, so the page shows how to log one instead of a form. */
  readonly closed: boolean;
  /** Today's default follow-up date (45 days on). */
  readonly defaultFollowUpOn: string;
  /** The letters a response may carry, grouped; empty for a person who does not log responses. */
  readonly letters: ResponseLetters;
  /** Whether the person may upload the payer's letter in the response's form, and whether uploads are open; null for a person who does not log responses. */
  readonly upload: ResponseLetterUpload | null;
  /** The person's roles, which the uploader names when they cannot upload. */
  readonly roles: readonly string[];
  /**
   * What was just done: logged, logged and flagged because the version's pricing is no longer current, logged sent
   * without sign-off (its pricing went stale after the export, so it is never attested), or a response recorded.
   */
  readonly notice: SubmissionNotice | null;
  readonly canLog: boolean;
  readonly canReadPhi: boolean;
}

/** The upload of the payer's letter in the response's form: the Uploads page's gate (a BAA on file, the organization not suspended). */
export interface ResponseLetterUpload {
  /** file.upload, its own check: logging responses does not imply it. */
  readonly canUpload: boolean;
  readonly gate: UploadGate;
  readonly maxBytes: number;
}

const NO_LETTERS: ResponseLetters = { unused: [], thisCase: [], otherCases: [] };

export const SUBMISSION_NOTICES = ['logged', 'logged_flagged', 'logged_unattested', 'recorded'] as const;
export type SubmissionNotice = (typeof SUBMISSION_NOTICES)[number];

export const submissionsPage = practiceRoute({
  id: 'practice.cases.submissions',
  kind: 'page',
  path: '/p/[practiceId]/cases/[caseId]/submissions',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, caseId: opaqueId, notice: optionalText(z.enum(SUBMISSION_NOTICES)) }),
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
      submittable: await submittableVersion(scope, { practiceId, caseId: params.caseId, requestId: request.requestId }),
      earlier: await earlierExports(scope, { practiceId, caseId: params.caseId }),
      closed: found.state === 'closed_written_off',
      defaultFollowUpOn: defaultFollowUpOn(asOf),
      letters: canLog ? await responseDocuments(scope, { practiceId, caseId: params.caseId, requestId: request.requestId }) : NO_LETTERS,
      upload: canLog ? { canUpload: rolesPermit(access.roles, 'file.upload'), gate: await uploadGate(scope, practiceId), maxBytes: MAX_UPLOAD_BYTES } : null,
      roles: access.roles,
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
 * nothing. It is never refused because the version's pricing is no longer current: the database records the
 * check on it, and the page says it was logged and flagged. An export whose pricing went stale after it was made and
 * before its attestation is logged sent without sign-off only with the person's confirmation that it went to the payer
 * that way (sentWithoutSignOff); the database records the reason and the audit event. The confirmation is asked before
 * the service runs and checked again against what the database recorded, so a re-price committed in between never logs
 * one unconfirmed.
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
    channel: z.enum(SUBMISSION_CHANNELS, 'choose the channel'),
    reference: optionalText(z.string().max(200, 'at most 200 characters')),
    followUpOn: optionalText(isoDate),
    /** The person's confirmation that an export never attested (its pricing went stale after the export) went to the payer without sign-off. */
    sentWithoutSignOff: optionalText(z.literal('on')),
  }),
  audit: { action: 'submission_logged', objectType: 'submission' },
  handle: async ({ scope, practiceId, input, request, services }): Promise<MutationResult> => {
    const { rows: versions } = await scope.client.query<{ attested: boolean }>(
      'SELECT v.attested_by IS NOT NULL AS attested FROM packet_version v JOIN packet p ON p.id = v.packet_id WHERE v.id = $1 AND p.case_id = $2 AND v.practice_id = $3',
      [input.versionId, input.caseId, practiceId],
    );
    const version = versions[0];
    if (version === undefined) {
      throw new NotFoundError();
    }
    // An export never attested because its pricing went stale after it was made is logged only as the person says it
    // went: without sign-off. Every other unattested export is refused below, by the service and the database.
    if (!version.attested && input.sentWithoutSignOff === undefined && (await packetVersionUnattestedReason(scope.client, { practiceId, versionId: input.versionId })) !== null) {
      throw new InputError([{ field: 'sentWithoutSignOff', message: STALE_EXPORT_SUBMISSION.confirmRequired }]);
    }
    const logged = await underPacketRules(async () => {
      try {
        return await logSubmissionOnce(scope, services.keys, {
          practiceId,
          caseId: input.caseId,
          versionId: input.versionId,
          submittedOn: input.submittedOn,
          channel: input.channel,
          reference: input.reference ?? null,
          followUpOn: input.followUpOn ?? null,
          sentWithoutSignOff: input.sentWithoutSignOff === 'on',
          requestId: request.requestId,
        });
      } catch (error) {
        // The database recorded it sent without sign-off (its pricing went stale since the page was read), and the
        // person did not confirm it went that way: nothing is logged, and the form asks for the confirmation.
        if (error instanceof PacketRuleError && error.message === SENT_WITHOUT_SIGN_OFF_UNCONFIRMED) {
          throw new InputError([{ field: 'sentWithoutSignOff', message: STALE_EXPORT_SUBMISSION.confirmRequired }]);
        }
        throw error;
      }
    });
    const recorded = await loggedSubmission(scope, { practiceId, submissionId: logged.submissionId });
    const notice: SubmissionNotice =
      recorded?.sent.kind === 'unattested' ? 'logged_unattested' : recorded === undefined || recorded.check === null || recorded.check === 'current' ? 'logged' : 'logged_flagged';
    return { objectId: logged.submissionId, redirect: `/p/${practiceId}/cases/${input.caseId}/submissions?notice=${notice}` };
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
 * The refusal of a letter a response may not carry: one sentence for every case (another practice's document, one
 * still in intake, a duplicate, held or expanded, a zip's entry, another kind, a contract's source), since the form
 * offers none of them, so it answers a crafted post or a tag in another tab, and tells a post nothing about a
 * document it cannot see.
 */
export const RESPONSE_LETTER_REFUSED = 'choose the payer’s letter from the list, or upload it here';

/**
 * Records the payer's response to the case's latest submission with its letter (PRD 12: accepted,
 * partial, denied, information requested, and amounts): an accepted or partial response states what
 * the payer accepted; a denial may name its reason and, with one, reopen the case for the next dispute
 * level within its window (the database computes the window and refuses a reopen without one).
 * Recording it writes no ledger entry and moves no line (LED-01). The same response again does nothing.
 * The answer and the letter are the person's choice, refused empty; the letter must be one a response may carry
 * (scanned clean, stored, no contract's source; docs/adr/0085, D4), checked under the document's lock before the
 * response is recorded, since the database's refusal would name no field.
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
    kind: z.enum(PERSON_RESPONSE_KINDS, 'choose the payer’s answer'),
    amount: optionalDollars,
    documentId: z.uuid('choose the payer’s letter').transform((value) => value.toLowerCase()),
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
    if (!(await responseDocumentChoosable(scope, practiceId, input.documentId))) {
      throw new InputError([{ field: 'documentId', message: RESPONSE_LETTER_REFUSED }]);
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
