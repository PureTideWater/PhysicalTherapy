import { textHandler } from '../../../lib/http/handler';
import { securityTxtFile } from '../../../lib/routes/security';
import { services } from '../../../lib/server/services';

/** The security contact under RFC 9116 (audit item #20 (f)): the address, the expiry and the disclosure policy's page. */
export const GET = textHandler(securityTxtFile, services);

/** Rendered per request from the server's configuration, never at build time. */
export const dynamic = 'force-dynamic';
