set -euo pipefail
# The download, word for word in the notify and the handoff job (tools/test/workflows.test.ts holds the two equal).
# The findings the check uploaded, this run's own artifact (docs/adr/0071), in three tries DOWNLOAD_PAUSE seconds
# apart, each stopped after DOWNLOAD_LIMIT seconds; at most MAX_FILE_BYTES, as the check bounds it, or no findings
# list. A failed try logs one fixed line with its exit status (124 when stopped, 137 when killed 10 seconds later):
# gh's own output and errors, which can name the artifact's signed download address, stay out of the run's log, and
# so does bash's own report of a killed try (its line and command), the group's stderr going nowhere too.
: > findings.json
downloaded=false
if [ "$CHECK_RESULT" = "success" ]; then
  for try in 1 2 3; do
    rm -rf "$RUNNER_TEMP/findings"
    code=0
    { timeout -k 10 "$DOWNLOAD_LIMIT" gh run download "$GITHUB_RUN_ID" -n findings -D "$RUNNER_TEMP/findings"; } > /dev/null 2>&1 || code=$?
    if [ "$code" -eq 0 ]; then
      downloaded=true
      break
    fi
    printf 'content-calendar: try %s of 3 to download the findings failed (exit %s)\n' "$try" "$code" >&2
    if [ "$try" -lt 3 ]; then sleep "$DOWNLOAD_PAUSE"; fi
  done
fi
if [ "$downloaded" = true ]; then
  head -c "$((MAX_FILE_BYTES + 1))" "$RUNNER_TEMP/findings/findings.json" > findings.json 2>/dev/null || : > findings.json
  [ "$(wc -c < findings.json)" -le "$MAX_FILE_BYTES" ] || : > findings.json
fi
# Whether that file reads as a findings list, one JSON document (read whole, -s, so a second one is refused, not
# judged by the last alone) that is an array whose every entry has a string title and a string body: notify files
# only from such a list, and handoff proves on a pull request that notify can read this run's.
readable=false
if jq -e -s 'length == 1 and (.[0] | type == "array" and all(.[]; (.title | type) == "string" and (.body | type) == "string"))' findings.json > /dev/null 2>&1; then readable=true; fi
# End of the download.
if [ "$readable" != true ]; then
  printf 'content-calendar: the notify job could not read this run'"'"'s findings (the check: %s)\n' "$CHECK_RESULT" >&2
  exit 1
fi
printf 'content-calendar: the notify job reads %s findings, %s bytes, SHA-256 %s\n' "$(jq length findings.json)" "$(wc -c < findings.json | tr -d ' ')" "$(sha256sum findings.json | cut -d ' ' -f 1)"
