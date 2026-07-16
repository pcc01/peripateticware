# ============================================================
# cleanup-android-emulators.ps1
# Kills every running Android emulator + the Gradle daemon.
#
# run-android-e2e.ps1 already does this automatically in a
# try/finally, so it's covered whether that script passes,
# fails, or gets Ctrl-C'd. This standalone script exists for
# ad hoc runs (`npx detox test -c ...`, `detox build`, etc.)
# which don't go through that try/finally and can leave
# orphaned emulators + daemons accumulating RAM/CPU.
#
# Usage:
#   cd C:\dev\peripateticware\mobile
#   .\scripts\cleanup-android-emulators.ps1
#
# Habit to build: run this before AND after any ad hoc
# `npx detox test` / `npx detox build` command.
# ============================================================

$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"

Write-Host ""
Write-Host "-- Cleaning up Android emulators + Gradle daemon ------------" -ForegroundColor Cyan

# 1) Graceful shutdown via adb for every attached emulator
$devices = @()
if (Test-Path $adb) {
    $devices = & $adb devices 2>$null | Select-String "^emulator-\d+" | ForEach-Object {
        ($_.Line -split "\s+")[0]
    }
}

if ($devices) {
    foreach ($serial in $devices) {
        Write-Host "  adb emu kill $serial ..." -ForegroundColor DarkGray
        & $adb -s $serial emu kill 2>$null | Out-Null
    }
    Start-Sleep -Seconds 3
} else {
    Write-Host "  No emulators visible to adb." -ForegroundColor DarkGray
}

# 2) Force-kill anything adb missed (common when a run hung/got Ctrl-C'd
#    mid-boot and adb never registered the device, or adb itself is wedged).
$leftover = Get-Process qemu-system-x86_64, emulator, emulator64-x86_64 -ErrorAction SilentlyContinue
if ($leftover) {
    Write-Host "  Force-killing leftover emulator processes: $($leftover.Id -join ', ')" -ForegroundColor Yellow
    $leftover | Stop-Process -Force
} else {
    Write-Host "  No leftover emulator processes." -ForegroundColor DarkGray
}

# 3) Restart adb server so it isn't left tracking dead devices
if (Test-Path $adb) {
    Write-Host "  Restarting adb server ..." -ForegroundColor DarkGray
    & $adb kill-server 2>$null | Out-Null
    & $adb start-server 2>$null | Out-Null
}

# 4) Stop the Gradle daemon so it doesn't sit in memory between runs
$gradlew = if (Test-Path ".\android\gradlew.bat") { ".\android\gradlew.bat" } else { $null }
if ($gradlew) {
    Write-Host "  Stopping Gradle daemon ..." -ForegroundColor DarkGray
    & $gradlew --stop 2>$null | Out-Null
}

Write-Host "  Done. adb devices:" -ForegroundColor Green
if (Test-Path $adb) { & $adb devices }
