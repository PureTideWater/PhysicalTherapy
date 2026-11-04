import { describe, expect, it } from 'vitest';

import { FIGURE_ROLES, type FigureReading, SCOPES, functionWords, quotedHolds, quotedText, quotedTokens, readFigures } from './roles';

/**
 * The role reader alone (./roles.ts; docs/adr/0086): each label, noun, cue and word it reads a figure's role from, the
 * partitive, the ordinals, the years, the five-digit and two-decimal figures, and the words a quoted figure is
 * repeated with. Each word of each list is named here, so a word left out of the reader fails a test.
 */

/** The figure written as `written` in `text`, read: its kind and its roles (any of them, `any` or `none`). */
function reading(text: string, written: string) {
  const found = readFigures(text).readings.find((item) => text.slice(item.figure.start, item.figure.end) === written);
  if (found === undefined) {
    throw new Error(`no figure ${written} in ${text}`);
  }
  return found;
}
const roles = (text: string, written: string) => {
  const found = reading(text, written).roles;
  return Array.isArray(found) ? found.join(' ') : found;
};
const kind = (text: string, written: string) => reading(text, written).kind;

describe('the roles', () => {
  it('are a closed list, each named once', () => {
    expect(new Set(FIGURE_ROLES).size).toBe(FIGURE_ROLES.length);
    expect(FIGURE_ROLES).toHaveLength(33);
    expect(SCOPES).toEqual(['line', 'unit', 'total']);
  });
});

describe('a label before a number', () => {
  it('gives the number the label’s role', () => {
    for (const [label, role] of [
      ['version', 'version'],
      ['v.', 'version'],
      ['release', 'release'],
      ['releases', 'release'],
      ['level', 'level'],
      ['levels', 'level'],
      ['appeal', 'level'],
      ['tier', 'level'],
      ['x', 'line_units'],
      ['×', 'line_units'],
      ['page', 'citation_page window_page'],
      ['pages', 'citation_page window_page'],
      ['p.', 'citation_page window_page'],
      ['pp.', 'citation_page window_page'],
    ] as const) {
      expect(roles(`See ${label} 7 here.`, '7'), label).toBe(role);
    }
    expect(roles('Three claims billed 97110 x2 [3].', 'x2')).toBe('line_units');
    expect(reading('Three claims billed 97110 x2 [3].', 'x2')).toMatchObject({ business: false, code: '' });
    // No label, no role.
    expect(roles('See 7 here.', '7')).toBe('none');
  });

  it('reads past "no.", "nos." and "number" between the label and its number', () => {
    for (const filler of ['no.', 'nos.', 'number']) {
      expect(roles(`See release ${filler} 900001 here.`, '900001'), filler).toBe('release');
    }
    expect(roles('See release zz 900001 here.', '900001')).toBe('none');
  });

  it('reads which page from the words around it: the dispute window’s or the clause’s, one of them, never both', () => {
    for (const cue of ['window', 'dispute', 'disputes', 'appeal', 'appeals', 'deadline', 'timely']) {
      expect(roles(`The ${cue} is on page 7.`, '7'), cue).toBe('window_page');
    }
    for (const cue of ['rate', 'rates', 'schedule', 'citation', 'amount', 'method', 'pays']) {
      expect(roles(`The ${cue} is on page 7.`, '7'), cue).toBe('citation_page');
    }
    // A clause, a quote, a section or what is cited may be either, and a word beside it says which (PE-4).
    for (const cue of ['clause', 'cited', 'quote', 'quoted', 'section']) {
      expect(roles(`The ${cue} is on page 7.`, '7'), cue).toBe('citation_page window_page');
    }
    expect(roles('The dispute window clause is on page 7.', '7')).toBe('window_page');
    expect(roles('The rate clause is on page 7.', '7')).toBe('citation_page');
    expect(roles('The window and the clause are on page 7.', '7')).toBe('window_page');
    expect(roles('The dispute window is cited on page 7.', '7')).toBe('window_page');
    // Words that name both: either one, not both at once.
    expect(roles('The window and the rate are on page 7.', '7')).toBe('citation_page window_page');
    // After the page too, up to the next figure or edge.
    expect(roles('Page 7 holds the window.', '7')).toBe('window_page');
    expect(roles('The window is cited, see page 7.', '7')).toBe('citation_page window_page');
  });

  it('reads a row’s noun before its number as that row', () => {
    for (const [label, role] of [
      ['line', 'row'],
      ['lines', 'row'],
      ['row', 'row'],
      ['rows', 'row'],
      ['claim', 'claim_row'],
      ['claims', 'claim_row'],
      ['patient', 'patient_row'],
      ['patients', 'patient_row'],
    ] as const) {
      expect(roles(`See ${label} 2 here.`, '2'), label).toBe(role);
    }
    // A five-digit figure after a row's noun is the line's code, never a row.
    expect(kind('Each service line 97110 was short.', '97110')).toBe('code');
  });

  it('reads a count’s noun up to three words before a colon', () => {
    expect(roles('Units: 2 per line.', '2')).toBe('line_units');
    expect(roles('Claims billed: 3.', '3')).toBe('claims');
    expect(roles('Patients seen in: 3.', '3')).toBe('patients');
    expect(roles('Lines that were seen: 3.', '3')).toBe('none');
    expect(roles('Seen: 3.', '3')).toBe('none');
    expect(kind('Lines: 97110.', '97110')).toBe('code');
  });

  it('keeps a label’s role for a list after it, joined by a comma, and, or, to, through, thru or plus', () => {
    for (const joiner of [',', ' and', ' or', ' to', ' through', ' thru', ' plus', ', and']) {
      expect(roles(`See pages 1${joiner} 2 here.`, '2'), joiner).toBe('citation_page window_page');
    }
    expect(roles('Lines 1 to 3 were short.', '3')).toBe('row');
    expect(roles('In 2026 and 2027 the payer paid.', '2027')).toBe('any');
    expect(kind('In 2026 and 2027 the payer paid.', '2027')).toBe('year');
    // Across a comma alone, after a plural label only.
    for (const [label, role] of [
      ['pages', 'citation_page window_page'],
      ['pp.', 'citation_page window_page'],
      ['releases', 'release'],
      ['levels', 'level'],
      ['lines', 'row'],
      ['rows', 'row'],
      ['claims', 'claim_row'],
      ['patients', 'patient_row'],
    ] as const) {
      expect(roles(`See ${label} 1, 2 here.`, '2'), label).toBe(role);
    }
    expect(roles('See release 1, 2 here.', '2')).toBe('none');
    // Any other word between ends the list, and a figure right after another is no list.
    expect(roles('See pages 1 then 2 here.', '2')).toBe('none');
    expect(roles('See thirty (30) here.', '30')).toBe('none');
    // A number with no label keeps nothing.
    expect(roles('See 1 and 2 here.', '2')).toBe('none');
  });
});

describe('words after a number', () => {
  it('read a day count, with calendar, business or working between, joined, or in words with its digits', () => {
    for (const [text, written] of [
      ['It is 9 days.', '9'],
      ['It is 9 day.', '9'],
      ['It is 9 calendar days.', '9'],
      ['It is a 9-day term.', '9'],
      ['It is nine (9) days.', 'nine'],
      ['It is nine (9) days.', '9'],
    ] as const) {
      expect(roles(text, written), text).toBe('window_days days_to_pay days_late');
      expect(reading(text, written).business, text).toBe(false);
    }
    for (const text of ['It is 9 business days.', 'It is 9 working days.']) {
      expect(reading(text, '9').business, text).toBe(true);
    }
    // The word must follow at once.
    expect(roles('It billed 9 units in the days after.', '9')).toBe('units');
    expect(roles('It is nine (8) days.', 'nine')).toBe('none');
  });

  it('read which day count from the words around it', () => {
    for (const cue of [
      'within',
      'window',
      'dispute',
      'disputes',
      'disputed',
      'appeal',
      'appeals',
      'appealed',
      'file',
      'filed',
      'filing',
      'raise',
      'raised',
      'submit',
      'submitted',
      'deadline',
      'respond',
      'timely',
      'reconsideration',
      'redetermination',
    ]) {
      expect(roles(`The ${cue} is 9 days.`, '9'), cue).toBe('window_days');
    }
    for (const cue of ['to pay', 'pay within', 'prompt pay', 'prompt-pay', 'clean']) {
      expect(roles(`The ${cue} is 9 days.`, '9'), cue).toBe('days_to_pay');
    }
    for (const cue of [
      'late',
      'overdue',
      'past due',
      'unpaid',
      'accrue',
      'accrues',
      'accrued',
      'accruing',
      'interest',
      'between',
      'elapsed',
      'delay',
      'delayed',
    ]) {
      expect(roles(`The ${cue} is 9 days.`, '9'), cue).toBe('days_late');
    }
    // After the count too; "pay within" is one cue, never "within" as well.
    expect(roles('The payer had 9 days to pay.', '9')).toBe('days_to_pay');
    expect(roles('The payer must pay within 9 days.', '9')).toBe('days_to_pay');
    expect(roles('Disputes are raised within 9 days, late or not.', '9')).toBe('window_days');
    expect(roles('It was due, and 9 days late.', '9')).toBe('days_late');
  });

  it('read a dispute level after a number', () => {
    for (const [text, written] of [
      ['A 2 level appeal.', '2'],
      ['Two levels up.', 'Two'],
      ['A second-level appeal.', 'second'],
      ['The 2 appeal.', '2'],
    ] as const) {
      expect(roles(text, written), text).toBe('level');
    }
    expect(roles('A first-level appeal.', 'first')).toBe('level');
    // An ordinal before "appeal" is prose: "the second appeal" (CORR-8).
    expect(reading('Its second appeals.', 'second')).toMatchObject({ roles: 'none', prose: true });
    expect(reading('This is the second appeal.', 'second')).toMatchObject({ roles: 'none', prose: true });
  });

  it('read a count’s noun at once, after a code or digits, or after one word that keeps it the count', () => {
    for (const [noun, role] of [
      ['line', 'lines'],
      ['lines', 'lines'],
      ['row', 'lines'],
      ['rows', 'lines'],
      ['service', 'lines'],
      ['services', 'lines'],
      ['procedure', 'lines'],
      ['procedures', 'lines'],
      ['claim', 'claims'],
      ['claims', 'claims'],
      ['patient', 'patients'],
      ['patients', 'patients'],
      ['member', 'patients'],
      ['members', 'patients'],
      ['unit', 'units'],
      ['units', 'units'],
      ['visit', 'lines claims'],
      ['visits', 'lines claims'],
      ['encounter', 'lines claims'],
      ['encounters', 'lines claims'],
    ] as const) {
      expect(roles(`There were 3 ${noun}.`, '3'), noun).toBe(role);
      expect(roles(`There were 3 denied ${noun}.`, '3'), noun).toBe(role);
    }
    expect(roles('There were 3 97110 lines.', '3')).toBe('lines');
    expect(roles('Each 2-unit line was short.', '2')).toBe('line_units');
    // Two words between, or a word that makes it some other count, and it is no count of the noun.
    expect(roles('There were 3 denied 97110 lines.', '3')).toBe('none');
    expect(roles('There were 3 badly denied lines.', '3')).toBe('none');
    for (const word of [
      'more',
      'fewer',
      'less',
      'other',
      'additional',
      'extra',
      'further',
      'remaining',
      'per',
      'in',
      'on',
      'for',
      'to',
      'and',
      'or',
      'a',
      'an',
      'the',
      'each',
      'every',
      'than',
      'from',
      'at',
      'by',
      'with',
    ]) {
      expect(roles(`There were 3 ${word} lines.`, '3'), word).toBe('none');
    }
    // "of" makes it a partitive's count, never a count of the noun beside a code that may be the noun's code.
    expect(reading('The 97110 of lines.', '97110').code).toBe('');
  });

  it('read an ordinal before a singular noun as that row', () => {
    for (const [noun, role] of [
      ['line', 'row'],
      ['row', 'row'],
      ['service', 'row'],
      ['procedure', 'row'],
      ['visit', 'row'],
      ['claim', 'claim_row'],
      ['encounter', 'claim_row'],
      ['patient', 'patient_row'],
      ['member', 'patient_row'],
    ] as const) {
      expect(roles(`The second ${noun} was short.`, 'second'), noun).toBe(role);
    }
    for (const ordinal of [
      'first',
      'second',
      'third',
      'fourth',
      'fifth',
      'sixth',
      'seventh',
      'eighth',
      'ninth',
      'tenth',
      'eleventh',
      'twelfth',
      'thirteenth',
      'fourteenth',
      'fifteenth',
      'sixteenth',
      'seventeenth',
      'eighteenth',
      'nineteenth',
      'twentieth',
      'thirtieth',
      'fortieth',
      'fiftieth',
      'sixtieth',
      'seventieth',
      'eightieth',
      'ninetieth',
      'hundredth',
      'thousandth',
      'millionth',
      'twenty-first',
    ]) {
      expect(roles(`The ${ordinal} line was short.`, ordinal), ordinal).toBe('row');
    }
    for (const ordinal of ['1st', '2nd', '3rd', '4th']) {
      expect(roles(`The ${ordinal} line was short.`, ordinal), ordinal).toBe('row');
    }
    // A plural noun counts; a number that is no ordinal counts.
    expect(roles('The second lines.', 'second')).toBe('lines');
    expect(roles('The 2 line.', '2')).toBe('lines');
    // An ordinal after a determiner before any other word is prose.
    for (const determiner of ['the', 'a', 'an', 'this', 'that', 'its', 'their', 'our', 'his', 'her', 'each', 'every']) {
      expect(reading(`It was ${determiner} fifth dispute.`, 'fifth'), determiner).toMatchObject({ roles: 'none', prose: true });
    }
    expect(reading('It was one fifth dispute.', 'fifth')).toMatchObject({ roles: 'none', prose: false });
  });

  it('read units as each line’s when "each", "every", "per" or "a" names a line, visit, row or service up to two words on', () => {
    for (const each of ['each', 'every', 'per', 'a']) {
      for (const one of ['line', 'visit', 'row', 'service']) {
        expect(roles(`It billed 2 units ${each} ${one}.`, '2'), `${each} ${one}`).toBe('line_units');
      }
      expect(roles(`It billed 2 units ${each} billed line.`, '2'), each).toBe('line_units');
      expect(roles(`It billed 2 units ${each} badly billed line.`, '2'), each).toBe('units');
    }
    expect(roles('It billed 2 units apiece.', '2')).toBe('line_units');
    expect(roles('Each line billed 2 units.', '2')).toBe('line_units');
    expect(roles('It billed 2 units in all.', '2')).toBe('units');
    expect(reading('It billed 2 units in all.', '2').scope).toBe('total');
    // "on each of the 3 lines" is each line's (CORR-7).
    expect(roles('It billed 2 units on each of 3 lines.', '2')).toBe('line_units');
    expect(roles('It billed 2 units on each of the 3 claims.', '2')).toBe('units');
  });

  it('read a partitive’s noun for the count before it, past a determiner, a count and one word, and the first number as a part of the second', () => {
    for (const determiner of ['the', 'these', 'those', 'its', 'their', 'all', 'our']) {
      expect(roles(`It paid 2 of ${determiner} denied claims.`, '2'), determiner).toBe('claims');
    }
    expect(roles('It paid 2 of 3 claims.', '2')).toBe('claims');
    expect(roles('It paid 2 of the 3 claims.', '2')).toBe('claims');
    expect(roles('It paid 2 of claims.', '2')).toBe('claims');
    // The first number is a part of the second, or of the count the noun names (CORR-9).
    expect(reading('It paid 2 of the 3 claims.', '2').part).toEqual({ of: '3' });
    expect(reading('It paid 2 of the 3 claims.', '3')).toMatchObject({ roles: ['claims'], part: null });
    expect(reading('It paid 2 of claims.', '2').part).toEqual({ of: null });
    // "of them", "of these", "of those" or "of which" with no noun: a part of the lines, claims or patients (CORR-13).
    for (const pronoun of ['them', 'these', 'those', 'which']) {
      expect(reading(`It paid 2 of ${pronoun}.`, '2'), pronoun).toMatchObject({ roles: ['lines', 'claims', 'patients'], part: { of: null } });
    }
    // A partitive the sentence opens with, for the number after its comma.
    expect(reading('Of the 3 claims, 2 were paid.', '2')).toMatchObject({ roles: ['claims'], part: { of: '3' } });
    expect(reading('Of these claims, 2 were paid.', '2')).toMatchObject({ roles: ['claims'], part: { of: null } });
    expect(roles('Of these, 2 were paid.', '2')).toBe('none');
    expect(roles('So of the 3 claims, 2 were paid.', '2')).toBe('none');
    expect(roles('It paid 2 of some denied claims.', '2')).toBe('none');
    expect(roles('Patient 2’s line was short.', '2')).toBe('patient_row');
    expect(roles('Patient 2’s 3 lines of claims.', '2')).toBe('patient_row');
  });
});

describe('years', () => {
  it('reads a whole number from 1900 to 2199 as a year after a year’s word or a possessive', () => {
    for (const lead of [
      'in',
      'during',
      'since',
      'until',
      'through',
      'thru',
      'for',
      'from',
      'before',
      'after',
      'between',
      'year',
      'years',
      'cy',
      'fy',
      'its',
      'this',
      'that',
      'these',
      'those',
      'their',
      'our',
      'each',
      'every',
    ]) {
      expect(kind(`So ${lead} 2026 it was.`, '2026'), lead).toBe('year');
    }
    expect(kind('Medicare’s 2026 rules.', '2026')).toBe('year');
    expect(kind("Medicare's 2026 rules.", '2026')).toBe('year');
    expect(kind('So in 1900 it was.', '1900')).toBe('year');
    expect(kind('So in 2199 it was.', '2199')).toBe('year');
    expect(kind('So in 1899 it was.', '1899')).toBe('number');
    expect(kind('So in 2200 it was.', '2200')).toBe('number');
    expect(kind('So in 2,026 it was.', '2,026')).toBe('number');
    expect(kind('So in two thousand twenty-six it was.', 'two thousand twenty-six')).toBe('year');
    expect(kind('So to 2026 it was.', '2026')).toBe('number');
    expect(kind('It came to the 2026 [1].', '2026')).toBe('number');
  });

  it('reads one as a year before a year’s noun, and after "the" before a count’s noun', () => {
    for (const noun of [
      'medicare',
      'mpfs',
      'pfs',
      'fee',
      'fees',
      'schedule',
      'schedules',
      'rate',
      'rates',
      'contract',
      'contracts',
      'agreement',
      'agreements',
      'amendment',
      'plan',
      'calendar',
      'fiscal',
      'conversion',
      'locality',
      'rvu',
      'rvus',
      'gpci',
      'gpcis',
      'dates',
      'remittances',
      'payments',
      'disputes',
    ]) {
      expect(kind(`So 2026 ${noun} apply.`, '2026'), noun).toBe('year');
    }
    // A count's noun after it beats a year's lead, unless the noun dates the lines (PE-8, CORR-2).
    for (const lead of ['the', 'these', 'its', 'for', 'this']) {
      expect(roles(`So ${lead} 2026 claims were short.`, '2026'), lead).toBe('claims');
      expect(roles(`So ${lead} 2026 services were short.`, '2026'), lead).toBe('service_date');
    }
    expect(roles('So the 2026 visits were short.', '2026')).toBe('service_date');
    expect(kind('There were 2026 claims.', '2026')).toBe('number');
    expect(roles('There were 2026 claims.', '2026')).toBe('claims');
    expect(roles('There were 2026 services.', '2026')).toBe('lines');
  });

  it('reads a year before a fee schedule’s noun as the fee schedule’s year, whatever the cues around it (CORR-10)', () => {
    for (const noun of ['medicare', 'mpfs', 'pfs', 'fee', 'fees', 'schedule', 'schedules', 'rate', 'rates', 'conversion', 'locality', 'rvu', 'rvus', 'gpci', 'gpcis']) {
      expect(roles(`The payer paid under the 2025 ${noun} here.`, '2025'), noun).toBe('schedule_year');
    }
    for (const noun of ['contract', 'agreement', 'plan', 'calendar', 'fiscal', 'dates']) {
      expect(kind(`So 2026 ${noun} apply.`, '2026'), noun).toBe('year');
      expect(roles(`So 2026 ${noun} apply.`, '2026'), noun).toBe('any');
    }
    // A year's noun that is a date's cue names that date.
    expect(roles('So 2026 payments apply.', '2026')).toBe('paid_date');
    expect(roles('So 2026 disputes apply.', '2026')).toBe('deadline');
  });

  it('reads a year’s roles from the date cues around it', () => {
    expect(roles('The lines were billed in 2026.', '2026')).toBe('service_date');
    expect(roles('The window ends in 2036.', '2036')).toBe('deadline');
    expect(roles('In 2026 the payer did.', '2026')).toBe('any');
    // The clauses before it naming two dates: the year is held in both, a list after it too.
    for (const [text, written] of [
      ['The contract took effect and the lines were billed, in 2026.', '2026'],
      ['The lines were billed and the payer paid: in 2026 and 2027.', '2027'],
    ] as const) {
      expect(reading(text, written).kind, text).toBe('year');
      expect(reading(text, written).every, text).toBe(true);
    }
    expect(reading('The lines were billed in 2026.', '2026').every).toBe(false);
    expect(reading('In 2026 the payer did.', '2026').every).toBe(false);
  });
});

describe('five-digit figures and two decimals', () => {
  it('reads a five-digit figure as a code unless its words make it a number', () => {
    expect(kind('CPT 97110 was billed.', '97110')).toBe('code');
    expect(roles('CPT 97110 was billed.', '97110')).toBe('none');
    for (const [text, role] of [
      ['See page 12345.', 'citation_page window_page'],
      ['See release 12345.', 'release'],
      ['See version 12345.', 'version'],
      ['A level 12345 appeal.', 'level'],
      ['It is 12345 days.', 'window_days days_to_pay days_late'],
      ['A 12345 level.', 'level'],
      ['There were 12345 lines.', 'lines'],
      ['It paid 12345 of the claims.', 'claims'],
    ] as const) {
      expect(kind(text, '12345'), text).toBe('number');
      expect(roles(text, '12345'), text).toBe(role);
      expect(reading(text, '12345').code, text).toBe('');
    }
    expect(kind('G0283 lines were short.', 'G0283')).toBe('code');
  });

  it('reads a five-digit figure before a noun as that noun’s code too, after an article, a preposition, a figure or at the start', () => {
    for (const lead of [
      'the',
      'these',
      'those',
      'each',
      'every',
      'all',
      'its',
      'their',
      'for',
      'on',
      'in',
      'with',
      'any',
      'both',
      'a',
      'an',
      'per',
      'other',
      'some',
      'by',
      'from',
      'under',
      'to',
      'and',
      'or',
    ]) {
      expect(reading(`So ${lead} 97110 lines.`, '97110').code, lead).toBe('97110');
    }
    expect(reading('97110 lines were short.', '97110').code).toBe('97110');
    expect(reading('There were 3 97110 lines.', '97110').code).toBe('97110');
    for (const lead of ['were', 'totaling', 'affected', 'of']) {
      expect(reading(`So ${lead} 97110 lines.`, '97110').code, lead).toBe('');
    }
  });

  it('reads two decimals without a dollar sign as a number before a count’s noun, "days" or after x', () => {
    expect(roles('Each line billed 1.25 units.', '1.25')).toBe('line_units');
    expect(kind('Each line billed 1.25 units.', '1.25')).toBe('number');
    expect(reading('Each line billed 1.25 units.', '1.25').value).toBe('1.25');
    // A decimal is never a code, even where a code may stand ("the 97110 units").
    expect(reading('The 1.25 units were billed.', '1.25').code).toBe('');
    expect(reading('The 97110 units were billed.', '97110').code).toBe('97110');
    expect(roles('It is 1.25 days.', '1.25')).toBe('window_days days_to_pay days_late');
    expect(roles('It billed 97110 x 1.25.', '1.25')).toBe('line_units');
    for (const text of ['See page 1.25.', 'A level 1.25 appeal.', 'It paid 1.25 of them.', 'Line 1.25 was short.', 'A 1.25 level.']) {
      expect(kind(text, '1.25'), text).toBe('amount');
    }
    expect(kind('It paid $1.25 units.', '$1.25')).toBe('amount');
  });
});

describe('amounts, percentages and dates', () => {
  it('read every role a cue names since the figure before, and the noun after', () => {
    for (const [cue, role] of [
      ['expected', 'expected'],
      ['expects', 'expected'],
      ['expect', 'expected'],
      ['requires', 'expected'],
      ['required', 'expected'],
      ['require', 'expected'],
      ['requirement', 'expected'],
      ['comes to', 'expected'],
      ['come to', 'expected'],
      ['came to', 'expected'],
      ['would have paid', 'expected'],
      ['should have paid', 'expected'],
      ['would have been paid', 'expected'],
      ['should have been paid', 'expected'],
      ['would pay', 'expected'],
      ['should pay', 'expected'],
      ['would have', 'expected'],
      ['should have allowed', 'expected'],
      ['would have allowed', 'expected'],
      ['should allow', 'expected'],
      ['contract', 'expected'],
      ['contracted', 'expected'],
      ['case rate', 'expected'],
      ['rate', 'expected'],
      ['original medicare', 'expected'],
      ['fee schedule', 'expected'],
      ['lesser', 'expected'],
      ['expected payment', 'expected'],
      ['expected reimbursement', 'expected'],
      ['expected allowed', 'expected'],
      ['expected allowable', 'expected'],
      ['allowed', 'allowed'],
      ['allows', 'allowed'],
      ['allowable', 'allowed'],
      ['allowance', 'allowed'],
      ['paid', 'paid'],
      ['payment', 'paid'],
      ['remitted', 'paid'],
      ['reimbursed', 'paid'],
      ['received', 'paid'],
      ['shows', 'allowed paid'],
      ['showed', 'allowed paid'],
      ['show', 'allowed paid'],
      ['remittance', 'allowed paid'],
      ['remittances', 'allowed paid'],
      ['shortfall', 'variance'],
      ['short', 'variance'],
      ['underpaid', 'variance'],
      ['underpayment', 'variance'],
      ['underpaying', 'variance'],
      ['difference', 'variance'],
      ['owes', 'variance'],
      ['owed', 'variance'],
      ['owe', 'variance'],
      ['owing', 'variance'],
      ['delta', 'variance'],
      ['variance', 'variance'],
      ['balance', 'variance'],
      ['request payment', 'variance'],
      ['requests payment', 'variance'],
      ['requested payment', 'variance'],
      ['interest', 'interest'],
      ['patient share', 'patient_share'],
      ['patient’s share', 'patient_share'],
      ['patient owes', 'patient_share'],
      ['patient owed', 'patient_share'],
      ['patient paid', 'patient_share'],
      ['patient pays', 'patient_share'],
      ['patients owe', 'patient_share'],
      ['patients paid', 'patient_share'],
      ['patients pay', 'patient_share'],
      ['patient responsibility', 'patient_share'],
      ['coinsurance', 'patient_share'],
      ['copay', 'patient_share'],
      ['copayment', 'patient_share'],
      ['deductible', 'patient_share'],
    ] as const) {
      expect(roles(`The ${cue} $9.00 here.`, '$9.00'), cue).toBe(role);
      expect(roles(`So $9.00 ${cue} here.`, '$9.00'), cue).toBe(role);
    }
    expect(roles('So $9.00 in interest.', '$9.00')).toBe('interest');
    expect(roles('So $9.00 of interest.', '$9.00')).toBe('interest');
    // A noun of two words is a noun, never the verb it starts with: the payer's act's object.
    expect(roles('The payer paid the expected reimbursement $9.00.', '$9.00')).toBe('paid');
    expect(roles('The payer paid the expected allowable $9.00.', '$9.00')).toBe('paid');
    // Past "for", the nearest cue after it, up to the next figure, an edge or a conjunction.
    expect(roles('So $9.00 for interest.', '$9.00')).toBe('interest');
    expect(roles('So $9.00 and interest.', '$9.00')).toBe('any');
    expect(roles('The payer pays $9.00 here.', '$9.00')).toBe('any');
    expect(roles('It allowed $9.00 and paid $8.00.', '$8.00')).toBe('paid');
    expect(roles('It allowed $9.00 and paid $8.00.', '$9.00')).toBe('allowed');
    // A comma or a colon keeps the cue; a semicolon ends it.
    expect(roles('It allowed, in all, $9.00.', '$9.00')).toBe('allowed');
    expect(roles('Allowed per line: $9.00.', '$9.00')).toBe('allowed');
    expect(roles('It allowed; $9.00.', '$9.00')).toBe('any');
    expect(roles('It allowed. $9.00.', '$9.00')).toBe('any');
  });

  it('read a noun after the payer’s act as the act’s object, and after any other verb as itself', () => {
    // Each of the payer's acts: the noun after it is what the act moved, so the act names the amount.
    for (const [act, role] of [
      ['allowed', 'allowed'],
      ['allows', 'allowed'],
      ['paid', 'paid'],
      ['remitted', 'paid'],
      ['reimbursed', 'paid'],
      ['received', 'paid'],
      ['shows', 'allowed paid'],
      ['showed', 'allowed paid'],
      ['show', 'allowed paid'],
      ['underpaid', 'variance'],
    ] as const) {
      expect(roles(`The payer ${act} the shortfall $9.00.`, '$9.00'), act).toBe(role);
    }
    expect(roles('The payer underpaying the contract $9.00.', '$9.00')).toBe('variance');
    // A conjunction between the act and the noun: the noun is its own cue again.
    for (const conjunction of ['and', 'but', 'or', 'while', 'whereas', 'yet']) {
      expect(roles(`The payer paid ${conjunction} the shortfall $9.00.`, '$9.00'), conjunction).toBe('variance');
    }
    // Every other verb after the payer's act: the noun after it is its own cue again.
    for (const verb of [
      'expects',
      'expect',
      'requires',
      'required',
      'require',
      'comes to',
      'come to',
      'came to',
      'would have paid',
      'should have paid',
      'would have been paid',
      'should have been paid',
      'would pay',
      'should pay',
      'should have allowed',
      'would have allowed',
      'would have',
      'should allow',
      'short',
      'owes',
      'owed',
      'owe',
      'owing',
      'due',
      'request payment',
      'requests payment',
      'requested payment',
      'patient owes',
      'patient owed',
      'patient paid',
      'patient pays',
      'patients owe',
      'patients paid',
      'patients pay',
    ]) {
      expect(roles(`The payer paid ${verb} the shortfall $9.00.`, '$9.00'), verb).toBe('variance');
    }
    // A participle right after a noun is the noun's; a copula takes its subject's cue.
    expect(roles('The interest owing $9.00.', '$9.00')).toBe('interest');
    expect(roles('The interest due $9.00.', '$9.00')).toBe('interest');
    expect(roles('The shortfall come to $9.00.', '$9.00')).toBe('variance');
  });

  it('read one cue’s role for an amount: the nearest, never every cue of its clause (PE-1, CORR-1, CORR-6, CRIT-2)', () => {
    // The nearest in its own clause, past a comma or a colon.
    expect(roles('Under the contract, the payer allowed $9.00.', '$9.00')).toBe('allowed');
    expect(roles('Under the contract the payer allowed $9.00.', '$9.00')).toBe('allowed');
    expect(roles('The contract expected and the payer allowed $9.00.', '$9.00')).toBe('allowed');
    expect(roles('Although the payer paid, the contract requires $9.00.', '$9.00')).toBe('expected');
    // The noun right after it, and the noun it completes with "of", first.
    expect(roles('The payer paid toward the $9.00 difference.', '$9.00')).toBe('variance');
    expect(roles('The remittance shows the contract rate of $9.00.', '$9.00')).toBe('expected');
    expect(roles('The payer allowed less than the contract amount of $9.00.', '$9.00')).toBe('expected');
    // A participle after a noun is the noun's; a noun after the payer's act is the act's object.
    expect(roles('The interest owed is $9.00.', '$9.00')).toBe('interest');
    expect(roles('The amount owed is $9.00.', '$9.00')).toBe('variance');
    expect(roles('The payer underpaid the contract by $9.00.', '$9.00')).toBe('variance');
    expect(roles('The payer paid the contract rate, $9.00.', '$9.00')).toBe('paid');
    // A copula takes its subject's cue, past a figure in its clause.
    expect(roles('The shortfall of $1.00 per line comes to $9.00.', '$9.00')).toBe('variance');
    expect(roles('Altogether the shortfall comes to $9.00.', '$9.00')).toBe('variance');
    expect(roles('Those lines come to $9.00.', '$9.00')).toBe('expected');
    // A cue that names two roles, narrowed by one beside it.
    expect(roles('The remittance paid $9.00.', '$9.00')).toBe('paid');
    expect(roles('The remittances show $9.00.', '$9.00')).toBe('allowed paid');
    // The cues of the clauses before it: one role, or every one of several.
    expect(reading('The contract requires more than the payer paid: $9.00.', '$9.00')).toMatchObject({ roles: ['expected', 'paid'], every: true });
    expect(reading('It allowed, in all, $9.00.', '$9.00')).toMatchObject({ roles: ['allowed'], every: false });
    // After it, up to a conjunction.
    expect(roles('It allowed $1.00 where $9.00 was due.', '$9.00')).toBe('expected variance');
    // Past a figure of another family; after one of its own with no cue, that figure's roles.
    expect(roles('The payer underpaid 3 claims by $9.00.', '$9.00')).toBe('variance');
    expect(roles('The payer allowed $1.00 per line and $9.00 in total.', '$9.00')).toBe('allowed');
    // "respectively": the cues in order, or every one when they do not match the list.
    expect(roles('The contract expected and the payer allowed $1.00 and $9.00, respectively.', '$1.00')).toBe('expected');
    expect(roles('The contract expected and the payer allowed $1.00 and $9.00, respectively.', '$9.00')).toBe('allowed');
    expect(reading('The payer allowed $1.00, $2.00 and $9.00, respectively.', '$9.00')).toMatchObject({ roles: ['allowed'], every: true });
    // With no cue before the list, the cues after it, in order (CORR-D1): never the first figure in any role.
    expect(roles('$1.00 and $9.00 were expected and allowed per line, respectively.', '$1.00')).toBe('expected');
    expect(roles('$1.00 and $9.00 were expected and allowed per line, respectively.', '$9.00')).toBe('allowed');
    expect(roles('Per line, $1.00 and $9.00 were the expected and allowed amounts, respectively.', '$1.00')).toBe('expected');
    expect(roles('Per line, $1.00 and $9.00 were the expected and allowed amounts, respectively.', '$9.00')).toBe('allowed');
    expect(reading('$1.00, $2.00 and $9.00 were allowed and paid, respectively.', '$1.00')).toMatchObject({ roles: ['allowed', 'paid'], every: true });
    // Up to "respectively" when cues come before it, past it otherwise.
    expect(roles('$1.00 and $9.00 were expected and allowed, respectively, and the payer paid less.', '$9.00')).toBe('allowed');
    expect(roles('$1.00 and $9.00 were, respectively, expected and allowed.', '$1.00')).toBe('expected');
  });

  it('reads a "respectively" list in one scope, the scope its words state for the list (CORR-D2)', () => {
    const scope = (text: string, written: string) => reading(text, written).scope;
    expect(scope('The contract expected and the payer allowed $3.00 and $1.00 per line, respectively.', '$3.00')).toBe('line');
    expect(scope('Per line, the contract expected and the payer allowed $1.00 and $2.00, respectively.', '$2.00')).toBe('line');
    expect(scope('The expected and allowed amounts were $1.00 and $2.00 in total, respectively.', '$1.00')).toBe('total');
    expect(scope('$1.00, $2.00 and $9.00 were expected, allowed and paid per line, respectively.', '$2.00')).toBe('line');
    expect(scope('The contract expected and the payer allowed $3.00 and $1.00, respectively, per line.', '$3.00')).toBe('line');
    // Two scopes that differ: each figure the nearer one's.
    expect(scope('Per line, the contract expected and the payer allowed $1.00 and $2.00 in total, respectively.', '$1.00')).toBe('line');
    expect(scope('Per line, the contract expected and the payer allowed $1.00 and $2.00 in total, respectively.', '$2.00')).toBe('total');
    // Each of something else: stated per it, never in total; the sentence's when the list's words state none.
    expect(scope('$1.00 and $9.00 were allowed and paid for each claim, respectively.', '$1.00')).toBe(null);
    expect(scope('The 3 lines were allowed $1.00 and $2.00, respectively.', '$1.00')).toBe('total');
    expect(scope('The 3 lines were allowed $1.00 and $2.00, respectively.', '$2.00')).toBe('total');
    // No scope stated: each its own, as outside a list.
    expect(scope('The contract expected and the payer allowed $1.00 and $2.00, respectively.', '$1.00')).toBe(null);
  });

  it('read what an amount or a count of units is stated per (CORR-7)', () => {
    const scope = (text: string, written: string) => reading(text, written).scope;
    for (const each of ['per line', 'a line', 'each line', 'every line', 'per visit', 'per row', 'per service', 'apiece', 'on each of the 3 lines']) {
      expect(scope(`It allowed $9.00 ${each}.`, '$9.00'), each).toBe('line');
    }
    for (const unit of ['per unit', 'a unit', 'each unit']) {
      expect(scope(`It allowed $9.00 ${unit}.`, '$9.00'), unit).toBe('unit');
    }
    for (const total of ['in all', 'in total', 'all told', 'total', 'totals', 'totaling', 'totalling', 'totaled', 'totalled', 'altogether', 'combined', 'overall', 'aggregate', 'across the lines', 'for these 3 lines', 'over these lines']) {
      expect(scope(`It allowed $9.00 ${total}.`, '$9.00'), total).toBe('total');
    }
    for (const lines of ['line', 'lines', 'visit', 'visits', 'row', 'rows', 'service', 'services']) {
      expect(scope(`It allowed $9.00 on each of the 3 ${lines}.`, '$9.00'), lines).toBe('line');
    }
    expect(scope('It allowed $9.00 on each of the 3 claims.', '$9.00')).toBe(null);
    expect(scope('It allowed $9.00 across the board.', '$9.00')).toBe('total');
    expect(scope('Each line was expected at $9.00.', '$9.00')).toBe('line');
    expect(scope('In total the remittances allowed $9.00.', '$9.00')).toBe('total');
    expect(scope('The 3 lines were allowed $9.00.', '$9.00')).toBe('total');
    expect(scope('The 3 lines were each allowed $9.00.', '$9.00')).toBe(null);
    expect(scope('The lines were billed at $9.00 each.', '$9.00')).toBe(null);
    expect(scope('The payer allowed $9.00.', '$9.00')).toBe(null);
    expect(scope('The 3 lines billed 2 units.', '2')).toBe('total');
    // The rows in the plural, after "for" or anywhere before it in its sentence.
    for (const rows of ['lines', 'claims', 'services', 'visits', 'rows', 'encounters', 'procedures']) {
      expect(scope(`It allowed $9.00 for these ${rows}.`, '$9.00'), rows).toBe('total');
      expect(scope(`These ${rows} were allowed $9.00.`, '$9.00'), rows).toBe('total');
    }
  });

  it('read a percentage’s roles from the cues before it and the words after it, past a year', () => {
    for (const [cue, role] of [
      ['contract', 'contract_percent'],
      ['contracted', 'contract_percent'],
      ['agreement', 'contract_percent'],
      ['medicare', 'contract_percent'],
      ['fee schedule', 'contract_percent'],
      ['billed', 'contract_percent'],
      ['charges', 'contract_percent'],
      ['interest', 'interest_rate'],
      ['annual', 'interest_rate'],
      ['annually', 'interest_rate'],
      ['yearly', 'interest_rate'],
      ['per annum', 'interest_rate'],
      ['a year', 'interest_rate'],
      ['per year', 'interest_rate'],
    ] as const) {
      expect(roles(`The ${cue} 9% here.`, '9%'), cue).toBe(role);
      expect(roles(`So 9% ${cue}.`, '9%'), cue).toBe(role);
    }
    expect(roles('So 9% of the 2026 Medicare fee schedule.', '9%')).toBe('contract_percent');
    expect(roles('So 9% of what it is, not medicare.', '9%')).toBe('any');
    expect(roles('So 9% of what it is not, medicare.', '9%')).toBe('any');
    // Both named: held in both (PE-4).
    expect(reading('Interest runs at 9% of the Medicare fee schedule.', '9%')).toMatchObject({ roles: ['contract_percent', 'interest_rate'], every: true });
    expect(reading('The contract pays interest at 9%.', '9%')).toMatchObject({ roles: ['contract_percent', 'interest_rate'], every: true });
    // A percentage with no cue of its own after one of its family: that one's roles (step 6).
    expect(roles('At 110% of Medicare and 120% too.', '120%')).toBe('contract_percent');
  });

  it('read a date’s, a month’s and a day of a month’s roles from the cues before them and the noun after', () => {
    for (const [cue, role] of [
      ['service', 'service_date'],
      ['services', 'service_date'],
      ['serviced', 'service_date'],
      ['rendered', 'service_date'],
      ['treated', 'service_date'],
      ['treatment', 'service_date'],
      ['visit', 'service_date'],
      ['visits', 'service_date'],
      ['billed', 'service_date'],
      ['paid', 'paid_date'],
      ['pays', 'paid_date'],
      ['pay', 'paid_date'],
      ['payment', 'paid_date'],
      ['payments', 'paid_date'],
      ['remitted', 'paid_date'],
      ['remittance', 'paid_date'],
      ['remittances', 'paid_date'],
      ['processed', 'paid_date'],
      ['adjudicated', 'paid_date'],
      ['received', 'received_date'],
      ['receipt', 'received_date'],
      ['due', 'due_date deadline'],
      ['prompt pay', 'due_date'],
      ['deadline', 'deadline'],
      ['until', 'deadline'],
      ['no later than', 'deadline'],
      ['window', 'deadline'],
      ['ends', 'deadline'],
      ['end', 'deadline'],
      ['ending', 'deadline'],
      ['expires', 'deadline'],
      ['closes', 'deadline'],
      ['dispute', 'deadline'],
      ['appeal', 'deadline'],
      ['respond', 'deadline'],
      ['effective', 'effective_date'],
      ['effect', 'effective_date'],
      ['as of', 'as_of_date'],
      ['assembled', 'as_of_date'],
      ['prepared', 'as_of_date'],
    ] as const) {
      expect(roles(`The ${cue} 2026-03-05 here.`, '2026-03-05'), cue).toBe(role);
      expect(roles(`The ${cue} March 2026 here.`, 'March 2026'), cue).toBe(role);
      expect(roles(`The ${cue} March 5 here.`, 'March 5'), cue).toBe(role);
      expect(roles(`So 2026-03-05 ${cue} here.`, '2026-03-05'), cue).toBe(role);
    }
    expect(roles('So 2026-03-05 it was.', '2026-03-05')).toBe('any');
  });

  it('read one cue’s role for a date: the nearest, past a figure of another family, and after it when it opens the sentence (PE-4, CRIT-3, CRIT-4)', () => {
    for (const cue of ['disputes', 'disputed', 'appeals', 'appealed', 'raise', 'raised', 'file', 'filed', 'filing', 'submit', 'submitted']) {
      expect(roles(`The ${cue} 2026-03-05 here.`, '2026-03-05'), cue).toBe('deadline');
    }
    for (const cue of ['allowed', 'underpaid', 'denied']) {
      expect(roles(`The ${cue} 2026-03-05 here.`, '2026-03-05'), cue).toBe('paid_date');
    }
    expect(roles('The prompt-pay deadline was 2026-03-05.', '2026-03-05')).toBe('due_date');
    expect(roles('The payment due 2026-03-05 here.', '2026-03-05')).toBe('due_date');
    expect(roles('The payment dispute window ends on 2026-03-05.', '2026-03-05')).toBe('deadline');
    expect(roles('The services were paid on 2026-03-05.', '2026-03-05')).toBe('paid_date');
    // What a payment was for is no date of its own: a service's cue after each act of payment.
    expect(roles('The payer paid for these services on 2026-03-05.', '2026-03-05')).toBe('paid_date');
    for (const act of ['paid', 'pays', 'pay', 'remitted', 'processed', 'adjudicated', 'allowed', 'underpaid', 'denied']) {
      expect(roles(`The payer ${act} for these services on 2026-03-05.`, '2026-03-05'), act).toBe('paid_date');
    }
    for (const service of ['service', 'services', 'serviced', 'rendered', 'treated', 'treatment', 'visit', 'visits', 'billed']) {
      expect(roles(`The payer paid for the ${service} on 2026-03-05.`, '2026-03-05'), service).toBe('paid_date');
    }
    expect(roles('The payer paid the billed lines on 2026-03-05.', '2026-03-05')).toBe('paid_date');
    // The clauses before it: several roles, every one.
    expect(reading('The payer paid the lines, with a deadline, on 2026-03-05.', '2026-03-05')).toMatchObject({ roles: ['paid_date', 'deadline'], every: true });
    // Past a figure of another family, and past a day count's own words.
    expect(roles('The payer paid $1.00 on 2026-03-05.', '2026-03-05')).toBe('paid_date');
    expect(roles('The payer paid 3 lines on 2026-03-05.', '2026-03-05')).toBe('paid_date');
    expect(roles('The window ends 9 days after payment, on 2026-03-05.', '2026-03-05')).toBe('deadline');
    expect(roles('The window ends 9 days of the payment date, by 2026-03-05.', '2026-03-05')).toBe('deadline');
    // Opening its sentence: the cue after it, past a comma.
    expect(roles('On 2026-03-05 the payer paid.', '2026-03-05')).toBe('paid_date');
    expect(roles('On 2026-03-05, the payer paid.', '2026-03-05')).toBe('paid_date');
    // After a date of its own family with no cue: that date's roles.
    expect(roles('Services ran from March 5 to March 7, 2026.', 'March 7, 2026')).toBe('service_date');
  });

  it('read one cue’s role for a day count: the cue right after "days", else the nearest before, else after (CORR-4, CORR-11)', () => {
    expect(roles('The payer paid 9 days late and we dispute within 8 days.', '9')).toBe('days_late');
    expect(roles('The payer paid 9 days late and we dispute within 8 days.', '8')).toBe('window_days');
    expect(roles('Interest accrues on claims not paid within 9 days.', '9')).toBe('days_to_pay');
    for (const cue of ['pays within', 'paid within', 'payment within', 'must pay', 'requires payment', 'require payment', 'required payment']) {
      expect(roles(`The ${cue} 9 days.`, '9'), cue).toBe('days_to_pay');
    }
    expect(roles('The contract gives 9 days to dispute.', '9')).toBe('window_days');
    // Business or working days count days to pay alone.
    expect(roles('Disputes are raised within 9 business days.', '9')).toBe('days_to_pay');
  });
});

describe('everything else', () => {
  it('reads "first" with no role as prose, and every other number with no role as none', () => {
    expect(reading('The payer first paid short.', 'first').prose).toBe(true);
    expect(reading('First, the payer paid short.', 'First').prose).toBe(true);
    expect(reading('The payer second paid short.', 'second').prose).toBe(false);
    expect(reading('The first line was short.', 'first').prose).toBe(false);
    // An ordinal before another number, or after a determiner before a word that is no row's, is prose (PE-6, CORR-8).
    expect(reading('The first 3 claims were short.', 'first')).toMatchObject({ roles: 'none', prose: true });
    expect(roles('The first 3 claims were short.', '3')).toBe('claims');
    for (const text of ['The sixth unit was short.', 'The fifth dispute.', 'A second appeal.']) {
      expect(reading(text, text.split(' ')[1] ?? '').prose, text).toBe(true);
    }
    expect(reading('This line is the fifth.', 'fifth').prose).toBe(false);
  });

  it('reads modifiers, identifiers and codes that are not five digits in no role', () => {
    expect(roles('The 97110-GP lines.', 'GP')).toBe('none');
    expect(kind('Under G.S. 58-3-225 here.', '58-3-225')).toBe('identifier');
    expect(roles('Under G.S. 58-3-225 here.', '58-3-225')).toBe('none');
  });

  it('keeps every figure’s token, and its value as read', () => {
    const read = readFigures('Lines 1 and 2 of 97110 were short [3].');
    expect(read.readings.map((item) => [item.token, item.value])).toEqual([
      [1, '1'],
      [3, '2'],
      [5, '97110'],
    ]);
    expect(read.tokens).toEqual(['w:lines', 'n:1', 'w:and', 'n:2', 'w:of', 'n:97110', 'w:were', 'w:short', '|']);
  });
});

describe('a text’s tokens', () => {
  it('are its words, its figures by kind and value, its placeholders and its edges', () => {
    expect(quotedTokens('Pay $1.00, 9%; on 2026-03-05: in March 2026 and March 5! 97110-GP? 1-2-3 {{patient_name:1}}.')).toEqual([
      'w:pay',
      'a:100',
      '|',
      'p:9',
      '|',
      'w:on',
      'd:date:2026-03-05',
      '|',
      'w:in',
      'd:month:2026-03',
      'w:and',
      'd:month_day:03-05',
      '|',
      'n:97110',
      'm:GP',
      '|',
      'i:1-2-3',
      'w:placeholder',
      '|',
    ]);
    expect(quotedTokens('Alpha\n\nBeta')).toEqual(['w:alpha', '|', 'w:beta']);
    expect(quotedTokens('Code G0283 and 012')).toEqual(['w:code', 'n:G0283', 'w:and', 'n:12']);
    expect(quotedTokens('Medicare’s and the payer’s 2 × 3')).toEqual(['w:medicare', 'w:and', 'w:the', 'w:payer', 'n:2', 'w:×', 'n:3']);
  });

  it('end a clause at a period only when a space or the text’s end follows it, and never after one letter or an abbreviation', () => {
    expect(quotedTokens('G.S. 58')).toEqual(['w:g', 'w:s', 'n:58']);
    expect(quotedTokens('See 4.x here')).toEqual(['w:see', 'n:4', 'w:x', 'w:here']);
    expect(quotedTokens('Seen. Then')).toEqual(['w:seen', '|', 'w:then']);
    expect(quotedTokens('Seen.')).toEqual(['w:seen', '|']);
    for (const abbreviation of ['pp', 'no', 'nos', 'vol', 'sec', 'art', 'para', 'ch', 'st', 'cf', 'vs', 'inc', 'co', 'corp', 'ltd', 'llc']) {
      expect(quotedTokens(`${abbreviation}. 4`), abbreviation).toEqual([`w:${abbreviation}`, 'n:4']);
    }
  });

  it('read a dash between two numbers in digits as a range’s "–", spaced or not, and no dash between other figures or beside other words', () => {
    expect(quotedTokens('lines 1–3')).toEqual(['w:lines', 'n:1', 'w:–', 'n:3']);
    expect(quotedTokens('lines 1 – 3')).toEqual(['w:lines', 'n:1', 'w:–', 'n:3']);
    expect(quotedTokens('lines 1 —3')).toEqual(['w:lines', 'n:1', 'w:–', 'n:3']);
    expect(quotedTokens('codes 97110 - 97112')).toEqual(['w:codes', 'n:97110', 'w:–', 'n:97112']);
    // Codes not all digits, and amounts, are no numbers of a range.
    expect(quotedTokens('codes G0283 – G0284')).toEqual(['w:codes', 'n:G0283', 'n:G0284']);
    expect(quotedTokens('codes 0283T – 0284T')).toEqual(['w:codes', 'n:0283T', 'n:0284T']);
    expect(quotedTokens('$1.00 – $2.00')).toEqual(['a:100', 'a:200']);
    // A word beside the dash, on either side: no range.
    expect(quotedTokens('lines 1 a- 3')).toEqual(['w:lines', 'n:1', 'w:a', 'n:3']);
    expect(quotedTokens('lines 1 -a 3')).toEqual(['w:lines', 'n:1', 'w:a', 'n:3']);
  });
});

describe('a quoted figure repeated in a role', () => {
  const holds = (narrative: string, quote: string, which = 0) => {
    const read = readFigures(narrative);
    const figure = read.readings[which];
    if (figure === undefined) {
      throw new Error(`no figure in ${narrative}`);
    }
    return quotedHolds(read.tokens, figure, quotedText(quote), true, functionWords());
  };

  it('holds it only where the quote’s own words give it the role the narrative’s do (CORR-14)', () => {
    const statute = 'Clean claims are paid within 33 days of receipt.';
    expect(quotedText(statute).roles.get(5)).toEqual({ roles: ['days_to_pay'], every: false });
    expect(holds('Claims are paid within 33 days of receipt [1].', statute)).toBe(true);
    expect(holds('Disputes are raised within 33 days of receipt [1].', statute)).toBe(false);
    // A quoted figure its words give no role is held in none.
    expect(holds('The payer allowed $50.00 per unit.', '97110: $50.00 per unit.')).toBe(false);
    expect(holds('The payer paid 24 days late.', 'Disputes are raised within 3650 days; see sections 4, 24, 90', 0)).toBe(false);
  });

  it('holds it in every one of its roles when it is held in all of them, else in any one, and never where either side names no list of roles', () => {
    // A figure alone in both its sentence and the quote's clause, so the words around it never decide.
    const alone = (figureRoles: FigureReading['roles'], every: boolean, own: FigureReading['roles'] | undefined) =>
      quotedHolds(['7'], { token: 0, roles: figureRoles, every }, { tokens: ['7'], roles: new Map(own === undefined ? [] : [[0, { roles: own, every: false }]]) }, true, functionWords());
    expect(alone(['level'], false, ['level'])).toBe(true);
    expect(alone(['level'], true, ['level'])).toBe(true);
    expect(alone(['level', 'release'], false, ['level'])).toBe(true);
    expect(alone(['level', 'release'], true, ['level'])).toBe(false);
    expect(alone(['level', 'release'], true, ['release', 'level'])).toBe(true);
    expect(alone(['release'], false, ['level'])).toBe(false);
    // The quote's place read in no role, in any role or not at all, and a figure the narrative gives no list of roles.
    expect(alone(['level'], false, 'none')).toBe(false);
    expect(alone(['level'], false, 'any')).toBe(false);
    expect(alone(['level'], false, undefined)).toBe(false);
    expect(alone('none', false, ['level'])).toBe(false);
    expect(alone('any', true, ['level'])).toBe(false);
    // Four of its tokens before it, but the one after it differs where neither clause ends: no repetition.
    const before = ['w:raised', 'w:within', 'w:the', 'w:window', '7'];
    const own = new Map<number, Pick<FigureReading, 'roles' | 'every'>>([[4, { roles: ['window_days'], every: false }]]);
    const figure = { token: 4, roles: ['window_days'], every: false } as const;
    expect(quotedHolds([...before, 'w:pages'], figure, { tokens: [...before, 'w:days'], roles: own }, true, functionWords())).toBe(false);
    expect(quotedHolds([...before, 'w:days'], figure, { tokens: [...before, 'w:days'], roles: own }, true, functionWords())).toBe(true);
    expect(quotedHolds(before, figure, { tokens: before, roles: own }, true, functionWords())).toBe(true);
  });
});

describe('a quoted figure repeated with its words', () => {
  const holds = (narrative: string, quote: string, inRole: boolean, which = 0) => {
    const read = readFigures(narrative);
    const figure = read.readings[which];
    if (figure === undefined) {
      throw new Error(`no figure in ${narrative}`);
    }
    return quotedHolds(read.tokens, figure, quotedText(quote), inRole, functionWords());
  };

  it('holds a figure in no role beside the word before it, when that word means something', () => {
    expect(holds('Section 4 applies', 'Section 4 covers visits', false)).toBe(true);
    expect(holds('The group 77 billed', 'SYNTHETIC GROUP 77 here', false)).toBe(true);
    const words = [
      'more',
      'fewer',
      'less',
      'other',
      'additional',
      'extra',
      'further',
      'remaining',
      'of',
      'per',
      'in',
      'on',
      'for',
      'to',
      'and',
      'or',
      'a',
      'an',
      'the',
      'each',
      'every',
      'than',
      'from',
      'at',
      'by',
      'with',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'it',
      'its',
      'this',
      'that',
      'these',
      'those',
      'them',
      'they',
      'their',
      'any',
      'all',
      'no',
      'not',
      'so',
      'if',
      'as',
      'into',
      'up',
      'out',
      'about',
      'after',
      'before',
      'such',
      'within',
      'under',
      'over',
    ];
    expect([...functionWords()].sort()).toEqual([...words].sort());
    for (const word of words) {
      expect(holds(`So ${word} 4 here`, `Zz ${word} 4 there`, false), word).toBe(false);
    }
    expect(holds('Zz section 4 here', 'Zz section 5 there', false)).toBe(false);
  });

  it('holds a figure in no role with two of its words, one meaning something, or one word and the quote’s clause reached', () => {
    expect(holds('So 4 denied claims here', 'Zz 4 denied claims there', false)).toBe(true);
    expect(holds('So 4 of denied here', 'Zz 4 of denied there', false)).toBe(true);
    expect(holds('So 4 of them here', 'Zz 4 of them there', false)).toBe(false);
    expect(holds('So 4 here', 'Zz 4 there', false)).toBe(false);
    // The quote's clause reached on one side, where the narrative's clause ends too, and a word matched on the other.
    expect(holds('The rate applies from July 2026, here', 'paid per unit from July 2026, billed', false)).toBe(true);
    expect(holds('The rate applies from July 2026 here', 'paid per unit from July 2026, billed', false)).toBe(false);
    expect(holds('4 of here', '4 of there', false)).toBe(true);
    expect(holds('So 4 of here', '4 of there', false)).toBe(false);
    expect(holds('So 4 there', 'Zz 4', false)).toBe(false);
    expect(holds('Zz 4 there', 'Zz 4', false)).toBe(true);
    // A bare figure that fills a quoted clause repeats nothing, the narrative's clause the same or not (PE-3).
    expect(holds('So 4 here', '4', false)).toBe(false);
    expect(holds('So, 4, here', 'See sections 2, 4, 6', false)).toBe(false);
  });

  it('holds a figure in a role only with four of its words, the word after it among them, or a whole quoted clause', () => {
    const quote = 'A level 2 appeal is raised within 90 days on page 9; 4 claims a year';
    expect(holds('A level 2 appeal is raised within 90 days [1].', quote, true)).toBe(true);
    expect(holds('This is a level 2 appeal [1].', quote, true)).toBe(false);
    expect(holds('This is a level 2 appeal [1].', quote, false)).toBe(true);
    expect(holds('So raised within 90 days on here', quote, true)).toBe(true);
    expect(holds('So is raised within 90 business days', quote, true)).toBe(false);
    // The whole clause only where the narrative's clause is the quote's, edge to edge (PE-2, PE-3, CORR-3).
    expect(holds('4 claims a year', quote, true)).toBe(true);
    expect(holds('So 4 claims a year', quote, true)).toBe(false);
    expect(holds('So 4 claims a', quote, true)).toBe(false);
    expect(holds('There were 4 claims [3].', quote, true)).toBe(false);
  });

  it('compares only the same figure, and stops at the narrative’s sentence', () => {
    expect(holds('Section 5 applies', 'Section 4 applies', false)).toBe(false);
    expect(holds('Section $4.00 applies', 'Section 4 applies', false)).toBe(false);
  });

  it('takes a matched figure for no label, and needs a token matched on the side the quote does not end', () => {
    expect(holds('So 4 5 there', 'Code 4 5 here', false, 1)).toBe(false);
    expect(holds('So 4 5 there', 'Code 4 5 here', false, 0)).toBe(false);
    expect(holds('So 4 there', '4 here', false)).toBe(false);
    expect(holds('So 4 denied here', 'Zz 4 denied there', false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------
// The boundaries each rule of the reader separates (PRD 18, mutation testing): every case below is one that a looser
// pattern, a rule left out or a boundary moved by one would read differently.
// ---------------------------------------------------------------------------------------------------

describe('the reader’s boundaries', () => {
  it('tokenizes words with an apostrophe inside, a word right before a figure, a spaced blank line and a code in digits', () => {
    expect(quotedTokens('O’Brien and O’Shea')).toEqual(['w:o’brien', 'w:and', 'w:o’shea']);
    expect(quotedTokens('pay$1.00')).toEqual(['w:pay', 'a:100']);
    expect(quotedTokens('Alpha\n \nBeta')).toEqual(['w:alpha', '|', 'w:beta']);
    expect(quotedTokens('Codes 01234 and 0001F')).toEqual(['w:codes', 'n:1234', 'w:and', 'n:0001F']);
    expect(quotedTokens('Plan B, 4')).toEqual(['w:plan', 'w:b', '|', 'n:4']);
    expect(quotedTokens('A dog. Then')).toEqual(['w:a', 'w:dog', '|', 'w:then']);
  });

  it('reads a figure’s possessive only after an apostrophe, as the figure’s', () => {
    expect(roles('There were 3 s lines.', '3')).toBe('lines');
    expect(roles('There were 3’d lines.', '3')).toBe('lines');
    expect(roles('The payer’s 3 s lines.', '3')).toBe('lines');
    expect(roles('Patient 2’s 3 lines.', '3')).toBe('lines');
    expect(roles('Patient 2’S line.', '2')).toBe('patient_row');
  });

  it('keeps a clause’s units, days and pages from the words up to the figures and edges around it', () => {
    expect(roles('Each line was short, 2 units in all.', '2')).toBe('units');
    expect(roles('Each line billed 3 and 2 units.', '2')).toBe('units');
    expect(roles('The window and 3 of it, 9 days.', '9')).toBe('window_days days_to_pay days_late');
  });

  it('keeps a list’s role from a label only, never from a count, a day count or a figure right before', () => {
    expect(roles('There were 3 claims and 4 here.', '4')).toBe('none');
    expect(roles('It is 9 days and 10 here.', '10')).toBe('none');
    expect(roles('It billed 97110 x2 and 3 here.', '3')).toBe('line_units');
    expect(roles('See pages 1 2 here.', '2')).toBe('none');
    expect(roles('See 3 here.', '3')).toBe('none');
  });

  it('reads a partitive past one figure and one word only, and to the text’s end', () => {
    expect(roles('It paid 2 of the 3 4 claims.', '2')).toBe('none');
    expect(roles('It paid 2 of the', '2')).toBe('none');
    expect(roles('It paid 2 of', '2')).toBe('none');
    expect(roles('There were 2', '2')).toBe('none');
  });

  it('reads cues once each, in order, so a word after a cue is read as its own', () => {
    expect(roles('The allowed paid $9.00.', '$9.00')).toBe('paid');
    expect(roles('The would have allowed $9.00.', '$9.00')).toBe('expected');
    expect(roles('The would have been paid $9.00.', '$9.00')).toBe('expected');
    expect(roles('So $9.00 would have allowed.', '$9.00')).toBe('expected');
  });

  it('reads a percentage’s words after it, six at most', () => {
    expect(roles('So 9% one two three four five medicare.', '9%')).toBe('contract_percent');
    expect(roles('So 9% one two three four five six medicare.', '9%')).toBe('any');
  });

  it('reads a year only from four digits or words of 1900 to 2199', () => {
    for (const text of [
      'So in twelve thousand twenty-six it was.',
      'So in twenty thousand two hundred sixty-five it was.',
      'So in 002026 it was.',
      'So in 2026.0 it was.',
      'So in 2026th it was.',
    ]) {
      expect(kind(text, text.slice(6, text.indexOf(' it'))), text).toBe('number');
    }
  });

  it('reads codes that are not five digits as codes in no role', () => {
    expect(roles('G0283 lines were short.', 'G0283')).toBe('none');
    expect(roles('0001F lines were short.', '0001F')).toBe('none');
  });

  it('keeps the next round’s boundaries: a possessive’s owner, a percentage’s edge, a partitive’s second word and a list’s words', () => {
    expect(quotedTokens('Patient 2’s 3 s')).toEqual(['w:patient', 'n:2', 'n:3', 'w:s']);
    expect(roles('So 9% of it, medicare.', '9%')).toBe('any');
    expect(roles('It paid 2 of the 3 denied claims.', '2')).toBe('claims');
    expect(roles('See pages 1 and also 2 here.', '2')).toBe('none');
    expect(roles('It paid $5.00 and 3 here.', '3')).toBe('none');
    expect(roles('Units: 2 and 3 here.', '3')).toBe('units');
    expect(roles('It billed 2 units each billed line.', '2')).toBe('line_units');
    expect(roles('It billed 2 units each badly billed line.', '2')).toBe('units');
  });
});
