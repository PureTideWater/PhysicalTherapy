import type { RateWindows } from '@tp/contracts';

import { type IsoDate, addDays, addMonths } from './dates';
import type { IndexedRelease } from './release';
import type { TraceWindow } from './trace';

/**
 * The dispute deadline of a priced line (PRD 11 step 8; PRD 2 point 8): measured from the remittance
 * date by the agreement's window. A contract's window is its version's `dispute_window_days`; when the
 * contract is silent, the release's commercial default (`dispute_window`, program commercial_default,
 * the first-level window, redetermination). A Medicare Advantage non-contracted line takes Original
 * Medicare's first-level window (program medicare, redetermination). The release names what a window
 * is measured from; unnamed, it is the remittance date. A deadline before the triage date is
 * WINDOW_PASSED, which triage reads (validated, not actionable); it never changes the price.
 */
export interface WindowRequest {
  /** The version's windows for a contract line; null for a Medicare Advantage non-contracted line. */
  readonly contractWindows: RateWindows | null;
  readonly remittanceDate: IsoDate | null;
  readonly serviceDate: IsoDate;
  readonly asOf: IsoDate;
  readonly release: IndexedRelease;
}

const FIRST_LEVEL = 'redetermination';

export function disputeWindow(request: WindowRequest): TraceWindow {
  const none: TraceWindow = {
    source: null,
    record: null,
    length: null,
    unit: null,
    measured_from: null,
    from_date: null,
    ends_on: null,
    as_of: request.asOf,
    status: 'NO_WINDOW',
  };
  const remittanceDate = request.remittanceDate;
  if (remittanceDate === null) {
    return none;
  }
  const contractDays = request.contractWindows?.dispute_window_days ?? null;
  if (contractDays !== null) {
    return judged({ ...none, source: 'contract', length: contractDays, unit: 'days', measured_from: 'remittance_date', from_date: remittanceDate }, addDays(remittanceDate, contractDays));
  }
  const program = request.contractWindows === null ? 'medicare' : 'commercial_default';
  const record = request.release.inForce('dispute_window', { program, window: FIRST_LEVEL }, remittanceDate);
  if (record === null) {
    return none;
  }
  const { length, unit } = record.value;
  const measuredFrom = record.value.measured_from ?? 'remittance_date';
  const from = measuredFrom === 'date_of_service' ? request.serviceDate : remittanceDate;
  const endsOn = unit === 'days' ? addDays(from, length) : addMonths(from, length);
  return judged({ ...none, source: 'release', record: request.release.ref(record), length, unit, measured_from: measuredFrom, from_date: from }, endsOn);
}

function judged(window: TraceWindow, endsOn: IsoDate): TraceWindow {
  return { ...window, ends_on: endsOn, status: window.as_of > endsOn ? 'WINDOW_PASSED' : 'OPEN' };
}
