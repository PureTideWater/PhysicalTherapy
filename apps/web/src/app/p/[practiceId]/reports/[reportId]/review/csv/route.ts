import { downloadHandler } from '../../../../../../../lib/http/handler';
import { reviewCsv } from '../../../../../../../lib/routes/reports';
import { services } from '../../../../../../../lib/server/services';

/** The line CSV for the reimbursement reviewer signing over its SHA-256 (read-only); the download is recorded. */
export const dynamic = 'force-dynamic';
export const GET = downloadHandler(reviewCsv, services);
