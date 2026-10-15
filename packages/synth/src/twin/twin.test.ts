import { describe, expect, it } from 'vitest';

import { dayNumber, parseCalendarDate } from '../core/dates';
import { generateAll } from '../cases/registry';
import { SYNTH_ISA06 } from '../identity';
import { DEFAULT_DELIMITERS, type X12Document, documentSegments, elementValue, renderDocument, seg } from '../x12/segments';
import { type OracleSummary, summarize835 } from '../x12/summary';
import { TwinBoundary, TwinBoundaryError } from './boundary';
import { TwinSession, generateTwin } from './twin';

const cases = generateAll();
const documents = cases.flatMap((item) => [...item.documents.entries()].map(([file, document]) => ({ name: `${item.dir}/${file}`, document })));

function shape(document: X12Document): unknown {
  return document.interchanges.map((interchange) => [interchange.delimiters, interchange.segments.map((segment) => [segment.id, segment.elements.map((element) => element.length)])]);
}

function balances(summary: OracleSummary): unknown {
  return summary.interchanges.flatMap((interchange) =>
    interchange.groups.flatMap((group) =>
      group.transactions.map((transaction) => [
        transaction.balance.differenceCents,
        transaction.balance.balanced,
        transaction.balance.claimsBalanced,
        transaction.claims.map((claim) => [claim.balance, claim.lines.map((line) => line.differenceCents)]),
      ]),
    ),
  );
}

/** Replaces the synthetic sender in memory, to stand in for a production file. Never written. */
function asIfReal(document: X12Document): X12Document {
  return {
    interchanges: document.interchanges.map((interchange) => ({
      ...interchange,
      segments: interchange.segments.map((segment) =>
        segment.id === 'ISA' ? { ...segment, elements: segment.elements.map((element, index) => (index === 5 ? ['OTHERSENDER    '] : element)) } : segment.id === 'GS' ? { ...segment, elements: segment.elements.map((element, index) => (index === 1 ? ['OTHERAPP'] : element)) } : segment,
      ),
    })),
  };
}

const PRODUCTION = { NODE_ENV: 'production', TP_ENVIRONMENT: 'production' };

describe('the twin boundary', () => {
  it('opens on real input only in production', () => {
    expect(() => TwinBoundary.production({})).toThrow(TwinBoundaryError);
    expect(() => TwinBoundary.production({ NODE_ENV: 'production' })).toThrow(TwinBoundaryError);
    expect(() => TwinBoundary.production({ NODE_ENV: 'production', TP_ENVIRONMENT: 'staging' })).toThrow(TwinBoundaryError);
    expect(() => TwinBoundary.production({ NODE_ENV: 'development', TP_ENVIRONMENT: 'production' })).toThrow(TwinBoundaryError);
    expect(TwinBoundary.production(PRODUCTION).kind).toBe('production');
  });

  it('outside production accepts only input that is already synthetic', () => {
    const [first] = documents;
    if (!first) {
      throw new Error('no fixtures');
    }
    const outside = TwinBoundary.syntheticInputOnly();
    expect(() => outside.admit(first.document)).not.toThrow();
    expect(() => generateTwin(asIfReal(first.document), { boundary: outside, seed: 's' })).toThrow(/ISA06 SYNTHSENDER/);
    const gsOnly = { interchanges: first.document.interchanges.map((interchange) => ({ ...interchange, segments: interchange.segments.map((segment) => (segment.id === 'GS' ? { ...segment, elements: segment.elements.map((element, index) => (index === 1 ? ['OTHERAPP'] : element)) } : segment)) })) };
    expect(() => outside.admit(gsOnly)).toThrow(/GS02 SYNTH/);
  });
});

describe('the twin generator', () => {
  it('keeps every fixture structurally identical and balanced exactly as the original was', () => {
    expect(documents.length).toBeGreaterThan(100);
    for (const { name, document } of documents) {
      const twin = generateTwin(document, { boundary: TwinBoundary.syntheticInputOnly(), seed: 'balance' });
      expect(shape(twin), name).toEqual(shape(document));
      expect(balances(summarize835(twin)), name).toEqual(balances(summarize835(document)));
    }
  });

  it('rewrites the sender, shifts every date by one offset, and replaces names and identifiers', () => {
    const source = documents.find((item) => item.name === 'variants/V26-every-segment/remit.835')?.document;
    if (!source) {
      throw new Error('missing V26');
    }
    const real = asIfReal(source);
    const twin = generateTwin(real, { boundary: TwinBoundary.production(PRODUCTION), seed: 'rewrite' });
    const before = [...documentSegments(real)].map(({ segment }) => segment);
    const after = [...documentSegments(twin)].map(({ segment }) => segment);
    expect(elementValue(after[0] ?? seg('ISA'), 6)).toBe(SYNTH_ISA06);
    expect(elementValue(after[1] ?? seg('GS'), 2)).toBe('SYNTH');
    const shifts = new Set<number>();
    before.forEach((segment, index) => {
      const other = after[index];
      if (segment.id === 'DTM' && other) {
        const iso = (text: string) => parseCalendarDate(`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`);
        shifts.add(dayNumber(iso(elementValue(other, 2))) - dayNumber(iso(elementValue(segment, 2))));
      }
    });
    expect(shifts.size).toBe(1);
    const [shift] = [...shifts];
    expect(shift).toBeLessThan(-60);
    const originalText = renderDocument(real);
    const twinText = renderDocument(twin);
    for (const value of ['SYNPCNV26001', 'SYNCCNV260001', 'SYNTHINSURED', 'SYNTHCORRECTED', 'SYNPAYERS', 'SYNEFTV26001', 'SYNTHETIC PAYER S', 'SYNGROUP01', 'SYNMBR00000099']) {
      expect(originalText).toContain(value);
      expect(twinText).not.toContain(value);
    }
    expect(twinText).not.toBe(originalText);
  });

  it('keeps links between files: a reversal names the twin of the claim it reverses', () => {
    const par08 = cases.find((item) => item.id === 'PAR-08');
    const session = new TwinSession({ boundary: TwinBoundary.syntheticInputOnly(), seed: 'links' });
    const original = session.twin(par08?.documents.get('original.835') ?? { interchanges: [] });
    const correction = session.twin(par08?.documents.get('correction.835') ?? { interchanges: [] });
    const claims = (document: X12Document) => [...documentSegments(document)].filter(({ segment }) => segment.id === 'CLP').map(({ segment }) => segment);
    const [paid] = claims(original);
    const [reversal, corrected] = claims(correction);
    expect(elementValue(reversal ?? seg('CLP'), 7)).toBe(elementValue(paid ?? seg('CLP'), 7));
    expect(elementValue(reversal ?? seg('CLP'), 1)).toBe(elementValue(paid ?? seg('CLP'), 1));
    expect(elementValue(reversal ?? seg('CLP'), 4)).toBe(`-${elementValue(paid ?? seg('CLP'), 4)}`);
    const f8 = [...documentSegments(correction)].find(({ segment }) => segment.id === 'REF' && elementValue(segment, 1) === 'F8');
    expect(f8 && elementValue(f8.segment, 2)).toBe(elementValue(paid ?? seg('CLP'), 7));
    expect(corrected).toBeDefined();
  });

  it('perturbs amounts, keeps a zero check at zero, and is deterministic for a seed', () => {
    const zero = documents.find((item) => item.name === 'PAR-19/zero-check.835')?.document;
    if (!zero) {
      throw new Error('missing PAR-19');
    }
    const one = generateTwin(zero, { boundary: TwinBoundary.syntheticInputOnly(), seed: 'same' });
    const two = generateTwin(zero, { boundary: TwinBoundary.syntheticInputOnly(), seed: 'same' });
    const other = generateTwin(zero, { boundary: TwinBoundary.syntheticInputOnly(), seed: 'other' });
    expect(renderDocument(one)).toBe(renderDocument(two));
    expect(renderDocument(other)).not.toBe(renderDocument(one));
    const transaction = summarize835(one).interchanges[0]?.groups[0]?.transactions[0];
    const original = summarize835(zero).interchanges[0]?.groups[0]?.transactions[0];
    expect(transaction?.bpr.amountCents).toBe('0');
    expect(transaction?.balance.balanced).toBe(true);
    expect(transaction?.balance.claimsPaidCents).not.toBe(original?.balance.claimsPaidCents);
    expect(generateTwin(zero, { boundary: TwinBoundary.syntheticInputOnly() })).toBeDefined();
  });

  it('replaces every element of a segment it does not know', () => {
    const [first] = documents;
    const interchange = first?.document.interchanges[0];
    if (!interchange) {
      throw new Error('no fixtures');
    }
    const segments = [...interchange.segments];
    segments.splice(3, 0, seg('ZZZ', 'ABC123', ['X9', 'Y8']));
    const twin = generateTwin({ interchanges: [{ delimiters: DEFAULT_DELIMITERS, segments }] }, { boundary: TwinBoundary.syntheticInputOnly(), seed: 'unknown' });
    const unknown = twin.interchanges[0]?.segments[3];
    expect(unknown?.id).toBe('ZZZ');
    expect(unknown?.elements[0]?.[0]).toMatch(/^[A-Z]{3}\d{3}$/);
    expect(unknown?.elements[0]?.[0]).not.toBe('ABC123');
    expect(unknown?.elements[1]).not.toEqual(['X9', 'Y8']);
  });
});
