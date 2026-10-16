import { randomBytes, randomUUID } from 'node:crypto';

import { type OwnerClient, addMembership, asOwner, createUser } from '@tp/db/testing';

/**
 * Onboarding, settings and support records for the generated route tests (docs/adr/0053), written through the
 * owner role. Synthetic only.
 *
 * - the rest of the group's agreement chain (the world holds its BAA): engagement letter, terms and data-rights
 *   addendum, so the practice administrator may confirm it;
 * - an invited user with a membership the practice administrator created, so the database wrote its invitation;
 * - a spare member (an analyst no persona plays) whose role a test may change or whose membership it may end;
 * - an audit request from the public form;
 * - a support ticket the practice administrator opened;
 * - an open status-page incident.
 */

export interface OnboardingRefs {
  readonly invitationId: string;
  readonly spareMembershipId: string;
  readonly prospectId: string;
  readonly ticketId: string;
  readonly incidentId: string;
}

export async function seedOnboarding(options: {
  readonly owner: OwnerClient;
  readonly organizationId: string;
  readonly practiceId: string;
  readonly adminUserId: string;
  readonly platformAdminId: string;
}): Promise<OnboardingRefs> {
  const { owner, organizationId, practiceId, adminUserId, platformAdminId } = options;
  await asOwner(owner, [practiceId], async () => {
    for (const kind of ['engagement', 'terms', 'data_rights'] as const) {
      await owner.query(
        `INSERT INTO agreement (organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
         VALUES ($1, $2, $3, '1', now(), 'SYNTHETIC SIGNER', $4, $5)`,
        [organizationId, practiceId, kind, `agreements/synthetic-${kind}`, randomBytes(32).toString('hex')],
      );
    }
  });
  const invitedUserId = await createUser(owner, { status: 'invited', mfaEnrolled: false });
  const invitedMembershipId = randomUUID();
  await asOwner(
    owner,
    [],
    () => owner.query("INSERT INTO membership (id, organization_id, user_id, role) VALUES ($1, $2, $3, 'billing_manager')", [invitedMembershipId, organizationId, invitedUserId]),
    adminUserId,
  );
  const invitation = await asOwner(owner, [], () => owner.query('SELECT id FROM invitation WHERE membership_id = $1', [invitedMembershipId]));
  const invitationId = (invitation.rows[0] as { id: string } | undefined)?.id;
  if (invitationId === undefined) {
    throw new Error('the database wrote no invitation for the invited member');
  }
  const spare = await createUser(owner);
  const spareMembershipId = await addMembership(owner, organizationId, spare, 'analyst');
  const prospect = await asOwner(owner, [], () =>
    owner.query("SELECT submit_prospect_request('SYNTHETIC CONTACT', $1, 'SYNTHETIC PROSPECT CLINIC', 3, ARRAY['SYNTHETIC PAYER ONE', 'SYNTHETIC PAYER TWO'], 'in_house') AS id", [
      `prospect-${randomUUID()}@synthetic.test`,
    ]),
  );
  const ticket = await asOwner(owner, [], () =>
    owner.query("INSERT INTO support_ticket (requester_id, screen, category, subject, message) VALUES ($1, 'cases', 'question', 'SYNTHETIC QUESTION', 'Where is the export?') RETURNING id", [adminUserId]),
  );
  const incident = await asOwner(owner, [], () =>
    owner.query("INSERT INTO status_incident (title, impact, components, created_by) VALUES ('SYNTHETIC SLOW UPLOADS', 'minor', ARRAY['uploads'], $1) RETURNING id", [platformAdminId]),
  );
  const incidentId = (incident.rows[0] as { id: string }).id;
  await asOwner(owner, [], () =>
    owner.query("INSERT INTO status_incident_update (incident_id, status, message, posted_by) VALUES ($1, 'investigating', 'Uploads are slower than usual.', $2)", [incidentId, platformAdminId]),
  );
  return {
    invitationId,
    spareMembershipId,
    prospectId: (prospect.rows[0] as { id: string }).id,
    ticketId: (ticket.rows[0] as { id: string }).id,
    incidentId,
  };
}

/** Every user given accepts the terms of use in force, if any are (customers are sent to them first otherwise). */
export async function acceptCurrentTerms(owner: OwnerClient, userIds: readonly string[]): Promise<void> {
  await asOwner(owner, [], () =>
    owner.query(
      `INSERT INTO terms_acceptance (user_id, terms_version_id, request_id)
       SELECT u, current_terms_version(), 'route-test' FROM unnest($1::uuid[]) AS u WHERE current_terms_version() IS NOT NULL
       ON CONFLICT ON CONSTRAINT terms_acceptance_once DO NOTHING`,
      [userIds],
    ),
  );
}

/** Publishes a synthetic version of the terms of use, by a platform user, as the one in force. */
export async function publishSyntheticTerms(owner: OwnerClient, publisherId: string): Promise<string> {
  const { rows } = await asOwner(owner, [], () =>
    owner.query("INSERT INTO terms_version (version, document_ref, sha256, published_by) VALUES ($1, 'terms/synthetic', $2, $3) RETURNING id", [
      `synthetic-${randomUUID().slice(0, 8)}`,
      randomBytes(32).toString('hex'),
      publisherId,
    ]),
  );
  return (rows[0] as { id: string }).id;
}
