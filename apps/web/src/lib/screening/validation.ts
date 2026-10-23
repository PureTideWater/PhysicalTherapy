import { Resolver } from 'node:dns/promises';

import { GetEmailAddressInsightsCommand, type SESv2Client } from '@aws-sdk/client-sesv2';
import type { ScopeClient, ScopePool } from '@tp/db/runtime';
import type { Logger } from '@tp/observability';

import type { Sealer } from '../auth/seal';
import { rateSubjectHash } from '../http/rate-limit';
import { DOMAIN_CHECK_TIMEOUT_MS, type DomainResolver, type DomainVerdict, LOCAL_DOMAIN_RESOLVER, checkMailDomain } from './address';

/**
 * The screening's server-side address checks (audit #76; docs/adr/0065, D9 steps 2 and 3; the founder's Q1 (g) of
 * 2026-10-21): DNS (address.ts, checkMailDomain) and SES's validation of the mailbox (GetEmailAddressInsights, $0.01 a
 * call, at most the day's cap: 1,000 in production, 50 in staging) run together, after the upload's own checks and the
 * rate limit, so nothing is asked, or paid for, for an upload those refuse, and the added worst case is one 2-second
 * timeout (the plan's G1; the capacity harness charges it).
 *
 * SES's verdicts (LOW, MEDIUM or HIGH):
 * - IsValid, HasValidSyntax, HasValidDnsRecords or MailboxExists LOW refuses;
 * - otherwise IsValid or MailboxExists MEDIUM warns, and the prospect may keep the address;
 * - otherwise it accepts. IsRoleAddress, IsDisposable and IsRandomInput are not read: they say nothing about delivery,
 *   and a practice's billing@ is a role address.
 * A timeout or an error accepts and logs MAIL_VALIDATION_UNAVAILABLE; past the day's cap the call is not made and
 * MAIL_VALIDATION_CAP_REACHED is logged, which alarms (infra/lib/mail.ts). A DNS refusal still refuses, whatever SES
 * says (the call, made at once, still counts toward the cap). No log line names the address or its domain.
 */

/** SES's three confidence verdicts. */
export type ConfidenceVerdict = 'LOW' | 'MEDIUM' | 'HIGH';

/** The verdicts the screening reads, as SES gives them (undefined where SES gives none). */
export interface MailboxVerdicts {
  readonly isValid?: ConfidenceVerdict;
  readonly hasValidSyntax?: ConfidenceVerdict;
  readonly hasValidDnsRecords?: ConfidenceVerdict;
  readonly mailboxExists?: ConfidenceVerdict;
}

/** The validation call: SES on a deployed server, a stand-in in development and tests. */
export interface AddressInsights {
  verdicts(address: string, signal: AbortSignal): Promise<MailboxVerdicts>;
}

/** The address checks a server runs: its resolver, its validation, and the validations a UTC day may make. */
export interface AddressCheckServices {
  readonly resolver: DomainResolver;
  readonly insights: AddressInsights;
  readonly dailyCap: number;
}

/** What the checks together say of an address. */
export type AddressVerdict = 'accept' | 'warn' | 'refuse';

/** How long the validation call may take (one 2-second timeout, run beside the DNS check's). */
export const VALIDATION_TIMEOUT_MS = 2_000;

/** The codes the checks log (infra/lib/mail.ts holds the cap's alarm and the two warnings to these). */
export const MAIL_CHECK_CODES = {
  domainUnavailable: 'MAIL_DOMAIN_CHECK_UNAVAILABLE',
  validationUnavailable: 'MAIL_VALIDATION_UNAVAILABLE',
  capReached: 'MAIL_VALIDATION_CAP_REACHED',
} as const;

/** The rate limiter's bucket for the day's validations, and its one subject: the whole server counts as one. */
export const VALIDATION_BUCKET = 'screening_validation';
const VALIDATION_SUBJECT = 'day';

const VERDICTS: readonly ConfidenceVerdict[] = ['LOW', 'MEDIUM', 'HIGH'];

function verdictOf(value: { readonly ConfidenceVerdict?: string } | undefined): ConfidenceVerdict | undefined {
  const verdict = value?.ConfidenceVerdict;
  return VERDICTS.find((candidate) => candidate === verdict);
}

/** SES's validation of an address (the web task's role holds ses:GetEmailAddressInsights; infra application-role.ts). */
export function sesAddressInsights(client: SESv2Client): AddressInsights {
  return {
    verdicts: async (address, signal) => {
      const response = await client.send(new GetEmailAddressInsightsCommand({ EmailAddress: address }), { abortSignal: signal });
      const mailbox = response.MailboxValidation;
      const evaluations = mailbox?.Evaluations;
      const read = {
        isValid: verdictOf(mailbox?.IsValid),
        hasValidSyntax: verdictOf(evaluations?.HasValidSyntax),
        hasValidDnsRecords: verdictOf(evaluations?.HasValidDnsRecords),
        mailboxExists: verdictOf(evaluations?.MailboxExists),
      };
      return Object.fromEntries(Object.entries(read).filter(([, value]) => value !== undefined));
    },
  };
}

/**
 * The stand-in development and the end-to-end suite use, which calls no one: an address whose mailbox begins
 * "invalid" is LOW, "unconfirmed" MEDIUM, and every other HIGH.
 */
export const LOCAL_ADDRESS_INSIGHTS: AddressInsights = {
  verdicts: (address) => {
    const mailbox = address.slice(0, address.lastIndexOf('@'));
    const verdict: ConfidenceVerdict = mailbox.startsWith('invalid') ? 'LOW' : mailbox.startsWith('unconfirmed') ? 'MEDIUM' : 'HIGH';
    return Promise.resolve({ isValid: verdict, hasValidSyntax: 'HIGH', hasValidDnsRecords: 'HIGH', mailboxExists: verdict });
  },
};

/** A promise of `value` after `ms` milliseconds (at once for 0). */
function after<T>(ms: number, value: () => Promise<T>): Promise<T> {
  return ms === 0 ? value() : new Promise((resolve, reject) => setTimeout(() => void value().then(resolve, reject), ms));
}

/**
 * The stand-ins' checks for development, the end-to-end suite and the capacity harness, each lookup answering after
 * `delayMs` (MAIL_CHECK_DELAY_MS: the harness gives 2,000, the checks' worst case, to every upload; the plan's G1).
 */
export function localAddressChecks(dailyCap: number, delayMs = 0): AddressCheckServices {
  return {
    resolver: {
      resolveMx: (domain) => after(delayMs, () => LOCAL_DOMAIN_RESOLVER.resolveMx(domain)),
      resolve4: (domain) => after(delayMs, () => LOCAL_DOMAIN_RESOLVER.resolve4(domain)),
      resolve6: (domain) => after(delayMs, () => LOCAL_DOMAIN_RESOLVER.resolve6(domain)),
    },
    insights: { verdicts: (address, signal) => after(delayMs, () => LOCAL_ADDRESS_INSIGHTS.verdicts(address, signal)) },
    dailyCap,
  };
}

/** The server's resolver: the VPC's (the task's /etc/resolv.conf), one try, 2 seconds. */
export function systemDomainResolver(): DomainResolver {
  const resolver = new Resolver({ timeout: DOMAIN_CHECK_TIMEOUT_MS, tries: 1 });
  return {
    resolveMx: (domain) => resolver.resolveMx(domain),
    resolve4: (domain) => resolver.resolve4(domain),
    resolve6: (domain) => resolver.resolve6(domain),
  };
}

/** D9's table: LOW on validity, syntax, DNS or the mailbox refuses; MEDIUM on validity or the mailbox warns. */
export function validationVerdict(verdicts: MailboxVerdicts): AddressVerdict {
  const refuses = [verdicts.isValid, verdicts.hasValidSyntax, verdicts.hasValidDnsRecords, verdicts.mailboxExists].includes('LOW');
  if (refuses) {
    return 'refuse';
  }
  return verdicts.isValid === 'MEDIUM' || verdicts.mailboxExists === 'MEDIUM' ? 'warn' : 'accept';
}

/** One of the day's validations, counted before the call: false once the day's cap is reached. */
async function takeValidation(pool: ScopePool<ScopeClient>, sealer: Sealer, dailyCap: number): Promise<boolean> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ allowed: boolean }>('SELECT allowed FROM rate_limit_take($1, $2, $3, $4)', [
      VALIDATION_BUCKET,
      rateSubjectHash(sealer, VALIDATION_BUCKET, 'global', VALIDATION_SUBJECT),
      dailyCap,
      86_400,
    ]);
    return rows[0]?.allowed === true;
  } finally {
    client.release();
  }
}

/** SES's verdict on the mailbox, or null when it was not asked (past the cap) or could not answer. */
async function validated(
  address: string,
  context: { readonly checks: AddressCheckServices; readonly pool: ScopePool<ScopeClient>; readonly sealer: Sealer; readonly logger: Logger },
): Promise<AddressVerdict | null> {
  let allowed: boolean;
  try {
    allowed = await takeValidation(context.pool, context.sealer, context.checks.dailyCap);
  } catch {
    context.logger.warn('screening address not validated: the day’s count could not be read', { error_code: MAIL_CHECK_CODES.validationUnavailable });
    return null;
  }
  if (!allowed) {
    context.logger.warn('screening address not validated: the day’s cap is reached', { error_code: MAIL_CHECK_CODES.capReached });
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);
  try {
    return validationVerdict(await context.checks.insights.verdicts(address, controller.signal));
  } catch {
    context.logger.warn('screening address not validated: the validation did not answer', { error_code: MAIL_CHECK_CODES.validationUnavailable });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The DNS check and SES's validation of `address`, together: refuse when either refuses, warn when the validation warns
 * (unless the prospect kept the address), accept otherwise. A DNS check that could not answer accepts and logs
 * MAIL_DOMAIN_CHECK_UNAVAILABLE.
 */
export async function checkScreeningAddress(
  address: string,
  context: { readonly checks: AddressCheckServices; readonly pool: ScopePool<ScopeClient>; readonly sealer: Sealer; readonly logger: Logger; readonly kept: boolean },
): Promise<AddressVerdict> {
  const domain = address.slice(address.lastIndexOf('@') + 1);
  const [dns, validation] = await Promise.all([
    checkMailDomain(context.checks.resolver, domain).catch((): DomainVerdict => 'unavailable'),
    validated(address, context),
  ]);
  if (dns === 'unavailable') {
    context.logger.warn('screening address’s domain not checked: DNS did not answer', { error_code: MAIL_CHECK_CODES.domainUnavailable });
  }
  if (dns === 'refuse' || validation === 'refuse') {
    return 'refuse';
  }
  return validation === 'warn' && !context.kept ? 'warn' : 'accept';
}
