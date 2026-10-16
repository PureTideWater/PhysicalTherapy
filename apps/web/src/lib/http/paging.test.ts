import { describe, expect, it } from 'vitest';

import { pageParam, pageWindow } from './paging';

describe('server-side pages', () => {
  it('gives the page, the page count and the offset, the last page for one past it, and one page of nothing', () => {
    expect(pageWindow(120, 50, 1)).toEqual({ page: 1, pages: 3, offset: 0 });
    expect(pageWindow(120, 50, 3)).toEqual({ page: 3, pages: 3, offset: 100 });
    expect(pageWindow(120, 50, 9)).toEqual({ page: 3, pages: 3, offset: 100 });
    expect(pageWindow(0, 50, 2)).toEqual({ page: 1, pages: 1, offset: 0 });
    expect(pageParam.parse(undefined)).toBe(1);
    expect(pageParam.parse('4')).toBe(4);
    expect(pageParam.safeParse('0').success).toBe(false);
  });
});
