import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EmptyState, ErrorState, LoadingState, PermissionState } from '../index';

describe('EmptyState', () => {
  it('names the screen state and says what to do next', () => {
    const html = renderToStaticMarkup(
      <EmptyState title="No remittances yet" nextStep="Upload your first 835 files." action={<a href="/uploads">Upload</a>} />,
    );
    expect(html).toContain('aria-label="No remittances yet"');
    expect(html).toContain('Upload your first 835 files.');
    expect(html).toContain('href="/uploads"');
  });

  it('renders without an action', () => {
    const html = renderToStaticMarkup(<EmptyState title="Nothing here" nextStep="Do the next thing." />);
    expect(html).not.toContain('<a');
  });
});

describe('LoadingState', () => {
  it('shows its label beside the bar and holds a status region that is never busy', () => {
    const html = renderToStaticMarkup(<LoadingState label="Loading cases" rows={2} />);
    expect(html).toContain('role="status"');
    expect(html).not.toContain('aria-busy');
    expect(html).toMatch(/<span[^>]*data-slot="loading-label"[^>]*>Loading cases<\/span>/);
    expect(html.match(/data-slot="skeleton"/g)).toHaveLength(2);
  });

  it('renders its status region empty, so the label arriving after mount is announced', () => {
    const html = renderToStaticMarkup(<LoadingState label="Loading cases" />);
    expect(html).toContain('<p role="status" class="sr-only"></p>');
    expect(html.match(/Loading cases/g)).toHaveLength(1);
  });

  it('defaults to three rows and a generic label', () => {
    const html = renderToStaticMarkup(<LoadingState />);
    expect(html).toContain('>Loading<');
    expect(html.match(/data-slot="skeleton"/g)).toHaveLength(3);
  });
});

describe('ErrorState', () => {
  it('is an alert with a next step and an opaque reference', () => {
    const html = renderToStaticMarkup(
      <ErrorState
        title="The last run failed"
        nextStep="Retry the run; if it fails again, contact support with the reference."
        reference="job 3f1c"
        action={<button type="button">Retry</button>}
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('The last run failed');
    expect(html).toContain('Retry the run');
    expect(html).toContain('Reference: job 3f1c');
    expect(html).toContain('<button type="button">Retry</button>');
  });

  it('omits the reference and action when absent', () => {
    const html = renderToStaticMarkup(<ErrorState title="Failed" nextStep="Try again." />);
    expect(html).not.toContain('Reference:');
    expect(html).not.toContain('<button');
  });
});

describe('PermissionState', () => {
  it('explains what the role cannot do and who can help', () => {
    const html = renderToStaticMarkup(
      <PermissionState
        role="Viewer"
        cannot="export line-level PHI"
        nextStep="Ask a billing manager to run the export."
      />,
    );
    expect(html).toContain('Not available to your role');
    expect(html).toContain('As Viewer, you cannot export line-level PHI.');
    expect(html).toContain('Ask a billing manager to run the export.');
  });
});
