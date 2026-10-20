#!/usr/bin/env bash
# SessionStart (.claude/settings.json; docs/adr/0063, audit item #20 (e)): every Claude Code session in this repository
# installs the pre-push hook for its clone (tools/pre-push/install.sh) and the pinned gitleaks the hook runs
# (tools/gitleaks/install.sh, unless GITLEAKS names one), so the build's own pushes, nearly all of them, go through the
# fixture check and the secret scan before they reach GitHub. What it prints goes into the session's context: that
# both are in place, or what is missing and what to run. A session start cannot be refused, so this hook always exits
# 0; the pre-push hook itself refuses a push while gitleaks is missing.
set -u
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || { echo "session-start: the project directory cannot be opened, so the pre-push hook was not installed; run pnpm hooks:install in the checkout before any git push."; exit 0; }

problems=()
if ! hook=$(bash tools/pre-push/install.sh 2>&1); then
  problems+=("The pre-push hook is not installed: $hook")
fi
if [ -n "${GITLEAKS:-}" ]; then
  if [ -x "$GITLEAKS" ]; then gitleaks="$GITLEAKS"; else problems+=("GITLEAKS is $GITLEAKS, which is not an executable file."); gitleaks=""; fi
elif ! gitleaks=$(bash tools/gitleaks/install.sh 2>&1); then
  problems+=("The pinned gitleaks could not be installed, so the pre-push hook refuses every push that sends a commit: ${gitleaks//$'\n'/ } Run tools/gitleaks/install.sh again, or set GITLEAKS to a gitleaks 8.19 or later.")
  gitleaks=""
fi

if [ "${#problems[@]}" -eq 0 ]; then
  echo "Pre-push hook: ${hook#pre-push: } gitleaks: $gitleaks. Every git push runs the fixture check and gitleaks over the commits it sends; never push with --no-verify, and fix a refused commit instead (docs/adr/0063)."
else
  echo "WARNING from .claude/hooks/session-start.sh (docs/adr/0063): the pre-push checks are not ready in this session."
  for problem in "${problems[@]}"; do echo "- $problem"; done
  echo "Fix this before any git push. Never push with --no-verify."
fi
exit 0
