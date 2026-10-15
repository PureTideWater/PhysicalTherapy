import { Button } from '@tp/ui';

/**
 * The practice switcher at the top of the left rail (PRD section 7). Groups and firms work one
 * practice at a time; the list of practices comes from the user's memberships and grants once
 * tenancy exists (milestone 1), so the control is disabled until then.
 */
export function PracticeSwitcher() {
  return (
    <div className="flex flex-col gap-1.5" data-testid="practice-switcher">
      <span id="practice-switcher-label" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Practice
      </span>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between"
        aria-labelledby="practice-switcher-label practice-switcher-value"
        aria-haspopup="listbox"
        disabled
      >
        <span id="practice-switcher-value">No practice selected</span>
        <span aria-hidden="true">▾</span>
      </Button>
    </div>
  );
}
