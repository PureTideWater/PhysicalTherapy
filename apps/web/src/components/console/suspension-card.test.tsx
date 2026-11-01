import type * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ActionState } from '../../lib/http/next';
import type { OrganizationSuspension, StatusChange } from '../../lib/routes/console';
import { SuspensionCard, SuspensionHistory } from './suspension-card';
import { HISTORY_CAPTION, SUSPENSION_REASON_HINT } from './suspension-text';

/**
 * The console's suspension card and history as the server renders them (docs/adr/0080; design SS-01, C4 to C10), held
 * to the forms rules of docs/adr/0077 (FRM-04: the shared fields, each refused field marked and described, named by
 * the label the person sees, the hint at 14 px) and the tables rule of docs/adr/0078 (TBL-02: the history scrolls in
 * its ScrollTable from a floor, a long value breaking only inside a block with a min-w). The browser half, a refusal
 * that keeps the reason and the note, is e2e/billing.spec.ts's console journey. Synthetic values only.
 */

/** The state each ActionForm renders: none, unless a test sets the refusal a press returned. */
const shown = vi.hoisted(() => ({ state: undefined as ActionState | undefined }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return {
    ...actual,
    useActionState: <S,>(_action: unknown, initial: S): [S, () => void, boolean] => [(shown.state as S | undefined) ?? initial, () => undefined, false],
  };
});
// FormKeys is an async server component that reads the session; the card's markup needs only its request key.
vi.mock('../form-keys', () => ({ FormKeys: () => <input type="hidden" name="requestKey" value="synthetic-request-key" /> }));
afterEach(() => {
  shown.state = undefined;
});

const action = (state: ActionState): Promise<ActionState> => Promise.resolve(state);
const FIRM = { id: '00000000-0000-4000-8000-0000000000f1', name: 'SYNTHETIC CONSOLE FIRM', kind: 'firm', status: 'active' } as const;
const REACH = { practices: 2, grants: 2 };
const SUSPENDED: OrganizationSuspension = {
  reason: 'security_hold',
  since: new Date('2026-10-20T14:00:00Z'),
  suspendedBy: { email: 'synthetic-admin@synthetic.test', at: new Date('2026-10-20T14:00:00Z') },
  reasonChangedBy: null,
  note: 'SYNTHETIC NOTE',
};

function card(suspension: OrganizationSuspension | null = null): string {
  return renderToStaticMarkup(<SuspensionCard organization={{ ...FIRM, status: suspension === null ? 'active' : 'suspended' }} suspension={suspension} reach={REACH} action={action} />);
}

/** The opening tag of the element with this id. */
function tag(html: string, id: string): string {
  const found = new RegExp(`<[a-z]+ [^>]*id="${id}"[^>]*>`).exec(html)?.[0];
  if (found === undefined) {
    throw new Error(`no element with id ${id}`);
  }
  return found;
}

function attribute(html: string, id: string, name: string): string | null {
  return new RegExp(` ${name}="([^"]*)"`).exec(tag(html, id))?.[1] ?? null;
}

describe('the suspension card’s forms (FRM-04; docs/adr/0077)', () => {
  it('uses the shared fields: the reason starts empty, its hint at 14 px, and nothing is marked before a refusal', () => {
    const html = card();
    expect(tag(html, 'suspend-reason')).toMatch(/^<select /);
    expect(attribute(html, 'suspend-reason', 'required')).toBe('');
    expect(attribute(html, 'suspend-reason', 'aria-describedby')).toBe('suspend-reason-hint');
    expect(html).toMatch(new RegExp(`<p id="suspend-reason-hint" class="text-sm text-muted-foreground">${SUSPENSION_REASON_HINT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, '&#x27;')}</p>`));
    expect(attribute(html, 'suspend-confirm', 'data-error-name')).toBe('Confirmation');
    expect(html).not.toContain('aria-invalid');
    expect(html).not.toContain('data-field-error');
  });

  it('marks and describes each refused field, with Error: under it, so the summary names it by its label', () => {
    shown.state = {
      error: 'Fix the fields listed here, then try again.',
      invalid: true,
      issues: [
        { field: 'reason', message: 'choose why PaidWhole suspends it' },
        { field: 'note', message: 'at most 500 characters' },
        { field: 'confirm', message: 'tick to confirm what the suspension stops' },
      ],
    };
    const html = card();
    expect(attribute(html, 'suspend-reason', 'aria-invalid')).toBe('true');
    expect(attribute(html, 'suspend-reason', 'aria-describedby')).toBe('suspend-reason-error suspend-reason-hint');
    expect(attribute(html, 'suspend-note', 'aria-invalid')).toBe('true');
    expect(attribute(html, 'suspend-confirm', 'aria-invalid')).toBe('true');
    expect(html).toMatch(/data-slot="checkbox-field" data-invalid=""/);
    expect(html.match(/<span aria-hidden="true" class="font-semibold">Error:<\/span>/g)).toHaveLength(3);
    expect(html).toContain('<p id="suspend-confirm-error">tick to confirm what the suspension stops</p>');
  });

  it('names a refusal of the hidden change “Status”, never by its key, in every form of the card', () => {
    for (const html of [card(), card(SUSPENDED)]) {
      const changes = [...html.matchAll(/<input type="hidden"[^>]*name="change"[^>]*>/g)].map((match) => match[0]);
      expect(changes.length).toBeGreaterThan(0);
      expect(changes.every((input) => input.includes('data-error-name="Status"'))).toBe(true);
    }
    // Suspended: two reinstatements and a change of reason, whose select is the shared field too.
    expect(tag(card(SUSPENDED), 'change-reason')).toMatch(/^<select /);
  });
});

describe('the suspension history (TBL-02; docs/adr/0078)', () => {
  const history: StatusChange[] = [
    { id: 'c2', at: new Date('2026-10-21T09:30:00Z'), change: 'reinstated', reason: 'resolved', by: 'synthetic-admin@synthetic.test', note: null },
    { id: 'c1', at: new Date('2026-10-20T14:00:00Z'), change: 'suspended', reason: 'security_hold', by: 'synthetic-admin@synthetic.test', note: 'SYNTHETIC NOTE' },
  ];

  it('scrolls in its ScrollTable from a floor wide enough for its five columns, so a phone scrolls it sideways', () => {
    const html = renderToStaticMarkup(<SuspensionHistory history={history} />);
    expect(html).toMatch(new RegExp(`<table class="w-full min-w-\\[48rem\\] text-left text-sm" aria-label="${HISTORY_CAPTION}">`));
  });

  it('breaks an email or a note only inside a block with a min-w, never on the cell', () => {
    const html = renderToStaticMarkup(<SuspensionHistory history={history} />);
    expect(html).not.toMatch(/<td[^>]*class="[^"]*break-(all|words)/);
    expect(html.match(/<span class="block min-w-40 wrap-anywhere">synthetic-admin@synthetic\.test<\/span>/g)).toHaveLength(2);
    expect(html).toContain('<span class="block min-w-48 wrap-anywhere">SYNTHETIC NOTE</span>');
  });
});
