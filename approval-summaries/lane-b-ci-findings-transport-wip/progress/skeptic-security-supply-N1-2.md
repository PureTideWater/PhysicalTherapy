# Skeptic 3 of 3: security-supply N1 (signed URL in run log)

Status: done. Fresh clone at the WIP head 1322c7cf... (newer than b9a83bd3...), removed afterwards.

## Reproduction
- content-calendar.yml lines 105 and 180 (notify, handoff): `timeout -k 10 "$DOWNLOAD_LIMIT" gh run download ... -D ...`, stderr not redirected; the comment says "gh's error each time in the log".
- gh 2.89.0, read-only: `gh run download 41920042986 -n web-build` (a web-build artifact on this public repo). The sandbox proxy refused the blob host and gh printed `error downloading web-build: Get "https://productionresultssa16.blob.core.windows.net/...zip?...&se=...&sig=...&sp=r&sr=b&st=2026-11-04T21:56:11Z...": Forbidden`, the whole SAS URL with its signature. Log under cft/logs/sk-n1-2-dl.log, sig and se redacted.
- Reachable on a hosted runner too: a transport error (reset, TLS, DNS) is a Go url.Error that carries the redirected blob URL, and an HTTP 4xx/5xx goes through api.HandleHTTPError, which appends the request URL. A timeout kill prints nothing.
- Not handled: ADR 0071's Amendment and its Revisit item say nothing about it.

## Harm
Small. Today the repository is public. The artifact holds what the issues and the step summary already show (Q1), and any signed-in user can download it, so the leak only lets someone fetch public content without signing in, for the SAS lifetime. Once the repository is private, anyone who can read the log already holds actions: read, which downloads the artifact. The new exposure is a bearer link that keeps working for minutes if a log is copied out.

## Verdict
Not refuted. It is real and reachable. Severity: nit.

## Fix
Redact the signature but keep the error, word for word in both jobs so the T-H equality test still holds. Write stderr to a file, not a process substitution, so it stays in order and synchronous under set -euo pipefail:
  if timeout -k 10 "$DOWNLOAD_LIMIT" gh run download "$GITHUB_RUN_ID" -n findings -D "$RUNNER_TEMP/findings" 2> "$RUNNER_TEMP/download.err"; then ... fi
  sed -E 's/([?&]sig=)[^&" ]*/\1***/g' "$RUNNER_TEMP/download.err" >&2   (on each failed try)
Change the comment to "gh's error each time in the log, its signature masked". Add one Revisit line to ADR 0071 too. A workflows.test.ts assertion that both blocks redirect gh's stderr through the mask is optional.
