import { EmptyState } from '@tp/ui';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sign in' };

/**
 * Sign-in and MFA (PRD section 7). Cognito with mandatory MFA arrives with milestone 1; this page
 * sits outside the workspace shell.
 */
export default function SignInPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-10">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <EmptyState
        title="Sign-in is not available yet"
        nextStep="Email and password with mandatory MFA enrollment will be offered here. Internal roles will need a hardware key."
      />
    </main>
  );
}
