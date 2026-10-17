import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  APPROVAL_PREFIX,
  PROVENANCE_PREFIX,
  approvalLineOf,
  approvalProblems,
  awaitingApprovalLine,
  comparableText,
  documentSha256,
  documentToWrite,
  firstDifference,
} from './approval';

/** A small document in the generator's shape: provenance near the top, the approval line last. */
function document(options: { readonly commit?: string; readonly branch?: string; readonly body?: string; readonly approval?: (sha: string) => string } = {}): string {
  const draft = [
    '# Domain model',
    '',
    `${PROVENANCE_PREFIX}\`${options.commit ?? 'aaaaaaa'}\` on branch \`${options.branch ?? 'main'}\` (provenance only)`,
    '- Migrations applied: 2; head `20261016120000_remittances.sql`',
    '',
    options.body ?? '| `remittance` | PHI (registered) |',
    '',
    '## Approval',
    '',
    `${APPROVAL_PREFIX} PLACEHOLDER`,
    '',
  ].join('\n');
  const sha = documentSha256(draft);
  return draft.replace(`${APPROVAL_PREFIX} PLACEHOLDER`, (options.approval ?? awaitingApprovalLine)(sha));
}

const signed = (name: string, date: string) => (sha: string) => `${APPROVAL_PREFIX} ${name}  Date: ${date}  Document SHA-256: \`${sha}\``;

describe('the document hash', () => {
  it('is the SHA-256 of every line but the approval and provenance lines', () => {
    const text = document();
    const expected = createHash('sha256').update(comparableText(text)).digest('hex');
    expect(documentSha256(text)).toBe(expected);
    expect(comparableText(text)).not.toContain(PROVENANCE_PREFIX);
    expect(comparableText(text)).not.toContain(APPROVAL_PREFIX);
    expect(comparableText(text)).toContain('head `20261016120000_remittances.sql`');
  });

  it('ignores the provenance line: another commit or branch leaves the text and its hash unchanged', () => {
    const here = document({ commit: '0c0fb77', branch: 'co-001/pr-02-domain-model' });
    const there = document({ commit: 'ffffffffffffffffffffffffffffffffffffffff', branch: 'unknown' });
    expect(here).not.toBe(there);
    expect(documentSha256(here)).toBe(documentSha256(there));
    expect(firstDifference(here, there)).toBeNull();
  });

  it('ignores the approval line, so signing does not change the hash', () => {
    const awaiting = document();
    const approved = document({ approval: signed('A. Founder', '2026-10-17') });
    expect(documentSha256(approved)).toBe(documentSha256(awaiting));
    expect(firstDifference(awaiting, approved)).toBeNull();
  });

  it('changes with any other line', () => {
    const text = document();
    const edited = text.replace('PHI (registered)', 'global (no practice_id, no RLS)');
    expect(documentSha256(edited)).not.toBe(documentSha256(text));
    expect(firstDifference(text, edited)).toEqual({ line: 5, existing: '| `remittance` | PHI (registered) |', generated: '| `remittance` | global (no practice_id, no RLS) |' });
    expect(firstDifference(text, text + 'one more line\n')).toMatchObject({ existing: '(end of file)' });
  });
});

describe('the approval line', () => {
  it('as generated awaits a name and a date', () => {
    const text = document();
    const line = approvalLineOf(text);
    expect(line).toBe(awaitingApprovalLine(documentSha256(text)));
    expect(approvalProblems(line, documentSha256(text))).toEqual(['the approval names no person', 'the approval date is not a date (YYYY-MM-DD)']);
  });

  it('passes with a name, a date and the hash of this text', () => {
    const text = document({ approval: signed('A. Founder', '2026-10-17') });
    expect(approvalProblems(approvalLineOf(text), documentSha256(text))).toEqual([]);
  });

  it('fails with a blank name', () => {
    for (const name of ['________', '_', '   ']) {
      const text = document({ approval: signed(name, '2026-10-17') });
      expect(approvalProblems(approvalLineOf(text), documentSha256(text)), JSON.stringify(name)).toEqual(['the approval names no person']);
    }
  });

  it('fails with a date that is not a calendar date in YYYY-MM-DD', () => {
    for (const date of ['________', '2026-02-30', '2026-13-01', '2026/10/17', '17-10-2026', '2026-10-17T00:00', 'October']) {
      const text = document({ approval: signed('A. Founder', date) });
      expect(approvalProblems(approvalLineOf(text), documentSha256(text)), date).toEqual(['the approval date is not a date (YYYY-MM-DD)']);
    }
  });

  it('fails with a stale hash: an approval of earlier text does not carry over', () => {
    const before = document({ approval: signed('A. Founder', '2026-10-17') });
    const after = document({ body: '| `remittance` | PHI (registered) | one more column |', approval: signed('A. Founder', '2026-10-17') });
    const staleLine = approvalLineOf(before);
    expect(approvalProblems(staleLine, documentSha256(after))).toEqual([
      `the approval is for document ${documentSha256(before).slice(0, 12)}, not this one (${documentSha256(after).slice(0, 12)}): the document changed after it was approved`,
    ]);
  });

  it('fails when the text is edited after it was approved', () => {
    const approved = document({ approval: signed('A. Founder', '2026-10-17') });
    const edited = approved.replace('head `20261016120000_remittances.sql`', 'head `20261101120000_support_mail.sql`');
    expect(approvalProblems(approvalLineOf(edited), documentSha256(edited))).toHaveLength(1);
    expect(approvalProblems(approvalLineOf(edited), documentSha256(edited))[0]).toMatch(/the document changed after it was approved$/);
  });

  it('fails when missing or malformed', () => {
    const sha = documentSha256(document());
    expect(approvalProblems(null, sha)).toEqual(['there is no "Approved by:" line']);
    expect(approvalLineOf('# Domain model\n')).toBeNull();
    for (const line of [
      `${APPROVAL_PREFIX} A. Founder Date: 2026-10-17 Document SHA-256: \`${sha}\``,
      `${APPROVAL_PREFIX} A. Founder  Date: 2026-10-17  Document SHA-256: ${sha}`,
      `${APPROVAL_PREFIX} A. Founder  Date: 2026-10-17  Document SHA-256: \`${sha.slice(0, 63)}\``,
      `${APPROVAL_PREFIX} A. Founder  Date: 2026-10-17  Document SHA-256: \`${sha.toUpperCase()}\``,
      `${APPROVAL_PREFIX} A. Founder  Date: 2026-10-17`,
    ]) {
      expect(approvalProblems(line, sha), line).toEqual(['the "Approved by:" line is not "Approved by: <name>  Date: <YYYY-MM-DD>  Document SHA-256: `<hash>`"']);
    }
  });
});

describe('what --out writes', () => {
  it('keeps a valid approval when the regenerated text is identical, whatever the commit', () => {
    const approved = document({ commit: 'aaaaaaa', approval: signed('A. Founder', '2026-10-17') });
    const regenerated = document({ commit: 'bbbbbbb' });
    const written = documentToWrite(approved, regenerated);
    expect(approvalLineOf(written)).toBe(approvalLineOf(approved));
    expect(written).toContain('`bbbbbbb`');
    expect(approvalProblems(approvalLineOf(written), documentSha256(written))).toEqual([]);
  });

  it('leaves the line awaiting when the text changed', () => {
    const approved = document({ approval: signed('A. Founder', '2026-10-17') });
    const regenerated = document({ body: '| `remittance` | changed |' });
    expect(documentToWrite(approved, regenerated)).toBe(regenerated);
  });

  it('does not keep an approval line that is not valid for the text', () => {
    const badDate = document({ approval: signed('A. Founder', '2026-02-30') });
    const regenerated = document();
    expect(documentToWrite(badDate, regenerated)).toBe(regenerated);
    expect(documentToWrite(null, regenerated)).toBe(regenerated);
  });

  it('keeps a name with characters a replacement pattern would read', () => {
    const approved = document({ approval: signed("A. Founder $& O'Neil", '2026-10-17') });
    expect(approvalLineOf(documentToWrite(approved, document()))).toBe(approvalLineOf(approved));
  });
});
