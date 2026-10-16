import { routeHandler } from '../../../../../lib/http/handler';
import { setupIntentHandler } from '../../../../../lib/routes/billing';
import { services } from '../../../../../lib/server/services';

/** Starts Stripe Elements' SetupIntent for the organization's ACH or card (its administrator only). */
export const POST = routeHandler(setupIntentHandler, services);
