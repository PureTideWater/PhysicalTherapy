import { DEFAULT_CALL_LIMITS } from '@tp/model-gateway';
import { describe, expect, it } from 'vitest';

import { WEB_POOL_CONNECTIONS } from './pools';

describe('the web task’s pools', () => {
  it('give the model gateway a connection for each call in flight at once and one to spare', () => {
    expect(WEB_POOL_CONNECTIONS.model).toBe(DEFAULT_CALL_LIMITS.perProcess + 1);
  });
});
