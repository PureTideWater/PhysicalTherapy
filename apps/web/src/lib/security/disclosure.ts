/**
 * The product's security contact (audit item #20 (f)): `/.well-known/security.txt` under RFC 9116 and the public
 * vulnerability-disclosure page it names as its policy (`/security`). The address and the origin come from the
 * server's configuration (SECURITY_EMAIL and APP_ORIGIN, src/lib/server/config.ts; production refuses to start
 * without the address); the expiry is a reviewed date here, which disclosure.test.ts fails on 30 days before it
 * passes, so a person reads the contact again and moves it on before a researcher would find the file stale.
 */

/** Where the disclosure page and the security.txt file are served. */
export const DISCLOSURE_PATH = '/security';
export const SECURITY_TXT_PATH = '/.well-known/security.txt';

/**
 * When the security.txt file's contents stop being current (RFC 9116, 2.5.5: less than a year ahead). Set on
 * 2026-10-20 to six months ahead; renew it, after checking the address still reaches a person, when the test says so.
 */
export const SECURITY_TXT_EXPIRES = '2027-04-30T00:00:00.000Z';

/** How many days before the expiry disclosure.test.ts fails, so the file is renewed while it is still current. */
export const SECURITY_TXT_RENEW_DAYS = 30;

/**
 * The disclosure page's parts that carry a legal commitment, by their ids in docs/product/legal-surfaces.md, and the
 * list of surfaces still waiting for their review, which a production server leaves out (src/lib/legal-surfaces.ts
 * holds both, with the screening's and the attribution cookie's).
 */
export { DISCLOSURE_LEGAL_SURFACES, LEGAL_SURFACES_AWAITING_REVIEW, showsLegalSurface } from '../legal-surfaces';

/** The one language reports are read in (Preferred-Languages, RFC 5646 tags). */
export const PREFERRED_LANGUAGES = 'en';

export interface SecurityTxtInput {
  /** The application's origin (https://<host> in staging and production). */
  readonly origin: string;
  /** The security address reports go to. */
  readonly contact: string;
  readonly expires: string;
}

/** The security.txt file: its fields in RFC 9116's order of use, each line ending in a line feed. */
export function securityTxt(input: SecurityTxtInput): string {
  const origin = new URL(input.origin).origin;
  return [
    `# The security contact of PaidWhole (RFC 9116). How to report a vulnerability, and what to expect: ${origin}${DISCLOSURE_PATH}`,
    `Contact: mailto:${input.contact}`,
    `Expires: ${input.expires}`,
    `Policy: ${origin}${DISCLOSURE_PATH}`,
    `Preferred-Languages: ${PREFERRED_LANGUAGES}`,
    `Canonical: ${origin}${SECURITY_TXT_PATH}`,
    '',
  ].join('\n');
}

/** The fields RFC 9116 defines (section 2.5), by their names in any case. */
const KNOWN_FIELDS = new Map(['Acknowledgments', 'Canonical', 'Contact', 'CSAF', 'Encryption', 'Expires', 'Hiring', 'Policy', 'Preferred-Languages'].map((name) => [name.toLowerCase(), name]));
/** Fields that hold a URI. */
const URI_FIELDS = new Set(['Acknowledgments', 'Canonical', 'Contact', 'CSAF', 'Encryption', 'Hiring', 'Policy']);
/** Fields that appear at most once (Expires exactly once). */
const SINGLE_FIELDS = new Set(['Expires', 'Preferred-Languages']);
/** RFC 3339's internet date and time, as RFC 9116 writes Expires. */
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const FIELD_LINE = /^([A-Za-z0-9-]+): (.+)$/;
/**
 * A local test server's hosts, which alone may name a web URI over plain http: the e2e suite's production build
 * listens on localhost, and a deployed server refuses any origin but https (src/lib/server/config.ts).
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

export interface ParsedSecurityTxt {
  /** Each field's values, under RFC 9116's spelling of its name. */
  readonly fields: ReadonlyMap<string, readonly string[]>;
  /** What makes the file wrong for RFC 9116, or for where it was fetched; empty when it parses. */
  readonly problems: readonly string[];
}

/**
 * Reads a security.txt file as RFC 9116 states it: comments and blank lines aside, every line is `Name: value`;
 * Contact at least once, Expires exactly once as an RFC 3339 date and time still ahead of `now`, Preferred-Languages
 * at most once; every URI field an absolute URI, a web one over https (a local test server's aside); and, given the
 * address it was fetched from, a Canonical naming that address. A field RFC 9116 does not define is reported, so a
 * misspelt one is caught.
 */
export function parseSecurityTxt(text: string, options: { readonly now: Date; readonly fetchedFrom?: string }): ParsedSecurityTxt {
  const fields = new Map<string, string[]>();
  const problems: string[] = [];
  if (!text.endsWith('\n')) {
    problems.push('the last line does not end with a line feed');
  }
  text.split('\n').forEach((raw, index) => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.trim() === '' || line.startsWith('#')) {
      return;
    }
    const match = FIELD_LINE.exec(line);
    if (match === null) {
      problems.push(`line ${String(index + 1)} is neither a field nor a comment`);
      return;
    }
    const name = KNOWN_FIELDS.get((match[1] ?? '').toLowerCase());
    if (name === undefined) {
      problems.push(`line ${String(index + 1)} names a field RFC 9116 does not define (${match[1] ?? ''})`);
      return;
    }
    fields.set(name, [...(fields.get(name) ?? []), (match[2] ?? '').trim()]);
  });
  if ((fields.get('Contact') ?? []).length === 0) {
    problems.push('no Contact field');
  }
  const expires = fields.get('Expires') ?? [];
  if (expires.length !== 1) {
    problems.push(`Expires appears ${String(expires.length)} times, not once`);
  }
  for (const name of SINGLE_FIELDS) {
    if (name !== 'Expires' && (fields.get(name) ?? []).length > 1) {
      problems.push(`${name} appears more than once`);
    }
  }
  const expiry = expires[0];
  if (expiry !== undefined) {
    if (!DATE_TIME.test(expiry) || Number.isNaN(Date.parse(expiry))) {
      problems.push('Expires is not an RFC 3339 date and time');
    } else if (Date.parse(expiry) <= options.now.getTime()) {
      problems.push('Expires has passed');
    }
  }
  for (const [name, values] of fields) {
    if (!URI_FIELDS.has(name)) {
      continue;
    }
    for (const value of values) {
      let uri: URL;
      try {
        uri = new URL(value);
      } catch {
        problems.push(`${name} is not an absolute URI`);
        continue;
      }
      if (uri.protocol === 'http:' && !LOCAL_HOSTS.has(uri.hostname)) {
        problems.push(`${name} is a web URI without https`);
      }
    }
  }
  if (options.fetchedFrom !== undefined && !(fields.get('Canonical') ?? []).includes(options.fetchedFrom)) {
    problems.push('no Canonical field names the address the file was fetched from');
  }
  return { fields, problems };
}
