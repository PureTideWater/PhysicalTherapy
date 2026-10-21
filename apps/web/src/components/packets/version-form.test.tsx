import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { VersionForm } from './version-form';

/**
 * The version form's buttons (the best-option audit's item #61; the verification's nit of 2026-10-20): the buttons the
 * form's write action routes carry name="intent" and their intent; the model's draft, sent to its own action by a
 * function formAction, carries no name or value of its own, since React names such a button for its action.
 */

const noAction = () => Promise.resolve({});

function rendered(): string {
  return renderToStaticMarkup(
    <VersionForm
      writeAction={noAction}
      modelAction={noAction}
      keys={null}
      practiceId="0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b01"
      caseId="0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b02"
      basedOnVersionId={null}
      promptPay={{ states: [], selected: '' }}
      attachable={[]}
      narrative={null}
      submits={[
        { intent: 'save', label: 'Save as a new version' },
        { intent: 'code_draft', label: 'Write a new version from the code-built draft', variant: 'outline' },
      ]}
      model={{ heading: 'The model’s draft', description: 'SYNTHETIC', submit: { intent: 'model_draft', label: 'Draft with the model', variant: 'outline' }, unavailable: null }}
    />,
  );
}

/** Each submit button's opening tag, by its label. */
function buttons(markup: string): ReadonlyMap<string, string> {
  return new Map([...markup.matchAll(/(<button[^>]*>)([^<]*)<\/button>/g)].map((match) => [match[2] ?? '', match[1] ?? '']));
}

describe('the version form’s submit buttons', () => {
  it('name the intent of the buttons the write action routes, and give the model’s draft no name beside its formAction', () => {
    const found = buttons(rendered());
    expect(found.get('Save as a new version')).toMatch(/name="intent"/);
    expect(found.get('Save as a new version')).toMatch(/value="save"/);
    expect(found.get('Write a new version from the code-built draft')).toMatch(/value="code_draft"/);
    const model = found.get('Draft with the model');
    expect(model).toBeDefined();
    expect(model).not.toMatch(/name="intent"/);
    expect(model).not.toMatch(/value="model_draft"/);
  });
});
