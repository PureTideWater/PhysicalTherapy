import { downloadHandler } from '../../../../../../../lib/http/handler';
import { reportDocumentCsvRoute } from '../../../../../../../lib/routes/report-documents';
import { services } from '../../../../../../../lib/server/services';

/** A coverage report's or monthly summary's CSV, from its stored figures; the download is audited. */
export const dynamic = 'force-dynamic';
export const GET = downloadHandler(reportDocumentCsvRoute, services);
