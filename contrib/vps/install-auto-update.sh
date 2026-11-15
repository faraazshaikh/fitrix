#!/usr/bin/env bash
# One-time setup of the automatic server update (auto-update.sh): a systemd timer that runs it
# every 5 minutes, starting 2 minutes after boot. Run as root:
#   cd /opt/fitrix && bash contrib/vps/install-auto-update.sh
# Safe to run again. To remove it:
#   systemctl disable --now fitrix-update.timer && rm /etc/systemd/system/fitrix-update.*
set -eu
APP=/opt/fitrix
[ "$(id -u)" = 0 ] || { echo "Run this as root."; exit 1; }
command -v systemctl > /dev/null || { echo "No systemd here. Use cron instead: */5 * * * * $APP/contrib/vps/auto-update.sh"; exit 1; }
chmod +x "$APP/contrib/vps/auto-update.sh" "$APP/contrib/vps/backup.sh"

cat > /etc/systemd/system/fitrix-update.service <<EOF
[Unit]
Description=Update Fitrix to the newest main

[Service]
Type=oneshot
ExecStart=$APP/contrib/vps/auto-update.sh
EOF

cat > /etc/systemd/system/fitrix-update.timer <<EOF
[Unit]
Description=Check for a new Fitrix every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now fitrix-update.timer
echo
systemctl list-timers fitrix-update.timer --no-pager
echo
echo "Done. Updates are checked every 5 minutes. What it did: tail -n 20 /var/log/fitrix-update.log"
