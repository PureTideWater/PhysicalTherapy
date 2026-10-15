import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import { digestSentences, monthName } from '@tp/worker/digests';
import type { Metadata } from 'next';
import Link from 'next/link';

import { utc } from '../../../../../components/format';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { loadPage } from '../../../../../lib/http/next';
import { digestPage } from '../../../../../lib/routes/monitoring';

export const metadata: Metadata = { title: 'Monitoring digest' };

/**
 * A month's monitoring digest (PRD 5, J11; the link in its email): the email's sentences, counts and
 * dollar totals only, here with the payers named. Its figures were fixed when it was recorded; each
 * links to the screen of its stage.
 */
export default async function DigestPage(props: { readonly params: Promise<{ practiceId: string; digestId: string }> }) {
  const page = await loadPage(digestPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="reports" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, digest } = page.data;
  const sentences = digestSentences(digest.period, digest.figures, (payerId) => digest.payers[payerId]);
  return (
    <AppShell shell={page.shell} section="reports">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Monitoring digest for {monthName(digest.period)}</h1>
        <p className="text-sm text-muted-foreground">{digest.sentAt === null ? 'Not sent yet.' : `Sent ${utc(digest.sentAt)}.`} Its figures were fixed when it was recorded; the screens below show today's.</p>
      </div>
      <Card role="region" aria-label="Digest">
        <CardHeader>
          <CardTitle>Counts and dollar totals</CardTitle>
          <CardDescription>Validated is contract-supported; actionable is in cases, inside its window and above materiality; recovered is posted, net.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1 text-sm" aria-label="Digest figures">
            {sentences.slice(1).map((sentence) => (
              <li key={sentence}>{sentence}</li>
            ))}
          </ul>
          <p className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link className="underline" href={`/p/${practiceId}/claims`}>
              Validated lines (Claims and lines)
            </Link>
            <Link className="underline" href={`/p/${practiceId}/cases`}>
              Cases
            </Link>
            <Link className="underline" href={`/p/${practiceId}/coverage`}>
              Coverage
            </Link>
            <Link className="underline" href={`/p/${practiceId}/contracts`}>
              Contracts
            </Link>
            <Link className="underline" href={`/p/${practiceId}/reports/monthly`}>
              Monthly variance summary
            </Link>
          </p>
        </CardContent>
      </Card>
    </AppShell>
  );
}
