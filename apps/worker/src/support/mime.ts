/**
 * A bounded reader for the messages mailed to the support address (PRD 19, Support; docs/adr/0055): the sender's
 * address, the subject and the plain text, and whether the receiving service verified the sender. It reads
 * RFC 5322 headers (folded lines, RFC 2047 encoded words, raw UTF-8), MIME multipart bodies to a fixed depth and
 * part count, base64 and quoted-printable transfer encodings and the charsets TextDecoder knows; HTML is used only
 * when a message has no plain text, reduced to its text. Attachments are never read. Anything it cannot read is
 * null, never a guess.
 */

/** The largest message read; a larger one is unreadable (support mail is a question, not a document). */
export const MAX_MAIL_BYTES = 1_000_000;
const MAX_DEPTH = 4;
const MAX_PARTS = 50;

export interface MailHeader {
  /** Lowercased. */
  readonly name: string;
  /** Unfolded, as written (encoded words not yet decoded). */
  readonly value: string;
}

export interface ReadMail {
  readonly headers: readonly MailHeader[];
  /** The From address, lowercased; null when there is none, or more than one. */
  readonly from: string | null;
  readonly subject: string;
  /** The plain text, or null when the message has none that can be read. */
  readonly text: string | null;
}

interface Entity {
  readonly headers: readonly MailHeader[];
  /** The body as a binary string (one character per byte). */
  readonly body: string;
}

function entityOf(binary: string): Entity {
  const crlf = binary.indexOf('\r\n\r\n');
  const lf = binary.indexOf('\n\n');
  let end: number;
  let skip: number;
  if (binary.startsWith('\r\n') || binary.startsWith('\n')) {
    // No header at all: a part whose body starts at once.
    end = 0;
    skip = binary.startsWith('\r\n') ? 2 : 1;
  } else if (crlf !== -1 && (lf === -1 || crlf < lf)) {
    end = crlf;
    skip = 4;
  } else if (lf !== -1) {
    end = lf;
    skip = 2;
  } else {
    end = binary.length;
    skip = 0;
  }
  const headers: MailHeader[] = [];
  for (const line of binary.slice(0, end).split(/\r?\n/)) {
    const last = headers.at(-1);
    if (/^[ \t]/.test(line) && last !== undefined) {
      headers[headers.length - 1] = { name: last.name, value: `${last.value} ${line.trim()}` };
      continue;
    }
    const colon = line.indexOf(':');
    if (colon > 0) {
      headers.push({ name: line.slice(0, colon).trim().toLowerCase(), value: line.slice(colon + 1).trim() });
    }
  }
  return { headers, body: binary.slice(end + skip) };
}

function header(entity: { readonly headers: readonly MailHeader[] }, name: string): string | undefined {
  return entity.headers.find((item) => item.name === name)?.value;
}

/** A structured header's value and its parameters (Content-Type, Content-Disposition). */
function withParams(value: string | undefined): { readonly value: string; readonly params: ReadonlyMap<string, string> } {
  const params = new Map<string, string>();
  if (value === undefined) {
    return { value: '', params };
  }
  const [first = '', ...rest] = value.split(';');
  for (const part of rest) {
    const index = part.indexOf('=');
    if (index > 0) {
      const raw = part.slice(index + 1).trim();
      params.set(part.slice(0, index).trim().toLowerCase(), raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2 ? raw.slice(1, -1).replace(/\\(.)/g, '$1') : raw);
    }
  }
  return { value: first.trim().toLowerCase(), params };
}

function decoded(bytes: Uint8Array, charset: string | undefined): string {
  try {
    return new TextDecoder(charset ?? 'utf-8', { fatal: false }).decode(bytes);
  } catch {
    // An unknown charset label: read it as UTF-8.
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
}

const bytesOf = (binary: string) => Buffer.from(binary, 'latin1');

function quotedPrintable(binary: string, underscoreIsSpace: boolean): Uint8Array {
  const text = (underscoreIsSpace ? binary.replace(/_/g, ' ') : binary).replace(/=\r?\n/g, '');
  const out: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const hex = text.slice(index + 1, index + 3);
    if (text[index] === '=' && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      out.push(Number.parseInt(hex, 16));
      index += 2;
    } else {
      out.push(text.charCodeAt(index) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

/** A header's text: RFC 2047 encoded words decoded (adjacent ones joined), raw UTF-8 read as UTF-8. */
export function headerText(value: string): string {
  const plain = /[\u0080-ÿ]/.test(value) ? decoded(bytesOf(value), 'utf-8') : value;
  return plain
    .replace(/(=\?[^?\s]+\?[BbQq]\?[^?\s]*\?=)\s+(?==\?[^?\s]+\?[BbQq]\?[^?\s]*\?=)/g, '$1')
    .replace(/=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=/g, (_match, charset: string, encoding: string, text: string) => {
      const bytes = encoding.toUpperCase() === 'B' ? Buffer.from(text, 'base64') : quotedPrintable(text, true);
      return decoded(bytes, charset.split('*')[0]);
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function bodyText(entity: Entity, charset: string | undefined): string {
  const encoding = (header(entity, 'content-transfer-encoding') ?? '7bit').trim().toLowerCase();
  if (encoding === 'base64') {
    return decoded(Buffer.from(entity.body.replace(/[^A-Za-z0-9+/=]/g, ''), 'base64'), charset);
  }
  if (encoding === 'quoted-printable') {
    return decoded(quotedPrintable(entity.body, false), charset);
  }
  return decoded(bytesOf(entity.body), charset);
}

/** HTML's text, for a message with no plain part: scripts and styles dropped, breaks kept, tags removed. */
export function htmlText(html: string): string {
  const entities: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
  return html
    .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_match, name: string) => entities[name] ?? '');
}

function parts(body: string, boundary: string): string[] {
  const found: string[] = [];
  let current: string[] | null = null;
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trimEnd();
    if (trimmed === `--${boundary}--`) {
      if (current !== null) {
        found.push(current.join('\r\n'));
      }
      return found;
    }
    if (trimmed === `--${boundary}`) {
      if (current !== null) {
        found.push(current.join('\r\n'));
      }
      if (found.length >= MAX_PARTS) {
        return found;
      }
      current = [];
      continue;
    }
    current?.push(line);
  }
  if (current !== null) {
    found.push(current.join('\r\n'));
  }
  return found;
}

/** The entity's first readable text: plain text first, else HTML's text; attachments and enclosed messages never. */
function textOf(entity: Entity, depth: number): { readonly plain: string | null; readonly html: string | null } {
  if (withParams(header(entity, 'content-disposition')).value === 'attachment') {
    return { plain: null, html: null };
  }
  const type = withParams(header(entity, 'content-type') ?? 'text/plain; charset=us-ascii');
  if (type.value.startsWith('multipart/')) {
    const boundary = type.params.get('boundary');
    if (boundary === undefined || boundary === '' || depth >= MAX_DEPTH) {
      return { plain: null, html: null };
    }
    let html: string | null = null;
    for (const part of parts(entity.body, boundary)) {
      const found = textOf(entityOf(part), depth + 1);
      if (found.plain !== null) {
        return { plain: found.plain, html: null };
      }
      html ??= found.html;
    }
    return { plain: null, html };
  }
  if (type.value === 'text/plain' || type.value === '') {
    return { plain: bodyText(entity, type.params.get('charset')), html: null };
  }
  if (type.value === 'text/html') {
    return { plain: null, html: htmlText(bodyText(entity, type.params.get('charset'))) };
  }
  return { plain: null, html: null };
}

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const ADDRESS = /^[^\s<>"@,;:()[\]]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

/** The one address a From header names, lowercased; null for none or for several. */
export function fromAddress(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const text = headerText(value).replace(/\([^()]*\)/g, ' ');
  const angled = [...text.matchAll(/<([^<>]*)>/g)].map((match) => (match[1] ?? '').trim());
  const candidates = angled.length > 0 ? angled : text.split(',').map((part) => part.trim());
  if (candidates.length !== 1) {
    return null;
  }
  const address = candidates[0] ?? '';
  return ADDRESS.test(address) ? address.toLowerCase() : null;
}

/** Reads a message, or null when it is larger than MAX_MAIL_BYTES or has no header. */
export function readMail(bytes: Uint8Array): ReadMail | null {
  if (bytes.byteLength > MAX_MAIL_BYTES) {
    return null;
  }
  const entity = entityOf(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1'));
  if (entity.headers.length === 0) {
    return null;
  }
  const froms = entity.headers.filter((item) => item.name === 'from');
  const found = textOf(entity, 0);
  const text = found.plain ?? found.html;
  const tidied = text === null ? '' : tidy(text);
  return {
    headers: entity.headers,
    from: froms.length === 1 ? fromAddress(froms[0]?.value) : null,
    subject: headerText(header(entity, 'subject') ?? ''),
    text: tidied === '' ? null : tidied,
  };
}

/** The receiving service's name in the Authentication-Results it adds (Amazon SES). */
export const RECEIVING_SERVICE = 'amazonses.com';

function aligned(domain: string, from: string): boolean {
  const d = domain.toLowerCase().replace(/^@/, '');
  return from === d || from.endsWith(`.${d}`);
}

/**
 * Whether Amazon SES verified the sender (docs/adr/0055): SES adds its headers above the sender's, so only the
 * message's first Authentication-Results and first X-SES-Virus-Verdict are SES's; one further down could be the
 * sender's own. The virus scan passed, and DMARC passed for the From domain or DKIM passed for a domain aligned
 * with it. SPF alone checks the envelope sender, not the From address, so it is not enough.
 */
export function sesVerified(mail: ReadMail): boolean {
  if (mail.from === null) {
    return false;
  }
  const fromDomain = mail.from.slice(mail.from.indexOf('@') + 1);
  const virus = mail.headers.find((item) => item.name === 'x-ses-virus-verdict');
  if (virus?.value.trim().toUpperCase() !== 'PASS') {
    return false;
  }
  const results = mail.headers.find((item) => item.name === 'authentication-results');
  if (results === undefined) {
    return false;
  }
  const [service = '', ...methods] = results.value.split(';').map((part) => part.trim());
  if (service.toLowerCase() !== RECEIVING_SERVICE) {
    return false;
  }
  return methods.some((method) => {
    const verdict = /^(dmarc|dkim)=pass\b/i.exec(method)?.[1]?.toLowerCase();
    if (verdict === 'dmarc') {
      const domain = /\bheader\.from=([^\s;]+)/i.exec(method)?.[1];
      return domain !== undefined && domain.toLowerCase() === fromDomain;
    }
    if (verdict === 'dkim') {
      const domain = /\bheader\.(?:i|d)=([^\s;]+)/i.exec(method)?.[1];
      return domain !== undefined && aligned(domain.slice(domain.indexOf('@') + 1), fromDomain);
    }
    return false;
  });
}
