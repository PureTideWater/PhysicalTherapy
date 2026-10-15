import { downloadHandler } from '../../../../../../lib/http/handler';
import { reportCsv } from '../../../../../../lib/routes/reports';
import { services } from '../../../../../../lib/server/services';

/** An audit report's line CSV (line-level PHI, for the roles that export it), checked against its SHA-256; the download is recorded. */
export const dynamic = 'force-dynamic';
export const GET = downloadHandler(reportCsv, services);
