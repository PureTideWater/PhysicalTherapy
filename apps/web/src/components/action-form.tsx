'use client';

import { Alert, AlertDescription, AlertTitle, Button } from '@tp/ui';
import { type ReactNode, useActionState, useEffect, useId, useRef } from 'react';

import type { ActionState } from '../lib/http/next';

/**
 * A form posting to a server action, showing what the action refused: the error, each field's
 * problem, and the password policy's unmet rules. On success the action redirects, so a fresh page
 * (with a fresh request key) replaces the form. A field's problem is named by the field's label (`labels`; its key
 * where none is given), and the control it names is marked invalid and described by it; the focus, which the
 * disabled button dropped while the request was pending, moves to the first such control, or to the summary.
 */
export function ActionForm({
  action,
  submit,
  children,
  variant = 'default',
  className,
  labels = {},
}: {
  readonly action: (state: ActionState, form: FormData) => Promise<ActionState>;
  /** The button's words; may hold a figure in the mono face (<Money/>). */
  readonly submit: ReactNode;
  readonly children?: ReactNode;
  readonly variant?: 'default' | 'outline' | 'destructive';
  readonly className?: string;
  /** The label of each field a refusal may name, by its key, as the form shows it. */
  readonly labels?: Readonly<Record<string, string>>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const issueId = useId();
  useEffect(() => {
    const form = formRef.current;
    if (form === null || state.error === undefined) {
      return undefined;
    }
    const marked: { readonly control: HTMLElement; readonly describedBy: string | null }[] = [];
    (state.issues ?? []).forEach((issue, index) => {
      const control = form.elements.namedItem(issue.field);
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) || control.type === 'hidden') {
        return;
      }
      const describedBy = control.getAttribute('aria-describedby');
      marked.push({ control, describedBy });
      control.setAttribute('aria-invalid', 'true');
      control.setAttribute('aria-describedby', [`${issueId}-${String(index)}`, describedBy].filter((part) => part !== null && part !== '').join(' '));
    });
    (marked[0]?.control ?? summaryRef.current)?.focus();
    return () => {
      for (const { control, describedBy } of marked) {
        control.removeAttribute('aria-invalid');
        if (describedBy === null) {
          control.removeAttribute('aria-describedby');
        } else {
          control.setAttribute('aria-describedby', describedBy);
        }
      }
    };
  }, [state, issueId]);
  return (
    <form ref={formRef} action={formAction} className={className ?? 'flex flex-col gap-4'}>
      {children}
      {state.error === undefined ? null : (
        <Alert variant="destructive" data-state={state.locked === true ? 'locked' : 'error'} ref={summaryRef} tabIndex={-1}>
          <AlertTitle>{state.locked === true ? 'Account locked' : 'Not done'}</AlertTitle>
          <AlertDescription>
            <p>{state.error}</p>
            {state.issues === undefined || state.issues.length === 0 ? null : (
              <ul className="mt-1 list-disc pl-5">
                {state.issues.map((issue, index) => (
                  <li key={`${issue.field}:${issue.message}`} id={`${issueId}-${String(index)}`}>
                    {labels[issue.field] ?? issue.field}: {issue.message}
                  </li>
                ))}
              </ul>
            )}
            {state.problems === undefined ? null : <p className="mt-1">It needs {state.problems.join(', ')}.</p>}
          </AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" variant={variant} disabled={pending}>
          {pending ? 'Working…' : submit}
        </Button>
      </div>
    </form>
  );
}
