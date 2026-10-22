import type { ScopeClient } from '@tp/db/runtime';
import type { RoundingRule } from '@tp/money';
import type { PlaceOfServiceSetting, PracticeSettings } from '@tp/pricing';

/**
 * The practice settings a run prices with (PRD 11, Inputs: "Locality (from the billing address ZIP
 * through locality_map) ... default rounding when a contract is silent"; docs/adr/0029 and 0064). The
 * location is the practice's one practice_site row (its billing ZIP and, where Medicare's locality
 * list needs it, its ZIP+4; audit #33), the rounding and the practice's own places of service are its
 * settings document (default_rounding, place_of_service_settings), and every place the practice has
 * not set takes the place-of-service split the run pinned when it was created (pricing_run_split(),
 * the contract specialist's approved split): the practice's own setting wins. They are handed to the
 * engine as stored, as text: the engine checks them and records ENGINE_ERROR invalid_settings on every
 * line when they are not what it reads (an operator alert, never a guess), and the trace keeps them
 * verbatim, the merged places included.
 */

interface PracticeRow {
  readonly zip: string | null;
  readonly zip_plus_four: string | null;
  readonly settings: unknown;
}

/**
 * The settings of a run of the practice, read in the job's (or the creator's) practice scope as the
 * application role: the location (practice_site, readable in the scope), the settings document, and
 * the run's pinned split through pricing_run_split() (a definer that answers only for a run of a
 * practice in the scope; no row is no split, and the practice's own places apply alone).
 */
export async function runSettings(client: ScopeClient, practiceId: string, pricingRunId: string): Promise<PracticeSettings> {
  const { rows } = await client.query<PracticeRow>(
    'SELECT s.zip, s.zip_plus_four, p.settings FROM practice p LEFT JOIN practice_site s ON s.practice_id = p.id WHERE p.id = $1',
    [practiceId],
  );
  const { rows: splits } = await client.query<{ settings: unknown }>('SELECT settings FROM pricing_run_split($1)', [pricingRunId]);
  const row = rows[0];
  return settingsOf(row?.zip ?? null, row?.settings ?? {}, { zipPlusFour: row?.zip_plus_four ?? null, split: splits[0]?.settings ?? null });
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** What a run adds to the practice's ZIP and settings document: the location's ZIP+4 and the run's pinned split. */
export interface RunSettingsParts {
  /** The ZIP+4's four digits, or null (the engine reads it only for a ZIP whose locality needs it). */
  readonly zipPlusFour?: string | null;
  /** The pinned split's settings (place of service to facility or non_facility), or null when the run pinned none. */
  readonly split?: unknown;
}

/** A map of places as text values; a value that is not an object becomes one place named "invalid", which the engine refuses. */
function placesOf(places: unknown): Record<string, string> {
  return isObject(places) ? Object.fromEntries(Object.entries(places).map(([place, setting]) => [place, text(setting)])) : { invalid: text(places) };
}

/**
 * The engine's settings from the practice's ZIP, settings document, ZIP+4 and the run's split. A value
 * of the wrong kind is kept as text the engine refuses (a list of places that is not an object becomes
 * one place named "invalid"), so a malformed setting is an engine error on the trace, never silently
 * dropped. The split's places come first and the practice's own override them. A null ZIP+4 is left
 * out, as the engine's trace leaves it out.
 */
export function settingsOf(zip: string | null, settings: unknown, parts: RunSettingsParts = {}): PracticeSettings {
  // A settings document that is not an object leaves the places unreadable, which the engine refuses.
  const stored = isObject(settings) ? settings : { place_of_service_settings: text(settings) };
  const rounding = stored.default_rounding ?? null;
  const split = parts.split === undefined || parts.split === null ? {} : placesOf(parts.split);
  const zipPlusFour = parts.zipPlusFour ?? null;
  return {
    zip: zip ?? '',
    ...(zipPlusFour === null ? {} : { zipPlusFour }),
    defaultRounding: (rounding === null ? null : text(rounding)) as RoundingRule | null,
    placeOfServiceSettings: { ...split, ...placesOf(stored.place_of_service_settings ?? {}) } as Readonly<Record<string, PlaceOfServiceSetting>>,
  };
}
