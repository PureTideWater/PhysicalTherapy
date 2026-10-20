import type { Metadata } from 'next';
import Link from 'next/link';

import { PublicHeader } from '../../components/public-header';
import { loadPublicPage } from '../../lib/http/next';
import { disclosurePage } from '../../lib/routes/security';

export const metadata: Metadata = { title: 'Report a security vulnerability' };

/**
 * The public vulnerability-disclosure page (audit item #20 (f)), the Policy of /.well-known/security.txt: how to
 * report, what to include, what not to do and what to expect. No sign-in, no PHI and no form: a report goes by email
 * to the security address the server is configured with. Two parts are drafts that need a review before launch, each
 * marked with data-legal-surface and listed in docs/product/legal-surfaces.md: the response times (the security
 * official's) and the good-faith research statement (counsel's, in the legal-surfaces pull request).
 */
export default async function SecurityPage() {
  const { securityEmail, securityTxtPath } = await loadPublicPage(disclosurePage, {});
  const address = (
    <a className="underline" href={`mailto:${securityEmail}`}>
      {securityEmail}
    </a>
  );
  return (
    <>
      <PublicHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:p-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-[2rem] font-bold leading-display tracking-display">Report a security vulnerability</h1>
          <p className="text-base text-muted-foreground">
            If you believe you have found a security problem in PaidWhole, tell us. We read every report, and we would rather hear about a problem from you than from anyone else.
          </p>
        </div>

        <section className="flex flex-col gap-2" aria-labelledby="report">
          <h2 id="report" className="text-xl font-bold tracking-display">
            How to report
          </h2>
          <p className="text-sm">Email {address}. Send one report for each problem, in English.</p>
          <p className="text-sm">
            Send reports only to this address. The support address and the support form are for customers’ accounts, and a report sent there may not reach the people who handle security.
            The same address is in our{' '}
            <a className="underline" href={securityTxtPath}>
              security.txt
            </a>{' '}
            file.
          </p>
          <p className="text-sm">
            This page covers the PaidWhole application at this address. A problem in a service we use, such as our cloud or payment provider, goes to that company; tell us too if it
            affects PaidWhole.
          </p>
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="include">
          <h2 id="include" className="text-xl font-bold tracking-display">
            What to include
          </h2>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            <li>What you found and where: the page or address, the request, and the field or parameter involved.</li>
            <li>The steps that show it, and what you expected to happen instead.</li>
            <li>What someone could do with it, as far as you know.</li>
            <li>How we can reach you with questions.</li>
          </ul>
          <p className="text-sm">
            Never put patient information, a remittance, a contract or anyone else’s data in a report. If you came across any, tell us what kind of data it was and where you saw it,
            not what it said.
          </p>
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="not">
          <h2 id="not" className="text-xl font-bold tracking-display">
            What not to do
          </h2>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            <li>
              Do not open, copy, change or delete data that is not yours. Use only accounts you are entitled to. If you reach another person’s or another practice’s data, stop, keep no
              copy, and tell us at once.
            </li>
            <li>Do not test in ways that slow down or stop the service for others: no denial-of-service, load or volume testing, and no scanning that sends large numbers of requests.</li>
            <li>Do not use social engineering, phishing or physical access against our staff, our customers or our suppliers.</li>
            <li>Do not keep access after you have shown the problem, and do not use it for anything else.</li>
            <li>Do not publish or share the details until the problem is fixed and we have agreed a date with you.</li>
          </ul>
        </section>

        {/* The security official confirms these times before launch: docs/product/legal-surfaces.md, disclosure-response-times. */}
        <section className="flex flex-col gap-2" aria-labelledby="expect" data-legal-surface="disclosure-response-times">
          <h2 id="expect" className="text-xl font-bold tracking-display">
            What you can expect from us
          </h2>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            <li>We confirm that your report has arrived within three business days.</li>
            <li>Within ten business days we tell you whether we can reproduce the problem, how serious we judge it, and what happens next.</li>
            <li>We keep you informed while we fix it, and tell you when it is fixed.</li>
            <li>We agree with you when the details can be published, and aim to fix the problem within 90 days of your report.</li>
            <li>We do not pay rewards for reports.</li>
          </ul>
        </section>

        {/* Needs counsel's review before launch: docs/product/legal-surfaces.md, good-faith-research (the legal-surfaces pull request). */}
        <section className="flex flex-col gap-2" aria-labelledby="good-faith" data-legal-surface="good-faith-research">
          <h2 id="good-faith" className="text-xl font-bold tracking-display">
            Research in good faith
          </h2>
          <p className="text-sm">
            If you make a good-faith effort to follow this page while you look for and report a problem, we consider your research authorized, we will work with you to understand and fix
            the problem, and we will not bring or support legal action against you for it. If someone else brings a claim against you for research that followed this page, we will make
            it known that your research was authorized.
          </p>
          <p className="text-sm">
            This does not authorize access to patient information or to any data that is not yours, and it does not cover testing that this page asks you not to do. If you are unsure
            whether something is covered, ask us at {address} before you go on.
          </p>
        </section>

        <p className="text-sm text-muted-foreground">
          Service status:{' '}
          <Link className="underline" href="/status">
            status page
          </Link>
          . Customers:{' '}
          <Link className="underline" href="/sign-in">
            sign in
          </Link>
          .
        </p>
      </main>
    </>
  );
}
