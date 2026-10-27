import { createHash } from 'node:crypto';

/**
 * Synthetic image archives for the tests of tools/screening-capacity/image-id.ts and the harness's image proof
 * (containers.ts): ustar archives of the entries docker save and buildx's type=docker exporter write, built in memory.
 */

export const sha = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

export interface TarEntry {
  readonly path: string;
  readonly data: Buffer | string;
  /** Write the path in a pax header, leaving a stand-in in the ustar name field. */
  readonly pax?: boolean;
  /**
   * More records for the entry's own pax header ('x'), after the path's when `pax` is set: Go's archive/tar writes `size`
   * for an entry over 8 GiB and leaves 0 in the ustar size field.
   */
  readonly paxRecords?: Readonly<Record<string, string>>;
  /** The ustar header's size field, when it is not the data's length (0 beside a pax `size` record). */
  readonly ustarSize?: number;
  /**
   * The entry's type flag: a regular file ('0') unless named. A metadata type ('x' a pax header, 'g' a pax global
   * header, 'L' a GNU long name) writes the data as that entry's own bytes under `path`.
   */
  readonly type?: string;
}

/** The stand-in a pax entry's ustar name field holds, which a reader must not take for its path. */
export const PAX_STAND_IN = 'stand-in-name-that-is-not-the-path';

/** One ustar header block. */
function header(name: string, size: number, type: string): Buffer {
  const block = Buffer.alloc(512);
  block.write(name.slice(0, 100), 0, 'utf8');
  block.write('0000644\0', 100);
  block.write('0000000\0', 108);
  block.write('0000000\0', 116);
  block.write(`${size.toString(8).padStart(11, '0')}\0`, 124);
  block.write('00000000000\0', 136);
  block.write(type, 156);
  block.write('ustar\0', 257);
  block.write('00', 263);
  block.fill(0x20, 148, 156);
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  return block;
}

const padded = (data: Buffer) => Buffer.concat([data, Buffer.alloc((512 - (data.length % 512)) % 512)]);

/** One pax record, "<length> <key>=<value>\n", its length counting its own digits. */
export function paxRecord(key: string, value: string): string {
  const body = (length: number) => `${String(length)} ${key}=${value}\n`;
  let length = Buffer.byteLength(body(0));
  while (Buffer.byteLength(body(length)) !== length) length = Buffer.byteLength(body(length));
  return body(length);
}

/** A tar archive of these entries, ended by two zero blocks. */
export function tar(entries: readonly TarEntry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const data = Buffer.from(entry.data);
    const type = entry.type ?? '0';
    if (type !== '0') {
      blocks.push(header(entry.path, data.length, type), padded(data));
      continue;
    }
    const records = [...(entry.pax === true ? [paxRecord('path', entry.path)] : []), ...Object.entries(entry.paxRecords ?? {}).map(([key, value]) => paxRecord(key, value))];
    if (records.length > 0) {
      const record = Buffer.from(records.join(''));
      blocks.push(header('PaxHeaders/stand-in', record.length, 'x'), padded(record));
    }
    blocks.push(header(entry.pax === true ? PAX_STAND_IN : entry.path, entry.ustarSize ?? data.length, '0'), padded(data));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

/** A blob entry at its content's digest. */
export const blobEntry = (data: string, pax = false): TarEntry & { readonly digest: string } => ({ path: `blobs/sha256/${sha(data)}`, data, digest: `sha256:${sha(data)}`, pax });

export const MANIFEST_TYPE = 'application/vnd.oci.image.manifest.v1+json';
export const INDEX_TYPE = 'application/vnd.oci.image.index.v1+json';

export const CONFIG = JSON.stringify({ architecture: 'amd64', os: 'linux', config: { User: 'node' }, rootfs: { type: 'layers', diff_ids: [] } });
export const LAYER = 'synthetic layer bytes';

/** An image manifest naming this config and one layer. */
export function manifestOf(config: string): string {
  return JSON.stringify({ schemaVersion: 2, mediaType: MANIFEST_TYPE, config: { mediaType: 'application/vnd.oci.image.config.v1+json', digest: `sha256:${sha(config)}`, size: config.length }, layers: [{ mediaType: 'application/vnd.oci.image.layer.v1.tar', digest: `sha256:${sha(LAYER)}`, size: LAYER.length }] });
}

export const descriptor = (mediaType: string, data: string, platform?: { os: string; architecture: string }): Record<string, unknown> => ({
  mediaType,
  digest: `sha256:${sha(data)}`,
  size: data.length,
  ...(platform === undefined ? {} : { platform }),
});

/**
 * An attested image as buildx writes it with provenance on: index.json → an index of the linux/amd64 manifest and an
 * attestation manifest (unknown/unknown), with docker save's manifest.json beside it. Its digests: the config's, the
 * amd64 manifest's and the index's (the containerd store's .Id).
 */
export function attestedArchive(config: string = CONFIG): { archive: Buffer; config: string; manifest: string; target: string } {
  const configBlob = blobEntry(config);
  const amd64 = blobEntry(manifestOf(config));
  const attestation = JSON.stringify({ schemaVersion: 2, mediaType: MANIFEST_TYPE, config: { mediaType: 'application/vnd.oci.image.config.v1+json', digest: `sha256:${sha('{}')}`, size: 2 }, layers: [] });
  const attested = JSON.stringify({
    schemaVersion: 2,
    mediaType: INDEX_TYPE,
    manifests: [descriptor(MANIFEST_TYPE, manifestOf(config), { os: 'linux', architecture: 'amd64' }), { ...descriptor(MANIFEST_TYPE, attestation, { os: 'unknown', architecture: 'unknown' }), annotations: { 'vnd.docker.reference.type': 'attestation-manifest' } }],
  });
  const index = blobEntry(attested);
  const archive = tar([
    configBlob,
    amd64,
    blobEntry(attestation),
    blobEntry('{}'),
    index,
    { path: 'index.json', data: JSON.stringify({ schemaVersion: 2, manifests: [descriptor(INDEX_TYPE, attested)] }) },
    { path: 'manifest.json', data: JSON.stringify([{ Config: configBlob.path, RepoTags: ['tp-worker:capacity'], Layers: [] }]) },
  ]);
  return { archive, config: configBlob.digest, manifest: amd64.digest, target: index.digest };
}
