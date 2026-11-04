import { probeRefusal } from '../../../lib/auth/credential-probe';
import { routeHandler } from '../../../lib/http/handler';
import { healthCheck } from '../../../lib/routes/support';
import { services } from '../../../lib/server/services';

const databaseCheck = routeHandler(healthCheck, services);

/**
 * The load balancer's health check: 200 once the database answers on the request pool (docs/adr/0055), and 503 while
 * the process's start-up credential probe holds a refusal of the Cognito client's credential (docs/adr/0088, D8), so
 * a deploy with a wrong secret or client is rolled back before the old client is deleted.
 */
export const GET: typeof databaseCheck = async (...args) => probeRefusal(services().credentialProbe) ?? (await databaseCheck(...args));

/** Never cached or prerendered: every check asks the database. */
export const dynamic = 'force-dynamic';
