import { downloadHandler } from '../../../../../../lib/http/handler';
import { reportPdf } from '../../../../../../lib/routes/reports';
import { services } from '../../../../../../lib/server/services';

/** An audit report's PDF, checked against its SHA-256; the download is recorded. */
export const dynamic = 'force-dynamic';
export const GET = downloadHandler(reportPdf, services);
