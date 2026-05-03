# ============================================================================
# COMPLETE BACKEND RESET
# ============================================================================

Write-Host "Step 1: Checking if auth.py is correct..." -ForegroundColor Cyan

# Verify auth.py first line
$firstLine = (Get-Content backend\routes\auth.py -TotalCount 1)
Write-Host "First line of auth.py: $firstLine" -ForegroundColor Yellow

if ($firstLine -like "*Copyright*") {
    Write-Host "✅ auth.py is correct (Python file)" -ForegroundColor Green
} else {
    Write-Host "❌ auth.py is WRONG! Replacing it now..." -ForegroundColor Red
    Copy-Item auth_backend_CORRECT.py backend\routes\auth.py -Force
    Write-Host "✅ Replaced auth.py" -ForegroundColor Green
}

Write-Host ""
Write-Host "Step 2: Stopping Docker completely..." -ForegroundColor Cyan
docker-compose down -v
Write-Host "✅ Docker stopped" -ForegroundColor Green

Write-Host ""
Write-Host "Step 3: Starting Docker..." -ForegroundColor Cyan
docker-compose up -d
Write-Host "✅ Docker started, waiting 20 seconds..." -ForegroundColor Green

Start-Sleep -Seconds 20

Write-Host ""
Write-Host "Step 4: Checking backend health..." -ForegroundColor Cyan
$health = docker-compose exec -T peripateticware-fastapi curl -s http://localhost:8000/health 2>&1

Write-Host "Health check response: $health" -ForegroundColor Yellow

Write-Host ""
Write-Host "Step 5: Checking for errors in logs..." -ForegroundColor Cyan
$logs = docker-compose logs peripateticware-fastapi | Select-Object -Last 50
Write-Host $logs

Write-Host ""
Write-Host "✅ Reset complete! Try login now." -ForegroundColor Green