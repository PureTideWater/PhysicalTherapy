import { randomBytes } from 'node:crypto';

import { DecryptCommand, GenerateDataKeyCommand } from '@aws-sdk/client-kms';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { CiphertextError, ENCRYPTED_COLUMNS, PracticeCipher } from './cipher';
import { DataKeyError, LocalKeyProvider, unwrapRef } from './key-provider';
import { KmsKeyProvider, createKmsKeyProvider } from './kms-key-provider';
import { DataKeyDestroyedError, openPracticeCipher, provisionPracticeKey } from './practice-keys';

const PRACTICE_A = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c01';
const PRACTICE_B = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c02';
const SYNTHETIC_PCN = 'SYNPCN0001';

describe('LocalKeyProvider', () => {
  it('wraps a fresh 32-byte data key and opens it again for the same practice only', async () => {
    const provider = LocalKeyProvider.random();
    const key = await provider.generateDataKey(PRACTICE_A);
    expect(key.plaintext).toHaveLength(32);
    expect(key.wrapped).toMatch(/^local:v1:[A-Za-z0-9+/]+={0,2}$/);
    expect(key.wrapped).not.toContain(key.plaintext.toString('base64'));
    await expect(provider.decryptDataKey(PRACTICE_A, key.wrapped)).resolves.toEqual(key.plaintext);
    await expect(provider.decryptDataKey(PRACTICE_B, key.wrapped)).rejects.toThrow(new DataKeyError('the data key does not open for this practice'));
  });

  it('opens nothing under another master key, and refuses malformed and foreign references', async () => {
    const key = await LocalKeyProvider.random().generateDataKey(PRACTICE_A);
    await expect(LocalKeyProvider.random().decryptDataKey(PRACTICE_A, key.wrapped)).rejects.toThrow(DataKeyError);
    const provider = LocalKeyProvider.random();
    await expect(provider.decryptDataKey(PRACTICE_A, 'local:v1:AAAA')).rejects.toThrow(/malformed/);
    expect(() => provider.decryptDataKey(PRACTICE_A, 'kms:v1:AAAA')).toThrow(/not made by the local key provider/);
    expect(() => provider.generateDataKey('practice-a')).toThrow(/named by its UUID/);
    expect(() => new LocalKeyProvider(randomBytes(16))).toThrow(/32 bytes/);
  });

  it('gives every practice its own key', async () => {
    const provider = LocalKeyProvider.random();
    const [a, b] = await Promise.all([provider.generateDataKey(PRACTICE_A), provider.generateDataKey(PRACTICE_B)]);
    expect(a.plaintext.equals(b.plaintext)).toBe(false);
  });
});

describe('KmsKeyProvider (mocked client)', () => {
  it('can be built with the SDK’s own client', () => {
    expect(createKmsKeyProvider('alias/tp-test')).toBeInstanceOf(KmsKeyProvider);
  });

  const plaintext = randomBytes(32);
  const blob = randomBytes(184);

  function client(answer: (command: unknown) => unknown) {
    const sent: unknown[] = [];
    return {
      sent,
      client: {
        send: (command: unknown) => {
          sent.push(command);
          return Promise.resolve(answer(command));
        },
      } as never,
    };
  }

  it('generates the data key with the practice as encryption context', async () => {
    const kms = client(() => ({ Plaintext: new Uint8Array(plaintext), CiphertextBlob: new Uint8Array(blob) }));
    const key = await new KmsKeyProvider({ client: kms.client, keyId: 'alias/tp-test' }).generateDataKey(PRACTICE_A);
    expect(key.plaintext.equals(plaintext)).toBe(true);
    expect(unwrapRef('kms', key.wrapped).equals(blob)).toBe(true);
    expect(kms.sent).toHaveLength(1);
    expect(kms.sent[0]).toBeInstanceOf(GenerateDataKeyCommand);
    expect((kms.sent[0] as GenerateDataKeyCommand).input).toEqual({ KeyId: 'alias/tp-test', KeySpec: 'AES_256', EncryptionContext: { practice_id: PRACTICE_A } });
  });

  it('decrypts the wrapped key with the same encryption context', async () => {
    const kms = client(() => ({ Plaintext: new Uint8Array(plaintext) }));
    const provider = new KmsKeyProvider({ client: kms.client, keyId: 'alias/tp-test' });
    await expect(provider.decryptDataKey(PRACTICE_B, `kms:v1:${blob.toString('base64')}`)).resolves.toEqual(plaintext);
    expect(kms.sent[0]).toBeInstanceOf(DecryptCommand);
    const input = (kms.sent[0] as DecryptCommand).input;
    expect(input.KeyId).toBe('alias/tp-test');
    expect(input.EncryptionContext).toEqual({ practice_id: PRACTICE_B });
    expect(Buffer.from(input.CiphertextBlob ?? new Uint8Array()).equals(blob)).toBe(true);
  });

  it('refuses answers without a usable key, and references it did not make', async () => {
    const empty = new KmsKeyProvider({ client: client(() => ({})).client, keyId: 'k' });
    await expect(empty.generateDataKey(PRACTICE_A)).rejects.toThrow(/no usable data key/);
    await expect(empty.decryptDataKey(PRACTICE_A, 'kms:v1:AAAA')).rejects.toThrow(/no usable data key/);
    const short = new KmsKeyProvider({ client: client(() => ({ Plaintext: new Uint8Array(16), CiphertextBlob: new Uint8Array(0) })).client, keyId: 'k' });
    await expect(short.generateDataKey(PRACTICE_A)).rejects.toThrow(/no usable data key/);
    const noBlob = new KmsKeyProvider({ client: client(() => ({ Plaintext: new Uint8Array(32), CiphertextBlob: new Uint8Array(0) })).client, keyId: 'k' });
    await expect(noBlob.generateDataKey(PRACTICE_A)).rejects.toThrow(/no usable data key/);
    await expect(empty.decryptDataKey(PRACTICE_A, 'local:v1:AAAA')).rejects.toThrow(/not made by the kms key provider/);
    await expect(empty.generateDataKey('x')).rejects.toThrow(DataKeyError);
  });
});

describe('PracticeCipher', () => {
  const key = randomBytes(32);
  const cipher = new PracticeCipher(PRACTICE_A, key);

  it('round-trips every (enc) column, with a fresh ciphertext each time (property)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ENCRYPTED_COLUMNS), fc.string({ unit: 'grapheme', maxLength: 80 }), (column, value) => {
        const first = cipher.encrypt(column, value);
        expect(first).toMatch(/^enc:v1:[A-Za-z0-9_-]+$/);
        expect(cipher.decrypt(column, first)).toBe(value);
        expect(cipher.encrypt(column, value)).not.toBe(first);
      }),
    );
  });

  it('never stores the value in the clear', () => {
    expect(cipher.encrypt('claim.patient_control_number', SYNTHETIC_PCN)).not.toContain(SYNTHETIC_PCN);
  });

  it('binds a ciphertext to its practice and column', () => {
    const sealed = cipher.encrypt('patient_ref.last_name', 'SYNTHETIC');
    expect(() => cipher.decrypt('patient_ref.first_name', sealed)).toThrow(CiphertextError);
    expect(() => new PracticeCipher(PRACTICE_B, key).decrypt('patient_ref.last_name', sealed)).toThrow(CiphertextError);
    expect(() => new PracticeCipher(PRACTICE_A, randomBytes(32)).decrypt('patient_ref.last_name', sealed)).toThrow(CiphertextError);
  });

  it('refuses tampered, truncated and foreign values without echoing them', () => {
    const sealed = cipher.encrypt('patient_ref.dob', '1950-01-01');
    const bytes = Buffer.from(sealed.slice('enc:v1:'.length), 'base64url');
    bytes[bytes.length - 20] = (bytes[bytes.length - 20] ?? 0) ^ 1;
    expect(() => cipher.decrypt('patient_ref.dob', `enc:v1:${bytes.toString('base64url')}`)).toThrow(CiphertextError);
    expect(() => cipher.decrypt('patient_ref.dob', 'enc:v1:AAAA')).toThrow(/truncated/);
    expect(() => cipher.decrypt('patient_ref.dob', '1950-01-01')).toThrow(CiphertextError);
    expect(() => cipher.decrypt('patient_ref.dob', '1950-01-01')).not.toThrow(/1950/);
  });

  it('hashes a lookup value deterministically per practice', () => {
    const hash = cipher.lookupHash('claim.payer_claim_control_number', SYNTHETIC_PCN);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(new PracticeCipher(PRACTICE_A, key).lookupHash('claim.payer_claim_control_number', SYNTHETIC_PCN)).toBe(hash);
    expect(cipher.lookupHash('claim.payer_claim_control_number', 'SYNPCN0002')).not.toBe(hash);
    expect(new PracticeCipher(PRACTICE_B, randomBytes(32)).lookupHash('claim.payer_claim_control_number', SYNTHETIC_PCN)).not.toBe(hash);
    // The pseudonym of the same text is a different hash: each column hashes on its own.
    expect(cipher.lookupHash('patient_ref.pseudonym', SYNTHETIC_PCN)).not.toBe(hash);
    expect(cipher.lookupHash('patient_ref.pseudonym', SYNTHETIC_PCN)).toBe(new PracticeCipher(PRACTICE_A, key).lookupHash('patient_ref.pseudonym', SYNTHETIC_PCN));
  });

  it('refuses a key that is not 32 bytes and a practice that is not a UUID', () => {
    expect(() => new PracticeCipher(PRACTICE_A, randomBytes(31))).toThrow(DataKeyError);
    expect(() => new PracticeCipher('practice', key)).toThrow(DataKeyError);
  });

  it('seals object bytes under the practice’s key and the object’s key, freshly each time (property)', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 512 }), fc.stringMatching(/^[a-z0-9/._-]{1,40}$/), (body, objectKey) => {
        const sealed = cipher.encryptObject(objectKey, body);
        expect(sealed.subarray(0, 4).toString('ascii')).toBe('TPO1');
        expect(sealed.length).toBe(body.length + 4 + 12 + 16);
        expect(cipher.decryptObject(objectKey, sealed).equals(Buffer.from(body))).toBe(true);
        expect(cipher.encryptObject(objectKey, body).equals(sealed)).toBe(false);
      }),
    );
  });

  it('never stores an object’s bytes in the clear, and binds them to their practice, key and data key', () => {
    const body = Buffer.from(`ISA*00*SYNTHSENDER*${SYNTHETIC_PCN}~`, 'utf8');
    const sealed = cipher.encryptObject('documents/0b6e2a7c', body);
    expect(sealed.includes(Buffer.from(SYNTHETIC_PCN))).toBe(false);
    expect(() => cipher.decryptObject('documents/9a8b7c6d', sealed)).toThrow(CiphertextError);
    expect(() => new PracticeCipher(PRACTICE_B, key).decryptObject('documents/0b6e2a7c', sealed)).toThrow(CiphertextError);
    expect(() => new PracticeCipher(PRACTICE_A, randomBytes(32)).decryptObject('documents/0b6e2a7c', sealed)).toThrow(CiphertextError);
    // Object sealing uses its own derived key: a field ciphertext's key does not open it.
    expect(cipher.decrypt('patient_ref.last_name', cipher.encrypt('patient_ref.last_name', 'SYNTHETIC'))).toBe('SYNTHETIC');
  });

  it('refuses tampered, truncated, foreign and keyless objects', () => {
    const sealed = cipher.encryptObject('packets/1', Buffer.from('SYNTHETIC PACKET'));
    const tampered = Buffer.from(sealed);
    tampered[20] = (tampered[20] ?? 0) ^ 1;
    expect(() => cipher.decryptObject('packets/1', tampered)).toThrow(/does not decrypt/);
    expect(() => cipher.decryptObject('packets/1', sealed.subarray(0, 20))).toThrow(/not a sealed TPO1 object/);
    expect(() => cipher.decryptObject('packets/1', Buffer.from('%PDF-1.7 not sealed at all, long enough to pass'))).toThrow(/not a sealed TPO1 object/);
    expect(() => cipher.encryptObject('', Buffer.from('x'))).toThrow(CiphertextError);
  });
});

describe('practice keys', () => {
  it('provisions a key whose reference reopens the same cipher', async () => {
    const provider = LocalKeyProvider.random();
    const { dataKeyRef, cipher } = await provisionPracticeKey(provider, PRACTICE_A);
    const sealed = cipher.encrypt('patient_ref.member_id', 'SYN000000001');
    const reopened = await openPracticeCipher(provider, PRACTICE_A, dataKeyRef);
    expect(reopened.decrypt('patient_ref.member_id', sealed)).toBe('SYN000000001');
  });

  it('opens nothing once the reference is destroyed', async () => {
    await expect(openPracticeCipher(LocalKeyProvider.random(), PRACTICE_A, null)).rejects.toThrow(DataKeyDestroyedError);
  });
});
