import { downloadHandler } from '../../../../../../../lib/http/handler';
import { roiStatementPdf } from '../../../../../../../lib/routes/roi';
import { services } from '../../../../../../../lib/server/services';

/** An ROI statement's PDF, checked against its SHA-256; the download is audited. */
export const dynamic = 'force-dynamic';
export const GET = downloadHandler(roiStatementPdf, services);
