#!/bin/sh
# One-time local setup: copies each service's .env.example to .env if it
# doesn't exist yet. Safe to re-run — never overwrites an existing .env.
set -e

# Root .env holds only the postgres service's own credentials, which docker
# compose interpolates into docker-compose.yml. Keep POSTGRES_* here in sync
# with backend/.env — that's what Django and the workers connect with.
if [ ! -f ".env" ]; then
  cp ".env.example" ".env"
  echo "Created .env from .env.example"
else
  echo ".env already exists, leaving it alone"
fi

for dir in backend ai-service; do
  if [ ! -f "$dir/.env" ]; then
    cp "$dir/.env.example" "$dir/.env"
    echo "Created $dir/.env from $dir/.env.example"
  else
    echo "$dir/.env already exists, leaving it alone"
  fi
done

if [ ! -f "frontend/.env.local" ]; then
  cp "frontend/.env.local.example" "frontend/.env.local"
  echo "Created frontend/.env.local from frontend/.env.local.example"
else
  echo "frontend/.env.local already exists, leaving it alone"
fi

echo ""
echo "Done. Next steps:"
echo "  1. Make sure Ollama is running on your host:  ollama serve"
echo "  2. Pull the model this project defaults to:   ollama pull qwen3:8b"
echo "     (5.2GB. On a flaky connection wrap it in a retry loop — Ollama"
echo "      resumes from partial blobs, so retrying costs nothing:"
echo "        until ollama list | grep -q qwen3:8b; do ollama pull qwen3:8b; done )"
echo "  3. docker compose up --build"
echo "  4. In another terminal, once the stack is healthy:"
echo "        docker compose exec backend python manage.py seed_demo_data"
echo "     Every lead is qualified by the real model, one at a time."
echo "     Budget ~15 minutes; it prints per-lead progress."
echo "  5. Open http://localhost:3000"
echo "     The landing page is public — research a company without an account."
echo "     Sign in with demo / vantage-demo for the dashboard at /dashboard."
