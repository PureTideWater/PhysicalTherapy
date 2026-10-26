import type { PricingTrace } from '@tp/pricing';

import { type FigureContext, type FigureForm, type Part, type Segment, type Sentence, figure, label, listOf, say } from './figures';
import { type Audience, type CompleteFeeSchedule, type ExplainCitation, checkYearBasis, completeFeeSchedule, lockedBy, scheduleKeyOf } from './line';
import type { Slot } from './slots';
import { APPLICABILITY_TEXT, SETTING_TEXT, wordsOf } from './words';

/**
 * The fee-schedule worksheet (combined audit #38; docs/adr/0072): for a percent-of-Medicare or Medicare Advantage
 * line, what a payer needs to check the amount per unit against CMS's own fee schedule: the year, the locality, the
 * setting, the conversion factor, the percentage, and each part's relative value units, geographic index and amount
 * per unit at the percentage. One worksheet per distinct set of records (worksheetKeyOf()): two lines of one code,
 * setting and locality under one release share one.
 *
 * Rendered from the stored traces, never stored (no migration; the traces' SHA-256s bind it to the approval), and
 * every figure is one the trace holds. It prints no amount at 100% for a contract that is not at 100%, no
 * geographically adjusted RVU and no total RVU: the trace holds none of them, and deriving one would be the words
 * doing arithmetic. The reductions are not repeated here; each line's words carry them. Pure and browser-safe.
 */

/** A line whose fee schedule a worksheet may show: its packet row (on a line's page, its line number), its trace and its citation. */
export interface WorksheetLine {
  readonly row: number;
  readonly trace: PricingTrace;
  readonly citation: ExplainCitation;
}

export interface WorksheetPart {
  readonly part: 'work' | 'pe' | 'mp';
  readonly name: Sentence;
  readonly rvu: Segment;
  readonly gpci: Segment;
  /** The part's amount per unit, at the percentage, to the fraction of a cent. */
  readonly unit: Segment;
}

export interface Worksheet {
  readonly key: string;
  /** Its number in the packet (or on the page), from 1, in the order its first line comes. */
  readonly number: number;
  readonly title: Sentence;
  /** Year, locality, setting, conversion factor and percentage. */
  readonly rows: readonly Sentence[];
  /** The table's column headings. */
  readonly headings: { readonly part: Sentence; readonly rvu: Sentence; readonly gpci: Sentence; readonly unit: Sentence };
  readonly parts: readonly WorksheetPart[];
  /** The table's last row: the amount per unit. */
  readonly total: { readonly name: Sentence; readonly unit: Segment };
  /** How the parts make the amount per unit. */
  readonly formula: readonly Sentence[];
  readonly reductions: Sentence;
  /** How to check it against CMS's look-up. */
  readonly check: Sentence;
  /** The packet rows (or the one line) that use it. */
  readonly lines: readonly number[];
}

export interface WorksheetOptions {
  /** `rows` in a packet (the default); `line` on a line's own page. */
  readonly of?: 'rows' | 'line';
}

/** The worksheets of the lines, numbered in the order their first lines come; a line without a fee schedule has none. */
export function feeScheduleWorksheets(lines: readonly WorksheetLine[], audience: Audience, options: WorksheetOptions = {}): Worksheet[] {
  const groups = new Map<string, { readonly schedule: CompleteFeeSchedule; readonly lines: [WorksheetLine, ...WorksheetLine[]] }>();
  for (const line of lines) {
    checkYearBasis(line.trace);
    const schedule = completeFeeSchedule(line.trace);
    if (schedule !== null) {
      const key = scheduleKeyOf(schedule, line.trace, line.citation);
      const group = groups.get(key);
      if (group === undefined) {
        groups.set(key, { schedule, lines: [line] });
      } else {
        group.lines.push(line);
      }
    }
  }
  return [...groups].map(([key, group], index) => worksheet(key, index + 1, group.schedule, group.lines, audience, options.of === 'line'));
}

/** A worksheet of its group's lines, the first line's complete fee schedule `schedule`; `ofLine` on a line's own page. */
function worksheet(key: string, number: number, schedule: CompleteFeeSchedule, group: readonly [WorksheetLine, ...WorksheetLine[]], audience: Audience, ofLine: boolean): Worksheet {
  const [first] = group;
  const context: FigureContext = { trace: first.trace, citation: first.citation, row: first.row };
  const at = (slot: Slot, form: FigureForm) => figure(context, slot, form);
  const plusFour = schedule.locality.plus_four !== undefined;
  const carrier = at(plusFour ? 'worksheet.plus_four_carrier' : 'worksheet.carrier', 'verbatim');
  const locality = at(plusFour ? 'worksheet.plus_four_locality' : 'worksheet.locality', 'verbatim');
  const code = at('worksheet.code', 'verbatim');
  const year = at('worksheet.basis_year', 'verbatim');
  const setting = SETTING_TEXT[schedule.setting];
  const percentage = at('worksheet.percentage', 'percent');
  const factor = at('worksheet.factor', 'per_rvu');
  const { citation } = first;
  const medicare = citation?.kind === 'regulation';

  // Each distinct place of service of the lines, read in the first line's trace that has it.
  const places: Part[] = [];
  const seen = new Set<string | null>();
  for (const line of group) {
    const place = line.trace.line.place_of_service;
    if (!seen.has(place)) {
      seen.add(place);
      places.push(figure({ trace: line.trace, citation: line.citation, row: line.row }, 'worksheet.place_of_service', 'verbatim'));
    }
  }

  const rows = [
    schedule.lookup === 'latest_in_basis_year'
      ? say('Year: the latest records in force during ', year, ', the year ', lockedBy(audience), ' locks.')
      : say('Year: the ', year, ' records in force on the service date.'),
    plusFour
      ? say(
          'Locality: practice ZIP ',
          at('worksheet.zip', 'verbatim'),
          ' needs its ZIP+4: ',
          at('worksheet.zip_plus_four', 'verbatim'),
          ' falls in ',
          at('worksheet.plus_four_from', 'verbatim'),
          ' to ',
          at('worksheet.plus_four_to', 'verbatim'),
          ', carrier ',
          carrier,
          ', locality ',
          locality,
          '.',
        )
      : say('Locality: practice ZIP ', at('worksheet.zip', 'verbatim'), ' is Medicare carrier ', carrier, ', locality ', locality, '.'),
    say('Setting: ', setting, ', the practice’s setting for place of service ', listOf(places), '.'),
    say('Conversion factor: ', factor, ' (relative value unit), ', wordsOf(APPLICABILITY_TEXT, schedule.conversion_factor.applicability, 'conversion factor applicability'), '.'),
    citation === null
      ? say('Percentage: ', percentage, ' of the fee schedule.')
      : citation.kind === 'contract'
        ? say('Percentage: ', percentage, ' of the fee schedule, under the contract’s clause on page ', at('worksheet.page', 'verbatim'), '.')
        : say('Percentage: ', percentage, ' under ', at('worksheet.reference', 'verbatim'), '.'),
  ];

  const parts: WorksheetPart[] = [
    { part: 'work', name: say('Work'), rvu: at('worksheet.work_rvu', 'verbatim'), gpci: at('worksheet.work_gpci', 'verbatim'), unit: at('worksheet.unit_work', 'exact_dollars') },
    {
      part: 'pe',
      name: say('Practice expense (', setting, ')'),
      rvu: at(schedule.setting === 'facility' ? 'worksheet.pe_rvu_facility' : 'worksheet.pe_rvu_non_facility', 'verbatim'),
      gpci: at('worksheet.pe_gpci', 'verbatim'),
      unit: at('worksheet.unit_pe', 'exact_dollars'),
    },
    { part: 'mp', name: say('Malpractice'), rvu: at('worksheet.mp_rvu', 'verbatim'), gpci: at('worksheet.mp_gpci', 'verbatim'), unit: at('worksheet.unit_mp', 'exact_dollars') },
  ];

  const before = medicare
    ? ['CMS shows the full fee-schedule amount before any reduction; at ', percentage, ' under ', at('worksheet.reference', 'verbatim'), ', the amount per unit above is Original Medicare’s own.']
    : ['CMS shows the full fee-schedule amount, before ', citation === null ? 'the rate record’s ' : 'this contract’s ', percentage, ' and before any reduction.'];
  const rowsUsing = group.map((line) => line.row);

  return {
    key,
    number,
    title: say('Fee schedule worksheet ', label(number, 'worksheet'), ': code ', code, ', ', year, ', carrier ', carrier, ' locality ', locality, ', ', setting),
    rows,
    headings: { part: say('Part'), rvu: say('RVU'), gpci: say('GPCI (geographic practice cost index)'), unit: say('Per unit at ', percentage) },
    parts,
    total: { name: say('Per unit'), unit: at('worksheet.unit_total', 'exact_dollars') },
    formula: [
      say(
        audience === 'payer' ? 'The calculation: ' : 'The engine’s expression: ',
        '(work RVU × work GPCI + practice-expense RVU × practice-expense GPCI + malpractice RVU × malpractice GPCI) × conversion factor × percentage = amount per unit.',
      ),
      say('Each part above is its RVU × its GPCI × ', factor, ' × ', percentage, ', kept to the fraction of a cent until the one rounding.'),
    ],
    reductions:
      ofLine
        ? say('Reductions, in order, then the one rounding: as this line’s words say.')
        : say('Reductions, in order, then the one rounding: as the words of ', listOf(rowsUsing.map((row) => ['row ', label(row, 'row')])), ' say.'),
    check: say(
      'To check these values, open the Physician Fee Schedule Look-Up Tool of the Centers for Medicare & Medicaid Services (CMS) for ',
      year,
      ', choose carrier ',
      carrier,
      ' locality ',
      locality,
      ' and code ',
      code,
      ': its relative values, geographic indices and conversion factor should read as above. ',
      before,
    ),
    lines: rowsUsing,
  };
}
