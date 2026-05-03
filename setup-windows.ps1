#!/usr/bin/env pwsh
# Peripateticware Development Environment Setup (Windows)
# Supports both WSL2 and native Windows development
# 
# Usage: .\setup.ps1
# or:    .\setup.ps1 -Mode docker
# or:    .\setup.ps1 -Mode local

param(
    [ValidateSet('docker', 'local', 'auto')]
    [string]$Mode = 'auto',
    [switch]$SkipDocker = $false,
    [switch]$SkipOllama = $false,
    [switch]$Force = $false
)

# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

# ============================================================================
# CONFIGURATION
# ============================================================================

$projectRoot = Get-Location
$backendDir = Join-Path $projectRoot "backend"
$frontendDir = Join-Path $projectRoot "frontend"
$pythonVersion = "3.11"
$nodeVersion = "18"

# Colors for output
$colors = @{
    success = "Green"
    warning = "Yellow"
    error = "Red"
    info = "Cyan"
}

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

function Write-Status {
    param([string]$Message, [string]$Type = "info")
    $color = $colors[$Type]
    Write-Host $Message -ForegroundColor $color
}

function Test-Command {
    param([string]$Command)
    try {
        $null = & $Command --version 2>&1
        return $true
    }
    catch {
        return $false
    }
}

function Test-Port {
    param([int]$Port)
    try {
        $socket = New-Object System.Net.Sockets.TcpClient
        $socket.Connect("127.0.0.1", $Port)
        $socket.Close()
        return $true
    }
    catch {
        return $false
    }
}

# ============================================================================
# SYSTEM CHECKS
# ============================================================================

function Check-Prerequisites {
    Write-Host ""
    Write-Status "🔍 Checking prerequisites..." "info"
    Write-Host ""
    
    $issues = @()
    
    # Check OS
    if ($PSVersionTable.OS -notmatch "Windows") {
        $issues += "❌ This script is for Windows. Use ./setup.sh on Linux/Mac"
        Write-Status ($issues[-1]) "error"
    }
    else {
        Write-Status "✅ Windows OS detected" "success"
    }
    
    # Check PowerShell version
    if ($PSVersionTable.PSVersion.Major -lt 5) {
        $issues += "❌ PowerShell 5.0+ required (current: $($PSVersionTable.PSVersion))"
        Write-Status ($issues[-1]) "error"
    }
    else {
        Write-Status "✅ PowerShell version OK: $($PSVersionTable.PSVersion)" "success"
    }
    
    # Check Docker
    if (Test-Command "docker") {
        Write-Status "✅ Docker installed" "success"
    }
    else {
        $issues += "⚠️ Docker not found. Install from: https://www.docker.com/products/docker-desktop"
        Write-Status ($issues[-1]) "warning"
    }
    
    # Check Docker Desktop WSL2
    if (Test-Command "wsl") {
        $wslInfo = wsl --list --verbose 2>$null
        if ($wslInfo -match "Ubuntu") {
            Write-Status "✅ WSL2 with Ubuntu detected" "success"
        }
        else {
            Write-Status "ℹ️ WSL2 installed but no Ubuntu distro found (optional)" "info"
        }
    }
    else {
        Write-Status "ℹ️ WSL2 not installed (optional - use native Docker Desktop)" "info"
    }
    
    # Check Python
    if (Test-Command "python") {
        $pythonVer = python --version 2>&1 | Select-String -Pattern "\d+\.\d+" | ForEach-Object { $_.Matches[0].Value }
        if ([version]$pythonVer -ge [version]"3.11") {
            Write-Status "✅ Python $pythonVer installed" "success"
        }
        else {
            $issues += "❌ Python 3.11+ required (found: $pythonVer)"
            Write-Status ($issues[-1]) "error"
        }
    }
    else {
        $issues += "❌ Python not found. Install from: https://www.python.org/"
        Write-Status ($issues[-1]) "error"
    }
    
    # Check Node
    if (Test-Command "node") {
        $nodeVer = node --version | Select-String -Pattern "v\d+\." | ForEach-Object { $_.Matches[0].Value -replace "v","" }
        Write-Status "✅ Node.js v$nodeVer installed" "success"
    }
    else {
        $issues += "❌ Node.js not found. Install from: https://nodejs.org/"
        Write-Status ($issues[-1]) "error"
    }
    
    # Check Git
    if (Test-Command "git") {
        Write-Status "✅ Git installed" "success"
    }
    else {
        Write-Status "⚠️ Git not found (optional)" "warning"
    }
    
    # Check Disk Space
    $drive = Get-Volume -DriveLetter C
    $freeGB = [math]::Round($drive.SizeRemaining / 1GB, 2)
    if ($freeGB -gt 20) {
        Write-Status "✅ Disk space OK: ${freeGB}GB free" "success"
    }
    else {
        $issues += "⚠️ Low disk space: ${freeGB}GB free (need 20GB+)"
        Write-Status ($issues[-1]) "warning"
    }
    
    Write-Host ""
    
    if ($issues.Count -gt 0 -and -not $Force) {
        Write-Status "❌ Setup cannot continue. Install missing prerequisites and run again." "error"
        return $false
    }
    
    return $true
}

# ============================================================================
# ENVIRONMENT SETUP
# ============================================================================

function Setup-Backend {
    Write-Host ""
    Write-Status "🐍 Setting up backend environment..." "info"
    
    if (-not (Test-Path $backendDir)) {
        Write-Status "❌ Backend directory not found: $backendDir" "error"
        return $false
    }
    
    Push-Location $backendDir
    
    try {
        # Create virtual environment
        Write-Status "  → Creating Python virtual environment..." "info"
        if (-not (Test-Path "venv")) {
            python -m venv venv
            if ($LASTEXITCODE -ne 0) {
                throw "Failed to create virtual environment"
            }
        }
        
        # Activate virtual environment
        Write-Status "  → Activating virtual environment..." "info"
        & ".\venv\Scripts\Activate.ps1"
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to activate virtual environment"
        }
        
        # Upgrade pip
        Write-Status "  → Upgrading pip..." "info"
        python -m pip install --upgrade pip 2>&1 | Select-String "Successfully installed|already satisfied" | ForEach-Object { Write-Status "     $_" "info" }
        
        # Install requirements
        Write-Status "  → Installing Python dependencies..." "info"
        pip install -r requirements.txt --quiet
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to install Python requirements"
        }
        
        Write-Status "✅ Backend environment ready" "success"
        Write-Status "  Virtual environment: $(Get-Location)/venv" "info"
        
        return $true
    }
    catch {
        Write-Status "❌ Backend setup failed: $_" "error"
        return $false
    }
    finally {
        Pop-Location
    }
}

function Setup-Frontend {
    Write-Host ""
    Write-Status "⚛️  Setting up frontend environment..." "info"
    
    if (-not (Test-Path $frontendDir)) {
        Write-Status "❌ Frontend directory not found: $frontendDir" "error"
        return $false
    }
    
    Push-Location $frontendDir
    
    try {
        # Check if node_modules exists and is reasonable size
        if (Test-Path "node_modules") {
            $modulesSize = (Get-ChildItem -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
            if ($modulesSize -gt 100) {
                Write-Status "  → node_modules already installed (${modulesSize}MB)" "info"
            }
            else {
                Write-Status "  → Reinstalling node_modules (current installation incomplete)..." "info"
                Remove-Item -Path "node_modules" -Recurse -Force
                npm install
            }
        }
        else {
            Write-Status "  → Installing npm dependencies..." "info"
            npm install
            if ($LASTEXITCODE -ne 0) {
                throw "Failed to run npm install"
            }
        }
        
        Write-Status "✅ Frontend environment ready" "success"
        Write-Status "  Node modules: $(Get-Location)/node_modules" "info"
        
        return $true
    }
    catch {
        Write-Status "❌ Frontend setup failed: $_" "error"
        return $false
    }
    finally {
        Pop-Location
    }
}

# ============================================================================
# DOCKER SETUP
# ============================================================================

function Setup-Docker {
    if ($SkipDocker) {
        Write-Status "⏭️  Skipping Docker setup (--SkipDocker)" "info"
        return $true
    }
    
    Write-Host ""
    Write-Status "🐳 Setting up Docker environment..." "info"
    
    if (-not (Test-Command "docker")) {
        Write-Status "⚠️  Docker not installed. Skipping Docker setup." "warning"
        return $false
    }
    
    try {
        # Check if Docker is running
        $dockerInfo = docker info 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Status "⚠️  Docker is not running. Please start Docker Desktop." "warning"
            return $false
        }
        
        Write-Status "✅ Docker is running" "success"
        
        # Check docker-compose
        if (Test-Command "docker-compose") {
            Write-Status "✅ docker-compose is available" "success"
        }
        else {
            Write-Status "⚠️  docker-compose not found. Using 'docker compose'." "warning"
        }
        
        return $true
    }
    catch {
        Write-Status "⚠️  Docker setup check failed: $_" "warning"
        return $false
    }
}

# ============================================================================
# OLLAMA SETUP
# ============================================================================

function Setup-Ollama {
    if ($SkipOllama) {
        Write-Status "⏭️  Skipping Ollama setup (--SkipOllama)" "info"
        return $true
    }
    
    Write-Host ""
    Write-Status "🤖 Checking Ollama setup..." "info"
    
    # Check if Ollama is accessible
    $ollamaUrl = "http://localhost:11434"
    
    try {
        $response = Invoke-WebRequest -Uri "$ollamaUrl/api/tags" -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Status "✅ Ollama is running at $ollamaUrl" "success"
            
            # Parse available models
            $models = ($response.Content | ConvertFrom-Json).models
            Write-Status "  Available models:" "info"
            foreach ($model in $models) {
                Write-Status "    - $($model.name)" "info"
            }
            
            return $true
        }
    }
    catch {
        Write-Status "⚠️  Ollama is not running at $ollamaUrl" "warning"
        Write-Status "  To run Ollama locally:" "info"
        Write-Status "    1. Download from: https://ollama.ai" "info"
        Write-Status "    2. Run: ollama serve" "info"
        Write-Status "    3. In another terminal, pull models:" "info"
        Write-Status "       ollama pull llama3" "info"
        Write-Status "       ollama pull llava" "info"
        return $false
    }
}

# ============================================================================
# ENVIRONMENT FILES
# ============================================================================

function Setup-EnvironmentFiles {
    Write-Host ""
    Write-Status "⚙️  Setting up environment files..." "info"
    
    # Backend .env
    $backendEnv = Join-Path $backendDir ".env"
    if (-not (Test-Path $backendEnv)) {
        Write-Status "  → Creating backend/.env..." "info"
        $backendEnvExample = Join-Path $backendDir ".env.example"
        if (Test-Path $backendEnvExample) {
            Copy-Item $backendEnvExample $backendEnv
            Write-Status "✅ backend/.env created from template" "success"
        }
        else {
            Write-Status "⚠️  No .env.example found in backend/" "warning"
        }
    }
    else {
        Write-Status "ℹ️  backend/.env already exists" "info"
    }
    
    # Frontend .env
    $frontendEnv = Join-Path $frontendDir ".env"
    if (-not (Test-Path $frontendEnv)) {
        Write-Status "  → Creating frontend/.env..." "info"
        $frontendEnvExample = Join-Path $frontendDir ".env.example"
        if (Test-Path $frontendEnvExample) {
            Copy-Item $frontendEnvExample $frontendEnv
            Write-Status "✅ frontend/.env created from template" "success"
        }
        else {
            Write-Status "⚠️  No .env.example found in frontend/" "warning"
        }
    }
    else {
        Write-Status "ℹ️  frontend/.env already exists" "info"
    }
}

# ============================================================================
# STARTUP INSTRUCTIONS
# ============================================================================

function Show-StartupInstructions {
    Write-Host ""
    Write-Status "═════════════════════════════════════════════════════════" "info"
    Write-Status "              🚀 SETUP COMPLETE!" "success"
    Write-Status "═════════════════════════════════════════════════════════" "info"
    Write-Host ""
    
    Write-Status "Next Steps:" "info"
    Write-Host ""
    
    Write-Host "1️⃣  Start Ollama (if using local LLM):"
    Write-Status "   ollama serve" "info"
    Write-Host ""
    
    Write-Host "2️⃣  Start Docker services:"
    Write-Status "   docker-compose up -d" "info"
    Write-Host ""
    
    Write-Host "3️⃣  Verify services are healthy:"
    Write-Status "   docker-compose ps" "info"
    Write-Host ""
    
    Write-Host "4️⃣  Test the API:"
    Write-Status "   curl http://localhost:8000/api/health" "info"
    Write-Host ""
    
    Write-Host "5️⃣  Open the frontend:"
    Write-Status "   http://localhost:5173" "info"
    Write-Host ""
    
    Write-Status "Test Login Credentials:" "info"
    Write-Host "  Email: teacher@example.com"
    Write-Host "  Password: (check backend/init_db.py)"
    Write-Host ""
    
    Write-Status "Useful Commands:" "info"
    Write-Host ""
    Write-Status "  View backend logs:" "info"
    Write-Status "    docker-compose logs -f fastapi" "info"
    Write-Host ""
    Write-Status "  View frontend logs:" "info"
    Write-Status "    docker-compose logs -f web" "info"
    Write-Host ""
    Write-Status "  Stop all services:" "info"
    Write-Status "    docker-compose down" "info"
    Write-Host ""
    Write-Status "  Restart a service:" "info"
    Write-Status "    docker-compose restart fastapi" "info"
    Write-Host ""
    
    Write-Status "Environment Variables:" "info"
    Write-Host ""
    Write-Host "  To switch to Claude API:"
    Write-Status "    Edit backend/.env" "info"
    Write-Status "    Set: LLM_PROVIDER=claude" "info"
    Write-Status "    Set: CLAUDE_API_KEY=sk-ant-..." "info"
    Write-Host ""
    
    Write-Status "Documentation:" "info"
    Write-Host "  Architecture:  docs/ARCHITECTURE.md"
    Write-Host "  Development:   docs/DEVELOPMENT.md"
    Write-Host "  Deployment:    docs/DEPLOYMENT_GUIDE.md"
    Write-Host ""
    
    Write-Status "═════════════════════════════════════════════════════════" "info"
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

function Main {
    Write-Host ""
    Write-Status "╔════════════════════════════════════════════════════╗" "info"
    Write-Status "║   Peripateticware Development Environment Setup   ║" "info"
    Write-Status "║              Windows PowerShell Edition            ║" "info"
    Write-Status "╚════════════════════════════════════════════════════╝" "info"
    Write-Host ""
    
    # Check prerequisites
    if (-not (Check-Prerequisites)) {
        if (-not $Force) {
            exit 1
        }
    }
    
    # Auto-detect mode if not specified
    if ($Mode -eq "auto") {
        if (Test-Command "docker") {
            $Mode = "docker"
            Write-Status "Auto-detected mode: docker" "info"
        }
        else {
            $Mode = "local"
            Write-Status "Auto-detected mode: local (Docker not available)" "info"
        }
    }
    
    # Setup based on mode
    if ($Mode -eq "docker") {
        if (-not (Setup-Docker)) {
            Write-Status "Docker setup check failed, but continuing..." "warning"
        }
    }
    
    # Setup backend
    if (-not (Setup-Backend)) {
        Write-Status "Continuing despite backend setup issues..." "warning"
    }
    
    # Setup frontend
    if (-not (Setup-Frontend)) {
        Write-Status "Continuing despite frontend setup issues..." "warning"
    }
    
    # Setup environment files
    Setup-EnvironmentFiles
    
    # Check Ollama
    if (-not (Setup-Ollama)) {
        Write-Status "Ollama check failed, but continuing..." "warning"
    }
    
    # Show startup instructions
    Show-StartupInstructions
}

# Execute main
Main
