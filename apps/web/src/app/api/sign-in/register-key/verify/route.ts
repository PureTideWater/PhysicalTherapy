import { routeHandler } from '../../../../../lib/http/handler';
import { registerHardwareKey } from '../../../../../lib/routes/sign-in';
import { services } from '../../../../../lib/server/services';

/** A hardware-key ceremony step (JSON); the registered route does the work. */
export const dynamic = 'force-dynamic';
export const POST = routeHandler(registerHardwareKey, services);
