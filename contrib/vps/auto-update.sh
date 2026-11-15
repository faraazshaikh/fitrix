#!/usr/bin/env bash
# Keeps the Fitrix server on the newest `main` of github.com/faraazshaikh/fitrix, by itself.
#
# Run by a systemd timer every 5 minutes (install-auto-update.sh sets that up). Most runs only ask
# GitHub "is there anything new?" and stop. When there is:
#   1. a backup of data/ (backup.sh),
#   2. the same update you would paste by hand (reset to origin/main, compose up -d --build),
#   3. a health check. If the server does not come back healthy, it goes back to the commit it was
#      on, rebuilds that, and remembers the bad commit so it does not try it again every 5 minutes.
# It never touches .env or data/, and only Fitrix's own containers.
#
# Everything is in main() so that the update's own `git reset --hard` cannot change the script
# while bash is still reading it.
# Log: /var/log/fitrix-update.log
set -u

main() {
  APP=${FITRIX_APP:-/opt/fitrix}
  STATE=${FITRIX_STATE:-/var/lib/fitrix-update}
  LOG=${FITRIX_LOG:-/var/log/fitrix-update.log}
  COMPOSE="docker compose -f docker-compose.yml -f contrib/vps/docker-compose.vps.yml"

  log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$LOG"; }
  # Up to a minute for the containers to answer after a rebuild.
  healthy() {
    local i
    for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
      curl -fsS --max-time 5 "$HEALTH" 2>/dev/null | grep -q '"ok":true' && return 0
      sleep 5
    done
    return 1
  }
  # nice: the VPS also runs n8n and the agents; a build must not starve them.
  build() { nice -n 10 $COMPOSE up -d --build >> "$LOG" 2>&1; }

  mkdir -p "$STATE"
  exec 9> "$STATE/lock"
  flock -n 9 || exit 0   # another run is still going

  cd "$APP" || exit 1
  PORT=$(grep -s '^FITRIX_PORT=' .env | tail -n 1 | cut -d= -f2)
  HEALTH="http://127.0.0.1:${PORT:-8085}/api/health"

  git fetch -q origin main 2>/dev/null || exit 0   # no network right now: try again next time
  OLD=$(git rev-parse HEAD)
  NEW=$(git rev-parse origin/main)
  [ "$OLD" = "$NEW" ] && exit 0
  # A commit that already failed here is skipped until main moves on.
  [ "$(cat "$STATE/bad" 2>/dev/null)" = "$NEW" ] && exit 0

  log "update ${OLD:0:9} -> ${NEW:0:9}"
  if [ -f contrib/vps/backup.sh ]; then sh contrib/vps/backup.sh >> "$LOG" 2>&1 || log "backup failed, going on"; fi

  git reset -q --hard "$NEW"
  if build && healthy; then
    log "updated, healthy"
    rm -f "$STATE/bad"
  else
    log "FAILED, going back to ${OLD:0:9}"
    echo "$NEW" > "$STATE/bad"
    git reset -q --hard "$OLD"
    if build && healthy; then log "back on ${OLD:0:9}, healthy"; else log "STILL NOT HEALTHY after going back, look at the server"; fi
  fi

  used=$(df --output=pcent / | tail -n 1 | tr -dc '0-9')
  [ "${used:-0}" -ge 85 ] && log "WARNING: the disk is ${used}% full"
  tail -n 1000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
  return 0
}

main "$@"; exit $?
