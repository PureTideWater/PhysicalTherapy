import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { render835 } from '../../packages/synth/src/cases/builder';
import { minimalFile } from '../../packages/synth/src/cases/par';
import { repositoryRoot } from '../content-files';

/**
 * Every Claude Code hook in .claude/hooks, run as Claude Code runs it: the hook input as JSON on stdin, exit 2
 * to refuse with the reason on stderr (docs/adr/0059). The hooks are wired by .claude/settings.json, which lands
 * in the final pass; until then these tests and CI's own checks hold their rules. A hook script with no cases
 * here fails the suite. Nothing here writes into the worktree: the scratch repositories and workspaces live in
 * the system's temporary directory, and .claude/.allow-protected-edit is only ever made there.
 */
const HOOKS = path.join(repositoryRoot, '.claude/hooks');
const scratchDirs: string[] = [];

afterAll(() => {
  for (const dir of scratchDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function scratch(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `tp-hook-${prefix}-`));
  scratchDirs.push(dir);
  return dir;
}

function gitRepository(prefix: string, files: Readonly<Record<string, string>> = {}): string {
  const root = scratch(prefix);
  spawnSync('git', ['init', '-q', root]);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

interface Run {
  readonly status: number | null;
  readonly stderr: string;
}

function run(script: string, input: unknown, env: NodeJS.ProcessEnv = process.env): Run {
  const result = spawnSync('/bin/bash', [script], { input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', env, timeout: 120_000 });
  return { status: result.status, stderr: result.stderr };
}

/** A PATH holding only the named commands (links to the real ones), to show a hook fail closed without the rest. */
function pathWith(commands: readonly string[]): string {
  const bin = scratch('bin');
  for (const command of commands) {
    const found = spawnSync('/bin/bash', ['-c', `command -v ${command}`], { encoding: 'utf8' }).stdout.trim();
    expect(found, command).not.toBe('');
    symlinkSync(found, path.join(bin, command));
  }
  return bin;
}

const COREUTILS = ['cat', 'cut', 'tr', 'dirname', 'git', 'jq'];

const hook = (name: string) => path.join(HOOKS, name);

/** The cases of each hook script, by file name. */
const CASES: Readonly<Record<string, () => void>> = {
  'fixture-guard.sh': () => {
    const script = hook('fixture-guard.sh');
    const synthetic = render835(minimalFile()).text;
    const write = (file: string, content: string) => run(script, { tool_name: 'Write', cwd: repositoryRoot, tool_input: { file_path: path.join(repositoryRoot, file), content } });
    // The X12 rule, unchanged: anywhere, a Write whose content is an interchange from another sender is refused.
    const other = write('anywhere/remit.835', synthetic.replace('SYNTHSENDER    ', 'OTHERSENDER    '));
    expect(other.status).toBe(2);
    expect(other.stderr).toContain('contains an X12 interchange whose sender is not SYNTHSENDER');
    expect(run(script, { tool_name: 'Edit', cwd: repositoryRoot, tool_input: { file_path: 'docs/x.md', new_string: synthetic.replace('SYNTHSENDER    ', 'OTHERSENDER    ') } }).status).toBe(2);
    expect(write('anywhere/remit.835', synthetic).status).toBe(0);
    expect(write('fixtures/synthetic/PAR-99/remit.835', synthetic).status).toBe(0);
    // Under fixtures/ the file is checked whole, so a byte-order mark before another sender is refused too.
    expect(write('fixtures/synthetic/PAR-99/remit.835', `\uFEFF${synthetic.replace('SYNTHSENDER    ', 'OTHERSENDER    ')}`).status).toBe(2);
    // The tabular rule: under fixtures/ or packages/synth/, a CSV or TSV carries SYNTHSENDER in an identifier column.
    const unmarked = write('fixtures/synthetic/LED-99/posting-export.csv', 'Post Date,Paid Amount\n06/11/2026,30.00\n');
    expect(unmarked.status).toBe(2);
    expect(unmarked.stderr).toContain('Blocked: fixtures/synthetic/LED-99/posting-export.csv: no column of its header is an identifier column');
    expect(write('fixtures/synthetic/LED-99/posting-export.csv', 'Post Date,Payee ID\n06/11/2026,SYNTHSENDER\n').status).toBe(0);
    expect(write('packages/synth/scratch.tsv', 'Post Date\tPaid\n06/11/2026\t30.00\n').status).toBe(2);
    expect(write('apps/web/scratch.csv', 'Post Date,Paid\n06/11/2026,30.00\n').status).toBe(0);
    expect(write('fixtures/synthetic/LED-99/notes.md', 'Post Date,Paid\n').status).toBe(0);
    // Another spelling of a path under fixtures/ is the same path: dot segments, a case, a link to the directory.
    expect(write('packages/x/../../fixtures/synthetic/LED-99/a.csv', 'Post Date,Paid\n06/11/2026,30.00\n').status).toBe(2);
    expect(run(script, { tool_name: 'Write', cwd: repositoryRoot, tool_input: { file_path: './Fixtures/./LED-99/A.CSV', content: 'Post Date,Paid\n06/11/2026,30.00\n' } }).status).toBe(2);
    const linked = path.join(scratch('link'), 'fixtures');
    symlinkSync(path.join(repositoryRoot, 'fixtures'), linked);
    expect(run(script, { tool_name: 'Write', cwd: repositoryRoot, tool_input: { file_path: path.join(linked, 'synthetic/LED-99/a.csv'), content: 'Post Date,Paid\n06/11/2026,30.00\n' } }).status).toBe(2);
    // A spreadsheet there is refused whatever it holds; with no file path the hook has nothing to check.
    expect(write('fixtures/synthetic/LED-99/export.xlsx', 'PK').status).toBe(2);
    expect(run(script, { tool_name: 'Write', tool_input: { content: 'a,b\n' } }).status).toBe(0);
    // It fails closed: without jq, without node, or without tsx beside it.
    expect(run(script, {}, { PATH: pathWith([]) }).status).toBe(2);
    const noNode = run(script, { tool_name: 'Write', cwd: repositoryRoot, tool_input: { file_path: path.join(repositoryRoot, 'fixtures/a.csv'), content: 'a\n' } }, { PATH: pathWith(COREUTILS) });
    expect(noNode.status).toBe(2);
    expect(noNode.stderr).toContain('node is required');
    const bare = scratch('bare');
    mkdirSync(path.join(bare, '.claude/hooks'), { recursive: true });
    copyFileSync(script, path.join(bare, '.claude/hooks/fixture-guard.sh'));
    const noTsx = run(path.join(bare, '.claude/hooks/fixture-guard.sh'), { tool_name: 'Write', cwd: repositoryRoot, tool_input: { file_path: path.join(repositoryRoot, 'fixtures/a.csv'), content: 'Payee ID\nSYNTHSENDER\n' } });
    expect(noTsx.status).toBe(2);
    expect(noTsx.stderr).toContain('tsx is required');
  },

  'protect-content.sh': () => {
    const script = hook('protect-content.sh');
    const root = gitRepository('content', { 'content/releases/2026-01/manifest.json': '{}\n', 'packages/db/migrations/0001.sql': 'select 1;\n' });
    const edit = (file: string) => run(script, { tool_name: 'Edit', cwd: root, tool_input: { file_path: file } });
    const release = edit('content/releases/2026-01/manifest.json');
    expect(release.status).toBe(2);
    expect(release.stderr).toContain('is a published release');
    expect(edit(path.join(root, 'content/releases/2026-01/manifest.json')).status).toBe(2);
    const migration = edit('packages/db/migrations/0001.sql');
    expect(migration.status).toBe(2);
    expect(migration.stderr).toContain('Use /new-migration');
    expect(edit('content/drafts/a.json').status).toBe(0);
    expect(run(script, { tool_name: 'Edit', cwd: root, tool_input: {} }).status).toBe(0);
    // The new-migration skill's marker, made in the scratch repository only, lets a migration through.
    mkdirSync(path.join(root, '.claude'), { recursive: true });
    writeFileSync(path.join(root, '.claude/.allow-protected-edit'), '');
    expect(edit('packages/db/migrations/0001.sql').status).toBe(0);
    expect(edit('content/releases/2026-01/manifest.json').status).toBe(2);
    expect(run(script, {}, { PATH: pathWith([]) }).status).toBe(2);
  },

  'typecheck.sh': () => {
    const script = hook('typecheck.sh');
    const edit = (cwd: string, file: string) => run(script, { tool_name: 'Edit', cwd, tool_input: { file_path: path.join(cwd, file) } });
    // The fast paths: a file that is not TypeScript, and TypeScript outside apps/ and packages/.
    expect(edit(repositoryRoot, 'README.md').status).toBe(0);
    expect(edit(repositoryRoot, 'tools/hooks/hooks.test.ts').status).toBe(0);
    expect(run(script, { tool_name: 'Edit', tool_input: {} }).status).toBe(0);
    // A workspace whose package fails its typecheck: exit 2 with the errors; one that passes, exit 0.
    const workspace = gitRepository('workspace', {
      'pnpm-workspace.yaml': 'packages:\n  - "packages/*"\n',
      'package.json': JSON.stringify({ name: 'scratch', private: true }),
      'packages/bad/package.json': JSON.stringify({ name: 'bad', private: true, scripts: { typecheck: "node -e \"console.error('error TS2322: not assignable'); process.exit(1)\"" } }),
      'packages/good/package.json': JSON.stringify({ name: 'good', private: true, scripts: { typecheck: 'node -e "process.exit(0)"' } }),
    });
    const bad = edit(workspace, 'packages/bad/src/a.ts');
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain('error TS2322: not assignable');
    expect(edit(workspace, 'packages/good/src/a.tsx').status).toBe(0);
  },

  'protect-approval.sh': () => {
    const script = hook('protect-approval.sh');
    const document = 'Generated.\n\nApproved by: ________  Date: ________  Document SHA-256: `00`\n';
    const approvers = '{\n  "approvers": []\n}\n';
    const root = gitRepository('approval', { 'docs/product/domain-model.md': document, 'packages/db/domain-model/approvers.json': approvers });
    const call = (toolName: string, toolInput: Record<string, unknown>) => run(script, { tool_name: toolName, cwd: root, tool_input: toolInput });
    const model = 'docs/product/domain-model.md';
    const list = 'packages/db/domain-model/approvers.json';
    // The approval line: any call whose result changes it is refused, whatever the call touches.
    const signed = call('Edit', { file_path: model, old_string: 'Approved by: ________', new_string: 'Approved by: A. Founder' });
    expect(signed.status).toBe(2);
    expect(signed.stderr).toContain("The founder's approval is written only on the founder's instruction");
    expect(call('Edit', { file_path: path.join(root, model), old_string: '________  Document', new_string: '2026-10-17  Document' }).status).toBe(2);
    expect(call('Write', { file_path: model, content: 'Regenerated.\n' }).status).toBe(2);
    expect(call('MultiEdit', { file_path: model, edits: [{ old_string: 'Generated.', new_string: 'Regenerated.' }, { old_string: '`00`', new_string: '`11`' }] }).status).toBe(2);
    // Anything else in the document, or an edit that cannot apply, passes.
    expect(call('Edit', { file_path: model, old_string: 'Generated.', new_string: 'Regenerated.' }).status).toBe(0);
    expect(call('Write', { file_path: model, content: document.replace('Generated.', 'Regenerated.') }).status).toBe(0);
    expect(call('Edit', { file_path: model, old_string: 'not in the file', new_string: 'Approved by: X' }).status).toBe(0);
    expect(call('Edit', { file_path: model, old_string: '________', new_string: 'X' }).status).toBe(0);
    expect(call('Edit', { file_path: model, old_string: '________', new_string: 'X', replace_all: true }).status).toBe(2);
    // A document that does not exist yet (PR 2 adds it) is held to the same rule.
    const empty = gitRepository('approval-new');
    expect(run(script, { tool_name: 'Write', cwd: empty, tool_input: { file_path: model, content: document } }).status).toBe(2);
    expect(run(script, { tool_name: 'Write', cwd: empty, tool_input: { file_path: model, content: 'No line yet.\n' } }).status).toBe(0);
    // The approver list: any change at all is refused; a Write of the same text changes nothing.
    const listed = call('Edit', { file_path: list, old_string: '[]', new_string: '["A. Founder"]' });
    expect(listed.status).toBe(2);
    expect(listed.stderr).toContain('changes only on the founder');
    expect(call('Write', { file_path: list, content: approvers.replace('approvers', 'note": "", "approvers') }).status).toBe(2);
    expect(run(script, { tool_name: 'Write', cwd: empty, tool_input: { file_path: list, content: approvers } }).status).toBe(2);
    expect(call('Write', { file_path: list, content: approvers }).status).toBe(0);
    // Another spelling of the same path is the same file.
    expect(call('Edit', { file_path: 'docs/../docs/./product/domain-model.md', old_string: 'Approved by: ________', new_string: 'Approved by: X' }).status).toBe(2);
    expect(call('Write', { file_path: path.join(root, 'packages/db/x/../domain-model/approvers.json'), content: '{}' }).status).toBe(2);
    // Other files, other tools and a call with no file pass; without jq, or with input it cannot read, it fails closed.
    expect(call('Write', { file_path: 'docs/product/other.md', content: 'Approved by: X\n' }).status).toBe(0);
    expect(call('Read', { file_path: model }).status).toBe(0);
    expect(call('Edit', {}).status).toBe(0);
    expect(run(script, {}, { PATH: pathWith([]) }).status).toBe(2);
    expect(run(script, `{"tool_name":"Edit","cwd":"${root}","tool_input":{"file_path":"${model}","edits":7`).status).toBe(2);
    expect(readFileSync(path.join(root, model), 'utf8')).toBe(document);
  },
};

describe('the Claude Code hooks', () => {
  const scripts = readdirSync(HOOKS)
    .filter((name) => name.endsWith('.sh'))
    .sort();

  it('each have cases here, and are executable', () => {
    expect(scripts).toEqual(Object.keys(CASES).sort());
    for (const name of scripts) {
      expect(statSync(path.join(HOOKS, name)).mode & 0o111, name).not.toBe(0);
    }
  });

  for (const [name, cases] of Object.entries(CASES)) {
    it(`${name} allows and refuses as its rules say`, cases, 120_000);
  }
});
