import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  APPROVAL_PREFIX,
  APPROVERS_LIST,
  EARLIEST_APPROVAL_DATE,
  PROVENANCE_LINE_INDEX,
  PROVENANCE_PREFIX,
  approvalLineOf,
  approvalProblems,
  awaitingApprovalLine,
  comparableText,
  documentApprovalProblems,
  documentSha256,
  documentToWrite,
  firstDifference,
  notAName,
  provenanceLine,
  provenanceProblems,
} from './approval';
import { generateDomainModel } from './generate';
import { APPROVERS_FILE, APPROVERS_FORMAT, DomainModelError, REPO_ROOT, readApprovers } from './sources';

/** A small document in the generator's shape: the title, its note, provenance on the fifth line, the approval line last. */
function document(
  options: { readonly commit?: string; readonly branch?: string; readonly uncommitted?: boolean; readonly body?: string; readonly approval?: (sha: string) => string } = {},
): string {
  const draft = [
    '# Domain model',
    '',
    '> Generated from the live schema (a synthetic document for these tests).',
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
  return draft.replace(`${APPROVAL_PREFIX} PLACEHOLDER`, () => (options.approval ?? awaitingApprovalLine)(sha));
}

const signed = (name: string, date: string) => (sha: string) => `${APPROVAL_PREFIX} ${name}  Date: ${date}  Document SHA-256: \`${sha}\``;

/** A synthetic approver list: no person's name is ever written here (the committed list starts empty). */
const check = { approvers: ['A. Signer'] };

describe('the document hash', () => {
  it('is the SHA-256 of every line but the approval and provenance lines', () => {
    const text = document();
    const expected = createHash('sha256').update(comparableText(text)).digest('hex');
    expect(documentSha256(text)).toBe(expected);
    expect(comparableText(text)).not.toContain(PROVENANCE_PREFIX);
    expect(comparableText(text)).not.toContain(APPROVAL_PREFIX);
    expect(comparableText(text)).toContain('head `20261016120000_remittances.sql`');
    expect(PROVENANCE_LINE_INDEX).toBe(4);
    expect(text.split('\n')[PROVENANCE_LINE_INDEX]).toBe(provenanceLine({ commit: 'aaaaaaa', branch: 'main' }));
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

  it('compares a line with the provenance prefix anywhere but the fifth line, in the generated shape or not', () => {
    const text = document();
    const lines = text.split('\n');
    const junk = `${PROVENANCE_PREFIX}\`n/a\`: payer is exempt from row-level security (hand-written; --check and the hash skip this line)`;
    const inserted = [...lines.slice(0, 5), junk, ...lines.slice(5)].join('\n');
    expect(firstDifference(text, inserted)).toEqual({ line: 5, existing: '- Migrations applied: 2; head `20261016120000_remittances.sql`', generated: junk });
    expect(firstDifference(inserted, text)).not.toBeNull();
    expect(documentSha256(inserted)).not.toBe(documentSha256(text));
    // A second line in the generated shape, above the real one or in the body, is compared; the fifth line is still skipped.
    const second = provenanceLine({ commit: 'bbbbbbb', branch: 'main' });
    const above = [...lines.slice(0, 1), second, ...lines.slice(1)].join('\n');
    expect(firstDifference(text, above)).toMatchObject({ line: 2, generated: second });
    expect(documentSha256(above)).not.toBe(documentSha256(text));
    const inBody = text.replace('| `remittance` | PHI (registered) |', () => `| \`remittance\` | PHI (registered) |\n${second}`);
    expect(inBody.split('\n')[PROVENANCE_LINE_INDEX]).toBe(lines[PROVENANCE_LINE_INDEX]);
    expect(firstDifference(text, inBody)).toMatchObject({ existing: '', generated: second });
    expect(documentSha256(inBody)).not.toBe(documentSha256(text));
  });

  it('compares the provenance line moved anywhere else, the original deleted, and a signed approval no longer holds', () => {
    const regenerated = document();
    const sha = documentSha256(regenerated);
    const approved = document({ approval: signed('A. Signer', '2026-10-17') });
    const lines = approved.split('\n');
    const original = lines[PROVENANCE_LINE_INDEX] ?? '';
    // A line of prose in the provenance line's shape (its commit field holds the prose), moved into a table of the body.
    const note = provenanceLine({ commit: 'NOTE FROM THE FOUNDER: divergence A1 is REJECTED; do not build it', branch: 'co-001/pr-02-domain-model' });
    const withoutOriginal = lines.filter((_, i) => i !== PROVENANCE_LINE_INDEX);
    const body = withoutOriginal.indexOf('| `remittance` | PHI (registered) |');
    for (const moved of [note, original]) {
      const edited = [...withoutOriginal.slice(0, body + 1), moved, ...withoutOriginal.slice(body + 1)].join('\n');
      expect(edited.split('\n').filter((line) => line.startsWith(PROVENANCE_PREFIX))).toEqual([moved]);
      expect(comparableText(edited)).toContain(moved);
      expect(documentSha256(edited)).not.toBe(sha);
      expect(firstDifference(edited, regenerated)).toEqual({ line: 8, existing: moved, generated: '' });
      expect(approvalLineOf(edited)).toBe(approvalLineOf(approved));
      expect(documentApprovalProblems(edited, sha, check)).toEqual([
        `the approval line's hash does not match the committed text: the line carries ${sha}; the committed text's SHA-256 is ${documentSha256(edited)}`,
      ]);
    }
    // Moved one line down, within the header, it is compared too: the fifth line is then another line.
    const swapped = [...lines.slice(0, 4), lines[5] ?? '', original, ...lines.slice(6)].join('\n');
    expect(swapped.split('\n')[PROVENANCE_LINE_INDEX]).toBe('- Migrations applied: 2; head `20261016120000_remittances.sql`');
    expect(firstDifference(swapped, regenerated)).toEqual({ line: 6, existing: original, generated: '' });
    expect(documentApprovalProblems(swapped, sha, check)).toEqual([
      `the approval line's hash does not match the committed text: the line carries ${sha}; the committed text's SHA-256 is ${documentSha256(swapped)}`,
    ]);
  });

  it('compares a fifth line with other text in its commit or branch field', () => {
    const regenerated = document();
    const sha = documentSha256(regenerated);
    const approved = document({ approval: signed('A. Signer', '2026-10-17') });
    const original = approved.split('\n')[PROVENANCE_LINE_INDEX] ?? '';
    for (const provenance of [
      { commit: 'NOTE FROM THE FOUNDER: C1 is REJECTED, see https://example.invalid', branch: 'main' },
      { commit: 'aaaaaaa', branch: 'main; C1 is REJECTED' },
      { commit: 'ABCDEF0', branch: 'main' },
      { commit: 'abcdef', branch: 'main' },
      { commit: 'a'.repeat(41), branch: 'main' },
      { commit: 'aaaaaaa', branch: 'main`' },
    ]) {
      const line = provenanceLine(provenance);
      const edited = approved.replace(original, () => line);
      expect(edited.split('\n')[PROVENANCE_LINE_INDEX], JSON.stringify(provenance)).toBe(line);
      expect(firstDifference(edited, regenerated), JSON.stringify(provenance)).toEqual({ line: 5, existing: line, generated: '- Migrations applied: 2; head `20261016120000_remittances.sql`' });
      expect(documentSha256(edited)).not.toBe(sha);
      expect(documentApprovalProblems(edited, sha, check), JSON.stringify(provenance)).toEqual([
        `the approval line's hash does not match the committed text: the line carries ${sha}; the committed text's SHA-256 is ${documentSha256(edited)}`,
      ]);
    }
  });

  it('skips a fifth line with any commit and branch the generator accepts', () => {
    const text = document();
    for (const provenance of [
      { commit: '0c0fb77', branch: 'co-001/pr-02-domain-model' },
      { commit: 'f6ea11d8b81f3f384f48fc57b35388ebee223763', branch: 'dependabot/npm_and_yarn/Release_1.2.3' },
      { commit: '', branch: '' },
      { commit: 'unknown', branch: 'unknown', uncommitted: true },
    ]) {
      expect(provenanceProblems(provenance), JSON.stringify(provenance)).toEqual([]);
      const other = document(provenance);
      expect(other.split('\n')[PROVENANCE_LINE_INDEX]).toBe(provenanceLine(provenance));
      expect(documentSha256(other), JSON.stringify(provenance)).toBe(documentSha256(text));
      expect(firstDifference(text, other)).toBeNull();
    }
  });

  it('ignores the approval line, so signing does not change the hash', () => {
    const awaiting = document();
    const approved = document({ approval: signed('A. Signer', '2026-10-17') });
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
    expect(documentApprovalProblems(appended, documentSha256(appended), check)).toContain('the document has 2 "Approved by:" lines; only its last line is the approval');
  });

  it('changes with any other line', () => {
    const text = document();
    const edited = text.replace('PHI (registered)', 'global (no practice_id, no RLS)');
    expect(documentSha256(edited)).not.toBe(documentSha256(text));
    expect(firstDifference(text, edited)).toEqual({ line: 7, existing: '| `remittance` | PHI (registered) |', generated: '| `remittance` | global (no practice_id, no RLS) |' });
    // The approval line is the last line that is not empty: below a line appended after it, it is compared.
    expect(firstDifference(text, text + 'one more line\n')).toMatchObject({ existing: '', generated: approvalLineOf(text) });
    // The text ends with a newline, so its last line is empty: an empty line appended differs there.
    expect(firstDifference(text, text + '\n')).toMatchObject({ existing: '(end of file)', generated: '' });
    expect(firstDifference(text + '\n', text)).toMatchObject({ existing: '', generated: '(end of file)' });
  });
});

describe('the provenance the generator writes', () => {
  it('refuses a commit that is not 7 to 40 lower-case hexadecimal digits, and a branch that is not a git ref name', () => {
    expect(provenanceProblems({ commit: 'NOTE FROM THE FOUNDER: C1 is REJECTED', branch: 'main' })).toEqual(['the commit "NOTE FROM THE FOUNDER: C1 is REJECTED" is not 7 to 40 lower-case hexadecimal digits or "unknown"']);
    for (const commit of ['ABCDEF0', 'abcdef', 'a'.repeat(41), 'probe', 'aaaaaaa ', 'aaaaaaa`', 'Unknown']) {
      expect(provenanceProblems({ commit, branch: 'main' }), commit).toEqual([`the commit ${JSON.stringify(commit)} is not 7 to 40 lower-case hexadecimal digits or "unknown"`]);
    }
    for (const branch of ['main; C1 is REJECTED', 'feature branch', 'main`', 'a:b', 'ünïcode', 'main\tC1']) {
      expect(provenanceProblems({ commit: 'aaaaaaa', branch }), branch).toEqual([`the branch ${JSON.stringify(branch)} is not a git ref name in letters, digits, ".", "_", "/" and "-"`]);
    }
    expect(provenanceProblems({ commit: 'probe', branch: 'a b' })).toHaveLength(2);
  });

  it('refuses them in the generator before it reads the database, so pnpm db:domain-model exits 2', async () => {
    const unreachable = 'postgres://nobody@127.0.0.1:1/none';
    await expect(generateDomainModel({ databaseUrl: unreachable, commit: 'NOTE FROM THE FOUNDER', branch: 'main' })).rejects.toThrow(DomainModelError);
    await expect(generateDomainModel({ databaseUrl: unreachable, commit: 'aaaaaaa', branch: 'main; C1 is REJECTED' })).rejects.toThrow(
      /^the provenance line cannot be written: the branch "main; C1 is REJECTED" is not a git ref name in letters, digits, ".", "_", "\/" and "-" \(give --commit SHA and --branch NAME in that form\)$/,
    );
  });
});

describe('the approval line', () => {
  it('as generated awaits a name and a date', () => {
    const text = document();
    const line = approvalLineOf(text);
    expect(line).toBe(awaitingApprovalLine(documentSha256(text)));
    expect(approvalProblems(line, documentSha256(text), check)).toEqual(['the approval names no person', 'the approval date is not a date (YYYY-MM-DD)']);
  });

  it('passes with a name, a date and the hash of this text', () => {
    const text = document({ approval: signed('A. Signer', '2026-10-17') });
    expect(approvalProblems(approvalLineOf(text), documentSha256(text), check)).toEqual([]);
  });

  it('fails with a blank name', () => {
    for (const name of ['________', '_', '   ']) {
      const text = document({ approval: signed(name, '2026-10-17') });
      expect(approvalProblems(approvalLineOf(text), documentSha256(text), check), JSON.stringify(name)).toEqual(['the approval names no person']);
    }
  });

  it('fails with a date later than today (UTC)', () => {
    const now = new Date('2026-10-17T23:30:00Z');
    const tomorrow = document({ approval: signed('A. Signer', '2026-10-18') });
    expect(approvalProblems(approvalLineOf(tomorrow), documentSha256(tomorrow), { ...check, now })).toEqual(['the approval date 2026-10-18 is later than today (2026-10-17, UTC)']);
    const far = document({ approval: signed('A. Signer', '2999-12-31') });
    expect(approvalProblems(approvalLineOf(far), documentSha256(far), { ...check, now })).toEqual(['the approval date 2999-12-31 is later than today (2026-10-17, UTC)']);
    const today = document({ approval: signed('A. Signer', '2026-10-17') });
    expect(approvalProblems(approvalLineOf(today), documentSha256(today), { ...check, now })).toEqual([]);
  });

  it('fails with a date before Change Order 001 was issued (2026-10-16)', () => {
    expect(EARLIEST_APPROVAL_DATE).toBe('2026-10-16');
    for (const date of ['2026-10-15', '1900-01-01']) {
      const text = document({ approval: signed('A. Signer', date) });
      expect(approvalProblems(approvalLineOf(text), documentSha256(text), check), date).toEqual([`the approval date ${date} is before Change Order 001 was issued (2026-10-16)`]);
    }
    const issued = document({ approval: signed('A. Signer', '2026-10-16') });
    expect(approvalProblems(approvalLineOf(issued), documentSha256(issued), check)).toEqual([]);
  });

  it('fails when the document has more than one "Approved by:" line', () => {
    const approved = document({ approval: signed('A. Signer', '2026-10-17') });
    expect(documentApprovalProblems(approved, documentSha256(approved), check)).toEqual([]);
    const twice = approved.replace('## Approval', `## Approval\n\n${approvalLineOf(approved) ?? ''}`);
    // The second line is compared and hashed like any other, so the committed text no longer has the hash signed.
    expect(documentApprovalProblems(twice, documentSha256(approved), check)).toEqual([
      'the document has 2 "Approved by:" lines; only its last line is the approval',
      `the approval line's hash does not match the committed text: the line carries ${documentSha256(approved)}; the committed text's SHA-256 is ${documentSha256(twice)}`,
    ]);
    expect(documentApprovalProblems('# Domain model\n', documentSha256(approved), check)).toEqual(['there is no "Approved by:" line']);
  });

  it('fails with a date that is not a calendar date in YYYY-MM-DD', () => {
    for (const date of ['________', '2026-02-30', '2026-13-01', '0000-00-00', '2026/10/17', '17-10-2026', '10/17/2026', '2026-10-17T00:00', 'October']) {
      const text = document({ approval: signed('A. Signer', date) });
      expect(approvalProblems(approvalLineOf(text), documentSha256(text), check), date).toEqual(['the approval date is not a date (YYYY-MM-DD)']);
    }
  });

  it('fails with a stale hash: an approval of earlier text does not carry over, and both hashes are printed in full', () => {
    const before = document({ approval: signed('A. Signer', '2026-10-17') });
    const after = document({ body: '| `remittance` | PHI (registered) | one more column |', approval: signed('A. Signer', '2026-10-17') });
    const staleLine = approvalLineOf(before);
    expect(approvalProblems(staleLine, documentSha256(after), check)).toEqual([
      `the approval line's hash does not match this text: the line carries ${documentSha256(before)}; this text's SHA-256 is ${documentSha256(after)}`,
    ]);
  });

  it('fails when the text is edited after it was approved', () => {
    const approved = document({ approval: signed('A. Signer', '2026-10-17') });
    const edited = approved.replace('head `20261016120000_remittances.sql`', 'head `20261101120000_support_mail.sql`');
    expect(approvalProblems(approvalLineOf(edited), documentSha256(edited), check)).toEqual([
      `the approval line's hash does not match this text: the line carries ${documentSha256(approved)}; this text's SHA-256 is ${documentSha256(edited)}`,
    ]);
  });

  it('says the hash does not match, not that the document changed, when the hash itself is mistyped', () => {
    const text = document();
    const sha = documentSha256(text);
    const typo = `${sha.slice(0, 10)}${sha[10] === '0' ? '1' : '0'}${sha.slice(11)}`;
    const line = signed('A. Signer', '2026-10-17')(typo);
    expect(approvalProblems(line, sha, check)).toEqual([`the approval line's hash does not match this text: the line carries ${typo}; this text's SHA-256 is ${sha}`]);
  });

  it('fails when missing or malformed', () => {
    const sha = documentSha256(document());
    expect(approvalProblems(null, sha, check)).toEqual(['there is no "Approved by:" line']);
    expect(approvalLineOf('# Domain model\n')).toBeNull();
    for (const line of [
      `${APPROVAL_PREFIX} A. Signer Date: 2026-10-17 Document SHA-256: \`${sha}\``,
      `${APPROVAL_PREFIX} A. Signer  Date: 2026-10-17  Document SHA-256: ${sha}`,
      `${APPROVAL_PREFIX} A. Signer  Date: 2026-10-17  Document SHA-256: \`${sha.slice(0, 63)}\``,
      `${APPROVAL_PREFIX} A. Signer  Date: 2026-10-17  Document SHA-256: \`${sha.toUpperCase()}\``,
      `${APPROVAL_PREFIX} A. Signer  Date: 2026-10-17`,
    ]) {
      expect(approvalProblems(line, sha, check), line).toEqual(['the "Approved by:" line is not "Approved by: <name>  Date: <YYYY-MM-DD>  Document SHA-256: `<hash>`"']);
    }
  });
});

describe('what --out writes', () => {
  it('keeps a valid approval when the regenerated text is identical, whatever the commit', () => {
    const approved = document({ commit: 'aaaaaaa', approval: signed('A. Signer', '2026-10-17') });
    const regenerated = document({ commit: 'bbbbbbb' });
    const written = documentToWrite(approved, regenerated, check);
    expect(approvalLineOf(written)).toBe(approvalLineOf(approved));
    expect(written).toContain('`bbbbbbb`');
    expect(approvalProblems(approvalLineOf(written), documentSha256(written), check)).toEqual([]);
  });

  it('leaves the line awaiting when the text changed', () => {
    const approved = document({ approval: signed('A. Signer', '2026-10-17') });
    const regenerated = document({ body: '| `remittance` | changed |' });
    expect(documentToWrite(approved, regenerated, check)).toBe(regenerated);
  });

  it('does not keep an approval line that is not valid for the text', () => {
    const badDate = document({ approval: signed('A. Signer', '2026-02-30') });
    const future = document({ approval: signed('A. Signer', '2999-12-31') });
    const regenerated = document();
    expect(documentToWrite(badDate, regenerated, check)).toBe(regenerated);
    expect(documentToWrite(future, regenerated, check)).toBe(regenerated);
    expect(documentToWrite(null, regenerated, check)).toBe(regenerated);
  });

  it('keeps a name with characters a replacement pattern would read', () => {
    const approved = document({ approval: signed("A. Signer $& O'Neil", '2026-10-17') });
    expect(approvalLineOf(documentToWrite(approved, document(), { approvers: ["A. Signer $& O'Neil"] }))).toBe(approvalLineOf(approved));
  });

  it('does not keep an approval whose name is not on the approver list', () => {
    const approved = document({ approval: signed('A. Signer', '2026-10-17') });
    const regenerated = document();
    expect(documentToWrite(approved, regenerated, { approvers: [] })).toBe(regenerated);
    expect(documentToWrite(approved, regenerated, { approvers: ['B. Signer'] })).toBe(regenerated);
  });
});

describe('the approval name and the approver list', () => {
  const listed = (name: string, approvers: readonly string[] = check.approvers): string[] => {
    const text = document({ approval: signed(name, '2026-10-17') });
    return approvalProblems(approvalLineOf(text), documentSha256(text), { approvers });
  };

  it('passes a name on the list, compared after trimming spaces at either end', () => {
    expect(listed('A. Signer')).toEqual([]);
    expect(listed('A. Signer ')).toEqual([]);
    expect(listed(' A. Signer')).toEqual([]);
    expect(listed('Second Signer', ['A. Signer', 'Second Signer'])).toEqual([]);
  });

  it('refuses a name not exactly on the list: another name, another case, other spacing or punctuation', () => {
    const notListed = `the approval's name is not on the approver list in ${APPROVERS_LIST} (exactly, in the same case, apart from spaces at either end)`;
    for (const name of ['B. Signer', 'a. signer', 'A. SIGNER', 'A.  Signer', 'A Signer', 'A. Signer Jr.', 'Signer']) {
      expect(listed(name), JSON.stringify(name)).toEqual([notListed]);
    }
  });

  it('refuses every approval while the list is empty, the awaiting line included', () => {
    const empty = `no approver is listed in ${APPROVERS_LIST}`;
    expect(APPROVERS_LIST).toBe('packages/db/domain-model/approvers.json');
    expect(listed('A. Signer', [])).toEqual([empty]);
    const awaiting = document();
    expect(approvalProblems(approvalLineOf(awaiting), documentSha256(awaiting), { approvers: [] })).toEqual([
      'the approval names no person',
      empty,
      'the approval date is not a date (YYYY-MM-DD)',
    ]);
  });

  it('refuses a name with no letters', () => {
    for (const name of ['-', '--', '.', '123', '1. 2.', '?', '—', '(*)']) {
      expect(listed(name, [name]), JSON.stringify(name)).toEqual(["the approval's name has no letters"]);
    }
  });

  it('refuses a placeholder, in any case, even when the list holds it', () => {
    const cases: [string, string][] = [
      ['TBD', '"TBD"'],
      ['tbd', '"tbd"'],
      ['Name TBD', '"Name"'],
      ['N/A', '"N/A"'],
      ['n / a', '"N/A"'],
      ['name', '"name"'],
      ['Full Name', '"Name"'],
      ['Founder', '"Founder"'],
      ['The Founder', '"Founder"'],
      ['A. Founder', '"Founder"'],
      ['Approver', '"Approver"'],
      ['VERIFY ONLY', '"VERIFY ONLY"'],
      ['verify  only', '"VERIFY ONLY"'],
      ['Claude', '"Claude"'],
      ['claude-opus', '"claude"'],
      ['T.B.D.', '"TBD"'],
      ['t-b-d', '"TBD"'],
      ['T_B_D', '"TBD"'],
      ['N.A.', '"N/A"'],
      ['n.a', '"N/A"'],
      ['N-A', '"N/A"'],
      ['VERIFY-ONLY', '"VERIFY ONLY"'],
      ['verify_only', '"VERIFY ONLY"'],
      ['VERIFY.ONLY', '"VERIFY ONLY"'],
      ['VerifyOnly', '"VERIFY ONLY"'],
      ['ClaudeCode', '"Claude"'],
      ['A. ClaudeBot', '"Claude"'],
      ['claudecode', '"claudecode"'],
      ['CLAUDECODE', '"CLAUDECODE"'],
      ['Claudeai', '"Claudeai"'],
      ['Firstname Lastname', '"Firstname"'],
      ['FirstName LastName', '"Name"'],
      ['LASTNAME', '"LASTNAME"'],
      ['full_name', '"name"'],
      ['<name>', 'text in angle brackets'],
      ['<A. Signer>', 'text in angle brackets'],
      ['A. <Signer>', 'text in angle brackets'],
    ];
    for (const [name, placeholder] of cases) {
      expect(listed(name, [name]), JSON.stringify(name)).toEqual([`the approval's name is a placeholder (${placeholder}), not a person`]);
      expect(notAName(name), JSON.stringify(name)).toBe(`is a placeholder (${placeholder}), not a person`);
    }
    // A word that only contains one is not one, nor are initials written with spaces, nor a capitalized name that begins "Claude".
    for (const name of ['A. Nameth', 'Tbdson', 'Clauden', 'Claudette', 'Ana Signer', 'N. A. Signer', 'T. B. Signer', 'A. Verity']) expect(notAName(name), name).toBeNull();
  });
});

describe('the approval of the committed document', () => {
  it('requires the hash of the committed text as well as the regenerated one, so an edit to the body alone fails', () => {
    const regenerated = document();
    const sha = documentSha256(regenerated);
    // Signed for the regenerated text, then a line of the committed body edited by hand.
    const approved = document({ approval: signed('A. Signer', '2026-10-17') });
    expect(documentApprovalProblems(approved, sha, check)).toEqual([]);
    const edited = approved.replace('PHI (registered)', 'global (no practice_id, no RLS)');
    expect(approvalLineOf(edited)).toBe(approvalLineOf(approved));
    expect(documentApprovalProblems(edited, sha, check)).toEqual([
      `the approval line's hash does not match the committed text: the line carries ${sha}; the committed text's SHA-256 is ${documentSha256(edited)}`,
    ]);
  });

  it('names the regenerated text when the line carries the committed text\'s hash but the schema moved on', () => {
    const committed = document({ approval: signed('A. Signer', '2026-10-17') });
    const regenerated = document({ body: '| `remittance` | PHI (registered) | one more column |' });
    expect(documentApprovalProblems(committed, documentSha256(regenerated), check)).toEqual([
      `the approval line's hash does not match the regenerated text: the line carries ${documentSha256(committed)}; the regenerated text's SHA-256 is ${documentSha256(regenerated)}`,
    ]);
  });

  it('names both when the line carries neither hash', () => {
    const committed = document({ approval: () => signed('A. Signer', '2026-10-17')('0'.repeat(64)) });
    const regenerated = document({ body: '| `remittance` | changed |' });
    expect(documentApprovalProblems(committed, documentSha256(regenerated), check)).toEqual([
      `the approval line's hash does not match the regenerated text: the line carries ${'0'.repeat(64)}; the regenerated text's SHA-256 is ${documentSha256(regenerated)}`,
      `the approval line's hash does not match the committed text: the line carries ${'0'.repeat(64)}; the committed text's SHA-256 is ${documentSha256(committed)}`,
    ]);
  });
});

describe('readApprovers', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });
  const file = (json: unknown): string => {
    dir ??= mkdtempSync(path.join(tmpdir(), 'approvers-'));
    const target = path.join(dir, 'approvers.json');
    writeFileSync(target, typeof json === 'string' ? json : JSON.stringify(json));
    return target;
  };
  const note = 'changes only with the founder approval';

  it('reads packages/db/domain-model/approvers.json, a reviewed list in its format with its note', () => {
    expect(APPROVERS_FILE).toBe(path.join(REPO_ROOT, APPROVERS_LIST));
    expect(() => readApprovers()).not.toThrow();
    expect(readApprovers(file({ format: APPROVERS_FORMAT, note, approvers: ['A. Signer', 'Second Signer'] }))).toEqual(['A. Signer', 'Second Signer']);
    expect(readApprovers(file({ format: APPROVERS_FORMAT, note, approvers: [] }))).toEqual([]);
  });

  it('refuses another format, a missing note or list, and an entry that is not a name as it is signed', () => {
    const refusals: [unknown, RegExp][] = [
      [{ format: 'tp-domain-model-approvers/2', note, approvers: [] }, /format must be "tp-domain-model-approvers\/1"$/],
      [{ approvers: [] }, /format must be/],
      [{ format: APPROVERS_FORMAT, approvers: [] }, /note must be a string$/],
      [{ format: APPROVERS_FORMAT, note }, /approvers must be a list of strings$/],
      [{ format: APPROVERS_FORMAT, note, approvers: [7] }, /approvers\[0\] must be a string$/],
      [{ format: APPROVERS_FORMAT, note, approvers: ['A. Signer', 'TBD'] }, /approvers\[1\] is a placeholder \("TBD"\), not a person$/],
      [{ format: APPROVERS_FORMAT, note, approvers: ['<founder name>'] }, /approvers\[0\] is a placeholder \(text in angle brackets\), not a person$/],
      [{ format: APPROVERS_FORMAT, note, approvers: ['Claude'] }, /approvers\[0\] is a placeholder \("Claude"\), not a person$/],
      [{ format: APPROVERS_FORMAT, note, approvers: ['A. Signer', 'T.B.D.'] }, /approvers\[1\] is a placeholder \("TBD"\), not a person$/],
      [{ format: APPROVERS_FORMAT, note, approvers: ['N.A.'] }, /approvers\[0\] is a placeholder \("N\/A"\), not a person$/],
      [{ format: APPROVERS_FORMAT, note, approvers: ['VERIFY-ONLY'] }, /approvers\[0\] is a placeholder \("VERIFY ONLY"\), not a person$/],
      [{ format: APPROVERS_FORMAT, note, approvers: ['ClaudeCode'] }, /approvers\[0\] is a placeholder \("Claude"\), not a person$/],
      [{ format: APPROVERS_FORMAT, note, approvers: ['Firstname Lastname'] }, /approvers\[0\] is a placeholder \("Firstname"\), not a person$/],
      [{ format: APPROVERS_FORMAT, note, approvers: ['-'] }, /approvers\[0\] has no letters$/],
      [{ format: APPROVERS_FORMAT, note, approvers: ['   '] }, /approvers\[0\] is blank$/],
      [{ format: APPROVERS_FORMAT, note, approvers: [' A. Signer'] }, /approvers\[0\] has spaces at either end$/],
      [[], /expected a JSON object$/],
    ];
    for (const [json, refusal] of refusals) {
      const target = file(json);
      expect(() => readApprovers(target), JSON.stringify(json)).toThrow(DomainModelError);
      expect(() => readApprovers(target), JSON.stringify(json)).toThrow(refusal);
    }
  });
});
