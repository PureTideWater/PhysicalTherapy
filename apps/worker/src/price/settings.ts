import type { ScopeClient } from '@tp/db/runtime';
import type { RoundingRule } from '@tp/money';
import type { PlaceOfServiceSetting, PracticeSettings } from '@tp/pricing';

/**
 * The practice settings a run prices with (PRD 11, Inputs: "Locality (from the billing address ZIP
 * through locality_map) ... default rounding when a contract is silent"; docs/adr/0029: the place-of-
 * service split is a practice setting, stored in practice.settings under place_of_service_settings,
 * and the default rounding under default_rounding). They are handed to the engine as stored, as text:
 * the engine checks them and records ENGINE_ERROR invalid_settings on every line when they are not
 * what it reads (an operator alert, never a guess), and the trace keeps them verbatim.
 */

interface PracticeRow {
  readonly zip: string | null;
  readonly settings: unknown;
}

export async function practiceSettings(client: ScopeClient, practiceId: string): Promise<PracticeSettings> {
  const { rows } = await client.query<PracticeRow>('SELECT zip, settings FROM practice WHERE id = $1', [practiceId]);
  const row = rows[0];
  return settingsOf(row?.zip ?? null, row?.settings ?? {});
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The engine's settings from the practice's ZIP and settings document. A value of the wrong kind is
 * kept as text the engine refuses (a list of places that is not an object becomes one place named
 * "invalid"), so a malformed setting is an engine error on the trace, never silently dropped.
 */
export function settingsOf(zip: string | null, settings: unknown): PracticeSettings {
  // A settings document that is not an object leaves the places unreadable, which the engine refuses.
  const stored = isObject(settings) ? settings : { place_of_service_settings: text(settings) };
  const rounding = stored.default_rounding ?? null;
  const places = stored.place_of_service_settings ?? {};
  return {
    zip: zip ?? '',
    defaultRounding: (rounding === null ? null : text(rounding)) as RoundingRule | null,
    placeOfServiceSettings: (isObject(places)
      ? Object.fromEntries(Object.entries(places).map(([place, setting]) => [place, text(setting)]))
      : { invalid: text(places) }) as Readonly<Record<string, PlaceOfServiceSetting>>,
  };
}
