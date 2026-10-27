import { textPhiFindings } from '@tp/observability';
import { z } from 'zod';

import { opaqueId } from '../routes/schemas';
import { retryMinutes } from './rate-limit';
import type { Outcome, ReturnPage, ReturnTo } from './route';
import { signInFor } from './sign-in-for';

/**
 * A download's refusal, told on the page it was opened from (docs/adr/0079; test matrix DLR-01 to DLR-03). A browser
 * navigation to a download route (a GET form, a link) that the route refuses is answered with 303 to the page the
 * route names (its returnTo), carrying closed codes only: refused=<status>, fields=<a,b> for invalid, retry=<minutes>
 * for a rate limit, and the values that page keeps, each validated with the page's own schema. The page reads them
 * back with downloadRefusal() and says the refusal in its own words, never text from the URL, so a crafted link cannot
 * put words in the product's frame. The writer and the reader of that query are both here, so they never differ; a
 * script's request keeps the JSON outcome (handler.ts).
 */

/** The refusals a page shows beside its download: the closed list refused= carries. */
export const DOWNLOAD_REFUSALS = ['invalid', 'not_found', 'forbidden', 'rate_limited', 'suspended', 'duplicate', 'csrf_refused'] as const;

export type DownloadRefusalStatus = (typeof DOWNLOAD_REFUSALS)[number];

/** The refusals that go where a page's refusal goes (sign-in, the terms of use, maintenance: signInFor), never back to the page. */
export const SIGNED_OUT_REFUSALS = ['unauthenticated', 'mfa_required', 'hardware_key_required', 'terms_required', 'maintenance'] as const;

/** A refused field's name as fields= carries it: a parameter or input name, never a dotted path, a value or a message. */
export const REFUSED_FIELD = /^[a-z][A-Za-z0-9_]{0,39}$/;

/** At most this many refused fields are carried; a refusal naming more is cut to its first. */
export const MAX_REFUSED_FIELDS = 8;

/** The longest wait retry= carries, in whole minutes (a day). */
export const MAX_RETRY_MINUTES = 1440;

/** The query parameters the refusal itself takes; a kept value never takes one. */
const REFUSAL_KEYS: ReadonlySet<string> = new Set(['refused', 'fields', 'retry']);

/** A kept value's name: a lowercase code, as the PHI guard holds every query parameter name to. */
const KEPT_KEY = /^[a-z][a-z0-9_]{0,39}$/;

/** The raw path and query parameters a returnTo reads. */
export type ReturnParams = Parameters<ReturnTo>[0];

type Refused = Exclude<Outcome<unknown>, { readonly status: 'ok' }>;

function isDownloadRefusal(outcome: Refused): outcome is Extract<Refused, { readonly status: DownloadRefusalStatus }> {
  return (DOWNLOAD_REFUSALS as readonly string[]).includes(outcome.status);
}

/** The names fields= carries: those that match, each once, at most eight. */
function refusedFields(names: readonly string[]): string[] {
  return [...new Set(names.filter((name) => REFUSED_FIELD.test(name)))].slice(0, MAX_REFUSED_FIELDS);
}

/** The minutes, as a refusal's sentence says them ("1 minute", "3 minutes"); guardMessage and DownloadRefusal both say them so. */
export function minutesWords(minutes: number): string {
  return `${String(minutes)} minute${minutes === 1 ? '' : 's'}`;
}

/**
 * Whether a return page's path may go in a Location: one '/' and then route words and opaque IDs only (no '\', no
 * '//', no '%', no ':', no control character, no query or fragment), unchanged when resolved against the application's
 * origin and on that origin. A path that fails sends the navigation to '/'.
 */
export function safeReturnPath(path: string, origin: string): boolean {
  if (!/^(?:\/[A-Za-z0-9._~-]+)+$/.test(path)) {
    return false;
  }
  try {
    const resolved = new URL(path, origin);
    return resolved.origin === origin && resolved.pathname === path;
  } catch {
    return false;
  }
}

/**
 * The Location a browser navigation's refusal of a download is sent to (a relative one; RFC 9110): where a page's
 * refusal goes for the signed-out statuses (signInFor); otherwise the route's page with refused=, fields= for invalid,
 * retry= for a rate limit and the page's kept values, encoded with URLSearchParams. A kept value whose name is not a
 * lowercase code, that takes a refusal key, or that holds an identifier's shape (the PHI guard's: nine digits, a date,
 * a phone number ...) is dropped. No page, or a path that is not safe, is '/' (the home picks the practice).
 */
export function refusalLocation(outcome: Refused, page: ReturnPage | null, origin: string): string {
  const signIn = signInFor(outcome);
  if (signIn !== undefined) {
    return signIn;
  }
  if (page === null || !isDownloadRefusal(outcome) || !safeReturnPath(page.path, origin)) {
    return '/';
  }
  const query = new URLSearchParams({ refused: outcome.status });
  if (outcome.status === 'invalid') {
    const fields = refusedFields(outcome.issues.map((issue) => issue.field));
    if (fields.length > 0) {
      query.set('fields', fields.join(','));
    }
  }
  if (outcome.status === 'rate_limited') {
    const minutes = retryMinutes(outcome.retryAfterSeconds);
    query.set('retry', String(Number.isFinite(minutes) ? Math.min(MAX_RETRY_MINUTES, minutes) : MAX_RETRY_MINUTES));
  }
  for (const [key, value] of Object.entries(page.keep ?? {})) {
    if (KEPT_KEY.test(key) && !REFUSAL_KEYS.has(key) && textPhiFindings(value).length === 0) {
      query.set(key, value);
    }
  }
  return `${page.path}?${query.toString()}`;
}

/** What a page shows for a refused download (downloadRefusal()). */
export interface RefusedDownload {
  readonly status: DownloadRefusalStatus;
  /** For invalid: the refused fields' names; the page says the ones it knows in its own words and ignores the rest. */
  readonly fields: readonly string[];
  /** For rate_limited: the whole minutes to wait, or null when the link carries none. */
  readonly retryMinutes: number | null;
}

/**
 * The refusal's query as a page's schema reads it (docs/adr/0079): each key optional, and anything malformed (an
 * unknown code, a repeated key, a field that is not a name, a wait out of range) absent, never a refusal of the page.
 */
export const downloadRefusalParams = z.object({
  refused: z.enum(DOWNLOAD_REFUSALS).optional().catch(undefined),
  fields: z.string().max(400).transform((value) => refusedFields(value.split(','))).optional().catch(undefined),
  retry: z
    .string()
    .regex(/^\d{1,4}$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(MAX_RETRY_MINUTES))
    .optional()
    .catch(undefined),
});

/**
 * A page's refused download, from its search parameters (props.searchParams, awaited): the status from the closed
 * list, the refused fields for invalid and the wait for a rate limit, or null when there is none. Display only: no
 * read and no audit event, so it is parsed in the page rather than its route.
 */
export function downloadRefusal(searchParams: Readonly<Record<string, string | string[] | undefined>> | undefined): RefusedDownload | null {
  const parsed = downloadRefusalParams.safeParse(searchParams ?? {});
  if (!parsed.success || parsed.data.refused === undefined) {
    return null;
  }
  const status = parsed.data.refused;
  return {
    status,
    fields: status === 'invalid' ? (parsed.data.fields ?? []) : [],
    retryMinutes: status === 'rate_limited' ? (parsed.data.retry ?? null) : null,
  };
}

const ROUTE_WORD = /^[a-z][a-z0-9-]*$/;
const PATH_PARAMETER = /^\[(\w+)\]$/;

/**
 * A page's path for a returnTo, from its route constant ('/p/[practiceId]/coverage', as a route's path is written) and
 * the request's raw parameters: each [name] the parameter of that name when it passes opaqueId (lowercased), or null
 * when one does not. A template that is not route words and [name] parameters is a programming error, thrown.
 */
export function pagePath(template: string, params: ReturnParams): string | null {
  const segments = template.split('/');
  if (segments[0] !== '' || segments.length < 2) {
    throw new Error(`a return page is an absolute route path: ${template}`);
  }
  const path: string[] = [];
  for (const segment of segments.slice(1)) {
    const name = PATH_PARAMETER.exec(segment)?.[1];
    if (name === undefined) {
      if (!ROUTE_WORD.test(segment)) {
        throw new Error(`a return page's path is route words and [id] parameters: ${template}`);
      }
      path.push(segment);
      continue;
    }
    const id = opaqueId.safeParse(params[name]);
    if (!id.success) {
      return null;
    }
    path.push(id.data);
  }
  return `/${path.join('/')}`;
}

/**
 * A returnTo's page: pagePath(template, params), and the values the page keeps, each the result of a kept*() check
 * (an undefined one is dropped); null when the path's parameters are not opaque IDs.
 */
export function returnPage(template: string, params: ReturnParams, keep: Readonly<Record<string, string | undefined>> = {}): ReturnPage | null {
  const path = pagePath(template, params);
  if (path === null) {
    return null;
  }
  const kept = Object.fromEntries(Object.entries(keep).filter((entry): entry is [string, string] => entry[1] !== undefined));
  return Object.keys(kept).length === 0 ? { path } : { path, keep: kept };
}

/**
 * The page a link was on, from its ?from=<value>, when the value is one of the route's closed list; undefined (the
 * route's default page) for a missing or unknown one. The route's params schema never sees it (z.object strips it).
 */
export function cameFrom<const T extends string>(params: ReturnParams, values: readonly T[]): T | undefined {
  return values.find((value) => value === params.from);
}

/** A kept opaque ID (a payer, a contract), as the page's opaqueId reads it, or undefined. */
export function keptId(value: string | undefined): string | undefined {
  const id = opaqueId.safeParse(value);
  return id.success ? id.data : undefined;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A kept month of service (YYYY-MM, trimmed as the page's optionalText reads it), or undefined. */
export function keptMonth(value: string | undefined): string | undefined {
  const month = value?.trim();
  return month !== undefined && MONTH.test(month) ? month : undefined;
}

const CODES = /^[A-Za-z0-9\s,;]{1,400}$/;

/**
 * Kept procedure codes as typed (trimmed): letters, digits and the separators only, at most 400 characters, each token
 * at most ten, so a mistyped code comes back to its field and nothing longer or of another alphabet does; or undefined.
 */
export function keptCodes(value: string | undefined): string | undefined {
  const codes = value?.trim();
  if (codes === undefined || !CODES.test(codes)) {
    return undefined;
  }
  return codes.split(/[\s,;]+/).every((token) => token.length <= 10) ? codes : undefined;
}
