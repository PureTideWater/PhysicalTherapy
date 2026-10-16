import { routeHandler } from '../../../../lib/http/handler';
import { WEBHOOK_MAX_BYTES, billingWebhook } from '../../../../lib/routes/billing';
import { services } from '../../../../lib/server/services';

/**
 * Stripe's webhook (docs/adr/0050): the body is read as sent, because Stripe-Signature signs those exact
 * bytes; the route verifies it before reading anything and records each event once.
 */
export const POST = routeHandler(billingWebhook, services, { rawBody: { signatureHeader: 'stripe-signature', maxBytes: WEBHOOK_MAX_BYTES } });
