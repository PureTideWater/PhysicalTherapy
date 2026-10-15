/**
 * Code sets (PRD section 10, step 6). Two kinds:
 *
 * - The external lists X12 publishes three times a year, CARC (CAS reason codes) and RARC (remark
 *   codes in MIA, MOA and LQ HE), come from a rule release's `carc` and `rarc` records, each active
 *   between its effective dates. Release 1 holds the real lists; tests use the SYNTHETIC release.
 * - The code sets the 005010X221A1 structure fixes itself (claim status, adjustment groups, provider
 *   adjustment reasons, payment methods and every qualifier the parser reads). They do not change
 *   between rule releases; the values below are taken from pyx12's open-source 835 map, not typed
 *   from the implementation guide or from memory.
 *
 * The release's `claim_status_code` records are the external claim status codes of the 276/277
 * transactions; no 835 element uses them (CLP02's claim status is the structure's own set).
 * An unknown CARC or RARC loads with an EDI_UNKNOWN_CODE flag and is never dropped; a value outside
 * one of the structure's own sets holds its transaction set (EDI_SYNTAX invalid_code), as pyx12 does.
 */
import { type RuleRecord } from '@tp/rules';

export const X12_835_CODE_SETS = {
  /** CLP02. */
  claim_status: ['1', '2', '3', '4', '19', '20', '21', '22', '23', '25'],
  /** CAS01. */
  adjustment_group: ['CO', 'OA', 'PI', 'PR'],
  /** PLB03-01 (and the same code in PLB05, 07, 09, 11, 13). */
  provider_adjustment_reason: [
    '50', '51', '72', '90', 'AH', 'AM', 'AP', 'B2', 'B3', 'BD', 'BN', 'C5', 'CR', 'CS', 'CT', 'CV', 'CW', 'DM', 'E3', 'FB', 'FC', 'GO', 'HM', 'IP',
    'IR', 'IS', 'J1', 'L3', 'L6', 'LE', 'LS', 'OA', 'OB', 'PI', 'PL', 'RA', 'RE', 'SL', 'TL', 'WO', 'WU',
  ],
  /** BPR01. */
  transaction_handling: ['C', 'D', 'H', 'I', 'P', 'U', 'X'],
  /** BPR04. */
  payment_method: ['ACH', 'BOP', 'CHK', 'FWT', 'NON'],
  /** BPR05. */
  payment_format: ['CCP', 'CTX'],
  /** BPR06 and BPR12. */
  dfi_qualifier: ['01', '04'],
  /** BPR08 and BPR14. */
  account_qualifier: ['DA', 'SG'],
  /** TRN01. */
  trace_type: ['1'],
  /** CUR01. */
  currency_entity: ['PR'],
  /** REF01 in the header. */
  header_reference: ['EV', 'F2'],
  /** DTM01 in the header. */
  header_date: ['405'],
  /** N103 of the payer (1000A). */
  payer_id_qualifier: ['XV'],
  /** N103 of the payee (1000B). */
  payee_id_qualifier: ['FI', 'XV', 'XX'],
  /** REF01 in 1000A. */
  payer_reference: ['2U', 'EO', 'HI', 'NF'],
  /** REF01 in 1000B. */
  payee_reference: ['0B', 'D3', 'PQ', 'TJ'],
  /** PER01 in 1000A and 2100. */
  contact_function: ['BL', 'CX', 'IC'],
  /** PER03, PER05 and PER07. */
  communication_qualifier: ['EM', 'EX', 'FX', 'TE', 'UR'],
  /** RDM01. */
  delivery_method: ['BM', 'EM', 'FT', 'OL'],
  /** CLP06. */
  claim_filing_indicator: ['12', '13', '14', '15', '16', '17', 'AM', 'CH', 'DS', 'HM', 'LM', 'MA', 'MB', 'MC', 'OF', 'TV', 'VA', 'WC', 'ZZ'],
  /** NM102. */
  entity_type: ['1', '2'],
  /** NM108 of the patient (NM1 QC). */
  patient_id_qualifier: ['34', 'HN', 'II', 'MI', 'MR'],
  /** NM108 of the insured (NM1 IL) and the other subscriber (NM1 GB). */
  subscriber_id_qualifier: ['FI', 'II', 'MI'],
  /** NM108 of the corrected patient or insured (NM1 74). */
  corrected_name_id_qualifier: ['C'],
  /** NM108 of the service provider (NM1 82). */
  provider_id_qualifier: ['BD', 'BS', 'FI', 'MC', 'PC', 'SL', 'UP', 'XX'],
  /** NM108 of the crossover carrier (NM1 TT) and the corrected priority payer (NM1 PR). */
  payer_entity_id_qualifier: ['AD', 'FI', 'NI', 'PI', 'PP', 'XV'],
  /** REF01 in 2100 (other claim identification and rendering provider identification). */
  claim_reference: ['1L', '1W', '28', '6P', '9A', '9C', 'BB', 'CE', 'EA', 'F8', 'G1', 'G3', 'IG', 'SY', '0B', '1A', '1B', '1C', '1D', '1G', '1H', '1J', 'D3', 'G2', 'LU'],
  /** DTM01 in 2100. */
  claim_date: ['036', '050', '232', '233'],
  /** AMT01 in 2100. */
  claim_amount: ['AU', 'D8', 'DY', 'F5', 'I', 'NL', 'T', 'T2', 'ZK', 'ZL', 'ZM', 'ZN', 'ZO'],
  /** QTY01 in 2100. */
  claim_quantity: ['CA', 'CD', 'LA', 'LE', 'NE', 'NR', 'OU', 'PS', 'VS', 'ZK', 'ZL', 'ZM', 'ZN', 'ZO'],
  /** SVC01-01. */
  procedure_qualifier: ['AD', 'ER', 'HC', 'HP', 'IV', 'N4', 'N6', 'NU', 'UI', 'WK'],
  /** SVC06-01. */
  original_procedure_qualifier: ['AD', 'ER', 'HC', 'HP', 'IV', 'N4', 'NU', 'WK'],
  /** DTM01 in 2110. */
  line_date: ['150', '151', '472'],
  /** REF01 in 2110 (service, line item control, rendering provider and policy identification). */
  line_reference: ['1S', 'APC', 'BB', 'E9', 'G1', 'G3', 'LU', 'RB', '6R', '0B', '1A', '1B', '1C', '1D', '1G', '1H', '1J', 'D3', 'G2', 'HPI', 'SY', 'TJ', '0K'],
  /** AMT01 in 2110. */
  line_amount: ['B6', 'KH', 'T', 'T2', 'ZK', 'ZL', 'ZM', 'ZN', 'ZO'],
  /** QTY01 in 2110. */
  line_quantity: ['ZK', 'ZL', 'ZM', 'ZN', 'ZO'],
  /** LQ01. */
  remark_qualifier: ['HE', 'RX'],
} as const satisfies Record<string, readonly string[]>;

export type InternalCodeSet = keyof typeof X12_835_CODE_SETS;
export type ExternalCodeList = 'carc' | 'rarc';
export type CodeListName = ExternalCodeList | InternalCodeSet;

/** Answers whether a code is in a list on a date. The parser reads every code through one. */
export interface CodeListProvider {
  /** The rule release the external lists come from (recorded on every report), or null. */
  readonly release: number | null;
  /** True when `code` is in `list` and active on `on` (an ISO date; the structure's sets ignore it). */
  has(list: CodeListName, code: string, on: string): boolean;
}

interface Window {
  readonly from: string;
  readonly to: string | null;
}

const internalSets = new Map<string, ReadonlySet<string>>(Object.entries(X12_835_CODE_SETS).map(([name, codes]) => [name, new Set<string>(codes)]));

/** True when `code` is in one of the structure's own code sets. */
export function inCodeSet(list: InternalCodeSet, code: string): boolean {
  return (internalSets.get(list) as ReadonlySet<string>).has(code);
}

/**
 * The code lists of a rule release: CARC and RARC from its `carc` and `rarc` records (a code is
 * active from effective_from to effective_to, both inclusive), and the structure's own sets.
 */
export function releaseCodeLists(release: number, records: Iterable<RuleRecord>): CodeListProvider {
  const external = new Map<string, Window[]>();
  for (const record of records) {
    if (record.record_type === 'carc' || record.record_type === 'rarc') {
      const key = `${record.record_type}:${record.key.code}`;
      external.set(key, [...(external.get(key) ?? []), { from: record.effective_from, to: record.effective_to }]);
    }
  }
  return {
    release,
    has(list, code, on) {
      if (list === 'carc' || list === 'rarc') {
        return (external.get(`${list}:${code}`) ?? []).some((window) => window.from <= on && (window.to === null || on <= window.to));
      }
      return inCodeSet(list, code);
    },
  };
}
