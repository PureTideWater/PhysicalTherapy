# Policies

The security program's policies (PRD 16, SOC 2 and HIPAA evidence: "policies live in the repository as Markdown with
versions"). Each file's front matter carries its version and status. Every policy here is a **draft written from the
plan for the security official to review and approve**; none is in force until the security official's approval of
that version is recorded in the console (Compliance, kind "policy approval"), which the SOC 2 Type I evidence
checklist reads. A change to a policy is a pull request that raises its version; the approval of the new version is
recorded again.

| Policy | File | Evidences |
| --- | --- | --- |
| Access control | [access-control.md](access-control.md) | Tenant isolation, grants, authentication, authorization in depth, access reviews |
| Incident response | [incident-response.md](incident-response.md) | Incident response (with [the runbook](../runbooks/incident-response.md)) |
| Change management | [change-management.md](change-management.md) | Change management, dependency and image hygiene |
| Vendor management | [vendor-management.md](vendor-management.md) | Vendor boundaries (the subprocessor inventory and the data-flow map) |
| Data retention | [data-retention.md](data-retention.md) | Encryption, backups and restore |
| Workforce and device | [workforce-and-device.md](workforce-and-device.md) | Workforce |

The mapping of each control to its SOC 2 criteria and HIPAA Security Rule sections is in
`packages/compliance/src/controls.ts`; it is the build's proposal, for the security official and the auditor to confirm.
