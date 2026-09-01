#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

find_browser() {
  local candidate=""
  for candidate in "${BROWSER_BIN:-}" "${CHROME_BIN:-}" "${CHROMIUM_BIN:-}"; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  if [[ "$(uname -s)" == "Darwin" ]]; then
    for candidate in \
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
      "/Applications/Chromium.app/Contents/MacOS/Chromium" \
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary" \
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
      "${HOME:-}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
      "${HOME:-}/Applications/Chromium.app/Contents/MacOS/Chromium"; do
      if [[ -x "$candidate" ]]; then
        printf '%s\n' "$candidate"
        return 0
      fi
    done
  fi

  for candidate in chromium chromium-browser google-chrome google-chrome-stable microsoft-edge microsoft-edge-stable; do
    if command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return 0
    fi
  done

  return 1
}

BROWSER="$(find_browser || true)"
if [[ -z "$BROWSER" ]]; then
  cat >&2 <<'ERR'
No supported Chromium-based browser executable was found for the browser integration suite.
Install Google Chrome/Chromium/Microsoft Edge or set BROWSER_BIN to the executable path.
On macOS, for example:
  BROWSER_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run release:check
ERR
  exit 1
fi

CDP_PORT="$(python3 - <<'PY'
import socket
s=socket.socket(); s.bind(('127.0.0.1', 0)); print(s.getsockname()[1]); s.close()
PY
)"
CHROME_LOG="$(mktemp)"
PROFILE="$(mktemp -d)"

"$BROWSER" \
  --headless=new \
  --no-sandbox \
  --disable-gpu \
  --disable-dev-shm-usage \
  --disable-background-networking \
  --user-data-dir="$PROFILE" \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port="$CDP_PORT" \
  about:blank >"$CHROME_LOG" 2>&1 &
CHROME_PID=$!

cleanup(){
  kill "$CHROME_PID" 2>/dev/null || true
  sleep 0.15
  rm -f "$CHROME_LOG"
  rm -rf "$PROFILE" 2>/dev/null || true
}
trap cleanup EXIT

if ! node tests/browser/run-cdp.mjs "$CDP_PORT"; then
  echo "--- browser launch log ---" >&2
  cat "$CHROME_LOG" >&2 || true
  exit 1
fi

echo 'Browser integration tests: PASS'
