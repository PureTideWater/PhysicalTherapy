import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';
import { ImageArchiveError, imageIdentity } from './image-id';
import { CONFIG, INDEX_TYPE, LAYER, MANIFEST_TYPE, PAX_STAND_IN, attestedArchive, blobEntry, descriptor, manifestOf, paxRecord, sha, tar } from './test-support/image-archive';

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
    const attested = attestedArchive();
    const identity = await imageIdentity(write('attested.tar', attested.archive));
    expect(identity).toEqual({ config: attested.config, manifest: attested.manifest, target: attested.target });
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
    expect(archive.toString('latin1')).toContain(PAX_STAND_IN);
    expect(archive.toString('latin1')).not.toContain(`\0${config.path}\0`);
  });

  it('takes an entry’s size from its pax header’s size record, as Go’s archive/tar writes one for an entry over 8 GiB beside 0 in the ustar size field (the security review’s SEC-5)', async () => {
    const config = blobEntry(CONFIG, true);
    const layer = Buffer.alloc(5 * 1024 * 1024 + 123, 7);
    const manifestList = { path: 'manifest.json', data: JSON.stringify([{ Config: config.path, RepoTags: [], Layers: [] }]) };
    // The ustar size field says 0 for the layer and the config; only the pax records give their sizes. The entry after
    // each reads its own header's size again.
    const archive = tar([
      { path: `blobs/sha256/${sha(layer)}`, data: layer, paxRecords: { size: String(layer.length) }, ustarSize: 0 },
      { ...config, paxRecords: { size: String(CONFIG.length) }, ustarSize: 0 },
      manifestList,
    ]);
    expect(await imageIdentity(write('pax-size.tar.gz', gzipSync(archive)))).toEqual({ config: config.digest });
    // A size record that is not a decimal number is refused, naming it.
    const malformed = tar([{ ...config, paxRecords: { size: '0x56' }, ustarSize: 0 }, manifestList]);
    await expect(imageIdentity(write('pax-size-malformed.tar', malformed))).rejects.toThrow('a pax header\'s size record "0x56" is not a decimal number');
  });

  it('refuses a pax header, a pax global header or a GNU long name over 1 MiB before keeping it, naming the limit, and reads one of exactly 1 MiB (the security review’s SEC-5)', async () => {
    const config = blobEntry(CONFIG);
    const rest = [config, { path: 'manifest.json', data: JSON.stringify([{ Config: config.path, RepoTags: [], Layers: [] }]) }];
    const MiB = 1024 * 1024;
    // A pax header's records, one comment padded to exactly this many bytes.
    const records = (bytes: number) => {
      let comment = 'x'.repeat(bytes - paxRecord('comment', '').length);
      while (Buffer.byteLength(paxRecord('comment', comment)) > bytes) comment = comment.slice(1);
      return paxRecord('comment', comment);
    };
    expect(Buffer.byteLength(records(MiB))).toBe(MiB);
    const metadata = {
      x: { what: 'a pax header', data: (bytes: number) => records(bytes) },
      g: { what: 'a pax global header', data: (bytes: number) => records(bytes) },
      L: { what: 'a GNU long name', data: (bytes: number) => `${'n'.repeat(bytes - 1)}\0` },
    };
    for (const [type, { what, data }] of Object.entries(metadata)) {
      // Before the oci-layout entry, whose name nothing reads, so only the limit can refuse the archive.
      const over = tar([{ path: `PaxHeaders/${type}`, type, data: data(MiB + 1) }, { path: 'oci-layout', data: '{"imageLayoutVersion":"1.0.0"}' }, ...rest]);
      await expect(imageIdentity(write(`meta-${type}-over.tar`, over)), type).rejects.toThrow(`${what} of ${String(MiB + 1)} bytes passes the limit of 1 MiB for a pax header or long name`);
      const at = tar([{ path: `PaxHeaders/${type}`, type, data: data(MiB) }, { path: 'oci-layout', data: '{"imageLayoutVersion":"1.0.0"}' }, ...rest]);
      expect(await imageIdentity(write(`meta-${type}-at.tar`, at)), type).toEqual({ config: config.digest });
    }
  });

  it('refuses an archive whose kept entries pass 64 MiB in all, naming the limit, and keeps no bytes of a small layer (the security review’s SEC-5)', async () => {
    const config = blobEntry(CONFIG);
    const manifestList = { path: 'manifest.json', data: JSON.stringify([{ Config: config.path, RepoTags: [], Layers: [] }]) };
    const MiB = 1024 * 1024;
    // Sixteen JSON documents of 4 MiB each, the largest entry kept, reach 64 MiB; the config and manifest.json pass it.
    const documents = Array.from({ length: 16 }, (_, index) => {
      const data = Buffer.alloc(4 * MiB, 0x20);
      data.write(`{"n":${String(index)}}`, 0);
      return { path: `blobs/sha256/${sha(data)}`, data };
    });
    await expect(imageIdentity(write('kept-over.tar', tar([...documents, config, manifestList])))).rejects.toThrow('the entries this reader keeps (JSON documents, pax headers and long names) pass the limit of 64 MiB in all');
    // Twenty small layers of 4 MiB, 80 MiB in all: hashed as they pass, none of their bytes kept, so no limit is met.
    const layers = Array.from({ length: 20 }, (_, index) => {
      const data = Buffer.alloc(4 * MiB, index + 1);
      return { path: `blobs/sha256/${sha(data)}`, data };
    });
    expect(await imageIdentity(write('small-layers.tar', tar([...layers, config, manifestList])))).toEqual({ config: config.digest });
  });

  it('refuses an image manifest or index that is no JSON document as an archive it refuses, naming it', async () => {
    const config = blobEntry(CONFIG);
    const binary = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x7b]);
    const index = (mediaType: string) => JSON.stringify({ schemaVersion: 2, manifests: [{ mediaType, digest: `sha256:${sha(binary)}`, size: binary.length }] });
    const blob = { path: `blobs/sha256/${sha(binary)}`, data: binary };
    for (const [mediaType, what] of [
      [MANIFEST_TYPE, 'the image manifest'],
      [INDEX_TYPE, 'the image index'],
    ] as const) {
      const archive = tar([config, blob, { path: 'index.json', data: index(mediaType) }]);
      const refused: unknown = await imageIdentity(write(`not-json-${what.replace(/ /g, '-')}.tar`, archive)).catch((error: unknown) => error);
      expect(refused, what).toBeInstanceOf(ImageArchiveError);
      expect((refused as Error).message, what).toBe(`${what} is not JSON`);
    }
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
