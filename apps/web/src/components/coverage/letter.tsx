import { Button, Input, Label } from '@tp/ui';
import type { ReactNode } from 'react';

import type { ContractOption } from '../../lib/contracts/contract-queries';
import { LETTER_CODES_PATTERN } from '../../lib/contracts/letter';
import { type RefusedDownload, downloadRefusal, keptCodes, keptId } from '../../lib/http/download-refusal';
import type { PayerOption } from '../../lib/remittances/queries';
import { DownloadRefusal } from '../download-refusal';
import { Figure } from './share';

/**
 * Coverage's request-to-payer letter (PRD 7: "create a request-to-payer letter for a missing schedule"): a GET form whose
 * file downloads while the page stays. The codes field takes the route's own rule as its pattern (letterCodes), so the
 * browser stops a mistyped code before the form is sent; the route's check stays the rule. A letter the route refuses
 * comes back here (payerLetter's returnTo; docs/adr/0079) with the entries it was asked for kept as the form's defaults,
 * and the refused control marked: its message under it, after "Error:", named first by its aria-describedby, and the
 * first marked control focused on arrival. A refusal of nothing the form can mark (a rate limit, say) is the download's
 * notice in its place. Nothing from the URL is ever said in words: a kept payer or contract is selected only when it is
 * one of the form's own options, and the kept codes are only the field's value.
 */

/** The page's search parameters, as Next gives them (awaited). */
export type LetterSearchParams = Readonly<Record<string, string | string[] | undefined>>;

/** The letter's controls in the form's order: a refusal marks some, and the first it marks takes the focus. */
const CONTROLS = ['payer', 'contract', 'codes'] as const;

type LetterControl = (typeof CONTROLS)[number];

/** Each marked control's message: the field's name and what to enter (brand.md: plain, a next step). */
const MESSAGES: Readonly<Record<LetterControl, ReactNode>> = {
  payer: 'Payer: choose one of the payers listed.',
  contract: 'The payer’s contract: choose one of this payer’s contracts, or None named.',
  codes: (
    <>
      Procedure codes: enter five-character codes separated by commas, such as <Figure>97110, 97530</Figure>, or leave the field blank.
    </>
  ),
};

/**
 * The controls a refusal marks: the refused fields the form holds for an invalid letter, and the payer for one the
 * route did not find (a payer that is not the practice's); none for any other refusal.
 */
function markedControls(refusal: RefusedDownload | null): ReadonlySet<LetterControl> {
  if (refusal?.status === 'not_found') {
    return new Set(['payer']);
  }
  return new Set(refusal?.status === 'invalid' ? CONTROLS.filter((control) => refusal.fields.includes(control)) : []);
}

/** A query parameter's one value; a repeated key is none. */
function single(searchParams: LetterSearchParams, key: string): string | undefined {
  const value = searchParams[key];
  return typeof value === 'string' ? value : undefined;
}

/** A control's marks: aria-invalid and its message first in its description when refused, then its hint, and the focus when it is the first marked. */
function controlMarks(control: LetterControl, marked: ReadonlySet<LetterControl>, hint?: string) {
  const refused = marked.has(control);
  const describedBy = [refused ? `letter-${control}-error` : null, hint ?? null].filter((id) => id !== null).join(' ');
  return {
    'aria-invalid': refused ? true : undefined,
    'aria-describedby': describedBy === '' ? undefined : describedBy,
    autoFocus: CONTROLS.find((each) => marked.has(each)) === control ? true : undefined,
  } as const;
}

/** A marked control's message, under it; "Error:" says it in words, never by its colour alone. */
function LetterError({ control, marked }: { readonly control: LetterControl; readonly marked: ReadonlySet<LetterControl> }) {
  return marked.has(control) ? (
    <p id={`letter-${control}-error`} className="text-xs text-destructive" data-field-error={control}>
      Error: {MESSAGES[control]}
    </p>
  ) : null;
}

/** The select's look, today's, with a refused one's border (as Input marks aria-invalid) and room under the sticky header when focused. */
const SELECT = 'h-9 max-w-full scroll-mt-18 rounded-md border bg-background px-2 text-sm aria-invalid:border-destructive';

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
  const payer = payers.some((option) => option.id === kept.payer) ? kept.payer : undefined;
  const contract = contracts.some((option) => option.id === kept.contract && named.some((each) => each.id === option.payerId)) ? kept.contract : undefined;
  return (
    <>
      {marked.size === 0 || payers.length === 0 ? <DownloadRefusal refusal={refusal} /> : null}
      {payers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Payers appear once their 835s load.</p>
      ) : (
        <form method="get" action={`${path}/letter`} className="grid max-w-xl gap-3" aria-label="Letter">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="letter-payer">Payer</Label>
            <select id="letter-payer" name="payer" required defaultValue={payer} className={SELECT} {...controlMarks('payer', marked)}>
              {payers.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            <LetterError control="payer" marked={marked} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="letter-contract">The payer’s contract (optional)</Label>
            <select id="letter-contract" name="contract" defaultValue={contract} className={SELECT} {...controlMarks('contract', marked)}>
              <option value="">None named</option>
              {named.map((each) => (
                <optgroup key={each.id} label={each.name}>
                  {contracts
                    .filter((option) => option.payerId === each.id)
                    .map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.title}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <LetterError control="contract" marked={marked} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="letter-codes">Procedure codes (optional)</Label>
            <Input
              id="letter-codes"
              name="codes"
              placeholder="97110, 97530"
              defaultValue={kept.codes}
              pattern={LETTER_CODES_PATTERN}
              maxLength={400}
              autoCapitalize="characters"
              spellCheck={false}
              className="scroll-mt-18 font-mono tabular-nums"
              {...controlMarks('codes', marked, 'letter-codes-hint')}
            />
            <LetterError control="codes" marked={marked} />
            <p id="letter-codes-hint" className="text-xs text-muted-foreground">
              Five-character codes separated by commas, such as <Figure>97110, 97530</Figure>. Leave blank to ask for the whole schedule.
            </p>
          </div>
          <div>
            <Button type="submit" variant="outline">
              Download the letter
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
