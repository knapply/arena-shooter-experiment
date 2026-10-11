#!/bin/sh
# Full local check before pushing; stops at the first failure.
#   tools/verify.sh            fast suite (format, types, lint, build check, sim, perf, browser)
#   THREE_PATH=... tools/verify.sh render   also run real-WebGL render tests and draw budgets
set -e
cd "$(dirname "$0")/.."
npx --no-install prettier --check "src/**/*.{js,css}" "tests/**/*.js" "tools/**/*.{js,mjs}" "*.mjs" > /dev/null
npx --no-install tsc -p .
npx --no-install eslint .
node tools/check-unused.mjs > /dev/null
node build.mjs --check
node tests/sim.test.js > /tmp/ka-sim.log || { cat /tmp/ka-sim.log; exit 1; }
node tests/perf.test.js
node tests/browser.test.js > /tmp/ka-browser.log || { grep -E "FAIL|passed" /tmp/ka-browser.log; exit 1; }
tail -1 /tmp/ka-browser.log
if [ "$1" = "render" ]; then node tests/render.test.js | grep -E "FAIL|passed"; fi
echo "verify: all checks passed"
