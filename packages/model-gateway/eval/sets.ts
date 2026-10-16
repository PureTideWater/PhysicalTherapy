import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { TextractPageReader, type TextractPageReaderOptions } from '@tp/contracts';
import { readDocumentPages } from '@tp/contracts/pages';
import { parseCents } from '@tp/money';
import { type AssemblyInput, type PacketCitation, assemblePacket } from '@tp/packets';
import {
  CONTRACT_SET_FORMAT,
  CONTRACT_TRUTH_FORMAT,
  NARRATIVE_SET_FORMAT,
  type NarrativeAssembly,
  TEXTRACT_RECORDING_FORMAT,
  TRUTH_FIELDS,
  type ContractLayout,
  type ContractTruth,
  type RequiredFact,
  type TruthField,
  type TruthFieldValue,
} from '@tp/synth';
import { z } from 'zod';

import type { ContractPagesInput } from '../src/functions/contract-terms';
import type { NarrativeInput } from '../src/functions/narrative';

/**
 * Reading the gateway's synthetic evaluation sets as packages/synth wrote them under
 * fixtures/synthetic (MOD-01: 40 contracts and exhibits; MOD-03: 300 narratives; docs/adr/0051). A
 * contract's pages are read the way intake reads them (@tp/contracts/pages: pdf.js in a bounded thread
 * for a text PDF, the CSV reader for a CSV), and a scanned document's pages, which hold no text, by the
 * Textract page reader over the scan reader's recorded answer instead of the service. A narrative case
 * is assembled into a packet version's content by @tp/packets, exactly as the packet builder does.
 * Every file is SYNTHETIC; a file that says otherwise is refused.
 */

export const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');
export const CONTRACT_SET_ROOT = path.join(FIXTURES, 'MOD-01', 'contract-set');
export const NARRATIVE_SET_ROOT = path.join(FIXTURES, 'MOD-03', 'narrative-set');

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

const fieldValue = z.strictObject({
  value: z.union([z.string(), z.array(z.string()), z.strictObject({ apply_mppr: z.boolean(), apply_assistant_reduction: z.boolean(), apply_sequestration: z.boolean(), apply_ncci: z.boolean(), timed_units_rule: z.enum(['MEDICARE_POOLED', 'PER_CODE', 'UNKNOWN']) })]),
  written: z.union([z.string(), z.array(z.string()), z.null()]),
  page: z.number().int().min(1),
  quote: z.string().min(1),
});

const truthSchema = z.strictObject({
  format: z.literal(CONTRACT_TRUTH_FORMAT),
  synthetic: z.literal(true),
  id: z.string().regex(/^C\d{2}$/),
  layout: z.enum(['table', 'prose', 'scanned']),
  drawnAs: z.enum(['table', 'prose', 'csv']).nullable(),
  kind: z.enum(['contract', 'exhibit']),
  document: z.string().regex(/^[a-z]+\.(pdf|csv)$/),
  contentType: z.enum(['application/pdf', 'text/csv']),
  scan: z.string().nullable(),
  pages: z.number().int().min(1),
  records: z.array(z.strictObject({ label: z.string(), fields: z.partialRecord(z.enum(TRUTH_FIELDS), fieldValue) })).min(1),
});

const manifestSchema = z.strictObject({
  format: z.literal(CONTRACT_SET_FORMAT),
  synthetic: z.literal(true),
  note: z.string(),
  cases: z.array(z.strictObject({ id: z.string(), dir: z.string(), layout: z.enum(['table', 'prose', 'scanned']), kind: z.enum(['contract', 'exhibit']), records: z.number(), fields: z.number() })),
});

export interface ContractCase {
  readonly id: string;
  readonly layout: ContractLayout;
  readonly truth: ContractTruth;
  /** The document as intake read it, as the gateway is given it. */
  readonly input: ContractPagesInput;
  /** Whether a text reader found no text on any page (a scanned document's pages carry none). */
  readonly textless: boolean;
}

/** A stable, opaque document ID for a synthetic case (the set has no database rows). */
export function syntheticDocumentId(caseId: string): string {
  const hex = sha256(`tp-eval/${caseId}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export interface LoadedContractSet {
  readonly cases: readonly ContractCase[];
  /** The SHA-256 of every file the set was read from, in order: a baseline names the set it was recorded on. */
  readonly sha256: string;
}

interface ReadCase {
  readonly item: ContractCase;
  readonly texts: readonly string[];
}

async function readCase(root: string, dir: string): Promise<ReadCase> {
  const at = path.join(root, path.basename(dir));
  const truthText = readFileSync(path.join(at, 'truth.json'), 'utf8');
  const truth = truthSchema.parse(JSON.parse(truthText)) as ContractTruth;
  const bytes = new Uint8Array(readFileSync(path.join(at, truth.document)));
  const texts = [truthText];
  let scans: TextractPageReader | undefined;
  if (truth.scan !== null) {
    const recordingText = readFileSync(path.join(at, truth.scan), 'utf8');
    texts.push(recordingText);
    scans = recordedScanReader(recordingSchema.parse(JSON.parse(recordingText)));
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
      truth,
      input: { documentId: syntheticDocumentId(truth.id), documentSha256: sha256(bytes), kind: truth.kind, pages: read.pages },
      textless: plain.pages.every((page) => page.trim() === ''),
    },
    texts: [...texts, sha256(bytes)],
  };
}

/** Reads every case, a few documents at a time (each in its own bounded reading thread). */
export async function loadContractSet(root: string = CONTRACT_SET_ROOT, concurrency = 6): Promise<LoadedContractSet> {
  const manifestText = readFileSync(path.join(root, 'set.json'), 'utf8');
  const manifest = manifestSchema.parse(JSON.parse(manifestText));
  const read: ReadCase[] = [];
  for (let start = 0; start < manifest.cases.length; start += concurrency) {
    read.push(...(await Promise.all(manifest.cases.slice(start, start + concurrency).map((entry) => readCase(root, entry.dir)))));
  }
  const digest = createHash('sha256').update(manifestText);
  for (const entry of read) {
    for (const text of entry.texts) {
      digest.update(text);
    }
  }
  return { cases: read.map((entry) => entry.item), sha256: digest.digest('hex') };
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
}

const PART = /^part-\d{2}\.json$/;

/** The assembly's JSON as @tp/packets takes it: cents as Cents. */
export function toAssemblyInput(assembly: NarrativeAssembly): AssemblyInput {
  return {
    ...assembly,
    citation: assembly.citation as unknown as PacketCitation,
    lines: assembly.lines.map((line) => ({
      ...line,
      expectedCents: parseCents(line.expectedCents),
      observedCents: parseCents(line.observedCents),
      varianceCents: parseCents(line.varianceCents),
      paidCents: parseCents(line.paidCents),
    })),
  };
}

export function loadNarrativeSet(root: string = NARRATIVE_SET_ROOT, parts: readonly string[] = ['part-01.json', 'part-02.json', 'part-03.json', 'part-04.json', 'part-05.json', 'part-06.json']): LoadedNarrativeSet {
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
  return { cases, sha256: digest.digest('hex') };
}
