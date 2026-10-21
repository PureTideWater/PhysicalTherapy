import { describe, expect, it } from 'vitest';

import { QUALIFIED_IDENTIFIER, payerAndPlanText, payerText, planName, planText, remittanceKey } from './payer';
import { IDS } from './test-support';

/**
 * The payer and the plan as the payer's copy names them (./payer.ts; audit item #37 part 1, D2; the verification of
 * 2026-10-21): every remittance-key form the loaders write, in words, never with its qualifier code. SYNTHETIC keys.
 */

const payer = (payerIdRaw: string, planKey: string, planNameText: string | null = null) => ({
  payer_id: IDS.payer,
  name: 'SYNTHETIC PAYER Q',
  payer_id_raw: payerIdRaw,
  plan_id: IDS.plan,
  plan_key: planKey,
  plan_name: planNameText,
});

describe('remittanceKey', () => {
  it('splits a key at its first colon into the qualifier the loader wrote and the identifier as sent', () => {
    expect(remittanceKey('2U:SYNPAYERQ')).toEqual({ qualifier: '2U', identifier: 'SYNPAYERQ' });
    expect(remittanceKey('XV:SYNPAYERXV')).toEqual({ qualifier: 'XV', identifier: 'SYNPAYERXV' });
    expect(remittanceKey('TRN03:1999999999')).toEqual({ qualifier: 'TRN03', identifier: '1999999999' });
    expect(remittanceKey('NAME:SYNTHETIC PAYER Q')).toEqual({ qualifier: 'NAME', identifier: 'SYNTHETIC PAYER Q' });
    expect(remittanceKey('CE:SYNPLAN-FIX-ONE')).toEqual({ qualifier: 'CE', identifier: 'SYNPLAN-FIX-ONE' });
    expect(remittanceKey('CLP06:12')).toEqual({ qualifier: 'CLP06', identifier: '12' });
    expect(remittanceKey('PLAN:SYNTHETIC PPO 01')).toEqual({ qualifier: 'PLAN', identifier: 'SYNTHETIC PPO 01' });
    // Only the first colon separates: an identifier keeps any colon of its own.
    expect(remittanceKey('CE:SYN:PLAN')).toEqual({ qualifier: 'CE', identifier: 'SYN:PLAN' });
    // A value written without a qualifier is its own identifier, and so is one whose part before its first colon is no qualifier.
    expect(remittanceKey('SYNTH-PAYER-1')).toEqual({ qualifier: null, identifier: 'SYNTH-PAYER-1' });
    expect(remittanceKey('SYN-2U:SYNPAYERQ')).toEqual({ qualifier: null, identifier: 'SYN-2U:SYNPAYERQ' });
    // Space around the key and its identifier is not part of either.
    expect(remittanceKey(' 2U: SYNPAYERQ ')).toEqual({ qualifier: '2U', identifier: 'SYNPAYERQ' });
    expect(remittanceKey(' SYNTH-PAYER-1 ')).toEqual({ qualifier: null, identifier: 'SYNTH-PAYER-1' });
  });
});

describe('QUALIFIED_IDENTIFIER', () => {
  const found = (text: string) => [...text.matchAll(QUALIFIED_IDENTIFIER)].map((match) => match[0]);

  it('finds an identifier led by a qualifier code: two capitals or digits and a colon, or the loaders’ longer qualifiers', () => {
    expect(found('(2U:SYNPAYERQ), XV:SYNPAYERXV; CE:SYNPLAN-FIX-ONE TRN03:1999999999 CLP06:12 NAME:SYNTHETIC PAYER Q PLAN:SYNTHETIC')).toEqual([
      '2U:SYNPAYERQ',
      'XV:SYNPAYERXV',
      'CE:SYNPLAN-FIX-ONE',
      'TRN03:1999999999',
      'CLP06:12',
      'NAME:SYNTHETIC',
      'PLAN:SYNTHETIC',
    ]);
  });

  it('finds none in the words the payer’s copy prints, nor in prose with a colon', () => {
    expect(found('SYNTHETIC PAYER Q (payer ID SYNPAYERQ), plan identifier SYNPLAN-FIX-ONE; plan SYNTHETIC PPO 01')).toEqual([]);
    expect(found('Re: the claims. RE: SYNPLAN, ce:synplan, ABC:DEF, xCE:SYNPLAN, a ratio of 1:2, {{member_id:1}}')).toEqual([]);
  });
});

describe('the payer and plan in the payer’s copy', () => {
  it('names the payer by its name with its identifier in words, or by its name alone when its key is its name', () => {
    expect(payerText(payer('2U:SYNPAYERQ', 'CE:SYNPLAN-FIX-ONE'))).toBe('SYNTHETIC PAYER Q (payer ID SYNPAYERQ)');
    expect(payerText(payer('XV:SYNPAYERXV', 'CE:SYNPLAN-FIX-ONE'))).toBe('SYNTHETIC PAYER Q (payer ID SYNPAYERXV)');
    expect(payerText(payer('TRN03:1999999999', 'CE:SYNPLAN-FIX-ONE'))).toBe('SYNTHETIC PAYER Q (payer ID 1999999999)');
    expect(payerText(payer('SYNTH-PAYER-1', 'CE:SYNPLAN-FIX-ONE'))).toBe('SYNTHETIC PAYER Q (payer ID SYNTH-PAYER-1)');
    // An ERA export names the payer by its name and no ID.
    expect(payerText(payer('NAME:SYNTHETIC PAYER Q', 'PLAN:SYNTHETIC PPO 01'))).toBe('SYNTHETIC PAYER Q');
    // A key with no identifier after its qualifier names no payer ID either.
    expect(payerText(payer('2U: ', 'CE:SYNPLAN-FIX-ONE'))).toBe('SYNTHETIC PAYER Q');
  });

  it('names the plan by its name (an ERA export’s plan as the export names it), or by "plan identifier <id>" when no name is known', () => {
    expect(planText(payer('2U:SYNPAYERQ', 'CE:SYNPLAN-FIX-ONE'))).toBe('plan identifier SYNPLAN-FIX-ONE');
    // The claim filing indicator as sent, with no words, until the founder rules on them (ADR 0061, open).
    expect(planText(payer('2U:SYNPAYERQ', 'CLP06:12'))).toBe('plan identifier 12');
    // An ERA export's Plan column holds the plan as the practice-management system names it, not an identifier.
    expect(planText(payer('NAME:SYNTHETIC PAYER Q', 'PLAN:SYNTHETIC PPO 01'))).toBe('plan SYNTHETIC PPO 01');
    expect(planName(payer('NAME:SYNTHETIC PAYER Q', 'PLAN:SYNTHETIC PPO 01'))).toEqual({ kind: 'name', text: 'SYNTHETIC PPO 01' });
    expect(planText(payer('2U:SYNPAYERQ', 'CE:SYNPLAN-FIX-ONE', 'SYNTHETIC PLAN NAME'))).toBe('plan SYNTHETIC PLAN NAME');
    // The plan's mapped name comes first, for an ERA export's plan too.
    expect(planText(payer('NAME:SYNTHETIC PAYER Q', 'PLAN:SYNTHETIC PPO 01', 'SYNTHETIC PLAN NAME'))).toBe('plan SYNTHETIC PLAN NAME');
    // A blank name is no name, and a name is printed without the space around it.
    expect(planName(payer('2U:SYNPAYERQ', 'CE:SYNPLAN-FIX-ONE', '  '))).toEqual({ kind: 'identifier', text: 'SYNPLAN-FIX-ONE' });
    expect(planName(payer('2U:SYNPAYERQ', 'CE:SYNPLAN-FIX-ONE', ' SYNTHETIC PLAN NAME '))).toEqual({ kind: 'name', text: 'SYNTHETIC PLAN NAME' });
  });

  it('prints no qualifier code for any key form: two characters and a colon, or the loaders’ longer qualifiers', () => {
    for (const [payerIdRaw, planKey] of [
      ['2U:SYNPAYERQ', 'CE:SYNPLAN-FIX-ONE'],
      ['XV:SYNPAYERXV', 'CLP06:12'],
      ['TRN03:1999999999', 'CE:SYNPLAN-FIX-ONE'],
      ['NAME:SYNTHETIC PAYER Q', 'PLAN:SYNTHETIC PPO 01'],
    ] as const) {
      const printed = payerAndPlanText(payer(payerIdRaw, planKey));
      expect(printed).not.toMatch(/(?:^|[^A-Za-z0-9])(?:[A-Z0-9]{2}|TRN03|CLP06|NAME|PLAN):/);
      expect(printed.match(QUALIFIED_IDENTIFIER)).toBeNull();
      expect(printed).not.toContain(payerIdRaw);
      expect(printed).not.toContain(planKey);
    }
    expect(payerAndPlanText(payer('2U:SYNPAYERQ', 'CE:SYNPLAN-FIX-ONE'))).toBe('SYNTHETIC PAYER Q (payer ID SYNPAYERQ), plan identifier SYNPLAN-FIX-ONE');
  });
});
