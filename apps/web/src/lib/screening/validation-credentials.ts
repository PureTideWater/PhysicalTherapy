import { AssumeRoleCommand, type AssumeRoleCommandOutput, STSClient } from '@aws-sdk/client-sts';

/**
 * The credentials the screening's address validation runs with on a deployed server (docs/adr/0065, "Address validation
 * in its own account"; review S3): a session of the role MAIL_VALIDATION_ROLE_ARN names in the environment's
 * address-validation account (infra/lib/address-validation-stack.ts), assumed with the task's own role. SES's
 * GetEmailAddressInsights then runs as that account, so CloudTrail records the call, whose request names the address,
 * there and never in the environment's own trail.
 *
 * A session lasts 15 minutes, STS's least, so a session that leaked would be good for little, and is renewed once it
 * has under 5 minutes left; callers that ask at once share one renewal. STS answers within the validation's own
 * 2-second bound or the validation does not wait for it (validation.ts), and a refusal reaches the validation as its
 * error, by name (MAIL_VALIDATION_REFUSED).
 */

/** How long a session is asked for: STS's least. */
export const VALIDATION_SESSION_SECONDS = 900;

/** A session is renewed once it has less than this left. */
export const VALIDATION_SESSION_RENEW_MS = 300_000;

/** The session's name, as both accounts' CloudTrail records it: no address, no person. */
export const VALIDATION_SESSION_NAME = 'tp-web-address-validation';

/** Credentials as the AWS SDK takes them from a provider. */
export interface ValidationCredentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken: string;
  readonly expiration: Date;
}

/** The one STS call the provider makes. */
export interface AssumeRoleSender {
  send(command: AssumeRoleCommand): Promise<AssumeRoleCommandOutput>;
}

/** STS answered without a whole session. */
export class ValidationCredentialsMissing extends Error {
  override readonly name = 'ValidationCredentialsMissing';

  constructor() {
    super('STS returned no session for the address-validation role');
  }
}

/** The task's STS client: the region's endpoint, one attempt, bounded like the validation itself. */
function defaultSender(): AssumeRoleSender {
  return new STSClient({ maxAttempts: 1, requestHandler: { connectionTimeout: 1_000, requestTimeout: 2_000 } });
}

/** A provider of the address-validation role's credentials, for `new SESv2Client({ credentials })`. */
export function assumedRoleCredentials(roleArn: string, options: { readonly sts?: AssumeRoleSender; readonly now?: () => number } = {}): () => Promise<ValidationCredentials> {
  const sts = options.sts ?? defaultSender();
  const now = options.now ?? Date.now;
  let current: ValidationCredentials | undefined;
  let renewing: Promise<ValidationCredentials> | undefined;
  const renew = async (): Promise<ValidationCredentials> => {
    const output = await sts.send(new AssumeRoleCommand({ RoleArn: roleArn, RoleSessionName: VALIDATION_SESSION_NAME, DurationSeconds: VALIDATION_SESSION_SECONDS }));
    const session = output.Credentials;
    if (session?.AccessKeyId === undefined || session.SecretAccessKey === undefined || session.SessionToken === undefined || session.Expiration === undefined) {
      throw new ValidationCredentialsMissing();
    }
    current = { accessKeyId: session.AccessKeyId, secretAccessKey: session.SecretAccessKey, sessionToken: session.SessionToken, expiration: session.Expiration };
    return current;
  };
  return () => {
    if (current !== undefined && current.expiration.getTime() - now() > VALIDATION_SESSION_RENEW_MS) {
      return Promise.resolve(current);
    }
    // Cleared once it settles, either way, so a refused renewal is asked again by the next validation.
    renewing ??= renew().finally(() => {
      renewing = undefined;
    });
    return renewing;
  };
}
