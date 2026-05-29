# Peripateticware: Socratic → Aristotelian Rename
# This script renames all Socratic method references to Aristotelian query mechanism
# Safe, reversible, with backup and logging

param(
    [string]$ProjectRoot = "C:\Users\pcerd\docker-containers\peripateticware-github-complete\peripateticware-github",
    [switch]$DryRun = $false,
    [switch]$CreateBackup = $true
)

# Color output
function Write-Success { Write-Host $args[0] -ForegroundColor Green }
function Write-Warn { Write-Host $args[0] -ForegroundColor Yellow }
function Write-Info { Write-Host $args[0] -ForegroundColor Cyan }
function Write-Error { Write-Host $args[0] -ForegroundColor Red }

# Verify project root exists
if (-not (Test-Path $ProjectRoot)) {
    Write-Error "Project root not found: $ProjectRoot"
    exit 1
}

Write-Info "=== Peripateticware: Socratic → Aristotelian Rename ==="
Write-Info "Project Root: $ProjectRoot"
Write-Info "Dry Run: $DryRun"
Write-Info ""

# Create backup if requested
if ($CreateBackup -and -not $DryRun) {
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $backupPath = "$ProjectRoot.backup_$timestamp"
    Write-Info "Creating backup: $backupPath"
    Copy-Item -Path $ProjectRoot -Destination $backupPath -Recurse -Force
    Write-Success "Backup created successfully"
    Write-Info ""
}

# Define file patterns to search
$patterns = @("*.tsx", "*.ts", "*.py", "*.json", "*.md", "*.yaml", "*.yml", "*.env*")
$excludeDirs = @("node_modules", ".git", ".venv", "__pycache__", ".next", "dist", "build")

# Replacements: case-sensitive and case-insensitive
$replacements = @(
    @{ Old = "Socratic method"; New = "Aristotelian inquiry mechanism" },
    @{ Old = "socratic method"; New = "aristotelian inquiry mechanism" },
    @{ Old = "Socratic dialogue"; New = "Aristotelian dialogue" },
    @{ Old = "socratic dialogue"; New = "aristotelian dialogue" },
    @{ Old = "Socratic"; New = "Aristotelian" },
    @{ Old = "socratic"; New = "aristotelian" }
)

# Find all files matching patterns
$files = @()
foreach ($pattern in $patterns) {
    $files += Get-ChildItem -Path $ProjectRoot -Recurse -Include $pattern -ErrorAction SilentlyContinue
}

# Filter out excluded directories
$files = $files | Where-Object {
    $filePath = $_.FullName
    $excluded = $false
    foreach ($excludeDir in $excludeDirs) {
        if ($filePath -match "\\$excludeDir\\") {
            $excluded = $true
            break
        }
    }
    -not $excluded
}

Write-Info "Found $($files.Count) files to scan"
Write-Info ""

# Track changes
$changedFiles = @()
$totalReplacements = 0

# Process each file
foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    if ($null -eq $content) { continue }
    
    $originalContent = $content
    $fileChanges = 0
    
    # Apply replacements
    foreach ($replacement in $replacements) {
        # Count occurrences
        $matches = [regex]::Matches($content, [regex]::Escape($replacement.Old))
        if ($matches.Count -gt 0) {
            $content = $content -replace [regex]::Escape($replacement.Old), $replacement.New
            $fileChanges += $matches.Count
        }
    }
    
    # If file changed and not dry run, write back
    if ($content -ne $originalContent) {
        if (-not $DryRun) {
            Set-Content -Path $file.FullName -Value $content -Force
        }
        
        $changedFiles += $file.FullName
        $totalReplacements += $fileChanges
        
        Write-Warn "$(Split-Path $file.FullName -Leaf): $fileChanges replacement(s)"
    }
}

Write-Info ""
Write-Success "=== Summary ==="
Write-Success "Files changed: $($changedFiles.Count)"
Write-Success "Total replacements: $totalReplacements"

if ($DryRun) {
    Write-Warn "DRY RUN MODE - No files were modified. Remove -DryRun to apply changes."
} else {
    Write-Success "Changes applied successfully!"
}

Write-Info ""
Write-Info "Files modified:"
$changedFiles | ForEach-Object { Write-Info "  $_" }

# Create log file
$logPath = "$ProjectRoot/../rename-log_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"
Write-Info ""
Write-Info "Saving log to: $logPath"

@"
Peripateticware: Socratic → Aristotelian Rename Log
Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Project: $ProjectRoot
Dry Run: $DryRun

Files Changed: $($changedFiles.Count)
Total Replacements: $totalReplacements

FILES MODIFIED:
$($changedFiles -join "`n")

REPLACEMENTS APPLIED:
$($replacements | ForEach-Object { "  '$($_.Old)' → '$($_.New)'" } | Out-String)
"@ | Set-Content -Path $logPath

Write-Success "Log saved!"
