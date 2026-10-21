import { rolesPermit } from '@tp/db/runtime';
import { centsToString, parseAmount } from '@tp/money';
import { adjustEntry } from '@tp/worker/ledger';
import { PacketRefusedError, PacketRuleError, type RegulationAwaiting, confirmRegulation, regulationsAwaiting } from '@tp/worker/packets';
import { z } from 'zod';

import { practiceRoute } from '../http/invoke';
import { type ListPage, pageParam } from '../http/paging';
import { InputError, type MutationResult, NotFoundError } from '../http/route';
import { type EntryView, type LinkageLine, type TotalsView, reconciliation } from '../reconciliation/queries';
import { manual } from './reconciliation';
import { opaqueId } from './schemas';

/**
 * The contract specialist's review inside a practice, under a support grant like the rest of their work
 * there (docs/adr/0028 and 0047):
 *
 * - Regulations to confirm (PRD 2, step 5: "A reimbursement specialist confirms the regulation's
 *   application to each case before a packet goes out"; Rules reference, Medicare Advantage
 *   non-contracting): each packet's current version that cites the regulation and waits for the
 *   confirmation the database requires before anyone approves it. The page and the action are the
 *   specialist's workspace (rate_record.edit, as the abstraction screens are); confirming needs the
 *   platform permission pricing.answer too, which @tp/worker/packets and the database check, in the
 *   specialist's own name, with an audit event.
 * - Ledger corrections (PRD 13, Entries: "adjusted | A specialist corrects an amount after review, with
 *   a reason | The user action | Signed"): the ledger's totals, the shortfalls a payer response left
 *   (an approval its remittance paid in part) and the entries, each standing one with its correction.
 *   ledger.adjust, which only the contract specialist holds, here, in @tp/worker/ledger and in Postgres,
 *   which keeps every correction between zero and what its entry's evidence shows.
 *
 * Opaque IDs, amounts, stages and dates only: the specialist reads no line's code or date of service,
 * and no person's reason.
 */

export const SPECIALIST_NOTICES = ['confirmed', 'adjusted'] as const;
export type SpecialistNotice = (typeof SPECIALIST_NOTICES)[number];

/** A regulation to confirm as the page shows it: the shortfall as text cents. */
export interface RegulationView extends Omit<RegulationAwaiting, 'varianceCents'> {
  readonly varianceCents: string;
}

export interface RegulationsPageData {
  readonly practiceId: string;
  readonly waiting: readonly RegulationView[];
  readonly notice: SpecialistNotice | null;
}

export const regulationsPage = practiceRoute({
  id: 'practice.abstraction.regulations',
  kind: 'page',
  path: '/p/[practiceId]/abstraction/regulations',
  phi: true,
  permission: 'rate_record.edit',
  params: z.object({ practiceId: opaqueId, notice: z.enum(SPECIALIST_NOTICES).optional().catch(undefined) }),
  handle: async ({ scope, practiceId, params }): Promise<RegulationsPageData> => ({
    practiceId,
    waiting: (await regulationsAwaiting(scope, { practiceId })).map((item) => ({ ...item, varianceCents: centsToString(item.varianceCents) })),
    notice: params.notice ?? null,
  }),
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

/** What a confirmation does, stated before it is made (PRD 7: every consequential action says what it does). */
export const CONFIRMATION_CONSEQUENCE =
  'Confirming records, in your name and now, that the cited regulation applies to this case as the packet states it; the packet can then be approved by a person who approves packets. It is recorded once, on this version only: an edit writes a new version, which waits for a confirmation of its own.';

export const confirmRegulationAction = practiceRoute({
  id: 'practice.abstraction.regulations.confirm',
  kind: 'action',
  path: '/p/[practiceId]/abstraction/regulations/confirm',
  phi: true,
  permission: 'rate_record.edit',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ versionId: opaqueId, confirm: z.literal('on', 'confirm the regulation applies to the case') }),
  audit: { action: 'packet_regulation_confirmed', objectType: 'packet_version' },
  handle: async ({ scope, practiceId, input, request }): Promise<MutationResult> => {
    try {
      await confirmRegulation(scope, { practiceId, versionId: input.versionId, requestId: request.requestId });
    } catch (error) {
      if (error instanceof PacketRefusedError) {
        throw new NotFoundError();
      }
      if (error instanceof PacketRuleError) {
        throw new InputError([{ field: 'versionId', message: error.message }]);
      }
      throw error;
    }
    return { objectId: input.versionId, redirect: `/p/${practiceId}/abstraction/regulations?notice=confirmed` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ versionId: refs.regulationVersionId, confirm: 'on' }) },
});

export interface LedgerReviewPageData {
  readonly practiceId: string;
  readonly totals: TotalsView;
  /** The case lines with a shortfall, each with its entries. */
  readonly shortfalls: readonly LinkageLine[];
  readonly entries: ListPage<EntryView>;
  readonly canAdjust: boolean;
  readonly notice: SpecialistNotice | null;
}

export const ledgerReviewPage = practiceRoute({
  id: 'practice.abstraction.ledger',
  kind: 'page',
  path: '/p/[practiceId]/abstraction/ledger',
  phi: true,
  permission: 'ledger.adjust',
  // The Reconciliation screen's own reads: one snapshot, the totals agreeing with the lines and entries beside them.
  oneSnapshot: true,
  params: z.object({ practiceId: opaqueId, lines: pageParam, entries: pageParam, notice: z.enum(SPECIALIST_NOTICES).optional().catch(undefined) }),
  handle: async ({ scope, practiceId, params, access, request, services }): Promise<LedgerReviewPageData> => {
    const data = await reconciliation(scope, services, practiceId, { caseId: null, linesPage: params.lines, entriesPage: params.entries }, false, request.requestId);
    return {
      practiceId,
      totals: data.totals,
      shortfalls: data.linkage.items.filter((line) => line.shortfallCents !== null),
      entries: data.entries,
      canAdjust: rolesPermit(access.roles, 'ledger.adjust'),
      notice: params.notice ?? null,
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

/** What an adjustment does, stated before it is confirmed (PRD 7: "every destructive action ... confirms with the consequence stated"). */
export const ADJUSTMENT_CONSEQUENCE =
  'Adjusting writes a new entry in your name with your reason that changes this entry’s amount by what you enter; the entry itself never changes, and an adjustment is undone only by reversing its match. The ledger keeps it between zero and what the entry’s evidence shows (the row’s amount for a posting or a deposit, the entry’s own amount for an approval, a recoupment or interest), and a line’s posted and deposited never above what was approved for it. The totals and the line’s stage follow the ledger.';

const DOLLARS = /^-?\d{1,9}(?:\.\d{1,2})?$/;

/**
 * Corrects a ledger entry's amount after review, with the specialist's reason and confirmation: for
 * example an approval a payer response made that the payer's remittance paid in part (the shortfall
 * the page shows). The amount is the change, in dollars and cents, signed.
 */
export const adjustEntryAction = practiceRoute({
  id: 'practice.abstraction.ledger.adjust',
  kind: 'action',
  path: '/p/[practiceId]/abstraction/ledger/adjust',
  phi: true,
  permission: 'ledger.adjust',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({
    entryId: opaqueId,
    amount: z.string().trim().regex(DOLLARS, 'the change in dollars and cents, with a minus sign to lower the amount'),
    reason: z.string().trim().min(1, 'say why the amount is corrected').max(2000, 'at most 2,000 characters'),
    confirm: z.literal('on', 'confirm what an adjustment does'),
  }),
  audit: { action: 'reconciliation_adjustment', objectType: 'ledger_entry' },
  handle: async ({ scope, practiceId, input, services, request }): Promise<MutationResult> => {
    const amountCents = parseAmount(input.amount);
    const { entryId } = await manual(scope, services, practiceId, request.requestId, (context) => adjustEntry(context, { practiceId, entryId: input.entryId, amountCents, reason: input.reason }), {
      not_standing: { field: 'entryId', message: 'the entry, or the match it came from, was reversed; it is never adjusted again' },
    }).catch((error: unknown) => {
      // The ledger's bounds (Postgres): the correction would take the entry outside what its evidence shows.
      if (error instanceof Error && 'code' in error && error.code === '23514') {
        throw new InputError([{ field: 'amount', message: error.message }]);
      }
      throw error;
    });
    return { objectId: entryId, redirect: `/p/${practiceId}/abstraction/ledger?notice=adjusted` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ entryId: refs.adjustableEntryId, amount: '-0.01', reason: 'SYNTHETIC specialist review', confirm: 'on' }) },
});

export const SPECIALIST_ROUTES = [regulationsPage, confirmRegulationAction, ledgerReviewPage, adjustEntryAction] as const;
