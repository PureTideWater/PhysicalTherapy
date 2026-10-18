import { EmptyState } from '@tp/ui';
import Link from 'next/link';
import { PublicHeader } from '../components/public-header';

/** Nothing here, or nothing this account can reach: the same answer either way. */
export default function NotFound() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-8 md:p-10">
      <EmptyState
        mark
        title="Not found"
        nextStep="This page does not exist, or your account has no current access to it. Access to a practice comes from your organization's membership or a grant the practice approved."
        action={
          <Link className="text-sm underline" href="/">
            Go to your workspace
          </Link>
        }
      />
    </main>
    </>
  );
}
