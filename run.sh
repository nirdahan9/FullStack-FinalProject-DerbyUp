#!/usr/bin/env bash
#
# DerbyUp — one-command local run (macOS / Linux).
#
#   bash run.sh
#
# Needs Node.js 20+ and the .env.local file provided with the submission,
# placed next to this script. Installs, builds once, then serves the
# production build at http://localhost:3000.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js is not installed. Install Node 20+ from https://nodejs.org and re-run."
  exit 1
fi

if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)'; then
  echo "✗ Node.js $(node -v) is too old — this project needs Node 20 or newer."
  exit 1
fi

if [ ! -f .env.local ]; then
  echo "✗ .env.local is missing."
  echo "  Copy the .env.local file provided with the submission into this folder."
  echo "  (Files that start with a dot are hidden in Finder — use Cmd+Shift+. to see them.)"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "→ Installing dependencies (one time, a minute or two)…"
  npm ci
fi

if [ ! -f .next/BUILD_ID ]; then
  echo "→ Building the production bundle (a minute or two)…"
  npm run build
else
  echo "→ Using the existing build (delete the .next folder to force a rebuild)."
fi

echo "→ Starting DerbyUp at http://localhost:3000  (Ctrl+C stops the server)"
( sleep 3
  if command -v open >/dev/null 2>&1; then open http://localhost:3000
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:3000
  fi ) &

npm start
