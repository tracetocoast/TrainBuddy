#!/bin/sh
set -eu
while :; do
  if ! sh /scripts/backup-once.sh; then
    echo '{"event":"database_backup","status":"failed"}' >&2
    exit 1
  fi
  sleep "${BACKUP_INTERVAL_SECONDS:-86400}"
done
