import { createHash } from 'node:crypto';
import { closeSync, createReadStream, openSync, readSync } from 'node:fs';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream';
import { createGunzip } from 'node:zlib';

/**
 * An image's identity read from its saved archive (docs/adr/0062; docs/adr/0066, Part 3): `docker save`'s output or a
 * buildx `type=docker` export, plain or gzipped. The identity is computed from content, never taken from a name or from
 * a store: the config blob's bytes are hashed as they pass and must equal the digest the archive names for them.
 *
 * Three digests:
 * - `config`, the image's config blob: the image ID on Docker's classic store, and what the registry's manifest names;
 * - `manifest`, the linux/amd64 image manifest's;
 * - `target`, the digest of index.json's one top-level descriptor, which the containerd image store's `.Id` names (an
 *   index when the image carries attestations, the manifest when it does not).
 * `manifest` and `target` are absent for an archive with no index.json (Docker before 25).
 *
 * It imports only node: modules, so `node tools/screening-capacity/image-id.ts <archive>` runs with no install (the
 * release's build job runs it before anything is installed), printing the three as JSON.
 */

export interface ImageIdentity {
  readonly config: string;
  readonly manifest?: string;
  readonly target?: string;
}

/** An archive this reader refuses, with why. */
export class ImageArchiveError extends Error {
  override readonly name = 'ImageArchiveError';
}

/**
 * The largest regular file hashed as it passes: index.json, manifest.json, configs and manifests are far smaller, and
 * the layers above it pass through unhashed. Of these, only a JSON document's bytes are kept to be parsed (the first
 * byte that is not white space is `{` or `[`); a small layer's are hashed and dropped.
 */
const KEPT_BYTES = 4 * 1024 * 1024;
/**
 * The largest pax header ('x'), pax global header ('g') or GNU long name ('L') accepted, refused from its header before
 * any of it is read: 'x' and 'L' are read into memory, since they apply to the entry after them; 'g' is skipped.
 */
const METADATA_LIMIT = 1024 * 1024;
/** The most bytes kept in memory across every entry: the JSON documents, pax headers and long names together. */
const KEPT_LIMIT = 64 * 1024 * 1024;

/** The metadata entries, by type flag, as a refusal names them. */
const METADATA: ReadonlyMap<string, string> = new Map([
  ['x', 'a pax header'],
  ['g', 'a pax global header'],
  ['L', 'a GNU long name'],
]);

const BLOCK = 512;

const INDEX_TYPES = new Set(['application/vnd.oci.image.index.v1+json', 'application/vnd.docker.distribution.manifest.list.v2+json']);
const MANIFEST_TYPES = new Set(['application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json']);

interface Entry {
  readonly sha256: string;
  readonly bytes: Buffer;
}

/** A NUL-terminated header field. */
function field(header: Buffer, start: number, length: number): string {
  const raw = header.subarray(start, start + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? raw.length : end).toString('utf8');
}

/** A header's size: octal digits, or GNU's base-256 form when the first byte's high bit is set. */
function entrySize(header: Buffer): number {
  const raw = header.subarray(124, 136);
  if (((raw[0] ?? 0) & 0x80) !== 0) {
    let size = 0;
    for (const [index, byte] of raw.entries()) size = size * 256 + (index === 0 ? byte & 0x7f : byte);
    return size;
  }
  const text = field(header, 124, 12).trim();
  if (!/^[0-7]*$/.test(text)) throw new ImageArchiveError(`a tar header's size "${text}" is not octal`);
  return text === '' ? 0 : Number.parseInt(text, 8);
}

/** JSON's white space, which may come before a document's first `{` or `[`. */
const JSON_SPACE: ReadonlySet<number> = new Set([0x20, 0x09, 0x0a, 0x0d]);

/** A pax extended header's records ("<length> <key>=<value>\n"). */
function paxRecords(bytes: Buffer): Map<string, string> {
  const records = new Map<string, string>();
  let at = 0;
  while (at < bytes.length) {
    const space = bytes.indexOf(0x20, at);
    if (space === -1) break;
    const length = Number.parseInt(bytes.subarray(at, space).toString('utf8'), 10);
    if (!Number.isInteger(length) || length <= 0 || at + length > bytes.length) throw new ImageArchiveError('a pax header record is malformed');
    const record = bytes.subarray(space + 1, at + length - 1).toString('utf8');
    const equals = record.indexOf('=');
    if (equals !== -1) records.set(record.slice(0, equals), record.slice(equals + 1));
    at += length;
  }
  return records;
}

/** Whether a file starts with gzip's magic bytes. */
function gzipped(file: string): boolean {
  const descriptor = openSync(file, 'r');
  try {
    const head = Buffer.alloc(2);
    return readSync(descriptor, head, 0, 2, 0) === 2 && head[0] === 0x1f && head[1] === 0x8b;
  } finally {
    closeSync(descriptor);
  }
}

/**
 * Every regular file of a tar stream up to KEPT_BYTES, by its path, with its SHA-256 and, for a JSON document, its bytes,
 * read in one pass: larger entries (the layers) pass through unhashed and unkept. A pax header's `path` and `size` and a
 * GNU long name apply to the entry after it, as GNU tar and Go's archive/tar read them. Memory is bounded: a metadata
 * entry over METADATA_LIMIT is refused before it is read, and so is an archive whose kept bytes pass KEPT_LIMIT.
 */
async function smallEntries(source: Readable): Promise<Map<string, Entry>> {
  const entries = new Map<string, Entry>();
  let pending: Buffer = Buffer.alloc(0);
  // The entry being read: its header's facts, how much of its data and padding is left, and what is kept of it
  // (`json`: whether a hashed file's bytes are kept, undecided until its first byte that is not white space).
  let current: {
    path: string;
    type: string;
    size: number;
    left: number;
    padding: number;
    hash: ReturnType<typeof createHash> | null;
    chunks: Buffer[];
    json: boolean | undefined;
  } | null = null;
  let nextPath: string | null = null;
  let nextSize: number | null = null;
  let ended = false;
  let kept = 0;

  const keep = (entry: NonNullable<typeof current>, part: Buffer) => {
    kept += part.length;
    if (kept > KEPT_LIMIT) throw new ImageArchiveError('the entries this reader keeps (JSON documents, pax headers and long names) pass the limit of 64 MiB in all');
    entry.chunks.push(Buffer.from(part));
  };

  const finish = (entry: NonNullable<typeof current>) => {
    const bytes = Buffer.concat(entry.chunks);
    if (entry.type === 'x') {
      const records = paxRecords(bytes);
      nextPath = records.get('path') ?? nextPath;
      const size = records.get('size');
      if (size !== undefined) {
        const value = /^[0-9]+$/.test(size) ? Number(size) : Number.NaN;
        if (!Number.isSafeInteger(value)) throw new ImageArchiveError(`a pax header's size record ${JSON.stringify(size)} is not a decimal number`);
        nextSize = value;
      }
    } else if (entry.type === 'L') {
      nextPath = field(bytes, 0, bytes.length);
    } else if ((entry.type === '0' || entry.type === '\0' || entry.type === '') && entry.hash !== null) {
      entries.set(entry.path.replace(/^\.\//, ''), { sha256: entry.hash.digest('hex'), bytes });
    }
  };

  for await (const chunk of source as AsyncIterable<Buffer>) {
    pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
    for (;;) {
      if (ended) break;
      if (current === null) {
        if (pending.length < BLOCK) break;
        const header = pending.subarray(0, BLOCK);
        pending = pending.subarray(BLOCK);
        if (header.every((byte) => byte === 0)) {
          ended = true;
          break;
        }
        const type = String.fromCharCode(header[156] ?? 0);
        const prefix = field(header, 257, 6) === 'ustar' ? field(header, 345, 155) : '';
        const named = prefix === '' ? field(header, 0, 100) : `${prefix}/${field(header, 0, 100)}`;
        const metadata = METADATA.get(type);
        const size = metadata === undefined ? (nextSize ?? entrySize(header)) : entrySize(header);
        if (metadata !== undefined && size > METADATA_LIMIT) throw new ImageArchiveError(`${metadata} of ${String(size)} bytes passes the limit of 1 MiB for a pax header or long name`);
        const path = metadata === undefined ? (nextPath ?? named) : named;
        if (metadata === undefined) {
          nextPath = null;
          nextSize = null;
        }
        const hashed = metadata === undefined && (type === '0' || type === '\0') && size <= KEPT_BYTES;
        current = { path, type, size, left: size, padding: (BLOCK - (size % BLOCK)) % BLOCK, hash: hashed ? createHash('sha256') : null, chunks: [], json: undefined };
      }
      if (current.left > 0) {
        if (pending.length === 0) break;
        const take = Math.min(current.left, pending.length);
        const part = pending.subarray(0, take);
        if (current.type === 'x' || current.type === 'L') keep(current, part);
        if (current.hash !== null) {
          current.hash.update(part);
          if (current.json === undefined) {
            const first = part.findIndex((byte) => !JSON_SPACE.has(byte));
            if (first !== -1) current.json = part[first] === 0x7b || part[first] === 0x5b;
            // White space alone so far is kept until a byte decides; a file that is no JSON document gives it back.
            if (current.json === false) {
              kept -= current.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
              current.chunks = [];
            }
          }
          if (current.json !== false) keep(current, part);
        }
        pending = pending.subarray(take);
        current.left -= take;
        if (current.left > 0) break;
      }
      if (current.padding > 0) {
        const skip = Math.min(current.padding, pending.length);
        pending = pending.subarray(skip);
        current.padding -= skip;
        if (current.padding > 0) break;
      }
      finish(current);
      current = null;
    }
  }
  if (current !== null) throw new ImageArchiveError(`the archive ends inside ${current.path}`);
  return entries;
}

/** An entry's bytes as JSON, or a refusal naming it (a file that is no JSON document keeps no bytes). */
function parsed(entry: Entry, what: string): unknown {
  try {
    return JSON.parse(entry.bytes.toString('utf8')) as unknown;
  } catch {
    throw new ImageArchiveError(`${what} is not JSON`);
  }
}

/** A JSON entry, parsed, or a refusal naming it. */
function json(entries: ReadonlyMap<string, Entry>, path: string): unknown {
  const entry = entries.get(path);
  if (entry === undefined) throw new ImageArchiveError(`the archive holds no ${path}`);
  return parsed(entry, path);
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The blob a digest names, its bytes hashed to that digest, or a refusal. */
function blob(entries: ReadonlyMap<string, Entry>, digest: unknown, what: string): Entry {
  const hex = typeof digest === 'string' ? /^sha256:([0-9a-f]{64})$/.exec(digest)?.[1] : undefined;
  if (hex === undefined) throw new ImageArchiveError(`${what}'s digest ${JSON.stringify(digest)} is not a sha256 digest`);
  const entry = entries.get(`blobs/sha256/${hex}`);
  if (entry === undefined) throw new ImageArchiveError(`the archive holds no blob for ${what} (blobs/sha256/${hex})`);
  if (entry.sha256 !== hex) throw new ImageArchiveError(`${what}'s bytes hash to sha256:${entry.sha256}, not to the sha256:${hex} that names them`);
  return entry;
}

/** The descriptor of an index's one linux/amd64 image manifest, attestation manifests (unknown/unknown) aside. */
function amd64(index: unknown, what: string): Record<string, unknown> {
  const manifests = isRecord(index) && Array.isArray(index.manifests) ? index.manifests.filter(isRecord) : [];
  const matches = manifests.filter((descriptor) => {
    const platform = descriptor.platform;
    return isRecord(platform) && platform.os === 'linux' && platform.architecture === 'amd64' && MANIFEST_TYPES.has(String(descriptor.mediaType));
  });
  if (matches.length !== 1) throw new ImageArchiveError(`${what} lists ${String(matches.length)} linux/amd64 image manifests, not one`);
  return matches[0] as Record<string, unknown>;
}

/** The three digests of an archive's entries (see the module's comment). */
export function identityOf(entries: ReadonlyMap<string, Entry>): ImageIdentity {
  let config: string | undefined;
  let manifest: string | undefined;
  let target: string | undefined;

  if (entries.has('index.json')) {
    const index = json(entries, 'index.json');
    const top = isRecord(index) && Array.isArray(index.manifests) ? index.manifests.filter(isRecord) : [];
    if (top.length !== 1) throw new ImageArchiveError(`index.json names ${String(top.length)} images, not one`);
    const descriptor = top[0] as Record<string, unknown>;
    target = String(descriptor.digest);
    let manifestDescriptor = descriptor;
    if (INDEX_TYPES.has(String(descriptor.mediaType))) {
      const nested = blob(entries, descriptor.digest, 'the image index');
      manifestDescriptor = amd64(parsed(nested, 'the image index'), 'the image index');
    } else if (!MANIFEST_TYPES.has(String(descriptor.mediaType))) {
      throw new ImageArchiveError(`index.json's descriptor is a ${String(descriptor.mediaType)}, neither an index nor an image manifest`);
    }
    const manifestBlob = blob(entries, manifestDescriptor.digest, 'the image manifest');
    manifest = `sha256:${manifestBlob.sha256}`;
    const manifestJson = parsed(manifestBlob, 'the image manifest');
    const named = isRecord(manifestJson) && isRecord(manifestJson.config) ? manifestJson.config.digest : undefined;
    config = `sha256:${blob(entries, named, 'the config').sha256}`;
  }

  if (entries.has('manifest.json')) {
    const list = json(entries, 'manifest.json');
    if (!Array.isArray(list) || list.length !== 1 || !isRecord(list[0])) throw new ImageArchiveError(`manifest.json lists ${Array.isArray(list) ? String(list.length) : 'no'} images, not one`);
    const path = list[0].Config;
    // Docker 25 and later name blobs/sha256/<hex>; earlier ones <hex>.json.
    const hex = typeof path === 'string' ? (/^blobs\/sha256\/([0-9a-f]{64})$/.exec(path)?.[1] ?? /^([0-9a-f]{64})\.json$/.exec(path)?.[1]) : undefined;
    if (hex === undefined || typeof path !== 'string') throw new ImageArchiveError(`manifest.json's Config ${JSON.stringify(path)} names no sha256 blob`);
    const entry = entries.get(path);
    if (entry === undefined) throw new ImageArchiveError(`the archive holds no config (${path})`);
    if (entry.sha256 !== hex) throw new ImageArchiveError(`the config's bytes hash to sha256:${entry.sha256}, not to the sha256:${hex} that names them`);
    const fromList = `sha256:${hex}`;
    if (config !== undefined && config !== fromList) throw new ImageArchiveError(`manifest.json names the config ${fromList} and index.json's manifest ${config}`);
    config = fromList;
  }

  if (config === undefined) throw new ImageArchiveError('the archive holds neither index.json nor manifest.json');
  return { config, ...(manifest === undefined ? {} : { manifest }), ...(target === undefined ? {} : { target }) };
}

/** The identity of a plain tar stream of a saved image, as `docker save <tag>` writes one to its stdout. */
export async function tarStreamIdentity(source: Readable): Promise<ImageIdentity> {
  return identityOf(await smallEntries(source));
}

/** The identity of a saved image archive, plain or gzipped, read as a stream. */
export async function imageIdentity(file: string): Promise<ImageIdentity> {
  const raw = createReadStream(file);
  let source: Readable = raw;
  if (gzipped(file)) {
    const gunzip = createGunzip();
    pipeline(raw, gunzip, () => {
      // An error reaches the reader through the gunzip stream, which pipeline destroys with it.
    });
    source = gunzip;
  }
  return tarStreamIdentity(source);
}

if (import.meta.main) {
  const [file, extra] = process.argv.slice(2);
  if (file === undefined || extra !== undefined) {
    process.stderr.write('usage: node tools/screening-capacity/image-id.ts <archive>\n');
    process.exitCode = 2;
  } else {
    try {
      process.stdout.write(`${JSON.stringify(await imageIdentity(file))}\n`);
    } catch (error) {
      process.stderr.write(`image-id: ${file}: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    }
  }
}
