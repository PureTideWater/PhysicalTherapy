import { PACKET_ATTESTATION_ITEMS } from '@tp/worker/packets';
import { PRICING_CHECK_CAUSES } from '@tp/worker/pricing';
import { describe, expect, it } from 'vitest';

import { ATTEST_INPUT } from '../routes/packets';
import { PRICING_BLOCKED_TEXT, PRICING_CAUSE_TEXT } from './pricing';
import { ATTESTED_WORDING_NOTE, ATTEST_CONFIRMATIONS, PACKET_CHECKLIST, attestedItems } from './review';

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

  it('W5: is the founder’s seven items (Q5 (a)), and the attest action’s schema requires exactly their boxes, built from the checklist', () => {
    expect(PACKET_ATTESTATION_ITEMS).toEqual(['figures', 'deadline', 'calculation', 'identifiers', 'payer_copy', 'files', 'independent']);
    expect(Object.keys(ATTEST_CONFIRMATIONS)).toEqual(PACKET_ATTESTATION_ITEMS.map((id) => `confirm_${id}`));
    expect(Object.keys(ATTEST_INPUT.shape).filter((key) => key.startsWith('confirm_'))).toEqual(PACKET_ATTESTATION_ITEMS.map((id) => `confirm_${id}`));
    const text = Object.fromEntries(PACKET_CHECKLIST.map((item) => [item.id, item.text]));
    expect(text.figures).toBe(
      'Every figure, date, code and count in the PDF and the CSV comes from the version’s records, its approval, or the practice’s correspondence contact (printed as set), and the verifier passed the narrative the export printed.',
    );
    // Above the first level the files state the level's own window without a clause (review of 2026-10-21).
    expect(text.deadline).toMatch(/\(shown on this page; the payer’s files state the window’s end and, at the first level, the clause or record behind it, not its verification\)\.$/);
    expect(text.calculation).toBe(
      'Each line’s calculation in the PDF is worded from its trace exactly as on this page: the method, each step, the fee schedule worksheet, the one rounding and the patient share, shown apart from expected; the CSV’s method, rounding and patient share match; each trace’s SHA-256 is on this page.',
    );
    // What each file carries: the CSV is the line schedule, its file named by the reference (review of 2026-10-21; each
    // row also leads with it, and the founder confirmed this wording as written on 2026-10-21).
    expect(text.payer_copy).toBe(
      'The PDF and the CSV are fit to send to the payer: the PDF names the practice and closes with its approval line, this reference and its correspondence contact; the CSV is its line schedule, its file named by this reference; neither carries a login, record ID, SHA-256 or internal note (those are on this page).',
    );
  });
});

describe('an attestation’s items as the review shows them', () => {
  it('are its own codes, in its own order, each in the checklist’s words today, a code no longer listed as itself, with a note saying so', () => {
    expect(attestedItems(['payer_copy', 'figures', 'coverage']).map((item) => item.id)).toEqual(['payer_copy', 'figures', 'coverage']);
    expect(attestedItems(['figures'])[0]?.text).toBe(PACKET_CHECKLIST[0].text);
    expect(attestedItems(['coverage'])[0]?.text).toBe('coverage');
    expect(ATTESTED_WORDING_NOTE).toBe('The attestation records each item by its code; the words shown are the checklist’s as it reads today.');
  });
});

/**
 * Why a version whose pricing is no longer current is not approved, exported, attested or written (audit item #4;
 * docs/adr/0061), as the review and the builder say it: words for every cause the database names, and a remedy
 * that is honest about what happens next. Nothing re-judges or refreshes a case until PR 11, and a stale line never
 * becomes current again, so no sentence promises either or offers waiting: the remedy is the case page's write-off,
 * then a new version written, approved and exported.
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
      // Waiting changes nothing: no case line becomes current again in this release.
      expect(text, step).not.toMatch(/\bwait/i);
    }
    for (const [cause, text] of Object.entries(PRICING_CAUSE_TEXT)) {
      expect(text, cause).not.toMatch(/\bwait/i);
    }
    // The builder's two say plainly that nothing refreshes the case yet; the attestation names what the practice does.
    expect(PRICING_BLOCKED_TEXT.approval).toMatch(/Nothing refreshes the case automatically yet/);
    expect(PRICING_BLOCKED_TEXT.export).toMatch(/Nothing refreshes the case automatically yet/);
    expect(PRICING_BLOCKED_TEXT.write).toMatch(/nothing refreshes the case automatically yet/);
    expect(PRICING_BLOCKED_TEXT.attestation).toMatch(/then writes, approves and exports the packet again$/);
  });
});
