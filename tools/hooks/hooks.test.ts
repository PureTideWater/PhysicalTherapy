import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { render835 } from '../../packages/synth/src/cases/builder';
import { minimalFile } from '../../packages/synth/src/cases/par';
import { repositoryRoot } from '../content-files';

/**
 * Every Claude Code hook in .claude/hooks, run as Claude Code runs it: the hook input as JSON on stdin, exit 2
 * to refuse with the reason on stderr (docs/adr/0059). .claude/settings.json wires them (docs/adr/0063): the
 * three guards before every edit tool (Edit, Write, MultiEdit, NotebookEdit), the GitHub guard before every
 * connector tool that reviews a pull request or writes files, the typecheck after each edit tool that writes
 * text, the pre-push checks' installation when a session starts, and the last describe block runs them as it wires them, each edit tool allowed and refused. A hook
 * script with no cases here, or not wired, fails the suite. Nothing here writes into the worktree: the scratch
 * repositories and workspaces live in the system's temporary directory, and .claude/.allow-protected-edit is only
 * ever made there.
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
  readonly stdout: string;
  readonly stderr: string;
}

function run(script: string, input: unknown, env: NodeJS.ProcessEnv = process.env, cwd?: string): Run {
  const result = spawnSync('/bin/bash', [script], { input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', env, cwd, timeout: 120_000 });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
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
    // A MultiEdit creating the same interchange is held to the same rule, edit by edit.
    const multi = run(script, { tool_name: 'MultiEdit', cwd: repositoryRoot, tool_input: { file_path: 'docs/remit.835', edits: [{ old_string: '', new_string: synthetic.replace('SYNTHSENDER    ', 'OTHERSENDER    ') }] } });
    expect(multi.status).toBe(2);
    expect(multi.stderr).toContain('contains an X12 interchange whose sender is not SYNTHSENDER');
    expect(run(script, { tool_name: 'MultiEdit', cwd: repositoryRoot, tool_input: { file_path: 'docs/remit.835', edits: [{ old_string: 'a', new_string: 'b' }, { old_string: '', new_string: synthetic }] } }).status).toBe(0);
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
    // A link to a fixture file, outside fixtures/: a Write follows it into the fixture, so the fixture's rule applies.
    const fileLink = path.join(scratch('file-link'), 'link.csv');
    symlinkSync(path.join(repositoryRoot, 'fixtures/synthetic/LED-04/posting-export.csv'), fileLink);
    expect(run(script, { tool_name: 'Write', cwd: repositoryRoot, tool_input: { file_path: fileLink, content: 'Post Date,Paid\n06/11/2026,1.00\n' } }).status).toBe(2);
    expect(run(script, { tool_name: 'Write', cwd: repositoryRoot, tool_input: { file_path: fileLink, content: 'Post Date,Payee ID\n06/11/2026,SYNTHSENDER\n' } }).status).toBe(0);
    // A link to a link, relative, ends at the fixture too.
    const chain = path.join(path.dirname(fileLink), 'chain.csv');
    symlinkSync('link.csv', chain);
    expect(run(script, { tool_name: 'Write', cwd: repositoryRoot, tool_input: { file_path: chain, content: 'Post Date,Paid\n06/11/2026,1.00\n' } }).status).toBe(2);
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
    // A NotebookEdit (its file is notebook_path, its text new_source): no notebook under fixtures/ or packages/synth/,
    // and the X12 rule for its source anywhere (docs/adr/0063).
    const notebook = (file: string, source: string) => run(script, { tool_name: 'NotebookEdit', cwd: repositoryRoot, tool_input: { notebook_path: path.join(repositoryRoot, file), new_source: source, edit_mode: 'replace' } });
    const inFixtures = notebook('fixtures/synthetic/LED-99/explore.ipynb', 'print(1)');
    expect(inFixtures.status).toBe(2);
    expect(inFixtures.stderr).toContain('where no notebook belongs');
    expect(notebook('packages/synth/src/explore.ipynb', 'print(1)').status).toBe(2);
    expect(notebook('docs/explore.ipynb', 'print(1)').status).toBe(0);
    const notebookX12 = notebook('docs/explore.ipynb', synthetic.replace('SYNTHSENDER    ', 'OTHERSENDER    '));
    expect(notebookX12.status).toBe(2);
    expect(notebookX12.stderr).toContain('contains an X12 interchange whose sender is not SYNTHSENDER');
    expect(notebook('docs/explore.ipynb', synthetic).status).toBe(0);
    // The X12 rule finds every interchange header wherever it starts: after a newline, a byte-order mark or spaces, in
    // the middle of an Edit's new string, in any edit of a MultiEdit, with any element separator.
    const foreign = synthetic.replace('SYNTHSENDER    ', 'OTHERSENDER    ');
    for (const text of [`\n${foreign}`, `\uFEFF${foreign}`, `   ${foreign}`, `const sample = \`${foreign}\`;\n`, foreign.replaceAll('*', '|')]) {
      expect(write('anywhere/notes.ts', text).status, JSON.stringify(text.slice(0, 12))).toBe(2);
      expect(run(script, { tool_name: 'Edit', cwd: repositoryRoot, tool_input: { file_path: 'docs/x.md', old_string: 'a', new_string: text } }).status).toBe(2);
    }
    expect(run(script, { tool_name: 'MultiEdit', cwd: repositoryRoot, tool_input: { file_path: 'docs/x.ts', edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'c', new_string: `x = '${foreign}'` }] } }).status).toBe(2);
    expect(write('anywhere/notes.ts', `const sample = \`${synthetic}\`;\n`).status).toBe(0);
    // Prose about the segment is not an interchange.
    expect(write('docs/x12.md', 'ISA*00 opens an interchange; ISA06 is its sender.\n').status).toBe(0);
    // A relative path is the session's: it resolves from the hook input's cwd, not from the repository's top.
    const fromFixtures = run(script, { tool_name: 'Write', cwd: path.join(repositoryRoot, 'fixtures'), tool_input: { file_path: 'synthetic/zz/a.csv', content: 'Post Date,Paid\n06/11/2026,30.00\n' } });
    expect(fromFixtures.status).toBe(2);
    expect(fromFixtures.stderr).toContain('fixtures/synthetic/zz/a.csv');
    expect(run(script, { tool_name: 'Write', cwd: path.join(repositoryRoot, 'apps'), tool_input: { file_path: 'web/scratch.csv', content: 'Post Date,Paid\n06/11/2026,30.00\n' } }).status).toBe(0);
    // A path with a control character is refused: a line break ends the path the hook reads before the one written.
    expect(run(script, { tool_name: 'Write', cwd: repositoryRoot, tool_input: { file_path: `${repositoryRoot}/x\n/../fixtures/synthetic/a.csv`, content: 'a\n' } }).status).toBe(2);
    // A gitfile that makes a directory of fixtures/ its own repository leaves its files fixtures.
    const nested = gitRepository('fixture-gitfile', { 'fixtures/synthetic/LED-99/keep.md': 'x\n' });
    writeFileSync(path.join(nested, 'fixtures/.git'), `gitdir: ${path.join(nested, '.git')}\n`);
    expect(run(script, { tool_name: 'Write', cwd: nested, tool_input: { file_path: path.join(nested, 'fixtures/synthetic/LED-99/a.csv'), content: 'Post Date,Paid\n06/11/2026,30.00\n' } }).status).toBe(2);
  },

  'protect-content.sh': () => {
    const script = hook('protect-content.sh');
    const root = gitRepository('content', { 'content/releases/2026-01/manifest.json': '{}\n', 'packages/db/migrations/0001.sql': 'select 1;\n' });
    const call = (toolName: string, toolInput: Record<string, unknown>, cwd = root) => run(script, { tool_name: toolName, cwd, tool_input: toolInput });
    const edit = (file: string) => call('Edit', { file_path: file, old_string: '{}', new_string: '{ }' });
    const release = edit('content/releases/2026-01/manifest.json');
    expect(release.status).toBe(2);
    expect(release.stderr).toContain('is a published release');
    expect(edit(path.join(root, 'content/releases/2026-01/manifest.json')).status).toBe(2);
    const migration = edit('packages/db/migrations/0001.sql');
    expect(migration.status).toBe(2);
    expect(migration.stderr).toContain('Use /new-migration');
    expect(edit('content/drafts/a.json').status).toBe(0);
    expect(call('Edit', {}).status).toBe(0);
    // Every edit tool: Write, Edit and MultiEdit name the file file_path; a NotebookEdit names it notebook_path.
    const each = (file: string): Record<string, Record<string, unknown>> => ({
      Write: { file_path: file, content: '{}\n' },
      Edit: { file_path: file, old_string: '{}', new_string: '{ }' },
      MultiEdit: { file_path: file, edits: [{ old_string: '{}', new_string: '{ }' }] },
      NotebookEdit: { notebook_path: file.replace(/\.json$/, '.ipynb'), new_source: 'x', edit_mode: 'replace' },
    });
    for (const [toolName, toolInput] of Object.entries(each('content/releases/2026-01/manifest.json'))) expect(call(toolName, toolInput).status, toolName).toBe(2);
    for (const [toolName, toolInput] of Object.entries(each('packages/db/migrations/0002.json'))) expect(call(toolName, toolInput).status, toolName).toBe(2);
    for (const [toolName, toolInput] of Object.entries(each('content/drafts/a.json'))) expect(call(toolName, toolInput).status, toolName).toBe(0);
    // Another spelling of a release is the release: dot segments, a case, a link to the directory, a link to the file.
    expect(edit('packages/x/../../content/releases/2026-01/manifest.json').status).toBe(2);
    expect(call('Write', { file_path: './Content/./Releases/2026-02/new.json', content: '{}' }).status).toBe(2);
    const linked = path.join(scratch('content-link'), 'released');
    symlinkSync(path.join(root, 'content/releases'), linked);
    expect(call('Write', { file_path: path.join(linked, '2026-01/manifest.json'), content: '{}' }).status).toBe(2);
    const fileLink = path.join(scratch('content-file-link'), 'manifest.json');
    symlinkSync(path.join(root, 'content/releases/2026-01/manifest.json'), fileLink);
    expect(call('Write', { file_path: fileLink, content: '{}' }).status).toBe(2);
    expect(call('Write', { file_path: path.join(root, 'packages/db/x/../migrations/0003.sql'), content: 'select 1;' }).status).toBe(2);
    // A worktree is its own repository: a file in another repository is a release there.
    const other = gitRepository('content-other', { 'content/releases/2026-03/manifest.json': '{}\n' });
    expect(call('Write', { file_path: path.join(other, 'content/releases/2026-03/manifest.json'), content: '{}' }).status).toBe(2);
    // The new-migration skill's marker, made in the scratch repository only, lets a migration through.
    mkdirSync(path.join(root, '.claude'), { recursive: true });
    writeFileSync(path.join(root, '.claude/.allow-protected-edit'), '');
    expect(edit('packages/db/migrations/0001.sql').status).toBe(0);
    expect(edit('content/releases/2026-01/manifest.json').status).toBe(2);
    rmSync(path.join(root, '.claude/.allow-protected-edit'));
    // A relative path is the session's: it resolves from the hook input's cwd (a Bash cd moves it), not the repository's top.
    expect(call('Write', { file_path: 'migrations/0009.sql', content: 'select 1;' }, path.join(root, 'packages/db')).status).toBe(2);
    expect(call('Edit', { file_path: 'releases/2026-01/manifest.json', old_string: '{}', new_string: '{ }' }, path.join(root, 'content')).status).toBe(2);
    expect(call('Write', { file_path: '../db/migrations/0009.sql', content: 'select 1;' }, path.join(root, 'packages/x')).status).toBe(2);
    expect(call('Write', { file_path: 'drafts/a.json', content: '{}' }, path.join(root, 'content')).status).toBe(0);
    // A path with a control character is refused: a line break ends the path the hook reads before the one written.
    const broken = call('Write', { file_path: `${root}/x\n/../content/releases/2026-01/manifest.json`, content: '{}' });
    expect(broken.status).toBe(2);
    expect(broken.stderr).toContain('control character');
    expect(call('NotebookEdit', { notebook_path: `${root}/x\t.ipynb`, new_source: 'x' }).status).toBe(2);
    // No edit tool writes git's own files: a gitfile would make a directory its own repository.
    const gitfile = call('Write', { file_path: 'content/.git', content: `gitdir: ${root}/.git\n` });
    expect(gitfile.status).toBe(2);
    expect(gitfile.stderr).toContain("git's own file");
    expect(call('Write', { file_path: '.git/hooks/pre-commit', content: 'exit 0\n' }).status).toBe(2);
    expect(call('Write', { file_path: '.gitignore', content: 'node_modules\n' }).status).toBe(0);
    // A gitfile already there (a shell made it) leaves a release a release and a migration a migration.
    writeFileSync(path.join(root, 'content/.git'), `gitdir: ${path.join(root, '.git')}\n`);
    writeFileSync(path.join(root, 'packages/db/.git'), `gitdir: ${path.join(root, '.git')}\n`);
    mkdirSync(path.join(root, 'packages/db/.claude'), { recursive: true });
    writeFileSync(path.join(root, 'packages/db/.claude/.allow-protected-edit'), '');
    expect(call('Write', { file_path: path.join(root, 'content/releases/2026-01/manifest.json'), content: '{}' }).status).toBe(2);
    expect(call('Write', { file_path: path.join(root, 'packages/db/migrations/0009.sql'), content: 'select 1;' }).status).toBe(2);
    rmSync(path.join(root, 'content/.git'));
    rmSync(path.join(root, 'packages/db/.git'));
    // The hooks and their settings: no edit switches the guards off, in this repository or the user's own settings.
    for (const file of ['.claude/settings.json', '.claude/settings.local.json', '.claude/hooks/protect-content.sh', '.claude/hooks/new.sh', '.claude/.allow-protected-edit', '.Claude/Settings.JSON']) {
      const configured = call('Write', { file_path: file, content: '{"disableAllHooks": true}\n' });
      expect(configured.status, file).toBe(2);
      expect(configured.stderr, file).toContain('configures the hooks that guard every edit');
    }
    expect(call('Write', { file_path: path.join(scratch('home'), '.claude/settings.json'), content: '{"disableAllHooks": true}\n' }).status).toBe(2);
    expect(call('Write', { file_path: '.claude/skills/x/SKILL.md', content: 'x\n' }).status).toBe(0);
    // It fails closed: without jq, on input that is not JSON.
    expect(run(script, {}, { PATH: pathWith([]) }).status).toBe(2);
    const garbled = run(script, `{"tool_name":"Edit","tool_input":{"file_path":"content/releases/2026-01/manifest.json"`);
    expect(garbled.status).toBe(2);
    expect(garbled.stderr).toContain('the hook input is not JSON');
  },

  'typecheck.sh': () => {
    const script = hook('typecheck.sh');
    const call = (toolName: string, cwd: string, file: string) => run(script, { tool_name: toolName, cwd, tool_input: { file_path: path.join(cwd, file) } });
    const edit = (cwd: string, file: string) => call('Edit', cwd, file);
    // The fast paths: a file that is not TypeScript, a notebook, and a call with no file.
    expect(edit(repositoryRoot, 'README.md').status).toBe(0);
    expect(run(script, { tool_name: 'NotebookEdit', cwd: repositoryRoot, tool_input: { notebook_path: path.join(repositoryRoot, 'docs/x.ipynb'), new_source: 'x' } }).status).toBe(0);
    expect(run(script, { tool_name: 'Edit', tool_input: {} }).status).toBe(0);
    // A workspace whose package's script is another command runs it through pnpm: exit 2 with the errors, or exit 0.
    const workspace = gitRepository('workspace', {
      'pnpm-workspace.yaml': 'packages:\n  - "packages/*"\n',
      'package.json': JSON.stringify({ name: 'scratch', private: true }),
      'packages/bad/package.json': JSON.stringify({ name: 'bad', private: true, scripts: { typecheck: "node -e \"console.error('error TS2322: not assignable'); process.exit(1)\"" } }),
      'packages/good/package.json': JSON.stringify({ name: 'good', private: true, scripts: { typecheck: 'node -e "process.exit(0)"' } }),
      'packages/none/package.json': JSON.stringify({ name: 'none', private: true }),
    });
    const bad = edit(workspace, 'packages/bad/src/a.ts');
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain('typecheck: packages/bad does not type-check after this edit:');
    expect(bad.stderr).toContain('error TS2322: not assignable');
    expect(call('MultiEdit', workspace, 'packages/bad/src/a.ts').status).toBe(2);
    expect(call('Write', workspace, 'packages/good/src/a.tsx').status).toBe(0);
    expect(edit(workspace, 'packages/none/src/a.ts').status).toBe(0);
    // A package whose script is "tsc --noEmit" runs that tsc itself, incrementally: the same errors, kept until fixed.
    const compilerOptions = { strict: true, noEmit: true, target: 'ES2022', lib: ['ES2022'], module: 'ESNext', moduleResolution: 'Bundler', types: [] };
    const typed = gitRepository('typed', {
      'package.json': JSON.stringify({ name: 'typed', private: true, scripts: { typecheck: 'tsc --noEmit -p tsconfig.json && pnpm -r typecheck' } }),
      'tsconfig.json': JSON.stringify({ compilerOptions, include: ['*.ts'] }),
      'root.ts': 'export const root: number = 1;\n',
      'packages/real/package.json': JSON.stringify({ name: 'real', private: true, scripts: { typecheck: 'tsc --noEmit' } }),
      'packages/real/tsconfig.json': JSON.stringify({ compilerOptions, include: ['src'] }),
      'packages/real/src/a.ts': 'export const n: number = 1;\n',
      'packages/real/node_modules/dep/index.ts': "export const broken: number = 'x';\n",
    });
    mkdirSync(path.join(typed, 'node_modules/.bin'), { recursive: true });
    symlinkSync(path.join(repositoryRoot, 'node_modules/typescript/bin/tsc'), path.join(typed, 'node_modules/.bin/tsc'));
    const source = path.join(typed, 'packages/real/src/a.ts');
    expect(edit(typed, 'packages/real/src/a.ts').status).toBe(0);
    expect(statSync(path.join(typed, 'node_modules/.cache/tp-typecheck/packages_real.tsbuildinfo')).isFile()).toBe(true);
    writeFileSync(source, "export const n: number = 'one';\n");
    const wrong = call('Write', typed, 'packages/real/src/a.ts');
    expect(wrong.status).toBe(2);
    expect(wrong.stderr).toContain('typecheck: packages/real does not type-check after this edit:');
    expect(wrong.stderr).toContain("src/a.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.");
    expect(call('MultiEdit', typed, 'packages/real/src/a.ts').status).toBe(2);
    // A relative path resolves from the hook input's cwd (a Bash cd moves it), so an edit made from the package's own
    // directory checks that package.
    const fromPackage = run(script, { tool_name: 'Edit', cwd: path.join(typed, 'packages/real'), tool_input: { file_path: 'src/a.ts' } });
    expect(fromPackage.status).toBe(2);
    expect(fromPackage.stderr).toContain('typecheck: packages/real does not type-check after this edit:');
    writeFileSync(source, 'export const n: number = 1;\n');
    expect(edit(typed, 'packages/real/src/a.ts').status).toBe(0);
    // The root's own files are the root project's; a file in installed dependencies or outside a repository is no package's.
    writeFileSync(path.join(typed, 'root.ts'), "export const root: number = 'one';\n");
    expect(edit(typed, 'root.ts').status).toBe(2);
    writeFileSync(path.join(typed, 'root.ts'), 'export const root: number = 1;\n');
    expect(edit(typed, 'root.ts').status).toBe(0);
    expect(edit(typed, 'packages/real/node_modules/dep/index.ts').status).toBe(0);
    const loose = scratch('no-repository');
    writeFileSync(path.join(loose, 'a.ts'), "export const n: number = 'one';\n");
    expect(edit(loose, 'a.ts').status).toBe(0);
    // It fails closed: without jq, on input that is not JSON, without node, and without tsc.
    expect(run(script, {}, { PATH: pathWith([]) }).status).toBe(2);
    expect(run(script, '{"tool_name":"Edit","tool_input":{"file_path":"a.ts"').status).toBe(2);
    const noNode = run(script, { tool_name: 'Edit', cwd: typed, tool_input: { file_path: source } }, { PATH: pathWith([...COREUTILS, 'mkdir', 'tail']) });
    expect(noNode.status).toBe(2);
    expect(noNode.stderr).toContain('node is required');
    rmSync(path.join(typed, 'node_modules/.bin/tsc'));
    const noTsc = edit(typed, 'packages/real/src/a.ts');
    expect(noTsc.status).toBe(2);
    expect(noTsc.stderr).toContain('tsc is not installed');
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
    // Anything else in the document passes.
    expect(call('Edit', { file_path: model, old_string: 'Generated.', new_string: 'Regenerated.' }).status).toBe(0);
    expect(call('Write', { file_path: model, content: document.replace('Generated.', 'Regenerated.') }).status).toBe(0);
    expect(call('Edit', { file_path: model, old_string: '________', new_string: 'X', replace_all: true }).status).toBe(2);
    // An edit the hook cannot rebuild exactly is refused: Claude Code may still apply it, reading curly quotes as
    // straight ones and CRLF as LF, so the hook would not have seen the approval change.
    const unseen = call('Edit', { file_path: model, old_string: 'not in the file', new_string: 'Approved by: X' });
    expect(unseen.status).toBe(2);
    expect(unseen.stderr).toContain('cannot rebuild what this call leaves');
    expect(call('Edit', { file_path: model, old_string: '________', new_string: 'X' }).status).toBe(2);
    const curly = gitRepository('approval-curly', {
      [model]: 'Approved over the SHA-256 of this text’s.\n\nApproved by: ________  Date: ________\n',
      [list]: '{\n  "note": "the founder’s approval, in the same pull request as a document the founder signs.",\n  "approvers": []\n}\n',
    });
    const curlyCall = (toolName: string, toolInput: Record<string, unknown>) => run(script, { tool_name: toolName, cwd: curly, tool_input: toolInput });
    expect(curlyCall('Edit', { file_path: model, old_string: "this text's.\n\nApproved by: ________  Date: ________", new_string: 'Approved by: Review Test  Date: 2026-10-17' }).status).toBe(2);
    expect(curlyCall('Edit', { file_path: list, old_string: 'founder\'s approval, in the same pull request as a document the founder signs.",\n  "approvers": []', new_string: 'x", "approvers": ["Review Test"]' }).status).toBe(2);
    expect(curlyCall('MultiEdit', { file_path: model, edits: [{ old_string: "text's", new_string: 'text' }] }).status).toBe(2);
    const crlf = gitRepository('approval-crlf', { [model]: 'Generated.\r\n\r\nApproved by: ________  Date: ________\r\n' });
    expect(run(script, { tool_name: 'Edit', cwd: crlf, tool_input: { file_path: model, old_string: 'Generated.\n\nApproved by: ________', new_string: 'Approved by: X' } }).status).toBe(2);
    // A link to the document, as a directory or as the file itself, is the document.
    symlinkSync(path.join(root, 'docs/product'), path.join(root, 'docs/plink'));
    expect(call('Edit', { file_path: 'docs/plink/domain-model.md', old_string: 'Date: ________', new_string: 'Date: 2026-10-17' }).status).toBe(2);
    symlinkSync(path.join(root, model), path.join(root, 'docs/model-link.md'));
    expect(call('Write', { file_path: 'docs/model-link.md', content: 'Regenerated.\n' }).status).toBe(2);
    expect(call('Edit', { file_path: 'docs/plink/domain-model.md', old_string: 'Generated.', new_string: 'Regenerated.' }).status).toBe(0);
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
    // A relative path resolves from the hook input's cwd (a Bash cd moves it), not from the repository's top.
    const fromDocs = run(script, { tool_name: 'Write', cwd: path.join(root, 'docs'), tool_input: { file_path: 'product/domain-model.md', content: 'Approved by: Mallory  Date: 2026-10-18  Document SHA-256: `00`\n' } });
    expect(fromDocs.status).toBe(2);
    expect(fromDocs.stderr).toContain('"Approved by:" line');
    expect(run(script, { tool_name: 'Edit', cwd: path.join(root, 'packages/db'), tool_input: { file_path: 'domain-model/approvers.json', old_string: '[]', new_string: '["M"]' } }).status).toBe(2);
    expect(run(script, { tool_name: 'Write', cwd: path.join(root, 'docs/product'), tool_input: { file_path: 'other.md', content: 'Approved by: X\n' } }).status).toBe(0);
    // A path with a control character is refused: a line break ends the path the hook reads before the one written.
    expect(call('Write', { file_path: `${root}/x\n/../${model}`, content: 'Approved by: Mallory\n' }).status).toBe(2);
    expect(call('Write', { file_path: `${root}/x\n/../${list}`, content: '{}' }).status).toBe(2);
    // Other files, other tools and a call with no file pass; without jq, or with input it cannot read, it fails closed.
    expect(call('Write', { file_path: 'docs/product/other.md', content: 'Approved by: X\n' }).status).toBe(0);
    expect(call('Read', { file_path: model }).status).toBe(0);
    expect(call('Edit', {}).status).toBe(0);
    expect(run(script, {}, { PATH: pathWith([]) }).status).toBe(2);
    expect(run(script, `{"tool_name":"Edit","cwd":"${root}","tool_input":{"file_path":"${model}","edits":7`).status).toBe(2);
    // A NotebookEdit of either file is a call it cannot rebuild (docs/adr/0063); of any other file, it passes.
    const notebookCall = call('NotebookEdit', { notebook_path: model, new_source: 'Approved by: X', edit_mode: 'replace' });
    expect(notebookCall.status).toBe(2);
    expect(notebookCall.stderr).toContain('cannot rebuild what a NotebookEdit leaves');
    expect(call('NotebookEdit', { notebook_path: path.join(root, list), new_source: '{}' }).status).toBe(2);
    expect(call('NotebookEdit', { notebook_path: 'docs/explore.ipynb', new_source: 'Approved by: X' }).status).toBe(0);
    expect(readFileSync(path.join(root, model), 'utf8')).toBe(document);
  },

  'protect-github.sh': () => {
    const script = hook('protect-github.sh');
    const call = (toolName: string, toolInput: unknown) => run(script, { tool_name: toolName, cwd: repositoryRoot, tool_input: toolInput });
    // The build never submits a review, in any of the GitHub connector's review tools, whichever event.
    for (const toolName of ['mcp__github__pull_request_review_write', 'mcp__claude_ai_GitHub__pull_request_review_write', 'mcp__github__create_and_submit_pull_request_review', 'mcp__github__create_pending_pull_request_review', 'mcp__github__submit_pending_pull_request_review']) {
      for (const event of ['APPROVE', 'REQUEST_CHANGES', 'COMMENT']) {
        const review = call(toolName, { method: 'create', owner: 'o', repo: 'r', pullNumber: 1, event });
        expect(review.status, `${toolName} ${event}`).toBe(2);
        expect(review.stderr).toContain('the build never submits a review');
      }
    }
    // A file written through the GitHub API, on any path: no edit hook, no pre-push hook and no gitleaks would read it.
    for (const file of ['docs/notes.md', 'README.md', 'apps/web/a.ts', 'docs/product/domain-model.md', '.github/workflows/x.yml', 'fixtures/synthetic/a.csv']) {
      const written = call('mcp__github__create_or_update_file', { owner: 'o', repo: 'r', branch: 'b', path: file, content: 'x', message: 'm' });
      expect(written.status, file).toBe(2);
      expect(written.stderr, file).toContain('through the GitHub API, where neither the edit hooks nor the pre-push hook');
      expect(call('mcp__github__delete_file', { owner: 'o', repo: 'r', branch: 'b', path: file, message: 'm' }).status, file).toBe(2);
      expect(call('mcp__claude_ai_GitHub__push_files', { owner: 'o', repo: 'r', branch: 'b', files: [{ path: file, content: 'x' }], message: 'm' }).status, file).toBe(2);
    }
    expect(call('mcp__github__push_files', { files: 7 }).status).toBe(2);
    // Other tools pass: merging is bounded by the ruleset, whoever merges (docs/adr/0063).
    expect(call('mcp__github__merge_pull_request', { pullNumber: 1 }).status).toBe(0);
    expect(call('mcp__github__add_issue_comment', { body: 'x' }).status).toBe(0);
    // It fails closed: without jq, on input that is not JSON.
    expect(run(script, {}, { PATH: pathWith([]) }).status).toBe(2);
    expect(run(script, '{"tool_name":"mcp__github__push_files"').status).toBe(2);
  },

  'session-start.sh': () => {
    const script = hook('session-start.sh');
    /** A clone whose tools are this checkout's, as CLAUDE_PROJECT_DIR names it, and an empty cache for gitleaks. */
    const project = () => {
      const root = gitRepository('session');
      symlinkSync(path.join(repositoryRoot, 'tools'), path.join(root, 'tools'));
      return { root, cache: scratch('session-cache') };
    };
    const start = (root: string, env: NodeJS.ProcessEnv) => run(script, { hook_event_name: 'SessionStart', source: 'startup' }, { ...process.env, GITLEAKS: '', ...env, CLAUDE_PROJECT_DIR: root });
    const launcher = readFileSync(path.join(repositoryRoot, 'tools/pre-push/launcher.sh'), 'utf8');
    // It installs the launcher in the clone's own hooks directory, and names the gitleaks a push will use.
    const ready = project();
    const stub = path.join(scratch('session-gitleaks'), 'gitleaks');
    writeFileSync(stub, '#!/bin/sh\necho 8.24.3\n');
    chmodSync(stub, 0o755);
    const named = start(ready.root, { GITLEAKS: stub, XDG_CACHE_HOME: ready.cache });
    expect(named.status).toBe(0);
    expect(named.stdout).toContain(`Pre-push hook: the hook is installed at ${path.join(ready.root, '.git/hooks/pre-push')}`);
    expect(named.stdout).toContain(`gitleaks: ${stub}.`);
    expect(named.stdout).toContain('never push with --no-verify');
    expect(readFileSync(path.join(ready.root, '.git/hooks/pre-push'), 'utf8')).toBe(launcher);
    expect(statSync(path.join(ready.root, '.git/hooks/pre-push')).mode & 0o111).not.toBe(0);
    // The pinned gitleaks, once installed in the cache, is found there: nothing is downloaded again.
    const pinned = path.join(ready.cache, 'paidwhole/gitleaks', /^version (\S+)$/m.exec(readFileSync(path.join(repositoryRoot, 'tools/gitleaks/release.txt'), 'utf8'))?.[1] ?? '?', 'gitleaks');
    mkdirSync(path.dirname(pinned), { recursive: true });
    writeFileSync(pinned, `#!/bin/sh\necho ${path.basename(path.dirname(pinned))}\n`);
    chmodSync(pinned, 0o755);
    const cached = start(ready.root, { XDG_CACHE_HOME: ready.cache, GITLEAKS_DOWNLOAD_BASE: 'file:///nonexistent' });
    expect(cached.stdout).toContain(`gitleaks: ${pinned}.`);
    // What is missing is said in the session's context, and the session still starts.
    const missing = project();
    const notInstalled = start(missing.root, { XDG_CACHE_HOME: missing.cache, GITLEAKS_DOWNLOAD_BASE: 'file:///nonexistent' });
    expect(notInstalled.status).toBe(0);
    expect(notInstalled.stdout).toContain('WARNING from .claude/hooks/session-start.sh');
    expect(notInstalled.stdout).toContain('The pinned gitleaks could not be installed, so the pre-push hook refuses every push that sends a commit');
    expect(start(missing.root, { GITLEAKS: '/nonexistent/gitleaks' }).stdout).toContain('GITLEAKS is /nonexistent/gitleaks, which is not an executable file.');
    spawnSync('git', ['-C', missing.root, 'config', 'core.hooksPath', '/elsewhere']);
    const elsewhere = start(missing.root, { GITLEAKS: stub });
    expect(elsewhere.status).toBe(0);
    expect(elsewhere.stdout).toContain('The pre-push hook is not installed: pre-push: core.hooksPath is /elsewhere in your local git configuration');
    // The hook's first instruction, core.hooksPath = .githooks, is taken out so the launcher runs.
    spawnSync('git', ['-C', missing.root, 'config', 'core.hooksPath', '.githooks']);
    expect(start(missing.root, { GITLEAKS: stub }).stdout).toContain('Pre-push hook: the hook is installed');
    expect(spawnSync('git', ['-C', missing.root, 'config', '--get', 'core.hooksPath'], { encoding: 'utf8' }).stdout).toBe('');
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

/** The tools Claude Code edits files with (docs/adr/0063). */
const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'] as const;

interface HookCommand {
  readonly type: string;
  readonly command: string;
  readonly timeout?: number;
}
interface Settings {
  readonly hooks: Readonly<Record<string, readonly { readonly matcher?: string; readonly hooks: readonly HookCommand[] }[]>>;
}

describe('.claude/settings.json', () => {
  const raw = JSON.parse(readFileSync(path.join(repositoryRoot, '.claude/settings.json'), 'utf8')) as Settings & Record<string, unknown>;
  const PREFIX = '"$CLAUDE_PROJECT_DIR"/.claude/hooks/';
  const script = (command: string): string => {
    expect(command.startsWith(PREFIX), command).toBe(true);
    return command.slice(PREFIX.length);
  };
  /** The hooks an event runs for a tool, by script name, the matcher read as Claude Code may read it: whole, or anywhere in the name. */
  const wired = (event: string, toolName: string, anchored: boolean): string[] =>
    (raw.hooks[event] ?? []).filter((m) => new RegExp(anchored ? `^(?:${m.matcher ?? ''})$` : (m.matcher ?? '')).test(toolName)).flatMap((m) => m.hooks.map((h) => script(h.command)));

  it('holds the hooks only: no permission rules and no sandbox until the final pass', () => {
    expect(Object.keys(raw).sort()).toEqual(['$schema', 'hooks']);
    expect(Object.keys(raw.hooks).sort()).toEqual(['PostToolUse', 'PreToolUse', 'SessionStart']);
  });

  it('installs the pre-push checks when any session starts: one hook, every source, with time for a download', () => {
    const [entry, ...rest] = raw.hooks.SessionStart ?? [];
    expect(rest).toEqual([]);
    expect(entry?.matcher).toBeUndefined();
    expect(entry?.hooks.map((h) => script(h.command))).toEqual(['session-start.sh']);
    expect(entry?.hooks[0]?.timeout).toBe(120);
  });

  it('wires every hook script, each by the project directory, as a command', () => {
    const all = Object.values(raw.hooks).flatMap((matchers) => matchers.flatMap((m) => m.hooks));
    expect(all.every((h) => h.type === 'command')).toBe(true);
    expect([...new Set(all.map((h) => script(h.command)))].sort()).toEqual(readdirSync(HOOKS).filter((name) => name.endsWith('.sh')).sort());
    // The typecheck may take a cold tsc of apps/web; the guards are fast.
    expect(raw.hooks.PostToolUse?.[0]?.hooks[0]?.timeout).toBe(300);
  });

  it('runs the three guards before every edit tool, and the typecheck after each that writes text', () => {
    for (const anchored of [true, false]) {
      for (const toolName of EDIT_TOOLS) {
        expect(wired('PreToolUse', toolName, anchored), toolName).toEqual(['protect-content.sh', 'fixture-guard.sh', 'protect-approval.sh']);
      }
      for (const toolName of ['Edit', 'Write', 'MultiEdit']) expect(wired('PostToolUse', toolName, anchored), toolName).toEqual(['typecheck.sh']);
      for (const toolName of ['Read', 'Bash', 'Glob', 'Grep']) expect(wired('PreToolUse', toolName, anchored), toolName).toEqual([]);
    }
    // A notebook is not TypeScript: whether the matcher is read whole (no typecheck) or anywhere ("Edit" in "NotebookEdit"), nothing runs.
    expect(wired('PostToolUse', 'NotebookEdit', true)).toEqual([]);
  });

  it('runs the GitHub guard before every connector tool that reviews or writes files, and no other', () => {
    for (const anchored of [true, false]) {
      for (const server of ['github', 'claude_ai_GitHub']) {
        for (const name of ['pull_request_review_write', 'create_pending_pull_request_review', 'submit_pending_pull_request_review', 'create_and_submit_pull_request_review', 'delete_pending_pull_request_review', 'create_or_update_file', 'push_files', 'delete_file']) {
          expect(wired('PreToolUse', `mcp__${server}__${name}`, anchored), name).toEqual(['protect-github.sh']);
        }
        for (const name of ['merge_pull_request', 'get_file_contents', 'create_pull_request', 'add_issue_comment']) expect(wired('PreToolUse', `mcp__${server}__${name}`, anchored), name).toEqual([]);
      }
      for (const toolName of [...EDIT_TOOLS, 'Bash', 'Read']) expect(wired('PreToolUse', toolName, anchored)).not.toContain('protect-github.sh');
    }
  });

  it('allows and refuses a call of each edit tool, its hooks run as settings.json runs them', () => {
    const document = 'Generated.\n\nApproved by: ________  Date: ________  Document SHA-256: `00`\n';
    const root = gitRepository('wired', {
      'content/releases/2026-01/manifest.json': '{}\n',
      'docs/product/domain-model.md': document,
      'docs/notes.md': 'Notes.\n',
    });
    /** Every PreToolUse hook the call's tool matches, each through bash as Claude Code runs the command; the status of each. */
    const dispatch = (toolName: string, toolInput: Record<string, unknown>): Record<string, number | null> =>
      Object.fromEntries(
        (raw.hooks.PreToolUse ?? [])
          .filter((m) => new RegExp(`^(?:${m.matcher ?? ''})$`).test(toolName))
          .flatMap((m) => m.hooks)
          .map((h) => {
            const result = spawnSync('/bin/bash', ['-c', h.command], {
              input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: toolName, cwd: root, tool_input: toolInput }),
              encoding: 'utf8',
              env: { ...process.env, CLAUDE_PROJECT_DIR: repositoryRoot },
              timeout: 120_000,
            });
            return [script(h.command), result.status];
          }),
      );
    const refusedBy = (name: string) => ({ 'protect-content.sh': 0, 'fixture-guard.sh': 0, 'protect-approval.sh': 0, [name]: 2 });
    const allowed = { 'protect-content.sh': 0, 'fixture-guard.sh': 0, 'protect-approval.sh': 0 };
    const model = path.join(root, 'docs/product/domain-model.md');
    // Write
    expect(dispatch('Write', { file_path: path.join(root, 'content/releases/2026-01/manifest.json'), content: '{"changed":true}\n' })).toEqual(refusedBy('protect-content.sh'));
    expect(dispatch('Write', { file_path: path.join(root, 'docs/notes.md'), content: 'More notes.\n' })).toEqual(allowed);
    // Edit
    expect(dispatch('Edit', { file_path: model, old_string: 'Approved by: ________', new_string: 'Approved by: A. Founder' })).toEqual(refusedBy('protect-approval.sh'));
    expect(dispatch('Edit', { file_path: model, old_string: 'Generated.', new_string: 'Regenerated.' })).toEqual(allowed);
    // MultiEdit
    expect(dispatch('MultiEdit', { file_path: path.join(root, 'fixtures/synthetic/LED-99/posting-export.csv'), edits: [{ old_string: '', new_string: 'Post Date,Paid Amount\n06/11/2026,30.00\n' }] })).toEqual(
      refusedBy('fixture-guard.sh'),
    );
    expect(dispatch('MultiEdit', { file_path: path.join(root, 'docs/notes.md'), edits: [{ old_string: 'Notes.', new_string: 'Notes, edited.' }] })).toEqual(allowed);
    // NotebookEdit
    expect(dispatch('NotebookEdit', { notebook_path: path.join(root, 'content/releases/2026-01/explore.ipynb'), new_source: 'x' })).toEqual(refusedBy('protect-content.sh'));
    expect(dispatch('NotebookEdit', { notebook_path: path.join(root, 'fixtures/synthetic/explore.ipynb'), new_source: 'x' })).toEqual(refusedBy('fixture-guard.sh'));
    expect(dispatch('NotebookEdit', { notebook_path: model, new_source: 'x' })).toEqual(refusedBy('protect-approval.sh'));
    expect(dispatch('NotebookEdit', { notebook_path: path.join(root, 'docs/explore.ipynb'), new_source: 'print(1)' })).toEqual(allowed);
    expect(readFileSync(model, 'utf8')).toBe(document);
  }, 120_000);
});
