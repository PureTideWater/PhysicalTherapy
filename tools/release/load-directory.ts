import path from 'node:path';

/**
 * Where `pnpm release:load --dir` may read from. Fixture releases (anything under fixtures/) hold
 * SYNTHETIC invented values and load only into scratch test databases through the database tests,
 * never through the release command; the loader refuses their records too.
 */
export function loadDirectoryRefusal(root: string, dir: string): string | undefined {
  const relative = path.relative(path.resolve(root), path.resolve(dir)).split(path.sep).join('/');
  if (relative === 'fixtures' || relative.startsWith('fixtures/')) {
    return `${relative} is a SYNTHETIC fixture release; fixtures load only into scratch test databases (the database tests), never through release:load`;
  }
  return undefined;
}
