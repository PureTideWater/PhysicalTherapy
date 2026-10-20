import { PACKET_ATTESTATION_ITEMS } from '@tp/worker/packets';
import { PRICING_CHECK_CAUSES } from '@tp/worker/pricing';
import { describe, expect, it } from 'vitest';

import { PRICING_BLOCKED_TEXT, PRICING_CAUSE_TEXT } from './pricing';
import { PACKET_CHECKLIST } from './review';

/**
 * The reviewer's checklist over a packet's export (D16) names exactly the codes the attestation holds,
 * each a code the database accepts (^[a-z][a-z_]{0,31}$), with a sentence a person confirms.
 */
describe('PACKET_CHECKLIST', () => {
  it('is the attestation’s codes, in order, each with its sentence', () => {
    expect(PACKET_CHECKLIST.map((item) => item.id)).toEqual([...PACKET_ATTESTATION_ITEMS]);
    for (const item of PACKET_CHECKLIST) {
      expect(item.id).toMatch(/^[a-z][a-z_]{0,31}$/);
      expect(item.text.length).toBeGreaterThan(30);
    }
  });
});

/**
 * Why a version whose pricing is no longer current is not approved, exported, attested or written (audit item #4;
 * docs/adr/0061), as the review and the builder say it: words for every cause the database names, and a remedy
 * that is honest about what happens next. Nothing re-judges or refreshes a case until PR 11, so no sentence
 * promises it; the remedy is the case page's write-off, or waiting.
 */
describe('the pricing check’s words', () => {
  it('name every cause the database returns, in words with no code, value or identifier', () => {
    expect(Object.keys(PRICING_CAUSE_TEXT).sort()).toEqual([...PRICING_CHECK_CAUSES].sort());
    for (const cause of PRICING_CHECK_CAUSES) {
      expect(PRICING_CAUSE_TEXT[cause], cause).not.toMatch(/[A-Z]{2,}_|\d|[0-9a-f]{8}-/);
    }
  });

  it('refuse each step with the remedy and never promise that the case is judged again or refreshed', () => {
    for (const [step, text] of Object.entries(PRICING_BLOCKED_TEXT)) {
      expect(text, step).toMatch(/pricing (is )?no longer current|on pricing no longer current/);
      expect(text, step).toMatch(/write[s]? the stale line off on the case page/);
      expect(text, step).not.toMatch(/judged again|re-judg|is refreshed|will be refreshed|automatically refreshe/i);
    }
    // The builder's two say plainly that nothing refreshes the case yet; the attestation names what the practice does.
    expect(PRICING_BLOCKED_TEXT.approval).toMatch(/Nothing refreshes the case automatically yet/);
    expect(PRICING_BLOCKED_TEXT.export).toMatch(/Nothing refreshes the case automatically yet/);
    expect(PRICING_BLOCKED_TEXT.write).toMatch(/nothing refreshes the case automatically yet/);
    expect(PRICING_BLOCKED_TEXT.attestation).toMatch(/then writes, approves and exports the packet again$/);
  });
});
