import { PRIVATE_NO_STORE, routeHandler } from '../../../../lib/http/handler';
import { screeningOpened } from '../../../../lib/screening/routes';
import { services } from '../../../../lib/server/services';

/**
 * The result page's opened signal (POST, JSON { resultId }; docs/adr/0062): the registered route does the work, and
 * this answers 204 with no body whatever it found, so an answer says nothing about a link.
 */
export const dynamic = 'force-dynamic';

const handle = routeHandler(screeningOpened, services);

export async function POST(request: Request): Promise<Response> {
  await handle(request);
  return new Response(null, { status: 204, headers: { 'cache-control': PRIVATE_NO_STORE } });
}
