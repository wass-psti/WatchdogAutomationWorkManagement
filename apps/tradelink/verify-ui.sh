#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
for marker in '.topbar' '.nav-tabs' '.create-commandbar' '.create-type-tabs' '.esi-section-nav' '.esi-client-section' '.esi-items-section' '.financial-workspace' '.esi-summary-panel' '.vat-native-select' '.esi-terms-section' '.esi-approval-section' '.form-footer' '.modal-backdrop' '@media(prefers-reduced-motion:reduce)' '@media print'; do
  grep -Fq "$marker" styles.v1.42.0-wm1.css || { echo "FAIL: missing UI marker $marker"; exit 1; }
done
grep -Fq 'id="esiDocumentInfo"' app.js
grep -Fq 'id="esiClientInfo"' app.js
grep -Fq "?'esiItems'" app.js
grep -Fq "?'esiFinancial'" app.js
grep -Fq 'id="esiTerms"' app.js
grep -Fq 'id="esiApprovalWorkflow"' app.js
echo 'PASS: TradeLink shared UI stabilization markers verified'
