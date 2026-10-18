import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AGREEMENT_KINDS } from '@tp/db/runtime';
import { z } from 'zod';

/**
 * The e-signature vendor (PRD 5, J1: "the signed documents land as Agreement records with hashes"; PRD 20: "The
 * e-signature vendor: one with a BAA; agreements stored by reference", settled by procurement; docs/adr/0053).
 * The plan names no vendor, so this is the interface and its local implementation; the vendor's own adapter is
 * written once procurement chooses it, against this interface. A completed envelope reaches the application as a
 * signed webhook event naming, in the envelope's metadata (set when the founder sends it), the organization, the
 * practice when there is one, the agreement's kind and its version; the signed document itself is fetched from
 * the vendor and hashed here, so the SHA-256 recorded is the application's, never the sender's claim.
 */

export class ESignatureError extends Error {
  override readonly name = 'ESignatureError';
}

export type AgreementKind = (typeof AGREEMENT_KINDS)[number];

export interface CompletedEnvelope {
  /** The vendor's event ID: an event recorded once. */
  readonly eventId: string;
  readonly envelopeRef: string;
  readonly organizationId: string;
  readonly practiceId: string | null;
  readonly kind: AgreementKind;
  readonly version: string;
  readonly signer: string;
  readonly signedAt: Date;
}

export interface ESignatureProvider {
  readonly kind: 'local';
  /** The event, once its signature verifies (within five minutes of its timestamp); throws ESignatureError otherwise. */
  verifyEvent(payload: string, signature: string | null, now: Date): CompletedEnvelope;
  /** The completed envelope's signed document, as the vendor holds it. */
  signedDocument(envelopeRef: string): Promise<Uint8Array>;
}

/** The signature header the webhook reads. */
export const ESIGN_SIGNATURE_HEADER = 'x-esign-signature';

const TOLERANCE_SECONDS = 300;

const CODE = /^[A-Za-z0-9._:-]{1,128}$/;

const eventSchema = z.object({
  format: z.literal('tp-esign-event/1'),
  id: z.string().regex(CODE),
  type: z.literal('envelope.completed'),
  envelope: z.object({
    id: z.string().regex(CODE),
    completed_at: z.iso.datetime(),
    signer: z.object({ name: z.string().trim().min(1).max(200) }),
    metadata: z.object({
      tp_organization_id: z.uuid(),
      tp_practice_id: z.uuid().nullable().optional(),
      tp_agreement_kind: z.enum(AGREEMENT_KINDS),
      tp_agreement_version: z.string().trim().min(1).max(40),
    }),
  }),
});

/** Signs a payload as the vendor does (`t=<seconds>,v1=<hex HMAC-SHA256 of "<seconds>.<payload>">`). */
export function signEvent(secret: string, payload: string, at: Date): string {
  const seconds = Math.floor(at.getTime() / 1000);
  return `t=${String(seconds)},v1=${createHmac('sha256', secret).update(`${String(seconds)}.${payload}`).digest('hex')}`;
}

function verifySignature(secret: string, payload: string, header: string | null, now: Date): void {
  const parts = new Map((header ?? '').split(',').map((part) => part.split('=', 2) as [string, string | undefined]));
  const seconds = Number.parseInt(parts.get('t') ?? '', 10);
  const given = parts.get('v1') ?? '';
  if (!Number.isFinite(seconds) || !/^[0-9a-f]{64}$/.test(given)) {
    throw new ESignatureError('the webhook carries no signature');
  }
  if (Math.abs(now.getTime() / 1000 - seconds) > TOLERANCE_SECONDS) {
    throw new ESignatureError('the webhook signature is too old');
  }
  const expected = createHmac('sha256', secret).update(`${String(seconds)}.${payload}`).digest('hex');
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(given))) {
    throw new ESignatureError('the webhook signature does not verify');
  }
}

/** Verifies and reads an event: the signature first, then the event's shape. */
export function readEvent(secret: string, payload: string, signature: string | null, now: Date): CompletedEnvelope {
  verifySignature(secret, payload, signature, now);
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new ESignatureError('the webhook is not JSON');
  }
  const event = eventSchema.safeParse(parsed);
  if (!event.success) {
    throw new ESignatureError('the webhook is not a completed envelope');
  }
  const { envelope } = event.data;
  return {
    eventId: event.data.id,
    envelopeRef: envelope.id,
    organizationId: envelope.metadata.tp_organization_id,
    practiceId: envelope.metadata.tp_practice_id ?? null,
    kind: envelope.metadata.tp_agreement_kind,
    version: envelope.metadata.tp_agreement_version,
    signer: envelope.signer.name,
    signedAt: new Date(envelope.completed_at),
  };
}

export interface LocalEnvelope {
  readonly organizationId: string;
  readonly practiceId?: string | null;
  readonly kind: AgreementKind;
  readonly version: string;
  readonly signer: string;
  readonly document: Uint8Array;
  readonly completedAt: Date;
}

/**
 * The local stand-in for the vendor (development, tests, e2e): its signed documents in a directory, its events
 * signed with a shared secret, exactly as the webhook verifies them. complete() is what the vendor does when the
 * last signer signs: it keeps the document and returns the event to deliver.
 */
export class LocalESignature implements ESignatureProvider {
  readonly kind = 'local';

  constructor(private readonly options: { readonly secret: string; readonly directory: string }) {}

  verifyEvent(payload: string, signature: string | null, now: Date): CompletedEnvelope {
    return readEvent(this.options.secret, payload, signature, now);
  }

  async signedDocument(envelopeRef: string): Promise<Uint8Array> {
    if (!CODE.test(envelopeRef)) {
      throw new ESignatureError('not an envelope reference');
    }
    try {
      return await readFile(path.join(this.options.directory, `${envelopeRef.replaceAll(':', '_')}.pdf`));
    } catch {
      throw new ESignatureError('the vendor holds no signed document for the envelope');
    }
  }

  async complete(envelope: LocalEnvelope, now: Date = new Date()): Promise<{ readonly payload: string; readonly signature: string; readonly sha256: string; readonly envelopeRef: string }> {
    const envelopeRef = `env_${randomUUID().replaceAll('-', '')}`;
    await mkdir(this.options.directory, { recursive: true });
    await writeFile(path.join(this.options.directory, `${envelopeRef}.pdf`), envelope.document, { mode: 0o600 });
    const payload = JSON.stringify({
      format: 'tp-esign-event/1',
      id: `evt_${randomUUID().replaceAll('-', '')}`,
      type: 'envelope.completed',
      envelope: {
        id: envelopeRef,
        completed_at: envelope.completedAt.toISOString(),
        signer: { name: envelope.signer },
        metadata: {
          tp_organization_id: envelope.organizationId,
          tp_practice_id: envelope.practiceId ?? null,
          tp_agreement_kind: envelope.kind,
          tp_agreement_version: envelope.version,
        },
      },
    });
    return { payload, signature: signEvent(this.options.secret, payload, now), sha256: createHash('sha256').update(envelope.document).digest('hex'), envelopeRef };
  }
}
