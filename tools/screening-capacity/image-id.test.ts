import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';
import { ImageArchiveError, imageIdentity } from './image-id';

/**
 * tools/screening-capacity/image-id.ts on synthetic archives this test writes: docker-archive and OCI layouts, plain and
 * gzipped, the index forms buildx and the two image stores write, and the archives it must refuse (docs/adr/0066, Part 3).
 */

// Made before the tests run, not when the file is collected (tools/test/collection.test.ts).
let scratch = '';
beforeAll(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), 'tp-image-id-'));
});
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

interface TarEntry {
  readonly path: string;
  readonly data: Buffer | string;
  /** Write the path in a pax header, leaving a stand-in in the ustar name field. */
  readonly pax?: boolean;
}

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

/** A tar archive of these entries, as docker save and buildx write one. */
function tar(entries: readonly TarEntry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const data = Buffer.from(entry.data);
    if (entry.pax === true) {
      const body = (length: number) => `${String(length)} path=${entry.path}\n`;
      let length = body(0).length;
      while (body(length).length !== length) length = body(length).length;
      const record = Buffer.from(body(length));
      blocks.push(header('PaxHeaders/stand-in', record.length, 'x'), padded(record));
      blocks.push(header('stand-in-name-that-is-not-the-path', data.length, '0'), padded(data));
    } else {
      blocks.push(header(entry.path, data.length, '0'), padded(data));
    }
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

/** A blob entry at its content's digest. */
const blobEntry = (data: string, pax = false): TarEntry & { digest: string } => ({ path: `blobs/sha256/${sha(data)}`, data, digest: `sha256:${sha(data)}`, pax });

const CONFIG = JSON.stringify({ architecture: 'amd64', os: 'linux', config: { User: 'node' }, rootfs: { type: 'layers', diff_ids: [] } });
const LAYER = 'synthetic layer bytes';

/** An image manifest naming CONFIG and one layer. */
function manifestOf(config: string): string {
  return JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json', config: { mediaType: 'application/vnd.oci.image.config.v1+json', digest: `sha256:${sha(config)}`, size: config.length }, layers: [{ mediaType: 'application/vnd.oci.image.layer.v1.tar', digest: `sha256:${sha(LAYER)}`, size: LAYER.length }] });
}

const descriptor = (mediaType: string, data: string, platform?: { os: string; architecture: string }) => ({ mediaType, digest: `sha256:${sha(data)}`, size: data.length, ...(platform === undefined ? {} : { platform }) });

const MANIFEST_TYPE = 'application/vnd.oci.image.manifest.v1+json';
const INDEX_TYPE = 'application/vnd.oci.image.index.v1+json';

function write(name: string, bytes: Buffer): string {
  const file = path.join(scratch, name);
  writeFileSync(file, bytes);
  return file;
}

describe('an image archive’s identity', () => {
  it('reads a docker-archive’s config from manifest.json, hashed from its bytes, with no manifest or target when there is no index.json', async () => {
    const config = blobEntry(CONFIG);
    const archive = tar([{ path: `blobs/sha256/${sha(LAYER)}`, data: LAYER }, config, { path: 'manifest.json', data: JSON.stringify([{ Config: config.path, RepoTags: ['tp-web:scan'], Layers: [`blobs/sha256/${sha(LAYER)}`] }]) }]);
    expect(await imageIdentity(write('docker-archive.tar', archive))).toEqual({ config: config.digest });
    // Docker before 25 named the config <hex>.json.
    const legacy = tar([{ path: `${sha(CONFIG)}.json`, data: CONFIG }, { path: 'manifest.json', data: JSON.stringify([{ Config: `${sha(CONFIG)}.json`, RepoTags: ['tp-web:scan'], Layers: [] }]) }]);
    expect(await imageIdentity(write('legacy.tar', legacy))).toEqual({ config: config.digest });
  });

  it('reads an OCI layout with one image manifest: its target is that manifest, and manifest.json beside it must agree', async () => {
    const config = blobEntry(CONFIG);
    const manifest = blobEntry(manifestOf(CONFIG));
    const index = JSON.stringify({ schemaVersion: 2, manifests: [{ ...descriptor(MANIFEST_TYPE, manifestOf(CONFIG)), annotations: { 'io.containerd.image.name': 'docker.io/library/tp-web:scan' } }] });
    const expected = { config: config.digest, manifest: manifest.digest, target: manifest.digest };
    expect(await imageIdentity(write('oci.tar', tar([config, manifest, { path: 'index.json', data: index }, { path: 'oci-layout', data: '{"imageLayoutVersion":"1.0.0"}' }])))).toEqual(expected);
    // Docker 25 and later write both, as buildx's type=docker exporter does.
    const both = tar([config, manifest, { path: 'index.json', data: index }, { path: 'manifest.json', data: JSON.stringify([{ Config: config.path, RepoTags: ['tp-web:scan'], Layers: [] }]) }]);
    expect(await imageIdentity(write('both.tar', both))).toEqual(expected);
    // Plain or gzipped (the release's docker save | gzip -1), the same identity.
    expect(await imageIdentity(write('both.tar.gz', gzipSync(both)))).toEqual(expected);
    // manifest.json naming another config than index.json's manifest is refused.
    const other = blobEntry(`${CONFIG} `);
    const disagree = tar([config, other, manifest, { path: 'index.json', data: index }, { path: 'manifest.json', data: JSON.stringify([{ Config: other.path, RepoTags: [], Layers: [] }]) }]);
    await expect(imageIdentity(write('disagree.tar', disagree))).rejects.toThrow(`manifest.json names the config ${other.digest} and index.json's manifest ${config.digest}`);
  });

  it('resolves a multi-platform index to its linux/amd64 manifest, and an attested index’s target to the index, its manifest to the amd64 one (the review’s S2)', async () => {
    const config = blobEntry(CONFIG);
    const amd64 = blobEntry(manifestOf(CONFIG));
    const armConfig = JSON.stringify({ architecture: 'arm64', os: 'linux' });
    const arm64 = blobEntry(manifestOf(armConfig));
    const platforms = JSON.stringify({ schemaVersion: 2, mediaType: INDEX_TYPE, manifests: [descriptor(MANIFEST_TYPE, manifestOf(armConfig), { os: 'linux', architecture: 'arm64' }), descriptor(MANIFEST_TYPE, manifestOf(CONFIG), { os: 'linux', architecture: 'amd64' })] });
    const platformIndex = blobEntry(platforms);
    const top = (data: string) => JSON.stringify({ schemaVersion: 2, manifests: [descriptor(INDEX_TYPE, data)] });
    const multi = tar([config, blobEntry(armConfig), amd64, arm64, platformIndex, { path: 'index.json', data: top(platforms) }]);
    expect(await imageIdentity(write('multi.tar', multi))).toEqual({ config: config.digest, manifest: amd64.digest, target: platformIndex.digest });
    // buildx's provenance: the amd64 manifest beside an attestation manifest of platform unknown/unknown.
    const attestation = JSON.stringify({ schemaVersion: 2, mediaType: MANIFEST_TYPE, config: { mediaType: 'application/vnd.oci.image.config.v1+json', digest: `sha256:${sha('{}')}`, size: 2 }, layers: [] });
    const attested = JSON.stringify({
      schemaVersion: 2,
      mediaType: INDEX_TYPE,
      manifests: [descriptor(MANIFEST_TYPE, manifestOf(CONFIG), { os: 'linux', architecture: 'amd64' }), { ...descriptor(MANIFEST_TYPE, attestation, { os: 'unknown', architecture: 'unknown' }), annotations: { 'vnd.docker.reference.type': 'attestation-manifest' } }],
    });
    const attestedIndex = blobEntry(attested);
    const archive = tar([config, amd64, blobEntry(attestation), blobEntry('{}'), attestedIndex, { path: 'index.json', data: top(attested) }]);
    const identity = await imageIdentity(write('attested.tar', archive));
    expect(identity).toEqual({ config: config.digest, manifest: amd64.digest, target: attestedIndex.digest });
    expect(identity.target).not.toBe(identity.manifest);
  });

  it('refuses a config whose bytes do not hash to the digest that names it, and a missing config', async () => {
    const config = blobEntry(CONFIG);
    const forged = tar([{ path: config.path, data: `${CONFIG}\n` }, { path: 'manifest.json', data: JSON.stringify([{ Config: config.path, RepoTags: [], Layers: [] }]) }]);
    await expect(imageIdentity(write('forged.tar', forged))).rejects.toThrow(`the config's bytes hash to sha256:${sha(`${CONFIG}\n`)}, not to the ${config.digest} that names them`);
    const manifest = blobEntry(manifestOf(CONFIG));
    const forgedOci = tar([{ path: config.path, data: `${CONFIG}\n` }, manifest, { path: 'index.json', data: JSON.stringify({ schemaVersion: 2, manifests: [descriptor(MANIFEST_TYPE, manifestOf(CONFIG))] }) }]);
    await expect(imageIdentity(write('forged-oci.tar', forgedOci))).rejects.toThrow(ImageArchiveError);
    await expect(imageIdentity(write('missing.tar', tar([{ path: 'manifest.json', data: JSON.stringify([{ Config: config.path, RepoTags: [], Layers: [] }]) }])))).rejects.toThrow(`the archive holds no config (${config.path})`);
    await expect(imageIdentity(write('missing-oci.tar', tar([manifest, { path: 'index.json', data: JSON.stringify({ schemaVersion: 2, manifests: [descriptor(MANIFEST_TYPE, manifestOf(CONFIG))] }) }])))).rejects.toThrow(`the archive holds no blob for the config (${config.path})`);
    await expect(imageIdentity(write('empty.tar', tar([{ path: 'oci-layout', data: '{}' }])))).rejects.toThrow('the archive holds neither index.json nor manifest.json');
    // Two images in one archive: which one is meant cannot be told.
    const two = JSON.stringify({ schemaVersion: 2, manifests: [descriptor(MANIFEST_TYPE, manifestOf(CONFIG)), descriptor(MANIFEST_TYPE, manifestOf(CONFIG))] });
    await expect(imageIdentity(write('two.tar', tar([config, manifest, { path: 'index.json', data: two }])))).rejects.toThrow('index.json names 2 images, not one');
    // A truncated archive.
    const whole = tar([config, { path: 'manifest.json', data: JSON.stringify([{ Config: config.path, RepoTags: [], Layers: [] }]) }]);
    await expect(imageIdentity(write('truncated.tar', whole.subarray(0, 700)))).rejects.toThrow('the archive ends inside');
  });

  it('reads a path from a pax header, and passes a large layer without keeping it', async () => {
    const config = blobEntry(CONFIG, true);
    const layer = Buffer.alloc(5 * 1024 * 1024 + 123, 7);
    const archive = tar([{ path: `blobs/sha256/${sha(layer)}`, data: layer }, config, { path: 'manifest.json', data: JSON.stringify([{ Config: config.path, RepoTags: [], Layers: [] }]), pax: true }]);
    expect(await imageIdentity(write('pax.tar.gz', gzipSync(archive)))).toEqual({ config: config.digest });
    // The ustar name fields hold a stand-in, so the entries were found by the pax headers' paths alone.
    expect(archive.toString('latin1')).toContain('stand-in-name-that-is-not-the-path');
    expect(archive.toString('latin1')).not.toContain(`\0${config.path}\0`);
  });

  it('runs as `node tools/screening-capacity/image-id.ts <archive>`, printing the identity as JSON, and imports only node: modules', () => {
    const config = blobEntry(CONFIG);
    const file = write('cli.tar', tar([config, { path: 'manifest.json', data: JSON.stringify([{ Config: config.path, RepoTags: [], Layers: [] }]) }]));
    const script = path.join(repositoryRoot, 'tools/screening-capacity/image-id.ts');
    const ran = spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
    expect([ran.status, ran.stderr]).toEqual([0, '']);
    expect(JSON.parse(ran.stdout)).toEqual({ config: config.digest });
    const bad = spawnSync(process.execPath, [script, write('cli-bad.tar', tar([{ path: 'oci-layout', data: '{}' }]))], { encoding: 'utf8' });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('the archive holds neither index.json nor manifest.json');
    const usage = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    expect([usage.status, usage.stderr]).toEqual([2, 'usage: node tools/screening-capacity/image-id.ts <archive>\n']);
    const source = readFileSync(script, 'utf8');
    const imports = [...source.matchAll(/^import\s.*?from\s+'([^']+)';$/gm)].map((match) => match[1]);
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter((specifier) => specifier?.startsWith('node:') !== true)).toEqual([]);
  });
});
