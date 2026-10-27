#!/bin/sh
set -eu
# Executed by the Postgres entrypoint only on an empty volume.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=app_password="$APP_DB_PASSWORD" --set=migrator_password="$MIGRATOR_DB_PASSWORD" --set=backup_password="$BACKUP_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE trainbuddy_migrator LOGIN PASSWORD %L', :'migrator_password') \gexec
SELECT format('CREATE ROLE trainbuddy_app LOGIN PASSWORD %L', :'app_password') \gexec
SELECT format('CREATE ROLE trainbuddy_backup LOGIN PASSWORD %L', :'backup_password') \gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO trainbuddy_migrator;
GRANT USAGE ON SCHEMA public TO trainbuddy_app;
GRANT USAGE ON SCHEMA public TO trainbuddy_backup;
SQL
