import { downloadHandler } from '../../../../../../../../lib/http/handler';
import { packetPdf } from '../../../../../../../../lib/routes/packets';
import { services } from '../../../../../../../../lib/server/services';

/** A packet version's exported PDF, checked against its SHA-256; the download is an audited line-level export. */
export const dynamic = 'force-dynamic';
export const GET = downloadHandler(packetPdf, services);
