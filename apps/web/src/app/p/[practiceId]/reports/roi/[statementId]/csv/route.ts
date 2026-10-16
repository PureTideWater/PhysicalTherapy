import { downloadHandler } from '../../../../../../../lib/http/handler';
import { roiStatementCsv } from '../../../../../../../lib/routes/roi';
import { services } from '../../../../../../../lib/server/services';

/** An ROI statement's CSV: each figure and the entries it sums; the download is audited. */
export const dynamic = 'force-dynamic';
export const GET = downloadHandler(roiStatementCsv, services);
