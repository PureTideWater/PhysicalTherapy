import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { TextractPageReader, type TextractPageReaderOptions, pageTextHash } from '@tp/contracts';
import { readDocumentPages } from '@tp/contracts/pages';
import { parseCents } from '@tp/money';
import { type AssemblyInput, type PacketCitation, assemblePacket, canonicalJson } from '@tp/packets';
import {
  CONTRACT_SET_FORMAT,
  CONTRACT_SET_V2_CASE,
  CONTRACT_SET_V2_DIR,
  CONTRACT_TIERS,
  CONTRACT_TRUTH_FORMAT,
  NARRATIVE_SET_FORMAT,
  type NarrativeAssembly,
  PAGE_TEXT_FIDELITIES,
  TEXTRACT_RECORDING_FORMAT,
  TRUTH_FIELDS,
  TRUTH_ROLES,
  UNFAITHFUL_BECAUSE,
  type ContractLayout,
  type ContractTier,
  type ContractTruth,
  type PageTextFidelity,
  type RequiredFact,
  type TruthField,
  type TruthFieldValue,
  ensureLargeContractTier,
} from '@tp/synth';
import { z } from 'zod';

import type { ContractPagesInput } from '../src/functions/contract-terms';
import type { NarrativeInput } from '../src/functions/narrative';

/**
 * Reading the gateway's synthetic evaluation sets as packages/synth wrote them under
 * fixtures/synthetic (MOD-09: the contract set v2, 63 contracts and exhibits; MOD-03: 300 narratives;
 * docs/adr/0051 and 0070). A contract's pages are read the way intake reads them (@tp/contracts/pages:
 * pdf.js in a bounded thread for a text PDF, the CSV reader for a CSV), and a scanned document's pages,
 * where pdf.js finds no text, by the Textract page reader over the scan reader's recorded answer
 * instead of the service. A narrative case is assembled into a packet version's content by
 * @tp/packets, exactly as the packet builder does. Every file is SYNTHETIC; a file that says otherwise
 * is refused.
 *
 * The contract set v2's manifest (MOD-09/contract-set-v2/set.json) names each case's directory relative
 * to fixtures/synthetic, so its cases live under several roots: v1's 40 under MOD-01/contract-set (their
 * bytes unchanged), the 18 committed new ones beside the manifest, and the 5 large ones under
 * MOD-09/generated, which is ignored by git and written on demand by packages/synth
 * (ensureLargeContractTier: every file at the SHA-256 MOD-09's expected.json pins, or the load throws).
 */

export const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');
/** The contract set v2's manifest. */
export const CONTRACT_SET_MANIFEST = path.join(FIXTURES, CONTRACT_SET_V2_CASE, CONTRACT_SET_V2_DIR, 'set.json');
export const NARRATIVE_SET_ROOT = path.join(FIXTURES, 'MOD-03', 'narrative-set');

/** The set hash's format: what a baseline's `set_sha256` is a hash of. */
export const SET_HASH_FORMAT = 'tp-eval-set-hash/2';

const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');

// ---------------------------------------------------------------------------------------------------
// The scan reader's recorded answer

const recordingSchema = z.looseObject({
  format: z.literal(TEXTRACT_RECORDING_FORMAT),
  synthetic: z.literal(true),
  JobStatus: z.literal('SUCCEEDED'),
  DocumentMetadata: z.object({ Pages: z.number().int().min(1) }),
  Blocks: z.array(z.looseObject({ BlockType: z.enum(['PAGE', 'LINE']), Page: z.number().int().min(1), Text: z.string().optional() })),
});
export type Recording = z.output<typeof recordingSchema>;

/**
 * A text-detection client that answers from a recording: the job starts, and its result is the
 * recorded blocks. TextractPageReader drives it exactly as it drives the service.
 */
export function recordedTextractClient(recording: Recording): TextractPageReaderOptions['client'] {
  const send = (command: { readonly input: object }) =>
    Promise.resolve('DocumentLocation' in command.input ? { JobId: 'synthetic-recorded-job' } : { JobStatus: recording.JobStatus, DocumentMetadata: recording.DocumentMetadata, Blocks: recording.Blocks });
  return { send };
}

/** The page reader a scanned document is read with: Textract's, over its recording. */
export function recordedScanReader(recording: Recording): TextractPageReader {
  return new TextractPageReader({
    client: recordedTextractClient(recording),
    staging: { stage: () => Promise.resolve({ bucket: 'synthetic-recording', name: 'recorded' }) },
    pollMilliseconds: 0,
  });
}

// ---------------------------------------------------------------------------------------------------
// The contract set

const flagsValue = z.strictObject({ apply_mppr: z.boolean(), apply_assistant_reduction: z.boolean(), apply_sequestration: z.boolean(), apply_ncci: z.boolean(), timed_units_rule: z.enum(['MEDICARE_POOLED', 'PER_CODE', 'UNKNOWN']) });
const written = z.union([z.string(), z.array(z.string()), z.null()]);

const fieldValue = z.strictObject({
  value: z.union([z.string(), z.array(z.string()), flagsValue]),
  written,
  page: z.number().int().min(1),
  quote: z.string().min(1),
  /** On an unfaithful case only: the field as a faithful copier of the page text as read would write it. */
  asRead: z.strictObject({ written, quote: z.string().min(1) }).optional(),
});

const CASE_ID = /^[CVL]\d{2}$/;

const truthSchema = z.strictObject({
  format: z.literal(CONTRACT_TRUTH_FORMAT),
  synthetic: z.literal(true),
  id: z.string().regex(CASE_ID),
  layout: z.enum(['table', 'prose', 'scanned']),
  drawnAs: z.enum(['table', 'prose', 'csv']).nullable(),
  kind: z.enum(['contract', 'exhibit']),
  document: z.string().regex(/^[a-z]+\.(pdf|csv)$/),
  contentType: z.enum(['application/pdf', 'text/csv']),
  scan: z.string().regex(/^[a-z]+\.json$/).nullable(),
  pages: z.number().int().min(1),
  tier: z.enum(CONTRACT_TIERS),
  pageText: z.enum(PAGE_TEXT_FIDELITIES),
  unfaithfulBecause: z.enum(UNFAITHFUL_BECAUSE).nullable(),
  pairOf: z.string().regex(CASE_ID).nullable(),
  twinOf: z.string().regex(CASE_ID).nullable(),
  conflicts: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0)])),
  records: z.array(z.strictObject({ label: z.string(), role: z.enum(TRUTH_ROLES), fields: z.partialRecord(z.enum(TRUTH_FIELDS), fieldValue) })).min(1),
});

/** A case's directory relative to fixtures/synthetic: MOD-NN/<dir>/<ID>-<layout>, nothing that climbs out. */
const CASE_PATH = /^MOD-\d{2}\/[a-z0-9-]+\/[CVL]\d{2}-(table|prose|scanned)$/;

const manifestSchema = z.strictObject({
  format: z.literal(CONTRACT_SET_FORMAT),
  synthetic: z.literal(true),
  note: z.string(),
  cases: z
    .array(
      z.strictObject({
        id: z.string().regex(CASE_ID),
        path: z.string().regex(CASE_PATH),
        tier: z.enum(CONTRACT_TIERS),
        layout: z.enum(['table', 'prose', 'scanned']),
        kind: z.enum(['contract', 'exhibit']),
        pageText: z.enum(PAGE_TEXT_FIDELITIES),
        records: z.number().int().min(1),
        fields: z.number().int().min(1),
        generated: z.boolean(),
      }),
    )
    .min(1),
});
type ManifestCase = z.output<typeof manifestSchema>['cases'][number];

export interface ContractCase {
  readonly id: string;
  readonly layout: ContractLayout;
  readonly tier: ContractTier;
  readonly pageText: PageTextFidelity;
  readonly truth: ContractTruth;
  /** The document as intake read it, as the gateway is given it. */
  readonly input: ContractPagesInput;
  /** Whether a text reader found no text on any page (an image-only scan's pages carry none). */
  readonly textless: boolean;
}

/** A stable, opaque document ID for a synthetic case (the set has no database rows). */
export function syntheticDocumentId(caseId: string): string {
  const hex = sha256(`tp-eval/${caseId}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export interface LoadedContractSet {
  readonly cases: readonly ContractCase[];
  /**
   * The set's hash (tp-eval-set-hash/2): every file it was read from and every page as read. A baseline
   * names the set it was recorded on, and counts on another set are never compared.
   */
  readonly sha256: string;
  /** The manifest's case IDs, sorted: a report must cover exactly these (eval/baseline.ts, incomplete_report). */
  readonly caseIds: readonly string[];
}

interface SetFile {
  readonly case: string;
  readonly name: string;
  readonly sha256: string;
}

interface ReadCase {
  readonly item: ContractCase;
  readonly files: readonly SetFile[];
}

/** Refuses a truth that disagrees with its own manifest entry or with itself. */
function checkTruth(truth: ContractTruth, entry: ManifestCase): void {
  const says = { id: truth.id, tier: truth.tier, layout: truth.layout, kind: truth.kind, pageText: truth.pageText, records: truth.records.length };
  const listed = { id: entry.id, tier: entry.tier, layout: entry.layout, kind: entry.kind, pageText: entry.pageText, records: entry.records };
  if (canonicalJson(says) !== canonicalJson(listed)) {
    throw new Error(`${entry.id}: truth.json does not match the set's manifest`);
  }
  if ((truth.pageText === 'faithful') !== (truth.unfaithfulBecause === null)) {
    throw new Error(`${truth.id}: a case says why its page text is unfaithful exactly when it is`);
  }
  const asRead = truth.records.some((record) => Object.values(record.fields).some((value) => value.asRead !== undefined));
  if (asRead && truth.pageText === 'faithful') {
    throw new Error(`${truth.id}: only an unfaithful case's fields carry asRead`);
  }
  for (const [i, j] of truth.conflicts) {
    if (i === j || i >= truth.records.length || j >= truth.records.length) {
      throw new Error(`${truth.id}: a conflict pair names a record the truth does not hold`);
    }
  }
}

/** Refuses a set whose twins, pairs or conflicts name what is not there (review m5). */
function checkReferences(cases: readonly ContractCase[]): void {
  const byId = new Map(cases.map((item) => [item.id, item.truth]));
  if (byId.size !== cases.length) {
    throw new Error('the contract set lists a case twice');
  }
  for (const { truth } of cases) {
    if (truth.twinOf !== null) {
      const clean = byId.get(truth.twinOf);
      if (clean === undefined || clean.twinOf !== null || truth.twinOf === truth.id) {
        throw new Error(`${truth.id}: its twinOf names no clean case of the set`);
      }
    }
    if (truth.pairOf !== null) {
      const other = byId.get(truth.pairOf);
      if (other === undefined || other.pairOf !== truth.id || other.kind === truth.kind) {
        throw new Error(`${truth.id}: its pairOf names no case of the set that names it back as the other kind`);
      }
    }
  }
}

async function readCase(fixtures: string, entry: ManifestCase): Promise<ReadCase> {
  const at = path.join(fixtures, entry.path);
  const truthBytes = readFileSync(path.join(at, 'truth.json'));
  const truth = truthSchema.parse(JSON.parse(truthBytes.toString('utf8'))) as ContractTruth;
  checkTruth(truth, entry);
  const bytes = new Uint8Array(readFileSync(path.join(at, truth.document)));
  const files: SetFile[] = [
    { case: truth.id, name: 'truth.json', sha256: sha256(truthBytes) },
    { case: truth.id, name: truth.document, sha256: sha256(bytes) },
  ];
  let scans: TextractPageReader | undefined;
  if (truth.scan !== null) {
    const recordingBytes = readFileSync(path.join(at, truth.scan));
    files.push({ case: truth.id, name: truth.scan, sha256: sha256(recordingBytes) });
    scans = recordedScanReader(recordingSchema.parse(JSON.parse(recordingBytes.toString('utf8'))));
  }
  const plain = await readDocumentPages({ bytes, contentType: truth.contentType });
  const read = scans === undefined ? plain : await readDocumentPages({ bytes, contentType: truth.contentType }, { scans });
  if (!plain.ok || !read.ok) {
    throw new Error(`${truth.id}: the document could not be read`);
  }
  return {
    item: {
      id: truth.id,
      layout: truth.layout,
      tier: truth.tier,
      pageText: truth.pageText,
      truth,
      input: { documentId: syntheticDocumentId(truth.id), documentSha256: sha256(bytes), kind: truth.kind, pages: read.pages },
      textless: plain.pages.every((page) => page.trim() === ''),
    },
    files,
  };
}

/**
 * The set hash (tp-eval-set-hash/2): the SHA-256 of the canonical JSON of every file's SHA-256, by case
 * and name (the manifest under case ''), and every case's pages as read, by their page-text hash (what
 * a citation's `hash` is). A change to a truth, a document, a recording or a reader that alters what the
 * model is sent (a pdf.js or Textract-reader change) changes the set, and a baseline recorded on the old
 * set is then never compared (eval/baseline.ts, set_changed).
 */
export function contractSetHash(manifestSha256: string, cases: readonly { readonly files: readonly SetFile[]; readonly item: ContractCase }[]): string {
  const files = [{ case: '', name: 'set.json', sha256: manifestSha256 }, ...cases.flatMap((entry) => entry.files)].sort((a, b) => (a.case === b.case ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : a.case < b.case ? -1 : 1));
  const pages = [...cases].map((entry) => ({ case: entry.item.id, hashes: entry.item.input.pages.map(pageTextHash) })).sort((a, b) => (a.case < b.case ? -1 : a.case > b.case ? 1 : 0));
  return sha256(canonicalJson({ format: SET_HASH_FORMAT, files, pages }));
}

export interface ContractSetOptions {
  /** The set's manifest (the committed v2 manifest by default; a test's own). */
  readonly manifest?: string;
  /** The directory the manifest's case paths are relative to (fixtures/synthetic by default). */
  readonly fixtures?: string;
  /** How many documents are read at once, each in its own bounded reading thread. */
  readonly concurrency?: number;
}

/** The manifest's case IDs, sorted, without reading a document (what a complete report covers). */
export function contractSetCaseIds(manifest: string = CONTRACT_SET_MANIFEST): readonly string[] {
  return manifestSchema
    .parse(JSON.parse(readFileSync(manifest, 'utf8')))
    .cases.map((entry) => entry.id)
    .sort();
}

/** Reads every case of the set, the large tier generated first where the manifest lists generated cases. */
export async function loadContractSet(options: ContractSetOptions = {}): Promise<LoadedContractSet> {
  const { manifest: manifestFile = CONTRACT_SET_MANIFEST, fixtures = FIXTURES, concurrency = 6 } = options;
  const manifestBytes = readFileSync(manifestFile);
  const manifest = manifestSchema.parse(JSON.parse(manifestBytes.toString('utf8')));
  if (manifest.cases.some((entry) => entry.generated)) {
    await ensureLargeContractTier(fixtures);
  }
  const read: ReadCase[] = [];
  for (let start = 0; start < manifest.cases.length; start += concurrency) {
    read.push(...(await Promise.all(manifest.cases.slice(start, start + concurrency).map((entry) => readCase(fixtures, entry)))));
  }
  const cases = read.map((entry) => entry.item);
  checkReferences(cases);
  return { cases, sha256: contractSetHash(sha256(manifestBytes), read), caseIds: cases.map((item) => item.id).sort() };
}

/** Each true field of a case, by record. */
export function truthFields(truth: ContractTruth): { readonly record: number; readonly field: TruthField; readonly value: TruthFieldValue }[] {
  return truth.records.flatMap((record, index) => TRUTH_FIELDS.flatMap((field) => (record.fields[field] === undefined ? [] : [{ record: index, field, value: record.fields[field] }])));
}

// ---------------------------------------------------------------------------------------------------
// The narrative set

const requiredSchema = z.strictObject({ kind: z.enum(['amount', 'percent', 'number', 'marker']), value: z.string(), what: z.string() });
const caseSchema = z.strictObject({
  id: z.string().regex(/^N\d{3}$/),
  method: z.enum(['FIXED_SCHEDULE', 'PERCENT_OF_MEDICARE', 'LESSER_OF', 'PER_VISIT', 'MA_NONCONTRACTED']),
  assembly: z.looseObject({ asOf: z.string(), lines: z.array(z.looseObject({})).min(1) }),
  identifiers: z.array(z.string().min(1)),
  required: z.array(requiredSchema).min(1),
  reference: z.strictObject({ paragraphs: z.array(z.string().min(1)).min(1) }),
});
const partSchema = z.strictObject({ format: z.literal(NARRATIVE_SET_FORMAT), synthetic: z.literal(true), note: z.string(), part: z.number().int().min(1), cases: z.array(caseSchema) });

export interface NarrativeCase {
  readonly id: string;
  readonly method: string;
  /** The packet version's content (identifiers as placeholders) and the case's identifiers, as the gateway is given them. */
  readonly input: NarrativeInput;
  readonly required: readonly RequiredFact[];
  readonly reference: { readonly paragraphs: readonly string[] };
}

export interface LoadedNarrativeSet {
  readonly cases: readonly NarrativeCase[];
  readonly sha256: string;
  /** The parts' case IDs, sorted: a report must cover exactly these. */
  readonly caseIds: readonly string[];
}

const PART = /^part-\d{2}\.json$/;

/**
 * The assembly's JSON as @tp/packets takes it: cents as Cents. The set's parts predate tp-packet/2 and
 * never change, so they hold no trace and no window evidence: each line's deadline is its window, stated
 * unverified (no evidence is cited), and its calculation names no step and the SHA-256 of the line as the
 * set holds it; a later level's window is not stated. None of it is a figure the narrative's facts gain,
 * so what the model is given and what the verifier passes are as they were.
 */
export function toAssemblyInput(assembly: NarrativeAssembly): AssemblyInput {
  const citation = assembly.citation as unknown as PacketCitation;
  const contract = citation.kind === 'contract';
  return {
    ...assembly,
    citation,
    lines: assembly.lines.map((line) => ({
      ...line,
      expectedCents: parseCents(line.expectedCents),
      observedCents: parseCents(line.observedCents),
      varianceCents: parseCents(line.varianceCents),
      paidCents: parseCents(line.paidCents),
      deadline: { status: 'unverified', source: contract ? 'contract' : 'release', endsOn: line.windowEndsOn, cause: contract ? 'CONTRACT_WINDOW_UNCITED' : 'RECORD_NOT_IN_RELEASE' },
      calculation: {
        method: citation.method,
        release_no: assembly.releases[0]?.release_no ?? 0,
        steps: [],
        rounding: null,
        observed_basis: 'amt_b6',
        patient_share_cents: null,
        trace_sha256: createHash('sha256').update(canonicalJson(line), 'utf8').digest('hex'),
      },
    })),
    nextLevelDeadline: assembly.disputeLevel > 1 ? { status: 'unverified', source: contract ? 'contract' : 'release', endsOn: null, cause: 'NEXT_LEVEL_UNCITED' } : null,
    deadlineSources: [],
  };
}

export const NARRATIVE_PARTS: readonly string[] = ['part-01.json', 'part-02.json', 'part-03.json', 'part-04.json', 'part-05.json', 'part-06.json'];

/** The parts' case IDs, sorted, without assembling a packet (what a complete report covers). */
export function narrativeSetCaseIds(root: string = NARRATIVE_SET_ROOT, parts: readonly string[] = NARRATIVE_PARTS): readonly string[] {
  return parts.flatMap((name) => partSchema.parse(JSON.parse(readFileSync(path.join(root, name), 'utf8'))).cases.map((entry) => entry.id)).sort();
}

export function loadNarrativeSet(root: string = NARRATIVE_SET_ROOT, parts: readonly string[] = NARRATIVE_PARTS): LoadedNarrativeSet {
  const digest = createHash('sha256');
  const cases: NarrativeCase[] = [];
  for (const name of parts) {
    if (!PART.test(name)) {
      throw new Error('a narrative part is part-NN.json');
    }
    const text = readFileSync(path.join(root, name), 'utf8');
    digest.update(text);
    for (const entry of partSchema.parse(JSON.parse(text)).cases) {
      const assembly = entry.assembly as unknown as NarrativeAssembly;
      cases.push({
        id: entry.id,
        method: entry.method,
        input: { content: assemblePacket(toAssemblyInput(assembly)), identifiers: entry.identifiers },
        required: entry.required as RequiredFact[],
        reference: entry.reference,
      });
    }
  }
  return { cases, sha256: digest.digest('hex'), caseIds: cases.map((item) => item.id).sort() };
}
