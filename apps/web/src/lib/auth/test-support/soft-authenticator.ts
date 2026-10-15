import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from '../provider';

/**
 * A software WebAuthn authenticator for tests: an ES256 (P-256) credential, "none" attestation, user
 * presence and user verification flags. It produces the same JSON a browser's
 * navigator.credentials.create() and get() give @simplewebauthn/browser, so the local provider's
 * real verification runs against it. Tests only.
 */

function cborHead(major: number, length: number): Buffer {
  if (length < 24) {
    return Buffer.from([(major << 5) | length]);
  }
  if (length < 256) {
    return Buffer.from([(major << 5) | 24, length]);
  }
  const head = Buffer.alloc(3);
  head[0] = (major << 5) | 25;
  head.writeUInt16BE(length, 1);
  return head;
}

type Cbor = number | string | Uint8Array | ReadonlyMap<Cbor, Cbor>;

/** Just enough CBOR for an attestation object and a COSE key. */
function cbor(value: Cbor): Buffer {
  if (typeof value === 'number') {
    return value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value);
  }
  if (typeof value === 'string') {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([cborHead(3, bytes.length), bytes]);
  }
  if (value instanceof Uint8Array) {
    return Buffer.concat([cborHead(2, value.length), value]);
  }
  const parts = [cborHead(5, value.size)];
  for (const [key, item] of value) {
    parts.push(cbor(key), cbor(item));
  }
  return Buffer.concat(parts);
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest();

const FLAGS_UP_UV = 0x01 | 0x04;
const FLAG_AT = 0x40;

export class SoftAuthenticator {
  readonly credentialId = randomBytes(16);
  private readonly privateKey: KeyObject;
  private readonly x: Buffer;
  private readonly y: Buffer;
  private counter = 0;

  constructor(
    private readonly origin: string,
    private readonly userVerified = true,
  ) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.privateKey = privateKey;
    const jwk = publicKey.export({ format: 'jwk' });
    this.x = Buffer.from(jwk.x ?? '', 'base64url');
    this.y = Buffer.from(jwk.y ?? '', 'base64url');
  }

  private flags(extra = 0): number {
    return (this.userVerified ? FLAGS_UP_UV : 0x01) | extra;
  }

  private clientData(type: 'webauthn.create' | 'webauthn.get', challenge: string): Buffer {
    return Buffer.from(JSON.stringify({ type, challenge, origin: this.origin, crossOrigin: false }));
  }

  create(options: PublicKeyCredentialCreationOptionsJSON): RegistrationResponseJSON {
    const clientDataJSON = this.clientData('webauthn.create', options.challenge);
    const coseKey = new Map<Cbor, Cbor>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, this.x],
      [-3, this.y],
    ]);
    const idLength = Buffer.alloc(2);
    idLength.writeUInt16BE(this.credentialId.length);
    const counter = Buffer.alloc(4);
    const authData = Buffer.concat([sha256(options.rp.id ?? ''), Buffer.from([this.flags(FLAG_AT)]), counter, Buffer.alloc(16), idLength, this.credentialId, cbor(coseKey)]);
    const attestationObject = cbor(
      new Map<Cbor, Cbor>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData],
      ]),
    );
    return {
      id: b64(this.credentialId),
      rawId: b64(this.credentialId),
      type: 'public-key',
      response: { clientDataJSON: b64(clientDataJSON), attestationObject: b64(attestationObject), transports: ['usb'] },
      clientExtensionResults: {},
      authenticatorAttachment: 'cross-platform',
    };
  }

  get(options: PublicKeyCredentialRequestOptionsJSON, credentialId: Uint8Array = this.credentialId): AuthenticationResponseJSON {
    this.counter += 1;
    const clientDataJSON = this.clientData('webauthn.get', options.challenge);
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(this.counter);
    const authenticatorData = Buffer.concat([sha256(options.rpId ?? ''), Buffer.from([this.flags()]), counter]);
    const signature = sign('sha256', Buffer.concat([authenticatorData, sha256(clientDataJSON)]), this.privateKey);
    return {
      id: b64(credentialId),
      rawId: b64(credentialId),
      type: 'public-key',
      response: { clientDataJSON: b64(clientDataJSON), authenticatorData: b64(authenticatorData), signature: b64(signature) },
      clientExtensionResults: {},
      authenticatorAttachment: 'cross-platform',
    };
  }
}
