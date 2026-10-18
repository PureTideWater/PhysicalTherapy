import { routeHandler } from '../../../../../lib/http/handler';
import { completeUpload } from '../../../../../lib/routes/uploads';
import { services } from '../../../../../lib/server/services';

/** An Uploads API step (JSON); the registered route does the work. */
export const dynamic = 'force-dynamic';
export const POST = routeHandler(completeUpload, services);
