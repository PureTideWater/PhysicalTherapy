import { downloadHandler } from '../../../../../../../../lib/http/handler';
import { packetCsv } from '../../../../../../../../lib/routes/packets';
import { services } from '../../../../../../../../lib/server/services';

/** A packet version's exported CSV schedule, checked against its SHA-256; the download is an audited line-level export. */
export const dynamic = 'force-dynamic';
export const GET = downloadHandler(packetCsv, services);
