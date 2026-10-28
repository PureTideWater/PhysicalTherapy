import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';

import { ActionForm } from '../../../components/action-form';
import { PasswordField } from '../../../components/password-field';
import { PASSWORD_MIN_LENGTH } from '../../../lib/auth/password';
import { loadPublicPage } from '../../../lib/http/next';
import { newPasswordPage } from '../../../lib/routes/sign-in';
import { newPasswordStep } from '../actions';

export const metadata: Metadata = { title: 'Choose a password' };

export default async function NewPasswordPage() {
  const { email } = await loadPublicPage(newPasswordPage, {});
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-6 pb-10 sm:px-6">
      <h1 className="text-[2rem] font-bold leading-display tracking-display">Choose a password</h1>
      <Card>
        <CardHeader>
          <CardTitle>{email}</CardTitle>
          <CardDescription>Your invitation to PaidWhole came with a temporary password. Choose your own.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={newPasswordStep} submit="Save password">
            <PasswordField
              label="New password"
              name="password"
              showName=" new password"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters, with a lowercase letter, an uppercase letter, a digit and a symbol.`}
            />
            <PasswordField label="New password again" name="confirm" showName=" new password again" autoComplete="new-password" required />
          </ActionForm>
        </CardContent>
      </Card>
    </main>
  );
}
