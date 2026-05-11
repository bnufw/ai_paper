#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "Created .env from .env.example. Fill backend LLM and embedding settings, then rerun."
  exit 1
fi

if [ ! -d "venv" ]; then
  python3 -m venv venv
fi

source venv/bin/activate
pip install -q -r requirements.txt

exec uvicorn backend.main:app --host 0.0.0.0 --port "${BACKEND_PORT:-8000}" --reload \
  --reload-include '*.py' \
  --reload-include '.env'
