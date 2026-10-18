import { downloadHandler } from '../../../../../../lib/http/handler';
import { uploadReport } from '../../../../../../lib/routes/uploads';
import { services } from '../../../../../../lib/server/services';

/** An upload's receipt as CSV (for a zip, a line per file in it). */
export const dynamic = 'force-dynamic';
export const GET = downloadHandler(uploadReport, services);
