# ============================================================
# run-maestro-all-devices.ps1
# Runs the full Maestro E2E suite (mobile/maestro/flows/**) against every
# Android AVD in the device matrix below, one at a time.
#
# Mirrors run-android-e2e.ps1's shape (SDK/AVD setup → build once →
# per-device boot/install/test/teardown loop → summary table), but drives
# Maestro instead of Detox, since the Maestro suite is what's actively
# maintained now (see mobile/E2E_TESTING_HANDOFF.md and mobile/maestro/).
#
# The device matrix mirrors .detoxrc.js's Android `devices` block so both
# runners agree on what "the device matrix" means. API 24 (Nexus 5X, x86,
# non-Google image) is the one flaky entry — no x86_64 image exists for
# that API level, so it boots slower and less reliably than the others,
# especially without solid hardware acceleration. See "known issues" below.
#
# Usage:
#   cd C:\dev\peripateticware\mobile
#   .\scripts\run-maestro-all-devices.ps1
#
# Optional flags:
#   -SkipBuild        Skip the gradle release build (use the existing APK)
#   -SkipSetup        Skip SDK/AVD setup (assumes AVDs already exist)
#   -Devices          Comma-separated subset, e.g. -Devices API35,API33
#   -Flows            Comma-separated flow subfolders to run, e.g.
#                      -Flows starter,auth,capture (default: every subfolder
#                      under maestro/flows/)
#   -StudentEmail     Overrides STUDENT_EMAIL (default: student@test.local)
#   -StudentPassword  Overrides STUDENT_PASSWORD (default: Test1234!)
#
# Known issues:
#   - 2-tab-navigation.yaml has historically caught a real app bug (an
#     Explore tab rendering when it shouldn't). If it fails here, check
#     whether that's a regression before assuming it's this script.
#   - API 24 (Nexus_5X_API_24) is the slowest/flakiest device in the matrix.
#     If it times out or fails to boot, rerun it alone:
#       .\scripts\run-maestro-all-devices.ps1 -SkipBuild -Devices API24
# ============================================================

param(
    [switch]$SkipBuild,
    [switch]$SkipSetup,
    [string]$Devices = "",
    [string]$Flows = "",
    [string]$StudentEmail = "student@test.local",
    [string]$StudentPassword = "Test1234!"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Environment ───────────────────────────────────────────────────────────────
$env:JAVA_HOME    = "C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"

$cmdlineRoots = @(
    "$env:ANDROID_HOME\cmdline-tools\latest\bin",
    "$env:ANDROID_HOME\cmdline-tools\bin"
) + (Get-ChildItem "$env:ANDROID_HOME\cmdline-tools" -ErrorAction SilentlyContinue |
     Where-Object { $_.PSIsContainer } |
     ForEach-Object { "$($_.FullName)\bin" })

$sdkManagerBin = $cmdlineRoots | Where-Object { Test-Path "$_\sdkmanager.bat" } | Select-Object -First 1
$avdManagerBin = $cmdlineRoots | Where-Object { Test-Path "$_\avdmanager.bat" } | Select-Object -First 1

if (-not $sdkManagerBin) { throw "sdkmanager not found. Install Android command-line tools from Android Studio -> SDK Manager -> SDK Tools." }
if (-not $avdManagerBin) { throw "avdmanager not found. Same fix as above." }

$sdkManager = "$sdkManagerBin\sdkmanager.bat"
$avdManager = "$avdManagerBin\avdmanager.bat"
$emulator   = "$env:ANDROID_HOME\emulator\emulator.exe"
$adb        = "$env:ANDROID_HOME\platform-tools\adb.exe"

if (-not (Get-Command maestro -ErrorAction SilentlyContinue)) {
    throw "maestro not found on PATH. Install it first: https://docs.maestro.dev/getting-started/installing-maestro"
}

$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\emulator;$env:ANDROID_HOME\platform-tools;$sdkManagerBin;$avdManagerBin;$env:PATH"

# ── Device matrix (mirrors .detoxrc.js's Android `devices` block) ─────────────
# API 37's SysImage looks different from the rest of the matrix on purpose:
# as of this API level, Google stopped shipping a plain "google_apis;x86_64"
# image — `sdkmanager --list` only shows the 16KB-page-size variant
# (google_apis_ps16k) and versions the platform itself (android-37.1, not
# android-37). Confirmed via `sdkmanager --list | Select-String android-37`
# on the dev machine. If a future API level does the same thing, re-run that
# same command to find the real package name before assuming the old
# "android-N;google_apis;x86_64" pattern still applies.
$matrix = @(
    [pscustomobject]@{ Key = "API37"; AvdName = "Pixel_6_API_37";  SysImage = "system-images;android-37.1;google_apis_ps16k;x86_64"; Device = "pixel_6";  ApiLevel = 37 }
    [pscustomobject]@{ Key = "API35"; AvdName = "Pixel_6_API_35";  SysImage = "system-images;android-35;google_apis;x86_64"; Device = "pixel_6";  ApiLevel = 35 }
    [pscustomobject]@{ Key = "API33"; AvdName = "Pixel_6_API_33";  SysImage = "system-images;android-33;google_apis;x86_64"; Device = "pixel_6";  ApiLevel = 33 }
    [pscustomobject]@{ Key = "API30"; AvdName = "Pixel_6_API_30";  SysImage = "system-images;android-30;google_apis;x86_64"; Device = "pixel_4";  ApiLevel = 30 }
    [pscustomobject]@{ Key = "API24"; AvdName = "Nexus_5X_API_24"; SysImage = "system-images;android-24;default;x86";        Device = "Nexus 5X"; ApiLevel = 24 }
)

if ($Devices) {
    $wanted = $Devices -split "," | ForEach-Object { $_.Trim() }
    $matrix = $matrix | Where-Object { $wanted -contains $_.Key }
    if (-not $matrix) { throw "No devices matched -Devices '$Devices'. Valid keys: API37, API35, API33, API30, API24" }
}

# ── Flow folders ────────────────────────────────────────────────────────────
$flowsRoot = Join-Path (Get-Location) "maestro\flows"
if ($Flows) {
    $flowFolders = ($Flows -split ",") | ForEach-Object { Join-Path $flowsRoot $_.Trim() }
} else {
    # Every immediate subfolder of maestro/flows/ — this intentionally
    # excludes login-student.yaml (a reusable subflow, not a standalone
    # flow) since maestro's folder scan is non-recursive and only picks up
    # loose .yaml files directly in a given folder, not the helper sitting
    # at maestro/flows/ root.
    $flowFolders = Get-ChildItem $flowsRoot -Directory | ForEach-Object { $_.FullName }
}
Write-Host "Flow folders:" -ForegroundColor DarkGray
$flowFolders | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }

$reportRoot = Join-Path (Get-Location) "maestro\reports"
New-Item -ItemType Directory -Force -Path $reportRoot | Out-Null

# ── Helpers ─────────────────────────────────────────────────────────────────
function Wait-EmulatorBoot {
    param([string]$Serial, [int]$TimeoutSec = 240)
    Write-Host "  Waiting for $Serial to boot..." -ForegroundColor DarkGray
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $val = & $adb -s $Serial shell getprop sys.boot_completed 2>$null
        if ($val -match "1") { Write-Host "  $Serial booted." -ForegroundColor Green; return }
        Start-Sleep 5
    }
    throw "Emulator $Serial did not boot within ${TimeoutSec}s"
}

function Invoke-Cleanup {
    Write-Host ""
    Write-Host "-- Cleanup: stopping emulators and Gradle daemon ------------" -ForegroundColor DarkGray
    $running = & $adb devices 2>$null | Select-String "^emulator-\d+" | ForEach-Object { ($_.Line -split "\s+")[0] }
    if ($running) {
        foreach ($serial in $running) {
            Write-Host "  Killing $serial ..." -ForegroundColor DarkGray
            & $adb -s $serial emu kill 2>$null | Out-Null
        }
        Start-Sleep -Seconds 3
    } else {
        Write-Host "  No running emulators found." -ForegroundColor DarkGray
    }
    $gradlew = if (Test-Path ".\android\gradlew.bat") { ".\android\gradlew.bat" } else { $null }
    if ($gradlew) {
        Write-Host "  Stopping Gradle daemon ..." -ForegroundColor DarkGray
        & $gradlew --stop 2>$null | Out-Null
    }
    Write-Host "  Cleanup complete." -ForegroundColor DarkGray
}

# ══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   Peripateticware - Maestro Multi-Device Suite    " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

$prev = $ErrorActionPreference

# Devices whose system image or AVD creation fails during setup get skipped
# rather than aborting the whole run — one missing/renamed package (e.g. a
# very new API level that only ships as google_apis_playstore, or hasn't
# been mirrored to every sdkmanager channel yet) shouldn't block testing the
# rest of the matrix. Skipped devices are reported in the final summary.
$setupFailed = @{}

# ── Step 1: SDK system images ─────────────────────────────────────────────────
if (-not $SkipSetup) {
    $ErrorActionPreference = "Continue"
    Write-Host "-- Step 1/4: Ensuring SDK system images ---------------------" -ForegroundColor Yellow
    $installedRaw = (& $sdkManager --list_installed 2>&1 | Where-Object { $_ -notmatch "^Warning:" }) -join "`n"
    foreach ($row in $matrix) {
        if ($installedRaw -match [regex]::Escape($row.SysImage)) {
            Write-Host "  [OK] $($row.SysImage)" -ForegroundColor Green
        } else {
            Write-Host "  [DOWNLOADING] $($row.SysImage) ..." -ForegroundColor Yellow
            $out = echo "y" | & $sdkManager $row.SysImage 2>&1
            $out | Where-Object { $_ -notmatch "^Warning:" } | Write-Host
            if ($LASTEXITCODE -ne 0) {
                $setupFailed[$row.Key] = "system image install failed"
                Write-Host "  [SKIPPING $($row.Key)] Could not install $($row.SysImage)." -ForegroundColor Red
                Write-Host "  Run '$sdkManager --list' and search for 'android-$($row.ApiLevel)' to see what actually exists for this API level (package name may differ, e.g. google_apis_playstore instead of google_apis)." -ForegroundColor DarkGray
            }
        }
    }
    $ErrorActionPreference = $prev
}

# ── Step 2: AVDs ──────────────────────────────────────────────────────────────
if (-not $SkipSetup) {
    $ErrorActionPreference = "Continue"
    Write-Host ""
    Write-Host "-- Step 2/4: Ensuring AVDs ----------------------------------" -ForegroundColor Yellow
    $existingAvds = (& $avdManager list avd -c 2>&1 | Where-Object { $_ -notmatch "^Warning:" })
    foreach ($row in $matrix) {
        if ($setupFailed.ContainsKey($row.Key)) { continue }
        if ($existingAvds -contains $row.AvdName) {
            Write-Host "  [OK] AVD $($row.AvdName)" -ForegroundColor Green
        } else {
            Write-Host "  [CREATING] $($row.AvdName) ..." -ForegroundColor Yellow
            echo "no" | & $avdManager create avd --name $row.AvdName --package $row.SysImage --device $row.Device --force 2>&1 |
                Where-Object { $_ -notmatch "^Warning:" } | Write-Host
            if ($LASTEXITCODE -ne 0) {
                $setupFailed[$row.Key] = "AVD creation failed"
                Write-Host "  [SKIPPING $($row.Key)] Could not create AVD $($row.AvdName)." -ForegroundColor Red
            }
        }
    }
    $ErrorActionPreference = $prev
}

if ($setupFailed.Count -gt 0) {
    Write-Host ""
    Write-Host "  Skipped devices (setup failed): $($setupFailed.Keys -join ', ')" -ForegroundColor Red
    $matrix = $matrix | Where-Object { -not $setupFailed.ContainsKey($_.Key) }
    if (-not $matrix) { throw "Every device failed setup - nothing left to test." }
}

# ── Step 3: Build the release APK once for all devices ────────────────────────
# Same APK Detox uses (android.debug app def in .detoxrc.js): a release build
# with the JS bundle embedded via expo export:embed, so it never depends on a
# running Metro server, and debug-keystore-signed so it installs on any AVD.
try {

if (-not $SkipBuild) {
    Write-Host ""
    Write-Host "-- Step 3/4: Building release APK ----------------------------" -ForegroundColor Yellow
    Push-Location android
    try {
        & .\gradlew.bat --no-daemon assembleRelease
        if ($LASTEXITCODE -ne 0) { throw "gradlew assembleRelease failed" }
    } finally {
        Pop-Location
    }
    Write-Host "  Build complete." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "-- Step 3/4: Build skipped (-SkipBuild) ----------------------" -ForegroundColor DarkGray
}

$apkPath = Join-Path (Get-Location) "android\app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $apkPath)) { throw "APK not found at $apkPath. Run without -SkipBuild first." }

# ── Step 4: Boot each device, install, run the suite, tear down ──────────────
Write-Host ""
Write-Host "-- Step 4/4: Running Maestro suite per device ----------------" -ForegroundColor Yellow

$results = [ordered]@{}
$totalStart = Get-Date

foreach ($row in $matrix) {
    Write-Host ""
    Write-Host "  -- $($row.AvdName) (API $($row.ApiLevel)) --------------------" -ForegroundColor Cyan
    $start = Get-Date
    $testOk = $false
    $serial = $null

    try {
        # Cold boot every time (-no-snapshot-load/-save): a stale snapshot
        # made with a different GLES renderer than -gpu below gets discarded
        # anyway and silently falls back to a slow cold boot mid-run — see
        # .detoxrc.js's gpuMode comment for the full story. Booting cold and
        # headless up front makes timing predictable across devices.
        $proc = Start-Process -FilePath $emulator -ArgumentList @(
            "-avd", $row.AvdName,
            "-no-window", "-no-audio", "-no-boot-anim",
            "-gpu", "swiftshader_indirect",
            "-no-snapshot-load", "-no-snapshot-save"
        ) -PassThru -WindowStyle Hidden

        # Give the emulator a moment to register with adb before polling.
        Start-Sleep -Seconds 5
        $deadline = (Get-Date).AddSeconds(60)
        while (-not $serial -and (Get-Date) -lt $deadline) {
            $serial = & $adb devices 2>$null | Select-String "^emulator-\d+" | ForEach-Object { ($_.Line -split "\s+")[0] } | Select-Object -Last 1
            if (-not $serial) { Start-Sleep -Seconds 2 }
        }
        if (-not $serial) { throw "Emulator process started but never registered with adb" }

        Wait-EmulatorBoot -Serial $serial -TimeoutSec 240

        Write-Host "  Installing APK ..." -ForegroundColor DarkGray
        & $adb -s $serial install -r $apkPath
        if ($LASTEXITCODE -ne 0) { throw "adb install failed on $serial" }

        # Pin ANDROID_SERIAL so Maestro (which shells out to adb) targets
        # this device even if another emulator is somehow still running.
        $env:ANDROID_SERIAL = $serial

        $reportDir = Join-Path $reportRoot $row.AvdName
        New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
        $junitPath = Join-Path $reportDir "junit.xml"

        Write-Host "  Running Maestro suite ..." -ForegroundColor DarkGray
        & maestro test @flowFolders `
            -e STUDENT_EMAIL=$StudentEmail `
            -e STUDENT_PASSWORD=$StudentPassword `
            --format junit --output $junitPath `
            2>&1 | Tee-Object -FilePath (Join-Path $reportDir "console.log")
        if ($LASTEXITCODE -eq 0) { $testOk = $true }

        # Best-effort: archive Maestro's own auto-saved failure screenshots
        # for this run alongside the junit report.
        $maestroTestsDir = Join-Path $env:USERPROFILE ".maestro\tests"
        if (Test-Path $maestroTestsDir) {
            $latest = Get-ChildItem $maestroTestsDir -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($latest) {
                Copy-Item -Path $latest.FullName -Destination (Join-Path $reportDir "artifacts") -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {
        Write-Host "  Exception: $_" -ForegroundColor Red
    } finally {
        Remove-Item Env:\ANDROID_SERIAL -ErrorAction 