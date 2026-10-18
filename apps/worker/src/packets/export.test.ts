import { describe, expect, it } from 'vitest';

import { DEADLINE_UNVERIFIED_CAUSES } from '@tp/triage';
import { type PacketContentV1, insertIdentifiers } from '@tp/packets';

import { PACKET_CSV_COLUMNS, packetCsv } from './csv';
import { GAP_CODES, deadlineText, gapText, packetHtml } from './html';
import { approval, content, exported, identifiers } from './test-support/exported-packet';
import { chromiumInstalled } from '../report/pdf';
import { amountsNotInMono } from '../report/test-support/figures';

/**
 * The export's documents (PRD 12, The packet; CAS-11, CAS-12, CAS-15; CO-05): the HTML the worker prints
 * to PDF and the CSV schedule, from a SYNTHETIC version with its identifiers inserted.
 */

describe('packetHtml', () => {
  const html = packetHtml(exported, approval);

  it('holds the citation, the narrative with its identifiers, the schedule, the interest line apart, the evidence and the approval record', () => {
    expect(html).toContain('97110 is paid 50.00 per unit');
    expect(html).toContain('Claim SYNCCN0001 is the first [3].');
    expect(html).toContain('SYNTHETIC, PATIENT &lt;ONE&gt;');
    expect(html).toContain('Prompt-pay interest (its own line, not part of the variance)');
    expect(html).toContain('Row 2: The remittance does not say when the payer received this claim');
    expect(html).toContain(`SHA-256 ${'c'.repeat(64)}`);
    expect(html).toContain('approved by approver@synthetic.test');
    expect(html).not.toContain('Audit flag');
    expect(html).not.toMatch(/\{\{[a-z_]+:\d+\}\}/);
    expect(html).not.toMatch(/<script|https?:\/\//);
  });

  it('shows the audit flag of a single-user approval, and the specialist who confirmed a regulation', () => {
    const alone = packetHtml(exported, { ...approval, approvedAlone: true, regulationConfirmedBy: 'specialist@synthetic.test' });
    expect(alone).toContain('Audit flag: approved by the person who wrote it, in a practice with no second person to approve packets, at least 24 hours after it was written.');
    expect(alone).toContain('confirmed by contract specialist specialist@synthetic.test');
  });

  it('is the practice’s own letter to its payer: its name leads the cover and the running header, and PaidWhole’s lockup and name are not on it', () => {
    const name = exported.content.practice.name;
    const cover = html.slice(html.indexOf('<section class="cover"'), html.indexOf('<table class="pages"'));
    expect(cover).toContain(`<div class="cover-top"><p class="firm">${name}</p></div>`);
    // Named once on the cover, not again under the headline.
    expect(cover.split(name)).toHaveLength(2);
    expect(html).toContain(`<span class="title">${name} · Payment dispute</span>`);
    expect(html).toContain(`<title>Payment dispute | ${name}</title>`);
    expect(html).not.toMatch(/PaidWhole/i);
    expect(html).not.toContain('data-verified');
  });

  it.skipIf(!chromiumInstalled())('sets every dollar figure in IBM Plex Mono, the narrative’s and the interest total’s included (skipped without Chromium)', async () => {
    expect(await amountsNotInMono(html)).toEqual([]);
  }, 60_000);

  it('states the deadline the dispute is filed against, its status in words, its evidence, and each line’s window and calculation (tp-packet/2, CO-05)', () => {
    expect(html).toContain('<p data-deadline="verified"><strong>The dispute is filed by 2036-04-05</strong>');
    expect(html).toContain('deadline verified (2 of 2 lines’ windows verified)');
    expect(html).toContain('a dispute window of 3650 days');
    expect(html).toContain('<blockquote>Disputes are raised within 3650 days of the remittance.</blockquote>');
    expect(html).toContain('citation checked against its page 2026-01-02');
    expect(html).toContain('Each line’s window and calculation, as its trace recorded it');
    // The trace's codes in words: the method, each step and the rounding rule.
    expect(html).toContain('base $100.00');
    expect(html).toContain('half up to the cent: $100.00 to $100.00');
    expect(html).toContain('<td>Fixed schedule</td>');
    expect(html).not.toMatch(/FIXED_SCHEDULE|HALF_UP_CENT/);
    expect(html).toContain('<td>$14.00</td>');
  });

  it('counts one line’s window and one day in the singular', () => {
    const [first] = content.lines;
    const [window] = content.deadline.sources;
    if (first === undefined || window?.kind !== 'contract_window') {
      throw new Error('a line and its contract window expected');
    }
    const one = { ...content, lines: [first], deadline: { ...content.deadline, lines: 1, lines_verified: 1, sources: [{ ...window, days: 1 }] } };
    const printed = packetHtml(insertIdentifiers(one, exported.narrative, identifiers), approval);
    expect(printed).toContain('(1 of 1 line’s window verified)');
    expect(printed).toContain('a dispute window of 1 day,');
  });

  it('prints an earlier tp-packet/1 version without a deadline section, and says why a deadline is not verified', () => {
    const { deadline: _deadline, lines, ...rest } = content;
    const earlier: PacketContentV1 = { ...rest, format: 'tp-packet/1', lines: lines.map(({ deadline: _line, calculation: _calculation, ...item }) => item) };
    const printed = packetHtml(insertIdentifiers(earlier, exported.narrative, identifiers), approval);
    expect(printed).not.toContain('The dispute is filed by');
    expect(printed).toContain('Line schedule');
    for (const cause of DEADLINE_UNVERIFIED_CAUSES) {
      expect(deadlineText({ status: 'unverified', cause })).toMatch(/^not verified: .{20,}/);
    }
    expect(deadlineText({ status: 'verified', cause: null })).toBe('verified');
    expect(deadlineText({ status: 'not_applicable', cause: null })).toBe('no window');
  });

  it('has a sentence for every evidence gap', () => {
    for (const code of GAP_CODES) {
      expect(gapText(code).length).toBeGreaterThan(10);
    }
  });
});

describe('packetCsv', () => {
  it('lists each line with its identifiers, amounts in dollars, its interest apart and its trace, formulas refused', () => {
    const rows = packetCsv(exported).split('\r\n');
    expect(rows[0]).toBe(PACKET_CSV_COLUMNS.join(','));
    expect(rows[1]).toBe(
      `1,SYNCCN0001,'=SYNPCN0001,"SYNTHETIC, PATIENT <ONE>",SYNMBR1,2026-03-05,97110,,2,100.00,70.00,30.00,56.00,2026-05-01,2026-03-02,0.57,priced_line:30000000-0000-4000-8000-000000000001,2036-04-05,verified,contract,FIXED_SCHEDULE,100.00,100.00,14.00,${'a'.repeat(64)}`,
    );
    expect(rows[2]).toContain(',not on the remittance,');
    // Row 2's interest (its received date unknown) is empty, beside its trace.
    expect(rows[2]?.split(',').at(PACKET_CSV_COLUMNS.indexOf('interest'))).toBe('');
    expect(rows.at(-1)).toBe('');
  });
});
