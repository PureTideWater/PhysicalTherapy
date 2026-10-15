import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ScreenPlaceholder } from './screen-placeholder';

describe('ScreenPlaceholder', () => {
  it('renders the screen heading, what it shows, and its empty state', () => {
    const html = renderToStaticMarkup(<ScreenPlaceholder slug="dashboard" />);
    expect(html).toContain('<h1');
    expect(html).toContain('Practice dashboard');
    expect(html).toContain('Data freshness');
    expect(html).toContain('Upload your first 835 files.');
    expect(html).not.toContain('Not available to your role');
  });

  it('explains what the role cannot do instead when access is denied', () => {
    const html = renderToStaticMarkup(
      <ScreenPlaceholder
        slug="packets"
        denied={{ role: 'Analyst', cannot: 'approve packets', nextStep: 'Ask a billing manager to approve it.' }}
      />,
    );
    expect(html).toContain('Packet builder');
    expect(html).toContain('As Analyst, you cannot approve packets.');
    expect(html).not.toContain('No packets');
  });
});
