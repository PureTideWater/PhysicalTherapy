import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Separator, cn } from '../index';

describe('cn', () => {
  it('lets a later Tailwind utility override an earlier one', () => {
    expect(cn('px-2 py-1', false, 'px-4')).toBe('py-1 px-4');
  });
});

describe('Button', () => {
  it('renders a button with the default variant', () => {
    const html = renderToStaticMarkup(<Button type="button">Save</Button>);
    expect(html).toMatch(/^<button data-slot="button" class="[^"]*bg-primary[^"]*" type="button">Save<\/button>$/);
  });

  it('looks inactive when aria-disabled, as when disabled, and stays focusable (a pending form’s button)', () => {
    const html = renderToStaticMarkup(
      <Button type="submit" aria-disabled>
        Save
      </Button>,
    );
    expect(html).toContain('aria-disabled:cursor-not-allowed');
    expect(html).toContain('aria-disabled:opacity-50');
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toMatch(/ disabled=""/);
  });

  it('applies the outline variant and small size', () => {
    const html = renderToStaticMarkup(
      <Button variant="outline" size="sm">
        Cancel
      </Button>,
    );
    expect(html).toContain('border bg-background');
    expect(html).toContain('h-8');
  });

  it('renders its child element when asChild is set', () => {
    const html = renderToStaticMarkup(
      <Button asChild>
        <a href="/uploads">Upload</a>
      </Button>,
    );
    expect(html).toMatch(/^<a [^>]*>Upload<\/a>$/);
    expect(html).toContain('href="/uploads"');
    expect(html).toContain('data-slot="button"');
    expect(html).toContain('bg-primary');
  });
});

describe('Card, Badge and Separator', () => {
  it('compose', () => {
    const html = renderToStaticMarkup(
      <Card>
        <CardHeader>
          <CardTitle>Coverage</CardTitle>
          <CardDescription>Share of lines priced</CardDescription>
        </CardHeader>
        <CardContent>
          <Badge variant="secondary">investigatory</Badge>
          <Separator decorative={false} orientation="vertical" />
        </CardContent>
      </Card>,
    );
    expect(html).toContain('<h2 data-slot="card-title"');
    expect(html).toContain('investigatory');
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-orientation="vertical"');
  });

  it('hides a decorative separator from assistive technology', () => {
    expect(renderToStaticMarkup(<Separator />)).toContain('role="none"');
  });
});

describe('Input and Label', () => {
  it('renders a text input by default, and a label for it', () => {
    const html = renderToStaticMarkup(
      <>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" aria-invalid />
      </>,
    );
    expect(html).toContain('<label data-slot="label"');
    expect(html).toContain('for="email"');
    expect(html).toMatch(/<input type="text" data-slot="input" class="[^"]*border-input[^"]*" id="email" aria-invalid="true" name="email"\/>/);
  });

  it('keeps the type it is given', () => {
    expect(renderToStaticMarkup(<Input type="password" />)).toContain('type="password"');
  });
});
