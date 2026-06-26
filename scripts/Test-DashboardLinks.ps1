param(
    [string]$ProjectPath = "C:\Users\pcerd\docker-containers\peripateticware-github-complete\peripateticware-github"
)

$frontendPath = "$ProjectPath\frontend\src"
$dashboardPath = "$frontendPath\pages"
$appRouterPath = "$frontendPath\components\AppRouter.tsx"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Dashboard Navigation Link Tester" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Read AppRouter
$appRouterContent = Get-Content $appRouterPath -Raw

# Extract valid routes manually - look for path="..." patterns
$validRoutes = @()
$lines = Get-Content $appRouterPath
foreach ($line in $lines) {
    if ($line -match 'path="') {
        $route = $line -replace '.*path="', '' -replace '".*', ''
        if ($route) {
            $validRoutes += $route
        }
    }
}

$validRoutes = $validRoutes | Sort-Object -Unique
Write-Host "Found $($validRoutes.Count) valid routes in AppRouter" -ForegroundColor Green
Write-Host ""

# Dashboard files
$dashboards = @("StudentDashboard.tsx", "TeacherDashboard.tsx", "ParentDashboard.tsx", "AdminDashboard.tsx")

$results = @()
$totalLinks = 0
$brokenCount = 0

Write-Host "Checking dashboards..." -ForegroundColor Cyan
Write-Host ""

foreach ($dashboard in $dashboards) {
    $filePath = "$dashboardPath\$dashboard"
    
    if (!(Test-Path $filePath)) {
        Write-Host "⚠️  $dashboard - FILE NOT FOUND" -ForegroundColor Yellow
        continue
    }
    
    Write-Host "📄 $dashboard" -ForegroundColor Cyan
    
    $content = Get-Content $filePath
    $lineNum = 0
    
    foreach ($line in $content) {
        $lineNum++
        
        # Look for navigate( in the line
        if ($line -contains "navigate(" -or $line -match "navigate\(") {
            # Extract URL between quotes
            if ($line -match "navigate\('([^']+)'\)") {
                $link = $Matches[1]
            }
            elseif ($line -match 'navigate\("([^"]+)"\)') {
                $link = $Matches[1]
            }
            else {
                continue
            }
            
            $totalLinks++
            
            # Check if valid
            $isValid = $false
            
            # Exact match
            if ($validRoutes -contains $link) {
                $isValid = $true
            }
            
            # Pattern match for dynamic routes
            if (!$isValid) {
                foreach ($route in $validRoutes) {
                    # Simple pattern: replace :id with *
                    $pattern = $route -replace ':[^/]+', '*'
                    $linkPattern = $link -replace '[0-9a-f-]+', '*'
                    
                    if ($linkPattern -like $pattern) {
                        $isValid = $true
                        break
                    }
                }
            }
            
            if ($isValid) {
                Write-Host "   ✅ Line $lineNum : $link" -ForegroundColor Green
            }
            else {
                Write-Host "   ❌ Line $lineNum : $link" -ForegroundColor Red
                $brokenCount++
                $results += "$dashboard|Line $lineNum|$link"
            }
        }
    }
    
    Write-Host ""
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "SUMMARY" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Total links: $totalLinks" -ForegroundColor White
Write-Host "Valid: $($totalLinks - $brokenCount)" -ForegroundColor Green
Write-Host "Broken: $brokenCount" -ForegroundColor Red
Write-Host ""

if ($brokenCount -gt 0) {
    Write-Host "BROKEN LINKS TO FIX:" -ForegroundColor Red
    Write-Host ""
    foreach ($result in $results) {
        $parts = $result -split '\|'
        Write-Host "FILE: $($parts[0])" -ForegroundColor Red
        Write-Host "  $($parts[1]) - $($parts[2])" -ForegroundColor Yellow
    }
    Write-Host ""
}
else {
    Write-Host "✅ ALL LINKS ARE VALID!" -ForegroundColor Green
    Write-Host ""
}

Write-Host "Valid routes in AppRouter:" -ForegroundColor Cyan
Write-Host ""
$validRoutes | Sort-Object | ForEach-Object {
    Write-Host "  $_" -ForegroundColor Gray
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan