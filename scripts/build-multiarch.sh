#!/usr/bin/env bash
set -euo pipefail

# Build standalone multi-arch binaries for Agents Animated Workspace
# Web assets and scene templates are statically embedded into every binary.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${ROOT_DIR}/bin"
mkdir -p "${BIN_DIR}"

echo "==> 1. Building Web Assets (React 19 + TypeScript + Vite)..."
(cd "${ROOT_DIR}/web" && npm run build)

echo "==> 2. Cross-compiling standalone multi-arch binaries..."

TARGETS=(
  "darwin/arm64/agents-workspace-darwin-arm64"
  "darwin/amd64/agents-workspace-darwin-amd64"
  "linux/amd64/agents-workspace-linux-amd64"
  "linux/arm64/agents-workspace-linux-arm64"
  "windows/amd64/agents-workspace-windows-amd64.exe"
)

LDFLAGS="-s -w"

for TARGET in "${TARGETS[@]}"; do
  IFS="/" read -r OS ARCH OUTPUT <<< "${TARGET}"
  echo "    Compiling for ${OS}/${ARCH} -> bin/${OUTPUT}..."
  CGO_ENABLED=0 GOOS="${OS}" GOARCH="${ARCH}" go build -trimpath -ldflags="${LDFLAGS}" -o "${BIN_DIR}/${OUTPUT}" "${ROOT_DIR}/cmd/server"
done

# Create default binary symlink or copy for the current host architecture
CURRENT_OS="$(go env GOOS)"
CURRENT_ARCH="$(go env GOARCH)"
HOST_BIN="${BIN_DIR}/agents-workspace-${CURRENT_OS}-${CURRENT_ARCH}"
if [[ -f "${HOST_BIN}" ]]; then
  cp -f "${HOST_BIN}" "${BIN_DIR}/agents-workspace"
fi

echo "==> Standalone multi-arch binaries built successfully in ${BIN_DIR}:"
ls -lh "${BIN_DIR}"
