#!/bin/bash
#
# SessionStart: make a fresh container able to run this project's checks.
#
# Claude Code on the web clones the repo into a new container each session, and
# reclaims it after a while. Without this hook every session starts with no
# node_modules, no database and no DATABASE_URL, so `npm test`, `eslint` and
# every `prisma` command fail until somebody rebuilds all of it by hand — which
# costs the first several minutes of the session and is rediscovered from
# scratch each time.
#
# What it sets up, in order, each step skipped if already done:
#   1. node_modules
#   2. a local Postgres cluster, running on 127.0.0.1:5432
#   3. a .env with the two connection strings the schema requires
#   4. the migrations, applied
#   5. the generated Prisma client
#
# Deliberately not `set -e`: a hook that aborts half way leaves the session
# worse off than one that finishes and says what failed. Each step reports for
# itself and the script always exits 0, so a container without Postgres still
# gets its node_modules and a legible explanation.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0

# The web container is the one that needs this. A developer's own machine has
# its own database and its own .env, and this script must not touch either.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

DB_NAME="marine"
DB_URL="postgresql://postgres@127.0.0.1:5432/${DB_NAME}"
PG_BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
PGDATA="/var/lib/postgresql/${DB_NAME}"
failures=()

say() { printf '[session-start] %s\n' "$1"; }
fail() { say "FAILED: $1"; failures+=("$1"); }

# 1. Dependencies. `install` rather than `ci` so a cached container reuses what
# it already has; the container image is cached after this hook completes.
if [ -d node_modules ] && [ -d node_modules/next ]; then
  say "node_modules present"
else
  say "installing dependencies (a few minutes on a cold container)"
  # This tree needs the legacy resolver: the strict one errors on a peer
  # conflict among the Next 16 canary packages. Plain install is tried first so
  # the flag disappears by itself if that is ever fixed upstream.
  npm install --no-audit --no-fund >/tmp/npm-install.log 2>&1 ||
    npm install --no-audit --no-fund --legacy-peer-deps >>/tmp/npm-install.log 2>&1 ||
    fail "npm install (see /tmp/npm-install.log)"
fi

# 2. Postgres. Its own cluster rather than the distribution's, so there is one
# code path whatever the base image packages, and trust auth on loopback only —
# this database holds nothing but test rows and lives as long as the container.
if [ -z "$PG_BIN" ] || ! id postgres >/dev/null 2>&1; then
  say "no local Postgres available — skipping the database"
else
  if [ ! -s "$PGDATA/PG_VERSION" ]; then
    say "creating a Postgres cluster at $PGDATA"
    install -d -o postgres -g postgres -m 700 "$PGDATA" &&
      su postgres -c "$PG_BIN/initdb -D '$PGDATA' -A trust --encoding=UTF8" >/tmp/initdb.log 2>&1 ||
      fail "initdb (see /tmp/initdb.log)"
  fi

  if "$PG_BIN/pg_isready" -h 127.0.0.1 -p 5432 -q; then
    say "Postgres already accepting connections"
  elif [ -s "$PGDATA/PG_VERSION" ]; then
    say "starting Postgres"
    su postgres -c "$PG_BIN/pg_ctl -D '$PGDATA' -l /tmp/postgres.log -o '-c listen_addresses=127.0.0.1 -p 5432' -w start" \
      >/dev/null 2>&1 || fail "starting Postgres (see /tmp/postgres.log)"
  fi

  if "$PG_BIN/pg_isready" -h 127.0.0.1 -p 5432 -q; then
    if ! su postgres -c "$PG_BIN/psql -h 127.0.0.1 -tAc \"select 1 from pg_database where datname='$DB_NAME'\"" 2>/dev/null | grep -q 1; then
      say "creating the $DB_NAME database"
      su postgres -c "$PG_BIN/createdb -h 127.0.0.1 '$DB_NAME'" || fail "createdb"
    fi
  fi
fi

# 3. The two connection strings. They are NOT interchangeable in this schema —
# `url` is the pooled one and `directUrl` the direct one — but against a local
# cluster with no pooler in front of it the same string serves for both.
#
# Written to .env (gitignored) as well as the session environment, because the
# Prisma CLI reads .env itself and is often run from a subshell that never saw
# an export.
if [ ! -f .env ]; then
  say "writing .env"
  cat > .env <<ENV
# Written by .claude/hooks/session-start.sh for this container's local
# Postgres. Not the deployment's configuration — see .env.example for that.
DATABASE_URL="${DB_URL}"
POOLED_DATABASE_URL="${DB_URL}"
APP_BASE_URL="http://localhost:3000"
ENV
fi

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo "export DATABASE_URL=\"${DB_URL}\""
    echo "export POOLED_DATABASE_URL=\"${DB_URL}\""
  } >> "$CLAUDE_ENV_FILE"
fi

export DATABASE_URL="$DB_URL"
export POOLED_DATABASE_URL="$DB_URL"

# 4 and 5. Migrations and the generated client. Both only if there is a
# database to talk to; `prisma generate` needs none, but a client generated
# against a schema whose migrations never ran is a trap rather than a help.
if "${PG_BIN:-/usr/bin}/pg_isready" -h 127.0.0.1 -p 5432 -q 2>/dev/null; then
  say "applying migrations"
  npx prisma migrate deploy >/tmp/prisma-migrate.log 2>&1 || fail "prisma migrate deploy (see /tmp/prisma-migrate.log)"
fi

say "generating the Prisma client"
npx prisma generate >/tmp/prisma-generate.log 2>&1 || fail "prisma generate (see /tmp/prisma-generate.log)"

if [ ${#failures[@]} -eq 0 ]; then
  say "ready: npm test, npx eslint . and the prisma commands will all work"
else
  say "finished with ${#failures[@]} problem(s): ${failures[*]}"
fi
exit 0
