import { z } from 'zod';

/**
 * Server-side pages for the workspace's lists (PRD 6, Cross-cutting: "every list paginated and
 * filterable server-side"; PRD 7: "tables load server-side with filters in the URL"): a page number
 * from the URL, and the page, page count and offset for a total. A page past the last shows the last.
 */
export const pageParam = z.coerce.number().int().min(1).max(100_000).default(1);

export interface PageWindow {
  readonly page: number;
  readonly pages: number;
  readonly offset: number;
}

export function pageWindow(total: number, perPage: number, requested: number): PageWindow {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, requested), pages);
  return { page, pages, offset: (page - 1) * perPage };
}

/** A page of a list, with where it stands. */
export interface ListPage<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pages: number;
  readonly total: number;
}
