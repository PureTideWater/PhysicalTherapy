import { EmptyState, PermissionState, type PermissionStateProps } from '@tp/ui';

import { type WorkspaceScreenSlug, findScreen } from '../lib/screens';

export interface ScreenPlaceholderProps {
  readonly slug: WorkspaceScreenSlug;
  /**
   * Set when the viewer's role cannot use this screen; the screen then explains what the role
   * cannot do instead of rendering. Role checks arrive with tenancy (milestone 1) and always run in
   * the handler and in Postgres as well.
   */
  readonly denied?: PermissionStateProps;
}

/** A workspace screen before its milestone: its heading, what it will show, and its empty state. */
export function ScreenPlaceholder({ slug, denied }: ScreenPlaceholderProps) {
  const screen = findScreen(slug);
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{screen.title}</h1>
        <p className="text-sm text-muted-foreground">{screen.shows}</p>
      </header>
      {denied === undefined ? (
        <EmptyState title={screen.empty.title} nextStep={screen.empty.nextStep} />
      ) : (
        <PermissionState {...denied} />
      )}
    </div>
  );
}
