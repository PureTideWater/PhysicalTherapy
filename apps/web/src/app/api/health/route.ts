import { routeHandler } from '../../../lib/http/handler';
import { healthCheck } from '../../../lib/routes/support';
import { services } from '../../../lib/server/services';

/** The load balancer's health check: 200 once the database answers on the request pool (docs/adr/0055). */
export const GET = routeHandler(healthCheck, services);

/** Never cached or prerendered: every check asks the database. */
export const dynamic = 'force-dynamic';
