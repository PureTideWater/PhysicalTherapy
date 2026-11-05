export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH
export PG_BIN_DIR=/opt/pg18/bin
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
L=/tmp/claude-0/-home-user-PhysicalTherapy/e935a935-d2ff-5a27-860c-22677590c441/scratchpad/intfix/logs
ADMIN=postgres://postgres:test@localhost:5433/postgres
cd /home/user/interest
step() { local name="$1"; shift; local t0=$(date +%s); "$@" > "$L/$name.log" 2>&1; local rc=$?; echo "$name rc=$rc $(( $(date +%s) - t0 ))s $(date -u +%H:%M:%S)" >> "$L/summary.txt"; return $rc; }
