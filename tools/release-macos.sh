#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "[Yulora] Node.js is required but was not found in PATH."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[Yulora] npm is required but was not found in PATH."
  exit 1
fi

if [[ "$(uname)" != "Darwin" ]]; then
  echo "[Yulora] release-macos.sh must be run on macOS."
  exit 1
fi

echo "[Yulora] macOS release is not implemented yet."
echo "[Yulora] This entrypoint is reserved for the future release:mac flow."
exit 1
