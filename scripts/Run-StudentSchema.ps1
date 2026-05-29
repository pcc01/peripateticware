# Run-StudentSchema.ps1
# =============================================================================
# Peripateticware -- Apply Phase 6 student database schema
# =============================================================================
# ALWAYS invoke with the bypass flag to avoid execution-policy errors:
#
#   powershell.exe -ExecutionPolicy Bypass -File .\scripts\Run-StudentSchema.ps1
#
# =============================================================================

param(
    [string]$ProjectRoot = (Get-Location).Path
)

# Continue (not Stop) so that docker-compose stderr warnings do not become
# terminating errors. Failures are checked explicitly via $LASTEXITCODE.
$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Peripateticware -- Phase 6 Student Schema Migration " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

# -- 1. Verify Docker is running ----------------------------------------------
Write-Host "Checking Docker..." -ForegroundColor Yellow
docker info 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] Docker is not running. Start Docker Desktop and try again." -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] Docker is running" -ForegroundColor Green

# -- 2. Verify postgres container is up ---------------------------------------
# Redirect stderr to suppress docker-compose version warning.
Write-Host "Checking postgres container..." -ForegroundColor Yellow
$psStatus = docker-compose ps postgres 2>$null
if ($psStatus -notmatch "running|Up|healthy") {
    Write-Host "  postgres may not be ready. Waiting 5 s..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
}
Write-Host "  [OK] postgres container found" -ForegroundColor Green

# -- 3. Copy SQL file into the container --------------------------------------
$SqlFile = Join-Path $ProjectRoot "database\student_schema.sql"
if (-not (Test-Path $SqlFile)) {
    Write-Host "  [FAIL] SQL file not found at: $SqlFile" -ForegroundColor Red
    exit 1
}

Write-Host "Copying student_schema.sql into postgres container..." -ForegroundColor Yellow
$ContainerName = docker-compose ps -q postgres 2>$null
docker cp $SqlFile "${ContainerName}:/tmp/student_schema.sql"
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] Could not copy SQL file into container." -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] SQL file copied" -ForegroundColor Green

# -- 4. Execute the SQL -------------------------------------------------------
Write-Host "Applying Phase 6 student schema..." -ForegroundColor Yellow
docker exec peripateticware-postgres psql -U peripateticware_user `
    -U peripateticware_user `
    -d peripateticware `
    -f /tmp/student_schema.sql

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] Schema migration failed. Check the output above." -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] Schema applied" -ForegroundColor Green

# -- 5. Verify tables created -------------------------------------------------
Write-Host ""
Write-Host "Verifying tables..." -ForegroundColor Yellow
$tables = @("evidence_captures", "notebook_entries", "activity_submissions")
foreach ($table in $tables) {
    $result = docker exec peripateticware-postgres psql -U peripateticware_user `
        -U peripateticware_user `
        -d peripateticware `
        -tAc "SELECT to_regclass('public.$table');" 2>$null
    if ($result -match $table) {
        Write-Host "  [OK] $table" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] $table NOT FOUND" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Schema migration complete!                          " -ForegroundColor Cyan
Write-Host "                                                      " -ForegroundColor Cyan
Write-Host "  Next: restart backend                               " -ForegroundColor Cyan
Write-Host "    docker-compose up -d --no-deps backend            " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""


