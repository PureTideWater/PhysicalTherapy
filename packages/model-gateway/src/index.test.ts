import { describe, expect, it } from 'vitest';

import { MODEL_PURPOSES } from './index';

describe('@tp/model-gateway', () => {
  it('exposes the four purpose-typed functions of PRD section 14', () => {
    expect(MODEL_PURPOSES).toEqual([
      'proposeContractTerms',
      'readDenialLetter',
      'draftPacketNarrative',
      'suggestEvidenceRequests',
    ]);
  });
});
