import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { DOMAIN_MODEL_DOCUMENT, DomainModelError, REPO_ROOT } from './sources';

/** The domain model document as a git commit holds it: the ref asked for, the commit it names, and the text. */
export interface DocumentAtRef {
  readonly ref: string;
  readonly commit: string;
  readonly text: string;
}

/** A ref git takes as a revision, not an option: no leading "-", no spaces or control characters. */
const isRef = (ref: string): boolean => /^[^\s-]\S*$/.test(ref) && !/\p{Cc}/u.test(ref);

/**
 * docs/product/domain-model.md at `ref` (a branch, a tag, `origin/main` or a commit), for
 * `--summary-since`: the last approved document is the one on the base branch, since no migration merges
 * without an approval (CLAUDE.md, Schema gate). Refuses (DomainModelError) a ref git cannot resolve to a
 * commit, and a commit without the document.
 */
export function documentAtRef(ref: string, options: { readonly repoRoot?: string; readonly document?: string } = {}): DocumentAtRef {
  const root = options.repoRoot ?? REPO_ROOT;
  const document = path.relative(root, options.document ?? DOMAIN_MODEL_DOCUMENT).split(path.sep).join('/');
  if (!isRef(ref)) throw new DomainModelError(`--summary-since ${JSON.stringify(ref)} is not a git ref`);
  const git = (args: readonly string[]): string =>
    execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
  let commit: string;
  try {
    commit = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim();
  } catch {
    throw new DomainModelError(`--summary-since ${ref}: git knows no such commit (fetch the base branch first, e.g. git fetch origin)`);
  }
  try {
    return { ref, commit, text: git(['show', `${commit}:${document}`]) };
  } catch {
    throw new DomainModelError(`--summary-since ${ref}: commit ${commit.slice(0, 12)} has no ${document}`);
  }
}
