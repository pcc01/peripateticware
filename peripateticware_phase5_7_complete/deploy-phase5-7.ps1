# ============================================================================
# PERIPATETICWARE PHASE 5-7 DEPLOYMENT SCRIPT (WINDOWS)
# ============================================================================
# This script deploys all merged Phase 5-7 files to your local Peripateticware backend
# 
# Usage: .\deploy-phase5-7.ps1 -BackendPath "C:\path\to\peripateticware\backend"
# ============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$BackendPath,
    
    [switch]$SkipBackup = $false,
    [switch]$SkipMigration = $false
)

# Color output functions
function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Error { Write-Host $args -ForegroundColor Red }
function Write-Info { Write-Host $args -ForegroundColor Cyan }
function Write-Warning { Write-Host $args -ForegroundColor Yellow }

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Info "╔════════════════════════════════════════════════════════════════╗"
Write-Info "║         PERIPATETICWARE PHASE 5-7 DEPLOYMENT SCRIPT           ║"
Write-Info "║                     Windows PowerShell                         ║"
Write-Info "╚════════════════════════════════════════════════════════════════╝"
Write-Info ""

# Validate backend path
if (-not (Test-Path $BackendPath)) {
    Write-Error "❌ Backend path not found: $BackendPath"
    exit 1
}

Write-Info "Backend path: $BackendPath"
Write-Info ""

# ============================================================================
# STEP 1: BACKUP
# ============================================================================
Write-Info "Step 1: Backing up existing files..."

if (-not $SkipBackup) {
    $BackupDir = "$BackendPath\..\backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
    
    if (Test-Path "$BackendPath\models\database.py") {
        Copy-Item "$BackendPath\models\database.py" "$BackupDir\database.py.backup" -Force
        Write-Success "  ✅ Backed up: database.py"
    }
    
    if (Test-Path "$BackendPath\core\config.py") {
        Copy-Item "$BackendPath\core\config.py" "$BackupDir\config.py.backup" -Force
        Write-Success "  ✅ Backed up: config.py"
    }
    
    if (Test-Path "$BackendPath\services\multi_backend_location_service.py") {
        Copy-Item "$BackendPath\services\multi_backend_location_service.py" "$BackupDir\multi_backend_location_service.py.backup" -Force
        Write-Success "  ✅ Backed up: multi_backend_location_service.py"
    }
    
    Write-Success "Backups saved to: $BackupDir"
} else {
    Write-Warning "Backup skipped (--SkipBackup flag used)"
}

Write-Info ""

# ============================================================================
# STEP 2: COPY PYTHON FILES
# ============================================================================
Write-Info "Step 2: Copying Python files..."

$Files = @(
    @{ Source = "database_MERGED_COMPLETE.py"; Dest = "models\database.py"; Desc = "Database Models" },
    @{ Source = "config_UPDATED_COMPLETE.py"; Dest = "core\config.py"; Desc = "Configuration" },
    @{ Source = "privacy_locations_FIXED_COMPLETE.py"; Dest = "routes\privacy_locations.py"; Desc = "Privacy/Location Routes" },
    @{ Source = "multi_backend_location_service_COMPLETE.py"; Dest = "services\multi_backend_location_service.py"; Desc = "Location Service" }
)

foreach ($File in $Files) {
    $SourcePath = "$ScriptDir\$($File.Source)"
    $DestPath = "$BackendPath\$($File.Dest)"
    
    if (-not (Test-Path $SourcePath)) {
        Write-Error "  ❌ Source file not found: $($File.Source)"
        continue
    }
    
    # Create destination directory if needed
    $DestDir = Split-Path -Parent $DestPath
    if (-not (Test-Path $DestDir)) {
        New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
    }
    
    Copy-Item $SourcePath $DestPath -Force
    Write-Success "  ✅ Copied: $($File.Desc)"
}

Write-Info ""

# ============================================================================
# STEP 3: CREATE JURISDICTION DIRECTORY & COPY CONFIGS
# ============================================================================
Write-Info "Step 3: Setting up jurisdiction configurations..."

$JurisdictionsDir = "$BackendPath\config\jurisdictions"
$PendingDir = "$JurisdictionsDir\pending"

# Create directories
New-Item -ItemType Directory -Path $JurisdictionsDir -Force | Out-Null
New-Item -ItemType Directory -Path $PendingDir -Force | Out-Null

Write-Success "  ✅ Created: $JurisdictionsDir"
Write-Success "  ✅ Created: $PendingDir"

# Copy jurisdiction files
$Jurisdictions = @(
    "gdpr_eu.json",
    "coppa_us.json",
    "ccpa_california.json",
    "pipeda_canada.json",
    "lgpd_brazil.json",
    "pdpa_singapore.json"
)

foreach ($JurisdictionFile in $Jurisdictions) {
    $SourcePath = "$ScriptDir\$JurisdictionFile"
    $DestPath = "$JurisdictionsDir\$JurisdictionFile"
    
    if (-not (Test-Path $SourcePath)) {
        Write-Error "  ❌ Source file not found: $JurisdictionFile"
        continue
    }
    
    Copy-Item $SourcePath $DestPath -Force
    Write-Success "  ✅ Copied: $JurisdictionFile"
}

Write-Info ""

# ============================================================================
# STEP 4: INSTRUCTIONS FOR MANUAL UPDATES
# ============================================================================
Write-Info "Step 4: Manual updates required..."

Write-Warning ""
Write-Warning "⚠️  Please manually complete these steps:"
Write-Warning ""
Write-Warning "1. Update backend/main.py:"
Write-Warning "   Add these imports at the top:"
Write-Warning "   from routes.privacy_locations import router as privacy_locations_router"
Write-Warning ""
Write-Warning "   Add this route registration (after other routers):"
Write-Warning "   app.include_router(privacy_locations_router, prefix=""/api/v1"", tags=[""privacy"", ""locations""])"
Write-Warning ""
Write-Warning "2. Update your .env file with:"
Write-Warning "   PRIVACY_CONFIG_DIR=./backend/config/jurisdictions"
Write-Warning "   ACTIVE_JURISDICTION=gdpr_eu"
Write-Warning "   LOCATION_BACKEND=openstreetmap,nominatim,wikidata,wikipedia"
Write-Warning "   ENABLE_LOCATION_CACHE=true"
Write-Warning "   LOCATION_CACHE_TTL_HOURS=168"
Write-Warning "   IAPP_CRAWLER_ENABLED=true"
Write-Warning "   IAPP_CRAWLER_SCHEDULE=0 2 * * 0"
Write-Warning ""

Write-Info ""

# ============================================================================
# STEP 5: DATABASE MIGRATION (OPTIONAL)
# ============================================================================
if (-not $SkipMigration) {
    Write-Info "Step 5: Running database migration..."
    Write-Warning ""
    Write-Warning "⚠️  Database migration requires manual execution:"
    Write-Warning ""
    Write-Warning "Run from your project root:"
    Write-Warning "python -m alembic upgrade head"
    Write-Warning ""
} else {
    Write-Warning "Database migration skipped (--SkipMigration flag used)"
    Write-Warning "Remember to run: python -m alembic upgrade head"
}

Write-Info ""

# ============================================================================
# DEPLOYMENT COMPLETE
# ============================================================================
Write-Success "╔════════════════════════════════════════════════════════════════╗"
Write-Success "║               ✅ DEPLOYMENT COMPLETE!                          ║"
Write-Success "╚════════════════════════════════════════════════════════════════╝"
Write-Success ""
Write-Success "Files copied to: $BackendPath"
Write-Success ""
Write-Info "Next steps:"
Write-Info "1. ✏️  Edit backend/main.py (add privacy_locations router)"
Write-Info "2. ✏️  Edit .env file (add new settings above)"
Write-Info "3. 🗄️  Run database migration (python -m alembic upgrade head)"
Write-Info "4. 🔄 Restart FastAPI server"
Write-Info "5. 🧪 Test endpoints"
Write-Info ""
Write-Success "Ready to test? Run:"
Write-Success "  curl -X GET http://localhost:8010/api/v1/privacy/jurisdictions"
Write-Success ""
Write-Info "Questions? See: 00_START_HERE_PHASE5_7_COMPLETE.md"
Write-Info ""
