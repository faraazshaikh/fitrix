# One-time: makes Windows run pull-backup.ps1 every day at 08:00 (or when the PC next wakes up, if it was
# off). Run it from the folder that holds pull-backup.ps1:
#   powershell -ExecutionPolicy Bypass -File .\install-backup-task.ps1
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'pull-backup.ps1'
if (-not (Test-Path $script)) { throw "pull-backup.ps1 not found next to this file ($PSScriptRoot)." }
$action   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $script)
$trigger  = New-ScheduledTaskTrigger -Daily -At 8:00am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'Fitrix backup pull' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host 'Done. "Fitrix backup pull" will run every day at 08:00.' -ForegroundColor Green
Write-Host 'Run it once now to check:  Start-ScheduledTask -TaskName "Fitrix backup pull"'
Write-Host 'Then read the result:      Get-Content $HOME\fitrix-backups\pull.log -Tail 5'
