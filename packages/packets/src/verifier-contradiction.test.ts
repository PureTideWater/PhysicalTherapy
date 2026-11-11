import { describe, expect, it } from 'vitest';

import { assemblePacket } from './assemble';
import { FACT_CONTENTS } from './fact-contents.test-support';
import type { PacketContent } from './format';
import { totalCues } from './roles-reader/cues';
import { type Mismatch, NO_CASE_IDENTIFIERS, verifyTemplate } from './verifier';
import { standIn } from './verifier/contradiction';
import { assemblyInput, line } from './test-support';

/**
 * Pass 2 of verifier format /3 at its edges (design lane-b-packet-figure-placeholders, section 4; docs/adr/0089; test
 * matrix CAS-54): the stand-in each kind is read as, a token glued to the words beside it, a claim or a patient named
 * where the pattern has one or several, a cue that names two roles, and the total cues' one list. All data SYNTHETIC.
 */

const contradicted = (template: string, content: PacketContent) =>
  verifyTemplate(template, content, NO_CASE_IDENTIFIERS)
    .mismatches.filter((mismatch: Mismatch) => mismatch.code === 'fact_contradicted')
    .map((mismatch) => template.slice(mismatch.start, mismatch.end));

describe('the stand-ins', () => {
  it('reads each kind as a figure of its family with no word of its own', () => {
    expect(standIn('amount')).toBe('$1.00');
    expect(standIn('percent')).toBe('1%');
    expect(standIn('date')).toBe('2026-01-01');
    expect(standIn('date_span')).toBe('2026-01-01');
    for (const kind of ['count', 'units', 'days', 'page', 'version', 'release', 'level', 'year', 'code', 'modifiers', 'quote', 'reference'] as const) {
      expect(standIn(kind), kind).toBe('1');
    }
  });

  it('keeps a token glued to a word or a sign a figure of its own, so its role is still read', () => {
    const base = FACT_CONTENTS.base();
    for (const template of ['The remittances show-{{fact:pattern.allowed}} [1].', 'The remittances show/{{fact:pattern.allowed}}/here [1].', 'The remittances show {{fact:pattern.allowed}}’s value [1].']) {
      expect(contradicted(template, base), template).toEqual([]);
    }
    for (const template of ['The payer paid/{{fact:pattern.allowed}} [1].', 'The payer paid-{{fact:pattern.allowed}}-here [1].']) {
      expect(contradicted(template, base), template).toEqual(['{{fact:pattern.allowed}}']);
    }
  });

  it('reads a date, a percentage and a number in their own cues’ roles', () => {
    const several = FACT_CONTENTS.severalCodes();
    expect(contradicted('The payer paid on {{fact:pattern.service_dates}} [1].', several)).toEqual(['{{fact:pattern.service_dates}}']);
    expect(contradicted('The services were on {{fact:pattern.service_dates}} [1].', several)).toEqual([]);
    expect(contradicted('Interest runs at {{fact:interest.rate}} [4].', several)).toEqual([]);
    expect(contradicted('The schedule names page {{fact:pattern.lines}} [1].', several)).toEqual(['{{fact:pattern.lines}}']);
    expect(contradicted('The schedule names {{fact:pattern.lines}} [1].', several)).toEqual([]);
  });
});

describe('what names a part beside an all-lines fact', () => {
  it('reads a claim or a patient as a part only where the pattern has more than one', () => {
    const one = FACT_CONTENTS.oneLine();
    const many = FACT_CONTENTS.base();
    for (const template of ['For the claim the payer owes {{fact:pattern.variance}} [1].', 'For each claim the payer owes {{fact:pattern.variance}} [1].', 'For the patient, the payer owes {{fact:pattern.variance}} [1].', 'For each patient, the payer owes {{fact:pattern.variance}} [1].']) {
      expect(contradicted(template, one), template).toEqual([]);
      expect(contradicted(template, many), template).toEqual(['{{fact:pattern.variance}}']);
    }
  });

  it('reads a claim or a patient as a part from exactly two of them: the boundary of “more than one”', () => {
    const variance = ['{{fact:pattern.variance}}'];
    // Two claims (rows 1 and 2 of one claim), three patients.
    const twoClaims = FACT_CONTENTS.oneCode();
    for (const template of ['For the claim the payer owes {{fact:pattern.variance}} [1].', 'For each claim the payer owes {{fact:pattern.variance}} [1].']) {
      expect(contradicted(template, twoClaims), template).toEqual(variance);
    }
    // Two patients (rows 1 and 2 of one patient), three claims. SYNTHETIC keys.
    const patient = (n: number) => `40000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
    const twoPatients = assemblePacket(assemblyInput({ lines: [line(1, { patientKey: patient(1) }), line(2, { patientKey: patient(1) }), line(3, { patientKey: patient(3) })] }));
    expect(twoPatients.pattern.patients).toBe(2);
    expect(twoPatients.pattern.claims).toBe(3);
    for (const template of ['For the patient, the payer owes {{fact:pattern.variance}} [1].', 'For each patient, the payer owes {{fact:pattern.variance}} [1].']) {
      expect(contradicted(template, twoPatients), template).toEqual(variance);
    }
    // One patient over two claims: a claim is a part, the patient is not.
    const onePatient = assemblePacket(assemblyInput({ lines: [line(1, { patientKey: patient(1) }), line(2, { patientKey: patient(1) })] }));
    expect(onePatient.pattern.patients).toBe(1);
    expect(contradicted('For the patient, the payer owes {{fact:pattern.variance}} [1].', onePatient)).toEqual([]);
    expect(contradicted('For the claim the payer owes {{fact:pattern.variance}} [1].', onePatient)).toEqual(variance);
  });

  it('reads "one of" and a stray scope phrase as a part, and every line or "in total" as none', () => {
    const many = FACT_CONTENTS.base();
    expect(contradicted('For one of them the payer owes {{fact:pattern.variance}} [1].', many)).toEqual(['{{fact:pattern.variance}}']);
    expect(contradicted('On each line the payer owes {{fact:pattern.variance}} [1].', many)).toEqual(['{{fact:pattern.variance}}']);
    expect(contradicted('Across all the lines the payer owes {{fact:pattern.variance}} [1].', many)).toEqual([]);
    expect(contradicted('The payer owes {{fact:pattern.variance}} in total [1].', many)).toEqual([]);
  });

  it('judges each sentence on its own: a part named in one sentence leaves the next one’s total alone', () => {
    const several = FACT_CONTENTS.severalCodes();
    const template = 'For {{fact:code.97110}}, the payer owes {{fact:code.97110.variance}} [1]. In all, the payer owes {{fact:pattern.variance}} [1].';
    expect(contradicted(template, several)).toEqual([]);
    const swapped = 'For {{fact:code.97110}}, the payer owes {{fact:pattern.variance}} [1]. In all, the payer owes {{fact:code.97110.variance}} [1].';
    expect(contradicted(swapped, several)).toEqual(['{{fact:pattern.variance}}', '{{fact:code.97110.variance}}']);
  });

  it('fails a figure a cue holds in several roles at once, and a "respectively" list in neither plain form', () => {
    const several = FACT_CONTENTS.severalCodes();
    expect(contradicted('The contract requires more than the payer paid: {{fact:pattern.expected}} [1].', several)).toEqual(['{{fact:pattern.expected}}']);
    expect(contradicted('Respectively, {{fact:pattern.expected}} and {{fact:pattern.allowed}} were due [1].', several)).toEqual(['{{fact:pattern.expected}}', '{{fact:pattern.allowed}}']);
    expect(contradicted('The contract expected and the payer allowed {{fact:pattern.expected}} and {{fact:pattern.allowed}}, respectively [1].', several)).toEqual([]);
  });

  it('leaves alone a token with no role, and a total cue beside a fact that is not a part’s amount, units or count', () => {
    const several = FACT_CONTENTS.severalCodes();
    expect(contradicted('The payer paid {{fact:citation.quote}} [1].', several)).toEqual([]);
    expect(contradicted('In total, {{fact:code.97110}} is cited [1].', several)).toEqual([]);
    expect(contradicted('In total, the services were on {{fact:code.97110.service_dates}} [1].', several)).toEqual([]);
  });
});

describe('the total cues', () => {
  it('are the closed list’s total phrases, total words, each line and all the rows, as lower-case words', () => {
    const cues = totalCues();
    for (const cue of ['in total', 'in all', 'total', 'totals', 'altogether', 'overall', 'each line', 'every line', 'every visit', 'all the lines', 'all lines', 'all of the claims', 'all these services', 'across the lines', 'across these rows']) {
      expect(cues, cue).toContain(cue);
    }
    expect(cues.every((cue) => cue === cue.toLowerCase() && !/\s{2}/.test(cue))).toBe(true);
    expect(new Set(cues).size).toBe(cues.length);
  });
});

describe('which facts each direction holds to', () => {
  const several = FACT_CONTENTS.severalCodes();

  it('holds only the pattern’s totals as all-lines facts: each line’s equal value and interest are not', () => {
    const base = FACT_CONTENTS.base();
    expect(contradicted('On the remaining lines the remittances show {{fact:pattern.allowed_each}} [1].', base)).toEqual([]);
    expect(contradicted('On the remaining lines the remittances show {{fact:pattern.allowed}} [1].', base)).toEqual(['{{fact:pattern.allowed}}']);
    expect(contradicted('For {{fact:code.97110}}, this packet states {{fact:interest.total}} [4].', several)).toEqual([]);
    expect(contradicted('The payer owes {{fact:pattern.variance}} per unit [1].', several)).toEqual(['{{fact:pattern.variance}}']);
  });

  it('reads a total cue at the text’s very end', () => {
    expect(contradicted('The payer owes {{fact:code.97110.variance}} [1], every', several)).toEqual([]);
    expect(contradicted('The payer owes {{fact:code.97110.variance}} [1], in', several)).toEqual([]);
    expect(contradicted('The payer owes {{fact:code.97110.variance}} [1], in total', several)).toEqual(['{{fact:code.97110.variance}}']);
  });

  it('holds a token with no role to nothing, whatever its words name', () => {
    expect(contradicted('The schedule names page {{fact:citation.quote}} [1].', several)).toEqual([]);
    expect(contradicted('The schedule names page {{fact:code.97110}} [1].', several)).toEqual([]);
  });

  it('reads a percentage’s and a date’s stand-in in its own family’s cues', () => {
    const percent = FACT_CONTENTS.percent();
    expect(contradicted('The payer paid on {{fact:contract.percent.1}} [1].', percent)).toEqual([]);
    expect(contradicted('The payer paid on {{fact:packet.as_of}} [1].', several)).toEqual(['{{fact:packet.as_of}}']);
    expect(contradicted('The schedule names {{fact:packet.as_of}} [1].', several)).toEqual([]);
  });

  it('keeps a stand-in apart from a figure glued to its token, so the figure is pass 1’s alone', () => {
    expect(contradicted('The schedule names {{fact:pattern.lines}}.5 here [1].', several)).toEqual([]);
    expect(contradicted('The remittances show {{fact:pattern.allowed}}.5 here [1].', several)).toEqual([]);
  });
});

describe('a stand-in the words beside it do not leave a figure of its own', () => {
  it('fails the token closed: a sign glued to it makes the stand-in part of another figure', () => {
    const several = FACT_CONTENTS.severalCodes();
    expect(contradicted('The schedule names {{fact:pattern.lines}}% here [1].', several)).toEqual(['{{fact:pattern.lines}}']);
    expect(contradicted('The schedule names {{fact:code.97110.lines}}% here [1].', several)).toEqual(['{{fact:code.97110.lines}}']);
  });

  it('fails the token closed, and returns a report, when the stand-in is read from a sign before it ("$ 1")', () => {
    const base = FACT_CONTENTS.base();
    for (const [template, token] of [
      ['The schedule has ${{fact:pattern.lines}} [1].', '{{fact:pattern.lines}}'],
      ['The payer was billed for ${{fact:pattern.units}} [1].', '{{fact:pattern.units}}'],
      ['The payer was billed for US${{fact:pattern.units}} [1].', '{{fact:pattern.units}}'],
    ] as const) {
      const report = verifyTemplate(template, base, NO_CASE_IDENTIFIERS);
      expect(report.passed, template).toBe(false);
      expect(contradicted(template, base), template).toEqual([token]);
      expect(report.mismatches.map((mismatch) => mismatch.code), template).toContain('free_figure');
    }
  });

  it('fails a figure held in two roles of which neither is the fact’s', () => {
    expect(contradicted('The shortfall is more than the payer paid: {{fact:pattern.allowed}} [1].', FACT_CONTENTS.severalCodes())).toEqual(['{{fact:pattern.allowed}}']);
  });
});
