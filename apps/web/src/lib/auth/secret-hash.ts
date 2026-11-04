import { createHmac } from 'node:crypto';
import { inspect } from 'node:util';

/**
 * The web client's secret (docs/adr/0088, D1) and the hash a confidential client sends with every Cognito call that
 * names a user: `base64(HMAC-SHA256(secret, USERNAME + clientId))`, over the exact username that request sends.
 *
 * The secret is never a plain string anywhere it could be logged or serialised (review security-N5): it is held in a
 * ClientSecret, whose value sits in a private field that only this module reads, and whose JSON, string and inspected
 * forms are `[redacted]`. So a log of the configuration, or a server component handing the configuration to a client
 * component, carries no value.
 */

const REDACTED = '[redacted]';

/** Reads a ClientSecret's private value: assigned inside the class, used by this module alone. */
let reveal: (secret: ClientSecret) => string;

export class ClientSecret {
  readonly #value: string;

  static {
    reveal = (secret) => secret.#value;
  }

  constructor(value: string) {
    if (value.length === 0) {
      throw new Error('a client secret is never empty');
    }
    this.#value = value;
  }

  toJSON(): string {
    return REDACTED;
  }

  toString(): string {
    return REDACTED;
  }

  [inspect.custom](): string {
    return REDACTED;
  }
}

/** The SECRET_HASH (InitiateAuth, RespondToAuthChallenge) or SecretHash (ForgotPassword, ConfirmForgotPassword) for `username` as sent. */
export function secretHash(secret: ClientSecret, username: string, clientId: string): string {
  return createHmac('sha256', reveal(secret)).update(`${username}${clientId}`, 'utf8').digest('base64');
}

/** The raw secret, for the one parameter that takes it as itself: RevokeToken's ClientSecret. */
export function clientSecretValue(secret: ClientSecret): string {
  return reveal(secret);
}
