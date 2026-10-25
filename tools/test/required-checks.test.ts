import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';
import { CLOSE_MARKER, OPEN_MARKER, REQUIRED_CHECKS, REQUIRED_CHECK_LISTINGS, REQUIRED_CHECK_NAMES, readListings, unmarkedListings } from '../required-checks';

/**
 * One set of required checks in every document (docs/adr/0066, Part 1; the review's R8): each listing of them sits
 * between the markers and names exactly REQUIRED_CHECKS, in order, and every document that lists them keeps at least
 * one marked listing, so none can drop out of this check. A paragraph naming three or more of them outside the markers
 * is a listing left unmarked. The names themselves are held to the workflows' jobs by workflows.test.ts.
 */

const read = (file: string): string => readFileSync(path.join(repositoryRoot, file), 'utf8');

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

  it('are listed nowhere else in the documents and runbooks without the markers', () => {
    // Every Markdown file of the repository's documents, the README and the template: a listing outside the named
    // files fails here until it is marked and its file named in REQUIRED_CHECK_LISTINGS.
    const listed = new Set(REQUIRED_CHECK_LISTINGS);
    const files = ['README.md', '.github/pull_request_template.md', 'docs/runbooks/ci.md', 'docs/runbooks/github-governance.md', 'docs/runbooks/screening-capacity.md', 'docs/policies/change-management.md', 'docs/product/reconciliation-001.md', 'docs/product/PRD.md'];
    for (const file of files.filter((name) => existsSync(path.join(repositoryRoot, name)))) {
      const { listings, unmarked } = readListings(read(file));
      if (!listed.has(file)) expect(listings, `${file} lists the required checks but is not in REQUIRED_CHECK_LISTINGS`).toEqual([]);
      expect(unmarkedListings(unmarked), file).toEqual([]);
    }
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

  it('fails a marked listing that names an old check, leaves one out or reorders them', () => {
    const names = (body: string) => readListings(listing(body)).listings[0]?.names;
    expect(names('`check`, `images (web)`, `images (worker)`, `licenses`, `approval-of-record`')).not.toEqual(REQUIRED_CHECK_NAMES);
    expect(names('`all green`, `screening-capacity gate`, `approval-of-record`')).not.toEqual(REQUIRED_CHECK_NAMES);
    expect(names('`mutation`, `all green`, `screening-capacity gate`, `approval-of-record`')).not.toEqual(REQUIRED_CHECK_NAMES);
    expect(names('`all green`, `mutation`, `screening-capacity gate`, `approval-of-record`')).toEqual(REQUIRED_CHECK_NAMES);
  });
});
