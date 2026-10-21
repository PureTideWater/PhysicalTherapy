import { describe, expect, it } from 'vitest';

import { payerAndPlanText, payerText, planName, planText, remittanceKey } from './payer';
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
    // A value written without a qualifier is its own identifier.
    expect(remittanceKey('SYNTH-PAYER-1')).toEqual({ qualifier: null, identifier: 'SYNTH-PAYER-1' });
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
  });

  it('names the plan by its name, or by "plan identifier <id>" when no name is known', () => {
    expect(planText(payer('2U:SYNPAYERQ', 'CE:SYNPLAN-FIX-ONE'))).toBe('plan identifier SYNPLAN-FIX-ONE');
    expect(planText(payer('2U:SYNPAYERQ', 'CLP06:12'))).toBe('plan identifier 12');
    expect(planText(payer('NAME:SYNTHETIC PAYER Q', 'PLAN:SYNTHETIC PPO 01'))).toBe('plan identifier SYNTHETIC PPO 01');
    expect(planText(payer('2U:SYNPAYERQ', 'CE:SYNPLAN-FIX-ONE', 'SYNTHETIC PLAN NAME'))).toBe('plan SYNTHETIC PLAN NAME');
    // A blank name is no name.
    expect(planName(payer('2U:SYNPAYERQ', 'CE:SYNPLAN-FIX-ONE', '  '))).toEqual({ kind: 'identifier', text: 'SYNPLAN-FIX-ONE' });
    expect(planName(payer('2U:SYNPAYERQ', 'CE:SYNPLAN-FIX-ONE', 'SYNTHETIC PLAN NAME'))).toEqual({ kind: 'name', text: 'SYNTHETIC PLAN NAME' });
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
      expect(printed).not.toContain(payerIdRaw);
      expect(printed).not.toContain(planKey);
    }
    expect(payerAndPlanText(payer('2U:SYNPAYERQ', 'CE:SYNPLAN-FIX-ONE'))).toBe('SYNTHETIC PAYER Q (payer ID SYNPAYERQ), plan identifier SYNPLAN-FIX-ONE');
  });
});
