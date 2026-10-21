'use server';

import { refusalState } from '../../../../../../../../lib/cases/refusals';
import { type ActionState, runAction } from '../../../../../../../../lib/http/next';
import { attestPacketExportAction } from '../../../../../../../../lib/routes/packets';

/** The reimbursement reviewer attests a packet's export over its files' SHA-256 (D16; docs/adr/0061). */
export async function attestPacketFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return refusalState(await runAction(attestPacketExportAction, form, { practiceId: form.get('practiceId') }));
}
