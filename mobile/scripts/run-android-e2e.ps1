# ============================================================
# run-android-e2e.ps1
# Full Android E2E automation: SDK images → AVDs → build → test
#
# Usage:
#   cd C:\dev\peripateticware\mobile
#   .\scripts\run-android-e2e.ps1
#
# Optional flags:
#   -SkipBuild      Skip gradle build (use existing APK)
#   -SkipSetup      Skip SDK/AVD setup (assumes AVDs already exist)
#   -Config         Run only one config, e.g. -Config android.api35.debug
# ============================================================

param(
    [switch]$SkipBuild,
    [switch]$SkipSetup,
    [string]$Config = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Environment ───────────────────────────────────────────────────────────────
$env:JAVA_HOME  = "C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"

# Locate sdkmanager / avdmanager (Android Studio ships cmdline-tools under a version folder)
$cmdlineRoots = @(
    "$env:ANDROID_HOME\cmdline-tools\latest\bin",
    "$env:ANDROID_HOME\cmdline-tools\bin"
) + (Get-ChildItem "$env:ANDROID_HOME\cmdline-tools" -ErrorAction SilentlyContinue |
     Where-Object { $_.PSIsContainer } |
     ForEach-Object { "$($_.FullName)\bin" })

$sdkManagerBin  = $cmdlineRoots | Where-Object { Test-Path "$_\sdkmanager.bat" }  | Select-Object -First 1
$avdManagerBin  = $cmdlineRoots | Where-Object { Test-Path "$_\avdmanager.bat" }  | Select-Object -First 1

if (-not $sdkManagerBin) { throw "sdkmanager not found. Install Android command-line tools from Android Studio → SDK Manager → SDK Tools." }
if (-not $avdManagerBin) { throw "avdmanager not found. Same fix as above." }

$sdkManager = "$sdkManagerBin\sdkmanager.bat"
$avdManager = "$avdManagerBin\avdmanager.bat"
$emulator   = "$env:ANDROID_HOME\emulator\emulator.exe"
$adb        = "$env:ANDROID_HOME\platform-tools\adb.exe"

# Capture node path BEFORE modifying PATH so we always have it
$nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) { throw "node.exe not found. Ensure Node.js is installed and in PATH." }

$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\emulator;$env:ANDROID_HOME\platform-tools;$sdkManagerBin;$avdManagerBin;$env:PATH"

# ── Device matrix ─────────────────────────────────────────────────────────────
$matrix = @(
    [pscustomobject]@{
        Config     = "android.api35.debug"
        AvdName    = "Pixel_6_API_35"
        SysImage   = "system-images;android-35;google_apis;x86_64"
        Device     = "pixel_6"
        ApiLevel   = 35
    },
    [pscustomobject]@{
        Config     = "android.api33.debug"
        AvdName    = "Pixel_6_API_33"
        SysImage   = "system-images;android-33;google_apis;x86_64"
        Device     = "pixel_6"
        ApiLevel   = 33
    },
    [pscustomobject]@{
        Config     = "android.api30.debug"
        AvdName    = "Pixel_6_API_30"
        SysImage   = "system-images;android-30;google_apis;x86_64"
        Device     = "pixel_4"
        ApiLevel   = 30
    },
    [pscustomobject]@{
        Config     = "android.api24.debug"
        AvdName    = "Nexus_5X_API_24"
        SysImage   = "system-images;android-24;default;x86"
        Device     = "Nexus 5X"
        ApiLevel   = 24
    }
)

# Filter to a single config if requested
if ($Config) {
    $matrix = $matrix | Where-Object { $_.Config -eq $Config }
    if (-not $matrix) { throw "Unknown config '$Config'. Valid: $($matrix.Config -join ', ')" }
}

# ── Helper: run a command and throw on failure ────────────────────────────────
function Invoke-Cmd {
    param([string]$Exe, [string[]]$Args, [string]$WorkDir = (Get-Location))
    Write-Host "  > $Exe $Args" -ForegroundColor DarkGray
    & $Exe @Args
    if ($LASTEXITCODE -ne 0) { throw "'$Exe $Args' exited $LASTEXITCODE" }
}

# ── Helper: wait for emulator to be fully booted ──────────────────────────────
function Wait-EmulatorBoot {
    param([string]$Serial, [int]$TimeoutSec = 180)
    Write-Host "  Waiting for $Serial to boot..." -ForegroundColor DarkGray
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $val = & $adb -s $Serial shell getprop sys.boot_completed 2>$null
        if ($val -match "1") { Write-Host "  $Serial booted." -ForegroundColor Green; return }
        Start-Sleep 5
    }
    throw "Emulator $Serial did not boot within ${TimeoutSec}s"
}

# ── Helper: kill all running emulators and stop the Gradle daemon ─────────────
function Invoke-Cleanup {
    Write-Host ""
    Write-Host "-- Cleanup: stopping emulators and Gradle daemon ------------" -ForegroundColor DarkGray

    # Kill every connected emulator via 'adb emu kill'
    $devices = & $adb devices 2>$null | Select-String "^emulator-\d+" | ForEach-Object {
        ($_.Line -split "\s+")[0]
    }
    if ($devices) {
        foreach ($serial in $devices) {
            Write-Host "  Killing $serial ..." -ForegroundColor DarkGray
            & $adb -s $serial emu kill 2>$null | Out-Null
        }
    } else {
        Write-Host "  No running emulators found." -ForegroundColor DarkGray
    }

    # Stop Gradle daemon so it doesn't sit in memory between runs
    $gradlew = if (Test-Path ".\android\gradlew.bat") { ".\android\gradlew.bat" } else { $null }
    if ($gradlew) {
        Write-Host "  Stopping Gradle daemon ..." -ForegroundColor DarkGray
        & $gradlew --stop 2>$null | Out-Null
    }

    Write-Host "  Cleanup complete." -ForegroundColor DarkGray
}

# ══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   Peripateticware - Android E2E Suite    " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# sdkmanager/avdmanager always write version warnings to stderr.
# Suppress at the PS level for the entire setup section.
$prev = $ErrorActionPreference

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
            echo "y" | & $sdkManager $row.SysImage 2>&1 | Where-Object { $_ -notmatch "^Warning:" } | Write-Host
            if ($LASTEXITCODE -ne 0) { $ErrorActionPreference = $prev; throw "Failed to install $($row.SysImage)" }
        }
    }
}

# ── Step 2: AVDs ──────────────────────────────────────────────────────────────
if (-not $SkipSetup) {
    $ErrorActionPreference = "Continue"
    Write-Host ""
    Write-Host "-- Step 2/4: Ensuring AVDs ----------------------------------" -ForegroundColor Yellow
    $existingAvds = (& $avdManager list avd -c 2>&1 | Where-Object { $_ -notmatch "^Warning:" })

    foreach ($row in $matrix) {
        if ($existingAvds -contains $row.AvdName) {
            Write-Host "  [OK] AVD $($row.AvdName)" -ForegroundColor Green
        } else {
            Write-Host "  [CREATING] $($row.AvdName) ..." -ForegroundColor Yellow
            echo "no" | & $avdManager create avd `
                --name $row.AvdName `
                --package $row.SysImage `
                --device $row.Device `
                --force 2>&1 | Where-Object { $_ -notmatch "^Warning:" } | Write-Host
            if ($LASTEXITCODE -ne 0) { $ErrorActionPreference = $prev; throw "Failed to create AVD $($row.AvdName)" }
        }
    }

    $ErrorActionPreference = $prev
}

# ── Step 3: Build APK (once for all configs) ──────────────────────────────────
# Wrap everything from here in try/finally so cleanup always runs.
try {

if (-not $SkipBuild) {
    Write-Host ""
    Write-Host "-- Step 3/4: Building APK -----------------------------------" -ForegroundColor Yellow
    $detoxCli = (Resolve-Path ".\node_modules\detox\local-cli\cli.js").Path
    Write-Host "  node    : $nodeExe" -ForegroundColor DarkGray
    Write-Host "  detox   : $detoxCli" -ForegroundColor DarkGray
    & $nodeExe $detoxCli build -c $matrix[0].Config
    if ($LASTEXITCODE -ne 0) { throw "detox build failed" }
    Write-Host "  Build complete." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "-- Step 3/4: Build skipped (-SkipBuild) ---------------------" -ForegroundColor DarkGray
}

# ── Step 4: Run tests on each device ──────────────────────────────────────────
Write-Host ""
Write-Host "-- Step 4/4: Running tests ----------------------------------" -ForegroundColor Yellow

$results = [ordered]@{}
$totalStart = Get-Date

foreach ($row in $matrix) {
    Write-Host ""
    Write-Host "  -- $($row.Config) (API $($row.ApiLevel)) -----------------" -ForegroundColor Cyan

    $start = Get-Date
    $testOk = $false

    try {
        # Kill any leftover emulator on this port
        & $adb devices | Out-Null

        # Run Detox (it boots the emulator automatically using the AVD name in .detoxrc.js)
        & $nodeExe ".\node_modules\detox\local-cli\cli.js" test -c $row.Config --headless --record-videos failing --take-screenshots failing
        if ($LASTEXITCODE -eq 0) { $testOk = $true }
    } catch {
        Write-Host "  Exception: $_" -ForegroundColor Red
    }

    $elapsed = [math]::Round(((Get-Date) - $start).TotalSeconds)
    $label   = if ($testOk) { "PASS [OK]" } else { "FAIL [!!]" }
    $color   = if ($testOk) { "Green" } else { "Red" }
    Write-Host "  -> $label  ($elapsed s)" -ForegroundColor $color

    $results[$row.Config] = @{ Pass = $testOk; Seconds = $elapsed; Api = $row.ApiLevel }
}

# ── Summary ───────────────────────────────────────────────────────────────────
$totalSec = [math]::Round(((Get-Date) - $totalStart).TotalSeconds)
Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  Results                                     " -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

$passed = 0; $failed = 0
foreach ($key in $results.Keys) {
    $r = $results[$key]
    $icon  = if ($r.Pass) { "[OK]" } else { "[!!]" }
    $color = if ($r.Pass) { "Green" } else { "Red" }
    $api   = $r.Api
    Write-Host ("  {0}  API {1,-3}  {2,-30}  {3}s" -f $icon, $api, $key, $r.Seconds) -ForegroundColor $color
    if ($r.Pass) { $passed++ } else { $failed++ }
}

Write-Host "----------------------------------------------" -ForegroundColor Cyan
Write-Host ("  {0} passed  {1} failed  ({2}s total)" -f $passed, $failed, $totalSec) -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })
Write-Host ""

if ($failed -gt 0) {
    Write-Host "  Artifacts saved to: mobile\artifacts\" -ForegroundColor DarkGray
    Write-Host "  Videos and screenshots are in subdirectories per config." -ForegroundColor DarkGray
}

} finally {
    # Always kill emulators and the Gradle daemon, whether tests passed,
    # failed, or the script was interrupted (Ctrl-C).
    Invoke-Cleanup
}

if ($failed -gt 0) { exit 1 }
