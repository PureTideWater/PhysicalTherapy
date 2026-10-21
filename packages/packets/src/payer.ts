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
 *   practice-management system names it, not an identifier (the vendors' formats are unconfirmed; ADR 0060);
 * - a plan the remittance names only by its claim filing indicator (`CLP06:12`, no REF CE) by its type in words, "plan
 *   type Preferred Provider Organization (PPO)", since the indicator is a code of a closed X12 list, not an identifier
 *   (the founder's ruling of 2026-10-21, option (a); CLAIM_FILING_INDICATOR_TEXT); one whose indicator is ZZ (Mutually
 *   Defined), which names no type, not at all (option (b)); and one whose indicator has no words in no copy: the
 *   worker refuses the copy (PayerCopyWordsError, apps/worker/src/packets/words.ts), as it refuses every closed list's
 *   code without its words.
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

/** The qualifier the 835's loader writes before a claim filing indicator, the plan's key when no REF CE is sent (apps/worker/src/parse/plan.ts). */
const FILING_INDICATOR_QUALIFIER = 'CLP06';
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
 * CLP06, the claim filing indicator code (X12 element 1032), in words: the description the X12 005010X221A1 code list
 * gives each code (the founder's ruling of 2026-10-21, audit item #37 part 1, option (a); docs/adr/0061, Verification
 * fix (2026-10-21)). It holds every code of the 835's own claim_filing_indicator set and no other
 * (packages/edi835/src/code-lists.ts; apps/worker/src/packets/words.test.ts holds the two lists to each other, both
 * ways), so a code added there without its words here refuses the payer's copy before it can reach a payer. The one
 * table for both the payer's copy (planText()) and the verifier's facts, which quote the plan as the copy prints it.
 */
export const CLAIM_FILING_INDICATOR_TEXT: Readonly<Record<string, string>> = {
  '12': 'Preferred Provider Organization (PPO)',
  '13': 'Point of Service (POS)',
  '14': 'Exclusive Provider Organization (EPO)',
  '15': 'Indemnity Insurance',
  '16': 'Health Maintenance Organization (HMO) Medicare Risk',
  '17': 'Dental Maintenance Organization',
  AM: 'Automobile Medical',
  CH: 'Champus',
  DS: 'Disability',
  HM: 'Health Maintenance Organization',
  LM: 'Liability Medical',
  MA: 'Medicare Part A',
  MB: 'Medicare Part B',
  MC: 'Medicaid',
  OF: 'Other Federal Program',
  TV: 'Title V',
  VA: 'Veterans Affairs Plan',
  WC: "Workers' Compensation Health Claim",
  ZZ: 'Mutually Defined',
};

/** The claim filing indicator that names no type (Mutually Defined): a plan known only by it is left off the copy (option (b)). */
const UNTYPED_FILING_INDICATOR = 'ZZ';

/**
 * What the payer's copy names the plan by: its name (`name`); else, for an ERA export's plan (`PLAN:<plan>`), the plan
 * as the export names it, which is a name too; else, for a plan known only by its claim filing indicator
 * (`CLP06:<code>`), its type in words (`type`), or nothing (`untyped`) when the indicator is ZZ, or no words
 * (`no_words`, with the code) when the table has none for it; else its identifier without its qualifier (`identifier`).
 */
export type PlanNaming =
  | { readonly kind: 'name' | 'identifier' | 'type'; readonly text: string }
  | { readonly kind: 'untyped' }
  | { readonly kind: 'no_words'; readonly code: string };

export function planName(payer: Pick<PayerIdentification, 'plan_key' | 'plan_name'>): PlanNaming {
  const name = payer.plan_name?.trim() ?? '';
  if (name !== '') {
    return { kind: 'name', text: name };
  }
  const { qualifier, identifier } = remittanceKey(payer.plan_key);
  if (qualifier === FILING_INDICATOR_QUALIFIER) {
    if (identifier === UNTYPED_FILING_INDICATOR) {
      return { kind: 'untyped' };
    }
    const type = Object.hasOwn(CLAIM_FILING_INDICATOR_TEXT, identifier) ? CLAIM_FILING_INDICATOR_TEXT[identifier] : undefined;
    return type === undefined ? { kind: 'no_words', code: identifier } : { kind: 'type', text: type };
  }
  return { kind: qualifier === PLAN_QUALIFIER ? 'name' : 'identifier', text: identifier };
}

/**
 * The plan as the payer's copy prints it: "plan SYNTHETIC PLAN NAME" (an ERA export's "plan SYNTHETIC PPO 01" too),
 * "plan identifier SYNPLAN-FIX-ONE" when no name is known, or "plan type Preferred Provider Organization (PPO)" for a
 * plan known only by its claim filing indicator; null when the copy leaves the plan out: an indicator that names no
 * type (ZZ), or one with no words, for which the worker refuses the copy rather than print it (./words.ts there).
 */
export function planText(payer: Pick<PayerIdentification, 'plan_key' | 'plan_name'>): string | null {
  const plan = planName(payer);
  switch (plan.kind) {
    case 'name':
      return `plan ${plan.text}`;
    case 'identifier':
      return `plan identifier ${plan.text}`;
    case 'type':
      return `plan type ${plan.text}`;
    case 'untyped':
    case 'no_words':
      return null;
  }
}

/** The payer and the plan as the payer's copy's identification and cover print them: "<payer>, <plan>", or "<payer>" when the copy leaves the plan out. */
export function payerAndPlanText(payer: Pick<PayerIdentification, 'name' | 'payer_id_raw' | 'plan_key' | 'plan_name'>): string {
  const plan = planText(payer);
  return plan === null ? payerText(payer) : `${payerText(payer)}, ${plan}`;
}
