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
 * - the plan by its name, "plan SYNTHETIC PLAN NAME", or "plan identifier SYNPLAN-FIX-ONE" when no name is known; an ERA
 *   export's plan as the export names it, "plan SYNTHETIC PPO 01", since its Plan column holds the plan as the
 *   practice-management system names it, not an identifier (the vendors' formats are unconfirmed; ADR 0060). A plan
 *   the remittance names only by its claim filing indicator (`CLP06:12`, no REF CE) prints as "plan identifier 12",
 *   the code as sent, until the founder rules on its words (ADR 0061, Verification fix (2026-10-21), open).
 *
 * A narrative states no key either: the verifier's facts quote the plan as the copy prints it (./facts.ts), and the
 * verifier's scanner reads any token led by a qualifier code (QUALIFIED_IDENTIFIER) as an identifier, digit or not
 * (./scan.ts), so a narrative holding a key no input quotes ("CE:SYNPLAN-FIX-ONE", "XV:SYNPAYERXV", "NAME:SYNTHETIC")
 * fails it (figure_not_in_input) while it is typed, and cannot be approved or exported. Pure and browser-safe.
 */

/**
 * An identifier led by a remittance key's qualifier code: two capital letters or digits and a colon (`2U:`, `XV:`,
 * `CE:`), or one of the longer qualifiers the loaders write (`TRN03:`, `CLP06:`, an ERA export's `NAME:` and `PLAN:`),
 * with the identifier after it, up to a space, a comma, a semicolon or a closing parenthesis. The verifier's scanner
 * reads one as an identifier (./scan.ts), and the payer's copy's leak scan finds one in a copy
 * (apps/worker/src/packets/test-support/payer-copy.ts). Global: read it with matchAll, or copy it before exec or test.
 */
export const QUALIFIED_IDENTIFIER = /(?<![A-Za-z0-9])(?:[A-Z0-9]{2}|TRN03|CLP06|NAME|PLAN):[A-Za-z0-9][^\s,;)]*/g;

/** A remittance key in its parts: the qualifier before its first colon (null for a value written without one) and the identifier. */
export interface RemittanceKey {
  readonly qualifier: string | null;
  readonly identifier: string;
}

const QUALIFIED = /^([A-Za-z0-9]+):([\s\S]*)$/;

/** The qualifier an ERA export writes before the payer's name, which is the payer's whole key (ADR 0060). */
const NAME_QUALIFIER = 'NAME';
/** The qualifier an ERA export writes before the plan as the export names it, which is the plan's whole key (ADR 0060). */
const PLAN_QUALIFIER = 'PLAN';

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

/**
 * What the payer's copy names the plan by: its name; else, for an ERA export's plan (`PLAN:<plan>`), the plan as the
 * export names it, which is a name too; else its identifier without its qualifier.
 */
export function planName(payer: Pick<PayerIdentification, 'plan_key' | 'plan_name'>): { readonly kind: 'name' | 'identifier'; readonly text: string } {
  const name = payer.plan_name?.trim() ?? '';
  if (name !== '') {
    return { kind: 'name', text: name };
  }
  const { qualifier, identifier } = remittanceKey(payer.plan_key);
  return { kind: qualifier === PLAN_QUALIFIER ? 'name' : 'identifier', text: identifier };
}

/**
 * The plan as the payer's copy names it: "plan SYNTHETIC PLAN NAME" (an ERA export's "plan SYNTHETIC PPO 01" too), or
 * "plan identifier SYNPLAN-FIX-ONE" when no name is known.
 */
export function planText(payer: Pick<PayerIdentification, 'plan_key' | 'plan_name'>): string {
  const plan = planName(payer);
  return plan.kind === 'name' ? `plan ${plan.text}` : `plan identifier ${plan.text}`;
}

/** The payer and the plan as the payer's copy's identification and cover print them: "<payer>, <plan>". */
export function payerAndPlanText(payer: Pick<PayerIdentification, 'name' | 'payer_id_raw' | 'plan_key' | 'plan_name'>): string {
  return `${payerText(payer)}, ${planText(payer)}`;
}
