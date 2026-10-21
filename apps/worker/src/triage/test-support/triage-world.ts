import { createHash, randomUUID } from 'node:crypto';

import {
  DISPUTE_WINDOW_START_TEXT,
  type DisputeWindowRule,
  EvidenceResolver,
  RATE_RECORD_FIELDS,
  type WorkflowContext,
  addRateRecord,
  approveRateRecordField,
  approveVersion,
  citeDisputeWindow,
  createContract,
  createDraftVersion,
  signOffVersion,
  verifyDisputeWindow,
  windowRuleComputed,
} from '@tp/contracts';
import { documentPages } from '@tp/contracts/pages';
import { syntheticPdf } from '@tp/contracts/testing';
import { type KeyProvider, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { formatCents, parseCents } from '@tp/money';
import { CORRESPONDENCE_CONTACT_KEY, SYNTHETIC_CORRESPONDENCE_CONTACT } from '@tp/packets';

import { MemorySealedBytes } from '../../intake/test-support/memory-bytes';
import { type Practice, PricingWorld, SETTINGS, WINDOW_QUOTE_RULE, windowQuote } from '../../price/test-support/pricing-world';
import { type ReportOutcome, type ReportServices, generateAuditReport } from '../../report/generate';
import { ChromiumPdfRenderer, type PdfRenderer, chromiumInstalled } from '../../report/pdf';
import { DocumentStore, collect } from '../../storage/documents';
import { type TriageOutcome, executeTriage } from '../execute';

/**
 * Test support for triage and the audit report against a scratch database (synthetic data only): the
 * pricing runs' world (SYNTHETIC release 900001, practices with a billing manager, 835s loaded by the
 * parse_835 job, runs created and priced by the price job), plus fixed-schedule contracts signed off
 * through @tp/contracts' services (the CAS fixtures price at fixed amounts per unit), each with its dispute
 * window cited on page 1 and verified by the specialist unless a test leaves it uncited (D17 a), and triage run
 * in the practice's job scope.
 */

export interface PracticeOptions {
  /** Whether the practice has the SYNTHETIC correspondence contact set (true unless false). */
  readonly contact?: boolean;
}

export interface FixedContract {
  readonly contractId: string;
  readonly versionId: string;
  readonly rateRecordIds: readonly string[];
}

export interface FixedContractOptions {
  readonly effectiveFrom: string;
  readonly disputeWindowDays: number;
  /** Whether the specialist cites the window on its page and verifies it (true unless false): an uncited window leaves its lines' deadlines unverified (D17 a). */
  readonly windowCited?: boolean;
  /**
   * The rule the window's quote states (best-option audit #5): calendar days after the payment date, the rule the
   * product computes, unless named. A window cited with another rule is not verified: the version is approved with
   * its window unverified, and its lines' deadlines stay unverified (CONTRACT_WINDOW_RULE_NOT_COMPUTED).
   */
  readonly windowRule?: DisputeWindowRule;
  /** An amount in cents per unit for each code. */
  readonly schedule: readonly { readonly code: string; readonly amountCents: string }[];
  readonly payerId?: string;
  /** Adjustment flags the contract writes in (all off unless named), e.g. apply_ncci. */
  readonly flags?: Readonly<Record<string, boolean>>;
}

const quoteFor = (code: string, amountCents: string) => `${code} is paid ${formatCents(parseCents(amountCents))} per unit`;
/** The page's words for a window of `days` under `rule`: the pricing world's own quote for the computed rule. */
const ruleQuote = (days: number, rule: DisputeWindowRule) =>
  windowRuleComputed(rule) ? windowQuote(days) : `Disputes are raised within ${String(days)} ${rule.unit === 'business_days' ? 'business days' : rule.unit === 'months' ? 'months' : 'days'} of ${DISPUTE_WINDOW_START_TEXT[rule.measuredFrom]}.`;

export class TriageWorld {
  private readonly contractDocuments = new Map<string, Uint8Array>();
  /** Where the report job stores reports' PDFs and CSVs (sealed with each practice's key). */
  readonly reports = new DocumentStore(new MemorySealedBytes());
  readonly pdf: PdfRenderer = chromiumInstalled() ? new ChromiumPdfRenderer() : { render: () => Promise.resolve(new TextEncoder().encode('%PDF-1.7 SYNTHETIC STAND-IN')) };

  private constructor(readonly pricing: PricingWorld) {}

  static async open(adminUrl: string): Promise<TriageWorld> {
    return new TriageWorld(await PricingWorld.open(adminUrl));
  }

  close(): Promise<void> {
    return this.pricing.close();
  }

  get owner() {
    return this.pricing.owner;
  }

  get app() {
    return this.pricing.app;
  }

  /** The key provider the practices' data keys were made with (the pricing world's own). */
  get keys(): KeyProvider {
    return Reflect.get(this.pricing, 'keys') as KeyProvider;
  }

  get services(): ReportServices {
    return { documents: this.reports, keys: this.keys, pdf: this.pdf };
  }

  /**
   * A practice with the SYNTHETIC pricing settings and the given triage settings, and the SYNTHETIC correspondence
   * contact every payer's copy prints (audit item #37 part 1, D6), unless `contact: false` leaves it out (the export's
   * refusal contact_missing, D7).
   */
  practice(label: string, settings: object = {}, options: PracticeOptions = {}): Promise<Practice> {
    return this.pricing.practice(label, { ...SETTINGS, ...(options.contact === false ? {} : { [CORRESPONDENCE_CONTACT_KEY]: SYNTHETIC_CORRESPONDENCE_CONTACT }), ...settings });
  }

  /** Runs `run` as `actorId` in the practice's request scope, with a resolver over this world's contract documents. */
  as<T>(target: Practice, actorId: string, run: (context: WorkflowContext) => Promise<T>): Promise<T> {
    return withPracticeScope(this.app, { actorId, practiceIds: [target.practiceId] }, (scope) =>
      run({
        scope,
        requestId: `test-${randomUUID()}`,
        evidence: new EvidenceResolver({
          pages: documentPages({
            read: (documentId) => {
              const pdf = this.contractDocuments.get(documentId);
              return pdf === undefined ? Promise.reject(new Error('no such synthetic document')) : Promise.resolve({ bytes: pdf, contentType: 'application/pdf' });
            },
          }),
        }),
      }),
    );
  }

  /** A signed-off version of a new contract with the payer: one fixed amount per unit for each code, flags off. */
  async fixedContract(target: Practice, options: FixedContractOptions): Promise<FixedContract> {
    const quotes = options.schedule.map((item) => quoteFor(item.code, item.amountCents));
    return this.contractWith(
      target,
      options,
      quotes,
      options.schedule.map((item) => ({
        terms: { scope: { codes: [item.code] }, method: 'FIXED_SCHEDULE', parameters: { amount_cents: item.amountCents }, flags: { ...options.flags, timed_units_rule: 'PER_CODE' } },
        quote: quoteFor(item.code, item.amountCents),
      })),
    );
  }

  /** A signed-off version of a new contract with the payer whose exhibit quotes `quotes` and holds `records`. */
  private async contractWith(
    target: Practice,
    options: { readonly effectiveFrom: string; readonly disputeWindowDays: number; readonly payerId?: string; readonly windowCited?: boolean; readonly windowRule?: DisputeWindowRule },
    quotes: readonly string[],
    records: readonly { readonly terms: object; readonly quote: string }[],
  ): Promise<FixedContract> {
    const { owner } = this;
    const windowRule = options.windowRule ?? WINDOW_QUOTE_RULE;
    const documentId = randomUUID();
    await asOwner(owner, [target.practiceId], () =>
      owner.query(
        `INSERT INTO source_document (id, practice_id, kind, sha256, size_bytes, content_type, uploaded_by, scan_status, scan_at, status)
         VALUES ($1, $2, 'contract', $3, 1000, 'application/pdf', $4, 'clean', now(), 'stored')`,
        [documentId, target.practiceId, createHash('sha256').update(documentId).digest('hex'), target.manager],
      ),
    );
    this.contractDocuments.set(
      documentId,
      syntheticPdf([
        ['SYNTHETIC PROVIDER AGREEMENT - INVENTED TERMS', 'Compensation is set out in Exhibit A.', ruleQuote(options.disputeWindowDays, windowRule)],
        ['SYNTHETIC EXHIBIT A FEE SCHEDULE', ...quotes],
      ]),
    );
    const payerId = options.payerId ?? (await this.pricing.payerOf(target));
    const { contractId, versionId } = await this.as(target, target.manager, async (context) => {
      const contract = await createContract(context, { practiceId: target.practiceId, payerId, title: 'SYNTHETIC FIXED SCHEDULE AGREEMENT' });
      const version = await createDraftVersion(context, {
        practiceId: target.practiceId,
        contractId: contract.contractId,
        effectiveFrom: options.effectiveFrom,
        effectiveTo: null,
        sourceDocumentIds: [documentId],
        disputeWindowDays: options.disputeWindowDays,
      });
      return { contractId: contract.contractId, versionId: version.versionId };
    });
    const rateRecordIds = await this.as(target, this.pricing.specialist, async (context) => {
      const ids: string[] = [];
      for (const item of records) {
        const { rateRecordId } = await addRateRecord(context, { practiceId: target.practiceId, versionId, terms: item.terms, citation: { documentId, page: 2, quote: item.quote } });
        for (const field of RATE_RECORD_FIELDS) {
          await approveRateRecordField(context, { practiceId: target.practiceId, rateRecordId, field });
        }
        ids.push(rateRecordId);
      }
      if (options.windowCited !== false) {
        await citeDisputeWindow(context, { practiceId: target.practiceId, versionId, citation: { documentId, page: 1, quote: ruleQuote(options.disputeWindowDays, windowRule) }, rule: windowRule });
        // Only a window whose rule the product computes is verified; another is approved unverified.
        if (windowRuleComputed(windowRule)) {
          await verifyDisputeWindow(context, { practiceId: target.practiceId, versionId });
        }
      }
      await approveVersion(context, { practiceId: target.practiceId, versionId });
      return ids;
    });
    await this.as(target, target.manager, (context) => signOffVersion(context, { practiceId: target.practiceId, versionId }));
    return { contractId, versionId, rateRecordIds };
  }

  /**
   * A signed-off version of a new contract with the payer: one per-visit amount for a visit of the given
   * codes (PRD 11 step 2: once per claim and date, carried by the first included line), flags off.
   */
  async perVisitContract(
    target: Practice,
    options: { readonly codes: readonly string[]; readonly amountCents: string; readonly effectiveFrom: string; readonly disputeWindowDays: number; readonly windowCited?: boolean },
  ): Promise<FixedContract> {
    const quote = `A visit of ${options.codes.join(', ')} is paid ${formatCents(parseCents(options.amountCents))} per visit`;
    return this.contractWith(target, options, [quote], [{ terms: { scope: { codes: options.codes }, method: 'PER_VISIT', parameters: { amount_cents: options.amountCents }, flags: { timed_units_rule: 'PER_CODE' } }, quote }]);
  }

  /** Triage of a complete run in the practice's job scope, on `asOf` (today unless named). */
  triage(target: Practice, pricingRunId: string, asOf?: string): Promise<TriageOutcome> {
    return executeTriage(this.pricing.jobContext(target.practiceId), target.practiceId, pricingRunId, asOf === undefined ? {} : { asOf });
  }

  /** Parses and loads a SYNTHETIC 835 (a path under fixtures/synthetic): its payer and plans exist from then on. */
  load(target: Practice, fixture: string): Promise<void> {
    return this.pricing.load(target, fixture);
  }

  /** An audit report of the run, requested in `actorId`'s name (the billing manager's unless named): queued. */
  async requestReport(target: Practice, pricingRunId: string, actorId = target.manager): Promise<string> {
    const id = randomUUID();
    await withPracticeScope(this.app, { actorId, practiceIds: [target.practiceId] }, (scope) =>
      scope.client.query('INSERT INTO audit_report (id, practice_id, pricing_run_id, requested_by) VALUES ($1, $2, $3, $4)', [id, target.practiceId, pricingRunId, actorId]),
    );
    return id;
  }

  /** Generates a queued report through the report job's code, on `asOf` (today unless named). */
  generate(target: Practice, auditReportId: string, asOf?: string): Promise<ReportOutcome> {
    return generateAuditReport(this.pricing.jobContext(target.practiceId), this.services, target.practiceId, auditReportId, asOf === undefined ? {} : { asOf });
  }

  /** A stored report file's plaintext. */
  async stored(target: Practice, key: string): Promise<Buffer> {
    return collect(this.reports.read(target.cipher, key));
  }

  /** Maps each plan not yet mapped (to a signed-off version, or as no agreement), prices a period and returns the run. */
  async pricedRun(target: Practice, options: { readonly plans: readonly { readonly key: string; readonly versionId: string | null; readonly kind?: 'contract' | 'no_agreement' }[]; readonly from: string; readonly to: string }): Promise<string> {
    for (const plan of options.plans) {
      const planId = await this.pricing.planOf(target, plan.key);
      const mapped = await asOwner(this.owner, [target.practiceId], () => this.owner.query('SELECT 1 FROM payer_plan_mapping WHERE plan_id = $1', [planId]));
      if (mapped.rowCount === 0) {
        await this.pricing.mapped(target, planId, plan.kind ?? 'contract', '2026-01-01', plan.versionId);
      }
    }
    const runId = await this.pricing.createRun(target, options.from, options.to);
    await this.pricing.execute(target, runId);
    return runId;
  }
}
