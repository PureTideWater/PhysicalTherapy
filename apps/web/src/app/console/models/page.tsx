import { Alert, AlertDescription, AlertTitle, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import { formatUsd, parseCents } from '@tp/money';
import type { Metadata } from 'next';

import { ActionForm } from '../../../components/action-form';
import { Field, SelectField } from '../../../components/field';
import { FormKeys } from '../../../components/form-keys';
import { ScrollTable } from '../../../components/scroll-table';
import { AppShell, Forbidden } from '../../../components/shell';
import { loadPage } from '../../../lib/http/next';
import { MODEL_VALUE_HINT, MODEL_VALUE_LENGTH, consoleModelsPage } from '../../../lib/routes/console-models';
import { setModelFlagAction } from './actions';

export const metadata: Metadata = { title: 'Model features' };

const usd = (cents: string) => formatUsd(parseCents(cents));

/**
 * The model features' switches and today's spend (docs/adr/0055): the kill switch for everyone, an organization or a
 * practice; each practice's daily budget; the v1.5 letter reader, which stays off; and each active practice's model
 * calls and cost today against its budget. Amounts and counts only; no call, input or output is shown.
 */
export default async function ConsoleModelsPage(props: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await loadPage(consoleModelsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="console_models" roles={page.roles} message={page.message} nextStep="Model features are switched by platform administrators." />;
  }
  const { day, notice, modelPath, defaultBudgetCents, flags, spend, keys, targets } = page.data;
  const globalKill = flags.find((flag) => flag.key === 'model.kill_switch' && flag.scope === 'global')?.value === 'On';
  return (
    <AppShell shell={page.shell} section="console_models">
      <h1 className="text-[2rem] font-bold leading-display tracking-display">Model features</h1>
      {notice === 'set' ? (
        <Alert data-notice="flag_set">
          <AlertTitle>The flag is set</AlertTitle>
          <AlertDescription>Every server reads it on the next call; the screens offer hand entry wherever it turns a feature off.</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Model path</CardTitle>
          <CardDescription>The model this environment calls, set by its configuration.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm" data-model-path={modelPath.available ? 'available' : 'unavailable'}>
          {modelPath.available ? (
            <p>A model path is configured{modelPath.production ? ' for production' : ' (outside production it reads synthetic material only)'}.</p>
          ) : (
            <p>No model path is configured, so every model feature is off and the screens offer hand entry: {modelPath.reason}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Kill switch</CardTitle>
          <CardDescription>On, it turns every model feature off for everyone; the product keeps working on hand-entered records.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm" data-kill-switch={globalKill ? 'on' : 'off'}>
            For everyone, the kill switch is {globalKill ? 'on' : 'off'}.
          </p>
          <ActionForm action={setModelFlagAction} submit={globalKill ? 'Turn model features back on for everyone' : 'Turn every model feature off for everyone'} variant={globalKill ? 'default' : 'destructive'}>
            <FormKeys />
            <input type="hidden" name="key" value="model.kill_switch" />
            <input type="hidden" name="target" value="global" />
            <input type="hidden" name="value" value={globalKill ? 'off' : 'on'} />
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Set a flag</CardTitle>
          <CardDescription>
            For everyone, an organization or a practice. A kill switch in reach of a practice turns its features off; for the budget and the letter reader the most specific setting wins. With no
            budget set, a practice may spend <span className="font-mono tabular-nums">{usd(defaultBudgetCents)}</span> a day.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={setModelFlagAction} submit="Set the flag" className="grid max-w-2xl gap-4" labels={{ key: 'Flag', target: 'Applies to', value: 'Value' }}>
            <FormKeys />
            <SelectField label="Flag" name="key" options={keys} />
            <SelectField label="Applies to" name="target" options={targets} />
            <Field label="Value" name="value" required maxLength={MODEL_VALUE_LENGTH} hint={MODEL_VALUE_HINT} />
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Flags set</CardTitle>
        </CardHeader>
        <CardContent>
          {flags.length === 0 ? (
            <p className="text-sm text-muted-foreground">No model flag is set: every feature is on (but the letter reader), with the default budget.</p>
          ) : (
            <ScrollTable label="Model flags">
              <table className="w-full text-left text-sm" aria-label="Model flags">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Flag</th>
                    <th className="py-1 pr-3 font-medium">Applies to</th>
                    <th className="py-1 font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {flags.map((flag) => (
                    <tr key={`${flag.key}-${flag.scope}-${flag.scopeId ?? 'global'}`} className="border-t">
                      <td className="py-1 pr-3">{keys.find((key) => key.value === flag.key)?.label ?? flag.key}</td>
                      <td className="py-1 pr-3">
                        <span className="block min-w-32 wrap-anywhere">{flag.appliesTo}</span>
                      </td>
                      <td className={flag.key === 'model.daily_budget_cents' ? 'py-1 font-mono tabular-nums' : 'py-1'}>{flag.key === 'model.daily_budget_cents' ? usd(flag.value) : flag.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Spend today against each budget</CardTitle>
          <CardDescription>{day} (UTC): each active practice&apos;s model calls and their cost, against its daily budget. The operator is alerted when a practice reaches its budget.</CardDescription>
        </CardHeader>
        <CardContent>
          {spend.length === 0 ? (
            <p className="text-sm text-muted-foreground">No practice is active.</p>
          ) : (
            <ScrollTable label="Model spend by practice">
              <table className="w-full min-w-[36rem] text-left text-sm" aria-label="Model spend by practice">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Practice</th>
                    <th className="py-1 pr-3 text-right font-medium">Calls</th>
                    <th className="py-1 pr-3 text-right font-medium">Spent</th>
                    <th className="py-1 pr-3 text-right font-medium">Budget</th>
                    <th className="py-1 font-medium">State</th>
                  </tr>
                </thead>
                <tbody>
                  {spend.map((row) => (
                    <tr key={row.practiceId} className="border-t" data-practice-spend={row.practiceId}>
                      <td className="py-1 pr-3">{row.name}</td>
                      <td className="py-1 pr-3 text-right font-mono tabular-nums">{row.calls}</td>
                      <td className="py-1 pr-3 text-right font-mono tabular-nums">{usd(row.spentCents)}</td>
                      <td className="py-1 pr-3 text-right font-mono tabular-nums">{usd(row.budgetCents)}</td>
                      <td className="py-1">
                        {row.killSwitch ? (
                          <Badge variant="destructive">Switched off</Badge>
                        ) : row.percent !== null && row.percent >= 100 ? (
                          <Badge variant="destructive">Budget spent</Badge>
                        ) : (
                          <Badge variant="outline">{row.percent === null ? 'No budget' : `${String(row.percent)}% spent`}</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
