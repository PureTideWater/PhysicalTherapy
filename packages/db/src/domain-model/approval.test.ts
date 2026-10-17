import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  APPROVAL_PREFIX,
  EARLIEST_APPROVAL_DATE,
  PROVENANCE_PREFIX,
  approvalLineOf,
  approvalProblems,
  awaitingApprovalLine,
  comparableText,
  documentApprovalProblems,
  documentSha256,
  documentToWrite,
  firstDifference,
  provenanceLine,
} from './approval';

/** A small document in the generator's shape: provenance near the top, the approval line last. */
function document(
  options: { readonly commit?: string; readonly branch?: string; readonly uncommitted?: boolean; readonly body?: string; readonly approval?: (sha: string) => string } = {},
): string {
  const draft = [
    '# Domain model',
    '',
    provenanceLine({ commit: options.commit ?? 'aaaaaaa', branch: options.branch ?? 'main', uncommitted: options.uncommitted === true }),
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

  it('ignores the provenance line: another commit or branch, or uncommitted inputs, leave the text and its hash unchanged', () => {
    const here = document({ commit: '0c0fb77', branch: 'co-001/pr-02-domain-model' });
    const there = document({ commit: 'ffffffffffffffffffffffffffffffffffffffff', branch: 'unknown' });
    const dirty = document({ commit: '0c0fb77', branch: 'co-001/pr-02-domain-model', uncommitted: true });
    expect(here).not.toBe(there);
    expect(dirty).toContain(', with uncommitted changes to its inputs (provenance only');
    expect(documentSha256(here)).toBe(documentSha256(there));
    expect(documentSha256(dirty)).toBe(documentSha256(here));
    expect(firstDifference(here, there)).toBeNull();
    expect(firstDifference(here, dirty)).toBeNull();
  });

  it('compares any other line with the provenance prefix, and a provenance line not in the generated shape', () => {
    const text = document();
    const lines = text.split('\n');
    const junk = `${PROVENANCE_PREFIX}\`n/a\`: payer is exempt from row-level security (hand-written; --check and the hash skip this line)`;
    const inserted = [...lines.slice(0, 3), junk, ...lines.slice(3)].join('\n');
    expect(firstDifference(text, inserted)).toEqual({ line: 3, existing: '- Migrations applied: 2; head `20261016120000_remittances.sql`', generated: junk });
    expect(firstDifference(inserted, text)).not.toBeNull();
    expect(documentSha256(inserted)).not.toBe(documentSha256(text));
    // A line in the generated shape placed above the real one is skipped instead, so the real one is compared.
    const above = [...lines.slice(0, 1), provenanceLine({ commit: 'bbbbbbb', branch: 'main' }), ...lines.slice(1)].join('\n');
    expect(firstDifference(text, above)).not.toBeNull();
    // The provenance line itself rewritten as prose is compared.
    const rewritten = text.replace(lines[2] ?? '', junk);
    expect(firstDifference(text, rewritten)).toMatchObject({ line: 3, generated: junk });
    expect(documentSha256(rewritten)).not.toBe(documentSha256(text));
  });

  it('ignores the approval line, so signing does not change the hash', () => {
    const awaiting = document();
    const approved = document({ approval: signed('A. Founder', '2026-10-17') });
    expect(documentSha256(approved)).toBe(documentSha256(awaiting));
    expect(firstDifference(awaiting, approved)).toBeNull();
  });

  it('compares an "Approved by:" line anywhere but the last line', () => {
    const text = document();
    const note = `${APPROVAL_PREFIX} (hand-written note) this table list was reviewed by legal`;
    const inMiddle = text.replace('| `remittance` | PHI (registered) |', `| \`remittance\` | PHI (registered) |\n${note}`);
    expect(firstDifference(text, inMiddle)).toMatchObject({ existing: '', generated: note });
    expect(documentSha256(inMiddle)).not.toBe(documentSha256(text));
    // Appended after the approval line, the note is the last line: the real approval line is then compared.
    const appended = text + note + '\n';
    expect(approvalLineOf(appended)).toBe(note);
    expect(firstDifference(text, appended)).toMatchObject({ existing: '', generated: approvalLineOf(text) });
    expect(documentApprovalProblems(appended, documentSha256(appended))).toContain('the document has 2 "Approved by:" lines; only its last line is the approval');
  });

  it('changes with any other line', () => {
    const text = document();
    const edited = text.replace('PHI (registered)', 'global (no practice_id, no RLS)');
    expect(documentSha256(edited)).not.toBe(documentSha256(text));
    expect(firstDifference(text, edited)).toEqual({ line: 5, existing: '| `remittance` | PHI (registered) |', generated: '| `remittance` | global (no practice_id, no RLS) |' });
    // The approval line is the last line that is not empty: below a line appended after it, it is compared.
    expect(firstDifference(text, text + 'one more line\n')).toMatchObject({ existing: '', generated: approvalLineOf(text) });
    // The text ends with a newline, so its last line is empty: an empty line appended differs there.
    expect(firstDifference(text, text + '\n')).toMatchObject({ existing: '(end of file)', generated: '' });
    expect(firstDifference(text + '\n', text)).toMatchObject({ existing: '', generated: '(end of file)' });
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

  it('fails with a date later than today (UTC)', () => {
    const now = new Date('2026-10-17T23:30:00Z');
    const tomorrow = document({ approval: signed('A. Founder', '2026-10-18') });
    expect(approvalProblems(approvalLineOf(tomorrow), documentSha256(tomorrow), now)).toEqual(['the approval date 2026-10-18 is later than today (2026-10-17, UTC)']);
    const far = document({ approval: signed('A. Founder', '2999-12-31') });
    expect(approvalProblems(approvalLineOf(far), documentSha256(far), now)).toEqual(['the approval date 2999-12-31 is later than today (2026-10-17, UTC)']);
    const today = document({ approval: signed('A. Founder', '2026-10-17') });
    expect(approvalProblems(approvalLineOf(today), documentSha256(today), now)).toEqual([]);
  });

  it('fails with a date before Change Order 001 was issued (2026-10-16)', () => {
    expect(EARLIEST_APPROVAL_DATE).toBe('2026-10-16');
    for (const date of ['2026-10-15', '1900-01-01']) {
      const text = document({ approval: signed('A. Founder', date) });
      expect(approvalProblems(approvalLineOf(text), documentSha256(text)), date).toEqual([`the approval date ${date} is before Change Order 001 was issued (2026-10-16)`]);
    }
    const issued = document({ approval: signed('A. Founder', '2026-10-16') });
    expect(approvalProblems(approvalLineOf(issued), documentSha256(issued))).toEqual([]);
  });

  it('fails when the document has more than one "Approved by:" line', () => {
    const approved = document({ approval: signed('A. Founder', '2026-10-17') });
    expect(documentApprovalProblems(approved, documentSha256(approved))).toEqual([]);
    const twice = approved.replace('## Approval', `## Approval\n\n${approvalLineOf(approved) ?? ''}`);
    expect(documentApprovalProblems(twice, documentSha256(approved))).toEqual(['the document has 2 "Approved by:" lines; only its last line is the approval']);
    expect(documentApprovalProblems('# Domain model\n', documentSha256(approved))).toEqual(['there is no "Approved by:" line']);
  });

  it('fails with a date that is not a calendar date in YYYY-MM-DD', () => {
    for (const date of ['________', '2026-02-30', '2026-13-01', '0000-00-00', '2026/10/17', '17-10-2026', '10/17/2026', '2026-10-17T00:00', 'October']) {
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
    const future = document({ approval: signed('A. Founder', '2999-12-31') });
    const regenerated = document();
    expect(documentToWrite(badDate, regenerated)).toBe(regenerated);
    expect(documentToWrite(future, regenerated)).toBe(regenerated);
    expect(documentToWrite(null, regenerated)).toBe(regenerated);
  });

  it('keeps a name with characters a replacement pattern would read', () => {
    const approved = document({ approval: signed("A. Founder $& O'Neil", '2026-10-17') });
    expect(approvalLineOf(documentToWrite(approved, document()))).toBe(approvalLineOf(approved));
  });
});
