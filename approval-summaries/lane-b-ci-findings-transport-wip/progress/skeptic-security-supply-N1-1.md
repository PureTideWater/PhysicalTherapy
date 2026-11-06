# Skeptic 2 of 3, security-supply N1 (signed URL in the run log)

Clone /home/user/sk-cft-security-supply-N1-1 at origin/co-001/wip-ci-findings-transport = 1322c7cf... (read only; removed).

## Reproduction
- content-calendar.yml:105 (notify) and :180 (handoff): `timeout -k 10 "$DOWNLOAD_LIMIT" gh run download ... -D ...`, stderr not redirected; the comment says "gh's error each time in the log".
- gh 2.89.0, `gh run download 41912582102 -R PureTideWater/PhysicalTherapy -n screening-capacity` (output piped through a redaction sed): `error downloading screening-capacity: Get "https://productionresultssa10.blob.core.windows.net/...zip?...&se=<st+10 min>&sig=<...>&...": Forbidden`. That is the whole SAS URL with its signature, valid from st to se, 10 minutes.
- The same happens on any transport error (url.Error carries the final redirected URL) and on an HTTP status over 299 from the blob (gh's HTTP error names the request URL, which is the blob URL after the redirect). A kill by timeout prints nothing.

## Weighing
- Reachable only when the blob fetch fails on a hosted runner (403/5xx/reset): rare.
- Exposure is small: the artifact is findings.json, whose titles and bodies the same run files as issues; anyone who can read the run log can already download the run's artifacts (public now: any signed-in user; private later: repository readers, who also read the log). The link adds no-sign-in access for at most 10 minutes, and a log copied out of GitHub would carry it.
- No secret, token or PHI is in the URL beyond the SAS for that one blob (sp=r, sr=b).

## Verdict
Not refuted. Real and reachable; severity nit. Safest fix: the one-line Revisit note in ADR 0071's Amendment (no workflow change, so T-H's equal blocks and #86's value rule stay as they are). Redaction through `2> >(sed ...)` would also work, applied word for word in both blocks, but it adds a process substitution to two run: blocks for a rare, low-impact case.
