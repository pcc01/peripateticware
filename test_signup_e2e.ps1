# Signup end-to-end test
# Usage: .\test_signup_e2e.ps1

$ErrorActionPreference = "Continue"
Set-Location "C:\dev\peripateticware"

function Invoke-Signup {
    param(
        [string]$Email,
        [string]$Role,
        [string]$SchoolName,
        [string]$Label
    )
    Write-Host "--- $Label ---" -ForegroundColor Yellow
    $body = @{
        email            = $Email
        password         = "TestPass123!"
        password_confirm = "TestPass123!"
        first_name       = "Test"
        last_name        = "User"
        role             = $Role
    }
    if ($SchoolName) { $body.school_name = $SchoolName }

    $json = $body | ConvertTo-Json -Compress
    Write-Host "Payload: $json"

    try {
        $r = Invoke-RestMethod -Method POST `
            -Uri "http://localhost:8000/api/v1/auth/signup" `
            -ContentType "application/json" `
            -Body $json
        Write-Host "PASS - user_id: $($r.user_id)  email: $($r.email)  role: $($r.role)" -ForegroundColor Green
        return $true
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        $detail = $_.ErrorDetails.Message
        Write-Host "FAIL ($code): $detail" -ForegroundColor Red
        return $false
    }
}

Write-Host "=== STEP 1: Docker status ===" -ForegroundColor Cyan
docker compose ps

Write-Host ""
Write-Host "=== STEP 2: Health check ===" -ForegroundColor Cyan
try {
    $h = Invoke-RestMethod -Uri "http://localhost:8000/health/"
    Write-Host "Health: $($h.status)" -ForegroundColor Green
} catch {
    Write-Host "Health check failed: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== STEP 3: Signup tests ===" -ForegroundColor Cyan

$r1 = Invoke-Signup -Email "testsignup_001@example.com" -Role "TEACHER" -SchoolName "Test School" -Label "Teacher signup"
Write-Host ""
$r2 = Invoke-Signup -Email "testsignup_001@otherdomain.com" -Role "TEACHER" -SchoolName "Test School 2" -Label "Username collision test (same prefix)"
Write-Host ""
$r3 = Invoke-Signup -Email "testsignup_003@example.com" -Role "STUDENT" -Label "Student signup (should fail with 403)"

Write-Host ""
Write-Host "=== STEP 4: Results ===" -ForegroundColor Cyan
if ($r1) { Write-Host "Teacher signup:    PASS" -ForegroundColor Green } else { Write-Host "Teacher signup:    FAIL" -ForegroundColor Red }
if ($r2) { Write-Host "Collision test:    PASS" -ForegroundColor Green } else { Write-Host "Collision test:    FAIL" -ForegroundColor Red }
if (-not $r3) { Write-Host "Student guard:     PASS (correctly blocked)" -ForegroundColor Green } else { Write-Host "Student guard:     FAIL (should have been blocked)" -ForegroundColor Red }

Write-Host ""
Write-Host "=== STEP 5: Backend logs (last 20 lines) ===" -ForegroundColor Cyan
docker compose logs --tail=20 backend

Write-Host ""
Write-Host "=== STEP 6: Cleanup test users ===" -ForegroundColor Cyan
$sql = "DELETE FROM users WHERE email LIKE 'testsignup_%'; SELECT COUNT(*) AS deleted FROM users WHERE email LIKE 'testsignup_%';"
$result = docker compose exec postgres psql -U postgres -d peripateticware -c $sql 2>&1
if ($LASTEXITCODE -ne 0) {
    $result = docker compose exec db psql -U postgres -d peripateticware -c $sql 2>&1
}
Write-Host $result

Write-Host ""
Write-Host "=== DONE ===" -ForegroundColor Green
