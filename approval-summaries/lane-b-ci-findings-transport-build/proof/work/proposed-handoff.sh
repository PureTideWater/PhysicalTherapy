set -euo pipefail
# The download, word for word in the notify and the handoff job (tools/test/workflows.test.ts holds the two equal).
# The findings the check uploaded, this run's own artifact (docs/adr/0071), in three tries DOWNLOAD_PAUSE seconds
# apart, gh's error each time in the log; at most MAX_FILE_BYTES, as the check bounds it, or no findings list.
: > findings.json
downloaded=false
if [ "$CHECK_RESULT" = "success" ]; then
  for try in 1 2 3; do
    rm -rf "$RUNNER_TEMP/findings"
    if gh run download "$GITHUB_RUN_ID" -n findings -D "$RUNNER_TEMP/findings"; then
      downloaded=true
      break
    fi
    if [ "$try" -lt 3 ]; then sleep "$DOWNLOAD_PAUSE"; fi
  done
fi
if [ "$downloaded" = true ]; then
  head -c "$((MAX_FILE_BYTES + 1))" "$RUNNER_TEMP/findings/findings.json" > findings.json 2>/dev/null || : > findings.json
  [ "$(wc -c < findings.json)" -le "$MAX_FILE_BYTES" ] || : > findings.json
fi
# End of the download.
if ! jq -e 'type == "array" and all(.[]; (.title | type) == "string" and (.body | type) == "string")' findings.json > /dev/null 2>&1; then
  printf 'content-calendar: the notify job could not read this run'"'"'s findings (the check: %s)\n' "$CHECK_RESULT" >&2
  exit 1
fi
printf 'content-calendar: the notify job reads %s findings, %s bytes, SHA-256 %s\n' "$(jq length findings.json)" "$(wc -c < findings.json | tr -d ' ')" "$(sha256sum findings.json | cut -d ' ' -f 1)"
