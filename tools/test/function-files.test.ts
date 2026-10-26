import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';

/**
 * The generated database function files (packages/db/functions, docs/adr/0068) exist so a schema pull request shows,
 * in "Files changed", exactly which lines of which function it changes. GitHub collapses a file it takes for generated,
 * by the linguist-generated attribute or, without one, by Linguist's own heuristics, and an editor that trims trailing
 * spaces or adds a final newline would rewrite a body PostgreSQL printed verbatim. These tests hold .gitattributes and
 * .editorconfig to what keeps the diffs open and the bytes the generator's.
 */
const FILES = ['packages/db/functions/allowed_practice_ids.sql', 'packages/db/functions/submit_prospect_request.sql'];

/** Each attribute git resolves for a path, from every .gitattributes that applies, as git itself reads them. */
function attributes(file: string): Map<string, string> {
  const result = spawnSync('git', ['-C', repositoryRoot, 'check-attr', '--all', '--', file], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return new Map(
    result.stdout
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => {
        const [, name = '', value = ''] = line.split(': ');
        return [name, value] as const;
      }),
  );
}

/** The settings of one exact section of .editorconfig, by its header. */
function editorconfigSection(header: string): Map<string, string> {
  const lines = readFileSync(path.join(repositoryRoot, '.editorconfig'), 'utf8').split('\n');
  const start = lines.indexOf(`[${header}]`);
  expect(start, header).toBeGreaterThanOrEqual(0);
  const settings = new Map<string, string>();
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('[')) break;
    const match = /^([a-z_]+)\s*=\s*(\S+)$/.exec(line.trim());
    if (match) settings.set(match[1] ?? '', match[2] ?? '');
  }
  return settings;
}

describe('the generated database function files (docs/adr/0068)', () => {
  it('are marked not generated, so GitHub shows their diffs open', () => {
    for (const file of FILES) expect(attributes(file).get('linguist-generated'), file).toBe('false');
  });

  it('carry no other attribute that would hide, collapse or rewrite them', () => {
    // linguist-vendored and linguist-documentation hide a file from the language statistics and can collapse its
    // diff; -diff, binary or a text/eol rule would hide the diff or change the bytes the drift check compares.
    for (const file of FILES) expect([...attributes(file).keys()], file).toEqual(['linguist-generated']);
  });

  it('mark nothing else: the README and every other path are left to GitHub', () => {
    expect(attributes('packages/db/functions/README.md').size).toBe(0);
    expect(attributes('packages/db/migrations/20261015140000_tenancy.sql').size).toBe(0);
  });

  it('are left as the generator wrote them by every editor that reads .editorconfig', () => {
    const settings = editorconfigSection('packages/db/functions/**');
    expect(settings.get('trim_trailing_whitespace')).toBe('unset');
    expect(settings.get('insert_final_newline')).toBe('unset');
  });
});
