/**
 * The EMR export fixtures (docs/adr/0059): fixtures/synthetic/emr/<format_id>/ for every vendor format
 * in registry.ts, each holding the export as that format writes it and a manifest.json. They are named
 * fixtures, not test-matrix cases (the matrix has no row for them): `pnpm synth --all` writes them
 * through writeCases, so the writer's fixture guard reads every file, and the vendors test compares
 * them with a fresh generation through driftFrom.
 *
 * A manifest says what the export is and holds: its format (status FORMAT_UNCONFIRMED, its note, its
 * layout and columns), the source case files its rows come from, its files with their hash and size,
 * and its canonical rows with every amount in integer cents (as text, as expected.json writes them):
 * what a reader of the format must produce, row for row.
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { type GeneratedCase, type GeneratedFile } from '../../cases/builder';
import { prettyJson, sha256 } from '../../core/json';
import { type CanonicalEraRow, type EraCheck, eraSourceRows, vendorEraExport } from './era';
import { type CanonicalPostingRow, postingSourceRows, vendorPostingExport } from './posting';
import { type FormatColumn, type FormatConfirmation, FORMAT_MARKER, type FormatKind, type FormatStatus, VENDOR_FORMATS, VENDOR_NAMES, type VendorFormat } from './registry';

/** The directory under fixtures/synthetic. Not a case directory (CASE_DIR), so a case write never touches it. */
export const EMR_DIR = 'emr';

export const EXPORT_FILES: Readonly<Record<FormatKind, string>> = { posting_export: 'posting-export.csv', era_export: 'era-export.csv' };
export const MANIFEST_FILE = 'manifest.json';

export interface EmrManifest {
  readonly format: string;
  readonly vendor: string;
  readonly kind: FormatKind;
  readonly version: number;
  readonly status: FormatStatus;
  readonly confirmation: FormatConfirmation | null;
  readonly synthetic: true;
  readonly note: string;
  readonly layout: {
    readonly dateFormat: string;
    readonly money: string;
    readonly lineEnding: string;
    readonly bom: boolean;
    readonly listSeparator: string;
    readonly markerColumn: string;
    readonly marker: string;
  };
  readonly columns: readonly FormatColumn<string>[];
  /** The source case files, and how many of the export's rows each gives. */
  readonly sources: readonly { readonly case: string; readonly file: string; readonly rows: number }[];
  /** An ERA export's payments, each with what its rows total (paid) beside the 835's claims paid and BPR02. */
  readonly checks?: readonly EraCheck[];
  readonly files: readonly { readonly path: string; readonly sha256: string; readonly bytes: number; readonly rows: number }[];
  readonly rows: readonly CanonicalPostingRow[] | readonly CanonicalEraRow[];
}

/** One format's fixture directory, as writeCases and driftFrom read a set (a directory and its files). */
export interface EmrFixtureSet {
  readonly id: string;
  readonly dir: string;
  readonly files: readonly GeneratedFile[];
  readonly manifest: EmrManifest;
}

function manifestOf(format: VendorFormat, exported: Uint8Array, rows: EmrManifest['rows'], sources: EmrManifest['sources'], checks?: readonly EraCheck[]): EmrManifest {
  return {
    format: format.id,
    vendor: VENDOR_NAMES[format.vendor],
    kind: format.kind,
    version: format.version,
    status: format.status,
    confirmation: format.confirmation,
    synthetic: true,
    note: format.note,
    layout: { dateFormat: format.dateFormat, money: format.money, lineEnding: format.lineEnding, bom: format.bom, listSeparator: format.listSeparator, markerColumn: format.markerColumn, marker: FORMAT_MARKER },
    columns: format.columns,
    sources,
    ...(checks === undefined ? {} : { checks }),
    files: [{ path: EXPORT_FILES[format.kind], sha256: sha256(exported), bytes: exported.length, rows: rows.length }],
    rows,
  };
}

/** Every vendor format's fixture set, in registry order; the same bytes every time. */
export function emrFixtureSets(formats: readonly VendorFormat[] = VENDOR_FORMATS): EmrFixtureSet[] {
  const postings = postingSourceRows();
  const postingRows = postings.flatMap((source) => source.rows);
  const postingSources = postings.map((source) => ({ case: source.source.caseId, file: source.source.file, rows: source.rows.length }));
  const eras = eraSourceRows();
  const eraSources = eras.checks.reduce<{ case: string; file: string; rows: number }[]>((list, check) => {
    const last = list.at(-1);
    if (last !== undefined && last.case === check.caseId && last.file === check.file) {
      last.rows += check.rows;
    } else {
      list.push({ case: check.caseId, file: check.file, rows: check.rows });
    }
    return list;
  }, []);
  return formats.map((format) => {
    const dir = `${EMR_DIR}/${format.id}`;
    const exported = format.kind === 'posting_export' ? vendorPostingExport(format, postingRows) : vendorEraExport(format, eras.rows);
    const manifest = format.kind === 'posting_export' ? manifestOf(format, exported, postingRows, postingSources) : manifestOf(format, exported, eras.rows, eraSources, eras.checks);
    const files: GeneratedFile[] = [
      { path: `${dir}/${EXPORT_FILES[format.kind]}`, bytes: exported },
      { path: `${dir}/${MANIFEST_FILE}`, bytes: new Uint8Array(Buffer.from(prettyJson(manifest), 'utf8')) },
    ];
    return { id: format.id, dir, files, manifest };
  });
}

/**
 * The sets as writeCases and driftFrom take them. Both read a set's directory and files and nothing
 * else (packages/synth/src/write.ts); an EMR set has no case expectation or 835 documents of its own.
 */
export function emrWritable(sets: readonly EmrFixtureSet[]): readonly GeneratedCase[] {
  return sets as unknown as readonly GeneratedCase[];
}

/** Directories under fixtures/synthetic/emr that no format in the registry owns (a format renamed or removed). */
export function staleEmrDirectories(root: string, formats: readonly VendorFormat[] = VENDOR_FORMATS): string[] {
  const base = path.join(root, EMR_DIR);
  if (!existsSync(base)) {
    return [];
  }
  const owned = new Set(formats.map((format) => format.id));
  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !owned.has(entry.name))
    .map((entry) => `${EMR_DIR}/${entry.name}`)
    .sort();
}
