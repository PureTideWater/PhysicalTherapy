/**
 * When the web received a request (decision 14; docs/adr/0062, "Metrics and alarms"): the proxy (src/proxy.ts) stamps
 * it on the request it passes on, at header time, before a server action reads its body, so the screening's time to
 * email (TimeToEmailMs) covers the web's whole share of an upload: Next's multipart parsing of up to 11 MB, the form's
 * copy, the input's schema and the rate limit, not only what the handler does after them. The proxy always writes the
 * header, over any copy the client sent, so no browser can move the start of its own measurement; a page or action
 * reached without the proxy (a route test) has none and the handler takes its own clock.
 */

/** The request header the proxy writes: the server's Date.now() when the request arrived, in milliseconds. */
export const RECEIVED_AT_HEADER = 'x-tp-received-at';

/** A stamp is Date.now() in decimal milliseconds: digits only, at most 15 of them (no sign, exponent or fraction). */
const STAMP = /^[0-9]{1,15}$/;

/** The proxy's stamp for a request arriving now. */
export function receivedStamp(now: number = Date.now()): string {
  return String(Math.trunc(now));
}

/**
 * The stamp the proxy wrote, read back as a time, or null when there is none or it is not a stamp (the handler then
 * takes its own clock). Never later than `now`: the proxy stamped it before the handler ran on the same clock.
 */
export function receivedAtFrom(value: string | null | undefined, now: Date = new Date()): Date | null {
  if (value === null || value === undefined || !STAMP.test(value)) {
    return null;
  }
  const at = Number(value);
  return Number.isSafeInteger(at) && at <= now.getTime() ? new Date(at) : null;
}
