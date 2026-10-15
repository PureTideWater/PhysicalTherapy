import { EmptyState } from '@tp/ui';

/**
 * The application shell (milestone 0): the App Router, Tailwind and the shared shadcn/ui components
 * from @tp/ui. Each screen of PRD section 7 is added in the milestone that builds its behaviour, and
 * security headers and error pages in milestone 11 (docs/adr/0011-web-shell-before-its-screens.md).
 */
export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-10">
      <h1 className="text-2xl font-semibold tracking-tight">Therapy contract-payment platform</h1>
      <EmptyState title="Nothing to show yet" nextStep="The workspace screens arrive with the milestones that build them." />
    </main>
  );
}
