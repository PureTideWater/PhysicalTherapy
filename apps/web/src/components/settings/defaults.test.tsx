import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { ActionState } from '../../lib/http/next';
import { MaterialityCard, PursuitCard } from './defaults';

/**
 * Settings → Defaults (test matrix CAS-38): the materiality thresholds and the pursuit cost's staff rate are stored
 * in cents and shown in dollars, each figure in the mono face, and the dollar fields are pre-filled with the dollars
 * the save reads back to the same cents. SYNTHETIC values.
 */

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

/** The figures set in the mono face with tabular numerals. */
function monoFigures(html: string): string[] {
  return [...html.matchAll(/<span class="font-mono tabular-nums">([^<]*)<\/span>/g)].map((match) => match[1] ?? '');
}

describe('the materiality card (CAS-38)', () => {
  it('says the stored 500 and 25000 cents as $5.00 per line and $250.00 per case, in the mono face, and pre-fills 5.00 and 250.00', () => {
    const { html, keys } = materiality('500', '25000');
    expect(words(html)).toContain('Now $5.00 per line and $250.00 per case.');
    expect(monoFigures(html)).toEqual(['$5.00', '$250.00']);
    expect(valueOf(html, 'lineMateriality')).toBe('5.00');
    expect(valueOf(html, 'caseMateriality')).toBe('250.00');
    expect(html).toContain('Per line (dollars)');
    expect(html).toContain(`<input type="hidden" name="practiceId" value="${PRACTICE}"/>`);
    expect(keys).toBe(1);
  });

  it('reads the edges of what a save can store: zero, a cent, and $999,999,999.99', () => {
    const zero = materiality('0', '1');
    expect(words(zero.html)).toContain('Now $0.00 per line and $0.01 per case.');
    expect([valueOf(zero.html, 'lineMateriality'), valueOf(zero.html, 'caseMateriality')]).toEqual(['0.00', '0.01']);
    const most = materiality('99', '99999999999');
    expect(monoFigures(most.html)).toEqual(['$0.99', '$999,999,999.99']);
    expect([valueOf(most.html, 'lineMateriality'), valueOf(most.html, 'caseMateriality')]).toEqual(['0.99', '999999999.99']);
  });

  it('shows the thresholds without a form to a role that does not work cases', () => {
    const { html, keys } = materiality('500', '25000', false);
    expect(words(html)).toContain('Now $5.00 per line and $250.00 per case.');
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
