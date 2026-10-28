import type * as React from 'react';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ActionState } from '../../lib/http/next';
import { DOLLARS_MESSAGE } from '../../lib/money-input';
import { MaterialityCard, PursuitCard } from './defaults';

/**
 * Settings → Defaults (test matrix CAS-38): the materiality thresholds and the pursuit cost's staff rate are stored
 * in cents and shown in dollars, each figure in the mono face, and the dollar fields are pre-filled with the dollars
 * the save reads back to the same cents. A refusal names each field by its label. SYNTHETIC values.
 */

/** The state each ActionForm renders: none, unless a test sets the refusal a save returned. */
const shown = vi.hoisted(() => ({ state: undefined as ActionState | undefined }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return {
    ...actual,
    useActionState: <S,>(action: unknown, initial: S): [S, () => void, boolean] => [(shown.state as S | undefined) ?? initial, () => undefined, false],
  };
});
afterEach(() => {
  shown.state = undefined;
});

const action = (state: ActionState): Promise<ActionState> => Promise.resolve(state);
const PRACTICE = '00000000-0000-4000-8000-0000000000c1';
const PURSUIT = { staffRateCentsPerHour: '4500', minutesPerPacket: 45, minutesPerFollowUp: 10 };

/** The card's markup and how many request keys it made; each call of formKeys makes its own, as the page's FormKeys does. */
function rendered(card: (formKeys: () => ReactNode) => ReactElement): { readonly html: string; readonly keys: number } {
  let keys = 0;
  const html = renderToStaticMarkup(
    card(() => {
      keys += 1;
      return <input type="hidden" name="requestKey" value={`synthetic-request-key-${String(keys)}`} />;
    }),
  );
  return { html, keys };
}

function materiality(lineCents: string, caseCents: string, canEdit = true) {
  return rendered((formKeys) => <MaterialityCard practiceId={PRACTICE} materiality={{ lineCents, caseCents }} canEdit={canEdit} action={action} formKeys={formKeys} />);
}

function pursuit(value: typeof PURSUIT | null, canEdit = true) {
  return rendered((formKeys) => <PursuitCard practiceId={PRACTICE} pursuit={value} canEdit={canEdit} action={action} formKeys={formKeys} />);
}

/** The card's words, tags dropped. */
function words(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, '’');
}

/** What a field is pre-filled with. */
function valueOf(html: string, name: string): string | undefined {
  const input = new RegExp(`<input[^>]*name="${name}"[^>]*>`).exec(html)?.[0] ?? '';
  return /value="([^"]*)"/.exec(input)?.[1];
}

/** The names of the fields a person fills (hidden fields left out). */
function controls(html: string): string[] {
  return [...html.matchAll(/<input(?![^>]*type="hidden")[^>]*name="([^"]+)"/g)].map((match) => match[1] ?? '');
}

/**
 * The refusal the form shows when a save refuses every field it has, from its summary to its last field, as its words,
 * one space between elements. Rendered on the server, the summary's items are the messages alone: the browser names
 * them from the labels on the page (docs/adr/0077), which each field shows above its "Error:" line.
 */
function refusedEvery(card: () => ReturnType<typeof rendered>): string {
  const names = controls(card().html);
  shown.state = { error: 'Fix the fields listed here, then try again.', invalid: true, issues: names.map((field) => ({ field, message: DOLLARS_MESSAGE })) };
  const summary = /<div[^>]*role="alert"[\s\S]*<\/div>/.exec(card().html)?.[0] ?? '';
  return summary.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&#x27;/g, '’');
}

/** The figures set in the mono face with tabular numerals. */
function monoFigures(html: string): string[] {
  return [...html.matchAll(/<span class="font-mono tabular-nums">([^<]*)<\/span>/g)].map((match) => match[1] ?? '');
}

describe('the materiality card (CAS-38)', () => {
  it('says the stored 1000 and 25000 cents as $10.00 per line and $250.00 per case, in a sentence that names the defaults, each figure in the mono face', () => {
    const { html } = materiality('1000', '25000');
    expect(words(html)).toContain('The thresholds are $10.00 per line and $250.00 per case; the defaults are $5.00 and $250.00.');
    expect(monoFigures(html)).toEqual(['$10.00', '$250.00', '$5.00', '$250.00']);
    expect(valueOf(html, 'lineMateriality')).toBe('10.00');
  });

  it('pre-fills the stored 500 and 25000 cents as 5.00 and 250.00, in money fields: the unit in the label, the decimal keyboard, the mono face', () => {
    const { html, keys } = materiality('500', '25000');
    expect(valueOf(html, 'lineMateriality')).toBe('5.00');
    expect(valueOf(html, 'caseMateriality')).toBe('250.00');
    expect(html).toContain('Per line (dollars)');
    expect(new RegExp('<input[^>]*name="caseMateriality"[^>]*>').exec(html)?.[0]).toMatch(/class="[^"]*font-mono tabular-nums[^"]*"[^>]*inputMode="decimal"|inputMode="decimal"[^>]*class="[^"]*font-mono tabular-nums/);
    expect(html).toContain(`<input type="hidden" name="practiceId" value="${PRACTICE}"/>`);
    expect(keys).toBe(1);
  });

  it('reads the edges of what a store holds: zero, a cent, and $9,999,999,999.99', () => {
    const zero = materiality('0', '1');
    expect(words(zero.html)).toContain('The thresholds are $0.00 per line and $0.01 per case;');
    expect([valueOf(zero.html, 'lineMateriality'), valueOf(zero.html, 'caseMateriality')]).toEqual(['0.00', '0.01']);
    const most = materiality('99', '999999999999');
    expect(monoFigures(most.html).slice(0, 2)).toEqual(['$0.99', '$9,999,999,999.99']);
    expect([valueOf(most.html, 'lineMateriality'), valueOf(most.html, 'caseMateriality')]).toEqual(['0.99', '9999999999.99']);
  });

  it('shows a refused save’s message under each field’s label, and never its key', () => {
    const summary = refusedEvery(() => materiality('500', '25000'));
    expect(summary).toContain(`Per line (dollars) Error: ${DOLLARS_MESSAGE}`);
    expect(summary).toContain(`Per case (dollars) Error: ${DOLLARS_MESSAGE}`);
    expect(summary).not.toMatch(/\b[a-z]+[A-Z]\w*:/);
    expect(controls(materiality('500', '25000').html)).toEqual(['lineMateriality', 'caseMateriality']);
  });

  it('shows the thresholds without a form to a role that does not work cases', () => {
    const { html, keys } = materiality('500', '25000', false);
    expect(words(html)).toContain('The thresholds are $5.00 per line and $250.00 per case;');
    expect(html).not.toContain('<form');
    expect(html).toContain('Changed by the people who work cases');
    expect(keys).toBe(0);
  });
});

describe('the pursuit card (CAS-38)', () => {
  it('says the stored 4500 cents an hour as $45.00, the minutes in the mono face, and pre-fills 45.00 and the minutes', () => {
    const { html, keys } = pursuit(PURSUIT);
    expect(words(html)).toContain('$45.00 an hour, 45 minutes a packet, 10 minutes a follow-up.');
    expect(monoFigures(html)).toEqual(['$45.00', '45', '10']);
    expect(valueOf(html, 'staffRatePerHour')).toBe('45.00');
    expect(valueOf(html, 'minutesPerPacket')).toBe('45');
    expect(valueOf(html, 'minutesPerFollowUp')).toBe('10');
    expect(keys).toBe(1);
  });

  it('says one minute in the singular, the count still in the mono face', () => {
    const { html } = pursuit({ ...PURSUIT, minutesPerPacket: 1, minutesPerFollowUp: 1 });
    expect(words(html)).toContain('$45.00 an hour, 1 minute a packet, 1 minute a follow-up.');
    expect(monoFigures(html)).toEqual(['$45.00', '1', '1']);
  });

  it('groups its three fields under a legend described by the rule that binds them, in the shared 14 px hint', () => {
    const { html } = pursuit(PURSUIT);
    expect(html).toMatch(
      /<fieldset[^>]*aria-describedby="pursuit-hint"[^>]*><legend[^>]*>Staff rate and times<\/legend><p id="pursuit-hint" class="text-sm text-muted-foreground">All three together, or all blank to clear.<\/p>/,
    );
    expect(controls(/<fieldset[\s\S]*<\/fieldset>/.exec(html)?.[0] ?? '')).toEqual(['staffRatePerHour', 'minutesPerPacket', 'minutesPerFollowUp']);
  });

  it('shows a refused save’s message under each field’s label, and never its key', () => {
    const summary = refusedEvery(() => pursuit(PURSUIT));
    expect(summary).toContain(`Staff rate per hour (dollars) Error: ${DOLLARS_MESSAGE}`);
    expect(summary).toContain('Minutes per packet Error: ');
    expect(summary).toContain('Minutes per follow-up Error: ');
    expect(summary).not.toMatch(/\b[a-z]+[A-Z]\w*:/);
    expect(controls(pursuit(PURSUIT).html)).toEqual(['staffRatePerHour', 'minutesPerPacket', 'minutesPerFollowUp']);
  });

  it('says when no pursuit cost is set and leaves its fields blank', () => {
    const { html } = pursuit(null);
    expect(words(html)).toContain('Not set: cases show no pursuit cost.');
    expect(monoFigures(html)).toEqual([]);
    expect(valueOf(html, 'staffRatePerHour')).toBe('');
    expect(valueOf(html, 'minutesPerPacket')).toBe('');
  });

  it('gives each form its own request key when the page renders both cards', () => {
    let made = 0;
    const formKeys = () => {
      made += 1;
      return <input type="hidden" name="requestKey" value={`synthetic-request-key-${String(made)}`} />;
    };
    const html = renderToStaticMarkup(
      <>
        <MaterialityCard practiceId={PRACTICE} materiality={{ lineCents: '500', caseCents: '25000' }} canEdit action={action} formKeys={formKeys} />
        <PursuitCard practiceId={PRACTICE} pursuit={PURSUIT} canEdit action={action} formKeys={formKeys} />
      </>,
    );
    expect([...html.matchAll(/name="requestKey" value="([^"]+)"/g)].map((match) => match[1])).toEqual(['synthetic-request-key-1', 'synthetic-request-key-2']);
  });
});
