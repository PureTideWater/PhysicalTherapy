'use client';

import { Alert, AlertDescription, AlertTitle, Button } from '@tp/ui';
import { type ReactNode, useActionState } from 'react';

import type { ActionState } from '../lib/http/next';

/**
 * A form posting to a server action, showing what the action refused: the error, each field's
 * problem, and the password policy's unmet rules. On success the action redirects, so a fresh page
 * (with a fresh request key) replaces the form.
 */
export function ActionForm({
  action,
  submit,
  children,
  variant = 'default',
  className,
}: {
  readonly action: (state: ActionState, form: FormData) => Promise<ActionState>;
  /** The button's words; may hold a figure in the mono face (<Money/>). */
  readonly submit: ReactNode;
  readonly children?: ReactNode;
  readonly variant?: 'default' | 'outline' | 'destructive';
  readonly className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className ?? 'flex flex-col gap-4'}>
      {children}
      {state.error === undefined ? null : (
        <Alert variant="destructive" data-state={state.locked === true ? 'locked' : 'error'}>
          <AlertTitle>{state.locked === true ? 'Account locked' : 'Not done'}</AlertTitle>
          <AlertDescription>
            <p>{state.error}</p>
            {state.issues === undefined || state.issues.length === 0 ? null : (
              <ul className="mt-1 list-disc pl-5">
                {state.issues.map((issue) => (
                  <li key={`${issue.field}:${issue.message}`}>
                    {issue.field}: {issue.message}
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
