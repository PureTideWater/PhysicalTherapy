import { z } from 'zod';

import { PROVIDER_KINDS } from './provider';
import { TALLY_KEYS } from './tally';

/**
 * The committed baseline's format, `tp-model-eval-baseline/4` (docs/adr/0070, Part 1; eval/baseline.json;
 * /4 adds the `widened` count to every tally, review M2, refuses two entries of one key, review m4, and
 * keeps the permitted runs a real provider was served on, `served`, review B1).
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

export const BASELINE_FORMAT = 'tp-model-eval-baseline/4';

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

/**
 * The permitted run a real provider's contract variant was last served on (written by `eval record-permitted`
 * only; the PR review's B1): the prompt version and content, the model, and the run's record as its entry
 * carried it. It is history, never a reason to serve: production reads entries only (./evaluated.ts
 * entryFor), so a record here serves nothing. It outlives the entry it was written beside, which a prompt or
 * model change deletes and `eval --record` of the same version replaces with a pending one, so that the next
 * permitted run is compared with what was served (record-permitted requires `--against` whenever the
 * provider has any) and with nothing else (`--against` must be a run of this prompt and model).
 */
export const servedRecordSchema = z.strictObject({
  prompt_version: z.string().min(1),
  prompt_sha256: sha256,
  model_id: z.string().min(1),
  examples: count,
  report_sha256: sha256,
  against_sha256: sha256.nullable(),
  recorded_on: z.iso.date(),
});
export type ServedRecord = z.output<typeof servedRecordSchema>;

/** The served history, by real provider and contract variant (the local provider is never recorded). */
const servedHistory = z.partialRecord(z.enum(PROVIDER_KINDS).exclude(['local']), z.partialRecord(z.enum(CONTRACT_VARIANTS), servedRecordSchema));

/** What an entry's identity is made of: its purpose, provider, prompt version, model and, for a contract entry, its variant. */
interface EntryKey {
  readonly purpose: string;
  readonly provider: string;
  readonly prompt_version: string;
  readonly model_id: string;
  readonly variant?: string;
}

/**
 * Whether two entries are for the same key: the one definition of an entry's identity, which the writer
 * (eval/baseline.ts recordBaseline, replacing an entry) and this reader (refusing a second) share, so the
 * two can never disagree on what a duplicate is (review m4). A contract entry and a narrative entry are
 * never the same; two contract entries of one model are the same only on the same variant.
 */
export function sameEntryKey(a: EntryKey, b: EntryKey): boolean {
  return a.purpose === b.purpose && a.provider === b.provider && a.prompt_version === b.prompt_version && a.model_id === b.model_id && a.variant === b.variant;
}

/**
 * Two entries for one key are refused (review m4): the gate never writes them (recordBaseline replaces
 * the entry it supersedes), and a reader taking the first (./evaluated.ts entryFor, eval/baseline.ts
 * contractBaselineFor) would serve on, or hold a change to, whichever a hand merge left first.
 */
function refuseDuplicateKeys(entries: readonly EntryKey[], context: z.core.$RefinementCtx<readonly EntryKey[]>): void {
  entries.forEach((entry, index) => {
    const first = entries.findIndex((other) => sameEntryKey(other, entry));
    if (first !== index) {
      context.addIssue({ code: 'custom', path: [index], message: `entry ${String(index)} has the key of entry ${String(first)} (purpose, provider, prompt version, model and variant): a baseline holds one entry per key` });
    }
  });
}

export const baselineSchema = z.strictObject({
  format: z.literal(BASELINE_FORMAT),
  synthetic: z.literal(true),
  note: z.string(),
  entries: z.array(z.discriminatedUnion('purpose', [contractEntrySchema, narrativeEntrySchema])).superRefine(refuseDuplicateKeys),
  /** Absent until the first permitted run of a real provider is recorded. */
  served: servedHistory.optional(),
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
