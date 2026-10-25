import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { centsToString, parseAmount, sumCents } from '@tp/money';
import { beforeAll, describe, expect, it } from 'vitest';

import { type GeneratedCase } from './cases/builder';
import { LARGE_CLAIMS, LARGE_FIXTURE_PATH, writeLargeFixture } from './cases/large';
import { TEST_MATRIX } from './cases/matrix';
import { ALL_CASES, BUILT_THROUGH_MILESTONE, CASES, CODE_BUILT_THROUGH_MILESTONE, REGISTRY_IDS, VARIANT_CASES, findCase, generateAll } from './cases/registry';
import { SYNTHETIC_CARCS, SYNTHETIC_RARCS } from './expected/parse';
import { type CaseExpectation, type X12FileExpectation } from './expected/types';
import { readZip } from './formats/zip';
import { SYNTH_GS02, SYNTH_ISA06 } from './identity';
import { driftFrom } from './write';
import { summarize835 } from './x12/summary';

const repository = path.resolve(import.meta.dirname, '../../..');
const syntheticRoot = path.join(repository, 'fixtures', 'synthetic');

let generated: GeneratedCase[] = [];

beforeAll(() => {
  generated = generateAll();
}, 60_000);

function x12Files(cases: readonly GeneratedCase[]): { case: GeneratedCase; path: string; x12: X12FileExpectation }[] {
  return cases.flatMap((item) => item.expected.files.filter((file) => file.x12 !== undefined).map((file) => ({ case: item, path: file.path, x12: file.x12 as X12FileExpectation })));
}

describe('the case registry', () => {
  it('holds every row of docs/product/test-matrix.md, word for word, and nothing else', () => {
    const rows = readFileSync(path.join(repository, 'docs/product/test-matrix.md'), 'utf8')
      .split('\n')
      .map((text) => /^\| ([A-Z]{2,3}-\d{2}) \| (.*) \| (.*) \|$/.exec(text))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => ({ id: match[1], title: match[2], assertion: match[3] }));
    expect(TEST_MATRIX).toEqual(rows);
    expect(CASES.map((item) => item.id)).toEqual(rows.map((row) => row.id));
    expect([...REGISTRY_IDS].sort()).toEqual(rows.map((row) => row.id).sort());
    expect(CASES.map((item) => [item.title, item.assertion])).toEqual(rows.map((row) => [row.title, row.assertion]));
  });

  it('says for every case which milestone completes it, and either generates files or says why it needs none', () => {
    for (const item of ALL_CASES) {
      expect(item.completesIn, item.id).toBeGreaterThanOrEqual(0);
      expect(item.completesIn, item.id).toBeLessThanOrEqual(13);
      const result = generated.find((entry) => entry.id === item.id);
      expect(result, item.id).toBeDefined();
      const expected = result?.expected as CaseExpectation;
      expect(expected.files.length > 0 || (expected.noFileReason ?? '').length > 0, item.id).toBe(true);
      expect(expected.synthetic).toBe(true);
    }
  });

  it('points only at tests that exist', () => {
    for (const item of ALL_CASES) {
      for (const test of item.assertedBy) {
        expect(existsSync(path.join(repository, test)), `${item.id}: ${test}`).toBe(true);
      }
    }
  });

  it('names the tests that assert every case a built milestone completes', () => {
    const unasserted = ALL_CASES.filter((item) => item.completesIn <= BUILT_THROUGH_MILESTONE && item.assertedBy.length === 0).map((item) => item.id);
    expect(unasserted).toEqual([]);
    expect(BUILT_THROUGH_MILESTONE).toBe(5);
  });

  it('names the tests that assert every case a milestone whose code is built completes, before its done check is met', () => {
    const unasserted = ALL_CASES.filter((item) => item.completesIn <= CODE_BUILT_THROUGH_MILESTONE && item.assertedBy.length === 0).map((item) => item.id);
    expect(unasserted).toEqual([]);
    expect(CODE_BUILT_THROUGH_MILESTONE).toBeGreaterThanOrEqual(BUILT_THROUGH_MILESTONE);
  });

  it('finds cases by ID, variants included', () => {
    expect(findCase('PAR-08')?.dir).toBe('PAR-08');
    expect(findCase('V01')?.dir).toBe('variants/V01-many-payers');
    expect(findCase('PAR-99')).toBeUndefined();
    expect(VARIANT_CASES.every((item) => item.variant && item.module === 'PAR')).toBe(true);
  });

  it('generates a file for every parser case except the 10,000-claim one, which is generated at test time', () => {
    const withoutFiles = generated.filter((item) => item.id.startsWith('PAR-') && item.expected.files.length === 0).map((item) => item.id);
    expect(withoutFiles).toEqual(['PAR-29']);
  });
});

describe('the committed fixtures', () => {
  it('are byte for byte what pnpm synth --all generates, with no stale file beside them', () => {
    expect(driftFrom(syntheticRoot, generated, 'all')).toEqual({ changed: [], extra: [] });
  });

  it('generate the same bytes twice', () => {
    const again = findCase('PAR-27')?.generate();
    const first = generated.find((item) => item.id === 'PAR-27');
    expect(again?.files.map((file) => createHash('sha256').update(file.bytes).digest('hex'))).toEqual(first?.files.map((file) => createHash('sha256').update(file.bytes).digest('hex')));
  });

  it('record the hash and size of every file they list', () => {
    for (const item of generated) {
      for (const file of item.expected.files) {
        const bytes = item.files.find((candidate) => candidate.path === `${item.dir}/${file.path}`)?.bytes;
        expect(bytes, `${item.dir}/${file.path}`).toBeDefined();
        expect(createHash('sha256').update(bytes ?? new Uint8Array()).digest('hex')).toBe(file.sha256);
        expect(bytes?.length).toBe(file.bytes);
      }
    }
  });

  it('carry the synthetic sender in every interchange, zip entries included', () => {
    const interchanges = (bytes: Uint8Array): string[] => {
      const text = Buffer.from(bytes).toString('latin1').replace(/^ï»¿/, '');
      return text.startsWith('ISA') ? text.split(text[105] ?? '~').filter((segment) => /^\s*(ISA|GS)\W/.test(segment)) : [];
    };
    let checked = 0;
    for (const item of generated) {
      for (const file of item.files) {
        const buffers = file.path.endsWith('.zip') ? readZip(file.bytes).map((entry) => entry.bytes) : [file.bytes];
        for (const buffer of buffers) {
          for (const segment of interchanges(buffer)) {
            const trimmed = segment.trimStart();
            const element = trimmed[trimmed.startsWith('ISA') ? 3 : 2] ?? '*';
            const fields = trimmed.split(element);
            expect(fields[0] === 'ISA' ? fields[6] : fields[2], file.path).toBe(fields[0] === 'ISA' ? SYNTH_ISA06 : SYNTH_GS02);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('give the oracle at least fifty 835 fixtures, valid and malformed', () => {
    const files = x12Files(generated);
    const zipEntries = generated.flatMap((item) => item.expected.files.flatMap((file) => file.zip?.entries.filter((entry) => entry.oracle) ?? []));
    expect(files.length).toBeGreaterThanOrEqual(50);
    expect(files.filter((file) => file.x12.oracle.valid).length).toBeGreaterThanOrEqual(50);
    expect(files.filter((file) => !file.x12.oracle.valid).map((file) => `${file.case.dir}/${file.path}`)).toEqual([
      'PAR-23/range-472-rd8.835',
      'PAR-24/claim-status-277.835',
      'PAR-24/claim-837.835',
      'PAR-25/truncated.835',
      'PAR-26/remit.835',
      'variants/V05-plb-wo-several/remit.835',
      'variants/V35-invalid-structure-codes/cas01.835',
      'variants/V35-invalid-structure-codes/clp02.835',
      'variants/V35-invalid-structure-codes/plb03.835',
      'variants/V35-invalid-structure-codes/bpr04.835',
    ]);
    expect(zipEntries.length).toBe(501);
  });
});

describe('the expected outcomes', () => {
  it('summarize each 835 as its segments read, and agree with the model on every claim and line amount', () => {
    for (const item of generated) {
      for (const [file, document] of item.documents) {
        const expectation = item.expected.files.find((entry) => entry.path === file)?.x12;
        if (expectation?.oracle.summary) {
          expect(summarize835(document, expectation.oracle.summary.bom)).toEqual(expectation.oracle.summary);
        }
        const summaryClaims = (expectation?.oracle.summary?.interchanges ?? []).flatMap((interchange) => interchange.groups.flatMap((group) => group.transactions.flatMap((transaction) => transaction.claims)));
        const parsedClaims = (expectation?.parse.transactions ?? []).flatMap((transaction) => transaction.claims);
        expect(parsedClaims.map((claim) => [claim.patientControlNumber, claim.status, claim.chargeCents, claim.paidCents, claim.lines.map((line) => [line.chargeCents, line.paidCents, line.units])]), `${item.dir}/${file}`).toEqual(
          summaryClaims.map((claim) => [claim.clp01, claim.clp02, claim.chargeCents, claim.paidCents, claim.lines.map((line) => [line.chargeCents, line.paidCents, line.units])]),
        );
      }
    }
  });

  it('balance every well-formed file except the ones held on purpose', () => {
    const held = x12Files(generated)
      .filter((file) => file.x12.parse.transactions.some((transaction) => transaction.status === 'held'))
      .map((file) => `${file.case.dir}/${file.path}`);
    expect(held).toEqual([
      'PAR-20/unbalanced-transaction.835',
      'PAR-20/unbalanced-claim.835',
      'PAR-26/remit.835',
      'variants/V32-cas-six-adjustments/off-by-one-cent.835',
      'variants/V35-invalid-structure-codes/cas01.835',
      'variants/V35-invalid-structure-codes/clp02.835',
      'variants/V35-invalid-structure-codes/plb03.835',
      'variants/V35-invalid-structure-codes/bpr04.835',
    ]);
  });

  it('carry every CAS triple to the cent: six adjustments at claim and line level, and the sixth one cent off (V32)', () => {
    const v32 = generated.find((item) => item.id === 'V32')?.expected;
    const balanced = v32?.files.find((file) => file.path === 'balanced.835')?.x12?.parse.transactions[0];
    expect(balanced?.status).toBe('loaded');
    expect(balanced?.claims[0]?.adjustments.map((item) => [item.reason, item.amountCents, item.quantity])).toEqual([
      ['45', '2000', null],
      ['23', '600', '1'],
      ['1', '500', null],
      ['2', '400', '3'],
      ['3', '300', null],
      ['Z906', '200', '5'],
    ]);
    expect(balanced?.claims[1]?.lines[0]).toMatchObject({ patientShareCents: '4500', observedAllowed: { cents: '19500', basis: 'paid_plus_pr' } });
    expect(balanced?.unknownCodes.map((code) => [code.code, code.elementPosition])).toEqual([
      ['Z906', 17],
      ['Z907', 17],
    ]);
    const off = v32?.files.find((file) => file.path === 'off-by-one-cent.835')?.x12?.parse.transactions[0];
    expect(off?.heldReasons.map((reason) => [reason.scope, reason.segmentId, reason.differenceCents])).toEqual([
      ['claim', 'CLP', '-1'],
      ['claim', 'CLP', '-1'],
      ['line', 'SVC', '-1'],
    ]);
  });

  it('state PAR-20 differences and positions exactly', () => {
    const par20 = generated.find((item) => item.id === 'PAR-20')?.expected;
    const reasons = par20?.files.map((file) => file.x12?.parse.transactions[0]?.heldReasons);
    expect(reasons?.[0]).toEqual([expect.objectContaining({ code: 'EDI_UNBALANCED', scope: 'transaction', segmentId: 'BPR', elementPosition: 2, differenceCents: '-100', segmentIndex: 4 })]);
    expect(reasons?.[1]).toEqual([expect.objectContaining({ code: 'EDI_UNBALANCED', scope: 'claim', segmentId: 'CLP', elementPosition: 4, differenceCents: '-500' })]);
    expect(par20?.files.every((file) => file.x12?.parse.receipt.loaded.claims === 0)).toBe(true);
  });

  it('allocate claim-level patient responsibility in PAR-10 and flag it', () => {
    const lines = generated.find((item) => item.id === 'PAR-10')?.expected.files[0]?.x12?.parse.transactions[0]?.claims[0]?.lines;
    expect(lines?.map((line) => line.observedAllowed)).toEqual([
      { cents: '10934', basis: 'paid_plus_pr', allocatedFromClaim: true },
      { cents: '6066', basis: 'paid_plus_pr', allocatedFromClaim: true },
    ]);
  });

  it('use AMT B6 where PAR-12 sends it', () => {
    const lines = generated.find((item) => item.id === 'PAR-12')?.expected.files[0]?.x12?.parse.transactions[0]?.claims[0]?.lines;
    expect(lines?.map((line) => line.observedAllowed.basis)).toEqual(['amt_b6', 'amt_b6', 'paid_plus_pr']);
  });

  it('link PAR-08 reversal and correction to the original claim', () => {
    const claims = generated.find((item) => item.id === 'PAR-08')?.expected.files[1]?.x12?.parse.transactions[0]?.claims;
    expect(claims?.[0]).toMatchObject({ status: '22', reversalOf: { file: 'original.835', transaction: 0, claim: 0 } });
    expect(claims?.[1]).toMatchObject({ status: '1', supersedes: { file: 'original.835', transaction: 0, claim: 0 } });
  });

  it('list PAR-21 unknown codes on the receipt with their positions', () => {
    const parse = generated.find((item) => item.id === 'PAR-21')?.expected.files[0]?.x12?.parse;
    expect(parse?.receipt.unknownCodes).toEqual(['carc:Z999']);
    expect(parse?.transactions[0]?.unknownCodes).toEqual([expect.objectContaining({ list: 'carc', code: 'Z999', segmentId: 'CAS', elementPosition: 2 })]);
    expect(parse?.outcome).toBe('loaded');
  });

  it('parse PAR-04 and PAR-05 exactly as PAR-01', () => {
    const parseOf = (id: string) => generated.find((item) => item.id === id)?.expected.files[0]?.x12?.parse;
    expect(parseOf('PAR-04')).toEqual(parseOf('PAR-01'));
    expect(parseOf('PAR-05')).toEqual(parseOf('PAR-01'));
  });

  it('use only the SYNTHETIC release code lists for known codes', () => {
    const release = path.join(repository, 'fixtures/synthetic/rules/release-synth-900001');
    const codes = (file: string) =>
      readFileSync(path.join(release, file), 'utf8')
        .split('\n')
        .filter((text) => text.startsWith('{'))
        .map((text) => JSON.parse(text.replace(/,$/, '')) as { key: { code: string }; effective_to: string | null; value: { stop_date: string | null } })
        .filter((record) => record.value.stop_date === null)
        .map((record) => record.key.code)
        .sort();
    expect(codes('carc/2026/CARC_SYNTHETIC.json')).toEqual([...SYNTHETIC_CARCS].sort());
    expect(codes('rarc/2026/RARC_SYNTHETIC.json')).toEqual([...SYNTHETIC_RARCS].sort());
  });
});

describe('the 10,000-claim fixture (PAR-29)', () => {
  it('is generated at test time into an ignored path, with the size, hash and counts expected.json records', async () => {
    const expected = JSON.parse(readFileSync(path.join(syntheticRoot, 'PAR-29/expected.json'), 'utf8')) as CaseExpectation;
    const [generatedFile] = expected.generated;
    const facts = { ...(expected.scenario as { claims: number; paidCents: string }), ...(generatedFile ?? { sha256: '', bytes: 0, path: '' }) };
    expect(expected.generated).toHaveLength(1);
    expect(facts.claims).toBe(LARGE_CLAIMS);
    expect(facts.path).toBe(LARGE_FIXTURE_PATH);
    expect(generatedFile?.oracle.summarySha256).toMatch(/^[0-9a-f]{64}$/);
    const target = await writeLargeFixture(syntheticRoot, facts.sha256);
    const bytes = readFileSync(target);
    expect(bytes.length).toBe(facts.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(facts.sha256);
    expect(readFileSync(path.join(syntheticRoot, 'PAR-29/.gitignore'), 'utf8')).toBe('generated/\n');
    const text = bytes.toString('latin1');
    expect(text.split('~\nCLP*').length - 1).toBe(LARGE_CLAIMS);
    const bpr = [...text.matchAll(/~\nBPR\*[A-Z]\*(-?\d*\.\d{2})\*/g)].map((match) => parseAmount(match[1] ?? ''));
    expect(bpr).toHaveLength(20);
    expect(centsToString(sumCents(bpr))).toBe(facts.paidCents);
  }, 60_000);
});
