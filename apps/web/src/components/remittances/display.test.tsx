import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Counted } from './display';

/** The count of <Counted>: counted()'s words (lib/copy/words.ts), the count alone in the mono face. */

describe('a count with its noun, the count in the mono face', () => {
  it('sets the whole grouped count in the mono face and keeps its noun whole, singular for one', () => {
    expect(renderToStaticMarkup(<Counted value={1} one="minute" />)).toBe('<span class="font-mono tabular-nums">1</span> minute');
    expect(renderToStaticMarkup(<Counted value={32} one="line" />)).toBe('<span class="font-mono tabular-nums">32</span> lines');
    expect(renderToStaticMarkup(<Counted value={1_204} one="line" />)).toBe('<span class="font-mono tabular-nums">1,204</span> lines');
    expect(renderToStaticMarkup(<Counted value={12_345} one="transaction set" />)).toBe('<span class="font-mono tabular-nums">12,345</span> transaction sets');
    expect(renderToStaticMarkup(<Counted value={2} one="linked entry" many="linked entries" />)).toBe('<span class="font-mono tabular-nums">2</span> linked entries');
  });
});
