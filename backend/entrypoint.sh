#!/bin/sh
set -e

echo "Waiting for postgres..."
python - <<'PY'
import os, time, sys
import psycopg2

for attempt in range(30):
    try:
        psycopg2.connect(
            dbname=os.environ.get("POSTGRES_DB", "vantage"),
            user=os.environ.get("POSTGRES_USER", "vantage"),
            password=os.environ.get("POSTGRES_PASSWORD", "vantage"),
            host=os.environ.get("POSTGRES_HOST", "postgres"),
            port=os.environ.get("POSTGRES_PORT", "5432"),
        ).close()
        print("Postgres is up.")
        sys.exit(0)
    except Exception:
        time.sleep(1)
print("Postgres never became available.", file=sys.stderr)
sys.exit(1)
PY

# Migrations run in exactly ONE place: the dedicated one-shot `migrate` service
# in docker-compose.yml, which every other service waits on via
# `condition: service_completed_successfully`.
#
# They used to run here unconditionally, which meant `backend` and the celery
# workers — all built from this same image — raced each other on startup and
# intermittently died with:
#   duplicate key value violates unique constraint "pg_type_typname_nsp_index"
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  python manage.py migrate --noinput
  python manage.py collectstatic --noinput || true
fi

# Command is chosen per-service in docker-compose.yml (web vs celery worker)
exec "$@"
