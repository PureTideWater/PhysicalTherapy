import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { ActionState } from '../../lib/http/next';
import { PROSPECT_SOURCE_OPTIONS } from '../../lib/routes/onboarding';
import { ABOUT_PRACTICE, UPLOAD_EMAIL_HINT } from '../../lib/screening/retention';
import { FILE_MESSAGES, NO_FILE_CHOSEN, SCREENING_BOUNCE_BUDGET, SCREENING_PAUSED } from '../../lib/screening/messages';
import { FormIssues, type FormState, RefusalSummary } from '../form-issues';
import { NO_SCRIPT, ScreeningUploadForm, ZIP_HINT, refusalSentence } from './upload-form';

/**
 * The screening's upload form as the server renders it (CO-04; decisions D18 a, D20 a and D21 a): the file is read in
 * the browser, so its input has no name and no submission can carry it; the ZIP code field takes five digits or ZIP+4,
 * asked for only where Medicare splits the ZIP code (PR 6b; docs/adr/0064); the contact's email is where the link goes; and it says, in plain words, that a row of fewer than 11 claim
 * lines is left out and that denied lines stay out of every total (the founder's rulings of 2026-10-18); and, from the
 * founder's rulings of 2026-10-20 (audit #57), it asks how the practice heard of us and which firm referred it, both
 * optional, and says what is deleted and what is kept. SYNTHETIC values.
 */

const action = (state: ActionState): Promise<ActionState> => Promise.resolve(state);

describe('the screening upload form', () => {
  const html = renderToStaticMarkup(
    <ScreeningUploadForm
      action={action}
      states={[{ value: 'MN', label: 'MN' }]}
      maxRows={50_000}
      minClaimLines={11}
      serverTime="2026-10-18T12:00:00.000Z"
      contentQuarters={[{ from: '2026-Q1', to: '2026-Q4' }]}
      sources={PROSPECT_SOURCE_OPTIONS}
      appOrigin="https://app.synthetic.test"
    />,
  );
  const plain = html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  it('reads the file in the browser: its input has no name, so no submission carries it', () => {
    const file = /<input[^>]*type="file"[^>]*>/.exec(html)?.[0] ?? '';
    expect(file).toContain('id="screening-file"');
    expect(file).not.toContain('name=');
    expect(html).toContain('<label data-slot="label" class');
    expect(html).toContain('for="screening-file"');
    // Without JavaScript the form posts its fields to the page itself, which ignores them; the file input has no name,
    // so the file is never sent. With it, the browser screens the file and builds the request. Never a GET, which would
    // put the email address and the practice's name in the address bar, the access logs and the referrer.
    expect(html).not.toMatch(/<form[^>]*\baction=/);
    expect(html).toMatch(/<form[^>]*\bmethod="post"/);
    expect(html).not.toContain('enctype="multipart/form-data"');
  });

  it('says, without JavaScript, that screening needs it, in the card’s own words, above the first card', () => {
    expect(NO_SCRIPT).toBe(
      'Screening a file needs JavaScript, because the file is read in this browser and never uploaded: only its rows of totals are sent. Turn JavaScript on before you fill in the form.',
    );
    expect(html).toMatch(new RegExp(`<noscript><p data-slot="no-javascript" class="[^"]*">${NO_SCRIPT}</p></noscript>`));
    expect(html.indexOf('<noscript>')).toBeLessThan(html.indexOf('About your practice'));
    expect(plain).toContain('It is read in this browser and never uploaded: only its rows of totals are sent');
  });

  it('keeps the button’s words and never disables it: a press while the file is read waits for it, and the status beside it says “Working…” once pressed', () => {
    const button = /<button[^>]*type="submit"[^>]*>[^<]*<\/button>/.exec(html)?.[0] ?? '';
    expect(button).toContain('>Screen the file</button>');
    expect(button).not.toMatch(/\s(?:aria-)?disabled=/);
    expect(button).not.toContain('aria-describedby');
    expect(html).toContain('<p role="status" class="text-sm text-muted-foreground" data-slot="pending-status"></p>');
    expect(plain).not.toContain('Sending…');
  });

  it('names its field messages as one lower-case sentence, and its “Not sent” list sentences apart (FILE_MESSAGES)', () => {
    expect(NO_FILE_CHOSEN).toBe('choose the file to screen');
    expect('noFile' in FILE_MESSAGES).toBe(false);
    expect(FILE_MESSAGES.unreadable).toBe('This browser could not read the file. Choose it again.');
  });

  it('asks who the screening is for, and where its link is emailed, with one ZIP code field that takes ZIP+4 (PR 6b)', () => {
    for (const name of ['practiceName', 'state', 'zip', 'contactEmail']) {
      expect(html).toContain(`name="${name}"`);
    }
    expect(html).not.toContain('name="zipPlusFour"');
    const zip = /<input[^>]*name="zip"[^>]*>/.exec(html)?.[0] ?? '';
    expect(zip).toContain('maxLength="10"');
    expect(zip).toContain('pattern="[0-9]{5}(-?[0-9]{4})?"');
    expect(zip).toContain('aria-describedby="field-zip-hint"');
    expect(ZIP_HINT).toBe('Five digits, or ZIP+4 if you know it. A few ZIP codes span more than one Medicare payment area; for those we ask for the ZIP+4.');
    expect(plain).toContain(ZIP_HINT);
    // Which quarters' Medicare rows are screened, before a file is chosen (Q6 (a)).
    expect(plain).toContain('Medicare rows of 2026-Q1 to 2026-Q4 are screened; rows of other quarters are left out and counted.');
    // What the page says of a chosen file is announced: its live region is there before any file is.
    expect(html).toContain('<div role="status" data-slot="file-status"></div>');
    expect(plain).not.toContain('cannot be screened yet');
    // One screening a practice: a later one replaces it, so two are never held to be subtracted.
    expect(html).toContain('A practice keeps one screening at a time: a later one for the same practice name and ZIP code, or from the same email address, replaces it, and the earlier link stops opening it.');
    expect(html).toContain('<option value="">Choose a state</option>');
    expect(html).toContain('<option value="MN">MN</option>');
    expect(html).toContain('50,000 rows');
  });

  it('asks, both optional, how the practice heard of us (the closed list) and which firm referred it, and says what is deleted and what is kept (audit #57)', () => {
    expect(html).toMatch(/<select id="field-heardFrom" name="heardFrom" class/);
    expect(html).not.toMatch(/<select[^>]*name="heardFrom"[^>]*required/);
    expect(html).toContain('<option value="">Choose one (optional)</option>');
    expect(html).toContain('<option value="billing_firm">My billing firm</option>');
    expect(html).toContain('<option value="association">A professional association (APTA, AOTA, ASHA or a state chapter)</option>');
    expect(html.match(/<option value="[a-z_]+">/g)?.length).toBe(9);
    const firm = /<input[^>]*name="referringFirm"[^>]*>/.exec(html)?.[0] ?? '';
    expect(firm).toContain('maxLength="200"');
    expect(firm).not.toContain('required');
    expect(plain).toContain(UPLOAD_EMAIL_HINT);
    expect(UPLOAD_EMAIL_HINT).toContain('keep a record of counts that names no one');
    // What happens if the practice has, or asks for, an audit, without saying whether it has (decision 17).
    expect(UPLOAD_EMAIL_HINT).toContain('If an audit is requested from the screening, or was requested from an earlier screening with the same practice name and ZIP code');
    // The mail service's record of the address check outlives the deletion the hint states (the review of 2026-10-27).
    expect(UPLOAD_EMAIL_HINT).toContain('The mail service that checks whether the address can receive email keeps a record of that check, which can name the address, for 90 days.');
    expect(plain).toContain(ABOUT_PRACTICE);
  });

  it('says what it refuses and offers the template, never words a screening does not use', () => {
    expect(html).toContain('No names, dates of birth, member IDs, dates of service or claim numbers');
    expect(html).toContain('Download the column template');
    expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(/\b(?:owed|under-?paid|recovered)\b/i);
  });

  it('says, in plain words, that a row of fewer than 11 claim lines is left out, that denied lines stay out of every total, and that the template’s first lines say so', () => {
    const text = html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(text).toContain('a row of fewer than 11 claim lines is left out, because it can describe one patient’s care');
    // The form says the risk the floor answers, never that no row can describe one patient.
    expect(text).not.toMatch(/no row can describe|no row could describe/);
    expect(text).toContain('The template’s first lines state its rules: each row sums at least 11 claim lines, and denied lines are left out of every total and claim count.');
    expect(text).toContain('this page skips them, so you can keep them');
    // The template's and the file's hints are the shared Hint, 14 px, and the Download button names the template's.
    expect(html).toMatch(/<button[^>]*aria-describedby="screening-template-hint"[^>]*>Download the column template<\/button>/);
    expect(html).toContain('<p id="screening-template-hint" class="text-sm text-muted-foreground">');
    expect(html).toContain('<p id="screening-file-hint" class="text-sm text-muted-foreground">');
    expect(html).not.toContain('text-xs');
    const file = /<input[^>]*type="file"[^>]*>/.exec(html)?.[0] ?? '';
    expect(file).toContain('aria-describedby="screening-file-hint"');
    expect(file).toContain('data-issue-for="upload"');
    expect(file).not.toContain('aria-invalid');
  });
});

describe('the upload’s refusal, on the shared summary', () => {
  // The summary as the server renders it, before the page places its issues (a regression pin: the browser cases are in
  // action-form.browser.test.tsx). The form's audit link reaches a form-wide item only, through renderMessage.
  const render = (state: ActionState) =>
    renderToStaticMarkup(
      <FormIssues state={state}>
        <form>
          <RefusalSummary state={state} fromBrowser submit="Screen the file" formRef={createRef<HTMLFormElement>()} renderMessage={refusalSentence} />
        </form>
      </FormIssues>,
    );
  const words = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, '');
  const LEAD = 'Fix the fields listed here, then try again.';

  it('says a refusal of the form as a whole as its own text, names no field it does not mark, and links the audit request it offers (the review of 2026-10-27)', () => {
    for (const message of [SCREENING_PAUSED.refusal, SCREENING_BOUNCE_BUDGET]) {
      const html = render({ error: LEAD, invalid: true, issues: [{ field: 'input', message }] });
      expect(words(html)).toBe(`Not done${message}`);
      expect(html).not.toContain(LEAD);
      expect(html).not.toContain('Form:');
      expect(html).toContain('<a class="underline" href="/request-audit">request an audit</a>');
      expect(html).toContain('role="alert"');
      expect(html).toContain('tabindex="-1"');
    }
    // A sentence with no audit request, its first letter capitalized; the words are the server's.
    expect(words(render({ error: LEAD, invalid: true, issues: [{ field: 'input', message: 'screening is not open yet; try again later' }] }))).toBe(
      'Not doneScreening is not open yet; try again later',
    );
  });

  it('leads a refusal of one field in the singular, and never rewrites a field’s message into a link', () => {
    const html = render({ error: LEAD, invalid: true, issues: [{ field: 'zip', message: 'this ZIP code is not in the Medicare locality map in force; check it, or request an audit' }] });
    expect(words(html)).toBe('Not doneFix the field listed here, then try again.This ZIP code is not in the Medicare locality map in force; check it, or request an audit');
    expect(html).not.toContain('href="/request-audit"');
    expect(render({})).toBe('<form></form>');
  });

  it('leads a dropped connection with the shared words, and says a press again may send a second email whose link alone opens', () => {
    // The mails-again clause holds in both of routes.db.test.ts's re-send cases: before the first is priced, one result
    // mail and its link opens (the condition is false, so no second email is promised); after the first is priced and
    // mailed, RESEND_LATE_MAILS (two) and only the newer link opens.
    const unconfirmed: FormState = { unconfirmed: true };
    const summary = (props: { readonly unconfirmed?: 'mails-again' }) =>
      words(
        renderToStaticMarkup(
          <FormIssues state={unconfirmed}>
            <form>
              <RefusalSummary state={unconfirmed} fromBrowser submit="Screen the file" formRef={createRef<HTMLFormElement>()} {...props} />
            </form>
          </FormIssues>,
        ),
      );
    expect(summary({ unconfirmed: 'mails-again' })).toBe(
      'Not confirmedThe connection to PaidWhole dropped before an answer came back. What you typed is still here: check your connection, then press “Screen the file” again. If PaidWhole has already emailed you the result, a second email follows, and only that newer email’s link opens the screening.',
    );
    // Every other form keeps the shared lead.
    expect(summary({})).toBe(
      'Not confirmedThe connection to PaidWhole dropped before an answer came back. What you typed is still here: check your connection, then press “Screen the file” again.',
    );
  });

  it('leads a page that failed the origin check with the app’s own web address, never a refresh, and never “address” alone', () => {
    const stale: ActionState = { error: 'This page was out of date, so nothing was saved. Reload the page and try again.', stale: true };
    const origin = (appOrigin?: string) =>
      renderToStaticMarkup(
        <FormIssues state={stale}>
          <form>
            <RefusalSummary state={stale} fromBrowser submit="Screen the file" formRef={createRef<HTMLFormElement>()} stale="origin" {...(appOrigin === undefined ? {} : { appOrigin })} />
          </form>
        </FormIssues>,
      );
    const named = origin('https://app.synthetic.test');
    expect(words(named)).toBe(
      'Not donePaidWhole could not confirm that this page came from PaidWhole’s own web address (for example, a translated or saved copy cannot send a file), so nothing was sent. Open https://app.synthetic.test/screening, fill in the form again, then screen the file.',
    );
    expect(named).toContain('<a href="https://app.synthetic.test/screening" class="font-mono underline underline-offset-2">https://app.synthetic.test/screening</a>');
    const unnamed = origin();
    expect(words(unnamed)).toBe(
      'Not donePaidWhole could not confirm that this page came from PaidWhole’s own web address (for example, a translated or saved copy cannot send a file), so nothing was sent. Open the screening page at PaidWhole’s own web address, fill in the form again, then screen the file.',
    );
    expect(unnamed).not.toContain('<a ');
    for (const text of [words(named), words(unnamed)]) {
      // The page says "address" of the work email: the lead says only "web address".
      expect(text.match(/address/g)?.length).toBe(text.match(/web address/g)?.length);
      expect(text).not.toMatch(/up to date|Reload|press “/);
    }
  });
});
