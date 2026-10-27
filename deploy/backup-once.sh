#!/bin/sh
set -eu
umask 077
mkdir -p /backups
stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
temporary="/backups/trainbuddy-$stamp.dump.partial"
destination="/backups/trainbuddy-$stamp.dump"
trap 'rm -f "$temporary"' EXIT
pg_dump --format=custom --no-owner --no-acl --file="$temporary"
pg_restore --list "$temporary" >/dev/null
mv "$temporary" "$destination"
sha256sum "$destination" > "$destination.sha256"
touch /backups/last-success
echo '{"event":"database_backup","status":"success"}'
# Rotate only our completed files, only after a new backup passed the catalog check.
retention="${BACKUP_RETENTION_DAYS:-30}"
case "$retention" in ''|*[!0-9]*) exit 1 ;; esac
test "$retention" -ge 7
find /backups -maxdepth 1 -type f -name 'trainbuddy-*.dump*' ! -name '*.partial' -mtime "+$retention" -delete
