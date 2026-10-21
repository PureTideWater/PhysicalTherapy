import { downloadHandler } from '../../../../../../../../../lib/http/handler';
import { reviewPacketCsv } from '../../../../../../../../../lib/routes/packets';
import { services } from '../../../../../../../../../lib/server/services';

/** The exported CSV schedule for the reimbursement reviewer attesting over its SHA-256 (read-only); the download is an audited line-level export. */
export const dynamic = 'force-dynamic';
export const GET = downloadHandler(reviewPacketCsv, services);
