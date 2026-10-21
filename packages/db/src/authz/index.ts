/**
 * Authorization helpers (100% branch coverage, PRD 18): the practice-scoped transaction API, the
 * persona permission matrix with the role checks handlers make, and the audit wrapper every PHI read
 * goes through.
 */
export { type AuditEventInput, type AuditTarget, type ReadContext, readWithAudit, recordAuditEvent, rowTarget } from './audit';
export { ScopeError, isUuid, requireUuid } from './ids';
export {
  type AccessVia,
  type ActorScope,
  type ClientOf,
  type AnyScope,
  JobActorIsPersonError,
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
  withPublicSnapshot,
} from './scope';
export {
  type Effect,
  type MatrixRow,
  type MustNot,
  PERMISSIONS,
  PERMISSION_NAMES,
  PERSONAS,
  type Permission,
  type PermissionInfo,
  type PermissionScope,
  type Persona,
  STRUCTURAL_RULES,
  type StructuralRule,
  WRITE_PERMISSIONS,
  denyingRule,
  isPermission,
  matrixRows,
  permissionsOf,
  rolesPermit,
} from './permissions';
export {
  type DenialReason,
  type DirectoryPractice,
  PermissionDeniedError,
  databasePermits,
  knownRoles,
  organizationRoles,
  platformRoles,
  practiceDirectory,
  requireOrganizationPermission,
  requirePermission,
  requirePlatformPermission,
  requirePracticePermission,
  requireRole,
} from './require';
