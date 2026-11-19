#!/bin/sh
# Nightly backup of Fitrix's data folder (accounts, passkeys, every user's workouts, uploads).
# Install: crontab -e  ->  15 3 * * * /opt/fitrix/contrib/vps/backup.sh
#
# The archive is ENCRYPTED with age, using only the PUBLIC key in /etc/fitrix/backup-recipient.txt.
# So this server can lock a backup but can never open one. The private key lives with the owner
# (password manager + a USB stick), never on the server. Without that file the script falls back to a
# plain archive and says so, so a missing file never stops backups.
#
# Keeps 30 days. If a user called "backuppull" exists, it can read the folder (and nothing else):
# the owner's PC uses that user to fetch the newest archive each day.
set -eu
APP=/opt/fitrix
OUT=/var/backups/fitrix
RECIPIENT=/etc/fitrix/backup-recipient.txt
KEEP_DAYS=30
umask 077
mkdir -p "$OUT"
stamp=$(date +%Y%m%d)
tmp="$OUT/.fitrix-data-$stamp.tmp"
tar czf "$tmp" -C "$APP" data
if [ -s "$RECIPIENT" ] && command -v age > /dev/null 2>&1; then
  age -R "$RECIPIENT" -o "$OUT/fitrix-data-$stamp.tgz.age.part" "$tmp"
  mv "$OUT/fitrix-data-$stamp.tgz.age.part" "$OUT/fitrix-data-$stamp.tgz.age"
  rm -f "$tmp"
else
  echo "backup.sh: WARNING no encryption (need the age program and $RECIPIENT). Wrote a plain archive." >&2
  mv "$tmp" "$OUT/fitrix-data-$stamp.tgz"
fi
find "$OUT" -maxdepth 1 -name 'fitrix-data-*' -mtime +"$KEEP_DAYS" -delete
if getent group backuppull > /dev/null 2>&1; then
  chgrp backuppull "$OUT" "$OUT"/fitrix-data-* 2> /dev/null || true
  chmod 750 "$OUT"
  chmod 640 "$OUT"/fitrix-data-* 2> /dev/null || true
fi
