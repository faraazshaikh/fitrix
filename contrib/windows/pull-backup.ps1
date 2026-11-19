# Fetches the newest encrypted Fitrix backup from the server into this folder. Run by a scheduled task
# every day (install-backup-task.ps1). Needs no password: it uses a key made only for this job, and the
# server user it logs in as ("backuppull") can read nothing but the backup folder.
# The backups are encrypted, so a copy that gets stolen is unreadable without your private age key.
$ErrorActionPreference = 'Stop'
$Server  = 'backuppull@fit.intellisenselabs.com'
$Key     = Join-Path $HOME '.ssh\fitrix_backup'
$Dest    = Join-Path $HOME 'fitrix-backups'
$Remote  = '/var/backups/fitrix'
$KeepDays = 30
$Log     = Join-Path $Dest 'pull.log'

function Write-Log($msg) { Add-Content -Path $Log -Value ('{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $msg) }

try {
    New-Item -ItemType Directory -Force -Path $Dest | Out-Null
    $opts = @('-i', $Key, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new')

    $name = & ssh @opts $Server "cd $Remote && ls -1t *.tgz.age | head -1"
    if ($LASTEXITCODE -ne 0 -or -not $name) { throw 'could not find a backup on the server' }
    $name = ([string]$name).Trim()

    $target = Join-Path $Dest $name
    if (Test-Path $target) { Write-Log "already have $name"; exit 0 }

    & scp @opts "${Server}:${Remote}/${name}" "$target.part"
    if ($LASTEXITCODE -ne 0) { throw 'scp failed' }
    Move-Item -Path "$target.part" -Destination $target
    Write-Log "got $name ($((Get-Item $target).Length) bytes)"

    Get-ChildItem -Path $Dest -Filter 'fitrix-data-*.tgz.age' |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } |
        Remove-Item
}
catch {
    Write-Log "FAILED: $_"
    exit 1
}
