# ============================================================
# run-wayfinding-offline-test.ps1
#
# End-to-end check that a multi-step scavenger hunt works with NO
# connection: the three offline fixes for GPX wayfinding.
#
#   14.0  warm  (online)   — open the hunt, cache detail + tiles + session
#   -- cut network: svc wifi/data disable + `docker stop` the backend --
#   14.1  walk  (offline)  — Discover from cache, open the hunt, reach all
#                            3 stops with every API call failing   [Fix A/B/C]
#   -- restore network + backend, relaunch so appInit flushes the queue --
#   14.2  sync  (online)   — hunt still complete; arrivals reached the server
#   -- Postgres row count confirms the queued arrivals synced --
#
# Like run-offline-capture-test.ps1 this is deliberately NOT part of
# run-maestro-all-devices.ps1's matrix — it toggles global emulator network
# state and stops a shared container, which would wreck any other flow
# running alongside it.
#
# Prerequisites: one emulator booted, the release APK already installed
# (built with EXPO_PUBLIC_API_URL=http://10.0.2.2:8000), the backend +
# postgres docker containers up, and the seeded "Campus Wayfinding Hunt".
#
# Usage:
#   cd C:\dev\peripateticware\mobile
#   .\scripts\run-wayfinding-offline-test.ps1
#   .\scripts\run-wayfinding-offline-test.ps1 -Serial emulator-5554
# ============================================================

param(
    [string]$Serial = "",
    [string]$StudentEmail = "student@test.local",
    [string]$StudentPassword = "Test1234!"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"

$BackendContainer  = "peripateticware-backend"
$PostgresContainer = "peripateticware-postgres"
$PgUser            = "peripateticware_user"
$PgDb              = "peripateticware"
$ActivityId        = "2f2d01e3-a551-4e73-954e-c328d65e1241"
$AppId             = "com.peripateticware.app"

function Invoke-Quiet {
    param([string]$Exe, [string[]]$CmdArgs = @())
    try { return @(& $Exe @CmdArgs 2>$null) } catch { return @() }
}

function Adb        { param([string[]]$A) Invoke-Quiet -Exe $adb -CmdArgs (@("-s", $Serial) + $A) }
function Net-Off    { Adb @("shell","svc","wifi","disable") | Out-Null; Adb @("shell","svc","data","disable") | Out-Null }
function Net-On     { Adb @("shell","svc","wifi","enable")  | Out-Null; Adb @("shell","svc","data","enable")  | Out-Null }
function Relaunch   { Adb @("shell","am","force-stop",$AppId) | Out-Null; Start-Sleep 1; Adb @("shell","monkey","-p",$AppId,"-c","android.intent.category.LAUNCHER","1") | Out-Null }

function Pg {
    param([string]$Sql)
    (& docker exec $PostgresContainer psql -U $PgUser -d $PgDb -t -A -c $Sql 2>$null | Out-String).Trim()
}

function Run-Flow {
    param([string]$Path, [string]$Label)
    Write-Host ""
    Write-Host "-- $Label ($Path) --" -ForegroundColor Yellow
    $ok = $false
    try {
        & maestro test $Path -e STUDENT_EMAIL=$StudentEmail -e STUDENT_PASSWORD=$StudentPassword
        if ($LASTEXITCODE -eq 0) { $ok = $true }
    } catch {
        Write-Host "  $Label reported an error: $_" -ForegroundColor Red
    }
    return $ok
}

# ── Resolve target emulator ─────────────────────────────────────────────────
if (-not $Serial) {
    $devices = @(Invoke-Quiet -Exe $adb -CmdArgs @("devices") |
        Select-String "^emulator-\d+\s+device$" | ForEach-Object { ($_.Line -split "\s+")[0] })
    if ($devices.Count -eq 0)    { throw "No booted emulator found. Boot one first." }
    if ($devices.Count -gt 1)    { throw "Multiple emulators ($($devices -join ', ')) - pass -Serial." }
    $Serial = $devices[0]
}
$env:ANDROID_SERIAL = $Serial
Write-Host "Target device : $Serial"        -ForegroundColor Cyan
Write-Host "Backend       : $BackendContainer" -ForegroundColor Cyan

$warmOk = $false; $walkOk = $false; $syncOk = $false; $rowsOk = $false

try {
    # ── Clean slate: network on, backend up, no prior session ───────────────
    Write-Host ""
    Write-Host "-- Prep: network on, backend up, DB reset --" -ForegroundColor Yellow
    Net-On
    & docker start $BackendContainer 2>$null | Out-Null
    Start-Sleep 5
    $resetSql = @"
DELETE FROM session_waypoint_progress WHERE session_id IN (
  SELECT ls.id FROM learning_sessions ls JOIN users u ON u.id = ls.user_id
  WHERE u.email = '$StudentEmail' AND ls.activity_id = '$ActivityId');
DELETE FROM session_events WHERE session_id IN (
  SELECT ls.id FROM learning_sessions ls JOIN users u ON u.id = ls.user_id
  WHERE u.email = '$StudentEmail' AND ls.activity_id = '$ActivityId');
DELETE FROM learning_sessions
  WHERE user_id = (SELECT id FROM users WHERE email = '$StudentEmail')
  AND activity_id = '$ActivityId';
"@
    & docker exec $PostgresContainer psql -U $PgUser -d $PgDb -c $resetSql 2>$null | Out-Null

    # ── 14.0 WARM (online) ─────────────────────────────────────────────────
    $warmOk = Run-Flow "maestro\flows\offline\14.0-wayfinding-warm.yaml" "14.0 warm (online)"
    Write-Host "  settling 8s for detail cache + tile downloads..." -ForegroundColor DarkGray
    Start-Sleep 8

    # ── Cut the network HARD ──────────────────────────────────────────────
    Write-Host ""
    Write-Host "-- Cutting network: wifi/data OFF + stopping backend --" -ForegroundColor Yellow
    Net-Off
    & docker stop $BackendContainer 2>$null | Out-Null
    Start-Sleep 3

    # ── 14.1 OFFLINE walk ────────────────────────────────────────────────
    $walkOk = Run-Flow "maestro\flows\offline\14.1-wayfinding-offline-walk.yaml" "14.1 walk (offline)"
    # The offline arrivals live in the device SQLite mirror + queue at this
    # point — the server-side check happens after the flush below.

    # ── Restore network + backend ───────────────────────────────────────
    Write-Host ""
    Write-Host "-- Restoring backend + network --" -ForegroundColor Yellow
    & docker start $BackendContainer 2>$null | Out-Null
    # Wait for the backend healthcheck to pass.
    for ($i = 0; $i -lt 20; $i++) {
        $st = (& docker inspect -f '{{.State.Health.Status}}' $BackendContainer 2>$null | Out-String).Trim()
        if ($st -eq "healthy") { break }
        Start-Sleep 2
    }
    Net-On
    Write-Host "  waiting 20s for the app's connectivity/init to notice..." -ForegroundColor DarkGray
    Start-Sleep 20

    # Relaunch so initOfflineLayer() -> flushQueue() -> flushArrivals() runs.
    Relaunch
    Start-Sleep 20

    # ── 14.2 SYNC verify (online) ───────────────────────────────────────
    $syncOk = Run-Flow "maestro\flows\offline\14.2-wayfinding-offline-sync.yaml" "14.2 sync (online)"

    # ── Hard proof: the offline arrivals reached the server ─────────────
    Start-Sleep 3
    $progressRows = Pg @"
SELECT COUNT(*) FROM session_waypoint_progress swp
WHERE swp.session_id IN (
  SELECT ls.id FROM learning_sessions ls JOIN users u ON u.id = ls.user_id
  WHERE u.email = '$StudentEmail' AND ls.activity_id = '$ActivityId')
AND swp.arrived_at IS NOT NULL;
"@
    $eventRows = Pg @"
SELECT COUNT(*) FROM session_events se
WHERE se.session_id IN (
  SELECT ls.id FROM learning_sessions ls JOIN users u ON u.id = ls.user_id
  WHERE u.email = '$StudentEmail' AND ls.activity_id = '$ActivityId')
AND se.event_type = 'waypoint_arrival';
"@
    Write-Host ""
    Write-Host "  session_waypoint_progress rows (arrived): $progressRows  (expect 3)" -ForegroundColor Cyan
    Write-Host "  session_events 'waypoint_arrival' rows  : $eventRows  (expect 3)" -ForegroundColor Cyan
    if ($progressRows -eq "3") { $rowsOk = $true }

    # ── Summary ────────────────────────────────────────────────────────
    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host ("  14.0 warm (online)          : {0}" -f $(if ($warmOk) {"PASS"} else {"FAIL"})) -ForegroundColor $(if ($warmOk) {"Green"} else {"Red"})
    Write-Host ("  14.1 walk (offline)         : {0}" -f $(if ($walkOk) {"PASS"} else {"FAIL"})) -ForegroundColor $(if ($walkOk) {"Green"} else {"Red"})
    Write-Host ("  14.2 sync (online)          : {0}" -f $(if ($syncOk) {"PASS"} else {"FAIL"})) -ForegroundColor $(if ($syncOk) {"Green"} else {"Red"})
    Write-Host ("  arrivals synced to server   : {0}" -f $(if ($rowsOk) {"PASS"} else {"FAIL"})) -ForegroundColor $(if ($rowsOk) {"Green"} else {"Red"})
    Write-Host "==================================================" -ForegroundColor Cyan

    if (-not ($warmOk -and $walkOk -and $syncOk -and $rowsOk)) { exit 1 }
}
finally {
    Write-Host ""
    Write-Host "-- Cleanup: network on + backend up --" -ForegroundColor DarkGray
    Net-On
    & docker start $BackendContainer 2>$null | Out-Null
    Remove-Item Env:\ANDROID_SERIAL -ErrorAction SilentlyContinue
}
