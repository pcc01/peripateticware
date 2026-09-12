# ============================================================
# run-maestro-prod.ps1
#
# Runs the Android Maestro suite against PROD (peripateticware.com) instead of
# a local backend. Thin wrapper over run-maestro-all-devices.ps1:
#
#   • runs the prod-safe standard folders (auth, navigation, discover, activity,
#     journal, progress, perispeech, settings, onboarding, and optionally
#     capture) from maestro/flows/
#   • swaps in the prod-coordinate GPS flows from maestro/flows-prod/
#     (wayfinding-prod.yaml, geofence-prod.yaml)
#   • skips maestro/flows/offline/** — those stop the backend container, which
#     is impossible against prod (cover offline manually or on a local backend)
#   • pauses between devices for the server-state reset (multi-device only)
#
# PREREQUISITES (see PROD_E2E_GUIDE.md for the full checklist):
#   1. mobile/.env has  EXPO_PUBLIC_API_URL=https://peripateticware.com
#      (already set as of 2026-08-20; this script verifies it before a build)
#   2. A prod student account, in a class that has these published activities:
#        - "Creek Habitat Study"                         (discovery, Langley centre, r=400m)
#        - "QA Waypoints — South Whidbey Community Park"  (wayfinding rung B, 3 stops)
#   3. maestro on PATH; Android SDK + AVDs already set up.
#
# USAGE:  (credentials from your shell env — never in the repo; PROD_E2E_GUIDE.md §0)
#   cd C:\dev\peripateticware\mobile
#   $env:STUDENT_EMAIL = '<prod test student>'; $env:STUDENT_PASSWORD = '<password>'
#   .\scripts\run-maestro-prod.ps1 `
#       -StudentEmail $env:STUDENT_EMAIL `
#       -StudentPassword $env:STUDENT_PASSWORD
#
#   # more devices (adds a reset pause between each):
#   .\scripts\run-maestro-prod.ps1 -StudentEmail ... -StudentPassword ... `
#       -Devices API37,API35,API33,API30,API24
#
#   # iterate without rebuilding the APK, skip the capture flows:
#   .\scripts\run-maestro-prod.ps1 -StudentEmail ... -StudentPassword ... `
#       -SkipBuild -SkipSetup -IncludeCapture:$false
# ============================================================

param(
    [Parameter(Mandatory = $true)] [string]$StudentEmail,
    [Parameter(Mandatory = $true)] [string]$StudentPassword,
    [string]$Devices = "API35",
    [string]$WayfindingActivity = "QA Waypoints — South Whidbey Community Park",
    [string]$GeofenceActivity   = "Creek Habitat Study",
    [bool]$IncludeCapture = $true,
    [switch]$SkipBuild,
    [switch]$SkipSetup
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$mobileRoot = Split-Path -Parent $here
Set-Location $mobileRoot

# ── Verify the build target is prod ──────────────────────────────────────────
# Only matters when we're about to build; -SkipBuild reuses whatever APK exists.
$envFile = Join-Path $mobileRoot ".env"
$apiLine = (Get-Content $envFile -ErrorAction SilentlyContinue |
            Where-Object { $_ -match '^\s*EXPO_PUBLIC_API_URL\s*=' } |
            Select-Object -Last 1)
$prodUrl = "https://peripateticware.com"
if (-not $SkipBuild) {
    if ($apiLine -notmatch [regex]::Escape($prodUrl)) {
        Write-Host "mobile/.env EXPO_PUBLIC_API_URL is not $prodUrl" -ForegroundColor Red
        Write-Host "  found: $apiLine" -ForegroundColor Red
        Write-Host "  Set it to the prod URL (and comment out any LAN IP line) before a prod build," -ForegroundColor Yellow
        Write-Host "  or pass -SkipBuild to run the existing APK as-is." -ForegroundColor Yellow
        exit 1
    }
    Write-Host "Build target: $prodUrl  (from mobile/.env)" -ForegroundColor Green
} else {
    Write-Host "Reusing existing APK (-SkipBuild). Confirm it was built against $prodUrl." -ForegroundColor Yellow
}

# ── Standard prod-safe folders ──────────────────────────────────────────────
$folders = @(
    "starter", "auth", "navigation", "discover",
    "activity", "journal", "progress", "perispeech",
    "onboarding", "settings"
)
if ($IncludeCapture) { $folders += "capture" }   # writes real evidence rows under the QA student — teardown after
$flows = ($folders -join ",")

$flowsExtra = @(
    "maestro\flows-prod\wayfinding-prod.yaml",
    "maestro\flows-prod\geofence-prod.yaml"
) -join ","

$deviceCount = ($Devices -split ",").Count

Write-Host ""
Write-Host "Prod Maestro run" -ForegroundColor Cyan
Write-Host "  devices : $Devices"
Write-Host "  student : $StudentEmail"
Write-Host "  wayfind : $WayfindingActivity"
Write-Host "  geofence: $GeofenceActivity"
Write-Host "  folders : $flows"
Write-Host "  + prod  : $flowsExtra"
if ($deviceCount -gt 1) {
    Write-Host "  reset   : will pause for scripts\reset-wayfinding-prod.sql between devices" -ForegroundColor Yellow
}
Write-Host ""

$fwd = @{
    Devices            = $Devices
    Flows              = $flows
    FlowsExtra         = $flowsExtra
    StudentEmail       = $StudentEmail
    StudentPassword    = $StudentPassword
    WayfindingActivity = $WayfindingActivity
    GeofenceActivity   = $GeofenceActivity
}
if ($SkipBuild) { $fwd.SkipBuild = $true }
if ($SkipSetup) { $fwd.SkipSetup = $true }
if ($deviceCount -gt 1) { $fwd.ResetBetweenDevices = $true }

& (Join-Path $here "run-maestro-all-devices.ps1") @fwd
exit $LASTEXITCODE
