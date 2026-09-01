#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
checks=(
  "ESI / Sales Invoice"
  "Delivery Receipt"
  "Acknowledgment Receipt"
  "Quotation"
  "Purchase Order"
  "Packing List"
  "duplicateFor"
  "validate(form)"
  "snapshot(label"
  "restoreSnapshot"
  "exportState"
  "importState"
  "WMModuleStore"
  "WM_IDENTITY_CONTEXT"
)
for token in "${checks[@]}"; do
  grep -Fq "$token" app.js || { echo "FAIL: expected token not found: $token"; exit 1; }
done
for forbidden in localStorage sessionStorage localhost 127.0.0.1; do
  if grep -Fq "$forbidden" app.js runtime.html; then
    echo "FAIL: obsolete local runtime token still present: $forbidden"; exit 1
  fi
done
echo "PASS: TradeLink cloud-runtime functionality markers present"
