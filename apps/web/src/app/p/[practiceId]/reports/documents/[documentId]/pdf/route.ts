import { downloadHandler } from '../../../../../../../lib/http/handler';
import { reportDocumentPdfRoute } from '../../../../../../../lib/routes/report-documents';
import { services } from '../../../../../../../lib/server/services';

/** A coverage report's or monthly summary's PDF, checked against its SHA-256; the download is audited. */
export const dynamic = 'force-dynamic';
export const GET = downloadHandler(reportDocumentPdfRoute, services);
