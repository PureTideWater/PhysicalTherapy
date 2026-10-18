'use server';

import { type ActionState, runAction } from '../../../lib/http/next';
import { openIncident, setComponentStatus, setMaintenance, updateIncident } from '../../../lib/routes/support';

/** The status page and maintenance, set by platform administrators (src/lib/routes/support.ts). */
export async function setComponentStatusAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(setComponentStatus, form);
}

export async function openIncidentAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(openIncident, form);
}

export async function updateIncidentAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(updateIncident, form);
}

export async function setMaintenanceAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(setMaintenance, form);
}
