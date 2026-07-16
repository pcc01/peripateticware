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
#   - API 37 (Pixel_6_API_37) can also time out on boot — it's on the
#     16KB-page-size system image (google_apis_ps16k), the newest and least
#     battle-tested image in the matrix. A first cold boot right after AVD
#     creation is also just slower than later ones. If it times out, retry
#     it alone once the AVD already exists (-SkipSetup):
#       .\scripts\run-maestro-all-devices.ps1 -SkipBuild -SkipSetup -Devices API37
#   - A device timing out with a wildly large elapsed time (e.g. thousands
#     of seconds against a 240s timeout) almost always means the machine
#     went to sleep/idle mid-run, not a real hang — the wall-clock deadline
#     check includes however long the system was suspended. Keep the
#     machine awake for the duration of a full run, or run a subset with
#     -Devices while iterating.
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

# On PowerShell 7.3+, $PSNativeCommandUseErrorActionPreference (default $true)
# promotes ANY native command's non-zero exit code into a terminating
# exception that respects $ErrorActionPreference above — including things
# like `adb devices` printing its routine "* daemon not running; starting
# now" startup message, or `adb shell getprop` against a device that's still
# mid-boot. Those aren't real failures, just native commands doing normal
# things on stderr/non-zero-exit, and this script already checks
# $LASTEXITCODE explicitly everywhere it actually needs fail-fast behavior
# (Step 1-3's SDK/AVD/build calls). Disabling this restores that classic,
# predictable behavior. This variable doesn't exist on Windows PowerShell
# 5.1 — setting it there is a harmless no-op script-scoped variable, not an
# error, so this line is safe on either PowerShell version.
$PSNativeCommandUseErrorActionPreference = $false

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
# Port is fixed per device (emulator console ports must be even numbers,
# conventionally starting at 5554) so devices never contend for the same
# port. Without this, "wait for a genuinely new serial" is a race: if one
# device's emulator gets killed while still mid-boot (e.g. a timeout), the
# next device can start before that port is fully released and end up
# waiting forever for a serial that never appears — this is exactly what
# happened to API35 chasing API37's leftover emulator-5554.
$matrix = @(
    [pscustomobject]@{ Key = "API37"; AvdName = "Pixel_6_API_37";  SysImage = "system-images;android-37.1;google_apis_ps16k;x86_64"; Device = "pixel_6";  ApiLevel = 37; Port = 5554 }
    [pscustomobject]@{ Key = "API35"; AvdName = "Pixel_6_API_35";  SysImage = "system-images;android-35;google_apis;x86_64"; Device = "pixel_6";  ApiLevel = 35; Port = 5556 }
    [pscustomobject]@{ Key = "API33"; AvdName = "Pixel_6_API_33";  SysImage = "system-images;android-33;google_apis;x86_64"; Device = "pixel_6";  ApiLevel = 33; Port = 5558 }
    [pscustomobject]@{ Key = "API30"; AvdName = "Pixel_6_API_30";  SysImage = "system-images;android-30;google_apis;x86_64"; Device = "pixel_4";  ApiLevel = 30; Port = 5560 }
    [pscustomobject]@{ Key = "API24"; AvdName = "Nexus_5X_API_24"; SysImage = "system-images;android-24;default;x86";        Device = "Nexus 5X"; ApiLevel = 24; Port = 5562 }
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
# Runs a native command and unconditionally swallows any error it produces —
# non-zero exit code, stderr text, or (on some PowerShell builds) the
# NativeCommandError exception that gets thrown despite `2>$null` and despite
# explicitly setting $PSNativeCommandUseErrorActionPreference = $false at the
# top of this script. That preference variable did NOT reliably suppress
# this in practice (confirmed against the actual failures this script hit:
# "adb devices" throwing on its own routine "daemon not running, starting
# now" startup message, and "adb shell getprop" throwing while a device is
# still mid-boot) — wrapping every risky call in try/catch is the only
# version-independent guarantee. Used for calls where we only want whatever
# stdout was produced, and treat "command errored" the same as "no output".
function Invoke-Quiet {
    param([string]$Exe, [string[]]$CmdArgs = @())
    try {
        return @(& $Exe @CmdArgs 2>$null)
    } catch {
        return @()
    }
}

function Wait-EmulatorBoot {
    param([string]$Serial, [int]$TimeoutSec = 240)
    Write-Host "  Waiting for $Serial to boot..." -ForegroundColor DarkGray
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $val = Invoke-Quiet -Exe $adb -CmdArgs @("-s", $Serial, "shell", "getprop", "sys.boot_completed")
        if ($val -match "1") { Write-Host "  $Serial booted." -ForegroundColor Green; return }
        Start-Sleep 5
    }
    throw "Emulator $Serial did not boot within ${TimeoutSec}s"
}

function Invoke-Cleanup {
    Write-Host ""
    Write-Host "-- Cleanup: stopping emulators and Gradle daemon ------------" -ForegroundColor DarkGray
    $running = Invoke-Quiet -Exe $adb -CmdArgs @("devices") | Select-String "^emulator-\d+" | ForEach-Object { ($_.Line -split "\s+")[0] }
    if ($running) {
        foreach ($serial in $running) {
            Write-Host "  Killing $serial ..." -ForegroundColor DarkGray
            Invoke-Quiet -Exe $adb -CmdArgs @("-s", $serial, "emu", "kill") | Out-Null
        }
        Start-Sleep -Seconds 3
    } else {
        Write-Host "  No running emulators found." -ForegroundColor DarkGray
    }
    $gradlew = if (Test-Path ".\android\gradlew.bat") { ".\android\gradlew.bat" } else { $null }
    if ($gradlew) {
        Write-Host "  Stopping Gradle daemon ..." -ForegroundColor DarkGray
        Invoke-Quiet -Exe $gradlew -CmdArgs @("--stop") | Out-Null
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
        $buildFailed = $false
        try {
            & .\gradlew.bat --no-daemon assembleRelease
            if ($LASTEXITCODE -ne 0) { $buildFailed = $true }
        } catch {
            # Gradle routinely writes deprecation/warning noise to stderr
            # even on a fully successful build — don't let that get promoted
            # into a script-ending exception (see Invoke-Quiet's comment
            # above for the full story on this class of bug). Only a real
            # non-zero exit should fail the build.
            Write-Host "  gradlew reported: $_" -ForegroundColor Yellow
            if ($LASTEXITCODE -ne 0) { $buildFailed = $true }
        }
        if ($buildFailed) { throw "gradlew assembleRelease failed" }
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

# Clear any stale/offline device registrations left over from a previous
# interrupted run before we start matching against "what's new". Without
# this, a leftover "emulator-5554  offline" entry from a prior crashed run
# gets grabbed instantly by the per-device loop below (it matches
# "^emulator-\d+" regardless of state), and the very first boot-completed
# poll against it throws immediately — a ~7s "boot failure" that was never
# a real boot attempt at all.
Invoke-Quiet -Exe $adb -CmdArgs @("kill-server") | Out-Null
Start-Sleep -Seconds 2
Invoke-Quiet -Exe $adb -CmdArgs @("start-server") | Out-Null

$results = [ordered]@{}
$totalStart = Get-Date

foreach ($row in $matrix) {
    Write-Host ""
    Write-Host "  -- $($row.AvdName) (API $($row.ApiLevel)) --------------------" -ForegroundColor Cyan
    $start = Get-Date
    $testOk = $false
    $serial = $null

    try {
        # Explicit -port per device (see the matrix comment above) means we
        # know the exact serial ahead of time — no need to diff against
        # "what adb already knew about" to guess which one is new.
        $serial = "emulator-$($row.Port)"

        # Cold boot every time (-no-snapshot-load/-save): a stale snapshot
        # made with a different GLES renderer than -gpu below gets discarded
        # anyway and silently falls back to a slow cold boot mid-run — see
        # .detoxrc.js's gpuMode comment for the full story. Booting cold and
        # headless up front makes timing predictable across devices.
        $proc = Start-Process -FilePath $emulator -ArgumentList @(
            "-avd", $row.AvdName,
            "-port", $row.Port,
            "-no-window", "-no-audio", "-no-boot-anim",
            "-gpu", "swiftshader_indirect",
            "-no-snapshot-load", "-no-snapshot-save"
        ) -PassThru -WindowStyle Hidden

        # Give the emulator a moment to register with adb before polling.
        Start-Sleep -Seconds 5
        $deadline = (Get-Date).AddSeconds(60)
        $registered = $false
        while (-not $registered -and (Get-Date) -lt $deadline) {
            $candidates = Invoke-Quiet -Exe $adb -CmdArgs @("devices") | Select-String "^emulator-\d+" | ForEach-Object { ($_.Line -split "\s+")[0] }
            if ($candidates -contains $serial) { $registered = $true } else { Start-Sleep -Seconds 2 }
        }
        if (-not $registered) { throw "Emulator process started but $serial never registered with adb (its fixed port may already be in use - check for a leftover emulator process outside this script)" }

        Wait-EmulatorBoot -Serial $serial -TimeoutSec 240

        # AVDs persist their installed apps across boots. If this AVD was
        # ever used outside this script (e.g. `expo run:android` for manual
        # dev testing, or a previous run with a different keystore), it can
        # already have the app installed under a DIFFERENT signing key than
        # this script's release build. `adb install -r` treats that as an
        # update, not a fresh install, and Android refuses to update across
        # a signature mismatch (INSTALL_FAILED_UPDATE_INCOMPATIBLE) — the
        # only fix is to uninstall first. Ignore any error here: an "already
        # not installed" uninstall attempt is expected and harmless on a
        # freshly-created AVD.
        Invoke-Quiet -Exe $adb -CmdArgs @("-s", $serial, "uninstall", "com.peripateticware.app") | Out-Null

        Write-Host "  Installing APK ..." -ForegroundColor DarkGray
        $installFailed = $false
        try {
            & $adb -s $serial install -r $apkPath
            if ($LASTEXITCODE -ne 0) { $installFailed = $true }
        } catch {
            $installFailed = $true
        }
        if ($installFailed) { throw "adb install failed on $serial" }

        # Pin ANDROID_SERIAL so Maestro (which shells out to adb) targets
        # this device even if another emulator is somehow still running.
        $env:ANDROID_SERIAL = $serial

        $reportDir = Join-Path $reportRoot $row.AvdName
        New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
        $junitPath = Join-Path $reportDir "junit.xml"

        Write-Host "  Running Maestro suite ..." -ForegroundColor DarkGray
        try {
            & maestro test @flowFolders `
                -e STUDENT_EMAIL=$StudentEmail `
                -e STUDENT_PASSWORD=$StudentPassword `
                --format junit --output $junitPath `
                2>&1 | Tee-Object -FilePath (Join-Path $reportDir "console.log")
            if ($LASTEXITCODE -eq 0) { $testOk = $true }
        } catch {
            # A real test failure (non-zero exit) can surface here as an
            # exception on some PowerShell builds instead of just setting
            # $LASTEXITCODE — treat it the same as $testOk staying $false
            # rather than letting it escape as an uncaught error and skip
            # the artifact-archiving step below.
            Write-Host "  Maestro run reported an error: $_" -ForegroundColor Red
        }

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
        Remove-Item Env:\ANDROID_SERIAL -ErrorAction SilentlyContinue
        if ($serial) {
            Invoke-Quiet -Exe $adb -CmdArgs @("-s", $serial, "emu", "kill") | Out-Null
            Start-Sleep -Seconds 2
        }
    }

    $elapsed = [math]::Round(((Get-Date) - $start).TotalSeconds)
    $label   = if ($testOk) { "PASS [OK]" } else { "FAIL [!!]" }
    $color   = if ($testOk) { "Green" } else { "Red" }
    Write-Host "  -> $label  (${elapsed}s)" -ForegroundColor $color

    $results[$row.AvdName] = @{ Pass = $testOk; Seconds = $elapsed; Api = $row.ApiLevel }
}

# ── Summary ───────────────────────────────────────────────────────────────────
$totalSec = [math]::Round(((Get-Date) - $totalStart).TotalSeconds)
Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Results                                         " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

$passed = 0; $failed = 0
foreach ($key in $results.Keys) {
    $r = $results[$key]
    $icon  = if ($r.Pass) { "[OK]" } else { "[!!]" }
    $color = if ($r.Pass) { "Green" } else { "Red" }
    Write-Host ("  {0}  API {1,-3}  {2,-20}  {3}s" -f $icon, $r.Api, $key, $r.Seconds) -ForegroundColor $color
    if ($r.Pass) { $passed++ } else { $failed++ }
}

if ($setupFailed.Count -gt 0) {
    foreach ($key in $setupFailed.Keys) {
        Write-Host ("  [SKIP] {0,-20}  {1}" -f $key, $setupFailed[$key]) -ForegroundColor DarkYellow
    }
}

Write-Host "--------------------------------------------------" -ForegroundColor Cyan
Write-Host ("  {0} passed  {1} failed  {2} skipped  ({3}s total)" -f $passed, $failed, $setupFailed.Count, $totalSec) -ForegroundColor $(if ($failed -eq 0 -and $setupFailed.Count -eq 0) { "Green" } else { "Yellow" })
Write-Host ""
Write-Host "  Reports: mobile\maestro\reports\<AvdName>\ (junit.xml, console.log, artifacts\)" -ForegroundColor DarkGray
Write-Host ""

} finally {
    Invoke-Cleanup
}

if ($failed -gt 0) { exit 1 }
