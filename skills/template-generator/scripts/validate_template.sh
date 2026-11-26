#!/usr/bin/env bash
set -euo pipefail

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage: $0 <path/to/template.yaml>" >&2
  exit 1
fi

# Extract template id
TPL_ID="$(grep -E '^id:' "$FILE" | head -n1 | awk '{print $2}' | tr -d '"')"
if [ -z "$TPL_ID" ]; then
  echo "FAIL [$FILE]: missing 'id' field" >&2
  exit 1
fi

# Check required top-level keys
for KEY in id name description theme_badge theme grid zones workstations waypoints props characters companions; do
  if ! grep -qE "^${KEY}:" "$FILE"; then
    echo "FAIL [$FILE]: missing required top-level key '${KEY}:'" >&2
    exit 1
  fi
done

# Check grid cols=28, rows=18 and 18 layout lines of length 28
LAYOUT_LINES="$(grep -E '^[[:space:]]*-[[:space:]]*"[WCL.V]{28}"' "$FILE" | wc -l | tr -d ' ')"
if [ "$LAYOUT_LINES" -ne 18 ]; then
  echo "FAIL [$FILE]: expected 18 grid layout rows of 28 tiles, got ${LAYOUT_LINES}" >&2
  exit 1
fi

# Check workstation count >= 16
WS_COUNT="$(grep -E '^[[:space:]]*-[[:space:]]*\{[[:space:]]*id:[[:space:]]*"' "$FILE" | grep -c 'seat_col:' || true)"
if [ "$WS_COUNT" -lt 16 ]; then
  echo "FAIL [$FILE]: expected at least 16 workstations, got ${WS_COUNT}" >&2
  exit 1
fi

# Scene-Specific Prop Isolation Check: office-only props must never appear in non-office templates
if [ "$TPL_ID" != "office" ]; then
  if grep -qE 'type:[[:space:]]*"(server_rack|whiteboard|coffee_machine|watercooler|ping_pong)"' "$FILE"; then
    echo "FAIL [$FILE]: office-specific prop detected in non-office template '${TPL_ID}'" >&2
    exit 1
  fi
fi

echo "OK [$TPL_ID]: $FILE (${WS_COUNT} workstations, 28x18 grid, scene-isolated props)"
