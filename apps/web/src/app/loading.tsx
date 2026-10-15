import { LoadingState } from '@tp/ui';

/** The loading state every screen shows while the server renders it (PRD 7). */
export default function Loading() {
  return (
    <main className="mx-auto max-w-3xl p-10">
      <LoadingState label="Loading" rows={4} />
    </main>
  );
}
