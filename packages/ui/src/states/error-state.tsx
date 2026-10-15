import type { ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '../components/alert';

export type ErrorStateProps = {
  title: string;
  /** The next step (PRD section 7: every error state has one). */
  nextStep: string;
  /** An opaque reference for support, such as a job or request ID. Never a patient field. */
  reference?: string;
  action?: ReactNode;
  className?: string;
};

export function ErrorState({ title, nextStep, reference, action, className }: ErrorStateProps) {
  return (
    <Alert data-state="error" variant="destructive" className={className}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{nextStep}</p>
        {reference === undefined ? null : <p className="mt-1 font-mono text-xs">Reference: {reference}</p>}
      </AlertDescription>
      {action === undefined ? null : <div className="mt-2">{action}</div>}
    </Alert>
  );
}
