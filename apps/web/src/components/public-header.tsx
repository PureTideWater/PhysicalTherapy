import Link from 'next/link';

import { PaidWholeLockup } from './brand';

/** The header of a page a visitor without a session sees: the PaidWhole lockup alone, linking to sign-in. */
export function PublicHeader() {
  return (
    <header className="flex h-14 items-center border-b bg-background px-4 md:px-6" data-slot="public-header">
      <Link href="/sign-in" className="no-underline">
        <PaidWholeLockup size={20} />
      </Link>
    </header>
  );
}
