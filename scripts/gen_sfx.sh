#!/usr/bin/env bash
set -euo pipefail

# Generate Hi-Bit sound effects for Agent Plaza using ElevenLabs CLI
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SFX_DIR="${ROOT_DIR}/web/public/sfx"
mkdir -p "${SFX_DIR}"

if ! command -v elevenlabs &>/dev/null; then
  echo "Error: elevenlabs CLI not found. Please install it first." >&2
  exit 1
fi

echo "==> Generating retro sound effects using ElevenLabs CLI..."

elevenlabs text-to-sound-effects convert \
  --text "crisp 8-bit retro video game menu button click, clean pixel UI tap" \
  --duration-seconds 0.5 \
  -o "${SFX_DIR}/ui-click.mp3"

elevenlabs text-to-sound-effects convert \
  --text "cheerful 8-bit retro video game spawn power-up chime, arcade pixel blip" \
  --duration-seconds 1.0 \
  -o "${SFX_DIR}/ui-spawn.mp3"

elevenlabs text-to-sound-effects convert \
  --text "retro 8-bit arcade portal warp whoosh chime, pixel art dimension transition" \
  --duration-seconds 1.2 \
  -o "${SFX_DIR}/ui-switch-theme.mp3"

elevenlabs text-to-sound-effects convert \
  --text "retro 8-bit mechanical keyboard typing clatter, subtle computer terminal clicks" \
  --duration-seconds 1.2 \
  -o "${SFX_DIR}/agent-work.mp3"

elevenlabs text-to-sound-effects convert \
  --text "pleasant 8-bit retro game task complete chime, positive achievement level up ding" \
  --duration-seconds 1.0 \
  -o "${SFX_DIR}/agent-complete.mp3"

elevenlabs text-to-sound-effects convert \
  --text "cute 8-bit retro video game pixel cat meow, playful electronic kitty chime" \
  --duration-seconds 0.8 \
  -o "${SFX_DIR}/pet-cat.mp3"

elevenlabs text-to-sound-effects convert \
  --text "cute 8-bit retro video game pixel dog puppy bark, friendly arcade yip" \
  --duration-seconds 0.8 \
  -o "${SFX_DIR}/pet-dog.mp3"

elevenlabs text-to-sound-effects convert \
  --text "cute 8-bit sci-fi robot electronic droid beep, friendly synthetic chirp" \
  --duration-seconds 0.8 \
  -o "${SFX_DIR}/pet-robot.mp3"

elevenlabs text-to-sound-effects convert \
  --text "subtle retro 8-bit notification pop chime, gentle arcade alert blip" \
  --duration-seconds 0.8 \
  -o "${SFX_DIR}/toast-notification.mp3"

echo "==> All sound effects generated successfully in ${SFX_DIR}:"
ls -lh "${SFX_DIR}"
