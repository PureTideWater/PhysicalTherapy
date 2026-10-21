import type { PayerIdentification } from './format';

/**
 * The payer and the plan as the payer's copy names them (audit item #37 part 1, D2; the verification of 2026-10-21;
 * docs/adr/0061). The record keeps each in its remittance-key form, the qualifier the loader wrote before the first
 * colon and the identifier after it as the remittance sent it: a payer's `2U:<id>` (REF 2U), `XV:<id>` (N103 and N104),
 * `TRN03:<id>` (the originating company) or an ERA export's `NAME:<payer>`, and a plan's `CE:<id>` (REF CE),
 * `CLP06:<filing indicator>` or an ERA export's `PLAN:<plan>` (apps/worker/src/parse/plan.ts and era/normalize.ts). The
 * review page and the mapping screens show that form; the payer's copy never prints a qualifier code:
 *
 * - the payer by its name with its identifier in words, "SYNTHETIC PAYER Q (payer ID SYNPAYERQ)", or by its name alone
 *   when its key is its name (an ERA export names no payer ID);
 * - the plan by its name, "plan SYNTHETIC PLAN NAME", or "plan identifier SYNPLAN-FIX-ONE" when no name is known.
 *
 * The verifier's facts quote the plan as the copy prints it (./facts.ts), so a narrative states no key either. Pure and
 * browser-safe.
 */

/** A remittance key in its parts: the qualifier before its first colon (null for a value written without one) and the identifier. */
export interface RemittanceKey {
  readonly qualifier: string | null;
  readonly identifier: string;
}

const QUALIFIED = /^([A-Za-z0-9]+):([\s\S]*)$/;

/** The qualifier an ERA export writes before the payer's name, which is the payer's whole key (ADR 0060). */
const NAME_QUALIFIER = 'NAME';

/** A remittance key's qualifier and identifier: "2U:SYNPAYERQ" is 2U and SYNPAYERQ, "TRN03:1999999999" is TRN03 and 1999999999. */
export function remittanceKey(key: string): RemittanceKey {
  const match = QUALIFIED.exec(key.trim());
  return match === null ? { qualifier: null, identifier: key.trim() } : { qualifier: match[1] ?? null, identifier: (match[2] ?? '').trim() };
}

/** The payer as the payer's copy names it: "SYNTHETIC PAYER Q (payer ID SYNPAYERQ)", or its name alone when its key is its name. */
export function payerText(payer: Pick<PayerIdentification, 'name' | 'payer_id_raw'>): string {
  const { qualifier, identifier } = remittanceKey(payer.payer_id_raw);
  return qualifier === NAME_QUALIFIER || identifier === '' ? payer.name : `${payer.name} (payer ID ${identifier})`;
}

/** The plan's name, or its identifier without its qualifier when no name is known: what the payer's copy names the plan by. */
export function planName(payer: Pick<PayerIdentification, 'plan_key' | 'plan_name'>): { readonly kind: 'name' | 'identifier'; readonly text: string } {
  const name = payer.plan_name?.trim() ?? '';
  return name === '' ? { kind: 'identifier', text: remittanceKey(payer.plan_key).identifier } : { kind: 'name', text: name };
}

/** The plan as the payer's copy names it: "plan SYNTHETIC PLAN NAME", or "plan identifier SYNPLAN-FIX-ONE" when no name is known. */
export function planText(payer: Pick<PayerIdentification, 'plan_key' | 'plan_name'>): string {
  const plan = planName(payer);
  return plan.kind === 'name' ? `plan ${plan.text}` : `plan identifier ${plan.text}`;
}

/** The payer and the plan as the payer's copy's identification and cover print them: "<payer>, <plan>". */
export function payerAndPlanText(payer: Pick<PayerIdentification, 'name' | 'payer_id_raw' | 'plan_key' | 'plan_name'>): string {
  return `${payerText(payer)}, ${planText(payer)}`;
}
