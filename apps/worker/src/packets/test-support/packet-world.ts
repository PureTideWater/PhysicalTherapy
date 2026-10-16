import { type MembershipRole, type PracticeScope, type ScopeClient, withPracticeScope } from '@tp/db';
import { addMembership, createUser } from '@tp/db/testing';

import { MemorySealedBytes } from '../../intake/test-support/memory-bytes';
import type { Practice } from '../../price/test-support/pricing-world';
import { DocumentStore, collect } from '../../storage/documents';
import { todayUtc } from '../../triage/execute';
import { TriageWorld } from '../../triage/test-support/triage-world';
import { type PacketExportOutcome, type PacketExportServices, exportPacketVersion } from '../export';

/**
 * Test support for packets against a scratch database (synthetic data only): the triage world (SYNTHETIC
 * release 900001, 835s loaded by the parse_835 job, fixed-schedule contracts signed off through
 * @tp/contracts, runs priced by the price job, cases opened by triage), plus the people a packet needs
 * and the export job over a store of its own.
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
