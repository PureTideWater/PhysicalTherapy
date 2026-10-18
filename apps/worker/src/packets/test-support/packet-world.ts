import { type MembershipRole, type PracticeScope, type ScopeClient, withPracticeScope } from '@tp/db';
import { addMembership, asOwner, createUser } from '@tp/db/testing';

import { MemorySealedBytes } from '../../intake/test-support/memory-bytes';
import type { Practice } from '../../price/test-support/pricing-world';
import { DocumentStore, collect } from '../../storage/documents';
import { todayUtc } from '../../triage/execute';
import { TriageWorld } from '../../triage/test-support/triage-world';
import { type PacketExportOutcome, type PacketExportServices, exportPacketVersion } from '../export';
import type { PacketExportFile } from '../downloads';
import { attestAsReviewer, downloadExportAs, grantedReviewer } from './reviewer';

/**
 * Test support for packets against a scratch database (synthetic data only): the triage world (SYNTHETIC
 * release 900001, 835s loaded by the parse_835 job, fixed-schedule contracts signed off through
 * @tp/contracts, runs priced by the price job, cases opened by triage), plus the people a packet needs
 * (the reimbursement reviewer who attests an export under a support grant among them; D16) and the
 * export job over a store of its own.
 */

/** The CAS fixtures' contract: 97110 at 50.00 per unit, effective 2026, a ten-year dispute window. */
export const FIXED_97110 = { schedule: [{ code: '97110', amountCents: '5000' }], effectiveFrom: '2026-01-01', disputeWindowDays: 3650 } as const;

export class PacketWorld {
  /** Where the export job stores packets' PDFs and CSVs (sealed with each practice's key). */
  readonly exports = new DocumentStore(new MemorySealedBytes());

  private constructor(readonly triage: TriageWorld) {}

  static async open(adminUrl: string): Promise<PacketWorld> {
    return new PacketWorld(await TriageWorld.open(adminUrl));
  }

  close(): Promise<void> {
    return this.triage.close();
  }

  get app() {
    return this.triage.app;
  }

  get owner() {
    return this.triage.owner;
  }

  get keys() {
    return this.triage.keys;
  }

  get specialist(): string {
    return this.triage.pricing.specialist;
  }

  get services(): PacketExportServices {
    return { documents: this.exports, keys: this.keys, pdf: this.triage.pdf };
  }

  /** A practice whose cases open at 10.00 (the CAS fixtures' patterns are small). */
  practice(label: string, settings: object = {}): Promise<Practice> {
    return this.triage.practice(label, { case_materiality_cents: '1000', ...settings });
  }

  private readonly reviewers = new Map<string, string>();

  /** The practice's reimbursement reviewer: an internal reviewer under a four-hour support grant (one per practice). */
  async reviewer(target: Practice): Promise<string> {
    const found = this.reviewers.get(target.practiceId);
    if (found !== undefined) {
      return found;
    }
    const reviewer = await grantedReviewer(this.owner, target.practiceId);
    this.reviewers.set(target.practiceId, reviewer);
    return reviewer;
  }

  /** The reviewer downloads both files of the version's export and attests it over the SHA-256 it records (D16). */
  async attest(target: Practice, versionId: string): Promise<Date> {
    return attestAsReviewer(this.app, this.services, target.practiceId, await this.reviewer(target), versionId);
  }

  /** `actorId` downloads files of the version's export as a download route serves them: checked against its SHA-256 and recorded as theirs. */
  download(target: Practice, actorId: string, versionId: string, files: readonly PacketExportFile[] = ['pdf', 'csv']): Promise<void> {
    return downloadExportAs(this.app, this.services, target.practiceId, actorId, versionId, files);
  }

  /** Another person of the practice's own group with the role. */
  async person(target: Practice, role: MembershipRole): Promise<string> {
    const person = await createUser(this.owner);
    await addMembership(this.owner, target.world.organizationId, person, role);
    return person;
  }

  /** Runs `run` as `actorId` in the practice's request scope. */
  as<T>(target: Practice, actorId: string, run: (scope: PracticeScope<ScopeClient>) => Promise<T>): Promise<T> {
    return withPracticeScope(this.app, { actorId, practiceIds: [target.practiceId] }, run);
  }

  /** Loads a CAS fixture, signs off the fixed contract for its plan, prices the month and triages it: the one case it opens. */
  async caseOf(target: Practice, fixture: string, plan: string, month: { readonly from: string; readonly to: string }): Promise<string> {
    await this.triage.load(target, fixture);
    const contract = await this.triage.fixedContract(target, FIXED_97110);
    const runId = await this.triage.pricedRun(target, { plans: [{ key: plan, versionId: contract.versionId }], from: month.from, to: month.to });
    const outcome = await this.triage.triage(target, runId);
    if (outcome.outcome !== 'triaged' || outcome.summary.casesOpened !== 1) {
      throw new Error('the fixture did not open one case');
    }
    const { rows } = await this.as(target, target.manager, (scope) => scope.client.query<{ id: string }>('SELECT id FROM "case" WHERE practice_id = $1', [target.practiceId]));
    return (rows[0] as { id: string }).id;
  }

  /**
   * Loads a CAS fixture whose contract states its window but cites it on no page (D17: its lines' deadlines are
   * not verified), prices and triages the month (triage opens no case: the lines wait with DEADLINE_UNVERIFIED),
   * and records the case the previous image's triage opened for them during the rollout (it knew no
   * DEADLINE_UNVERIFIED; docs/adr/0061, deploy order), as that triage recorded one, for the export's guard to meet.
   */
  async previousImageCase(target: Practice, fixture: string, plan: string, month: { readonly from: string; readonly to: string }): Promise<{ readonly caseId: string; readonly versionId: string; readonly opened: number }> {
    await this.triage.load(target, fixture);
    const contract = await this.triage.fixedContract(target, { ...FIXED_97110, windowCited: false });
    const runId = await this.triage.pricedRun(target, { plans: [{ key: plan, versionId: contract.versionId }], from: month.from, to: month.to });
    const outcome = await this.triage.triage(target, runId);
    const opened = outcome.outcome === 'triaged' ? outcome.summary.casesOpened : -1;
    const caseId = await asOwner(this.owner, [target.practiceId], async () => {
      const { rows: lines } = await this.owner.query<{ id: string; service_line_id: string; rate_record_id: string; payer_id: string; plan_id: string }>(
        `SELECT p.id, p.service_line_id, p.rate_record_id, pl.payer_id, pl.id AS plan_id
           FROM priced_line p JOIN service_line l ON l.id = p.service_line_id JOIN plan pl ON pl.id = l.payer_plan_key
          WHERE p.pricing_run_id = $1 AND p.variance_cents > 0 ORDER BY p.service_line_id`,
        [runId],
      );
      const first = lines[0];
      if (first === undefined) {
        throw new Error('the fixture priced no underpaid line');
      }
      const pattern = { payer_id: first.payer_id, plan_id: first.plan_id, mapping_kind: 'contract', contract_version_id: contract.versionId, rate_record_id: first.rate_record_id, behavior: 'BELOW_CONTRACT_RATE' };
      const { rows } = await this.owner.query<{ id: string }>('INSERT INTO "case" (practice_id, pattern_key, payer_id, plan_id, rate_record_id, materiality_cents) VALUES ($1, $2, $3, $4, $5, 1000) RETURNING id', [
        target.practiceId,
        JSON.stringify(pattern),
        first.payer_id,
        first.plan_id,
        first.rate_record_id,
      ]);
      const id = (rows[0] as { id: string }).id;
      for (const line of lines) {
        await this.owner.query(
          "INSERT INTO line_status (practice_id, service_line_id, stage, priced_line_id) SELECT $1, $2, 'actionable', $3 WHERE NOT EXISTS (SELECT 1 FROM line_status WHERE service_line_id = $2 AND stage = 'actionable')",
          [target.practiceId, line.service_line_id, line.id],
        );
        await this.owner.query('INSERT INTO case_line (practice_id, case_id, service_line_id, priced_line_id) VALUES ($1, $2, $3, $4)', [target.practiceId, id, line.service_line_id, line.id]);
      }
      return id;
    });
    return { caseId, versionId: contract.versionId, opened };
  }

  /** The export job's code, in the practice's job scope. */
  export(target: Practice, versionId: string): Promise<PacketExportOutcome> {
    return exportPacketVersion(this.triage.pricing.jobContext(target.practiceId), this.services, target.practiceId, versionId);
  }

  /** A stored export file's plaintext. */
  stored(target: Practice, key: string): Promise<Buffer> {
    return collect(this.exports.read(target.cipher, key));
  }

  /**
   * Moves a version's writing back in time, as a superuser with triggers off (the database sets it to
   * the writing transaction's time, so nothing else can): the single-user delay without the wait.
   */
  async backdate(versionId: string, hours: number): Promise<void> {
    const { owner } = this;
    await owner.query('BEGIN');
    try {
      await owner.query('SET LOCAL session_replication_role = replica');
      await owner.query(`UPDATE packet_version SET created_at = created_at - make_interval(hours => $2) WHERE id = $1`, [versionId, hours]);
      await owner.query('COMMIT');
    } catch (error) {
      await owner.query('ROLLBACK');
      throw error;
    }
  }

  /** Runs SQL as a superuser with triggers off, for the setups only a migration could make (a contract's appeal levels). */
  async superuser(sql: string, values: unknown[] = []): Promise<void> {
    const { owner } = this;
    await owner.query('BEGIN');
    try {
      await owner.query('SET LOCAL session_replication_role = replica');
      await owner.query(sql, values);
      await owner.query('COMMIT');
    } catch (error) {
      await owner.query('ROLLBACK');
      throw error;
    }
  }

  today(): string {
    return todayUtc();
  }
}
