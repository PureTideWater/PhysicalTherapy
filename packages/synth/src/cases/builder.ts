/**
 * Assembles one case's files and its expected.json. Case generators add files through a builder; the
 * builder hashes them, renders X12 with the requested options and computes each 835's oracle summary
 * and parser expectation.
 */
import { canonicalJson, prettyJson, sha256 } from '../core/json';
import { expectParse } from '../expected/parse';
import {
  type CaseExpectation,
  type CaseModule,
  type FileExpectation,
  type FileKind,
  type GeneratedFileExpectation,
  type OracleExpectation,
  type ParseExpectation,
  type UploadExpectation,
  type X12FileExpectation,
} from '../expected/types';
import { type AmountStyle, documentFor835 } from '../x12/build835';
import { type File835 } from '../x12/model';
import { type RenderOptions, type X12Document, renderDocument } from '../x12/segments';
import { type OracleSummary, summarize835 } from '../x12/summary';
import { SynthWorld } from '../x12/factory';

export interface GeneratedFile {
  /** Relative to fixtures/synthetic. */
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface GeneratedCase {
  readonly id: string;
  /** The directory under fixtures/synthetic. */
  readonly dir: string;
  readonly files: readonly GeneratedFile[];
  readonly expected: CaseExpectation;
  /** The segment documents of the case's well-formed 835s, by path (in memory only; tests use them). */
  readonly documents: ReadonlyMap<string, X12Document>;
}

export interface CaseInfo {
  readonly id: string;
  readonly module: CaseModule;
  readonly title: string;
  readonly assertion: string;
  readonly completesIn: number;
  readonly assertedBy?: readonly string[];
  readonly codeListRelease?: number | null;
}

export interface X12RenderOptions extends RenderOptions {
  readonly amountStyle?: AmountStyle;
}

export interface RenderedX12 {
  readonly text: string;
  readonly bytes: Uint8Array;
  readonly document: X12Document;
}

export function render835(file: File835, options: X12RenderOptions = {}): RenderedX12 {
  const document = documentFor835(file, { amountStyle: options.amountStyle });
  const text = renderDocument(document, options);
  return { text, bytes: new Uint8Array(Buffer.from(text, 'utf8')), document };
}

/** The oracle and parser expectations of a well-formed 835. */
export function x12Expectation(file: File835, rendered: RenderedX12, bom: boolean, oracle: Partial<OracleExpectation> = {}): X12FileExpectation {
  const summary = summarize835(rendered.document, bom);
  const parse = expectParse(file, rendered.document);
  return {
    oracle: { valid: oracle.valid ?? true, rejections: oracle.rejections ?? [], summary: oracle.summary === undefined ? summary : oracle.summary },
    parse,
  };
}

export function summarySha256(summary: OracleSummary): string {
  return sha256(canonicalJson(summary));
}

export class CaseBuilder {
  readonly world: SynthWorld;
  private readonly files: GeneratedFile[] = [];
  private readonly expectations: FileExpectation[] = [];
  private readonly uploadList: UploadExpectation[] = [];
  private readonly documentMap = new Map<string, X12Document>();
  private readonly generatedList: GeneratedFileExpectation[] = [];
  private scenarioValue: Record<string, unknown> | null = null;
  private outcomeValue: Record<string, unknown> | null = null;
  private readonly noteList: string[] = [];
  private noFile: string | null = null;

  constructor(
    readonly info: CaseInfo,
    readonly dir: string = info.id,
  ) {
    this.world = new SynthWorld(`tp-synth/${info.id}`);
  }

  private push(path: string, bytes: Uint8Array, kind: FileKind, description: string, extra: Partial<FileExpectation> = {}): FileExpectation {
    if (this.expectations.some((item) => item.path === path)) {
      throw new Error(`${this.info.id} writes ${path} twice`);
    }
    this.files.push({ path: `${this.dir}/${path}`, bytes });
    const expectation: FileExpectation = { path, sha256: sha256(bytes), bytes: bytes.length, kind, description, ...extra };
    this.expectations.push(expectation);
    return expectation;
  }

  /** Writes a well-formed 835 and records its oracle summary and parser expectation. */
  add835(
    path: string,
    file: File835,
    description: string,
    options: X12RenderOptions = {},
    adjust?: (parse: ParseExpectation) => ParseExpectation,
    oracle: Partial<OracleExpectation> = {},
  ): X12FileExpectation {
    const rendered = render835(file, options);
    const base = x12Expectation(file, rendered, options.bom === true, oracle);
    const x12 = adjust ? { ...base, parse: adjust(base.parse) } : base;
    this.push(path, rendered.bytes, 'x12', description, { x12 });
    this.documentMap.set(path, rendered.document);
    return x12;
  }

  /** Writes X12 bytes with an expectation the case states itself (malformed and non-835 files). */
  addX12Bytes(path: string, bytes: Uint8Array, description: string, x12: X12FileExpectation): void {
    this.push(path, bytes, 'x12', description, { x12 });
  }

  addFile(path: string, bytes: Uint8Array | string, kind: FileKind, description: string, extra: Partial<FileExpectation> = {}): void {
    this.push(path, typeof bytes === 'string' ? new Uint8Array(Buffer.from(bytes, 'utf8')) : bytes, kind, description, extra);
  }

  /** A file in the case directory that is not a fixture (a .gitignore for generated output). */
  addAuxiliary(path: string, text: string): void {
    this.files.push({ path: `${this.dir}/${path}`, bytes: new Uint8Array(Buffer.from(text, 'utf8')) });
  }

  /** Declares a file generated at test time (never committed) and what the oracle must find in it. */
  generatedFile(file: GeneratedFileExpectation): void {
    this.generatedList.push(file);
  }

  upload(upload: UploadExpectation): void {
    this.uploadList.push(upload);
  }

  scenario(value: Record<string, unknown>): void {
    this.scenarioValue = { ...(this.scenarioValue ?? {}), ...value };
  }

  outcome(value: Record<string, unknown>): void {
    this.outcomeValue = { ...(this.outcomeValue ?? {}), ...value };
  }

  note(text: string): void {
    this.noteList.push(text);
  }

  /** The case needs no file of its own; says why. */
  noFiles(reason: string): void {
    this.noFile = reason;
  }

  build(): GeneratedCase {
    if (this.noFile === null && this.expectations.length === 0) {
      throw new Error(`${this.info.id} generates no file and does not say why`);
    }
    const expected: CaseExpectation = {
      case: this.info.id,
      module: this.info.module,
      title: this.info.title,
      assertion: this.info.assertion,
      synthetic: true,
      completesIn: this.info.completesIn,
      assertedBy: [...(this.info.assertedBy ?? [])],
      codeListRelease: this.info.codeListRelease ?? null,
      noFileReason: this.noFile,
      files: this.expectations,
      generated: this.generatedList,
      uploads: this.uploadList,
      scenario: this.scenarioValue,
      outcome: this.outcomeValue,
      notes: this.noteList,
    };
    const expectedBytes = new Uint8Array(Buffer.from(prettyJson(expected), 'utf8'));
    return { id: this.info.id, dir: this.dir, files: [...this.files, { path: `${this.dir}/expected.json`, bytes: expectedBytes }], expected, documents: this.documentMap };
  }
}
