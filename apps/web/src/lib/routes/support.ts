import {
  STATUS_COMPONENT_KEYS,
  STATUS_COMPONENT_STATUSES,
  STATUS_INCIDENT_IMPACTS,
  STATUS_INCIDENT_STATUSES,
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_STATUSES,
  type StatusComponentKey,
  type StatusComponentStatus,
  type StatusIncidentImpact,
  type StatusIncidentStatus,
  type SupportTicketCategory,
  type SupportTicketStatus,
} from '@tp/db/runtime';
import { writtenPhiFindings } from '@tp/observability';
import { z } from 'zod';

import { forgetMaintenanceFlag, platformRoute, publicRoute, selfRoute } from '../http/invoke';
import { InputError, type MutationResult, NotFoundError } from '../http/route';
import { blankOptional, opaqueId, optionalText, requiredText } from './schemas';

/**
 * Support, the status page and maintenance (PRD 19, Support: "In-app help per screen; a support address that
 * creates a ticket; a published response target of one business day, four hours in April to June"; milestone 11:
 * error pages, status page; docs/adr/0053):
 *
 * - /status: public, no PHI: each component's status and the incidents open or resolved in the last fortnight,
 *   from public_status_*() (names and texts staff wrote, never who wrote them).
 * - /maintenance: public, where every customer route sends the browser while platform.maintenance is on.
 * - /support: any signed-in user opens a ticket from the screen they were on (its help link names it); the text is
 *   screened for identifier shapes, because a ticket is not a place for PHI (the desk opens a support grant when a
 *   practice's records are needed). The support address is shown beside the form: what is sent there the desk
 *   records as a ticket here.
 * - /console/tickets: the desk's queue (support_ticket.work), and its status changes.
 * - /console/status: platform administrators set components, open and update incidents, and turn maintenance on and
 *   off (status.manage; the flag through set_feature_flag(), feature_flag.manage).
 */

/** The response target the plan publishes (PRD 19, Support). */
export const RESPONSE_TARGET = 'one business day, four hours in April to June';

export const STATUS_LABELS: Readonly<Record<StatusComponentStatus, string>> = {
  operational: 'Operational',
  degraded: 'Degraded performance',
  partial_outage: 'Partial outage',
  major_outage: 'Major outage',
  maintenance: 'Under maintenance',
};

export const INCIDENT_STATUS_LABELS: Readonly<Record<StatusIncidentStatus, string>> = {
  investigating: 'Investigating',
  identified: 'Identified',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
};

export const CATEGORY_LABELS: Readonly<Record<SupportTicketCategory, string>> = {
  question: 'A question',
  problem: 'Something is not working',
  access: 'Access or sign-in',
  billing: 'Billing',
  data: 'An upload, a number or a report',
  other: 'Something else',
};

/** The category a ticket opened from a screen starts on: from the billing page (its standing's next step), Billing. */
const CATEGORY_FROM: Readonly<Partial<Record<string, SupportTicketCategory>>> = { billing: 'billing' };

/** How far back resolved incidents stay on the status page. */
const RESOLVED_DAYS = 14;

export interface StatusComponentView {
  readonly key: StatusComponentKey;
  readonly name: string;
  readonly status: StatusComponentStatus;
  readonly changedAt: Date | null;
}

export interface StatusIncidentView {
  readonly id: string;
  readonly title: string;
  readonly impact: StatusIncidentImpact;
  readonly components: readonly StatusComponentKey[];
  readonly status: StatusIncidentStatus;
  readonly startedAt: Date;
  readonly resolvedAt: Date | null;
  readonly updates: readonly { readonly status: StatusIncidentStatus; readonly message: string; readonly postedAt: Date }[];
}

export interface StatusPageData {
  readonly components: readonly StatusComponentView[];
  readonly incidents: readonly StatusIncidentView[];
  readonly maintenance: boolean;
  readonly overall: StatusComponentStatus;
  readonly supportEmail: string;
}

interface Queryable {
  query<T extends object>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

const SEVERITY: readonly StatusComponentStatus[] = ['operational', 'maintenance', 'degraded', 'partial_outage', 'major_outage'];

/** The worst status any component has: what the page's headline says. */
export function overallStatus(components: readonly { readonly status: StatusComponentStatus }[]): StatusComponentStatus {
  return components.reduce<StatusComponentStatus>((worst, component) => (SEVERITY.indexOf(component.status) > SEVERITY.indexOf(worst) ? component.status : worst), 'operational');
}

async function readStatus(client: Queryable, now: Date): Promise<Omit<StatusPageData, 'supportEmail'>> {
  const components = await client.query<{ key: StatusComponentKey; name: string; status: StatusComponentStatus; changed_at: Date | null }>('SELECT key, name, status, changed_at FROM public_status_components()');
  const incidents = await client.query<{
    incident_id: string;
    title: string;
    impact: StatusIncidentImpact;
    components: StatusComponentKey[];
    status: StatusIncidentStatus;
    started_at: Date;
    resolved_at: Date | null;
    updates: { status: StatusIncidentStatus; message: string; posted_at: string }[];
  }>('SELECT * FROM public_status_incidents($1)', [new Date(now.getTime() - RESOLVED_DAYS * 86_400_000)]);
  const maintenance = (await client.query<{ on: boolean }>('SELECT maintenance_on() AS on')).rows[0]?.on === true;
  const views = components.rows.map((row) => ({ key: row.key, name: row.name, status: row.status, changedAt: row.changed_at }));
  return {
    components: views,
    incidents: incidents.rows.map((row) => ({
      id: row.incident_id,
      title: row.title,
      impact: row.impact,
      components: row.components,
      status: row.status,
      startedAt: row.started_at,
      resolvedAt: row.resolved_at,
      updates: row.updates.map((update) => ({ status: update.status, message: update.message, postedAt: new Date(update.posted_at) })),
    })),
    maintenance,
    overall: maintenance ? 'maintenance' : overallStatus(views),
  };
}

export const statusPage = publicRoute({
  id: 'public.status',
  kind: 'page',
  path: '/status',
  phi: false,
  params: z.object({}),
  handle: async ({ services }): Promise<StatusPageData> => {
    const client = await services.pool.connect();
    try {
      return { ...(await readStatus(client, services.now())), supportEmail: services.supportEmail };
    } finally {
      client.release();
    }
  },
  sample: { params: () => ({}) },
});

export const maintenancePage = publicRoute({
  id: 'public.maintenance',
  kind: 'page',
  path: '/maintenance',
  phi: false,
  params: z.object({}),
  handle: async ({ services }) => {
    const client = await services.pool.connect();
    try {
      const on = (await client.query<{ on: boolean }>('SELECT maintenance_on() AS on')).rows[0]?.on === true;
      return { maintenance: on, supportEmail: services.supportEmail };
    } finally {
      client.release();
    }
  },
  sample: { params: () => ({}) },
});

/**
 * The load balancer's health check (docs/adr/0049 and 0055): one round trip to the database on the pool every
 * request uses. A task whose pool is starved, or that cannot reach the database, fails it within the pool's
 * connection timeout and is replaced; /sign-in, the check before, touched no database and stayed healthy.
 */
export const healthCheck = publicRoute({
  id: 'public.health',
  kind: 'handler',
  path: '/api/health',
  phi: false,
  params: z.object({}),
  handle: async ({ services }) => {
    const client = await services.pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
    return { status: 'ok' as const };
  },
  sample: { params: () => ({}) },
});

/** A screen's key, as the help link names it (a ShellSection, or another screen's own key). */
const screenKey = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, 'a screen');

export interface TicketView {
  readonly id: string;
  readonly number: number;
  readonly screen: string;
  readonly category: SupportTicketCategory;
  readonly subject: string;
  readonly status: SupportTicketStatus;
  readonly createdAt: Date;
}

export const supportRequestPage = selfRoute({
  id: 'support.page',
  kind: 'page',
  path: '/support',
  phi: false,
  termsExempt: true,
  params: z.object({ from: optionalText(screenKey).catch(undefined), sent: blankOptional(z.coerce.number().int().min(1)).catch(undefined) }),
  handle: async ({ scope, params, services }) => {
    const { rows } = await scope.client.query<{ id: string; number: string; screen: string; category: SupportTicketCategory; subject: string; status: SupportTicketStatus; created_at: Date }>(
      'SELECT id, number, screen, category, subject, status, created_at FROM support_ticket WHERE requester_id = app_actor_id() ORDER BY created_at DESC, id LIMIT 20',
    );
    return {
      from: params.from ?? 'home',
      category: (params.from === undefined ? undefined : CATEGORY_FROM[params.from]) ?? null,
      sent: params.sent ?? null,
      supportEmail: services.supportEmail,
      responseTarget: RESPONSE_TARGET,
      categories: SUPPORT_TICKET_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] })),
      tickets: rows.map((row): TicketView => ({ id: row.id, number: Number(row.number), screen: row.screen, category: row.category, subject: row.subject, status: row.status, createdAt: row.created_at })),
    };
  },
  sample: { params: () => ({ from: 'cases' }) },
});

/**
 * A ticket names no patient (PRD 19: "Support staff never see PHI without a break-glass grant"; docs/adr/0055): the
 * desk reads it with no support grant, so its text is refused when it holds an identifier's shape, a date in words or
 * a birth date, an identifier of letters and digits, or a name after a word that introduces a person. A name written
 * with no such word cannot be told from other words; the form asks for screens and opaque IDs only. Each field that
 * holds one is named at once, so a person who wrote a patient into both fixes both before the next press.
 */
function screened(fields: Readonly<Record<'subject' | 'message', string>>): void {
  const refused = Object.entries(fields).filter(([, text]) => writtenPhiFindings(text).length > 0);
  if (refused.length > 0) {
    throw new InputError(
      refused.map(([field]) => ({
        field,
        message:
          'a ticket takes no patient information: remove names, dates of birth, member IDs, claim numbers, other identifiers and phone numbers, and name the screen and the record’s ID instead',
      })),
    );
  }
}

export const createTicket = selfRoute({
  id: 'support.create_ticket',
  kind: 'action',
  path: '/support',
  phi: false,
  termsExempt: true,
  params: z.object({}),
  input: z.object({
    screen: screenKey,
    category: z.enum(SUPPORT_TICKET_CATEGORIES, { message: 'choose what it is about' }),
    subject: requiredText(200),
    message: requiredText(4000),
  }),
  audit: { action: 'support_ticket_opened', objectType: 'support_ticket' },
  handle: async ({ scope, input }): Promise<MutationResult> => {
    screened({ subject: input.subject, message: input.message });
    const { rows } = await scope.client.query<{ id: string; number: string }>(
      'INSERT INTO support_ticket (requester_id, screen, category, subject, message) VALUES (app_actor_id(), $1, $2, $3, $4) RETURNING id, number',
      [input.screen, input.category, input.subject, input.message],
    );
    const ticket = rows[0];
    if (ticket === undefined) {
      throw new Error('the ticket was not created');
    }
    return { objectId: ticket.id, redirect: `/support?sent=${ticket.number}` };
  },
  sample: { params: () => ({}), input: () => ({ screen: 'cases', category: 'question', subject: 'How do I export a packet?', message: 'Where is the export button on the packet screen?' }) },
});

export interface DeskTicketView extends TicketView {
  readonly requesterEmail: string;
  readonly organizations: readonly string[];
  readonly message: string;
  readonly statusChangedAt: Date | null;
}

export const ticketsPage = platformRoute({
  id: 'console.tickets',
  kind: 'page',
  path: '/console/tickets',
  phi: false,
  permission: 'support_ticket.work',
  params: z.object({ status: z.enum([...SUPPORT_TICKET_STATUSES, 'all']).default('open').catch('open') }),
  handle: async ({ scope, params, services }) => {
    const { rows } = await scope.client.query<{
      ticket_id: string;
      number: string;
      requester_email: string;
      organizations: string[];
      screen: string;
      category: SupportTicketCategory;
      subject: string;
      message: string;
      status: SupportTicketStatus;
      created_at: Date;
      status_changed_at: Date | null;
    }>('SELECT * FROM console_support_tickets($1, 200)', [params.status === 'all' ? null : params.status]);
    return {
      status: params.status,
      supportEmail: services.supportEmail,
      responseTarget: RESPONSE_TARGET,
      tickets: rows.map(
        (row): DeskTicketView => ({
          id: row.ticket_id,
          number: Number(row.number),
          requesterEmail: row.requester_email,
          organizations: row.organizations,
          screen: row.screen,
          category: row.category,
          subject: row.subject,
          message: row.message,
          status: row.status,
          createdAt: row.created_at,
          statusChangedAt: row.status_changed_at,
        }),
      ),
    };
  },
  sample: { params: () => ({}) },
});

export const setTicketStatus = platformRoute({
  id: 'console.ticket_status',
  kind: 'action',
  path: '/console/tickets',
  phi: false,
  permission: 'support_ticket.work',
  params: z.object({}),
  input: z.object({ ticketId: opaqueId, status: z.enum(SUPPORT_TICKET_STATUSES) }),
  audit: { action: 'support_ticket_status_set', objectType: 'support_ticket' },
  handle: async ({ scope, input }): Promise<MutationResult> => {
    const { rowCount } = await scope.client.query('UPDATE support_ticket SET status = $2, status_changed_by = app_actor_id() WHERE id = $1', [input.ticketId, input.status]);
    if (rowCount === 0) {
      throw new NotFoundError();
    }
    return { objectId: input.ticketId, redirect: '/console/tickets' };
  },
  sample: { params: () => ({}), input: (refs) => ({ ticketId: refs.ticketId, status: 'answered' }) },
});

export const consoleStatusPage = platformRoute({
  id: 'console.status',
  kind: 'page',
  path: '/console/status',
  phi: false,
  permission: 'status.manage',
  params: z.object({}),
  handle: async ({ scope, services }) => ({
    ...(await readStatus(scope.client, services.now())),
    statuses: STATUS_COMPONENT_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
    impacts: STATUS_INCIDENT_IMPACTS,
    incidentStatuses: STATUS_INCIDENT_STATUSES.map((value) => ({ value, label: INCIDENT_STATUS_LABELS[value] })),
    componentKeys: STATUS_COMPONENT_KEYS,
  }),
  sample: { params: () => ({}) },
});

/**
 * What staff write on the public page is screened like a ticket: the page is public. Every field that holds an
 * identifier is named at once, so all are fixed before the next press.
 */
function publicText<K extends string>(fields: Readonly<Record<K, string>>): Readonly<Record<K, string>> {
  const refused = Object.entries<string>(fields).filter(([, text]) => writtenPhiFindings(text).length > 0);
  if (refused.length > 0) {
    throw new InputError(refused.map(([field]) => ({ field, message: 'the status page is public: write no identifier, date of birth or phone number' })));
  }
  return fields;
}

export const setComponentStatus = platformRoute({
  id: 'console.status_component',
  kind: 'action',
  path: '/console/status',
  phi: false,
  permission: 'status.manage',
  params: z.object({}),
  input: z.object({ component: z.enum(STATUS_COMPONENT_KEYS), status: z.enum(STATUS_COMPONENT_STATUSES) }),
  audit: { action: 'status_component_set', objectType: 'status_component' },
  handle: async ({ scope, input }): Promise<MutationResult> => {
    await scope.client.query('UPDATE status_component SET status = $2, changed_by = app_actor_id() WHERE key = $1', [input.component, input.status]);
    return { redirect: '/console/status' };
  },
  sample: { params: () => ({}), input: () => ({ component: 'uploads', status: 'degraded' }) },
});

/** The components a form ticks: none ticked posts no field at all, which reads as an empty list, so the list's own message names it. */
const componentList = z.preprocess(
  (value) => (Array.isArray(value) ? value : typeof value === 'string' ? value.split(',').filter((part) => part !== '') : value === undefined || value === null ? [] : value),
  z.array(z.enum(STATUS_COMPONENT_KEYS)).min(1, 'choose at least one component').max(STATUS_COMPONENT_KEYS.length),
);

export const openIncident = platformRoute({
  id: 'console.status_incident',
  kind: 'action',
  path: '/console/status',
  phi: false,
  permission: 'status.manage',
  params: z.object({}),
  input: z.object({ title: requiredText(120), impact: z.enum(STATUS_INCIDENT_IMPACTS), components: componentList, message: requiredText(1000) }),
  audit: { action: 'status_incident_opened', objectType: 'status_incident' },
  handle: async ({ scope, input }): Promise<MutationResult> => {
    const { title, message } = publicText({ title: input.title, message: input.message });
    const { rows } = await scope.client.query<{ id: string }>('INSERT INTO status_incident (title, impact, components, created_by) VALUES ($1, $2, $3, app_actor_id()) RETURNING id', [
      title,
      input.impact,
      [...new Set(input.components)],
    ]);
    const incident = rows[0];
    if (incident === undefined) {
      throw new Error('the incident was not opened');
    }
    await scope.client.query("INSERT INTO status_incident_update (incident_id, status, message, posted_by) VALUES ($1, 'investigating', $2, app_actor_id())", [incident.id, message]);
    return { objectId: incident.id, redirect: '/console/status' };
  },
  sample: { params: () => ({}), input: () => ({ title: 'Slow uploads', impact: 'minor', components: 'uploads', message: 'Uploads are taking longer than usual to scan.' }) },
});

export const updateIncident = platformRoute({
  id: 'console.status_incident_update',
  kind: 'action',
  path: '/console/status',
  phi: false,
  permission: 'status.manage',
  params: z.object({}),
  input: z.object({ incidentId: opaqueId, status: z.enum(STATUS_INCIDENT_STATUSES), message: requiredText(1000) }),
  audit: { action: 'status_incident_updated', objectType: 'status_incident' },
  handle: async ({ scope, input }): Promise<MutationResult> => {
    const { message } = publicText({ message: input.message });
    const found = await scope.client.query('SELECT 1 FROM status_incident WHERE id = $1', [input.incidentId]);
    if (found.rows.length === 0) {
      throw new NotFoundError();
    }
    try {
      await scope.client.query('INSERT INTO status_incident_update (incident_id, status, message, posted_by) VALUES ($1, $2, $3, app_actor_id())', [input.incidentId, input.status, message]);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23514') {
        throw new InputError([{ field: 'status', message: 'a resolved incident takes no more updates; open a new one' }]);
      }
      throw error;
    }
    return { objectId: input.incidentId, redirect: '/console/status' };
  },
  sample: { params: () => ({}), input: (refs) => ({ incidentId: refs.incidentId, status: 'monitoring', message: 'A fix is in place; we are watching.' }) },
});

export const setMaintenance = platformRoute({
  id: 'console.maintenance',
  kind: 'action',
  path: '/console/status',
  phi: false,
  permission: 'feature_flag.manage',
  params: z.object({}),
  input: z.object({ on: z.enum(['true', 'false']).transform((value) => value === 'true') }),
  audit: { action: 'maintenance_set', objectType: 'feature_flag' },
  handle: async ({ scope, input }): Promise<MutationResult> => {
    const { rows } = await scope.client.query<{ id: string }>("SELECT set_feature_flag('platform.maintenance', 'global', NULL, $1::jsonb) AS id", [JSON.stringify(input.on)]);
    // This server stops caching the old value now; the others within their cache's few seconds.
    forgetMaintenanceFlag();
    return { objectId: rows[0]?.id, redirect: '/console/status' };
  },
  sample: { params: () => ({}), input: () => ({ on: 'false' }) },
});

export const SUPPORT_ROUTES = [statusPage, maintenancePage, healthCheck, supportRequestPage, createTicket, ticketsPage, setTicketStatus, consoleStatusPage, setComponentStatus, openIncident, updateIncident, setMaintenance] as const;
