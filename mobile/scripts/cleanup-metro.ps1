# ============================================================
# cleanup-metro.ps1
# Kills any process holding the Metro bundler ports, and any
# adb reverse mappings pointing at them.
#
# Why this exists: `npx expo run:android` / `expo start` don't
# always exit cleanly on Ctrl-C or a closed terminal — the Node
# process can keep the port bound in the background. The next
# run then can't use 8081, silently falls back to 8082+, and if
# an emulator's `adb reverse` is still pointing at the OLD dead
# Metro process, the app will hang trying to fetch a bundle
# from a port nothing is listening on anymore (or a stale
# instance that doesn't have your latest code).
#
# Usage:
#   cd C:\dev\peripateticware\mobile
#   .\scripts\cleanup-metro.ps1
#
# Habit to build: run this whenever a Maestro/Detox run hangs on
# app launch, or before starting a fresh `expo run:android` if
# a previous one didn't shut down cleanly.
# ============================================================

param(
    [int[]]$Ports = @(8081, 8082, 8083)
)

$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"

Write-Host ""
Write-Host "-- Cleaning up Metro bundler ports ---------------------------" -ForegroundColor Cyan

# 1) Find and kill whatever's listening on each candidate Metro port
foreach ($port in $Ports) {
    $lines = netstat -ano | Select-String ":$port\s.*LISTENING"
    if ($lines) {
        $pids = $lines | ForEach-Object { ($_ -split "\s+")[-1] } | Sort-Object -Unique
        foreach ($processId in $pids) {
            Write-Host "  Port $port held by PID $processId -- killing ..." -ForegroundColor Yellow
            taskkill /PID $processId /F 2>$null | Out-Null
        }
    } else {
        Write-Host "  Port $port is free." -ForegroundColor DarkGray
    }
}

# 2) Clear adb reverse mappings so a stale port forward doesn't
#    point the emulator at a dead/wrong Metro instance
if (Test-Path $adb) {
    $devices = & $adb devices 2>$null | Select-String "^emulator-\d+" | ForEach-Object {
        ($_.Line -split "\s+")[0]
    }
    foreach ($serial in $devices) {
        Write-Host "  Clearing adb reverse on $serial ..." -ForegroundColor DarkGray
        & $adb -s $serial reverse --remove-all 2>$null | Out-Null
    }
}

Write-Host "  Done." -ForegroundColor Green
