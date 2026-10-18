import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { afterAll, describe, expect, it } from 'vitest';

import { AgreementDocumentError, LocalAgreementDocuments, MAX_AGREEMENT_BYTES, S3AgreementDocuments, agreementDocumentKey, isPdf, readAgreementUpload } from './documents';
import { ESignatureError, LocalESignature, readEvent, signEvent } from './esign';

/** Agreements by e-signature webhook or by upload (milestone 11; docs/adr/0053). Synthetic documents only. */

const scratch = mkdtempSync(path.join(tmpdir(), 'tp-agreements-test-'));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const SECRET = 'synthetic-esign-secret-for-unit-tests';
const ORGANIZATION = '3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a60';
const AGREEMENT = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const PDF = new TextEncoder().encode('%PDF-1.4\n% SYNTHETIC\n%%EOF\n');
const NOW = new Date('2026-10-16T12:00:00Z');

describe('the e-signature webhook', () => {
  const vendor = new LocalESignature({ secret: SECRET, directory: path.join(scratch, 'vendor') });

  it('reads a completed envelope only once its signature verifies, and fetches its signed document', async () => {
    const event = await vendor.complete({ organizationId: ORGANIZATION, kind: 'baa', version: '3', signer: 'SYNTHETIC SIGNER', document: PDF, completedAt: NOW }, NOW);
    const envelope = vendor.verifyEvent(event.payload, event.signature, NOW);
    expect(envelope).toMatchObject({ envelopeRef: event.envelopeRef, organizationId: ORGANIZATION, practiceId: null, kind: 'baa', version: '3', signer: 'SYNTHETIC SIGNER', signedAt: NOW });
    expect(envelope.eventId).toMatch(/^evt_[0-9a-f]{32}$/);
    expect(Buffer.from(await vendor.signedDocument(event.envelopeRef))).toEqual(Buffer.from(PDF));
    expect(event.sha256).toBe(createHash('sha256').update(PDF).digest('hex'));
  });

  it('refuses an event without a signature, with a wrong one, an old one, or one that is not a completed envelope', async () => {
    const event = await vendor.complete({ organizationId: ORGANIZATION, practiceId: AGREEMENT, kind: 'terms', version: '1', signer: 'SYNTHETIC SIGNER', document: PDF, completedAt: NOW }, NOW);
    expect(vendor.verifyEvent(event.payload, event.signature, NOW).practiceId).toBe(AGREEMENT);
    expect(() => vendor.verifyEvent(event.payload, null, NOW)).toThrow(new ESignatureError('the webhook carries no signature'));
    expect(() => vendor.verifyEvent(event.payload, 't=abc,v1=zz', NOW)).toThrow('carries no signature');
    expect(() => vendor.verifyEvent(event.payload.replace('terms', 'baa'), event.signature, NOW)).toThrow('does not verify');
    expect(() => readEvent('another secret entirely', event.payload, event.signature, NOW)).toThrow('does not verify');
    expect(() => vendor.verifyEvent(event.payload, event.signature, new Date(NOW.getTime() + 301_000))).toThrow('too old');
    const notJson = 'not json';
    expect(() => readEvent(SECRET, notJson, signEvent(SECRET, notJson, NOW), NOW)).toThrow('not JSON');
    const other = JSON.stringify({ format: 'tp-esign-event/1', id: 'evt_1', type: 'envelope.voided' });
    expect(() => readEvent(SECRET, other, signEvent(SECRET, other, NOW), NOW)).toThrow('not a completed envelope');
    await expect(vendor.signedDocument('../../etc/passwd')).rejects.toThrow('not an envelope reference');
    await expect(vendor.signedDocument('env_unknown')).rejects.toThrow('holds no signed document');
  });
});

describe('uploaded agreements', () => {
  it('are kept once under an opaque key, never replaced', async () => {
    const key = agreementDocumentKey(ORGANIZATION, AGREEMENT);
    expect(key).toBe(`agreements/${ORGANIZATION}/${AGREEMENT}.pdf`);
    expect(() => agreementDocumentKey('Synthetic Clinic', AGREEMENT)).toThrow(AgreementDocumentError);
    const store = new LocalAgreementDocuments(path.join(scratch, 'kept'));
    await store.putNew(key, PDF);
    expect(readFileSync(path.join(scratch, 'kept', key))).toEqual(Buffer.from(PDF));
    await expect(store.putNew(key, PDF)).rejects.toThrow('written once');
    await expect(store.putNew('agreements/../escape.pdf', PDF)).rejects.toThrow('not an agreement document key');
    const blocked = new LocalAgreementDocuments(path.join(scratch, 'kept', key));
    await expect(blocked.putNew(key, PDF)).rejects.toThrow(AgreementDocumentError);
  });

  it('go to the documents bucket once, under the environment key, with their checksum', async () => {
    const sent: unknown[] = [];
    const store = new S3AgreementDocuments({ client: { send: (command: unknown) => Promise.resolve(sent.push(command)) } as never, bucket: 'tp-documents', kmsKeyId: 'alias/tp' });
    await store.putNew(agreementDocumentKey(ORGANIZATION, AGREEMENT), PDF);
    const command = sent[0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'tp-documents',
      Key: `agreements/${ORGANIZATION}/${AGREEMENT}.pdf`,
      ContentType: 'application/pdf',
      IfNoneMatch: '*',
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: 'alias/tp',
      ChecksumSHA256: createHash('sha256').update(PDF).digest('base64'),
    });
    await expect(store.putNew('elsewhere/x.pdf', PDF)).rejects.toThrow('not an agreement document key');
  });

  it('are read whole with their SHA-256, at most 10 MB, and only as PDFs', async () => {
    const read = await readAgreementUpload(Readable.from([PDF.subarray(0, 5), PDF.subarray(5)]));
    expect(Buffer.from(read.bytes)).toEqual(Buffer.from(PDF));
    expect(read.sha256).toBe(createHash('sha256').update(PDF).digest('hex'));
    expect(MAX_AGREEMENT_BYTES).toBe(10 * 1024 * 1024);
    await expect(readAgreementUpload(Readable.from([new Uint8Array(MAX_AGREEMENT_BYTES), new Uint8Array(1)]))).rejects.toThrow('at most 10 MB');
    expect(isPdf(PDF)).toBe(true);
    expect(isPdf(new TextEncoder().encode('MZ executable'))).toBe(false);
  });
});
