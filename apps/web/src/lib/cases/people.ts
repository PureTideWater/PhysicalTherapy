import type { PracticeScope, ScopeClient } from '@tp/db/runtime';

/**
 * The practice's people as the workbench names them (PRD 7, Cases: "owner"; the timeline's "by whom").
 * People do not read each other's user rows (the user table's policy shows a person only themselves
 * and their administrators), so these go through the database's functions, which answer only for a
 * practice the caller reaches (migration 20261024110000_case_workbench.sql): the people who may own its
 * cases now, and the email addresses of its people (members of its group or of an organization granted
 * it, now or before) who own or wrote its case records.
 */

type Scope = PracticeScope<ScopeClient>;

export interface Person {
  readonly userId: string;
  readonly email: string;
}

/** Who a case may be assigned to: the people who work the practice's cases now, by email. */
export async function caseWorkers(scope: Scope, practiceId: string): Promise<Person[]> {
  const { rows } = await scope.client.query<{ user_id: string; email: string }>('SELECT user_id, email FROM practice_case_workers($1)', [practiceId]);
  return rows.map((row) => ({ userId: row.user_id, email: row.email }));
}

/** The email addresses of the named people of the practice; anyone it does not know is left out. */
export async function peopleEmails(scope: Scope, practiceId: string, people: readonly (string | null | undefined)[]): Promise<ReadonlyMap<string, string>> {
  const ids = [...new Set(people.filter((id): id is string => typeof id === 'string'))];
  if (ids.length === 0) {
    return new Map();
  }
  const { rows } = await scope.client.query<{ user_id: string; email: string }>('SELECT user_id, email FROM practice_people_emails($1, $2::uuid[])', [practiceId, ids]);
  return new Map(rows.map((row) => [row.user_id, row.email]));
}
