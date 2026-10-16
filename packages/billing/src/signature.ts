import { createHmac, timingSafeEqual } from 'node:crypto';

import { WebhookSignatureError } from './types';

/**
 * Stripe's webhook signature scheme (the Stripe-Signature header: `t=<unix seconds>,v1=<hex HMAC-SHA256 of
 * "<t>.<payload>" under the endpoint's secret>`), for the local simulator, which signs its events the way
 * Stripe does so the webhook route verifies both the same way. The Stripe implementation verifies with the
 * SDK's own constructEvent. A timestamp outside the tolerance is refused, so a captured delivery cannot be
 * replayed later (and a replay inside it changes nothing: events are recorded once by ID).
 */

/** Stripe's default tolerance, in seconds. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

function digest(secret: string, timestamp: number, payload: string): string {
  return createHmac('sha256', secret).update(`${String(timestamp)}.${payload}`, 'utf8').digest('hex');
}

/** The header for a payload, signed now (or at `at`). */
export function signPayload(secret: string, payload: string, at: Date = new Date()): string {
  const timestamp = Math.floor(at.getTime() / 1000);
  return `t=${String(timestamp)},v1=${digest(secret, timestamp, payload)}`;
}

/** Throws WebhookSignatureError unless the header signs the payload under the secret, within the tolerance. */
export function verifySignature(secret: string, payload: string, header: string | null, now: Date = new Date(), tolerance = SIGNATURE_TOLERANCE_SECONDS): void {
  if (header === null || header.length > 1024) {
    throw new WebhookSignatureError('no signature');
  }
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [name, value] = part.split('=', 2);
    if (name === 't' && value !== undefined && /^\d{1,12}$/.test(value)) {
      timestamp = Number.parseInt(value, 10);
    } else if (name === 'v1' && value !== undefined && /^[0-9a-f]{64}$/.test(value)) {
      signatures.push(value);
    }
  }
  if (timestamp === null || signatures.length === 0) {
    throw new WebhookSignatureError('the signature header has no timestamp or no v1 signature');
  }
  if (Math.abs(Math.floor(now.getTime() / 1000) - timestamp) > tolerance) {
    throw new WebhookSignatureError('the signature is outside the tolerance');
  }
  const expected = Buffer.from(digest(secret, timestamp, payload), 'hex');
  if (!signatures.some((signature) => timingSafeEqual(Buffer.from(signature, 'hex'), expected))) {
    throw new WebhookSignatureError('no signature matches');
  }
}
