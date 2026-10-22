import type { LineCause, SettingsField } from '@tp/worker/pricing';

/**
 * A diff line's cause in words (PRD 7, Pricing runs: a re-run "with a diff"; docs/adr/0037): what the two
 * traces say changed, naming rule records by type and key and their stored hashes, never a patient or
 * claim detail.
 */

const MAPPING_KIND_TEXT: Readonly<Record<string, string>> = {
  contract: 'a contract',
  ma_noncontracted: 'Medicare Advantage, non-contracted',
  no_agreement: 'no agreement',
  government: 'government',
  other: 'other',
};

function kindText(kind: string | null): string {
  return kind === null ? 'none' : (MAPPING_KIND_TEXT[kind] ?? kind);
}

/** A rule's key as "name value" pairs, its empty parts left out (a modifier of none). */
export function keyText(key: Readonly<Record<string, string>>): string {
  return Object.entries(key)
    .filter(([, value]) => value !== '')
    .map(([name, value]) => `${name} ${value}`)
    .join(', ');
}

/** A setting's value as a cause names it: a ZIP or ZIP+4 as typed, anything absent as none. */
function settingValue(value: unknown): string {
  return typeof value === 'string' && value !== '' ? value : 'none';
}

/**
 * One changed setting in words (docs/adr/0064): the billing ZIP and ZIP+4 with their values before and after (a
 * business address's ZIP, never a patient's), the rounding and the places of service by name.
 */
function settingText(field: SettingsField, before: unknown, after: unknown): string {
  switch (field) {
    case 'zip':
      return `the billing ZIP (${settingValue(before)} → ${settingValue(after)})`;
    case 'zip_plus_four':
      return `the billing ZIP+4 (${settingValue(before)} → ${settingValue(after)})`;
    case 'default_rounding':
      return 'the default rounding';
    case 'place_of_service_settings':
      return 'the places of service';
  }
}

export function causeText(cause: LineCause): string {
  switch (cause.kind) {
    case 'mapping':
      return `The plan's mapping: ${kindText(cause.before.mappingKind)} before, ${kindText(cause.after.mappingKind)} after`;
    case 'contract_version':
      if (cause.after.contractVersionId === null) {
        return 'No contract version prices the line now';
      }
      return cause.before.contractVersionId === null ? 'A contract version prices the line now' : 'Another contract version or rate record';
    case 'release_record':
      if (cause.before === null) {
        return `A rule record the line now reads: ${cause.recordType} (${keyText(cause.key)})`;
      }
      if (cause.after === null) {
        return `A rule record the line no longer reads: ${cause.recordType} (${keyText(cause.key)})`;
      }
      return `The rule record ${cause.recordType} (${keyText(cause.key)}) changed, ${cause.before.sha256.slice(0, 12)}… to ${cause.after.sha256.slice(0, 12)}…`;
    case 'claim':
      return "The claim's facts (a reversal or a correction loaded since)";
    case 'settings':
      return cause.fields.length === 0
        ? "The practice's pricing settings"
        : `The practice's pricing settings: ${cause.fields.map((field) => settingText(field, cause.before[field] ?? null, cause.after[field] ?? null)).join(', ')}`;
    case 'engine':
      return `The engine, ${cause.before} to ${cause.after}`;
    case 'claim_lines':
      return 'Another line of the same claim (the multiple procedure ranking or the per-visit amount)';
  }
}
