import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parse835, type Procedure } from '@tp/edi835';
import { SYNTHETIC_BODY, releaseDirectoryCodeLists, syntheticInterchange } from '@tp/edi835/testing';
import { describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';
import { type OracleResult } from './compare';
import { parserDisagreements, parserSummary, procedureText } from './parser';

const codeLists = releaseDirectoryCodeLists();
const synthetic = path.join(repositoryRoot, 'fixtures', 'synthetic');

function fixture(relative: string) {
  const expected = JSON.parse(readFileSync(path.join(synthetic, path.dirname(relative), 'expected.json'), 'utf8')) as {
    files: { path: string; x12: { oracle: { valid: boolean; rejections: string[]; summary: unknown }; parse: { outcome: string } } }[];
  };
  const file = expected.files.find((item) => item.path === path.basename(relative));
  if (file === undefined) {
    throw new Error(`${relative} is not declared`);
  }
  const pyx12: OracleResult = { file: relative, valid: file.x12.oracle.valid, rejections: file.x12.oracle.rejections, errors: [], summary: file.x12.oracle.summary, summarySha256: null };
  return { pyx12, parseOutcome: file.x12.parse.outcome, result: parse835(readFileSync(path.join(synthetic, relative)), { codeLists }) };
}

describe("the parser's summary", () => {
  it('equals what pyx12 read, for a valid file, a file with every segment, and a file pyx12 rejects but reads', () => {
    for (const relative of ['PAR-01/remit.835', 'variants/V26-every-segment/remit.835', 'PAR-26/remit.835', 'PAR-05/remit.835', 'PAR-03/remit.835']) {
      const { pyx12, result } = fixture(relative);
      expect(parserSummary(result), relative).toEqual(pyx12.summary);
    }
  });

  it('is null when the parser could not read a whole 835', () => {
    expect(parserSummary(fixture('PAR-24/claim-837.835').result)).toBeNull();
    const noTrace = syntheticInterchange([SYNTHETIC_BODY.filter((segment) => !segment.startsWith('TRN'))]);
    expect(parserSummary(parse835(Buffer.from(noTrace), { codeLists }))).toBeNull();
  });

  it('writes a procedure as its components, padding the modifiers before a description', () => {
    const procedure = (modifiers: string[], description: string | null): Procedure => ({ qualifier: 'HC', code: '97110', modifiers, description });
    expect(procedureText(procedure(['GP'], null))).toBe('HC:97110:GP');
    expect(procedureText(procedure([], 'SYNTHETIC'))).toBe('HC:97110:::::SYNTHETIC');
    expect(procedureText(procedure(['GP', '59', 'KX', 'CQ'], 'SYNTHETIC'))).toBe('HC:97110:GP:59:KX:CQ:SYNTHETIC');
  });
});

describe('disagreements between the parser and pyx12', () => {
  it('finds none where they agree, including the files pyx12 rejects for the reasons the parser holds them', () => {
    for (const relative of ['PAR-01/remit.835', 'PAR-20/unbalanced-claim.835', 'PAR-24/claim-status-277.835', 'PAR-25/truncated.835', 'PAR-26/remit.835', 'PAR-23/range-472-rd8.835', 'variants/V05-plb-wo-several/remit.835']) {
      const { pyx12, parseOutcome, result } = fixture(relative);
      expect(parserDisagreements({ spec: relative, parseOutcome }, pyx12, result), relative).toEqual([]);
    }
  });

  it('names every difference in the summaries, to the cent', () => {
    const { pyx12, result } = fixture('PAR-01/remit.835');
    const summary = JSON.parse(JSON.stringify(pyx12.summary)) as { interchanges: { groups: { transactions: { bpr: { amountCents: string } }[] }[] }[] };
    const bpr = summary.interchanges[0]?.groups[0]?.transactions[0]?.bpr as { amountCents: string };
    bpr.amountCents = '8801';
    expect(parserDisagreements({ spec: 'PAR-01/remit.835' }, { ...pyx12, summary }, result)).toEqual(['PAR-01/remit.835: pyx12 and the parser differ at /interchanges[0]/groups[0]/transactions[0]/bpr/amountCents: expected "8801", found "8800"']);
  });

  it('fails a file only one of them could read', () => {
    const valid = fixture('PAR-01/remit.835');
    const notAn835 = fixture('PAR-24/claim-837.835');
    expect(parserDisagreements({ spec: 'x' }, { ...valid.pyx12, summary: null }, valid.result)).toEqual(['x: the parser read a whole 835 where pyx12 could not']);
    expect(parserDisagreements({ spec: 'x' }, { ...notAn835.pyx12, valid: false, rejections: ['not_835'], summary: valid.pyx12.summary }, notAn835.result)[0]).toMatch(/^x: pyx12 read a whole 835 where the parser could not \(EDI_NOT_835/);
    const noTrace = parse835(Buffer.from(syntheticInterchange([SYNTHETIC_BODY.filter((segment) => !segment.startsWith('TRN'))])), { codeLists });
    expect(parserDisagreements({ spec: 'x' }, { ...valid.pyx12, valid: false, rejections: ['segment'] }, noTrace)).toEqual(['x: pyx12 read a whole 835 where the parser could not (a transaction is missing BPR, TRN or a party)']);
  });

  it('fails a structural hold on a file pyx12 accepts, and a rejection the parser does not match', () => {
    const control = fixture('PAR-26/remit.835');
    expect(parserDisagreements({ spec: 'x' }, { ...control.pyx12, valid: true, rejections: [] }, control.result)[0]).toMatch(/^x: pyx12 accepts it and the parser holds it: EDI_CONTROL_MISMATCH at segment 41/);
    const valid = fixture('PAR-01/remit.835');
    expect(parserDisagreements({ spec: 'x' }, { ...valid.pyx12, valid: false, rejections: ['control_count', 'missing_segment', 'not_835', 'element'] }, valid.result)).toEqual([
      'x: pyx12 reports control_count and the parser found nothing of the kind',
      'x: pyx12 reports missing_segment and the parser found nothing of the kind',
      'x: pyx12 reports not_835 and the parser found nothing of the kind',
      'x: pyx12 rejects it (control_count, missing_segment, not_835, element) and the parser holds nothing, and the fixture does not say the parser reads it',
    ]);
    expect(parserDisagreements({ spec: 'x', parseOutcome: 'loaded' }, { ...valid.pyx12, valid: false, rejections: ['element'] }, valid.result)).toEqual([]);
    expect(parserDisagreements({ spec: 'x', parseOutcome: 'held' }, valid.pyx12, valid.result)).toEqual(['x: the fixture expects the parse outcome held, the parser\'s is loaded']);
  });
});
