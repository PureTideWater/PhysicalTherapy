import type { MappingKind, Proposer, VersionStatus } from '@tp/db/runtime';

import type { IsoDate } from './dates';
import type { Citation, FieldApproval, RateRecordField, RateRecordTerms, RateWindows } from './terms';
import type { DisputeWindowRule } from './window-rule';

/**
 * The records agreement resolution reads, as loaded from the database (load.ts) or built in a test:
 * plain data, so the resolver and the pricing engine run without a database (PRD 11: "imports
 * nothing from the database"). Windows are half-open [effectiveFrom, effectiveTo).
 */

/** A payer and plan mapping (Data dictionary, payer_plan_mapping). */
export interface PlanMappingRecord {
  readonly id: string;
  readonly planId: string;
  readonly kind: MappingKind;
  /** Set exactly when kind is contract. */
  readonly contractVersionId: string | null;
  readonly effectiveFrom: IsoDate;
  readonly effectiveTo: IsoDate | null;
  /** The mapping this one corrects. */
  readonly supersedesId: string | null;
}

/** A contract version (Data dictionary, contract_version). */
export interface ContractVersionRecord {
  readonly id: string;
  readonly contractId: string;
  readonly versionNo: number;
  readonly status: VersionStatus;
  readonly effectiveFrom: IsoDate;
  readonly effectiveTo: IsoDate | null;
  readonly supersedesId: string | null;
  readonly sourceDocumentIds: readonly string[];
  readonly windows: RateWindows;
  /** The notice the contract requires before an anniversary; null if none. */
  readonly noticeDays: number | null;
}

/**
 * A version's dispute window as the contract states it (migration 20261103090000; reconciliation-001 D17 a;
 * best-option audit #5): the citation of the page that says it (contract_version.dispute_window_evidence, in a rate
 * record's form), the rule the quote states (its unit and what it is counted from, window-rule.ts), and the
 * contract specialist who verified it, and when. Only a verified window of a signed-off version verifies its
 * lines' deadlines, and only a window whose rule is the one the engine computes is verified; the days themselves
 * are the version's windows.dispute_window_days, in the cited unit, as before.
 */
export interface DisputeWindowRecord {
  readonly versionId: string;
  readonly days: number | null;
  /** Null while the window is uncited. */
  readonly citation: Citation | null;
  /** The unit and the start the citation states; null exactly when the citation is (contract_version_window_rule_with_citation). */
  readonly rule: DisputeWindowRule | null;
  /** Null until a contract specialist verifies the citation against its page; an edit of the window clears both. */
  readonly verifiedBy: string | null;
  readonly verifiedAt: string | null;
}

/** A rate record (Data dictionary, rate_record) with its typed terms. */
export interface RateRecord {
  readonly id: string;
  readonly contractVersionId: string;
  readonly terms: RateRecordTerms;
  /** Null while the record is being abstracted. */
  readonly citation: Citation | null;
  readonly approvals: Partial<Readonly<Record<RateRecordField, FieldApproval>>>;
  readonly proposedBy: Proposer;
  /** Who verified it and when; null until every field is approved and the evidence resolves. */
  readonly verifiedBy: string | null;
  readonly verifiedAt: string | null;
}

/** Everything one practice's lines resolve against. */
export interface AgreementRecords {
  readonly mappings: readonly PlanMappingRecord[];
  readonly versions: readonly ContractVersionRecord[];
  readonly rateRecords: readonly RateRecord[];
}
