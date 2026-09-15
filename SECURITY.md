# Security — before publishing this repository

## What is and isn't in this repo

This project keeps real configuration in per-service env files that are **never committed**:

| Real file (ignored) | Template (committed) |
| --- | --- |
| `.env` | `.env.example` |
| `backend/.env` | `backend/.env.example` |
| `ai-service/.env` | `ai-service/.env.example` |
| `frontend/.env.local` | `frontend/.env.local.example` |

`setup.sh` creates the real files from the templates and never overwrites an existing one.

## Before the first commit

This directory is not a git repository yet. Once you run `git init`, confirm the env
files are actually ignored before the first commit:

```sh
git check-ignore -v .env backend/.env ai-service/.env frontend/.env.local
```

Every one of those four must print a matching `.gitignore` rule. Then:

```sh
git status
```

No `.env` or `.env.local` file may appear under untracked files. If one does, **stop** —
fix `.gitignore` before committing, not after. A secret that reaches a public commit has
to be treated as compromised even if you delete it in the next commit, because it stays
in the history.

## Credentials in this project

Nothing here is a third-party API credential today:

- **`DJANGO_SECRET_KEY`** (`backend/.env`) — signs JWTs for this app. Rotated to a random
  value. Rotating it invalidates every issued token, so everyone signed in gets logged out
  once; that is the expected cost of a rotation, not a bug.
- **`POSTGRES_PASSWORD`** — set in both `.env` (which `docker compose` interpolates into the
  `postgres` service) and `backend/.env` (which Django and the Celery workers connect with).
  **These two must always match.** Postgres only reads `POSTGRES_PASSWORD` when it first
  initialises an empty data directory, so changing the env var alone will not rotate the
  password on an existing volume — you must also run:
  ```sh
  docker compose exec postgres psql -U vantage -d vantage \
    -c "ALTER USER vantage WITH PASSWORD 'new-password-here';"
  ```
  then update both files and `docker compose up -d --force-recreate backend qualify-worker research-worker`.
- **`OLLAMA_API_KEY`** (`ai-service/.env`) — currently empty. Ollama runs locally and needs no
  key, so there is nothing to rotate. If you ever point `OLLAMA_BASE_URL` at a hosted
  inference provider, the key for it goes here and becomes a real secret.

## Before any real (non-local) deployment

The defaults are sized for local Docker, where Postgres is not reachable outside the compose
network. For anything internet-facing:

1. Generate a fresh `DJANGO_SECRET_KEY` — never reuse a development key:
   ```sh
   python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
   ```
2. Generate a fresh `POSTGRES_PASSWORD` and follow the rotation steps above.
3. Set `DJANGO_DEBUG=false`. Debug mode renders full tracebacks, including settings, to anyone
   who triggers an error.
4. Replace `DJANGO_ALLOWED_HOSTS=*` with your actual hostnames.
5. Narrow `CORS_ALLOWED_ORIGINS` (both `backend/.env` and `ai-service/.env`) to the real
   frontend origin instead of `http://localhost:3000`.
6. Change the seeded `demo` / `vantage-demo` account's password, or delete the account — it is
   created by `manage.py seed_demo_data` with `is_staff=True` and its credentials are printed
   on the login page.
