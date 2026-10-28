import { Button, Input, Label } from '@tp/ui';

import type { ContractOption } from '../../lib/contracts/contract-queries';
import { LETTER_CODES_PATTERN } from '../../lib/contracts/letter';
import { type RefusedDownload, downloadRefusal, keptCodes, keptId } from '../../lib/http/download-refusal';
import type { PayerOption } from '../../lib/remittances/queries';
import { DownloadRefusal } from '../download-refusal';
import { SelectField } from '../field';
import { LetterContractCheck, contractOwners } from './letter-contract-check';
import { LetterMarks } from './letter-marks';
import { Figure } from './share';

/**
 * Coverage's request-to-payer letter (PRD 7: "create a request-to-payer letter for a missing schedule"): a GET form whose
 * file downloads while the page stays. The codes field takes the route's own rule as its pattern (letterCodes), and the
 * contract is held to the payer chosen (LetterContractCheck), so the browser stops a mistyped code or another payer's
 * contract before the form is sent; the route's check stays the rule. Each select is the shared SelectField, which
 * shows a choice it cuts short whole under it (showChosen; docs/adr/0077 D6). A letter the route refuses comes back here
 * (payerLetter's returnTo; docs/adr/0079) with the entries it was asked for kept as the form's defaults, and the refused
 * control marked: its message under it, after "Error:", named first by its aria-describedby, and the first marked
 * control focused on arrival; a payer the route did not find comes back unanswered ("Choose a payer"), never as another
 * payer shown under its mark. A mark clears as the person edits its control (the contract's also once a change of the
 * payer makes the pair hold), and a letter sent clears them all and takes the refusal and its entries out of the
 * address bar (LetterMarks). A refusal of nothing the form can mark (a rate limit, say) is the download's notice in its
 * place, and the entries leave the address bar with it. Nothing from the URL is ever said in words: a kept payer or
 * contract is selected only when it is one of the form's own options, and the kept codes are only the field's value.
 */

/** The page's search parameters, as Next gives them (awaited). */
export type LetterSearchParams = Readonly<Record<string, string | string[] | undefined>>;

/**
 * The letter's controls in the form's order: a refusal marks some, and the first it marks takes the focus. They are
 * also the entries payerLetter's returnTo keeps beside a refusal (a test holds them equal), so a shown notice or a sent
 * letter takes them out of the address bar with it.
 */
export const LETTER_CONTROLS = ['payer', 'contract', 'codes'] as const;

type LetterControl = (typeof LETTER_CONTROLS)[number];

/**
 * Each marked control's message: what is wrong or what to choose; the label names the field and the hint gives the
 * format (brand.md: plain, a next step).
 */
const MESSAGES: Readonly<Record<LetterControl, string>> = {
  payer: 'Choose one of the payers listed.',
  contract: 'Choose one of this payer’s contracts, or None named.',
  codes: 'Each code must be five letters or digits.',
};

/**
 * The controls a refusal marks: the refused fields the form holds for an invalid letter, and the payer for one the
 * route did not find (a payer that is not the practice's); none for any other refusal.
 */
function markedControls(refusal: RefusedDownload | null): ReadonlySet<LetterControl> {
  if (refusal?.status === 'not_found') {
    return new Set(['payer']);
  }
  return new Set(refusal?.status === 'invalid' ? LETTER_CONTROLS.filter((control) => refusal.fields.includes(control)) : []);
}

/** A query parameter's one value; a repeated key is none. */
function single(searchParams: LetterSearchParams, key: string): string | undefined {
  const value = searchParams[key];
  return typeof value === 'string' ? value : undefined;
}

/** A control's element id and its message's, one rule for the form, its descriptions and its client checks. */
const controlId = (control: LetterControl) => `letter-${control}`;
const errorId = (control: LetterControl) => `letter-${control}-error`;

/**
 * The other controls whose change can answer a control's refusal: a contract refused as not the payer's is answered by
 * choosing the contract's payer too, and LetterMarks clears its mark once the pair holds.
 */
const ANSWERED_BY: Readonly<Partial<Record<LetterControl, readonly LetterControl[]>>> = { contract: ['payer'] };

/**
 * A control's aria-describedby: its message first when refused, then its hint. Each control writes it as an attribute
 * of its own, never through a spread, so a static check of the form (ux-forms' FRM-04) sees that a field is described.
 */
function describedBy(control: LetterControl, marked: ReadonlySet<LetterControl>, hint?: string): string | undefined {
  const ids = [marked.has(control) ? errorId(control) : null, hint ?? null].filter((id) => id !== null).join(' ');
  return ids === '' ? undefined : ids;
}

/** A refused control's marks: aria-invalid, and the focus when it is the first marked. */
function invalidMarks(control: LetterControl, marked: ReadonlySet<LetterControl>) {
  return {
    'aria-invalid': marked.has(control) ? true : undefined,
    autoFocus: LETTER_CONTROLS.find((each) => marked.has(each)) === control ? true : undefined,
  } as const;
}

/** A marked control's message, under it; "Error:" says it in words, never by its colour alone. */
function LetterError({ control, marked }: { readonly control: LetterControl; readonly marked: ReadonlySet<LetterControl> }) {
  return marked.has(control) ? (
    <p id={errorId(control)} className="text-xs text-destructive" data-field-error={control}>
      Error: {MESSAGES[control]}
    </p>
  ) : null;
}

/**
 * The select's look, today's: the width of its column and never wider (w-full min-w-0 in a min-w-0 column, so a long
 * contract title never widens the page at 390 px; docs/adr/0078), with a refused one's border (as Input marks
 * aria-invalid) and room under the sticky header when focused. It replaces SelectField's own classes.
 */
const SELECT = 'h-9 w-full min-w-0 scroll-mt-18 rounded-md border bg-background px-2 text-sm aria-invalid:border-destructive';

/**
 * The letter's form (or, before any 835 has loaded a payer, why there is none), with a refused letter's marks and
 * entries read from the page's search parameters (display only: no read and no audit event).
 */
export function PayerLetter({
  path,
  payers,
  contracts,
  searchParams,
}: {
  /** Coverage's path; the form is sent to its letter route. */
  readonly path: string;
  readonly payers: readonly PayerOption[];
  readonly contracts: readonly ContractOption[];
  readonly searchParams: LetterSearchParams;
}) {
  const refusal = downloadRefusal(searchParams);
  const marked = markedControls(refusal);
  // The entries a refused letter was asked for, each kept as the route keeps it; a plain visit keeps none.
  const kept: Readonly<Partial<Record<LetterControl, string>>> =
    refusal === null ? {} : { payer: keptId(single(searchParams, 'payer')), contract: keptId(single(searchParams, 'contract')), codes: keptCodes(single(searchParams, 'codes')) };
  const named = payers.filter((payer) => contracts.some((contract) => contract.payerId === payer.id));
  const listed = contracts.filter((option) => named.some((each) => each.id === option.payerId));
  const payer = payers.some((option) => option.id === kept.payer) ? kept.payer : undefined;
  const contract = listed.some((option) => option.id === kept.contract) ? kept.contract : undefined;
  // A marked payer that is none of the options starts unanswered, so the mark never sits under a payer nobody chose and
  // the select's required holds the next letter until one is.
  const choose = marked.has('payer') && payer === undefined;
  return (
    <>
      {marked.size === 0 || payers.length === 0 ? <DownloadRefusal refusal={refusal} forget={LETTER_CONTROLS} /> : null}
      {payers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Payers appear once their 835s load.</p>
      ) : (
        <form method="get" action={`${path}/letter`} className="grid max-w-xl grid-cols-1 gap-3" aria-label="Letter">
          <div className="flex min-w-0 flex-col gap-1.5">
            <SelectField
              id={controlId('payer')}
              label="Payer"
              name="payer"
              required
              options={[...(choose ? [{ value: '', label: 'Choose a payer' }] : []), ...payers.map((option) => ({ value: option.id, label: option.name }))]}
              showChosen
              defaultValue={choose ? '' : payer}
              className={SELECT}
              aria-describedby={describedBy('payer', marked)}
              {...invalidMarks('payer', marked)}
            />
            <LetterError control="payer" marked={marked} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <SelectField
              id={controlId('contract')}
              label="The payer’s contract (optional)"
              name="contract"
              options={[
                { value: '', label: 'None named' },
                ...named.map((each) => ({ group: each.name, options: listed.filter((option) => option.payerId === each.id).map((option) => ({ value: option.id, label: option.title })) })),
              ]}
              showChosen
              defaultValue={contract}
              className={SELECT}
              aria-describedby={describedBy('contract', marked)}
              {...invalidMarks('contract', marked)}
            />
            <LetterError control="contract" marked={marked} />
            <LetterContractCheck payer={controlId('payer')} contract={controlId('contract')} owners={contractOwners(listed)} message={MESSAGES.contract} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={controlId('codes')}>Procedure codes (optional)</Label>
            <Input
              id={controlId('codes')}
              name="codes"
              defaultValue={kept.codes}
              pattern={LETTER_CODES_PATTERN}
              maxLength={400}
              autoCapitalize="characters"
              spellCheck={false}
              className="scroll-mt-18 font-mono tabular-nums"
              aria-describedby={describedBy('codes', marked, 'letter-codes-hint')}
              {...invalidMarks('codes', marked)}
            />
            <LetterError control="codes" marked={marked} />
            <p id="letter-codes-hint" className="text-sm text-muted-foreground">
              Five-character codes separated by commas, such as <Figure>97110</Figure>, <Figure>97530</Figure>. Leave blank to ask for the whole schedule.
            </p>
          </div>
          <div>
            <Button type="submit" variant="outline">
              Download the letter
            </Button>
          </div>
          {marked.size === 0 ? null : (
            <LetterMarks
              marks={[...marked].map((control) => ({ control: controlId(control), message: errorId(control), also: ANSWERED_BY[control]?.map(controlId) }))}
              forget={LETTER_CONTROLS}
            />
          )}
        </form>
      )}
    </>
  );
}
