# ============================================================
# run-offline-capture-test.ps1
# Runs the offline-capture Maestro flows against an already-running,
# already-booted device with the app already installed — this script only
# handles the network toggle around them, which is the one thing Maestro
# YAML genuinely cannot do itself (see the flows' own header comments).
#
# This is why it's a separate script from run-maestro-all-devices.ps1
# rather than another folder in that script's flow matrix: toggling the
# emulator's network state mid-suite would affect every OTHER flow running
# after it if something went wrong (a flow hanging, this script erroring
# out before re-enabling network), so it's kept isolated and run
# deliberately against one device at a time instead of folded into the
# "run everything" matrix.
#
# Usage:
#   cd C:\dev\peripateticware\mobile
#   .\scripts\run-offline-capture-test.ps1
#   .\scripts\run-offline-capture-test.ps1 -Serial emulator-5554
#
# Prerequisites: an emulator already booted with the app already installed
# (run-maestro-all-devices.ps1 -SkipSetup -SkipBuild -Devices API33, then
# Ctrl-C after it installs but before it starts testing, or just boot one
# manually and `adb install` the release APK yourself).
# ============================================================

param(
    [string]$Serial = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false  # see run-maestro-all-devices.ps1's Invoke-Quiet comment — this alone isn't reliable, but costs nothing to also set

$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"

function Invoke-Quiet {
    # Same rationale as run-maestro-all-devices.ps1's helper of the same
    # name: wraps every adb call so routine stderr output or a PS7
    # native-command exception can't kill this script, only a genuine
    # caller-checked failure can.
    param([string]$Exe, [string[]]$CmdArgs = @())
    try {
        return @(& $Exe @CmdArgs 2>$null)
    } catch {
        return @()
    }
}

if (-not $Serial) {
    $devices = Invoke-Quiet -Exe $adb -CmdArgs @("devices") | Select-String "^emulator-\d+\s+device$" | ForEach-Object { ($_.Line -split "\s+")[0] }
    if (-not $devices) { throw "No booted emulator found (adb devices shows none in 'device' state). Boot one first - see this script's header comment." }
    if ($devices.Count -gt 1) { throw "Multiple emulators running ($($devices -join ', ')) - pass -Serial explicitly so this script knows which one to toggle network on." }
    $Serial = $devices[0]
}
Write-Host "Target device: $Serial" -ForegroundColor Cyan

$env:ANDROID_SERIAL = $Serial

try {
    Write-Host ""
    Write-Host "-- Disabling network (wifi + mobile data + airplane mode) -----" -ForegroundColor Yellow
    Invoke-Quiet -Exe $adb -CmdArgs @("-s", $Serial, "shell", "svc", "wifi", "disable") | Out-Null
    Invoke-Quiet -Exe $adb -CmdArgs @("-s", $Serial, "shell", "svc", "data", "disable") | Out-Null
    # svc wifi/data alone weren't enough on a real CI run against a
    # netsim-backed x86_64 emulator (androidboot.qemu.virtiowifi=1 in the
    # boot log) — that transport sits below the WifiManager layer `svc
    # wifi` toggles, so the app still saw itself as online. Airplane mode
    # is enforced by ConnectivityManager itself, above any one radio's
    # manager, so it's the more reliable cut. See the CI workflow's
    # matching comment (.github/workflows/mobile-e2e-maestro.yml).
    Invoke-Quiet -Exe $adb -CmdArgs @("-s", $Serial, "shell", "settings", "put", "global", "airplane_mode_on", "1") | Out-Null
    Invoke-Quiet -Exe $adb -CmdArgs @("-s", $Serial, "shell", "am", "broadcast", "-a", "android.intent.action.AIRPLANE_MODE", "--ez", "state", "true") | Out-Null
    Start-Sleep -Seconds 3

    Write-Host ""
    Write-Host "-- Running 13.1-offline-capture-queued.yaml -------------------" -ForegroundColor Yellow
    $flow1Ok = $false
    try {
        & maestro test maestro\flows\offline\13.1-offline-capture-queued.yaml -e STUDENT_EMAIL=student@test.local -e STUDENT_PASSWORD=Test1234!
        if ($LASTEXITCODE -eq 0) { $flow1Ok = $true }
    } catch {
        Write-Host "  13.1 reported an error: $_" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "-- Re-enabling network -----------------------------------------" -ForegroundColor Yellow
    Invoke-Quiet -Exe $adb -CmdArgs @("-s", $Serial, "shell", "settings", "put", "global", "airplane_mode_on", "0") | Out-Null
    Invoke-Quiet -Exe $adb -CmdArgs @("-s", $Serial, "shell", "am", "broadcast", "-a", "android.intent.action.AIRPLANE_MODE", "--ez", "state", "false") | Out-Null
    Invoke-Quiet -Exe $adb -CmdArgs @("-s", $Serial, "shell", "svc", "wifi", "enable") | Out-Null
    Invoke-Quiet -Exe $adb -CmdArgs @("-s", $Serial, "shell", "svc", "data", "enable") | Out-Null

    # useConnectivity.ts polls every 15s — wait past that so the flush has
    # actually had a chance to run before 13.2 checks anything.
    Write-Host "  Waiting 20s for the app's connectivity poll to notice..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 20

    Write-Host ""
    Write-Host "-- Running 13.2-offline-capture-syncs.yaml --------------------" -ForegroundColor Yellow
    $flow2Ok = $false
    try {
        & maestro test maestro\flows\offline\13.2-offline-capture-syncs.yaml -e STUDENT_EMAIL=student@test.local -e STUDENT_PASSWORD=Test1234!
        if ($LASTEXITCODE -eq 0) { $flow2Ok = $true }
    } catch {
        Write-Host "  13.2 reported an error: $_" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host ("  13.1 (queue while offline): {0}" -f $(if ($flow1Ok) { "PASS" } else { "FAIL" })) -ForegroundColor $(if ($flow1Ok) { "Green" } else { "Red" })
    Write-Host ("  13.2 (survives reconnect):  {0}" -f $(if ($flow2Ok) { "PASS" } else { "FAIL" })) -ForegroundColor $(if ($flow2Ok) { "Green" } else { "Red" })
    Write-Host "==================================================" -ForegroundColor Cyan

    if (-not ($flow1Ok -and $flow2Ok)) { exit 1 }
} finally {
    # Always restore network, whether the flows passed, failed, or this
    # script got Ctrl-C'd — leaving a dev emulator offline is a nasty thing
    # to discover an hour later on an unrelated task.
    Write-Host ""
    Write-Host "-- Ensuring network is back on (cleanup) -----------------------" -ForegroundColor DarkGray
    Invoke-Quiet -Exe $adb -CmdArgs @("-s", $Serial, "shell", "settings", "put", "global", "airplane_mode_on", "0") | Out-Null
    Invoke-Quiet -Exe $adb -CmdArgs @("-s", $Serial, "shell", "am", "broadcast", "-a", "android.intent.action.AIRPLANE_MODE", "--ez", "state", "false") | Out-Null
    Invoke-Quiet -Exe $adb -CmdArgs @("-s", $Serial, "shell", "svc", "wifi", "enable") | Out-Null
    Invoke-Quiet -Exe $adb -CmdArgs @("-s", $Serial, "shell", "svc", "data", "enable") | Out-Null
    Remove-Item Env:\ANDROID_SERIAL -ErrorAction SilentlyContinue
}
