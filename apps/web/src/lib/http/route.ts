import type { ActorScope, DirectoryPractice, MembershipRole, MfaMethod, Permission, PracticeAccess, PracticeScope, ScopeClient } from '@tp/db/runtime';
import type { z } from 'zod';

import type { EndedReason } from '../auth/sessions';
import type { Services } from '../server/services';

/**
 * Every page, server action and route handler is a Route: an ID, its path, who may use it (public,
 * any signed-in user for their own records, a practice permission, or a platform permission), whether
 * it can show PHI, the Zod schemas for its parameters and input, and its handler. The registry
 * (src/lib/routes) lists every route, and the database tests generate cross-tenant, role, MFA and
 * session tests for each one from it (test matrix SEC-02, SEC-15; docs/adr/0017). The checks run in
 * invoke() (src/lib/http/invoke.ts), in the handler's own process, never in middleware.
 */

export type RouteKind = 'page' | 'action' | 'handler';

export type Access =
  | { readonly kind: 'public' }
  /** Any signed-in user, for their own records (their devices, signing out). */
  | { readonly kind: 'self' }
  /** A permission on the practice named by params.practiceId, inside that practice's scope. */
  | { readonly kind: 'practice'; readonly permission: Permission }
  /** A permission of the actor's internal roles; the transaction has no practice in scope. */
  | { readonly kind: 'platform'; readonly permission: Permission };

/** The browser's cookies, as the request sees them (Next's cookie store, or a test's). */
export interface CookieJar {
  get(name: string): string | undefined;
  set(name: string, value: string, options?: { readonly maxAgeSeconds?: number }): void;
  delete(name: string): void;
}

/** A PUT's body as it streams in, with what its headers declare (the local upload receiver). */
export interface UploadBody {
  readonly contentType: string | null;
  readonly contentLength: number | null;
  readonly body: AsyncIterable<Uint8Array>;
}

export interface RouteRequest {
  readonly cookies: CookieJar;
  readonly params: unknown;
  /** A mutation's input, its request key included. */
  readonly input?: unknown;
  /** A PUT's streamed body. */
  readonly upload?: UploadBody;
  /** An opaque ID for this request: the audit events' request_id. */
  readonly requestId: string;
  readonly userAgent: string | null;
}

export interface Actor {
  readonly userId: string;
  readonly sessionId: string;
  readonly deviceId: string;
  readonly mfaMethod: MfaMethod;
}

/** What the application shell shows: who is signed in, and the practices they reach right now. */
export interface Shell {
  readonly email: string;
  readonly practices: readonly DirectoryPractice[];
  readonly currentPracticeId: string | null;
  readonly platformRoles: readonly MembershipRole[];
}

export interface Issue {
  readonly field: string;
  readonly message: string;
}

export type Outcome<R> =
  | { readonly status: 'ok'; readonly data: R; readonly shell?: Shell }
  | { readonly status: 'invalid'; readonly issues: readonly Issue[] }
  | { readonly status: 'unauthenticated'; readonly reason: 'none' | EndedReason }
  | { readonly status: 'mfa_required' }
  | { readonly status: 'hardware_key_required' }
  | { readonly status: 'forbidden'; readonly permission: Permission; readonly message: string; readonly roles: readonly MembershipRole[]; readonly shell?: Shell }
  | { readonly status: 'not_found' }
  /** A mutation whose request key was already used: it did nothing this time. */
  | { readonly status: 'duplicate' };

/** Thrown by a handler: what the request names does not exist, or the actor cannot see it. */
export class NotFoundError extends Error {
  override readonly name = 'NotFoundError';
  constructor() {
    super('not found');
  }
}

/** Thrown by a handler: input its schema accepts but the domain does not. Messages name fields, never values. */
export class InputError extends Error {
  override readonly name = 'InputError';
  constructor(readonly issues: readonly Issue[]) {
    super(issues.map((issue) => `${issue.field}: ${issue.message}`).join('; '));
  }
}

/** What a mutation returns: the object it changed (for its audit event) and where the browser goes next. */
export interface MutationResult {
  readonly objectId?: string;
  readonly redirect?: string;
}

export interface AuditSpec {
  readonly action: string;
  readonly objectType: string;
}

/**
 * How the generated tests call a route: its parameters and input for a synthetic world's records
 * (src/lib/routes/route-tests.db.test.ts builds the worlds).
 */
export interface SampleRefs {
  readonly practiceId: string;
  readonly organizationId: string;
  readonly agreementId: string;
  readonly adminUserId: string;
  /** A viewer of the practice's group and their membership. */
  readonly memberUserId: string;
  readonly membershipId: string;
  /** A locked user in the group. */
  readonly lockedUserId: string;
  readonly firmId: string;
  readonly grantId: string;
  readonly supportGrantId: string;
  readonly supportEngineerId: string;
  readonly internalOrganizationId: string;
  /** The calling user's own device. */
  readonly actorDeviceId: string;
  /** A source document of the practice awaiting its upload, and a local upload token for it. */
  readonly documentId: string;
  readonly uploadToken: string;
  /** A loaded remittance of the practice, one of its claims and that claim's service line. */
  readonly remittanceId: string;
  readonly claimId: string;
  readonly serviceLineId: string;
  /** The line's payer and plan (unmapped in a fresh world). */
  readonly payerId: string;
  readonly planId: string;
  /** A clean, stored contract document every version below names, and one no version names. */
  readonly contractDocumentId: string;
  readonly untaggedDocumentId: string;
  /** Contracts with the payer: one signed off, one approved awaiting sign-off, one ready for approval, one being abstracted. */
  readonly signedOffContractId: string;
  readonly signedOffVersionId: string;
  readonly approvedVersionId: string;
  readonly readyVersionId: string;
  readonly draftVersionId: string;
  /** An unverified rate record of the draft. */
  readonly draftRateRecordId: string;
  /** Open questions about the signed-off contract: one to answer, one to withdraw. */
  readonly questionId: string;
  readonly withdrawableQuestionId: string;
  /** A complete pricing run of the practice that priced the service line above. */
  readonly pricingRunId: string;
  /** A complete re-run of that run, not yet accepted (docs/adr/0037). */
  readonly rerunId: string;
  /** Triage of the run (docs/adr/0038): an anomaly, a case with one actionable line, and two ready audit reports, one unsigned (with its files' SHA-256) and one attested. */
  readonly anomalyId: string;
  readonly caseId: string;
  readonly caseLineId: string;
  readonly auditReportId: string;
  readonly auditReportPdfSha256: string;
  readonly auditReportCsvSha256: string;
  readonly attestedReportId: string;
  /** A sent monthly digest of the practice; the administrator holds a notification of it and of the pricing run (docs/adr/0039). */
  readonly digestId: string;
  /**
   * The recovery ledger (docs/adr/0042, 0043): an unmatched posting row and an unmatched EFT row, each
   * the whole of the loaded remittance above; an adjusted payment no case line was matched to, of the
   * case line's code and date (the case line's service line); a standing match a person may reverse;
   * and a printed ROI statement.
   */
  readonly postingRowId: string;
  readonly eftRowId: string;
  readonly adjustedClaimId: string;
  readonly caseServiceLineId: string;
  readonly reversibleMatchId: string;
  readonly roiStatementId: string;
  /**
   * The workbench (docs/adr/0044): the case's rate record (its pattern names it); the case's packet's
   * current version, written by an analyst and passing the verifier, unapproved, with the hash an
   * approval names; a second case with an approved, exported version and its submission; and a payer
   * letter a response carries.
   */
  readonly caseRateRecordId: string;
  readonly packetVersionId: string;
  readonly packetVersionSha256: string;
  readonly submittedCaseId: string;
  readonly exportedVersionId: string;
  readonly submissionId: string;
  readonly responseDocumentId: string;
}

export interface RouteSample {
  params(refs: SampleRefs): Record<string, unknown>;
  input?(refs: SampleRefs): Record<string, unknown>;
  /** A PUT's body. */
  upload?(refs: SampleRefs): { readonly contentType: string; readonly body: Uint8Array };
}

/** What a download route returns: an attachment with an opaque file name, never PHI in the name (text, or bytes such as a PDF). */
export interface Download<B extends string | Uint8Array<ArrayBuffer> = string> {
  readonly download: { readonly filename: string; readonly contentType: string; readonly body: B };
}

interface BaseContext<P, I> {
  readonly params: P;
  readonly input: I;
  readonly request: RouteRequest;
  readonly services: Services;
}

export type PublicContext<P, I> = BaseContext<P, I>;

export interface ActorContext<P, I> extends BaseContext<P, I> {
  readonly actor: Actor;
  readonly scope: ActorScope<ScopeClient>;
  readonly platformRoles: readonly MembershipRole[];
}

export interface PracticeContext<P, I> extends BaseContext<P, I> {
  readonly actor: Actor;
  readonly scope: PracticeScope<ScopeClient>;
  readonly practiceId: string;
  readonly access: PracticeAccess;
  readonly platformRoles: readonly MembershipRole[];
}

interface CommonSpec<P, I> {
  readonly id: string;
  readonly kind: RouteKind;
  readonly path: string;
  readonly method?: 'GET' | 'POST' | 'PUT';
  /** Whether it can show PHI: such responses are private, no-store, and its reads go through readWithAudit. */
  readonly phi: boolean;
  readonly params: z.ZodType<P>;
  readonly input?: z.ZodType<I>;
  readonly audit?: AuditSpec;
  readonly sample?: RouteSample;
}

export interface PublicSpec<P, I, R> extends CommonSpec<P, I> {
  readonly handle: (context: PublicContext<P, I>) => Promise<R>;
}

export interface ActorSpec<P, I, R> extends CommonSpec<P, I> {
  readonly handle: (context: ActorContext<P, I>) => Promise<R>;
}

export interface PracticeSpec<P extends { readonly practiceId: string }, I, R> extends CommonSpec<P, I> {
  readonly permission: Permission;
  readonly handle: (context: PracticeContext<P, I>) => Promise<R>;
}

export interface PlatformSpec<P, I, R> extends ActorSpec<P, I, R> {
  readonly permission: Permission;
}

/** A registered route, its types erased except for what it returns. */
export interface Route<R = unknown> {
  readonly id: string;
  readonly kind: RouteKind;
  readonly path: string;
  readonly method: 'GET' | 'POST' | 'PUT';
  readonly access: Access;
  readonly phi: boolean;
  /** Actions and POST and PUT handlers: they need a request key and record an audit event. */
  readonly mutation: boolean;
  readonly audit?: AuditSpec;
  readonly sample?: RouteSample;
  invoke(request: RouteRequest, services: Services): Promise<Outcome<R>>;
}
