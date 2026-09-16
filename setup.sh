#!/bin/sh
# One-time local setup: copies each service's .env.example to .env if it
# doesn't exist yet. Safe to re-run — never overwrites an existing .env.
set -e

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
echo "  1. Get a free Groq API key: https://console.groq.com (no card required)"
echo "     Set GROQ_API_KEY in ai-service/.env."
echo "  2. Get a free Supabase project: https://supabase.com — copy its Postgres"
echo "     pooler connection info (Database settings) into backend/.env's"
echo "     POSTGRES_* variables."
echo "  3. Get a free Upstash Redis database: https://upstash.com — copy its"
echo "     rediss:// connection string into backend/.env's REDIS_URL."
echo "     (No local postgres/redis containers — docker-compose.yml doesn't"
echo "      run either, on purpose, so local dev and the deployed app share"
echo "      the same data.)"
echo "  4. docker compose up --build"
echo "  5. In another terminal, once the stack is healthy:"
echo "        docker compose exec backend python manage.py seed_demo_data"
echo "     Every lead is qualified by the real model, one at a time."
echo "     Budget ~15 minutes; it prints per-lead progress. Skip this if"
echo "     you'd rather keep your database empty — see SECURITY.md and the"
echo "     README for the storage limits on Supabase/Upstash's free tiers."
echo "  6. Open http://localhost:3000"
echo "     The landing page is public — research a company without an account."
echo "     Sign in with demo / vantage-demo (if you seeded) or /register a"
echo "     new account for the dashboard at /dashboard."
