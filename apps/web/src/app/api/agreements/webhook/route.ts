import { routeHandler } from '../../../../lib/http/handler';
import { ESIGN_SIGNATURE_HEADER, ESIGN_WEBHOOK_MAX_BYTES, agreementWebhook } from '../../../../lib/routes/onboarding';
import { services } from '../../../../lib/server/services';

/**
 * The e-signature vendor's webhook (docs/adr/0053): the body is read as sent, because the vendor's signature
 * signs those exact bytes; the route verifies it before reading anything, fetches the signed document, hashes it
 * and records the agreement once per event.
 */
export const POST = routeHandler(agreementWebhook, services, { rawBody: { signatureHeader: ESIGN_SIGNATURE_HEADER, maxBytes: ESIGN_WEBHOOK_MAX_BYTES } });
