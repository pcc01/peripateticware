# Rebuild-Backend.ps1
# =============================================================================
# Peripateticware -- Rebuild backend container and verify student endpoints
# =============================================================================
# ALWAYS invoke with the bypass flag to avoid execution-policy errors:
#
#   powershell.exe -ExecutionPolicy Bypass -File .\scripts\Rebuild-Backend.ps1
#
# =============================================================================

param(
    [string]$ProjectRoot = (Get-Location).Path,
    [string]$BackendPort  = "8000",
    [switch]$SkipSchema
)

# Continue (not Stop) so that docker-compose stderr warnings do not become
# terminating errors. Failures are checked explicitly via $LASTEXITCODE.
$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  Peripateticware -- Backend Rebuild (Phase 6)       " -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""

# -- 1. Hard prune Docker cache -----------------------------------------------
Write-Host "Pruning Docker build cache..." -ForegroundColor Yellow
docker system prune -f 2>$null | Out-Null
Write-Host "  [OK] Cache cleared" -ForegroundColor Green

# -- 2. Rebuild backend (no cache) --------------------------------------------
Write-Host "Rebuilding backend image (no-cache)..." -ForegroundColor Yellow
docker-compose build --no-cache --pull backend
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] Backend build failed. Run: docker-compose logs backend" -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] Backend image built" -ForegroundColor Green

# -- 3. Restart backend container ---------------------------------------------
Write-Host "Starting backend container..." -ForegroundColor Yellow
docker-compose up -d --no-deps backend
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] Failed to start backend container." -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] Backend container started" -ForegroundColor Green

# -- 4. Wait for health check -------------------------------------------------
Write-Host "Waiting for backend health check on port $BackendPort..." -ForegroundColor Yellow
$healthUrl = "http://localhost:$BackendPort/health"
$maxWait   = 60
$waited    = 0
$healthy   = $false

while ($waited -lt $maxWait) {
    Start-Sleep -Seconds 2
    $waited += 2
    try {
        $r = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($r.status -eq "ok") {
            $healthy = $true
            break
        }
    } catch {
        # Not ready yet -- keep waiting
    }
    Write-Host "  ... waiting ($waited / $maxWait s)" -ForegroundColor Gray
}

if (-not $healthy) {
    Write-Host ""
    Write-Host "  [WARN] Health check timed out. Last 40 lines of backend logs:" -ForegroundColor Yellow
    docker-compose logs backend --tail 40 2>$null
    Write-Host ""
    Write-Host "  [FAIL] Backend did not become healthy within $maxWait s." -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] Backend healthy at $healthUrl" -ForegroundColor Green

# -- 5. Apply student schema --------------------------------------------------
if (-not $SkipSchema) {
    Write-Host ""
    Write-Host "Applying Phase 6 student schema..." -ForegroundColor Yellow
    powershell.exe -ExecutionPolicy Bypass -File "$ProjectRoot\scripts\Run-StudentSchema.ps1" `
        -ProjectRoot $ProjectRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [WARN] Schema script returned exit code $LASTEXITCODE -- check output above." -ForegroundColor Yellow
    }
}

# -- 6. Smoke test -- student router ------------------------------------------
Write-Host ""
Write-Host "Smoke-testing student endpoints..." -ForegroundColor Yellow
$smokeUrl = "http://localhost:$BackendPort/api/v1/student/activities"

try {
    $r = Invoke-WebRequest -Uri $smokeUrl -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
    Write-Host "  [OK] $smokeUrl responded HTTP $($r.StatusCode)" -ForegroundColor Green
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 401 -or $code -eq 403) {
        Write-Host "  [OK] $smokeUrl -> HTTP $code (auth guard working)" -ForegroundColor Green
    } elseif ($code -eq 404) {
        Write-Host "  [FAIL] 404 - student router NOT registered. Check backend/main.py." -ForegroundColor Red
    } else {
        Write-Host "  [WARN] Unexpected HTTP $code from $smokeUrl" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  Rebuild complete!                                   " -ForegroundColor Cyan
Write-Host "                                                      " -ForegroundColor Cyan
Write-Host "  API docs: http://localhost:$BackendPort/docs        " -ForegroundColor Cyan
Write-Host "  Student:  /api/v1/student/*                         " -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""
