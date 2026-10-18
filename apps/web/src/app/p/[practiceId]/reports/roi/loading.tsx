import { LoadingState } from '@tp/ui';

/** The loading state while the statements are read (PRD 7: every screen has a loading state). */
export default function Loading() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-8">
      <LoadingState label="Loading ROI statements" rows={5} />
    </main>
  );
}
