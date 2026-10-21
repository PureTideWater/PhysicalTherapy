import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { E2E_MAIL_OUTBOX_DIR } from './env';

/** A message the worker's local mail sender wrote to the e2e outbox (apps/worker/src/mail/mail.ts, LocalMailSender). */
export interface OutboxMessage {
  readonly to: readonly string[];
  readonly subject: string;
  readonly body: string;
  readonly html: string;
}

/**
 * The messages the local outbox holds for one address, oldest first (each file is named by the time it was sent). Only
 * messages renamed into place are read: the local sender writes each under a hidden name first, so a journey never
 * reads a message half written.
 */
export function outboxFor(email: string): OutboxMessage[] {
  if (!existsSync(E2E_MAIL_OUTBOX_DIR)) {
    return [];
  }
  return readdirSync(E2E_MAIL_OUTBOX_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => JSON.parse(readFileSync(path.join(E2E_MAIL_OUTBOX_DIR, file), 'utf8')) as OutboxMessage)
    .filter((message) => message.to.includes(email));
}
