import type { ReactNode } from 'react';

import { PaidWholeLockup } from '../../components/brand';

/**
 * Every sign-in step on the Paper ground under the stacked lockup, and nothing else decorative
 * (docs/brand/BRAND.md, section 7). Each step renders its own main content below it.
 */
export default function SignInLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col items-stretch bg-paper" data-slot="sign-in-ground">
      <div className="flex justify-center px-4 pt-10 pb-2">
        <PaidWholeLockup stacked size={28} />
      </div>
      {children}
    </div>
  );
}
