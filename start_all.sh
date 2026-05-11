#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "Created .env from .env.example. Fill backend LLM and embedding settings, then rerun."
  exit 1
fi

cleanup() {
  if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

(
  BACKEND_PORT="$BACKEND_PORT" bash start_backend.sh
) &
BACKEND_PID=$!

sleep 1
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo "Backend failed to start."
  exit 1
fi

exec npm run dev:frontend -- --host 0.0.0.0 --port "$FRONTEND_PORT"
