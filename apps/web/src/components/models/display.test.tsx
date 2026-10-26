import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { ProposalView, StoredCandidate } from '../../lib/models/contract-proposals';
import { ProposalList } from './display';

/**
 * A contract proposal's candidate card (PRD 14; docs/adr/0070 Part 1): each field the model stated, with its check
 * against the cited page, and each scope field it left out, which leaves the record as wide as that field goes (the PR
 * review's M2). SYNTHETIC values, written by hand.
 */

const quote = 'CPT 97110 Therapeutic exercise, each 15 minutes $32.50 per unit';
const field = (name: string, written: string | string[] | null): StoredCandidate['fields'][number] => ({ field: name as StoredCandidate['fields'][number]['field'], page: 2, quote, written, verified: true, problems: [] });

function proposal(fields: StoredCandidate['fields']): ProposalView {
  const candidate: StoredCandidate = {
    index: 0,
    label: 'SYNTHETIC therapeutic exercise',
    method: 'FIXED_SCHEDULE',
    fields,
    conflictsWith: [],
    defaults: [],
    rateRecord: null,
    rateRecordId: '00000000-0000-4000-8000-000000000001',
    problems: [],
  };
  return {
    id: '00000000-0000-4000-8000-000000000002',
    modelCallId: '00000000-0000-4000-8000-000000000003',
    documentId: '00000000-0000-4000-8000-000000000004',
    ambiguous: false,
    modelId: 'SYNTHETIC-LOCAL',
    createdAt: '2026-01-02T00:00:00.000Z',
    passed: true,
    candidates: [candidate],
    decision: null,
    reviewedAt: null,
  };
}

const rows = (html: string, check: string) => [...html.matchAll(new RegExp(`<tr [^>]*data-field="([a-z_]+)"[^>]*data-check="${check}"`, 'g'))].map((match) => match[1]);

describe('a contract proposal’s candidate card', () => {
  it('shows each scope field the candidate leaves out as not stated, with how wide the record reads (review M2)', () => {
    const html = renderToStaticMarkup(<ProposalList proposals={[proposal([field('method', null), field('codes', ['97110']), field('amount', '$32.50')])]} />);
    expect(rows(html, 'passed')).toEqual(['method', 'codes', 'amount']);
    expect(rows(html, 'unstated')).toEqual(['modifiers', 'places_of_service', 'effective_from', 'effective_to']);
    expect(html).toContain('Not stated: applies with any modifier');
    expect(html).toContain('Not stated: applies at any place of service');
    expect(html).not.toContain('Not stated: applies to every procedure code');
  });

  it('shows no such row when the candidate states every scope field', () => {
    const stated = [field('codes', ['97110']), field('modifiers', ['GP']), field('places_of_service', ['11']), field('effective_from', 'January 1, 2026'), field('effective_to', 'December 31, 2026')];
    expect(rows(renderToStaticMarkup(<ProposalList proposals={[proposal(stated)]} />), 'unstated')).toEqual([]);
    expect(renderToStaticMarkup(<ProposalList proposals={[proposal([field('amount', '$32.50')])]} />)).toContain('Not stated: applies to every procedure code');
  });
});
