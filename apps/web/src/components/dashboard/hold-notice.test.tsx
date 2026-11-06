import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { JOB_REFUSED_LABEL, type PracticeHold, holdNotice } from '../../lib/billing/suspension-words';
import { HoldAlert, RunOutcomeBadge } from './hold-notice';

/**
 * The practice home's hold notice and the last run's outcome at a phone's width (SS-01 review UX-SS01-2 and
 * UX-SS01-6; docs/adr/0056, 0078): the notice's dates stay whole, since a browser breaks a line after a date's hyphen,
 * and J1's badge wraps inside its card, so the page never scrolls sideways at 390 px. The words are holdNotice's and
 * J1's, unchanged.
 */

const text = (html: string) => html.replace(/<[^>]+>/g, '').replaceAll('&#x27;', "'").replaceAll('&amp;', '&');

const SUSPENDED: PracticeHold = {
  source: 'owner',
  cause: 'suspended',
  reason: 'security_hold',
  since: new Date('2026-11-04T05:12:00Z'),
  stopped: [],
  name: null,
  viewer: 'member',
  billingHref: '/settings/billing/00000000-0000-4000-8000-0000000000a1',
};

describe('the practice home’s hold notice (H1 to H13)', () => {
  it('keeps each date in the body whole, the words unchanged (UX-SS01-6)', () => {
    const notice = holdNotice(SUSPENDED);
    const html = renderToStaticMarkup(<HoldAlert hold={notice} />);
    expect(html).toContain('<span class="whitespace-nowrap">2026-11-04</span>');
    expect(text(html)).toContain(notice.body);
    expect(text(html)).toContain(notice.title);
    expect(html).toContain('data-notice="suspended"');
    expect(html).toContain('data-hold-source="owner"');
    expect(html).toContain('role="alert"');
  });

  it('says its next step with its link, or words alone', () => {
    const linked = renderToStaticMarkup(<HoldAlert hold={holdNotice(SUSPENDED)} />);
    expect(linked).toContain('<a class="underline" href="/settings/billing/00000000-0000-4000-8000-0000000000a1">Settings, Billing</a> shows why and what to do next.');
    const plain = renderToStaticMarkup(<HoldAlert hold={holdNotice({ ...SUSPENDED, viewer: 'other', cause: 'on_hold', reason: null, billingHref: null })} />);
    expect(text(plain)).toContain("The practice's administrator sees why and what to do next in Settings, Billing.");
    expect(plain).not.toContain('<a ');
    // A grantee's hold (H5) names the date the same way.
    const grantee = renderToStaticMarkup(<HoldAlert hold={holdNotice({ ...SUSPENDED, source: 'grantee', stopped: ['mapping.edit'], name: 'SYNTHETIC FIRM' })} />);
    expect(grantee).toContain('<span class="whitespace-nowrap">2026-11-04</span>');
    expect(grantee).toContain('data-hold-source="grantee"');
  });
});

describe('the last run’s outcome on Data freshness', () => {
  it('wraps J1 inside its card, so the page never scrolls sideways at 390 px (UX-SS01-2)', () => {
    const html = renderToStaticMarkup(<RunOutcomeBadge outcome="refused" />);
    expect(text(html)).toBe(JOB_REFUSED_LABEL);
    expect(html).toContain('data-outcome="refused"');
    const classes = /class="([^"]*)"/.exec(html)?.[1]?.split(' ') ?? [];
    expect(classes).toContain('whitespace-normal');
    expect(classes).not.toContain('whitespace-nowrap');
    expect(classes).toContain('h-auto');
  });

  it('names each outcome, in its tone', () => {
    expect(text(renderToStaticMarkup(<RunOutcomeBadge outcome="succeeded" />))).toBe('Succeeded');
    expect(text(renderToStaticMarkup(<RunOutcomeBadge outcome="failed" />))).toBe('Failed three times');
    expect(text(renderToStaticMarkup(<RunOutcomeBadge outcome="retrying" />))).toBe('Failed; retrying');
    expect(text(renderToStaticMarkup(<RunOutcomeBadge outcome="running" />))).toBe('Running');
    expect(renderToStaticMarkup(<RunOutcomeBadge outcome="failed" />)).toContain('text-danger');
    // An outcome the page does not know is shown as it is, never dropped.
    expect(text(renderToStaticMarkup(<RunOutcomeBadge outcome="unknown_outcome" />))).toBe('unknown_outcome');
  });
});
