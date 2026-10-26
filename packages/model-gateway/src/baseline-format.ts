import { z } from 'zod';

import { PROVIDER_KINDS } from './provider';
import { TALLY_KEYS } from './tally';

/**
 * The committed baseline's format, `tp-model-eval-baseline/3` (docs/adr/0070, Part 1; eval/baseline.json).
 * It lives in src, not beside the gate in eval/, because two readers must parse an entry exactly as the
 * gate writes it: the gate (eval/baseline.ts), which holds a report to an entry, and production
 * (./evaluated.ts), which serves a real provider only on an entry. A loose reader would count an entry
 * the gate never wrote.
 *
 * Every object is strict, so a field the gate does not write fails the parse. Three counts are literals:
 * a contract entry's `faithful_wrong_verified` (wrong but verified on a case whose page text is faithful),
 * its `conflicts.unflagged` and its `twins.differing` are 0 or the entry does not parse. The gate never
 * records anything else; an entry typed by hand with a dangerous count can then be neither held to nor
 * served. A well-formed entry typed by hand is caught by the golden test that recomputes every entry
 * from the report it names (`report_sha256`, eval/reports/<sha256>.json).
 *
 * The baseline holds counts, codes, hashes and dates of the synthetic sets only, never a document's text
 * or a figure of one.
 */

export const BASELINE_FORMAT = 'tp-model-eval-baseline/3';

/**
 * The fields a contract entry tallies: the synthetic set's truth fields (packages/synth TRUTH_FIELDS, which
 * src cannot import in production; a unit test holds the two lists equal), each a rate record's field as
 * proposals name it.
 */
export const BASELINE_FIELDS = [
  'method',
  'codes',
  'modifiers',
  'places_of_service',
  'amount',
  'percentage',
  'fee_schedule_year',
  'lesser_of_schedule',
  'flags',
  'rounding',
  'effective_from',
  'effective_to',
] as const;
export type BaselineField = (typeof BASELINE_FIELDS)[number];

/**
 * The variants of proposeContractTerms (PRD 14): the default model, and the larger model the specialist
 * asks for on a contract marked ambiguous. Each is a model of its own, so each has its own entry and is
 * never held to, or served on, the other's.
 */
export const CONTRACT_VARIANTS = ['default', 'ambiguous'] as const;
export type ContractVariant = (typeof CONTRACT_VARIANTS)[number];

const count = z.number().int().min(0);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

/** One field's tally (./tally.ts): every count an integer of at least zero, and nothing else. */
export const tallySchema = z.strictObject(Object.fromEntries(TALLY_KEYS.map((key) => [key, count])) as Record<(typeof TALLY_KEYS)[number], typeof count>);

const fieldTallies = z.strictObject(Object.fromEntries(BASELINE_FIELDS.map((field) => [field, tallySchema])) as Record<BaselineField, typeof tallySchema>);

/** The in-boundary permitted run a served entry rests on (written and read from serving on; docs/adr/0070, Part 2). */
const permittedRecord = z.union([
  z.literal('pending'),
  z.strictObject({ examples: count, report_sha256: sha256, against_sha256: sha256.nullable(), recorded_on: z.iso.date() }),
]);

export const contractEntrySchema = z.strictObject({
  purpose: z.literal('proposeContractTerms'),
  prompt_version: z.string().min(1),
  /** The SHA-256 the prompt version records for its content: a version edited in place is not the one recorded. */
  prompt_sha256: sha256,
  provider: z.enum(PROVIDER_KINDS),
  model_id: z.string().min(1),
  variant: z.enum(CONTRACT_VARIANTS),
  /** The set the counts were scored on (tp-eval-set-hash/2): counts on another set are never compared. */
  set_sha256: sha256,
  cases: z.number().int().min(1),
  fields: fieldTallies,
  total: tallySchema,
  faithful_wrong_verified: z.literal(0),
  conflicts: z.strictObject({ expected: count, unflagged: z.literal(0) }),
  twins: z.strictObject({ pairs: count, differing: z.literal(0) }),
  permitted: permittedRecord.optional(),
  /** The recorded report, eval/reports/<report_sha256>.json, from which the entry is recomputed. */
  report_sha256: sha256,
  recorded_on: z.iso.date(),
});

export const narrativeEntrySchema = z.strictObject({
  purpose: z.literal('draftPacketNarrative'),
  prompt_version: z.string().min(1),
  prompt_sha256: sha256,
  provider: z.enum(PROVIDER_KINDS),
  model_id: z.string().min(1),
  set_sha256: sha256,
  cases: z.number().int().min(1),
  failures: z.literal(0),
  report_sha256: sha256,
  recorded_on: z.iso.date(),
});

export const baselineSchema = z.strictObject({
  format: z.literal(BASELINE_FORMAT),
  synthetic: z.literal(true),
  note: z.string(),
  entries: z.array(z.discriminatedUnion('purpose', [contractEntrySchema, narrativeEntrySchema])),
});

export type Baseline = z.output<typeof baselineSchema>;
export type BaselineEntry = Baseline['entries'][number];
export type ContractBaseline = z.output<typeof contractEntrySchema>;
export type NarrativeBaseline = z.output<typeof narrativeEntrySchema>;
/** The purposes a baseline entry can be for: no other purpose has a set, so no other can be recorded or served. */
export type BaselinePurpose = BaselineEntry['purpose'];

/** The baseline as the gate wrote it; anything else throws. */
export function parseBaseline(value: unknown): Baseline {
  return baselineSchema.parse(value);
}
