/**
 * The required status checks: what the ruleset of `claude/build-platform` requires, and "Protect main" from the launch
 * pull request on (docs/runbooks/github-governance.md, steps 4A and 8; docs/adr/0063, amended by docs/adr/0066). One
 * list, so every document says the same: each listing of the checks sits between `<!-- required-checks -->` and
 * `<!-- /required-checks -->` and names exactly these, in this order, each in backticks (tools/test/required-checks.test.ts),
 * and each name is a job of its workflow that runs on every pull request (tools/test/workflows.test.ts).
 */

export interface RequiredCheck {
  /** The check's name as GitHub reports it and the ruleset requires it: the job's `name:`, or its id when it has none. */
  readonly name: string;
  /** Its workflow's file under .github/workflows. */
  readonly workflow: string;
  /** The job's id in that workflow. */
  readonly job: string;
}

export const REQUIRED_CHECKS: readonly RequiredCheck[] = [
  // Every ci.yml job, through the one gate that needs them all (docs/adr/0066, Part 1).
  { name: 'all green', workflow: 'ci.yml', job: 'all-green' },
  // The money paths' mutation score (PRD 18; docs/adr/0064, and 0066 Part 4 from co-001/ci-mutation).
  { name: 'mutation', workflow: 'mutation.yml', job: 'mutation' },
  // The screening's capacity under production limits (the founder's Q8 of 2026-10-21; docs/runbooks/screening-capacity.md).
  { name: 'screening-capacity gate', workflow: 'screening-capacity.yml', job: 'gate' },
  // The founder's review as the approval of record (docs/adr/0063).
  { name: 'approval-of-record', workflow: 'approval-of-record.yml', job: 'approval-of-record' },
];

export const REQUIRED_CHECK_NAMES: readonly string[] = REQUIRED_CHECKS.map((check) => check.name);

/** The documents that list the required checks; each holds at least one marked listing. */
export const REQUIRED_CHECK_LISTINGS: readonly string[] = [
  '.github/pull_request_template.md',
  'docs/runbooks/github-governance.md',
  'docs/runbooks/screening-capacity.md',
  'docs/runbooks/ci.md',
  'docs/policies/change-management.md',
  'docs/adr/0063-protect-main-and-the-build-branch-make-the-founders-github-review-the-approval-of-record-open-each-approval-with-what-changed-and-switch-on-the-edit-hooks.md',
  'docs/adr/0066-run-ci-as-parallel-jobs-behind-one-gate-measure-mutation-on-every-money-package-move-the-browser-and-runner-together-and-pin-every-dependency.md',
];

export const OPEN_MARKER = '<!-- required-checks -->';
export const CLOSE_MARKER = '<!-- /required-checks -->';

export interface MarkedListing {
  /** The line the opening marker is on, from 1. */
  readonly line: number;
  /** Every backticked name between the markers, in order. */
  readonly names: readonly string[];
}

export interface ListingsRead {
  readonly listings: readonly MarkedListing[];
  /** Markers that do not pair: an opening marker inside a listing, a closing one outside, or one left open. */
  readonly problems: readonly string[];
  /** The text with every marked listing taken out, for the search for unmarked ones. */
  readonly unmarked: string;
}

const lineOf = (text: string, at: number): number => text.slice(0, at).split('\n').length;

/** The marked listings of a document's text. */
export function readListings(text: string): ListingsRead {
  const listings: MarkedListing[] = [];
  const problems: string[] = [];
  let unmarked = '';
  let at = 0;
  for (;;) {
    const open = text.indexOf(OPEN_MARKER, at);
    const stray = text.indexOf(CLOSE_MARKER, at);
    if (stray !== -1 && (open === -1 || stray < open)) {
      problems.push(`line ${String(lineOf(text, stray))}: ${CLOSE_MARKER} with no listing open`);
    }
    if (open === -1) {
      unmarked += text.slice(at);
      break;
    }
    unmarked += text.slice(at, open);
    const close = text.indexOf(CLOSE_MARKER, open + OPEN_MARKER.length);
    if (close === -1) {
      problems.push(`line ${String(lineOf(text, open))}: ${OPEN_MARKER} is never closed`);
      break;
    }
    const body = text.slice(open + OPEN_MARKER.length, close);
    if (body.includes(OPEN_MARKER)) {
      problems.push(`line ${String(lineOf(text, open))}: a listing opens inside another`);
    }
    listings.push({ line: lineOf(text, open), names: [...body.matchAll(/`([^`\n]+)`/g)].map((match) => match[1] ?? '') });
    // A listing inside a paragraph leaves the paragraph whole for the search below.
    unmarked += ' ';
    at = close + CLOSE_MARKER.length;
  }
  return { listings, problems, unmarked };
}

/**
 * Paragraphs outside the marked listings that name three or more of the required checks in backticks: a listing
 * someone left unmarked, which the marked-listing check would never read.
 */
export function unmarkedListings(unmarked: string, names: readonly string[] = REQUIRED_CHECK_NAMES): string[] {
  return unmarked
    .split(/\n\s*\n/)
    .filter((paragraph) => new Set([...paragraph.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]).filter((name) => name !== undefined && names.includes(name))).size >= 3)
    .map((paragraph) => paragraph.trim().split('\n')[0] ?? '');
}
