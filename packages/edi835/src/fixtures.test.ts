/**
 * Every synthetic fixture packages/synth generated (fixtures/synthetic/<case>/expected.json): the
 * parser's reading of each 835, and of each X12 entry of the PAR-27 and PAR-28 zips, must equal what
 * the case says, field for field: outcome, document errors, every transaction's hold reasons with
 * their positions and differences, deduplication key, balance, counts, claims, lines, adjustments,
 * observed allowed, provider adjustments, unknown codes and the receipt.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { type CaseExpectation, type ClaimRef, type X12FileExpectation, readZip } from '@tp/synth';
import { describe, expect, it } from 'vitest';

import { type KnownRemittance, duplicateDocument, remittanceDecision } from './dedup';
import { type ParseResult, parse835, remittancesOf } from './stream';
import { comparable, parseShape, releaseDirectoryCodeLists } from './testing';
import { type Claim, isLoadable } from './types';

const syntheticRoot = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');
const codeLists = releaseDirectoryCodeLists();

interface CaseFile {
  readonly dir: string;
  readonly expected: CaseExpectation;
}

function cases(): CaseFile[] {
  const dirs = readdirSync(syntheticRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[A-Z]{3}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name);
  const variants = readdirSync(path.join(syntheticRoot, 'variants')).map((name) => `variants/${name}`);
  return [...dirs, ...variants].map((dir) => ({ dir, expected: JSON.parse(readFileSync(path.join(syntheticRoot, dir, 'expected.json'), 'utf8')) as CaseExpectation }));
}

const ALL = cases();

function parseFile(dir: string, file: string): ParseResult {
  return parse835(readFileSync(path.join(syntheticRoot, dir, file)), { codeLists });
}

const x12Cases = ALL.flatMap((item) => item.expected.files.filter((file) => file.kind === 'x12').map((file) => ({ dir: item.dir, path: file.path, x12: file.x12 as X12FileExpectation })));

describe('every synthetic 835 parses exactly as its case expects', () => {
  it('covers at least the fifty fixtures the milestone names, and every PAR case with a file', () => {
    expect(x12Cases.length).toBeGreaterThanOrEqual(50);
    const parCases = new Set(x12Cases.filter((item) => item.dir.startsWith('PAR-')).map((item) => item.dir));
    expect(parCases.size).toBeGreaterThanOrEqual(26);
  });

  it.each(x12Cases.map((item) => [`${item.dir}/${item.path}`, item] as const))('%s', (_name, item) => {
    const result = parseFile(item.dir, item.path);
    expect(parseShape(result)).toEqual(comparable(item.x12.parse));
    expect(result.report.codeListRelease).toBe(900001);
    if (item.x12.parse.toleratedByParser !== undefined) {
      expect(result.report.outcome).toBe('loaded');
    }
  });
});

describe('zip entries (PAR-27, PAR-28)', () => {
  const zips = ALL.flatMap((item) => item.expected.files.filter((file) => file.kind === 'zip').map((file) => ({ dir: item.dir, file })));

  it.each(zips.map((item) => [`${item.dir}/${item.file.path}`, item] as const))('%s: each X12 entry parses as its case says', (_name, { dir, file }) => {
    const entries = readZip(readFileSync(path.join(syntheticRoot, dir, file.path)));
    const zip = file.zip as NonNullable<typeof file.zip>;
    let parsed = 0;
    let held = 0;
    for (const entry of zip.entries) {
      const bytes = entries.find((candidate) => candidate.name === entry.name)?.bytes;
      expect(bytes, entry.name).toBeDefined();
      const result = parse835(bytes as Uint8Array, { codeLists });
      expect(result.report.documentSha256).toBe(entry.sha256);
      if (entry.kind === 'executable') {
        // Never parsed as an 835 (the intake quarantines it first); the parser refuses it all the same.
        expect(result.report.documentErrors.map((error) => error.code)).toEqual(['EDI_NOT_835']);
        continue;
      }
      if (entry.x12 !== undefined) {
        expect(parseShape(result), entry.name).toEqual(comparable(entry.x12.parse));
      }
      if (entry.outcome === 'parsed') {
        parsed += 1;
        expect(result.report.outcome, entry.name).toBe('loaded');
      } else if (entry.outcome === 'held') {
        held += 1;
        expect(result.report.outcome, entry.name).toBe('held');
      } else {
        expect(result.report.outcome, entry.name).toBe('loaded');
      }
    }
    if (!zip.batch.zipQuarantined) {
      expect({ parsed, held }).toEqual({ parsed: zip.batch.parsed, held: zip.batch.held });
    }
  });
});

describe('deduplication decisions for the loader (PAR-06, PAR-07, PAR-30, V25)', () => {
  const uploadCases = ALL.filter((item) => item.expected.uploads.length > 0 && item.expected.uploads.every((upload) => upload.outcome !== 'held'));

  it.each(uploadCases.map((item) => [item.dir, item] as const))('%s: each upload in order', (_name, item) => {
    const documents: { id: string; sha256: string }[] = [];
    const remittances: KnownRemittance[] = [];
    for (const upload of item.expected.uploads) {
      const result = parseFile(item.dir, upload.file);
      const id = `step-${String(upload.step)}`;
      const document = duplicateDocument(result.report.documentSha256, documents);
      if (document !== null) {
        expect(upload.outcome).toBe('duplicate_document');
        expect(document.duplicateOf).toBe(`step-${String(upload.linkedTo)}`);
        expect(document.error.code).toBe('EDI_DUPLICATE');
        continue;
      }
      documents.push({ id, sha256: result.report.documentSha256 });
      let loaded = 0;
      let claims = 0;
      for (const remittance of remittancesOf(result).filter(isLoadable)) {
        const decision = remittanceDecision(remittance, remittances);
        switch (decision.outcome) {
          case 'duplicate_remittance':
            expect(upload.outcome).toBe('duplicate_remittance');
            expect(decision.duplicateOf).toBe(`step-${String(upload.linkedTo)}`);
            expect(decision.error).toMatchObject({ code: 'EDI_DUPLICATE', segmentId: 'TRN', elementPosition: 2 });
            continue;
          case 'review_trace_reused':
            expect(upload.outcome).toBe('loaded_for_review');
            expect(decision).toMatchObject({ sameTraceAs: `step-${String(upload.linkedTo)}`, anotherDate: true });
            break;
          case 'new':
            expect(upload.outcome).toBe('loaded');
            break;
        }
        loaded += 1;
        claims += remittance.claims.length;
        remittances.push({ id, key: remittance.dedupKey, originatorId: remittance.trace.originatorId, paymentDate: remittance.payment.date });
      }
      expect({ loaded, claims }).toEqual({ loaded: upload.remittancesLoaded, claims: upload.claimsLoaded });
    }
  });
});

describe('reversal linkage (PAR-08)', () => {
  it('links the reversal and the correction to the original claim by payer claim control number', () => {
    const item = ALL.find((entry) => entry.dir === 'PAR-08') as CaseFile;
    const claimAt = (ref: ClaimRef): Claim => remittancesOf(parseFile(item.dir, ref.file))[ref.transaction]?.claims[ref.claim] as Claim;
    let checked = 0;
    for (const file of item.expected.files) {
      const claims = remittancesOf(parseFile(item.dir, file.path)).flatMap((remittance) => remittance.claims);
      (file.x12 as X12FileExpectation).parse.transactions.flatMap((transaction) => transaction.claims).forEach((expected, index) => {
        const claim = claims[index] as Claim;
        if (expected.reversalOf !== undefined) {
          expect(claim.reversal?.payerClaimControlNumber).toBe(claimAt(expected.reversalOf).payerClaimControlNumber);
          checked += 1;
        }
        if (expected.supersedes !== undefined) {
          expect(claim.correction?.payerClaimControlNumber).toBe(claimAt(expected.supersedes).payerClaimControlNumber);
          expect(claim.correction?.reversal).toEqual({ interchange: 0, group: 0, transaction: 0, claim: 0 });
          checked += 1;
        }
      });
    }
    expect(checked).toBe(2);
  });
});
