import type { ReactNode } from 'react';

import { PaidWholeLockup } from '../../components/brand';

/**
 * Every sign-in step on the Paper ground under the stacked lockup, and nothing else decorative
 * (docs/brand/BRAND.md, section 7). Each step renders its own main content below it. In dark (the tokens'
 * own, `[data-theme="dark"]` or `.dark`; docs/adr/0056) the ground is the dark ground, `--pw-bg`, as BRAND.md
 * section 4 has it ("the ground becomes a deeper ink"): Paper is a palette constant the dark tokens never
 * change, while the text, link and focus tokens on it turn light, so on Paper they fell to 1.02:1 to 1.97:1
 * (review UXD-N1). On `--pw-bg` the frame's lowest is 8.39:1, and it is one ground with its cards.
 */
export default function SignInLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col items-stretch bg-paper dark:bg-bg" data-slot="sign-in-ground">
      <div className="flex justify-center px-4 pt-10 pb-2">
        <PaidWholeLockup stacked size={28} />
      </div>
      {children}
    </div>
  );
}
