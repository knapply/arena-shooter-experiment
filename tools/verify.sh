#!/bin/sh
# Full local check before pushing; stops at the first failure.
#   tools/verify.sh            fast suite (format, types, lint, build check, sim, perf, browser)
#   THREE_PATH=... tools/verify.sh render   also run real-WebGL render tests and draw budgets
set -e
cd "$(dirname "$0")/.."
LOG=$(mktemp -d)   # private logs, so parallel runs never read each other's
npx --no-install prettier --check "src/**/*.{js,css}" "tests/**/*.js" "tools/**/*.{js,mjs}" "*.mjs" > /dev/null
npx --no-install tsc -p .
npx --no-install eslint .
node tools/check-unused.mjs > /dev/null
node build.mjs > /dev/null   # rebuild first so index.html and sim-worker.js always match src/
node build.mjs --check
node tests/sim.test.js > "$LOG"/sim.log || { cat "$LOG"/sim.log; exit 1; }
node tests/messages.test.js > "$LOG"/msg.log || { grep FAIL "$LOG"/msg.log; exit 1; }
node tests/store.test.js > "$LOG"/store.log || { grep FAIL "$LOG"/store.log; exit 1; }
node tests/scenarios.test.js > "$LOG"/scn.log || { grep FAIL "$LOG"/scn.log; exit 1; }
node tests/maps.test.js > "$LOG"/maps.log || { grep FAIL "$LOG"/maps.log; exit 1; }
node tests/perf.test.js
node tests/anim.test.js > "$LOG"/anim.log || { grep -E "FAIL|passed" "$LOG"/anim.log; exit 1; }
node tests/browser.test.js > "$LOG"/browser.log || { grep -E "FAIL|passed" "$LOG"/browser.log; exit 1; }
node tests/modes.test.js > "$LOG"/modes.log || { grep -E "FAIL|passed" "$LOG"/modes.log; exit 1; }
node tests/net.test.js > "$LOG"/net.log || { grep -aE "FAIL|passed" "$LOG"/net.log; exit 1; }
node tests/netlab.test.js > "$LOG"/netlab.log || { grep -aE "FAIL|passed" "$LOG"/netlab.log; exit 1; }
node tests/security.test.js > "$LOG"/security.log || { grep -aE "FAIL|passed" "$LOG"/security.log; exit 1; }
tail -1 "$LOG"/browser.log
if [ "$1" = "render" ]; then
  node tests/render.test.js > "$LOG"/render.log || { grep -E "FAIL|passed" "$LOG"/render.log; exit 1; }
  tail -1 "$LOG"/render.log
  node tests/visual.test.js > "$LOG"/visual.log || { grep -E "FAIL|passed" "$LOG"/visual.log; exit 1; }
  tail -1 "$LOG"/visual.log
  node tests/trailer.test.js > "$LOG"/trailer.log || { grep -E "FAIL|passed" "$LOG"/trailer.log; exit 1; }
  tail -1 "$LOG"/trailer.log
fi
echo "verify: all checks passed"
