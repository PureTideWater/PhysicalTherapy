import { describe, expect, it } from 'vitest';

import { KEY_REFUSALS } from './console-keys';

/** The key registry's refusal words (UX review U7, U8): each gives a next step the reader can take. The names are the database's. */
describe('the key registry’s refusal words', () => {
  it('gives each cause of the one permission refusal its own next step (U8)', () => {
    expect(KEY_REFUSALS.not_permitted).toBe(
      'only a platform administrator who has held the role for seven days and signed in with their hardware key in the last 15 minutes can do this. If you signed in with your key more than 15 minutes ago, sign out and sign in again with it. If you have held the role for less than seven days, ask another platform administrator.',
    );
  });

  it('says a decided request may be confirmed, cancelled or expired, and where to look (U7)', () => {
    expect(KEY_REFUSALS.hardware_key_removal_decided).toBe('this request was already confirmed, cancelled or has expired; the row now shows where it stands');
    expect(KEY_REFUSALS.hardware_key_removal_decided).not.toContain('reload');
  });
});
