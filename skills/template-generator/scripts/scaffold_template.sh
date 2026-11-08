#!/usr/bin/env bash
set -euo pipefail

ID="${1:-}"
NAME="${2:-Custom Workspace}"
BADGE="${3:-✨ Custom}"

if [ -z "$ID" ]; then
  echo "Usage: $0 <template-id> [\"Display Name\"] [\"Emoji Badge\"]" >&2
  exit 1
fi

DEST="templates/$ID"
mkdir -p "$DEST/sprites"

if [ -f "$DEST/template.yaml" ]; then
  echo "Error: $DEST/template.yaml already exists" >&2
  exit 1
fi

cp templates/office/template.yaml "$DEST/template.yaml"
sed -i.bak "s/^id: .*/id: $ID/" "$DEST/template.yaml"
sed -i.bak "s/^name: .*/name: \"$NAME\"/" "$DEST/template.yaml"
sed -i.bak "s/^theme_badge: .*/theme_badge: \"$BADGE\"/" "$DEST/template.yaml"
rm -f "$DEST/template.yaml.bak"

echo "Scaffolded new template plugin at $DEST/template.yaml"
