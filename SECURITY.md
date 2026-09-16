# Security — before publishing this repository

## What is and isn't in this repo

This project keeps real configuration in per-service env files that are **never committed**:

| Real file (ignored) | Template (committed) |
| --- | --- |
| `backend/.env` | `backend/.env.example` |
| `ai-service/.env` | `ai-service/.env.example` |
| `frontend/.env.local` | `frontend/.env.local.example` |
| `railway.env` (if you create one locally for reference) | `railway.env.example` |

`setup.sh` creates the real files from the templates and never overwrites an existing one.

## Before the first commit

Once you run `git init`, confirm the env files are actually ignored before the first commit:

```sh
git check-ignore -v backend/.env ai-service/.env frontend/.env.local
```

Every one of those must print a matching `.gitignore` rule. Then:

```sh
git status
```

No `.env` or `.env.local` file may appear under untracked files. If one does, **stop** —
fix `.gitignore` before committing, not after. A secret that reaches a public commit has
to be treated as compromised even if you delete it in the next commit, because it stays
in the history.

## Credentials in this project

Unlike earlier in this project's life, these are now real, live third-party credentials —
Postgres and Redis both moved off local Docker containers onto hosted free tiers, so a
leaked value here isn't a harmless local-dev password anymore:

- **`DJANGO_SECRET_KEY`** (`backend/.env`) — signs JWTs for this app. Rotating it invalidates
  every issued token, so everyone signed in gets logged out once; that is the expected cost
  of a rotation, not a bug.
- **`POSTGRES_PASSWORD`** (`backend/.env`) — a real Supabase database password. Rotate it from
  your Supabase project's Database settings (Reset database password), not by hand — Supabase
  manages the actual user, this repo only holds the value it gave you. Update `backend/.env`
  and `railway.env` (if you're running the Railway-hosted workers) with the new value together;
  they must always match, since both connect to the same database.
- **`REDIS_URL`** (`backend/.env`) — a real Upstash Redis connection string, including its
  password inline. Rotate/regenerate from Upstash's dashboard, then update `backend/.env` and
  `railway.env` together, same reasoning as above.
- **`GROQ_API_KEY`** (`ai-service/.env`) — a real Groq API key, billed to whichever account
  created it (free tier or otherwise). Treat exactly like the database passwords above — if
  it leaks, revoke it from console.groq.com and issue a new one.
- **`OLLAMA_API_KEY`** (`ai-service/.env`) — currently empty and unrelated to the model
  provider (`GROQ_*` above runs the actual model). This one only powers an optional hosted
  web-search fallback in `web_search.py`; leave it blank unless you specifically want that
  provider, in which case it becomes a real secret too.

## Before any real (non-local) deployment

1. Generate a fresh `DJANGO_SECRET_KEY` — never reuse a development key:
   ```sh
   python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
   ```
2. Set `DJANGO_DEBUG=false`. Debug mode renders full tracebacks, including settings, to anyone
   who triggers an error.
3. Replace `DJANGO_ALLOWED_HOSTS=*` with your actual hostnames.
4. Narrow `CORS_ALLOWED_ORIGINS` (both `backend/.env` and `ai-service/.env`) to the real
   frontend origin instead of `http://localhost:3000`.
5. Change the seeded `demo` / `vantage-demo` account's password, or delete the account — it is
   created by `manage.py seed_demo_data` with `is_staff=True` and its credentials used to be
   printed on the login page (removed from the UI, but still worth rotating if you ever ran
   the seed command against a database anyone else can reach).
6. Static outbound IPs are a paid feature on Railway's free tier, so Supabase/Upstash access
   is left open (not IP-restricted) rather than scoped to a fixed address — see README.md
   "Deploying" for the full trade-off. Password and TLS are what's actually protecting those
   connections, so make sure your actual Supabase and Upstash passwords are strong generated
   values, not something memorable.
