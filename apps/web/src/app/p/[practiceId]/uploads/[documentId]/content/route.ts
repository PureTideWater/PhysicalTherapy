import { routeHandler } from '../../../../../../lib/http/handler';
import { uploadContent } from '../../../../../../lib/routes/uploads';
import { services } from '../../../../../../lib/server/services';

/** The local upload receiver (development and the e2e suite): the PUT's body streams through, sealed as it arrives. */
export const dynamic = 'force-dynamic';
export const PUT = routeHandler(uploadContent, services);
