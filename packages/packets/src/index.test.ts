import { describe, expect, it } from 'vitest';

import { PAYER_RESPONSE_KINDS } from './index';

describe('@tp/packets', () => {
  it('lists the payer response kinds of the data dictionary', () => {
    expect(PAYER_RESPONSE_KINDS).toEqual(['accepted', 'partial', 'denied', 'info_requested', 'reprocessed_no_change']);
  });
});
