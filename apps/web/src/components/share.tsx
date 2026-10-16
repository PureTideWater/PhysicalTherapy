'use client';

import { Button, Input, Label } from '@tp/ui';
import { useId, useState } from 'react';

/**
 * Sharing a report within the organization (PRD 7, Reports: "share within the organization";
 * Information architecture rules: "URLs carry opaque IDs ... so a filtered view can be shared within the
 * organization"; docs/adr/0045): the report's link, which carries opaque IDs only. Whoever opens it
 * signs in and reaches it under their own role, through the practice's group or a grant in force; no
 * one else can, so the link is safe to pass to a colleague. Copying it writes nothing; the page works
 * with the link selected by hand when the browser refuses the clipboard.
 */
export function ShareLink({ href, label = 'Link to share within the organization' }: { readonly href: string; readonly label?: string }) {
  const id = useId();
  const [copied, setCopied] = useState<'idle' | 'copied' | 'refused'>('idle');
  return (
    <div className="flex flex-col gap-1.5" data-share={href}>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input id={id} readOnly value={href} className="max-w-xl font-mono text-xs" aria-describedby={`${id}-who`} onFocus={(event) => event.currentTarget.select()} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(href).then(
              () => setCopied('copied'),
              () => setCopied('refused'),
            );
          }}
        >
          Copy the link
        </Button>
        <span role="status" className="text-xs text-muted-foreground">
          {copied === 'copied' ? 'Copied.' : copied === 'refused' ? 'The browser refused the clipboard: select the link and copy it.' : ''}
        </span>
      </div>
      <p id={`${id}-who`} className="text-xs text-muted-foreground">
        People of the organization who reach this practice open it under their own role; no one else can. It names no patient, claim or payer.
      </p>
    </div>
  );
}
