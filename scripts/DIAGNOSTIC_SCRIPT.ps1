# ============================================================================
# PERIPATETICWARE: Complete Diagnostic Script
# Finds and reports all issues with login and landing page
# ============================================================================

Write-Host "`n" -ForegroundColor Green
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  PERIPATETICWARE - COMPLETE DIAGNOSTIC                        ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Green

# ============================================================================
# 1. CHECK DOCKER SERVICES
# ============================================================================
Write-Host "`n[1/6] Docker Services Status" -ForegroundColor Yellow

$services = docker-compose ps --format "{{.Service}}: {{.Status}}"
$services | ForEach-Object { 
    if ($_ -match "Up") {
        Write-Host "  ✅ $_" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $_" -ForegroundColor Red
    }
}

# ============================================================================
# 2. CHECK BACKEND LOGS (Last 30 lines)
# ============================================================================
Write-Host "`n[2/6] Backend Logs (Last 30 lines)" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────" -ForegroundColor Gray

docker-compose logs backend | tail -30

# ============================================================================
# 3. CHECK FRONTEND LOGS (Last 30 lines)
# ============================================================================
Write-Host "`n[3/6] Frontend Logs (Last 30 lines)" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────" -ForegroundColor Gray

docker-compose logs frontend | tail -30

# ============================================================================
# 4. CHECK DATABASE USERS
# ============================================================================
Write-Host "`n[4/6] Database Users Check" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────" -ForegroundColor Gray

docker-compose exec -T postgres psql -U peripateticware -d peripateticware -c "SELECT email, role, is_active FROM users WHERE email LIKE '%example.com' ORDER BY email;"

# ============================================================================
# 5. TEST BACKEND ENDPOINTS
# ============================================================================
Write-Host "`n[5/6] Backend Endpoint Tests" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────" -ForegroundColor Gray

Write-Host "Testing: GET http://localhost:8000/docs" -ForegroundColor Cyan
Invoke-WebRequest -Uri "http://localhost:8000/docs" -ErrorAction SilentlyContinue | Select-Object StatusCode

Write-Host "Testing: POST http://localhost:8000/api/v1/auth/login" -ForegroundColor Cyan
$loginBody = @{
    email = "student@example.com"
    password = "SecurePassword123"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:8000/api/v1/auth/login" `
    -Method Post `
    -ContentType "application/json" `
    -Body $loginBody `
    -ErrorAction SilentlyContinue | Select-Object StatusCode, Content

# ============================================================================
# 6. CHECK FRONTEND ASSETS
# ============================================================================
Write-Host "`n[6/6] Frontend Assets Check" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────" -ForegroundColor Gray

Write-Host "Testing: GET http://localhost:3000/" -ForegroundColor Cyan
Invoke-WebRequest -Uri "http://localhost:3000/" -ErrorAction SilentlyContinue | Select-Object StatusCode

Write-Host "Testing: GET http://localhost:3000/locales/en/landing.json" -ForegroundColor Cyan
Invoke-WebRequest -Uri "http://localhost:3000/locales/en/landing.json" -ErrorAction SilentlyContinue | Select-Object StatusCode

Write-Host "`n"