import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';
import {
  CLOSE_MARKER,
  OLD_NAMES_HISTORY,
  OPEN_MARKER,
  REQUIRED_CHECKS,
  REQUIRED_CHECK_LISTINGS,
  REQUIRED_CHECK_NAMES,
  STALE_NAMES,
  oldListings,
  readListings,
  unmarkedListings,
} from '../required-checks';

/**
 * One set of required checks in every document (docs/adr/0066, Part 1; the review's R8): each listing of them sits
 * between the markers and names exactly REQUIRED_CHECKS, in order, and every document that lists them keeps at least
 * one marked listing, so none can drop out of this check. A paragraph naming three or more of them outside the markers
 * is a listing left unmarked, in any Markdown file the repository tracks. The checks they replaced are named only where
 * the history keeps them (OLD_NAMES_HISTORY), in any tracked file. The names themselves are held to the workflows'
 * jobs by workflows.test.ts.
 */

const read = (file: string): string => readFileSync(path.join(repositoryRoot, file), 'utf8');

function git(args: readonly string[]): { status: number | null; stdout: string } {
  const result = spawnSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  expect(result.error).toBeUndefined();
  return { status: result.status, stdout: result.stdout };
}

/** Every Markdown file git tracks, wherever it is. */
function markdownFiles(): string[] {
  const listed = git(['ls-files', '-z', '--', '*.md']);
  expect(listed.status).toBe(0);
  return listed.stdout.split('\0').filter((file) => file !== '');
}

/** Every line of a tracked text file that the stale-name search finds, but in the files that hold the names as data. */
function staleLines(): { file: string; text: string }[] {
  const found = git(['grep', '-n', '-I', '-E', '-e', STALE_NAMES, '--', '.', ':!tools/required-checks.ts', ':!tools/test/required-checks.test.ts']);
  // git grep exits 1 when nothing matches.
  expect([0, 1]).toContain(found.status);
  return found.stdout
    .split('\n')
    .filter((hit) => hit !== '')
    .map((hit) => {
      const [, file = '', text = ''] = /^([^:]*):\d+:(.*)$/.exec(hit) ?? [];
      return { file, text };
    });
}

describe('the required checks', () => {
  it('are four, each named once: all green, mutation, the screening-capacity gate and approval-of-record', () => {
    expect(REQUIRED_CHECK_NAMES).toEqual(['all green', 'mutation', 'screening-capacity gate', 'approval-of-record']);
    expect(new Set(REQUIRED_CHECKS.map((check) => `${check.workflow} ${check.job}`)).size).toBe(REQUIRED_CHECKS.length);
  });

  it.each(REQUIRED_CHECK_LISTINGS)('are listed in %s, between the markers, exactly and in order', (file) => {
    expect(existsSync(path.join(repositoryRoot, file)), file).toBe(true);
    const { listings, problems, unmarked } = readListings(read(file));
    expect(problems).toEqual([]);
    expect(listings.length, `${file} has no ${OPEN_MARKER} listing`).toBeGreaterThan(0);
    for (const listing of listings) {
      expect(listing.names, `${file}:${String(listing.line)}`).toEqual(REQUIRED_CHECK_NAMES);
    }
    expect(unmarkedListings(unmarked)).toEqual([]);
  });

  it('are listed nowhere else without the markers, in any Markdown file the repository tracks', () => {
    // A listing outside the named files fails here until it is marked and its file named in REQUIRED_CHECK_LISTINGS.
    const files = markdownFiles();
    expect(files).toEqual(expect.arrayContaining(['README.md', 'CLAUDE.md', 'docs/product/PRD.md', 'docs/product/reconciliation-001.md', ...REQUIRED_CHECK_LISTINGS]));
    const listed = new Set(REQUIRED_CHECK_LISTINGS);
    const problems = files.flatMap((file) => {
      const { listings, problems: markers, unmarked } = readListings(read(file));
      return [
        ...markers.map((problem) => `${file}: ${problem}`),
        ...(listed.has(file) ? [] : listings.map((listing) => `${file}:${String(listing.line)}: a marked listing, and the file is not in REQUIRED_CHECK_LISTINGS`)),
        ...unmarkedListings(unmarked).map((first) => `${file}: a listing without the markers: ${first}`),
      ];
    });
    expect(problems).toEqual([]);
  });

  it('that ADR 0066 replaced are named only where the history keeps them: no listing of them in any Markdown file, and none of their names in any tracked file', () => {
    // How many lines and paragraphs each history entry lets through: exactly one, so none outlives what it allows.
    const lets = new Map(OLD_NAMES_HISTORY.map((entry) => [entry, { lines: 0, paragraphs: 0 }]));
    const allowed = (file: string, text: string, kind: 'lines' | 'paragraphs') => {
      const entries = OLD_NAMES_HISTORY.filter((entry) => entry.file === file && text.includes(entry.text));
      for (const entry of entries) {
        const count = lets.get(entry);
        if (count !== undefined) count[kind] += 1;
      }
      return entries.length > 0;
    };
    const listings = markdownFiles().flatMap((file) =>
      oldListings(readListings(read(file)).unmarked)
        .filter((paragraph) => !allowed(file, paragraph, 'paragraphs'))
        .map((paragraph) => `${file}: lists the old checks: ${paragraph.split('\n')[0] ?? ''}`),
    );
    const names = staleLines()
      .filter(({ file, text }) => !allowed(file, text, 'lines'))
      .map(({ file, text }) => `${file}: names an old check: ${text.trim()}`);
    expect([...listings, ...names]).toEqual([]);
    expect(
      [...lets].filter(([, { lines, paragraphs }]) => lines + paragraphs === 0 || lines > 1 || paragraphs > 1).map(([entry, count]) => `${entry.file}: "${entry.text}" lets through ${JSON.stringify(count)}`),
    ).toEqual([]);
  });
});

describe('reading a marked listing', () => {
  const listing = (body: string) => `${OPEN_MARKER}${body}${CLOSE_MARKER}`;

  it('reads every backticked name between the markers, in order, wherever the markers sit', () => {
    const text = ['Intro.', '', listing('\n- `all green`, from ci\n- `mutation`\n'), '', `Inline: ${listing('`screening-capacity gate` and `approval-of-record`')}.`].join('\n');
    expect(readListings(text)).toMatchObject({ listings: [{ line: 3, names: ['all green', 'mutation'] }, { line: 8, names: ['screening-capacity gate', 'approval-of-record'] }], problems: [] });
  });

  it('refuses a listing never closed, a closing marker with no listing, and a listing inside another', () => {
    expect(readListings(`a\n${OPEN_MARKER} \`all green\``).problems).toEqual([`line 2: ${OPEN_MARKER} is never closed`]);
    expect(readListings(`a\n\n${CLOSE_MARKER}`).problems).toEqual([`line 3: ${CLOSE_MARKER} with no listing open`]);
    expect(readListings(`${OPEN_MARKER}\n${OPEN_MARKER} \`mutation\`${CLOSE_MARKER}`).problems).toEqual(['line 1: a listing opens inside another']);
  });

  it('finds a listing left unmarked: three required names in one paragraph, and not two', () => {
    const three = 'Require `all green`,\n`mutation` and `approval-of-record`.';
    const two = 'Until `all green` and `approval-of-record` pass.';
    expect(unmarkedListings(`${three}\n\n${two}`)).toEqual(['Require `all green`,']);
    // Taken out of a marked listing, the same names leave nothing behind.
    expect(unmarkedListings(readListings(`Before ${listing(three)} after.`).unmarked)).toEqual([]);
  });

  it('finds a listing of the old checks, two or more in one paragraph, and the old names the design’s search finds', () => {
    const old = 'The old set: `check`, `images (web)`, `images (worker)`, `licenses` and `approval-of-record`.';
    expect(oldListings(`${old}\n\nOnly \`check\` here, as a command.\n\nRequire \`licenses\`\nand \`check\`.`)).toEqual([old, 'Require `licenses`\nand `check`.']);
    const stale = new RegExp(STALE_NAMES);
    for (const line of ['ci / check (pull_request)', 'the `check` (the serial job)', 'all five checks', 'the five green checks', 'the images (web) check', 'images (worker)', '.github/workflows/supply-chain.yml']) {
      expect(stale.test(line), line).toBe(true);
    }
    for (const line of ['the check job', 'five green tests', '`all green`', 'supply-chain gates']) {
      expect(stale.test(line), line).toBe(false);
    }
  });

  it('fails a marked listing that names an old check, leaves one out or reorders them', () => {
    const names = (body: string) => readListings(listing(body)).listings[0]?.names;
    expect(names('`check`, `images (web)`, `images (worker)`, `licenses`, `approval-of-record`')).not.toEqual(REQUIRED_CHECK_NAMES);
    expect(names('`all green`, `screening-capacity gate`, `approval-of-record`')).not.toEqual(REQUIRED_CHECK_NAMES);
    expect(names('`mutation`, `all green`, `screening-capacity gate`, `approval-of-record`')).not.toEqual(REQUIRED_CHECK_NAMES);
    expect(names('`all green`, `mutation`, `screening-capacity gate`, `approval-of-record`')).toEqual(REQUIRED_CHECK_NAMES);
  });
});
