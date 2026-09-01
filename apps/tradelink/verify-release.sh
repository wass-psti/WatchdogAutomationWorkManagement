#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
for f in runtime.html domain-config.js app.v1.42.0-wm1.js styles.v1.42.0-wm1.css css3-buttons.v1.42.0-wm1.js README.md; do
  test -s "$f" || { echo "FAIL: missing or empty $f"; exit 1; }
done
grep -q 'module-bootstrap.ts' runtime.html
grep -q 'startEmbeddedModule' runtime.html
grep -q 'domain-config.js' runtime.html
grep -q 'app.v1.42.0-wm1.js' runtime.html
grep -q 'tradelink_state_v1' domain-config.js
grep -q 'WMTradeLinkDomain' app.v1.42.0-wm1.js
grep -q 'WMModuleStore' app.v1.42.0-wm1.js
grep -q 'prefers-reduced-motion' styles.v1.42.0-wm1.css
! grep -Eq 'localStorage|sessionStorage|localhost|127\.0\.0\.1' runtime.html domain-config.js app.v1.42.0-wm1.js
echo "PASS: TradeLink authenticated cloud release structure is valid"
