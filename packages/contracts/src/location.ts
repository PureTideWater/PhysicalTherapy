/**
 * The practice's pricing location in a rule release (audit #33 and #16's minimal record; docs/adr/0064): the closed
 * list of statuses locality_status() and practice_location_status() return (migration 20261105090000), with the one
 * sentence a customer reads for each. location.test.ts holds the list equal to the migration's. The engine stays the
 * judge of each line; a status serves the screens, the months that wait and the screening.
 *
 * - ready: the release prices the location (through its ZIP+4's range when the ZIP needs one).
 * - no_release: no rule release is in force.
 * - zip_missing: the practice has no location (its months wait with no run).
 * - zip_unknown: the release has no locality_map record of the ZIP in any window: the customer checks the ZIP.
 * - locality_not_loaded: the ZIP is known but the release has no window of it for the period, or the ZIP needs its
 *   ZIP+4 and the release's ZIP+4 list is not loaded for the period: a content gap, nothing for the customer to change
 *   (the engine stops such a line as ENGINE_ERROR no_locality or no_locality_plus_four, which pages the operator).
 * - zip_plus_four_needed: the ZIP needs its ZIP+4 and none is set.
 * - zip_plus_four_unknown: the release's ZIP+4 list holds no range with the ZIP+4: the customer checks the four digits.
 */
export const LOCATION_STATUSES = ['ready', 'no_release', 'zip_missing', 'zip_unknown', 'locality_not_loaded', 'zip_plus_four_needed', 'zip_plus_four_unknown'] as const;
export type LocationStatus = (typeof LOCATION_STATUSES)[number];

/**
 * The statuses at which a line that reads the locality cannot be priced: a month's run that stops a line on one of
 * them fails as location_not_ready with no line kept, and the month waits for the location (a month whose lines never
 * read the locality prices as usual).
 */
export const LOCATION_NOT_READY_STATUSES = ['zip_unknown', 'zip_plus_four_needed', 'zip_plus_four_unknown'] as const satisfies readonly LocationStatus[];

/** The statuses that leave the customer nothing to change: the location prices, or PaidWhole has content to load. */
export const LOCATION_SETTLED_STATUSES = ['ready', 'locality_not_loaded'] as const satisfies readonly LocationStatus[];

const STATUSES: ReadonlySet<string> = new Set(LOCATION_STATUSES);

/** Whether a value is one of the closed list's statuses. */
export function isLocationStatus(value: unknown): value is LocationStatus {
  return typeof value === 'string' && STATUSES.has(value);
}

/** What a status's sentence names: the location and, when ready, its locality and the release. */
export interface LocationFacts {
  readonly zip?: string | null;
  readonly zipPlusFour?: string | null;
  readonly carrier?: string | null;
  readonly locality?: string | null;
  readonly releaseNo?: number | null;
}

const or = (value: string | null | undefined, fallback: string): string => (value === null || value === undefined || value === '' ? fallback : value);

/** The sentence a customer reads for a status, with the facts it names (a fact not given is named in words). */
export function locationStatusText(status: LocationStatus, facts: LocationFacts = {}): string {
  const zip = or(facts.zip, 'this ZIP code');
  switch (status) {
    case 'ready':
      return `Medicare prices this location in locality ${or(facts.carrier, '?')}-${or(facts.locality, '?')} under rule release ${facts.releaseNo === null || facts.releaseNo === undefined ? '?' : String(facts.releaseNo)}.`;
    case 'no_release':
      return 'No Medicare rule release is in force yet.';
    case 'zip_missing':
      return 'Add the practice’s billing ZIP code.';
    case 'zip_unknown':
      return `Medicare’s ZIP code list in force does not include ${zip}. Check the ZIP code.`;
    case 'locality_not_loaded':
      return 'PaidWhole has not loaded Medicare’s locality list for these dates yet. There is nothing to change here.';
    case 'zip_plus_four_needed':
      return `Medicare splits ZIP ${zip} between payment localities. Add its ZIP+4.`;
    case 'zip_plus_four_unknown':
      return `Medicare’s ZIP+4 list in force does not include ${zip}-${or(facts.zipPlusFour, '????')}. Check the four digits.`;
  }
}
