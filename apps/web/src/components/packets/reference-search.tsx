import { Input, Label } from '@tp/ui';

/** "Find a packet by its reference": a plain GET form to the lookup page (audit item #37 part 1, D5). */
export function ReferenceSearch({ practiceId, defaultValue = '' }: { readonly practiceId: string; readonly defaultValue?: string }) {
  return (
    <form method="get" action={`/p/${practiceId}/cases/by-reference`} className="flex flex-wrap items-end gap-3 text-sm" aria-label="Packet reference lookup">
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor="packet-reference">Find a packet by its reference</Label>
        <Input id="packet-reference" name="reference" required maxLength={64} autoComplete="off" spellCheck={false} placeholder="SK6CS-K6CSK" defaultValue={defaultValue} aria-describedby="packet-reference-hint" />
        <p id="packet-reference-hint" className="text-xs text-muted-foreground">
          As printed in the packet’s approval line; lower case and no hyphen are fine.
        </p>
      </div>
      <button type="submit" className="h-9 rounded-md border px-3">
        Find
      </button>
    </form>
  );
}
