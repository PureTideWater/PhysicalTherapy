import { Alert, AlertDescription, AlertTitle } from '../components/alert';

export type PermissionStateProps = {
  /** The viewer's role, as the product names it ("Viewer", "Analyst"). */
  role: string;
  /** What that role cannot do here (PRD section 7: the permission state explains it). */
  cannot: string;
  /** Who can grant access or do it instead. */
  nextStep: string;
  className?: string;
};

export function PermissionState({ role, cannot, nextStep, className }: PermissionStateProps) {
  return (
    <Alert data-state="permission" role="note" className={className}>
      <AlertTitle>Not available to your role</AlertTitle>
      <AlertDescription>
        <p>
          As {role}, you cannot {cannot}.
        </p>
        <p className="mt-1">{nextStep}</p>
      </AlertDescription>
    </Alert>
  );
}
