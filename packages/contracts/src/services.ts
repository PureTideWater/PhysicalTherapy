import {
  type Permission,
  PermissionDeniedError,
  type PracticeScope,
  type ScopeClient,
  readWithAudit,
  recordAuditEvent,
  requirePlatformPermission,
  requirePracticePermission,
} from '@tp/db/runtime';
import { z } from 'zod';

import { type DerivedCalendarEvent, deriveCalendarEvents } from './calendar';
import { isIsoDate } from './dates';
import type { EvidenceProblem, EvidenceResolution, EvidenceResolver } from './evidence/resolve';
import {
  DISPUTE_WINDOW_COLUMNS,
  type DisputeWindowRow,
  RATE_RECORD_COLUMNS,
  type RateRecordRow,
  VERSION_COLUMNS,
  type VersionRow,
  disputeWindowRecord,
  loadRateRecords,
  loadVersions,
  rateRecord,
  versionRecord,
} from './load';
import type { ContractVersionRecord, DisputeWindowRecord, RateRecord } from './records';
import { type Citation, RATE_RECORD_FIELDS, type RateRecordField, type RateRecordTerms, appealLevelsSchema, citationSchema, parseRateTerms, rateTermsToJson } from './terms';

/**
 * The contract workflow (PRD 5, J5 and J6; PRD 7, Contracts, Rate record review and Payer and plan
 * mapping; PRD 9, Contract rate records; CLAUDE.md: "Every mutation: ... a Zod schema, a role check, a
 * practice-scoped transaction ... and an audit event"). Each service takes the caller's practice
 * scope (withPracticeScope: the route wrapper's transaction), validates its input with Zod, checks the
 * actor's role in the scope, writes, and records its audit event in the same transaction. The
 * database checks again what is role-specific (approval by a contract specialist, sign-off by a
 * practice administrator or billing manager) and holds the state machine, so no path around these
 * functions can do what they refuse.
 *
 * Who does what:
 * - Tagging an uploaded contract to a payer (createContract, createDraftVersion): whoever uploads
 *   files (file.upload), or the contract specialist (rate_record.edit).
 * - Abstracting (addRateRecord, updateRateRecord, removeRateRecord, updateDraftVersion,
 *   proposeVersion, amendVersion, supersedeVersion): the contract specialist (rate_record.edit), in a
 *   practice reached through a support grant (docs/adr/0028).
 * - Approving field by field and approving the version (approveRateRecordField, approveVersion): the
 *   contract specialist (the platform permission rate_record.approve), once the evidence resolves.
 * - Citing the contract's own dispute window (citeDisputeWindow): the specialist (rate_record.edit), as a rate
 *   record is cited; verifying it against its page (verifyDisputeWindow): the specialist (rate_record.approve).
 *   A model never cites or verifies a window: only a verified window of a signed-off version verifies its
 *   lines' deadlines (D17 a, docs/adr/0061).
 * - Signing off (signOffVersion): the practice administrator or billing manager (contract.sign_off).
 * - Mapping plans (mapPlan, correctMapping): the billing manager (mapping.edit).
 */

/** What a service refuses for a reason a person can act on. Messages name rules, never values. */
export class ContractWorkflowError extends Error {
  override readonly name = 'ContractWorkflowError';

  constructor(
    readonly reason: 'not_found' | 'invalid',
    message: string,
    readonly issues: readonly { readonly field: string; readonly message: string }[] = [],
    /** When evidence did not resolve: the problem the specialist sees beside the field. */
    readonly evidenceProblem?: EvidenceProblem,
  ) {
    super(message);
  }
}

export interface WorkflowContext {
  /** The request's transaction, scoped to the practice. */
  readonly scope: PracticeScope<ScopeClient>;
  /** The request's (or job's) opaque ID, recorded with every audit event. */
  readonly requestId: string;
  /** Resolves citations against the practice's documents; needed wherever evidence is read. */
  readonly evidence?: EvidenceResolver;
}

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'must be an ID');
const isoDate = z.string().refine(isIsoDate, 'must be a calendar date (YYYY-MM-DD)');
const days = z.number().int().min(1).max(3650);

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({ field: issue.path.join('.') || 'input', message: issue.message }));
    throw new ContractWorkflowError('invalid', `the request is not valid: ${issues.map((issue) => `${issue.field} ${issue.message}`).join('; ')}`, issues);
  }
  return result.data;
}

function sqlState(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}

/** Runs a write; an exclusion violation (overlapping windows) becomes a refusal with `message`. */
async function overlapRefused<T>(message: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (sqlState(error) === '23P01') {
      throw new ContractWorkflowError('invalid', message, [{ field: 'effectiveFrom', message }]);
    }
    throw error;
  }
}

/** The first of the permissions the actor holds in the practice; refuses with the first's denial otherwise. */
function requireAnyPracticePermission(scope: PracticeScope<ScopeClient>, practiceId: string, permissions: readonly [Permission, ...Permission[]]): void {
  let first: unknown;
  for (const permission of permissions) {
    try {
      requirePracticePermission(scope, practiceId, permission);
      return;
    } catch (error) {
      if (!(error instanceof PermissionDeniedError)) {
        throw error;
      }
      first ??= error;
    }
  }
  throw first;
}

/** A contract specialist (rate_record.approve, a platform permission) working in a practice they reach. */
async function requireSpecialist(scope: PracticeScope<ScopeClient>, practiceId: string): Promise<void> {
  if (scope.access(practiceId) === undefined) {
    throw new PermissionDeniedError('rate_record.approve', 'no_access', []);
  }
  await requirePlatformPermission(scope, 'rate_record.approve');
}

function requireEvidence(context: WorkflowContext): EvidenceResolver {
  if (context.evidence === undefined) {
    throw new ContractWorkflowError('invalid', 'this step reads the cited pages, and no document reader is configured');
  }
  return context.evidence;
}

const read = (context: WorkflowContext, practiceId: string) => ({ practiceId, requestId: context.requestId, purpose: 'contract_workflow' });

async function versionById(context: WorkflowContext, practiceId: string, versionId: string): Promise<ContractVersionRecord> {
  const rows = await readWithAudit(
    context.scope,
    { objectType: 'contract_version', purpose: 'contract_workflow', requestId: context.requestId },
    async (client) => (await client.query<VersionRow>(`SELECT ${VERSION_COLUMNS} FROM contract_version v WHERE v.id = $1 AND v.practice_id = $2`, [versionId, practiceId])).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  const [row] = rows;
  if (row === undefined) {
    throw new ContractWorkflowError('not_found', 'no such contract version in this practice');
  }
  return versionRecord(row);
}

async function recordById(context: WorkflowContext, practiceId: string, rateRecordId: string): Promise<RateRecord> {
  const rows = await readWithAudit(
    context.scope,
    { objectType: 'rate_record', purpose: 'contract_workflow', requestId: context.requestId },
    async (client) => (await client.query<RateRecordRow>(`SELECT ${RATE_RECORD_COLUMNS} FROM rate_record r WHERE r.id = $1 AND r.practice_id = $2`, [rateRecordId, practiceId])).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  const [row] = rows;
  if (row === undefined) {
    throw new ContractWorkflowError('not_found', 'no such rate record in this practice');
  }
  return rateRecord(row);
}

async function windowById(context: WorkflowContext, practiceId: string, versionId: string): Promise<DisputeWindowRecord> {
  const rows = await readWithAudit(
    context.scope,
    { objectType: 'contract_version', purpose: 'contract_workflow', requestId: context.requestId },
    async (client) => (await client.query<DisputeWindowRow>(`SELECT ${DISPUTE_WINDOW_COLUMNS} FROM contract_version v WHERE v.id = $1 AND v.practice_id = $2`, [versionId, practiceId])).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  const [row] = rows;
  if (row === undefined) {
    throw new ContractWorkflowError('not_found', 'no such contract version in this practice');
  }
  return disputeWindowRecord(row);
}

function requireEditable(version: ContractVersionRecord): void {
  if (version.status !== 'draft' && version.status !== 'proposed') {
    throw new ContractWorkflowError('invalid', 'an approved or signed-off version never changes; supersede it with a new version');
  }
}

function citationJson(citation: Citation): Record<string, string | number> {
  return { document_id: citation.document_id, page: citation.page, quote: citation.quote, hash: citation.hash };
}

/** Cites a quote on a page of one of the version's documents, with the page's hash; refuses one that does not resolve. */
async function citeOrRefuse(context: WorkflowContext, version: ContractVersionRecord, citation: { documentId: string; page: number; quote: string }): Promise<Citation> {
  const cited = await requireEvidence(context).cite(citation.documentId, citation.page, citation.quote, version.sourceDocumentIds);
  if (!cited.cited) {
    throw new ContractWorkflowError('invalid', `the citation does not resolve to its page (${cited.problem.replaceAll('_', ' ')})`, [{ field: 'citation', message: cited.problem }], cited.problem);
  }
  return cited.citation;
}

// ---------------------------------------------------------------------------------------------------
// Contracts and versions

const createContractInput = z.strictObject({
  practiceId: uuid,
  payerId: uuid,
  title: z.string().trim().min(1).max(200),
  billingEntity: z.string().trim().min(1).max(200).nullable().default(null),
});

/** A contract with a payer: the customer tags an uploaded contract to its payer (J5). */
export async function createContract(context: WorkflowContext, input: z.input<typeof createContractInput>): Promise<{ readonly contractId: string }> {
  const request = parse(createContractInput, input);
  requireAnyPracticePermission(context.scope, request.practiceId, ['file.upload', 'rate_record.edit']);
  const { rows } = await context.scope.client.query<{ id: string }>('INSERT INTO contract (practice_id, payer_id, title, billing_entity) VALUES ($1, $2, $3, $4) RETURNING id', [
    request.practiceId,
    request.payerId,
    request.title,
    request.billingEntity,
  ]);
  const contractId = rows[0]?.id ?? '';
  await recordAuditEvent(context.scope, { action: 'contract_created', objectType: 'contract', objectId: contractId, practiceId: request.practiceId, requestId: context.requestId });
  return { contractId };
}

const versionFields = {
  effectiveTo: isoDate.nullable(),
  sourceDocumentIds: z
    .array(uuid)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, 'names each document once'),
  timelyFilingDays: days.nullable(),
  disputeWindowDays: days.nullable(),
  appealLevels: appealLevelsSchema,
  noticeDays: days.nullable(),
};

const createDraftInput = z.strictObject({
  practiceId: uuid,
  contractId: uuid,
  effectiveFrom: isoDate,
  effectiveTo: versionFields.effectiveTo.default(null),
  sourceDocumentIds: versionFields.sourceDocumentIds.default([]),
  timelyFilingDays: versionFields.timelyFilingDays.default(null),
  disputeWindowDays: versionFields.disputeWindowDays.default(null),
  appealLevels: versionFields.appealLevels.default([]),
  noticeDays: versionFields.noticeDays.default(null),
});
type DraftFields = z.output<typeof createDraftInput>;

const OVERLAP = 'versions of one contract never overlap: amend the version in force, or supersede it';

async function insertVersion(
  context: WorkflowContext,
  fields: DraftFields,
  supersedesId: string | null,
  windowCitation: Citation | null = null,
): Promise<{ versionId: string; versionNo: number }> {
  // One new version per contract at a time, so two drafts never take the same number.
  await context.scope.client.query("SELECT pg_advisory_xact_lock(hashtextextended('contract_version:' || $1, 0))", [fields.contractId]);
  const { rows } = await overlapRefused(OVERLAP, () =>
    context.scope.client.query<{ id: string; version_no: number }>(
      `INSERT INTO contract_version (practice_id, contract_id, version_no, source_document_ids, effective_from, effective_to, supersedes_id,
                                     timely_filing_days, dispute_window_days, appeal_levels, notice_days, dispute_window_evidence)
       SELECT $1, $2, coalesce(max(v.version_no), 0) + 1, $3::uuid[], $4, $5, $6, $7, $8, $9::jsonb, $10, $11::jsonb
         FROM contract_version v WHERE v.contract_id = $2
       RETURNING id, version_no`,
      [
        fields.practiceId,
        fields.contractId,
        fields.sourceDocumentIds,
        fields.effectiveFrom,
        fields.effectiveTo,
        supersedesId,
        fields.timelyFilingDays,
        fields.disputeWindowDays,
        JSON.stringify(fields.appealLevels),
        fields.noticeDays,
        windowCitation === null ? null : JSON.stringify(citationJson(windowCitation)),
      ],
    ),
  );
  const row = rows[0];
  return { versionId: row?.id ?? '', versionNo: row?.version_no ?? 0 };
}

async function requireContract(context: WorkflowContext, practiceId: string, contractId: string): Promise<void> {
  const rows = await readWithAudit(
    context.scope,
    { objectType: 'contract', purpose: 'contract_workflow', requestId: context.requestId },
    async (client) => (await client.query<{ id: string; practice_id: string }>('SELECT id, practice_id FROM contract WHERE id = $1 AND practice_id = $2', [contractId, practiceId])).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  if (rows.length === 0) {
    throw new ContractWorkflowError('not_found', 'no such contract in this practice');
  }
}

/** A draft version of a contract, naming the documents it is abstracted from (J5: the document enters the specialist queue). */
export async function createDraftVersion(context: WorkflowContext, input: z.input<typeof createDraftInput>): Promise<{ readonly versionId: string; readonly versionNo: number }> {
  const request = parse(createDraftInput, input);
  requireAnyPracticePermission(context.scope, request.practiceId, ['file.upload', 'rate_record.edit']);
  await requireContract(context, request.practiceId, request.contractId);
  const created = await insertVersion(context, request, null);
  await recordAuditEvent(context.scope, { action: 'contract_version_drafted', objectType: 'contract_version', objectId: created.versionId, practiceId: request.practiceId, requestId: context.requestId });
  return created;
}

const updateDraftInput = z.strictObject({
  practiceId: uuid,
  versionId: uuid,
  effectiveFrom: isoDate.optional(),
  effectiveTo: versionFields.effectiveTo.optional(),
  sourceDocumentIds: versionFields.sourceDocumentIds.optional(),
  timelyFilingDays: versionFields.timelyFilingDays.optional(),
  disputeWindowDays: versionFields.disputeWindowDays.optional(),
  appealLevels: versionFields.appealLevels.optional(),
  noticeDays: versionFields.noticeDays.optional(),
});

/**
 * Edits a draft or proposed version's window, documents and windows (the specialist). Any change of the dispute
 * window's days or of the documents clears the window's verification (the database does it); a window made
 * silent loses its citation too, since a citation is of a window the version states.
 */
export async function updateDraftVersion(context: WorkflowContext, input: z.input<typeof updateDraftInput>): Promise<void> {
  const request = parse(updateDraftInput, input);
  requirePracticePermission(context.scope, request.practiceId, 'rate_record.edit');
  const version = await versionById(context, request.practiceId, request.versionId);
  requireEditable(version);
  await overlapRefused(OVERLAP, () =>
    context.scope.client.query(
      `UPDATE contract_version SET effective_from = $3, effective_to = $4, source_document_ids = $5::uuid[], timely_filing_days = $6,
              dispute_window_days = $7, appeal_levels = $8::jsonb, notice_days = $9,
              dispute_window_evidence = CASE WHEN $7::integer IS NULL THEN NULL ELSE dispute_window_evidence END
        WHERE id = $1 AND practice_id = $2`,
      [
        request.versionId,
        request.practiceId,
        request.effectiveFrom ?? version.effectiveFrom,
        request.effectiveTo === undefined ? version.effectiveTo : request.effectiveTo,
        request.sourceDocumentIds ?? version.sourceDocumentIds,
        request.timelyFilingDays === undefined ? version.windows.timely_filing_days : request.timelyFilingDays,
        request.disputeWindowDays === undefined ? version.windows.dispute_window_days : request.disputeWindowDays,
        JSON.stringify(request.appealLevels ?? version.windows.appeal_levels),
        request.noticeDays === undefined ? version.noticeDays : request.noticeDays,
      ],
    ),
  );
  await recordAuditEvent(context.scope, { action: 'contract_version_edited', objectType: 'contract_version', objectId: request.versionId, practiceId: request.practiceId, requestId: context.requestId });
}

const attachInput = z.strictObject({ practiceId: uuid, versionId: uuid, documentId: uuid });

/**
 * Adds an uploaded document to a draft or proposed version (J5: the customer tags an exhibit or an
 * amendment's pages to the contract being abstracted, and the specialist abstracts from it too). Like
 * tagging, it is the uploader's or the specialist's; the database checks the document is a clean
 * contract, exhibit or payer letter of the practice. A document already named changes nothing.
 */
export async function attachDocument(context: WorkflowContext, input: z.input<typeof attachInput>): Promise<{ readonly attached: boolean }> {
  const request = parse(attachInput, input);
  requireAnyPracticePermission(context.scope, request.practiceId, ['file.upload', 'rate_record.edit']);
  const version = await versionById(context, request.practiceId, request.versionId);
  requireEditable(version);
  if (version.sourceDocumentIds.includes(request.documentId)) {
    return { attached: false };
  }
  await context.scope.client.query('UPDATE contract_version SET source_document_ids = source_document_ids || $3::uuid WHERE id = $1 AND practice_id = $2', [
    request.versionId,
    request.practiceId,
    request.documentId,
  ]);
  await recordAuditEvent(context.scope, { action: 'contract_document_attached', objectType: 'contract_version', objectId: request.versionId, practiceId: request.practiceId, requestId: context.requestId });
  return { attached: true };
}

// ---------------------------------------------------------------------------------------------------
// Rate records

const citationInput = z.strictObject({ documentId: uuid, page: z.number().int().min(1).max(999_999), quote: z.string().max(2000) });

const addRecordInput = z.strictObject({
  practiceId: uuid,
  versionId: uuid,
  /** The terms as entered: flags left out are off, rounding left out is the contract being silent. */
  terms: z.unknown(),
  citation: citationInput.nullable().default(null),
});

function termsOrRefuse(value: unknown): RateRecordTerms {
  try {
    return parseRateTerms(value, true);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((issue) => ({ field: ['terms', ...issue.path.map(String)].join('.'), message: issue.message }));
      throw new ContractWorkflowError('invalid', `the rate record's terms are not valid: ${issues.map((issue) => `${issue.field} ${issue.message}`).join('; ')}`, issues);
    }
    throw error;
  }
}

async function insertRecord(context: WorkflowContext, practiceId: string, versionId: string, terms: RateRecordTerms, citation: Citation | null, proposedBy: 'specialist' | 'model'): Promise<string> {
  const json = rateTermsToJson(terms);
  const { rows } = await context.scope.client.query<{ id: string }>(
    `INSERT INTO rate_record (practice_id, contract_version_id, scope, method, parameters, flags, rounding, evidence, proposed_by)
     VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6::jsonb, $7, $8::jsonb, $9) RETURNING id`,
    [practiceId, versionId, JSON.stringify(json.scope), json.method, JSON.stringify(json.parameters), JSON.stringify(json.flags), json.rounding, JSON.stringify(citation === null ? {} : citationJson(citation)), proposedBy],
  );
  return rows[0]?.id ?? '';
}

/** A term the specialist abstracts by hand into a draft or proposed version, citing its page (v0). */
export async function addRateRecord(context: WorkflowContext, input: z.input<typeof addRecordInput>): Promise<{ readonly rateRecordId: string }> {
  const request = parse(addRecordInput, input);
  requirePracticePermission(context.scope, request.practiceId, 'rate_record.edit');
  const version = await versionById(context, request.practiceId, request.versionId);
  requireEditable(version);
  const terms = termsOrRefuse(request.terms);
  const citation = request.citation === null ? null : await citeOrRefuse(context, version, request.citation);
  const rateRecordId = await insertRecord(context, request.practiceId, version.id, terms, citation, 'specialist');
  await recordAuditEvent(context.scope, { action: 'rate_record_added', objectType: 'rate_record', objectId: rateRecordId, practiceId: request.practiceId, requestId: context.requestId });
  return { rateRecordId };
}

const updateRecordInput = z.strictObject({
  practiceId: uuid,
  rateRecordId: uuid,
  terms: z.unknown().optional(),
  /** A new citation; null removes it. */
  citation: citationInput.nullable().optional(),
});

/**
 * Edits a draft or proposed version's rate record. What the edit changes loses its field approval
 * (all of them when the citation changes), and with it the record's verification.
 */
export async function updateRateRecord(context: WorkflowContext, input: z.input<typeof updateRecordInput>): Promise<void> {
  const request = parse(updateRecordInput, input);
  requirePracticePermission(context.scope, request.practiceId, 'rate_record.edit');
  const record = await recordById(context, request.practiceId, request.rateRecordId);
  const version = await versionById(context, request.practiceId, record.contractVersionId);
  requireEditable(version);
  const terms = request.terms === undefined ? record.terms : termsOrRefuse(request.terms);
  const citation = request.citation === undefined ? record.citation : request.citation === null ? null : await citeOrRefuse(context, version, request.citation);
  const json = rateTermsToJson(terms);
  await context.scope.client.query(
    `UPDATE rate_record
        SET scope = $3::jsonb, method = $4, parameters = $5::jsonb, flags = $6::jsonb, rounding = $7,
            evidence = $8::jsonb || CASE WHEN evidence ? 'approved_fields' THEN jsonb_build_object('approved_fields', evidence -> 'approved_fields') ELSE '{}'::jsonb END
      WHERE id = $1 AND practice_id = $2`,
    [request.rateRecordId, request.practiceId, JSON.stringify(json.scope), json.method, JSON.stringify(json.parameters), JSON.stringify(json.flags), json.rounding, JSON.stringify(citation === null ? {} : citationJson(citation))],
  );
  await recordAuditEvent(context.scope, { action: 'rate_record_edited', objectType: 'rate_record', objectId: request.rateRecordId, practiceId: request.practiceId, requestId: context.requestId });
}

const removeRecordInput = z.strictObject({ practiceId: uuid, rateRecordId: uuid });

/** Removes a rate record from a draft or proposed version (resolving conflicting terms, CON-06). */
export async function removeRateRecord(context: WorkflowContext, input: z.input<typeof removeRecordInput>): Promise<void> {
  const request = parse(removeRecordInput, input);
  requirePracticePermission(context.scope, request.practiceId, 'rate_record.edit');
  const record = await recordById(context, request.practiceId, request.rateRecordId);
  requireEditable(await versionById(context, request.practiceId, record.contractVersionId));
  await context.scope.client.query('DELETE FROM rate_record WHERE id = $1 AND practice_id = $2', [request.rateRecordId, request.practiceId]);
  await recordAuditEvent(context.scope, { action: 'rate_record_removed', objectType: 'rate_record', objectId: request.rateRecordId, practiceId: request.practiceId, requestId: context.requestId });
}

const proposeInput = z.strictObject({
  practiceId: uuid,
  versionId: uuid,
  rateRecords: z
    .array(
      z.strictObject({
        terms: z.unknown(),
        /** As the proposal cites it, with the hash of the page the proposer read. */
        citation: z.strictObject({ documentId: uuid, page: z.number().int().min(1).max(999_999), quote: z.string().max(2000), hash: z.string() }),
      }),
    )
    .min(1)
    .max(1000),
});

export interface ProposedRecordCheck {
  readonly rateRecordId: string;
  /** The verifier's answer (CON-05): a quote not on its page fails here, and the specialist sees it. */
  readonly evidence: EvidenceResolution | null;
}

/**
 * Records a model's proposal into a draft version (v1: "the model proposes the abstraction and the
 * specialist verifies each field against the cited page") and moves the version to proposed. Each
 * proposed record is checked against its cited page at once; a failure is returned beside the
 * record, and the record cannot be verified until it resolves (CON-05).
 */
export async function proposeVersion(context: WorkflowContext, input: z.input<typeof proposeInput>): Promise<{ readonly checks: readonly ProposedRecordCheck[] }> {
  const request = parse(proposeInput, input);
  requirePracticePermission(context.scope, request.practiceId, 'rate_record.edit');
  const version = await versionById(context, request.practiceId, request.versionId);
  if (version.status !== 'draft') {
    throw new ContractWorkflowError('invalid', 'a proposal is recorded into a draft version');
  }
  const checks: ProposedRecordCheck[] = [];
  for (const [index, proposed] of request.rateRecords.entries()) {
    const terms = termsOrRefuse(proposed.terms);
    const citation = parse(citationSchema, { document_id: proposed.citation.documentId, page: proposed.citation.page, quote: proposed.citation.quote, hash: proposed.citation.hash });
    const rateRecordId = await insertRecord(context, request.practiceId, version.id, terms, citation, 'model');
    checks[index] = { rateRecordId, evidence: context.evidence === undefined ? null : await context.evidence.resolve(citation, version.sourceDocumentIds) };
  }
  await context.scope.client.query("UPDATE contract_version SET status = 'proposed' WHERE id = $1 AND practice_id = $2", [version.id, request.practiceId]);
  await recordAuditEvent(context.scope, { action: 'contract_version_proposed', objectType: 'contract_version', objectId: version.id, practiceId: request.practiceId, requestId: context.requestId });
  return { checks };
}

const recordInput = z.strictObject({ practiceId: uuid, rateRecordId: uuid });

/** Whether a rate record's citation resolves to its page now (the review screen shows it beside each field). */
export async function checkEvidence(context: WorkflowContext, input: z.input<typeof recordInput>): Promise<EvidenceResolution> {
  const request = parse(recordInput, input);
  requireAnyPracticePermission(context.scope, request.practiceId, ['rate_record.edit', 'contract.sign_off']);
  const record = await recordById(context, request.practiceId, request.rateRecordId);
  const version = await versionById(context, request.practiceId, record.contractVersionId);
  return requireEvidence(context).resolve(record.citation, version.sourceDocumentIds);
}

const approveFieldInput = z.strictObject({ practiceId: uuid, rateRecordId: uuid, field: z.enum(RATE_RECORD_FIELDS) });

export interface FieldApprovalResult {
  readonly approvedFields: readonly RateRecordField[];
  /** True once every field is approved and the evidence resolves. */
  readonly verified: boolean;
  /** The evidence check, once every field is approved. */
  readonly evidence: EvidenceResolution | null;
}

/**
 * The specialist approves one field of a rate record (PRD 7: "Specialist approves field by field").
 * With the last field approved, the citation is resolved against its page; the record is verified
 * only when it resolves (CON-04, CON-05).
 */
export async function approveRateRecordField(context: WorkflowContext, input: z.input<typeof approveFieldInput>): Promise<FieldApprovalResult> {
  const request = parse(approveFieldInput, input);
  await requireSpecialist(context.scope, request.practiceId);
  const record = await recordById(context, request.practiceId, request.rateRecordId);
  const version = await versionById(context, request.practiceId, record.contractVersionId);
  requireEditable(version);
  await context.scope.client.query(
    `UPDATE rate_record
        SET evidence = evidence || jsonb_build_object('approved_fields',
              coalesce(evidence -> 'approved_fields', '{}'::jsonb) || jsonb_build_object($3::text, jsonb_build_object('by', app_actor_id(), 'at', now())))
      WHERE id = $1 AND practice_id = $2`,
    [request.rateRecordId, request.practiceId, request.field],
  );
  await recordAuditEvent(context.scope, {
    action: 'rate_record_field_approved',
    objectType: 'rate_record',
    objectId: request.rateRecordId,
    practiceId: request.practiceId,
    purpose: request.field,
    requestId: context.requestId,
  });
  const approvedFields = RATE_RECORD_FIELDS.filter((field) => field === request.field || record.approvals[field] !== undefined);
  if (approvedFields.length < RATE_RECORD_FIELDS.length || record.verifiedBy !== null) {
    return { approvedFields, verified: record.verifiedBy !== null, evidence: null };
  }
  const evidence = await requireEvidence(context).resolve(record.citation, version.sourceDocumentIds);
  if (!evidence.resolved) {
    return { approvedFields, verified: false, evidence };
  }
  await context.scope.client.query('UPDATE rate_record SET verified_by = app_actor_id(), verified_at = now() WHERE id = $1 AND practice_id = $2', [request.rateRecordId, request.practiceId]);
  await recordAuditEvent(context.scope, { action: 'rate_record_verified', objectType: 'rate_record', objectId: request.rateRecordId, practiceId: request.practiceId, requestId: context.requestId });
  return { approvedFields, verified: true, evidence };
}

const versionInput = z.strictObject({ practiceId: uuid, versionId: uuid });

/**
 * The specialist approves a version once every rate record is verified and every citation still
 * resolves to its page ("every rate record resolves to a page in its source document"), the dispute
 * window's too: a version whose window is cited is approved only with the window verified (an uncited
 * window is approved as the contract's days, and its lines' deadlines stay unverified, D17 a).
 */
export async function approveVersion(context: WorkflowContext, input: z.input<typeof versionInput>): Promise<void> {
  const request = parse(versionInput, input);
  await requireSpecialist(context.scope, request.practiceId);
  const version = await versionById(context, request.practiceId, request.versionId);
  requireEditable(version);
  const records = await loadRateRecords(context.scope, read(context, request.practiceId), [version.id]);
  if (records.length === 0 || records.some((record) => record.verifiedBy === null)) {
    throw new ContractWorkflowError('invalid', 'a version is approved once each of its rate records is verified, and it has at least one');
  }
  const window = await windowById(context, request.practiceId, version.id);
  if (window.citation !== null && window.verifiedBy === null) {
    throw new ContractWorkflowError('invalid', 'a version whose dispute window is cited is approved once its window is verified', [
      { field: 'disputeWindow', message: 'the dispute window is cited but not verified against its page yet: verify it, then approve the version' },
    ]);
  }
  const evidence = requireEvidence(context);
  for (const record of records) {
    const resolution = await evidence.resolve(record.citation, version.sourceDocumentIds);
    if (!resolution.resolved) {
      throw new ContractWorkflowError('invalid', `a rate record's citation no longer resolves to its page (${resolution.problem.replaceAll('_', ' ')})`, [{ field: 'citation', message: resolution.problem }], resolution.problem);
    }
  }
  if (window.citation !== null) {
    const resolution = await evidence.resolve(window.citation, version.sourceDocumentIds);
    if (!resolution.resolved) {
      throw new ContractWorkflowError('invalid', `the dispute window's citation no longer resolves to its page (${resolution.problem.replaceAll('_', ' ')})`, [{ field: 'disputeWindow', message: resolution.problem }], resolution.problem);
    }
  }
  await context.scope.client.query("UPDATE contract_version SET status = 'approved', approved_by = app_actor_id(), approved_at = now() WHERE id = $1 AND practice_id = $2", [version.id, request.practiceId]);
  await recordAuditEvent(context.scope, { action: 'contract_version_approved', objectType: 'contract_version', objectId: version.id, practiceId: request.practiceId, requestId: context.requestId });
}

export interface SignOffResult {
  /** The version the sign-off retired: closed at this one's start (an amendment) or superseded. */
  readonly retired: { readonly versionId: string; readonly as: 'closed' | 'superseded' } | null;
  readonly calendarEvents: readonly DerivedCalendarEvent[];
}

/**
 * The customer signs off an approved version (J5), which from then on prices the lines its window
 * covers. A successor's sign-off closes the version it amends at its own start or supersedes the
 * version it corrects, in the database, in the same statement. The contract calendar's events are
 * derived from the version and recorded.
 */
export async function signOffVersion(context: WorkflowContext, input: z.input<typeof versionInput>): Promise<SignOffResult> {
  const request = parse(versionInput, input);
  requirePracticePermission(context.scope, request.practiceId, 'contract.sign_off');
  const version = await versionById(context, request.practiceId, request.versionId);
  if (version.status !== 'approved') {
    throw new ContractWorkflowError('invalid', 'only an approved version is signed off');
  }
  const prior = version.supersedesId === null ? null : await versionById(context, request.practiceId, version.supersedesId);
  const { rows } = await overlapRefused(OVERLAP, () =>
    context.scope.client.query<{ signed_on: string }>(
      "UPDATE contract_version SET status = 'signed_off', signed_off_by = app_actor_id(), signed_off_at = now() WHERE id = $1 AND practice_id = $2 RETURNING (now() AT TIME ZONE 'UTC')::date::text AS signed_on",
      [version.id, request.practiceId],
    ),
  );
  await recordAuditEvent(context.scope, { action: 'contract_version_signed_off', objectType: 'contract_version', objectId: version.id, practiceId: request.practiceId, requestId: context.requestId });
  const versions = await loadVersions(context.scope, read(context, request.practiceId), [version.contractId]);
  let retired: SignOffResult['retired'] = null;
  const after = prior === null ? undefined : versions.find((candidate) => candidate.id === prior.id);
  if (prior !== null && after !== undefined && (after.status !== prior.status || after.effectiveTo !== prior.effectiveTo)) {
    retired = { versionId: prior.id, as: after.status === 'superseded' ? 'superseded' : 'closed' };
    await recordAuditEvent(context.scope, {
      action: retired.as === 'superseded' ? 'contract_version_superseded' : 'contract_version_closed',
      objectType: 'contract_version',
      objectId: prior.id,
      practiceId: request.practiceId,
      requestId: context.requestId,
    });
  }
  const signed = versions.find((candidate) => candidate.id === version.id) ?? version;
  const events = deriveCalendarEvents({
    version: signed,
    contractVersions: versions,
    rateRecords: await loadRateRecords(context.scope, read(context, request.practiceId), [version.id]),
    signedOffOn: rows[0]?.signed_on ?? '',
  });
  for (const event of events) {
    await context.scope.client.query(
      'INSERT INTO contract_calendar_event (practice_id, contract_id, kind, on_date, note) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (contract_id, kind, on_date) DO NOTHING',
      [request.practiceId, version.contractId, event.kind, event.onDate, event.note],
    );
  }
  return { retired, calendarEvents: events };
}

// ---------------------------------------------------------------------------------------------------
// The contract's own dispute window: cited and verified as a rate record is (D17 a)

const citeWindowInput = z.strictObject({ practiceId: uuid, versionId: uuid, citation: citationInput.nullable() });

/**
 * Cites the page where the contract states its dispute window (the specialist, as a rate record is cited): the
 * quote is checked against the page and stored with the page's hash. A new citation, or none (null removes it),
 * clears the window's verification. A window is cited once the version states its days; a silent contract's
 * window is the release's commercial_default, which is never verified.
 */
export async function citeDisputeWindow(context: WorkflowContext, input: z.input<typeof citeWindowInput>): Promise<{ readonly cited: boolean }> {
  const request = parse(citeWindowInput, input);
  requirePracticePermission(context.scope, request.practiceId, 'rate_record.edit');
  const version = await versionById(context, request.practiceId, request.versionId);
  requireEditable(version);
  if (request.citation !== null && version.windows.dispute_window_days === null) {
    throw new ContractWorkflowError('invalid', 'a dispute window is cited once the version states its days', [{ field: 'disputeWindowDays', message: 'enter the window’s days first' }]);
  }
  const citation = request.citation === null ? null : await citeOrRefuse(context, version, request.citation);
  await context.scope.client.query('UPDATE contract_version SET dispute_window_evidence = $3::jsonb WHERE id = $1 AND practice_id = $2', [
    version.id,
    request.practiceId,
    citation === null ? null : JSON.stringify(citationJson(citation)),
  ]);
  await recordAuditEvent(context.scope, {
    action: citation === null ? 'contract_window_uncited' : 'contract_window_cited',
    objectType: 'contract_version',
    objectId: version.id,
    practiceId: request.practiceId,
    requestId: context.requestId,
  });
  return { cited: citation !== null };
}

export interface WindowVerificationResult {
  readonly verified: boolean;
  /** The evidence check: why the window stays unverified when its citation does not resolve. */
  readonly evidence: EvidenceResolution;
}

/**
 * The specialist verifies the cited window against its page (PRD 7: the specialist verifies each field against
 * the cited page): verified only when the citation still resolves to its page, in the specialist's own name, now.
 * A window already verified stays as it was verified; an edit of the window clears the verification.
 */
export async function verifyDisputeWindow(context: WorkflowContext, input: z.input<typeof versionInput>): Promise<WindowVerificationResult> {
  const request = parse(versionInput, input);
  await requireSpecialist(context.scope, request.practiceId);
  const version = await versionById(context, request.practiceId, request.versionId);
  requireEditable(version);
  const window = await windowById(context, request.practiceId, version.id);
  if (window.citation === null) {
    throw new ContractWorkflowError('invalid', 'a dispute window is verified once it is cited', [{ field: 'disputeWindow', message: 'cite the page that states the dispute window first' }]);
  }
  const evidence = await requireEvidence(context).resolve(window.citation, version.sourceDocumentIds);
  if (!evidence.resolved || window.verifiedBy !== null) {
    return { verified: window.verifiedBy !== null, evidence };
  }
  await context.scope.client.query('UPDATE contract_version SET dispute_window_verified_by = app_actor_id(), dispute_window_verified_at = now() WHERE id = $1 AND practice_id = $2', [
    version.id,
    request.practiceId,
  ]);
  await recordAuditEvent(context.scope, { action: 'contract_window_verified', objectType: 'contract_version', objectId: version.id, practiceId: request.practiceId, requestId: context.requestId });
  return { verified: true, evidence };
}

// ---------------------------------------------------------------------------------------------------
// Amendments and supersession: a new version, never an edit (CON-02, CON-03)

const successorInput = z.strictObject({
  practiceId: uuid,
  versionId: uuid,
  effectiveFrom: isoDate.optional(),
  effectiveTo: versionFields.effectiveTo.optional(),
  /** The amendment's or correction's own documents, added to the prior version's. */
  sourceDocumentIds: versionFields.sourceDocumentIds.default([]),
  timelyFilingDays: versionFields.timelyFilingDays.optional(),
  disputeWindowDays: versionFields.disputeWindowDays.optional(),
  appealLevels: versionFields.appealLevels.optional(),
  noticeDays: versionFields.noticeDays.optional(),
});
type SuccessorRequest = z.output<typeof successorInput>;

/**
 * A draft that names `prior`, with its documents and windows, and copies of its rate records to verify again.
 * The dispute window's citation is copied while the window's days stay the prior version's, never its
 * verification: the specialist verifies the copy against the successor's documents before it is approved.
 */
async function draftSuccessor(context: WorkflowContext, request: SuccessorRequest, prior: ContractVersionRecord, effectiveFrom: string, effectiveTo: string | null): Promise<{ versionId: string; versionNo: number; copied: number }> {
  const disputeWindowDays = request.disputeWindowDays === undefined ? prior.windows.dispute_window_days : request.disputeWindowDays;
  const priorWindow = await windowById(context, request.practiceId, prior.id);
  const created = await insertVersion(
    context,
    {
      practiceId: request.practiceId,
      contractId: prior.contractId,
      effectiveFrom,
      effectiveTo,
      sourceDocumentIds: [...new Set([...prior.sourceDocumentIds, ...request.sourceDocumentIds])],
      timelyFilingDays: request.timelyFilingDays === undefined ? prior.windows.timely_filing_days : request.timelyFilingDays,
      disputeWindowDays,
      appealLevels: request.appealLevels ?? [...prior.windows.appeal_levels],
      noticeDays: request.noticeDays === undefined ? prior.noticeDays : request.noticeDays,
    },
    prior.id,
    disputeWindowDays !== null && disputeWindowDays === priorWindow.days ? priorWindow.citation : null,
  );
  const records = await loadRateRecords(context.scope, read(context, request.practiceId), [prior.id]);
  for (const record of records) {
    await insertRecord(context, request.practiceId, created.versionId, record.terms, record.citation, 'specialist');
  }
  return { ...created, copied: records.length };
}

/**
 * An amendment: a new draft version from a later date that, once signed off, closes the signed-off
 * version it amends at its own start (CON-02). The prior version's terms are copied into it to verify
 * again against the amendment.
 */
export async function amendVersion(
  context: WorkflowContext,
  input: z.input<typeof successorInput> & { readonly effectiveFrom: string },
): Promise<{ readonly versionId: string; readonly versionNo: number; readonly copied: number }> {
  const request = parse(successorInput, input);
  requirePracticePermission(context.scope, request.practiceId, 'rate_record.edit');
  const prior = await versionById(context, request.practiceId, request.versionId);
  const effectiveFrom = request.effectiveFrom ?? '';
  if (prior.status !== 'signed_off' || !(effectiveFrom > prior.effectiveFrom && (prior.effectiveTo === null || effectiveFrom < prior.effectiveTo))) {
    throw new ContractWorkflowError('invalid', 'an amendment starts inside the window of a signed-off version', [{ field: 'effectiveFrom', message: 'starts inside the amended version’s window' }]);
  }
  const created = await draftSuccessor(context, request, prior, effectiveFrom, request.effectiveTo ?? null);
  await recordAuditEvent(context.scope, { action: 'contract_version_amendment_drafted', objectType: 'contract_version', objectId: created.versionId, practiceId: request.practiceId, requestId: context.requestId });
  return created;
}

/**
 * A correction: a new draft version that, once signed off, supersedes an approved or signed-off
 * version (CON-03: "supersession required"). By default it keeps the corrected version's window.
 */
export async function supersedeVersion(context: WorkflowContext, input: z.input<typeof successorInput>): Promise<{ readonly versionId: string; readonly versionNo: number; readonly copied: number }> {
  const request = parse(successorInput, input);
  requirePracticePermission(context.scope, request.practiceId, 'rate_record.edit');
  const prior = await versionById(context, request.practiceId, request.versionId);
  const effectiveFrom = request.effectiveFrom ?? prior.effectiveFrom;
  if ((prior.status !== 'approved' && prior.status !== 'signed_off') || effectiveFrom > prior.effectiveFrom) {
    throw new ContractWorkflowError('invalid', 'a correction supersedes an approved or signed-off version from its start or earlier', [{ field: 'effectiveFrom', message: 'starts on or before the corrected version' }]);
  }
  const created = await draftSuccessor(context, request, prior, effectiveFrom, request.effectiveTo === undefined ? prior.effectiveTo : request.effectiveTo);
  await recordAuditEvent(context.scope, { action: 'contract_version_correction_drafted', objectType: 'contract_version', objectId: created.versionId, practiceId: request.practiceId, requestId: context.requestId });
  return created;
}

// ---------------------------------------------------------------------------------------------------
// Payer and plan mapping (J6)

const mapInput = z
  .strictObject({
    practiceId: uuid,
    planId: uuid,
    kind: z.enum(['contract', 'no_agreement', 'ma_noncontracted', 'government', 'other']),
    contractVersionId: uuid.nullable().default(null),
    effectiveFrom: isoDate,
    effectiveTo: isoDate.nullable().default(null),
    supersedesId: uuid.nullable().default(null),
  })
  .refine((value) => (value.kind === 'contract') === (value.contractVersionId !== null), { path: ['contractVersionId'], message: 'names a contract version exactly when the plan is mapped to a contract' })
  .refine((value) => value.effectiveTo === null || value.effectiveTo > value.effectiveFrom, { path: ['effectiveTo'], message: 'ends after it starts' });

const MAPPING_OVERLAP = 'mappings of one plan never overlap: correct the mapping in force with a mapping that supersedes it';

/**
 * Maps a plan from a date: to a contract version, or as no agreement, Medicare Advantage
 * non-contracted, government or other. A correction names the mapping it supersedes, which stays as
 * it was (MAP-03); earlier pricing runs keep their mappings.
 */
export async function mapPlan(context: WorkflowContext, input: z.input<typeof mapInput>): Promise<{ readonly mappingId: string }> {
  const request = parse(mapInput, input);
  requirePracticePermission(context.scope, request.practiceId, 'mapping.edit');
  const { rows } = await overlapRefused(MAPPING_OVERLAP, () =>
    context.scope.client.query<{ id: string }>(
      `INSERT INTO payer_plan_mapping (practice_id, plan_id, contract_version_id, mapping_kind, effective_from, effective_to, mapped_by, supersedes_id)
       VALUES ($1, $2, $3, $4, $5, $6, app_actor_id(), $7) RETURNING id`,
      [request.practiceId, request.planId, request.contractVersionId, request.kind, request.effectiveFrom, request.effectiveTo, request.supersedesId],
    ),
  );
  const mappingId = rows[0]?.id ?? '';
  await recordAuditEvent(context.scope, {
    action: request.supersedesId === null ? 'plan_mapped' : 'plan_mapping_corrected',
    objectType: 'payer_plan_mapping',
    objectId: mappingId,
    practiceId: request.practiceId,
    purpose: request.kind,
    requestId: context.requestId,
  });
  return { mappingId };
}

/** A correction of a mapping: a new mapping that supersedes it (MAP-03). */
export function correctMapping(context: WorkflowContext, input: z.input<typeof mapInput> & { readonly supersedesId: string }): Promise<{ readonly mappingId: string }> {
  return mapPlan(context, input);
}
