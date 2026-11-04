import type { Logger } from '@tp/observability';

import { PRIVATE_NO_STORE } from '../http/handler';
import { isClientCredentialFailure } from './cognito-provider';

/**
 * The start-up credential probe (docs/adr/0088, D8; review infra-auth-IA-6). Once per process, the web server asks
 * Cognito to start a sign-in for PROBE_USERNAME, a reserved name that never exists, with the computed secret hash. The
 * pool hides whether a user exists, so a right credential is answered with an ordinary refusal or a challenge; only a
 * wrong secret or a wrong client is refused for the client itself. While the process holds that positive refusal,
 * the health check answers 503 (docs/adr/0055's check then also reflects this one cached result), so a deploy with a
 * wrong secret, JSON key or client ID is rolled back by the circuit breaker before CloudFormation deletes the old
 * client.
 *
 * It fails open by design: throttling, a timeout, a network error or anything else unexpected passes (logged
 * inconclusive), so a provider blip never blocks a deploy or a scale-out; the ClientCredentialRefused alarm and the
 * deploy runbook's smoke sign-in still catch a miss. It is skipped while no client secret is set (release N's public
 * client) and for the dev provider. It logs the error name alone, never the username or the provider's words.
 */

/** The reserved synthetic username the probe signs in as: under the reserved `.invalid` domain, so never a person's. */
export const PROBE_USERNAME = 'credential-probe@probe.invalid';

/** How long the probe waits before it passes open as inconclusive. */
export const PROBE_TIMEOUT_MS = 5000;

export type ProbeResult = 'passed' | 'refused' | 'inconclusive';
export type ProbeState = 'skipped' | 'pending' | ProbeResult;

/** The answers that prove the credential was accepted: the pool's refusal of an unknown user (or none at all). */
const ACCEPTED = new Set(['NotAuthorizedException', 'UserNotFoundException']);

function errorName(error: unknown): string {
  return error instanceof Error && error.name.length > 0 ? error.name : 'unknown';
}

/** A wrong client ID: Cognito names the client as not existing. */
function clientMissing(error: unknown): boolean {
  return errorName(error) === 'ResourceNotFoundException' || (error instanceof Error && /\bclient\b.*\bdoes not exist\b/i.test(error.message));
}

/** What a probe's error says; no error (a challenge) is a pass. */
export function classifyProbe(error: unknown): ProbeResult {
  if (isClientCredentialFailure(error) || clientMissing(error)) {
    return 'refused';
  }
  return ACCEPTED.has(errorName(error)) ? 'passed' : 'inconclusive';
}

class ProbeTimeout extends Error {
  override readonly name = 'ProbeTimeout';
}

export class CredentialProbe {
  private outcome: ProbeState;
  private running: Promise<ProbeResult | 'skipped'> | undefined;

  /** The probe of a process that has no client secret (or no Cognito): never runs, never refuses. */
  static skipped(): CredentialProbe {
    return new CredentialProbe(undefined, undefined);
  }

  /** `attempt`: the provider's probe request, resolving on any answer and rejecting with the provider's error. */
  constructor(
    private readonly attempt: (() => Promise<unknown>) | undefined,
    private readonly logger: Logger | undefined,
    private readonly timeoutMs: number = PROBE_TIMEOUT_MS,
  ) {
    this.outcome = attempt === undefined ? 'skipped' : 'pending';
  }

  get state(): ProbeState {
    return this.outcome;
  }

  /** Whether the process holds a positive refusal of its client credential. */
  refused(): boolean {
    return this.outcome === 'refused';
  }

  /** Runs the probe the first time it is called; every call answers the same cached outcome. */
  start(): Promise<ProbeResult | 'skipped'> {
    this.running ??= this.run();
    return this.running;
  }

  private async run(): Promise<ProbeResult | 'skipped'> {
    const { attempt, logger } = this;
    if (attempt === undefined) {
      return 'skipped';
    }
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new ProbeTimeout());
      }, this.timeoutMs);
    });
    let result: ProbeResult;
    let code: string | null = null;
    try {
      await Promise.race([attempt(), timeout]);
      result = 'passed';
    } catch (error) {
      code = errorName(error);
      result = error instanceof ProbeTimeout ? 'inconclusive' : classifyProbe(error);
    } finally {
      clearTimeout(timer);
    }
    this.outcome = result;
    switch (result) {
      case 'passed':
        logger?.info('cognito probe passed', { error_code: code });
        break;
      case 'refused':
        logger?.error('cognito probe refused', { error_code: code });
        break;
      case 'inconclusive':
        logger?.warn('cognito probe inconclusive', { error_code: code });
        break;
    }
    return result;
  }
}

/**
 * The health check's answer while the probe holds a refusal (503); undefined otherwise, when the check runs as before.
 * Its body is generic: the check is public, and the process log already names the cause (review security-N7).
 */
export function probeRefusal(probe: CredentialProbe): Response | undefined {
  if (!probe.refused()) {
    return undefined;
  }
  return new Response(JSON.stringify({ status: 'unavailable' }), { status: 503, headers: { 'content-type': 'application/json', 'cache-control': PRIVATE_NO_STORE } });
}
