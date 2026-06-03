#!/bin/zsh
set -euo pipefail

APP_DIR="/Users/alexandrabrown/t1d"
LOG_DIR="$APP_DIR/scripts/glooko/logs"
LOG_FILE="$LOG_DIR/glooko-sync.log"
ERR_FILE="$LOG_DIR/glooko-sync.err.log"

mkdir -p "$LOG_DIR"
cd "$APP_DIR"

{
  echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Starting Glooko sync"
  npm run glooko:sync
  echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Glooko sync succeeded"
} >>"$LOG_FILE" 2>>"$ERR_FILE" || {
  status=$?
  echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Glooko sync failed with exit code $status" >>"$ERR_FILE"
  /usr/bin/osascript -e 'display notification "Glooko sync failed. Check scripts/glooko/logs/glooko-sync.err.log" with title "Brooks T1D"' || true
  exit "$status"
}
