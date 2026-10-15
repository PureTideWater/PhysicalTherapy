import { randomUUID } from 'node:crypto';

import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle, PermissionState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../../../components/action-form';
import { QuestionList } from '../../../../../../components/contracts/display';
import { AnswerForm } from '../../../../../../components/contracts/forms';
import { ReviewBody, VersionFacts, VersionStateNotice, reviewHref } from '../../../../../../components/contracts/review';
import { roleNames } from '../../../../../../components/format';
import { AppShell, Forbidden } from '../../../../../../components/shell';
import { windowText } from '../../../../../../lib/contracts/display';
import { loadPage } from '../../../../../../lib/http/next';
import { versionPage } from '../../../../../../lib/routes/contracts';
import { answerQuestionFormAction, signOffFormAction } from '../../actions';

export const metadata: Metadata = { title: 'Rate record review' };

type Props = { readonly params: Promise<{ practiceId: string; versionId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Rate record review, as the practice sees it (PRD 7: "side by side: cited page and the abstracted
 * fields ... customer signs off"): the version's pages and rate records with each field's quote, page
 * and approval; the sign-off of an approved version by the practice administrator or billing manager
 * (J5), after which pricing uses it for its window; a superseded version read-only.
 */
export default async function VersionPage(props: Props) {
  const page = await loadPage(versionPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="contracts" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, review, questions, canSignOff, roles, notice } = page.data;
  const { version } = review;
  const path = `/p/${practiceId}/contracts/versions/${version.id}`;
  return (
    <AppShell shell={page.shell} section="contracts">
      <div className="flex flex-col gap-1">
        <p className="text-sm">
          <Link className="underline" href={`/p/${practiceId}/contracts/${version.contractId}`}>
            {version.contractTitle}
          </Link>{' '}
          <span className="text-muted-foreground">with {version.payerName}</span>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Version {version.versionNo}: rate record review</h1>
      </div>
      {notice === 'signed_off' ? (
        <Alert data-notice="signed_off">
          <AlertTitle>Signed off</AlertTitle>
          <AlertDescription>The version is signed off. Its calendar dates are recorded on the contract.</AlertDescription>
        </Alert>
      ) : null}
      <VersionStateNotice review={review} />
      <VersionFacts review={review} versionHref={(versionId) => `/p/${practiceId}/contracts/versions/${versionId}`} />
      {version.status === 'approved' ? (
        <Card role="region" aria-label="Sign off">
          <CardHeader>
            <CardTitle>Sign off version {version.versionNo}</CardTitle>
            <CardDescription>
              The contract specialist verified every term against its page. Signing off accepts the version: from then on it prices lines with service dates{' '}
              {windowText(version.effectiveFrom, version.effectiveTo)}
              {version.supersedesNo === null ? '' : `, and it closes or supersedes version ${String(version.supersedesNo)} as it says`}. A signed-off version never changes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!canSignOff ? (
              <PermissionState role={roleNames(roles)} cannot="sign off a contract version" nextStep="The practice administrator or the billing manager signs off." />
            ) : review.unresolved > 0 ? (
              <p className="text-sm text-destructive">A rate record no longer resolves to its page; ask the contract specialist before signing off.</p>
            ) : (
              <ActionForm action={signOffFormAction} submit="Sign off this version">
                <input type="hidden" name="requestKey" value={randomUUID()} />
                <input type="hidden" name="practiceId" value={practiceId} />
                <input type="hidden" name="versionId" value={version.id} />
              </ActionForm>
            )}
          </CardContent>
        </Card>
      ) : null}
      <ReviewBody review={review} href={reviewHref(path)} />
      <section aria-label="The specialist's questions" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">The contract specialist’s questions about this version</h2>
        {questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <QuestionList
            questions={questions}
            practiceId={practiceId}
            answer={
              canSignOff
                ? (question) => <AnswerForm action={answerQuestionFormAction} practiceId={practiceId} questionId={question.id} />
                : undefined
            }
          />
        )}
      </section>
    </AppShell>
  );
}
