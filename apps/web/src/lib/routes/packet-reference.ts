import { normalizePacketReference } from '@tp/packets';
import { type PacketVersionByReference, packetVersionsByReference } from '@tp/worker/packets';
import { z } from 'zod';

import { practiceRoute } from '../http/invoke';
import { opaqueId, optionalText } from './schemas';

/**
 * Finding a packet by the reference a payer quotes back by phone or letter (audit item #37 part 1, D5; the founder's
 * ruling of 2026-10-20; docs/adr/0061; test matrix CAS-28). The reference is typed as a person reads it (lower case,
 * no hyphen, O for 0, I or L for 1) and read back in its printed form; the practice's approved versions whose
 * reference it is are found in the practice's own scope (packet_version is FORCE ROW LEVEL SECURITY, and the lookup
 * names the practice again), every one of them, since nothing makes a reference unique. A reference not in the
 * printed form is refused with its form. Everyone who opens the practice may look one up, as on the submissions page.
 */

/** What a reference looks like, said when one typed is not. */
export const REFERENCE_FORMAT = 'A packet’s reference is ten letters and digits, printed in two groups of five such as SK6CS-K6CSK (the letters I, L, O and U are not used).';

export interface ByReferencePageData {
  readonly practiceId: string;
  /** The reference as typed, when one was. */
  readonly asked: string | null;
  /** The reference in its printed form, when the one typed reads as one. */
  readonly reference: string | null;
  /** Why the reference typed was refused (its form). */
  readonly refused: string | null;
  readonly matches: readonly PacketVersionByReference[];
}

export const caseByReferencePage = practiceRoute({
  id: 'practice.cases.by_reference',
  kind: 'page',
  path: '/p/[practiceId]/cases/by-reference',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, reference: optionalText(z.string().max(64)).catch(undefined) }),
  handle: async ({ scope, practiceId, params }): Promise<ByReferencePageData> => {
    if (params.reference === undefined) {
      return { practiceId, asked: null, reference: null, refused: null, matches: [] };
    }
    const reference = normalizePacketReference(params.reference);
    if (reference === null) {
      return { practiceId, asked: params.reference, reference: null, refused: REFERENCE_FORMAT, matches: [] };
    }
    return { practiceId, asked: params.reference, reference, refused: null, matches: await packetVersionsByReference(scope, { practiceId, reference }) };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, reference: 'sk6cs k6csk' }) },
});

export const PACKET_REFERENCE_ROUTES = [caseByReferencePage] as const;
