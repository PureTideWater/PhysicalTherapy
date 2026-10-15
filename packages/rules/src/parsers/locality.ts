import { RuleImportError, textLines } from './delimited';
import type { ParseOutcome, ParsedRow, RuleFileParser } from './types';

/**
 * The CMS ZIP code to carrier locality file (ZIP5, fixed-width text), read by the positions of its
 * record layout: state in 1-2, ZIP code in 3-7, carrier in 8-12, pricing locality in 13-14, the
 * rural indicator in 15 (blank, R or B) and the plus-four flag in 21 (1 when the ZIP is split
 * across localities and the ZIP+4 file decides). Later positions are not needed.
 */
function parse(text: string, window: { effectiveFrom: string; effectiveTo: string | null }): ParseOutcome {
  const seen = new Set<string>();
  const parsed: ParsedRow[] = [];
  for (const line of textLines(text)) {
    if (line.raw.trim() === '') {
      continue;
    }
    const raw = line.raw;
    const at = `line ${String(line.line)}`;
    if (raw.length < 14) {
      throw new RuleImportError(`${at}: ${String(raw.length)} characters is too short for the ZIP5 layout`);
    }
    const state = raw.slice(0, 2);
    const zip = raw.slice(2, 7);
    const carrier = raw.slice(7, 12);
    const locality = raw.slice(12, 14);
    if (!/^[A-Z]{2}$/.test(state) || !/^\d{5}$/.test(zip) || !/^\d{5}$/.test(carrier) || !/^\d{2}$/.test(locality)) {
      throw new RuleImportError(`${at}: does not fit the ZIP5 layout (state, ZIP, carrier, locality in positions 1-14)`);
    }
    const rural = raw.length > 14 ? raw.charAt(14).trim() : null;
    if (rural !== null && !['', 'R', 'B'].includes(rural)) {
      throw new RuleImportError(`${at}: rural indicator ${JSON.stringify(rural)} is not blank, R or B`);
    }
    const plusFour = raw.length > 20 ? raw.charAt(20) : ' ';
    if (![' ', '0', '1'].includes(plusFour)) {
      throw new RuleImportError(`${at}: plus-four flag ${JSON.stringify(plusFour)} is not 0, 1 or blank`);
    }
    if (seen.has(zip)) {
      throw new RuleImportError(`${at}: ZIP ${zip} appears twice`);
    }
    seen.add(zip);
    parsed.push({
      key: { zip },
      value: {
        state,
        carrier,
        locality,
        rural_indicator: rural,
        plus_four_required: plusFour === ' ' ? null : plusFour === '1',
      },
      effective_from: window.effectiveFrom,
      effective_to: window.effectiveTo,
      quote: raw,
      locator: at,
    });
  }
  if (parsed.length === 0) {
    throw new RuleImportError('the file holds no ZIP codes');
  }
  return { rows: parsed, notes: [] };
}

export const localityParser: RuleFileParser = {
  type: 'locality_map',
  parser: 'cms_zip5_locality',
  title: 'CMS ZIP code to carrier locality file (ZIP5)',
  reviewQuestions: [
    'Does the record layout document shipped with the file put state in 1-2, ZIP in 3-7, carrier in 8-12, locality in 13-14, the rural indicator in 15 and the plus-four flag in 21?',
    "Does each practice's billing ZIP map to the locality its GPCI record carries, and does any of them need the ZIP+4 file (plus_four_required)?",
  ],
  parse,
};
