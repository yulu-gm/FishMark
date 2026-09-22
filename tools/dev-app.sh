#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
npm run dev:prepare
node scripts/sync-dev-themes.mjs
npm run dev
