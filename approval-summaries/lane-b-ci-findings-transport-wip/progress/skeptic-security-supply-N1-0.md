# Skeptic 1 of 3, security-supply N1 (signed URL in the run log)

Clone: /home/user/sk-cft-security-supply-N1-0 at origin/co-001/wip-ci-findings-transport 1322c7cf... (read only; removed).

## Reproduction
- content-calendar.yml:105 and :180: `timeout -k 10 "$DOWNLOAD_LIMIT" gh run download ...` with stderr to the log (by design: "gh's error each time in the log").
- gh 2.89.0, read only, against run 41920042986's web-build artifact: the proxy refused the blob host and gh printed
  `error downloading web-build: Get "https://productionresultssa16.blob.core.windows.net/...zip?...&se=<~minutes ahead>&sig=<signature>&...": Forbidden`
  (I redacted the signature before it reached my output). So the mechanism is real: a transport error prints the whole SAS URL.
- A timeout kill prints nothing; an HTTP 403/5xx answer from the blob goes through gh's HTTP error path, which also names the request URL.

## Why it does not matter
- The repository is public (REST: visibility public). ADR 0071 (Q1, and the Amendment) holds the artifact to what the public issues hold: calendar data, release numbers, public page addresses. The leaked link reaches that public data, kept one day, valid for minutes, scoped to one artifact. A signed-in user can already download it, and so can anyone who reads the issues.
- Once the repository is private, only people with read access can read the run log, and read access already lets them download the artifact. The link gives them nothing new. The only remaining case is a log copied out of GitHub within the link's lifetime, and even then the content is public.
- Other workflows download artifacts the same way (download-artifact in ci, release, mutation), so this is not a new class of exposure.

## Verdict
Refuted as a security finding: the mechanism is real, but it grants no access beyond what the log's readers already have, and the data is public by design. Severity none. Optional: one Revisit line in ADR 0071 saying gh's download errors name a short-lived signed URL. Do not add the sed redaction: it adds a process substitution to the T-H-equal block, for no gain.
