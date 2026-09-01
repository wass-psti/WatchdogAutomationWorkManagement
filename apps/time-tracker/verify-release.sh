#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
for f in index.html styles.css v2.css v2-motion.js app.js ../../assets/js/runtime/module-bootstrap.ts; do
  [[ -s "$f" ]] || { echo "FAIL: missing or empty $f" >&2; exit 1; }
done
node --input-type=module --check < app.js
node --check v2-motion.js
count=$(grep -c '^function localDateKey' app.js || true)
[[ "$count" -eq 1 ]] || { echo "FAIL: expected one localDateKey declaration, found $count" >&2; exit 1; }
(grep -q 'module-bootstrap.ts' index.html && grep -q 'startEmbeddedModule' index.html && grep -q "entry: './app.js'" index.html) || { echo 'FAIL: app.js authenticated module loader missing' >&2; exit 1; }
grep -q 'id="app"' index.html || { echo 'FAIL: #app mount point missing' >&2; exit 1; }
grep -q 'data-tt-version="2"' index.html || { echo 'FAIL: TimeTracker v2 body contract missing' >&2; exit 1; }
grep -q 'v2.css' index.html || { echo 'FAIL: TimeTracker v2 stylesheet missing' >&2; exit 1; }
grep -q 'v2-motion.js' index.html || { echo 'FAIL: TimeTracker v2 motion runtime missing' >&2; exit 1; }
grep -q "window.addEventListener('unhandledrejection'" ../../assets/js/runtime/module-bootstrap.ts || { echo 'FAIL: shared async startup rejection capture missing' >&2; exit 1; }
grep -q "requiredWorkingMs: requiredWorkMs" app.js || { echo 'FAIL: auto-clockout required-work mapping regression' >&2; exit 1; }
echo 'release-verification: PASS'
