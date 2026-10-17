import { describe, expect, it } from 'vitest';

import { PACKET_CSV_COLUMNS, packetCsv } from './csv';
import { GAP_CODES, gapText, packetHtml } from './html';
import { approval, exported } from './test-support/exported-packet';
import { chromiumInstalled } from '../report/pdf';
import { amountsNotInMono } from '../report/test-support/figures';

/**
 * The export's documents (PRD 12, The packet; CAS-11, CAS-12, CAS-15): the HTML the worker prints to
 * PDF and the CSV schedule, from a SYNTHETIC version with its identifiers inserted.
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
      `1,SYNCCN0001,'=SYNPCN0001,"SYNTHETIC, PATIENT <ONE>",SYNMBR1,2026-03-05,97110,,2,100.00,70.00,30.00,56.00,2026-05-01,2026-03-02,0.57,priced_line:30000000-0000-4000-8000-000000000001`,
    );
    expect(rows[2]).toContain(',not on the remittance,');
    expect(rows[2]?.split(',').at(-2)).toBe('');
    expect(rows.at(-1)).toBe('');
  });
});
