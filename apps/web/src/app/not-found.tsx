import { Button, EmptyState } from '@tp/ui';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl p-10">
      <EmptyState
        title="Page not found"
        nextStep="The address may be mistyped or the page may have moved. Return to the practice dashboard."
        action={
          <Button asChild variant="outline">
            <Link href="/dashboard">Go to the dashboard</Link>
          </Button>
        }
      />
    </main>
  );
}
