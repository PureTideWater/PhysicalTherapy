import { AdminUserGlobalSignOutCommand, type CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';

import type { ProviderSignOutAdapter, ProviderSignOutOutcome } from './provider-sign-outs';

/**
 * The provider_sign_outs job's adapter (docs/adr/0095; docs/adr/0094, D7): Cognito's AdminUserGlobalSignOut for one
 * subject, aborted after 10 seconds, well inside the row's two-minute lease. The provider's "no such user" is an
 * answer, not a failure: nothing is left to sign out. Every other error is thrown as it came; the job logs and stores
 * its name alone. The subject goes into the one command and nowhere else. This is the worker's only administrative
 * (IAM-signed) Cognito command: infra/test/application-role.test.ts scans this file beside the web's provider.
 */

export const PROVIDER_SIGN_OUT_TIMEOUT_MS = 10_000;

export interface CognitoSignOutOptions {
  readonly client: Pick<CognitoIdentityProviderClient, 'send'>;
  readonly userPoolId: string;
  /** The abort, in milliseconds (10 seconds unless a test sets it). */
  readonly timeoutMs?: number;
}

export class CognitoProviderSignOut implements ProviderSignOutAdapter {
  constructor(private readonly options: CognitoSignOutOptions) {}

  async signOut(subject: string): Promise<ProviderSignOutOutcome> {
    const abort = new AbortController();
    const timer = setTimeout(() => {
      abort.abort();
    }, this.options.timeoutMs ?? PROVIDER_SIGN_OUT_TIMEOUT_MS);
    try {
      await this.options.client.send(new AdminUserGlobalSignOutCommand({ UserPoolId: this.options.userPoolId, Username: subject }), { abortSignal: abort.signal });
      return 'signed_out';
    } catch (error) {
      if (error instanceof Error && error.name === 'UserNotFoundException') {
        return 'no_such_user';
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Development's twin: the local provider holds no tokens of its own, so there is nothing to end and no one to ask. */
export class LocalProviderSignOut implements ProviderSignOutAdapter {
  signOut(): Promise<ProviderSignOutOutcome> {
    return Promise.resolve('signed_out');
  }
}
