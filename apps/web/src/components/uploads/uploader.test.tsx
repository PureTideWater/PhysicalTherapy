import { describe, expect, it } from 'vitest';

import { stillSending } from './uploader';

/**
 * When leaving the Uploads screen asks first (UX review of PR #78, UX-DLR-02): while a file of the batch is still
 * asked for, uploading or being reported complete, a reload would cut it off; once each is sent or failed, nothing is
 * lost by leaving. The browser's question itself is the browser's. Written by hand.
 */

describe('leaving the Uploads screen', () => {
  it('asks while any file of the batch is still being sent', () => {
    for (const phase of ['waiting', 'uploading', 'completing'] as const) {
      expect(stillSending([{ phase: 'sent' }, { phase }, { phase: 'failed' }])).toBe(true);
    }
  });

  it('never asks with no batch, or once every file is sent or failed', () => {
    expect(stillSending([])).toBe(false);
    expect(stillSending([{ phase: 'sent' }, { phase: 'failed' }, { phase: 'sent' }])).toBe(false);
  });
});
