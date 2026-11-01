set -euo pipefail
gh label create content-due --description "Rule content due (audit #59)" --color FBCA04 2>/dev/null || true
# Every open content-due issue, every page of them: what the findings are deduplicated against.
gh api --paginate "repos/$GH_REPO/issues?labels=content-due&state=open&per_page=100" --jq '.[] | select(.pull_request == null) | {number, title}' > open.jsonl
jq -r '.title' open.jsonl > open-titles.txt
# The open issue titled as title.txt, if any.
open_number() { jq -rn --arg title "$(cat title.txt)" 'first(inputs | select(.title == $title) | .number) // empty' open.jsonl; }
# Opens the issue titled as title.txt with body.md, or comments on the one already open under that title.
open_or_comment() {
  number=$(open_number)
  if [ -z "$number" ]; then
    gh issue create --title "$(cat title.txt)" --label content-due --body-file body.md
  else
    gh issue comment "$number" --body-file body.md
  fi
}
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
  printf '%s\n' "Content calendar check failing" > title.txt
  printf 'The content calendar check did not hand on its findings (the check: %s) on %s at %s: %s\n' "$CHECK_RESULT" "$GITHUB_REF_NAME" "$GITHUB_SHA" "$RUN_URL" > body.md
  open_or_comment
  exit 0
fi
opened=0
: > unfiled.txt
count=$(jq length findings.json)
for i in $(seq 0 $((count - 1))); do
  jq -r --argjson i "$i" '.[$i].title' findings.json > title.txt
  if grep -Fxq -f title.txt open-titles.txt; then
    continue
  fi
  if [ "$opened" -ge "$MAX_OPENED" ]; then
    printf -- '- %s\n' "$(cat title.txt)" >> unfiled.txt
    continue
  fi
  jq -r --argjson i "$i" '.[$i].body' findings.json > body.md
  printf '\n\nOpened by the content-calendar workflow: %s\n' "$RUN_URL" >> body.md
  gh issue create --title "$(cat title.txt)" --label content-due --body-file body.md
  opened=$((opened + 1))
done
printf '%s\n' "Content calendar: findings not filed" > title.txt
if [ -s unfiled.txt ]; then
  unfiled=$(wc -l < unfiled.txt | tr -d ' ')
  # At most MAX_LISTED titles, so the body stays under GitHub's 65,536 characters whatever the count.
  {
    printf 'A run opens at most %s new issues. These %s findings were not filed by %s; a later run files them:\n\n' "$MAX_OPENED" "$unfiled" "$RUN_URL"
    head -n "$MAX_LISTED" unfiled.txt
    if [ "$unfiled" -gt "$MAX_LISTED" ]; then printf -- '- and %s more, each named in the run'"'"'s summary\n' "$((unfiled - MAX_LISTED))"; fi
  } > body.md
  open_or_comment
else
  number=$(open_number)
  if [ -n "$number" ]; then
    gh issue close "$number" --comment "Every finding is filed: $RUN_URL"
  fi
fi
