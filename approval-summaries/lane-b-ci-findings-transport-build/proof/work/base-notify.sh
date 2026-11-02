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
: > findings.json
if [ "$CHECK_RESULT" = "success" ]; then
  printf '%s' "$FINDINGS_B64" | base64 -d > findings.json 2>/dev/null || : > findings.json
fi
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
  { printf 'A run opens at most %s new issues. These %s findings were not filed by %s; a later run files them:\n\n' "$MAX_OPENED" "$(wc -l < unfiled.txt | tr -d ' ')" "$RUN_URL"; cat unfiled.txt; } > body.md
  open_or_comment
else
  number=$(open_number)
  if [ -n "$number" ]; then
    gh issue close "$number" --comment "Every finding is filed: $RUN_URL"
  fi
fi
