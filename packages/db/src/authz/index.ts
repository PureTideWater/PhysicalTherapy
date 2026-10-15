/**
 * Authorization helpers (100% branch coverage, PRD 18): the practice-scoped transaction API and the
 * audit wrapper every PHI read goes through.
 */
export { type AuditEventInput, type AuditTarget, type ReadContext, readWithAudit, recordAuditEvent, rowTarget } from './audit';
export { ScopeError, isUuid, requireUuid } from './ids';
export {
  type AccessVia,
  type ActorScope,
  type ClientOf,
  type AnyScope,
  type JobScopeRequest,
  OnePracticePerJobError,
  type PracticeAccess,
  type PracticeScope,
  type PracticeScopeRequest,
  type ScopeActorKind,
  type ScopeClient,
  type ScopePool,
  accessByPractice,
  onePracticeJob,
  withActor,
  withJobScope,
  withPracticeScope,
} from './scope';
