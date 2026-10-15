import type { ReactNode } from 'react';

import { LeftRail } from '../../components/left-rail';

/** The customer workspace shell: the left rail beside the current screen (PRD section 7). */
export default function WorkspaceLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-screen">
      <LeftRail />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
