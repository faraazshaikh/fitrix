# Proves a backup really opens: unlocks the newest one with your private key, unpacks it into a scratch
# folder, and checks the database reads. Nothing on the server is touched. Run it by hand now and then:
#   powershell -ExecutionPolicy Bypass -File $HOME\fitrix-backups\restore-test.ps1
param([string]$KeyFile = (Join-Path $HOME 'fitrix-backup-key.txt'))
$ErrorActionPreference = 'Stop'
$Dest    = Join-Path $HOME 'fitrix-backups'
$Scratch = Join-Path $env:TEMP 'fitrix-restore-test'

$file = Get-ChildItem -Path $Dest -Filter 'fitrix-data-*.tgz.age' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $file) { throw "No encrypted backup in $Dest yet." }
if (-not (Test-Path $KeyFile)) { throw "Private key not found at $KeyFile. Pass -KeyFile with its path (from your password manager or USB stick)." }

if (Test-Path $Scratch) { Remove-Item -Recurse -Force $Scratch }
New-Item -ItemType Directory -Path $Scratch | Out-Null

& age -d -i $KeyFile -o (Join-Path $Scratch 'data.tgz') $file.FullName
if ($LASTEXITCODE -ne 0) { throw 'Could not unlock the backup. Wrong key?' }
& tar -xzf (Join-Path $Scratch 'data.tgz') -C $Scratch
if ($LASTEXITCODE -ne 0) { throw 'Unlocked, but the archive would not unpack.' }

$db = Join-Path $Scratch 'data\db.json'
if (-not (Test-Path $db)) { throw 'Unpacked, but data\db.json is missing.' }
$json = Get-Content -Raw -Path $db | ConvertFrom-Json
$files = (Get-ChildItem -Recurse -File -Path (Join-Path $Scratch 'data')).Count

Write-Host ''
Write-Host "RESTORE TEST PASSED for $($file.Name)" -ForegroundColor Green
Write-Host "  accounts in the database: $(@($json.users).Count)"
Write-Host "  files in the data folder: $files"
Write-Host "  backup made:              $($file.LastWriteTime)"
Remove-Item -Recurse -Force $Scratch
