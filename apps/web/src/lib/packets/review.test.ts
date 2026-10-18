import { PACKET_ATTESTATION_ITEMS } from '@tp/worker/packets';
import { describe, expect, it } from 'vitest';

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
