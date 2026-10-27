'use client';

import { Button, Input, Label } from '@tp/ui';
import { type ComponentProps, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

import { controlMarks, Hint } from './field';
import { EmptiedNote, FieldError, useEmptied, useFieldIssue } from './form-issues';

/** Nothing to subscribe to: whether the page has JavaScript never changes once it runs. */
function noSubscription(): () => void {
  return () => undefined;
}

/**
 * A password with Show (NIST SP 800-63B 5.1.1.2; docs/adr/0077, D8): Field's markup, a secret its form empties after a
 * refusal (data-secret), uncontrolled so nothing writes the value back. Shown or not, the input turns off spell
 * checking, autocorrect and autocapitalisation, so a browser's cloud spelling service never reads a shown password.
 * The component holds these itself: its props type leaves them out (with `type` and `ref`), and they are written after
 * the caller's props, so not even a cast turns the spelling service back on, drops the secret mark or the type, or
 * replaces the ref the submit-time hide needs.
 *
 * The toggle is named by its own words, "Show" and `showName` in a visually hidden span ("Show new password"), never
 * an aria-label, so a label search for the field finds one element. It is hidden until mounted (without JavaScript it
 * would be a dead button). Before the form's data is read, a capture-phase submit listener hides the password again
 * through this component's state, so the input's type and the toggle's aria-pressed always agree, and a password
 * manager sees a password field when the form submits.
 */
export function PasswordField({
  label,
  name,
  showName,
  hint,
  error,
  errorName,
  issueFor,
  id: given,
  ...props
}: {
  readonly label: string;
  readonly name: string;
  /** The rest of the toggle's name after "Show", with its leading space: " password", " new password again". */
  readonly showName: string;
  readonly hint?: string;
  readonly error?: string;
  readonly errorName?: string;
  readonly issueFor?: readonly string[];
  readonly id?: string;
} & Omit<ComponentProps<'input'>, 'type' | 'spellCheck' | 'autoCorrect' | 'autoCapitalize' | 'ref'>) {
  const id = given ?? `field-${name}`;
  const shown = useFieldIssue(name, issueFor);
  const message = error ?? shown;
  const emptied = useEmptied('password');
  const [visible, setVisible] = useState(false);
  // False in the server's markup and during hydration, true once the browser renders: the toggle is hidden until then.
  const scripted = useSyncExternalStore(noSubscription, () => true, () => false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = inputRef.current?.form ?? null;
    if (form === null) {
      return undefined;
    }
    const hide = () => {
      flushSync(() => {
        setVisible(false);
      });
    };
    form.addEventListener('submit', hide, { capture: true });
    return () => {
      form.removeEventListener('submit', hide, { capture: true });
    };
  }, []);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex min-w-0 items-center gap-2">
        <Input
          id={id}
          name={name}
          {...controlMarks(id, { error: message, hint, emptied, errorName, issueFor })}
          {...props}
          ref={inputRef}
          type={visible ? 'text' : 'password'}
          data-secret=""
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="none"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={visible}
          aria-controls={id}
          hidden={!scripted}
          onClick={() => {
            setVisible((now) => !now);
          }}
        >
          Show<span className="sr-only">{showName}</span>
        </Button>
      </div>
      <FieldError id={id} error={message} />
      <EmptiedNote id={id} secret="password" />
      <Hint id={id} hint={hint} />
    </div>
  );
}
