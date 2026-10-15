import type { MappingKind, Proposer, VersionStatus } from '@tp/db/runtime';

import type { IsoDate } from './dates';
import type { Citation, FieldApproval, RateRecordField, RateRecordTerms, RateWindows } from './terms';

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
